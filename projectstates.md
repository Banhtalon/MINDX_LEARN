# Trạng thái & Tiến độ Dự án MINDX LEARN (`projectstates.md`)

> **Tệp theo dõi nhanh dành cho AI ở đầu mỗi phiên làm việc.**
> - **Cập nhật lần cuối:** `14/11/2026`
> - **Quy tắc bắt buộc cho AI:** Đọc tệp này cùng [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) và [`changelog.md`](./changelog.md) đầu tiên khi vào phiên mới để nắm ngay tiến độ và sổ tay cách làm tính năng mà không cần đọc lại toàn bộ lịch sử. Sau mỗi lần thay đổi mã nguồn, cơ sở dữ liệu, triển khai hoặc hoàn thành hạng mục mới, AI **bắt buộc cập nhật lại cả `projectstates.md` và `changelog.md`**.

---

## 1. Trạng thái Môi trường Chính thức (PROD) Hiện tại

Theo quyết định của Owner ngày `22/10/2026` (*"Dùng luôn Supabase MINDX_LEARN và Vercel sẵn có"* và *"không giữ lại khung 14 buổi của khóa mẫu, sẽ upload lại chính xác hơn"*), dự án đã hoàn tất chuyển đổi sạch sang **Môi trường Chính thức (PROD)**, ngày `27/10/2026` đã hoàn tất **Nâng cấp Giao diện Toàn Hệ thống**, ngày `07/11/2026` hoàn tất **Tinh gọn UI trên `isLiveMode`**, và ngày `14/11/2026` đã khởi tạo khóa chính thức **PTI (14 buổi)** kèm **bộ 20 câu trắc nghiệm**, **Bài Thực hành 1 (`Ứng dụng Bộ Đếm Số — Click Counter`) cho Buổi 2 (Bản nháp)**, cơ chế **ẩn đáp án khi làm bài / làm lại, hiện đáp án + lời giải thích ngay sau khi nộp đủ bài**, và **khung hiển thị mã nguồn tối màu đa sắc chuẩn Antigravity IDE (`CodeBlock`)** trên cả trang Bài học lẫn trang Làm bài Quiz:

| Thành phần | Định danh / Địa chỉ đang chạy | Trạng thái |
|---|---|---|
| **Web chính thức (Vercel PROD)** | `https://mindx-learn-test.vercel.app` | **READY** (Đồng bộ qua `main` trên GitHub với toàn bộ giao diện `UI-01`..`UI-13`, khung code tô màu cú pháp chuẩn Antigravity trên `UI-12`/`UI-13`, bảng thực hành và quy trình ẩn/hiện đáp án Quiz mới) |
| **Supabase PROD** | Project `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`) | **ACTIVE** (`environment_mode = 'production'`, khóa cứng toàn bộ thao tác tạo dữ liệu giả `fixture`) |
| **Edge Function (`m2-backend`)** | **Version `22`** (`status: ACTIVE`, `verify_jwt: false`) | Bật `coordinatorFixtureLock` (`HTTP 403`), ẩn `explanation` với học sinh khi bootstrap và trả `answerReview` nguyên tử qua `submit-quiz` |
| **Migration mới nhất trên DB** | `20261114103000_m6_pti_session2_practice.sql` (cùng `20261114093000` & `20261114090000`) | Đã áp dụng trên `MINDX_LEARN` |
| **Bộ kiểm thử tự động (`npm test`)** | **391 / 391 PASS** (`npx tsc --noEmit` = `0` lỗi) | Toàn bộ `24` tệp kiểm thử đều xanh (`0` bỏ qua, gồm kiểm thử chạy trực tiếp trên PostgreSQL 17 & kiểm thử tô màu cú pháp tuyến tính $O(N)$) |
| **Hệ thống Thiết kế (Design System)** | [`design-system/mindx-learn/MASTER.md`](./design-system/mindx-learn/MASTER.md) & [`src/app/globals.css`](./src/app/globals.css) | **HOÀN THÀNH 100%** — Đồng bộ toàn bộ 19 màn hình với phong cách bo tròn hiện đại (`rounded-2xl`/`rounded-3xl`, xanh dương `#1d63ed`, ẩn chi tiết kỹ thuật trên PROD) |
| **Bản đồ Kiến trúc Mã nguồn (`graphify`)** | [`.graphifyignore`](./.graphifyignore), [`.agents/rules/graphify.md`](./.agents/rules/graphify.md), [`AGENTS.md`](./AGENTS.md), [`GEMINI.md`](./GEMINI.md) & `graphify-out/` (ẩn trong `.gitignore`) | **HOÀN THÀNH BƯỚC 3 — TỰ ĐỘNG HÓA OFFLINE 100% (`GRAPHIFY_BACKEND=none`, `--code-only`)** — `81/81` tệp mã nguồn hiện có (kể cả `16` tệp SQL), `1.006` nút, `2.660` liên kết, `39` cụm chức năng (`0` rò rỉ dữ liệu thật/session, `0` API ngoài) |

