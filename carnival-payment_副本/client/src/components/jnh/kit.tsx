// v3 组件套件：GlassCard / NeonButton / GradientAmount / ConfettiSuccess / Skeleton
import type { ReactNode } from 'react';
import './jnh.css';

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function NeonButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
}) {
  const map = {
    primary: 'jnh-btn-primary',
    ghost: 'jnh-btn-outline',
    danger: 'jnh-btn-danger',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn w-full ${map[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/** 关键金额：炭墨实色 + 半粗 + tabular-nums（D6，禁渐变文字） */
export function GradientAmount({
  value,
  prefix = '¥',
  className = '',
  gold = false,
}: {
  value: string | number;
  prefix?: string;
  className?: string;
  gold?: boolean;
}) {
  return (
    <span className={`${gold ? 'grad-text-gold' : 'grad-text'} jnh-num font-semibold tracking-[-0.01em] ${className}`}>
      {prefix}
      {value}
    </span>
  );
}

/** 成功礼花：品牌绿粒子 + 光环（expressive，奖励时刻专用 D4） */
const PARTICLE_COLORS = [
  'var(--jnh-primary)',
  'var(--jnh-brand)',
  'var(--jnh-brand-deep)',
  'var(--jnh-success)',
];

export function ConfettiSuccess({ children, radius = 150 }: { children: ReactNode; radius?: number }) {
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.18;
    const r = radius * (0.72 + ((i * 37) % 28) / 100);
    return {
      dx: `${Math.cos(angle) * r}px`,
      dy: `${Math.sin(angle) * r}px`,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: `${(i % 5) * 40}ms`,
      size: 5 + (i % 3) * 2,
    };
  });
  return (
    <div className="relative overflow-visible">
      <span className="jnh-ring pointer-events-none absolute inset-0 border-2 border-[var(--jnh-primary)]" aria-hidden="true" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="jnh-particle pointer-events-none absolute left-1/2 top-1/2"
          style={
            {
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              background: p.color,
              animationDelay: p.delay,
              '--dx': p.dx,
              '--dy': p.dy,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      ))}
      <div className="relative">{children}</div>
    </div>
  );
}

/** 骨架行：与真实列表行同构（44 图标 + 双行文字 + 右侧值） */
export function SkeletonRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <div className="row">
      {avatar && <div className="skeleton h-11 w-11 rounded-[14px]" />}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="skeleton h-4 w-2/5" />
        <div className="skeleton h-3 w-3/5" />
      </div>
      <div className="skeleton h-4 w-14" />
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card list overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
