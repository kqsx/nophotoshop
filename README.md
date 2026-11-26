# NoPhotoShop By DucAnh

**Chỉnh ảnh đẹp 1 chạm, ngay trên trình duyệt — ảnh không rời máy người dùng.**
Tác giả: **DucAnh** · Phone/Zalo: **0904817613**

React 19 + Vite + TypeScript, xử lý ảnh bằng **WebGL2** (shader), API nhỏ chạy trên **Vercel Functions** (thư mục `api/`), lưu dữ liệu nhỏ trên **Vercel KV / Upstash Redis**.

---

## 1. Chạy thử trên máy

```bash
npm install
npm run dev          # http://localhost:5173  (API /api/* chạy luôn trong dev)
```

- Trang người dùng: `http://localhost:5173/`
- Trang quản trị: `/admin` (vd. `https://nophotoshop.vercel.app/admin`). Mật khẩu mặc định là mật khẩu chủ app đã chọn (lưu dạng băm bcrypt trong `api/_lib/auth.ts`). Muốn đổi: chạy `node scripts/hash-password.mjs "mật-khẩu-mới"` rồi đặt biến `ADMIN_PASSWORD_HASH` trên Vercel.
- Dữ liệu admin khi chạy local lưu ở `.data/store.json`.

Lệnh khác:

| Lệnh | Việc |
|---|---|
| `npm run build` | Kiểm tra TypeScript + build ra `dist/` (kèm service worker PWA) |
| `npm test` | Chạy kiểm thử (Vitest): đọc .cube, .xmp, nhận hướng ảnh, gộp thống kê… |
| `npm run hash-password -- "mat-khau"` | Sinh `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET` |
| `npm run gen:luts` | Sinh lại 8 LUT mặc định (tự tạo, không vướng bản quyền) |
| `npm run gen:icons` | Sinh lại icon PWA, favicon, ảnh Open Graph (cần Playwright) |

## 2. Đưa lên mạng (GitHub + Vercel, miễn phí)

1. Tạo repo GitHub, push toàn bộ thư mục này (file `.gitignore` đã loại `node_modules`, `.data`, `.env`).
2. Vercel → **Add New Project** → chọn repo → Framework **Vite** → Deploy.
3. Vercel → **Storage** → tạo **Upstash Redis (KV)** và nối vào project (Vercel tự thêm `KV_REST_API_URL`, `KV_REST_API_TOKEN`).
4. Trên máy chạy `npm run hash-password -- "mat-khau-dai-cua-ban"` rồi dán 3 dòng kết quả vào **Settings → Environment Variables**:
   - `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`
   - Tùy chọn: `ADMIN_TOTP_SECRET` (bật 2FA bằng Google Authenticator), `RETENTION_LOGS_DAYS`, `RETENTION_STATS_MONTHS`, `STORAGE_LIMIT_BYTES`.
5. Deploy lại. Sửa `public/sitemap.xml` thay `YOUR-DOMAIN` bằng tên miền thật.

`vercel.json` đã có: header bảo mật (CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS), cache 1 năm cho file có hash, rewrite SPA, `noindex` cho `/admin`, **Cron 3h sáng hằng ngày** gọi `/api/admin/cleanup` (cần đặt biến `CRON_SECRET`) để tự dọn dữ liệu.

## 3. Chức năng đã có

