// 摊主退款审批轮询 hook：前台 3 秒轮询待确认退款单，审批动作即时移出列表。
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiMerchant } from '@client/src/api';
import type {
  MerchantPendingRefund,
  MerchantRefundDecideRequest,
  MerchantRefundDecideResponse,
} from '@shared/api.interface';

const POLL_INTERVAL_MS = 3000;
const DISCONNECT_THRESHOLD = 3;

export function useRefundApprovals(enabled: boolean) {
  const [pending, setPending] = useState<MerchantPendingRefund[]>([]);
  const [disconnected, setDisconnected] = useState(false);
  const inFlight = useRef(false);
  const failureRef = useRef(0);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const rows = await apiMerchant.refundPending();
      setPending(rows);
      failureRef.current = 0;
      setDisconnected(false);
    } catch {
      // 轮询失败静默重试（未绑定 403 由页面层处理）；连续失败达阈值标记断连
      failureRef.current += 1;
      if (failureRef.current >= DISCONNECT_THRESHOLD) setDisconnected(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void poll();
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void poll();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [enabled, poll]);

  /** 摊主审批：成功后该单移出列表（同摊还有待确认单则继续弹出） */
  const decide = useCallback(
    async (req: MerchantRefundDecideRequest): Promise<MerchantRefundDecideResponse> => {
      const res = await apiMerchant.refundDecide(req);
      setPending((prev) =>
        prev.filter((p: MerchantPendingRefund) => p.refundMacOrdId !== req.refundMacOrdId),
      );
      return res;
    },
    [],
  );

  return { pending, decide, refresh: poll, disconnected };
}
