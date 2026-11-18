// 工卡扣款下单的二次确认：金额固定 0 元（不扣员工钱），不提供调整入口
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@client/src/components/ui/dialog';

export function PayConfirmDialog({
  open,
  onOpenChange,
  custNum,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  custNum: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] rounded-[20px] border border-[var(--jnh-hairline)] bg-[var(--jnh-surface)] p-5 shadow-[var(--jnh-shadow-lg)]">
        <DialogHeader>
          <DialogTitle className="t-title text-[var(--jnh-ink)]">确认发起 0 元下单</DialogTitle>
        </DialogHeader>
        <p className="t-caption text-[var(--jnh-ink-muted)]">
          将用工人卡号 <span className="jnh-num text-[var(--jnh-ink)]">{custNum || '（未填写）'}</span> 换取真实 custId 后发起工卡下单，金额固定
          0 元，不会扣减该工卡余额，但会在乐牛系统产生一条订单记录。
        </p>
        <DialogFooter className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="jnh-btn-outline t-body flex-1 px-4 py-3 font-medium"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="jnh-btn-primary t-body flex-1 border border-transparent px-4 py-3 font-semibold"
          >
            确认下单
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
