# Bằng chứng Mốc 3 — cập nhật 20/10/2026

## 1. Trạng thái tổng hợp

- **Kết luận hiện tại:** Các tiêu chí kỹ thuật Mốc 3 trên môi trường TEST đạt **7/7** và mục nghiệm thu của Owner đạt **3/3** (theo ủy quyền trực tiếp của Owner ngày 20/10/2026: *“Đồng ý chốt Mốc 3, ủy quyền AI”*).
- **Môi trường kiểm chứng:**
  - **Supabase TEST:** Project `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`, `ap-northeast-2`, trạng thái `ACTIVE_HEALTHY`), chỉ chứa dữ liệu học sinh/lớp giả (`is_fixture = true`).
  - **Edge Function:** `m2-backend` **v5 ACTIVE** (`verify_jwt=false`), bundle digest `0bdc65124d0a8c5d9db9f92ed06e55aeab2fb8188ea3f4880719f3dd2398087d`.
  - **Vercel TEST (Mốc 3):** Deployment `dpl_H3yNw1AouwxegXyzj18tnx7HA8uN` (`READY`), đã được kiểm tra trên URL Preview riêng `https://mindx-learn-test-fobp7azrn-quangctm07-5456s-projects.vercel.app` và sau khi Owner chốt Mốc 3 đã được gắn lên tên miền TEST chính thức `https://mindx-learn-test.vercel.app` (kiểm tra sau khi gắn alias: `/login` `200`, `/api/m2/session` `200`, `staff-login` `200`, `/api/m2/bootstrap` `200` với `coursesCount=2`, `lessonsCount=28`), gói 44 tệp sản phẩm (SHA-256 `6CE8475E2096554225B41DFCF06F77BACA105DD1FEB39650E0B28C625590AA78`).
- **Tài liệu rà soát độc lập:** [M3_REVIEW.md](M3_REVIEW.md).

---

## 2. Database Migrations & Bảo mật RLS / Storage trên TEST

1. **Migration nền tảng Mốc 3:**
   - Tệp: `supabase/migrations/20261019031910_m3_courses_quiz_practice.sql` (81,550 bytes, SHA-256 `241F3FF490E8310D21B290EE59C56021ECC20F65CC47333320B8C1B42965A234`).
   - Thiết lập bảng khóa học 14 buổi cố định (`courses`, `lessons` với ràng buộc `session_number BETWEEN 1 AND 14`), kết quả trắc nghiệm (`quiz_results`), bài nộp thực hành (`practice_submissions`), giữ chỗ dung lượng tải tệp (`m3_upload_reservations`), bucket riêng tư `m3-practice-files` (giới hạn 2 MiB) và các chính sách RLS tương ứng.
2. **Migration vá lỗi runtime RPC & Storage RLS trên TEST:**
   - Tệp: `supabase/migrations/20261020035000_m3_rpc_and_storage_rls_runtime_fix.sql` (SHA-256 `21F2C7A4CE45CF6406BD95F124E904F25334D26315681823644FA95DE0282F76`), đồng bộ từ bản vá đã áp dụng trên TEST `.workflow-local/m3/m3-rpc-ambiguity-fix-20261020.sql` (SHA-256 `4CE1FFB7CA97939CED51FC06A1F83B39F24D4D3529D6D767209AAE26B7C4986A`) và đã ghi nhận vào `supabase_migrations.schema_migrations` (`version = '20261020035000'`, `name = 'm3_rpc_and_storage_rls_runtime_fix'`, tổng cộng 6 migrations trên TEST).
   - Khắc phục triệt để lỗi PostgreSQL `42702` (xung đột tên cột `RETURNS TABLE` với cột bảng trong PL/pgSQL) bằng `#variable_conflict use_column` và định danh bảng tường minh trên 8 hàm RPC M3 (`m3_save_class`, `m3_save_lesson`, `m3_grade_submission`, `m3_reopen_submission`, `m3_submit_practice`, `m3_transfer_student`, `m3_reserve_practice_upload`, `m3_cleanup_stale_reservations`).
   - Bổ sung schema `extensions` vào `search_path` của `m3_reserve_practice_upload` để gọi `extensions.gen_random_bytes(16)`.
   - Định danh tường minh `objects.name` trong policy `m3_storage_select_policy` trên `storage.objects` để tránh xung đột với cột `c.name` (`public.classes.name`) khi học sinh chủ bài nộp và giáo viên phụ trách lớp tải tệp qua `/api/m3/file`.

---

## 3. Kết quả Cổng Kiểm tra Cục bộ (Local Gates)

