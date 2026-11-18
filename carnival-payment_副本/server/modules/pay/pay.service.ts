// 扣款编排：摊位码 + 金额 + 身份（员工/家人）→ 台账(INIT) → pay/device（验签错误原单号重发）
// → 结果判定（成功 / 明确失败 / 结果未知），异常路径先查单再定态；未知态不重扣，凭同一单号重提可复用
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, inArray } from 'drizzle-orm';
import { paymentLedger, stallConfig } from '@server/database/schema';
import {
  LENIU_CODE_UPLOADED,
  LENIU_VERIFY_ERROR_CODES,
  LeniuClient,
  LeniuClientError,
  isLeniuSuccess,
  toNumberOrNull,
  type LeniuOrderStateData,
  type LeniuResponse,
} from '@server/modules/leniu/leniu.client';
import { IdentityService, type ResolvedEmployee } from '@server/modules/identity/identity.service';
import {
  FamilyPayPasswordService,
  PAY_PASSWORD_LOCKED_MESSAGE,
  PAY_PASSWORD_MAX_FAILS,
  PAY_PASSWORD_NOT_SET_MESSAGE,
} from '@server/modules/family-pay-password/pay-password.service';
import { AppConfigService } from '@server/modules/config/config.service';
import { RELATION_LABELS, maskEmployeeName } from '@server/common/utils/mask';
import { newMacOrdId } from '@server/common/utils/leopen-sign';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';
import { CodedBusinessException } from '@server/common/interfaces/exception.interface';
import type {
  PayConfirmRequest,
  PayConfirmResult,
  PayPasswordVerifyRequest,
  PayPasswordVerifyResult,
  PayPrecheckRequest,
  PayPrecheckResult,
  PrepareResponse,
} from '@shared/api.interface';
import {
  ORDER_STATE_POLL_INTERVAL_MS,
  ORDER_STATE_POLL_MAX_ROUNDS,
  PAY_RETRY_MAX_ATTEMPTS,
  PRE_CHECK_SUCCESS_NOTE,
} from './pay.constants';
import { parseAmountFen } from './pay-amount';

type LedgerRow = typeof paymentLedger.$inferSelect;

interface PaymentCaller {
  userId: string;
}

interface StallRef {
  passCode: string;
  stallNo: string;
  stallName: string;
}

interface ResolvedPayer {
  employee: ResolvedEmployee;
  familyIdentityId: number | null;
  familyName: string | null;
  relation: string | null;
  isSelf: boolean;
  hasPayPassword: boolean;
  payLocked: boolean;
}

type OrderState = 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_FOUND';

interface ConfirmedOrder {
  state: OrderState;
  ordId: string | null;
  accBal: number | null;
  amountFen: number | null;
  payTime: string | null;
  rawMsg: string;
}

type PayOutcome =
  | { kind: 'RESPONSE'; res: LeniuResponse<LeniuOrderStateData> }
  | { kind: 'TRANSPORT'; message: string };

type PreCheckOutcome =
  | { kind: 'RESULT'; result: PayConfirmResult }
  | { kind: 'REUSE'; ledger: LedgerRow }
  | { kind: 'PROCEED' };

@Injectable()
export class PayService {
  private readonly logger = new Logger(PayService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly leniu: LeniuClient,
    private readonly identity: IdentityService,
    private readonly config: AppConfigService,
    private readonly payPassword: FamilyPayPasswordService,
  ) {}

