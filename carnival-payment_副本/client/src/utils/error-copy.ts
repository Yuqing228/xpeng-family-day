import { ApiError } from '@client/src/api';

/** 业务码 → 用户可读文案（与 shared PayflowCode 对齐，新增业务码在此补映射） */
const ERROR_COPY: Record<string, string> = {
  '4001': '摊位码无效或活动已结束，请重新扫码',
  '4003': '金额格式不正确，请重新输入',
  '4004': '暂无您的工卡信息，请先在员工端绑定工卡',
  '4005': '链接已失效，请向家人重新获取付款链接',
  '4006': '该笔消费当前不可退款',
  '4007': '单笔消费上限 500 元',
  '4008': '尚未设置家庭支付密码，请先在员工端设置',
  '4009': '支付密码错误',
  '4010': '支付密码已冻结，请先在员工端解除',
  '5000': '系统繁忙，请稍后重试',
};

/** 错误文案归一：命中业务码映射用映射；后端中文 message 原样透出；其余走兜底，不透出英文/数字码 */
export function getErrorMessage(error: unknown, fallback = '网络异常，请稍后重试'): string {
  if (!(error instanceof ApiError)) return fallback;
  const mapped = ERROR_COPY[error.code];
  if (mapped) return mapped;
  return /[\u4e00-\u9fa5]/.test(error.message) ? error.message : fallback;
}
