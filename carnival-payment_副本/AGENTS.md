# 家年华支付 · AGENTS.md

## 应用概览

小鹏家年华活动支付 H5 应用：员工/家人凭工卡余额在摊位扫码消费。

- 技术栈：React 19 + Tailwind + NestJS + Drizzle（schema 见 `server/database/schema.ts`）
- 前端页面：`client/src/pages/{employee,family,merchant,admin,common,connectivity}`，共享视觉层在 `client/src/components/jnh/`
- 运维工具：`/connectivity`（不入主导航）LEOPEN 链路诊断页，服务端 `server/modules/leopen`：一键探测小鹏网关 DNS→TCP→TLS→HTTP 全链路，结果落 `leopen_probe_log`，trace-id 供小鹏运维查网关日志；凭证读取 env（appid/appsecret）优先、app_config（leopen_appid/leopen_appsecret）兜底，appsecret 永不回显
- 探测支持四接口切换（页面统一名称：工卡扣款 / 订单状态查询 / 钱包余额查询 / 查询用户信息）：`pay/device`（工卡扣款，真实扣款接口；与余额同链路用工号换真实 `custId`，页面发起前二次确认；content 六字段且 **key 必须严格 ASCII 升序**：`amount`→`custId`→`macOrdId`→`machineSn`→`nuClearMode`→`ordTime`（服务端按同规则重序列化后验签，顺序不符必返 `100042`）；`amount` 单位分、探测默认 0（2026-10-26 实测 0 元下单 `code=10000`、`realAmount=0`、余额三项不变，不扣员工钱）、`nuClearMode=2`、`macOrdId` 每次请求新生成 `JNH1128-0001-<ts>`、`machineSn` 必须是已注册设备序列号 `5m6665785`（传设备名会返 `40004 设备不存在`）、`ordTime` 取北京时间 `yyyy-MM-dd HH:mm:ss`；真实扣款案例（`amount=1`）返回 `ordId`/`ordQrCode`/`mealCode`（`mealCode` 随交易递增非固定值），工号 22309 → `custId=489273400569634816`；四接口完整出参、坑与实测报文见根目录 `乐牛接口说明（包括实际案例）.md`）、`order/state/query`（订单状态查询，只读；扣款超时后确认结果、防重复扣款；content 单字段 `{macOrdId}`，探测入参可指定单号，缺省查首次扣款成功单 `JNH1128-0001-1792999666248`；实测该单返 `code=10000`、`payState=3`、`ordState="1"`、`realAmount="1"`、`ordId=638624501982044161` 与扣款返回一致）、`account/balance/query`（钱包余额查询，先用同一工号查 `customer/query` 换取真实 `custId` 再查，传 mobile 会报 40004；实测返回真实余额 walletBal / subsidyBal / accBal，单位疑为分）、`customer/query`（查询用户信息，按工号分页查询）；所有请求路径统一带 `/tengyun-api` 前缀（实际请求 `https://anniversary-homefair-api.x-peng.com/tengyun-api/leopen/...`，去掉该前缀整站返回 25B「无权限访问该页面」）；业务成功码同时存在 `0` 与 `10000`；实测 `order/state/query`、`customer/query`、`account/balance/query` 签名校验通过，`pay/device` 恒定返回 `100042 签名错误`（content 字段口径与其他接口不同，待小鹏确认）；version 四接口统一 `5.43.4.12`（`PROBE_VERSION`，2026-10-26 15:57 全量复验四接口均返 `code=10000`；`1.0.0` 历史亦通过，服务端不校验 version 白名单，version 只参与签名拼接；`PROBE_TARGETS[target].version` 保留接口级覆盖能力），结果记录 `target`/`targetPath`
- IP 展示：`GET /api/leopen/netinfo` 返回解析目标 IP、本实例网卡 IP（`localIp`）、公网出口 IP（`egressIp`，回显服务可得时才有）；每次探测记录 `remoteIp`（TCP 对端）、`sourceIp`/`sourcePort`（本端 socket 地址，沙箱出网经本地代理故为 169.254.x.x）、`egressIp`。出口 IP 为动态池（实测 101.126.x / 115.191.x / 180.184.x 轮换），白名单不可依赖它；取不到的字段整行隐藏
- 页面壳：`AuroraShell`（顶栏 + 内容 + 底部固定区）；组件套件：`kit.tsx` / `interactive.tsx` / `BillSection.tsx` / `AmountKeypad.tsx` / `PaymentQR.tsx`，样式集中在 `jnh.css`
- 功能红线：不因视觉改动触碰业务逻辑、数据流、路由与状态管理

## 业务接口层 · 乐牛四接口融合（2026-10）

