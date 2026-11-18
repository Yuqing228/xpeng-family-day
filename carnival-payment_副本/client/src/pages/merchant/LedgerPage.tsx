// 摊位台账：汇总指标 + 只读明细 + CSV 导出
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { apiMerchant, ApiError } from '@client/src/api';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import { formatTime, STATUS_LABELS } from '@client/src/components/jnh/BillSection';
import { PullToRefresh, EmptyState, EmptyIcons } from '@client/src/components/jnh/interactive';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import type { MerchantLedgerRow, MerchantSummary } from '@shared/api.interface';

export default function LedgerPage() {
  usePageTitle('家年华支付 · 摊位台账');
  const navigate = useNavigate();
  const [rows, setRows] = useState<MerchantLedgerRow[]>([]);
  const [summary, setSummary] = useState<MerchantSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [r, s] = await Promise.all([apiMerchant.ledger(), apiMerchant.summary()]);
      setRows(r);
      setSummary(s);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 403) {
        navigate('/merchant', { replace: true });
        return;
      }
      setError(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { downloadUrl } = await apiMerchant.exportLedger();
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.click();
      toast.success('台账已生成，正在下载');
    } catch (err) {
      toast.error(getErrorMessage(err, '导出失败，请稍后重试'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <AuroraShell
      title={summary ? `${summary.stallName} · 今日台账` : '摊位台账'}
      subtitle="本摊流水 · 只读明细"
      bottom={
        <button onClick={() => void exportCsv()} disabled={exporting} className="jnh-btn-primary w-full disabled:opacity-60">
          <Download size={18} strokeWidth={2} />
          {exporting ? '正在生成台账…' : '导出台账 CSV'}
        </button>
      }
    >
      <PullToRefresh onRefresh={load} refreshing={refreshing}>
        {error && (
          <div className="card mb-4 p-5">
            <p className="t-body font-semibold text-[var(--jnh-ink)]">台账加载失败</p>
            <p className="t-caption mt-2 break-words text-[var(--jnh-danger)]">{error}</p>
            <button onClick={() => void load()} className="jnh-btn-outline mt-4 w-full">
              重新加载
            </button>
          </div>
        )}

        {summary && (
          <div className="card merchant-income-card overflow-hidden">
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-value">¥{summary.netAmount.toFixed(2)}</div>
                <div className="stat-label">净流水 · {summary.txCount} 笔</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">¥{summary.refundAmount.toFixed(2)}</div>
                <div className="stat-label">退款 · {summary.refundCount} 笔</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">¥{summary.commission.toFixed(2)}</div>
                <div className="stat-label">抽成 {Math.round(summary.commissionRate * 100)}%</div>
              </div>
            </div>
            <div className="income-takehome flex items-center justify-between px-5 py-4">
              <span className="t-body font-semibold text-[var(--jnh-ink)]">预计到手</span>
              <span className="t-display jnh-num text-[var(--jnh-ink)]">¥{summary.takeHome.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="group card ledger-detail-card mt-6">
          <div className="group-head">
            <span className="group-title">
              明细
            </span>
            <span className="t-caption text-[var(--jnh-ink-subtle)]">只读 · 无退款入口</span>
          </div>
          <div className="ledger-detail-list list overflow-hidden">
            {rows.length === 0 && !refreshing && (
              <EmptyState icon={EmptyIcons.coins} text="今日暂无流水" actionLabel="刷新看看" onAction={load} />
            )}
            {rows.map((r) => (
              <div key={r.txnNo} className="row">
                <div className="row-main">
                  <div
                    className={`row-title ${
                      r.status === 'revoked' ? 'text-[var(--jnh-ink-subtle)] line-through' : ''
                    }`}
                  >
                    {r.payerIdentity}
                  </div>
                  <div className="row-sub">
                    {formatTime(r.txnTime)} · {r.employeeName} · {r.operatorName}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`row-value ${
                      r.status === 'revoked' ? 'text-[var(--jnh-ink-subtle)] line-through' : 'row-value-pos'
                    }`}
                  >
                    ¥{r.amount.toFixed(2)}
                  </span>
                  <StatusTag status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <HintText>口径同首页（净额）；退款实时弹出待确认</HintText>
      </PullToRefresh>
    </AuroraShell>
  );
}

function StatusTag({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const cls =
    status === 'success'
      ? 'chip chip-ok'
      : status === 'refund_pending'
        ? 'chip chip-warn'
        : status === 'failed'
          ? 'chip chip-danger'
          : 'chip';
  return <span className={cls}>{label}</span>;
}
