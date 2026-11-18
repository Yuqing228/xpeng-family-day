# 项目记忆 · 家年华支付

## 视觉基线 v8「墨林」（2026-11-17，取代 v7 浮光墨卡）

- 2026-11-17：曾按附件《琥珀科技》改成 v9 暗色控制台（近黑底 + 玻璃暗卡 + 橙辉光 + Orbitron），提交后用户要求撤回，已 `git revert` 整体回退。**结论：维持 v8 墨林浅底方案，勿再自行切暗色或重引该附件风格。**

- 用户要求：「还是用绿色吧，墨绿，有质感」；确认选项：**浅底不变、主卡与主按钮换墨绿**、**深森林墨绿接近黑绿**。v7 的浅画布、字号小一档、标签-值模块、12th 字标全部保留。
- 令牌：画布 `hsl(150 12% 97.2%)`（绿灰纸白）；surface-1 10%95.4% / surface-2 8%91.8%；hairline `hsl(150 8% 89.8%)`；文字 `hsl(158 14% 16%)` / muted 155 8% 43% / subtle 155 7% 56%；主操作 `hsl(158 32% 17%)`（hover 21%、active 13%、顶部高光 24%、soft 155 20% 95%）；hero 三段 `hsl(158 30% 18%)→hsl(160 36% 10%)→hsl(156 26% 14%)`；深底 / 二维码底 `hsl(158 34% 8%)` + `hsl(158 22% 15%)`；金额 `hsl(80 20% 92%)` 奶白；点睛绿 `--jnh-brand` 仍 `hsl(150 40% 30%)`、strong 150 38% 26%；橙 `hsl(22 72% 45%)` 不动。
- 分工：主色 L17% 与点睛绿 L30% 靠明度拉开两档，不得互换；墨绿只上深卡与可点主操作，不铺浅色大面积底。
- 同步点：`tailwind-theme.css` 语义层（background/foreground/primary/secondary/muted/accent/border/input/chart/sidebar 与 `--primary-border` 等 computed border 基色）、`PaymentQR.tsx` 码色 `#0C1712`、`jnh.css` 第 119/373/539/735/740/779 行的写死色（画布墨光、hero 柔光 `hsl(152 44% 38% .24)`、品牌标牌柔光 `hsl(152 44% 40% .3)`、浅边框 150 8%）。
- 品牌标记（2026-11-17 二次改版，用户「完全不好看这个 12th，没有任何设计感」）：弃一切字体排版与位图，改为纯矢量 `BrandGlyph`（`client/src/components/jnh/icons.tsx`，viewBox 108×56，无 th 版 82×56）：笔画 6.5「12」（`M 15 25 L 30 12 L 30 48` / `M 39 24 A 14 14 0 0 1 67 24 L 39 48` / 底横 `M 35 48 H 76`，底横左右各外扩 4）+ 细笔画 2.6 上标 th（手绘 t/h 路径，不是 `<text>`），整组 `skewX(-9) translate(4 0)`、`stroke=currentColor`。`BrandMark(size)` 签名不变：标记高 = size×0.46，`size>=56` 追加「家年华」小字（size×0.16 且 ≥12px、字距 .14em、`--jnh-ink-muted`、`align-items:center`、gap = size×0.09）；`size<56` 只出标记。顶栏 `AuroraShell.BrandBar` 用 `BrandGlyph height={18} withTh={false}` + 发丝 + 页名。`.brand-wordmark/.brand-rule/.brand-name-tight` 与 `--jnh-font-display` 已删；`.brand-mark` 给 `color: var(--jnh-ink)` 且 `shape-rendering: geometricPrecision`。教训：用系统字体的斜体西文冒充 logo 用户一定觉得没设计感；小尺寸（≤20px）必须用简化形（去 th）否则糊成一团。
- 历史行（v7 起沿用）：字号小一档（正文 14、caption 12、title 15、display 26、money 34、`.row` 60/68、chip 11）；`.kv` 标签-值模块；信息密度每屏一行 ≤20 字；坑：`--jnh-primary` 只作可点底、手写 CSS 禁 Tailwind 属性名、`ui/image` 会给图加灰底（透明图用原生 img）。
- 规范已写 AGENTS.md v8；改配色/字号前先读设计规范段，避免与 v6/v7 值混用。

## 图标规范

- 用户明确不要 AI 生成图片图标，觉得不好看；图标一律用标准库 lucide-react 矢量图标（项目唯一图标库），禁 emoji。集中维护在 `client/src/components/jnh/icons.tsx`。

## raw sql 模板裸传 Date 必 500（2026-09 修复）

- 现象：线上 /api/payment/precheck 500，日志栈 `ERR_INVALID_ARG_TYPE`，params 里时间参数是 `Date` 对象字符串。
- 根因：`sql\`\${col} >= \${new Date(...)}\`` 裸传 Date，postgres 驱动拒收；Drizzle helper（gte 等）才会走 customTimestamptz 的 toDriver。
- 修复：换成 `gte(uidQueue.createdAt, cutoff)` helper。写 raw sql 前先过 raw-sql-boundary-audit。

## 飞书登录死循环（2026-09 修复）

- 现象：手机飞书 webview 打开 /merchant（或 /employee）点「授权并登录」反复刷新，进不了摊主页；桌面正常。
- 根因：匿名请求到达网关时 `userId:""`，session 接口（软登录态设计）返回 `loggedIn:false`；登录按钮只 `window.location.reload()`，不触发登录。平台为匿名请求注入非空 `loginUrl`（飞书 OAuth）。
- 修复：登录动作用 `authClient.session.redirectToLogin()`（`@lark-apaas/client-toolkit/auth`），授权后自动回跳当前页。已改 MerchantGatePage / EmployeeGatePage / CashierPage 三处。
- 排查通道：`lark-cli apps +log-list --keyword ... --since 24h`，`app_client_api_log` 里有响应体（可看 loggedIn），app_server HTTPTraceInterceptor 日志里有 `__platform__`（userId/loginUrl）。
- 注意：`redirectToLogin` 依赖平台 runtime 接口，沙箱 dev 打不通，只能发布后真机验证。
- 付款页 NEED_IDENTITY 员工授权入口（2026-11-06）：飞书内首次扫码无家人 token 时探测员工 session；未登录**自动发起**飞书授权（redirectToLogin 回跳原页直接进金额键盘），`sessionStorage` 标记 `jnh_pay_autologin` 每标签页只自动跳一次防取消授权回跳死循环，探测到 loggedIn 后清标记，「飞书授权登录」按钮保留为兑底（手动点击同写标记）；已登录未绑卡出绑卡引导、已绑卡但缓存家人 token 失效出「清除失效家人身份」按钮；微信 UA（MicroMessenger）跳过探测防劫持。**过渡态极简化（2026-11-06 晚）**：探测中与自动跳转期只渲染一行「正在识别中」StepBadge、不渲染引导卡与按钮（用户反馈真机闪现整张「请先进入您的付款身份」卡很突兀）；自动跳转 effect 用 `useLayoutEffect` + `autoJumping` state，setState 在绘制前同步生效，探测完成那一帧引导卡不会被画出来；探测完成前还有一帧 vDOM 渲染引导卡但不落画布；flag 已存在（取消授权回跳）时 autoJumping 恒 false 正常兑底。已上线：release 7704977845445970953（commit 0a36236，2026-11-06 随首登欢迎消息一同发布，error_logs 空，线上 bundle `正在识别中` 命中；7704955201228721144/004359f、7704947371440851899/6e92acc、7704879271965232422/079b066 均已被覆盖）；redirectToLogin 回跳闭环、生产 401 不自动跳转、取消授权后兑底按钮、首次扫码全程无引导卡闪现，开发态不可验，待真机复验。
- 平台拦截器事实：`axiosForBackend` 对任何带非空 `x-login-url` 的错误响应自动 toast+跳登录，`config.meta.autoJumpToLogin: false` 关闭（类型在平台 d.ts 已全局声明）；dev 环境 loginUrl 恒空本地复现不了，生产上「401 不跳转」待真机验。

