// 管理后台手动触发写回（AdminGuard）：域名来自网关 req.hostname
import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '@server/modules/admin/admin.guard';
import { StallWritebackService } from './stall-writeback.service';
import type { StallWritebackResult } from '@shared/api.interface';

@Controller('api/admin')
@UseGuards(AdminGuard)
export class StallWritebackController {
  constructor(private readonly stallWriteback: StallWritebackService) {}

  /** 立即写回多维表格：摊主口令 + 收款码附件 */
  @Post('stalls/writeback')
  async writeback(@Req() req: Request): Promise<StallWritebackResult> {
    return this.stallWriteback.runWriteback(req.hostname);
  }
}
