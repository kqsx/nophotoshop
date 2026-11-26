import { useEffect, useState } from 'react';
import { ShieldCheck, ChartColumn, Palette, Sparkles, Settings, Trash2, ScrollText, LogOut, HardDrive } from 'lucide-react';
import { api, ApiError } from './api';
import { StatsTab } from './StatsTab';
import { LutTab } from './LutTab';
import { CleanupTab } from './CleanupTab';
import { PresetTab, ConfigTab } from './ConfigTab';
import { AuditTab, UsageTab } from './AuditTab';
import { Logo } from '../home/TopBar';
import { toast } from '../../ui/toast';

type T = 'stats' | 'luts' | 'presets' | 'config' | 'cleanup' | 'usage' | 'audit';
const TABS: { id: T; label: string; icon: typeof ChartColumn; color: string }[] = [
  { id: 'stats', label: 'Thống kê', icon: ChartColumn, color: 'blue' },
  { id: 'luts', label: 'LUT & preset Lightroom', icon: Palette, color: 'purple' },
  { id: 'presets', label: 'Preset 1 chạm', icon: Sparkles, color: 'pink' },
  { id: 'config', label: 'Cấu hình app', icon: Settings, color: 'gray' },
  { id: 'cleanup', label: 'Dọn dữ liệu', icon: Trash2, color: 'red' },
  { id: 'usage', label: 'Dung lượng', icon: HardDrive, color: 'green' },
  { id: 'audit', label: 'Nhật ký admin', icon: ScrollText, color: 'orange' },
];

export default function Admin() {
  const [state, setState] = useState<{ authed: boolean; totp: boolean; store: string } | null>(null);
  const [tab, setTab] = useState<T>('stats');
  const refresh = () => api<{ authed: boolean; totp: boolean; store: string }>('/api/auth/login').then(setState).catch(() => setState({ authed: false, totp: false, store: '?' }));
  useEffect(() => {
    document.title = 'Admin · NoPhotoShop';
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    refresh();
  }, []);
  if (!state) return <div className="center-page">Đang kiểm tra phiên…</div>;
  if (!state.authed) return <Login totp={state.totp} onDone={refresh} />;
  return (
    <div className="admin">
      <aside className="admin-nav glass">
        <div className="brand" style={{ padding: '6px 8px 14px' }}><Logo /><span><b>Admin</b><small>NoPhotoShop</small></span></div>
        {TABS.map((t) => (
          <button key={t.id} className={'admin-link' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <span className={`sq ${t.color}`} style={{ width: 30, height: 30 }}><t.icon size={18} strokeWidth={1.75} /></span>{t.label}
          </button>
        ))}
        <div className="grow" />
        {state.store === 'memory' && <div className="warn small">Chưa cấu hình KV/Redis: dữ liệu chỉ lưu tạm{location.hostname === 'localhost' ? ' (file .data khi chạy local)' : ''}.</div>}
        <button className="admin-link" onClick={async () => { await api('/api/auth/login', { method: 'DELETE' }); refresh(); }}>
          <span className="sq gray" style={{ width: 30, height: 30 }}><LogOut size={18} /></span>Đăng xuất
        </button>
      </aside>
      <main className="admin-main">
        <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
        {tab === 'stats' && <StatsTab />}
        {tab === 'luts' && <LutTab />}
        {tab === 'presets' && <PresetTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'cleanup' && <CleanupTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  );
}

function Login({ totp, onDone }: { totp: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="center-page">
      <form
        className="glass card login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr('');
          try { await api('/api/auth/login', { method: 'POST', body: { password: pw, code } }); toast('Đã đăng nhập'); onDone(); }
          catch (er) { setErr(er instanceof ApiError ? er.message : 'Lỗi kết nối'); }
          finally { setBusy(false); }
        }}
      >
        <span className="sq blue" style={{ width: 60, height: 60, margin: '0 auto' }}><ShieldCheck size={34} strokeWidth={1.75} /></span>
        <h1 style={{ textAlign: 'center', fontSize: 28 }}>Admin NoPhotoShop</h1>
        <label className="field"><span>Mật khẩu</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus /></label>
        {totp && <label className="field"><span>Mã 2FA (6 số)</span><input className="input" inputMode="numeric" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required /></label>}
        {err && <div className="warn">{err}</div>}
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Đang kiểm tra…' : 'Đăng nhập'}</button>
        <p className="muted small" style={{ textAlign: 'center' }}>Nhập sai 5 lần sẽ bị khóa 15 phút. Phiên hết hạn sau 12 giờ.</p>
      </form>
    </div>
  );
}