服务端已把乐牛四接口封装为业务能力；前端 H5 已全链路切到新接口——适配层 `client/src/api/index.ts` 内做字段映射，页面与交互零改动。旧 `/api/payment/prepare|checkout`、`/api/employee/bill*`、`/api/family/:token/bill*` 保留但已无前端消费；`/api/payment/stall-feed` 仍被摊主到账轮询使用（数据源已切 payment_ledger）。

- 运行时客户端 `server/modules/leniu/leniu.client.ts`（`LeniuClient`）：签名 `server/common/utils/leopen-sign.ts`，凭证 env `appid/appsecret` 优先、`app_config` 兜底，超时 5s，成功码 0/10000
- 识人 `server/modules/identity/identity.service.ts`：`resolveEmployee`（miaoda_user_id → 工号，无映射 4004）、`resolveFamilyPayer`（家人 token）、`resolveCustId`（工号 → 乐牛 custId，库里为空则 customer/query 反查并异步回写 `employee_card_map.leniu_cust_id`）、`queryBalance`
- 付款页上下文：`GET /api/pay/context?s=<stallToken>&f=<家人 token>`（付款页初始化：摊位 + 付款人 + 支付密码态，不查乐牛余额（`balance` 恒 null，余额预检在 `precheck`）；不校验金额、不落流水；摊位无效 `INVALID_STALL` / 窗口外 `OUT_OF_WINDOW` / 身份解析失败 `NEED_IDENTITY`，前端据此进对应态；`cardLast4` 取工号后 4 位）
- NEED_IDENTITY 员工授权入口（2026-11）：飞书内首次扫码（无家人 token、未登录）时付款页探测员工登录态（`apiEmployee.session({ autoJumpToLogin: false })`，`client/src/api/index.ts` 的 `request` 工具透传平台 `meta.autoJumpToLogin`，关掉 401 自动跳登录防匿名被劫持去 OAuth）；未登录自动发起飞书授权（`redirectToLogin()` 回跳原页后直接进金额键盘），`sessionStorage` 标记 `jnh_pay_autologin` 每标签页只自动跳一次防取消授权回跳死循环，探测到 `loggedIn` 后清标记，「飞书授权登录」按钮保留为兜底（手动点击同样先写标记）；过渡期（探测中 + 自动跳转中）只渲染一行「正在识别中」极简态（`autoJumping` state，effect 用 `useLayoutEffect` 保证探测完成那一帧引导卡不会被绘制），引导卡与按钮只在兜底与已登录分支渲染；已登录未绑卡显示去 `/employee` 绑卡引导；已绑卡但缓存家人 token 失效显示失效文案 +「清除失效家人身份」按钮（`clearFamilyPayer()` 后刷新，URL `who` 失效则只提示重新分享）；微信 UA（MicroMessenger）跳过探测不显示入口，家人路径零影响
- 支付：`POST /api/pay/precheck`（校验摊位/金额/身份 + 回显余额，返回 `commonKey`，不落流水）→ `POST /api/pay/confirm`（写 `payment_ledger` INIT → pay/device；验签层错误 100013/100032/100042 原单号重发 ≤2 次，超时/网络异常不重发先查单；三态 SUCCESS/FAILED/UNKNOWN；UNKNOWN 不重扣，凭同一 `preCheckMacOrdId` 重提复用同单）
- 账单：`GET /api/me/balance`、`GET /api/me/orders`、`GET /api/me/order/:id`（列表对 INIT/UNKNOWN 最多 5 条并行查单懒补偿）；家人端 `GET /api/family/orders?f=`、`GET /api/family/order/:id?f=` 复用 MeService，与员工端同结构，前端适配层映射成原 `BillResponse`/`BillDetailDTO`
- 员工端旧接口余额：`GET /api/employee/identities` 的 `balance` 已接乐牛实时值（元，`balanceFen / 100`），链路为 `employee_card_map.leniu_cust_id` 直接查 `account/balance/query`，该列空时 `customer/query` 按工号反查并异步回写；查询失败 `balance = null`，前端显示 `--` 而非 ¥0.00。`/api/employee/bill` 保留但前端已改走 `/api/me/orders`（适配层映射），我的码页账单有真实记录
- 退款摊主审批流（2026-11）：三态状态模型 `REGISTERED`（待摊主确认）/ `APPROVED`（已同意）/ `REJECTED`（已拒绝），标签集中在 `shared/api.interface.ts` 的 `REFUND_STATUSES/REFUND_STATUS_LABELS`；`refund_ledger` 新增 `decided_by/decided_at/decision_note` 三列，`payment_ledger_id` 唯一性改为部分唯一索引（`WHERE status <> 'REJECTED'`，索引名 `refund_ledger_payment_ledger_id_active_uk`）允许拒绝后重新申请、拒绝历史保留。申请 `POST /api/refund/apply`（入参 `paymentLedgerId + remark`，家人凭 `familyShareToken` 匿名登记，`initiated_by` 记 `family:<家人身份ID>`；单号 `JNH1128R-<passCode>-<7 位台账 id>-<北京时间 HHmmss>` 时序后缀，重申不撞 `mac_ord_id_uk`）；待审行或已同意行存在时幂等拒绝。摊主审批 `GET /api/merchant/refund/pending`（登录态 + 绑定口令，按 `refund_ledger.pass_code = 绑定 pin` 过滤 REGISTERED）+ `POST /api/merchant/refund/decide`（`{refundMacOrdId, decision: APPROVED|REJECTED, rejectReason?}`，原子 UPDATE 状态流转）；前端 `useRefundApprovals.ts` 3 秒轮询弹 `RefundApprovalDialog.tsx` 审批弹窗（同意/拒绝二选一，无稍后处理，待审批单持续提醒直到处理）。管理员后台登记直接 `APPROVED`（`RefundService.register(initialStatus)` 参数，跳过摊主审批）。员工/家人视角：`me.service.orderDetail` 优先展示非拒绝行，仅拒绝行时展示最新拒绝行并恢复 `refundable`；账单详情拒绝后显示拒绝原因且「申请退款」按钮重现
- 摊位：`GET /api/stall/orders?s=<stall_config.static_token>`（北京时间当日成功单）
- 摊位口令（2026-11 随机化）：`stall_config.pass_code` 由库端 `gen_stall_pass_code()` 生成（62 字符集随机 4 位，区分大小写），**不再来自 Base**；Base 新增「摊主编码」同步到 `merchant_code`，绑定页/收款码页/台账/付款页的「摊号」一律展示 `merchant_code`（服务端 `stallNo` 已切，空则兜底 passCode）。摊主绑定 `POST /api/merchant/bind` 校验 `^[0-9a-zA-Z]{4}$` 后按 pass_code 精确匹配（大小写敏感，仅 ACTIVE）；口令发放唯一出口是 AdminPage「摊位口令」tab（`GET /api/admin/stalls`，AdminGuard，按 merchant_code 排序），前端用 `PassCodeKeypad` 三档键盘输入；换码 = 库端重生成 pass_code，收款码 static_token 与家人付款链接不变，旧口令自动失效
- 员工首登欢迎消息（2026-11）：`POST /api/pay/first-login-notify`（@NeedLogin）：员工首次扫码飞书授权成功后给本人发欢迎卡片（引导进员工端）。防重标记 `employee_card_map.welcome_pushed`（默认 false，Base 同步映射不含此列），原子条件 UPDATE 占位先行（0→1 成功才发，发送失败不回置——绝不重复优先）；插件实例 `siqing_carnival_payment_welcome_message_1`（send_feishu_message），**receiverIds 直接传妙搭 userId**（插件内部做视角转换，传 open_id 会报飞书 10003 user invalidate）；员工端深链 `https://<req.hostname>${CLIENT_BASE_PATH}/employee`，hostname 空时兜底 app_config 的 `stall_writeback_base_url`。前端触发点在 PayPage `load()`：prepare 返回 OK 且非家人 token 且非微信且 sessionStorage 存在授权自动登录标记（`jnh_pay_autologin`）时 fire-and-forget 调用，catch 只记日志不阻塞
- 摊主台账导出：`GET /api/merchant/ledger/export`（登录态）：服务端复用 `ledger()` 拼 CSV（\uFEFF BOM + 标准转义，北京时间 HH:mm）经 `FileService.upload` 落应用文件存储，返回 `{ downloadUrl }`；前端 `a[href]` 直接打开触发下载。**禁止回退到 Blob + a[download] 方案**（飞书 webview 无法下载 blob URL，已在 2026-10-30 废弃）。**防堆积（2026-11-02）**：应用文件存储有文件数量级上限（实测 5 个即触发，与字节无关，配额 2.36TB 仅用 2.2KB 也会被拒），超限后整桶只读保护（错误码 400000006），清空文件也要**次日**才恢复写入；因此导出采用「删上一份再上传」——`app_config` 按 `ledger_export_path_<pin>` 记每摊位上次导出 path，导出时先 `fileService.remove` 旧文件（失败仅 warn 不阻塞）再上传新文件并 upsert 记录，每摊位恒保留最近 1 份
- 摊主到账轮询：`GET /api/payment/stall-feed?after=` 已切 `payment_ledger`（SUCCESS + paidAt 游标，批量回填 family_identity / employee_card_map 付款人姓名）
- 家人：`POST /api/family/manage`（create/disable，sharePath `/f/<token>`，status 用小写 active/deleted，is_self 不可作废）、`GET /api/family/context?f=<token>`（匿名）
- 业务码 `PayflowCode`：4001 摊位无效 / 4003 金额格式 / 4004 无工卡映射 / 4005 家人令牌无效 / 4006 不可退 / 4007 超 500 元 / 5000 上游异常，经 `CodedBusinessException` 原样透出 `error.code`；金额上限 500 元、pay/device 超时 5s 为 `pay.constants.ts` 常量

