import { Body, Controller, Post } from '@nestjs/common';
import { ReqUserId } from '@server/common/decorators/user.decorator';
import { RefundService } from './refund.service';
import { RefundApplyDto } from './pay.dto';
import type { RefundApplyResult } from '@shared/api.interface';

/** 退款登记：登录态（员工）或家人 share token 二选一，归属校验由 service 负责 */
@Controller('api/refund')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post('apply')
  async apply(
    @ReqUserId() userId: string,
    @Body() dto: RefundApplyDto,
  ): Promise<RefundApplyResult> {
    return this.refundService.apply(userId || '', dto);
  }
}
