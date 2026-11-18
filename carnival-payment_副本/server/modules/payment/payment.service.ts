// 支付编排（C 扫 B，merchant-code-payment 对调）：摊位码 token 解析 + 顾客身份解析
// + 既有内核（实时调乐牛、先 API 后落账、JNH 单号幂等；uid_queue 排队已随表退役）。
// specs/payment-orchestration delta。
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import {
  employeeCardMap,
  familyIdentity,
  merchantBinding,
  paymentLedger,
  stallConfig,
} from '@server/database/schema';
import { AppConfigService } from '@server/modules/config/config.service';
import { LeniuService } from '@server/modules/leniu/leniu.service';
import { todayRange8 } from '@server/common/utils/time';
import { maskEmployeeName, maskCardUid } from '@server/common/utils/mask';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import { HttpStatus } from '@nestjs/common';
import type { PrepareResponse, StallFeedResponse } from '@shared/api.interface';

export interface ResolvedPayer {
  identityId: string;
  displayName: string;
  /** 关系枚举（spouse/child/elder/other） */
  relation: string;
  relationLabel: string;
  isSelf: boolean;
  cardUid: string;
  employeeName: string;
}

export interface ResolvedStall {
  pin: string;
  stallNo: string;
  stallName: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly config: AppConfigService,
    private readonly leniu: LeniuService,
  ) {}

  /** 顾客身份 token → 付款人：旧 family_identity 已废弃，新版识人链路后续步骤接入；当前恒无身份（NEED_IDENTITY 引导态） */
  async resolveToken(token: string): Promise<ResolvedPayer | null> {
    void token;
    return null;
  }

  /** 员工登录态 → 付款人（C 扫 B 的 who=self 路径）：旧 employee_card_map 已废弃，新版识人链路后续步骤接入；当前恒无身份 */
  async resolveSelfByUser(userId: string): Promise<ResolvedPayer | null> {
    void userId;
    return null;
  }

  /** 摊位静态收款码 token → 摊位（stall_config.static_token，静态不轮换，specs delta「摊位收款码 token」） */
  async resolveStall(stallToken: string): Promise<ResolvedStall | null> {
    if (!stallToken || stallToken.length < 8) return null;
    const rows = await this.db
      .select()
      .from(stallConfig)
      .where(and(eq(stallConfig.staticToken, stallToken), eq(stallConfig.status, 'ACTIVE')));
    if (rows.length === 0) return null;
    return { pin: rows[0].passCode, stallNo: rows[0].merchantCode ?? rows[0].passCode, stallName: rows[0].stallName };
  }

  /** 摊主端读取本摊静态收款码（stall_config.static_token；缺失时一次性补种） */
  async stallTokenInfo(userId: string): Promise<{ stallToken: string; stallNo: string; stallName: string }> {
    const binding = await this.latestBinding(userId);
    if (!binding) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '本机未绑定摊位', HttpStatus.FORBIDDEN);
    }
    const rows = await this.db.select().from(stallConfig).where(eq(stallConfig.passCode, binding.pin));
    const stall = rows[0];
    if (!stall) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '摊位不存在或已下线', HttpStatus.NOT_FOUND);
    }
    if (!stall.staticToken) {
      const token = randomBytes(16).toString('hex');
      await this.db.update(stallConfig).set({ staticToken: token }).where(eq(stallConfig.passCode, stall.passCode));
      return { stallToken: token, stallNo: stall.merchantCode ?? stall.passCode, stallName: stall.stallName };
    }
    return { stallToken: stall.staticToken, stallNo: stall.merchantCode ?? stall.passCode, stallName: stall.stallName };
  }

  /** 全屏收款码页「刷新」兼容：静态码不轮换，返回同一 static_token */
  async refreshStallToken(userId: string): Promise<{ stallToken: string }> {
    const info = await this.stallTokenInfo(userId);
    return { stallToken: info.stallToken };
  }

  /**
   * 付款页初始化（顾客扫码后）：识别摊位 + 校验顾客身份 + 余额。
   * 无身份（无 who 且未登录）→ NEED_IDENTITY（前端引导态）；摊位码无效 → INVALID_STALL。
   */
  async prepare(stallToken: string, who: string, userId?: string): Promise<PrepareResponse> {
    const inEventWindow = await this.config.isInEventWindow();
    const stall = await this.resolveStall(stallToken);
    if (!stall) {
      return {
        stall: null,
        payer: null,
        balance: null,
        inEventWindow,
        code: 'INVALID_STALL',
        message: '摊位码无效或已刷新，请与摊主确认',
      };
    }
    if (!inEventWindow) {
      return {
        stall: { stallNo: stall.stallNo, stallName: stall.stallName },
        payer: null,
        balance: null,
        inEventWindow: false,
        code: 'OUT_OF_WINDOW',
        message: '链接仅活动当天有效，现已失效',
      };
    }
    const payer =
      who === 'self'
        ? await this.resolveSelfByUser(userId || '')
        : who
          ? await this.resolveToken(who)
          : await this.resolveSelfByUser(userId || '');
    if (!payer) {
      return {
        stall: { stallNo: stall.stallNo, stallName: stall.stallName },
        payer: null,
        balance: null,
        inEventWindow: true,
        code: 'NEED_IDENTITY',
        message: '请从家人专属链接或飞书员工端进入后扫码',
      };
    }
    let balance: number | null = null;
    try {
      balance = await this.leniu.queryBalance(payer.cardUid);
    } catch (err) {
      this.logger.warn(`prepare 余额查询失败 card=${payer.cardUid}: ${String(err)}`);
    }
    return {
      stall: { stallNo: stall.stallNo, stallName: stall.stallName },
      payer: {
        displayName: payer.displayName,
        relationLabel: payer.relationLabel,
        employeeMaskedName: maskEmployeeName(payer.employeeName),
        cardLast4: maskCardUid(payer.cardUid),
      },
      balance,
      inEventWindow: true,
      code: 'OK',
    };
  }

  /** 摊主到账增量查询（≤3s 轮询专用；脱敏，不含员工全名与工卡 UID） */
  async stallFeed(userId: string, after: string): Promise<StallFeedResponse> {
    const binding = await this.latestBinding(userId);
    if (!binding) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '本机未绑定摊位', HttpStatus.FORBIDDEN);
    }
    let afterDate: Date;
    try {
      afterDate = new Date(after);
      if (Number.isNaN(afterDate.getTime())) throw new Error('invalid');
    } catch {
      afterDate = new Date(0);
    }
    const rows = await this.db
      .select({
        macOrdId: paymentLedger.macOrdId,
        amountFen: paymentLedger.amountFen,
        familyIdentityId: paymentLedger.familyIdentityId,
        miaodaUserId: paymentLedger.miaodaUserId,
        paidAt: paymentLedger.paidAt,
      })
      .from(paymentLedger)
      .where(
        and(
          eq(paymentLedger.passCode, binding.pin),
          eq(paymentLedger.status, 'SUCCESS'),
          gt(paymentLedger.paidAt, afterDate),
        ),
      )
      .orderBy(asc(paymentLedger.paidAt))
      .limit(50);
    const paidRows = rows.filter(
      (r): r is typeof r & { paidAt: Date } => r.paidAt !== null,
    );
    const familyIds: number[] = paidRows
      .map((r) => r.familyIdentityId)
      .filter((id: number | null): id is number => id !== null);
    const userIds: string[] = paidRows.map((r) => r.miaodaUserId);
    const familyNames = new Map<number, string>();
    if (familyIds.length > 0) {
      const fams: Array<{ id: number; familyName: string }> = await this.db
        .select({ id: familyIdentity.id, familyName: familyIdentity.familyName })
        .from(familyIdentity)
        .where(inArray(familyIdentity.id, familyIds));
      for (const f of fams) familyNames.set(f.id, f.familyName);
    }
    const employeeNames = new Map<string, string>();
    if (userIds.length > 0) {
      const emps: Array<{ miaodaUserId: string | null; employeeName: string }> = await this.db
        .select({
          miaodaUserId: employeeCardMap.miaodaUserId,
          employeeName: employeeCardMap.employeeName,
        })
        .from(employeeCardMap)
        .where(inArray(employeeCardMap.miaodaUserId, userIds));
      for (const e of emps) {
        if (e.miaodaUserId) employeeNames.set(e.miaodaUserId, e.employeeName);
      }
    }
    const lastPaidAt = paidRows[paidRows.length - 1]?.paidAt;
    return {
      transactions: paidRows.map((r) => ({
        txnNo: r.macOrdId ?? '',
        amount: r.amountFen / 100,
        payerIdentity:
          (r.familyIdentityId !== null ? familyNames.get(r.familyIdentityId) : undefined) ??
          maskEmployeeName(employeeNames.get(r.miaodaUserId) ?? '') ??
          '顾客',
        txnTime: r.paidAt.toISOString(),
      })),
      cursor: lastPaidAt ? lastPaidAt.toISOString() : afterDate.toISOString(),
    };
  }

  /** 摊主最新绑定（换班多对一：取该账号最近绑定的摊位） */
  async latestBinding(userId: string): Promise<{ pin: string; stallName: string } | null> {
    const rows = await this.db
      .select({
        pin: merchantBinding.pin,
        stallName: stallConfig.stallName,
      })
      .from(merchantBinding)
      .innerJoin(stallConfig, eq(stallConfig.passCode, merchantBinding.pin))
      .where(eq(merchantBinding.miaodaUserId, userId))
      .orderBy(sql`${merchantBinding.createdAt} desc`)
      .limit(1);
    return rows[0] ?? null;
  }

}

/** 生成不可猜测的专属链接 token（长随机，specs/identity-management） */
export function newLinkToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 今日（东八区）范围，供摊主首页/台账/结算口径共用 */
export function todayRange(): { start: Date; end: Date } {
  return todayRange8();
}