- **TypeScript Typecheck:** `npm run typecheck -- --pretty false --incremental false` -> **PASS** (exit `0`).
- **Next.js Production Build:** `npm run build` -> **PASS** (exit `0`, 16/16 trang tĩnh và các route API `/api/m2/[action]`, `/api/m3/file`).
- **Bộ kiểm thử M3 & Store Bootstrap:**
  - `tests/m3-learning-flow.test.mjs` & bộ kiểm thử tích hợp M2/M3: **32/32 PASS** (exit `0`).
  - `tests/m3-store-bootstrap.test.mjs`: **2/2 PASS** (exit `0`).
- **Bộ kiểm thử Mock cho Helper QA14:**
  - `.workflow-local/m3/scripts/m3-course-visibility-qa.mjs` (SHA-256 `62709011E16F08CFE61E7FD2857905A9D1F630E719604ADD91F13F8F28C50BB9`)
  - `.workflow-local/m3/scripts/m3-course-visibility-qa.test.mjs` (SHA-256 `08B4471741849B00127780A6086B9B2FB40D8974619E79C990F5C643B4D96E75`)
  - Kết quả: **28/28 PASS** (`node --test --test-isolation=none --test-reporter=spec .workflow-local/m3/scripts/m3-course-visibility-qa.test.mjs`, exit `0`).

---

## 4. Bằng chứng Nghiệm thu Trực tiếp trên Môi trường TEST (Hosted Runtime)

Chi tiết đầy đủ lưu tại `.workflow-local/m3/browser-evidence/receipt-20261020-qa14-live-visibility-and-restore.md` và `.workflow-local/m3/fixture-runtime/m3-course-visibility-m3-20261019-qa01.json` (SHA-256 `D39002A0551671F308DEA0392AFCC57215DE27453195FCA3680C21BF128479CF`):

1. **Khóa học 14 vị trí cố định, phân quyền hiển thị Nháp/Xuất bản theo vai trò và khôi phục an toàn (QA14):**
   - Admin tạo khóa học fixture `TEST_M3_QA` (`bb33f849-c640-4fa9-aede-71a1302d6166`) tự động sinh đúng **14 buổi cố định (`sessionNumber` 1..14, `status: "draft"`)**.
   - Khi gán tạm `TEST_M3_QA` cho 2 lớp `ROB-K14-01` và `ROB-K14-02` và chỉ xuất bản Buổi 1 (`87fa41e8-6e41-418a-a005-e3f97b303e2f`):
     - `teacher_a` chỉ thấy lớp `ROB-K14-01` (không lộ `ROB-K14-02`) và thấy đủ `14/14` buổi (`1` published, `13` draft).
     - `teacher_b` chỉ thấy lớp `ROB-K14-02` (không lộ `ROB-K14-01`) và thấy đủ `14/14` buổi (`1` published, `13` draft).
     - `student_a` và `student_b` chỉ thấy đúng `1/14` buổi đã xuất bản (`0` buổi nháp bị lộ).
   - Khi Học sinh mở trực tiếp URL của một buổi đang nháp (`/student/lessons/fbe6ee91-d967-4257-86b6-74315e1b5bab` — Buổi 4 nháp trên khóa chuẩn): giao diện chặn và chỉ hiển thị thông báo *“Bài học chưa xuất bản”*, không lộ nội dung bài nháp (`.workflow-local/m3/browser-evidence/receipt-20261020-preview-draft-direct-route-qa.md`).
   - Sau khi kiểm tra, lệnh `--restore --execute --retain-test-fixture` đã khôi phục 2 lớp về khóa gốc `44444444-4444-4444-8444-444444444401` và đưa Buổi 1 của `TEST_M3_QA` về `draft` (`status: "restore_succeeded"`, đủ 16 stages).

2. **Luồng Trắc nghiệm (Quiz — ngưỡng 70%, làm lại không giới hạn, giữ điểm cao nhất):**
   - Trên Buổi 1 (`55555555-5555-4555-8555-555555555501`), `student_a` nộp lần 1 sai (`[1, 1]` -> `score=0`, `highestScore=0`, `passed=false`, `attemptsCount=1`); nộp lần 2 đúng hết (`[0, 0]` -> `score=100`, `highestScore=100`, `passed=true`, `attemptsCount=2`); nộp lại lần 3 điểm thấp hơn (`[0, 1]` -> `score=50`, **`highestScore=100`**, **`passed=true`**, `attemptsCount=3`).
   - Nộp Quiz vào bài học đang nháp (`87fa41e8-6e41-418a-a005-e3f97b303e2f`) bị máy chủ từ chối (`HTTP 400`, `QUIZ_SUBMIT_FAILED`).
   - Đáp án đúng (`correctIndex`) được lọc bỏ ở máy chủ trước khi trả dữ liệu bài học cho Học sinh.