## 收款码不带身份 → 家人扫码无金额键盘（2026-09 修复）

- 现象：家人用微信自带扫一扫摊位收款码，付款页只有身份引导卡，没有金额键盘。
- 根因：收款码 URL 只编码 `/pay?s=<stallToken>`，无 who 参数；`prepare` 拿不到付款人返回 `NEED_IDENTITY`，PayPage 该状态下不渲染 AmountKeypad。
- 修复：① FamilyPage ready 时把 token/displayName 存 localStorage（`client/src/utils/family-payer.ts`），PayPage 无 who 时回填（URL who 最优先）；② 后端 prepare 无 who 但有登录态时按 `resolveSelfByUser` 兜底。身份自动回填时付款人卡展示姓名可核对。

## Base 同步引擎与 identity 主键死锁（2026-10 修复）

- 现象：use_existing 同步到 identity 主键表（GENERATED ALWAYS AS IDENTITY）首同步全失败 23502「必填字段的值为空: 妙搭字段 id」；禁用 id 映射则 create 被「必填字段未映射: id」拒绝，两头堵死。
- 根因：identity 列在 information_schema 的 column_default 为 NULL，同步引擎把 NOT NULL 无 default 列判为必填；而 Base「表唯一 ID」系统字段对没有自增字段的表无值可写。
- 修复：先执行 ALTER TABLE t ALTER COLUMN id DROP IDENTITY、CREATE SEQUENCE t_id_seq OWNED BY t.id、ALTER TABLE t ALTER COLUMN id SET DEFAULT nextval('t_id_seq')（自增语义不变），再禁用 id 映射重建同步任务即通；DDL 后重跑 npm run gen:db-schema 刷新 schema.ts。
- 附：+db-sync-update 对 dev 任务可能报 MGetTables not found（疑似校验落 online），用 +db-sync-delete + 重建绕开；手工补 field_map 时 pg_field 必须带完整 type/nullable/unique 元数据；lark-cli 搜人返回在 .data.users，批量 ID 转换用 --ids。

## 员工身份反查链路（2026-10 实测定论）

- 工号（cust_num）≠飞书用户ID：getBatchMiaodaUserIds(工号) 12/12 返回 null；小鹏真实 employee_id 是 9 位数字或 8 位 hex（如 149667569 / cfac8692），飞书管理后台可见，CLI 搜人拿不到。
- 运行时可用反查链路（AuthNPaasService，均已实测）：getBatchMiaodaUserIdsByOpenIds(openIds)（convertType=20）与 getBatchMiaodaUserIds(employee_id)；CLI 搜人只能拿 open_id，用它做应用内反查依据。
- employee_card_map 已精简为纯映射表（2026-10-21）：无主键，列仅 miaoda_user_id/employee_name/cust_num/leniu_cust_id/base_record_id/open_id + 审计列；status/source/verified_at/updated_at/id 五列已删，识别判定 = miaoda_user_id 非空；同步任务 streaming_1879260681932823 三项映射（姓名/工号/表记录ID），Base 加「飞书用户ID」列后需重建补第四项。
- 补齐链路（2026-10-28 改为事件驱动）：`employee.automation.ts` 的 `syncIdentity(custNum)` 统一处理——行内已有 open_id 直接用，缺失则 `FeishuService.getOpenIdByEmployeeId` 查飞书，再 `getBatchMiaodaUserIdsByOpenIds` 转 userId，条件更新写 `open_id`+`miaoda_user_id`；返回 filled/skipped/conflict/not_found/unresolved 五态（临时调试接口已实测前四态，unresolved 为凭证缺失态）。
- 工号→open_id 走 `GET /open-apis/contact/v3/users/:user_id?user_id_type=employee_id`；SDK `contact.user.get` 与 `batchGetId` 类型都不支持 employee_id（batchGetId 只收邮箱/手机号），必须用 `client.request` 通用入口发。
- 工号 → 妙搭 userId 零凭证链路（2026-10-28 定论）：`AuthorizationSDK.search.search({ query: 工号 })`（`@lark-apaas/nestjs-authzpaas`，路径 `/v1/app/{appId}/account/search`，由 `AuthZPaasModule.forRoot()` global 提供）返回项直接含 `miaodaUserID`；实测 13229→1774191229065268、22309→1774193346886711，与 CLI `contact +search-user` + `apps +user-id-convert` 两条命令结果完全一致。搜索是模糊匹配，`SearchUserEntity.employeeID` 不是工号（22309 的是 7022864343473651716），必须用姓名归一化严格相等收敛。
- 飞书直连凭证方案已作废（`FeishuService` 与 `@larksuiteoapi/node-sdk` 已删）：工号不是飞书 employee_id，按工号查通讯录本就查不到，方案不再需要企业自建应用凭证。
- `AuthZPaasModule.forRoot()` 会注册全局 `AuthZPaasGuard`，实测匿名家人/付款接口行为不变（`authMode=anon` 验证 `family/context` 返 4005、`pay/context` 返 INVALID_STALL）；无权限装饰器的路由直接放行。
- 韩金彤（hanjt2@xiaopeng.com）飞书通讯录查无此人，行保持待补，需人工确认账号状态。
- 员工端识人已接通（2026-10-21）：cardRefByUser 按 miaoda_user_id 精确匹配 employee_card_map；CardRef 不脱敏（全名），cardLast4 装完整工卡号（用户明确要求）；付款/家人链路接入时 PayPage/FamilyPage「工卡尾号」文案需同步改完整工卡号；identities/createFamily/deleteFamily/markShared/selfToken 已接真实实现（family_identity 表按 employee_user_id 维度，is_self/shared 两列为后加，status 用小写 active/deleted，DTO id 是 string）；余额（identities.balance=0）与付款识人（resolveToken/resolveSelfByUser）仍占位。
- +db-sync-get/delete 无 --environment 参数（默认 online，dev 任务也能操作）；仅 +db-sync-create 必须显式 --environment dev。

## 员工工号自助绑定（2026-10-28 交付）

