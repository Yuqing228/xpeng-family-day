import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { ReqUserId } from '@server/common/decorators/user.decorator';
import { MeService } from './me.service';
import type { BalanceView, MyOrderDetail, MyOrdersView } from '@shared/api.interface';

@Controller('api/me')
@UseGuards(LoginGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('balance')
  async balance(@ReqUserId() userId: string): Promise<BalanceView> {
    return this.meService.balance(userId);
  }

  @Get('orders')
  async orders(@ReqUserId() userId: string): Promise<MyOrdersView> {
    return this.meService.orders(userId);
  }

  @Get('order/:id')
  async orderDetail(
    @ReqUserId() userId: string,
    @Param('id') id: string,
  ): Promise<MyOrderDetail> {
    return this.meService.orderDetail(userId, id);
  }
}
