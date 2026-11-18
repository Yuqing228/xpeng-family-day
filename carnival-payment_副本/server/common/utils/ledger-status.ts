import type { LedgerStatus } from '@shared/api.interface';

/** payment_ledger.status → 前端台账状态；退款命中时由调用方覆盖为 revoked */
export function toLedgerStatus(status: string): LedgerStatus {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'failed';
  return 'processing';
}
