// 添加家人：称呼输入 + 关系选择 + 创建并生成专属链接
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Link2, ShieldCheck, ReceiptText, ChevronRight } from 'lucide-react';
import { apiEmployee } from '@client/src/api';
import { AuroraShell } from '@client/src/components/jnh/AuroraShell';
import { NeonButton, SkeletonList } from '@client/src/components/jnh/kit';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { FamilyRelation, IdentityListResponse } from '@shared/api.interface';

const RELATIONS: Array<{ value: FamilyRelation; label: string }> = [
  { value: 'spouse', label: '配偶' },
  { value: 'child', label: '子女' },
  { value: 'elder', label: '长辈' },
  { value: 'other', label: '其他' },
];

export default function CreateFamilyPage() {
  usePageTitle('家年华支付 · 添加家人');
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [relation, setRelation] = useState<FamilyRelation>('child');
  const [submitting, setSubmitting] = useState(false);
  const [meta, setMeta] = useState<IdentityListResponse | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiEmployee
      .identities()
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => {
        // 拉取失败不阻塞表单，提交仍由服务端兜底
      })
      .finally(() => {
        if (alive) setMetaLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiEmployee.createFamily({ displayName, relation });
      toast.success(`已创建「${res.identity.displayName}」`);
      navigate(`/employee/share/${res.identity.id}`, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败，请稍后重试'));
      setSubmitting(false);
    }
  };

  const familyLimitNumber = meta?.familyLimit ?? 6;
  const atFamilyLimit = (meta?.families.length ?? 0) >= familyLimitNumber;

  if (metaLoading) {
    return (
      <AuroraShell title="添加家人" subtitle="创建家庭身份">
        <SkeletonList rows={2} />
      </AuroraShell>
    );
  }

  if (atFamilyLimit) {
    return (
      <AuroraShell title="添加家人" subtitle="创建家庭身份">
        <div className="card p-6">
          <h1 className="t-heading text-[var(--jnh-ink)]">已达家人上限</h1>
          <p className="t-body mt-2 text-[var(--jnh-ink-muted)]">
            最多可创建 {familyLimitNumber} 位家人身份。请先回身份列表左滑删除一位家人，再添加新身份。
          </p>
          <button onClick={() => navigate('/employee')} className="jnh-btn-primary mt-5 w-full">
            返回身份列表
          </button>
        </div>
      </AuroraShell>
    );
  }

  return (
    <AuroraShell
      title="添加家人"
      subtitle={`已创建 ${meta?.families.length ?? 0} / ${familyLimitNumber} 位`}
      bottom={
        <NeonButton onClick={submit} disabled={submitting || !displayName.trim()}>
          {submitting ? '创建中…' : '创建并生成专属链接'}
        </NeonButton>
      }
    >
      <section className="family-form-card">
      <div className="family-name-card">
        <label htmlFor="family-name" className="field-label">
          称呼
        </label>
        <input
          id="family-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 16))}
          placeholder="如：孩子二号"
          maxLength={16}
          className="field-input mt-3"
        />
      </div>

      <div className="group mt-6">
        <div className="group-head">
          <span className="group-title">与我的关系</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {RELATIONS.map((r) => {
            const selected = relation === r.value;
            return (
              <button
                key={r.value}
                onClick={() => setRelation(r.value)}
                aria-pressed={selected}
                className={`flex h-14 items-center justify-between rounded-[14px] border px-4 text-left transition-colors ${
                  selected
                    ? 'border-[var(--jnh-primary)] bg-[var(--jnh-primary-soft)]'
                    : 'border-[var(--jnh-hairline)] bg-[var(--jnh-surface)]'
                }`}
              >
                <span
                  className={`t-body font-semibold ${
                    selected ? 'text-[var(--jnh-strong)]' : 'text-[var(--jnh-ink)]'
                  }`}
                >
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      </section>
      <section className="family-explainer family-process-card mt-4">
        <div className="row-title">创建后会发生什么</div>
        <ol className="family-create-steps" aria-label="创建后的使用流程">
          {[
            { Icon: Link2, label: '生成并分享链接' },
            { Icon: ShieldCheck, label: '支付输入密码' },
            { Icon: ReceiptText, label: '全家共享账单' },
          ].map(({ Icon, label }, index) => (
            <li key={label} className="family-create-step">
              <span className="family-step-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="family-step-label">{label}</span>
              {index < 2 && <ChevronRight className="family-step-arrow" size={14} aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>
    </AuroraShell>
  );
}
