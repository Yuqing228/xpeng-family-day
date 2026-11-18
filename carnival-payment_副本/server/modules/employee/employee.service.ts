// 员工端：飞书一键登录关联工卡 → 身份列表（登录落点）→ 创建家人（上限 6）→ 分享
// specs/identity-management
import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import {
  AuthNPaasService,
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { employeeCardMap, employeePaySecret, familyIdentity } from '@server/database/schema';
import { AppConfigService } from '@server/modules/config/config.service';
import { IdentityService } from '@server/modules/identity/identity.service';
import { FamilyPayPasswordService } from '@server/modules/family-pay-password/pay-password.service';
import { newLinkToken } from '@server/modules/payment/payment.service';
import { RELATION_LABELS } from '@server/common/utils/mask';
import { extractPostgresErrorCode } from '@server/common/utils/pg-error';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import { HttpStatus } from '@nestjs/common';
import type {
  AutoBindResponse,
  BindCardRequest,
  BindCardResponse,
  CardRef,
  CreateFamilyRequest,
  EmployeeSession,
  FamilyIdentityDTO,
  FamilyPayPasswordState,
  IdentityListResponse,
  BillResponse,
  BillDetailDTO,
  FamilyPayPasswordSetRequest,
} from '@shared/api.interface';

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly config: AppConfigService,
    private readonly identity: IdentityService,
    private readonly payPassword: FamilyPayPasswordService,
    private readonly authnService: AuthNPaasService,
  ) {}

  /** 登录态 + 工卡映射 + 余额（specs「员工飞书一键登录」场景：映射缺失给明确提示） */
  async session(userId: string | undefined, userName: string | undefined): Promise<EmployeeSession> {
    const inEventWindow = await this.config.isInEventWindow();
    if (!userId) {
      return { loggedIn: false, card: null, balance: null, inEventWindow };
    }
    const card = await this.cardRefByUser(userId);
    if (!card) {
      return { loggedIn: true, userId, userName, card: null, balance: null, inEventWindow };
    }
    return { loggedIn: true, userId, userName, card, balance: null, inEventWindow };
  }

  /** 用工号绑定当前登录账号：工号唯一来源为多维表格同步行，绑定后自动反查 open_id */
  async bindCard(
    userId: string,
    userName: string | undefined,
    req: BindCardRequest,
  ): Promise<BindCardResponse> {
    const custNum: string = (req.custNum || '').trim();
    if (!/^[A-Za-z0-9]{3,16}$/.test(custNum)) {
      throw new BusinessException(
        ResponseCode.BAD_REQUEST,
        '工号格式不正确，请输入 3-16 位字母或数字',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows: Array<typeof employeeCardMap.$inferSelect> = await this.db
      .select()
      .from(employeeCardMap)
      .where(eq(employeeCardMap.custNum, custNum))
      .limit(1);
    if (rows.length === 0) {
      throw new BusinessException(
        ResponseCode.NOT_FOUND,
        '工号不在本期员工名单中，请核对后重试，或联系现场项目组',
        HttpStatus.NOT_FOUND,
      );
    }
    const row: typeof employeeCardMap.$inferSelect = rows[0];
    const alreadyBound: boolean = row.miaodaUserId === userId;
    if (row.miaodaUserId && !alreadyBound) {
      throw new BusinessException(
        ResponseCode.CONFLICT,
        '该工号已被其他账号绑定，请联系现场项目组处理',
        HttpStatus.CONFLICT,
      );
    }
    if (!alreadyBound && !this.isSamePerson(row.employeeName, userName)) {
      throw new BusinessException(
        ResponseCode.FORBIDDEN,
        '工号与当前登录账号姓名不一致，请核对自己的工号',
        HttpStatus.FORBIDDEN,
      );
    }
    const openId: string | null = await this.resolveOpenId(userId);
    if (!alreadyBound) {
      const occupied: Array<{ custNum: string }> = await this.db
        .select({ custNum: employeeCardMap.custNum })
        .from(employeeCardMap)
        .where(eq(employeeCardMap.miaodaUserId, userId))
        .limit(1);
      if (occupied.length > 0) {
        throw new BusinessException(
          ResponseCode.CONFLICT,
          `当前账号已绑定工号 ${occupied[0].custNum}，一个账号只能绑定一个工号，请联系现场项目组处理`,
          HttpStatus.CONFLICT,
        );
      }
    }
    const patch: Partial<typeof employeeCardMap.$inferInsert> = alreadyBound
      ? {}
      : { miaodaUserId: userId };
    if (openId) patch.openId = openId;
    if (Object.keys(patch).length > 0) {
      const updated: Array<{ custNum: string }> = await this.db
        .update(employeeCardMap)
        .set(patch)
        .where(
          alreadyBound
            ? eq(employeeCardMap.custNum, custNum)
            : and(
                eq(employeeCardMap.custNum, custNum),
                isNull(employeeCardMap.miaodaUserId),
              ),
        )
        .returning({ custNum: employeeCardMap.custNum });
      if (updated.length === 0) {
        throw new BusinessException(
          ResponseCode.CONFLICT,
          '该工号刚被其他账号绑定，请刷新后重试',
          HttpStatus.CONFLICT,
        );
      }
    }
    this.logger.log(
      `工号绑定成功：工号 ${custNum}，open_id ${openId ? '已补全' : '未取到'}`,
    );
    return {
      card: {
        cardUid: row.custNum,
        employeeMaskedName: row.employeeName,
        cardLast4: row.custNum,
      },
      openIdBound: Boolean(openId),
    };
  }

  /** 首次进入自动认领：名单中存在唯一同名未绑定行时直接绑定，免去输入工号 */
  async autoBindByUserName(
    userId: string,
    userName: string | undefined,
  ): Promise<AutoBindResponse> {
    const bound: Array<{ custNum: string }> = await this.db
      .select({ custNum: employeeCardMap.custNum })
      .from(employeeCardMap)
      .where(eq(employeeCardMap.miaodaUserId, userId))
      .limit(1);
    if (bound.length > 0) {
      return { bound: true, custNum: bound[0].custNum, reason: null };
    }

    const nameKey: string = this.normalizeName(userName ?? '');
    if (nameKey.length === 0) {
      return { bound: false, custNum: null, reason: 'NO_MATCH' };
    }

    const pending: Array<{ custNum: string; employeeName: string }> = await this.db
      .select({ custNum: employeeCardMap.custNum, employeeName: employeeCardMap.employeeName })
      .from(employeeCardMap)
      .where(isNull(employeeCardMap.miaodaUserId));
    const matched: Array<{ custNum: string; employeeName: string }> = pending.filter(
      (row: { custNum: string; employeeName: string }) =>
        this.normalizeName(row.employeeName) === nameKey,
    );

    if (matched.length === 0) {
      return { bound: false, custNum: null, reason: 'NO_MATCH' };
    }
    if (matched.length > 1) {
      this.logger.warn(`自动认领命中 ${matched.length} 个同名未绑定行，转手工绑定：${userName}`);
      return { bound: false, custNum: null, reason: 'AMBIGUOUS' };
    }

    const target: { custNum: string; employeeName: string } = matched[0];
    const openId: string | null = await this.resolveOpenId(userId);
    const patch: Partial<typeof employeeCardMap.$inferInsert> = { miaodaUserId: userId };
    if (openId) {
      patch.openId = openId;
    }

    try {
      const updated: Array<{ custNum: string }> = await this.db
        .update(employeeCardMap)
        .set(patch)
        .where(
          and(eq(employeeCardMap.custNum, target.custNum), isNull(employeeCardMap.miaodaUserId)),
        )
        .returning({ custNum: employeeCardMap.custNum });
      if (updated.length === 0) {
        this.logger.warn(`自动认领写入未生效（可能刚被绑定）：${userName}`);
        return { bound: false, custNum: null, reason: 'NO_MATCH' };
      }
    } catch (error) {
      if (extractPostgresErrorCode(error) === '23505') {
        this.logger.warn(`自动认领撞账号唯一约束：${userName}`);
        return { bound: false, custNum: null, reason: 'AMBIGUOUS' };
      }
      throw error;
    }

    this.logger.log(`自动认领成功：${userName} → 工号 ${target.custNum}`);
    return { bound: true, custNum: target.custNum, reason: null };
  }

  /** 姓名归一化：去空白 + 转小写，用于严格相等比对 */
  private normalizeName(value: string): string {
    return value.replace(/\s+/gu, '').toLowerCase();
  }

  /** 身份列表（登录落点）：我自己 + 家人（余额取乐牛实时值，查询失败为 null） */
  async identities(userId: string): Promise<IdentityListResponse> {
    const card = await this.cardRefByUser(userId);
    if (!card) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '未找到工卡映射', HttpStatus.FORBIDDEN);
    }
    const rows: Array<typeof familyIdentity.$inferSelect> = await this.db
      .select()
      .from(familyIdentity)
      .where(and(eq(familyIdentity.employeeUserId, userId), eq(familyIdentity.status, 'active')))
      .orderBy(asc(familyIdentity.createdAt));
    const families = rows.filter((r: typeof familyIdentity.$inferSelect) => !r.isSelf).map((r: typeof familyIdentity.$inferSelect) => this.toDTO(r));
    const secretRows: Array<{
      payPasswordHash: string | null;
      payPasswordLockedAt: Date | null;
    }> = await this.db
      .select({
        payPasswordHash: employeePaySecret.payPasswordHash,
        payPasswordLockedAt: employeePaySecret.payPasswordLockedAt,
      })
      .from(employeePaySecret)
      .where(eq(employeePaySecret.employeeUserId, userId))
      .limit(1);
    const secret = secretRows[0];
    const familyPayPassword: FamilyPayPasswordState = {
      payPasswordSet: Boolean(secret?.payPasswordHash),
      payLocked: secret ? secret.payPasswordLockedAt !== null : false,
    };
    return {
      self: { displayName: '我自己' },
      families,
      familyPayPassword,
      card,
      balance: await this.queryRealBalance(userId),
      familyLimit: await this.config.familyLimit(),
    };
  }

  /** 创建家人身份并生成专属链接（上限校验 + 删除重建换新 token） */
  async createFamily(userId: string, req: CreateFamilyRequest): Promise<FamilyIdentityDTO> {
    const displayName = (req.displayName || '').trim();
    if (displayName.length < 1 || displayName.length > 16) {
      throw new BusinessException(ResponseCode.VALIDATION_ERROR, '称呼须为 1–16 个字符（将显示在付款码与账单上）');
    }
    if (!RELATION_LABELS[req.relation]) {
      throw new BusinessException(ResponseCode.VALIDATION_ERROR, '关系取值无效（配偶 / 子女 / 长辈 / 其他）');
    }
    const card = await this.cardRefByUser(userId);
    if (!card) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '未找到您的工卡映射，无法创建家人身份', HttpStatus.FORBIDDEN);
    }
    const active = await this.db
      .select({ c: count() })
      .from(familyIdentity)
      .where(and(
        eq(familyIdentity.employeeUserId, userId),
        eq(familyIdentity.status, 'active'),
        eq(familyIdentity.isSelf, false),
      ));
    const limit = await this.config.familyLimit();
    if (Number(active[0]?.c ?? 0) >= limit) {
      throw new BusinessException(ResponseCode.FORBIDDEN, `家人身份已达上限（${limit} 位），可删除后重建`, HttpStatus.FORBIDDEN);
    }
    const inserted = await this.db
      .insert(familyIdentity)
      .values({
        employeeUserId: userId,
        familyName: displayName,
        relation: req.relation,
        shareToken: newLinkToken(),
        status: 'active',
      })
      .returning();
    return this.toDTO(inserted[0]);
  }

  /** 员工端设置 / 重置家庭支付密码（全家共用，无需原密码） */
  async setFamilyPayPassword(
    userId: string,
    req: FamilyPayPasswordSetRequest,
  ): Promise<void> {
    await this.payPassword.setPassword(userId, req.payPassword);
  }

  /** 解除家庭支付密码冻结（清零错误次数） */
  async unlockFamilyPayPassword(userId: string): Promise<void> {
    await this.payPassword.unlock(userId);
  }

  /** 删除家人身份：软删除，旧链接立即失效；重建生成新 token（specs「删除重建」场景） */
  async deleteFamily(userId: string, identityId: string): Promise<void> {
    const card = await this.cardRefByUser(userId);
    if (!card) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '未找到您的工卡映射', HttpStatus.FORBIDDEN);
    }
    const rows = await this.db
      .select()
      .from(familyIdentity)
      .where(and(eq(familyIdentity.id, Number(identityId)), eq(familyIdentity.employeeUserId, userId)));
    if (rows.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '家人身份不存在', HttpStatus.NOT_FOUND);
    }
    if (rows[0].isSelf) {
      throw new BusinessException(ResponseCode.BAD_REQUEST, '「我自己」身份不可删除');
    }
    const updated = await this.db
      .update(familyIdentity)
      .set({ status: 'deleted' })
      .where(eq(familyIdentity.id, Number(identityId)))
      .returning({ id: familyIdentity.id });
    if (updated.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '家人身份不存在', HttpStatus.NOT_FOUND);
    }
  }

  /** 标记已分享（身份列表「已分享 / 未分享」状态） */
  async markShared(userId: string, identityId: string): Promise<void> {
    const updated = await this.db
      .update(familyIdentity)
      .set({ shared: true })
      .where(and(eq(familyIdentity.id, Number(identityId)), eq(familyIdentity.employeeUserId, userId)))
      .returning({ id: familyIdentity.id });
    if (updated.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '家人身份不存在', HttpStatus.NOT_FOUND);
    }
  }

  /** 员工本人账单：旧 employee_card_map 已废弃，新版链路后续步骤接入 */
  async myBill(userId: string): Promise<BillResponse> {
    void userId;
    throw new BusinessException(ResponseCode.SERVICE_UNAVAILABLE, '系统升级中，请稍后再试', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /** 员工本人账单详情：旧 employee_card_map 已废弃，新版链路后续步骤接入 */
  async myDetail(userId: string, txnNo: string): Promise<BillDetailDTO> {
    void userId;
    void txnNo;
    throw new BusinessException(ResponseCode.SERVICE_UNAVAILABLE, '系统升级中，请稍后再试', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /** 「我自己」付款码 token（流程②：从身份列表点查看进入） */
  async selfToken(userId: string): Promise<{ linkToken: string }> {
    const card = await this.cardRefByUser(userId);
    if (!card) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '未找到您的工卡映射', HttpStatus.FORBIDDEN);
    }
    const row = await this.ensureSelfRow(userId, card.employeeMaskedName);
    return { linkToken: row.shareToken };
  }

  /* ---------- internal ---------- */

  /**
   * 乐牛实时余额（元）：employee_card_map.leniu_cust_id 有值直接查账户余额；
   * 为空则按工号查客户信息换 custId，查完异步回写该列。失败返回 null，不阻断身份列表。
   */
  private async queryRealBalance(userId: string): Promise<number | null> {
    try {
      const employee = await this.identity.resolveEmployee(userId);
      const { custId, fresh } = await this.identity.resolveCustId(employee);
      if (fresh) this.identity.schedulePersistCustId(employee.miaodaUserId, custId);
      const snapshot = await this.identity.queryBalance(custId);
      return Math.round(snapshot.balanceFen) / 100;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`员工端余额获取失败 user=${userId}: ${message}`);
      return null;
    }
  }

  /** 惰性创建「我自己」身份行（付款码 token 与家人同构，QR 不携带 UID 明文） */
  private async ensureSelfRow(userId: string, displayName: string): Promise<typeof familyIdentity.$inferSelect> {
    const rows = await this.db
      .select()
      .from(familyIdentity)
      .where(and(eq(familyIdentity.employeeUserId, userId), eq(familyIdentity.isSelf, true)));
    if (rows.length > 0) return rows[0];
    const inserted = await this.db
      .insert(familyIdentity)
      .values({
        employeeUserId: userId,
        familyName: displayName,
        relation: 'other',
        shareToken: newLinkToken(),
        status: 'active',
        isSelf: true,
      })
      .returning();
    return inserted[0];
  }

  private toDTO(r: typeof familyIdentity.$inferSelect): FamilyIdentityDTO {
    return {
      id: String(r.id),
      displayName: r.familyName,
      relation: r.relation as FamilyIdentityDTO['relation'],
      relationLabel: RELATION_LABELS[r.relation ?? ''] || '其他',
      shared: r.shared,
      linkToken: r.shareToken,
      status: r.status as 'active' | 'deleted',
    };
  }

  /** 姓名比对：忽略空白与大小写，双方互相包含即视为同一人 */
  private isSamePerson(employeeName: string, loginName: string | undefined): boolean {
    const normalize = (value: string): string =>
      (value || '').replace(/\s+/gu, '').toLowerCase();
    const left: string = normalize(employeeName);
    const right: string = normalize(loginName || '');
    if (!left || !right) return false;
    return left.includes(right) || right.includes(left);
  }

  /** 反查 open_id；失败不阻塞绑定主流程 */
  private async resolveOpenId(userId: string): Promise<string | null> {
    try {
      const [openId] = await this.authnService.getBatchOpenIds([userId]);
      return openId ?? null;
    } catch (error) {
      this.logger.warn(`open_id 反查失败（绑定继续）：${String(error)}`);
      return null;
    }
  }

  /** 按当前登录用户的妙搭 user_id 匹配 employee_card_map（识别判定 = miaoda_user_id 非空） */
  private async cardRefByUser(userId: string): Promise<CardRef | null> {
    const rows = await this.db
      .select({ employeeName: employeeCardMap.employeeName, custNum: employeeCardMap.custNum })
      .from(employeeCardMap)
      .where(eq(employeeCardMap.miaodaUserId, userId))
      .limit(1);
    if (rows.length === 0) return null;
    const { employeeName, custNum } = rows[0];
    return { cardUid: custNum, employeeMaskedName: employeeName, cardLast4: custNum };
  }
}
