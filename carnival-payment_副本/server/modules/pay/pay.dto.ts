import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import type {
  PayConfirmRequest,
  PayPasswordVerifyRequest,
  PayPrecheckRequest,
  RefundApplyRequest,
} from '@shared/api.interface';

export class PayPrecheckDto implements PayPrecheckRequest {
  @IsString()
  @MaxLength(64)
  stallToken!: string;

  @IsString()
  @MaxLength(32)
  amountYuan!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  familyShareToken?: string;
}

export class PayConfirmDto implements PayConfirmRequest {
  @IsString()
  @MaxLength(64)
  stallToken!: string;

  // 格式与 500 元上限由 PayService 校验，保证错误码为 4003 / 4007
  @IsString()
  @MaxLength(32)
  amountYuan!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  familyShareToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preCheckMacOrdId?: string;

  // 6 位数字校验由 PayService 完成，保证错误码走 4009
  @IsOptional()
  @IsString()
  @MaxLength(16)
  payPassword?: string;
}

export class PayPasswordVerifyDto implements PayPasswordVerifyRequest {
  @IsString()
  @MaxLength(64)
  familyShareToken!: string;

  @IsString()
  @MaxLength(16)
  password!: string;
}

export class RefundApplyDto implements RefundApplyRequest {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentLedgerId!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  remark!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  familyShareToken?: string;
}
