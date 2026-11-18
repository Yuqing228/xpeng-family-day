// 全屏收款码页：码放大 + 摊位名 + 到账卡片流 + 语音
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Volume2 } from 'lucide-react';
import { apiMerchant, stallPayUrl, ApiError } from '@client/src/api';
import { useArrivalMonitor } from '@client/src/components/jnh/useArrivalMonitor';
import {
  readArrivalSoundOn,
  relockArrivalAudioWhenReady,
  unlockArrivalAudio,
  writeArrivalSoundOn,
} from '@client/src/components/jnh/arrival';
import { BrandBar } from '@client/src/components/jnh/AuroraShell';
import { PaymentQR } from '@client/src/components/jnh/PaymentQR';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import type { StallTokenInfo } from '@shared/api.interface';

export default function MerchantQrCodePage() {
  usePageTitle('家年华支付 · 收款码');
  const navigate = useNavigate();
  const [stall, setStall] = useState<StallTokenInfo | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    const saved = readArrivalSoundOn();
    if (saved) relockArrivalAudioWhenReady();
    return saved;
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setStall(await apiMerchant.stallToken());
      setError(null);
    } catch (err) {
      const e = err as ApiError;
      if (e.httpStatus === 403) {
        navigate('/merchant', { replace: true });
        return;
      }
      setError(e.message);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const { arrivals, refresh: refreshArrivals } = useArrivalMonitor(true, soundOn);

  const refreshArrivalFeed = () => {
    refreshArrivals();
    const label = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    setRefreshedAt(label);
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshedAt(null);
      refreshTimerRef.current = null;
    }, 3000);
  };

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  return (
    <div className="jnh-page flex min-h-dvh flex-col">
      <header className="aurora-header top-0 z-10 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate('/merchant/home')}
          aria-label="返回首页"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--jnh-surface-1)] text-[var(--jnh-ink)]"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <BrandBar />
        <div className="min-w-0 flex-1">
          <div className="t-title truncate text-[var(--jnh-ink)]">
            {stall ? `${stall.stallNo} 号摊 · ${stall.stallName}` : '收款码'}
          </div>
          <div className="t-caption truncate text-[var(--jnh-ink-muted)]">
            {refreshedAt ? `已刷新 ${refreshedAt}` : '顾客扫码后自行输入金额'}
          </div>
        </div>
        <button
          onClick={refreshArrivalFeed}
          aria-label="刷新到账"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--jnh-surface-1)] text-[var(--jnh-ink-muted)]"
        >
          <RefreshCw size={18} strokeWidth={2} />
        </button>
      </header>

      <div className="jnh-enter flex flex-1 flex-col items-center justify-center px-5 py-6">
        {stall ? (
          <div className="merchant-qr-card">
            <PaymentQR url={stallPayUrl(stall.stallToken)} size={240} />
            <p className="t-body mt-5 text-center font-semibold text-[var(--jnh-ink)]">
              扫一扫 · 向本摊付款
            </p>
            <p className="t-caption mt-1 text-center text-[var(--jnh-ink-muted)]">
              顾客扫码后自行输入金额并确认
            </p>

            {!soundOn ? (
              <button
                onClick={() => {
                  unlockArrivalAudio();
                  writeArrivalSoundOn(true);
                  setSoundOn(true);
                }}
                className="jnh-btn-primary mt-6 w-full max-w-[360px]"
              >
                <Volume2 size={18} strokeWidth={2} />
                开启到账语音提醒
              </button>
            ) : (
              <div className="merchant-voice-status mt-6 flex items-center gap-2 rounded-full bg-[var(--jnh-primary-soft)] px-4 py-2">
                <Volume2 size={16} strokeWidth={2} className="text-[var(--jnh-strong)]" />
                <span className="t-caption font-semibold text-[var(--jnh-strong)]">
                  到账语音已开启 · 本页前台时自动播报
                </span>
              </div>
            )}

            {arrivals.length > 0 && (
              <div className="mt-7 w-full max-w-[420px]">
                <div className="group-head mb-2.5">
                  <span className="group-title">最新到账</span>
                </div>
                <div className="card list overflow-hidden">
                  {arrivals.slice(0, 6).map((t) => (
                    <div key={t.txnNo} className="row">
                      <div className="row-main">
                        <div className="row-title">{t.payerIdentity}</div>
                        <div className="row-sub jnh-num">
                          {new Date(t.txnTime).toLocaleTimeString('zh-CN')} · {t.txnNo}
                        </div>
                      </div>
                      <span className="row-value row-value-pos">+¥{t.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="t-caption mt-4 text-[var(--jnh-danger)]">{error}</p>}
          </div>
        ) : (
          <div className="skeleton mt-6 h-[340px] w-full max-w-[340px] rounded-[20px]" />
        )}
      </div>
    </div>
  );
}
