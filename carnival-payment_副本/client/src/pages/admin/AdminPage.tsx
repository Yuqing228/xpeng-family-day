// 管理员后台：检索 → 核查 → 执行退款（唯一入口）+ 净额结算 + 导出 + 配置（活动窗口 D-1 落点）
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiAdmin as adminApi } from '@client/src/api';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { EmptyState, EmptyIcons } from '@client/src/components/jnh/interactive';
import { GradientAmount } from '@client/src/components/jnh/kit';
import { AppHeader } from '@client/src/components/jnh/AuroraShell';
import { Skeleton } from '@client/src/components/ui/skeleton';
import type { AdminStall, AdminTxnDetail, AppConfigDTO, RefundResponse, SettlementRow } from '@shared/api.interface';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { usePageTitle } from '@client/src/hooks/usePageTitle';

type Tab = 'refund' | 'stalls' | 'settlement' | 'config';

export default function AdminPage() {
  usePageTitle('家年华支付 · 管理后台');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userName, setUserName] = useState('');
  const [tab, setTab] = useState<Tab>('refund');

  useEffect(() => {
    adminApi
      .session()
      .then((s) => {
        setIsAdmin(s.isAdmin);
        setUserName(s.userName || '');
      })
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) {
    return (
      <div className="min-h-dvh">
        <div className="mx-auto max-w-md space-y-3 px-5 pt-6">
          <Skeleton className="h-16 w-full rounded-[20px]" />
          <Skeleton className="h-28 w-full rounded-[20px]" />
          <Skeleton className="h-14 w-full rounded-[14px]" />
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-16">
          <div className="card p-5">
            <div className="t-heading text-[var(--jnh-ink)]">需要管理员权限</div>
            <p className="t-caption mt-2 text-[var(--jnh-ink-muted)]">
              这个页面仅对白名单管理员开放。如需处理退款、结算或活动配置，请联系现场项目组开通。
            </p>
            <Link
              to="/employee"
              className="jnh-btn-primary mt-5 flex w-full items-center justify-center"
            >
              返回员工端
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jnh-page min-h-dvh">
      <AppHeader title="管理员后台" subtitle={`退款处理 · 结算对账 · 管理员：${userName}`} />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="jnh-admin-band glass-card mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex gap-1.5">
            {(
              [
                ['refund', '退款处理'],
                ['stalls', '摊位口令'],
                ['settlement', '结算对账'],
                ['config', '活动配置'],
              ] as Array<[Tab, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-3 py-1.5 t-meta font-medium ${
                  tab === t
                    ? 'border-[var(--jnh-primary)] text-[var(--jnh-strong)]'
                    : 'border-[var(--jnh-hairline)] text-[var(--jnh-ink-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'refund' && <RefundPanel />}
        {tab === 'stalls' && <StallsPanel />}
        {tab === 'settlement' && <SettlementPanel />}
        {tab === 'config' && <ConfigPanel />}
      </div>
    </div>
  );
}

/* ---------- 退款面板 ---------- */

function RefundPanel() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminTxnDetail[] | null>(null);
  const [selected, setSelected] = useState<AdminTxnDetail | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<RefundResponse | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const rows = await adminApi.search(q.trim());
      setResults(rows);
      setSelected(null);
      if (rows.length === 1) setSelected(rows[0]);
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await adminApi.refund({ txnNo: selected.txnNo, reason });
      setLastResult(res);
      toast[res.result === 'refunded' ? 'success' : 'info'](res.message);
      await search();
      if (selected) {
        try {
          setSelected(await adminApi.txnDetail(selected.txnNo));
        } catch {
          setSelected(null);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="t-title text-[var(--jnh-ink)]">退款处理（唯一入口）</div>
        <p className="mt-1 t-caption text-[var(--jnh-ink-subtle)]">
          摊主端与家人端无任何退款入口；边界核查：活动当天内 + 状态「成功」+ 未重复退款，按原单号幂等冲正、原路退回工卡。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            placeholder="单号 / 员工 / 摊位 / 工卡 UID"
            className="min-w-[220px] flex-1 rounded-xl border border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] px-3 py-2 font-mono t-meta outline-none focus:border-[var(--jnh-primary)]"
          />
          <button
            onClick={search}
            disabled={busy}
            className="jnh-btn-outline px-4 py-2 t-meta font-medium disabled:opacity-60"
          >
            查询
          </button>
        </div>
        {results && results.length === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--jnh-hairline)]">
            <EmptyState icon={EmptyIcons.search} text="未找到匹配交易，可按单号 / 员工 / 摊位 / 工卡 UID 检索" />
          </div>
        )}
        {results && results.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max t-meta">
              <thead>
                <tr className="border-b border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] text-left t-caption text-[var(--jnh-ink-subtle)]">
                  <th className="py-2.5 pr-3">交易单号</th>
                  <th className="py-2.5 pr-3">员工 · 付款人</th>
                  <th className="py-2.5 pr-3">摊位</th>
                  <th className="py-2.5 pr-3">操作人</th>
                  <th className="py-2.5 pr-3">金额</th>
                  <th className="py-2.5 pr-3">状态</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.txnNo} className={`border-b border-[var(--jnh-hairline)] hover:bg-[var(--jnh-primary-soft)] ${selected?.txnNo === r.txnNo ? 'bg-[var(--jnh-primary-soft)]' : ''}`}>
                    <td className="py-2.5 pr-3 font-mono">{r.txnNo}</td>
                    <td className="py-2.5 pr-3">
                      {r.employeeName} · {r.payerIdentity}
                    </td>
                    <td className="py-2.5 pr-3">{r.stallName}</td>
                    <td className="py-2.5 pr-3">{r.operatorName}</td>
                    <td className="py-2.5 pr-3 jnh-num">¥{r.amount.toFixed(2)}</td>
                    <td className="py-2.5 pr-3">{statusText(r.status)}</td>
                    <td className="py-2.5">
                      <button onClick={() => setSelected(r)} className="rounded-full border border-[var(--jnh-hairline)] px-2.5 py-0.5 t-caption font-semibold text-[var(--jnh-ink-muted)]">
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="glass-card p-5">
          <div className="t-title text-[var(--jnh-ink)]">
            交易详情 · <span className="font-mono t-caption">{selected.txnNo}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <Kv k="付款人" v={`${selected.employeeName} · ${selected.payerIdentity}（工卡 ${selected.cardUid}）`} />
            <Kv k="摊位 / 收款摊主" v={`${selected.stallName} · ${selected.operatorName}`} />
            <Kv k="金额 / 状态" v={`¥${selected.amount.toFixed(2)} · ${statusText(selected.status)}`} />
            <Kv k="时间" v={new Date(selected.txnTime).toLocaleString('zh-CN')} />
            {selected.relatedTxnNo && <Kv k="关联原单" v={selected.relatedTxnNo} />}
            {selected.remark && <Kv k="备注" v={selected.remark} />}
          </div>
          {selected.status === 'success' && selected.amount > 0 && (
            <>
              <div className="mt-3">
                <div className="t-caption font-medium text-[var(--jnh-ink-muted)]">退款原因（留痕到台账）</div>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 100))}
                  placeholder="如：金额输错"
                  className="mt-1 w-full rounded-xl border border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] px-3 py-2 t-meta outline-none focus:border-[var(--jnh-primary)]"
                />
              </div>
              <button
                onClick={refund}
                disabled={busy || reason.trim().length < 2}
                className="jnh-btn-danger mt-3 w-full py-3 t-body disabled:bg-[var(--jnh-surface-2)] disabled:text-[var(--jnh-ink-subtle)]"
              >
                执行退款（原路退回工卡）
              </button>
              <p className="mt-2 t-caption leading-relaxed text-[var(--jnh-ink-subtle)]">
                执行后原单标记「已撤销」、追加冲正行（操作摊主 = 本管理员）；家人 H5 刷新即见退回金额。摊主与家人端无任何退款入口。
              </p>
            </>
          )}
          {selected.status === 'refund_pending' && (
            <div className="mt-3">
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await adminApi.resolvePending(selected.txnNo);
                    toast[res.result === 'refunded' ? 'success' : 'info'](res.message);
                    setLastResult(res);
                    setSelected(await adminApi.txnDetail(selected.txnNo));
                  } catch (err) {
                    toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="w-full rounded-full bg-[var(--jnh-warning-bg)] py-3 t-body font-medium text-[var(--jnh-warning-ink)] disabled:opacity-60"
              >
                待处理补录（线下核对后完成冲正）
              </button>
            </div>
          )}
        </div>
      )}

      {lastResult && (
        <div
          className={`rounded-2xl px-5 py-4 t-meta leading-relaxed ${
            lastResult.result === 'refunded'
              ? 'bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]'
              : lastResult.result === 'pending'
                ? 'bg-[var(--jnh-warning-bg)] text-[var(--jnh-warning-ink)]'
                : 'bg-[var(--jnh-surface-1)] text-[var(--jnh-danger)]'
          }`}
        >
          {lastResult.message}
          {lastResult.reversalTxnNo && (
            <div className="mt-1 font-mono t-caption">冲正单号：{lastResult.reversalTxnNo}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 摊位口令面板（口令发放唯一出口） ---------- */

function StallsPanel() {
  const [rows, setRows] = useState<AdminStall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wbRunning, setWbRunning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.stalls());
    } catch (err) {
      setError(getErrorMessage(err, '口令清单加载失败，请稍后重试'));
    }
  }, []);

  const runWriteback = useCallback(async () => {
    setWbRunning(true);
    try {
      const r = await adminApi.writeback();
      toast.success(
        r.failed > 0
          ? `写回完成：成功 ${r.updated}/${r.total}，失败 ${r.failed}`
          : `写回完成：成功 ${r.updated}/${r.total}`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setWbRunning(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="t-title text-[var(--jnh-ink)]">摊位口令清单</div>
          <p className="mt-1 t-caption text-[var(--jnh-ink-subtle)]">
            口令为 4 位随机码、区分大小写；仅本页与摊主绑定校验可读，Base 已不再保存口令。换码后历史口令全部失效，收款码不受影响。
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="jnh-btn-outline px-3 py-1.5 t-caption font-medium">
            ↻ 刷新
          </button>
          <button
            onClick={() => void runWriteback()}
            disabled={wbRunning}
            aria-label="立即写回多维表格"
            className="jnh-btn-primary px-3 py-1.5 t-caption font-medium disabled:opacity-50"
          >
            {wbRunning ? '写回中…' : '立即写回多维表'}
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2 t-caption text-[var(--jnh-danger)]">
          <span>{error}</span>
          <button onClick={load} className="jnh-btn-outline px-2 py-0.5 t-caption font-medium">
            重试
          </button>
        </div>
      )}
      {rows && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-max t-meta">
            <thead>
              <tr className="border-b border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] text-left t-caption text-[var(--jnh-ink-subtle)]">
                <th className="py-2.5 pr-3">摊位名称</th>
                <th className="py-2.5 pr-3">摊主编码</th>
                <th className="py-2.5 pr-3">摊主口令</th>
                <th className="py-2.5 pr-3">收款码 Token</th>
                <th className="py-1.5">状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-[var(--jnh-ink-subtle)]">
                    暂无摊位（Base 同步后自动出现）
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.passCode} className="border-b border-[var(--jnh-hairline)] hover:bg-[var(--jnh-primary-soft)]">
                  <td className="py-2.5 pr-3 font-semibold">{r.stallName}</td>
                  <td className="py-2.5 pr-3 jnh-num">{r.merchantCode ?? '—'}</td>
                  <td className="py-2.5 pr-3 font-mono t-meta font-semibold tracking-widest">{r.passCode}</td>
                  <td className="py-2.5 pr-3 font-mono t-caption text-[var(--jnh-ink-subtle)]">{r.staticToken}</td>
                  <td className="py-2.5">{r.status === 'ACTIVE' ? '正常' : r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- 结算面板 ---------- */

function SettlementPanel() {
  const [rows, setRows] = useState<SettlementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.settlement());
    } catch (err) {
      setError(getErrorMessage(err, '结算数据加载失败，请稍后重试'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="t-title text-[var(--jnh-ink)]">净额结算（今日）</div>
          <p className="mt-1 t-caption text-[var(--jnh-ink-subtle)]">抽成 = （成功流水 − 冲正退回）× 20%；失败/待处理行不进统计。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="jnh-btn-outline px-3 py-1.5 t-caption font-medium">
            ↻ 刷新
          </button>
          <UniversalLink
            to={adminApi.exportUrl('settlement')}
            className="jnh-btn-outline px-3 py-1.5 t-caption font-medium"
          >
            导出结算 CSV
          </UniversalLink>
          <UniversalLink
            to={adminApi.exportUrl('ledger')}
            className="jnh-btn-outline px-3 py-1.5 t-caption font-medium"
          >
            导出台账 CSV
          </UniversalLink>
        </div>
      </div>
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2 t-caption text-[var(--jnh-danger)]">
          <span>{error}</span>
          <button onClick={load} className="jnh-btn-outline px-2 py-0.5 t-caption font-medium">
            重试
          </button>
        </div>
      )}
      {rows && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-max t-meta">
            <thead>
              <tr className="border-b border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] text-left t-caption text-[var(--jnh-ink-subtle)]">
                <th className="py-2.5 pr-3">摊位</th>
                <th className="py-2.5 pr-3">成功流水</th>
                <th className="py-2.5 pr-3">冲正退回</th>
                <th className="py-2.5 pr-3">净流水</th>
                <th className="py-2.5 pr-3">抽成 20%</th>
                <th className="py-1.5">预计到手</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[var(--jnh-ink-subtle)]">
                    今日暂无流水
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.stallNo} className="border-b border-[var(--jnh-hairline)] hover:bg-[var(--jnh-primary-soft)]">
                  <td className="py-2.5 pr-3 font-semibold">
                    {r.stallNo} · {r.stallName}
                  </td>
                  <td className="py-2.5 pr-3 jnh-num">¥{r.successAmount.toFixed(2)} · {r.txCount} 笔</td>
                  <td className="py-2.5 pr-3 jnh-num">¥{r.refundAmount.toFixed(2)} · {r.refundCount} 笔</td>
                  <td className="py-2.5 pr-3 font-medium jnh-num">¥{r.netAmount.toFixed(2)}</td>
                  <td className="py-2.5 pr-3 jnh-num">¥{r.commission.toFixed(2)}</td>
                  <td className="py-2 font-medium jnh-num"><GradientAmount gold value={r.takeHome.toFixed(2)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- 配置面板（活动窗口 D-1 落点，任务 1.4/8.5） ---------- */

function ConfigPanel() {
  const [config, setConfig] = useState<AppConfigDTO | null>(null);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const c = await adminApi.config();
    setConfig(c);
    setWindowStart(c.eventWindow.start);
    setWindowEnd(c.eventWindow.end);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => toast.error(getErrorMessage(err, '配置加载失败，请稍后重试')));
  }, [load]);

  const toLocalInput = (iso: string) => new Date(iso).toISOString().slice(0, 16);

  const saveWindow = async () => {
    setSaving(true);
    try {
      const value = JSON.stringify({ start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString() });
      await adminApi.updateConfig('event_window', value);
      toast.success('活动时间窗口已更新');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <div className="t-title text-[var(--jnh-ink)]">活动配置</div>
      <p className="mt-1 t-caption text-[var(--jnh-ink-subtle)]">
        活动时间窗口外，付款码访问与扣款请求一律拒绝并提示失效（D-1 22:00 ～ 活动日 24:00）。
      </p>
      {config && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="t-caption font-medium text-[var(--jnh-ink-muted)]">窗口开始</span>
              <input
                type="datetime-local"
                value={toLocalInput(windowStart)}
                onChange={(e) => setWindowStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] px-3 py-2 t-meta outline-none focus:border-[var(--jnh-primary)]"
              />
            </label>
            <label className="block">
              <span className="t-caption font-medium text-[var(--jnh-ink-muted)]">窗口结束</span>
              <input
                type="datetime-local"
                value={toLocalInput(windowEnd)}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] px-3 py-2 t-meta outline-none focus:border-[var(--jnh-primary)]"
              />
            </label>
          </div>
          <button
            onClick={saveWindow}
            disabled={saving}
            className="jnh-btn-primary mt-3 px-5 py-2.5 t-meta disabled:opacity-60"
          >
            保存活动窗口
          </button>
          <div className="mt-4 grid grid-cols-2 gap-2 t-caption text-[var(--jnh-ink-muted)] sm:grid-cols-4">
            <Kv k="二维码策略" v={config.qrRefreshPolicy} />
            <Kv k="抽成比例" v={`${config.commissionRate * 100}%`} />
            <Kv k="家人上限" v={`${config.familyLimit} 位`} />
            <Kv k="乐牛模式" v={config.leniuMode === 'mock' ? 'mock（联调前）' : 'http（真实接口）'} />
          </div>
        </>
      )}
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-[var(--jnh-hairline)] py-1.5 t-meta">
      <span className="shrink-0 text-[var(--jnh-ink-subtle)]">{k}</span>
      <span className="text-right font-semibold text-[var(--jnh-ink)]">{v}</span>
    </div>
  );
}

function statusText(status: string): string {
  return { success: '成功', revoked: '已撤销', refund_pending: '撤销待处理', processing: '处理中', failed: '失败' }[status] || status;
}
