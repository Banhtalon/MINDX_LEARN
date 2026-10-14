# MINDX LEARN — bản TEST Mốc 2

Ứng dụng học tập và quản lý lớp theo [PROJECT_PLAN.md](PROJECT_PLAN.md). Mốc 1 đã nghiệm thu; Mốc 2 đang triển khai và kiểm tra. Bằng chứng hiện tại: [docs/M2_EVIDENCE.md](docs/M2_EVIDENCE.md).

## Mở ứng dụng

Bản TEST: https://mindx-learn-test.vercel.app . Đội triển khai cập nhật web sau kiểm tra; hồ sơ bằng chứng ghi rõ bản đang chạy.

Ở Mốc 2, chọn **Giáo viên / Admin** để đăng nhập email/mật khẩu, hoặc **Học sinh** để dùng mã học sinh và PIN riêng gồm 8 chữ số. Không gửi mật khẩu/PIN trong chat. Admin tạo tài khoản nhân viên; không mở đăng ký tự do.

Admin dùng **Quản lý lớp** để tạo/sửa lớp, phân công giáo viên và lưu trữ/khôi phục lớp hoặc học sinh. Cấp PIN lần đầu chỉ cho học sinh chưa có PIN; cấp lại chỉ cho một học sinh được chọn. CSV tải tại lần cấp, không xem lại PIN cũ. Mất CSV thì cấp PIN mới cho đúng học sinh.

TEST chỉ dùng lớp/học sinh giả; email Admin của Owner dùng để đăng nhập thật. Chưa nhập Teaching thật hoặc mở PROD.

## Phạm vi

- Mốc 2: đăng nhập, PIN, tài khoản, lớp, phân công giáo viên, quyền dữ liệu và khóa phiên cũ.
- Mốc 3: khóa 14 buổi, quiz, thực hành, chấm bài và tiến độ lưu thật.
- Mốc 4: đồng bộ Teaching có xem trước/xác nhận.
- Mốc 5: CSV tổng kết và kết thúc/xóa kết quả đợt cũ.
- Mốc 6: kiểm tra tổng thể và quyết định mở PROD.

Các tính năng ngoài Mốc 2 bị khóa trong chế độ kết nối thật. Mô phỏng Mốc 1 được giữ để tham khảo, chỉ bật khi đội triển khai cấu hình `NEXT_PUBLIC_MINDX_DEMO=1`; dữ liệu mô phỏng chỉ nằm trong bộ nhớ trang.

## Chạy trên máy đã cấu hình

Cần Node.js 24.x và các gói dự án. Đội triển khai giữ cấu hình riêng trong `.env.local`, không đưa lên GitHub/chat. Thiếu cấu hình thì ứng dụng báo chưa sẵn sàng, không tự mở Admin mô phỏng.

Mở PowerShell và chạy:

```powershell
Set-Location -LiteralPath 'F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD'
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Thấy `Ready` thì mở http://127.0.0.1:3000 . Giữ cửa sổ chạy mở; Ctrl+C để dừng. Đăng nhập dùng Supabase TEST nên thay đổi lớp/PIN được lưu trên TEST. Máy mới cần đội triển khai cấu hình trước; Owner không tự tìm hoặc chép khóa dịch vụ.

## Kiểm tra dành cho đội triển khai

```powershell
npm run typecheck
npm test
npm run build
```

Build chỉ xác nhận mã biên dịch. Phép thử kết nối dùng `scripts/m2-app-check.mjs` và `scripts/m2-live-check.mjs`; công cụ sau tạo tài khoản giả, chỉ chạy đúng TEST. Tải 200 tài khoản/chờ giới hạn dùng cờ rõ ràng. Biên bản phân biệt PASS, FAIL, NOT_TESTED và MANUAL_PENDING.

`npm run start` chạy bản đóng gói; xác minh địa chỉ mạng tin cậy được cấu hình cho Vercel. Thử đăng nhập trên máy cá nhân dùng `npm run dev` như trên.

SQL có phiên bản tại `supabase/migrations/`; dịch vụ quyền tại `supabase/functions/m2-backend/`. Khóa quản trị chỉ ở dịch vụ, không ở trình duyệt. Cookie phiên mã hóa, không cho mã trang đọc. PIN rõ chỉ xuất hiện tạm trong CSV cấp PIN của Admin.

## Bàn giao

Gemini qua AGY CLI triển khai, Sol điều phối/kiểm tra/kết nối, Luna review độc lập. Chỉ reviewer tick checklist sau đủ bằng chứng/nghiệm thu Owner. Kiểm tra trên máy hoặc một lượt đăng nhập không đồng nghĩa hoàn thành Mốc 2.

Giao diện dùng UI UX Pro Max và nguyên tắc Taste phù hợp ứng dụng, nền sáng/xanh dương/tiếng Việt dễ đọc. Nguồn skill và quy tắc: [docs/AI_AGENT_WORKFLOW.md](docs/AI_AGENT_WORKFLOW.md).