  /**
   * 扫码付款页上下文：摊位 + 付款人 + 余额回显（不校验金额、不落流水）。
   * 前端付款页初始化就靠它，金额在确认时才进入 precheck/confirm。
   */
  async context(
    caller: PaymentCaller,
    stallToken: string,
    familyShareToken: string,
  ): Promise<PrepareResponse> {
    const inEventWindow = await this.config.isInEventWindow();
    let stall: StallRef;
    try {
      stall = await this.loadStall(stallToken);
    } catch (error) {
      this.logger.warn(`付款上下文摊位解析失败 token=${stallToken}: ${String(error)}`);
      return {
        stall: null,
        payer: null,
        balance: null,
        inEventWindow,
        code: 'INVALID_STALL',
        message: '摊位码无效或已刷新，请与摊主确认',
      };
    }
    const stallBrief = { stallNo: stall.stallNo, stallName: stall.stallName };
    if (!inEventWindow) {
      return {
        stall: stallBrief,
        payer: null,
        balance: null,
        inEventWindow: false,
        code: 'OUT_OF_WINDOW',
        message: '链接仅活动当天有效，现已失效',
      };
    }
    let payer: ResolvedPayer;
    try {
      payer = await this.resolvePayer(caller.userId, familyShareToken);
    } catch (error) {
      this.logger.warn(`付款上下文身份解析失败 user=${caller.userId}: ${String(error)}`);
      return {
        stall: stallBrief,
        payer: null,
        balance: null,
        inEventWindow: true,
        code: 'NEED_IDENTITY',
        message: '请从家人专属链接或飞书员工端进入后扫码',
      };
    }
    const fromFamily = payer.familyIdentityId !== null;
    const payerBrief = {
      displayName: fromFamily
        ? (payer.familyName ?? payer.employee.employeeName)
        : payer.employee.employeeName,
      relationLabel: fromFamily
        ? (RELATION_LABELS[payer.relation ?? 'other'] ?? '家人')
        : '本人',
      employeeMaskedName: maskEmployeeName(payer.employee.employeeName),
      cardLast4: payer.employee.custNum.slice(-4),
    };
    const needsPayPassword = payer.familyIdentityId !== null && !payer.isSelf;
    if (needsPayPassword && !payer.hasPayPassword) {
      return {
        stall: stallBrief,
        payer: payerBrief,
        balance: null,
        inEventWindow: true,
        code: 'PASSWORD_NOT_SET',
        message: PAY_PASSWORD_NOT_SET_MESSAGE,
      };
    }
    if (needsPayPassword && payer.payLocked) {
      return {
        stall: stallBrief,
        payer: payerBrief,
        balance: null,
        inEventWindow: true,
        code: 'PASSWORD_LOCKED',
        message: PAY_PASSWORD_LOCKED_MESSAGE,
      };
    }
    return {
      stall: stallBrief,
      payer: payerBrief,
      balance: null,
      inEventWindow: true,
      code: 'OK',
      passwordRequired: needsPayPassword,
    };
  }

  /** 付款前校验支付密码：不落流水，失败计入冻结次数 */
  async verifyPassword(req: PayPasswordVerifyRequest): Promise<PayPasswordVerifyResult> {
    const token = (req.familyShareToken || '').trim();
    if (!token) {
      throw payflowError(PAYFLOW_CODE.INVALID_FAMILY_TOKEN, '请从家人专属链接进入后重试');
    }
    const family = await this.identity.resolveFamilyPayer(token);
    if (family.isSelf) {
      return {
        ok: true,
        remainingAttempts: PAY_PASSWORD_MAX_FAILS,
        locked: false,
        message: '本人付款无需支付密码',
      };
    }
    try {
      await this.payPassword.verifyPayment(family.employee.miaodaUserId, req.password);
      return {
        ok: true,
        remainingAttempts: PAY_PASSWORD_MAX_FAILS,
        locked: false,
        message: '支付密码校验通过',
      };
    } catch (error) {
      if (error instanceof CodedBusinessException) {
        const state = await this.payPassword.readState(family.employee.miaodaUserId);
        return {
          ok: false,
          remainingAttempts: Math.max(PAY_PASSWORD_MAX_FAILS - state.failCount, 0),
          locked: state.locked || error.code === PAYFLOW_CODE.PASSWORD_LOCKED,
          message: error.message,
        };
      }
      throw error;
    }
  }

