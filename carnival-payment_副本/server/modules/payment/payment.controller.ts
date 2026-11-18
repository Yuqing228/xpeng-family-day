import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { ReqUserId } from '@server/common/decorators/user.decorator';
import { PaymentService } from './payment.service';
import type { PrepareResponse, StallFeedResponse } from '@shared/api.interface';

/**
 * C 扫 B（merchant-code-payment 对调）：
 * - prepare：顾客扫摊位码后的付款页初始化（摊位 + 顾客身份 + 余额；无需登录，who=self 时用登录态）
 * - stall-feed：摊主到账增量查询（摊主登录态，≤3 秒轮询专用）
 */
@Controller('api/payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('prepare')
  async prepare(
    @ReqUserId() userId: string,
    @Query('s') stallToken: string,
    @Query('who') who: string,
  ): Promise<PrepareResponse> {
    return this.paymentService.prepare(stallToken || '', who || '', userId || undefined);
  }

  @Get('stall-feed')
  @UseGuards(LoginGuard)
  async stallFeed(@ReqUserId() userId: string, @Query('after') after: string): Promise<StallFeedResponse> {
    return this.paymentService.stallFeed(userId, after || '');
  }
}
