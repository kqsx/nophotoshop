import { toast } from '../../ui/toast';

/** Đăng ký service worker; khi có bản mới hiện «Có bản mới, bấm để cập nhật». */
export async function registerPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    onNeedRefresh() {
      toast('Có bản mới', 'info', { ms: 0, action: { label: 'Bấm để cập nhật', run: () => update(true) } });
    },
    onOfflineReady() {
      toast('Đã sẵn sàng dùng offline');
    },
  });
}
