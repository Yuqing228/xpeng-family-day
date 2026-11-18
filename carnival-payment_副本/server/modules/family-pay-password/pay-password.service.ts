// 家庭支付密码（员工维度共享）：scrypt 哈希存储 + 连续错误冻结（5 次）+ 员工设置/重置/解锁
// 全家共用一个密码，存 employee_pay_secret（按 employee_user_id 唯一）；家人端无改密入口
import * as crypto from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { employeePaySecret } from '@server/database/schema';
import { PAYFLOW_CODE, payflowError } from '@server/common/constants/payflow-code';

/** 连续输错上限：达到即冻结 */
export const PAY_PASSWORD_MAX_FAILS = 5;

export const PAY_PASSWORD_LOCKED_MESSAGE =
  '支付密码已连续错误 5 次被冻结，请联系家人（工卡持有人）在员工端解除冻结';
export const PAY_PASSWORD_NOT_SET_MESSAGE =
  '尚未设置支付密码，请联系家人（工卡持有人）在员工端设置';

/** 6 位纯数字 */
export function isPayPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export interface PayPasswordState {
  hasPassword: boolean;
  locked: boolean;
  failCount: number;
}

type PayPasswordRow = {
  employeeUserId: string;
  payPasswordHash: string | null;
  payPasswordFailCount: number;
  payPasswordLockedAt: Date | null;
};

@Injectable()
export class FamilyPayPasswordService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  /** 支付前校验：未设置 4008 / 已冻结 4010 / 错误 4009（message 带剩余次数） */
  async verifyPayment(employeeUserId: string, pin: string | undefined): Promise<void> {
    const row = await this.loadRow(employeeUserId);
    if (!row?.payPasswordHash) {
      throw payflowError(PAYFLOW_CODE.PASSWORD_REQUIRED, PAY_PASSWORD_NOT_SET_MESSAGE);
    }
    if (row.payPasswordLockedAt) {
      throw payflowError(PAYFLOW_CODE.PASSWORD_LOCKED, PAY_PASSWORD_LOCKED_MESSAGE);
    }
    if (!pin) {
      throw payflowError(PAYFLOW_CODE.PASSWORD_REQUIRED, '请输入 6 位家庭支付密码');
    }
    if (this.verifyPin(pin, row.payPasswordHash)) {
      if (row.payPasswordFailCount > 0) await this.resetFailures(employeeUserId);
      return;
    }
    await this.recordFailure(employeeUserId, row.payPasswordFailCount);
  }

  /** 员工端设置 / 重置家庭支付密码（全家共用，可随时重设） */
  async setPassword(employeeUserId: string, pin: string): Promise<void> {
    if (!isPayPin(pin)) {
      throw new BadRequestException('支付密码须为 6 位数字');
    }
    await this.db
      .insert(employeePaySecret)
      .values({
        employeeUserId,
        payPasswordHash: this.hashPin(pin),
        payPasswordFailCount: 0,
        payPasswordLockedAt: null,
        payPasswordUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: employeePaySecret.employeeUserId,
        set: {
          payPasswordHash: this.hashPin(pin),
          payPasswordFailCount: 0,
          payPasswordLockedAt: null,
          payPasswordUpdatedAt: new Date(),
        },
      });
  }

  /** 员工端解除冻结：清零错误次数 */
  async unlock(employeeUserId: string): Promise<void> {
    const updated: Array<{ employeeUserId: string }> = await this.db
      .update(employeePaySecret)
      .set({
        payPasswordFailCount: 0,
        payPasswordLockedAt: null,
      })
      .where(eq(employeePaySecret.employeeUserId, employeeUserId))
      .returning({ employeeUserId: employeePaySecret.employeeUserId });
    if (updated.length === 0) {
      throw new NotFoundException('尚未设置家庭支付密码');
    }
  }

  /** 当前密码状态（前端展示剩余次数/冻结态） */
  async readState(employeeUserId: string): Promise<PayPasswordState> {
    const row = await this.loadRow(employeeUserId);
    return {
      hasPassword: Boolean(row?.payPasswordHash),
      locked: row ? row.payPasswordLockedAt !== null : false,
      failCount: row?.payPasswordFailCount ?? 0,
    };
  }

  hashPin(pin: string): string {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(pin, salt, 64);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  /* ---------- internal ---------- */

  private async loadRow(employeeUserId: string): Promise<PayPasswordRow | null> {
    const rows: PayPasswordRow[] = await this.db
      .select({
        employeeUserId: employeePaySecret.employeeUserId,
        payPasswordHash: employeePaySecret.payPasswordHash,
        payPasswordFailCount: employeePaySecret.payPasswordFailCount,
        payPasswordLockedAt: employeePaySecret.payPasswordLockedAt,
      })
      .from(employeePaySecret)
      .where(eq(employeePaySecret.employeeUserId, employeeUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 原子累加失败次数，达到上限即置冻结时间 */
  private async recordFailure(employeeUserId: string, previousFailCount: number): Promise<never> {
    const updated: Array<{ failCount: number }> = await this.db
      .update(employeePaySecret)
      .set({
        payPasswordFailCount: sql`${employeePaySecret.payPasswordFailCount} + 1`,
      })
      .where(eq(employeePaySecret.employeeUserId, employeeUserId))
      .returning({ failCount: employeePaySecret.payPasswordFailCount });
    const failCount = updated[0]?.failCount ?? previousFailCount + 1;
    if (failCount >= PAY_PASSWORD_MAX_FAILS) {
      await this.db
        .update(employeePaySecret)
        .set({ payPasswordLockedAt: new Date() })
        .where(
          and(
            eq(employeePaySecret.employeeUserId, employeeUserId),
            isNull(employeePaySecret.payPasswordLockedAt),
          ),
        );
      throw payflowError(PAYFLOW_CODE.PASSWORD_LOCKED, PAY_PASSWORD_LOCKED_MESSAGE);
    }
    const remaining = PAY_PASSWORD_MAX_FAILS - failCount;
    throw payflowError(PAYFLOW_CODE.PASSWORD_INVALID, `支付密码错误，还可尝试 ${remaining} 次`);
  }

  private async resetFailures(employeeUserId: string): Promise<void> {
    await this.db
      .update(employeePaySecret)
      .set({ payPasswordFailCount: 0, payPasswordLockedAt: null })
      .where(eq(employeePaySecret.employeeUserId, employeeUserId));
  }

  private verifyPin(pin: string, stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length === 0) return false;
    const derived = crypto.scryptSync(pin, salt, expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(expected, derived);
  }
}