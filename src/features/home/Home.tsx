import { useRef, useState } from 'react';
import { ImagePlus, Camera, ShieldCheck } from 'lucide-react';
import { addFiles } from '../editor/store';
import { toast } from '../../ui/toast';
import { ShareBlock } from '../share/ShareBlock';
import { TopBar } from './TopBar';

export function Home() {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const onFiles = (f: FileList | null) => f && addFiles(f, (m) => toast(m, 'err'));
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
      </main>


      <ShareBlock />
    </div>
  );
}
