# M2 checkpoint — 16/10/2026

Đây là cập nhật trạng thái để tiếp tục Mốc 2, không phải nghiệm thu Mốc 2 và không thay thế các biên nhận lịch sử trong `M2_RUNTIME_RESULTS.json`. Không đánh dấu hoàn tất mục checklist nào trong bản cập nhật này.

## Thay đổi và kiểm tra mã

- Theo yêu cầu Owner, luồng thư mời giáo viên được thay bằng việc Admin tự tạo email/mật khẩu trong Supabase, sau đó kết nối tài khoản Auth sẵn có với hồ sơ Giáo viên và lớp.
- Sáu tệp thay đổi được commit cục bộ trên `codex/moc-2` tại `7d17cbd` (`feat: connect existing teacher accounts`). Commit chưa được đẩy lên GitHub. SHA-256 của cả sáu tệp khớp bản đã được review độc lập:
  - `src/app/admin/teachers/page.tsx`: `9E9AE391BC736B2B721320A6A3980B5ED86959123FA743B583496C251BA880CF`
  - `src/lib/store.tsx`: `7B86C26B074CBCFA5A7FC5A5521C35A638D210D18707FA6C1DBA2379E42BED03`
  - `supabase/functions/m2-backend/index.ts`: `4532CA2C3136B02B29A5C8E361C75B1EB7EBC5A9FD4A4A87B81BA34F56FD0305`
  - `supabase/functions/m2-backend/domain.ts`: `835BF0401A97152EC950BB28675D451318EE259788CB85E74D4144A096223308`
  - `supabase/migrations/20261015111046_m2_link_existing_teacher.sql`: `B35C862C147503B3072056705239EF8742966C9F63C76CA9589A2BFC7B1DAF9D`
  - `tests/m2-teacher-connection.test.mjs`: `326D47758DE8680C231991421EFF8506405A9A1F6F0052E9EFB4999A9DC23F1C`
- Kiểm tra mới nhất: `npm test` 145/145 đạt, 0 lỗi, exit code 0. Trên chính các hash này, trước đó đã đạt typecheck, Deno 2.9.6 check và `git diff --check`.

## Supabase TEST

- Chỉ thao tác trên project TEST `eythjapspkoyqdxlxtcd`.
- Migration `20261015111046` / `m2_link_existing_teacher` đã chạy trong SQL Editor và có kết quả “Success. No rows returned”. Truy vấn chỉ đọc sau đó xác nhận có hàm `public.m2_link_existing_teacher(uuid,text,text,uuid[])`, lịch sử migration có một câu lệnh, và nội dung SQL đã chuẩn hóa có độ dài 9361 ký tự, MD5 `222a4e27ef88c4770205f42821e8e1c2`, khớp file nguồn sau chuẩn hóa.
- Quyền thực thi: `anon=false`, `authenticated=false`, `service_role=true`; hàm dùng `SECURITY DEFINER` và ghim `search_path=pg_catalog, public, private, auth`.
- Biên nhận chi tiết đã lưu cục bộ, trong thư mục bị Git bỏ qua: `.workflow-local/m2/phase2-db-receipt.json`. Ảnh tab SQL được chụp trong CUA nhưng không lưu thành tệp.

## Edge, website TEST và kiểm tra chạy thật

- Edge Function chưa được cập nhật; bản đang có vẫn là `m2-backend` v2 A11, `verify_jwt=false`. Lệnh deploy qua Supabase MCP bị từ chối quyền. Dashboard Editor mở được, nhưng trình duyệt từ chối URL `file://` dùng để đưa mã nguồn local vào trình soạn thảo và ghi rõ không được tìm đường vòng. Vì vậy không có mã Edge mới nào được triển khai.
- Website TEST vẫn là deployment cũ `dpl_B79eGzBgsmSUxWShTnVWECbwzgAn`, nguồn `8245a81616708b42f27421942b190bed2083cdd4`, URL `https://mindx-learn-test.vercel.app`. Không tạo deployment Vercel mới.
- Chưa chạy kiểm tra runtime cho luồng kết nối giáo viên mới vì Edge vẫn là bản cũ. Không thử bằng tài khoản thật, không gửi thư và không thay đổi dữ liệu ngoài fixture giả.
- Giữ nguyên các kết quả trước: full C13 là **FAILED 199/200**, nguyên nhân của một lượt lỗi chưa rõ; C15 là **focused 200/200 PASS**, không retry. Kết quả C15 không đổi trạng thái C13.

## Việc còn lại

Cần một đường triển khai hợp lệ có quyền với đúng project Supabase TEST để đưa hai tệp Edge đã review lên trước khi thử API/runtime. Chưa xác minh được thao tác giao diện chính xác để sửa quyền connector; không cần Owner gửi mật khẩu hoặc khóa trong chat. Sau khi có quyền hợp lệ, cần xác nhận hash nguồn Edge, deploy, rồi chạy các ca QA giả đã định nghĩa. Cho tới lúc đó, Mốc 2 còn mở và chưa nghiệm thu.