## 员工工号绑定（2026-10）

工号唯一来源是多维表格同步的 `employee_card_map`，员工不能自建工号行。员工登录后该表 `miaoda_user_id` 为空时，员工端 `/employee` 先自动认领，认领不到再展示工号绑定面板（`client/src/components/jnh/BindCardPanel.tsx`）。

- `POST /api/employee/bind-card`（登录态）：入参 `{ custNum }`。依次校验 工号存在（404）→ 工号已被他人绑定（409）→ 姓名与登录账号匹配（403，已绑当前账号时跳过）→ 当前账号已绑其他工号（409）；通过后写 `miaoda_user_id`，并用 `AuthNPaasService.getBatchOpenIds` 反查回填 `open_id`，响应 `{ card, openIdBound }`
- 首次绑定用 `WHERE cust_num = ? AND miaoda_user_id IS NULL` 原子更新，避免并发抢绑；一个账号只能绑一个工号（`employee_card_map_miaoda_user_id_uk`）
- 姓名比对忽略空白与大小写、双方互相包含；不一致时提示联系现场项目组
- 首次进入自动认领 `POST /api/employee/auto-bind`（登录态，无入参）：当前账号已绑定则幂等返回；否则按登录姓名归一化后严格相等匹配 `miaoda_user_id IS NULL` 的行，唯一命中才绑定并反查 `open_id`；多行同名返回 `AMBIGUOUS`、无同名返回 `NO_MATCH`，前端回退工号面板。前端在认领请求结束（`autoBindDone`）前只显示骨架，避免面板闪现
- 自动补齐 `EmployeeAutomationService.syncIdentity(custNum)`：行内已有 `open_id` 先经 `getBatchMiaodaUserIdsByOpenIds` 转换；缺失则调 `EmployeeDirectoryService.resolveByCustNum` 按工号搜平台通讯录，取 `miaodaUserID` 并用行内 `employee_name` 严格校验姓名，命中后 `getBatchOpenIds` 反查 `open_id` 一并写回。返回 filled / skipped / unresolved / not_found / conflict
- 零飞书凭证（2026-10-28）：搜人能力来自 `AuthorizationSDK.search`（`@lark-apaas/nestjs-authzpaas`，路径 `/v1/app/{appId}/account/search`，由 `AuthZPaasModule.forRoot()` 以 global 模块提供，`app.module.ts` 已注册）。原 `FeishuService` 与 `@larksuiteoapi/node-sdk` 已删除——工号不是飞书 employee_id，按工号直连飞书通讯录本就查不到，且需企业自建应用凭证
- 搜索是关键词模糊匹配，`SearchUserEntity.employeeID` 不是工号（22309 的 employeeID 为 `7022864343473651716`），禁止用它精确过滤，必须靠姓名归一化严格相等收敛；搜索结果无 `miaodaUserID`（未开通妙搭账号）按 not_found 处理
- 转换失败口径：搜不到唯一同名账号 / open_id 转换未命中 → 记 warn、行保持空、不重试；目标账号已绑其他工号记 warn 跳过（防撞 `employee_card_map_miaoda_user_id_uk`）；写入带 `miaoda_user_id IS NULL` 条件防并发覆盖
- 触发器（2026-10-28）：`employee_card_map_row_inserted`（record_change INSERT）+ `employee_card_map_cust_num_updated`（record_change UPDATE，`fields:["cust_num"]`）均 Active=true，事件里取 `after.cust_num` 调 `syncIdentity`。任务只写 `open_id` / `miaoda_user_id`，不碰 `cust_num`，不会自触发
- 手动兜底：`employee_card_map_backfill` 触发器（cron 30 分钟）已停用，`backfillMiaodaUserId()` 方法保留，需要时手动触发全量补扫
- record_change 只在线上已发布版本触发，开发态改数据不会触发任务；逻辑验证走 service 方法直接调用

