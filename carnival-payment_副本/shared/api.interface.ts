/* 前后端共享的类型：家年华支付（对应 openspec change jianianhua-payment-miaoda-app） */

/* ---------- 通用 ---------- */

export interface CardRef {
  /** 员工工卡号（完整，如 22309） */
  cardUid: string;
  /** 员工姓名（完整显示，不脱敏，如 周海杰） */
  employeeMaskedName: string;
  /** 员工端展示用工卡号（当前为完整工卡号） */
  cardLast4: string;
}

/* ---------- 员工端 ---------- */

export interface EmployeeSession {
  loggedIn: boolean;
  userId?: string;
  userName?: string;
  /** 工卡映射；null = 登录成功但未关联工卡（无法进入员工端功能） */
  card: CardRef | null;
  /** 工卡余额（乐牛实时查询） */
  balance: number | null;
  inEventWindow: boolean;
}

/** POST /api/employee/bind-card：用工号绑定当前登录账号（工号唯一来源为多维表格同步） */
export interface BindCardRequest {
  /** 员工工号，必须已存在于员工工号表 */
  custNum: string;
}

export interface BindCardResponse {
  card: CardRef;
  /** 是否同时补齐了 open_id */
  openIdBound: boolean;
}

/** 首次进入自动认领结果：按登录姓名匹配名单中未绑定的唯一同名行 */
export interface AutoBindResponse {
  /** 是否已绑定到某个工号 */
  bound: boolean;
  /** 绑定到的工号；bound=false 时为 null */
  custNum: string | null;
  /** 未绑定原因：NO_MATCH 名单无同名未绑定行 / AMBIGUOUS 同名多行 */
  reason: 'NO_MATCH' | 'AMBIGUOUS' | null;
}

export type FamilyRelation = 'spouse' | 'child' | 'elder' | 'other';

export interface FamilyIdentityDTO {
  id: string;
  displayName: string;
  relation: FamilyRelation;
  relationLabel: string;
  /** 已分享 / 未分享 */
  shared: boolean;
  /** 专属链接 token（客户端拼接完整链接） */
  linkToken: string;
  status: 'active' | 'deleted';
}

export interface FamilyPayPasswordState {
  /** 是否已设置 6 位家庭支付密码（全家共用） */
  payPasswordSet: boolean;
  /** 支付密码是否因连续输错被冻结 */
  payLocked: boolean;
}

export interface IdentityListResponse {
  self: { displayName: string };
  families: FamilyIdentityDTO[];
  /** 家庭级支付密码状态（该员工所有家人共用同一密码） */
  familyPayPassword: FamilyPayPasswordState;
  card: CardRef;
  /** 工卡余额（元，乐牛实时查询；null = 查询失败） */
  balance: number | null;
  familyLimit: number;
}

export interface CreateFamilyRequest {
  displayName: string;
  relation: FamilyRelation;
}

/** POST /api/employee/pay-password：员工设置 / 重置家庭支付密码（全家共用） */
export interface FamilyPayPasswordSetRequest {
  payPassword: string;
}

export interface CreateFamilyResponse {
  identity: FamilyIdentityDTO;
}

/* ---------- 家人端 ---------- */

export interface FamilySession {
  /** 付款身份，如「孩子一号」 */
  displayName: string;
  relationLabel: string;
  /** 归属员工，如「张*三（爸爸）的家人」 */
  employeeMaskedName: string;
  cardLast4: string;
  balance: number;
  inEventWindow: boolean;
  /** 该 token 是否为员工本人（本人付款无需支付密码） */
  isSelf: boolean;
  /** 是否已设置支付密码 */
  payPasswordSet: boolean;
  /** 支付密码是否已冻结 */
  payLocked: boolean;
}

export type LedgerStatus = 'success' | 'revoked' | 'refund_pending' | 'processing' | 'failed';

