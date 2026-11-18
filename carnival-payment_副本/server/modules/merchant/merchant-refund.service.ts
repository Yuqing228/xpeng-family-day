// 摊主退款审批：pending 轮询待确认单 + decide 原子流转（REGISTERED → APPROVED / REJECTED）
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  employeeCardMap,
  familyIdentity,
  merchantBinding,
  paymentLedger,
  refundLedger,
} from '@server/database/schema';
import type {
  MerchantPendingRefund,
  MerchantRefundDecideRequest,
  MerchantRefundDecideResponse,
} from '@shared/api.interface';

type RefundRow = typeof refundLedger.$inferSelect;
type BindingRow = typeof merchantBinding.$inferSelect;

@Injectable()
export class MerchantRefundService {
  private readonly logger = new Logger(MerchantRefundService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  /** 待摊主确认的退款单（先到先审，升序返回；未绑定摊位返回空） */
  async pending(userId: string): Promise<MerchantPendingRefund[]> {
    const binding = await this.latestBinding(userId);
    if (!binding) return [];
    const rows: Array<{
      refund: RefundRow;
      txnNo: string | null;
      familyName: string | null;
      employeeName: string | null;
    }> = await this.db
      .select({
        refund: refundLedger,
        txnNo: paymentLedger.macOrdId,
        familyName: familyIdentity.familyName,
        employeeName: employeeCardMap.employeeName,
      })
      .from(refundLedger)
      .leftJoin(paymentLedger, eq(paymentLedger.id, refundLedger.paymentLedgerId))
      .leftJoin(familyIdentity, eq(familyIdentity.id, paymentLedger.familyIdentityId))
      .leftJoin(employeeCardMap, eq(employeeCardMap.miaodaUserId, paymentLedger.miaodaUserId))
      .where(and(eq(refundLedger.passCode, binding.pin), eq(refundLedger.status, 'REGISTERED')))
      .orderBy(asc(refundLedger.createdAt))
      .limit(50);
    return rows.map(
      (
        r: {
          refund: RefundRow;
          txnNo: string | null;
          familyName: string | null;
          employeeName: string | null;
        },
      ): MerchantPendingRefund => ({
        refundMacOrdId: r.refund.macOrdId,
        txnNo: r.txnNo ?? r.refund.macOrdId,
        amount: r.refund.amountFen / 100,
        employeeName: r.employeeName ?? '—',
        payerIdentity: r.familyName ?? '本人',
        remark: r.refund.remark,
        createdAt: r.refund.createdAt.toISOString(),
      }),
    );
  }

  /** 摊主审批：原子流转 REGISTERED → APPROVED / REJECTED（0 行 = 已被处理或非本摊） */
  async decide(
    userId: string,
    req: MerchantRefundDecideRequest,
  ): Promise<MerchantRefundDecideResponse> {
    const refundMacOrdId = (req.refundMacOrdId || '').trim();
    if (!refundMacOrdId) throw new BadRequestException('退款单号不能为空');
    const decision = req.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new BadRequestException('审批动作非法');
    }
    const binding = await this.latestBinding(userId);
    if (!binding) throw new ForbiddenException('本机未绑定摊位');
    const note = decision === 'REJECTED' ? (req.rejectReason || '').trim().slice(0, 100) : null;
    const updated: RefundRow[] = await this.db
      .update(refundLedger)
      .set({
        status: decision,
        decidedBy: userId.slice(0, 64),
        decidedAt: new Date(),
        decisionNote: note && note.length > 0 ? note : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(refundLedger.macOrdId, refundMacOrdId),
          eq(refundLedger.passCode, binding.pin),
          eq(refundLedger.status, 'REGISTERED'),
        ),
      )
      .returning();
    const row = updated[0];
    if (!row) {
      throw new ConflictException('该笔退款已被处理或不存在，请刷新后重试');
    }
    const message =
      decision === 'APPROVED'
        ? `已同意退款 ${row.macOrdId}（¥${(row.amountFen / 100).toFixed(2)}）`
        : `已拒绝退款 ${row.macOrdId}`;
    return { refundMacOrdId: row.macOrdId, status: decision, message };
  }

  /** 与 PaymentService.latestBinding 同口径：同账号多口令取最新绑定行 */
  private async latestBinding(userId: string): Promise<BindingRow | null> {
    const rows: BindingRow[] = await this.db
      .select()
      .from(merchantBinding)
      .where(eq(merchantBinding.miaodaUserId, userId))
      .orderBy(desc(merchantBinding.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }
}