- 用户明确规则：**员工工号的唯一来源是多维表格**，员工不能自建工号行，绑定只能关联已同步的既有行。
- 动线：`/employee` 未识别（`miaoda_user_id` 为空）时展示 `client/src/components/jnh/BindCardPanel.tsx`，输入工号 → `POST /api/employee/bind-card` → 成功进入身份列表。
- 校验顺序：工号格式 → 工号存在（404）→ 工号已被他人绑定（409）→ 姓名与登录账号匹配（403，已绑当前账号时跳过）→ 当前账号已绑其他工号（409）。姓名比对忽略空白/大小写且双方互相包含。
- 首次绑定必须 `WHERE cust_num=? AND miaoda_user_id IS NULL` 原子更新，防并发抢绑；**漏查「当前账号是否已占其他行」会直接撞 `employee_card_map_miaoda_user_id_uk` 报 500**（实测已修），一个账号只能绑一个工号。
- open_id 用 `AuthNPaasService.getBatchOpenIds([userId])`（妙搭视角，不传 feishuClientId）反查回填，实测可用；失败只 warn 不阻塞绑定。
- 触发方式（2026-10-28）：两个 record_change 触发器 `employee_card_map_row_inserted`（INSERT）+ `employee_card_map_cust_num_updated`（UPDATE + `fields:["cust_num"]`）均 `Active=true`，事件取 `after.cust_num` 调 `syncIdentity(custNum)`：行内有 open_id 先转换，否则走平台通讯录搜索，命中后反查 open_id 一并写回，全程零凭证。任务只写 open_id/miaoda_user_id 不碰 cust_num，不会自触发；`backfillMiaodaUserId()` 保留为手动全量兜底。record_change 只在线上已发布版本投递，开发态改数据不触发。
- 自动认领（2026-10-28）：`POST /api/employee/auto-bind` 按登录姓名严格相等匹配未绑定行，唯一命中才绑，重名 `AMBIGUOUS` / 无同名 `NO_MATCH` 回退工号面板；前端在 `autoBindDone` 前只渲染骨架，避免工号面板闪现。
- 自测坑：dev 库里 22309 的 `miaoda_user_id` 指向沙箱账号 1774193346886711（姓名「验收助手」），与 employee_name「周海杰」不一致；验证首次绑定需临时解绑 22309 并插 `TESTBIND01/验收助手` 测试行，测完删除并恢复（脚本见对话，勿留残留）。

## 遗留表已删（mock_card_account / uid_queue / stall_pin / transaction_ledger，2026-10-26）

- DROP mock_card_account + uid_queue 并连带清理：leniu.service.ts 删 mock 分支（三方法直走 http，db/config 注入已删，消费方签名不变 tx 参数改 _tx）、payment.service.ts checkout 删 uid_queue 排队/去重/状态流转、shared CheckoutResponse 删 queuePosition/waitMs（前端零消费）。
- 后又 DROP stall_pin（150 行 mock 摊位口令）：零代码引用，所有 stallPin 命中均为 transaction_ledger.stallPin 字段；摊位权威数据源只剩 stall_config（Base 同步，3 个真实摊位），merchant_binding.pin 关联 stall_config.pass_code。
- 最后 DROP transaction_ledger（旧 C 扫 B 台账，10 行历史：6 成功+3 失败+1 其他）。连带清理：bill 模块目录整体删（bill.service/bill.module 无 controller；BillModule 注册点 app/employee/family 三处 module 一并移除）、payment.service 删 checkout/nextTxnNo（入口 resolveToken/resolveSelfByUser 恒 null 不可达）、payment.controller 删 POST checkout 路由、family.service 删 getBill/getDetail + 注入、family.controller 删 /api/family/:token/bill* 路由；保留 shared 旧 DTO 类型（PrepareResponse/BillItemDTO/LedgerStatus 等被新链路适配层复用）。遗留 dead code：leniu.service.deductInTx 仅旧 checkout 调用，现已无人使用（未删）。
- 行为变化：旧 checkout 后端不再有 requestId 幂等去重（原靠 uid_queue.requestId unique），前端 PayPage requestId 防重是唯一防线；旧链路识人仍占位恒 null，此路径实际不可达，真实幂等在新链路 payment_ledger macOrdId。
- 遗留：app_config.leniu_mode 配置项（值 mock）与 config.leniuMode()/admin 白名单 'leniu_mode' 仍存在但已无消费方；LENIU_BASE_URL 未配置，http 模式调用会报「未配置 LENIU_BASE_URL」（fail-loud 合理）。旧链路切新 LEOPEN 或彻底退役时一并清理。

## LEOPEN 真入口要带 /tengyun-api 前缀（2026-10-23 定论，推翻下段「平台级鉴权拦截」判断）

- 现象：`/leopen/*` 全部恒返 25B「无权限访问该页面」，换签名/header 各种变体都无效。
- 根因：真实入口是 `https://anniversary-homefair-api.x-peng.com/tengyun-api/leopen/<接口>`，缺 `/tengyun-api` 被前置鉴权层直接拦下，与 appid 授权、签名、白名单均无关。
- 修复：探测四目标 path 统一加前缀（`PROBE_TARGETS` 与 `LEOPEN_PROBE_TARGETS` 两份都要改）；业务成功码同时存在 `0` 与 `10000`，判定必须认 10000。
- 余额真实链路（2026-10-23 实测）：工号 60321 → customer/query 得 custId 555343821404119040 → balance/query 返回 accName 王世楷、walletBal 4242、subsidyBal 13800、accBal 18042（accBal = walletBal + subsidyBal，单位疑为分）；探测已按此两级链路实现，custId 查不到时回退 custId=0。
- order/state/query 实测（2026-10-26）：content 单字段 `{macOrdId}`，签名直接通过；返 code 10000 + data{ordId, macOrdId, payState:3（数字）, ordState:"1"（字符串）, totalAmount:"1", realAmount:"1"（金额均字符串）, payTime, orderDate}。同单号 ordId 与 pay/device 返回一致，可作对账与幂等判据。探测已支持 macOrdId 入参，缺省用 JNH1128-0001-1792999666248。
- version 口径（2026-10-26 实测）：`PROBE_VERSION` 已统一为 `5.43.4.12`，四接口 15:57 全量复验均返 code 10000；`1.0.0` 历史亦通过 → 服务端不校验 version 白名单，version 只参与 MD5 拼接。`PROBE_TARGETS[target].version` 保留接口级覆盖能力（当前无覆盖）。
- pay/device 全通定论（2026-10-26）：① content key 必须严格 ASCII 升序 `amount→custId→macOrdId→machineSn→nuClearMode→ordTime`，服务端按 ASCII 排序重序列化 content 再验签，顺序不符必 100042（此前 8 种字段组合失败全是顺序问题，与字段缺失/中文/类型无关）；② `machineSn` 必须是已注册设备序列号 `5m6665785`，传设备名『open支付专用设备-小鹏家年华对接』返 40004 设备不存在；③ `amount` 单位为分（1 = 1 分）、`nuClearMode=2`、`macOrdId` 每次请求新生成 `JNH1128-0001-<ts>`；④ 工号 22309 → custId 489273400569634816（周海杰，AI前线交付组）。首次扣款成功：code 10000、realAmount=1、ordId 638624501982044161、accBal 3764，返回 ordQrCode/mealCode。其他三接口 content 单字段不受排序影响。测试一律用 amount=0：2026-10-26 实测 0 元下单 `code=10000`、`realAmount=0`、余额三项（3361/403/3764）不变，服务端仍生成订单号，可安全回归；`mealCode` 随交易递增（001→002→003）非固定值，0 元单也占用序号。四接口出参、坑与实测报文文档在根目录 `乐牛接口说明（包括实际案例）.md`。
- 实测（2026-10-23）：order/state/query、customer/query（返回真实员工 custId / serialNum / orgFullName）、account/balance/query 签名均通过；balance 只认 custId / custThirdId，传 mobile 报 `40004 人员id和第三方人员id不可都为空`；pay/device 已于 2026-10-26 打通（见上）。

