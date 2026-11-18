// 员工扫码付款：余额主卡 + 扫一扫 + 全家账单（PTR + ↻ 手动刷新）
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { apiEmployee, parseScanStall } from '@client/src/api';
import { PaymentSteps } from '@client/src/components/jnh/PaymentSteps';
import { AuroraShell } from '@client/src/components/jnh/AuroraShell';
import { BillSection, useBill } from '@client/src/components/jnh/BillSection';
import { PullToRefresh } from '@client/src/components/jnh/interactive';
import { ScanCamera } from '@client/src/components/jnh/ScanCamera';
import { SkeletonList } from '@client/src/components/jnh/kit';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { BillResponse } from '@shared/api.interface';

export default function MyCodePage() {
  usePageTitle('家年华支付 · 我的付款');
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<{ name: string; card: string; balance: number | null } | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetcher = useCallback((): Promise<BillResponse> => apiEmployee.bill(), []);

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const { data, error, refreshing, refresh, loading } = useBill(fetcher, {
    enabled: loadState === 'ready',
  });
  const [loadError, setLoadError] = useState<string>('');
  const [needBind, setNeedBind] = useState(false);

  const loadIdentity = useCallback(async () => {
    setLoadState('loading');
    try {
      const ids = await apiEmployee.identities({ expectedFailure: true });
      setIdentity({ name: ids.card.employeeMaskedName, card: ids.card.cardLast4, balance: ids.balance });
      setNeedBind(false);
      setLoadState('ready');
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setNeedBind(code === 'FORBIDDEN' || code === '4004');
      setLoadError(getErrorMessage(err));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  const balanceYuan = data?.balance ?? identity?.balance ?? null;

  return (
    <AuroraShell
      title="扫码付款"
      subtitle={loadState === 'ready' && identity ? `我自己 · ${identity.name} · 工卡 ${identity.card}` : '员工本人付款'}
    >
      {loadState === 'error' && (
        <div className="card p-5">
          <p className="t-body font-semibold text-[var(--jnh-ink)]">
            {needBind ? '还没有绑定工卡' : '信息加载失败'}
          </p>
          <p className="t-caption mt-2 break-words text-[var(--jnh-ink-muted)]">
            {needBind ? loadError : <span className="text-[var(--jnh-danger)]">{loadError}</span>}
          </p>
          <button
            onClick={() => (needBind ? navigate('/employee') : void loadIdentity())}
            className="jnh-btn-primary mt-4 w-full"
          >
            {needBind ? '去绑定工卡' : '重新加载'}
          </button>
        </div>
      )}

      {loadState === 'loading' && <SkeletonList rows={2} />}

      {loadState === 'ready' && (
        <PullToRefresh onRefresh={refresh} refreshing={refreshing}>
          <div className="hero-card apple-balance-card family-balance-card">
            <div className="hero-label">工卡余额（元）</div>
            <div className="hero-amount mt-1">¥{balanceYuan === null ? '--' : balanceYuan.toFixed(2)}</div>
            <div className="hero-label mt-3">以扣款结果为准</div>
            <button onClick={() => setScanning(true)} className="hero-quick-item mt-5 w-full">
              <ScanLine size={18} strokeWidth={2} />
              扫一扫付款
            </button>
          </div>

          <PaymentSteps />

          <BillSection
            balance={data?.balance ?? identity?.balance ?? null}
            transactions={data?.transactions ?? []}
            onRefresh={refresh}
            refreshing={refreshing}
            loading={loading}
            error={error ? getErrorMessage(error) : null}
            detailPath={(txnNo) => `/employee/bill/${txnNo}`}
            cardLabel="全家账单"
          />
        </PullToRefresh>
      )}

      {scanning && (
        <ScanCamera
          title="扫摊位收款码"
          hint="对准摊主出示的收款码"
          parse={(content) => parseScanStall(content)}
          onResult={(stallToken) => {
            setScanning(false);
            navigate(`/pay?s=${encodeURIComponent(stallToken)}&who=self`);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </AuroraShell>
  );
}
