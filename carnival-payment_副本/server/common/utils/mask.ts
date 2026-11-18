/** 脱敏工具：姓名与工卡号展示口径（specs/payment-code-h5「余额展示口径」与 identity-management「脱敏姓名」） */

/** 姓名脱敏：保留首字，中间以 * 代替（张三 → 张*三；王世楷 → 王*楷 → 已脱敏存储时直接返回） */
export function maskEmployeeName(name: string): string {
  if (!name) return '';
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name[name.length - 1]}`;
}

/** 工卡 UID 脱敏：只暴露尾 4 位（U8872341 → 8872） */
export function maskCardUid(cardUid: string): string {
  if (!cardUid) return '';
  return cardUid.slice(-4);
}

/** 关系枚举 → 中文标签 */
export const RELATION_LABELS: Record<string, string> = {
  spouse: '配偶',
  child: '子女',
  elder: '长辈',
  other: '其他',
};

/** 台账状态 → 中文标签 */
export const LEDGER_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  revoked: '已撤销',
  refund_pending: '撤销待处理',
  failed: '失败',
};
