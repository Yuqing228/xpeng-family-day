// v8 图标集（lucide-react）：关系人物 / 12th 品牌矢量标记 / 扫码
import { Baby, Copy, Dices, Heart, PersonStanding, QrCode, UserRound, Users } from 'lucide-react';

const INK = 'var(--jnh-ink)';
const MUTED = 'var(--jnh-ink-muted)';
const BRAND = 'var(--jnh-primary)';

/** 关系图标：配偶(Heart 主色)/子女/长辈/其他，44px 圆角块 */
export function RelationIcon({ relation, size = 44 }: { relation: string; size?: number }) {
  const glyph = size - 22;
  const icon =
    relation === 'spouse' ? (
      <Heart size={glyph} strokeWidth={1.6} color={BRAND} />
    ) : relation === 'child' ? (
      <Baby size={glyph} strokeWidth={1.6} color={MUTED} />
    ) : relation === 'elder' ? (
      <PersonStanding size={glyph} strokeWidth={1.6} color={MUTED} />
    ) : (
      <Users size={glyph} strokeWidth={1.6} color={MUTED} />
    );
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[14px] bg-[var(--jnh-surface-1)]"
      style={{ width: size, height: size }}
    >
      {icon}
    </div>
  );
}

/** 我自己（员工）图标 */
export function SelfIcon({ size = 44, tile = true }: { size?: number; tile?: boolean }) {
  const icon = <UserRound size={size - 22} strokeWidth={1.6} color={INK} />;
  if (!tile) return icon;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[14px] bg-[var(--jnh-primary-soft)]"
      style={{ width: size, height: size }}
    >
      {icon}
    </div>
  );
}

/** 品牌标记：几何斜切「12」+ 上标 th（纯矢量，不依赖字体） */
export function BrandGlyph({
  height = 20,
  className,
  label,
  withTh = true,
}: {
  height?: number;
  className?: string;
  label?: string;
  withTh?: boolean;
}) {
  return (
    <svg
      viewBox={withTh ? '0 0 108 56' : '0 0 82 56'}
      height={height}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={6.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g transform="skewX(-9) translate(4 0)">
        <path d="M 15 25 L 30 12 L 30 48" />
        <path d="M 39 24 A 14 14 0 0 1 67 24 L 39 48" />
        <path d="M 35 48 H 76" />
      </g>
      {withTh && (
        <g strokeWidth={2.6} transform="skewX(-9) translate(4 0)">
          <path d="M 79 11 V 23 M 74.5 15.5 H 83.5" />
          <path d="M 88 11 V 24 M 88 20 V 17.5 Q 88 13.5 92 13.5 Q 96 13.5 96 17.5 V 24" />
        </g>
      )}
    </svg>
  );
}

/** 品牌组合：标记为主体，「家年华」小字跟随；size 为标识高度预算 */
export function BrandMark({ size = 88 }: { size?: number }) {
  const glyphHeight = Math.round(size * 0.46);
  const nameSize = Math.max(12, Math.round(size * 0.16));  if (size < 56) {
    return (
      <span className="brand-mark shrink-0">
        <BrandGlyph height={glyphHeight} label="12th 家年华" />
      </span>
    );
  }
  return (
    <span
      className="brand-lockup shrink-0"
      role="img"
      aria-label="12th 家年华"
      style={{ gap: Math.round(size * 0.09) }}
    >
      <BrandGlyph height={glyphHeight} />
      <span
        className="brand-name"
        aria-hidden="true"
        style={{ fontSize: nameSize }}
      >
        家年华
      </span>
    </span>
  );
}

/** 扫码收款图标（跟随文字颜色） */
export function ScanIcon({ size = 20 }: { size?: number }) {
  return <QrCode size={size} strokeWidth={1.75} className="text-inherit" />;
}

/** 随机生成密码图标 */
export function DiceIcon({ size = 14 }: { size?: number }) {
  return <Dices size={size} strokeWidth={1.75} className="text-inherit" />;
}

/** 复制图标 */
export function CopyIcon({ size = 14 }: { size?: number }) {
  return <Copy size={size} strokeWidth={1.75} className="text-inherit" />;
}
