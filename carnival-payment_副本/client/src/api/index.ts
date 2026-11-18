// 家年华支付客户端 API 层：统一错误信封解包（{error:{code,message}}）
import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AdminSession,
  AdminStall,
  AdminTxnDetail,
  StallWritebackResult,
  AppConfigDTO,
  AutoBindResponse,
  BillDetailDTO,
  BillItemDTO,
  BillResponse,
  BindCardRequest,
  BindCardResponse,
  CheckoutRequest,
  CheckoutResponse,
  CreateFamilyRequest,
  EmployeeSession,
  FamilyIdentityDTO,
  FamilyOrdersView,
  FamilySession,
  FamilyPayPasswordSetRequest,
  FirstLoginNotifyResponse,
  IdentityListResponse,
  MerchantLedgerExport,
  MerchantLedgerRow,
  MerchantPendingRefund,
  MerchantRefundDecideRequest,
  MerchantRefundDecideResponse,
  MerchantSession,
  LedgerStatus,
  MerchantSummary,
  MyOrderDetail,
  MyOrderItem,
  MyOrdersView,
  PayConfirmResult,
  PayPasswordVerifyResult,
  PayPrecheckResult,
  PrepareResponse,
  RefundApplyRequest,
  RefundApplyResult,
  RefundRequest,
  RefundResponse,
  SettlementRow,
  StallFeedResponse,
  StallTokenInfo,
  BindRequest,
  LeopenConfigRequest,
  LeopenConfigStatus,
  LeopenNetInfo,
  LeopenProbeHistoryItem,
  LeopenProbeResult,
  LeopenProbeTarget,
} from '@shared/api.interface';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(config: {
  url: string;
  method: string;
  data?: unknown;
  autoJumpToLogin?: boolean;
  /** 预期内的业务拒绝（如未绑卡）不按故障打 error 日志 */
  expectedFailure?: boolean;
}): Promise<T> {
  try {
    const response = await axiosForBackend({
      url: config.url,
      method: config.method,
      data: config.data,
      meta: config.autoJumpToLogin === false ? { autoJumpToLogin: false } : undefined,
    });
    if (response.status === 403) {
      const forbidden = (response.data as { error?: { code?: string; message?: string } } | undefined)
        ?.error;
      const forbiddenError = new ApiError(
        forbidden?.code || 'FORBIDDEN',
        forbidden?.message || '暂无访问权限',
        403,
      );
      logger.warn(
        `API ${config.url} 被拒绝: ${forbiddenError.code} ${forbiddenError.message}`,
      );
      throw forbiddenError;
    }
    return response.data as T;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    const err = error as { response?: { status?: number; data?: { error?: { code?: string; message?: string; details?: string } } } };
    const payload = err.response?.data?.error;
    const apiError = new ApiError(
      payload?.code || 'NETWORK_ERROR',
      payload?.message || '网络异常，请稍后重试',
      err.response?.status,
    );
    const log = config.expectedFailure ? logger.warn.bind(logger) : logger.error.bind(logger);
    log(`API ${config.url} 失败: ${apiError.code} ${apiError.message}`);
    throw apiError;
  }
}

/* ---------- 员工端 ---------- */

export const apiEmployee = {
  session: (opts?: { autoJumpToLogin?: boolean }) =>
    request<EmployeeSession>({
      url: '/api/employee/session',
      method: 'GET',
      autoJumpToLogin: opts?.autoJumpToLogin,
    }),
  bindCard: (req: BindCardRequest) =>
    request<BindCardResponse>({ url: '/api/employee/bind-card', method: 'POST', data: req }),
  autoBind: () => request<AutoBindResponse>({ url: '/api/employee/auto-bind', method: 'POST' }),
  identities: (opts?: { expectedFailure?: boolean }) =>
    request<IdentityListResponse>({
      url: '/api/employee/identities',
      method: 'GET',
      expectedFailure: opts?.expectedFailure,
    }),
  createFamily: (req: CreateFamilyRequest) => request<{ identity: FamilyIdentityDTO }>({ url: '/api/employee/family', method: 'POST', data: req }),
  deleteFamily: (id: string) => request<{ deleted: boolean }>({ url: `/api/employee/family/${id}`, method: 'DELETE' }),
  markShared: (id: string) => request<{ shared: boolean }>({ url: `/api/employee/family/${id}/shared`, method: 'POST' }),
  setPayPassword: (req: FamilyPayPasswordSetRequest) =>
    request<{ payPasswordSet: boolean }>({
      url: `/api/employee/pay-password`,
      method: 'POST',
      data: req,
    }),
  unlockPayPassword: () =>
    request<{ unlocked: boolean }>({
      url: `/api/employee/pay-password/unlock`,
      method: 'POST',
    }),
  bill: async (): Promise<BillResponse> => {
    const view = await request<MyOrdersView>({ url: '/api/me/orders', method: 'GET' });
    return toBillResponse(view);
  },
  billDetail: async (txnNo: string): Promise<BillDetailDTO> => {
    const detail = await request<MyOrderDetail>({
      url: `/api/me/order/${encodeURIComponent(txnNo)}`,
      method: 'GET',
    });
    return toBillDetail(detail);
  },
  selfToken: () => request<{ linkToken: string }>({ url: '/api/employee/self-token', method: 'GET' }),
};

