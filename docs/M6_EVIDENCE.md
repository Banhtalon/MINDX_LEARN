# Bằng chứng kỹ thuật và nghiệm thu Mốc 6 (Bước 1 Kiểm thử tải 200 học sinh & Bước 2 Mở môi trường chính thức PROD) — 22/10/2026

Tài liệu này ghi nhận toàn bộ kết quả thực hiện **Bước 1 (Kiểm thử tải 200 học sinh trên TEST)** và **Bước 2 (Chuyển đổi sạch dữ liệu & Mở môi trường chính thức PROD)** của **Mốc 6 — Kiểm thử web 200 học sinh và mở PROD** theo đúng quy định tại [`PROJECT_PLAN.md`](../PROJECT_PLAN.md) và [`docs/AI_AGENT_WORKFLOW.md`](./AI_AGENT_WORKFLOW.md).

---

## 1. Phạm vi, thông số tải và định danh bản triển khai Mốc 6 (TEST & PROD)

- **Tổng quy mô danh sách học sinh hỗ trợ:** Vượt mốc **200 học sinh** (và vượt ngưỡng **1.000 học sinh** của trang Teaching — đã kiểm thử trực tiếp trên **1.055 học sinh** nền + **200 học sinh** tải giả lập = **1.255 học sinh** ở Bước 1, cùng **1.250 học sinh** trong bộ kiểm thử phân trang tự động).
- **Mức tải đồng thời thực tế mỗi ca học (theo xác nhận của Owner):** **Tối đa 20 học sinh cùng lúc / 1 ca học** (`nhiều nhất sẽ là 20 em 1 ca`), kiểm thử trên tổng **200 tài khoản học sinh giả lập riêng biệt (10 ca × 20 học sinh đồng thời/ca)**.
- **Định danh các thành phần đã triển khai ở Bước 1 (Kiểm thử tải trên TEST):**
  - **Supabase Project:** `MINDX_LEARN` (Project Ref: `eythjapspkoyqdxlxtcd`)
  - **Database Migration Bước 1:** [`supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql`](../supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql) (`f49f32832fe704459cb51954201e0c1288af4f67912bc9c461321ad54c15853b`)
  - **Edge Function (`m2-backend`) ở Bước 1:** Version `17` (`ezbr_sha256`: `82ec753f7b442dfcddb87879c95ad27cb2a71716a934e73c900fa9d637c2b34e`)
  - **Vercel Preview ở Bước 1:** `dpl_5LFqyRA2YgCsNrJprrB8YEHEK2HC` (`https://mindx-learn-test-q2pug515z-quangctm07-5456s-projects.vercel.app`)
  - **Biên nhận kiểm thử tải 200 học sinh:** [`.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json`](../.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json)
- **Định danh bản triển khai chính thức ở Bước 2 (Mở môi trường chính thức PROD theo quyết định của Owner):**
  - **Quyết định của Owner:**
    1. *"Dùng luôn Supabase MINDX_LEARN và Vercel sẵn có"*
    2. *"không giữ lại khung 14 buổi của khóa mẫu, sẽ upload lại chính xác hơn"*
  - **Supabase PROD Project:** `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`)
  - **Database Migration chuyển đổi sạch PROD & mở khóa đồng bộ thật:** [`supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql`](../supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql)
    - SHA-256: `7048fa2aced03aa5db43f1b72eb226e595894cb94e556cdef2a004c034a07c83`
    - Phiên bản áp dụng trên Supabase (`appliedVersion`): `20261021172048`
  - **Supabase Edge Function (`m2-backend`) chính thức:**
    - Phiên bản đang chạy trên `eythjapspkoyqdxlxtcd`: **Version `18`** (`status: ACTIVE`, `verify_jwt: false`, `ezbr_sha256`: `5ab84c26530d9608249c268ada23eaa2a232eac9397b6e49ede5ab1e953e45db`)
    - Tệp nguồn [`supabase/functions/m2-backend/index.ts`](../supabase/functions/m2-backend/index.ts) SHA-256: `b014c045d2d836acfc65db308594a4e9fde93f2d7a20d31fa4dbbd4fc3e6fd68`
  - **Vercel Production chính thức:**
    - URL chính thức: `https://mindx-learn-test.vercel.app`
    - Deployment ID: `dpl_8fHhJpiSRZXS8V6PqQVj9DSTB4G6` (`target: production`, `readyState: READY`, Project `prj_T9SLafrAyOywnv8PGm821eYBVBT7`, Team `team_KjA2bxebH8S1hMts27rFbxn3`)
    - Manifest 50 tệp nguồn: `manifestSha256 = 8b50807d1b74495d434c1b73ab59f77532189cb4c2d71104c8fea5a432d7495f`
    - Biên nhận chuyển đổi & triển khai PROD: [`.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json`](../.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json)

