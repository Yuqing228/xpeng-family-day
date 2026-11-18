// 摊主到账监控 hook（D5）：前台 3 秒轮询 stall-feed（增量游标）；
// 红线边界：仅限摊主收款检测，顾客端账单仍手动刷新不轮询。
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPayment } from '@client/src/api';
import { speakArrival } from './arrival';
import type { StallFeedTxn } from '@shared/api.interface';

const POLL_INTERVAL_MS = 3000;
const DISCONNECT_THRESHOLD = 3;
const ARRIVAL_CURSOR_KEY = 'jnh_arrival_cursor';

/** 初始化到账游标：优先恢复上次位置（切页/重挂载后历史单不重播），
 * 无记录时取当前时间并立即固化（只播开启提醒之后的真实到账，绝不全量回播） */
function initArrivalCursor(): string {
  let cursor = new Date().toISOString();
  try {
    const saved = localStorage.getItem(ARRIVAL_CURSOR_KEY);
    if (saved && !Number.isNaN(Date.parse(saved))) cursor = saved;
  } catch {
    // localStorage 不可用时仅当次会话有效
  }
  try {
    localStorage.setItem(ARRIVAL_CURSOR_KEY, cursor);
  } catch {
    // 同上，静默降级
  }
  return cursor;
}

function writeArrivalCursor(cursor: string): void {
  try {
    localStorage.setItem(ARRIVAL_CURSOR_KEY, cursor);
  } catch {
    // 同上，静默降级
  }
}

export function useArrivalMonitor(enabled: boolean, soundOn: boolean) {
  const [arrivals, setArrivals] = useState<StallFeedTxn[]>([]);
  const [disconnected, setDisconnected] = useState(false);
  const failureRef = useRef(0);
  const cursorRef = useRef('');
  if (cursorRef.current === '') cursorRef.current = initArrivalCursor();
  const inFlight = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await apiPayment.stallFeed(cursorRef.current);
      failureRef.current = 0;
      setDisconnected(false);
      cursorRef.current = res.cursor;
      writeArrivalCursor(res.cursor);
      if (res.transactions.length > 0) {
        setArrivals((prev) => [...res.transactions, ...prev].slice(0, 20));
        if (soundRef.current) {
          for (const t of res.transactions) {
            void speakArrival(t.amount);
          }
        }
      }
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
      // 回前台立即补拉一次（漏播语音不回放，卡片补显示）
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

  const clearArrivals = useCallback(() => setArrivals([]), []);
  return { arrivals, clearArrivals, refresh: poll, disconnected };
}
