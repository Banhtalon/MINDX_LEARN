# Bằng chứng Mốc 2 — 14/10/2026

## Phạm vi và điểm bắt đầu

- Owner yêu cầu triển khai Mốc 2 và cấp quyền làm việc với project Supabase `eythjapspkoyqdxlxtcd`, URL https://supabase.com/dashboard/project/eythjapspkoyqdxlxtcd . Chỉ TEST/dữ liệu học sinh giả; không triển khai PROD hoặc tự chuyển Mốc 3–6.
- Baseline đã nghiệm thu Mốc 1: commit `e28f74f`. Nhánh triển khai `codex/moc-2`. Hai thay đổi tài liệu UI skill từ yêu cầu Owner được giữ nguyên và cập nhật nguồn đã xác minh.
- Bản sao trước Mốc 2 của PROJECT_PLAN.md, AGENTS.md và AI_AGENT_WORKFLOW.md tại `.workflow-local/m2/baseline-20261014/`. Hash kế hoạch `0A817E6C05EF2890FDF826B03EAAA4FE81E4118351B1F39856464D6C386AEAEB`.
- Supabase đọc trực tiếp: tên `MINDX_LEARN`, trạng thái ACTIVE_HEALTHY, Postgres 17.11; org `xobqmgowsyxuxcazpalm` tên `MindxTeach`, plan Free. Đếm ban đầu: 0 Auth users, 0 bảng public, 0 buckets và 0 objects. Các project khác không thay đổi. Danh sách project của connector không liệt kê project mới này nhưng truy vấn metadata/SQL theo ref được phép và hoạt động.
- Khóa công khai truy xuất bằng connector được giữ trong bộ nhớ công cụ; không đưa giá trị vào hồ sơ. Chưa lấy/hiển thị khóa quản trị. Secret máy chủ sẽ được cấu hình riêng sau khi worker bàn giao, không gửi worker/model hoặc ghi Git/log.

## Phân vai và gói việc

- Sol điều phối, đọc tài liệu, chạy kiểm tra, cấu hình/kết nối/triển khai; không viết mã ứng dụng, không tự tick.
- AGY 1.3.5: help/catalog xác nhận có `gemini-3.8-flash-high`, effort `high`; catalog không được coi là bằng chứng worker hoàn thành.
- Gói A: versioned migration, Edge backend, RLS và kiểm tra M2. Gói B: Next BFF, cookie mã hóa, Auth/UI và các thao tác quản lý M2 có lưu thật trong TEST. Hai tiến trình AGY được gọi đúng model/effort, accept-edits, thời hạn 15m; chỉ đọc/ghi file trong phạm vi, Sol chạy lệnh. Chưa có kết quả cuối tại thời điểm ghi.
- Gói/contract chi tiết ở `.workflow-local/m2/contract.md`, `worker-a.md`, `worker-b.md`; không có mật khẩu/PIN thật, khóa hoặc dữ liệu học sinh thật.
- Reviewer độc lập `m2_luna_review`, `gpt-6-luna`, effort `max`, fork none. Đã review kiến trúc: cookie chỉ chứa token Supabase đã mã hóa, PIN-derived Auth password gắn Auth UUID với pepper chỉ ở máy chủ Next, private mapping, limiter account/IP nguyên tử và quyền/status/session-version kiểm tra lại từ database. Chưa duyệt source hoặc tick M2.
- Migration được tạo bằng CLI Supabase 2.120.0 (help đã kiểm tra): `supabase/migrations/20261014111216_m2_identity.sql`. Chưa áp dụng lên cloud; chỉ áp dụng sau review.

## Skill giao diện và tài liệu

- Đã cài UI UX Pro Max/Taste từ đúng URL Owner cung cấp, commit nguồn trong `docs/AI_AGENT_WORKFLOW.md`. Search UIUX lần đầu thiên về operations landing/dark nên không dùng palette đó; retry learning management chọn nguyên tắc minimal/accessible, giữ nền sáng và xanh đã chốt. Không dùng kết quả font trẻ em/palette teal thay quyết định Owner. Stack query Next xác nhận validation/authorization ở server. Không thêm thư viện trang trí.
- Đã đọc hướng dẫn Next 16.4 về Auth, cookies async và route handlers trước khi giao worker. Supabase changelog có cập nhật TLS/hook/SDK; không dùng kiến thức cũ để đoán API. SDK đã xác minh registry: `@supabase/supabase-js` 2.117.3.
- Supabase SMTP mặc định chỉ gửi email tới thành viên tổ chức và có giới hạn thấp (2 email/giờ). Không gửi thư thử tới email học sinh/giáo viên giả; không tự đăng ký SMTP trả phí. Owner đã chỉ định email Admin trực tiếp; giá trị được dùng khi cấu hình Auth, không đưa vào gói worker hoặc báo cáo kiểm tra.

## Chưa kiểm chứng

Mọi checkbox Mốc 2 hiện chưa đủ bằng chứng: source, migration/RLS, Auth/phiên cũ, PIN/CSV một lần, thử tải 200 tài khoản giả, hosted UI và nghiệm thu Owner sẽ được cập nhật theo đúng bản chạy. Không dùng kết quả Mốc 1 để coi Mốc 2 đạt.