---

## 2. Các hạng mục cứng hóa kỹ thuật đã triển khai ở Bước 1

### 2.1. Cơ sở dữ liệu & RLS (`supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql`)
Đã áp dụng trực tiếp lên dự án Supabase TEST `eythjapspkoyqdxlxtcd`:
1. **Chỉ mục mở rộng quy mô lớn (`>1.000` học sinh):**
   - `idx_profiles_role_status` trên `public.profiles(role, status)`
   - `idx_students_current_class_status` trên `public.students(current_class_id, status)`
2. **Tối ưu hóa bộ lập kế hoạch truy vấn PostgreSQL (`InitPlan` Caching) và giữ nguyên ranh giới phân quyền:**
   - Bọc các hàm kiểm tra phiên không tham số `(SELECT public.is_active_admin())`, `(SELECT public.current_role())`, `(SELECT public.current_profile_id())` trong các chính sách RLS của `profiles`, `classes`, `class_teachers`, `students`, `courses`, `lessons`, `quiz_results`, `practice_submissions` để PostgreSQL chỉ tính 1 lần mỗi câu lệnh thay vì tính lại trên từng dòng.
   - Trên bảng `public.courses`, chính sách `m3_courses_select_authenticated` giữ nguyên ranh giới phân quyền Giáo viên chỉ đọc được khóa học gắn với lớp đang phụ trách (`WHERE ct.teacher_profile_id = (SELECT public.current_profile_id()) AND c.course_id = courses.id AND c.status = 'active'`).
   - Giữ nguyên lời gọi hàm `SECURITY DEFINER` cho `public.is_teacher_of_class(...)` và `public.is_student_of_class(...)` để ngăn chặn triệt để lỗi đệ quy chính sách RLS (`42P17`).
3. **Hỗ trợ luồng tải tệp 2 bước của Supabase Storage (`public.m3_check_storage_insert_permission`):**
   - Khi dịch vụ `storage-api` của Supabase chèn dòng vào `storage.objects` trước khi truyền luồng dữ liệu lên S3 (`metadata` chưa có nên `p_object_size IS NULL`), hàm kiểm tra chặt `v_res.reserved_bytes > 0 AND v_res.reserved_bytes <= 2097152` (2 MB) và đối chiếu hạn mức 800 MB qua `COALESCE(p_object_size, v_res.reserved_bytes::bigint)`. Sau khi tệp tải xong, RPC `m3_submit_practice` tiếp tục đối chiếu kích thước thực tế trong `storage.objects.metadata->>'size'`.