## 家庭支付密码与冻结（2026-10，员工级共享）

家庭支付密码是**员工维度共享一个密码**（`employee_pay_secret` 表，`employee_user_id` 唯一），同一员工的所有家人共用；连续错 5 次冻结，仅员工端可重置/解除。家属端不提供改密入口与按钮。`family_identity` 的密码列保留但不再读写。

- 存储：`employee_pay_secret.pay_password_hash` 存 `scrypt$<salt>$<hash>`（`crypto.scryptSync` + `timingSafeEqual`），另有 `pay_password_fail_count` / `pay_password_locked_at` / `pay_password_updated_at`；明文不入库、不接口回显。RLS：authenticated 员工读写自己行；anon SELECT + UPDATE（家人端读状态、付款失败计数/冻结累加）
- 服务 `server/modules/family-pay-password/pay-password.service.ts`：员工级（employeeUserId）——`verifyPayment`（未设置 4008 / 已冻结 4010 / 错误 4009 且提示剩余次数；未传密码按需输入处理不计错）、`setPassword`（设置/重置，scrypt upsert）、`unlock`（清零次数与冻结，不改密码）、`readState`/`hashPin`；阈值 `PAY_PASSWORD_MAX_FAILS = 5`
- 付款链路：`GET /api/pay/context` 返回 `passwordRequired` 与 `code=PASSWORD_NOT_SET|PASSWORD_LOCKED`；`POST /api/pay/verify-password`（`{familyShareToken,password}` → `{ok,remainingAttempts,locked,message}`）预校验；`POST /api/pay/confirm` 在落流水前再次 `verifyPayment`。员工本人 `isSelf` 免密
- 员工端路由（无 `:id`，员工级）：`POST /api/employee/pay-password`（设置/重置，`{payPassword}` → `{payPasswordSet}`）、`POST /api/employee/pay-password/unlock`（解除冻结）；`GET /api/employee/identities` 撤销行级字段，改为顶层 `familyPayPassword: { payPasswordSet, payLocked }`
- 家人端：`GET /api/family/:token` 回 `isSelf` / `payPasswordSet` / `payLocked`（读自员工级记录）；无改密接口
- 业务码：4008 `PASSWORD_REQUIRED` / 4009 `PASSWORD_INVALID` / 4010 `PASSWORD_LOCKED`（`payflow-code.ts`）
- 前端：员工端 `EmployeeGatePage`「家庭支付密码」管理卡（去设置/重置/解除冻结，状态取 `list.familyPayPassword`）；创建家人与分享页不再要求/展示按身份设置密码，分享页仅顶部提示未设置时家人暂无法付款；家人页 `FamilyPasswordCard` 只读（未设置/冻结提示、正常时说明由员工端管理）；`PayPinFields` 随机生成仅用于员工端管理卡；付款页确认后进入 6 位密码键盘（复用 `AmountKeypad decimal={false}`，满 6 位自动校验，通过后才扣款，冻结/未设置直接进提示态）

