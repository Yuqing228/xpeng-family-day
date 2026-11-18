// 页面壳 v8「墨林」：白色吸顶导航 + 12th 矢量标记 + 固定底栏
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Info } from 'lucide-react';
import './jnh.css';
import './refined.css';

/** 品牌标识：12th 矢量标记 + 竖向发丝分隔 */
export function BrandBar() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span className="brand-mark">
        <span className="anniversary-logo-crop anniversary-logo-transparent" role="img" aria-label="12th 家年华" />
      </span>
      <span className="h-4 w-px bg-[var(--jnh-hairline)]" aria-hidden="true" />
    </div>
  );
}

export function AuroraShell({
  title,
  subtitle,
  children,
  bottom,
  pageStylePath,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  bottom?: ReactNode;
  pageStylePath?: string;
}) {
  const { pathname } = useLocation();
  return (
    <div data-page={pageStylePath ?? pathname} className="jnh-page mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
      <AppHeader title={title} subtitle={subtitle} />
      <div className={`shell-content jnh-enter flex-1 px-5 pt-5 ${bottom ? 'pb-40' : 'pb-8'}`}>{children}</div>
      {bottom && (
        <div className="shell-bottom fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[520px] px-5 pt-3 jnh-safe-bottom">
          {bottom}
        </div>
      )}
    </div>
  );
}

/** 步骤徽章：品牌绿浅底胶囊 */
export function StepBadge({ text }: { text: string }) {
  return <span className="chip chip-brand mb-2.5">{text}</span>;
}

/** 每屏至多一条说明（D10 文案减密） */
export function HintText({ children }: { children: ReactNode }) {
  return (
    <p className="note mt-3">
      <Info size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function AppHeader({title, subtitle}: {title: string; subtitle?: string}) {
  return (
      <header className="aurora-header top-0 z-10 px-5 py-3">
        <div className="flex items-center gap-3">
          <BrandBar />
          <div className="min-w-0 flex-1">
            <div className="t-title truncate text-[var(--jnh-ink)]">{title}</div>
            {subtitle && (
              <div className="t-caption mt-0.5 truncate text-[var(--jnh-ink-muted)]">{subtitle}</div>
            )}
          </div>
        </div>
      </header>
  );
}
