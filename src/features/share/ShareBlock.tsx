import { useEffect, useRef, useState } from 'react';
import { Share, Link2, QrCode, Download, Smartphone, ShieldCheck, Phone, MessageCircle } from 'lucide-react';
import { toast } from '../../ui/toast';
import { track } from '../../lib/stats';
import { isStandalone } from '../install/install';
import { InstallGuide } from '../install/InstallGuide';
import { Privacy } from './Privacy';
import { useConfig } from '../../lib/config';

// Link chia sẻ/QR luôn trỏ về tên miền chính (không phụ thuộc bản preview hay localhost)
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://nophotoshop.vercel.app').replace(/\/+$/, '');
export const appUrl = () => `${SITE_URL}/`;
const shareUrl = (src: string) => `${appUrl()}?utm_source=${src}`;

async function makeQr(size: number, dark: string, light: string): Promise<HTMLCanvasElement> {
  const QR = await import('qrcode');
  const c = document.createElement('canvas');
  await QR.toCanvas(c, shareUrl('qr'), { errorCorrectionLevel: 'H', width: size, margin: 2, color: { dark, light } });
  // logo nhỏ ở giữa (mức sửa lỗi H vẫn quét được)
  const ctx = c.getContext('2d')!;
  const s = size * 0.2, x = (size - s) / 2;
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.roundRect(x - 6, x - 6, s + 12, s + 12, s * 0.28); ctx.fill();
  const g = ctx.createLinearGradient(x, x, x + s, x + s);
  g.addColorStop(0, '#0a84ff'); g.addColorStop(1, '#bf5af2');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(x, x, s, s, s * 0.24); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, x + s * 0.7); ctx.lineTo(x + s * 0.62, x + s * 0.38); ctx.stroke();
  ctx.fillStyle = '#fff';
  const star = (cx: number, cy: number, r: number) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx, cy, cx + r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + r); ctx.quadraticCurveTo(cx, cy, cx - r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - r); ctx.fill(); };
  star(x + s * 0.7, x + s * 0.3, s * 0.13);
  return c;
}

export async function shareLink() {
  const url = shareUrl('share');
  const data = { title: 'NoPhotoShop By DucAnh', text: 'Chỉnh ảnh đẹp 1 chạm, ngay trên điện thoại — ảnh không rời máy.', url };
  track('share', 'link');
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Đã sao chép link'); } catch { toast(url, 'info'); }
}

export function ShareBlock() {
  const ref = useRef<HTMLDivElement>(null);
  const [install, setInstall] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const cfg = useConfig();
  useEffect(() => {
    let off = false;
    makeQr(200, '#1c1c1e', '#ffffff').then((c) => {
      if (off || !ref.current) return;
      c.style.width = '160px'; c.style.height = '160px'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Mã QR mở NoPhotoShop');
      ref.current.replaceChildren(c);
    });
    return () => { off = true; };
  }, []);
  const dlQr = async (fmt: 'png' | 'svg') => {
    track('share', 'qr-' + fmt);
    const a = document.createElement('a');
    if (fmt === 'png') {
      const c = await makeQr(1024, '#000000', '#ffffff');
      a.href = c.toDataURL('image/png');
    } else {
      const QR = await import('qrcode');
      const svg = await QR.toString(shareUrl('qr'), { type: 'svg', errorCorrectionLevel: 'H', margin: 2 });
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    a.download = `nophotoshop-qr.${fmt}`;
    a.click();
  };
  const u = encodeURIComponent(shareUrl('social'));
  const txt = encodeURIComponent('Chỉnh ảnh đẹp 1 chạm với NoPhotoShop');
  const copyThen = async (href: string, src: string) => {
    track('share', src);
    try { await navigator.clipboard.writeText(shareUrl(src)); toast('Đã sao chép link — dán vào khung chat'); } catch { /* ignore */ }
    window.open(href, '_blank', 'noopener');
  };
  return (
    <footer className="footer">
      <section className="share-card glass card">
        <div className="share-main">
          <div className="grow">
            <h2>Chia sẻ NoPhotoShop</h2>
            <p className="muted">Gửi cho bạn bè, khách hàng, người thân — quét QR để mở ngay.</p>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={shareLink}><Share size={22} strokeWidth={1.75} /> Chia sẻ link</button>
              <button className="btn" onClick={async () => { await navigator.clipboard.writeText(shareUrl('copy')); toast('Đã sao chép'); }}><Link2 size={22} strokeWidth={1.75} /> Sao chép</button>
            </div>
            <div className="social row wrap">
              <button className="social-btn zalo" onClick={() => copyThen('https://chat.zalo.me/', 'zalo')}>Zalo</button>
              <a className="social-btn fb" href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noopener noreferrer" onClick={() => track('share', 'facebook')}>Facebook</a>
              <a className="social-btn ms" href={`fb-messenger://share/?link=${u}`} onClick={() => track('share', 'messenger')}>Messenger</a>
              <a className="social-btn tg" href={`https://t.me/share/url?url=${u}&text=${txt}`} target="_blank" rel="noopener noreferrer" onClick={() => track('share', 'telegram')}>Telegram</a>
              <a className="social-btn x" href={`https://twitter.com/intent/tweet?url=${u}&text=${txt}`} target="_blank" rel="noopener noreferrer" onClick={() => track('share', 'x')}>X</a>
            </div>
          </div>
          <div className="qr-box">
            <div ref={ref} className="qr"><QrCode size={48} /></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => dlQr('png')}><Download size={18} /> PNG</button>
              <button className="btn sm" onClick={() => dlQr('svg')}><Download size={18} /> SVG</button>
            </div>
          </div>
        </div>
      </section>
      <nav className="footer-links" aria-label="Chân trang">
        {!isStandalone() && <button className="btn ghost" onClick={() => setInstall(true)}><Smartphone size={20} strokeWidth={1.75} /> Cài app</button>}
        <button className="btn ghost" onClick={() => setPrivacy(true)}><ShieldCheck size={20} strokeWidth={1.75} /> Quyền riêng tư</button>
        <a className="btn ghost" href={`https://zalo.me/${cfg.phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} strokeWidth={1.75} /> Zalo</a>
        <a className="btn ghost" href={`tel:${cfg.phone}`}><Phone size={20} strokeWidth={1.75} /> {cfg.phone}</a>
      </nav>
      <p className="credit">
        <b>{cfg.appName}</b> · {cfg.author} · Phone/Zalo {cfg.phone}
        {cfg.footer && <><br />{cfg.footer}</>}
        <br /><span className="muted small">Ảnh của bạn không bao giờ rời khỏi máy.</span>
      </p>
      {install && <InstallGuide onClose={() => setInstall(false)} />}
      {privacy && <Privacy onClose={() => setPrivacy(false)} />}
    </footer>
  );
}
