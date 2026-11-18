// 家人身份管理（新版）：创建生成分享链接 / 作废软删除 / 家人上下文
// sharePath 与现有前端路由 /f/:token 保持一致
import * as crypto from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, count, eq } from 'drizzle-orm';
import { familyIdentity } from '@server/database/schema';
import { IdentityService } from '@server/modules/identity/identity.service';
import { MeService } from '@server/modules/me/me.service';
import type {
  FamilyContextView,
  FamilyManageRequest,
  FamilyManageResult,
  FamilyOrdersView,
  MyOrderDetail,
} from '@shared/api.interface';

type FamilyRow = typeof familyIdentity.$inferSelect;

@Injectable()
export class FamilyManageService {
  private readonly logger = new Logger(FamilyManageService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly identity: IdentityService,
    private readonly me: MeService,
  ) {}

  async manage(userId: string, req: FamilyManageRequest): Promise<FamilyManageResult> {
    if (req.action === 'disable') return this.disable(userId, req);
    return this.create(userId, req);
  }

  async context(shareToken: string): Promise<FamilyContextView> {
    const family = await this.identity.resolveFamilyPayer(shareToken);
    let balanceFen: number | null = null;
    try {
      const { custId, fresh } = await this.identity.resolveCustId(family.employee);
      if (fresh) {
        this.identity.schedulePersistCustId(family.employee.miaodaUserId, custId);
      }
      const snapshot = await this.identity.queryBalance(custId);
      balanceFen = snapshot.balanceFen;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`家人上下文余额获取失败 user=${family.employee.miaodaUserId}: ${message}`);
    }
    return {
      familyName: family.familyName,
      payFor: family.employee.employeeName,
      balanceFen,
      note: null,
    };
  }

  /** 家人视角全家账单（匿名，凭 share token） */
  async orders(shareToken: string): Promise<FamilyOrdersView> {
    const family = await this.identity.resolveFamilyPayer(shareToken);
    const view = await this.me.ordersForEmployee(family.employee);
    return { balanceFen: view.balanceFen, items: view.items };
  }

  /** 家人视角账单详情（匿名，凭 share token） */
  async orderDetail(shareToken: string, key: string): Promise<MyOrderDetail> {
    const family = await this.identity.resolveFamilyPayer(shareToken);
    return this.me.orderDetailFor(family.employee.miaodaUserId, key);
  }

  private async create(userId: string, req: FamilyManageRequest): Promise<FamilyManageResult> {
    const employee = await this.identity.resolveEmployee(userId);
    const familyName = (req.familyName ?? '').trim();
    if (!familyName) throw new BadRequestException('请填写家人称呼');
    if (familyName.length > 20) throw new BadRequestException('家人称呼最多 20 字');
    const shareToken = crypto.randomBytes(16).toString('hex');
    const inserted: FamilyRow[] = await this.db
      .insert(familyIdentity)
      .values({
        employeeUserId: employee.miaodaUserId,
        familyName,
        relation: req.relation ?? null,
        shareToken,
        status: 'active',
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new BadRequestException('家人身份创建失败，请重试');
    }
    return {
      familyId: row.id,
      shareToken,
      sharePath: `/f/${shareToken}`,
      status: row.status,
      familyCount: await this.activeCount(userId),
    };
  }

  private async disable(userId: string, req: FamilyManageRequest): Promise<FamilyManageResult> {
    if (!req.familyId) throw new BadRequestException('缺少 familyId');
    const updated: Array<{ id: number }> = await this.db
      .update(familyIdentity)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(
        and(
          eq(familyIdentity.id, req.familyId),
          eq(familyIdentity.employeeUserId, userId),
          eq(familyIdentity.status, 'active'),
          eq(familyIdentity.isSelf, false),
        ),
      )
      .returning({ id: familyIdentity.id });
    if (updated.length === 0) {
      throw new NotFoundException('家人身份不存在、已作废或不可作废');
    }
    return {
      familyId: req.familyId,
      status: 'deleted',
      familyCount: await this.activeCount(userId),
    };
  }

  private async activeCount(userId: string): Promise<number> {
    const rows: Array<{ value: number }> = await this.db
      .select({ value: count() })
      .from(familyIdentity)
      .where(and(eq(familyIdentity.employeeUserId, userId), eq(familyIdentity.status, 'active')));
    return rows[0]?.value ?? 0;
  }
}
