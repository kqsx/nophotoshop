import { useState } from 'react';
import { Settings, SunMoon } from 'lucide-react';
import { setTheme, useTheme } from '../../ui/theme';
import { SettingsSheet } from './SettingsSheet';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a84ff" />
          <stop offset="1" stopColor="#bf5af2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#lg)" />
      <path d="M18 46 L40 24" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 12 Q44 20 52 20 Q44 20 44 28 Q44 20 36 20 Q44 20 44 12Z" fill="#fff" />
      <circle cx="24" cy="20" r="2.6" fill="#fff" opacity=".85" />
      <circle cx="48" cy="40" r="2" fill="#fff" opacity=".7" />
    </svg>
  );
}

export function TopBar() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const next = theme === 'system' ? (document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') : theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="NoPhotoShop">
        <Logo />
        <b>NoPhotoShop</b>
      </a>
      <div className="row" style={{ gap: 4 }}>
        <button className="icon-btn" aria-label="Đổi sáng/tối" onClick={() => setTheme(next)}><SunMoon size={24} strokeWidth={1.75} /></button>
        <button className="icon-btn" aria-label="Cài đặt" onClick={() => setOpen(true)}><Settings size={24} strokeWidth={1.75} /></button>
      </div>
      {open && <SettingsSheet onClose={() => setOpen(false)} />}
    </header>
  );
}
