// 定时写回多维表格：cron 30 分钟（触发器 stall_base_writeback），基础地址读 app_config
import { Logger } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { StallWritebackService } from './stall-writeback.service';
import type { StallWritebackResult } from '@shared/api.interface';

@Automation()
export class StallWritebackAutomationService {
  private readonly logger = new Logger(StallWritebackAutomationService.name);

  constructor(private readonly writeback: StallWritebackService) {}

  @BindTrigger('stall_base_writeback')
  async onCron(): Promise<void> {
    try {
      const result: StallWritebackResult = await this.writeback.runWriteback();
      this.logger.log(
        `定时写回完成：成功 ${result.updated}/${result.total}，失败 ${result.failed}，跳过 ${result.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        `定时写回失败：${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
