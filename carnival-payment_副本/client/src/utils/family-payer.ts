// 家人付款身份记忆：微信 webview localStorage 持久化最近打开的家人专属链接身份，
// 供 /pay 无 who 参数时（微信自带扫一扫直接开收款码链接）自动回填付款人
const STORAGE_KEY = 'jnh_family_payer';

export type FamilyPayer = { token: string; displayName: string };

export function saveFamilyPayer(payer: FamilyPayer) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payer));
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为无记忆，不影响主流程
  }
}

export function readFamilyPayer(): FamilyPayer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FamilyPayer;
    if (!parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFamilyPayer() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上，静默降级
  }
}
