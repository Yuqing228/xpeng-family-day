// 家人端支付密码卡（只读）：状态与说明，改密与解冻由员工端完成
import { PasswordStatePill } from '@client/src/components/jnh/PasswordStatePill';

interface FamilyPasswordCardProps {
  payPasswordSet: boolean;
  payLocked: boolean;
}

export function FamilyPasswordCard({ payPasswordSet, payLocked }: FamilyPasswordCardProps) {
  const state = payLocked ? 'locked' : payPasswordSet ? 'ok' : 'unset';
  const body = !payPasswordSet
    ? '该家庭尚未设置支付密码，暂时无法付款。请联系工卡持有人在员工端设置后再试。'
    : payLocked
      ? '连续输错 5 次已锁定，冻结期间无法付款。请联系工卡持有人在员工端解除冻结，之后可继续用原密码付款。'
      : '付款时需输入 6 位数字密码。修改密码与解除冻结请联系工卡持有人在员工端操作。';

  return (
    <div className="card family-password-card mt-4 flex items-start gap-3 p-5">
      <div className="min-w-0 w-full">
        <div className="family-password-heading">
          <div className="row-title">家庭支付密码</div>
          <div className="family-password-status"><PasswordStatePill state={state} /></div>
        </div>
        <p className="t-caption mt-1.5 leading-relaxed text-[var(--jnh-ink-muted)]">{body}</p>
      </div>
    </div>
  );
}
