// LEOPEN 链路诊断页：多接口一键探测 DNS → TCP → TLS → HTTP 全链路，定位小鹏网关连通性卡点
import { useCallback, useEffect, useState } from 'react';
import { AuroraShell } from '@client/src/components/jnh/AuroraShell';
import { GlassCard, NeonButton } from '@client/src/components/jnh/kit';
import { Input } from '@client/src/components/ui/input';
import { apiLeopen } from '@client/src/api';
import { getErrorMessage } from '@client/src/utils/error-copy';
import type {
  LeopenConfigStatus,
  LeopenNetInfo,
  LeopenProbeHistoryItem,
  LeopenProbeResult,
  LeopenProbeTarget,
  LeopenProbeTargetSpec,
} from '@shared/api.interface';
import { LEOPEN_PROBE_TARGETS } from '@shared/api.interface';
import { ProbeResultView } from './ProbeResultView';
import { HistoryList } from './HistoryList';
import { ConfigDialog } from './ConfigDialog';
import { PayConfirmDialog } from './PayConfirmDialog';

const SOURCE_LABEL: Record<LeopenConfigStatus['source'], string> = {
  env: '平台环境变量',
  app_config: '页面配置（兜底）',
  missing: '未配置',
};

const INPUT_HINT: Record<LeopenProbeTarget, string> = {
  'order-state-query': '当前接口不使用工号：按不存在的单号查询，验证链路是否放行。',
  'customer-query': 'customer/query 用该工号查询用户信息（只读，返回分页列表）。',
  'account-balance-query': '用该工号换取真实 custId 后查钱包余额（只读，返回真实余额）。',
  'pay-device': '用该工号换取真实 custId，固定下单 0 元（不扣员工钱），用于验证签名与字段口径，需二次确认。',
};