## LEOPEN 链路卡点判定（2026-10-22 运维定论，结论已被上段推翻）

- 现象：anniversary-homefair-api.x-peng.com/leopen/customer/query 恒返回 25B「无权限访问该页面」，HTTP 200、带 x-trace-id。
- 定论：Nginx 已正常转发（运维 SLS：status 200、upstream 63~68ms、来源 IP 全命中白名单）；拒绝来自后端 leopen 应用（10.181.116.41:58100）鉴权 Filter，签名校验未执行。
- 已实测 7 种鉴权载体变体（body 完整签名/省略签名/空 body、header 大写 X-Appid/X-Sign 全套、小写全套、Authorization Bearer、token、X-Appid+X-Sign 最小、form-urlencoded）**全部返回同一 25B 拒绝页**——鉴权不在业务签名层，可能要求平台内部会话/登录态；诊断页「对照实验」已固化 body 三态 + header 变体共 4 行自动比对。
- 入口差异（2026-10-22 实测）：reception-api.x-peng.com 对沙箱 IP 所有路径（含 coupon/send-Coupon）均 nginx 直返 **403**（IP 白名单，能通的只有食堂系统服务器）；anniversary 域名下加 /canteen/tengyun-api 前缀直返 404（无此 location）。
- 2026-10-22 三接口复验：授权清单内的 pay/device、order/state/query 与 customer/query（version=1.0.0、customer 用工号 60321、pay 用不存在卡号 + 0.01 元）均返回同一 25B「无权限访问该页面」，x-trace-id 各不相同 → 排除 path 级授权问题，拦截在平台级鉴权（appid 未开通 / 需内部会话）。
- 待办：转 leopen 业务方（综合行政平台，李梓瑄）核对 ① appid 629230940945653760 是否已授权任一 leopen path ② 是否要求平台内部会话 ③ anniversary /leopen 入口放行配置。
## 共享模块只被业务模块 import 会触发「未注册的 Module」告警（2026-10-27）

- 现象：commit 前置检查提示 `⚠️ 未注册的 Module: FamilyPayPasswordModule`，但 DI 与接口、E2E 全部正常。
- 根因：该检查只扫 `server/app.module.ts`；被 employee/family/pay 三个 module 直接 imports 的服务模块无需根注册，属误报。
- 处理：不为此改 app.module.ts；确认 `rg FamilyPayPasswordModule server/modules` 三个消费方均已 imports 即可。

## 线上基础数据初始化（2026-10-28）

- 线上（online）此前两张 Base 同步表全空：stall_config / employee_card_map 均 0 行，数据只在 dev；`+db-env-migrate` 只发 DDL、不搬数据，发布后线上摊位码与员工识人即不可用。
- 已建两条 online 同步任务：`streaming_1880210146373828`（小鹏摊主信息 → stall_config，150 行）、`streaming_1880210232448023`（小鹏员工基础信息 → employee_card_map，12 行），建后立即全量落地。`+db-sync-create` 省略 `--environment` 即落 online；`action=use_existing` 写已有表不触发建表，不撞 `k_dl_4000001`。
- 坑：employee_card_map 的 preview 自动匹配只认 姓名 / Base 表记录 ID 两项，`工号 → cust_num` 必须显式写进 field_maps（否则 NOT NULL 列缺映射，preview 的 mapped_field_count 只报 2）。
- 同步不带身份列：Base 无 open_id / miaoda_user_id 列，线上 12 行同步完身份为空；已按 dev 数据 `UPDATE ... FROM (VALUES ...)` 回填 11 行（韩金彤 825285 仍待补）。Base 删记录再重插会让该行身份回退为空，需重跑回填。
- 线上 static_token 由列默认值新生成，与 dev 不同；摊主收款码 URL 一律以线上库为准。

## 家庭支付密码与冻结（2026-10-28 改员工级）

- 模型：员工维度共享一个密码，存 `employee_pay_secret`（employee_user_id 唯一，RLS authenticated 读改自己行 + anon SELECT/UPDATE 读状态与累积失败计数）；`family_identity.pay_password_hash` 等列保留不再读写。scrypt 哈希、错 5 次冻结、业务码 4008/4009/4010、员工 isSelf 免密。
- 员工端路由（无 :id）：`POST /api/employee/pay-password`（设置/重置，{payPassword}）、`POST /api/employee/pay-password/unlock`；`identities` 顶层 `familyPayPassword {payPasswordSet,payLocked}`，撤销行级字段。
- 家属端无改密接口与入口（`FamilyPasswordCard` 只读），创建家人与分享页不再要求/展示密码；`PayPinFields` 只在员工端管理卡用。
- 坑：未传 payPassword 必须单独走 PASSWORD_REQUIRED 分支、不累加失败次数，否则家人端打开付款页即被计错。
- 无记录误判已冻结（2026-10-30 修复）：现象=未设置密码的员工（无 employee_pay_secret 行）显示「已冻结（连续输错 5 次）」，点解除冻结报「尚未设置家庭密码」（线上 0 行时全员命中）。根因=`secret?.payPasswordLockedAt !== null` 对 undefined 恒 true，三处同型（employee.service.ts identities 组装、pay-password.service.ts readState、identity.service.ts resolveFamilyPayer）。修复=改为 `secret ? secret.payPasswordLockedAt !== null : false`。判空类 RLS/状态读务必先判行存在。
- 链路 IP 可观测性（2026-10-22 实测）：沙箱出网经本地代理，探测结果 `sourceIp` 是本端 socket 的 169.254.x.x:随机端口（非公网），`remoteIp` 118.31.212.217，公网出口 `egressIp` 为动态池（同日测到 101.126.88.108 / 180.184.54.29 / 101.126.156.198 / 115.191.55.76 轮换）→ 白名单不能靠固定出口 IP 维持。取 socket 源地址须在响应回调开头读 `res.socket`，在 `end` 里读已解绑为 null。

## 付款页金额空态与 0 元临时开关（2026-10-28）

- 开关位置：`client/src/pages/pay/PayPage.tsx` 顶部 `ALLOW_ZERO_AMOUNT`，`true` 临时放开 0 元单、`false` 恢复「金额必须大于 0」；服务端一直只拦负数，0 元一直可下单。
- 空态：金额 state 初始 `''`，`AmountKeypad.applyAmountKey` 清零/退格回空、空态按「.」得 `0.`；`isAmountSubmittable` 接收字符串且拒绝空值，空态不渲染确认按钮。密码键盘与摊主口令键盘各有独立状态机，不受影响。
- 0 元单后果：真实请求乐牛 `pay/device`（`amount: 0`），生成订单号并占 mealCode 序号、余额不变，本地落 SUCCESS 零元流水，摊主端显示 `+¥0.00`；正式上线前必须先改回 `false` 再发布。
- 发布状态（2026-11-06）：线上最新版 release 7704977845445970953（commit 0a36236，员工首登欢迎消息 + 前版自动授权），`ALLOW_ZERO_AMOUNT=true` 随版保持放开（测试期 0 元回归仍需要）；**11-28 正式活动前必须改回 `false` 再发一版，勿忘**。

## 家属付款扣款成功却报失败（2026-10-28 修复）