/** 退款单状态：员工/家属申请后待摊主确认，摊主或管理员可推向终态 */
export const REFUND_STATUSES = ['REGISTERED', 'APPROVED', 'REJECTED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const isRefundStatus = (v: string): v is RefundStatus =>
  (REFUND_STATUSES as readonly string[]).includes(v);
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  REGISTERED: '待摊主确认',
  APPROVED: '已同意',
  REJECTED: '已拒绝',
};

export interface BillItemDTO {
  txnNo: string;
  /** 摊位名称，如「01 号摊 · 柠檬茶」 */
  stallName: string;
  /** 付款人，如「孩子一号」/「张*三（本人）」 */
  payerIdentity: string;
  /** 正数 = 扣款；负数 = 撤销退回 */
  amount: number;
  balanceAfter: number | null;
  status: LedgerStatus;
  /** ISO 时间 */
  txnTime: string;
}

export interface BillResponse {
  balance: number;
  transactions: BillItemDTO[];
}

export interface BillDetailDTO extends BillItemDTO {
  /** 支付台账主键，退款登记入参 */
  paymentLedgerId: number;
  /** 支付成功且未登记退款时 true（后端判定，不限制金额） */
  refundable: boolean;
  employeeName: string;
  stallPin: string;
  operatorName: string;
  operatorType: 'merchant' | 'admin' | 'customer';
  relatedTxnNo: string | null;
  channel: 'scan' | 'offline_reentry';
  remark: string | null;
}

/* ---------- 摊主端 ---------- */

export interface MerchantSession {
  loggedIn: boolean;
  userId?: string;
  userName?: string;
  binding: { pin: string; stallName: string } | null;
}

export interface BindRequest {
  pin: string;
}

export interface MerchantSummary {
  stallName: string;
  /** 今日净流水（成功 − 冲正退回） */
  netAmount: number;
  txCount: number;
  refundCount: number;
  refundAmount: number;
  commissionRate: number;
  commission: number;
  takeHome: number;
}

export interface MerchantLedgerRow extends BillItemDTO {
  employeeName: string;
  employeeCustNum: string;
  operatorName: string;
}

/** GET /api/merchant/ledger/export：服务端生成当日台账 CSV，返回文件存储真实下载链接 */
export interface MerchantLedgerExport {
  downloadUrl: string;
}

/** GET /api/merchant/refund/pending：待摊主审批的退款单 */
export interface MerchantPendingRefund {
  refundMacOrdId: string;
  /** 原支付单号 */
  txnNo: string;
  /** 退款金额（元） */
  amount: number;
  /** 归属员工姓名 */
  employeeName: string;
  /** 付款人：家人名或「本人」 */
  payerIdentity: string;
  /** 申请人填写的退款原因 */
  remark: string | null;
  /** 申请时间 ISO */
  createdAt: string;
}

/** POST /api/merchant/refund/decide */
export interface MerchantRefundDecideRequest {
  refundMacOrdId: string;
  /** APPROVED 同意 / REJECTED 拒绝 */
  decision: 'APPROVED' | 'REJECTED';
  /** 拒绝原因（选填，≤100 字，展示给申请人） */
  rejectReason?: string;
}

export interface MerchantRefundDecideResponse {
  refundMacOrdId: string;
  status: RefundStatus;
  message: string;
}

/* ---------- C 扫 B：顾客付款准备 / 摊主到账 ---------- */

/** GET /api/payment/prepare?s=&who= ：扫码后付款页初始化 */
export interface PrepareResponse {
  /** 摊位（token 无效时为 null，附 code） */
  stall: { stallNo: string; stallName: string } | null;
  /** 付款人（无身份时为 null，前端进引导态） */
  payer: { displayName: string; relationLabel: string; employeeMaskedName: string; cardLast4: string } | null;
  /** 工卡余额（取不到时 null） */
  balance: number | null;
  inEventWindow: boolean;
  /** INVALID_STALL / NEED_IDENTITY / OUT_OF_WINDOW / PASSWORD_LOCKED / PASSWORD_NOT_SET / OK */
  code:
    | 'OK'
    | 'INVALID_STALL'
    | 'NEED_IDENTITY'
    | 'OUT_OF_WINDOW'
    | 'PASSWORD_LOCKED'
    | 'PASSWORD_NOT_SET';
  message?: string;
  /** 付款人需先输入 6 位支付密码（仅非本人的家人身份为 true） */
  passwordRequired?: boolean;
}

