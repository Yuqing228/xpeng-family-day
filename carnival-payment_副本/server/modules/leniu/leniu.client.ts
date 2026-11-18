// 乐牛 LEOPEN 运行时客户端：pay/device、order/state/query、account/balance/query、customer/query
// 与 leopen.service.ts（链路诊断探测）解耦：只做业务调用、硬超时与错误分类，不做重试（重试策略在 PayService）
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { inArray } from 'drizzle-orm';
import { appConfig } from '@server/database/schema';
import {
  LEOPEN_HOST,
  LEOPEN_PATH_PREFIX,
  LEOPEN_VERSION,
  buildSignedRequest,
  shanghaiNow,
  type LeopenCredentials,
} from '@server/common/utils/leopen-sign';

export const LENIU_TIMEOUT_MS = 5_000;

/** 已注册设备序列号：传设备名会返 40004 设备不存在 */
export const PAY_MACHINE_SN = '5m6665785';

/** 业务成功码：同时存在 0 与 10000 两种写法 */
export const LENIU_SUCCESS_CODES: readonly number[] = [0, 10000];
/** 重复上传：业务已受理，需查单确认结果 */
export const LENIU_CODE_UPLOADED = 10001;
/** 验签层错误：请求未落账，可用新 nonce/sign + 原单号重发 */
export const LENIU_VERIFY_ERROR_CODES: readonly number[] = [100013, 100032, 100042];
/** 业务拒（余额不足、设备不存在等）：不重发，查单确认未扣即判失败 */
export const LENIU_CODE_BUSINESS_REJECT = 40004;

export type LeniuErrorKind = 'CONFIG' | 'TIMEOUT' | 'TRANSPORT';

export class LeniuClientError extends Error {
  constructor(
    public readonly kind: LeniuErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LeniuClientError';
  }
}

export interface LeniuResponse<T> {
  code: number;
  msg: string;
  data: T | null;
  httpStatus: number;
  elapsedMs: number;
}

/** 订单类响应（pay/device 与 order/state/query 同构；金额单位为分，可能以字符串返回） */
export interface LeniuOrderStateData {
  ordId?: string | number | null;
  macOrdId?: string | null;
  payState?: number | string | null;
  ordState?: string | number | null;
  totalAmount?: string | number | null;
  realAmount?: string | number | null;
  /** 交易后账户余额（pay/device 返回） */
  accBal?: string | number | null;
  payTime?: string | null;
  orderDate?: string | null;
  ordQrCode?: string | null;
  mealCode?: string | null;
}

export interface LeniuBalanceData {
  accBal?: string | number | null;
  walletBal?: string | number | null;
  subsidyBal?: string | number | null;
  accStatus?: string | number | null;
  accName?: string | null;
}

export interface LeniuCustomerData {
  count?: string | number | null;
  customerList?: Array<{ custId?: string | number | null; custName?: string | null }> | null;
}

export interface PayDeviceInput {
  amountFen: number;
  custId: string;
  macOrdId: string;
  machineSn?: string;
  ordTime?: string;
}

/** 数值归一：字符串数字 / 数字 / null → number | null */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function isLeniuSuccess(res: LeniuResponse<unknown>): boolean {
  return LENIU_SUCCESS_CODES.includes(res.code);
}

@Injectable()
export class LeniuClient {
  private readonly logger = new Logger(LeniuClient.name);
  private cachedCredentials: LeopenCredentials | null = null;

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async queryCustomer(custNum: string): Promise<LeniuResponse<LeniuCustomerData>> {
    return this.post<LeniuCustomerData>('/customer/query', { custNum }, LENIU_TIMEOUT_MS);
  }

  async queryBalance(custId: string): Promise<LeniuResponse<LeniuBalanceData>> {
    return this.post<LeniuBalanceData>('/account/balance/query', { custId }, LENIU_TIMEOUT_MS);
  }

