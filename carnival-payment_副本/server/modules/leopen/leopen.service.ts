// LEOPEN 链路诊断：DNS → TCP → TLS → HTTP 全链路打点探测小鹏家年华网关。
// 每次结果落 leopen_probe_log；响应里的 x-trace-id 可直接提供给小鹏运维查网关 access log。
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { desc, eq } from 'drizzle-orm';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as tls from 'node:tls';
import * as https from 'node:https';
import * as crypto from 'node:crypto';
import { appConfig, leopenProbeLog } from '@server/database/schema';
import type {
  LeopenConfigRequest,
  LeopenConfigStatus,
  LeopenNetInfo,
  LeopenProbeHistoryItem,
  LeopenProbeResult,
  LeopenProbeStage,
  LeopenProbeTarget,
  LeopenProbeVerdict,
} from '@shared/api.interface';

const HOST = 'anniversary-homefair-api.x-peng.com';
/** 四个接口统一使用 version 5.43.4.12（2026-10-26 实测全部通过） */
const PROBE_VERSION = '5.43.4.12';

function shanghaiNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

interface ProbeContentContext {
  custNum: string;
  custId: string | null;
  macOrdId?: string;
}

/** 探测目标接口：content 按各接口契约构造 */
const PROBE_TARGETS: Record<
  LeopenProbeTarget,
  {
    path: string;
    buildContent: (ctx: ProbeContentContext) => Record<string, unknown>;
    /** 接口级 version 覆盖，缺省用 PROBE_VERSION（当前四接口统一 5.43.4.12，无需覆盖） */
    version?: string;
  }
> = {
  'order-state-query': {
    path: '/tengyun-api/leopen/order/state/query',
    // 默认查已成交的真实单号；需要核对其他单号时由入参覆盖
    buildContent: (ctx) => ({ macOrdId: ctx.macOrdId ?? ORDER_PROBE_DEFAULT_MAC_ORD_ID }),
  },
  'customer-query': {
    path: '/tengyun-api/leopen/customer/query',
    buildContent: (ctx) => ({ custNum: ctx.custNum }),
  },
  'account-balance-query': {
    path: '/tengyun-api/leopen/account/balance/query',
    // 后端只认 custId / custThirdId（传 mobile 会报 40004）；custId 由同一工号先查用户信息换取
    buildContent: (ctx) => (ctx.custId ? { custId: ctx.custId } : { custId: '0' }),
  },
  'pay-device': {
    path: '/tengyun-api/leopen/pay/device',
    // 契约：业务方 Apifox 12.1 下单支付(食堂)；content key 必须严格 ASCII 升序，服务端按同一规则重序列化后验签
    buildContent: (ctx) => ({
      amount: PAY_PROBE_AMOUNT,
      custId: ctx.custId ?? '0',
      macOrdId: newMacOrdId(),
      machineSn: PAY_PROBE_MACHINE_SN,
      nuClearMode: 2,
      ordTime: shanghaiNow(),
    }),
  },
};
/** 工卡扣款探测：金额固定 0 分（不扣员工钱），仅验证签名与字段口径；单号每次请求新生成 */
const PAY_PROBE_AMOUNT = 0;
const PAY_PROBE_MACHINE_SN = '5m6665785';
const newMacOrdId = (): string => `JNH1128-0001-${String(Date.now())}`;
/** 订单状态查询默认单号：首次真实扣款成功那笔 */
const ORDER_PROBE_DEFAULT_MAC_ORD_ID = 'JNH1128-0001-1792999666248';
const DNS_TIMEOUT_MS = 5_000;
const TCP_TIMEOUT_MS = 5_000;
const TLS_TIMEOUT_MS = 10_000;
const HTTP_TIMEOUT_MS = 15_000;

