# 家年华支付 · 本地版

双击 `start-local.command`。首次启动需要联网安装 npm 依赖，随后访问 http://localhost:5173/employee?unbound=1 。关闭终端会停止服务。

源码来自妙搭项目的 Download All 导出，原始 client、server、shared 均保留。
`local/` 是独立的本地预览入口与 API 演示适配层，不依赖飞书登录，不请求线上支付接口。

原页面路由全部保留。桌面左侧提供切换入口，手机宽度下入口位于页面顶部。

| 页面 | 本地路径 |
|---|---|
| 绑定工卡（截图状态） | /employee?unbound=1 |
| 员工首页 | /employee |
| 创建家人 | /employee/create |
| 分享家人 | /employee/share/demo-family |
| 我的付款 | /employee/me |
| 员工账单 | /employee/bill/DEMO-001 |
| 家人页 | /f/demo-family |
| 家人账单 | /f/demo-family/bill/DEMO-001 |
| 摊主绑定 | /merchant?unbound=1 |
| 摊主首页 | /merchant/home |
| 收款码 | /merchant/qrcode |
| 摊主台账 | /merchant/ledger |
| 扫码付款 | /pay?s=ST-demo-local |

本地使用演示员工、家人、账单及余额；添加家人的演示数据仅存当前浏览器 localStorage。不执行真实交易，退款与线上导出等操作未接通。原生产后端仍需妙搭运行时、数据库、身份与接口配置，不能直接在普通本地环境完整运行。

当前验证状态：源码已导出、本地入口已配置。由于执行环境无法解析 registry.npmjs.org，npm 依赖未安装，因此尚未完成构建及浏览器渲染验证。

手动启动：

```sh
cd local
npm install --ignore-scripts --no-audit --no-fund
npm run dev
```

构建本地预览：`cd local && npm run build`。
