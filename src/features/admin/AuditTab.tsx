import { useEffect, useState } from 'react';
import { api, fmtBytes } from './api';

interface Entry { at: string; action: string; detail: unknown; who: string }
const LABEL: Record<string, string> = {
  login: 'Đăng nhập', 'login-fail': 'Đăng nhập sai', 'lut-upload': 'Tải LUT', 'lut-delete': 'Xóa LUT', 'lut-edit': 'Sửa LUT', 'lut-reorder': 'Sắp xếp LUT',
  'delete-soft': 'Xóa (thùng rác)', 'delete-permanent': 'Xóa vĩnh viễn', restore: 'Khôi phục', purge: 'Dọn thùng rác', backup: 'Sao lưu', config: 'Sửa cấu hình',
  retention: 'Sửa chính sách giữ', 'auto-cleanup': 'Cron tự dọn', 'auto-cleanup-manual': 'Chạy dọn tự động', 'cleanup-bad-password': 'Sai mật khẩu khi xóa',
};

export function AuditTab() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => { api<{ entries: Entry[] }>('/api/admin/cleanup?audit=1').then((j) => setRows(j.entries)).catch(() => setRows([])); }, []);
  if (!rows) return <p className="muted">Đang tải…</p>;
  return (
    <div className="stack">
      <p className="muted small">Ghi lại ai, lúc nào, làm gì. Nhật ký này tự xóa sau 12 tháng (đổi trong Dọn dữ liệu).</p>
      <div className="list">
        {!rows.length && <div className="list-item muted">Chưa có thao tác</div>}
        {rows.map((r, i) => (
          <div key={i} className="list-item">
            <div className="grow"><b>{LABEL[r.action] ?? r.action}</b> <span className="muted small">· {r.who}</span>
              {r.detail != null && <div className="muted small mono">{JSON.stringify(r.detail).slice(0, 160)}</div>}
            </div>
            <span className="muted small">{new Date(r.at).toLocaleString('vi-VN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsageTab() {
  const [u, setU] = useState<{ store: string; rows: { label: string; keys: number; bytes: number }[]; used: number; limit: number } | null>(null);
  useEffect(() => { api<typeof u & object>('/api/admin/cleanup?usage=1').then(setU).catch(() => {}); }, []);
  if (!u) return <p className="muted">Đang đo…</p>;
  const pct = Math.min(100, (u.used / u.limit) * 100);
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="glass card stack">
        <div className="row between"><b>Đã dùng {fmtBytes(u.used)} / {fmtBytes(u.limit)}</b><span className="muted small">{u.store === 'redis' ? 'Vercel KV / Upstash' : 'Bộ nhớ tạm'}</span></div>
        <div className="progress"><div style={{ width: `${pct}%`, background: pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--orange)' : 'var(--green)' }} /></div>
      </div>
      <div className="list">
        {u.rows.map((r) => <div key={r.label} className="list-item"><span className="grow">{r.label}</span><span className="muted small">{r.keys} khóa</span><b>{fmtBytes(r.bytes)}</b></div>)}
      </div>
      <p className="muted small">Băng thông và số lần gọi hàm xem trong bảng điều khiển Vercel. Ảnh người dùng không bao giờ lưu trên server nên dung lượng luôn nhỏ.</p>
    </div>
  );
}