/** POST /api/pay/first-login-notify ：首次扫码授权登录成功后给员工发欢迎消息（welcome_pushed 幂等，已发过不再发） */
export interface FirstLoginNotifyResponse {
  /** 本次是否发送了欢迎消息 */
  sent: boolean;
}

/** 摊位收款码信息（摊主端展示） */
export interface StallTokenInfo {
  stallToken: string;
  stallNo: string;
  stallName: string;
}

/** 摊主到账增量查询的一笔 */
export interface StallFeedTxn {
  txnNo: string;
  amount: number;
  payerIdentity: string;
  txnTime: string;
}

/** GET /api/payment/stall-feed?after= */
export interface StallFeedResponse {
  transactions: StallFeedTxn[];
  /** 游标：最近一笔时间（无新交易时回传原 after） */
  cursor: string;
}

export interface PrecheckResponse {
  /** 该工卡是否有请求正在处理（摊主页显示「排队等待」） */
  busy: boolean;
  queueAhead: number;
  /** 付款人预览（扫码即识别） */
  payer: { displayName: string; relationLabel: string; employeeMaskedName: string; cardLast4: string } | null;
}

export interface CheckoutRequest {
  /** 摊位收款码 token（顾客扫商家码获得） */
  stallToken: string;
  /** 顾客身份：家人 token 或 'self'（员工登录态） */
  who: string;
  /** 顾客输入的金额（元，> 0） */
  amount: number;
  /** 客户端幂等键（防重复提交） */
  requestId: string;
  /** 家人付款的 6 位支付密码（员工本人不需要） */
  payPassword?: string;
}

export interface CheckoutResponse {
  success: boolean;
  txnNo?: string;
  balanceAfter?: number;
  /** 失败码：INSUFFICIENT_BALANCE / INVALID_TOKEN / OUT_OF_WINDOW / LENIU_TIMEOUT / NOT_BOUND / INVALID_AMOUNT / PASSWORD_REQUIRED / PASSWORD_INVALID / PASSWORD_LOCKED */
  failureCode?: string;
  failureMessage?: string;
  /** 失败时的当前余额（余额不足场景） */
  balance?: number;
}

/* ---------- 管理员后台 ---------- */

export interface AdminSession {
  isAdmin: boolean;
  userName?: string;
}

export interface AdminTxnDetail extends BillDetailDTO {
  cardUid: string;
  /** 当天可退标识（退款边界核查预览） */
  refundable: boolean;
  refundableReason?: string;
  /** 该单最新退款状态（APPROVED 优先；无退款单时缺省） */
  refundStatus?: RefundStatus;
}

export interface RefundRequest {
  txnNo: string;
  reason: string;
}

export interface RefundResponse {
  /** pending = 已同意退款，待人工原路退回工卡；rejected = 边界不满足；refunded 为历史枚举保留值（线上无冲正通道） */
  result: 'refunded' | 'pending' | 'rejected';
  message: string;
  reversalTxnNo?: string;
  refundedAmount?: number;
}

export interface SettlementRow {
  stallNo: string;
  stallName: string;
  successAmount: number;
  refundAmount: number;
  netAmount: number;
  commissionRate: number;
  commission: number;
  takeHome: number;
  txCount: number;
  refundCount: number;
}

/** 摊位口令清单（AdminPage 发放唯一出口；passCode 为随机 4 位、区分大小写） */
export interface AdminStall {
  stallName: string;
  /** Base「摊主编码」同步列 */
  merchantCode: string | null;
  passCode: string;
  /** 摊位收款码 token（换码不影响，供核对） */
  staticToken: string;
  status: string;
}

