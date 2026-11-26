import { Modal } from '../../ui/Modal';

export function Privacy({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Quyền riêng tư" onClose={onClose}>
      <div className="prose">
        <h3>Ảnh không rời máy của bạn</h3>
        <p>Mọi thao tác chỉnh ảnh, làm đẹp da, LUT, watermark và xuất 4K đều chạy ngay trong trình duyệt bằng GPU của máy bạn. NoPhotoShop <b>không tải ảnh lên máy chủ</b>. Bạn có thể kiểm tra bằng tab Network của trình duyệt.</p>
        <h3>Thống kê ẩn danh</h3>
        <p>App chỉ đếm số lượt dùng (mở app, preset/LUT được chọn, số ảnh xuất, loại thiết bị) để cải thiện sản phẩm. Không lưu IP, không lưu ảnh, không cookie quảng cáo, không bán dữ liệu. Thống kê tự xóa sau 12 tháng.</p>
        <h3>Dữ liệu trên máy bạn</h3>
        <p>Preset riêng, mẫu watermark, logo và cài đặt được lưu trong trình duyệt (IndexedDB). Vào <b>Cài đặt → Dọn bộ nhớ</b> để xóa toàn bộ.</p>
        <h3>Liên hệ</h3>
        <p>NoPhotoShop By DucAnh · Phone/Zalo: <a href="tel:0904817613">0904817613</a></p>
      </div>
    </Modal>
  );
}
