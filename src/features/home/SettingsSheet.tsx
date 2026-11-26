import { Trash2 } from 'lucide-react';
import { Modal, Switch } from '../../ui/Modal';
import { setTheme, useTheme, type ThemePref } from '../../ui/theme';
import { wipeAll, lsGet, lsSet } from '../../lib/db';
import { toast } from '../../ui/toast';
import { useState } from 'react';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const [wizard, setWizard] = useState(lsGet('nps_wizard') !== 'off');
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
            <div className="grow"><b>Chế độ từng bước</b><div className="muted small">Hướng dẫn 7 bước khi mở ảnh</div></div>
            <Switch label="Chế độ từng bước" checked={wizard} onChange={(v) => { setWizard(v); lsSet('nps_wizard', v ? 'on' : 'off'); }} />
          </div>
          <button className="list-item" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => { lsSet('nps_onboarded', ''); toast('Sẽ hiện hướng dẫn ở lần mở tới'); }}>
            <div className="grow"><b>Xem lại hướng dẫn</b></div>
          </button>
        </div>
        <div className="list">
          <div className="list-item">
            <span className="sq red" style={{ width: 36, height: 36 }}><Trash2 size={20} strokeWidth={1.75} /></span>
            <div className="grow"><b>Dọn bộ nhớ</b><div className="muted small">Xóa preset riêng, mẫu watermark, logo, cài đặt trên máy này</div></div>
            <button className="btn sm danger" onClick={async () => { if (!confirmWipe()) return; await wipeAll(); toast('Đã dọn sạch'); setTimeout(() => location.reload(), 600); }}>Xóa</button>
          </div>
        </div>
        <button className="btn block" onClick={onClose}>Đóng</button>
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>NoPhotoShop · By DucAnh · v1.0</p>
      </div>
    </Modal>
  );
}

function confirmWipe() {
  return window.confirm('Xóa toàn bộ dữ liệu NoPhotoShop trên máy này?');
}
