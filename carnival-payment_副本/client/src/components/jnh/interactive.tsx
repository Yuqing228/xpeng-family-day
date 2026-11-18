// H5 交互层（design.md D10）：PullToRefresh 下拉刷新 · SwipeAction 左滑操作 · EmptyState 空状态
import { useRef, useState, type ReactNode } from 'react';
import './jnh.css';

/**
 * 下拉刷新：≥60px 触发 onRefresh（与「↻」按钮触发同一手动拉取函数，不引入轮询）。
 * 仅在页面滚动到顶时接管手势，垂直列表内滚动不受影响。
 */
export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const startY = useRef(0);
  const armed = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    if ((window.scrollY || document.documentElement.scrollTop) <= 0) {
      startY.current = e.touches[0].clientY;
      armed.current = true;
    } else {
      armed.current = false;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!armed.current || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      setPull(Math.min(dy * 0.4, 72));
    }
  };
  const onTouchEnd = () => {
    if (!armed.current) return;
    armed.current = false;
    if (pull >= 60) {
      onRefresh();
    }
    setPull(0);
  };

  const ready = pull >= 60;
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="ptr-indicator active" style={{ height: pull || (refreshing ? 44 : 0) }} aria-hidden="true">
        {refreshing ? (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-[var(--jnh-hairline)] border-t-[var(--jnh-primary)] animate-spin" />
        ) : (
          <span className={`t-micro font-semibold transition-transform ${ready ? 'rotate-180' : ''}`}>↓</span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * 左滑操作：左滑露出操作按钮（D10 现代列表模式）。点击行任意处回位。
 */
export function SwipeAction({
  actions,
  children,
  onOpen,
}: {
  actions: Array<{ label: string; onClick: () => void; className?: string }>;
  children: ReactNode;
  onOpen?: () => void;
}) {
  const width = actions.length * 76;
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const horizontal = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    tracking.current = true;
    horizontal.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!tracking.current) return;
    const mx = e.touches[0].clientX - startX.current;
    const my = e.touches[0].clientY - startY.current;
    if (!horizontal.current) {
      if (Math.abs(mx) > Math.abs(my) + 4) horizontal.current = true;
      else if (Math.abs(my) > 8) tracking.current = false;
      return;
    }
    if (mx < 0) setDx(Math.max(mx, -width));
    else setDx(0);
  };
  const onTouchEnd = () => {
    if (!tracking.current) return;
    tracking.current = false;
    setDx(dx < -width / 2 ? -width : 0);
    if (dx < -width / 2) onOpen?.();
  };

  return (
    <div className="swipe-wrap">
      <div className="swipe-actions" style={{ width, visibility: dx < 0 ? 'visible' : 'hidden' }} aria-hidden={dx >= 0}>
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`t-body inline-flex w-full items-center justify-center font-semibold ${a.className || 'bg-[var(--jnh-danger)] text-white active:bg-[var(--jnh-danger-active)]'}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => setDx(0)}
      >
        {children}
      </div>
    </div>
  );
}

/** 空状态：细线图标 + 一句话 + 一个动作（D10 空状态体系） */
export function EmptyState({
  icon,
  text,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]">
        {icon}
      </div>
      <p className="t-body mt-4 text-center text-[var(--jnh-ink-muted)]">{text}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="jnh-btn-outline btn btn-sm mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* 空状态细线图标库 */
export const EmptyIcons = {
  bill: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  link: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M10 14a5 5 0 007.07 0l3.18-3.18a5 5 0 00-7.07-7.07L11.5 5.4" />
      <path d="M14 10a5 5 0 00-7.07 0L3.75 13.18a5 5 0 007.07 7.07L13 19" />
    </svg>
  ),
  search: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  coins: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M15.5 8.4a5.5 5.5 0 11-5.2 8.1" />
    </svg>
  ),
};
