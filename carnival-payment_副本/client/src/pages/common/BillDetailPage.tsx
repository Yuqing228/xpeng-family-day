// 账单详情：员工与家人都可自助登记退款（备注必填），家人登记归属员工
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiEmployee, apiFamily } from '@client/src/api';
import { AuroraShell } from '@client/src/components/jnh/AuroraShell';
import { formatTimeFull, STATUS_LABELS } from '@client/src/components/jnh/BillSection';
import { SkeletonList } from '@client/src/components/jnh/kit';
import { usePageTitle } from '@client/src/hooks/usePageTitle';
import { getErrorMessage } from '@client/src/utils/error-copy';
import { RefundDialog } from './RefundDialog';
import type { BillDetailDTO } from '@shared/api.interface';

export default function BillDetailPage({ mode }: { mode: 'employee' | 'family' }) {
  usePageTitle('家年华支付 · 账单详情');
  const { txnNo = '', token = '' } = useParams<{ txnNo: string; token: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<BillDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  const loadDetail = useCallback(() => {
    setError(null);
    const promise = mode === 'family' ? apiFamily.billDetail(token, txnNo) : apiEmployee.billDetail(txnNo);
    promise
      .then(setDetail)
      .catch((err: unknown) => setError(getErrorMessage(err, '账单加载失败，请稍后重试')));
  }, [mode, token, txnNo]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const back = () => navigate(-1);
  const refundable = detail?.refundable === true;

  return (
    <AuroraShell
      title="账单详情"
      subtitle={detail ? detail.stallName : '加载中'}
      bottom={
        detail ? (
          <div className="flex gap-3">
            <button onClick={back} className="jnh-btn-outline flex-1">
              返回
            </button>
            {refundable && (
              <button onClick={() => setRefundOpen(true)} className="jnh-btn-primary flex-[2]">
                申请退款
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="card p-5">
          <p className="t-body font-semibold text-[var(--jnh-ink)]">账单加载失败</p>
          <p className="t-caption mt-2 break-words text-[var(--jnh-danger)]">{error}</p>
          <button onClick={loadDetail} className="jnh-btn-outline mt-4 w-full">
            重新加载
          </button>
        </div>
      )}

      {!detail && !error && <SkeletonList rows={3} />}

      {detail && (
        <>
          <div className="card bill-ticket p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-1">
                <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
                <span
                  className={`jnh-money ${
                    detail.status === 'revoked'
                      ? 'text-[var(--jnh-ink-subtle)] line-through'
                      : 'text-[var(--jnh-strong)]'
                  }`}
                >
                  {detail.amount.toFixed(2)}
                </span>
              </div>
              <StatusPill status={detail.status} />
            </div>
            <div className="divider bill-ticket-perforation my-4" />
            <div>
              <KvRow k="付款身份" v={detail.payerIdentity} />
              <KvRow k="消费摊位" v={detail.stallName} />
              <KvRow k="时间" v={formatTimeFull(detail.txnTime)} />
              <KvRow k="交易单号" v={detail.txnNo} mono />
              {detail.status !== 'success' && <KvRow k="关联原单" v={detail.relatedTxnNo || '--'} mono />}
              <KvRow
                k="操作人"
                v={`${detail.operatorName}（${detail.operatorType === 'admin' ? '管理员' : '摊主'}）`}
              />
              {detail.channel === 'offline_reentry' && <KvRow k="渠道" v="断网补录" />}
              {detail.remark && <KvRow k="备注" v={detail.remark} />}
            </div>
          </div>

          <div className="card bill-help-card mt-4 p-5">
            <div className="row-title">对这笔扣款有疑问？</div>
            <p className="t-caption mt-2 leading-relaxed text-[var(--jnh-ink-muted)]">
              可申请退款并填写原因，提交后由摊主在摊主端确认，同意后统一原路退回工卡；被拒后可重新申请。
            </p>
          </div>

          <RefundDialog
            detail={detail}
            open={refundOpen}
            onOpenChange={setRefundOpen}
            onSubmitted={loadDetail}
            familyShareToken={mode === 'family' ? token : undefined}
          />
        </>
      )}
    </AuroraShell>
  );
}

function KvRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <span className="t-caption shrink-0 pt-0.5 text-[var(--jnh-ink-muted)]">{k}</span>
      <span
        className={`t-body min-w-0 break-words text-right font-semibold text-[var(--jnh-ink)] ${
          mono ? 'jnh-num break-all' : ''
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const cls =
    status === 'success'
      ? 'chip chip-ok'
      : status === 'refund_pending'
        ? 'chip chip-warn'
        : status === 'failed' || status === 'revoked'
          ? 'chip chip-danger'
          : 'chip';
  return <span className={cls}>{label}</span>;
}