const ConnectivityPage: React.FC = () => {
  const [target, setTarget] = useState<LeopenProbeTarget>('order-state-query');
  const [custNum, setCustNum] = useState('60321');
  const [probing, setProbing] = useState(false);
  const [result, setResult] = useState<LeopenProbeResult | null>(null);
  const [history, setHistory] = useState<LeopenProbeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [configStatus, setConfigStatus] = useState<LeopenConfigStatus | null>(null);
  const [netInfo, setNetInfo] = useState<LeopenNetInfo | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback((): void => {
    setHistoryLoading(true);
    apiLeopen
      .history(20)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const loadConfigStatus = useCallback((): void => {
    apiLeopen
      .configStatus()
      .then(setConfigStatus)
      .catch(() => setConfigStatus(null));
  }, []);

  const loadNetInfo = useCallback((): void => {
    apiLeopen
      .netInfo()
      .then(setNetInfo)
      .catch(() => setNetInfo(null));
  }, []);

  useEffect(() => {
    loadHistory();
    loadConfigStatus();
    loadNetInfo();
  }, [loadHistory, loadConfigStatus, loadNetInfo]);

  const activeSpec: LeopenProbeTargetSpec =
    LEOPEN_PROBE_TARGETS.find((t: LeopenProbeTargetSpec) => t.target === target) ?? LEOPEN_PROBE_TARGETS[0];

  const handleProbeClick = (): void => {
    if (target === 'pay-device') {
      setPayConfirmOpen(true);
      return;
    }
    void runProbe();
  };

  const runProbe = async (): Promise<void> => {
    const card = custNum.trim();
    if (target === 'customer-query' && !card) {
      setError('请填写要查询的工卡号');
      return;
    }
    setProbing(true);
    setError(null);
    try {
      const r = await apiLeopen.probe(card, target);
      setResult(r);
      loadHistory();
      loadNetInfo();
    } catch (e) {
      setError(getErrorMessage(e, '探测失败，请稍后重试'));
    } finally {
      setProbing(false);
    }
  };

  return (
    <AuroraShell title="链路诊断" subtitle="LEOPEN · 多接口联通性探测">
      {/* 目标信息 */}
      <GlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="t-meta text-[var(--jnh-ink)]">小鹏家年华开放接口</div>
            <div className="jnh-logblock mt-1.5 !py-1.5">
              POST anniversary-homefair-api.x-peng.com{activeSpec.path}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="jnh-btn-outline shrink-0 px-2.5 py-1.5 t-caption active:bg-[var(--jnh-primary-soft)]"
          >
            接口配置
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-caption jnh-num text-[var(--jnh-ink-muted)]">
          <span>
            目标 IP <span className="text-[var(--jnh-ink)]">{netInfo?.targetIp ?? '解析中…'}</span>
          </span>
          <span>
            本实例 IP <span className="text-[var(--jnh-ink)]">{netInfo?.localIp ?? '未取到'}</span>
          </span>
          {netInfo?.egressIp && (
            <span>
              公网出口 IP <span className="text-[var(--jnh-ink)]">{netInfo.egressIp}</span>
            </span>
          )}
        </div>
        <div className="mt-1 t-caption leading-[1.5] text-[var(--jnh-ink-subtle)]">
          出网经本地代理时，本端 socket 是链路本地地址，对端看到的是公网出口 IP；出口 IP 为动态池，每次请求可能不同。
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--jnh-hairline)] pt-2.5 t-caption text-[var(--jnh-ink-muted)]">
          <span>
            凭证：
            <span
              style={{ color: configStatus?.source === 'missing' ? 'var(--jnh-danger)' : 'var(--jnh-success)' }}
              className="font-normal"
            >
              {configStatus ? SOURCE_LABEL[configStatus.source] : '检测中…'}
            </span>
          </span>
          <span>每次探测结果自动留档，trace-id 可直接提供小鹏运维</span>
        </div>
      </GlassCard>

      {/* 接口选择 */}
      <GlassCard className="mt-3 p-4">
        <div className="mb-2 t-caption tracking-[0.32px] text-[var(--jnh-ink-subtle)] uppercase">探测目标接口</div>
        <div
          role="radiogroup"
          aria-label="探测目标接口"
          className="divide-y divide-[var(--jnh-hairline)] overflow-hidden rounded-xl bg-[var(--jnh-surface)]"
        >
          {LEOPEN_PROBE_TARGETS.map((t: LeopenProbeTargetSpec) => {
            const selected = t.target === target;
            return (
              <button
                key={t.target}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTarget(t.target)}
                className="block w-full border-l-[3px] px-3 py-2.5 text-left"
                style={{
                  borderLeftColor: selected ? 'var(--jnh-primary)' : 'transparent',
                  background: selected ? 'var(--jnh-primary-soft)' : 'var(--jnh-surface)',
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="t-meta text-[var(--jnh-ink)]">{t.label}</span>
                  <span className="shrink-0 t-caption" style={{ color: t.authorized ? 'var(--jnh-success)' : 'var(--jnh-warning)' }}>
                    {t.authorized ? '授权清单内' : '不在授权清单'}
                  </span>
                </div>
                <div className="mt-0.5 t-caption jnh-num text-[var(--jnh-ink-muted)]">{t.path}</div>
                <div className="mt-1 t-caption leading-relaxed text-[var(--jnh-ink-muted)]">{t.note}</div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* 发起探测 */}
      <GlassCard className="mt-3 p-4">
        <div className="mb-1 t-caption tracking-[0.32px] text-[var(--jnh-ink-muted)]">查询工卡号（custNum）</div>
        <Input
          value={custNum}
          onChange={(e) => setCustNum(e.target.value)}
          placeholder="如 60321"
          inputMode="numeric"
          className="flex-1"
        />
        <p className="mt-1.5 t-caption leading-relaxed text-[var(--jnh-ink-muted)]">{INPUT_HINT[target]}</p>
        <div className="mt-3">
          <NeonButton onClick={handleProbeClick} disabled={probing} variant="primary">
            {probing ? '探测中，最长约 35 秒…' : activeSpec.sideEffect ? '发起 0 元下单验证' : '发起链路探测'}
          </NeonButton>
        </div>
        {error && <p className="mt-2 t-caption leading-relaxed text-[var(--jnh-danger)]">{error}</p>}
      </GlassCard>

      {/* 最近一次结果 */}
      {result && (
        <div className="mt-4">
          <ProbeResultView result={result} />
        </div>
      )}

      {/* 历史 */}
      <HistoryList items={history} loading={historyLoading} onRefresh={loadHistory} />

      <p className="mt-3 mb-2 text-center t-caption leading-relaxed tracking-[0.16px] text-[var(--jnh-ink-subtle)]">
        探测由本服务直连小鹏网关，完整复现支付链路的出网路径；各阶段独立超时（DNS 5s / TCP 5s / TLS 10s / HTTP 15s）。
      </p>

      <PayConfirmDialog
        open={payConfirmOpen}
        onOpenChange={setPayConfirmOpen}
        custNum={custNum.trim()}
        onConfirm={() => {
          setPayConfirmOpen(false);
          void runProbe();
        }}
      />
      <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} onSaved={loadConfigStatus} />
    </AuroraShell>
  );
};

export default ConnectivityPage;
