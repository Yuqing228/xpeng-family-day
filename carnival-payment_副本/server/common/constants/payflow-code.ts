// 支付链路业务码：4 位数字，随全局异常体 error.code 输出（前端按码提示）
import { HttpStatus } from '@nestjs/common';
import { CodedBusinessException } from '@server/common/interfaces/exception.interface';
import type { PayflowCode } from '@shared/api.interface';

export const PAYFLOW_CODE = {
  /** 摊位 token 无效或摊位停用 */
  INVALID_STALL: '4001',
  /** 金额格式非法（非数字 / 超过 2 位小数） */
  INVALID_AMOUNT: '4003',
  /** 无工卡绑定 / 查无此人 / 账户不可用 */
  IDENTITY_UNAVAILABLE: '4004',
  /** 家人分享 token 无效或已作废 */
  INVALID_FAMILY_TOKEN: '4005',
  /** 记录不可退 */
  NOT_REFUNDABLE: '4006',
  /** 单笔金额超过 500 元 */
  AMOUNT_LIMIT_EXCEEDED: '4007',
  /** 家人身份尚未设置支付密码（或本次未提交密码） */
  PASSWORD_REQUIRED: '4008',
  /** 支付密码错误（message 附带剩余可尝试次数） */
  PASSWORD_INVALID: '4009',
  /** 支付密码已冻结，需员工端解除 */
  PASSWORD_LOCKED: '4010',
  /** 内部错误（台账写失败等） */
  INTERNAL: '5000',
} as const satisfies Record<string, PayflowCode>;

export function payflowError(
  code: PayflowCode,
  message: string,
  httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
): CodedBusinessException {
  return new CodedBusinessException(code, message, httpStatus);
}
