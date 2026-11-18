// 支付链路常量：单笔上限写死，不读取 pay_amount_limit_yuan（避免配置空值导致上限失效）
export const PAY_AMOUNT_LIMIT_FEN = 50_000;

/** 金额格式：最多 9 位整数、最多 2 位小数（允许 0，供 0 元回归） */
export const PAY_AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

export const PAY_AMOUNT_LIMIT_YUAN = 500;

/** pay/device 单次请求硬超时 */
export const PAY_TIMEOUT_MS = 5_000;

/** 预检查单命中已有成功单时的提示 */
export const PRE_CHECK_SUCCESS_NOTE = '上笔已成功';

/** 查单轮询参数：payState=2（处理中）时等待再查 */
export const ORDER_STATE_POLL_INTERVAL_MS = 1_500;
export const ORDER_STATE_POLL_MAX_ROUNDS = 3;

/** 验签层未落账时的原单号重发上限 */
export const PAY_RETRY_MAX_ATTEMPTS = 2;