  /** 扣款预检：不落流水，只校验摊位 / 金额 / 身份并回显余额，生成幂等键 */
  async precheck(caller: PaymentCaller, req: PayPrecheckRequest): Promise<PayPrecheckResult> {
    const stall = await this.loadStall(req.stallToken);
    const amountFen = this.parseAmount(req.amountYuan);
    const payer = await this.resolvePayer(caller.userId, req.familyShareToken);
    let balanceFen: number | null = null;
    let note: string | null = null;
    try {
      const { custId, fresh } = await this.identity.resolveCustId(payer.employee);
      if (fresh) this.identity.schedulePersistCustId(payer.employee.miaodaUserId, custId);
      const snapshot = await this.identity.queryBalance(custId);
      balanceFen = snapshot.balanceFen;
      if (amountFen > balanceFen) note = '工卡余额不足，请调整金额';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`预检余额查询失败 user=${payer.employee.miaodaUserId}: ${message}`);
      note = '余额查询失败，请以扣款结果为准';
    }
    return {
      commonKey: newMacOrdId(),
      stallName: stall.stallName,
      passCode: stall.passCode,
      amountFen,
      payerName: payer.employee.employeeName,
      balanceFen,
      note,
    };
  }

  async confirm(caller: PaymentCaller, req: PayConfirmRequest): Promise<PayConfirmResult> {
    const stall = await this.loadStall(req.stallToken);
    const amountFen = this.parseAmount(req.amountYuan);
    const payer = await this.resolvePayer(caller.userId, req.familyShareToken);
    if (payer.familyIdentityId !== null && !payer.isSelf) {
      await this.payPassword.verifyPayment(payer.employee.miaodaUserId, req.payPassword);
    }

    // 预检查单：命中成功/失败直接返回；未终结的单在确认未落账时可复用（同号幂等，避免双扣）
    let reusable: LedgerRow | null = null;
    if (req.preCheckMacOrdId) {
      const pre = await this.preCheck(req.preCheckMacOrdId, stall, amountFen, payer);
      if (pre.kind === 'RESULT') return pre.result;
      if (pre.kind === 'REUSE') reusable = pre.ledger;
    }

    const { custId, fresh } = await this.identity.resolveCustId(payer.employee);
    if (fresh) this.identity.schedulePersistCustId(payer.employee.miaodaUserId, custId);

    const ledger: LedgerRow = reusable
      ? await this.resetLedgerToInit(reusable)
      : await this.insertLedger({
            passCode: stall.passCode,
            custNum: payer.employee.custNum,
            miaodaUserId: payer.employee.miaodaUserId,
            familyIdentityId: payer.familyIdentityId,
            amountFen,
          });

    return this.executePay(ledger, custId);
  }

  /** 摊位码校验：token → stall_config（仅 ACTIVE 可用） */
  private async loadStall(stallToken: string): Promise<StallRef> {
    const token = (stallToken || '').trim();
    if (!token) {
      throw payflowError(PAYFLOW_CODE.INVALID_STALL, '收款码无效，请扫描摊位收款码');
    }
    const rows: Array<{ passCode: string; merchantCode: string | null; stallName: string; status: string }> =
      await this.db
        .select({
          passCode: stallConfig.passCode,
          merchantCode: stallConfig.merchantCode,
          stallName: stallConfig.stallName,
          status: stallConfig.status,
        })
      .from(stallConfig)
      .where(eq(stallConfig.staticToken, token))
      .limit(1);
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE') {
      throw payflowError(PAYFLOW_CODE.INVALID_STALL, '收款码无效或摊位已停用');
    }
    return { passCode: row.passCode, stallNo: row.merchantCode ?? row.passCode, stallName: row.stallName };
  }

  private parseAmount(amountYuan: string): number {
    return parseAmountFen(amountYuan);
  }

  /** 家人 token 优先；否则取登录员工（匿名直接 401） */
  private async resolvePayer(userId: string, familyShareToken?: string): Promise<ResolvedPayer> {
    const token = (familyShareToken || '').trim();
    if (token) {
      const family = await this.identity.resolveFamilyPayer(token);
      return {
        employee: family.employee,
        familyIdentityId: family.familyIdentityId,
        familyName: family.familyName,
        relation: family.relation,
        isSelf: family.isSelf,
        hasPayPassword: family.hasPayPassword,
        payLocked: family.payLocked,
      };
    }
    const employee = await this.identity.resolveEmployee(userId);
    return {
      employee,
      familyIdentityId: null,
      familyName: null,
      relation: null,
      isSelf: false,
      hasPayPassword: false,
      payLocked: false,
    };
  }

  /**
   * 预检查单：
   * - 成功 / 失败：返回对应结果（不再扣款）
   * - 处理中：返回 UNKNOWN（等设备完成）
   * - 未落账且上下文一致（同摊位、同金额、同付款人）：返回可复用台账行
   * - 其余：返回 null，走新单
   */
  private async preCheck(
    preCheckMacOrdId: string,
    stall: StallRef,
    amountFen: number,
    payer: ResolvedPayer,
  ): Promise<PreCheckOutcome> {
    const existing = await this.findLedgerByMacOrdId(preCheckMacOrdId);
    if (!existing) return { kind: 'PROCEED' };
    if (existing.status === 'SUCCESS') {
      return { kind: 'RESULT', result: this.toConfirmResult(existing, PRE_CHECK_SUCCESS_NOTE) };
    }
    if (existing.status === 'FAILED') {
      return { kind: 'RESULT', result: this.toConfirmResult(existing) };
    }

    const macOrdId = existing.macOrdId ?? preCheckMacOrdId;
    const order = await this.pollOrderState(macOrdId, 1);
    if (order?.state === 'SUCCESS') {
      return { kind: 'RESULT', result: await this.finalizeSuccess(existing, order) };
    }
    if (order?.state === 'PENDING') {
      return {
        kind: 'RESULT',
        result: await this.finalizeUnknown(existing, '上笔扣款确认中，请稍后重试'),
      };
    }
    const sameContext =
      existing.passCode === stall.passCode &&
      existing.amountFen === amountFen &&
      existing.miaodaUserId === payer.employee.miaodaUserId;
    if (!sameContext) return { kind: 'PROCEED' };
    return { kind: 'REUSE', ledger: existing };
  }

  /** 台账复用：重置回 INIT 后同号重发（上游对同一 macOrdId 幂等，不会双扣） */
  private async resetLedgerToInit(row: LedgerRow): Promise<LedgerRow> {
    const updated: LedgerRow[] = await this.db
      .update(paymentLedger)
      .set({ status: 'INIT', payState: null, failReason: null, updatedAt: new Date() })
      .where(and(eq(paymentLedger.id, row.id), inArray(paymentLedger.status, ['INIT', 'UNKNOWN'])))
      .returning();
    return updated[0] ?? row;
  }

  private async insertLedger(input: {
    passCode: string;
    custNum: string;
    miaodaUserId: string;
    familyIdentityId: number | null;
    amountFen: number;
  }): Promise<LedgerRow> {
    const macOrdId = newMacOrdId();
    try {
      const rows: LedgerRow[] = await this.db
        .insert(paymentLedger)
        .values({
          passCode: input.passCode,
          custNum: input.custNum,
          miaodaUserId: input.miaodaUserId,
          familyIdentityId: input.familyIdentityId,
          amountFen: input.amountFen,
          status: 'INIT',
          macOrdId,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw payflowError(
          PAYFLOW_CODE.INTERNAL,
          `支付流水写入失败（单号 ${macOrdId}），请凭单号查询`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return row;
    } catch (error) {
      if (error instanceof CodedBusinessException) throw error;
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`写入支付流水失败 macOrdId=${macOrdId}`, stack);
      throw payflowError(
        PAYFLOW_CODE.INTERNAL,
        `支付流水写入失败（单号 ${macOrdId}），请凭单号查询`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * pay/device 调用：
   * - 验签层错误（100013/100032/100042）：请求未落账 → 原单号重发（新 nonce/sign），最多 2 次
   * - 超时 / 网络异常：不可判定，交给查单（不重发，防双扣）
   */
  private async callPayWithRetry(input: {
    custId: string;
    macOrdId: string;
    amountFen: number;
  }): Promise<PayOutcome> {
    for (let attempt = 1; attempt <= PAY_RETRY_MAX_ATTEMPTS; attempt += 1) {
      let res: LeniuResponse<LeniuOrderStateData>;
      try {
        res = await this.leniu.payByDevice({
          amountFen: input.amountFen,
          custId: input.custId,
          macOrdId: input.macOrdId,
        });
      } catch (error) {
        if (error instanceof LeniuClientError) {
          return { kind: 'TRANSPORT', message: error.message };
        }
        throw error;
      }
      if (LENIU_VERIFY_ERROR_CODES.includes(res.code) && attempt < PAY_RETRY_MAX_ATTEMPTS) {
        this.logger.warn(
          `pay/device 验签层错误 code=${res.code} macOrdId=${input.macOrdId}，原单号重发（第 ${attempt} 次）`,
        );
        continue;
      }
      return { kind: 'RESPONSE', res };
    }
    return { kind: 'TRANSPORT', message: 'pay/device 未返回结果' };
  }

  /** 结果判定：成功落成功态；处理中轮询；失败/查无此单先查单兜底，再判失败 */
  private async executePay(ledger: LedgerRow, custId: string): Promise<PayConfirmResult> {
    const macOrdId = ledger.macOrdId;
    if (!macOrdId) {
      throw payflowError(PAYFLOW_CODE.INTERNAL, '支付流水缺少单号', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const outcome = await this.callPayWithRetry({
      custId,
      macOrdId,
      amountFen: ledger.amountFen,
    });

    if (outcome.kind === 'TRANSPORT') {
      const order = await this.pollOrderState(macOrdId, 1);
      if (order?.state === 'SUCCESS') return this.finalizeSuccess(ledger, order);
      if (order?.state === 'PENDING') {
        return this.finalizeUnknown(ledger, '扣款结果确认中，请稍后重试');
      }
      return this.finalizeUnknown(
        ledger,
        `扣款结果未确认（${outcome.message}），请凭同一单号重试`,
      );
    }

    const res = outcome.res;

    // pay/device code=10000 即扣款成功（accBal 即时可信），无需再查单确认
    if (isLeniuSuccess(res)) {
      const order: ConfirmedOrder = { ...this.interpretOrder(res), state: 'SUCCESS' };
      return this.finalizeSuccess(ledger, order);
    }

    const interpreted = this.interpretOrder(res);

    if (interpreted.state === 'SUCCESS') {
      return this.finalizeSuccess(ledger, interpreted);
    }

    if (interpreted.state === 'PENDING' || res.code === LENIU_CODE_UPLOADED) {
      const order = await this.pollOrderState(macOrdId, ORDER_STATE_POLL_MAX_ROUNDS);
      if (order?.state === 'SUCCESS') return this.finalizeSuccess(ledger, order);
      if (order?.state === 'FAILED') {
        return this.finalizeFailed(ledger, this.failureReason(order.rawMsg || res.msg, res.code));
      }
      return this.finalizeUnknown(ledger, '扣款结果确认中，请稍后重试');
    }

    // 业务拒 / 查无此单：再查一次，防「返回失败但实际已扣」
    const order = await this.pollOrderState(macOrdId, 1);
    if (order?.state === 'SUCCESS') return this.finalizeSuccess(ledger, order);
    if (order?.state === 'PENDING') {
      return this.finalizeUnknown(ledger, '扣款结果确认中，请稍后重试');
    }
    return this.finalizeFailed(ledger, this.failureReason(interpreted.rawMsg || res.msg, res.code));
  }

  /** 归一上游订单状态：payState 3 成功 / 4 失败；ordState '1' 已支付 / '3' 已取消 / '4' 已退款 */
  private interpretOrder(res: LeniuResponse<LeniuOrderStateData>): ConfirmedOrder {
    const data = res.data;
    const rawMsg = res.msg || '';
    const payState = toNumberOrNull(data?.payState);
    const ordState =
      data?.ordState === null || data?.ordState === undefined ? null : String(data.ordState);
    const ordIdRaw = data?.ordId;
    const ordId =
      ordIdRaw === null ||
      ordIdRaw === undefined ||
      String(ordIdRaw) === '' ||
      String(ordIdRaw) === '0'
        ? null
        : String(ordIdRaw);
    const base = {
      ordId,
      accBal: toNumberOrNull(data?.accBal),
      amountFen: toNumberOrNull(data?.realAmount) ?? toNumberOrNull(data?.totalAmount),
      payTime: data?.payTime ?? null,
      rawMsg,
    };

    if (payState === 3 || ordState === '1') return { state: 'SUCCESS', ...base };
    if (payState === 4 || ordState === '3' || ordState === '4') return { state: 'FAILED', ...base };
    if (isLeniuSuccess(res)) {
      if (payState === null && ordState === null) return { state: 'FAILED', ...base };
      return { state: 'PENDING', ...base };
    }
    return { state: 'NOT_FOUND', ...base };
  }

  /** 查单轮询：PENDING 时间隔再查，命中终态立即返回；异常仅告警（不影响主判定） */
  private async pollOrderState(
    macOrdId: string,
    maxRounds: number,
  ): Promise<ConfirmedOrder | null> {
    let last: ConfirmedOrder | null = null;
    for (let round = 1; round <= maxRounds; round += 1) {
      if (round > 1) await this.sleep(ORDER_STATE_POLL_INTERVAL_MS);
      try {
        const res = await this.leniu.queryOrderState(macOrdId);
        last = this.interpretOrder(res);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`查单失败 macOrdId=${macOrdId} round=${round}: ${message}`);
        continue;
      }
      if (last.state === 'SUCCESS' || last.state === 'FAILED') return last;
    }
    return last;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async finalizeSuccess(
    ledger: LedgerRow,
    order: ConfirmedOrder,
  ): Promise<PayConfirmResult> {
    const row = await this.finalizeLedger(ledger.id, {
      status: 'SUCCESS',
      payState: 3,
      leniuOrdId: order.ordId,
      accBal: order.accBal,
      paidAt: new Date(),
      failReason: null,
    });
    return this.toConfirmResult(row);
  }

  private async finalizeFailed(ledger: LedgerRow, reason: string): Promise<PayConfirmResult> {
    const row = await this.finalizeLedger(ledger.id, {
      status: 'FAILED',
      payState: 4,
      failReason: reason.slice(0, 200),
    });
    return this.toConfirmResult(row);
  }

  private async finalizeUnknown(ledger: LedgerRow, reason: string): Promise<PayConfirmResult> {
    const row = await this.finalizeLedger(ledger.id, {
      status: 'UNKNOWN',
      failReason: reason.slice(0, 200),
    });
    return this.toConfirmResult(row);
  }

  /** 条件更新：只从未终结态（INIT/UNKNOWN）流转，0 行则读回当前值（并发兜底） */
  private async finalizeLedger(
    ledgerId: number,
    patch: Partial<typeof paymentLedger.$inferInsert>,
  ): Promise<LedgerRow> {
    const updated: LedgerRow[] = await this.db
      .update(paymentLedger)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(paymentLedger.id, ledgerId),
          inArray(paymentLedger.status, ['INIT', 'UNKNOWN']),
        ),
      )
      .returning();
    if (updated.length > 0) return updated[0];
    const current = await this.loadLedgerById(ledgerId);
    if (current.status === 'INIT' || current.status === 'UNKNOWN') {
      this.logger.error(
        `支付状态回写未生效 id=${ledgerId} macOrdId=${current.macOrdId ?? ''} 目标状态=${patch.status ?? ''} 当前状态=${current.status}`,
      );
    }
    return current;
  }

  private failureReason(message: string, code: number): string {
    return `扣款失败：${message || '上游返回失败'}（code ${code}）`;
  }

  private toConfirmResult(row: LedgerRow, note?: string): PayConfirmResult {
    const macOrdId = row.macOrdId ?? '';
    if (row.status === 'SUCCESS') {
      return {
        status: 'SUCCESS',
        macOrdId,
        amountFen: row.amountFen,
        accBal: row.accBal,
        paidAt: (row.paidAt ?? row.createdAt).toISOString(),
        ...(note ? { note } : {}),
      };
    }
    if (row.status === 'UNKNOWN' || row.status === 'INIT') {
      return { status: 'UNKNOWN', macOrdId, canReissue: true };
    }
    return { status: 'FAILED', macOrdId, failReason: row.failReason ?? '支付失败' };
  }

  private async loadLedgerById(id: number): Promise<LedgerRow> {
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw payflowError(PAYFLOW_CODE.INTERNAL, '支付流水不存在', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return row;
  }

  private async findLedgerByMacOrdId(macOrdId: string): Promise<LedgerRow | null> {
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.macOrdId, macOrdId))
      .limit(1);
    return rows[0] ?? null;
  }
}
