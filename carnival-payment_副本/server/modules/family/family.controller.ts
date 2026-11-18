import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { ReqUserId } from '@server/common/decorators/user.decorator';
import { FamilyService } from './family.service';
import { FamilyManageService } from './family-manage.service';
import { FamilyManageDto } from './family-manage.dto';
import type {
  FamilyContextView,
  FamilyManageResult,
  FamilyOrdersView,
  MyOrderDetail,
} from '@shared/api.interface';

/** 家人端接口：token 鉴权（免登录，匿名可访问，不加 LoginGuard）；manage 需登录 */
@Controller('api/family')
export class FamilyController {
  constructor(
    private readonly familyService: FamilyService,
    private readonly familyManageService: FamilyManageService,
  ) {}

  // 静态路由必须声明在 :token 之前
  @Post('manage')
  @UseGuards(LoginGuard)
  async manage(
    @ReqUserId() userId: string,
    @Body() dto: FamilyManageDto,
  ): Promise<FamilyManageResult> {
    return this.familyManageService.manage(userId, dto);
  }

  @Get('context')
  async context(@Query('f') shareToken: string): Promise<FamilyContextView> {
    return this.familyManageService.context(shareToken || '');
  }

  @Get('orders')
  async orders(@Query('f') shareToken: string): Promise<FamilyOrdersView> {
    return this.familyManageService.orders(shareToken || '');
  }

  @Get('order/:id')
  async orderDetail(
    @Query('f') shareToken: string,
    @Param('id') id: string,
  ): Promise<MyOrderDetail> {
    return this.familyManageService.orderDetail(shareToken || '', id);
  }

  @Get(':token')
  async session(@Param('token') token: string) {
    return this.familyService.session(token);
  }

}