/** 摊位口令与收款码写回多维表格结果（手动触发与定时任务共用） */
export interface StallWritebackResult {
  /** 参与写回的摊位（有 Base 记录 ID） */
  total: number;
  /** Base 更新成功条数 */
  updated: number;
  /** 跳过（无 Base 记录 ID，无法定位行） */
  skipped: number;
  /** 收款码图片生成或上传失败 */
  failed: number;
  /** 本次使用的收款码基础地址 */
  baseUrl: string;
  /** 完成时间（ISO） */
  finishedAt: string;
}

export interface AppConfigDTO {
  eventWindow: { start: string; end: string };
  qrRefreshPolicy: 'fixed' | '60s' | '30m';
  commissionRate: number;
  familyLimit: number;
  leniuMode: 'mock' | 'http';
}

/* ---------- LEOPEN 链路诊断 ---------- */

export type LeopenProbeVerdict =
  | 'CONFIG_MISSING'
  | 'DNS_FAIL'
  | 'TCP_FAIL'
  | 'TLS_FAIL'
  | 'HTTP_TIMEOUT'
  | 'GATEWAY_DENIED'
  | 'BUSINESS_OK'
  | 'BUSINESS_ERROR'
  | 'HTTP_ERROR';

export interface LeopenProbeStage {
  key: 'dns' | 'tcp' | 'tls' | 'request' | 'response';
  label: string;
  status: 'ok' | 'fail' | 'skip';
  /** 阶段耗时 ms */
  ms?: number;
  /** 关键信息：解析 IP / 证书 CN / HTTP 状态 / 字节数 */
  info?: string;
  error?: string;
}

export interface LeopenProbeControl {
  label: string;
  /** 请求体摘要 */
  requestSummary: string;
  status: number;
  bytes: number;
  /** 响应体是否与主探测完全一致（一致 = 后端未解析请求体） */
  sameAsMain: boolean;
  /** 响应体前 80 字 */
  bodyPreview: string;
}

export type LeopenProbeTarget =
  | 'order-state-query'
  | 'customer-query'
  | 'account-balance-query'
  | 'pay-device';

export interface LeopenProbeTargetSpec {
  target: LeopenProbeTarget;
  label: string;
  path: string;
  /** 是否在文档 §7-5 接口授权清单内 */
  authorized: boolean;
  /** 是否存在资金副作用 */
  sideEffect: boolean;
  note: string;
}

/** 可探测的 LEOPEN 接口（前端选择器与服务端 content 构造共用） */
export const LEOPEN_PROBE_TARGETS: LeopenProbeTargetSpec[] = [
  {
    target: 'order-state-query',
    label: '订单状态查询',
    path: '/tengyun-api/leopen/order/state/query',
    authorized: true,
    sideEffect: false,
    note: '授权清单内 · 只读无副作用；扣款超时后用它确认结果、防止重复扣款；工号不参与请求，用不存在的单号即可验证链路是否放行',
  },
  {
    target: 'customer-query',
    label: '查询用户信息',
    path: '/tengyun-api/leopen/customer/query',
    authorized: false,
    sideEffect: false,
    note: '不在授权清单内 · 只读；按工号查询用户信息（接口为分页列表查询，返回 count + customerList），可用真实工号复验',
  },
  {
    target: 'account-balance-query',
    label: '钱包余额查询',
    path: '/tengyun-api/leopen/account/balance/query',
    authorized: false,
    sideEffect: false,
    note: '不在授权清单内 · 只读；先用同一工号查用户信息换取真实 custId，再查余额，响应里可直接看到真实钱包余额',
  },
  {
    target: 'pay-device',
    label: '工卡扣款',
    path: '/tengyun-api/leopen/pay/device',
    authorized: true,
    sideEffect: true,
    note: '授权清单内 · 真实扣款接口；用工号换真实 custId 后固定扣 0.01 元（金额不可调），会真实减少工卡余额，发起前需二次确认',
  },
];