## 付款页金额输入（2026-10 空态起步 + 临时放开 0 元）

- 单位：页面输入元（整数最多 5 位、小数最多 2 位）；适配层 `client/src/api/index.ts` 统一 `toFixed(2)` 后以 `amountYuan` 字符串提交，服务端 `pay-amount.ts` 的 `parseAmountFen` 用 `Math.round(yuan * 100)` 转分，该值一路透传到乐牛 `pay/device` 的 `amount`，链路中无二次换算
- 空态起步：`PayPage` 金额 state 初始为空串，`AmountKeypad.applyAmountKey` 清零与退格删空都回空串、空态按「.」得 `0.`；`isAmountSubmittable` 接收金额字符串且拒绝空值，空态不渲染「确认付款」按钮，必须至少按一次数字键
- 0 元提交（临时期）：`PayPage.tsx` 顶部 `ALLOW_ZERO_AMOUNT = true` 放开 0 元单。0 元会以 `amount: 0` 请求乐牛并生成真实订单（`realAmount=0`、余额不变、占用 mealCode 序号），本地落一条 `payment_ledger` SUCCESS 零元流水，摊主端流水显示 `+¥0.00`；正式活动前改回 `false` 即恢复「金额必须大于 0」，无需改其它代码
- 上限 500 元（`PAY_AMOUNT_LIMIT_FEN = 50_000`），超限返回 4007

## 多环境数据库与匿名链路权限（2026-10-28 事故后约定）

家人端（`/f/<token>`、`/pay?s=`）在微信里没有飞书登录态，所有请求落到 anon 角色；员工端落 authenticated。**anon 不是"能读就能写"，必须显式给 UPDATE policy**，否则写库语句影响 0 行且不报错。

