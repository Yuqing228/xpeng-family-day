// 摊主首页：本摊收款码主视觉 + 到账提醒 + 最新到账 + 今日收入 + 台账入口
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Maximize2, Receipt, RefreshCw } from 'lucide-react';
import { apiMerchant, stallPayUrl, ApiError } from '@client/src/api';
import { AuroraShell, HintText } from '@client/src/components/jnh/AuroraShell';
import { PullToRefresh } from '@client/src/components/jnh/interactive';
import { PaymentQRImage } from '@client/src/components/jnh/PaymentQR';
import { useArrivalMonitor } from '@client/src/components/jnh/useArrivalMonitor';
import { useRefundApprovals } from '@client/src/components/jnh/useRefundApprovals';
import { RefundApprovalDialog } from './RefundApprovalDialog';
import {
  readArrivalSoundOn,
  relockArrivalAudioWhenReady,
  unlockArrivalAudio,
  writeArrivalSoundOn,
} from '@client/src/components/jnh/arrival';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import type { MerchantSummary, StallTokenInfo } from '@shared/api.interface';

export default function MerchantHomePage() {
  usePageTitle('家年华支付 · 摊主工作台');
  const navigate = useNavigate();
  const [summary, setSummary] = useState<MerchantSummary | null>(null);
  const [stall, setStall] = useState<StallTokenInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    const saved = readArrivalSoundOn();
    if (saved) relockArrivalAudioWhenReady();
    return saved;
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, st] = await Promise.all([apiMerchant.summary(), apiMerchant.stallToken()]);
      setSummary(s);
      setStall(st);
      setError(null);
    } catch (err) {
      const e = err as ApiError;
      if (e.httpStatus === 403) {
        navigate('/merchant', { replace: true });
        return;
      }
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const { arrivals, clearArrivals, disconnected: arrivalDisconnected } = useArrivalMonitor(true, soundOn);
  const {
    pending: pendingRefunds,
    decide: decideRefund,
    disconnected: refundDisconnected,
  } = useRefundApprovals(true);
  const disconnected = arrivalDisconnected || refundDisconnected;

  const enableSound = () => {
    unlockArrivalAudio();
    writeArrivalSoundOn(true);
    setSoundOn(true);
  };

  const disableSound = () => {
    writeArrivalSoundOn(false);
    setSoundOn(false);
  };

  return (
    <AuroraShell title="摊主工作台" subtitle={summary ? `${summary.stallName} · 已绑定` : '加载中'}>
      {disconnected && (
        <div className="card mb-4 flex items-center justify-between gap-3 border-[var(--jnh-warning)] p-4">
          <span className="t-caption font-semibold text-[var(--jnh-warning-ink)]">
            实时提醒连接中断，请刷新页面
          </span>
          <button
            onClick={() => window.location.reload()}
            className="jnh-btn-outline btn btn-sm shrink-0 gap-1 px-3"
          >
            <RefreshCw size={14} aria-hidden="true" />
            刷新
          </button>
        </div>
      )}
      <PullToRefresh onRefresh={load} refreshing={refreshing}>
        {/* 本摊收款码（主视觉，点击全屏） */}
        {stall ? (
          <button onClick={() => navigate('/merchant/qrcode')} className="hero-card block w-full text-left">
            <div className="relative z-[1] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="hero-label">本摊收款码</div>
                <div className="t-title mt-1 truncate text-white">
                  {stall.stallNo} 号摊 · {stall.stallName}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white">
                <Maximize2 size={12} strokeWidth={2.2} />
                全屏
              </span>
            </div>
            <div className="relative z-[1] mt-5 flex justify-center">
              <PaymentQRImage url={stallPayUrl(stall.stallToken)} size={196} />
            </div>
            <p className="hero-label relative z-[1] mt-4 text-center">顾客扫码后自己输入金额</p>
          </button>
        ) : (
          <div className="skeleton h-[340px] w-full rounded-[20px]" />
        )}

        {/* 到账提醒开关 */}
        <div className="card mt-4 flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="row-title">到账语音提醒</div>
            <div className="row-sub">每笔到账自动播报金额</div>
          </div>
          <button
            role="switch"
            aria-checked={soundOn}
            aria-label="到账语音提醒"
            onClick={soundOn ? disableSound : enableSound}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              soundOn ? 'bg-[var(--jnh-primary)]' : 'bg-[var(--jnh-surface-2)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                soundOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* 最新到账 */}
        {arrivals.length > 0 && (
          <div className="group mt-6">
            <div className="group-head">
              <span className="group-title">最新到账</span>
              <button onClick={clearArrivals} className="group-action">
                清空
              </button>
            </div>
            <div className="card list overflow-hidden">
              {arrivals.slice(0, 5).map((t) => (
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

        {/* 今日收入 */}
        <div className="group mt-6">
          <div className="group-head">
            <span className="group-title">今日收入</span>
            <button onClick={load} disabled={refreshing} className="group-action disabled:opacity-60">
              <RefreshCw size={14} strokeWidth={2.2} className={refreshing ? 'jnh-rotate' : ''} />
              刷新
            </button>
          </div>
          {summary ? (
            <div className="card merchant-income-card overflow-hidden">
              <div className="stat-grid">
                <div className="stat-item">
                  <div className="stat-value">¥{summary.netAmount.toFixed(2)}</div>
                  <div className="stat-label">净流水 · {summary.txCount} 笔</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">¥{summary.refundAmount.toFixed(2)}</div>
                  <div className="stat-label">退款 · {summary.refundCount} 笔</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">¥{summary.commission.toFixed(2)}</div>
                  <div className="stat-label">抽成 {Math.round(summary.commissionRate * 100)}%</div>
                </div>
              </div>
              <div className="income-takehome flex items-center justify-between px-5 py-4">
                <span className="t-body font-semibold text-[var(--jnh-ink)]">预计到手</span>
                <span className="t-display jnh-num text-[var(--jnh-ink)]">¥{summary.takeHome.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="card space-y-3 p-5">
              <div className="skeleton h-6 w-2/3" />
              <div className="skeleton h-6 w-1/2" />
              <div className="skeleton h-8 w-1/3" />
            </div>
          )}
          {error && <p className="t-caption px-1 text-[var(--jnh-danger)]">{error}</p>}
        </div>

        <Link to="/merchant/ledger" className="card mt-4 flex items-center gap-3 px-5 py-4">
          <span className="row-icon row-icon-brand">
            <Receipt size={20} strokeWidth={1.8} />
          </span>
          <div className="row-main">
            <div className="row-title">摊位台账</div>
            <div className="row-sub">查看今日明细与导出</div>
          </div>
          <ChevronRight size={18} className="chevron" strokeWidth={2} />
        </Link>

        <HintText>退款申请实时弹出，同意后原路退回工卡</HintText>
      </PullToRefresh>
      <RefundApprovalDialog pending={pendingRefunds[0] ?? null} onDecide={decideRefund} />
    </AuroraShell>
  );
}
