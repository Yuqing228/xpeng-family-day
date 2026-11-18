/** +08:00 时区工具（活动日台账、单号日期均按东八区口径） */

/** 今天（东八区）的 00:00 / 24:00，返回 UTC Date */
export function todayRange8(now = new Date()): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - 8 * 3600_000);
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}

/** MMDD（东八区），用于交易单号 JNH-MMDD-NNNNN */
export function mmdd8(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${mm}${dd}`;
}
