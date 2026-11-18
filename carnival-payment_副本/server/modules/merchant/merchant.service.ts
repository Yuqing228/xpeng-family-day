// 摊主端：飞书认证 + 4 位口令绑定摊位（换班多对一）、今日收入概览（净额口径）、台账只读
// specs/merchant-terminal
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, FileService, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  appConfig,
  employeeCardMap,
  familyIdentity,
  merchantBinding,
  paymentLedger,
  refundLedger,
  stallConfig,
} from '@server/database/schema';
import { AppConfigService } from '@server/modules/config/config.service';
import { PaymentService } from '@server/modules/payment/payment.service';
import { todayRange8 } from '@server/common/utils/time';
import { toLedgerStatus } from '@server/common/utils/ledger-status';
import { BusinessException } from '@server/common/interfaces/exception.interface';
import { ResponseCode } from '@server/common/constants/api_response_code';
import { HttpStatus } from '@nestjs/common';
import type {
  MerchantSession,
  BindRequest,
  MerchantSummary,
  MerchantLedgerRow,
  MerchantLedgerExport,
  LedgerStatus,
} from '@shared/api.interface';

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly config: AppConfigService,
    private readonly payment: PaymentService,
    private readonly fileService: FileService,
  ) {}

  /** 登录态 + 最新绑定摊位 */
  async session(userId: string | undefined, userName: string | undefined): Promise<MerchantSession> {
    if (!userId) return { loggedIn: false, binding: null };
    return { loggedIn: true, userId, userName, binding: await this.payment.latestBinding(userId) };
  }

  /** 4 位随机口令绑定：口令=stall_config.pass_code（库端生成，区分大小写，status=ACTIVE）；错误明确报错；换班多对一 */
  async bind(userId: string, req: BindRequest): Promise<{ pin: string; stallNo: string; stallName: string }> {
    const pin = (req.pin || '').trim();
    if (!/^[0-9a-zA-Z]{4}$/.test(pin)) {
      throw new BusinessException(ResponseCode.VALIDATION_ERROR, '口令为 4 位字符（区分大小写），请重新输入');
    }
    const stalls = await this.db
      .select()
      .from(stallConfig)
      .where(and(eq(stallConfig.passCode, pin), eq(stallConfig.status, 'ACTIVE')));
    if (stalls.length === 0) {
      throw new BusinessException(ResponseCode.NOT_FOUND, '口令无效，请核对管理员发放的摊主口令', HttpStatus.NOT_FOUND);
    }
    const stall = stalls[0];
    // 同账号同口令重复绑定幂等；不同口令允许并存（多对一：换班同事各自绑定）
    const existing = await this.db
      .select()
      .from(merchantBinding)
      .where(and(eq(merchantBinding.miaodaUserId, userId), eq(merchantBinding.pin, pin)));
    if (existing.length === 0) {
      await this.db.insert(merchantBinding).values({ miaodaUserId: userId, pin });
    }
    return { pin, stallNo: stall.merchantCode ?? stall.passCode, stallName: stall.stallName };
  }

  /** 今日收入概览（净额口径：成功收款 − 已登记退款；失败/处理中不进统计） */
  async summary(userId: string): Promise<MerchantSummary> {
    const binding = await this.payment.latestBinding(userId);
    if (!binding) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '本机未绑定摊位', HttpStatus.FORBIDDEN);
    }
    const { start, end } = todayRange8();
    const rows: Array<{ amountFen: number; status: string }> = await this.db
      .select({ amountFen: paymentLedger.amountFen, status: paymentLedger.status })
      .from(paymentLedger)
      .where(
        and(
          eq(paymentLedger.passCode, binding.pin),
          gte(paymentLedger.createdAt, start),
          lt(paymentLedger.createdAt, end),
        ),
      );
    let successAmountFen = 0;
    let txCount = 0;
    for (const r of rows) {
      if (r.status !== 'SUCCESS') continue;
      successAmountFen += r.amountFen;
      txCount += 1;
    }
    const refundRows: Array<{ amountFen: number }> = await this.db
      .select({ amountFen: refundLedger.amountFen })
      .from(refundLedger)
      .where(
        and(
          eq(refundLedger.passCode, binding.pin),
          gte(refundLedger.createdAt, start),
          lt(refundLedger.createdAt, end),
        ),
      );
    const refundAmountFen = refundRows.reduce(
      (sum: number, r: { amountFen: number }) => sum + r.amountFen,
      0,
    );
    const successAmount = successAmountFen / 100;
    const refundAmount = refundAmountFen / 100;
    const refundCount = refundRows.length;
    const commissionRate = await this.config.commissionRate();
    const netAmount = successAmount - refundAmount;
    const commission = Math.round(netAmount * commissionRate * 100) / 100;
    return {
      stallName: binding.stallName,
      netAmount,
      txCount,
      refundCount,
      refundAmount,
      commissionRate,
      commission,
      takeHome: Math.round((netAmount - commission) * 100) / 100,
    };
  }

  /** 摊位台账只读明细（specs「摊位台账只读明细」：无任何退款入口，接口只读） */
  async ledger(userId: string): Promise<MerchantLedgerRow[]> {
    const binding = await this.payment.latestBinding(userId);
    if (!binding) {
      throw new BusinessException(ResponseCode.FORBIDDEN, '本机未绑定摊位', HttpStatus.FORBIDDEN);
    }
    const { start, end } = todayRange8();
    const rows: Array<{
      id: number;
      macOrdId: string | null;
      amountFen: number;
      accBal: number | null;
      status: string;
      paidAt: Date | null;
      createdAt: Date;
      employeeName: string | null;
      custNum: string | null;
      familyName: string | null;
    }> = await this.db
      .select({
        id: paymentLedger.id,
        macOrdId: paymentLedger.macOrdId,
        amountFen: paymentLedger.amountFen,
        accBal: paymentLedger.accBal,
        status: paymentLedger.status,
        paidAt: paymentLedger.paidAt,
        createdAt: paymentLedger.createdAt,
        employeeName: employeeCardMap.employeeName,
        custNum: employeeCardMap.custNum,
        familyName: familyIdentity.familyName,
      })
      .from(paymentLedger)
      .leftJoin(employeeCardMap, eq(employeeCardMap.miaodaUserId, paymentLedger.miaodaUserId))
      .leftJoin(familyIdentity, eq(familyIdentity.id, paymentLedger.familyIdentityId))
      .where(
        and(
          eq(paymentLedger.passCode, binding.pin),
          gte(paymentLedger.createdAt, start),
          lt(paymentLedger.createdAt, end),
        ),
      )
      .orderBy(desc(paymentLedger.createdAt))
      .limit(300);

    const ids: number[] = rows.map((r: { id: number }) => r.id);
    const refundedIds = new Set<number>();
    if (ids.length > 0) {
      const refunds: Array<{ paymentLedgerId: number | null }> = await this.db
        .select({ paymentLedgerId: refundLedger.paymentLedgerId })
        .from(refundLedger)
        .where(inArray(refundLedger.paymentLedgerId, ids));
      for (const r of refunds) {
        if (r.paymentLedgerId !== null) refundedIds.add(r.paymentLedgerId);
      }
    }

    return rows.map((r) => ({
      txnNo: r.macOrdId ?? `PL-${r.id}`,
      stallName: binding.stallName,
      payerIdentity: r.familyName ?? '本人',
      amount: r.amountFen / 100,
      balanceAfter: r.accBal === null ? null : r.accBal / 100,
      status: refundedIds.has(r.id) ? 'revoked' : toLedgerStatus(r.status),
      txnTime: (r.paidAt ?? r.createdAt).toISOString(),
      employeeName: r.employeeName ?? '—',
      employeeCustNum: r.custNum ?? '—',
      operatorName: '自助扫码',
    }));
  }

  /** 导出台账 CSV：服务端生成 → 应用文件存储 → 真实下载链接（飞书 webview 无法下载 blob URL） */
  async exportLedgerCsv(userId: string): Promise<MerchantLedgerExport> {
    const rows = await this.ledger(userId);
    const binding = await this.payment.latestBinding(userId);
    const header = '交易单号,时间,员工工号,付款人,金额,状态,操作摊主';
    const lines = rows.map((r) =>
      [
        r.txnNo,
        beijingHm(r.txnTime),
        r.employeeCustNum,
        r.payerIdentity,
        r.amount.toFixed(2),
        LEDGER_STATUS_LABELS[r.status] ?? r.status,
        r.operatorName,
      ]
        .map(csvEscape)
        .join(','),
    );
    const csv = `\uFEFF${[header, ...lines].join('\n')}`;
    const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const pin = binding?.pin ?? 'stall';
    const exportPathKey = `ledger_export_path_${pin}`;
    const [lastExport] = await this.db
      .select()
      .from(appConfig)
      .where(eq(appConfig.configKey, exportPathKey));
    if (lastExport) {
      try {
        await this.fileService.remove([lastExport.configValue]);
      } catch {
        this.logger.warn(
          `清理上一份导出文件失败（继续上传新文件）: ${lastExport.configValue}`,
        );
      }
    }
    const meta = await this.fileService.upload(csv, {
      fileName: `ledger-${pin}-${date}.csv`,
      contentType: 'text/csv;charset=utf-8',
    });
    await this.db
      .insert(appConfig)
      .values({ configKey: exportPathKey, configValue: meta.filePath })
      .onConflictDoUpdate({
        target: appConfig.configKey,
        set: { configValue: meta.filePath },
      });
    return { downloadUrl: meta.downloadURL };
  }
}

const LEDGER_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  revoked: '已撤销',
  refund_pending: '撤销待处理',
  processing: '处理中',
  failed: '失败',
};

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function beijingHm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
