// 探测历史：最近 20 次记录，点击行展开当次完整链路详情（复用 ProbeResultView）
import { useState } from 'react';
import type { LeopenProbeHistoryItem } from '@shared/api.interface';
import { ProbeResultView, VERDICT_META, fmtProbeTime, targetShort } from './ProbeResultView';

export function HistoryList({
  items,
  loading,
  onRefresh,
}: {
  items: LeopenProbeHistoryItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="mt-5" data-ai-section-type="card-list">
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="t-caption font-normal tracking-[0.32px] text-[var(--jnh-ink-subtle)] uppercase">探测历史（最近 20 次）</div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="jnh-btn-outline px-2.5 py-1 t-caption disabled:opacity-50 active:bg-[var(--jnh-primary-soft)]"
        >
          刷新
        </button>
      </div>
      {loading && items.length === 0 ? (
        <div className="glass-card divide-y divide-[var(--jnh-hairline)]">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton mx-3 my-2.5 h-4" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card px-4 py-6 text-center t-caption text-[var(--jnh-ink-subtle)]">暂无探测记录</div>
      ) : (
        <div className="glass-card divide-y divide-[var(--jnh-hairline)] overflow-hidden">
          {items.map((item) => {
            const meta = VERDICT_META[item.probe.verdict];
            const expanded = expandedId === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-[var(--jnh-primary-soft)]"
                >
                  <span aria-hidden="true" className="h-2 w-2 shrink-0" style={{ background: meta.color }} />
                  <span className="w-[104px] shrink-0 t-caption jnh-num text-[var(--jnh-ink-muted)]">
                    {fmtProbeTime(item.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate t-meta text-[var(--jnh-ink)]">
                    <span className="text-[var(--jnh-ink-muted)]">{targetShort(item.probe.targetPath)}</span>
                    {' · '}
                    {meta.short}
                    {item.probe.traceId ? ` · ${item.probe.traceId.slice(0, 8)}` : ''}
                  </span>
                  <span className="shrink-0 t-caption jnh-num text-[var(--jnh-ink-muted)]">{item.probe.totalMs}ms</span>
                </button>
                {expanded && (
                  <div className="border-t border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] px-3 py-3">
                    <ProbeResultView result={item.probe} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
