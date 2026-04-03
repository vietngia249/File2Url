# File2Url

Dịch vụ backend MVP cho phép chuyển đổi mọi tập tin thành một liên kết URL để xem và chia sẻ. Các liên kết được cấp sẽ có thời hạn hết hạn được cài đặt tự động.

---

## Cấu hình Backend

Bản phát hành backend được đóng gói hoàn chỉnh bên trong thư mục `fileup-api/`. 

Dịch vụ File2Url được xây dựng bằng:
- **Node.js (ESM), Fastify** (Backend server)
- **PostgreSQL / Neon** (Lưu trữ Metadata các tập tin) 
- **Cloudflare R2** (Lưu trữ nội dung tập tin)
- **Vite + Tailwind CSS** (Frontend Light Mode UI)

Xem tài liệu [hướng dẫn chạy Backend ở đây](./fileup-api/README.md).

---

## Tính Năng Chính
- **Tải lên API (`/upload`)**: Upload với Multipart, tự động upload luồng dữ liệu lớn không vượt qua bộ nhớ RAM, lưu file vô R2 và database với Expire Date.
- **Tải xuống API (`/file/:id`)**: Hỗ trợ streaming cực tốc độ. Hỗ trợ query `?download=1` để ép trình duyệt tải xuống thay vì xem trực tiếp.
- **Quản lý (`/manage/:key`)**: Cho phép chủ tệp kiểm tra trạng thái và xoá nóng file khỏi hệ thống.
- Tự động xóa (Cron Job) các file rác sau khi Expire hạn dùng.

---

## Sử Dụng Cơ Bản
Gửi request qua Terminal/Postman hoặc Client fetch()

**Upload**
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/đường/dẫn/tới/ảnh.jpg" \
  -F "expire=3"
```
**View Trực Tiếp / Download**
```text
http://localhost:3000/file/{uuid}
http://localhost:3000/file/{uuid}?download=1
```
