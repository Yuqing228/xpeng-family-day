/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgSequence, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const employeePaySecretIdSeq = pgSequence("employee_pay_secret_id_seq");

export const familyIdentityIdSeq = pgSequence("family_identity_id_seq");

export const paymentLedgerIdSeq = pgSequence("payment_ledger_id_seq");

export const refundLedgerIdSeq = pgSequence("refund_ledger_id_seq");

export const stallConfigIdSeq = pgSequence("stall_config_id_seq");

export const employeePaySecret = pgTable("employee_pay_secret", {
  id: bigint("id", { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  employeeUserId: varchar("employee_user_id", { length: 64 }).notNull().unique(),
  payPasswordHash: varchar("pay_password_hash", { length: 200 }),
  payPasswordFailCount: integer("pay_password_fail_count").notNull().default(0),
  payPasswordLockedAt: customTimestamptz("pay_password_locked_at", { precision: 6 }),
  payPasswordUpdatedAt: customTimestamptz("pay_password_updated_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("employee_pay_secret_employee_user_id_uk").on(table.employeeUserId),
]);

export const leopenProbeLog = pgTable("leopen_probe_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  verdict: varchar("verdict", { length: 32 }).notNull(),
  httpStatus: integer("http_status"),
  traceId: varchar("trace_id", { length: 64 }),
  totalMs: integer("total_ms").notNull(),
  detail: text("detail").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_leopen_probe_log_created").on(table.createdAt),
]);

export const refundLedger = pgTable("refund_ledger", {
  id: bigint("id", { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  macOrdId: varchar("mac_ord_id", { length: 40 }).notNull().unique(),
  leniuOrdId: varchar("leniu_ord_id", { length: 32 }),
  passCode: varchar("pass_code", { length: 4 }).notNull(),
  custNum: varchar("cust_num", { length: 32 }).notNull(),
  amountFen: integer("amount_fen").notNull(),
  status: varchar("status", { length: 12 }).notNull().default('REGISTERED'),
  initiatedBy: varchar("initiated_by", { length: 64 }).notNull(),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  paymentLedgerId: bigint("payment_ledger_id", { mode: 'number' }).unique(),
  remark: varchar("remark", { length: 200 }),
  decidedBy: varchar("decided_by", { length: 64 }),
  decidedAt: customTimestamptz("decided_at", { precision: 6 }),
  decisionNote: varchar("decision_note", { length: 200 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("refund_ledger_mac_ord_id_uk").on(table.macOrdId),
  index("idx_refund_ledger_pass_created").on(table.passCode, table.createdAt),
  uniqueIndex("refund_ledger_payment_ledger_id_active_uk").on(table.paymentLedgerId),
]);

// Synced table: data is auto-synced from external source. Do not rename or delete this table.
export const stallConfig = pgTable("stall_config", {
  id: bigint("id", { mode: 'number' }).primaryKey().default(sql`nextval('stall_config_id_seq'::regclass)`),
  passCode: varchar("pass_code", { length: 4 }).notNull().unique().default(sql`gen_stall_pass_code()`),
  // Synced field: auto-synced, do not modify or delete
  stallName: varchar("stall_name", { length: 100 }).notNull(),
  staticToken: varchar("static_token", { length: 64 }).notNull().unique().default(sql`encode(gen_random_bytes(16), 'hex'::text)`),
  status: varchar("status", { length: 10 }).notNull().default('ACTIVE'),
  // Synced field: auto-synced, do not modify or delete
  baseRecordId: varchar("base_record_id", { length: 64 }).unique(),
  // Synced field: auto-synced, do not modify or delete
  merchantCode: varchar("merchant_code", { length: 32 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("stall_config_pass_code_uk").on(table.passCode),
  uniqueIndex("stall_config_static_token_uk").on(table.staticToken),
  uniqueIndex("stall_config_base_record_id_uk").on(table.baseRecordId),
]);

export const paymentLedger = pgTable("payment_ledger", {
  id: bigint("id", { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  passCode: varchar("pass_code", { length: 4 }).notNull(),
  custNum: varchar("cust_num", { length: 32 }).notNull(),
  miaodaUserId: varchar("miaoda_user_id", { length: 64 }).notNull(),
  familyIdentityId: bigint("family_identity_id", { mode: 'number' }),
  amountFen: integer("amount_fen").notNull(),
  status: varchar("status", { length: 10 }).notNull().default('INIT'),
  payState: integer("pay_state"),
  leniuOrdId: varchar("leniu_ord_id", { length: 32 }),
  macOrdId: varchar("mac_ord_id", { length: 40 }),
  accBal: bigint("acc_bal", { mode: 'number' }),
  failReason: varchar("fail_reason", { length: 200 }),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  paidAt: customTimestamptz("paid_at", { precision: 6 }),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_payment_ledger_user_created").on(table.miaodaUserId, table.createdAt),
  index("idx_payment_ledger_pass_created").on(table.passCode, table.createdAt),
  index("idx_payment_ledger_status").on(table.status),
]);

export const familyIdentity = pgTable("family_identity", {
  id: bigint("id", { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  employeeUserId: varchar("employee_user_id", { length: 64 }).notNull(),
  familyName: varchar("family_name", { length: 50 }).notNull(),
  relation: varchar("relation", { length: 20 }),
  shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 10 }).notNull().default('ACTIVE'),
  createdAt: customTimestamptz("created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  isSelf: boolean("is_self").notNull().default(false),
  shared: boolean("shared").notNull().default(false),
  payPasswordHash: varchar("pay_password_hash", { length: 200 }),
  payPasswordFailCount: integer("pay_password_fail_count").notNull().default(0),
  payPasswordLockedAt: customTimestamptz("pay_password_locked_at", { precision: 6 }),
  payPasswordUpdatedAt: customTimestamptz("pay_password_updated_at", { precision: 6 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("family_identity_share_token_uk").on(table.shareToken),
]);

// Synced table: data is auto-synced from external source. Do not rename or delete this table.
export const employeeCardMap = pgTable("employee_card_map", {
  miaodaUserId: varchar("miaoda_user_id", { length: 64 }).unique(),
  // Synced field: auto-synced, do not modify or delete
  employeeName: varchar("employee_name", { length: 50 }).notNull(),
  // Synced field: auto-synced, do not modify or delete
  custNum: varchar("cust_num", { length: 32 }).notNull().unique(),
  leniuCustId: varchar("leniu_cust_id", { length: 32 }),
  // Synced field: auto-synced, do not modify or delete
  baseRecordId: varchar("base_record_id", { length: 64 }).unique(),
  openId: varchar("open_id", { length: 64 }),
  welcomePushed: boolean("welcome_pushed").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("employee_card_map_cust_num_uk").on(table.custNum),
  uniqueIndex("employee_card_map_miaoda_user_id_uk").on(table.miaodaUserId),
  uniqueIndex("employee_card_map_base_record_id_uk").on(table.baseRecordId),
]);

export const appConfig = pgTable("app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  configKey: varchar("config_key", { length: 64 }).notNull().unique(),
  configValue: text("config_value").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("app_config_key_uk").on(table.configKey),
]);

export const adminWhitelist = pgTable("admin_whitelist", {
  id: uuid("id").primaryKey().defaultRandom(),
  miaodaUserId: varchar("miaoda_user_id", { length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("admin_whitelist_user_uk").on(table.miaodaUserId),
]);

export const merchantBinding = pgTable("merchant_binding", {
  id: uuid("id").primaryKey().defaultRandom(),
  miaodaUserId: varchar("miaoda_user_id", { length: 64 }).notNull(),
  pin: varchar("pin", { length: 4 }).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("merchant_binding_user_pin_uk").on(table.miaodaUserId, table.pin),
  index("merchant_binding_user_idx").on(table.miaodaUserId),
]);

// table aliases
export const adminWhitelistTable = adminWhitelist;
export const appConfigTable = appConfig;
export const employeeCardMapTable = employeeCardMap;
export const employeePaySecretTable = employeePaySecret;
export const familyIdentityTable = familyIdentity;
export const leopenProbeLogTable = leopenProbeLog;
export const merchantBindingTable = merchantBinding;
export const paymentLedgerTable = paymentLedger;
export const refundLedgerTable = refundLedger;
export const stallConfigTable = stallConfig;
