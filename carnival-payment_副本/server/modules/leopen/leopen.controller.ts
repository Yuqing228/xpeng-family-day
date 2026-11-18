// LEOPEN 链路诊断接口：探测 / 历史 / 凭证配置（配置仅管理员）
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { AdminGuard } from '@server/modules/admin/admin.guard';
import { LeopenService } from './leopen.service';
import type {
  LeopenConfigRequest,
  LeopenConfigStatus,
  LeopenNetInfo,
  LeopenProbeHistoryItem,
  LeopenProbeResult,
  LeopenProbeTarget,
  LeopenProbeTargetSpec,
} from '@shared/api.interface';
import { LEOPEN_PROBE_TARGETS } from '@shared/api.interface';

@Controller('api/leopen')
export class LeopenController {
  constructor(private readonly leopen: LeopenService) {}

  @Post('probe')
  @NeedLogin()
  async probe(@Body() body: { custNum?: string; target?: string; macOrdId?: string }): Promise<LeopenProbeResult> {
    const custNum = (body?.custNum || '').trim() || '60321';
    const macOrdId = (body?.macOrdId || '').trim() || undefined;
    const raw = (body?.target || '').trim();
    const matched = LEOPEN_PROBE_TARGETS.find((t: LeopenProbeTargetSpec) => t.target === raw);
    const target: LeopenProbeTarget = matched ? matched.target : 'order-state-query';
    return this.leopen.probe(custNum, target, macOrdId);
  }

  @Get('probe/history')
  @NeedLogin()
  async history(@Query('limit') limit?: string): Promise<LeopenProbeHistoryItem[]> {
    const n = parseInt(limit ?? '20', 10);
    return this.leopen.history(Number.isFinite(n) ? n : 20);
  }

  @Get('netinfo')
  @NeedLogin()
  async netInfo(): Promise<LeopenNetInfo> {
    return this.leopen.netInfo();
  }

  @Get('config/status')
  @NeedLogin()
  async configStatus(): Promise<LeopenConfigStatus> {
    return this.leopen.configStatus();
  }

  @Post('config')
  @UseGuards(AdminGuard)
  async updateConfig(@Body() body: LeopenConfigRequest): Promise<{ updated: boolean }> {
    await this.leopen.updateConfig(body);
    return { updated: true };
  }
}
