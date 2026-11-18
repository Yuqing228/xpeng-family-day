// 全家账单 v3：分组卡行 + 骨架屏 + 空状态 + ↻ 旋转（↻ 手动刷新红线保留，PTR 由页面层叠加）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { BillResponse, BillItemDTO } from '@shared/api.interface';
import { SkeletonList } from './kit';
import { EmptyState, EmptyIcons } from './interactive';

export const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  revoked: '已撤销',
  refund_pending: '退款待确认',
  processing: '处理中',
  failed: '失败',
};

export function BillSection({
  transactions,
  onRefresh,
  refreshing,
  detailPath,
  cardLabel,
  loading,
  error,
}: {
  balance: number | null;
  transactions: BillItemDTO[];
  onRefresh: () => void;
  refreshing: boolean;
  detailPath: (txnNo: string) => string;
  cardLabel?: string;
  loading?: boolean;
  /** 账单加载失败文案（调用方用 getErrorMessage 转好传入），不清空已有数据 */
  error?: string | null;
}) {
  const navigate = useNavigate();
  const [spin, setSpin] = useState(0);
  const doRefresh = () => {
    setSpin((s) => s + 1);
    onRefresh();
  };
  return (
    <div className="group bill-section-card mt-6">
      <div className="group-head">
        <span className="group-title">
          {cardLabel || '全家账单'}

        </span>
        <button
          onClick={doRefresh}
          disabled={refreshing}
          aria-label="刷新账单"
          className="group-action disabled:opacity-60"
        >
          <RefreshCw size={14} key={spin} className={spin > 0 && refreshing ? 'jnh-rotate' : ''} strokeWidth={2.2} />
          {refreshing ? '刷新中' : '刷新'}
        </button>
      </div>
      {loading && transactions.length === 0 ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="bill-section-list list overflow-hidden">
          {error && (
            <div className="flex items-center justify-between gap-3 bg-[var(--jnh-warning-bg)] px-5 py-4">
              <div className="min-w-0">
                <p className="t-body font-semibold text-[var(--jnh-warning-ink)]">账单加载失败</p>
                <p className="t-caption mt-0.5 truncate text-[var(--jnh-warning-ink)] opacity-80">{error}</p>
              </div>
              <button
                onClick={doRefresh}
                disabled={refreshing}
                className="t-caption shrink-0 rounded-full bg-[var(--jnh-surface)] px-3 py-1.5 font-semibold text-[var(--jnh-warning-ink)] disabled:opacity-60"
              >
                {refreshing ? '刷新中' : '重试'}
              </button>
            </div>
          )}
          {transactions.length === 0 && !error && (
            <EmptyState
              icon={EmptyIcons.bill}
              text="暂无消费记录，家人消费后刷新即见"
              actionLabel="刷新看看"
              onAction={doRefresh}
            />
          )}
          {transactions.map((t) => (
            <button key={t.txnNo} onClick={() => navigate(detailPath(t.txnNo))} className="row">
              <div className="row-main">
                <div
                  className={`row-title ${
                    t.status === 'revoked' ? 'text-[var(--jnh-ink-subtle)] line-through' : ''
                  }`}
                >
                  {t.stallName}
                </div>
                <div className="row-sub">
                  {formatTime(t.txnTime)} · {t.payerIdentity}
                  {t.status === 'revoked' && ' · 已撤销'}
                  {t.status === 'refund_pending' && ' · 退款待确认'}
                  {isFresh(t.txnTime) && <span className="chip chip-warn ml-1.5">刚刚</span>}
                </div>
              </div>
              <div className="bill-row-amount">
              <span
                className={`row-value ${
                  t.status === 'revoked'
                    ? 'text-[var(--jnh-ink-subtle)] line-through'
                    : t.status === 'failed'
                      ? 'row-value-fail'
                      : ''
                }`}
              >
                {t.amount > 0 ? '-' : t.amount < 0 ? '+' : ''}{Math.abs(t.amount).toFixed(2)}
              </span>
              <span className="bill-row-balance">余额 {t.balanceAfter == null ? '--' : t.balanceAfter.toFixed(2)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

export function useBill(
  fetcher: () => Promise<BillResponse>,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<BillResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetcher();
      if (mounted.current) setData(res);
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [fetcher]);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  return {
    data,
    error,
    refreshing,
    refresh,
    loading: enabled && data === null && !error,
  };
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTimeFull(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 60_000;
}