### Số lượng dữ liệu thực tế trong Database `MINDX_LEARN` hiện tại:
- **Tài khoản Quản trị viên (`profiles` / `auth.users`):** **`1`** (Chỉ giữ duy nhất tài khoản Owner: `quangctm07@gmail.com` — `Admin Quản Trị Hệ Thống`, `id: 2d99957f-8608-4366-ade3-094f0c40a904`).
- **Khóa học (`courses`) & Buổi học (`lessons`):**
  - **`2` khóa học chính thức (`28` buổi học):**
    1. **`JSB — Lập trình Web Cơ bản (HTML5, CSS3 & JavaScript Basic)`** (`id: 44444444-4444-4444-8444-444444444411`, `total_sessions = 14`, `is_fixture = false`):
       - **Buổi 1 (`published`):** **`Buổi 1: Website hoạt động như thế nào`** (`id: 55555555-5555-4555-8555-555555555511`, `has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`) — đã có giáo trình HTML5 kèm khung xem trước trực tiếp và **`6` câu trắc nghiệm (`quiz_questions`)**.
       - **Buổi 2 → Buổi 14 (`draft`):** Khung 13 buổi tiếp theo của lộ trình JSB (`55555555-5555-4555-8555-555555555512` → `5524`).
    2. **`PTI — Lập trình Ứng dụng Python Chuyên sâu (Python OOP & PyQt6)`** (`id: 44444444-4444-4444-8444-444444444423`, `total_sessions = 14`, `is_fixture = false`):
       - **Toàn bộ `14` buổi (`55555555-5555-4555-8555-555555555601` → `5614`) đang ở trạng thái Bản nháp (`draft`)** theo yêu cầu kiểm tra trước của Owner.
       - **Buổi 2 (`draft`):** **`Buổi 2: Python OOP & PyQt6`** (`id: 55555555-5555-4555-8555-555555555602`, `status = 'draft'`, `has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`) — đã nạp đủ **`20` câu trắc nghiệm (`Ôn Tập Buổi 2: Python OOP & PyQt6`) kèm lời giải thích (`explanation`)** và trọn vẹn **Bài Thực hành 1 (`Ứng dụng Bộ Đếm Số — Click Counter` với Qt Designer `counter.ui` & Python PyQt6 `main_bai1.py`)**.
- **Lớp học (`classes`) & Học sinh (`students`):** **`0` lớp**, **`0` học sinh**.
- **Bài nộp & Kết quả (`quiz_results`, `practice_submissions`, `m3_upload_reservations`):** **`0`**.
- **Cấu hình hạn mức Storage (`m5_storage_quota_config`):** `environment_mode = 'production'`, `warning_threshold_bytes = 734,003,200` (700 MB), `hard_limit_bytes = 838,860,800` (800 MB).

---

## 2. Quy chuẩn Lộ trình Khóa học (Đã cập nhật theo xác nhận của Owner 22/10/2026)

- **Thứ tự cấp độ chuẩn tại MindX (từ thấp lên cao):**
  $$\mathbf{Basic\ (B - Cơ\ bản,\ Thấp\ nhất)} \longrightarrow \mathbf{Advanced\ (A - Nâng\ cao,\ Cấp\ 2)} \longrightarrow \mathbf{Intensive\ (I - Chuyên\ sâu,\ Cao\ nhất)}$$
- **Áp dụng cho các bộ môn (mỗi khóa cố định 14 buổi):**
  - **Robotics (`ROB`):** `ROBB` (Basic — **thấp nhất**) → `ROBA` (Advanced) → `ROBI` (Intensive — cao nhất).
  - **Scratch (`C4K-S`):** `C4K-SB` (Basic — **thấp nhất khối Coding**) → `C4K-SA` (Advanced) → `C4K-SI` (Intensive).
  - **Game (`C4K-G`):** `C4K-GB` (Basic) → `C4K-GA` (Advanced) → `C4K-GI` (Intensive).
  - **Python / App (`C4K-PT`):** `C4K-PTB` (Basic) → `C4K-PTA` (Advanced) → `C4K-PTI` (Intensive).
  - **Web JavaScript (`JS`):** `JSB` (Basic) → `JSA` (Advanced) → `JSI` (Intensive).
  - **Computer Science (`CS`):** `CSB` (Basic) → `CSA` (Advanced) → `CSI` (Intensive).

