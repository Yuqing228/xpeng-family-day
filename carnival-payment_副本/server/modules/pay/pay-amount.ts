// 金额校验：格式 → 分 → 500 元上限（0 元放行，供回归测试）
import { PAY_AMOUNT_LIMIT_FEN, PAY_AMOUNT_LIMIT_YUAN, PAY_AMOUNT_PATTERN } from './pay.constants';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';

export function parseAmountFen(amountYuan: string): number {
  const raw = String(amountYuan ?? '').trim();
  if (!PAY_AMOUNT_PATTERN.test(raw)) {
    throw payflowError(PAYFLOW_CODE.INVALID_AMOUNT, '金额格式非法：最多 9 位整数、最多 2 位小数');
  }
  const amountFen = Math.round(Number(raw) * 100);
  if (!Number.isFinite(amountFen) || amountFen < 0) {
    throw payflowError(PAYFLOW_CODE.INVALID_AMOUNT, '金额格式非法：最多 9 位整数、最多 2 位小数');
  }
  if (amountFen > PAY_AMOUNT_LIMIT_FEN) {
    throw payflowError(PAYFLOW_CODE.AMOUNT_LIMIT_EXCEEDED, `单笔金额不能超过 ${PAY_AMOUNT_LIMIT_YUAN} 元`);
  }
  return amountFen;
}