const VERDICT_TEXT: Record<LeopenProbeVerdict, { title: string; detail: string }> = {
  CONFIG_MISSING: {
    title: '凭证未配置',
    detail: '未读取到 appid / appsecret（环境变量与 app_config 均缺失），无法构建签名请求；请先在页面右上「接口配置」录入凭证',
  },
  DNS_FAIL: { title: '卡在 DNS 解析', detail: '域名解析失败或超时，请求未离开本机' },
  TCP_FAIL: { title: '卡在 TCP 连接', detail: '无法与目标 IP 建立 TCP 连接（本侧网络出口或对端防火墙拦截）' },
  TLS_FAIL: { title: '卡在 TLS 握手', detail: 'TCP 已通但 TLS 握手失败（证书校验不过或链路被劫持）' },
  HTTP_TIMEOUT: { title: '卡在 HTTP 响应超时', detail: '请求已发出，服务端在超时时间内未返回响应' },
  GATEWAY_DENIED: {
    title: '已到达后端 leopen 应用，被前置鉴权层拒绝',
    detail:
      'Nginx 已正常转发（运维 SLS 复核：status 200、upstream 63~68ms、来源 IP 全命中白名单）；拒绝页由后端鉴权 Filter 直接返回，签名校验尚未执行。已实测 body 与 header 两种鉴权载体共 7 种变体均被同样拒绝，问题不在业务签名。需转 leopen 业务方核对：① appid 是否已授权该 path；② 是否要求平台内部会话/登录态；③ anniversary 域名 /leopen 入口的放行配置（成功链路走 reception-api + /canteen/tengyun-api 前缀，非白名单 IP 会被 nginx 直接 403）',
  },
  BUSINESS_OK: { title: '全链路已通，业务层正常返回', detail: '请求已穿透网关并到达业务系统，响应为 JSON' },
  BUSINESS_ERROR: { title: '已穿透网关，业务层返回错误', detail: '请求已到达业务系统，但业务处理报错（详见响应报文，如签名 / 参数 / appid 问题）' },
  HTTP_ERROR: { title: '网关返回非预期响应', detail: 'HTTP 已完成但响应既非业务 JSON 也非已知拦截页，详见响应报文' },
};

interface Credentials {
  appid: string;
  appsecret: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms);
    }),
  ]);
}

