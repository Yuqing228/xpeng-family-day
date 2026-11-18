// 付款码 QR：深墨绿底 + 白色直角码区（扫码可靠性优先）
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Image } from '@client/src/components/ui/image';

function useQrSrc(url: string, size: number): string {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0C1712', light: '#FFFFFF' },
    })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [url, size]);
  return src;
}

/** 纯二维码块（白底直角，供 hero 卡内嵌用） */
export function PaymentQRImage({ url, size = 200 }: { url: string; size?: number }) {
  const src = useQrSrc(url, size);
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} width={size} height={size} alt="付款码" />
      ) : (
        <div className="skeleton" style={{ width: size, height: size }} />
      )}
    </div>
  );
}

export function PaymentQR({ url, size = 200, note }: { url: string; size?: number; note?: string }) {
  return (
    <div className="relative">
      <div className="flex flex-col items-center p-4">
        <PaymentQRImage url={url} size={size} />
        {note && <div className="t-caption mt-3 text-center text-[var(--jnh-ink-muted)]">{note}</div>}
      </div>
    </div>
  );
}

/** 链接二维码（分享页：家人可微信长按识别打开） */
export function LinkQR({ url, size = 168 }: { url: string; size?: number }) {
  return <PaymentQR url={url} size={size} note="微信「扫一扫」或长按识别，直接打开专属付款码" />;
}
