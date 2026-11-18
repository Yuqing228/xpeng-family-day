// 支付密码输入区：两次 6 位输入 + 随机生成 + 生成后明文展示与复制 + 安全提示
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyIcon, DiceIcon } from '@client/src/components/jnh/icons';
import { generatePayPin } from '@client/src/utils/pay-pin';

interface PayPinFieldsProps {
  pin: string;
  pin2: string;
  onPinChange: (value: string) => void;
  onPin2Change: (value: string) => void;
  label?: string;
}

const PIN_INPUT_CLASS =
  'field-input mt-2 tracking-[0.3em] placeholder:tracking-normal';

export function PayPinFields({
  pin,
  pin2,
  onPinChange,
  onPin2Change,
  label = '家庭支付密码（6 位数字）',
}: PayPinFieldsProps) {
  const [revealed, setRevealed] = useState(false);
  const [generated, setGenerated] = useState(false);
  const completed = /^\d{6}$/.test(pin);

  const generate = () => {
    const next = generatePayPin();
    onPinChange(next);
    onPin2Change(next);
    setRevealed(true);
    setGenerated(true);
  };

  const copyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      toast.success('密码已复制，请单独发给家人');
    } catch {
      toast.error('复制失败，请手动记录密码');
    }
  };

  const type = revealed ? 'text' : 'password';

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="t-body font-semibold text-[var(--jnh-ink)]">{label}</div>
        <button
          type="button"
          onClick={generate}
          className="jnh-btn-outline pin-generate-button btn btn-sm shrink-0 gap-1 px-3"
        >
          <DiceIcon />
          随机生成
        </button>
      </div>
      <input
        value={pin}
        onChange={(e) => {
          setRevealed(false);
          setGenerated(false);
          onPinChange(e.target.value.replace(/\D/g, '').slice(0, 6));
        }}
        type={type}
        inputMode="numeric"
        autoComplete="new-password"
        aria-label="输入支付密码"
        placeholder="设置 6 位数字密码"
        maxLength={6}
        className={PIN_INPUT_CLASS}
      />
      <input
        value={pin2}
        onChange={(e) => {
          setRevealed(false);
          setGenerated(false);
          onPin2Change(e.target.value.replace(/\D/g, '').slice(0, 6));
        }}
        type={type}
        inputMode="numeric"
        autoComplete="new-password"
        aria-label="再次输入支付密码"
        placeholder="再次输入确认"
        maxLength={6}
        className={PIN_INPUT_CLASS}
      />
      {generated && completed && (
        <div className="mt-3 rounded-[14px] border border-[var(--jnh-hairline)] bg-[var(--jnh-surface)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="t-caption text-[var(--jnh-ink-muted)]">
              本次生成的密码：
              <span className="jnh-num t-body ml-1 font-semibold tracking-[0.2em] text-[var(--jnh-ink)]">{pin}</span>
            </div>
            <button
              type="button"
              onClick={copyPin}
              aria-label="复制本次生成的支付密码"
              className="jnh-btn-outline pin-generate-button btn btn-sm shrink-0 gap-1 px-3"
            >
              <CopyIcon size={14} />
              复制
            </button>
          </div>
          <p className="t-caption mt-1.5 text-[var(--jnh-ink-muted)]">
            请先复制保存，离开本页后无法再次查看该密码。
          </p>
        </div>
      )}
      <p className="t-caption mt-2 text-[var(--jnh-ink-subtle)]">
        为安全起见，建议设置与真实信息无关的密码，不要使用生日、手机号后六位、门牌号或家人常用的密码。
      </p>
    </div>
  );
}