### 2.2. Edge Function, BFF & Giao diện (`supabase/functions/m2-backend/index.ts`, `src/lib/server/crypto.mjs`, `src/lib/server/edge-client.ts`, `src/app/api/m2/[action]/route.ts`, `src/lib/store.tsx`, `src/app/layout.tsx`, `next.config.mjs`)
Đã triển khai lên Supabase TEST `eythjapspkoyqdxlxtcd` và Vercel Preview `dpl_5LFqyRA2YgCsNrJprrB8YEHEK2HC`:
1. **Phân trang tự động vượt ngưỡng 1.000 dòng (`fetchAllRows`):**
   - Hành động `bootstrap` và bộ kiểm tra toàn vẹn CSV Mốc 5 sử dụng `fetchAllRows` (`pageSize = 1000`) cho các bảng `students`, `profiles`, `quiz_results`, `practice_submissions`, đảm bảo danh sách `>1.000` học sinh không bao giờ bị cắt cụt ở dòng thứ 1.000 của PostgREST.
2. **Truy vấn đích danh theo khóa chính cho học sinh trong `bootstrap`:**
   - Khi học sinh mở ứng dụng, `bootstrap` lọc trực tiếp `.eq('id', actor.profileId)` trên bảng `students`, `.eq('id', myStudent.current_class_id)` trên bảng `classes`, và `.eq('course_id', studentClassCourseId)` trên bảng `lessons`, giúp thời gian phản hồi ổn định ngay cả khi cơ sở dữ liệu có hàng nghìn học sinh.
3. **Chịu tải đăng nhập và tải dữ liệu đồng thời 20 học sinh/ca ở cả 2 tầng (Edge & Next.js BFF):**
   - **Tại Edge Function (`supabase/functions/m2-backend/index.ts`, dòng 674–714):** Trong hành động `student-login-complete`, các lời gọi `updateUserById` và `signInWithPassword` tự động thử lại tối đa 3 lần (backoff có jitter) nếu dịch vụ Auth phát sinh lỗi mạng/máy chủ tạm thời (`5xx`) khi 20 học sinh bấm đăng nhập cùng lúc, và dừng ngay lập tức không thử lại đối với mọi mã lỗi `4xx` (`400`/`401`/`429`, như đã kiểm thử trực tiếp tại Test `1.3`).
   - **Tại Next.js BFF (`src/lib/server/edge-client.ts`, dòng 201–237):** Hàm `callEdgeFunction` tự động thử lại tối đa 3 lần đối với các hành động đọc idempotent (`bootstrap`, `session`, `m5-storage-quota-status`) khi kết nối tới Edge gặp lỗi mạng tạm thời hoặc phản hồi `HTTP >= 500`, và giữ nguyên việc không thử lại đối với mọi phản hồi `HTTP 4xx`.
4. **Cách ly tuyệt đối cấu hình TEST và PROD (Fail-closed ở cả Build, Startup, UI và API):**
   - Trong `src/lib/server/crypto.mjs`, `src/lib/server/edge-client.ts`, `src/lib/store.tsx`, `src/app/layout.tsx`, `next.config.mjs` và `supabase/functions/m2-backend/index.ts`:
     - Từ chối ngay lập tức nếu `MINDX_ENV`, `MINDX_APP_ENV`, hoặc `NEXT_PUBLIC_MINDX_ENV` chứa giá trị lạ hoặc mâu thuẫn nhau (ví dụ một biến là `test`, biến kia là `production`).
     - Bất kỳ cấu hình nào có `MINDX_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` hoặc `MINDX_SITE_URL` / `NEXT_PUBLIC_SITE_URL` khác với dự án TEST `eythjapspkoyqdxlxtcd` / `mindx-learn-test` đều tự động bị coi là **Production** ngay cả khi quên đặt `MINDX_ENV=production`.
     - Khi ở chế độ Production, hệ thống bắt buộc khai báo đầy đủ URL HTTPS chính thức và **chặn cứng (fail-closed)** ngay từ bước `next build` (`next.config.mjs`), khi khởi tạo `RootLayout` (`src/app/layout.tsx`), khi dựng `StoreProvider` (`src/lib/store.tsx`), và tại mọi route BFF nếu trỏ nhầm vào tài nguyên TEST hoặc bật `NEXT_PUBLIC_MINDX_DEMO=1`.
