// 6 位数字支付密码：随机生成（规避弱口令）与弱口令判定

const KNOWN_WEAK_PINS = new Set(['123456', '654321', '000000', '111111', '666666', '888888']);

const isSequential = (pin: string): boolean => {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i += 1) {
    const prev = pin.charCodeAt(i - 1);
    const cur = pin.charCodeAt(i);
    if (cur - prev !== 1) ascending = false;
    if (prev - cur !== 1) descending = false;
  }
  return ascending || descending;
};

export const isWeakPin = (pin: string): boolean => {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if (KNOWN_WEAK_PINS.has(pin)) return true;
  return isSequential(pin);
};

export const generatePayPin = (): string => {
  while (true) {
    const buffer = new Uint32Array(1);
    window.crypto.getRandomValues(buffer);
    const pin: string = String(buffer[0] % 1_000_000).padStart(6, '0');
    if (!isWeakPin(pin)) return pin;
  }
};
