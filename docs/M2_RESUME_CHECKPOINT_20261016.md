# M2 checkpoint — 16/10/2026

Đây là cập nhật trạng thái để tiếp tục Mốc 2, không phải nghiệm thu Mốc 2 và không thay thế các biên nhận lịch sử trong `M2_RUNTIME_RESULTS.json`. Không đánh dấu hoàn tất mục checklist nào trong bản cập nhật này.

## Thay đổi và kiểm tra mã

- Theo yêu cầu Owner, luồng thư mời giáo viên được thay bằng việc Admin tự tạo email/mật khẩu trong Supabase, sau đó kết nối tài khoản Auth sẵn có với hồ sơ Giáo viên và lớp.
- Sáu tệp thay đổi đã được commit và đẩy lên nhánh `codex/moc-2` tại `7d17cbd` (`feat: connect existing teacher accounts`). Commit tài liệu checkpoint trước đó là `1fa3eca`; Vercel dùng commit sản phẩm `7d17cbd`, còn manifest nguồn được lập tại source tree `1fa3eca`. SHA-256 của cả sáu tệp khớp bản đã được review độc lập:
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

- Supabase TEST `eythjapspkoyqdxlxtcd` đang chạy `m2-backend` v3, giữ `verify_jwt=false`; digest bundle `42b6289d6b8bec41af4c4fb6d1d63c9951781e2cb1a3fae974ed28549902a2ef`. Hai hash Edge E6 nằm trong receipt QA tập trung và `.workflow-local/m2/m2-edge-deploy-receipt-20261016.json`.
- API focused trên TEST đạt **19/19** ca: kết nối và đăng nhập Giáo viên bằng mật khẩu Auth cũ; UUID Auth được giữ nhưng không lộ trong DTO công khai; chặn người lạ, người chưa xác nhận, tài khoản đã liên kết và lớp đã có giáo viên; thử rollback giao dịch rồi kết nối lại. Chỉ fixture giả, không dùng giáo viên thật, không gửi email, không lưu mật khẩu. Receipt: `.workflow-local/m2/m2-teacher-connection-api-qa-20261016-focused.json`.
- Website TEST đã lên `READY`: deployment `dpl_CPipjdZPvZusTGngJvnW76TzLP5v`, alias `https://mindx-learn-test.vercel.app`, nguồn sản phẩm `7d17cbd0d99e02dbfa3355c532e4e1ffa752e331`. Deployment dùng project TEST `prj_T9SLafrAyOywnv8PGm821eYBVBT7`, team `team_KjA2bxebH8S1hMts27rFbxn3`, target Vercel `production` trong project TEST riêng. Gói nguồn đúng allowlist 42 tệp/692352 byte; manifest SHA-256 `86dd23d3f7f976b50acbc022c84aa2f71058bff9de5d3f1405071934708ee774`. Receipt: `.workflow-local/m2/vercel-deployment-receipt-e6-20261016.json`.
- Luồng Admin trên trình duyệt chưa được kiểm tra. Computer Use bị dừng trước khi trình duyệt mở với lỗi: `Computer Use has been stopped for this turn because browser URL policy enforcement is not yet supported for the current Windows browser. Stop your work and send a final message noting why Computer Use ended.` Không điều hướng, thao tác giao diện hay lưu ảnh; không thử đường thay thế. Receipt: `.workflow-local/m2/m2-ui-admin-qa-blocked-20261016.json`.
- Kiểm tra giao diện ở cả `1280×720`, `1440×900` và `1920×1080` vẫn là điều kiện bắt buộc đang chờ; API pass và deployment READY không thay thế bước này. Mốc 2 vẫn mở, chưa tick checklist và chưa nghiệm thu. Không dùng tài khoản/giáo viên thật, không gửi thư, không chuyển PROD hoặc Mốc 3–6.
- Fixture giao diện TEST giả đã sẵn sàng: một tài khoản Auth Giáo viên đã xác nhận nhưng chưa có hồ sơ/ánh xạ trong ứng dụng và một lớp trống. Không lưu mật khẩu, token hoặc ID Auth; không gửi thư. Biên nhận tổng hợp: `.workflow-local/m2/m2-teacher-ui-fixture-20261016.json`. Root đã gửi thông tin giả tối thiểu cho Owner để kiểm tra kết nối Admin; kết quả Owner đang chờ.
- Giữ riêng lịch sử: full C13 **FAILED 199/200**, nguyên nhân một lượt lỗi chưa rõ; C15 **focused 200/200 PASS**, không retry. C15 không đổi kết quả C13.

## Việc còn lại

- Reviewer độc lập đã đối chiếu receipt E6 và xác nhận phần kỹ thuật còn mở là thao tác Admin trên giao diện cùng ba kích thước bắt buộc.
- Khi Owner hoàn tất lượt kiểm tra Admin TEST, ghi lại kết quả kết nối và tải lại. Ba kích thước bắt buộc `1280×720`, `1440×900` và `1920×1080` vẫn phải được xác minh trước khi đóng tiêu chí; hiện chưa có ảnh hoặc kết quả giao diện vì Computer Use bị chặn trước khi mở trình duyệt.
- Giữ Mốc 2 chưa nghiệm thu cho tới khi có kết quả giao diện ba kích thước và quyết định reviewer/Owner. Không tự tick checklist.
