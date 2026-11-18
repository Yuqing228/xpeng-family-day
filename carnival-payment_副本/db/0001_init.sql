-- 家年华支付 · 数据库初始化（对应 openspec change jianianhua-payment-miaoda-app 任务 1.2）
-- 7 个业务对象 + app_config（D8 活动窗口/策略配置）+ mock_card_account（乐牛 mock 联调，任务 5.1）
BEGIN;

-- 1. 员工工卡映射：飞书/妙搭 userId ↔ 乐牛工卡 UID ↔ 花名册姓名（design D2）
CREATE TABLE employee_card_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miaoda_user_id varchar(64) NOT NULL,
  card_uid varchar(32) NOT NULL,
  employee_name varchar(64) NOT NULL,
  enrolled boolean NOT NULL DEFAULT false,
  registered_at timestamptz,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT employee_card_map_miaoda_user_id_uk UNIQUE (miaoda_user_id),
  CONSTRAINT employee_card_map_card_uid_uk UNIQUE (card_uid)
);

-- 2. 家庭身份：员工创建的家人身份与专属链接 token（上限 6 由配置控制）
CREATE TABLE family_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid varchar(32) NOT NULL,
  display_name varchar(32) NOT NULL,
  relation varchar(16) NOT NULL,
  link_token varchar(64) NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'active',
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT family_identity_link_token_uk UNIQUE (link_token)
);
CREATE INDEX family_identity_card_uid_idx ON family_identity (card_uid);

-- 3. 摊位口令：4 位口令 = 摊位映射（后台预设）
CREATE TABLE stall_pin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin varchar(4) NOT NULL,
  stall_no varchar(8) NOT NULL,
  stall_name varchar(64) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT stall_pin_pin_uk UNIQUE (pin)
);

-- 4. 摊主绑定：飞书账号 ↔ 口令 ↔ 摊位（换班多对一）
CREATE TABLE merchant_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miaoda_user_id varchar(64) NOT NULL,
  pin varchar(4) NOT NULL,
  stall_no varchar(8) NOT NULL,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT merchant_binding_user_pin_uk UNIQUE (miaoda_user_id, pin)
);
CREATE INDEX merchant_binding_user_idx ON merchant_binding (miaoda_user_id);

-- 5. 消费流水台账：唯一事实源，只追加不删除（specs/ledger-settlement 14 字段口径）
CREATE TABLE transaction_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no varchar(32) NOT NULL,
  txn_time timestamptz NOT NULL,
  card_uid varchar(32) NOT NULL,
  employee_name varchar(64) NOT NULL,
  payer_identity varchar(32) NOT NULL,
  stall_pin varchar(4) NOT NULL,
  stall_name varchar(64) NOT NULL,
  operator_name varchar(128) NOT NULL,
  operator_type varchar(16) NOT NULL DEFAULT 'merchant',
  amount numeric(10,2) NOT NULL,
  balance_after numeric(10,2),
  status varchar(16) NOT NULL,
  related_txn_no varchar(32),
  channel varchar(16) NOT NULL DEFAULT 'scan',
  remark varchar(255),
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT transaction_ledger_txn_no_uk UNIQUE (txn_no)
);
CREATE INDEX transaction_ledger_card_uid_idx ON transaction_ledger (card_uid);
CREATE INDEX transaction_ledger_stall_pin_idx ON transaction_ledger (stall_pin);
CREATE INDEX transaction_ledger_txn_time_idx ON transaction_ledger (txn_time);
CREATE INDEX transaction_ledger_related_txn_idx ON transaction_ledger (related_txn_no);

-- 6. UID 队列：同工卡串行排队观测（design D5，advisory lock 做串行、此表记位次）
CREATE TABLE uid_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid varchar(32) NOT NULL,
  request_id varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'waiting',
  queue_position integer,
  wait_ms integer,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT uid_queue_request_id_uk UNIQUE (request_id)
);
CREATE INDEX uid_queue_card_status_idx ON uid_queue (card_uid, status);

-- 7. 管理员白名单：管理员后台访问控制
CREATE TABLE admin_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miaoda_user_id varchar(64) NOT NULL,
  display_name varchar(64) NOT NULL,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT admin_whitelist_user_uk UNIQUE (miaoda_user_id)
);

-- 8. 应用配置：活动时间窗口（D8）、二维码策略、抽成比例、家人上限、乐牛模式
CREATE TABLE app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key varchar(64) NOT NULL,
  config_value text NOT NULL,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT app_config_key_uk UNIQUE (config_key)
);

-- 9. 乐牛 mock 账户：mock 模式下模拟工卡余额（真实模式切换 LENIU_MODE=http 走 HttpForwarder）
CREATE TABLE mock_card_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_uid varchar(32) NOT NULL,
  employee_name varchar(64) NOT NULL,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile,
  CONSTRAINT mock_card_account_card_uid_uk UNIQUE (card_uid)
);

COMMIT;
