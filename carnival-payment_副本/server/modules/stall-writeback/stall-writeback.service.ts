// 摊位口令与收款码写回飞书多维表格：stall_config → QR PNG → 应用文件存储 → batchUpdateRecords
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CapabilityService,
  DRIZZLE_DATABASE,
  FileService,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import * as QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { appConfig, stallConfig } from '@server/database/schema';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import type { StallWritebackResult } from '@shared/api.interface';
import type {
  XiaopengStallInfoBitableUpdateOneInput,
  XiaopengStallInfoBitableUpdateOneOutput,
} from '@shared/plugin-types';

const PLUGIN_INSTANCE_ID = 'xiaopeng_stall_info_bitable_update_1';

const isUpdateOutput = (raw: unknown): raw is XiaopengStallInfoBitableUpdateOneOutput =>
  typeof raw === 'object' && raw !== null && Array.isArray((raw as { records?: unknown }).records);
const BASE_URL_CONFIG_KEY = 'stall_writeback_base_url';
const QR_PATH_KEY_PREFIX = 'stall_qr_path_';
/** batchUpdateRecords 单批上限（插件限制 500） */
const BATCH_SIZE = 500;

type StallRow = {
  stallName: string;
  passCode: string;
  merchantCode: string | null;
  staticToken: string;
  baseRecordId: string | null;
};

/** 内网/本机域名不落库、也不用于生成收款码 */
function isPublicHostname(hostname: string): boolean {
  const h: string = hostname.trim().toLowerCase();
  if (h.length === 0) return false;
  return (
    h !== 'localhost' &&
    !/^127\./.test(h) &&
    !/^10\./.test(h) &&
    !/^192\.168\./.test(h) &&
    !/^169\.254\./.test(h) &&
    !/^172\.(1[6-9]|2\d|3[01])\./.test(h) &&
    !h.endsWith('.local') &&
    !/^\[.+\]$/.test(h)
  );
}

@Injectable()
export class StallWritebackService {
  private readonly logger = new Logger(StallWritebackService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService) private readonly capabilityService: CapabilityService,
    private readonly fileService: FileService,
  ) {}

  /** 全量写回；传入 hostname（管理后台手动触发）时补齐并持久化收款码基础地址 */
  async runWriteback(hostname?: string): Promise<StallWritebackResult> {
    const baseUrl: string = await this.resolveBaseUrl(hostname);
    const basePath: string = (process.env.CLIENT_BASE_PATH || '').replace(/\/$/, '');

    const stalls: StallRow[] = await this.db
      .select({
        stallName: stallConfig.stallName,
        passCode: stallConfig.passCode,
        merchantCode: stallConfig.merchantCode,
        staticToken: stallConfig.staticToken,
        baseRecordId: stallConfig.baseRecordId,
      })
      .from(stallConfig);

    const targets: StallRow[] = stalls.filter((s: StallRow) => s.baseRecordId);
    const skipped: number = stalls.length - targets.length;

    const records: XiaopengStallInfoBitableUpdateOneInput['records'] = [];
    let failed = 0;
    for (const stall of targets) {
      try {
        const payUrl: string = `${baseUrl}${basePath}/pay?s=${encodeURIComponent(stall.staticToken)}`;
        const downloadUrl: string = await this.uploadQrImage(stall, payUrl);
        records.push({
          id: stall.baseRecordId as string,
          record: { '摊主口令': stall.passCode, '摊主收款码': [downloadUrl] },
        });
      } catch (error) {
        failed += 1;
        this.logger.error(
          `收款码生成/上传失败：${stall.stallName}（${stall.passCode}）`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    let updated = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const input: XiaopengStallInfoBitableUpdateOneInput = {
        records: records.slice(i, i + BATCH_SIZE),
      };
      const output: unknown = await this.capabilityService
        .load(PLUGIN_INSTANCE_ID)
        .call('batchUpdateRecords', input);
      if (!isUpdateOutput(output)) {
        throw new BusinessException(ResponseCode.BAD_GATEWAY, '写回多维表格：插件返回结构异常');
      }
      updated += output.records.length;
    }

    this.logger.log(
      `写回多维表格完成：参与 ${targets.length} / 成功 ${updated} / 跳过(无记录ID) ${skipped} / 失败 ${failed}`,
    );
    return {
      total: targets.length,
      updated,
      skipped,
      failed,
      baseUrl,
      finishedAt: new Date().toISOString(),
    };
  }

  /** 换新图前删上一份，应用文件存储每摊位恒保留最近 1 份 */
  private async uploadQrImage(stall: StallRow, payUrl: string): Promise<string> {
    const pathKey: string = `${QR_PATH_KEY_PREFIX}${stall.passCode}`;
    const [last] = await this.db
      .select({ configValue: appConfig.configValue })
      .from(appConfig)
      .where(eq(appConfig.configKey, pathKey));
    if (last) {
      try {
        await this.fileService.remove([last.configValue]);
      } catch {
        this.logger.warn(`清理上一份收款码文件失败（继续上传）：${last.configValue}`);
      }
    }

    const png: Buffer = await QRCode.toBuffer(payUrl, {
      type: 'png',
      width: 512,
      margin: 2,
    });
    const meta = await this.fileService.upload(png, {
      fileName: `stall-qr-${stall.merchantCode ?? stall.passCode}.png`,
      contentType: 'image/png',
    });
    await this.db
      .insert(appConfig)
      .values({ configKey: pathKey, configValue: meta.filePath })
      .onConflictDoUpdate({ target: appConfig.configKey, set: { configValue: meta.filePath } });
    return meta.downloadURL;
  }

  /** 收款码基础地址：手动触发的公网域名优先并持久化；cron 读已存配置；都没有则报错 */
  private async resolveBaseUrl(hostname?: string): Promise<string> {
    const [row] = await this.db
      .select({ configValue: appConfig.configValue })
      .from(appConfig)
      .where(eq(appConfig.configKey, BASE_URL_CONFIG_KEY));

    if (hostname && isPublicHostname(hostname)) {
      const candidate: string = `https://${hostname.trim()}`;
      if (row?.configValue !== candidate) {
        await this.db
          .insert(appConfig)
          .values({ configKey: BASE_URL_CONFIG_KEY, configValue: candidate })
          .onConflictDoUpdate({ target: appConfig.configKey, set: { configValue: candidate } });
      }
      return candidate;
    }
    if (row?.configValue) {
      return row.configValue;
    }
    throw new BusinessException(
      ResponseCode.VALIDATION_ERROR,
      '缺少收款码基础地址：请在管理后台「摊位口令」页手动触发一次写回',
    );
  }
}
