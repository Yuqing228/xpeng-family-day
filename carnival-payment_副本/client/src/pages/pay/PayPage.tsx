// /pay 顾客付款页（C 扫 B 核心）：扫摊位码进入 → 摊位+付款人识别 → 输金额 → 二次确认 → 结果
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, ChevronLeft, CreditCard, Users, WifiOff } from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { authClient } from '@lark-apaas/client-toolkit/auth';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { apiEmployee, apiPayment } from '@client/src/api';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import { AmountKeypad, applyAmountKey } from '@client/src/components/jnh/AmountKeypad';
import { EmptyState } from '@client/src/components/jnh/interactive';
import { PasswordStatePill, type PasswordState } from '@client/src/components/jnh/PasswordStatePill';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { clearFamilyPayer, readFamilyPayer } from '@client/src/utils/family-payer';
import type { CheckoutResponse, EmployeeSession, PrepareResponse } from '@shared/api.interface';

/** 微信内置浏览器（家人环境）：不探测员工登录态、不展示授权入口 */
const isWeChatUa = (): boolean => /MicroMessenger/i.test(navigator.userAgent);

/** 自动授权跳转标记：每标签页只自动跳一次，防取消授权回跳后死循环 */
const AUTO_LOGIN_KEY = 'jnh_pay_autologin';

type Phase = 'prepare' | 'entry' | 'confirm' | 'password' | 'processing' | 'success' | 'failed';

// 临时放开 0 元单（活动试用期）；正式上线改回 false 即恢复「金额必须大于 0」
const ALLOW_ZERO_AMOUNT = true;

/** 首次扫码授权登录成功：本人 + 非微信 + 本标签页带授权标记 → 旁路发一次欢迎消息（服务端幂等） */
const maybeNotifyFirstLogin = (payerToken: string): void => {
  if ((payerToken && payerToken !== 'self') || isWeChatUa()) return;
  if (!sessionStorage.getItem(AUTO_LOGIN_KEY)) return;
  sessionStorage.removeItem(AUTO_LOGIN_KEY);
  apiPayment.firstLoginNotify().catch((err: unknown) => {
    logger.error('首次登录欢迎消息发送失败', err);
  });
};

const isAmountSubmittable = (amountText: string): boolean => {
  if (amountText === '') return false;
  const amountYuan = Number(amountText);
  if (!Number.isFinite(amountYuan)) return false;
  return ALLOW_ZERO_AMOUNT ? amountYuan >= 0 : amountYuan > 0;
};

