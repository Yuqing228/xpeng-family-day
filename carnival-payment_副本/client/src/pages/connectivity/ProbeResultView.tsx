// 链路诊断结果展示：结论卡 + 阶段时间线 + 请求/响应报文 + TLS 证书（历史详情复用）
import { toast } from 'sonner';
import type { LeopenProbeResult, LeopenProbeVerdict } from '@shared/api.interface';

/** verdict → 状态色与短标签（历史列表共用） */
export const VERDICT_META: Record<LeopenProbeVerdict, { color: string; short: string }> = {
  CONFIG_MISSING: { color: 'var(--jnh-warning)', short: '凭证未配置' },
  DNS_FAIL: { color: 'var(--jnh-danger)', short: 'DNS 解析失败' },
  TCP_FAIL: { color: 'var(--jnh-danger)', short: 'TCP 连不上' },
  TLS_FAIL: { color: 'var(--jnh-danger)', short: 'TLS 握手失败' },
  HTTP_TIMEOUT: { color: 'var(--jnh-danger)', short: 'HTTP 超时' },
  GATEWAY_DENIED: { color: 'var(--jnh-danger)', short: '后端鉴权拒绝' },
  BUSINESS_OK: { color: 'var(--jnh-success)', short: '链路全通' },
  BUSINESS_ERROR: { color: 'var(--jnh-warning)', short: '业务层报错' },
  HTTP_ERROR: { color: 'var(--jnh-warning)', short: '非预期响应' },
};

const STAGE_COLOR = { ok: 'var(--jnh-success)', fail: 'var(--jnh-danger)', skip: 'var(--jnh-surface-2)' } as const;

export function fmtProbeTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 接口短名（历史列表与概要行共用） */
export function targetShort(path?: string): string {
  if (!path) return 'customer/query';
  return path.replace('/tengyun-api/leopen/', '').replace('/leopen/', '');
}

function formatRequestLog(r: LeopenProbeResult): string {
  const lines: string[] = [`${r.requestLog.method} ${r.requestLog.url}`];
  for (const [k, v] of r.requestLog.headers) lines.push(`${k}: ${v}`);
  lines.push('', r.requestLog.body);
  if (r.requestLog.signStrMasked) {
    lines.push('', '# 签名串（appsecret 已脱敏）', r.requestLog.signStrMasked);
  }
  return lines.join('\n');
}

function formatResponseLog(r: LeopenProbeResult): string | null {
  if (!r.responseLog) return null;
  const head = `HTTP ${r.httpStatus} ${r.responseLog.statusText ?? ''}`.trim();
  const lines = [head];
  for (const [k, v] of r.responseLog.headers) lines.push(`${k}: ${v}`);
  lines.push('', r.responseLog.body, '', `# 共 ${r.responseLog.bytes} 字节`);
  return lines.join('\n');
}

function formatCert(r: LeopenProbeResult): string | null {
  if (!r.cert) return null;
  return [
    `subject: ${r.cert.subject}`,
    `issuer: ${r.cert.issuer}`,
    `valid: ${r.cert.validFrom} → ${r.cert.validTo}`,
    `protocol: ${r.cert.protocol}`,
  ].join('\n');
}

function extractAppid(r: LeopenProbeResult): string {
  try {
    const parsed = JSON.parse(r.requestLog.body) as { appid?: string };
    return parsed.appid ?? '';
  } catch {
    return '';
  }
}

function copyTrace(traceId: string): void {
  navigator.clipboard
    .writeText(traceId)
    .then(() => toast.success('已复制 trace-id，可直接发给小鹏运维'))
    .catch(() => toast.error('复制失败，请长按手动复制'));
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-1.5 mt-4 t-caption font-normal tracking-[0.32px] text-[var(--jnh-ink-subtle)] uppercase">{children}</div>
  );
}

