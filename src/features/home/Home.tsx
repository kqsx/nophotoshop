import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Camera, Sparkles, ShieldCheck, Stamp, Download, Smartphone, Palette } from 'lucide-react';
import { addFiles } from '../editor/store';
import { SAMPLES, sampleFile, sampleThumb } from './samples';
import { toast } from '../../ui/toast';
import { ShareBlock } from '../share/ShareBlock';
import { useInstall, isStandalone, platform, snoozed, snooze } from '../install/install';
import { InstallGuide } from '../install/InstallGuide';
import { TopBar } from './TopBar';

export function Home() {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [guide, setGuide] = useState(false);
  const bip = useInstall();
  const thumbs = useMemo(() => SAMPLES.map((s) => ({ ...s, src: sampleThumb(s.id) })), []);
  const onFiles = (f: FileList | null) => f && addFiles(f, (m) => toast(m, 'err'));
  const p = platform();
  const showInstall = !isStandalone() && !snoozed() && (bip || p.ios);
  return (
    <div className="home">
      <TopBar />
      <main
        className={'hero' + (drag ? ' drag' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
      >
        <div className="hero-badge"><ShieldCheck size={18} strokeWidth={1.75} /> Ảnh không rời máy của bạn</div>
        <h1>Ảnh đẹp chỉ với <span className="grad">1 chạm</span></h1>
        <p className="lead">Không cần Photoshop. Chọn ảnh, bấm một nút như <b>Beauty</b>, <b>Chân dung</b>, <b>Thiên nhiên</b>, <b>Ngược sáng</b>… rồi tải về 4K kèm đóng dấu.</p>
        <div className="hero-actions">
          <button className="btn primary lg" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={28} strokeWidth={1.75} /> Chọn ảnh
          </button>
          <button className="btn lg" onClick={() => camRef.current?.click()}>
            <Camera size={28} strokeWidth={1.75} /> Chụp ảnh
          </button>
        </div>
        <p className="muted small drop-hint">hoặc kéo thả ảnh vào đây · dán bằng Ctrl+V · chọn nhiều ảnh cùng lúc · JPG, PNG, WebP, HEIC</p>
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />

        <div className="samples">
          <span className="muted small">Thử nhanh với ảnh mẫu</span>
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            {thumbs.map((s) => (
              <button key={s.id} className="sample" onClick={async () => addFiles([await sampleFile(s.id)])} aria-label={`Ảnh mẫu ${s.label}`}>
                <img src={s.src} alt="" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>

      {showInstall && (
        <div className="install-banner glass">
          <span className="sq blue" style={{ width: 44, height: 44 }}><Smartphone size={24} strokeWidth={1.75} /></span>
          <div className="grow"><b>Cài NoPhotoShop</b><div className="muted small">Mở nhanh từ màn hình chính, chạy cả khi offline</div></div>
          <button className="btn sm primary" onClick={() => setGuide(true)}>Cài app</button>
          <button className="btn sm ghost" onClick={snooze}>Để sau</button>
        </div>
      )}

      <section className="features">
        {[
          { i: Sparkles, c: 'pink', t: 'Preset 1 chạm thông minh', d: 'Tự gợi ý theo ảnh: có mặt người, trời, cây, ban đêm, ngược sáng.' },
          { i: Palette, c: 'purple', t: 'Thư viện LUT màu', d: 'Màu phim, điện ảnh, Hàn Quốc… xem trước bằng chính ảnh của bạn.' },
          { i: Stamp, c: 'orange', t: 'Đóng dấu chữ & logo', d: 'Kéo thả, đổi cỡ, xoay, lát chống copy. Lưu mẫu dùng lại.' },
          { i: Download, c: 'blue', t: 'Xuất 4K nét căng', d: 'Xuất theo từng mảnh, ổn định trên điện thoại. Tải ZIP nhiều ảnh.' },
        ].map((f) => (
          <div key={f.t} className="feature glass card">
            <span className={`sq ${f.c}`} style={{ width: 48, height: 48 }}><f.i size={26} strokeWidth={1.75} /></span>
            <h3>{f.t}</h3>
            <p className="muted">{f.d}</p>
          </div>
        ))}
      </section>
      <ShareBlock />
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </div>
  );
}
