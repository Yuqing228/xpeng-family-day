// 口令键盘：62 字符集三档切换（数字/小写/大写），4 位随机口令录入；键帽沿用 AmountKeypad 规范
import { Delete } from 'lucide-react';
export type PassCodeShift = 'digits' | 'lower' | 'upper';

const LOWER_KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const SHIFTS: Array<[PassCodeShift, string]> = [
  ['digits', '123'],
  ['lower', 'abc'],
  ['upper', 'ABC'],
];

export function PassCodeKeypad({
  onKey,
  shift,
  onShiftChange,
}: {
  onKey: (key: string) => void;
  shift: PassCodeShift;
  onShiftChange: (s: PassCodeShift) => void;
}) {
  const baseCls =
    'jnh-press flex items-center justify-center rounded-[16px] border border-[var(--jnh-hairline)] bg-[var(--jnh-surface)] text-[var(--jnh-ink)] shadow-[0_1px_2px_rgba(16_24_40_0.04)] active:bg-[var(--jnh-primary-soft)]';
  const digits: Array<{ label: string; action: string; cls?: string }> = [
    ...'123456789'.split('').map((ch: string) => ({ label: ch, action: ch })),
    { label: '⌫', action: 'back', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
    { label: '0', action: '0' },
    { label: '清零', action: 'clear', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
  ];
  const letters =
    shift === 'upper'
      ? LOWER_KEYS.map((ch: string) => ch.toUpperCase())
      : LOWER_KEYS;

  return (
    <div>
      <div className="mb-2.5 grid grid-cols-3 gap-2.5">
        {SHIFTS.map(([s, label]) => (
          <button
            key={s}
            onClick={() => onShiftChange(s)}
            aria-pressed={shift === s}
            className={`jnh-press t-body rounded-full border py-2.5 font-semibold ${
              shift === s
                ? 'border-[var(--jnh-primary)] bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]'
                : 'border-[var(--jnh-hairline)] text-[var(--jnh-ink-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {shift === 'digits' ? (
        <div className="grid grid-cols-3 gap-2.5">
          {digits.map((k) => (
            <button
              key={k.action}
              onClick={() => onKey(k.action)}
              className={`${baseCls} t-heading h-[60px] ${k.cls || ''}`}
            >
              {k.action === 'back' ? <Delete size={22} strokeWidth={1.8} /> : k.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-2">
          {letters.map((ch: string) => (
            <button
              key={ch}
              onClick={() => onKey(ch)}
              className={`${baseCls} t-body h-11 font-medium`}
            >
              {ch}
            </button>
          ))}
          <button
            onClick={() => onKey('back')}
            className={`${baseCls} t-caption col-span-2 h-11 font-medium`}
          >
            <Delete size={18} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => onKey('clear')}
            className={`${baseCls} t-caption col-span-2 h-11 font-medium`}
          >
            清零
          </button>
        </div>
      )}
    </div>
  );
}
