// 家人端：免登录进入 + 页内扫一扫付款（保持家人身份）+ 全家账单
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { apiFamily, parseScanStall, ApiError } from '@client/src/api';
import { PaymentSteps } from '@client/src/components/jnh/PaymentSteps';
import { AuroraShell } from '@client/src/components/jnh/AuroraShell';
import { BillSection, useBill } from '@client/src/components/jnh/BillSection';
import { PullToRefresh, EmptyState, EmptyIcons } from '@client/src/components/jnh/interactive';
import { ScanCamera } from '@client/src/components/jnh/ScanCamera';
import { FamilyPasswordCard } from '@client/src/components/jnh/FamilyPasswordCard';
import { SkeletonList } from '@client/src/components/jnh/kit';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { clearFamilyPayer, saveFamilyPayer } from '@client/src/utils/family-payer';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { BillResponse, FamilySession } from '@shared/api.interface';

export default function FamilyPage() {
  usePageTitle('家年华支付 · 家人端');
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<FamilySession | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'expired' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);

  const fetcher = useCallback((): Promise<BillResponse> => apiFamily.bill(token), [token]);
  const { data, error, refreshing, refresh, loading } = useBill(
    state === 'ready' ? fetcher : nullFetcher,
  );

  const loadSession = useCallback(async () => {
    setState('loading');
    try {
      const s = await apiFamily.session(token);
      setSession(s);
      setState('ready');
      saveFamilyPayer({ token, displayName: s.displayName });
    } catch (err) {
      const e = err as ApiError;
      if (e.httpStatus === 404) {
        clearFamilyPayer();
        setState('invalid');
        setMessage(e.message);
      } else if (e.httpStatus === 403) {
        clearFamilyPayer();
        setState('expired');
        setMessage(e.message);
      } else {
        setState('error');
        setMessage(e.message);
      }
    }
  }, [token]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (state === 'invalid' || state === 'expired' || state === 'error') {
    return (
      <AuroraShell title="家人付款" subtitle="链接状态">
        <div className="center-stage">
          <div className="card">
            <EmptyState
              icon={EmptyIcons.link}
              text={state === 'expired' ? '链接已失效：专属链接仅活动当天有效' : message || '链接无效或已失效'}
              actionLabel="重新加载"
              onAction={loadSession}
            />
          </div>
        </div>
      </AuroraShell>
    );
  }

  return (
    <AuroraShell
      title={session ? `${session.displayName} 的付款码` : '家人付款'}
      subtitle={
        session ? `${session.employeeMaskedName} 的家人 · 工卡尾号 ${session.cardLast4}` : '加载中'
      }
    >
      {state === 'loading' && <SkeletonList rows={2} />}

      {state === 'ready' && token && session && (
        <PullToRefresh onRefresh={refresh} refreshing={refreshing}>
          <div className="hero-card apple-balance-card family-balance-card">
            <div className="hero-label">工卡余额（元）</div>
            <div className="hero-amount mt-1">
              ¥{(data?.balance ?? session.balance).toFixed(2)}
            </div>
            <div className="hero-label mt-3">消费记在员工工卡名下</div>
            <button onClick={() => setScanning(true)} className="hero-quick-item mt-5 w-full">
              <ScanLine size={18} strokeWidth={2} />
              扫一扫付款
            </button>
          </div>

          <PaymentSteps />

          {!session.isSelf && (
            <FamilyPasswordCard payPasswordSet={session.payPasswordSet} payLocked={session.payLocked} />
          )}

          <BillSection
            balance={data?.balance ?? session.balance}
            transactions={data?.transactions ?? []}
            onRefresh={refresh}
            refreshing={refreshing}
            loading={loading}
            error={error ? getErrorMessage(error) : null}
            detailPath={(txnNo) => `/f/${token}/bill/${txnNo}`}
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
            navigate(`/pay?s=${encodeURIComponent(stallToken)}&who=${encodeURIComponent(token)}`);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </AuroraShell>
  );
}

const nullFetcher = (): Promise<BillResponse> => Promise.resolve({ balance: 0, transactions: [] });