- `payment_ledger`：`匿名支付写入`（INSERT, with_check true）+ `匿名支付状态回写`（UPDATE, `USING status IN ('INIT','UNKNOWN')` / `WITH CHECK status IN ('SUCCESS','FAILED','UNKNOWN')`）。限制只能把未终结单推向终态，不能改金额、不能回退
- `family_identity`：`匿名改密与计数`（UPDATE, `USING/WITH CHECK status='active'`），家人端改密与支付密码错误计数依赖它
- 新增任何在家人端（匿名）被写入的表，必须同时配 INSERT 与 UPDATE policy，否则会出现"外部侧成功、本地没记上"
- 线上（online 分支）禁止直接 DDL/DCL，结构变更走：dev 建 → `+db-env-diff` 预览 → `+db-env-migrate --yes`
- 状态回写防御：`finalizeLedger` 更新 0 行且读回仍为 `INIT/UNKNOWN` 时记 error 日志（`支付状态回写未生效`）；`toConfirmResult` 将 `INIT` 归为 `UNKNOWN`，前端显示「扣款结果待确认」并隐藏"重新付款"引导，避免诱导重复支付

## 设计规范 · v8「墨林」（2026-11 换墨绿：页面仍浅、主卡与主按钮深森林墨绿、字号小一档沿用）

### 场景约束

- 产品定位：员工和家人在活动现场用手机扫码吃饭付款，用起来像**递出工卡买单**那样利落，而不是又一个活动落地页
- 应用类型：消费类应用（付款/收款主流程）+ 业务工具（台账、审批、运维后台）；理由是现场一次性扫码付款、页面以金额与操作为主角
- 使用者与场合：员工在摊位前单手操作、家人用微信在嘈杂现场付款、摊主在桌边看码与流水
- 视觉主角：每页只有一个——付款页是金额、员工端是工卡余额、摊主页是收款码、台账页是今日收入
- 信息密度：低；一屏一件事，说明文字每屏最多一行、不超过 20 字，能删的说明直接删
- 页面结构：轻量顶栏（品牌标识 + 页名 / 副标题）+ 单列大卡 + 固定底栏主操作；无全局导航
- 用户风格原话：「整体布局都不好看，感觉很小气，很多排版和分点也不清楚，要符合互联网产品的 UI 设计，有质感」；「绿色我想要用图片中的绿色和橙色，参考一些设计元素，然后整体做一些移动端的调整，但不要改变我的支付逻辑」（v4 荧光绿方案已作废）；2026-11 追加：「颜色不好看，整体没有质感，所有的按钮都没质感，然后文字设计也没有」；2026-11 再追加：「可以参考下logo，该下颜色，页面可以在简洁一点。然后如果涉及场段落，可以做一些缩减/换行」；2026-11 v7 追加：「颜色太深了，我想要在浅一点，有质感，然后像是那种卡一样，所有的文字都可以模块化，字体可以适当缩小」「logo就帮我改成上一版我发你的12th，要有一些设计感」→ 页面浅一档、文字小一档；主卡保持深色但有光泽浮光；信息一律「标签 + 值」成块；品牌换 12th 字标（顶栏小标 + 页面大标）；2026-11 v8 追加：「还是用绿色吧，墨绿，有质感」并确认「浅底不变、主卡与主按钮换墨绿」「深森林墨绿，接近黑绿」；2026-11 logo 追加：「logo 不好看，整体调整一下」并选择「撤掉图片改清晰文字标」「页内去掉深色方块改横排标识」「只重做品牌区」；2026-11 logo 再追加：「不好看，完全不好看这个 12th，没有任何设计感」→ 弃文字排版，改几何斜切 12 + 细笔画上标 th 的矢量标记
- 应用身份：展示；顶栏 = 12th 矢量标记 `BrandGlyph`（高 18、无 th 简化形、`--jnh-ink`）+ 竖向发丝分隔 + 页名；页内大标 = `BrandMark`，标记（高 = size×0.46，含上标 th）+「家年华」小字（size×0.16 且 ≥12px、字距 .14em、`--jnh-ink-muted`），`size < 56` 只出标记。全站只此两处，不重复应用名；不得用位图、不得用字体排版冒充标志，禁止自造其它图标或摩天轮

### 视觉方向：墨林

（内部代号，不得出现在任何界面文案里）页面像一张摊开的浅绿灰信纸，主卡则像一枚压在纸上的深森林墨绿金属会员卡：底色仍是浅纸白、文字放松，墨绿只留在卡面与主操作上；卡面有一道斜向光带缓慢掠过，是唯一的动效记忆点。

