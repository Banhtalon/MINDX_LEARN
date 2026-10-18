# M2 checkpoint — cập nhật 18/10/2026

Đây là checkpoint tiếp tục Mốc 2. Kết quả tại thời điểm 16/10 được giữ bên dưới làm lịch sử; trạng thái mới nhất ngày 18/10 nằm ở mục đầu và không thay thế các biên nhận lịch sử trong `M2_RUNTIME_RESULTS.json`.

## Trạng thái mới nhất — 18/10/2026

- Reviewer độc lập PASS cổng UI Admin TEST tại `1280×720`, `1440×900`, `1920×1080`; checklist kỹ thuật M2 là 9/9 và tiêu chí Owner 4/4. Chỉ TEST, không mở PROD và không bắt đầu Mốc 3.
- Lượt UI chỉ kiểm tra fixture giả `c4678` và hộp thoại kết nối để trống. Cả ba kích thước không có cuộn ngang; mỗi danh sách khớp đúng một dòng fixture; 2 ô nhập để trống, 25 checkbox đều không chọn. Ở `1280×720`, nút Hủy ban đầu dưới mép nhưng nhấn Tab đưa nút vào vùng nhìn; Hủy đóng hộp thoại và giữ nguyên route/fixture. Các kích thước 1440 và 1920 cũng được reviewer xác nhận.
- Ảnh bằng chứng được hiển thị trực tiếp trong phiên công cụ, không lưu thành tệp ảnh. Biên nhận phép đo và các giới hạn ảnh: `scratch/m2-ui-viewport-20261018/viewport-receipt.json`. Biên nhận Vercel/source chỉ đọc: `scratch/m2-ui-viewport-20261018/hosted-source-receipt.json`.
- Vercel xác nhận alias TEST vẫn trỏ vào deployment production của project TEST `dpl_CPipjdZPvZusTGngJvnW76TzLP5v` (`READY`, source commit `7d17cbd0d99e02dbfa3355c532e4e1ffa752e331`). 42/42 tệp trong allowlist E6 khớp SHA-256; không có thay đổi mã sản phẩm hoặc triển khai mới. HEAD local khi đối chiếu là `8a6b6edd0dcaaf125581e880e4b1eeb7961c5a41`; thay đổi sau product commit là tài liệu.
- Giữ riêng full C13 **FAILED 199/200**, nguyên nhân một lần lỗi chưa rõ, và C15 **focused PASS 200/200**; không retry C13. Việc PASS UI không làm thay đổi các kết quả lịch sử này.

## Nội dung đã xác minh tại checkpoint 16/10 (giữ lịch sử)

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
- Computer Use của AI bị dừng trước khi trình duyệt mở với lỗi: `Computer Use has been stopped for this turn because browser URL policy enforcement is not yet supported for the current Windows browser. Stop your work and send a final message noting why Computer Use ended.` Không có thao tác browser hoặc ảnh do AI lưu; receipt: `.workflow-local/m2/m2-ui-admin-qa-blocked-20261016.json`. Owner đã trực tiếp xác nhận kết nối fixture giả và tải lại vẫn thấy Giáo viên cùng lớp: “Kết nối được, tải lại vẫn thấy giáo viên và lớp”. Receipt xác nhận Owner: `.workflow-local/m2/m2-owner-admin-ui-confirmation-20261016.json`.
- Ba kích thước `1280×720`, `1440×900` và `1920×1080` vẫn là điều kiện bắt buộc đang chờ. Mốc 2 vẫn mở, chưa tick checklist và chưa nghiệm thu. Không dùng tài khoản/giáo viên thật, không gửi thư, không chuyển PROD hoặc Mốc 3–6.
- Fixture giao diện TEST giả ban đầu gồm tài khoản Auth Giáo viên đã xác nhận nhưng chưa có hồ sơ/ánh xạ trong ứng dụng và một lớp trống. Owner đã kết nối fixture này; không dọn hoặc xóa dữ liệu đã liên kết. Receipt khởi tạo: `.workflow-local/m2/m2-teacher-ui-fixture-20261016.json`; không lưu mật khẩu, token hoặc ID Auth, không gửi thư.
- Giữ riêng lịch sử: full C13 **FAILED 199/200**, nguyên nhân một lượt lỗi chưa rõ; C15 **focused 200/200 PASS**, không retry. C15 không đổi kết quả C13.

## Việc còn lại tại thời điểm 16/10 (đã cập nhật 18/10)

- Reviewer độc lập đã đối chiếu receipt E6 và xác nhận phần còn mở là các kích thước Admin bắt buộc.
- Owner đã xác nhận thao tác kết nối/tải lại trên TEST; cần hoàn tất kiểm tra `1280×720`, `1440×900` và `1920×1080`. Hiện chưa có ảnh do Computer Use bị chặn trước khi trình duyệt mở.
- Giữ Mốc 2 chưa nghiệm thu cho tới khi có kết quả giao diện ba kích thước và quyết định reviewer/Owner. Không tự tick checklist.

## Tiếp tục từ checkpoint 18/10

- Các gạch đầu dòng trong mục 16/10 phía trên là ảnh chụp lịch sử trước lượt UI và review độc lập; trạng thái hiện tại là PASS 9/9 kỹ thuật và 4/4 Owner như ghi ở đầu tệp.
- Giữ PR #1 mở ở trạng thái nháp; không merge. Chỉ TEST, không mở PROD hoặc bắt đầu Mốc 3.