  async queryOrderState(macOrdId: string): Promise<LeniuResponse<LeniuOrderStateData>> {
    return this.post<LeniuOrderStateData>('/order/state/query', { macOrdId }, LENIU_TIMEOUT_MS);
  }

  async payByDevice(input: PayDeviceInput): Promise<LeniuResponse<LeniuOrderStateData>> {
    return this.post<LeniuOrderStateData>(
      '/pay/device',
      {
        amount: input.amountFen,
        custId: input.custId,
        macOrdId: input.macOrdId,
        machineSn: input.machineSn ?? PAY_MACHINE_SN,
        nuClearMode: 2,
        ordTime: input.ordTime ?? shanghaiNow(),
      },
      LENIU_TIMEOUT_MS,
    );
  }

  /** 凭证：环境变量优先，app_config 兜底；缺失时抛 CONFIG（不发起请求） */
  private async credentials(): Promise<LeopenCredentials> {
    if (this.cachedCredentials) return this.cachedCredentials;
    const envAppid = process.env.appid;
    const envSecret = process.env.appsecret;
    if (envAppid && envSecret) {
      this.cachedCredentials = { appid: envAppid, appsecret: envSecret };
      return this.cachedCredentials;
    }
    const rows: Array<{ configKey: string; configValue: string }> = await this.db
      .select({ configKey: appConfig.configKey, configValue: appConfig.configValue })
      .from(appConfig)
      .where(inArray(appConfig.configKey, ['leopen_appid', 'leopen_appsecret']));
    const map = new Map(rows.map((r: { configKey: string; configValue: string }) => [r.configKey, r.configValue]));
    const appid = map.get('leopen_appid');
    const appsecret = map.get('leopen_appsecret');
    if (!appid || !appsecret) {
      throw new LeniuClientError('CONFIG', '未配置 LEOPEN appid/appsecret，无法调用乐牛接口');
    }
    this.cachedCredentials = { appid, appsecret };
    return this.cachedCredentials;
  }

  private async post<T>(
    path: string,
    content: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<LeniuResponse<T>> {
    const creds = await this.credentials();
    const signed = buildSignedRequest(creds, content, LEOPEN_VERSION);
    const url = `https://${LEOPEN_HOST}${LEOPEN_PATH_PREFIX}${path}`;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
        },
        body: signed.body,
        signal: controller.signal,
      });
      const text = await res.text();
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (!res.ok) {
        throw new LeniuClientError('TRANSPORT', `${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      let parsed: { code?: unknown; msg?: unknown; data?: unknown };
      try {
        parsed = JSON.parse(text) as { code?: unknown; msg?: unknown; data?: unknown };
      } catch {
        throw new LeniuClientError('TRANSPORT', `${path} 响应非 JSON：${text.slice(0, 200)}`);
      }
      const numericCode = Number(parsed.code);
      const result: LeniuResponse<T> = {
        code: Number.isFinite(numericCode) ? numericCode : -1,
        msg: String(parsed.msg ?? ''),
        data: (parsed.data ?? null) as T | null,
        httpStatus: res.status,
        elapsedMs,
      };
      this.logger.log(`leniu ${path} ${elapsedMs}ms code=${result.code} msg=${result.msg.slice(0, 80)}`);
      return result;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (error instanceof LeniuClientError) {
        this.logger.warn(`leniu ${path} ${elapsedMs}ms ${error.kind}: ${error.message}`);
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new LeniuClientError('TIMEOUT', `${path} 超时（${timeoutMs}ms）`);
        this.logger.warn(`leniu ${path} ${elapsedMs}ms ${timeoutError.message}`);
        throw timeoutError;
      }
      const message = error instanceof Error ? error.message : String(error);
      const transportError = new LeniuClientError('TRANSPORT', `${path} 请求失败：${message}`);
      this.logger.warn(`leniu ${path} ${elapsedMs}ms ${transportError.message}`);
      throw transportError;
    } finally {
      clearTimeout(timer);
    }
  }
}
