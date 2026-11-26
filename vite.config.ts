import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Chạy các hàm trong api/ ngay trong `npm run dev` (giống Vercel Functions). */
function devApi(): Plugin {
  return {
    name: 'nps-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const p = url.pathname.replace(/\/$/, '');
        const cands = [`${p}.ts`, `${p}/index.ts`].map((f) => resolve(process.cwd(), '.' + f));
        const file = cands.find((f) => existsSync(f));
        if (!file || p.includes('/_lib')) { res.statusCode = 404; return res.end('Not found'); }
        try {
          const mod = await server.ssrLoadModule(file);
          const fn = mod[req.method || 'GET'];
          if (typeof fn !== 'function') { res.statusCode = 405; return res.end('Method not allowed'); }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const body = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks);
          const r: Response = await fn(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end('Dev API error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devApi(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png', 'luts/*.{cube,json}', 'assets/*-{vietnamese,latin}-*.woff2'],
        globIgnores: ['**/heic2any*', '**/*-cyrillic*', '**/*-greek*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'NoPhotoShop By DucAnh',
        short_name: 'NoPhotoShop',
        description: 'Chỉnh ảnh đẹp 1 chạm, xuất 4K, watermark — ảnh không rời máy bạn.',
        lang: 'vi',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        theme_color: '#0a84ff',
        background_color: '#f2f2f7',
        categories: ['photo', 'productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
        ],
        shortcuts: [
          { name: 'Chọn ảnh', short_name: 'Chọn ảnh', url: '/?action=pick', icons: [{ src: '/icons/shortcut-pick-96.png', sizes: '96x96' }] },
          { name: 'Chụp ảnh', short_name: 'Chụp ảnh', url: '/?action=camera', icons: [{ src: '/icons/shortcut-camera-96.png', sizes: '96x96' }] },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', files: [{ name: 'images', accept: ['image/*', '.heic', '.heif'] }] },
        },
        file_handlers: [
          { action: '/', accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/heic': ['.heic', '.heif'] } },
        ],
      } as Record<string, unknown>,
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);
