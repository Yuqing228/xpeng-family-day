// 摊主端：飞书认证 → 4 位口令绑定 → 首页
import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, CheckCircle2 } from 'lucide-react';
import { authClient } from '@lark-apaas/client-toolkit/auth';
import { toast } from 'sonner';
import { apiMerchant } from '@client/src/api';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import { BrandMark } from '@client/src/components/jnh/icons';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import type { MerchantSession } from '@shared/api.interface';

export function MerchantBindPage({ session, setSession }: { session: MerchantSession; setSession: (s: MerchantSession) => void }) {
  const [pin, setPin] = useState('');
  const pinInputRef = useRef<HTMLInputElement>(null);
  const [binding, setBinding] = useState(false);
  const [bound, setBound] = useState<{ stallName: string } | null>(null);

  const submit = async () => {
    if (binding || pin.length !== 4) return;
    setBinding(true);
    try {
      const res = await apiMerchant.bind({ pin });
      setBound({ stallName: res.stallName });
      toast.success(`绑定成功：${res.stallName}`);
      // 重新拉取 session，守卫读到 binding=true 后自动进入摊主首页
      setTimeout(() => {
        apiMerchant.session().then(setSession).catch(() => undefined);
      }, 900);
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setBinding(false);
    }
  };


  return (
    <AuroraShell
      title="绑定摊位"
      subtitle={`已认证：${session.userName || '飞书账号'}`}
      bottom={
        <button
          onClick={() => void submit()}
          disabled={binding || pin.length !== 4}
          className="jnh-btn-primary w-full"
        >
          {binding ? '绑定中…' : '绑定摊位'}
        </button>
      }
    >
      <div className="merchant-bind-card">
        <div className="t-body font-semibold text-[var(--jnh-ink)]">输入摊主口令</div>
        <p className="t-caption mt-1 text-[var(--jnh-ink-muted)]">
          由管理员发放，区分大小写；换班同事绑同一口令即可共用本摊。
        </p>
        <div className="merchant-bind-input relative mt-5 rounded-[16px]" onClick={() => pinInputRef.current?.focus()}>
          <input
            ref={pinInputRef}
            aria-label="4 位摊主口令"
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            disabled={binding}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 text-[16px]"
          />
          <div className="pointer-events-none flex justify-center gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`merchant-pin-cell flex h-[60px] w-[56px] items-center justify-center rounded-[16px] border text-[24px] font-semibold transition-colors ${
                pin.length > i
                  ? 'border-[var(--jnh-primary)] bg-[var(--jnh-primary-soft)] text-[var(--jnh-ink)]'
                  : 'border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] text-[var(--jnh-ink-subtle)]'
              }`}
            >
              {pin[i] ?? ''}
            </div>
          ))}
          </div>
        </div>
      </div>

      {bound && (
        <div className="card mt-4 border-[var(--jnh-primary)] p-4">
          <div className="flex items-center gap-2 text-[var(--jnh-strong)]">
            <CheckCircle2 size={18} strokeWidth={2} />
            <span className="t-body font-semibold">绑定成功：{bound.stallName}</span>
          </div>
          <p className="t-caption mt-1 text-[var(--jnh-ink-muted)]">后续扣款自动记入该摊流水</p>
        </div>
      )}

      <HintText>操作记入飞书账号；口令遗失请联系项目组</HintText>
    </AuroraShell>
  );
}

/** 摊主端入口守卫：未登录 → 飞书认证页；已绑定 → 首页；未绑定 → 口令绑定 */
export default function MerchantGatePage() {
  usePageTitle('家年华支付 · 摊主端');
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiMerchant
      .session()
      .then(setSession)
      .catch((err: unknown) => setError(getErrorMessage(err, '操作失败，请稍后重试')));
  }, []);

  if (error) {
    return (
      <AuroraShell title="摊主端" subtitle="出错了">
        <div className="card p-5">
          <p className="t-body font-semibold text-[var(--jnh-ink)]">无法连接</p>
          <p className="t-caption mt-2 break-words text-[var(--jnh-danger)]">{error}</p>
          <button onClick={() => navigate(0)} className="jnh-btn-outline mt-4 w-full">
            重新加载
          </button>
        </div>
      </AuroraShell>
    );
  }

  if (!session) {
    return (
      <AuroraShell title="摊主端" subtitle="加载中">
        <div className="skeleton h-40 rounded-[20px]" />
      </AuroraShell>
    );
  }

  if (!session.loggedIn) {
    return (
      <AuroraShell
        title="摊主端"
        subtitle="首次使用 · 飞书认证登录"
        bottom={
          <button
            onClick={() => void authClient.session.redirectToLogin()}
            className="jnh-btn-primary w-full"
          >
            授权并登录
          </button>
        }
      >
        <div className="flex flex-col items-center pt-8 pb-6 text-center">
          <BrandMark size={88} />
          <h1 className="t-heading mt-6 text-[var(--jnh-ink)]">授权「家年华支付」</h1>
          <p className="t-body mt-2 max-w-[18em] text-[var(--jnh-ink-muted)]">
            授权后即可绑定摊位口令，出示收款码并查收每一笔到账。
          </p>
        </div>
        <div className="card list">
          <div className="row">
            <span className="row-icon row-icon-brand">
              <Check size={20} strokeWidth={2.2} />
            </span>
            <div className="row-main">
              <div className="row-title">昵称与头像</div>
              <div className="row-sub">台账操作人留痕，便于对账</div>
            </div>
          </div>
          <div className="row">
            <span className="row-icon row-icon-brand">
              <Check size={20} strokeWidth={2.2} />
            </span>
            <div className="row-main">
              <div className="row-title">飞书账号标识</div>
              <div className="row-sub">换班同事可绑同一摊位口令</div>
            </div>
          </div>
        </div>
        <HintText>一键授权，不获取通讯录权限</HintText>
      </AuroraShell>
    );
  }

  if (!session.binding) {
    return <MerchantBindPage session={session} setSession={setSession} />;
  }

  return <Navigate to="/merchant/home" replace />;
}