5. **Kiểm tra lỗi và hậu kiểm số dòng còn sót khi thu dọn dữ liệu kiểm thử (`coordinator-cleanup-m6-qa`):**
   - Hỗ trợ dải UUID của toàn bộ 200 tài khoản giả lập (`00000006(01[0-9]{2}|1[0-9]{3})` và `00000006(02[0-9]{2}|2[0-9]{3})`), kiểm tra lỗi trên từng bước đọc/xóa Storage, cơ sở dữ liệu và Auth, đồng thời truy vấn hậu kiểm `remainingTargetRows` trên `profiles`, `students`, `practice_submissions`, `m3_upload_reservations`, `quiz_results` (trả về `HTTP 500 CLEANUP_INCOMPLETE` nếu có bất kỳ lỗi xóa nào hoặc còn sót dòng mục tiêu).

---

## 3. Kết quả kiểm thử tự động & kiểm thử tải trực tiếp 200 tài khoản trên TEST

### 3.1. Bộ kiểm thử tự động (`npx tsc --noEmit` & `npm test`)
- **TypeScript (`npx tsc --noEmit`):** `0` lỗi.
- **Tổng số bài kiểm thử (`node --test tests/*.test.mjs`):** **380/380 đạt (PASS)** trên 23 bộ test, bao gồm 9 bài kiểm thử chuyên biệt của Mốc 6 tại [`tests/m6-staging-load-and-prod-readiness.test.mjs`](../tests/m6-staging-load-and-prod-readiness.test.mjs) và kiểm thử khóa cứng `coordinatorFixtureLock` tại [`tests/m2-teacher-connection.test.mjs`](../tests/m2-teacher-connection.test.mjs).

### 3.2. Kiểm thử tải 200 tài khoản (10 ca × 20 học sinh đồng thời/ca) và bảo mật trực tiếp qua HTTPS trên bản Preview Mốc 6
Biên nhận chi tiết (không chứa khóa bí mật hay dữ liệu cá nhân): [`.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json`](../.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json) (SHA-256: `7c8739e537a38511e3ca8fc83c5d2bb0010d96ba40a532e9f51022284dabb761`).