### Người dùng
- **Tải ảnh**: chọn file, nhiều ảnh cùng lúc, kéo thả, dán Ctrl+V, chụp camera, nhận ảnh chia sẻ từ app khác (Android, Web Share Target), mở file bằng File Handler; JPG/PNG/WebP/HEIC (Safari đọc HEIC sẵn, trình duyệt khác nạp `heic2any` khi cần). Tự xoay theo EXIF.
- **Phân tích tự động** (< 1 giây, trên ảnh thu nhỏ): hướng ngang/dọc/vuông, nhãn tỷ lệ 16:9, 9:16, 4:5, 3:2…, histogram, có người (màu da), có trời, cây xanh, đồ ăn, sản phẩm nền sáng, tối, ngược sáng, ban đêm, ám màu.
- **20 preset 1 chạm**: Auto sáng (tính theo histogram, có giới hạn), Beauty (mịn da 30%), Chân dung, Da đẹp, Xóa mụn, Đều màu da, **Studio**, **Trong trẻo**, **Ngược sáng**, **Bình minh**, Trời xanh mây trắng, Cây xanh tươi, **Thiên nhiên**, Phong cảnh, Ban đêm, Đồ ăn, Sản phẩm bán hàng, Phim, Vintage, Đen trắng. Thumbnail vẽ bằng **chính ảnh của người dùng**, gợi ý 4 preset hợp nhất, nút **«Tự động chọn cho tôi»**, chồng nhiều preset, thanh **Cường độ** cho từng preset, lưu preset riêng (IndexedDB).
- **Thư viện LUT**: 8 LUT mặc định + LUT/preset Lightroom do admin tải lên, lọc theo nhóm, thanh cường độ 0–100%, nội suy tam tuyến bằng texture 3D.
- **Tinh chỉnh nhanh** ngay dưới preset: Độ sáng, Tông màu (lạnh ↔ ấm), Mịn da, Sáng da, Hồng da.
- **Tab Nâng cao** (ẩn cho giao diện gọn): Ánh sáng (phơi sáng, tương phản, vùng sáng/tối, trắng/đen, clarity, dehaze) · Màu (nhiệt độ, tint, vibrance, bão hòa, **chấm cân bằng trắng**, trời, cây) · **HSL 8 dải** · **Curves** RGB/R/G/B · **Da** (mịn, sáng, hồng, đều màu/nám, xóa mụn tự động, quầng thâm, tông da, **chạm để xóa mụn/vật nhỏ**) · Chi tiết (độ nét, khử nhiễu, hạt phim, vignette, phai màu) · **Công thức** (lưu/xuất/nhập file cấu hình, áp cho tất cả ảnh).
- **Cắt/xoay**: gợi ý khung theo mạng xã hội (Reels/TikTok 9:16, YouTube 16:9, Instagram 4:5/1:1, Facebook 1.91:1), ảnh thẻ 3×4/4×6, xoay 90°, lật, cân thẳng ±45°, thu phóng + dịch khung.
- **So sánh**: giữ nút (hoặc phím Space) xem ảnh gốc, thanh chia đôi Trước/Sau kéo được. **Lịch sử** từng bước, bấm để quay lại, Undo/Redo (Ctrl+Z / Ctrl+Shift+Z), Ctrl+S mở Xuất.
- **Chế độ từng bước (7 bước)**, mở mặc định lần đầu, có «Bỏ qua»; **onboarding 3 màn**.
- **Watermark**: chữ (8 font có tiếng Việt tự host, đậm/nghiêng, màu, viền, bóng, khoảng cách chữ, tự đổi màu theo nền), logo (PNG/SVG/WebP, đổi trắng/đen, bo góc), **lát kín chống copy** (khoảng cách, góc), chữ ký «© Tên · ngày chụp EXIF». Kéo thả trên ảnh, chụm 2 ngón phóng/xoay, tay nắm ở góc trên máy tính, lưới 9 vị trí, kích thước theo % chiều rộng (mặc định 18%), độ trong suốt (60%), lề (3%), tối đa 5 lớp, thứ tự lớp, khóa, nhân đôi, ẩn, **lưu mẫu**, «Luôn áp dụng khi xuất», vị trí riêng cho ảnh dọc. Vẽ ở độ phân giải xuất cuối nên **ảnh 4K giống hệt xem trước**.
- **Nhiều ảnh cùng lúc**: công tắc **«Chỉnh đồng loạt N ảnh»** (bật sẵn) — preset, LUT, thanh kéo, HSL, curves áp cho tất cả ảnh đã tải; khung cắt và điểm xóa mụn giữ riêng từng ảnh. Tắt đi để chỉnh riêng từng ảnh.
- **Xuất ảnh**: chọn ảnh nào để xuất (1 ảnh, vài ảnh hoặc tất cả), chọn cách tải: **«Từng ảnh vào máy»** (điện thoại mở bảng chia sẻ → «Lưu ảnh» vào Thư viện ảnh; máy tính tải lần lượt từng file) hoặc **«Một file ZIP»**. Luôn **hỏi «Bạn có muốn đóng dấu (watermark) lên ảnh không?»** trước khi tải (trừ khi bật «Luôn áp dụng»). Gốc / 1080p / 2K / **4K (3840px)** / tùy chỉnh / cỡ mạng xã hội; JPG (92), PNG, WebP, AVIF (nếu trình duyệt hỗ trợ). **Xuất theo mảnh 1024px** + kiểm tra giới hạn bộ nhớ thiết bị, tự hạ cỡ và báo rõ; thanh tiến độ + Hủy; xóa EXIF/GPS; tải ZIP nhiều ảnh (`ten-goc_nophotoshop.jpg`); chia sẻ file qua Web Share trên điện thoại.
- **PWA**: manifest đầy đủ (icon 192/512/maskable/monochrome, apple-touch 180, shortcut «Chọn ảnh», «Chụp ảnh»), service worker Workbox chạy offline, thông báo «Có bản mới, bấm để cập nhật». Nút **Cài app** (Android: hộp thoại hệ thống; iOS: hướng dẫn 3 bước, cảnh báo «Hãy mở bằng Safari» khi mở trong Zalo/Facebook/Chrome iOS; «Để sau» không làm phiền 14 ngày).
- **Chia sẻ**: Web Share / sao chép link, **QR code sinh tại máy** (mức H, logo giữa, tải PNG/SVG), nút Zalo, Facebook, Messenger, Telegram, X; link có `?utm_source=` để đếm nguồn.
- Sáng/tối theo hệ thống + công tắc tay, chữ ≥ 17px, nút ≥ 44px, kính mờ kiểu iOS, icon Lucide nét 1.75 đồng nhất, tôn trọng «giảm chuyển động». Trang **Quyền riêng tư**, **Cài đặt → Dọn bộ nhớ**.