- 现象：家人微信端付 0.01 元提示「支付失败」，乐牛侧已扣款成功，线上台账停在 INIT、摊主端看不到。
- 根因：家人端是匿名请求（anon 角色），`payment_ledger` 只给了 anon INSERT + SELECT、没给 UPDATE；`finalizeLedger` 的 UPDATE 被 RLS 静默过滤返回 0 行（`result_count: 0` 且 `error_message: ""`，不报错），代码把 0 行当并发兜底去 `loadLedgerById` 读回 INIT，`toConfirmResult` 又把 INIT 归成 FAILED + 兜底文案「支付失败」。员工本人走 authenticated 有全权限，所以测试与员工端均无异常。
- 连带：`family_identity` 同样缺 anon UPDATE，导致支付密码错误次数不累加（永不冻结）、家人自行改密不生效。
- 修复：补两条 anon UPDATE policy（payment_ledger 限 INIT/UNKNOWN→终态、family_identity 限 status='active'）；`toConfirmResult` 把 INIT 归 UNKNOWN；`finalizeLedger` 回写失效时记 error 日志；前端 UNKNOWN 显示「扣款结果待确认」并去掉重新付款引导。两笔历史 INIT 单已按 `order/state/query` 真实结果回填 SUCCESS。
- 排查手段：`+log-list --trace-id` 能串起 `app_client_api_log` 与 app_server 的 Drizzle SQL 日志（含 result_count），是定位 RLS 静默过滤最直接的证据；用 `api_request` 的 `authMode=anon` 可真实复现匿名链路。
- 坑：`+db-execute` 多语句 DML 的 `rows_affected` 不可靠（实际已生效却报 0），需回读确认；dev 验证时临时建家人身份要用 is_self=true 绕开未知明文密码，测完删。

## 付款成功页余额恒 -- 与 pay/device 成功判定（2026-10-30 修复）

- 现象：付款成功页「最新余额 ¥--」，线上全部成功单（含 0 元单）`payment_ledger.acc_bal` 落库 null。
- 根因：乐牛两接口报文字段不对称——pay/device 成功响应带 `accBal` 但不带 `payState/ordState`，`interpretOrder` 把「code 成功 + 双 null」判 FAILED，靠 order/state/query 查单兑底纠偏；查单响应带 `payState` 不带 `accBal` → accBal 恒丢。曾误判为「0 元单不返余额」，实测报文（文档案例 A/B）0 元也返 accBal。
- 修复：`executePay` 在 `interpretOrder` 之前加 `isLeniuSuccess(res)` 直接判 SUCCESS（复用 interpretOrder 解析 accBal/ordId/payTime），`finalizeSuccess` 落库回显；10001/TRANSPORT/业务拒的查单兑底链保持不动。定论（用户确认）：pay/device `code=10000` 即扣款成功终态，成功路径无需查单；dev 实测 0 元单 confirm 502ms 一次返回、accBal=5013 落库。

## +release-get 的 commit_id 是过程字段（2026-10-30 观察）

- publishing 中查询显示的是上一版基线 commit（b9f603d），finished 后才更新为本轮发布 commit（9ab8666）；轮询中途看到旧 commit 不要误判发布内容错误。

## 删除依赖时必须同批提交源文件删除（2026-10-28 发布前拦截）

- 现象：`package.json` 已移除 `@larksuiteoapi/node-sdk`、`app.module.ts` 已摘 `FeishuModule`，但 `server/modules/feishu/*.ts` 的删除只留在工作区（`git status` 显示 `D`）未提交；dev 因文件已不存在不报错，按 HEAD 发布会编译到 `feishu.service.ts` 找不到 SDK，线上启动失败。
- 根因：删除类改动在本地不可见，编译产物只反映提交内容；`nest build` 会编译 tsconfig 覆盖的全部文件，即使无人 import。
- 处理：发布前必查 `git status --short` 的 `D` 项，与依赖移除同批提交；发布后用 `+release-get` 的 `error_logs` 为空 + 线上 `/`、`/employee` 返回 200 作为第一道验收（`+log-list` 在无流量时返回空数组，不能单独作为"服务正常"的证据）。
- 补充（2026-10-28 实测）：`commit_task` **不收集纯删除改动**（连续两次报告"已提交"但 HEAD 无新提交、`D` 项仍在），只能手动 `git rm <files>` + `git commit` + `git push origin sprint/default` 补齐。
- 补充（2026-11-02 实测）：`commit_task` 对 **untracked 新增二进制文件也可能漏收集**（opened.wav 生成后 commit_task 报已提交，实为 untracked 泄漏，git ls-files 无此文件，线上该 URL 返 HTML fallback，真机确认音全数 EncodingError，还引发一轮「WAV 规格」误诊）。防御：新增资源/二进制文件先手动 `git add` 进暂存区再 commit_task，提交后必须 `git ls-files` 验证 + `git log --stat` 看到 Bin 记录；漏了手动 git add/commit/push 补齐。

## 自动化触发器里调平台 search 恒为空（2026-10-28 排查定论）

- 现象：线上新增员工行（陈铭萱 48337）后 record_change 触发成功、任务跑完 152ms，但 `open_id` / `miaoda_user_id` 仍为空；日志 `通讯录未解析到唯一账号：工号 48337（陈铭萱），not_found，候选 0`。
- 根因：automation 是系统任务、没有登录用户，`AuthorizationSDK.search` 从 `requestContextService` 取 userId，取不到时 body 不带 `userID`（日志 params 可证）；平台在无身份上下文时返回 `{"data":null,"status_code":"0"}` 空信封。SDK 的 `members.list` 对这个组合有显式判断并抛 `PERMISSION_IDENTITY_CONTEXT_MISSING`，注释写明「检测到来自自动化 / 系统任务……这不代表没有结果」；但 `SearchAPI.search` 没有该判断，`response.result?.userResult?.items ?? []` 把 null 静默当成没搜到。
- 结论：依赖 search 的身份补齐在 automation 链路**永远不会成功**，与工号/姓名是否在通讯录无关（陈铭萱飞书 open_id `ou_a72d65d1694db95dd1d1a6338cfd8fe8`、妙搭账号 `1825619375206569` 都存在）。开发期实测 13229/22309 成功是因为在登录态下调用，不代表触发器可用；SDK 明确禁止显式传任意 userID 绕过（会破坏权限模型与审计）。
- 最终处置（2026-10-28，用户明确要求"写死我 userID"）：`employee-directory.service.ts` 顶部定义 `SEARCH_PROXY_USER_ID = '1774193346886711'`（周海杰，zhouhj3@xiaopeng.com，open_id `ou_20367bb2334ee2af0da766435aa8409a`），`search.search({ query, userID: SEARCH_PROXY_USER_ID, pageSize: 20 })` 显式传入；空结果与失败日志都打出「代表身份」。dev 实测工号 48337 → `{outcome:'hit', userId:'1825619375206569', candidateCount:1, scannedCount:1}`，证明该身份能搜到人；触发器投递本身已由陈铭萱那次日志证明正常，两者合起来链路闭环。
- 已知局限：结果受该账号通讯录可见范围限制，账号调岗/离职/权限收回后任务会静默退回 not_found（只会打 warn，不告警）；`SearchParams.userID` 在 `@lark-apaas/nestjs-authzpaas` 类型里是可选字段，SDK 取值顺序为 `params.userID ?? 当前请求者`。
- **搜索接口结果随机抖动**（2026-10-28 实测，吴家豪 32503 未回填的根因）：同一 query、同一 userID 连续调用，结果在 total 0 与有结果之间跳变。15 个真实工号连测三次：10967 命中 1→0、22309 命中 1→0→1、32503 命中 0→2→2、60321 命中 0→0→1、60669 命中 0→0→1，命中集合每次不同。空返回**不代表查无此人**（吴家豪 07:27:01 返 0 条，30 秒后返回吴家豪+杨晓璇）。
- 对策（已实现）：`resolveByCustNum` 空结果时重试，`SEARCH_ATTEMPTS=3`、间隔 300ms、拿到非空即停，全部尝试都抛错才判 unresolved；dev 实测连续 6 次解析 32503 全 hit `1774193346887703`。回包会带无关召回（32503 召回杨晓璇），仍靠姓名严格相等过滤。
- 另一类：6 位工号 825275（雷美琪）、825285（韩金彤）三次全 0，疑似该长度不被索引，需人工确认账号；HT0010（王梦瑶）也是模拟出来的命中。
- 可用路径：行内已有 `open_id` 时 `convertByOpenId` 不依赖身份（真解，需 Base 增加 open_id 列）；员工本人登录 `/employee` 的 auto-bind（按登录姓名匹配 DB）与工号面板 bind-card 都不调 search，能正常绑定。
- 排查手段：`+log-list --trace-id <id> --jq '.data.items[] | select(.body | contains("search.search")) | .body'` 能直接看到平台原始 `response`，是判定空信封最快的方式。

