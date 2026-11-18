import { Delete } from 'lucide-react';

// 金额键盘：浅灰无描边键帽；decimal=false 供口令页复用
export function AmountKeypad({ onKey, decimal = true }: { onKey: (key: string) => void; decimal?: boolean }) {
  const baseCls =
    'amount-key jnh-press flex h-[60px] items-center justify-center rounded-[12px] border-0 bg-[var(--jnh-surface-1)] shadow-none tabular-nums text-[var(--jnh-ink)] active:bg-[var(--jnh-primary-soft)]';
  const keys: Array<{ label: string; action: string; cls?: string }> = decimal
    ? [
        { label: '1', action: '1' },
        { label: '2', action: '2' },
        { label: '3', action: '3' },
        { label: '⌫', action: 'back', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
        { label: '4', action: '4' },
        { label: '5', action: '5' },
        { label: '6', action: '6' },
        { label: '清零', action: 'clear', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
        { label: '7', action: '7' },
        { label: '8', action: '8' },
        { label: '9', action: '9' },
        { label: '.', action: '.' },
        { label: '0', action: '0', cls: 'col-span-3 t-heading' },
      ]
    : [
        { label: '1', action: '1' },
        { label: '2', action: '2' },
        { label: '3', action: '3' },
        { label: '4', action: '4' },
        { label: '5', action: '5' },
        { label: '6', action: '6' },
        { label: '7', action: '7' },
        { label: '8', action: '8' },
        { label: '9', action: '9' },
        { label: '⌫', action: 'back', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
        { label: '0', action: '0' },
        { label: '清零', action: 'clear', cls: 't-body font-normal text-[var(--jnh-ink-muted)]' },
      ];
  return (
    <div className={`grid gap-2.5 ${decimal ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {keys.map((k) => (
        <button
          key={k.action}
          onClick={() => onKey(k.action)}
          aria-label={k.action === 'back' ? '退格' : k.action === 'clear' ? '清零' : k.label}
          className={`${baseCls} ${k.cls || 't-heading'}`}
        >
          {k.action === 'back' ? <Delete size={22} strokeWidth={1.8} /> : k.label}
        </button>
      ))}
    </div>
  );
}

/** 金额字符串状态机：空串起步，计算器式录入（整数直接追加，按「.」后才录小数、最多两位；specs/merchant-terminal「金额录入与确认」） */
export function applyAmountKey(current: string, key: string): string {
  if (key === 'clear') return '';
  if (key === 'back') {
    if (current.length <= 1) return '';
    return current.slice(0, -1);
  }
  if (key === '.') {
    if (current === '') return '0.';
    if (current.includes('.')) return current;
    return `${current}.`;
  }
  if (!/^[0-9]$/.test(key)) return current;
  const [intPart, decPart] = current.split('.');
  if (decPart !== undefined) {
    if (decPart.length >= 2) return current;
    return `${intPart}.${decPart}${key}`;
  }
  if (current === '') return key;
  if (current === '0') return key === '0' ? '0' : key;
  if (intPart.length >= 5) return current;
  return `${current}${key}`;
}