### Admin (`/admin`, ẩn khỏi menu, `noindex`)
- Đăng nhập mật khẩu băm **bcrypt** (biến môi trường), cookie **HttpOnly; Secure; SameSite=Strict**, hết hạn 12 giờ, **khóa 15 phút sau 5 lần sai**, tùy chọn **2FA TOTP**, chặn CSRF bằng header riêng, rate limit mọi API.
- **LUT**: kéo thả nhiều file, **kiểm tra đúng file** (đuôi, ≤ 8 MB, cú pháp từng dòng, LUT_3D_SIZE 2–65, đủ số dòng, giá trị hợp lệ — báo lỗi tiếng Việt cụ thể), tự nén 65³ → 33³, xem trước trên ảnh mẫu, đặt tên/nhóm/bộ, sắp xếp, bật/tắt, xóa. Server kiểm tra lại lần nữa.
- **Preset Lightroom**: tải file **.xmp** (Lightroom/Camera Raw) → quy đổi Exposure, Contrast, Highlights/Shadows/Whites/Blacks, Clarity, Dehaze, Vibrance, Saturation, Temp/Tint, HSL 8 dải, Tone Curve, Sharpness, Grain, Vignette, Đen trắng. Lưu ý: Lightroom Classic không xuất .cube; muốn LUT thật thì xuất từ Photoshop (File › Export › Color Lookup Tables) — cả .cube của Photoshop/Resolve/ACR đều dùng được.
- **Thống kê ẩn danh** theo **ngày / tuần / tháng / năm** (lượt truy cập, ảnh mở, ảnh xuất, preset/LUT dùng nhiều, thiết bị, nguồn utm, định dạng xuất), xuất CSV. Không lưu IP (chỉ băm để rate limit), không ảnh.
- **Dọn dữ liệu**: lọc theo một ngày, khoảng ngày, tháng, năm, hoặc «cũ hơn N ngày/tháng»; chọn loại (thống kê, nhật ký lỗi, phản hồi, nhật ký admin; LUT chỉ khi chọn riêng); **Xem trước** số bản ghi + dung lượng; sao lưu JSON/CSV; **xác nhận 2 lần** (gõ `XOA` + nhập lại mật khẩu); **thùng rác 7 ngày** có Khôi phục; «Xóa vĩnh viễn ngay»; chính sách tự dọn (nhật ký 30 ngày, thống kê 12 tháng…) chạy bằng Vercel Cron; **nhật ký thao tác admin** (tự xóa sau 12 tháng).
- **Preset 1 chạm**: bật/tắt, đánh dấu nổi bật. **Cấu hình app**: tên, tác giả, phone/Zalo, chân trang, màu nhấn, font watermark. **Dung lượng**: thanh «Đã dùng X/Y».

