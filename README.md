# Phóng Sinh Online — gói sửa đường dẫn và cấu hình Render

## Triển khai Render (Web Service, Node)
- Root Directory: để trống (package.json ở gốc).
- Build Command: `npm install --no-audit --no-fund` (không cần phụ thuộc bên ngoài).
- Start Command: `npm start`.
- Health Check Path: `/health`.
- Environment: `SECURE_COOKIE=1` khi dùng domain HTTPS Render.
- Render tự cấp `PORT`; không cần đặt thủ công.
- Trang chủ và WebSocket cùng dùng URL dịch vụ Web Service, không dùng Static Site.

**CẢNH BÁO QUAN TRỌNG:** Game lưu người dùng, phiên, công đức vào `data.json`.
File này nằm trên đĩa tạm của Render Free và CÓ THỂ BỊ MẤT khi redeploy, khởi động lại hoặc di chuyển instance.
KHÔNG nên mở đăng ký công khai và nhập dữ liệu thật trước khi thay bằng PostgreSQL hoặc lưu trữ bền vững.
Chưa có kiểm thử hiển thị 3D trên trình duyệt thật và chưa kiểm thử tải 40 người.

## Thay đổi trong gói này
- Đưa giao diện vào `public/index.html` đúng với đường dẫn `server.js` phục vụ.
- Bổ sung endpoint `GET /health`.
- Thêm `.gitignore` tránh tải dữ liệu tài khoản, phiên và file tạm lên GitHub.
- Không thay đổi nghiệp vụ gameplay và giao thức WebSocket.

---

# Phóng Sinh Online (MVP)

## Chạy
    cd phong-sinh-online
    node server.js          # cần Node 18+, không cần npm install
    # mở http://localhost:3000 bằng hai trình duyệt (hoặc một cửa sổ ẩn danh) để thử hai tài khoản
    node test.js            # kiểm thử giao thức hai tài khoản

Biến môi trường: PORT (mặc định 3000), DATA_FILE (mặc định data.json), SECURE_COOKIE=1 (bật khi chạy sau HTTPS).
Trang cần tải three.js và font từ internet (cdnjs, Google Fonts).

## Cấu trúc
- server.js: HTTP + WebSocket tự viết, xác thực, nhân vật, mua cá, phóng sinh, công đức, xếp hạng.
- public/index.html: client 3D (đăng nhập, tạo nhân vật, thế giới, người chơi khác).
- build_client.py: sinh public/index.html từ ../phong-sinh-the-gioi-3d.html (nếu sửa client, sửa file nguồn rồi chạy lại hoặc sửa thẳng public/index.html).
- test.js: kiểm thử tích hợp (37 kiểm tra).

## Cách máy chủ chống gian lận
- Số dư, hành trang, công đức chỉ nằm ở máy chủ; client chỉ gửi yêu cầu.
- Mua cá: kiểm tra vị trí gần quầy, loại cá, số lượng nguyên 1 đến 10, đủ số dư.
- Phóng sinh: máy chủ cấp lượt (mã duy nhất) rồi chỉ ghi nhận khi client xác nhận sau ít nhất 1,8 giây; mỗi lượt xác nhận được đúng một lần; mỗi con cá nằm đúng một dòng sổ cái. Công đức = số dòng sổ cái.
- Di chuyển: máy chủ giới hạn tốc độ và vùng đi được, vi phạm thì kéo nhân vật về vị trí cũ.
- Mật khẩu băm scrypt có salt; phiên là cookie HttpOnly SameSite=Strict, token chỉ lưu dạng băm; giới hạn tần suất đăng nhập và tin nhắn.

## Chưa có / cần làm tiếp
- Khôi phục mật khẩu (cần dịch vụ gửi email), Google Login, chat, báo cáo/chặn người dùng.
- Lưu trữ đang là file JSON (một tiến trình duy nhất). Muốn nhiều máy chủ hoặc nhiều người hơn cần PostgreSQL và Redis.
- Máy chủ chưa kiểm tra va chạm với quầy/cây (chỉ kiểm tra vùng đi được và tốc độ).
- Chưa chạy thử client 3D trên trình duyệt thật; chưa kiểm thử tải nhiều người.
- Chưa có HTTPS (đặt sau Nginx/Caddy hoặc nền tảng host có HTTPS rồi bật SECURE_COOKIE=1).
