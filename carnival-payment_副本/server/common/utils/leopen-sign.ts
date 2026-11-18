// LEOPEN 签名与序列化（纯函数，无 IO）：
// content 的 key 必须严格 ASCII 升序（服务端按同规则重序列化后验签，顺序不符必返 100042）
import * as crypto from 'node:crypto';

export const LEOPEN_HOST = 'anniversary-homefair-api.x-peng.com';
/** 真实入口前缀：缺 /tengyun-api 会被前置鉴权层直接返回「无权限访问该页面」 */
export const LEOPEN_PATH_PREFIX = '/tengyun-api/leopen';
/** 四接口统一 version（只参与 MD5 拼接，服务端不校验白名单） */
export const LEOPEN_VERSION = '5.43.4.12';

export interface LeopenCredentials {
  appid: string;
  appsecret: string;
}

export interface SignedLeopenRequest {
  body: string;
  /** 已用 *** 遮蔽 appsecret，仅用于日志 */
  signStrMasked: string;
  nonce: string;
  timestamp: string;
  version: string;
}

function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** content 按 key ASCII 升序重排（单层：四接口 content 均为一层） */
export function sortContentKeys(content: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(content).sort(compareAscii)) {
    sorted[key] = content[key];
  }
  return sorted;
}

/** 紧凑 JSON（无空格），key 已按 ASCII 升序 */
export function serializeContent(content: Record<string, unknown>): string {
  return JSON.stringify(sortContentKeys(content));
}

/** 北京时间 yyyy-MM-dd HH:mm:ss（pay/device 的 ordTime） */
export function shanghaiNow(now: Date = new Date()): string {
  return now.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

/** nonce = 时间戳 + 6 位随机，每次请求新生成 */
export function newNonce(now: number = Date.now()): string {
  return `${now}${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
}

export function md5Upper(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

export function buildSignedRequest(
  creds: LeopenCredentials,
  content: Record<string, unknown>,
  version: string = LEOPEN_VERSION,
): SignedLeopenRequest {
  const timestamp = String(Date.now());
  const nonce = newNonce();
  const serialized = serializeContent(content);
  const signStr =
    `appid=${creds.appid}&content=${serialized}&nonce=${nonce}` +
    `&signtype=md5&timestamp=${timestamp}&version=${version}&appsecret=${creds.appsecret}`;
  const sign = md5Upper(signStr);
  const body = JSON.stringify({
    appid: creds.appid,
    content: JSON.parse(serialized) as Record<string, unknown>,
    nonce,
    sign,
    signtype: 'md5',
    timestamp,
    version,
  });
  return {
    body,
    signStrMasked:
      `appid=${creds.appid}&content=${serialized}&nonce=${nonce}` +
      `&signtype=md5&timestamp=${timestamp}&version=${version}&appsecret=***`,
    nonce,
    timestamp,
    version,
  };
}

/** 扣款单号：JNH1128-0001-<毫秒时间戳>（每次请求新生成） */
export function newMacOrdId(now: number = Date.now()): string {
  return `JNH1128-0001-${String(now)}`;
}

/** 退款单号（台账 id + 北京时间 HHmmss 派生；拒绝后重新申请生成新单号仍唯一）：JNH1128R-<摊位号>-<id 补零 7 位>-<HHmmss> */
export function newRefundMacOrdId(passCode: string, id: number): string {
  const bj = new Date(Date.now() + 8 * 3600_000);
  const hhmmss = [bj.getUTCHours(), bj.getUTCMinutes(), bj.getUTCSeconds()]
    .map((n: number) => String(n).padStart(2, '0'))
    .join('');
  return `JNH1128R-${passCode}-${String(id).padStart(7, '0')}-${hhmmss}`;
}