/* ---------- 家人端（token 免登录） ---------- */

export const apiFamily = {
  session: (token: string) => request<FamilySession>({ url: `/api/family/${token}`, method: 'GET' }),
  bill: async (token: string): Promise<BillResponse> => {
    const view = await request<FamilyOrdersView>({
      url: `/api/family/orders?f=${encodeURIComponent(token)}`,
      method: 'GET',
    });
    return toBillResponse(view);
  },
  billDetail: async (token: string, txnNo: string): Promise<BillDetailDTO> => {
    const detail = await request<MyOrderDetail>({
      url: `/api/family/order/${encodeURIComponent(txnNo)}?f=${encodeURIComponent(token)}`,
      method: 'GET',
    });
    return toBillDetail(detail);
  },
};

/* ---------- 摊主端 ---------- */

export const apiMerchant = {
  session: () => request<MerchantSession>({ url: '/api/merchant/session', method: 'GET' }),
  bind: (req: BindRequest) => request<{ pin: string; stallNo: string; stallName: string }>({ url: '/api/merchant/bind', method: 'POST', data: req }),
  summary: () => request<MerchantSummary>({ url: '/api/merchant/summary', method: 'GET' }),
  stallToken: () => request<StallTokenInfo>({ url: '/api/merchant/stall-token', method: 'GET' }),
  refreshStallToken: () => request<{ stallToken: string }>({ url: '/api/merchant/stall-token/refresh', method: 'POST' }),
  ledger: () => request<MerchantLedgerRow[]>({ url: '/api/merchant/ledger', method: 'GET' }),
  exportLedger: () => request<MerchantLedgerExport>({ url: '/api/merchant/ledger/export', method: 'GET' }),
  /** 待摊主确认的退款单（首页 3 秒轮询） */
  refundPending: () =>
    request<MerchantPendingRefund[]>({ url: '/api/merchant/refund/pending', method: 'GET' }),
  /** 摊主审批：同意 / 拒绝（拒绝原因选填） */
  refundDecide: (req: MerchantRefundDecideRequest) =>
    request<MerchantRefundDecideResponse>({ url: '/api/merchant/refund/decide', method: 'POST', data: req }),
};

