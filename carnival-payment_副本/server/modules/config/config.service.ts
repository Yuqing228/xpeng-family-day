// 应用配置服务：app_config 表读取 + 短缓存（design D8 活动时间窗口、二维码策略、抽成比例、家人上限）
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import { appConfig } from '@server/database/schema';
import type { AppConfigDTO } from '@shared/api.interface';

const CACHE_TTL_MS = 15_000;

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private cache: Map<string, string> | null = null;
  private cacheAt = 0;

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  private async loadAll(): Promise<Map<string, string>> {
    if (this.cache && Date.now() - this.cacheAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const rows = await this.db.select().from(appConfig);
    const map = new Map(rows.map((r) => [r.configKey, r.configValue]));
    this.cache = map;
    this.cacheAt = Date.now();
    return map;
  }

  private async get(key: string): Promise<string | undefined> {
    const map = await this.loadAll();
    return map.get(key);
  }

  /** 活动时间窗口（D-1 22:00 ～ 活动日 24:00 由管理员在后台配置；dev 种子全开） */
  async eventWindow(): Promise<{ start: Date; end: Date }> {
    const raw = (await this.get('event_window')) ?? '{"start":"2020-01-01T00:00:00+08:00","end":"2030-01-01T00:00:00+08:00"}';
    try {
      const parsed = JSON.parse(raw) as { start: string; end: string };
      return { start: new Date(parsed.start), end: new Date(parsed.end) };
    } catch {
      this.logger.warn(`event_window 配置解析失败，按全开处理: ${raw}`);
      return { start: new Date('2020-01-01'), end: new Date('2030-01-01') };
    }
  }

  /** 活动窗口判断：窗口外付款码访问与扣款一律拒绝（specs/payment-orchestration「活动结束后接口下线」） */
  async isInEventWindow(now = new Date()): Promise<boolean> {
    const w = await this.eventWindow();
    return now >= w.start && now <= w.end;
  }

  async familyLimit(): Promise<number> {
    return Number((await this.get('family_limit')) ?? 6);
  }

  async commissionRate(): Promise<number> {
    return Number((await this.get('commission_rate')) ?? 0.2);
  }

  async qrRefreshPolicy(): Promise<'fixed' | '60s' | '30m'> {
    return ((await this.get('qr_refresh_policy')) ?? 'fixed') as 'fixed' | '60s' | '30m';
  }

  async leniuMode(): Promise<'mock' | 'http'> {
    return ((await this.get('leniu_mode')) ?? 'mock') as 'mock' | 'http';
  }

  async all(): Promise<AppConfigDTO> {
    const [w, policy, rate, limit, mode] = await Promise.all([
      this.eventWindow(),
      this.qrRefreshPolicy(),
      this.commissionRate(),
      this.familyLimit(),
      this.leniuMode(),
    ]);
    return {
      eventWindow: { start: w.start.toISOString(), end: w.end.toISOString() },
      qrRefreshPolicy: policy,
      commissionRate: rate,
      familyLimit: limit,
      leniuMode: mode,
    };
  }

  /** 管理员更新配置（写库后失效缓存，立即生效） */
  async update(key: string, value: string): Promise<void> {
    await this.db
      .insert(appConfig)
      .values({ configKey: key, configValue: value })
      .onConflictDoUpdate({ target: appConfig.configKey, set: { configValue: value } });
    this.cache = null;
  }
}