| Hạng mục nghiệm thu trực tiếp trên `dpl_5LFqyRA2YgCsNrJprrB8YEHEK2HC` | Kết quả | Chi tiết đo đạc thực tế |
|---|---|---|
| **1. Phân trang Admin `bootstrap` (>200 & >1.000 học sinh)** | **PASS** | `HTTP 200`, trả về đủ **35 lớp** và **1.055 học sinh** nền; sau khi khởi tạo thêm 200 học sinh giả lập trả về đủ **1.255 học sinh** (không bị cắt ở 1.000 dòng). |
| **2. Tải đồng thời 200 học sinh giả lập (10 ca × 20 học sinh đồng thời/ca)** | **PASS** | Kiểm thử toàn bộ **200 tài khoản học sinh riêng biệt (`TEST_M2QA_M6_S001..TEST_M2QA_M6_S200`)** chia thành **10 ca học**, mỗi ca **20 học sinh thực hiện đồng thời**: `200/200` đăng nhập PIN 8 số, `200/200` mở bài học (`bootstrap`, xác nhận đã ẩn đáp án `correctOptionIndex`), `200/200` nộp trắc nghiệm, `200/200` nộp thực hành, `200/200` Giáo viên A chấm duyệt thành công (thời gian trung bình mỗi luồng học sinh 4 bước: `15.987 ms`). |
| **3. Tải lên & tải xuống tệp thực hành riêng tư (PDF ≤ 2 MB)** | **PASS** | Đặt chỗ tải tệp, tải lên bucket riêng tư `m3-practice-files`, nộp bài và tải xuống qua `/api/m3/file` thành công (`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`). |
| **4. Chặn mã PIN yếu / 6 chữ số (`123456`)** | **PASS** | `POST /api/m2/student-login-prepare` với PIN `123456` bị chặn ngay với `HTTP 400`. |
| **5. Chống dò PIN theo từng tài khoản trên cùng IP phòng máy** | **PASS** | 1 tài khoản nhập sai PIN 6 lần nhận `HTTP 401`, lần thứ 7 bị khóa `HTTP 429`; học sinh kế bên trên cùng IP vẫn đăng nhập `HTTP 200` bình thường. |
| **6. Cách ly quyền Giáo viên trên danh sách khóa học & chấm bài (RBAC)** | **PASS** | Giáo viên A khi gọi `bootstrap` chỉ nhận đúng các khóa học thuộc lớp mình phụ trách (`teacherAssignedCoursesScopedOnly: true`); Giáo viên B (lớp khác) bị chặn khi chấm bài hoặc tải tệp của lớp Giáo viên A (`HTTP 403`). |
| **7. Chặn tải tệp khi chưa đăng nhập & chặn nâng quyền học sinh** | **PASS** | Khách chưa đăng nhập tải tệp nhận `HTTP 401`; học sinh tự chấm bài hoặc gọi preview đóng khóa Mốc 5 nhận `HTTP 403`; gọi action nội bộ qua BFF nhận `HTTP 404`. |
| **8. Mã PIN một lần (`no-store`) & thu hồi phiên cũ khi cấp lại PIN** | **PASS** | Phản hồi cấp lại PIN có `Cache-Control: no-store`; token phiên cũ của học sinh bị vô hiệu hóa ngay lập tức (`/api/m2/session` trả `user: null`, `/api/m2/bootstrap` trả `HTTP 401`). |
| **9. Dọn sạch 100% cả 200 tài khoản giả lập (Khôi phục nguyên trạng)** | **PASS** | Xóa sạch `200/200` hồ sơ, học sinh, bài nộp, tệp và tài khoản Auth (`remainingSyntheticRowsAfterCleanup: 0`). Số lượng bản ghi trước và sau khi chạy khớp tuyệt đối: `classes: 35`, `students: 1055`, `profiles: 1090`, `practice_submissions: 1`, `m3_upload_reservations: 2`. |

---

## 4. Kết quả Bước 2 — Chuyển đổi sạch dữ liệu & Mở môi trường chính thức (PROD)

Biên nhận chi tiết quá trình chuyển đổi PROD: [`.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json`](../.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json).

### 4.1. Thực thi Migration dọn sạch 100% dữ liệu thử nghiệm và mở khóa đồng bộ thật (`20261021235500_m6_prod_cutover_and_real_sync.sql`)
- **Xóa sạch 100% dữ liệu mẫu và tài khoản thử nghiệm:**
  - Xóa toàn bộ `1.055` học sinh giả, `35` lớp thử nghiệm, `34` tài khoản giáo viên/admin thử nghiệm (`@example.invalid`), `1.086` tài khoản `auth.users` thử nghiệm, toàn bộ bài nộp trắc nghiệm, bài thực hành, lịch sử đóng khóa thử nghiệm và cả **2 khóa mẫu 14 buổi** (`44444444-4444-4444-8444-444444444401`, `bb33f849-c640-4fa9-aede-71a1302d6166`) cùng `28` buổi học mẫu theo đúng yêu cầu của Owner.
  - **Chỉ giữ lại duy nhất tài khoản Quản trị viên (Admin) chính thức của Owner:**
    - `profile.id`: `2d99957f-8608-4366-ade3-094f0c40a904` (`Admin Quản Trị Hệ Thống`, `role: admin`, `status: active`, `is_fixture: false`, `m4_synced: false`)
    - `auth.users.id`: `e72ecd2a-f6d2-4a68-bd7e-1cda13243e21` (`email: quangctm07@gmail.com`)