### 色彩令牌（jnh.css :root）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--jnh-canvas` | `hsl(150,12%,97.2%)` + 顶部 3% 墨光 | 页面底色（绿灰纸白） |
| `--jnh-surface` | `#fff` | 卡片 / 顶栏 / 底栏 |
| `--jnh-hairline` | `hsl(150,8%,89.8%)` | 卡片描边、行分隔 |
| `--jnh-ink` / `-muted` / `-subtle` | `hsl(158,14%,16%)` / 155 8% 43% / 155 7% 56% | 主 / 次 / 辅助文字（墨林近黑绿） |
| `--jnh-primary` / `-top` | `hsl(158,32%,17%)`（hover 21% / active 13%，顶部高光 24%） | **主操作底、选中底**，配白字（深森林墨绿） |
| `--jnh-on-primary` | `#fff` | 深底上的文字与图标 |
| `--jnh-brand` | `hsl(150,40%,30%)`（deep 21%，soft 93.5%） | 只在点睛处：图标、链接、状态点 |
| `--jnh-strong` | `hsl(150,38%,26%)` | 白底上的链接 / 小型强调文字 |
| `--jnh-accent` | `hsl(22,72%,45%)`（ink 33% / soft 95%） | 金额高亮、警示，极少量 |
| `--jnh-hero-accent` | `hsl(80,20%,92%)` | 深色卡上的金额（奶白） |
| `--jnh-deep` / `-deep-2` / `-deep-3` | `hsl(158,30%,18%)` / `hsl(160,36%,10%)` / `hsl(156,26%,14%)` | 深卡三段渐变、付款码 / 扫码深底（墨绿） |
| `--jnh-sheen-1` / `-2` | `rgba(255,255,255,.14)` / `rgba(255,255,255,.03)` | 卡面斜向光带两层 |
| `--jnh-kv-bg` / `--jnh-kv-radius` | `hsl(150,12%,96.6%)` / `14px` | 标签-值模块 |
| `--jnh-success` / `-warning` / `-danger` | 150/40%30% / 22/72%45% / 356/66%48% | 状态信号（绿 / 橙 / 红） |

- 分工：墨绿只做「可点」的底与深卡，点睛绿只做彩点（图标、状态点、链接），橙只做金额与警示；主色 L17% 与点睛绿 L30% 拉开两档明度，不得混用；光带只出现在深卡与品牌标牌，且永远压在内容之下（`.hero-card > *` 提层）
- 深底上必须白字；绿色不做大面积背景、不做 14px 以上正文的底；荧光绿（色相 80–90、明度 >45%）全站禁用
- shadcn 语义层同步：`--primary` `hsl(158 32% 17%)` + `--primary-foreground` 白、`--accent` 淡绿底、`--ring` 绿、`--background` `hsl(150 12% 97.2%)`、`--radius` 1rem；charts 为墨绿 / 绿 / 橙红
- 任何 UI 元素禁止蓝色系

### 字号与间距刻度（页面禁止写任意值）

- 字体栈 `--jnh-font` 系统字体（苹方/鸿蒙/MiSans）；禁止外链字体；品牌标记为矢量路径，不依赖任何字体
- 字号（v7 比 v6 小一档）：`.t-micro` 10/14（仅角标）· `.t-caption` 12/18 · `.t-body` 14/21 · `.t-title` 15/23 600 · `.t-heading` 17/25 600 · `.t-subhead` 20/28 600 · `.t-display` 26/33 600 · `.jnh-money` 34/40 600；数字统一 `.jnh-num`，大数字字距 -0.03em
- 间距：页边距 20（`px-5`）· 卡间距 16 · 卡内 20 · 分组标题下 10 · 列表行 60（`.row`）/ 68（`.row-lg`）
- 圆角：卡 20（大卡 24）· 内块与标签-值模块 14 · **按钮 14** · 胶囊 999（仅 chip）；付款码白区仍为直角





### 形状与深度

- 卡片 = 纯白 + 1px 发丝描边 + `--jnh-shadow-sm`（`0 1px 2px` + `0 16px 36px -22px`，更柔更浮）
- hero 卡（余额 / 身份 / 收款码）= 墨绿丝光：三段渐变（`--jnh-deep` → `-deep-2` → `-deep-3`，150deg）+ 右上绿柔光球 + 斜向光带 `::before`（`--jnh-sheen-1/-2`，18s 缓慢横移，`mix-blend-mode: screen`）+ 1px 白色 10% 描边 + `--jnh-shadow-hero`（含 `inset 0 1px 0` 内高光）+ 白字；卡内次要按钮 `.hero-quick-item` = 实心白底墨字；金额用 `--jnh-hero-accent`
- 品牌标识无底块、无阴影：文字标直接落在画布上，不参与卡片视觉层级
- 唯一直角例外：付款二维码白色码区保留直角

### 结构模式（页面只用这些原语，不自拼 padding）

