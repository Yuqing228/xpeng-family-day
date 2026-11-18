// ---- plugin:payment_reminder_speech_synthesis_1 ----
// ============================================================
// 插件 payment_reminder_speech_synthesis_1 (到账提醒开启确认语音合成) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export type PaymentReminderSpeechSynthesisOneInput = {

};

/**
 * capabilityClient.load('payment_reminder_speech_synthesis_1').call<PaymentReminderSpeechSynthesisOneOutput>('speechSynthesis', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { audioUrl } = result;
 * 返回值形如：
 *   {"audioUrl":"示例文本"}
 */
export type PaymentReminderSpeechSynthesisOneOutput = {
  audioUrl: string;
};
// ---- end:payment_reminder_speech_synthesis_1 ----

// ---- plugin:xiaopeng_stall_info_bitable_update_1 ----
// ============================================================
// 插件 xiaopeng_stall_info_bitable_update_1 (小鹏摊主信息多维表更新) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export type XiaopengStallInfoBitableUpdateOneInput = {
  records: {
    record: {
      '摊主口令'?: unknown;
      '摊主收款码'?: string[];
      'Base 表记录 ID'?: unknown;
      '摊主名称'?: unknown;
      '摊主编码'?: unknown;
    };
    id: string;
  }[];
};

/**
 * const input: XiaopengStallInfoBitableUpdateOneInput = { records };
 * capabilityClient.load('xiaopeng_stall_info_bitable_update_1').call<XiaopengStallInfoBitableUpdateOneOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 * 返回值形如：
 *   {"records":[{"id":"示例文本"}]}
 */
export type XiaopengStallInfoBitableUpdateOneOutput = {
  records: {
    id: string;
  }[];
};
// ---- end:xiaopeng_stall_info_bitable_update_1 ----

// ---- plugin:siqing_carnival_payment_welcome_message_1 ----
// ============================================================
// 插件 siqing_carnival_payment_welcome_message_1 (司庆家年华支付系统登录欢迎消息) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export type SiqingCarnivalPaymentWelcomeMessageOneInput = {
  /** 员工端页面深链 URL，服务端拼接后传入 */
  employeeUrl: string;
  /** 收件人用户 ID 列表，运行时传入单个员工 */
  receiverIds: string[];
};

/**
 * const input: SiqingCarnivalPaymentWelcomeMessageOneInput = { employeeUrl, receiverIds };
 * capabilityClient.load('siqing_carnival_payment_welcome_message_1').call<SiqingCarnivalPaymentWelcomeMessageOneOutput>('send_feishu_message', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 * 返回值形如：
 *   {"success":false}
 */
export type SiqingCarnivalPaymentWelcomeMessageOneOutput = {
  success: boolean;
};
// ---- end:siqing_carnival_payment_welcome_message_1 ----