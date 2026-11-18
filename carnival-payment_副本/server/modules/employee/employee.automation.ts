// 员工身份自动转换：监听 employee_card_map 工号写入事件，工号 → open_id → 妙搭用户ID
import { Inject, Logger } from '@nestjs/common';
import {
  AuthNPaasService,
  Automation,
  BindTrigger,
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, isNull } from 'drizzle-orm';
import { employeeCardMap } from '@server/database/schema';
import { extractPostgresErrorCode } from '@server/common/utils/pg-error';
import {
  EmployeeDirectoryService,
  type DirectoryResolution,
} from '@server/modules/employee/employee-directory.service';

interface TaskHandlerArgs {
  attributes: {
    trigger: string;
    triggerID?: string;
    triggerType: 'record_change' | 'cron' | 'webhook';
    instanceID: string;
    startAt?: number;
  };
  content: {
    input: string;
  };
}

interface DataChangeEventInput {
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  msg_id: string;
}

type SyncOutcome = 'filled' | 'skipped' | 'unresolved' | 'not_found' | 'conflict';

@Automation()
export class EmployeeAutomationService {
  private readonly logger = new Logger(EmployeeAutomationService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authnService: AuthNPaasService,
    private readonly directory: EmployeeDirectoryService,
  ) {}

  @BindTrigger('employee_card_map_row_inserted')
  async onRowInserted(event: TaskHandlerArgs): Promise<void> {
    await this.handleChangeEvent(event);
  }

  @BindTrigger('employee_card_map_cust_num_updated')
  async onCustNumUpdated(event: TaskHandlerArgs): Promise<void> {
    await this.handleChangeEvent(event);
  }

  /** 全量补扫：cron 已停用，保留为手动触发的兜底入口 */
  @BindTrigger('employee_card_map_backfill')
  async backfillMiaodaUserId(): Promise<void> {
    const pending: Array<{ custNum: string }> = await this.db
      .select({ custNum: employeeCardMap.custNum })
      .from(employeeCardMap)
      .where(isNull(employeeCardMap.miaodaUserId));

    if (pending.length === 0) {
      this.logger.log('补扫：无待补齐行');
      return;
    }

    let filled = 0;
    for (const row of pending) {
      const outcome: SyncOutcome = await this.syncIdentity(row.custNum);
      if (outcome === 'filled') {
        filled += 1;
      }
    }
    this.logger.log(`补扫完成：扫描 ${pending.length} / 补齐 ${filled}`);
  }

  private async handleChangeEvent(event: TaskHandlerArgs): Promise<void> {
    const input: string | undefined = event?.content?.input;
    if (typeof input !== 'string') {
      this.logger.error('记录变更事件缺少 content.input');
      return;
    }

    let eventData: DataChangeEventInput;
    try {
      eventData = JSON.parse(input) as DataChangeEventInput;
    } catch (error) {
      this.logger.error('记录变更事件解析失败', error);
      return;
    }

    const record: Record<string, unknown> | undefined =
      eventData.type === 'DELETE' ? eventData.before : eventData.after;
    if (!record) {
      this.logger.warn(`记录变更事件缺少记录内容：type=${eventData.type}`);
      return;
    }

    const rawCustNum: unknown = record.cust_num;
    if (typeof rawCustNum !== 'string' || rawCustNum.trim().length === 0) {
      return;
    }

    this.logger.log(`收到 ${eventData.type} 事件，工号 ${rawCustNum}`);
    await this.syncIdentity(rawCustNum);
  }

  /** 单工号身份补齐：行内 open_id 优先，其次按工号搜平台通讯录 */
  async syncIdentity(custNum: string): Promise<SyncOutcome> {
    const trimmed: string = custNum.trim();
    if (trimmed.length === 0) {
      return 'not_found';
    }

    const rows = await this.db
      .select({
        custNum: employeeCardMap.custNum,
        employeeName: employeeCardMap.employeeName,
        openId: employeeCardMap.openId,
        miaodaUserId: employeeCardMap.miaodaUserId,
      })
      .from(employeeCardMap)
      .where(eq(employeeCardMap.custNum, trimmed))
      .limit(1);

    const row = rows[0];
    if (!row) {
      this.logger.warn(`工号 ${trimmed} 不在员工映射表中，跳过`);
      return 'not_found';
    }
    if (row.miaodaUserId) {
      return 'skipped';
    }

    let openId: string | null = row.openId;
    let miaodaUserId: string | null = null;

    if (openId) {
      miaodaUserId = await this.convertByOpenId(trimmed, row.employeeName, openId);
    }

    if (!miaodaUserId) {
      const resolution: DirectoryResolution = await this.directory.resolveByCustNum(
        trimmed,
        row.employeeName,
      );
      if (!resolution.userId) {
        this.logger.warn(
          `通讯录未解析到唯一账号：工号 ${trimmed}（${row.employeeName}），${resolution.outcome}，候选 ${resolution.candidateCount}`,
        );
        return resolution.outcome === 'unresolved' ? 'unresolved' : 'not_found';
      }
      miaodaUserId = resolution.userId;
      if (!openId) {
        openId = await this.resolveOpenId(miaodaUserId);
      }
    }

    const occupied = await this.db
      .select({ custNum: employeeCardMap.custNum })
      .from(employeeCardMap)
      .where(eq(employeeCardMap.miaodaUserId, miaodaUserId))
      .limit(1);
    if (occupied.length > 0 && occupied[0].custNum !== trimmed) {
      this.logger.warn(`该账号已绑定工号 ${occupied[0].custNum}，跳过工号 ${trimmed}`);
      return 'conflict';
    }

    const patch: Partial<typeof employeeCardMap.$inferInsert> = { miaodaUserId };
    if (openId) {
      patch.openId = openId;
    }

    try {
      const updated = await this.db
        .update(employeeCardMap)
        .set(patch)
        .where(and(eq(employeeCardMap.custNum, trimmed), isNull(employeeCardMap.miaodaUserId)))
        .returning({ custNum: employeeCardMap.custNum });
      if (updated.length === 0) {
        this.logger.warn(`写入未生效（可能已被并发处理）：工号 ${trimmed}`);
        return 'skipped';
      }
    } catch (error) {
      if (extractPostgresErrorCode(error) === '23505') {
        this.logger.warn(`账号已被其他工号占用，跳过工号 ${trimmed}`);
        return 'conflict';
      }
      throw error;
    }

    this.logger.log(`已补齐身份：工号 ${trimmed}（${row.employeeName}）`);
    return 'filled';
  }

  /** open_id 转妙搭用户 ID；失败不阻塞，转由通讯录解析接管 */
  private async convertByOpenId(
    custNum: string,
    employeeName: string,
    openId: string,
  ): Promise<string | null> {
    try {
      const converted: Array<string | null> = await this.authnService.getBatchMiaodaUserIdsByOpenIds([
        openId,
      ]);
      const userId: string | null = converted[0] ?? null;
      if (!userId) {
        this.logger.warn(`open_id 转换未命中：工号 ${custNum}（${employeeName}）`);
      }
      return userId;
    } catch (error) {
      this.logger.warn(`open_id 转换异常，转通讯录解析：工号 ${custNum}，${String(error)}`);
      return null;
    }
  }

  /** 反查 open_id；失败不阻塞补齐主流程 */
  private async resolveOpenId(userId: string): Promise<string | null> {
    try {
      const [openId] = await this.authnService.getBatchOpenIds([userId]);
      return openId ?? null;
    } catch (error) {
      this.logger.warn(`open_id 反查失败（补齐继续）：${String(error)}`);
      return null;
    }
  }
}