3. **Luồng Thực hành, Tải tệp tối đa 2 MiB & Phân quyền `/api/m3/file`:**
   - Trên Buổi 2 (`55555555-5555-4555-8555-555555555502`, chế độ `file_allowed`):
     - Nộp link `javascript:alert(1)` bị chặn (`HTTP 400`, `INVALID_LINK_SCHEME`).
     - Tải lên `malware.exe` bị chặn (`HTTP 400`, `FILE_VALIDATION_FAILED`).
     - Tải lên tệp `2,097,153` bytes (`2 MiB + 1B`) bị chặn (`HTTP 400`, `FILE_TOO_LARGE`).
     - Tải lên tệp `.txt` đúng `2,097,152` bytes (`2 MiB`) được chấp nhận (`HTTP 200`) và gắn vào bài nộp thực hành (`status: "submitted"`, `canResubmit: true`).
   - Kiểm tra tải tệp qua `GET /api/m3/file`:
     - `student_a` (chủ bài nộp), `teacher_a` (giáo viên phụ trách lớp `ROB-K14-01`), và `admin` tải thành công (`HTTP 200`) kèm các header bảo mật bắt buộc: `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-cache, no-store, must-revalidate`.
     - `student_b` (học sinh khác) và `teacher_b` (giáo viên lớp khác) bị từ chối (`HTTP 403`).

4. **Luồng Giáo viên chấm bài, Khóa nộp lại khi Đạt, Mở lại quyền nộp (`reopen-submission`) & Reset tiến độ:**
   - `teacher_b` (không phụ trách lớp của `student_a`) gọi chấm bài bị chặn (`HTTP 400`, `GRADE_FAILED`).
   - `teacher_a` (phụ trách lớp) chấm **Đạt (`approved`)** (`HTTP 200`, `status: "approved"`, `canResubmit: false`).
   - Khi bài đang ở trạng thái Đạt và chưa được mở lại: `student_a` gọi upload tệp mới bị chặn (`HTTP 403`, `CANNOT_RESUBMIT_APPROVED`) và gọi nộp lại bị chặn (`HTTP 400`, `CANNOT_RESUBMIT_APPROVED`).
   - `teacher_a` thử hạ trực tiếp từ `approved` xuống `needs_revision` bị chặn (`HTTP 400`, `GRADE_FAILED`).
   - `teacher_a` gọi `POST /api/m2/reopen-submission` (`HTTP 200`): bài giữ trạng thái `status: "approved"` nhưng mở `canResubmit: true`.
   - `student_a` nộp bản thay thế mới (`HTTP 200`): trạng thái chuyển về `status: "submitted"`, `canResubmit: true`, và đường dẫn tệp cũ lập tức bị thu hồi quyền truy cập (`GET /api/m3/file` trả `HTTP 403`).
   - Cuối phiên kiểm tra, Admin gọi `POST /api/m2/reset-student-progress` cho `student_a` (`HTTP 200`), đưa số kết quả Quiz và bài nộp Thực hành của `student_a` về `0`.

5. **Kiểm tra giao diện trình duyệt (Desktop 1280×720, 1440×900, 1920×1080 & Reload):**
   - Giao diện tổng quan khóa học và danh sách 14 buổi không bị tràn ngang ở cả 3 kích thước `1280×720`, `1440×900`, `1920×1080` (`scrollWidth <= innerWidth`).
   - Học sinh đăng nhập và tải lại trang (`reload`) trên Preview giữ nguyên phiên làm việc, lớp `ROB-K14-01`, khóa Robotics K14 và nhãn tiến độ `Đã hoàn thành X/14 buổi` (`.workflow-local/m3/browser-evidence/receipt-20261019-preview-logout-race.md`).
   - Giáo viên đăng nhập trên Preview sau khi triển khai Edge `v5` hiển thị đúng lớp phụ trách và danh sách học sinh trong lớp (`.workflow-local/m3/browser-evidence/receipt-20261019-preview-teacher-after-edge-v5.md`).

---

## 5. Nghiệm thu của Owner (Theo ủy quyền)

Ngày 20/10/2026, sau khi xem báo cáo kết quả kiểm tra tự động và hướng dẫn thao tác, Owner đã xác nhận: **“Đồng ý chốt Mốc 3, ủy quyền AI”**.

- Cả 3 mục nghiệm thu của Owner tại Mốc 3 trong [PROJECT_PLAN.md](../PROJECT_PLAN.md) được đánh dấu hoàn thành dựa trên bằng chứng kiểm tra tự động theo ủy quyền của Owner (phân biệt rõ với thao tác bấm tay trực tiếp của Owner).
- Không có mật khẩu, mã PIN, cookie, JWT hay dữ liệu học sinh thật nào được lưu trong tài liệu, nhật ký hoặc kho Git.
