import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './features/home/Home';
import { Editor } from './features/editor/Editor';
import { Toasts, toast } from './ui/toast';
import { addFiles, setCustomPresets, useStore } from './features/editor/store';
import { Onboarding, needOnboarding } from './features/home/Onboarding';
import { listAll } from './lib/db';
import { wmLoad } from './features/watermark/watermark';
import { loadCatalog } from './engine/lutStore';
import { loadConfig } from './lib/config';
import { trackVisit } from './lib/stats';
import type { Preset } from './presets/presets';

const Admin = lazy(() => import('./features/admin/Admin'));

export default function App() {
  const isAdmin = location.pathname.startsWith('/admin');
  if (isAdmin) return (<><Suspense fallback={<div className="center-page">Đang tải…</div>}><Admin /></Suspense><Toasts /></>);
  return <UserApp />;
}

function UserApp() {
  const hasDocs = useStore((s) => s.docs.length > 0);
  const [onboard, setOnboard] = useState(needOnboarding());

  useEffect(() => {
    trackVisit();
    loadConfig();
    loadCatalog();
    wmLoad();
    listAll<Preset>('presets').then(setCustomPresets);
    // dán ảnh Ctrl+V
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFiles(files, (m) => toast(m, 'err')); }
    };
    addEventListener('paste', paste);
    // nhận ảnh từ app khác (Web Share Target) và mở file (File Handling API)
    const q = new URLSearchParams(location.search);
    if (q.has('shared')) {
      caches.open('nps-share-target').then(async (c) => {
        const keys = await c.keys();
        const files: File[] = [];
        for (const k of keys) {
          const r = await c.match(k);
          if (r) files.push(new File([await r.blob()], decodeURIComponent(k.url.split('/').pop() || 'anh.jpg'), { type: r.headers.get('content-type') || 'image/jpeg' }));
          await c.delete(k);
        }
        if (files.length) addFiles(files);
        history.replaceState(null, '', '/');
      }).catch(() => {});
    }
    const lq = (window as unknown as { launchQueue?: { setConsumer: (cb: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
    lq?.setConsumer(async (p) => {
      if (!p.files?.length) return;
      addFiles(await Promise.all(p.files.map((h) => h.getFile())));
    });
    if (q.get('action') === 'camera') setTimeout(() => document.querySelector<HTMLInputElement>('input[capture]')?.click(), 400);
    if (q.get('action') === 'pick') setTimeout(() => document.querySelector<HTMLInputElement>('input[type=file]:not([capture])')?.click(), 400);
    return () => removeEventListener('paste', paste);
  }, []);

  return (
    <>
      {hasDocs ? <Editor /> : <Home />}
      {onboard && !hasDocs && <Onboarding onDone={() => setOnboard(false)} />}
      <Toasts />
    </>
  );
}
