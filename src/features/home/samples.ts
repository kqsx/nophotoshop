/** 3 ảnh mẫu vẽ bằng code (không tốn dung lượng tải, không vướng bản quyền). */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function landscape(c: CanvasRenderingContext2D, W: number, H: number) {
  const r = rng(7);
  const sky = c.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, '#8fa7bd');
  sky.addColorStop(1, '#c9d2d6');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = r() * H * 0.3 + H * 0.05, s = 60 + r() * 120;
    c.fillStyle = 'rgba(238,238,236,0.55)';
    for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * s, y + (r() - 0.5) * s * 0.3, s * 0.6, s * 0.25, 0, 0, 7); c.fill(); }
  }
  const mt = (base: number, amp: number, col: string) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, base + Math.sin(x / 140 + amp) * 40 + Math.sin(x / 47) * 14 + (r() - 0.5) * 4);
    c.lineTo(W, H); c.fill();
  };
  mt(H * 0.5, 1, '#7d8a93'); mt(H * 0.58, 3, '#5f7062'); mt(H * 0.68, 5, '#6b7d4f');
  const fg = c.createLinearGradient(0, H * 0.7, 0, H);
  fg.addColorStop(0, '#71824a'); fg.addColorStop(1, '#4c5a32');
  c.fillStyle = fg; c.fillRect(0, H * 0.78, W, H);
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = H * 0.66 + r() * H * 0.25, s = 20 + r() * 50;
    c.fillStyle = `rgb(${60 + r() * 30},${85 + r() * 30},${40 + r() * 20})`;
    c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
  }
}

function backlit(c: CanvasRenderingContext2D, W: number, H: number) {
  const g = c.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.7, H * 0.3, W * 0.9);
  g.addColorStop(0, '#fffbe8'); g.addColorStop(0.15, '#ffe2a6'); g.addColorStop(0.5, '#e8a66e'); g.addColorStop(1, '#8b6a6a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#3a2a24';
  c.fillRect(0, H * 0.78, W, H);
  // chủ thể tối (bóng người cách điệu)
  c.fillStyle = '#4a3a33';
  c.beginPath(); c.ellipse(W * 0.38, H * 0.36, W * 0.07, H * 0.075, 0, 0, 7); c.fill();
  c.beginPath(); c.moveTo(W * 0.22, H); c.quadraticCurveTo(W * 0.24, H * 0.5, W * 0.38, H * 0.46); c.quadraticCurveTo(W * 0.52, H * 0.5, W * 0.54, H); c.fill();
  c.fillStyle = 'rgba(120,90,70,0.5)';
  c.beginPath(); c.ellipse(W * 0.4, H * 0.62, W * 0.06, H * 0.08, 0, 0, 7); c.fill();
}

function night(c: CanvasRenderingContext2D, W: number, H: number) {
  const r = rng(3);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b0f1f'); g.addColorStop(1, '#1e1a22');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const w = 40 + r() * 110, h = H * (0.25 + r() * 0.5), x = (i / 26) * W + (r() - 0.5) * 30;
    c.fillStyle = `rgb(${18 + r() * 14},${18 + r() * 14},${26 + r() * 18})`;
    c.fillRect(x, H - h, w, h);
    for (let k = 0; k < 40; k++) {
      if (r() > 0.45) continue;
      c.fillStyle = r() > 0.5 ? 'rgba(255,205,120,0.85)' : 'rgba(170,200,255,0.7)';
      c.fillRect(x + 6 + r() * (w - 14), H - h + 10 + r() * (h - 20), 6, 8);
    }
  }
  const id = c.getImageData(0, 0, W, H);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
  }
  c.putImageData(id, 0, 0);
}

export const SAMPLES = [
  { id: 'landscape', label: 'Phong cảnh', draw: landscape, w: 1800, h: 1200 },
  { id: 'backlit', label: 'Ngược sáng', draw: backlit, w: 1200, h: 1600 },
  { id: 'night', label: 'Ban đêm', draw: night, w: 1800, h: 1200 },
];

export async function sampleFile(id: string): Promise<File> {
  const s = SAMPLES.find((x) => x.id === id)!;
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  s.draw(c.getContext('2d')!, s.w, s.h);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.92));
  return new File([blob], `mau-${s.id}.jpg`, { type: 'image/jpeg' });
}

export function sampleThumb(id: string): string {
  const s = SAMPLES.find((x) => x.id === id)!;
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  s.draw(c.getContext('2d')!, s.w, s.h);
  const t = document.createElement('canvas');
  const k = 240 / Math.max(s.w, s.h);
  t.width = Math.round(s.w * k); t.height = Math.round(s.h * k);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.8);
}