export const apiPayment = {
  /** 顾客扫摊位码后的付款页初始化（摊位 + 身份 + 余额） */
  prepare: (stallToken: string, who: string) =>
    request<PrepareResponse>({
      url: `/api/pay/context?s=${encodeURIComponent(stallToken)}&f=${encodeURIComponent(who === 'self' ? '' : (who || ''))}`,
      method: 'GET',
    }),
  /** 首次扫码授权登录成功 → 员工欢迎消息（幂等：服务端 welcome_pushed 判重） */
  firstLoginNotify: () =>
    request<FirstLoginNotifyResponse>({ url: '/api/pay/first-login-notify', method: 'POST' }),
  /** 顾客发起扣款（C 扫 B）：预检 → 确认，一次调用完成 */
  checkout: async (req: CheckoutRequest): Promise<CheckoutResponse> => {
    const amountYuan = (Math.round(req.amount * 100) / 100).toFixed(2);
    const familyShareToken = req.who && req.who !== 'self' ? req.who : undefined;
    const body = {
      stallToken: req.stallToken,
      amountYuan,
      familyShareToken,
      payPassword: req.payPassword,
    };
    try {
      const pre = await request<PayPrecheckResult>({
        url: '/api/pay/precheck',
        method: 'POST',
        data: body,
      });
      if (pre.balanceFen !== null && pre.amountFen > pre.balanceFen) {
        return {
          success: false,
          failureCode: 'INSUFFICIENT_BALANCE',
          failureMessage: '工卡余额不足，请调整金额',
          balance: pre.balanceFen / 100,
        };
      }
      const confirmed = await request<PayConfirmResult>({
        url: '/api/pay/confirm',
        method: 'POST',
        data: body,
      });
      return toCheckoutResponse(confirmed);
    } catch (error) {
      return toFailureResponse(error);
    }
  },
  /** 付款前校验家人支付密码（失败计入冻结次数） */
  verifyPassword: (familyShareToken: string, password: string) =>
    request<PayPasswordVerifyResult>({
      url: '/api/pay/verify-password',
      method: 'POST',
      data: { familyShareToken, password },
    }),
  /** 摊主到账增量查询（≤3 秒轮询） */
  stallFeed: (after: string) =>
    request<StallFeedResponse>({ url: `/api/payment/stall-feed?after=${encodeURIComponent(after)}`, method: 'GET' }),
};

/* ---------- 退款登记 ---------- */

export const apiRefund = {
  apply: (req: RefundApplyRequest) =>
    request<RefundApplyResult>({ url: '/api/refund/apply', method: 'POST', data: req }),
};

/* ---------- 管理员后台 ---------- */

export const apiAdmin = {
  session: () => request<AdminSession>({ url: '/api/admin/session', method: 'GET' }),
  stalls: () => request<AdminStall[]>({ url: '/api/admin/stalls', method: 'GET' }),
  search: (q: string) => request<AdminTxnDetail[]>({ url: `/api/admin/search?q=${encodeURIComponent(q)}`, method: 'GET' }),
  txnDetail: (txnNo: string) => request<AdminTxnDetail>({ url: `/api/admin/txn/${txnNo}`, method: 'GET' }),
  refund: (req: RefundRequest) => request<RefundResponse>({ url: '/api/admin/refund', method: 'POST', data: req }),
  resolvePending: (txnNo: string) => request<RefundResponse>({ url: `/api/admin/refund/${txnNo}/resolve`, method: 'POST' }),
  settlement: (date?: string) => request<SettlementRow[]>({ url: `/api/admin/settlement${date ? `?date=${date}` : ''}`, method: 'GET' }),
  config: () => request<AppConfigDTO>({ url: '/api/admin/config', method: 'GET' }),
  updateConfig: (key: string, value: string) => request<{ updated: boolean }>({ url: '/api/admin/config', method: 'PUT', data: { key, value } }),
  exportUrl: (type: 'ledger' | 'settlement') => `/api/admin/export?type=${type}`,
  writeback: () =>
    request<StallWritebackResult>({ url: '/api/admin/stalls/writeback', method: 'POST' }),
};

/* ---------- LEOPEN 链路诊断 ---------- */

export const apiLeopen = {
  probe: (custNum: string, target: LeopenProbeTarget) =>
    request<LeopenProbeResult>({ url: '/api/leopen/probe', method: 'POST', data: { custNum, target } }),
  history: (limit = 20) =>
    request<LeopenProbeHistoryItem[]>({ url: `/api/leopen/probe/history?limit=${limit}`, method: 'GET' }),
  configStatus: () => request<LeopenConfigStatus>({ url: '/api/leopen/config/status', method: 'GET' }),
  netInfo: () => request<LeopenNetInfo>({ url: '/api/leopen/netinfo', method: 'GET' }),
  updateConfig: (req: LeopenConfigRequest) =>
    request<{ updated: boolean }>({ url: '/api/leopen/config', method: 'POST', data: req }),
};

/* ---------- 新链路字段映射（页面契约不变） ---------- */

function toLedgerStatus(status: string): LedgerStatus {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'REFUNDED':
    case 'REVOKED':
      return 'refund_pending';
    case 'FAILED':
      return 'failed';
    default:
      return 'processing';
  }
}

