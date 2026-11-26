import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from './api';
import { toast } from '../../ui/toast';
import { DEFAULT_CONFIG, type AppConfig } from '../../lib/config';
import { PRESETS } from '../../presets/presets';
import { PresetIcon } from '../../ui/icons';
import { FONTS } from '../watermark/watermark';
import { Switch } from '../../ui/Modal';

function useCfg() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => { api<{ config: Partial<AppConfig> }>('/api/admin/config').then((j) => setCfg({ ...DEFAULT_CONFIG, ...j.config })).catch(() => setCfg(DEFAULT_CONFIG)); }, []);
  const save = async (c: AppConfig) => {
    try { const j = await api<{ config: AppConfig }>('/api/admin/config', { method: 'PUT', body: c }); setCfg(j.config); toast('Đã lưu'); }
    catch (e) { toast((e as Error).message, 'err'); }
  };
  return [cfg, setCfg, save] as const;
}

export function PresetTab() {
  const [cfg, setCfg, save] = useCfg();
  if (!cfg) return <p className="muted">Đang tải…</p>;
  return (
    <div className="stack">
      <p className="muted">Bật/tắt preset hiển thị cho người dùng và đánh dấu <Star size={16} /> preset nổi bật (hiện lên đầu). Thông số preset nằm trong <code>src/presets/presets.json</code>.</p>
      <div className="list">
        {PRESETS.map((p) => {
          const on = !cfg.disabledPresets.includes(p.id);
          const feat = cfg.featuredPresets.includes(p.id);
          return (
            <div key={p.id} className="list-item">
              <span className={`sq ${p.color}`} style={{ width: 32, height: 32 }}><PresetIcon name={p.icon} size={18} /></span>
              <div className="grow"><b>{p.name}</b><div className="muted small">{p.desc} · mặc định {p.strength}%</div></div>
              <button className={'icon-btn' + (feat ? ' on' : '')} aria-label="Nổi bật" onClick={() => setCfg({ ...cfg, featuredPresets: feat ? cfg.featuredPresets.filter((x) => x !== p.id) : [...cfg.featuredPresets, p.id] })}><Star size={20} fill={feat ? 'currentColor' : 'none'} /></button>
              <Switch label={`Bật ${p.name}`} checked={on} onChange={(v) => setCfg({ ...cfg, disabledPresets: v ? cfg.disabledPresets.filter((x) => x !== p.id) : [...cfg.disabledPresets, p.id] })} />
            </div>
          );
        })}
      </div>
      <button className="btn primary lg" onClick={() => save(cfg)}>Lưu thay đổi</button>
    </div>
  );
}

export function ConfigTab() {
  const [cfg, setCfg, save] = useCfg();
  if (!cfg) return <p className="muted">Đang tải…</p>;
  const f = (k: keyof AppConfig, label: string, max = 40) => (
    <label className="field"><span>{label}</span><input className="input" maxLength={max} value={String(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>
  );
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      {f('appName', 'Tên app')}
      {f('author', 'Tác giả (hiện dưới logo)')}
      {f('phone', 'Phone / Zalo liên hệ', 20)}
      {f('footer', 'Nội dung thêm ở chân trang', 200)}
      <label className="field"><span>Màu nhấn</span><input type="color" className="color" value={cfg.accent} onChange={(e) => setCfg({ ...cfg, accent: e.target.value })} /></label>
      <div className="field">
        <span>Font watermark cho người dùng (bỏ trống = tất cả)</span>
        <div className="row wrap">
          {FONTS.map((x) => (
            <label key={x.family} className="chip" style={{ fontFamily: x.family, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.wmFonts.includes(x.family)} onChange={(e) => setCfg({ ...cfg, wmFonts: e.target.checked ? [...cfg.wmFonts, x.family] : cfg.wmFonts.filter((y) => y !== x.family) })} /> {x.label}
            </label>
          ))}
        </div>
      </div>
      <button className="btn primary lg" onClick={() => save(cfg)}>Lưu cấu hình</button>
    </div>
  );
}
