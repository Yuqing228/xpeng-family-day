// 管理员后台：退款唯一入口（精确到原单，乐牛无退款 API 故登记留痕）+ 检索 + 净额结算 + CSV 导出
// 数据源统一为 payment_ledger / refund_ledger（乐牛四接口链路）
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, gte, inArray, like, lt, ne, or } from 'drizzle-orm';
import {
  adminWhitelist,
  employeeCardMap,
  familyIdentity,
  paymentLedger,
  refundLedger,
  stallConfig,
} from '@server/database/schema';
import { AppConfigService } from '@server/modules/config/config.service';
import { RefundService } from '@server/modules/pay/refund.service';
import { todayRange8 } from '@server/common/utils/time';
import { toLedgerStatus } from '@server/common/utils/ledger-status';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import type {
  AdminStall,
  AdminTxnDetail,
  RefundRequest,
  RefundResponse,
  SettlementRow,
  AppConfigDTO,
} from '@shared/api.interface';

type LedgerRow = typeof paymentLedger.$inferSelect;

interface AdminJoinedRow {
  ledger: LedgerRow;
  employeeName: string | null;
  familyName: string | null;
  stallName: string | null;
}

const LEDGER_CSV_HEADER =
  '交易单号,交易时间,工号,员工,付款身份,摊位口令,摊位名称,金额,扣后余额,状态,退款单号,失败原因';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly config: AppConfigService,
    private readonly refunds: RefundService,
  ) {}

  async isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const rows = await this.db
      .select()
      .from(adminWhitelist)
      .where(eq(adminWhitelist.miaodaUserId, userId));
    return rows.length > 0;
  }

  /** 检索：交易单号 / 员工 / 摊位（specs「管理员后台检索」） */
  async search(q: string): Promise<AdminTxnDetail[]> {
    const kw = (q || '').trim();
    if (!kw) return [];
    const rows: AdminJoinedRow[] = await this.db
      .select({
        ledger: paymentLedger,
        employeeName: employeeCardMap.employeeName,
        familyName: familyIdentity.familyName,
        stallName: stallConfig.stallName,
      })
      .from(paymentLedger)
      .leftJoin(employeeCardMap, eq(employeeCardMap.miaodaUserId, paymentLedger.miaodaUserId))
      .leftJoin(familyIdentity, eq(familyIdentity.id, paymentLedger.familyIdentityId))
      .leftJoin(stallConfig, eq(stallConfig.passCode, paymentLedger.passCode))
      .where(
        or(
          eq(paymentLedger.macOrdId, kw),
          eq(paymentLedger.custNum, kw),
          eq(paymentLedger.passCode, kw),
          like(employeeCardMap.employeeName, `%${kw}%`),
          like(stallConfig.stallName, `%${kw}%`),
        ),
      )
      .orderBy(desc(paymentLedger.createdAt))
      .limit(50);
    return this.toDetails(rows);
  }

  async txnDetail(txnNo: string): Promise<AdminTxnDetail> {
    const key = (txnNo || '').trim();
    if (!key) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '交易不存在', HttpStatus.NOT_FOUND);
    }
    const numeric = /^\d+$/.test(key);
    const rows: AdminJoinedRow[] = numeric
      ? await this.baseQuery()
          .where(
            or(eq(paymentLedger.macOrdId, key), eq(paymentLedger.id, Number(key))),
          )
          .limit(1)
      : await this.baseQuery().where(eq(paymentLedger.macOrdId, key)).limit(1);
    if (rows.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '交易不存在', HttpStatus.NOT_FOUND);
    }
    const [detail] = await this.toDetails(rows);
    return detail;
  }

  /** 执行退款：唯一入口（specs「退款入口唯一收口」），按原单登记，一单只登记一次 */
  async refund(
    adminUserId: string,
    adminName: string,
    req: RefundRequest,
  ): Promise<RefundResponse> {
    const reason = (req.reason || '').trim();
    if (reason.length < 2 || reason.length > 100) {
      throw new BusinessException(
        ResponseCode.VALIDATION_ERROR,
        '请填写 2–100 字的退款原因（台账留痕用）',
      );
    }
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.macOrdId, (req.txnNo || '').trim()))
      .limit(1);
    const original = rows[0];
    if (!original) {
      return { result: 'rejected', message: `交易 ${req.txnNo} 不存在` };
    }
    if (original.status === 'FAILED') {
      return { result: 'rejected', message: '失败交易无实际扣款，无需退款' };
    }
    if (original.status !== 'SUCCESS') {
      return { result: 'rejected', message: '交易尚未支付成功，暂不可退款' };
    }
    const existing = await this.findRefund(original.id);
    if (existing) {
      return { result: 'rejected', message: '该交易已登记退款（幂等），不可重复执行' };
    }
    const window = await this.config.eventWindow();
    const now = new Date();
    if (now > window.end || original.createdAt > window.end || original.createdAt < window.start) {
      return { result: 'rejected', message: '超出当天退款窗口，请转线下与乐牛核对后处理' };
    }
    return this.registerRefund(adminUserId, adminName, original, `管理员 ${adminName}：${reason}`);
  }

  /** 待处理补录：超出窗口或线下核对完成后登记（跳窗口校验，仍按原单幂等） */
  async resolvePending(
    adminUserId: string,
    adminName: string,
    txnNo: string,
  ): Promise<RefundResponse> {
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.macOrdId, (txnNo || '').trim()))
      .limit(1);
    const original = rows[0];
    if (!original) {
      return { result: 'rejected', message: `交易 ${txnNo} 不存在` };
    }
    if (original.status !== 'SUCCESS') {
      return { result: 'rejected', message: '仅支付成功的交易可补录退款' };
    }
    const existing = await this.findRefund(original.id);
    if (existing) {
      return {
        result: 'rejected',
        message: `该交易已登记退款（${existing.macOrdId}），无需重复补录`,
      };
    }
    return this.registerRefund(adminUserId, adminName, original, `待处理补录 · 管理员 ${adminName}`);
  }

  /** 按摊位净额结算（specs/ledger-settlement「净额抽成结算」；失败/处理中不进统计） */
  async settlement(date?: string): Promise<SettlementRow[]> {
    const range = date ? this.parseDateRange(date) : todayRange8();
    const rate = await this.config.commissionRate();
    const payRows: Array<{ passCode: string; amountFen: number }> = await this.db
      .select({ passCode: paymentLedger.passCode, amountFen: paymentLedger.amountFen })
      .from(paymentLedger)
      .where(
        and(
          eq(paymentLedger.status, 'SUCCESS'),
          gte(paymentLedger.createdAt, range.start),
          lt(paymentLedger.createdAt, range.end),
        ),
      );
    const refundRows: Array<{ passCode: string; amountFen: number }> = await this.db
      .select({ passCode: refundLedger.passCode, amountFen: refundLedger.amountFen })
      .from(refundLedger)
      .where(
        and(
          eq(refundLedger.status, 'APPROVED'),
          gte(refundLedger.createdAt, range.start),
          lt(refundLedger.createdAt, range.end),
        ),
      );
    const stalls: Array<{ passCode: string; merchantCode: string | null; stallName: string }> = await this.db
      .select({ passCode: stallConfig.passCode, merchantCode: stallConfig.merchantCode, stallName: stallConfig.stallName })
      .from(stallConfig);

    const byStall = new Map<string, SettlementRow>();
    const ensure = (passCode: string): SettlementRow => {
      const existed = byStall.get(passCode);
      if (existed) return existed;
      const stall = stalls.find(
        (s: { passCode: string; merchantCode: string | null; stallName: string }) => s.passCode === passCode,
      );
      const created: SettlementRow = {
        stallNo: stall?.merchantCode ?? passCode,
        stallName: stall?.stallName ?? '未知摊位',
        successAmount: 0,
        refundAmount: 0,
        netAmount: 0,
        commissionRate: rate,
        commission: 0,
        takeHome: 0,
        txCount: 0,
        refundCount: 0,
      };
      byStall.set(passCode, created);
      return created;
    };

    for (const r of payRows) {
      const row = ensure(r.passCode);
      row.successAmount += r.amountFen / 100;
      row.txCount += 1;
    }
    for (const r of refundRows) {
      const row = ensure(r.passCode);
      row.refundAmount += r.amountFen / 100;
      row.refundCount += 1;
    }
    for (const row of byStall.values()) {
      row.successAmount = Math.round(row.successAmount * 100) / 100;
      row.refundAmount = Math.round(row.refundAmount * 100) / 100;
      row.netAmount = Math.round((row.successAmount - row.refundAmount) * 100) / 100;
      row.commission = Math.round(row.netAmount * rate * 100) / 100;
      row.takeHome = Math.round((row.netAmount - row.commission) * 100) / 100;
    }
    return Array.from(byStall.values()).sort((a, b) => b.netAmount - a.netAmount);
  }

  /** 台账 CSV 导出（对账凭证；specs「台账导出与对账」） */
  async exportLedgerCsv(): Promise<string> {
    const rows: AdminJoinedRow[] = await this.baseQuery()
      .orderBy(paymentLedger.createdAt)
      .limit(5000);
    const ids: number[] = rows.map((r: AdminJoinedRow) => r.ledger.id);
    const approved = new Map<number, string>();
    const pending = new Map<number, string>();
    if (ids.length > 0) {
      const refunds: Array<{ paymentLedgerId: number | null; macOrdId: string; status: string }> =
        await this.db
          .select({
            paymentLedgerId: refundLedger.paymentLedgerId,
            macOrdId: refundLedger.macOrdId,
            status: refundLedger.status,
          })
          .from(refundLedger)
          .where(inArray(refundLedger.paymentLedgerId, ids));
      for (const r of refunds) {
        if (r.paymentLedgerId === null) continue;
        if (r.status === 'APPROVED') approved.set(r.paymentLedgerId, r.macOrdId);
        else if (r.status === 'REGISTERED') pending.set(r.paymentLedgerId, r.macOrdId);
      }
    }
    const lines = rows.map((r: AdminJoinedRow) => {
      const approvedId = approved.get(r.ledger.id);
      const pendingId = pending.get(r.ledger.id);
      return [
        r.ledger.macOrdId ?? `PL-${r.ledger.id}`,
        (r.ledger.paidAt ?? r.ledger.createdAt).toISOString(),
        r.ledger.custNum,
        r.employeeName ?? '',
        r.familyName ?? '本人',
        r.ledger.passCode,
        r.stallName ?? '',
        (r.ledger.amountFen / 100).toFixed(2),
        r.ledger.accBal === null ? '' : (r.ledger.accBal / 100).toFixed(2),
        approvedId ? 'revoked' : pendingId ? 'refund_pending' : toLedgerStatus(r.ledger.status),
        approvedId ?? pendingId ?? '',
        (r.ledger.failReason ?? '').replace(/[\r\n,]/g, ' '),
      ].join(',');
    });
    return [LEDGER_CSV_HEADER, ...lines].join('\n');
  }

  async settlementCsv(): Promise<string> {
    const rows = await this.settlement();
    const header = '摊位号,摊位名称,成功流水,冲正退回,净流水,抽成比例,抽成,预计到手,成功笔数,退款笔数';
    const lines = rows.map((r: SettlementRow) =>
      [
        r.stallNo,
        r.stallName,
        r.successAmount.toFixed(2),
        r.refundAmount.toFixed(2),
        r.netAmount.toFixed(2),
        `${r.commissionRate * 100}%`,
        r.commission.toFixed(2),
        r.takeHome.toFixed(2),
        r.txCount,
        r.refundCount,
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  /** 摊位口令清单（发放唯一出口）：名称 / 编码 / 口令 / 收款码 token / 状态 */
  async listStalls(): Promise<AdminStall[]> {
    return this.db
      .select({
        stallName: stallConfig.stallName,
        merchantCode: stallConfig.merchantCode,
        passCode: stallConfig.passCode,
        staticToken: stallConfig.staticToken,
        status: stallConfig.status,
      })
      .from(stallConfig)
      .orderBy(stallConfig.merchantCode);
  }

  async getConfig(): Promise<AppConfigDTO> {
    return this.config.all();
  }

  /** 管理员更新配置（活动窗口 D-1 落定点：任务 1.4 / 8.5） */
  async updateConfig(key: string, value: string): Promise<void> {
    const allowed = ['event_window', 'qr_refresh_policy', 'commission_rate', 'family_limit', 'leniu_mode'];
    if (!allowed.includes(key)) {
      throw new BusinessException(ResponseCode.VALIDATION_ERROR, `不允许修改配置项 ${key}`);
    }
    if (key === 'event_window') {
      try {
        const parsed = JSON.parse(value) as { start: string; end: string };
        if (!parsed.start || !parsed.end) throw new Error('missing');
        new Date(parsed.start);
        new Date(parsed.end);
      } catch {
        throw new BusinessException(
          ResponseCode.VALIDATION_ERROR,
          'event_window 须为 {"start":"...","end":"..."} 的 ISO 时间 JSON',
        );
      }
    }
    await this.config.update(key, value);
  }

  /* ---------- internal ---------- */

  private baseQuery() {
    return this.db
      .select({
        ledger: paymentLedger,
        employeeName: employeeCardMap.employeeName,
        familyName: familyIdentity.familyName,
        stallName: stallConfig.stallName,
      })
      .from(paymentLedger)
      .leftJoin(employeeCardMap, eq(employeeCardMap.miaodaUserId, paymentLedger.miaodaUserId))
      .leftJoin(familyIdentity, eq(familyIdentity.id, paymentLedger.familyIdentityId))
      .leftJoin(stallConfig, eq(stallConfig.passCode, paymentLedger.passCode));
  }

  private async toDetails(rows: AdminJoinedRow[]): Promise<AdminTxnDetail[]> {
    const ids: number[] = rows.map((r: AdminJoinedRow) => r.ledger.id);
    const approved = new Map<number, string>();
    const pending = new Map<number, string>();
    const rejected = new Set<number>();
    if (ids.length > 0) {
      const refunds: Array<{ paymentLedgerId: number | null; macOrdId: string; status: string }> =
        await this.db
          .select({
            paymentLedgerId: refundLedger.paymentLedgerId,
            macOrdId: refundLedger.macOrdId,
            status: refundLedger.status,
          })
          .from(refundLedger)
          .where(inArray(refundLedger.paymentLedgerId, ids));
      for (const r of refunds) {
        if (r.paymentLedgerId === null) continue;
        if (r.status === 'APPROVED') approved.set(r.paymentLedgerId, r.macOrdId);
        else if (r.status === 'REGISTERED') pending.set(r.paymentLedgerId, r.macOrdId);
        else if (r.status === 'REJECTED') rejected.add(r.paymentLedgerId);
      }
    }
    const inWindow = await this.config.isInEventWindow();
    return rows.map(
      (r: AdminJoinedRow) =>
        this.toDetail(
          r,
          {
            approvedMacOrdId: approved.get(r.ledger.id) ?? null,
            pendingMacOrdId: pending.get(r.ledger.id) ?? null,
            hasRejected: rejected.has(r.ledger.id),
          },
          inWindow,
        ),
    );
  }

  private toDetail(
    r: AdminJoinedRow,
    refund: {
      approvedMacOrdId: string | null;
      pendingMacOrdId: string | null;
      hasRejected: boolean;
    },
    inWindow: boolean,
  ): AdminTxnDetail {
    const refundable =
      r.ledger.status === 'SUCCESS' &&
      refund.approvedMacOrdId === null &&
      refund.pendingMacOrdId === null &&
      inWindow;
    const status = refund.approvedMacOrdId
      ? 'revoked'
      : refund.pendingMacOrdId
        ? 'refund_pending'
        : toLedgerStatus(r.ledger.status);
    return {
      paymentLedgerId: r.ledger.id,
      txnNo: r.ledger.macOrdId ?? `PL-${r.ledger.id}`,
      stallName: r.stallName ?? '未知摊位',
      payerIdentity: r.familyName ?? '本人',
      amount: r.ledger.amountFen / 100,
      balanceAfter: r.ledger.accBal === null ? null : r.ledger.accBal / 100,
      status,
      txnTime: (r.ledger.paidAt ?? r.ledger.createdAt).toISOString(),
      employeeName: r.employeeName ?? '—',
      stallPin: r.ledger.passCode,
      operatorName: '自助扫码',
      operatorType: 'merchant',
      relatedTxnNo: refund.approvedMacOrdId ?? refund.pendingMacOrdId,
      channel: 'scan',
      remark: r.ledger.failReason,
      cardUid: r.ledger.custNum,
      refundable,
      refundableReason: refundable ? undefined : '状态或窗口不满足（当天内 + 成功 + 未重复登记）',
      refundStatus: refund.approvedMacOrdId
        ? 'APPROVED'
        : refund.pendingMacOrdId
          ? 'REGISTERED'
          : refund.hasRejected
            ? 'REJECTED'
            : undefined,
    };
  }

  private async findRefund(paymentLedgerId: number): Promise<{ macOrdId: string } | null> {
    const rows: Array<{ macOrdId: string }> = await this.db
      .select({ macOrdId: refundLedger.macOrdId })
      .from(refundLedger)
      .where(and(eq(refundLedger.paymentLedgerId, paymentLedgerId), ne(refundLedger.status, 'REJECTED')))
      .limit(1);
    return rows[0] ?? null;
  }

  private async registerRefund(
    adminUserId: string,
    adminName: string,
    original: LedgerRow,
    remark: string,
  ): Promise<RefundResponse> {
    const amount = original.amountFen / 100;
    try {
      const result = await this.refunds.register({
        paymentLedgerId: original.id,
        initiatedBy: (adminUserId || adminName || 'admin').slice(0, 64),
        remark: remark.slice(0, 200),
        initialStatus: 'APPROVED',
      });
      return {
        result: 'pending',
        message: `已同意退款 ${result.refundMacOrdId}（¥${amount.toFixed(2)}），待人工原路退回工卡`,
        reversalTxnNo: result.refundMacOrdId,
        refundedAmount: amount,
      };
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      this.logger.error(
        `退款登记异常 txn=${original.macOrdId}: ${error instanceof Error ? error.stack : String(error)}`,
      );
      return { result: 'pending', message: '退款登记失败，请稍后重试或转线下核对' };
    }
  }

  private parseDateRange(date: string): { start: Date; end: Date } {
    const d = new Date(`${date}T00:00:00+08:00`);
    if (Number.isNaN(d.getTime())) {
      throw new BusinessException(ResponseCode.VALIDATION_ERROR, '日期格式无效，应为 YYYY-MM-DD');
    }
    return { start: d, end: new Date(d.getTime() + 24 * 3600_000) };
  }
}
