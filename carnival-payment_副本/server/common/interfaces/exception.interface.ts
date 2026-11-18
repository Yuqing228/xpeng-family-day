// 业务异常类
import { HttpStatus } from '@nestjs/common';
import { RESPONSE_CODE_TO_HTTP_STATUS_MAP, ResponseCode } from '../constants/api_response_code';

export class BusinessException extends Error {
  constructor(
    public readonly code: ResponseCode,
    public readonly message: string,
    public readonly httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'BusinessException';
  }
  getHttpStatus(): HttpStatus {
    return RESPONSE_CODE_TO_HTTP_STATUS_MAP[this.code];
  }
}

/**
 * 带业务码的异常：code 为 4 位业务码（如 4004），全局异常过滤器原样输出 error.code。
 * 用于支付链路（乐牛四接口融合），与 ResponseCode 枚举互不影响。
 */
export class CodedBusinessException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message);
    this.name = 'CodedBusinessException';
  }
}