### Riêng tư
Không có request nào gửi ảnh lên server (đã kiểm tra bằng Playwright: chỉ có `POST /api/stats` chứa vài con số đếm).

## 4. Cấu trúc thư mục

```
api/            Vercel Functions: auth/login, luts, stats, admin/cleanup, admin/config, _lib (store, auth, agg)
public/         icons/, luts/ (+ luts.json), models/, og-banner.png, robots.txt, sitemap.xml
src/engine/     Renderer WebGL2 + shader, pipeline xem trước/xuất theo mảnh, .cube, .xmp, cắt/xoay
src/analysis/   phân tích ảnh, hướng & tỷ lệ
src/presets/    presets.json + gợi ý
src/features/   editor, watermark, export, share, install (PWA), home, admin
src/ui/         theme (design tokens sáng/tối), slider, modal, toast, icon
src/sw.ts       service worker (Workbox)
scripts/        hash-password, gen-luts, gen-icons
tests/          Vitest
```

Màu và hiệu ứng nằm hết trong design tokens ở `src/ui/theme.css` để đổi nhanh khi có giao diện iOS mới.

## 5. Chưa làm ở bản này (giai đoạn sau)

Những phần cần mô hình AI hoặc nhận diện khuôn mặt/dáng người — được để lại thay vì làm dở:

- **Nhận diện mặt bằng MediaPipe Face Landmarker** (mặt nạ mắt/môi/răng chính xác). Hiện mặt nạ da dùng phân tích màu da (YCbCr) + bảo vệ cạnh, nên làm mịn không nhòe tóc/mắt trong đa số ảnh, nhưng chưa có: **làm sáng mắt, trắng răng, khử mắt đỏ** tự động.
- **Bóp eo, thon mặt, to mắt** (warp theo landmarks).
- **Tách nền / thay nền / ảnh thẻ đổi nền xanh-trắng-đỏ**, **xóa nền 1 chạm**, **tách trời bằng AI** (hiện trời/cây dùng mặt nạ màu + vị trí).
- **Phóng ảnh super-resolution** (hiện phóng mượt + làm nét nhẹ, có nói rõ khi ảnh gốc nhỏ hơn cỡ xuất).
- **Perspective** (nắn phối cảnh), **khung viền / nhãn dán / chữ trên ảnh**, **collage cắt ghép nhiều ảnh**, ghép ảnh trước/sau thành một ảnh.
- **Camera trực tiếp có gợi ý bố cục** (hiện dùng camera hệ thống).
- **Giữ EXIF cơ bản** khi xuất (hiện xóa toàn bộ EXIF, đã bao gồm GPS).
- **Song ngữ vi/en** (hiện chỉ tiếng Việt), form **phản hồi người dùng** (loại dữ liệu và dọn dẹp đã sẵn).
- Phương án lưu LUT qua **GitHub commit** hoặc **Supabase/R2**: hiện LUT lưu trong KV (phù hợp vài chục–vài trăm LUT 17³/33³). Nhiều LUT 65³ thì nên chuyển sang Storage.
- Kiểm thử tự động Playwright trong CI và đo Lighthouse trên bản deploy thật.

## 6. Ghi chú kỹ thuật

- CSP có `'unsafe-eval'` chỉ vì thư viện `heic2any` (đọc HEIC trên Chrome/Android) cần. Nếu không cần HEIC trên trình duyệt ngoài Safari, có thể bỏ.
- Hiệu năng: xem trước dùng bản thu nhỏ cạnh dài 1600px, vẽ lại theo `requestAnimationFrame`; các lớp làm mờ dùng cho da/độ rõ được tính ở độ phân giải cố định nên **xem trước và xuất cho cùng một kết quả**.
- Không có công cụ «1 chạm» nào đúng cho mọi ảnh: mọi preset đều có thanh cường độ và hoàn tác.
- Gói free của Vercel dành cho dự án cá nhân/phi thương mại; hạn mức KV có thể thay đổi.
