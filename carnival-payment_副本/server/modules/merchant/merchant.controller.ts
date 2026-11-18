import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LoginGuard } from '@server/common/guards/login.guard';
import { ReqUserId, ReqUserName } from '@server/common/decorators/user.decorator';
import { MerchantService } from './merchant.service';
import { MerchantRefundService } from './merchant-refund.service';
import { PaymentService } from '@server/modules/payment/payment.service';
import type {
  BindRequest,
  MerchantLedgerExport,
  MerchantPendingRefund,
  MerchantRefundDecideRequest,
  MerchantRefundDecideResponse,
  StallTokenInfo,
} from '@shared/api.interface';

@Controller('api/merchant')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly merchantRefundService: MerchantRefundService,
    private readonly paymentService: PaymentService,
  ) {}

  /** 登录态无需强制（未登录前端跳登录）；绑定后操作均要求登录 */
  @Get('session')
  async session(@ReqUserId() userId: string, @ReqUserName() userName: string) {
    return this.merchantService.session(userId || undefined, userName || undefined);
  }

  @Post('bind')
  @UseGuards(LoginGuard)
  async bind(@ReqUserId() userId: string, @Body() req: BindRequest) {
    return this.merchantService.bind(userId, req);
  }

  @Get('summary')
  @UseGuards(LoginGuard)
  async summary(@ReqUserId() userId: string) {
    return this.merchantService.summary(userId);
  }

  @Get('ledger')
  @UseGuards(LoginGuard)
  async ledger(@ReqUserId() userId: string) {
    return this.merchantService.ledger(userId);
  }

  /** 导出当日台账 CSV（服务端生成，返回文件存储下载链接） */
  @Get('ledger/export')
  @UseGuards(LoginGuard)
  async exportLedger(@ReqUserId() userId: string): Promise<MerchantLedgerExport> {
    return this.merchantService.exportLedgerCsv(userId);
  }

  /** 待摊主确认的退款单（前端 3 秒轮询） */
  @Get('refund/pending')
  @UseGuards(LoginGuard)
  async pendingRefunds(@ReqUserId() userId: string): Promise<MerchantPendingRefund[]> {
    return this.merchantRefundService.pending(userId);
  }

  /** 摊主审批退款：同意 / 拒绝（拒绝原因选填，展示给申请人） */
  @Post('refund/decide')
  @UseGuards(LoginGuard)
  async decideRefund(
    @ReqUserId() userId: string,
    @Body() req: MerchantRefundDecideRequest,
  ): Promise<MerchantRefundDecideResponse> {
    return this.merchantRefundService.decide(userId, req);
  }

  /** 本摊收款码（C 扫 B：摊主展示给顾客扫） */
  @Get('stall-token')
  @UseGuards(LoginGuard)
  async stallToken(@ReqUserId() userId: string): Promise<StallTokenInfo> {
    return this.paymentService.stallTokenInfo(userId);
  }

  /** 刷新收款码（旧码失效，需重新展示/打印） */
  @Post('stall-token/refresh')
  @UseGuards(LoginGuard)
  async refreshStallToken(@ReqUserId() userId: string): Promise<{ stallToken: string }> {
    return this.paymentService.refreshStallToken(userId);
  }
}