## 到账提醒手机端无声三重根因（2026-11-02 已修复，E2E 已验，待真机验收）

- 现象：摊主在手机飞书端打开「开启到账提醒」后到账无任何声音；桌面浏览器有声。
- 根因 1（2026-11-02 三次诊断定论，含用户真机实测）：**iOS 全链路正常**——iPhone 点开关试音与到账轮询 TTS 均有声，首次手势激活 speechSynthesis 后是 sticky 的，timer 回调可出声；前两轮「WKWebView TTS 静音 bug」「timer 回调无手势恒无声」均被实测推翻，**iOS 保持 TTS 优先不动**。**安卓无声根因实锤**：飞书安卓 = Android WebView，MDN 官方兼容数据 WebView Android 对 SpeechSynthesis **不支持**（Chrome Android 才支持，且 Chrome 也完全依赖系统级 TTS 引擎，国内 ROM 大量设备无中文 TTS 引擎/无 GMS）；部分国产内核连 `window.speechSynthesis` 都 undefined。实测安卓点开关手势内试音也无声 → TTS 桥接链断，而 `'speechSynthesis' in window` 盲信一级永不降级 → 到账也无声。
- 根因 2（降级路径死，实测）：`CLIP_BASE = \`${process.env.CLIENT_BASE_PATH || '/'}audio/jnh\``，平台 preset define 时 `normalizeBasePath` 把 `/app/app_17es13zg9zd/` 去成无尾斜杠的 `/app/app_17es13zg9zd`，编译产物实测为 `` `/app/app_17es13zg9zdaudio/jnh` ``（丢斜杠）；线上请求 302→200 text/html（网关 fallback），`new Audio()` 解码失败 onerror 静默 resolve。dev 同样拼错（同一 define）。
- 根因 3（兑底不可达）：`beep()` 每次 new AudioContext 且不 resume，iOS 下 ctx suspended 无声；且因根因 1 永远走不到第三级。
- 修复落地（2026-11-02 两轮，仅 arrival.ts 单文件 + 音频资源，iOS 链路零改动）：第一轮修 CLIP_BASE 尾斜杠、加 probeTts 探测、unlock 预播静音 0.wav、beep() 复用 unlockedCtx。第二轮定稿（点开关反馈用户不要叮咚要语音）：① 播报引擎 HTMLAudio → WebAudio（fetch+decodeAudioData+BufferSource 串行，clipBuffers 按 url 缓存 AudioBuffer），复用手势内 resume 的 unlockedCtx，非手势轮询回调可播；② probeTts 三失败分支（无 speechSynthesis/onerror/1.5s 超时）统一播预生成语音 opened.wav（AI 语音合成插件实例 payment_reminder_speech_synthesis_1 生成「到账提醒已开启」，ffmpeg 转 24kHz 单声道 16bit wav），失败回退 beep.wav；③ 元.wav/点.wav 重命名 yuan.wav/dot.wav（消安卓中文文件名不确定性）；④ 全链失败 logger.error 可观测，不再静默吞错；⑤ speakArrival 状态机不变：ttsUsable===true 走 TTS，否则 WebAudio 片段链，链异常 beep 兑底。waitCtxRunning 等 resume 完成（手势内 resume 异步，播确认音前限时 1s）。
- E2E 验证结论（headless 无 TTS = 安卓等价态，全链通过）：点开关 → 0.wav 200 audio/wav；探测超时 → beep.wav 206；0 元单到账 → 到账卡片（+¥0.00/周海杰）+ phrase.wav/元.wav 请求 200/206，无 JS 报错。计划 .spark/e2e-test/merchant-arrival-audio.json。
- E2E 断言坑：① 音频类请求断言受浏览器 HTTP 缓存干扰——已缓存资源 new Audio().play()/fetch 不发新网络请求，第二轮开关周期断言「新请求」会假失败（2026-11-02 实测第二轮关→开零请求）；断言要选本会话首次加载的资源。② goto 整页导航会丢模块级 AudioContext（unlockedCtx 变 null，重落 relock 等触摸态），「摊主页点开关 → goto 付款页 → goto 回来」动线断言片段请求必假失败；正确动线=新标签页（context.newPage）付款、摊主页标签常驻不导航（2026-11-02 实测改线后通过）。
- 真机验收（2026-11-02 下午，release c84946de）：**到账播报安卓真机已通**；开启确认音回退叮咚，线上日志 6 条失败。**根因再修正（2026-11-02 晚）**：摊主 0005 测试机 5 次 `EncodingError` 的真实根因是 **opened.wav 从未进 git（commit_task 报已提交但 untracked 二进制文件漏收集）→ 线上请求该 URL 返回 9202 字节 HTML**（curl 实锤 200 text/html，对照 0.wav 正常音频流）→ decodeAudioData 解 HTML 必败；此前「24kHz+LIST/INFO 头解不开」是基于「文件在线上存在」错误假设的误诊，未被证实。② 周海杰手机 1 次 `audio context state suspended`——probeTts 1.5s + waitCtxRunning 1s 窗口太紧的时序问题，用户明确决定不调（保持 1s，ctx 慢激活设备仍会偶发叮咚，已接受取舍）。
- 修复（2026-11-02 晚，commit a812a4e）：opened.wav → opened-v2.wav（ffmpeg 重转 22050Hz/16bit/单声道 + `-map_metadata -1 -fflags +bitexact` 标准 44 字节头，音色不变；换名防真机 HTTP 缓存混淆复验），arrival.ts:111 一处引用同步，E2E 计划断言同步；E2E 用例 1 复验通过。**已上线**：release 7703503133670116623（commit e35c898，2026-11-02 晚随台账导出防堆积修复一同发布，error_logs 空，线上 opened-v2.wav 返回 117KB 真实音频流非 HTML）；待真机复验：摊主 0005 安卓机点开关听语音。日志查证：`+log-list --keyword "开启确认语音播放失败"`，body 带 Error 对象可直接分型。
- 验证手段：线上 JS 在 lf-miaoda-static.feishucdn.com 的 `app_17es13zg9zd/<commit>/client/assets/` 下；curl HTML 提取入口再拉 bundle rg 字面量即可实测编译结果。

