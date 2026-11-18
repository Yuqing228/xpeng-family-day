// 共享扫一扫组件（C 扫 B）：相机 + 相册识别（jsQR 逻辑沿用，扫码结果回调）
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import jsQR from 'jsqr';

export function ScanCamera({
  onResult,
  onClose,
  title,
  hint,
  parse,
}: {
  onResult: (raw: string) => void;
  onClose: () => void;
  title: string;
  hint?: string;
  /** 扫码内容校验/解析：返回 null 表示不是目标码 */
  parse: (content: string) => string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [cameraState, setCameraState] = useState<'starting' | 'running' | 'denied'>('starting');
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const tick = () => {
      if (stopped.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            const code = jsQR(data.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              const parsed = parse(code.data);
              if (parsed) {
                stream?.getTracks().forEach((t) => t.stop());
                onResult(parsed);
                return;
              }
              toast.error('这不是有效的目标码，请对准摊位收款码');
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped.current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          void video.play().then(() => setCameraState('running'));
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setCameraState('denied'));
    return () => {
      stopped.current = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const parsed = code?.data ? parse(code.data) : null;
      if (parsed) onResult(parsed);
      else toast.error('未能识别出目标码，请重试');
    };
    img.src = url;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--jnh-inverse)] text-white">
      <div className="flex items-center justify-between border-b border-[var(--jnh-inverse-2)] px-4 py-3">
        <button
          onClick={onClose}
          aria-label="关闭扫码"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X size={20} strokeWidth={2} />
        </button>
        <span className="t-body font-semibold">{title}</span>
        <span className="w-10" />
      </div>
      <div className="relative mx-4 mt-4 aspect-square overflow-hidden rounded-[14px] bg-[var(--jnh-inverse-2)]">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {(['c-tl', 'c-tr', 'c-bl', 'c-br'] as const).map((c) => (
          <span key={c} className={`vf absolute h-5 w-5 border-[2.5px] border-[var(--jnh-primary)] ${c}`} />
        ))}
        <span
          className="jnh-laser absolute left-5 right-5 h-[2px] rounded-full"
          style={{ background: 'linear-gradient(90deg,transparent,var(--jnh-primary),transparent)' }}
        />
        {cameraState === 'denied' && (
          <div className="t-caption absolute inset-0 flex items-center justify-center px-8 text-center text-white/80">
            相机不可用（未授权或环境不支持）
            <br />
            请使用下方「从相册识别」
          </div>
        )}
        {hint && cameraState === 'running' && (
          <div className="t-caption absolute inset-x-0 bottom-3 text-center text-white/80">{hint}</div>
        )}
      </div>
      <div className="mt-4 px-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="t-body w-full rounded-full border border-[var(--jnh-inverse-2)] bg-[var(--jnh-inverse-2)] py-3.5 font-semibold text-white active:opacity-80"
        >
          从相册识别
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