export interface LeopenNetInfo {
  host: string;
  /** 域名解析到的目标 IP */
  targetIp?: string;
  /** 本实例第一个非回环网卡 IPv4 */
  localIp?: string;
  /** 出网公网 IP（回显服务可得时才有） */
  egressIp?: string;
  env: string;
}

export interface LeopenProbeResult {
  verdict: LeopenProbeVerdict;
  /** 本次探测的目标接口（改造前的历史记录无此字段） */
  target?: LeopenProbeTarget;
  /** 目标接口路径 */
  targetPath?: string;
  /** 卡点结论（中文一句话） */
  verdictText: string;
  /** 结论说明（含下一步排查建议） */
  verdictDetail: string;
  /** 小鹏网关 trace-id（可直接给运维查日志） */
  traceId?: string;
  httpStatus?: number;
  totalMs: number;
  /** 探测时刻 ISO */
  probedAt: string;
  /** dev / runtime */
  env: string;
  stages: LeopenProbeStage[];
  requestLog: {
    method: string;
    url: string;
    headers: [string, string][];
    body: string;
    /** 签名串（appsecret 脱敏） */
    signStrMasked: string;
  };
  responseLog?: {
    statusText?: string;
    headers: [string, string][];
    body: string;
    bytes: number;
  };
  cert?: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    protocol: string;
  };
  /** 本地解析到的目标 IP */
  resolvedIp?: string;
  /** TCP 连接对端实际 IP */
  remoteIp?: string;
  /** 本次 TCP 连接的源 IP（本实例出站地址） */
  sourceIp?: string;
  /** 本次 TCP 连接的源端口 */
  sourcePort?: number;
  /** 出网公网 IP（回显服务可得时才有） */
  egressIp?: string;
  /** 对照实验：不同请求体打同一接口的响应比对（仅被拒场景采集） */
  controls?: LeopenProbeControl[];
}

export interface LeopenProbeHistoryItem {
  id: string;
  createdAt: string;
  probe: LeopenProbeResult;
}

export interface LeopenConfigStatus {
  source: 'env' | 'app_config' | 'missing';
}

export interface LeopenConfigRequest {
  appid: string;
  appsecret: string;
}

/* ---------- 乐牛四接口融合（后端接口层） ---------- */

/** 支付链路业务码（HTTP 非 2xx 时出现在 error.code） */
export type PayflowCode =
  | '4001'
  | '4003'
  | '4004'
  | '4005'
  | '4006'
  | '4007'
  | '4008'
  | '4009'
  | '4010'
  | '5000';

/** POST /api/pay/precheck：扣款前预检（校验摊位 / 金额 / 身份并回显余额） */
export interface PayPrecheckRequest {
  stallToken: string;
  amountYuan: string;
  familyShareToken?: string;
}

export interface PayPrecheckResult {
  /** 幂等键：确认时作为 preCheckMacOrdId 传入；预检本身不产生流水 */
  commonKey: string;
  stallName: string;
  passCode: string;
  amountFen: number;
  payerName: string;
  /** 当前余额（分），查询失败为 null */
  balanceFen: number | null;
  note: string | null;
}

/** POST /api/pay/confirm */
export interface PayConfirmRequest {
  /** 摊位收款码 token（stall_config.static_token） */
  stallToken: string;
  /** 金额（元，字符串；≤2 位小数，0～500） */
  amountYuan: string;
  /** 家人身份 token；不传 = 员工本人 */
  familyShareToken?: string;
  /** 上次可能已扣款的单号：先查单确认，避免重复扣款 */
  preCheckMacOrdId?: string;
  /** 家人付款的 6 位支付密码；非本人家人身份必填 */
  payPassword?: string;
}

/** POST /api/pay/verify-password：付款前校验支付密码（不落流水，失败计入冻结次数） */
export interface PayPasswordVerifyRequest {
  familyShareToken: string;
  password: string;
}

export interface PayPasswordVerifyResult {
  ok: boolean;
  /** 剩余可尝试次数（已冻结为 0） */
  remainingAttempts: number;
  locked: boolean;
  /** 失败/冻结提示文案 */
  message: string;
}

