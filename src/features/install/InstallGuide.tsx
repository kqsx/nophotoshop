import { Share, SquarePlus, CircleCheck, TriangleAlert, Smartphone } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { platform, promptInstall, useInstall } from './install';

export function InstallGuide({ onClose }: { onClose: () => void }) {
  const p = platform();
  const bip = useInstall();
  return (
    <Modal title="Cài NoPhotoShop" onClose={onClose}>
      {bip ? (
        <div className="stack">
          <p>Cài app lên màn hình chính để mở nhanh, toàn màn hình và dùng được cả khi không có mạng.</p>
          <button className="btn primary lg block" onClick={async () => { await promptInstall(); onClose(); }}>
            <Smartphone size={24} strokeWidth={1.75} /> Cài app ngay
          </button>
        </div>
      ) : p.ios && !p.iosSafari ? (
        <div className="stack">
          <div className="warn"><TriangleAlert size={22} /> <b>Hãy mở bằng Safari</b></div>
          <p>Trên iPhone/iPad chỉ Safari mới thêm được app vào màn hình chính. Bấm “…” rồi chọn “Mở bằng Safari”/“Mở trong trình duyệt”, sau đó làm theo 3 bước.</p>
        </div>
      ) : p.ios ? (
        <ol className="steps">
          <li><span className="sq blue" style={{ width: 44, height: 44 }}><Share size={24} strokeWidth={1.75} /></span><div><b>Bước 1</b><br />Bấm nút <b>Chia sẻ</b> ở thanh dưới của Safari.</div></li>
          <li><span className="sq gray" style={{ width: 44, height: 44 }}><SquarePlus size={24} strokeWidth={1.75} /></span><div><b>Bước 2</b><br />Kéo xuống, chọn <b>“Thêm vào MH chính”</b>.</div></li>
          <li><span className="sq green" style={{ width: 44, height: 44 }}><CircleCheck size={24} strokeWidth={1.75} /></span><div><b>Bước 3</b><br />Bấm <b>“Thêm”</b> ở góc trên bên phải. Xong!</div></li>
        </ol>
      ) : (
        <div className="stack">
          <p>Trình duyệt chưa cho phép cài tự động. Mở menu trình duyệt (⋮) và chọn <b>“Cài đặt ứng dụng”</b> hoặc <b>“Thêm vào màn hình chính”</b>.</p>
          {p.inApp && <div className="warn"><TriangleAlert size={22} /> Bạn đang mở trong app (Zalo/Facebook…). Hãy mở bằng Chrome để cài.</div>}
        </div>
      )}
    </Modal>
  );
}