- **Đặt trạng thái cơ sở dữ liệu sang Production & khóa cứng thao tác tạo dữ liệu giả:**
  - Cập nhật `public.m5_storage_quota_config` (`id = 'default'`): `environment_mode = 'production'`, `baseline_verified = true`, `org_baseline_bytes = 0`, `warning_threshold_bytes = 734003200` (700 MB), `hard_limit_bytes = 838860800` (800 MB).
  - Nâng cấp `public.m4_apply_teaching_sync_batch` hỗ trợ đồng thời cả `sourceMode = 'real_teaching_sync'` (cho phép áp dụng lớp và học sinh thật không gắn cờ `is_fixture`) và khóa tạo fixture khi `environment_mode = 'production'`.
  - Tại Edge Function (`m2-backend` Version `18`), hàm `coordinatorFixtureLock` chặn fail-closed (`HTTP 403 PRODUCTION_ENVIRONMENT_LOCKED`) đối với mọi lời gọi `coordinator-seed-fixture`, `coordinator-reset-fixture`, `coordinator-cleanup-m3-qa`.

### 4.2. Mở bảng điều khiển Đồng bộ Teaching thật tại `/admin/sync` (Tab 2) và triển khai Vercel Production
- Trên trang `/admin/sync` (Tab 2 — **Mốc 6 — Đồng bộ Lớp & Học sinh thật từ Teaching (PROD)**):
  - Cung cấp nút kéo-thả **Bookmarklet Đồng bộ MINDX LEARN (Thật)** lên thanh dấu trang trình duyệt (tự động nhận dữ liệu qua `window.opener.postMessage` từ `teaching.mindx.edu.vn`, không truyền mật khẩu hay cookie).
  - Cung cấp ô chọn tệp `.json` dự phòng nếu trình duyệt chặn cửa sổ bật lên.
  - Tự động lọc tiền tố `ROB`, đối chiếu danh sách lớp/học sinh hiện có, hiển thị bảng **Xem trước thay đổi (Diff Preview)** rõ ràng và chỉ lưu vào cơ sở dữ liệu sau khi Owner tích xác nhận và bấm **Áp dụng đồng bộ thật**.
- **Kết quả kiểm tra trực tiếp sau khi triển khai Production (`dpl_8fHhJpiSRZXS8V6PqQVj9DSTB4G6`):**
  - `GET https://mindx-learn-test.vercel.app/login` → `HTTP 200 OK`.
  - `POST https://eythjapspkoyqdxlxtcd.supabase.co/functions/v1/m2-backend` (`action: coordinator-seed-fixture`) → `HTTP 403 PRODUCTION_ENVIRONMENT_LOCKED`.
  - Đối chiếu số lượng dòng thực tế trên `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`):
    - `profiles_count = 1`, `auth_users_count = 1` (duy nhất tài khoản Owner `quangctm07@gmail.com`)
    - `courses_count = 0`, `lessons_count = 0`, `classes_count = 0`, `students_count = 0`, `quiz_results_count = 0`, `submissions_count = 0`, `reservations_count = 0`.

---

## 5. Bộ tài liệu bàn giao Mốc 6 và toàn vẹn tệp được bảo vệ

1. **Báo cáo chi phí duy trì & chính sách lưu trữ dữ liệu:** [`docs/M6_HOSTING_COST_AND_RETENTION.md`](./M6_HOSTING_COST_AND_RETENTION.md)
2. **Hướng dẫn sử dụng ngắn gọn (Admin / Giáo viên / Học sinh) & Quy trình mở PROD:** [`docs/M6_USER_GUIDE.md`](./M6_USER_GUIDE.md)
3. **Sổ cái kiểm toán độc lập Mốc 6:** [`docs/M6_REVIEW_LEDGER.md`](./M6_REVIEW_LEDGER.md)
4. **Kiểm tra toàn vẹn tệp được bảo vệ `teachingmindx-sync-trial.html`:**
   - SHA-256: `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5` (Khớp tuyệt đối, không thay đổi).