## 到账重复播报与游标持久化（2026-11-02 晚修复，E2E 全量通过）

- 需求语义（用户明确）：只有开启提醒之后的真实到账才播语音；切页往返绝不重播历史单。
- 修复：`useArrivalMonitor.ts` 到账游标改 localStorage 持久化（key `jnh_arrival_cursor`，懒初始化 useRef + 响应后内存与 localStorage 双写，无记录时初值=当前时间，`after=1970` 全量重拉彻底消失）+ poll 加 inFlight 并发锁（移动网响应 3~6s 超轮询间隔时不再旧游标重拉同批单）。
- 坑（自产 bug 被 E2E 抓住）：游标从 useRef 改成 useState 后丢了会话内推进——useState 值恒定，只写 localStorage 没人读回，同一订单连续 10 轮重拉、重复追加 5 卡 + React duplicate key 报错。游标类「既要会话内推进、又要跨挂载恢复」的状态必须用可变 ref，localStorage 只作重挂载恢复源。
- E2E 坑（用例 4 两段式的原因）：headless 下整页打开摊主页后 SPA 切页返回，重挂载时无新手势、AudioContext 未解锁，播报按设计走 beep 静默兑底且**无任何音频网络请求**（beep 是本地振荡器，logger.error 不进 console）——切页返回段的音频请求断言必假失败；音频链验证要么同页常驻（用例 2 形态），要么切回后先模拟触摸解锁再用第二笔单断言（用例 4 第二段）。真机不受影响：摊主点开关解锁后 SPA 切页 ctx 延续 running（用户实测切回能听到播报可证）。
- 验收：计划同卷 .spark/e2e-test/merchant-arrival-audio.json 扩到 4 用例：开关确认音、单笔到账恰好播一条、切页返回无重播（after 非 1970、无新卡无片段请求）、切页期间真实到账切回后恰好一张卡+触摸解锁后补播有声。
- 已上线（2026-11-02 晚）：release 7703555860362644471（commit f2799c7，28 秒 finished，error_logs 空；线上三入口页 200，bundle rg `jnh_arrival_cursor` 字面量实锤游标代码在 `f2799c7.../client/assets/index-B0Ce1E4G.js`）（已被后续版本覆盖，修复仍在线上）。**待真机复验**：安卓机 开提醒 → 0 元单只播一条 → 切台账再切回不重播。`ALLOW_ZERO_AMOUNT=true` 随本版保持放开，11-28 正式活动前必须单独发一版改回 false。

## 手写 CSS 误用 Tailwind 属性名静默失效（2026-10-30 修复）

- 现象：员工端左滑删除红色条只贴顶一行高、下方大面积空白，h-full/stretch/字号连续三轮修改均无效。
- 根因：jnh.css `.swipe-actions` 写了 `inset-y: 0;` —— 这不是 CSS 属性（Tailwind 类名 `inset-y-0` 才会生成 `top:0;bottom:0`），手写 CSS 里被浏览器静默丢弃；absolute 元素无 top/bottom 高度收缩为内容高度且贴顶，容器高度不对导致子元素怎么改都拉不满。
- 修复：改为标准 `top: 0; bottom: 0`。写 jnh.css 等手写样式时禁止 Tailwind utility 风格属性名（inset-y/text-*/tracking-* 等）；遇到“样式多轮改不动”先 rg 检查无效声明。

## 应用文件存储数量上限与导出防堆积（2026-11-02 修复）

- 现象：摊主导出 CSV 500（400000006「App file storage has exceeded its limit」），但 `+file-quota-get` 显示配额 2.36TB 仅用 2.2KB——字节根本没超。
- 根因：应用文件存储是**文件数量**级限制（实测 5 个即触发，与字节无关，quota-get 的 storage_quota_bytes 是误导），超限后整桶只读保护；平台文案「clean up 后 writing resumes the day after the cleanup」是字面机制——实测 `+file-delete` 返回 ok、file-list 已空，写入仍被拒，要**次日**才恢复。quota-get 的 files/used 是延迟统计，删空后仍显示旧值。
- 修复：exportLedgerCsv 改「删上一份再上传」——app_config 记 `ledger_export_path_<pin>` 存每摊位上次导出 path（FileService 无 list API，只能靠记录 path），导出时先 `fileService.remove`（失败仅 warn 不阻塞）再 upload 新文件并 upsert 记录，每摊位恒 1 份。FileService.upload 全应用仅导出这一处。
- 注意：妙搭上传类功能严禁「只增不删」堆积文件；撞限后当天无法自救（次日恢复），活动前要提前检查 file-list 数量。

## 摊位口令随机化（2026-11-05 定论）

- 架构：`stall_config.pass_code` 不再来自 Base，改库端 `gen_stall_pass_code()` 生成（62 字符集随机 4 位，区分大小写）；Base 新增「摊主编码」同步到 `merchant_code`，所有「摊号」展示（bind/收款码页/付款页/台账/结算）一律用 `merchant_code`，空则兜底 passCode。
- 摊主绑定校验 `^[0-9a-zA-Z]{4}$`（大小写敏感）；口令发放唯一出口 AdminPage「摊位口令」tab（GET /api/admin/stalls），前端 PassCodeKeypad 三档键盘。
- 换码/建同步任务铁律：同步任务映射严禁含 pass_code（INSERT 只写映射列，pass_code 走 DEFAULT 随机生成）；use_existing 全量落地不覆盖已有行的 pass_code 与 static_token，但**清表重落地会两个都换**（dev 可接受，online 严禁清 stall_config，否则摊主贴的收款码全部失效）。
- 已知代价：历史台账单（pass_code 为旧口令）换码后反查不到摊位，摊名显示「未知摊位」；摊主端 merchant_binding 与 refund_ledger 按 pin 关联，旧绑定在换码后失效需重新绑定。
- 线上换码已完成（2026-11-05）：14 摊口令全部随机化（旧数字口令即摊主编码 0001~0015 全部失效），清空 9 条测试绑定，7 条孤儿待审退款（全 0 元测试单）批量改判 REJECTED（decided_by=admin:passcode-swap，decision_note=换码清理）；static_token 未动、已贴收款码继续有效；口令值不落任何文档/代码，唯一出口 AdminPage「摊位口令」tab。

## dev 沙箱观测通道与并行会话共库（2026-11-05 实测）

- `+log-list` 只支持 online，dev 环境拒绝请求；dev 查请求级日志用 read_logs 的 trace 源（HTTPTraceInterceptor，含 request_body/response_body/trace_id/duration）。
- dev 库被多个并行会话共享：会查到非自己发的请求（带 `[API_TEST]` 约定的接口自测），也可能出现非自己代码路径产生的数据行（created_by=null 的行=经 +db-execute 直插，无用户身份）。遇到「不可能存在的行」先翻 trace 日志确认并发操作，别先怀疑自己代码。
- trace 日志有窗口限制（只保留最近若干条），错过窗口的请求查不到，此时只能靠复现验证。

## 退款摊主审批 E2E 种子数据链（2026-11-05 定论）

