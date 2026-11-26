/** Thống kê ẩn danh: không IP, không ảnh, không cookie quảng cáo. Gửi gộp bằng sendBeacon. */
type Ev = { t: string; id?: string };
const queue: Ev[] = [];
let timer: number | null = null;

function device(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 50), device: device() });
  try {
    const ok = navigator.sendBeacon?.('/api/stats', new Blob([body], { type: 'application/json' }));
    if (!ok) fetch('/api/stats', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch { /* offline */ }
}

export function track(t: 'visit' | 'image' | 'preset' | 'lut' | 'export' | 'share' | 'install' | 'error', id?: string) {
  if (import.meta.env.MODE === 'test') return;
  queue.push({ t, id: id?.slice(0, 48) });
  if (timer == null) timer = window.setTimeout(flush, 4000);
}

export function trackVisit() {
  try {
    if (sessionStorage.getItem('nps_v')) return;
    sessionStorage.setItem('nps_v', '1');
  } catch { /* ignore */ }
  const src = new URLSearchParams(location.search).get('utm_source');
  track('visit', src ? 'src:' + src.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) : undefined);
}

addEventListener('pagehide', flush);
