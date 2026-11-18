// 到账语音播报：iOS/桌面走设备 TTS（解锁手势内探测试音通过后启用）；
// 安卓 WebView 无系统 TTS 引擎，走 WebAudio 预置片段拼接（decoded buffer 串行播放），
// 复用解锁手势内 resume 的 AudioContext，规避非手势 media element 播放被自动播放策略拒绝。
import { logger } from '@lark-apaas/client-toolkit/logger';

const AUDIO_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';
const CLIP_BASE = `${AUDIO_BASE_PATH.endsWith('/') ? AUDIO_BASE_PATH : `${AUDIO_BASE_PATH}/`}audio/jnh`;

/** 解锁后共享的音频上下文（WebAudio 片段与 beep 兜底共用，勿每次新建） */
let unlockedCtx: AudioContext | null = null;

/** TTS 可用性：null=未探测（按不可用处理），true=试音通过（iOS/桌面），false=设备无 TTS（安卓 WebView） */
let ttsUsable: boolean | null = null;

/** 片段播报串行队列：多笔到账依次播不重叠 */
let clipChain: Promise<void> = Promise.resolve();

/** 已解码片段缓存：url → AudioBuffer */
const clipBuffers = new Map<string, AudioBuffer>();

function runningCtx(): AudioContext | null {
  return unlockedCtx && unlockedCtx.state === 'running' ? unlockedCtx : null;
}

/** 等待 AudioContext resume 完成（手势内 resume 是异步的，限时防挂起） */
function waitCtxRunning(ctx: AudioContext, timeoutMs: number): Promise<void> {
  if (ctx.state === 'running') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      ctx.removeEventListener('statechange', onChange);
    };
    const onChange = () => {
      if (ctx.state === 'running') {
        cleanup();
        resolve();
      }
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`audio context state ${ctx.state}`));
    }, timeoutMs);
    ctx.addEventListener('statechange', onChange);
  });
}