- 计划：`.spark/e2e-test/refund-merchant-approval.json`（3 用例：拒绝 → 重申 → 同意），入口：摊主 /merchant 绑定后 3 秒轮询弹窗；员工端账单在 /employee 页「我的码」（/employee/me）内，不在主页。
- 种子链铁律：摊主审批弹窗按 `refund_ledger.pass_code = 摊主绑定 pin` 过滤，而重申产生的退款行 pass_code 取自 `payment_ledger.pass_code`——dev 库 mock 时代单的 pass_code（0001/0002 等）不在 stall_config，摊主拉不到弹窗必不弹（E2E 用例 3 曾因此假失败）。复验前必须把种子的 payment_ledger 与 refund_ledger 口令链一起改成真实摊位口令（如 qijC，摊「孙小国栋」）。
- 员工端测试账号即沙箱 owner 1774193346886711（周海杰），他同时可做摊主绑定与申请人，单一 identity auth 即可跑全链。

## 员工首登飞书欢迎消息（2026-11-06）

- 功能：员工首次扫码飞书授权成功后发欢迎卡片（引导进员工端）；防重 `employee_card_map.welcome_pushed` 原子条件 UPDATE 占位先行（0→1 成功才发，失败不回置），幂等二调 59ms 直返 sent:false；接口 `POST /api/pay/first-login-notify`（@NeedLogin），前端 PayPage load() OK 分支 fire-and-forget（不阻塞）。
- **send-feishu-message 收件人 ID 坑（实测定论）**：`receiverIds` 收**妙搭 userId（数字 ID）**，不收 open_id——传 `ou_xxx` 报飞书 `10003 user_list or department_list all invalidate`；插件内部自己完成视角转换，`getBatchOpenIds` 反查属于多余一层。修正后 dev 实测 931ms 直发成功（sent:true，与 redirectToLogin 不同，本插件 dev 完全可验）。
- employee_card_map 无主键列，Drizzle RETURNING 只能用 custNum 等实际存在的列。
- 员工端深链：`https://${req.hostname}${CLIENT_BASE_PATH}/employee`，dev 下 hostname 是 localhost（仅测试可用）；生产 hostname 为公网域名。
- 已上线（2026-11-06）：release 7704977845445970953（commit 0a36236，19 秒 finished，error_logs 空，线上三入口 200、bundle `first-login-notify`/`jnh_pay_autologin` 字面量命中）；线上 22309 行 welcome_pushed=false，首次扫码授权即真实触发；待真机验证：收欢迎卡片 + 二扫幂等不重发。

## axiosForBackend 把 403 当成功响应 → 页面把错误体当数据渲染白屏（2026-11-16 修复）

- 现象：摊主首页 `MerchantHomePage` 渲染崩溃 `Cannot read properties of undefined (reading 'toFixed')`，`summary.netAmount` 为 undefined。
- 根因：sandbox stack 的 `axiosForBackend` 对 403 返回 fulfilled `AxiosResponse`，`client/src/api/index.ts` 的 `request()` 直接 `return response.data`，未绑定摊位时 403 的 `{error:{...}}` 被当成 `MerchantSummary` 塞进 state，字段全 undefined；页面 catch 里的 `httpStatus === 403` 分支永远不命中。
- 修复：`request()` 内判 `response.status === 403` 时抛 `ApiError(code, message, 403)`，让各页既有 403 分支（MerchantHomePage 跳门控、LedgerPage 提示）恢复生效。新增接口不要依赖「403 会抛错」，靠这个统一出口。

## 视觉基线 v3「饭票夹 · 清朗刻度」（2026-11-16 重做，取代 v2 雾白绿卡）

- 起因：用户明确反馈 v2「整体布局不好看、很小气、排版和分点不清楚」，要求互联网产品质感。v3 定为大字号/大卡/明确分组：页边距 20、卡间距 20、卡内 20、列表行 64（`.row-lg` 72）、固定底栏 52 胶囊主操作。
- 两色体系：主色墨绿 `hsl(158 44% 24%)` 承担全部操作；品牌绿 `hsl(88 58% 44%)` 只做 hero 渐变终点与正向金额；橙色点缀全站移除，禁止蓝色/橙色装饰。
- 版式原语全在 `jnh.css`：`.card/.card-flat/.group/.group-head/.group-title/.group-action/.row/.row-icon/.row-title/.row-sub/.row-value/.hero-card/.hero-amount/.hero-quick/.stat-grid/.chip/.note/.field-input/.btn(-sm)/.center-stage`；圆角 20/14/10。
- 字号只允许 11/13/15/17/20/28/40（`.t-caption` 13、`.t-body` 15），正文不得低于 15px；禁止 `text-[Npx]`；`--jnh-meta` 类已废弃不用。
- 允许新增结构性 DOM（分组标题、底栏 CTA、说明行、指标列）与结构性文案；业务逻辑/接口/路由/状态/业务文案仍一字不改。旧「只改类名不改结构」约束已废。
- 坑：`.row-sub` 默认单行截断，长说明加 `.row-sub-wrap`；固定底栏页面内容区必须 `pb-40`，否则末行被底栏遮挡（E2E 抓到过）。
- 坑：员工端 `identities().balance` 为 null 时显示 `¥--`（乐牛无该工号），不是缺陷；E2E 不要断言具体余额数字，否则假失败。
- 验收计划 `tmp/e2e-test/ui-layout-v3.json`（5 条，2026-11-16 全通过）；需看员工已绑定/摊主首页时临时插 `TESTUI01` 行与 `merchant_binding`，验完必须删除（本次已清）。

## 前端 request 主动抛的 ApiError 被二次包装成「网络异常」（2026-11-16 修复）

- 现象：未绑工号的员工打开 `/employee/me` 只看到「信息加载失败 / 网络异常，请稍后重试」，真实原因（403 未找到工卡映射）被吞，页面无任何出口。
- 根因：`client/src/api/index.ts` 的 `request` 在 try 内对 403 主动 `throw new ApiError(...)`，又落到自己的 catch 里按 `err.response` 解包——ApiError 没有 response，于是 code 变 `NETWORK_ERROR`、message 变兜底文案，业务码全丢。
- 修复：catch 首行 `if (error instanceof ApiError) throw error;`（全项目唯一 request 封装，改一处覆盖所有接口）。
- 伴修：`MyCodePage` 错误态区分 `FORBIDDEN/4004` → 「还没有绑定工卡」+「去绑定工卡」按钮，其它错误给「重新加载」。
- 排查提示：平台 `axiosForBackend` 把 403 作为 fulfilled 响应返回，所以 403 分支必须自己抛；任何在 try 里抛 ApiError 的封装都要防被同函数 catch 二次包装。

## 未绑卡员工仍请求 /api/me/orders 报 4004（2026-11-17 修复）

- 现象：未绑工号账号打开 `/employee/me`，控制台出现 `API /api/me/orders 失败: 4004 未找到工卡绑定`。
- 根因：`useBill(fetcher)` 挂载即拉账单，早于 `loadIdentity()` 判定未绑卡；页面已正确显示「还没有绑定工卡」，但白打一次失败请求 + 一条 error 日志。
- 修复：`useBill(fetcher, { enabled })` 加开关（`loading` 也随之受 enabled 约束），`MyCodePage` 传 `enabled: loadState === 'ready'`；`apiEmployee.identities` 增加 `expectedFailure`，未绑卡的 403 由 `logger.warn` 记录、不再按故障打 error。
- 排查提示：凡是「先拉列表、后判身份」的页面，都要用 enabled 门控，否则未就绪态必然产生误报错误日志。
