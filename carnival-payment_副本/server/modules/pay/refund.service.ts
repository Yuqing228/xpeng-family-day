// 退款登记：员工/家属申请登记为 REGISTERED 待摊主确认，管理员登记直接 APPROVED；被拒后可重新登记新行
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, ne } from 'drizzle-orm';
import { paymentLedger, refundLedger } from '@server/database/schema';
import { newRefundMacOrdId } from '@server/common/utils/leopen-sign';
import { extractPostgresErrorCode } from '@server/common/utils/postgres-error';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';
import { CodedBusinessException } from '@server/common/interfaces/exception.interface';
import { IdentityService } from '@server/modules/identity/identity.service';
import { isRefundStatus } from '@shared/api.interface';
import type {
  RefundApplyRequest,
  RefundApplyResult,
  RefundStatus,
} from '@shared/api.interface';

type RefundRow = typeof refundLedger.$inferSelect;
type LedgerRow = typeof paymentLedger.$inferSelect;

const NOTE_PENDING_MERCHANT = '退款已登记，待摊主确认后统一原路退回工卡，无需重复提交';
const NOTE_APPROVED = '退款已同意，待人工原路退回工卡（乐牛暂无在线退款接口）';

export interface RefundRegisterInput {
  /** 原支付台账 id */
  paymentLedgerId: number;
  /** 发起人标识：员工妙搭用户ID / family:<家人身份ID> / 管理员 userId */
  initiatedBy: string;
  /** 退款原因留痕（管理端填写） */
  remark: string | null;
  /** 初始状态：管理员登记直接 APPROVED（跳过摊主审批），缺省 REGISTERED */
  initialStatus?: 'REGISTERED' | 'APPROVED';
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly identity: IdentityService,
  ) {}

  /**
   * 退款登记：员工登录态或家人 share token（家人代为登记，归属员工）。
   * 两种调用者最终都校验台账 miaodaUserId 与归属员工一致。
   */
  async apply(callerUserId: string, dto: RefundApplyRequest): Promise<RefundApplyResult> {
    const ledgerId = Number(dto.paymentLedgerId);
    if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
      throw payflowError(PAYFLOW_CODE.NOT_REFUNDABLE, '退款参数非法');
    }
    const row = await this.findLedger(ledgerId);
    if (!row) {
      throw payflowError(PAYFLOW_CODE.NOT_REFUNDABLE, '记录不存在或无权登记退款');
    }

    const familyToken = (dto.familyShareToken || '').trim();
    let ownerUserId: string;
    let initiatedBy: string;
    if (familyToken) {
      const family = await this.identity.resolveFamilyPayer(familyToken);
      ownerUserId = family.employee.miaodaUserId;
      initiatedBy = `family:${family.familyIdentityId}`;
    } else {
      if (!callerUserId) {
        throw payflowError(
          PAYFLOW_CODE.IDENTITY_UNAVAILABLE,
          '请先登录后再申请退款',
          HttpStatus.UNAUTHORIZED,
        );
      }
      ownerUserId = callerUserId;
      initiatedBy = callerUserId;
    }

    if (row.miaodaUserId !== ownerUserId) {
      throw payflowError(PAYFLOW_CODE.NOT_REFUNDABLE, '记录不存在或无权登记退款');
    }
    return this.register({
      paymentLedgerId: ledgerId,
      initiatedBy,
      remark: dto.remark.trim(),
    });
  }

  /** 退款登记共用入口：按 payment_ledger_id 幂等（已拒绝的单可重新登记新行） */
  async register(input: RefundRegisterInput): Promise<RefundApplyResult> {
    const row = await this.findLedger(input.paymentLedgerId);
    if (!row) {
      throw payflowError(PAYFLOW_CODE.NOT_REFUNDABLE, '原支付记录不存在');
    }
    if (row.status !== 'SUCCESS' || !row.macOrdId) {
      throw payflowError(PAYFLOW_CODE.NOT_REFUNDABLE, '仅支付成功的记录可登记退款');
    }
    const existing = await this.findByLedgerId(row.id);
    if (existing) return this.toResult(existing);

    const refundMacOrdId = newRefundMacOrdId(row.passCode, row.id);
    const status: RefundStatus = input.initialStatus === 'APPROVED' ? 'APPROVED' : 'REGISTERED';
    try {
      const inserted: RefundRow[] = await this.db
        .insert(refundLedger)
        .values({
          macOrdId: refundMacOrdId,
          leniuOrdId: row.leniuOrdId,
          passCode: row.passCode,
          custNum: row.custNum,
          amountFen: row.amountFen,
          status,
          decidedBy: status === 'APPROVED' ? input.initiatedBy.slice(0, 64) : null,
          decidedAt: status === 'APPROVED' ? new Date() : null,
          initiatedBy: input.initiatedBy.slice(0, 64),
          paymentLedgerId: row.id,
          remark: input.remark,
        })
        .returning();
      const created = inserted[0];
      if (!created) {
        throw payflowError(
          PAYFLOW_CODE.INTERNAL,
          '退款登记失败，请稍后重试',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return this.toResult(created);
    } catch (error) {
      const sqlState = extractPostgresErrorCode(error);
      if (sqlState === '23505') {
        const found =
          (await this.findByLedgerId(row.id)) ?? (await this.findByMacOrdId(refundMacOrdId));
        if (found && found.status !== 'REJECTED') return this.toResult(found);
      }
      if (error instanceof CodedBusinessException) throw error;
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`退款登记失败 refundMacOrdId=${refundMacOrdId}`, stack);
      throw payflowError(
        PAYFLOW_CODE.INTERNAL,
        '退款登记失败，请稍后重试',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async findLedger(id: number): Promise<LedgerRow | null> {
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  private async findByLedgerId(paymentLedgerId: number): Promise<RefundRow | null> {
    const rows: RefundRow[] = await this.db
      .select()
      .from(refundLedger)
      .where(and(eq(refundLedger.paymentLedgerId, paymentLedgerId), ne(refundLedger.status, 'REJECTED')))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 历史行 payment_ledger_id 为空时按退款单号回查，保证幂等不 500 */
  private async findByMacOrdId(macOrdId: string): Promise<RefundRow | null> {
    const rows: RefundRow[] = await this.db
      .select()
      .from(refundLedger)
      .where(eq(refundLedger.macOrdId, macOrdId))
      .limit(1);
    return rows[0] ?? null;
  }

  private toResult(row: RefundRow): RefundApplyResult {
    const status: RefundStatus = isRefundStatus(row.status) ? row.status : 'REGISTERED';
    return {
      status,
      refundMacOrdId: row.macOrdId,
      amountFen: row.amountFen,
      note: status === 'APPROVED' ? NOTE_APPROVED : NOTE_PENDING_MERCHANT,
    };
  }
}