---

## 3. Tiến độ Tổng thể 6 Mốc Dự án ([`PROJECT_PLAN.md`](./PROJECT_PLAN.md))

| Mốc | Nội dung chính | Trạng thái | Tài liệu bằng chứng |
|---|---|---|---|
| **Mốc 1** | Khung ứng dụng 13 màn hình (`UI-01`..`UI-13`), mô phỏng quy tắc 14 buổi và tiện ích đọc Teaching chỉ xem | **HOÀN THÀNH (100%)** | [`docs/M1_EVIDENCE.md`](./docs/M1_EVIDENCE.md) |
| **Mốc 2** | Đăng nhập thật Supabase Auth, phiên cookie mã hóa BFF, cấp mã PIN 8 chữ số 1 lần qua CSV, phân quyền RLS | **HOÀN THÀNH (100%)** | [`docs/M2_EVIDENCE.md`](./docs/M2_EVIDENCE.md) |
| **Mốc 3** | Khóa học 14 buổi cố định trên DB, làm Quiz (đạt `>= 70%`, giữ điểm cao nhất), nộp Thực hành (Link / Tệp riêng tư `<= 2 MB`), Giáo viên chấm duyệt | **HOÀN THÀNH (100%)** | [`docs/M3_EVIDENCE.md`](./docs/M3_EVIDENCE.md) |
| **Mốc 4** | Quy trình đọc phân trang DataTables từ Teaching, đối chiếu an toàn danh tính, xem trước (Preview) chênh lệch tại `UI-08` | **HOÀN THÀNH (100%)** | [`docs/M4_EVIDENCE.md`](./docs/M4_EVIDENCE.md) |
| **Mốc 5** | Đóng đợt học 14 buổi, xuất & kiểm tra toàn vẹn CSV tổng kết (`N học sinh × 14 dòng`), xóa tệp Storage + kết quả cũ theo lô, cổng hạn mức 700 MB / 800 MB | **HOÀN THÀNH (100%)** | [`docs/M5_EVIDENCE.md`](./docs/M5_EVIDENCE.md) |
| **Mốc 6 — Bước 1** | Kiểm thử tải **200 học sinh giả lập (10 ca × 20 học sinh đồng thời/ca)** và danh sách `>1.000` học sinh trên staging; rà soát bảo mật; báo cáo chi phí & lưu trữ | **HOÀN THÀNH (100%)** | [`docs/M6_EVIDENCE.md`](./docs/M6_EVIDENCE.md), [`docs/M6_HOSTING_COST_AND_RETENTION.md`](./docs/M6_HOSTING_COST_AND_RETENTION.md) |
| **Mốc 6 — Bước 2** | Xóa sạch 100% dữ liệu thử nghiệm và 2 khóa mẫu; chuyển `MINDX_LEARN` + `https://mindx-learn-test.vercel.app` sang PROD chính thức; mở khóa đồng bộ Teaching thật (`real_teaching_sync`) tại `/admin/sync` Tab 2 | **ĐÃ MỞ PROD SẠCH — CHỜ OWNER NHẬP KHÓA HỌC & ĐỒNG BỘ LỚP THẬT** | [`docs/M6_EVIDENCE.md`](./docs/M6_EVIDENCE.md), [`docs/M6_USER_GUIDE.md`](./docs/M6_USER_GUIDE.md) |

---

## 4. Công việc Tiếp theo (Next Actions cho Owner & AI)

1. **Tạo các khóa học 14 buổi chính thức (theo thứ tự `Basic` → `Advanced` → `Intensive`):**
   - Owner có thể tự tạo trên giao diện `/admin/courses` hoặc gửi nội dung/danh sách 14 buổi của từng khóa (`ROBB`, `ROBA`, `ROBI` hoặc các khóa Coding) để AI hỗ trợ nạp thẳng vào cơ sở dữ liệu chính thức.
2. **Chạy lượt đồng bộ lớp & học sinh thật đầu tiên từ `teaching.mindx.edu.vn`:**
   - Owner đăng nhập `https://mindx-learn-test.vercel.app/login` (`quangctm07@gmail.com`), vào `/admin/sync` (Tab 2), dùng Bookmarklet **`Đồng bộ MINDX LEARN (Thật)`** (hoặc tải tệp JSON) để xem bảng Preview và bấm **Áp dụng đồng bộ thật**.
3. **Gán khóa học cho lớp, phân công Giáo viên và phát CSV mã PIN 8 chữ số cho học sinh tại `/manage/classes`.**