- 顶栏：白底 92% + `backdrop-blur` + 底部发丝线，高 56；左侧 12th 矢量标记（高 18、无 th）+ 竖向发丝分隔 + 页名 `.t-title`，副标题 `.t-caption` muted
- 分组：`.group`（内含 `.group-head` + `.group-title` 14/600 + `.group-action` 12/600 主色），卡间 20、组内 10；一屏 2–4 组
- 列表行：`.row`（60）/`.row-lg`（68），`.row-icon` 44px 圆角块 + `.row-title` 14/600 + `.row-sub` 12 muted + `.row-value` 14/600 右侧 + chevron 16
- 标签-值模块：`.kv-grid`（2 列，可 `.kv-grid-3`；`.kv-wide` 跨满）+ `.kv` 浅底圆角 14 + `.kv-label` 11 muted + `.kv-value` 14/600；深卡内用 `.kv--hero`（白 8% 底 + 白 12% 描边，标签白 60%）
- 主操作：固定底栏 `.shell-bottom` + 52px 墨绿渐变主按钮（圆角 14、顶部内高光 + 落地阴影；hover 提亮、active 收高光）；内容区 `pb-32`；页面内不再用虚线按钮当主操作
- 提示：`.note`（12px muted + 16px 主色图标），不再用漂浮胶囊当提示条；状态用 `.chip`（11px / 22 高）/ `.chip-brand` / `.chip-warn` / `.chip-ok`
- 指标：`.stat-grid` 三列，值 `.stat-value` 15/600 + 标签 `.stat-label` 10 muted，中间发丝竖线
- 状态可视化：未设置 = 橙红点；冻结 = 红点；正常 = 星际绿点（`PasswordStatePill` 唯一实现，文字一律 `--jnh-strong`）
- 移动端：主按钮 52 高、列表行 60 / 68、卡圆角 20（大卡 24）、内块 14、底部安全区 12+env(safe-area)，页面宽度上限 520

### 动效

- 微交互 120ms `cubic-bezier(0.2, 0, 0.38, 0.9)`，重要时刻 260ms `cubic-bezier(0.4, 0.14, 0.3, 1)`；卡面浮光 18s linear 无限循环；全部尊重 `prefers-reduced-motion`（光带在该模式下静态）
- 按压用背景切换不用 scale；扫码激光线呼吸动画保留

### 页面实现约束

- 版式重排允许新增结构性 DOM（分组标题、底栏 CTA、说明行、图标容器、指标列）与结构性文案（分组名、「本人」标、说明标题）；业务逻辑、接口、路由、状态机、业务文案与按钮动词一字不改
- 间距：页边距 `px-5`、卡内 `p-5`、卡间 20、组内 10；并列元素用 `gap`，禁止随手 `mt-3` 叠间距
- 正文不低于 14px、列表行不低于 60px；10px 只用于 chip / 指标标签等角标，不用于正文
- 颜色只用 `var(--jnh-*)` 或语义 token，禁止新写 `hsl(...)`/十六进制字面量；禁止蓝色与橙色装饰
- 图标只用 lucide-react（`client/src/components/jnh/icons.tsx`），20px 跟字、容器 44px
- 一行文字不换行不贴边；金额、工号、单号一律 `.jnh-num`

### 不要做

- 不要蓝色系、不要 emoji 图标、不要把橙红铺成大面积底色、荧光绿一律不用（主操作只走墨绿）
- 主色不得回到橄榄灰：墨绿只用于深卡与可点主操作，不铺成浅色大面积底；点睛绿（L30%）与主色（L17%）不得互换
- 品牌标识只用 `BrandGlyph` 矢量路径（`icons.tsx`：几何斜切 12 + 细笔画上标 th，viewBox 108×56）与 `.brand-name` 中文小字，不得用位图、不得用字体排版冒充标志、不得加底色方块/阴影/角点、不得自造其它图标或摩天轮
- 说明文字不堆叠：一段说明最多一行、不超过 20 字；同一信息不在卡片内外重复；说明卡能压成一句 `.note` 的就不单独成卡
- 不要把提示塞进漂浮胶囊、不要用小字号压信息密度、不要同尺寸卡片平铺无分组
- 不要动功能逻辑、路由、状态与业务文案

## 员工首页明暗模式（用户确认）
- 浅色模式采用原员工首页2的橙黄绿票面风格；暗色模式采用原员工首页1的深色橙绿弥散卡片。
- 两种模式共用 EmployeeGatePage，禁止复制页面分别维护布局。
- 后续排版、字号、间距、内容及操作调整必须同步；配色和材质可按模式独立设置。
- 预览栏仅保留一个员工首页入口，通过明暗模式按钮切换。旧 /employee2 重定向到 /employee。
