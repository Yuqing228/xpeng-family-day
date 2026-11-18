// 识人服务：员工登录态 / 家人分享 token → 工卡映射 → 乐牛 custId（懒解析 + 异步回写）→ 实时余额
// custId 回写不阻塞响应：先用解析结果查余额并返回，回写在后台执行（失败仅告警，下次请求重新解析）
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { employeeCardMap, employeePaySecret, familyIdentity } from '@server/database/schema';
import {
  LeniuClient,
  LeniuClientError,
  isLeniuSuccess,
  toNumberOrNull,
} from '@server/modules/leniu/leniu.client';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';

export interface ResolvedEmployee {
  miaodaUserId: string;
  employeeName: string;
  custNum: string;
  leniuCustId: string | null;
}

export interface CustIdResolution {
  custId: string;
  /** true = 本次由 customer/query 新解析（需要异步回写） */
  fresh: boolean;
}

export interface BalanceSnapshot {
  /** accBal = walletBal + subsidyBal（乐牛口径，单位分） */
  balanceFen: number;
  walletBal: number;
  subsidyBal: number;
  accStatus: string | null;
  accName: string | null;
}

export interface FamilyPayerIdentity {
  employee: ResolvedEmployee;
  familyIdentityId: number;
  familyName: string;
  relation: string | null;
  /** 是否为员工本人的付款码（本人付款不需要支付密码） */
  isSelf: boolean;
  hasPayPassword: boolean;
  payLocked: boolean;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly leniu: LeniuClient,
  ) {}

  /** 登录态 → 工卡映射（识别判定 = miaoda_user_id 非空） */
  async resolveEmployee(userId: string): Promise<ResolvedEmployee> {
    if (!userId) {
      throw payflowError(
        PAYFLOW_CODE.IDENTITY_UNAVAILABLE,
        '未获取到登录身份，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const rows: Array<{
      miaodaUserId: string | null;
      employeeName: string;
      custNum: string;
      leniuCustId: string | null;
    }> = await this.db
      .select({
        miaodaUserId: employeeCardMap.miaodaUserId,
        employeeName: employeeCardMap.employeeName,
        custNum: employeeCardMap.custNum,
        leniuCustId: employeeCardMap.leniuCustId,
      })
      .from(employeeCardMap)
      .where(eq(employeeCardMap.miaodaUserId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw payflowError(PAYFLOW_CODE.IDENTITY_UNAVAILABLE, '未找到工卡绑定，请联系现场服务台');
    }
    return {
      miaodaUserId: userId,
      employeeName: row.employeeName,
      custNum: row.custNum,
      leniuCustId: row.leniuCustId,
    };
  }

  /** 家人分享 token → 归属员工（仅 ACTIVE 身份可用） */
  async resolveFamilyPayer(shareToken: string): Promise<FamilyPayerIdentity> {
    const token = (shareToken || '').trim();
    if (!token) {
      throw payflowError(PAYFLOW_CODE.INVALID_FAMILY_TOKEN, '家人专属链接无效或已作废');
    }
    const rows: Array<typeof familyIdentity.$inferSelect> = await this.db
      .select()
      .from(familyIdentity)
      .where(and(eq(familyIdentity.shareToken, token), eq(familyIdentity.status, 'active')))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw payflowError(PAYFLOW_CODE.INVALID_FAMILY_TOKEN, '家人专属链接无效或已作废');
    }
    const employee = await this.resolveEmployee(row.employeeUserId);
    const secretRows: Array<{
      payPasswordHash: string | null;
      payPasswordLockedAt: Date | null;
    }> = await this.db
      .select({
        payPasswordHash: employeePaySecret.payPasswordHash,
        payPasswordLockedAt: employeePaySecret.payPasswordLockedAt,
      })
      .from(employeePaySecret)
      .where(eq(employeePaySecret.employeeUserId, row.employeeUserId))
      .limit(1);
    const secret = secretRows[0];
    return {
      employee,
      familyIdentityId: row.id,
      familyName: row.familyName,
      relation: row.relation,
      isSelf: row.isSelf,
      hasPayPassword: Boolean(secret?.payPasswordHash),
      payLocked: secret ? secret.payPasswordLockedAt !== null : false,
    };
  }

  /**
   * custId 解析：有缓存值直接用；为空则按工号查 customer/query（取 customerList[0].custId）。
   * 纯解析不写库，回写由 persistCustId / schedulePersistCustId 负责。
   */
  async resolveCustId(employee: ResolvedEmployee): Promise<CustIdResolution> {
    if (employee.leniuCustId) {
      return { custId: employee.leniuCustId, fresh: false };
    }
    const res = await this.callLeniu('查询用户信息', () => this.leniu.queryCustomer(employee.custNum));
    if (!isLeniuSuccess(res)) {
      throw payflowError(
        PAYFLOW_CODE.IDENTITY_UNAVAILABLE,
        `工号 ${employee.custNum} 查询失败：${res.msg || '上游返回异常'}`,
      );
    }
    const list = res.data?.customerList ?? [];
    const count = toNumberOrNull(res.data?.count);
    const custId = list.length > 0 ? list[0].custId : null;
    if (count === 0 || custId === null || custId === undefined || String(custId) === '') {
      throw payflowError(
        PAYFLOW_CODE.IDENTITY_UNAVAILABLE,
        `工号 ${employee.custNum} 未在乐牛查到人员信息`,
      );
    }
    return { custId: String(custId), fresh: true };
  }

  /** 实时余额（乐牛账户不可用时抛 4004） */
  async queryBalance(custId: string): Promise<BalanceSnapshot> {
    const res = await this.callLeniu('余额查询', () => this.leniu.queryBalance(custId));
    if (!isLeniuSuccess(res) || !res.data) {
      throw payflowError(PAYFLOW_CODE.IDENTITY_UNAVAILABLE, `余额查询失败：${res.msg || '账户不可用'}`);
    }
    const walletBal = toNumberOrNull(res.data.walletBal) ?? 0;
    const subsidyBal = toNumberOrNull(res.data.subsidyBal) ?? 0;
    const accBal = toNumberOrNull(res.data.accBal);
    return {
      balanceFen: accBal ?? walletBal + subsidyBal,
      walletBal,
      subsidyBal,
      accStatus: res.data.accStatus === null || res.data.accStatus === undefined ? null : String(res.data.accStatus),
      accName: res.data.accName ?? null,
    };
  }

  /** custId 回写：条件更新保证幂等（已是该值时命中 0 行，不算失败） */
  async persistCustId(miaodaUserId: string, custId: string): Promise<void> {
    const updated: Array<{ custNum: string }> = await this.db
      .update(employeeCardMap)
      .set({ leniuCustId: custId })
      .where(
        and(
          eq(employeeCardMap.miaodaUserId, miaodaUserId),
          or(isNull(employeeCardMap.leniuCustId), ne(employeeCardMap.leniuCustId, custId)),
        ),
      )
      .returning({ custNum: employeeCardMap.custNum });
    if (updated.length === 0) {
      this.logger.debug(`custId 已是最新，跳过回写 user=${miaodaUserId}`);
    }
  }

  /** 后台异步回写：不阻塞响应，失败仅告警（下次请求重新解析） */
  schedulePersistCustId(miaodaUserId: string, custId: string): void {
    void this.persistCustId(miaodaUserId, custId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`custId 异步回写失败 user=${miaodaUserId}: ${message}`);
    });
  }

  /** 乐牛传输类错误统一转 4004（对用户是「账户暂时不可用」） */
  private async callLeniu<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof LeniuClientError) {
        throw payflowError(PAYFLOW_CODE.IDENTITY_UNAVAILABLE, `${label}失败：${error.message}`);
      }
      throw error;
    }
  }
}
