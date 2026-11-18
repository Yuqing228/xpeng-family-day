// 分享页：家人身份卡 + 分享动作 + 专属链接二维码
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Copy, Share2, UserRoundX } from 'lucide-react';
import { apiEmployee, familyLink } from '@client/src/api';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import { PASSWORD_STATE_TEXT } from '@client/src/components/jnh/PasswordStatePill';
import { ConfettiSuccess, SkeletonList } from '@client/src/components/jnh/kit';
import { LinkQR } from '@client/src/components/jnh/PaymentQR';
import { RelationIcon } from '@client/src/components/jnh/icons';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { FamilyIdentityDTO, IdentityListResponse } from '@shared/api.interface';

export default function SharePage() {
  usePageTitle('家年华支付 · 家人链接');
  const { id } = useParams<{ id: string }>();
  const [identity, setIdentity] = useState<FamilyIdentityDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [familyPay, setFamilyPay] = useState<
    Pick<IdentityListResponse['familyPayPassword'], 'payPasswordSet' | 'payLocked'>
  >({ payPasswordSet: false, payLocked: false });

  const load = useCallback(async () => {
    try {
      const list = await apiEmployee.identities();
      const found = list.families.find((f) => f.id === id) ?? null;
      if (!found) {
        setError('该身份不存在或已删除');
        return;
      }
      setIdentity(found);
      setFamilyPay(list.familyPayPassword);
    } catch (err) {
      setError(getErrorMessage(err, '加载失败，请稍后重试'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const link = identity ? familyLink(identity.linkToken) : '';

  const shareToWeChat = async () => {
    if (!identity) return;
    await apiEmployee.markShared(identity.id).catch(() => undefined);
    await load();
    if (navigator.share) {
      try {
        await navigator.share({
          title: '家年华 · 付款码',
          text: '你的专属付款码 · 活动当天有效，点开即可使用',
          url: link,
        });
        toast.success('已唤起分享');
        return;
      } catch {
        // 用户取消或环境不支持 → 走复制链接
      }
    }
    await copyLink();
  };

  const copyLink = async () => {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(link);
      await apiEmployee.markShared(identity.id).catch(() => undefined);
      toast.success('链接已复制，去微信粘贴发给对应家人');
      void load();
    } catch {
      toast.error('复制失败，可长按识别二维码或截图发送');
    }
  };

  if (error) {
    return (
      <AuroraShell title="家人链接" subtitle="出错了">
        <div className="share-error-state">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]" aria-hidden="true">
            <UserRoundX size={24} strokeWidth={1.8} />
          </span>
          <p className="t-body font-semibold text-[var(--jnh-ink)]">{error}</p>
          <p className="t-caption mt-2 text-[var(--jnh-ink-muted)]">请返回身份列表重新选择家人。</p>
        </div>
      </AuroraShell>
    );
  }

  return (
    <AuroraShell
      title="发送付款链接"
      subtitle={identity ? `给 ${identity.displayName} 的专属链接` : '加载中'}
      bottom={
        identity ? (
          <button onClick={() => void shareToWeChat()} className="jnh-btn-primary w-full">
            <Share2 size={18} strokeWidth={2} />
            微信发送给朋友
          </button>
        ) : undefined
      }
    >
      {!identity && <SkeletonList rows={2} />}

      {identity && (
        <>
          <ConfettiSuccess radius={110}>
            <div className="card">
              <div className="row row-lg">
                <RelationIcon relation={identity.relation} size={48} />
                <div className="row-main">
                  <div className="t-title truncate text-[var(--jnh-ink)]">{identity.displayName}</div>
                  <div className="row-sub">{identity.relationLabel} · 链接仅活动当天有效</div>
                </div>
                <span className={`chip ${identity.shared ? 'chip-ok' : 'chip-brand'}`}>
                  {identity.shared ? '已分享' : '待分享'}
                </span>
              </div>
            </div>
          </ConfettiSuccess>

          {!familyPay.payPasswordSet && (
            <div className="card mt-4 p-5">
              <div className="row-title">家庭支付密码未设置</div>
              <p className="t-caption mt-2 leading-relaxed text-[var(--jnh-ink-muted)]">
                家人付款时需要输入密码，请先回身份列表「家庭支付密码」设置一次（全家共用）。
              </p>
            </div>
          )}

          <div className="card mt-4 p-6">
            <div className="flex justify-center">
              <LinkQR url={link} />
            </div>
            <div className="divider my-5" />
            <p className="t-caption text-center text-[var(--jnh-ink-muted)]">
              家人扫此码即可付款 · 仅活动当天有效
            </p>
          </div>

          <button onClick={copyLink} className="jnh-btn-outline mt-4 w-full">
            <Copy size={18} strokeWidth={2} />
            复制链接
          </button>

          <div className="note mt-4 px-1">
            <Check size={16} aria-hidden="true" />
            <span>
              {familyPay.payPasswordSet
                ? familyPay.payLocked
                  ? `${PASSWORD_STATE_TEXT.locked} · 请在身份列表解除冻结`
                  : `家庭支付密码${PASSWORD_STATE_TEXT.ok} · 家人可正常付款`
                : `家庭支付密码${PASSWORD_STATE_TEXT.unset}`}
            </span>
          </div>
          <HintText>可从身份列表重新发送；链接请勿发到公开群</HintText>
        </>
      )}
    </AuroraShell>
  );
}
