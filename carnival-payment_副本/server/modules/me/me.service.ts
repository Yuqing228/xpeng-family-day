// 员工端账单：余额（乐牛实时）+ 订单列表 + 订单详情
// 列表对 INIT/UNKNOWN 记录做一次懒补偿（最多 5 条并行查单），命中成功则回写台账
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  familyIdentity,
  paymentLedger,
  refundLedger,
  stallConfig,
} from '@server/database/schema';
import { IdentityService, type ResolvedEmployee } from '@server/modules/identity/identity.service';
import { LeniuClient, isLeniuSuccess, toNumberOrNull } from '@server/modules/leniu/leniu.client';
import { isRefundStatus } from '@shared/api.interface';
import type {
  BalanceView,
  MyOrderDetail,
  MyOrderItem,
  MyOrdersView,
} from '@shared/api.interface';

type LedgerRow = typeof paymentLedger.$inferSelect;
type RefundRow = typeof refundLedger.$inferSelect;

const LIST_LIMIT = 50;
const RECONCILE_LIMIT = 5;

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly identity: IdentityService,
    private readonly leniu: LeniuClient,
  ) {}

  async balance(userId: string): Promise<BalanceView> {
    const employee = await this.identity.resolveEmployee(userId);
    const { custId, fresh } = await this.identity.resolveCustId(employee);
    if (fresh) this.identity.schedulePersistCustId(employee.miaodaUserId, custId);
    const snapshot = await this.identity.queryBalance(custId);
    return {
      balanceFen: snapshot.balanceFen,
      walletBal: snapshot.walletBal,
      subsidyBal: snapshot.subsidyBal,
      accStatus: snapshot.accStatus,
      accName: snapshot.accName,
      custNum: employee.custNum,
      note: null,
    };
  }

  async orders(userId: string): Promise<MyOrdersView> {
    const employee = await this.identity.resolveEmployee(userId);
    return this.ordersForEmployee(employee);
  }

  /** 家人端匿名账单复用：调用方（family-manage）已解析出归属员工 */
  async ordersForEmployee(employee: ResolvedEmployee): Promise<MyOrdersView> {
    const rows: LedgerRow[] = await this.db
      .select()
      .from(paymentLedger)
      .where(eq(paymentLedger.miaodaUserId, employee.miaodaUserId))
      .orderBy(desc(paymentLedger.createdAt))
      .limit(LIST_LIMIT);
    const reconciled = await this.reconcilePending(rows);
    return {
      items: await this.toItems(reconciled, employee),
      balanceFen: await this.tryBalance(employee),
    };
  }

  async orderDetail(userId: string, keyRaw: string): Promise<MyOrderDetail> {
    return this.orderDetailFor(userId, keyRaw);
  }

  /** key 支持台账 id 或 macOrdId；miaodaUserId 为订单归属员工 */
  async orderDetailFor(miaodaUserId: string, keyRaw: string): Promise<MyOrderDetail> {
    const key = (keyRaw || '').trim();
    if (!key) throw new NotFoundException('账单不存在');
    const numeric = /^\d+$/.test(key);
    const rows: LedgerRow[] = numeric
      ? await this.db
          .select()
          .from(paymentLedger)
          .where(
            and(
              eq(paymentLedger.id, Number(key)),
              eq(paymentLedger.miaodaUserId, miaodaUserId),
            ),
          )
          .limit(1)
      : await this.db
          .select()
          .from(paymentLedger)
          .where(
            and(
              eq(paymentLedger.macOrdId, key),
              eq(paymentLedger.miaodaUserId, miaodaUserId),
            ),
          )
          .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('账单不存在');
    const [current] = await this.reconcilePending([row]);
    const employee = await this.identity.resolveEmployee(miaodaUserId);
    const [item] = await this.toItems([current], employee);
    if (!item) throw new NotFoundException('账单不存在');

    const refundRows: RefundRow[] = await this.db
      .select()
      .from(refundLedger)
      .where(eq(refundLedger.paymentLedgerId, current.id))
      .orderBy(desc(refundLedger.id))
      .limit(20);
    const active = refundRows.find((r: RefundRow) => r.status !== 'REJECTED') ?? null;
    const latestRejected = active ? null : (refundRows[0] ?? null);
    const refundRow = active ?? latestRejected;
    const refund = refundRow
      ? {
          refundMacOrdId: refundRow.macOrdId,
          amountFen: refundRow.amountFen,
          createdAt: refundRow.createdAt.toISOString(),
          remark: refundRow.remark,
          status: isRefundStatus(refundRow.status) ? refundRow.status : 'REGISTERED',
          decisionNote: refundRow.decisionNote,
        }
      : null;
    return {
      ...item,
      paymentLedgerId: Number(current.id),
      refund,
      refundable: current.status === 'SUCCESS' && active === null,
    };
  }

  private async tryBalance(employee: ResolvedEmployee): Promise<number | null> {
    try {
      const { custId, fresh } = await this.identity.resolveCustId(employee);
      if (fresh) this.identity.schedulePersistCustId(employee.miaodaUserId, custId);
      const snapshot = await this.identity.queryBalance(custId);
      return snapshot.balanceFen;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`账单页余额获取失败 user=${employee.miaodaUserId}: ${message}`);
      return null;
    }
  }

  private async reconcilePending(rows: LedgerRow[]): Promise<LedgerRow[]> {
    const pending = rows
      .filter((row: LedgerRow) => row.status === 'INIT' || row.status === 'UNKNOWN')
      .slice(0, RECONCILE_LIMIT);
    if (pending.length === 0) return rows;
    const settled = await Promise.all(
      pending.map((row: LedgerRow) => this.reconcileOne(row)),
    );
    const byId = new Map<number, LedgerRow>(settled.map((row: LedgerRow) => [row.id, row]));
    return rows.map((row: LedgerRow) => byId.get(row.id) ?? row);
  }

  private async reconcileOne(row: LedgerRow): Promise<LedgerRow> {
    const macOrdId = row.macOrdId;
    if (!macOrdId) return row;
    try {
      const res = await this.leniu.queryOrderState(macOrdId);
      const ordStateRaw = res.data?.ordState;
      const ordState =
        ordStateRaw === null || ordStateRaw === undefined ? null : String(ordStateRaw);
      const success =
        isLeniuSuccess(res) && (toNumberOrNull(res.data?.payState) === 3 || ordState === '1');
      if (!success) return row;
      const ordIdRaw = res.data?.ordId;
      const ordId =
        ordIdRaw === null ||
        ordIdRaw === undefined ||
        String(ordIdRaw) === '' ||
        String(ordIdRaw) === '0'
          ? null
          : String(ordIdRaw);
      const updated: LedgerRow[] = await this.db
        .update(paymentLedger)
        .set({
          status: 'SUCCESS',
          payState: 3,
          leniuOrdId: ordId,
          accBal: toNumberOrNull(res.data?.accBal),
          paidAt: new Date(),
          failReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentLedger.id, row.id),
            inArray(paymentLedger.status, ['INIT', 'UNKNOWN']),
          ),
        )
        .returning();
      return updated[0] ?? row;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`账单懒补偿查单失败 ledgerId=${row.id}: ${message}`);
      return row;
    }
  }

  private async toItems(rows: LedgerRow[], employee: ResolvedEmployee): Promise<MyOrderItem[]> {
    if (rows.length === 0) return [];
    const stallRows: Array<{ passCode: string; stallName: string }> = await this.db
      .select({ passCode: stallConfig.passCode, stallName: stallConfig.stallName })
      .from(stallConfig);
    const stallNames = new Map<string, string>(
      stallRows.map((r: { passCode: string; stallName: string }) => [r.passCode, r.stallName]),
    );
    const familyIds: number[] = rows
      .map((row: LedgerRow) => row.familyIdentityId)
      .filter((id: number | null): id is number => id !== null);
    const familyNames = new Map<number, string>();
    if (familyIds.length > 0) {
      const fams: Array<{ id: number; familyName: string }> = await this.db
        .select({ id: familyIdentity.id, familyName: familyIdentity.familyName })
        .from(familyIdentity)
        .where(inArray(familyIdentity.id, familyIds));
      for (const f of fams) familyNames.set(f.id, f.familyName);
    }
    return rows.map((row: LedgerRow) => {
      const familyName =
        row.familyIdentityId === null ? undefined : familyNames.get(row.familyIdentityId);
      return {
        id: String(row.id),
        passCode: row.passCode,
        stallName: stallNames.get(row.passCode) ?? '未知摊位',
        payerName: familyName ?? employee.employeeName,
        employeeName: employee.employeeName,
        custNum: employee.custNum,
        amountFen: row.amountFen,
        balanceAfterFen: row.accBal,
        status: row.status,
        macOrdId: row.macOrdId,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