/** 扣款三态：成功 / 明确失败 / 结果未知（可凭同一单号重提） */
export type PayConfirmResult =
  | {
      status: 'SUCCESS';
      macOrdId: string;
      amountFen: number;
      accBal: number | null;
      paidAt: string;
      note?: string;
    }
  | { status: 'FAILED'; macOrdId: string; failReason: string }
  | { status: 'UNKNOWN'; macOrdId: string; canReissue: true };

/** GET /api/me/balance（金额单位：分） */
export interface BalanceView {
  /** accBal：钱包 + 补贴合计 */
  balanceFen: number;
  walletBal: number;
  subsidyBal: number;
  accStatus: string | null;
  accName: string | null;
  custNum: string;
  note: string | null;
}

/** 本人账单一行 */
export interface MyOrderItem {
  id: string;
  passCode: string;
  /** 摊位名称（按 pass_code 关联 stall_config） */
  stallName: string;
  /** 付款人显示名：家人付款用家人名，本人付款用员工名 */
  payerName: string;
  /** 归属员工姓名 */
  employeeName: string;
  /** 员工工号 */
  custNum: string;
  amountFen: number;
  /** 扣款后余额（分），上游未回传时为 null */
  balanceAfterFen: number | null;
  /** SUCCESS / FAILED / UNKNOWN / INIT */
  status: string;
  macOrdId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface RefundInfo {
  refundMacOrdId: string;
  amountFen: number;
  createdAt: string;
  /** 退款申请人填写的备注 */
  remark: string | null;
  /** 待摊主确认 / 已同意 / 已拒绝 */
  status: RefundStatus;
  /** 摊主拒绝原因（仅 REJECTED 时可能有值） */
  decisionNote: string | null;
}

/** GET /api/me/order/:id */
export interface MyOrderDetail extends MyOrderItem {
  /** 支付台账主键，退款登记入参 */
  paymentLedgerId: number;
  refund: RefundInfo | null;
  refundable: boolean;
}

/** GET /api/me/orders */
export interface MyOrdersView {
  items: MyOrderItem[];
  balanceFen: number | null;
}

/** POST /api/refund/apply */
export interface RefundApplyRequest {
  paymentLedgerId: number;
  /** 退款原因，1–200 字，落 refund_ledger.remark */
  remark: string;
  /** 家人端凭 share token 代为登记（匿名），与登录态二选一；员工端不传 */
  familyShareToken?: string;
}

export interface RefundApplyResult {
  /** 员工/家属登记为 REGISTERED；管理员登记直接 APPROVED */
  status: RefundStatus;
  refundMacOrdId: string;
  amountFen: number;
  note: string;
}

/** GET /api/stall/orders?s=&date=today */
export interface StallOrderItem {
  id: string;
  amountFen: number;
  paidAt: string | null;
  macOrdId: string | null;
  /** 付款人姓名（员工姓名，家人代付时同为员工归属） */
  payerName: string;
  /** 当日第几笔（按时间升序） */
  seq: number;
}

export interface StallOrdersView {
  stallName: string;
  passCode: string;
  orders: StallOrderItem[];
}

/** POST /api/family/manage */
export interface FamilyManageRequest {
  action: 'create' | 'disable';
  familyName?: string;
  relation?: FamilyRelation;
  familyId?: number;
}

export interface FamilyManageResult {
  familyId: number;
  shareToken?: string;
  /** 前端用 resolveAppUrl(sharePath) 转完整链接 */
  sharePath?: string;
  status?: string;
  familyCount?: number;
}

/** GET /api/family/context?f= */
export interface FamilyContextView {
  familyName: string;
  /** 归属员工姓名 */
  payFor: string;
  balanceFen: number | null;
  note: string | null;
}

/** GET /api/family/orders?f= ：家人视角全家账单（匿名，凭 share token） */
export interface FamilyOrdersView {
  balanceFen: number | null;
  items: MyOrderItem[];
}
