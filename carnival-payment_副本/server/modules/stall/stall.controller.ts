import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { StallService } from './stall.service';
import type { StallOrdersView } from '@shared/api.interface';

@Controller('api/stall')
@UseGuards(LoginGuard)
export class StallController {
  constructor(private readonly stallService: StallService) {}

  @Get('orders')
  async orders(@Query('s') stallToken: string): Promise<StallOrdersView> {
    return this.stallService.orders(stallToken || '');
  }
}
