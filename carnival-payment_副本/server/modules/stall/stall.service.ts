// 摊位端：用摊位收款码 token 查该摊位当日成功订单（北京时间自然日）
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { employeeCardMap, paymentLedger, stallConfig } from '@server/database/schema';
import { shanghaiTodayRange } from '@server/common/utils/business-date';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';
import type { StallOrdersView } from '@shared/api.interface';

@Injectable()
export class StallService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async orders(stallToken: string): Promise<StallOrdersView> {
    const token = (stallToken || '').trim();
    if (!token) {
      throw payflowError(PAYFLOW_CODE.INVALID_STALL, '收款码无效，请扫描摊位收款码');
    }
    const stallRows: Array<{ passCode: string; stallName: string; status: string }> = await this.db
      .select({
        passCode: stallConfig.passCode,
        stallName: stallConfig.stallName,
        status: stallConfig.status,
      })
      .from(stallConfig)
      .where(eq(stallConfig.staticToken, token))
      .limit(1);
    const stall = stallRows[0];
    if (!stall || stall.status !== 'ACTIVE') {
      throw payflowError(PAYFLOW_CODE.INVALID_STALL, '收款码无效或摊位已停用');
    }

    const range = shanghaiTodayRange();
    const rows: Array<{
      id: number;
        amountFen: number;
        paidAt: Date | null;
        macOrdId: string | null;
        payerName: string | null;
      }> = await this.db
        .select({
          id: paymentLedger.id,
          amountFen: paymentLedger.amountFen,
          paidAt: paymentLedger.paidAt,
          macOrdId: paymentLedger.macOrdId,
          payerName: employeeCardMap.employeeName,
        })
        .from(paymentLedger)
        .leftJoin(
          employeeCardMap,
          eq(employeeCardMap.miaodaUserId, paymentLedger.miaodaUserId),
        )
      .where(
        and(
          eq(paymentLedger.passCode, stall.passCode),
          eq(paymentLedger.status, 'SUCCESS'),
          gte(paymentLedger.paidAt, range.start),
          lt(paymentLedger.paidAt, range.end),
        ),
      )
      .orderBy(asc(paymentLedger.paidAt));

    return {
      stallName: stall.stallName,
      passCode: stall.passCode,
      orders: rows.map((row, index: number) => ({
        id: String(row.id),
        amountFen: row.amountFen,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
          macOrdId: row.macOrdId,
          payerName: row.payerName ?? '',
          seq: index + 1,
      })),
    };
  }
}