/** 拉取并解码片段（首次后走缓存） */
async function loadClipBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = clipBuffers.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} http ${res.status}`);
  const raw = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(raw);
  clipBuffers.set(url, buf);
  return buf;
}

/** WebAudio 播放单个已解码片段，onended 即完成 */
function playClipBuffer(ctx: AudioContext, buf: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => resolve();
    src.start();
  });
}

/** WebAudio 片段串行链：ctx 未 running / 拉取 / 解码失败抛错由调用方兜底 */
async function playClipsWebAudio(urls: string[]): Promise<void> {
  const ctx = runningCtx();
  if (!ctx) throw new Error('audio context not running');
  for (const url of urls) {
    const buf = await loadClipBuffer(ctx, url);
    await playClipBuffer(ctx, buf);
  }
}

/** 手势内预播一个静音片段，解锁媒体自动播放（HTMLAudio 兜底路径依赖） */
function primeSilentClip(): void {
  try {
    const a = new Audio(`${CLIP_BASE}/0.wav`);
    a.volume = 0;
    void a.play().catch(() => undefined);
  } catch {
    // 尽力解锁，失败不阻塞
  }
}

/** HTMLAudio 提示音：开启语音加载失败时的兜底（手势内实锤可响） */
function playConfirmationBeep(): void {
  try {
    const a = new Audio(`${CLIP_BASE}/beep.wav`);
    void a.play().catch(() => undefined);
  } catch {
    // 静默
  }
}

/** TTS 不可用时的开启确认：播预生成语音「到账提醒已开启」，失败回退提示音 */
function playOpenedAnnounce(): void {
  const ctx = unlockedCtx;
  if (!ctx) {
    playConfirmationBeep();
    return;
  }
  void (async () => {
    await waitCtxRunning(ctx, 1000);
    const buf = await loadClipBuffer(ctx, `${CLIP_BASE}/opened-v2.wav`);
    await playClipBuffer(ctx, buf);
  })().catch((err: unknown) => {
    logger.error('开启确认语音播放失败，回退提示音', err);
    playConfirmationBeep();
  });
}

/** TTS 探测：手势内试音，1.5s 内未真正开始播即判设备不可用，改播预生成开启语音 */
function probeTts(): void {
  if (!('speechSynthesis' in window)) {
    ttsUsable = false;
    playOpenedAnnounce();
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance('到账提醒已开启');
    u.lang = 'zh-CN';
    let started: boolean = false;
    u.onstart = () => {
      started = true;
      ttsUsable = true;
    };
    u.onerror = () => {
      ttsUsable = false;
      playOpenedAnnounce();
    };
    speechSynthesis.speak(u);
    setTimeout(() => {
      if (started) return;
      speechSynthesis.cancel();
      ttsUsable = false;
      playOpenedAnnounce();
    }, 1500);
  } catch {
    ttsUsable = false;
    playOpenedAnnounce();
  }
}

/** 解锁音频：用户首次交互调用（resume 上下文 + 静音预播 + TTS 探测试音） */
export function unlockArrivalAudio(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx && !unlockedCtx) {
      unlockedCtx = new AudioCtx();
      void unlockedCtx.resume().catch((err: unknown) => {
        logger.error('audio context resume 失败', err);
      });
    }
    primeSilentClip();
    probeTts();
  } catch {
    logger.error('解锁到账音频上下文失败');
  }
}

/** 到账提醒开关持久化：摊主端刷新/重进保持上次设置 */
const ARRIVAL_SOUND_KEY = 'jnh_arrival_sound_on';

export function readArrivalSoundOn(): boolean {
  try {
    return localStorage.getItem(ARRIVAL_SOUND_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeArrivalSoundOn(on: boolean): void {
  try {
    localStorage.setItem(ARRIVAL_SOUND_KEY, on ? 'true' : 'false');
  } catch {
    // localStorage 不可用时静默降级，仅当次会话有效
  }
}

let arrivalRelockArmed = false;

/** 刷新恢复为开启时，摊主首次触摸页面重新解锁音频（浏览器自动播放策略要求用户手势） */
export function relockArrivalAudioWhenReady(): void {
  if (arrivalRelockArmed) return;
  arrivalRelockArmed = true;
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock);
    unlockArrivalAudio();
  };
  window.addEventListener('pointerdown', unlock);
}

/** 金额 → 播报片段序列（逐位读：15.50 → 一 五 点 五 零 元） */
function amountClips(amount: number): string[] {
  const [intPart, decPart] = amount.toFixed(2).split('.');
  const clips: string[] = [];
  for (const ch of intPart) clips.push(`${CLIP_BASE}/${ch}.wav`);
  if (decPart !== '00') {
    clips.push(`${CLIP_BASE}/dot.wav`);
    for (const ch of decPart) clips.push(`${CLIP_BASE}/${ch}.wav`);
  }
  clips.push(`${CLIP_BASE}/yuan.wav`);
  return clips;
}

function beep(): void {
  try {
    const ctx = unlockedCtx;
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
    }, 220);
  } catch {
    // 静默
  }
}

/** 播报到账：「家年华到账 xx 元」 */
export async function speakArrival(amount: number): Promise<void> {
  // 1 级：设备 TTS（仅探测试音通过的设备；安卓 WebView 无系统 TTS 引擎恒走片段）
  if (ttsUsable === true) {
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(`家年华到账 ${amount.toFixed(2)} 元`);
        u.lang = 'zh-CN';
        u.rate = 1;
        speechSynthesis.speak(u);
        return;
      }
    } catch (err) {
      logger.warn('TTS 播报异常，转片段链', err);
    }
  }
  // 2 级：WebAudio 预置片段拼接（家年华到账 + 数字逐位 + 元），串行排队防多笔重叠；链异常时 beep 兜底
  const clips: string[] = [`${CLIP_BASE}/phrase.wav`, ...amountClips(amount)];
  clipChain = clipChain
    .then(() => playClipsWebAudio(clips))
    .catch((err: unknown) => {
      logger.error('到账片段播报失败，beep 兜底', err);
      beep();
    });
  await clipChain;
}
