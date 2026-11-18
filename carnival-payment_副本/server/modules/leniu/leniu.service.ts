// 乐牛餐饮系统集成：账户与余额的唯一权威源（specs/payment-orchestration）
// 经平台 HttpForwarder 调乐牛 API（mock_card_account 模拟模式已随表退役，2026-10-26）
// 关键口径：扣款仅带 员工工卡 UID + 金额，不携带家人身份（specs「扣款 API 口径不变」）
import { Injectable, Logger } from '@nestjs/common';
import { type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { HttpForwarderService } from '@lark-apaas/nestjs-http-forwarder';

/** 事务句柄类型（payment/admin 服务把自己的事务传进来，保证同事务原子性） */
type TxHandle = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];
export type DbClient = PostgresJsDatabase | TxHandle;

export class LeniuError extends Error {
  constructor(
    public readonly code: 'INSUFFICIENT_BALANCE' | 'CARD_NOT_FOUND' | 'LENIU_TIMEOUT' | 'LENIU_ERROR',
    message: string,
    public readonly balance?: number,
  ) {
    super(message);
    this.name = 'LeniuError';
  }
}

export interface LeniuDeductResult {
  success: boolean;
  balance: number;
  txnNo: string;
}

export interface LeniuReverseResult {
  success: boolean;
  balance: number;
  reversalTxnNo: string;
}

@Injectable()
export class LeniuService {
  private readonly logger = new Logger(LeniuService.name);

  constructor(private readonly forwarder: HttpForwarderService) {}

  /** 实时余额查询（不做本地缓存，specs「实时余额校验」） */
  async queryBalance(cardUid: string): Promise<number> {
    return this.httpQueryBalance(cardUid);
  }

  /** 扣款（http 模式为远端调用；tx 参数保留调用方事务语义，不参与远端调用） */
  async deductInTx(_tx: DbClient, cardUid: string, amount: number): Promise<number> {
    const res = await this.httpCall('POST', '/deduct', { cardUid, amount });
    if (!res.success) {
      throw new LeniuError('INSUFFICIENT_BALANCE', `余额不足，当前余额 ${res.balance} 元`, res.balance);
    }
    return res.balance;
  }

  /** 冲正/退款：原路退回工卡余额（specs/admin-refund「幂等冲正执行」） */
  async reverseInTx(_tx: DbClient, cardUid: string, amount: number): Promise<number> {
    const res = await this.httpCall('POST', '/reverse', { cardUid, amount });
    return res.balance;
  }

  /* ---------- http 模式：经平台 HttpForwarder 出网调乐牛 ---------- */

  private leniuBaseUrl(): string {
    const url = process.env.LENIU_BASE_URL;
    if (!url) {
      throw new LeniuError('LENIU_ERROR', '未配置 LENIU_BASE_URL，无法走乐牛 http 模式');
    }
    return url.replace(/\/$/, '');
  }

  private async httpQueryBalance(cardUid: string): Promise<number> {
    const res = await this.httpCall('POST', '/balance', { cardUid });
    return res.balance;
  }

  private async httpCall(method: string, path: string, body: Record<string, unknown>): Promise<any> {
    const targetUrl = `${this.leniuBaseUrl()}${path}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const apiKey = process.env.LENIU_API_KEY;
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const started = Date.now();
    try {
      const res = await this.forwarder.forward({
        method,
        targetUrl,
        headers,
        body: JSON.stringify(body),
      });
      const text = await this.readBody(res.body);
      if (res.status >= 400) {
        throw new LeniuError('LENIU_ERROR', `乐牛接口 ${path} 返回 ${res.status}: ${text.slice(0, 200)}`);
      }
      this.logger.log(`leniu ${path} ${Date.now() - started}ms -> ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof LeniuError) throw err;
      const elapsed = Date.now() - started;
      this.logger.error(`leniu ${path} 调用失败 (${elapsed}ms): ${String(err)}`);
      throw new LeniuError('LENIU_TIMEOUT', `乐牛接口调用失败：${String(err).slice(0, 160)}`);
    }
  }

  private readBody(stream: import('stream').Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
}
