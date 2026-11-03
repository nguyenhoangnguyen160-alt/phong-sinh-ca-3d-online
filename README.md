# Phóng Sinh Cá 3D Online — MVP starter

Bản khởi đầu có:
- Thế giới 3D bằng React Three Fiber.
- Nhập tên nhân vật (chưa phải xác thực tài khoản production).
- Di chuyển bằng WASD/phím mũi tên.
- Quầy cá, mua cá bằng tiền demo.
- Điểm phóng sinh; thả cá và cộng công đức demo.
- Server Socket.IO đồng bộ người chơi và sự kiện trong cùng phòng.

## Yêu cầu
- Node.js 20+
- npm

## Chạy dự án
Mở Terminal trong thư mục dự án:

### 1. Chạy server
```bash
cd server
npm install
npm run dev
```

### 2. Chạy client ở terminal khác
```bash
cd client
npm install
npm run dev
```

Mở URL Vite được in ra terminal (thường là http://localhost:5173).
Server mặc định chạy tại http://localhost:3001.

## Thử multiplayer
Mở hai cửa sổ trình duyệt và nhập hai tên khác nhau. Hai cửa sổ phải truy cập cùng server.
Để thử trên điện thoại cùng mạng LAN, cấu hình Vite host 0.0.0.0 và dùng địa chỉ IP máy tính; firewall cần cho phép kết nối.

## Giới hạn quan trọng
Đây là MVP để phát triển tiếp, chưa phải hệ thống thương mại:
- Tên nhân vật chỉ là tên hiển thị; chưa có đăng ký/đăng nhập và xác thực an toàn.
- Tiền, hành trang và công đức đang là dữ liệu demo trong bộ nhớ server, sẽ mất khi server khởi động lại.
- Chưa có cơ sở dữ liệu, thanh toán thật, bảo vệ chống gian lận đầy đủ hoặc kiểm thử tải.
- Mô hình nhân vật/cá và cảnh dùng geometry đơn giản để bạn có thể chạy ngay; sau này thay bằng model GLB có rig/animation.
