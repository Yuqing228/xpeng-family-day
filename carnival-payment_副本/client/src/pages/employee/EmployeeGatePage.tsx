// 员工端入口 v3：飞书一键登录 → 身份列表（登录落点）
// 家人行左滑删除（D10 SwipeAction）+ 分组卡版式
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@lark-apaas/client-toolkit/auth';
import { toast } from 'sonner';
import { ChevronRight, CreditCard, Plus, QrCode, ShieldCheck } from 'lucide-react';
import { apiEmployee } from '@client/src/api';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import BindCardPanel from '@client/src/components/jnh/BindCardPanel';
import { PasswordStatePill } from '@client/src/components/jnh/PasswordStatePill';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { PayPinFields } from '@client/src/components/jnh/PayPinFields';
import { SwipeAction } from '@client/src/components/jnh/interactive';
import { SkeletonList } from '@client/src/components/jnh/kit';
import { BrandMark } from '@client/src/components/jnh/icons';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import './employee-home2.css';
import type { EmployeeSession, IdentityListResponse } from '@shared/api.interface';

export default function EmployeeGatePage({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
  const pageStylePath = variant === 'light' ? '/employee2' : '/employee';
  usePageTitle('家年华支付 · 员工端');
  const navigate = useNavigate();
  const [session, setSession] = useState<EmployeeSession | null>(null);
  const [list, setList] = useState<IdentityListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const autoBindTried = useRef(false);
  const [autoBindDone, setAutoBindDone] = useState(false);

  const loadList = useCallback(async () => {
    const l = await apiEmployee.identities();
    setList(l);
    return l;
  }, []);

  const refreshSession = useCallback(async () => {
    const s = await apiEmployee.session();
    setSession(s);
    if (s.card) await loadList();
  }, [loadList]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      await refreshSession();
    } catch (err) {
      setError(getErrorMessage(err, '加载失败，请稍后重试'));
    }
  }, [refreshSession]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 未识别时先按登录姓名自动认领，认领不到再回退手工输工号
  useEffect(() => {
    if (!session || !session.loggedIn || session.card) return;
    if (autoBindTried.current) return;
    autoBindTried.current = true;
    apiEmployee
      .autoBind()
      .then(async (res) => {
        if (res.bound) await refreshSession();
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, '自动识别工号失败，请手动输入工号'));
      })
      .finally(() => setAutoBindDone(true));
  }, [session, refreshSession]);

  const doDelete = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      await apiEmployee.deleteFamily(confirmDelete.id);
      toast.success(`已删除「${confirmDelete.name}」`);
      setConfirmDelete(null);
      await loadList();
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setDeleting(false);
    }
  };

  const doUnlock = async () => {
    if (unlocking) return;
    setUnlocking(true);
    try {
      await apiEmployee.unlockPayPassword();
      toast.success('已解除支付密码冻结');
      await loadList();
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setUnlocking(false);
    }
  };

  const saveFamilyPin = async () => {
    if (savingPin) return;
    if (!/^\d{6}$/.test(pin)) {
      setPinError('请设置 6 位数字的支付密码');
      return;
    }
    if (pin !== pin2) {
      setPinError('两次输入的支付密码不一致');
      return;
    }
    setPinError(null);
    setSavingPin(true);
    try {
      await apiEmployee.setPayPassword({ payPassword: pin });
      toast.success('家庭支付密码已保存');
      setPin('');
      setPin2('');
      setPinError(null);
      setPinOpen(false);
      await loadList();
    } catch (err) {
      setPinError(getErrorMessage(err, '操作失败，请稍后重试'));
    } finally {
      setSavingPin(false);
    }
  };

  if (error) {
    return (
      <AuroraShell pageStylePath={pageStylePath} title="家年华支付" subtitle="工卡支付管理 · 家人身份">
        <div className="card p-5">
          <p className="t-body font-semibold text-[var(--jnh-ink)]">页面加载失败</p>
          <p className="t-caption mt-2 break-words text-[var(--jnh-danger)]">{error}</p>
          <button onClick={() => void reload()} className="jnh-btn-outline mt-4 w-full">
            重新加载
          </button>
        </div>
      </AuroraShell>
    );
  }

  if (!session) {
    return (
      <AuroraShell pageStylePath={pageStylePath} title="家年华支付" subtitle="加载中">
        <SkeletonList rows={3} />
      </AuroraShell>
    );
  }

  // 未登录：飞书一键登录
  if (!session.loggedIn) {
    return (
      <AuroraShell pageStylePath={pageStylePath}
        title="家年华支付"
        subtitle="工卡扫码 · 全家同乐"
        bottom={
          <button
            onClick={() => void authClient.session.redirectToLogin()}
            className="jnh-btn-primary w-full"
          >
            飞书一键登录
          </button>
        }
      >
        <div className="flex flex-col items-center pt-8 pb-6 text-center">
          <BrandMark size={96} />
          <h1 className="t-display mt-7 text-[var(--jnh-ink)]">工卡扫码，全家同乐</h1>
          <p className="t-body mt-3 max-w-[18em] text-[var(--jnh-ink-muted)]">
            登录后自动关联工卡，可创建家人身份、出示付款码。
          </p>
        </div>
        <div className="card list mt-2">
          <div className="row">
            <span className="row-icon row-icon-brand">
              <ShieldCheck size={20} strokeWidth={1.8} />
            </span>
            <div className="row-main">
              <div className="row-title">飞书授权，免验证码</div>
              <div className="row-sub">仅首次需要授权</div>
            </div>
          </div>
          <div className="row">
            <span className="row-icon row-icon-brand">
              <CreditCard size={20} strokeWidth={1.8} />
            </span>
            <div className="row-main">
              <div className="row-title">消费记在您的工卡名下</div>
              <div className="row-sub">家人共用，账单可查</div>
            </div>
          </div>
        </div>
        <HintText>仅用于家年华活动现场</HintText>
      </AuroraShell>
    );
  }

  // 登录但无工卡映射：先请求自动认领，完成后仍未识别才展示工号自助绑定
  if (!session.card) {
    if (!autoBindDone) {
      return (
        <AuroraShell pageStylePath={pageStylePath} title="绑定工卡" subtitle={`已登录：${session.userName || ''}`}>
          <SkeletonList rows={2} />
        </AuroraShell>
      );
    }
    return (
      <AuroraShell pageStylePath={pageStylePath} title="绑定工卡" subtitle={`已登录：${session.userName || ''}`}>
        <div className="bind-intro">
          <h1 className="t-heading mt-5 text-[var(--jnh-ink)]">还差一步，关联你的工卡</h1>
          <p id="bind-hint" className="t-body mt-2 text-[var(--jnh-ink-muted)]">
            输入本人工号，须与登录身份一致。
          </p>
        </div>
        <div className="bind-center-group">
          <div className="bind-form-wrap">
            <BindCardPanel userName={session.userName} onBound={() => void refreshSession()} />
          </div>
          <HintText>消费从工卡余额扣除，家人可共用</HintText>
        </div>
      </AuroraShell>
    );
  }

  // 身份列表（登录落点）：我自己 + 家人（左滑删除）+ 添加
  const balanceYuan = list?.balance ?? session.balance ?? null;
  const familyLimitNumber = list?.familyLimit ?? 6;
  const atFamilyLimit = (list?.families.length ?? 0) >= familyLimitNumber;
  const goCreate = () => {
    if (atFamilyLimit) {
      toast.error(`家人身份已达上限（${familyLimitNumber} 位），可删除后重建`);
      return;
    }
    navigate('/employee/create');
  };
  const pinHint =
    pinError ??
    (pin.length > 0 && pin.length < 6 ? '支付密码需为 6 位数字' : null) ??
    (pin2.length === 6 && pin !== pin2 ? '两次输入的支付密码不一致' : null);
  const pinState = list?.familyPayPassword.payLocked
    ? 'locked'
    : list?.familyPayPassword.payPasswordSet
      ? 'ok'
      : 'unset';

  return (
    <AuroraShell pageStylePath={pageStylePath}
      title="家年华支付"
      subtitle={`${session.card.employeeMaskedName} · 工卡 ${session.card.cardUid}`}
    >
      <div className={`hero-card employee-balance-card ${variant === 'light' ? 'apple-balance-card' : ''}`}>
        <div className="hero-label">工卡余额（元）</div>
        <div className="hero-amount mt-1">¥{balanceYuan === null ? '--' : balanceYuan.toFixed(2)}</div>
        <div className="kv-grid balance-details">
          <div className="kv kv--hero">
            <div className="kv-label">工卡号</div>
            <div className="kv-value">{session.card.cardUid}</div>
          </div>
          <div className="kv kv--hero">
            <div className="kv-label">家庭身份</div>
            <div className="kv-value">{1 + (list?.families.length ?? 0)} 位</div>
          </div>
          <div className="kv kv--hero">
            <div className="kv-label">支付密码</div>
            <div className="kv-value">
              {pinState === 'ok' ? '已设置' : pinState === 'locked' ? '已冻结' : '未设置'}
            </div>
          </div>
        </div>
        <div className="hero-quick">
          <button onClick={() => navigate('/employee/me')} className="hero-quick-item">
            <QrCode size={16} strokeWidth={1.9} />
            付款码
          </button>
          <button onClick={() => navigate('/employee/me')} className="hero-quick-item">
            <CreditCard size={16} strokeWidth={1.9} />
            消费记录
          </button>
        </div>
      </div>

      <div className="group shared-people-card mt-6">
        <div className="group-head">
          <span className="group-title">工卡共享</span>

        </div>
        {list ? (
          <div className="shared-people-grid">
            <button onClick={() => navigate('/employee/me')} className="shared-person">
              <span className="shared-avatar shared-name-avatar" data-avatar-tone="0">我</span>
              <span className="shared-person-name">我自己</span>
            </button>
            {list.families.map((f, index) => (
              <SwipeAction key={f.id} actions={[{ label: '删除', onClick: () => setConfirmDelete({ id: f.id, name: f.displayName }) }]}>
                <button onClick={() => navigate(`/employee/share/${f.id}`)} className="shared-person" aria-label={`${f.displayName}，${f.relationLabel}，${f.shared ? '已分享' : '未分享'}`}>
                  <span className="shared-avatar shared-name-avatar" data-avatar-tone={(index + 1) % 2}>{Array.from(f.displayName).slice(-2).join("")}</span>
                  <span className="shared-person-name">{f.displayName}</span>
                </button>
              </SwipeAction>
            ))}
            {!atFamilyLimit && Array.from({ length: Math.min(familyLimitNumber - list.families.length, Math.max(1, 3 - list.families.length)) }, (_, index) => (
              <button key={`add-${index}`} onClick={goCreate} className="shared-person shared-person-add">
                <span className="shared-avatar"><Plus size={26} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className="shared-person-name">添加家人</span>
              </button>
            ))}
          </div>
        ) : (
          <SkeletonList rows={2} />
        )}
      </div>

      {list && (
        <div className="group mt-6">
          <div className="card overflow-hidden">
            <div className="row">
              <div className="row-main min-w-0">
                <div className="row-title home-password-title">支付密码</div>
                <div className="mt-1 employee-password-status">
                  <PasswordStatePill state={pinState} />
                </div>
              </div>
              {list.familyPayPassword.payLocked ? (
                <button
                  onClick={doUnlock}
                  disabled={unlocking}
                  className="jnh-btn-danger btn btn-sm shrink-0 px-4 disabled:opacity-50"
                >
                  {unlocking ? '解除中' : '解除冻结'}
                </button>
              ) : (
                <button
                  onClick={() => setPinOpen((v) => !v)}
                  className="password-reset-link"
                >
                  {list.familyPayPassword.payPasswordSet ? '重置' : '去设置'}<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              )}
            </div>
            {!list.familyPayPassword.payLocked && pinOpen && (
              <div className="p-5">
                <PayPinFields
                  pin={pin}
                  pin2={pin2}
                  onPinChange={(value: string) => {
                    setPin(value);
                    setPinError(null);
                  }}
                  onPin2Change={(value: string) => {
                    setPin2(value);
                    setPinError(null);
                  }}
                  label={list.familyPayPassword.payPasswordSet ? '重置为新的 6 位数字密码' : '设置 6 位数字密码'}
                />
                <button
                  onClick={saveFamilyPin}
                  disabled={savingPin || !/^\d{6}$/.test(pin) || pin !== pin2}
                  className="jnh-btn-primary mt-4 w-full disabled:opacity-40"
                >
                  {savingPin ? '保存中…' : list.familyPayPassword.payPasswordSet ? '确认重置' : '保存密码'}
                </button>
                {pinHint && <p className="t-caption mt-3 text-[var(--jnh-danger)]">{pinHint}</p>}
                <p className="t-caption mt-3 leading-relaxed text-[var(--jnh-ink-subtle)]">
                  对全部家人生效；连错 5 次冻结。避免使用生日等真实信息。
                </p>
              </div>
            )}
          </div>
        </div>
      )}


      {/* 删除确认（底部弹层，D10 反馈层级） */}
      {confirmDelete && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[520px] p-4 jnh-safe-bottom">
          <div className="card jnh-card-lg p-5">
            <p className="t-body font-semibold text-[var(--jnh-ink)]">删除「{confirmDelete.name}」？</p>
            <p className="t-caption mt-2 text-[var(--jnh-ink-muted)]">
              删除后该家人的付款链接立即失效，删除后可重新创建。
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="jnh-btn-outline flex-1">
                取消
              </button>
              <button onClick={doDelete} disabled={deleting} className="jnh-btn-danger flex-1">
                {deleting ? '删除中' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuroraShell>
  );
}