export function ProbeResultView({ result }: { result: LeopenProbeResult }) {
  const meta = VERDICT_META[result.verdict];
  const responseText = formatResponseLog(result);
  const certText = formatCert(result);
  const appid = extractAppid(result);
  const controlsAllSame =
    !!result.controls && result.controls.length > 0 && result.controls.every((c) => c.sameAsMain);

  return (
    <div className="glass-card p-4">
      {/* 结论卡：状态竖条 + 判定标题 + 说明 + trace-id */}
      <div className="border-l-[3px] pl-3" style={{ borderColor: meta.color }}>
        <div className="t-title tracking-[0.16px] text-[var(--jnh-ink)]">{result.verdictText}</div>
        <p className="mt-1 t-caption leading-relaxed tracking-[0.16px] text-[var(--jnh-ink-muted)]">{result.verdictDetail}</p>
        {result.traceId && (
          <div className="mt-2 flex items-center gap-2">
            <span className="jnh-logblock flex-1 !py-1.5">x-trace-id: {result.traceId}</span>
            <button
              type="button"
              onClick={() => copyTrace(result.traceId as string)}
              className="jnh-btn-outline shrink-0 px-2.5 py-1.5 t-caption active:bg-[var(--jnh-primary-soft)]"
            >
              复制
            </button>
          </div>
        )}
      </div>

      {/* 概要行 */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--jnh-hairline)] pt-2.5 t-caption jnh-num text-[var(--jnh-ink-muted)]">
        <span>接口 {targetShort(result.targetPath)}</span>
        <span>总耗时 {result.totalMs}ms</span>
        {result.httpStatus !== undefined && <span>HTTP {result.httpStatus}</span>}
        <span>目标 IP {result.remoteIp ?? result.resolvedIp ?? '未解析'}</span>
        {result.sourceIp && (
          <span>
            源 IP {result.sourceIp}
            {result.sourcePort ? `:${result.sourcePort}` : ''}
          </span>
        )}
        {result.egressIp && <span>公网出口 IP {result.egressIp}</span>}
        <span>环境 {result.env}</span>
        <span>{fmtProbeTime(result.probedAt)}</span>
      </div>

      {/* 阶段时间线 */}
      <SectionTitle>链路阶段</SectionTitle>
      <div className="divide-y divide-[var(--jnh-hairline)] overflow-hidden rounded-xl bg-[var(--jnh-surface)]">
        {result.stages.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5 px-3 py-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0"
              style={{ background: STAGE_COLOR[s.status] }}
            />
            <div className="min-w-0 flex-1">
              <div className="t-meta text-[var(--jnh-ink)]">{s.label}</div>
              {s.info && <div className="jnh-logblock mt-1 !border-0 !bg-transparent !p-0">{s.info}</div>}
              {s.error && (
                <div className="mt-0.5 break-words t-caption leading-relaxed text-[var(--jnh-danger)]">{s.error}</div>
              )}
            </div>
            {s.ms !== undefined && <span className="shrink-0 t-caption jnh-num text-[var(--jnh-ink-muted)]">{s.ms}ms</span>}
          </div>
        ))}
      </div>

      {/* 业务方核对清单（仅后端鉴权拒绝场景） */}
      {result.verdict === 'GATEWAY_DENIED' && (
        <div className="mt-3 rounded-xl border-l-[3px] border-[var(--jnh-warning)] bg-[var(--jnh-warning-bg)] px-3 py-2.5">
          <div className="t-meta text-[var(--jnh-ink)]">需 leopen 业务方确认（可直接转发本页）</div>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 t-caption leading-relaxed text-[var(--jnh-ink-muted)]">
            <li>appid {appid || '（未取到）'} 是否已授权 customer/query 接口</li>
            <li>是否要求平台内部会话 / 登录态——已实测 header（X-Appid/X-Sign/Authorization/token）与 body 签名共 7 种变体均被同样拒绝，问题不在业务签名载体</li>
            <li>anniversary 域名 /leopen 入口的放行配置——coupon 成功链路走 reception-api 域名 + /canteen/tengyun-api 前缀，且对非白名单 IP 直接 403</li>
          </ol>
          <p className="mt-1.5 t-caption leading-relaxed text-[var(--jnh-ink-subtle)]">
            运维侧已复核：Nginx 转发正常（status 200 / upstream 63~68ms / 来源 IP 命中白名单），工单应在 leopen 业务方侧处理。
          </p>
        </div>
      )}
      {/* 对照实验 */}
      {result.controls && result.controls.length > 0 && (
        <>
          <SectionTitle>对照实验（响应一致 = 后端未读取请求体）</SectionTitle>
          <div className="divide-y divide-[var(--jnh-hairline)] overflow-hidden rounded-xl bg-[var(--jnh-surface)]" data-testid="probe-controls">
            {result.controls.map((c) => (
              <div key={c.label} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0"
                    style={{ background: c.sameAsMain ? 'var(--jnh-danger)' : 'var(--jnh-success)' }}
                  />
                  <span className="min-w-0 flex-1 t-meta text-[var(--jnh-ink)]">{c.label}</span>
                  <span className="shrink-0 t-caption jnh-num text-[var(--jnh-ink-muted)]">
                    {c.status ? `HTTP ${c.status}` : '失败'} · {c.bytes}B
                  </span>
                </div>
                <div className="mt-0.5 pl-4 t-caption text-[var(--jnh-ink-muted)]">
                  {c.requestSummary}
                  {c.sameAsMain ? ' · 与主请求响应一致（未读 body）' : ' · 响应不同（已读 body）'}
                </div>
              </div>
            ))}
          </div>
          {controlsAllSame && (
            <p className="mt-1.5 t-caption leading-relaxed text-[var(--jnh-danger)]">
              四种请求形态均返回同一拒绝页 → 后端在任何业务凭据（body 或 header）解析之前就拒绝了，拦截位于签名校验之前的鉴权 Filter。
            </p>
          )}
        </>
      )}

      <SectionTitle>请求报文</SectionTitle>
      <div className="jnh-logblock" data-testid="probe-request-log">
        {formatRequestLog(result)}
      </div>

      {/* 响应报文 */}
      {responseText && (
        <>
          <SectionTitle>响应报文</SectionTitle>
          <div className="jnh-logblock" data-testid="probe-response-log">
            {responseText}
          </div>
        </>
      )}

      {/* TLS 证书 */}
      {certText && (
        <>
          <SectionTitle>TLS 证书（握手验真所得）</SectionTitle>
          <div className="jnh-logblock">{certText}</div>
        </>
      )}
    </div>
  );
}