function toBillItem(item: MyOrderItem): BillItemDTO {
  return {
    txnNo: item.macOrdId ?? item.id,
    stallName: item.stallName.includes(item.passCode)
      ? item.stallName
      : `${item.passCode} 号摊 · ${item.stallName}`,
    payerIdentity: item.payerName,
    amount: item.amountFen / 100,
    balanceAfter: item.balanceAfterFen === null ? null : item.balanceAfterFen / 100,
    status: toLedgerStatus(item.status),
    txnTime: item.paidAt ?? item.createdAt,
  };
}

function toBillResponse(view: MyOrdersView | FamilyOrdersView): BillResponse {
  return {
    balance: (view.balanceFen ?? 0) / 100,
    transactions: view.items.map((item: MyOrderItem) => toBillItem(item)),
  };
}

function toBillDetail(detail: MyOrderDetail): BillDetailDTO {
  const refund = detail.refund;
  const refundNote = refund
    ? [
        refund.status === 'APPROVED'
          ? `已同意退款 ${refund.refundMacOrdId}`
          : refund.status === 'REJECTED'
            ? `退款被摊主拒绝 ${refund.refundMacOrdId}${refund.decisionNote ? `（${refund.decisionNote}）` : ''}`
            : `退款待摊主确认 ${refund.refundMacOrdId}`,
        refund.remark,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return {
    ...toBillItem(detail),
    paymentLedgerId: detail.paymentLedgerId,
    refundable: detail.refundable,
    employeeName: detail.employeeName,
    stallPin: detail.passCode,
    operatorName: '自助扫码',
    operatorType: 'customer',
    relatedTxnNo: detail.refund ? detail.refund.refundMacOrdId : null,
    channel: 'scan',
    remark: refundNote,
  };
}

function toCheckoutResponse(result: PayConfirmResult): CheckoutResponse {
  if (result.status === 'SUCCESS') {
    return {
      success: true,
      txnNo: result.macOrdId,
      balanceAfter: result.accBal === null ? undefined : result.accBal / 100,
    };
  }
  if (result.status === 'UNKNOWN') {
    return {
      success: false,
      failureCode: 'UNKNOWN',
      failureMessage: '扣款结果待确认，请勿重复付款，稍后在账单中查看结果',
    };
  }
  return {
    success: false,
    failureCode: 'PAY_FAILED',
    failureMessage: result.failReason || '扣款失败，请稍后重试',
  };
}

function toFailureResponse(error: unknown): CheckoutResponse {
  const payload = error instanceof ApiError ? error : null;
  const codeMap: Record<string, string> = {
    '4001': 'INVALID_STALL',
    '4003': 'INVALID_AMOUNT',
    '4004': 'NOT_BOUND',
    '4005': 'INVALID_TOKEN',
    '4007': 'INVALID_AMOUNT',
    '4008': 'PASSWORD_REQUIRED',
    '4009': 'PASSWORD_INVALID',
    '4010': 'PASSWORD_LOCKED',
  };
  return {
    success: false,
    failureCode: (payload && codeMap[payload.code]) || 'PAY_FAILED',
    failureMessage: payload?.message || '付款处理异常，请稍后重试',
  };
}

/* ---------- 工具 ---------- */

/** 链接的完整 URL（QR 内容与点对点分享共用：token 不含 UID/口令明文） */
export function buildLink(path: string): string {
  const base = process.env.CLIENT_BASE_PATH || '/';
  return `${window.location.origin}${base.replace(/\/$/, '')}${path}`;
}

/** 家人专属链接 */
export function familyLink(token: string): string {
  return buildLink(`/f/${token}`);
}

/** 摊位收款码 QR 内容：顾客扫码付款入口（/pay?s=...，C 扫 B） */
export function stallPayUrl(stallToken: string): string {
  return buildLink(`/pay?s=${encodeURIComponent(stallToken)}`);
}

/** 从扫码结果（URL 或纯 token）解析摊位收款 token */
export function parseScanStall(content: string): string | null {
  const text = content.trim();
  const match = text.match(/[?&]s=([^&]+)/);
  if (match) return decodeURIComponent(match[1]);
  if (/^ST-[A-Za-z0-9_-]{8,}$/.test(text)) return text;
  return null;
}
