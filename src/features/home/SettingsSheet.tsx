import { Trash2 } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { setTheme, useTheme, type ThemePref } from '../../ui/theme';
import { wipeAll } from '../../lib/db';
import { toast } from '../../ui/toast';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  return (
    <Modal title="Cài đặt" onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Giao diện</span>
          <div className="seg">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                {t === 'system' ? 'Theo máy' : t === 'light' ? 'Sáng' : 'Tối'}
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          <div className="list-item">
            <span className="sq red" style={{ width: 36, height: 36 }}><Trash2 size={20} strokeWidth={1.75} /></span>
            <div className="grow"><b>Dọn bộ nhớ</b><div className="muted small">Xóa preset riêng, mẫu watermark, logo, cài đặt trên máy này</div></div>
            <button className="btn sm danger" onClick={async () => { if (!confirmWipe()) return; await wipeAll(); toast('Đã dọn sạch'); setTimeout(() => location.reload(), 600); }}>Xóa</button>
          </div>
        </div>
        <button className="btn block" onClick={onClose}>Đóng</button>
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>NoPhotoShop · V486 - By DucAnh</p>
      </div>
    </Modal>
  );
}

function confirmWipe() {
  return window.confirm('Xóa toàn bộ dữ liệu NoPhotoShop trên máy này?');
}
