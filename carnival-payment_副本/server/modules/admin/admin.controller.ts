import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { ReqUserId, ReqUserName } from '@server/common/decorators/user.decorator';
import type { AdminStall, RefundRequest, RefundResponse } from '@shared/api.interface';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** 会话（白名单判断，无需守卫：前端据此渲染无权页面） */
  @Get('session')
  async session(@ReqUserId() userId: string, @ReqUserName() userName: string) {
    return { isAdmin: await this.adminService.isAdmin(userId || undefined), userName };
  }

  /** 摊位口令清单（白名单可见，口令发放唯一出口） */
  @Get('stalls')
  @UseGuards(AdminGuard)
  async stalls(): Promise<AdminStall[]> {
    return this.adminService.listStalls();
  }

  @Get('search')
  @UseGuards(AdminGuard)
  async search(@Query('q') q: string) {
    return this.adminService.search(q || '');
  }

  @Get('txn/:txnNo')
  @UseGuards(AdminGuard)
  async txnDetail(@Param('txnNo') txnNo: string) {
    return this.adminService.txnDetail(txnNo);
  }

  /** 执行退款（唯一入口）：核查 → 幂等冲正 → 双行留痕 */
  @Post('refund')
  @UseGuards(AdminGuard)
  async refund(
    @ReqUserId() adminUserId: string,
    @ReqUserName() adminName: string,
    @Body() req: RefundRequest,
  ): Promise<RefundResponse> {
    return this.adminService.refund(adminUserId, adminName, req);
  }

  /** 待处理补录：线下核对完成后完成冲正 */
  @Post('refund/:txnNo/resolve')
  @UseGuards(AdminGuard)
  async resolvePending(
    @ReqUserId() adminUserId: string,
    @ReqUserName() adminName: string,
    @Param('txnNo') txnNo: string,
  ): Promise<RefundResponse> {
    return this.adminService.resolvePending(adminUserId, adminName, txnNo);
  }

  @Get('settlement')
  @UseGuards(AdminGuard)
  async settlement(@Query('date') date?: string) {
    return this.adminService.settlement(date);
  }

  /** CSV 导出（对账凭证）：type=ledger 全量流水 / settlement 净额结算 */
  @Get('export')
  @UseGuards(AdminGuard)
  async export(@Query('type') type: string, @Res() res: Response) {
    const csv = type === 'settlement' ? await this.adminService.settlementCsv() : await this.adminService.exportLedgerCsv();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="jianianhua-${type || 'ledger'}.csv"`);
    res.send(`\uFEFF${csv}`);
  }

  @Get('config')
  @UseGuards(AdminGuard)
  async getConfig() {
    return this.adminService.getConfig();
  }

  @Put('config')
  @UseGuards(AdminGuard)
  async updateConfig(@Body() body: { key: string; value: string }) {
    await this.adminService.updateConfig(body.key, body.value);
    return { updated: true };
  }
}
