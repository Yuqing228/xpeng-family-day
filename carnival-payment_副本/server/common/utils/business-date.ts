// 业务日期（Asia/Shanghai = UTC+8，无夏令时）：自然日区间统一用半开区间 [start, end)
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BusinessDayRange {
  start: Date;
  end: Date;
}

export function shanghaiTodayRange(now: Date = new Date()): BusinessDayRange {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const dayStartUtc =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    SHANGHAI_OFFSET_MS;
  return { start: new Date(dayStartUtc), end: new Date(dayStartUtc + DAY_MS) };
}
