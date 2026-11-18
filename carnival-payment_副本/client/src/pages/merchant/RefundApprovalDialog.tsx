// 摊主退款审批弹窗：待确认单自动弹出；同意即时生效，拒绝可填原因（展示给申请人）
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@client/src/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Label } from '@client/src/components/ui/label';
import { Textarea } from '@client/src/components/ui/textarea';
import { NeonButton } from '@client/src/components/jnh/kit';
import type {
  MerchantPendingRefund,
  MerchantRefundDecideRequest,
  MerchantRefundDecideResponse,
} from '@shared/api.interface';

const MAX_REJECT_REASON = 100;

export function RefundApprovalDialog({
  pending,
  onDecide,
}: {
  pending: MerchantPendingRefund | null;
  onDecide: (req: MerchantRefundDecideRequest) => Promise<MerchantRefundDecideResponse>;
}) {
  const [mode, setMode] = useState<'actions' | 'reject'>('actions');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode('actions');
    setReason('');
    setSubmitting(false);
  }, [pending?.refundMacOrdId]);

  const decide = async (req: MerchantRefundDecideRequest) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await onDecide(req);
      toast.success(res.message);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '审批失败，请稍后重试';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const trimmedReason = reason.trim();

  return (
    <Dialog open={!!pending} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="card jnh-card-lg p-6 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="t-heading text-[var(--jnh-ink)]">退款确认</DialogTitle>
          <DialogDescription className="t-body leading-relaxed text-[var(--jnh-ink-muted)]">
            顾客对以下消费发起退款，请确认是否同意。
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="mt-1">
            <div className="rounded-[14px] bg-[var(--jnh-surface-1)] px-5 py-4">
              <div className="t-caption text-[var(--jnh-ink-muted)]">退款金额</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
                <span className="t-display jnh-num text-[var(--jnh-success)]">{pending.amount.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Row label="消费员工" value={pending.employeeName} />
              <Row label="付款身份" value={pending.payerIdentity} />
              <Row label="原单号" value={pending.txnNo} mono breakAll />
              {pending.remark && <Row label="退款原因" value={pending.remark} breakAll />}
            </div>
          </div>
        )}
        {mode === 'reject' && (
          <div className="mt-4">
            <Label htmlFor="refund-reject-reason" className="field-label">
              拒绝原因（选填，将展示给申请人）
            </Label>
            <Textarea
              id="refund-reject-reason"
              value={reason}
              maxLength={MAX_REJECT_REASON}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：已当场核实现场消费无误"
              className="mt-2 min-h-[88px] rounded-[14px] border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] t-body focus-visible:border-[var(--jnh-primary)] focus-visible:ring-0"
            />
            <div className="mt-1 text-right t-caption jnh-num text-[var(--jnh-ink-muted)]">
              {reason.length}/{MAX_REJECT_REASON}
            </div>
          </div>
        )}
        {pending && (
          <DialogFooter className="mt-5 gap-3">
            {mode === 'actions' ? (
              <>
                <NeonButton variant="ghost" onClick={() => setMode('reject')} className="flex-1">
                  拒绝
                </NeonButton>
                <NeonButton
                  variant="primary"
                  onClick={() => void decide({ refundMacOrdId: pending.refundMacOrdId, decision: 'APPROVED' })}
                  className="flex-1"
                >
                  同意退款
                </NeonButton>
              </>
            ) : (
              <>
                <NeonButton variant="ghost" onClick={() => setMode('actions')} disabled={submitting} className="flex-1">
                  返回
                </NeonButton>
                <NeonButton
                  variant="danger"
                  onClick={() =>
                    void decide({
                      refundMacOrdId: pending.refundMacOrdId,
                      decision: 'REJECTED',
                      ...(trimmedReason ? { rejectReason: trimmedReason } : {}),
                    })
                  }
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? '提交中…' : '确认拒绝'}
                </NeonButton>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="t-caption shrink-0 text-[var(--jnh-ink-muted)]">{label}</span>
      <span
        className={`t-body text-right text-[var(--jnh-ink)] ${mono ? 'jnh-num' : ''} ${breakAll ? 'break-all' : 'truncate'}`}
      >
        {value}
      </span>
    </div>
  );
}
