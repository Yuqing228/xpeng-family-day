// 员工首次扫码授权登录成功 → 给本人发飞书欢迎消息（welcome_pushed 占位先行：0→1 成功才有资格发，杜绝并发双发）
// 收件人直接传妙搭 userId（send-feishu-message 插件内部做视角转换，传 open_id 会 10003 user invalidate）
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CapabilityService,
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { appConfig, employeeCardMap } from '@server/database/schema';
import type { FirstLoginNotifyResponse } from '@shared/api.interface';

const WELCOME_PLUGIN_ID = 'siqing_carnival_payment_welcome_message_1';
const BASE_URL_CONFIG_KEY = 'stall_writeback_base_url';

function isWelcomeOutput(output: unknown): output is { success: boolean } {
  return (
    typeof output === 'object' &&
    output !== null &&
    'success' in output &&
    typeof (output as { success: unknown }).success === 'boolean'
  );
}

@Injectable()
export class FirstLoginService {
  private readonly logger = new Logger(FirstLoginService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService) private readonly capabilityService: CapabilityService,
  ) {}

  async notify(userId: string, hostname: string): Promise<FirstLoginNotifyResponse> {
    // 原子占位：置 1 成功才有资格发；已推送过（或无映射行）返回 0 行直接跳过
    const claimed = await this.db
      .update(employeeCardMap)
      .set({ welcomePushed: true })
      .where(and(eq(employeeCardMap.miaodaUserId, userId), eq(employeeCardMap.welcomePushed, false)))
      .returning({ custNum: employeeCardMap.custNum });

    if (claimed.length === 0) return { sent: false };

    const employeeUrl = await this.resolveEmployeeUrl(hostname);
    if (!employeeUrl) {
      this.logger.error(`欢迎消息员工端 URL 缺失 userId=${userId}（占位已置，不重发）`);
      return { sent: false };
    }

    try {
      const output: unknown = await this.capabilityService
        .load(WELCOME_PLUGIN_ID)
        .call('send_feishu_message', { receiverIds: [userId], employeeUrl });
      if (!isWelcomeOutput(output) || !output.success) {
        this.logger.error(`欢迎消息插件返回失败 userId=${userId}`);
        return { sent: false };
      }
      this.logger.log(`首次登录欢迎消息已发送 userId=${userId}`);
      return { sent: true };
    } catch (error) {
      // 占位不回置：宁可丢一条，绝不重复发
      this.logger.error(`欢迎消息发送异常 userId=${userId}（占位已置，不重发）`, String(error));
      return { sent: false };
    }
  }

  /** 员工端深链：req.hostname 优先（生产为公网域名），异常时兜底已持久化的收款码基础地址 */
  private async resolveEmployeeUrl(hostname: string): Promise<string | null> {
    let base = hostname.trim();
    if (!base) {
      const [row] = await this.db
        .select({ configValue: appConfig.configValue })
        .from(appConfig)
        .where(eq(appConfig.configKey, BASE_URL_CONFIG_KEY));
      base = (row?.configValue || '').replace(/^https?:\/\//u, '');
    }
    if (!base) return null;
    const basePath = (process.env.CLIENT_BASE_PATH || '').replace(/\/$/, '');
    return `https://${base}${basePath}/employee`;
  }
}