export default function PayPage() {
  usePageTitle('家年华支付 · 付款');
  const [params] = useSearchParams();
  const stallToken = params.get('s') || '';
  const who = params.get('who') || readFamilyPayer()?.token || '';
  const navigate = useNavigate();

  const [prep, setPrep] = useState<PrepareResponse | null>(null);
  // 摊位上下文加载失败：整页错误卡 + 重试入口（不停在「加载中」）
  const [loadError, setLoadError] = useState('');
  // NEED_IDENTITY 时的员工登录态探测（微信家人环境跳过，避免 401 触发平台自动跳登录）
  const [empSession, setEmpSession] = useState<EmployeeSession | null>(null);
  const [empDone, setEmpDone] = useState(false);
  // 自动授权跳转已发起：探测期与跳转期共用「正在识别中」过渡态
  const [autoJumping, setAutoJumping] = useState(false);
  const [phase, setPhase] = useState<Phase>('prepare');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<CheckoutResponse | null>(null);
  const [procStart, setProcStart] = useState(0);
  const [procNow, setProcNow] = useState(0);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [pinLocked, setPinLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const requestId = useRef('');

  const load = useCallback(async () => {
    setPhase('prepare');
    setPrep(null);
    setLoadError('');
    try {
      const res = await apiPayment.prepare(stallToken, who);
      setPrep(res);
      setPhase(res.code === 'OK' ? 'entry' : 'prepare');
      if (res.code === 'OK') {
        maybeNotifyFirstLogin(who);
        return;
      }
      if (res.code === 'NEED_IDENTITY') {
        setEmpSession(null);
        setEmpDone(false);
        if (isWeChatUa()) {
          setEmpDone(true);
        } else {
          apiEmployee
            .session({ autoJumpToLogin: false })
            .then((s) => setEmpSession(s))
            .catch(() => setEmpSession(null))
            .finally(() => setEmpDone(true));
        }
      }
    } catch (err) {
      const message = getErrorMessage(err, '页面加载失败，请稍后重试');
      setLoadError(message);
      toast.error(message);
      setPhase('prepare');
    }
  }, [stallToken, who]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (phase !== 'processing') return;
    const timer = setInterval(() => setProcNow(Date.now()), 120);
    return () => clearInterval(timer);
  }, [phase]);

  // 未登录员工自动发起飞书授权；loggedIn 后清标记，取消回跳后由按钮兜底
  // useLayoutEffect：setState 在绘制前同步生效，探测完成那一帧的引导卡不会被画出来
  useLayoutEffect(() => {
    if (empSession?.loggedIn === true) {
      sessionStorage.removeItem(AUTO_LOGIN_KEY);
      return;
    }
    if (!empDone || prep?.code !== 'NEED_IDENTITY' || isWeChatUa()) return;
    if (sessionStorage.getItem(AUTO_LOGIN_KEY)) return;
    sessionStorage.setItem(AUTO_LOGIN_KEY, '1');
    setAutoJumping(true);
    void authClient.session.redirectToLogin();
  }, [prep, empDone, empSession]);

  const amountNum = Number(amount);

  const doPay = async (payPassword?: string) => {
    if (!isAmountSubmittable(amount)) return;
    requestId.current = nanoid();
    setPhase('processing');
    setProcStart(Date.now());
    setProcNow(Date.now());
    try {
      const res = await apiPayment.checkout({
        stallToken,
        who,
        amount: amountNum,
        requestId: requestId.current,
        payPassword,
      });
      setResult(res);
      setPhase(res.success ? 'success' : 'failed');
    } catch (err) {
      setResult({ success: false, failureCode: 'NETWORK', failureMessage: getErrorMessage(err) });
      setPhase('failed');
    }
  };

  const beginPay = () => {
    if (phase !== 'confirm' || !isAmountSubmittable(amount)) return;
    setPin('');
    setPinMsg('');
    setPinLocked(false);
    if (prep?.passwordRequired) {
      setPhase('password');
      return;
    }
    void doPay();
  };

  const submitPin = async (candidate: string) => {
    if (verifying) return;
    if (!who) {
      toast.error('请从家人专属链接或员工端进入后付款');
      setPhase('confirm');
      return;
    }
    setVerifying(true);
    try {
      const res = await apiPayment.verifyPassword(who, candidate);
      if (res.ok) {
        await doPay(candidate);
        return;
      }
      setPin('');
      setPinMsg(res.message || '支付密码错误');
      setPinLocked(res.locked);
    } catch (err) {
      // 单通道：只在密码点下方内联红字提示，不再叠加 toast
      setPin('');
      setPinMsg(getErrorMessage(err, '支付密码错误，请重试'));
    } finally {
      setVerifying(false);
    }
  };

  const handlePinKey = (key: string) => {
    if (verifying || pinLocked) return;
    if (key === 'clear') {
      setPin('');
      return;
    }
    if (key === 'back') {
      setPin(pin.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || pin.length >= 6) return;
    setPinMsg('');
    const next = pin + key;
    setPin(next);
    if (next.length === 6) void submitPin(next);
  };

  /* ---------- 非正常态：引导 / 失效 / 无效码 ---------- */
  if (!stallToken) {
    return (
      <AuroraShell title="扫码付款" subtitle="缺少摊位码">
        <div className="center-stage">
          <GuideCard text="请通过扫摊位收款码进入本页" />
        </div>
      </AuroraShell>
    );
  }
  if (loadError) {
    return (
      <AuroraShell title="页面加载失败" subtitle="请检查网络后重新加载">
        <div className="center-stage">
          <div className="card">
            <EmptyState
              icon={<WifiOff size={26} strokeWidth={1.6} aria-hidden="true" />}
              text={loadError}
              actionLabel="重新加载"
              onAction={() => void load()}
            />
          </div>
        </div>
      </AuroraShell>
    );
  }
  if (prep && prep.code === 'NEED_IDENTITY') {
    const isWeChat = isWeChatUa();
    // 过渡期极简态：探测登录态 / 自动跳转授权期间只显示一行，不渲染引导卡
    if (!isWeChat && (!empDone || autoJumping)) {
      return (
        <AuroraShell title="扫码付款" subtitle={prep.stall ? prep.stall.stallName : ''}>
          <div className="card mt-2 flex items-center justify-center gap-3 p-6">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--jnh-hairline)] border-t-[var(--jnh-primary)]" />
            <span className="t-body text-[var(--jnh-ink-muted)]">正在识别中</span>
          </div>
        </AuroraShell>
      );
    }
    const empLoggedIn = empSession?.loggedIn === true;
    const empCard = empSession?.card ?? null;
    const whoFromUrl = params.get('who') !== null;
    const empText = empLoggedIn
      ? empCard
        ? whoFromUrl
          ? '家人专属链接已失效，请让员工重新分享'
          : '本机缓存的家人身份已失效，清除后即可用本人身份付款'
        : '当前飞书账号尚未关联工卡，请绑定工号后再扫码付款'
      : isWeChat
        ? '请在飞书内打开家年华支付，从「我自己」进入扫码付款'
        : '点击下方按钮授权登录，即可直接以本人身份付款';
    return (
      <AuroraShell
        title="扫码付款"
        subtitle={prep.stall ? prep.stall.stallName : ''}
        bottom={
          empDone && !empLoggedIn && !isWeChat ? (
            <button
              onClick={() => {
                sessionStorage.setItem(AUTO_LOGIN_KEY, '1');
                void authClient.session.redirectToLogin();
              }}
              className="jnh-btn-primary w-full"
            >
              飞书授权登录后付款
            </button>
          ) : undefined
        }
      >
        <div className="card p-5">
          <h1 className="t-heading text-[var(--jnh-ink)]">请先确认付款身份</h1>
          <div className="mt-4 space-y-3">
            <div className="note">
              <Users size={16} strokeWidth={2} />
              <span>家人：微信打开专属链接后在页内扫码</span>
            </div>
            <div className="note">
              <CreditCard size={16} strokeWidth={2} />
              <span>员工：{empText}</span>
            </div>
          </div>

          {empDone && empLoggedIn && !empCard && (
            <Link to="/employee" className="jnh-btn-primary mt-5 w-full">
              去员工端绑定工号
            </Link>
          )}
          {empDone && empLoggedIn && empCard && !whoFromUrl && (
            <button
              onClick={() => {
                clearFamilyPayer();
                navigate(0);
              }}
              className="jnh-btn-outline mt-5 w-full"
            >
              清除失效家人身份 · 用本人身份付款
            </button>
          )}
        </div>
        <HintText>本页不提供匿名付款入口</HintText>
      </AuroraShell>
    );
  }
  if (prep && (prep.code === 'PASSWORD_LOCKED' || prep.code === 'PASSWORD_NOT_SET')) {
    const locked = prep.code === 'PASSWORD_LOCKED';
    const passwordState: PasswordState = locked ? 'locked' : 'unset';
    return (
      <AuroraShell
        title="扫码付款"
        subtitle={prep.stall ? prep.stall.stallName : ''}
        bottom={
          <Link to={backPath(who)} className="jnh-btn-outline w-full">
            返回
          </Link>
        }
      >
        <div className="card p-6">
          <PasswordStatePill state={passwordState} />
          <p
            className={`t-body mt-3 leading-relaxed ${
              locked ? 'text-[var(--jnh-danger)]' : 'text-[var(--jnh-warning-ink)]'
            }`}
          >
            {prep.message}
          </p>
          <p className="t-caption mt-3 text-[var(--jnh-ink-muted)]">
            {locked
              ? '冻结期间无法付款：请联系工卡持有人在员工端身份列表「解除冻结」。'
              : '请联系工卡持有人在员工端该家人的分享页设置支付密码。'}
          </p>
        </div>
      </AuroraShell>
    );
  }
  if (prep && (prep.code === 'INVALID_STALL' || prep.code === 'OUT_OF_WINDOW')) {
    return (
      <AuroraShell
        title="扫码付款"
        subtitle="码已失效"
        bottom={
          <Link to={backPath(who)} className="jnh-btn-outline w-full">
            返回
          </Link>
        }
      >
        <div className="center-stage">
          <div className="card p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--jnh-surface-1)] text-[var(--jnh-ink-muted)]">
              <AlertTriangle size={28} strokeWidth={1.6} />
            </div>
            <h1 className="t-heading mt-4 text-[var(--jnh-ink)]">
              {prep.code === 'OUT_OF_WINDOW' ? '活动已结束' : '摊位码无效'}
            </h1>
            <p className="t-body mt-2 text-[var(--jnh-ink-muted)]">{prep.message}</p>
          </div>
        </div>
      </AuroraShell>
    );
  }

  /* ---------- 主流程 ---------- */
  const showContext = (phase === 'entry' || phase === 'failed' || phase === 'processing') && prep?.payer;

  return (
    <AuroraShell
      title={prep?.stall ? `付款 · ${prep.stall.stallNo} 号摊` : '扫码付款'}
      subtitle={prep?.stall?.stallName}
      bottom={
        phase === 'entry' && isAmountSubmittable(amount) ? (
          <button onClick={() => setPhase('confirm')} className="jnh-btn-primary w-full">
            确认付款 ¥{amountNum.toFixed(2)}
          </button>
        ) : undefined
      }
    >
      {showContext && prep?.payer && (
        <div className="card list overflow-hidden">
          <div className="row">
            <div className="row-main">
              <div className="row-title">{prep.stall?.stallName}</div>
              <div className="row-sub">本次付款将从工卡余额扣除</div>
            </div>
            <span className="chip">{prep.stall?.stallNo} 号摊</span>
          </div>
          <div className="row">
            <div className="row-main">
              <div className="row-title">
                {prep.payer.displayName}
                <span className="chip chip-brand ml-2">
                  {prep.payer.relationLabel === '本人' ? '本人' : '家人'}
                </span>
              </div>
              <div className="row-sub">
                {prep.payer.employeeMaskedName} · 工卡尾号 {prep.payer.cardLast4}
              </div>
            </div>
            {prep.balance !== null && (
              <span className="row-value">¥{prep.balance.toFixed(2)}</span>
            )}
          </div>
        </div>
      )}

      {/* 金额键盘 */}
      {(phase === 'entry' || phase === 'failed') && (
        <>
          <div className="card mt-4 px-5 py-6 text-center">
            <div className="t-caption text-[var(--jnh-ink-muted)]">输入金额（元）</div>
            <div className="mt-2 flex items-baseline justify-center gap-1.5">
              <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
              <span
                className={`jnh-money min-w-[4ch] text-center ${
                  isAmountSubmittable(amount) ? 'text-[var(--jnh-ink)]' : 'text-[var(--jnh-ink-subtle)]'
                }`}
              >
                {amount === '' ? '\u00A0' : amount}
              </span>
            </div>
            <div className="t-caption mt-1 text-[var(--jnh-ink-subtle)]">
              {amount === '' ? '按下方数字键输入金额' : '确认后需再次核对付款信息'}
            </div>
          </div>
          <div className="mt-4">
            <AmountKeypad onKey={(k) => setAmount((cur) => applyAmountKey(cur, k))} />
          </div>
        </>
      )}

      {/* 二次确认 */}
      {phase === 'confirm' && prep?.payer && (
        <div className="card mt-2 p-6 text-center">
          <div className="t-caption text-[var(--jnh-ink-muted)]">向「{prep.stall?.stallName}」付款</div>
          <div className="mt-2 flex items-baseline justify-center gap-1.5">
            <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
            <span className="jnh-money money-accent">{amountNum.toFixed(2)}</span>
          </div>
          <div className="divider my-5" />
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <span className="t-caption text-[var(--jnh-ink-muted)]">付款人</span>
              <span className="t-body font-semibold text-[var(--jnh-ink)]">{prep.payer.displayName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="t-caption text-[var(--jnh-ink-muted)]">工卡尾号</span>
              <span className="t-body jnh-num font-semibold text-[var(--jnh-ink)]">
                {prep.payer.cardLast4}
              </span>
            </div>
            {prep.balance !== null && (
              <div className="flex items-center justify-between">
                <span className="t-caption text-[var(--jnh-ink-muted)]">工卡余额</span>
                <span className="t-body jnh-num font-semibold text-[var(--jnh-ink)]">
                  ¥{prep.balance.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setPhase('entry')} className="jnh-btn-outline flex-1">
              取消
            </button>
            <button onClick={beginPay} className="jnh-btn-primary flex-[2]">
              确认付款
            </button>
          </div>
          {prep.passwordRequired && (
            <p className="t-caption mt-3 text-[var(--jnh-ink-subtle)]">
              下一步需输入该家人的 6 位支付密码
            </p>
          )}
        </div>
      )}

      {/* 家庭支付密码 */}
      {phase === 'password' && prep?.payer && (
        <>
          <div className="card mt-2 p-6 text-center">
            <div className="t-caption text-[var(--jnh-ink-muted)]">
              向「{prep.stall?.stallName}」付款 ¥{amountNum.toFixed(2)}
            </div>
            <div className="t-heading mt-2 text-[var(--jnh-ink)]">
              {verifying ? '正在校验…' : '输入家庭支付密码'}
            </div>
            <div className="mt-5 flex justify-center gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full border transition-colors ${
                    i < pin.length
                      ? 'border-[var(--jnh-primary)] bg-[var(--jnh-primary)]'
                      : 'border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)]'
                  }`}
                />
              ))}
            </div>
            {pinMsg && <p className="t-caption mt-4 text-[var(--jnh-danger)]">{pinMsg}</p>}
            {pinLocked ? (
              <button onClick={() => void load()} className="jnh-btn-outline mt-5 w-full">
                刷新页面状态
              </button>
            ) : (
              <button
                onClick={() => setPhase('confirm')}
                disabled={verifying}
                className="jnh-btn-outline mt-5 w-full disabled:opacity-40"
              >
                取消
              </button>
            )}
          </div>
          {!pinLocked && (
            <div className="mt-4">
              <AmountKeypad decimal={false} onKey={handlePinKey} />
            </div>
          )}
          <HintText>连错 5 次冻结，需员工端解除</HintText>
        </>
      )}

      {phase === 'processing' && <ProcessingCard elapsed={procNow - procStart} />}

      {/* 成功 */}
      {phase === 'success' && result && (
        <div className="card mt-2 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--jnh-primary-soft)]">
            <Check size={30} strokeWidth={2.4} color="var(--jnh-success)" />
          </div>
          <h1 className="t-heading mt-4 text-[var(--jnh-ink)]">付款成功</h1>
          <div className="mt-1 flex items-baseline justify-center gap-1.5">
            <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
            <span className="jnh-money money-accent">{amountNum.toFixed(2)}</span>
          </div>
          <div className="divider my-5" />
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <span className="t-caption text-[var(--jnh-ink-muted)]">最新余额</span>
              <span className="t-body jnh-num font-semibold text-[var(--jnh-ink)]">
                ¥{result.balanceAfter?.toFixed(2) ?? '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="t-caption text-[var(--jnh-ink-muted)]">时间</span>
              <span className="t-body text-[var(--jnh-ink)]">{nowTime()}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="t-caption shrink-0 text-[var(--jnh-ink-muted)]">单号</span>
              <span className="t-caption jnh-num truncate text-[var(--jnh-ink-subtle)]">{result.txnNo}</span>
            </div>
          </div>
          <button onClick={() => navigate(backPath(who))} className="jnh-btn-primary mt-6 w-full">
            完成返回
          </button>
        </div>
      )}

      {/* 失败 */}
      {phase === 'failed' && result && (
        <div
          className={`card mt-4 p-5 ${
            result.failureCode === 'UNKNOWN'
              ? 'border-[var(--jnh-warning)]'
              : 'border-[var(--jnh-hairline)]'
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${
                result.failureCode === 'UNKNOWN'
                  ? 'bg-[var(--jnh-warning-bg)] text-[var(--jnh-warning-ink)]'
                  : 'bg-[var(--jnh-danger-soft)] text-[var(--jnh-danger)]'
              }`}
            >
              <AlertTriangle size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="t-title text-[var(--jnh-ink)]">
                {result.failureCode === 'UNKNOWN' ? '扣款结果待确认' : '付款失败'}
              </div>
              <p className="t-caption mt-1 leading-relaxed text-[var(--jnh-ink-muted)]">
                {result.failureCode === 'UNKNOWN'
                  ? '系统未收到摊位的扣款回执，已停止重试以免重复扣款。'
                  : result.failureMessage}
              </p>
            </div>
          </div>
          {result.balance !== undefined && (
            <div className="mt-3 flex items-center justify-between border-t border-[var(--jnh-hairline)] pt-3">
              <span className="t-caption text-[var(--jnh-ink-muted)]">当前余额</span>
              <span className="t-body jnh-num font-semibold text-[var(--jnh-ink)]">
                ¥{result.balance.toFixed(2)}
              </span>
            </div>
          )}
          <p className="t-caption mt-3 text-[var(--jnh-ink-subtle)]">
            {result.failureCode === 'UNKNOWN'
              ? '请稍后在「我的 · 消费记录」查看最终结果。'
              : '可修改上方金额后重新确认，或改用现场微信支付通道。'}
          </p>
          <Link to={backPath(who)} className="jnh-btn-outline mt-4 w-full">
            放弃并返回
          </Link>
        </div>
      )}
    </AuroraShell>
  );
}

/** 返回路径：家人回专属链接页，员工回我的付款页 */
function backPath(who: string): string {
  return who && who !== 'self' ? `/f/${who}` : '/employee/me';
}

function GuideCard({ text }: { text: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]">
        <ChevronLeft size={28} strokeWidth={1.8} />
      </div>
      <p className="t-body mt-4 text-[var(--jnh-ink-muted)]">{text}</p>
    </div>
  );
}

function ProcessingCard({ elapsed }: { elapsed: number }) {
  const seconds = Math.min(Math.floor(elapsed / 500), 3);
  return (
    <div className="card mt-2 p-8 text-center">
      <div className="jnh-conic mx-auto h-10 w-10" aria-hidden="true" />
      <h1 className="t-heading mt-4 text-[var(--jnh-ink)]">付款处理中</h1>
      <ul className="mt-4 space-y-2 text-left">
        {['同工卡排队', '余额校验', '调用扣款服务'].map((s, i) => (
          <li key={s} className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                i < seconds
                  ? 'bg-[var(--jnh-primary)] text-[var(--jnh-on-primary)]'
                  : i === seconds
                    ? 'bg-[var(--jnh-primary-soft)] text-[var(--jnh-strong)]'
                    : 'bg-[var(--jnh-surface-1)] text-[var(--jnh-ink-subtle)]'
              }`}
            >
              {i < seconds ? '✓' : i + 1}
            </span>
            <span
              className={`t-body ${
                i <= seconds ? 'text-[var(--jnh-ink)]' : 'text-[var(--jnh-ink-subtle)]'
              }`}
            >
              {s}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-caption mt-4 text-[var(--jnh-ink-subtle)]">约 1–2 秒 · 请勿退出页面</p>
    </div>
  );
}

function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}
