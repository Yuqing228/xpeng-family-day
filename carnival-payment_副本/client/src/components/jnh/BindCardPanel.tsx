// 工号绑定面板：员工登录后未识别到工卡时，用本人工号关联当前账号
import { useState } from 'react';
import { toast } from 'sonner';
import { apiEmployee } from '@client/src/api';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { BindCardResponse } from '@shared/api.interface';

interface BindCardPanelProps {
  userName?: string;
  onBound: () => void;
}

export default function BindCardPanel({ userName, onBound }: BindCardPanelProps) {
  const [custNum, setCustNum] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const value = custNum.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res: BindCardResponse = await apiEmployee.bindCard({ custNum: value });
      toast.success(`已绑定工卡 ${res.card.cardUid} · ${res.card.employeeMaskedName}`);
      setCustNum('');
      onBound();
    } catch (err) {
      setError(getErrorMessage(err, '绑定失败，请检查工号后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card bind-card p-5">
      <label htmlFor="bind-cust-num" className="field-label">
        员工工号
      </label>
      <input
        id="bind-cust-num"
        value={custNum}
        onChange={(e) => setCustNum(e.target.value.trim())}
        placeholder="请输入本人工号，如 22309"
        autoComplete="off"
        inputMode="numeric"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "bind-error" : "bind-hint"}
        className="field-input mt-2"
      />
      {error && (
        <p id="bind-error" role="alert" className="t-caption mt-3 rounded-[14px] bg-[var(--jnh-warning-bg)] px-4 py-3 leading-relaxed text-[var(--jnh-warning-ink)]">
          {error}
        </p>
      )}
      <button
        onClick={() => void submit()}
        disabled={!custNum.trim() || submitting}
        className="jnh-btn-primary mt-5 w-full"
      >
        {submitting ? '绑定中…' : '绑定工卡'}
      </button>
      {userName && (
        <p className="t-caption mt-2 text-center text-[var(--jnh-ink-subtle)]">
          当前登录：{userName}
        </p>
      )}
    </div>
  );
}
