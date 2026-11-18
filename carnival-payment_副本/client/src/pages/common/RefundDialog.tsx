// 账单详情 · 申请退款弹窗：备注必填（1–200 字），确认后登记到 refund_ledger
import { useState } from 'react';
import { toast } from 'sonner';
import { apiRefund } from '@client/src/api';
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
import { getErrorMessage } from '@client/src/utils/error-copy';
import type { BillDetailDTO } from '@shared/api.interface';

const MAX_REMARK = 200;

export function RefundDialog({
  detail,
  open,
  onOpenChange,
  onSubmitted,
  familyShareToken,
}: {
  detail: BillDetailDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
  /** 家人端传 share token，员工端不传 */
  familyShareToken?: string;
}) {
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = remark.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX_REMARK;
  const showHint = remark.length > 0 && trimmed.length === 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiRefund.apply({
        paymentLedgerId: detail.paymentLedgerId,
        remark: trimmed,
        ...(familyShareToken ? { familyShareToken } : {}),
      });
      toast.success(res.note || `退款已提交：${res.refundMacOrdId}`);
      setRemark('');
      onOpenChange(false);
      onSubmitted();
    } catch (error) {
      toast.error(getErrorMessage(error, '退款提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="card jnh-card-lg p-6 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="t-heading text-[var(--jnh-ink)]">申请退款</DialogTitle>
          <DialogDescription className="t-body leading-relaxed text-[var(--jnh-ink-muted)]">
            提交后由摊主在摊主端确认，同意后统一原路退回工卡，无需重复提交。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 rounded-[14px] bg-[var(--jnh-surface-1)] px-5 py-4">
          <div className="t-caption text-[var(--jnh-ink-muted)]">退款金额</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="t-title text-[var(--jnh-ink-muted)]">¥</span>
            <span className="t-display jnh-num text-[var(--jnh-ink)]">{detail.amount.toFixed(2)}</span>
          </div>
          <div className="t-caption mt-2 break-all text-[var(--jnh-ink-subtle)]">原单 {detail.txnNo}</div>
        </div>

        <div className="mt-4">
          <Label htmlFor="refund-remark" className="field-label">
            退款原因（必填）
          </Label>
          <Textarea
            id="refund-remark"
            value={remark}
            maxLength={MAX_REMARK}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="请填写退款原因，如：金额输错"
            className="mt-2 min-h-[96px] rounded-[14px] border-[var(--jnh-hairline)] bg-[var(--jnh-surface-1)] t-body focus-visible:border-[var(--jnh-primary)] focus-visible:ring-0"
          />
          <div className="t-caption mt-1 flex items-center justify-between text-[var(--jnh-ink-subtle)]">
            <span>{showHint ? '请填写退款原因' : ''}</span>
            <span className="jnh-num">
              {remark.length}/{MAX_REMARK}
            </span>
          </div>
        </div>

        <DialogFooter className="mt-5 gap-3">
          <NeonButton variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} className="flex-1">
            取消
          </NeonButton>
          <NeonButton variant="primary" onClick={submit} disabled={!valid || submitting} className="flex-1">
            {submitting ? '提交中…' : '确认退款'}
          </NeonButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
