# Trạng thái & Tiến độ Dự án MINDX LEARN (`projectstates.md`)

> **Tệp theo dõi nhanh dành cho AI ở đầu mỗi phiên làm việc.**
> - **Cập nhật lần cuối:** `27/10/2026`
> - **Quy tắc bắt buộc cho AI:** Đọc tệp này cùng [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) và [`changelog.md`](./changelog.md) đầu tiên khi vào phiên mới để nắm ngay tiến độ và sổ tay cách làm tính năng mà không cần đọc lại toàn bộ lịch sử. Sau mỗi lần thay đổi mã nguồn, cơ sở dữ liệu, triển khai hoặc hoàn thành hạng mục mới, AI **bắt buộc cập nhật lại cả `projectstates.md` và `changelog.md`**.

---

## 1. Trạng thái Môi trường Chính thức (PROD) Hiện tại

Theo quyết định của Owner ngày `22/10/2026` (*"Dùng luôn Supabase MINDX_LEARN và Vercel sẵn có"* và *"không giữ lại khung 14 buổi của khóa mẫu, sẽ upload lại chính xác hơn"*), dự án đã hoàn tất chuyển đổi sạch sang **Môi trường Chính thức (PROD)** và ngày `27/10/2026` đã hoàn tất **Nâng cấp Giao diện Toàn Hệ thống (Hướng 3 — Redesign 19 màn hình theo Master Design System)**:

| Thành phần | Định danh / Địa chỉ đang chạy | Trạng thái |
|---|---|---|
| **Web chính thức (Vercel PROD)** | `https://mindx-learn-test.vercel.app` | **READY** (Đã đồng bộ giao diện mới toàn hệ thống `UI-01`..`UI-13` theo [`design-system/mindx-learn/MASTER.md`](./design-system/mindx-learn/MASTER.md)) |
| **Supabase PROD** | Project `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`) | **ACTIVE** (`environment_mode = 'production'`, khóa cứng toàn bộ thao tác tạo dữ liệu giả `fixture`) |
| **Edge Function (`m2-backend`)** | **Version `18`** (`status: ACTIVE`, `verify_jwt: false`) | Đã bật `coordinatorFixtureLock` (`HTTP 403 PRODUCTION_ENVIRONMENT_LOCKED` với mọi yêu cầu tạo/reset fixture) |
| **Migration mới nhất trên DB** | `20261022153000_m6_jsb_course_session1_curriculum.sql` | Đã áp dụng trên `MINDX_LEARN` |
| **Bộ kiểm thử tự động (`npm test`)** | **381 / 381 PASS** (`npx tsc --noEmit` = `0` lỗi) | Toàn bộ 23 tệp kiểm thử từ Mốc 1 → Mốc 6 đều xanh |
| **Hệ thống Thiết kế (Design System)** | [`design-system/mindx-learn/MASTER.md`](./design-system/mindx-learn/MASTER.md) & [`src/app/globals.css`](./src/app/globals.css) | **HOÀN THÀNH 100%** — Đồng bộ toàn bộ 4 đợt giao diện (Khung chung, Học sinh, Giáo viên/Lớp, Admin) với chuẩn `UI-01` |

### Số lượng dữ liệu thực tế trong Database `MINDX_LEARN` hiện tại:
- **Tài khoản Quản trị viên (`profiles` / `auth.users`):** **`1`** (Chỉ giữ duy nhất tài khoản Owner: `quangctm07@gmail.com` — `Admin Quản Trị Hệ Thống`, `id: 2d99957f-8608-4366-ade3-094f0c40a904`).
- **Khóa học (`courses`) & Buổi học (`lessons`):**
  - **`1` khóa học chính thức:** **`JSB — Lập trình Web Cơ bản (HTML5, CSS3 & JavaScript Basic)`** (`id: 44444444-4444-4444-8444-444444444411`, `total_sessions = 14`, `is_fixture = false`).
  - **`14` buổi học (`lessons`):**
    - **Buổi 1 (`published`):** **`Buổi 1: Website hoạt động như thế nào`** (`id: 55555555-5555-4555-8555-555555555511`, `has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`) — đã có giáo trình chi tiết 4 mục tiêu, ví dụ trang web HTML5 giới thiệu bản thân kèm khung xem trước trực tiếp trên trình duyệt, đề bài thực hành và **`6` câu trắc nghiệm (`quiz_questions`)**.
    - **Buổi 2 → Buổi 14 (`draft`):** Đã khởi tạo khung tên 13 buổi tiếp theo của lộ trình JSB (`55555555-5555-4555-8555-555555555512` → `5524`).
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
