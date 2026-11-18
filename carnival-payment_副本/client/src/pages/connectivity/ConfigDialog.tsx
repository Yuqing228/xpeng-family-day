// LEOPEN 凭证配置：仅在平台环境变量（appid/appsecret）缺失时作为兜底录入（管理员）
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@client/src/components/ui/dialog';
import { Input } from '@client/src/components/ui/input';
import { apiLeopen } from '@client/src/api';

export function ConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [appid, setAppid] = useState('');
  const [appsecret, setAppsecret] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!appid.trim() || !appsecret.trim()) {
      toast.error('appid 与 appsecret 均需填写');
      return;
    }
    setSaving(true);
    try {
      await apiLeopen.updateConfig({ appid: appid.trim(), appsecret: appsecret.trim() });
      toast.success('配置已保存');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '保存失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card jnh-card-lg max-w-[360px] p-5">
        <DialogHeader>
          <DialogTitle className="t-title text-[var(--jnh-ink)]">接口凭证配置</DialogTitle>
        </DialogHeader>
        <p className="t-caption leading-relaxed text-[var(--jnh-ink-muted)]">
          探测优先读取平台环境变量 appid / appsecret；两者缺失时才使用此处录入的兜底配置。仅管理员可保存。
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 t-caption tracking-[0.32px] text-[var(--jnh-ink-muted)]">appid</div>
            <Input value={appid} onChange={(e) => setAppid(e.target.value)} placeholder="如 629230940945653760" />
          </div>
          <div>
            <div className="mb-1 t-caption tracking-[0.32px] text-[var(--jnh-ink-muted)]">appsecret</div>
            <Input
              type="password"
              value={appsecret}
              onChange={(e) => setAppsecret(e.target.value)}
              placeholder="乐牛开放平台密钥"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="jnh-btn-primary w-full border border-transparent px-4 py-3 t-body disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
