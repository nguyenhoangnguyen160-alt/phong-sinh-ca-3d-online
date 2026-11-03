# PHÓNG SINH 3D ONLINE — Bản sửa 1.0

Game web 3D (React + React Three Fiber + Three.js) với máy chủ Node.js / Express / Socket.IO. Bản sửa gộp client và server vào **một Render Web Service**; không còn bắt buộc phải deploy Static Site và API riêng.

## Đã sửa

- Chạy React build và Socket.IO **trên cùng địa chỉ** để tránh lỗi `localhost:3001` khi lên mạng.
- Màn hình nhập tên báo rõ tình trạng kết nối, phản hồi quá hạn sau 9 giây thay vì im lặng.
- Cập nhật số người chơi từ server; hiển thị thông báo mất kết nối, tự kết nối lại.
- Mua cá giá 10 xu demo khi đứng gần quầy, phóng sinh khi đến bờ sông; công đức và số cá đồng bộ trên HUD.
- Thêm nút di chuyển cảm ứng ▲◀▼▶ trên màn hình nhỏ; giữ WASD và phím mũi tên trên PC.
- Bỏ phụ thuộc HDR tải từ bên ngoài để cảnh không bị trắng khi dịch vụ ảnh tạm lỗi.
- Giữ bản đồ 3D và thiết kế hiện có; chỉnh nút và thông báo trên điện thoại.

## Cách deploy dễ nhất: Render Web Service (KHÔNG phải Static Site)

1. Giải nén toàn bộ ZIP, đưa **cả thư mục `client`, `server`, `package.json`, `render.yaml`** lên cùng một repository GitHub. Không chỉ upload thư mục `server`.
2. Trên [dashboard.render.com](https://dashboard.render.com), chọn **New → Web Service** và nối repository đó. Có thể sử dụng `render.yaml` (Blueprint) nếu muốn.
3. Thiết lập:
   - **Runtime:** Node
   - **Root Directory:** để trống (thư mục gốc repo)
   - **Build Command:** `npm run render-build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - **Environment:** `NODE_ENV=production`
4. Deploy. Vào `https://<ten-web-service>.onrender.com/health` phải thấy `{"ok":true,"service":"phong-sinh-server"}`.
5. Mở `https://<ten-web-service>.onrender.com/`, thấy dòng **Máy chủ trực tuyến**, nhập tên từ 2 ký tự và bấm **Vào thế giới**.
6. Nếu cần giữ tên miền `phong-sinh-game.onrender.com` hiện tại: tên đó đang thuộc Static Site cũ, nên **không tự chuyển** sang Web Service. Có thể dùng URL mới, hoặc chuyển tên miền bằng cấu hình Render sau khi kiểm tra xong.

**Quan trọng:** Không đặt biến `VITE_SERVER_URL` khi deploy chung. Nếu repository chứa `client/.env` với URL localhost, hãy xóa/không commit file đó. `client/.env.example` chỉ dành cho phát triển local.

## Chạy trên máy (Node.js 20+)

Ở thư mục gốc dự án:

```bash
npm run render-build
npm start
```

Mở `http://localhost:3001` (giao diện + socket trên cùng cổng).

Để phát triển nóng, chạy 2 terminal:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Client Vite chạy `http://localhost:5173`, API dev mặc định `http://localhost:3001`.

## Thử chức năng

1. Mở link web → xác nhận “Máy chủ trực tuyến”.
2. Nhập tên 2–20 ký tự → Vào thế giới.
3. Dùng WASD/mũi tên hoặc phím cảm ứng đi đến **quầy cá ở bên phải** → Mua cá (trừ 10 xu).
4. Đi đến khu vực **bờ sông phía trước** → Phóng sinh cá (giảm 1 cá, cộng 1 công đức).
5. Mở ở cửa sổ khác với tên khác → kiểm tra số người chơi và nhân vật của nhau.
6. Thử tắt mạng: game cần báo máy chủ ngoại tuyến, không bị đứng nút mãi mãi.

## Giới hạn và lưu ý

Đây vẫn là **game demo/MVP**, chưa phải trò chơi thương mại. 100 xu, cá và công đức là số liệu mô phỏng; **không có giao dịch hay phóng sinh động vật thật**. Dữ liệu được giữ trong bộ nhớ và sẽ mất khi máy chủ Render ngủ, khởi động lại hoặc người chơi rời phòng. Chưa có tài khoản, xác thực, cơ sở dữ liệu, thanh toán thật, chống gian lận toàn diện hoặc kiểm thử tải production. Dịch vụ Render free có thể cần thời gian khởi động lại sau khi ngủ.

Đừng dùng dữ liệu công đức demo như số liệu đóng góp thật. Nếu muốn lưu lâu dài cần triển khai database và cơ chế xác thực trước.
