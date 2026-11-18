import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { ReqUserId } from '@server/common/decorators/user.decorator';
import { PayService } from './pay.service';
import { FirstLoginService } from './first-login.service';
import { PayConfirmDto, PayPasswordVerifyDto, PayPrecheckDto } from './pay.dto';
import type {
  FirstLoginNotifyResponse,
  PayConfirmResult,
  PayPasswordVerifyResult,
  PayPrecheckResult,
  PrepareResponse,
} from '@shared/api.interface';

/**
 * 顾客扣款（C 扫 B）：摊位码 + 金额 + 身份 → 乐牛 pay/device。
 * 家人分享 token 场景允许匿名（不挂 LoginGuard）；员工本人场景由 service 校验登录态（401）。
 */
@Controller('api/pay')
export class PayController {
  constructor(
    private readonly payService: PayService,
    private readonly firstLoginService: FirstLoginService,
  ) {}

  @Get('context')
  async context(
    @ReqUserId() userId: string,
    @Query('s') stallToken: string,
    @Query('f') familyToken: string,
  ): Promise<PrepareResponse> {
    return this.payService.context(
      { userId: userId || '' },
      stallToken || '',
      familyToken || '',
    );
  }

  @Post('precheck')
  async precheck(
    @ReqUserId() userId: string,
    @Body() dto: PayPrecheckDto,
  ): Promise<PayPrecheckResult> {
    return this.payService.precheck({ userId: userId || '' }, dto);
  }

  @Post('verify-password')
  async verifyPassword(@Body() dto: PayPasswordVerifyDto): Promise<PayPasswordVerifyResult> {
    return this.payService.verifyPassword(dto);
  }

  /** 首次扫码授权登录成功 → 员工欢迎消息（幂等：welcome_pushed 置 1 后不再发） */
  @NeedLogin()
  @Post('first-login-notify')
  async firstLoginNotify(
    @ReqUserId() userId: string,
    @Req() req: Request,
  ): Promise<FirstLoginNotifyResponse> {
    return this.firstLoginService.notify(userId, req.hostname);
  }

  @Post('confirm')
  async confirm(
    @ReqUserId() userId: string,
    @Body() dto: PayConfirmDto,
  ): Promise<PayConfirmResult> {
    return this.payService.confirm({ userId: userId || '' }, dto);
  }
}
