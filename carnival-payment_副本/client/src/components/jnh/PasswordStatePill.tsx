/** 支付密码三态：文案与语义色唯一定义处（员工端管理卡 / 家人端 / 付款页 / 分享页共用） */
export const PASSWORD_STATES = ['unset', 'locked', 'ok'] as const;
export type PasswordState = (typeof PASSWORD_STATES)[number];

export const PASSWORD_STATE_TEXT: Record<PasswordState, string> = {
  unset: '未设置 · 家人无法付款',
  locked: '已冻结 · 连错 5 次',
  ok: '已设置 · 全家共用',
};

const PILL_STYLE: Record<PasswordState, { dot: string; text: string }> = {
  unset: { dot: 'bg-[var(--jnh-warning)]', text: 'text-[var(--jnh-warning-ink)]' },
  locked: { dot: 'bg-[var(--jnh-danger)]', text: 'text-[var(--jnh-danger)]' },
  ok: { dot: 'bg-[var(--jnh-brand)]', text: 'text-[var(--jnh-strong)]' },
};

/** 圆点 + 状态词，展示支付密码当前状态 */
export function PasswordStatePill({ state }: { state: PasswordState }) {
  const style = PILL_STYLE[state];
  return (
    <span className="t-caption inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className={style.text}>{PASSWORD_STATE_TEXT[state]}</span>
    </span>
  );
}