@Injectable()
export class LeopenService {
  private readonly logger = new Logger(LeopenService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  /** 凭证：环境变量优先，app_config 兜底 */
  private async readCredentials(): Promise<{ creds: Credentials; source: LeopenConfigStatus['source'] } | null> {
    const envAppid = process.env.appid;
    const envAppsecret = process.env.appsecret;
    if (envAppid && envAppsecret) {
      return { creds: { appid: envAppid, appsecret: envAppsecret }, source: 'env' };
    }
    const rows = await this.db
      .select()
      .from(appConfig)
      .where(eq(appConfig.configKey, 'leopen_appid'));
    const secretRows = await this.db
      .select()
      .from(appConfig)
      .where(eq(appConfig.configKey, 'leopen_appsecret'));
    const appid = rows[0]?.configValue;
    const appsecret = secretRows[0]?.configValue;
    if (appid && appsecret) {
      return { creds: { appid, appsecret }, source: 'app_config' };
    }
    return null;
  }

  async configStatus(): Promise<LeopenConfigStatus> {
    const found = await this.readCredentials();
    return { source: found?.source ?? 'missing' };
  }

  /** 目标 IP + 本实例源 IP（页面一进来就能看到） */
  async netInfo(): Promise<LeopenNetInfo> {
    const [dns, egress] = await Promise.allSettled([
      withTimeout(lookup(HOST, { family: 4 }), DNS_TIMEOUT_MS, 'DNS 解析'),
      this.resolvePublicIp(),
    ]);
    return {
      host: HOST,
      targetIp: dns.status === 'fulfilled' ? dns.value.address : undefined,
      localIp: this.primaryLocalIp(),
      egressIp: egress.status === 'fulfilled' && egress.value ? egress.value : undefined,
      env: process.env.NODE_ENV === 'production' ? 'runtime' : 'dev',
    };
  }

  /** 本实例首个非回环网卡 IPv4（优先 10.x 内网段） */
  private primaryLocalIp(): string | undefined {
    const candidates: string[] = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const info of list ?? []) {
        if (info.family === 'IPv4' && !info.internal) candidates.push(info.address);
      }
    }
    return candidates.find((ip: string) => ip.startsWith('10.')) ?? candidates[0];
  }

  async updateConfig(req: LeopenConfigRequest): Promise<void> {
    const appid = (req?.appid || '').trim();
    const appsecret = (req?.appsecret || '').trim();
    if (!appid || !appsecret) {
      throw new Error('appid 与 appsecret 均不能为空');
    }
    await this.db
      .insert(appConfig)
      .values({ configKey: 'leopen_appid', configValue: appid })
      .onConflictDoUpdate({ target: appConfig.configKey, set: { configValue: appid } });
    await this.db
      .insert(appConfig)
      .values({ configKey: 'leopen_appsecret', configValue: appsecret })
      .onConflictDoUpdate({ target: appConfig.configKey, set: { configValue: appsecret } });
  }

  private buildStages(): LeopenProbeStage[] {
    return [
      { key: 'dns', label: 'DNS 解析', status: 'skip' },
      { key: 'tcp', label: 'TCP 连接', status: 'skip' },
      { key: 'tls', label: 'TLS 握手 / 证书验真', status: 'skip' },
      { key: 'request', label: 'HTTP 请求发出', status: 'skip' },
      { key: 'response', label: '响应接收', status: 'skip' },
    ];
  }

  private tcpConnect(ip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: ip, port: 443, family: 4 });
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', reject);
    });
  }

  private tlsProbe(
    ip: string,
  ): Promise<{ subject: string; issuer: string; validFrom: string; validTo: string; protocol: string }> {
    return new Promise((resolve, reject) => {
      const sock = tls.connect({ host: ip, port: 443, servername: HOST, rejectUnauthorized: true }, () => {
        const cert = sock.getPeerCertificate();
        const info = {
          subject: cert.subject?.CN ? `CN=${cert.subject.CN}` : '(未知)',
          issuer: cert.issuer?.O ? `O=${cert.issuer.O}${cert.issuer.CN ? `, CN=${cert.issuer.CN}` : ''}` : '(未知)',
          validFrom: new Date(cert.valid_from).toISOString(),
          validTo: new Date(cert.valid_to).toISOString(),
          protocol: sock.getProtocol() ?? '',
        };
        sock.destroy();
        resolve(info);
      });
      sock.once('error', reject);
    });
  }

  private publicIpCache: { ip: string | null; at: number } | null = null;

  /** 本服务出网公网 IP：依次试两个回显服务，失败返回 null（不阻断探测） */
  private async resolvePublicIp(): Promise<string | null> {
    const now = Date.now();
    if (this.publicIpCache && now - this.publicIpCache.at < 60_000) return this.publicIpCache.ip;
    let ip: string | null = null;
    for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip']) {
      try {
        const text = await withTimeout(this.httpGetText(url), 2_500, '出网 IP 查询');
        const trimmed = text.trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
          ip = trimmed;
          break;
        }
      } catch {
        // 回显服务不可达时继续试下一个
      }
    }
    this.publicIpCache = { ip, at: now };
    return ip;
  }

  private httpGetText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 3_000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => resolve(data));
      });
      req.on('timeout', () => {
        req.destroy(new Error('出网 IP 查询超时'));
      });
      req.on('error', reject);
    });
  }

  private httpProbe(
    body: string,
    timeoutMs: number = HTTP_TIMEOUT_MS,
    extraHeaders: [string, string][] = [],
    path: string = PROBE_TARGETS['customer-query'].path,
  ): Promise<{
    status: number;
    statusText: string;
    headers: [string, string][];
    bodyText: string;
    reqMs: number;
    totalMs: number;
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
  }> {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      let reqMs = 0;
      let localAddress: string | undefined;
      let localPort: number | undefined;
      let remoteAddress: string | undefined;
      const req = https.request(
        {
          host: HOST,
          port: 443,
          path,
          method: 'POST',
          servername: HOST,
          rejectUnauthorized: true,
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
            'Content-Length': String(Buffer.byteLength(body)),
            ...Object.fromEntries(extraHeaders),
          },
        },
        (res) => {
          const sock = res.socket ?? req.socket;
          localAddress = sock?.localAddress ?? undefined;
          localPort = sock?.localPort ?? undefined;
          remoteAddress = sock?.remoteAddress ?? undefined;
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? '',
              headers: Object.entries(res.headers)
                .filter(([, v]) => v != null)
                .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)] as [string, string]),
              bodyText: Buffer.concat(chunks).toString('utf8'),
              reqMs,
              totalMs: Math.round(performance.now() - start),
              localAddress,
              localPort,
              remoteAddress,
            });
          });
          res.on('error', reject);
        },
      );
      req.on('finish', () => {
        reqMs = Math.round(performance.now() - start);
      });
      req.on('timeout', () => {
        req.destroy(new Error(`HTTP 请求超时（${timeoutMs}ms）`));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private emptyRequestLog(url: string): LeopenProbeResult['requestLog'] {
    return { method: 'POST', url, headers: [], body: '', signStrMasked: '' };
  }

  /** 对照实验：body 三态 + header 鉴权变体，响应一致 = 后端未解析任何业务凭据 */
  private async runControls(
    mainStatus: number,
    mainBodyText: string,
    appid: string,
    content: string,
    auth: { sign: string; nonce: string; ts: string },
    path: string,
  ): Promise<LeopenProbeResult['controls']> {
    const cases: Array<{
      label: string;
      requestSummary: string;
      body: string;
      headers?: [string, string][];
    }> = [
      {
        label: '仅 appid + content（省略签名）',
        requestSummary: '无 sign / nonce / timestamp / version',
        body: JSON.stringify({ appid, content: JSON.parse(content) }),
      },
      { label: '空请求体', requestSummary: 'Content-Length: 0', body: '' },
      {
        label: 'header 携带签名 + 空 body',
        requestSummary: 'X-Appid / X-Sign / X-Nonce / X-Timestamp 置于 HTTP Header',
        body: '',
        headers: [
          ['X-Appid', appid],
          ['X-Sign', auth.sign],
          ['X-Nonce', auth.nonce],
          ['X-Timestamp', auth.ts],
          ['X-Signtype', 'md5'],
          ['X-Version', PROBE_VERSION],
        ],
      },
    ];
    const mainText = mainBodyText.trim();
    const results = await Promise.all(
      cases.map(async (c) => {
        try {
          const r = await this.httpProbe(c.body, 8_000, c.headers, path);
          const text = r.bodyText.trim();
          return {
            label: c.label,
            requestSummary: c.requestSummary,
            status: r.status,
            bytes: Buffer.byteLength(r.bodyText),
            sameAsMain: text === mainText,
            bodyPreview: text.slice(0, 80),
          };
        } catch {
          return {
            label: c.label,
            requestSummary: c.requestSummary,
            status: 0,
            bytes: 0,
            sameAsMain: false,
            bodyPreview: '(对照请求失败)',
          };
        }
      }),
    );
    return [
      {
        label: '完整签名（主探测）',
        requestSummary: '全量签名字段',
        status: mainStatus,
        bytes: Buffer.byteLength(mainBodyText),
        sameAsMain: true,
        bodyPreview: mainText.slice(0, 80),
      },
      ...results,
    ];
  }

  /** 余额查询需要真实 custId：先用同一工号查用户信息换取（失败时回退 custId=0，响应会报人员不存在） */
  private async resolveCustId(
    custNum: string,
    appid: string,
    appsecret: string,
  ): Promise<string | null> {
    try {
      const ts = String(Date.now());
      const nonce = `${ts}${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
      const content = JSON.stringify({ custNum });
      const signStr = `appid=${appid}&content=${content}&nonce=${nonce}&signtype=md5&timestamp=${ts}&version=${PROBE_VERSION}&appsecret=${appsecret}`;
      const sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
      const body = JSON.stringify({
        appid,
        content: JSON.parse(content),
        nonce,
        sign,
        signtype: 'md5',
        timestamp: ts,
        version: PROBE_VERSION,
      });
      const res = await this.httpProbe(body, HTTP_TIMEOUT_MS, [], PROBE_TARGETS['customer-query'].path);
      const parsed = JSON.parse(res.bodyText) as {
        data?: { customerList?: Array<{ custId?: string | number }> };
      };
      const custId = parsed.data?.customerList?.[0]?.custId;
      if (custId === undefined || custId === null) {
        this.logger.warn(`工号 ${custNum} 未查到用户，余额查询回退 custId=0`);
        return null;
      }
      return String(custId);
    } catch (error) {
      this.logger.warn(`工号 ${custNum} 换取 custId 失败：${String((error as Error).message ?? error)}`);
      return null;
    }
  }

  async probe(
    custNum: string,
    target: LeopenProbeTarget = 'order-state-query',
    macOrdId?: string,
  ): Promise<LeopenProbeResult> {
    const spec = PROBE_TARGETS[target];
    const targetPath = spec.path;
    const targetUrl = `https://${HOST}${targetPath}`;
    const t0 = performance.now();
    const sourceIpPromise = this.resolvePublicIp();
    const stages = this.buildStages();
    const found = await this.readCredentials();
    const env = process.env.NODE_ENV === 'production' ? 'runtime' : 'dev';

    if (!found) {
      return this.finish('CONFIG_MISSING', 'CONFIG_MISSING', stages, this.emptyRequestLog(targetUrl), t0, env);
    }
    const { appid, appsecret } = found.creds;

    // 阶段 1：DNS
    let resolvedIp = '';
    const dnsStart = performance.now();
    try {
      const res = await withTimeout(lookup(HOST, { family: 4 }), DNS_TIMEOUT_MS, 'DNS 解析');
      resolvedIp = res.address;
      stages[0] = { key: 'dns', label: 'DNS 解析', status: 'ok', ms: Math.round(performance.now() - dnsStart), info: res.address };
    } catch (error) {
      stages[0] = { key: 'dns', label: 'DNS 解析', status: 'fail', ms: Math.round(performance.now() - dnsStart), error: String((error as Error).message ?? error) };
      return this.finish('DNS_FAIL', 'DNS_FAIL', stages, this.emptyRequestLog(targetUrl), t0, env);
    }

    // 阶段 2：TCP
    const tcpStart = performance.now();
    try {
      await withTimeout(this.tcpConnect(resolvedIp), TCP_TIMEOUT_MS, 'TCP 连接');
      stages[1] = { key: 'tcp', label: 'TCP 连接', status: 'ok', ms: Math.round(performance.now() - tcpStart), info: `443 端口可达` };
    } catch (error) {
      stages[1] = { key: 'tcp', label: 'TCP 连接', status: 'fail', ms: Math.round(performance.now() - tcpStart), error: String((error as Error).message ?? error) };
      return this.finish('TCP_FAIL', 'TCP_FAIL', stages, this.emptyRequestLog(targetUrl), t0, env, resolvedIp);
    }

    // 阶段 3：TLS（证书验真）
    const tlsStart = performance.now();
    let certInfo: { subject: string; issuer: string; validFrom: string; validTo: string; protocol: string } | undefined;
    try {
      certInfo = await withTimeout(this.tlsProbe(resolvedIp), TLS_TIMEOUT_MS, 'TLS 握手');
      stages[2] = { key: 'tls', label: 'TLS 握手 / 证书验真', status: 'ok', ms: Math.round(performance.now() - tlsStart), info: `${certInfo.subject} · ${certInfo.protocol}` };
    } catch (error) {
      stages[2] = { key: 'tls', label: 'TLS 握手 / 证书验真', status: 'fail', ms: Math.round(performance.now() - tlsStart), error: String((error as Error).message ?? error) };
      return this.finish('TLS_FAIL', 'TLS_FAIL', stages, this.emptyRequestLog(targetUrl), t0, env, resolvedIp);
    }

    // 签名构建（官方三步规则，与 bash 探测脚本一致）
    const ts = String(Date.now());
    const nonce = `${ts}${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    const needCustId = target === 'account-balance-query' || target === 'pay-device';
    const custId = needCustId ? await this.resolveCustId(custNum, appid, appsecret) : null;
    const content = JSON.stringify(spec.buildContent({ custNum, custId, macOrdId }));
    const version = spec.version ?? PROBE_VERSION;
    const signStr = `appid=${appid}&content=${content}&nonce=${nonce}&signtype=md5&timestamp=${ts}&version=${version}&appsecret=${appsecret}`;
    const sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();
    const body = JSON.stringify({ appid, content: JSON.parse(content), nonce, sign, signtype: 'md5', timestamp: ts, version });
    const requestLog: LeopenProbeResult['requestLog'] = {
      method: 'POST',
      url: targetUrl,
      headers: [
        ['Content-Type', 'application/json'],
        ['Accept', 'application/json'],
        ['User-Agent', 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36'],
        ['Content-Length', String(Buffer.byteLength(body))],
      ],
      body,
      signStrMasked: `appid=${appid}&content=${content}&nonce=${nonce}&signtype=md5&timestamp=${ts}&version=${version}&appsecret=***`,
    };

    // 阶段 4/5：HTTP 请求 + 响应
    try {
      const httpResult = await this.httpProbe(body, HTTP_TIMEOUT_MS, [], targetPath);
      stages[3] = { key: 'request', label: 'HTTP 请求发出', status: 'ok', ms: httpResult.reqMs, info: `POST ${targetPath} · ${Buffer.byteLength(body)} bytes` };
      stages[4] = { key: 'response', label: '响应接收', status: 'ok', ms: httpResult.totalMs, info: `HTTP ${httpResult.status} · ${Buffer.byteLength(httpResult.bodyText)} bytes` };

      const contentType = httpResult.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
      const traceId = httpResult.headers.find(([k]) => k.toLowerCase() === 'x-trace-id')?.[1];

      let verdict: LeopenProbeVerdict;
      if (contentType.includes('json')) {
        let ok = true;
        try {
          const parsed = JSON.parse(httpResult.bodyText) as Record<string, unknown>;
          const code = parsed.code;
          // 小鹏 leopen 成功码存在 0 与 10000 两种写法（对接文档响应示例均为 10000 + msg 成功）
          ok =
            code === undefined ||
            code === 0 ||
            code === '0' ||
            code === 200 ||
            code === '200' ||
            code === 10000 ||
            code === '10000' ||
            parsed.success === true;
        } catch {
          ok = true;
        }
        verdict = ok ? 'BUSINESS_OK' : 'BUSINESS_ERROR';
      } else if (httpResult.bodyText.includes('无权限')) {
        verdict = 'GATEWAY_DENIED';
      } else {
        verdict = 'HTTP_ERROR';
      }

      const result = await this.finish(verdict, verdict, stages, requestLog, t0, env, resolvedIp, {
        httpStatus: httpResult.status,
        sourceIp: httpResult.localAddress,
        sourcePort: httpResult.localPort,
        remoteIp: httpResult.remoteAddress ?? resolvedIp,
        egressIp: (await sourceIpPromise) ?? undefined,
        traceId,
        responseLog: {
          statusText: httpResult.statusText,
          headers: httpResult.headers,
          body: httpResult.bodyText,
          bytes: Buffer.byteLength(httpResult.bodyText),
        },
        cert: certInfo,
        controls:
          verdict === 'GATEWAY_DENIED'
            ? await this.runControls(
                httpResult.status,
                httpResult.bodyText,
                appid,
                content,
                { sign, nonce, ts },
                targetPath,
              )
            : undefined,
      });
      return result;
    } catch (error) {
      const msg = String((error as Error).message ?? error);
      stages[3] = { key: 'request', label: 'HTTP 请求发出', status: 'fail', error: msg };
      const verdict: LeopenProbeVerdict = msg.includes('超时') ? 'HTTP_TIMEOUT' : 'HTTP_ERROR';
      return this.finish(verdict, verdict, stages, requestLog, t0, env, resolvedIp, { cert: certInfo });
    }
  }

  private async finish(
    verdict: LeopenProbeVerdict,
    detailKey: LeopenProbeVerdict,
    stages: LeopenProbeStage[],
    requestLog: LeopenProbeResult['requestLog'],
    t0: number,
    env: string,
    resolvedIp?: string,
    extra?: {
      httpStatus?: number;
      traceId?: string;
      responseLog?: LeopenProbeResult['responseLog'];
      cert?: LeopenProbeResult['cert'];
      controls?: LeopenProbeResult['controls'];
      sourceIp?: string;
      sourcePort?: number;
      remoteIp?: string;
      egressIp?: string;
    },
  ): Promise<LeopenProbeResult> {
    let targetPath = '';
    try {
      targetPath = new URL(requestLog.url).pathname;
    } catch {
      targetPath = '';
    }
    const targetKey = (Object.keys(PROBE_TARGETS) as LeopenProbeTarget[]).find(
      (k) => PROBE_TARGETS[k].path === targetPath,
    );
    let verdictDetail = VERDICT_TEXT[detailKey].detail;
    if (detailKey === 'GATEWAY_DENIED' && targetPath === PROBE_TARGETS['customer-query'].path) {
      verdictDetail +=
        ' 补充：customer/query 不在文档 §7-5 的接口授权清单内（清单仅 pay/device、order/state/query），可切换到 order/state/query 复验，以区分「path 未授权」与「平台鉴权」。';
    }
    if (extra?.controls && extra.controls.length > 0 && extra.controls.every((c) => c.sameAsMain)) {
      verdictDetail +=
        ' 对照实验：完整签名 / 省略签名 / 空请求体 / header 携带签名四种请求形态均返回完全一致的拒绝页，证明拦截发生在任何业务凭据（body 或 header）解析之前，位于签名校验之前的鉴权 Filter。';
    }
    const result: LeopenProbeResult = {
      verdict,
      target: targetKey,
      targetPath: targetPath || undefined,
      verdictText: VERDICT_TEXT[detailKey].title,
      verdictDetail,
      traceId: extra?.traceId,
      httpStatus: extra?.httpStatus,
      totalMs: Math.round(performance.now() - t0),
      probedAt: new Date().toISOString(),
      env,
      stages,
      requestLog,
      responseLog: extra?.responseLog,
      cert: extra?.cert,
      resolvedIp,
      sourceIp: extra?.sourceIp,
      sourcePort: extra?.sourcePort,
      remoteIp: extra?.remoteIp,
      egressIp: extra?.egressIp,
      controls: extra?.controls,
    };
    try {
      await this.db.insert(leopenProbeLog).values({
        verdict,
        httpStatus: extra?.httpStatus ?? null,
        traceId: extra?.traceId ?? null,
        totalMs: result.totalMs,
        detail: JSON.stringify(result),
      });
    } catch (error) {
      this.logger.error(`探测结果落库失败: ${String((error as Error).message ?? error)}`, (error as Error).stack);
    }
    return result;
  }

  async history(limit: number): Promise<LeopenProbeHistoryItem[]> {
    const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
    const rows = await this.db
      .select()
      .from(leopenProbeLog)
      .orderBy(desc(leopenProbeLog.createdAt))
      .limit(safeLimit);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      probe: JSON.parse(r.detail) as LeopenProbeResult,
    }));
  }
}
