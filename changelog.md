# Nhật ký Phát triển Sản phẩm & Sổ tay Triển khai Tính năng (`changelog.md`)

> **Tài liệu theo dõi lịch sử phát triển tính năng và hướng dẫn cách làm (Playbook) dành cho AI & Đội phát triển.**
> - **Mục đích:** Giúp AI nắm nhanh lịch sử tiến hóa của sản phẩm qua từng mốc, biết mỗi tính năng đang nằm ở tệp nào, hoạt động ra sao và **cách chuẩn nhất để phát triển/mở rộng tính năng mới** mà không làm hỏng hệ thống đang chạy thật (PROD).
> - **Quy tắc bắt buộc cho AI:** Đọc tệp này cùng [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) và [`projectstates.md`](./projectstates.md) ở đầu mỗi phiên làm việc. Sau mỗi lần thêm tính năng, nạp giáo trình hoặc cập nhật hệ thống, **bắt buộc ghi thêm mục mới vào Phần 1 của `changelog.md`**.

---

## Phần 1 — Nhật ký Phát triển Sản phẩm (Theo thứ tự mới nhất ở trên)

### [2026-10-27] — Áp dụng Hệ thống Thiết kế "MindX Learn High-Contrast Educational System" (Public Sans, High-Contrast Navy & Royal Blue)
- **Mục tiêu:** Cập nhật toàn bộ bảng màu, phông chữ (`Public Sans`), đường viền sắc nét (`1.5px solid #CBD5E1`) và phong cách học thuật độ tương phản cao (**MindX Learn High-Contrast Educational System**) theo đúng ảnh mẫu và bộ thông số thiết kế của Owner, giữ nguyên 100% logic nghiệp vụ và không thêm phần tử dư thừa.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Cập nhật Master Design System (`design-system/mindx-learn/MASTER.md`, `src/app/layout.tsx`, `src/app/globals.css`):**
     - Tích hợp phông chữ **Public Sans** (`400`, `500`, `600`, `700`, `800`) qua `next/font/google`.
     - Áp dụng bảng màu học thuật độ tương phản cao: nền `#f8f9ff`, chữ chính Deep Academic Navy `#0b1c30` / `#0f233a`, nút tương tác Royal Blue `#1e40af`, viền cấu trúc `#cbd5e1` (`1.5px`), loại bỏ hoàn toàn các bóng đổ mờ (`blurry drop shadows`) và bo góc quá tròn.
     - Tiêu đề bảng dữ liệu (`table thead`) dùng nền `#f1f5f9` kèm đường viền đáy đậm `2px solid #0f233a`.
  2. **Thanh điều hướng (`src/components/navbar.tsx`), Hộp thoại (`src/components/modal.tsx`), Trang chủ (`src/app/page.tsx`) & Đăng nhập (`src/app/login/page.tsx`):**
     - `Navbar`: Logo vuông `#0b1c30`, thanh menu gạch chân sắc nét (`border-b-[2.5px] border-[#0b1c30]`), huy hiệu vai trò độ tương phản cao (`Học sinh` `#1d4ed8`, `Giảng viên` `#047857`, `Quản trị viên` `#6d28d9`).
     - `HomePage` (`/`): Khớp với ảnh mẫu của Owner — thẻ Hero viền `#cbd5e1`, 3 thẻ khu vực có huy hiệu góc phải (`HỌC SINH`, `GIẢNG VIÊN`, `QUẢN TRỊ`), và 3 thẻ lộ trình 14 buổi (`Basic` xanh dương, `Advanced` vàng hổ phách, `Intensive` đỏ hồng) kèm danh sách `MÃ HỌC PHẦN`.
     - `Modal`: Viền đậm `2px solid #0f233a` kèm bóng khối cứng `shadow-[4px_4px_0px_#0f233a]`.

---

### [2026-10-27] — Thiết kế lại Toàn bộ 19 Màn hình MINDX LEARN theo Master Design System (Dembrandt + Genjutsu + UI UX Pro Max & Taste Skill)
- **Mục tiêu:** Giải quyết triệt để tình trạng giao diện chưa đồng bộ giữa Trang Đăng nhập mới (`UI-01`) và các trang bên trong; loại bỏ các dải cảnh báo môi trường/mã kỹ thuật gây rối mắt và thiết lập một **Master Design System** thống nhất cho toàn bộ 19 màn hình của hệ thống.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Xây dựng Master Design System (`design-system/mindx-learn/MASTER.md` & `src/app/globals.css`):**
     - Trích xuất bộ **Design Tokens chuẩn (Dembrandt / Genjutsu DNA)** từ màn hình Đăng nhập `UI-01`: nền sáng dịu `#f8fafc`, thẻ trắng tinh khiết `#ffffff`, xanh dương chủ đạo `#1d63ed` (`hover: #154ec2`), nút quản trị đen than `#0f172a`, chữ chính `#0f172a`, chữ phụ `#64748b`.
     - Chuẩn hóa hệ thống bo góc & bóng đổ khuếch tán mềm: thẻ chính `rounded-3xl` + `shadow-[0_14px_40px_rgba(8,112,184,0.06)]`, hộp thoại/thẻ con `rounded-2xl`, ô nhập liệu/nút bấm `rounded-xl`, thanh chuyển tab dạng viên thuốc (`Segmented Pill`).
  2. **Đợt 1 — Khung Toàn Cục, Trang Chủ & Tài Khoản (`layout.tsx`, `navbar.tsx`, `footer.tsx`, `modal.tsx`, `page.tsx`, `account/page.tsx`, `auth/setup-password/page.tsx`):**
     - Ẩn hoàn toàn thanh cảnh báo màu cam `MÔI TRƯỜNG KIỂM THỬ (TEST MỐC 2)` trên `Navbar` khi chạy chế độ bình thường; chuyển cụm menu điều hướng sang dạng viên thuốc (`Segmented Pill`) hiện đại; gom thông tin người dùng, huy hiệu vai trò và nút Hồ sơ/Đăng xuất gọn gàng.
     - Thiết kế lại `Modal` dùng chung (`rounded-3xl`, nền mờ `backdrop-blur-sm bg-slate-900/40`, không kẻ ngang thô cứng).
     - Thiết kế lại Trang chủ (`/`), Trang Tài khoản (`/account`) và Đặt mật khẩu mới (`/auth/setup-password`) đồng bộ 100% với `UI-01`.
  3. **Đợt 2 — Khu Vực Học Sinh (`student/page.tsx`, `student/course/page.tsx`, `student/lessons/[lessonId]/page.tsx`, `student/lessons/[lessonId]/quiz/page.tsx`):**
     - Góc học tập (`/student`) và Lộ trình 14 buổi (`/student/course`) dùng thẻ Hero bo tròn `rounded-3xl`, hộp tiến độ `X/14 buổi` trực quan và danh sách 14 buổi học thoáng đãng.
     - Trang Chi tiết Bài học (`/student/lessons/[lessonId]`) và Trắc nghiệm (`/quiz`) có bố cục thẻ sạch sẽ, hộp chọn đáp án bo góc `rounded-xl` nổi bật khi chọn và giữ nguyên khung xem trước HTML trực tiếp (`iframe srcDoc`).
  4. **Đợt 3 — Khu Vực Quản Lý Lớp & Giáo Viên (`manage/page.tsx`, `manage/classes/page.tsx`, `teacher/submissions/page.tsx`):**
     - Tổng quan Quản lý (`/manage`) dùng 4 thẻ KPI `rounded-3xl` với biểu tượng màu pastel tinh tế.
     - Quản lý Lớp học, Cấp mã PIN & Đóng khóa 14 buổi (`/manage/classes`) chuyển danh sách chọn lớp sang thanh viên thuốc ngang, làm sạch bảng học sinh và khu vực Đóng khóa 14 buổi 2 bước.
     - Trang Giáo viên chấm bài (`/teacher/submissions`) dùng bộ lọc viên thuốc (`Tất cả`, `Chờ chấm`, `Đã đạt`) và khung chấm bài 2 cột hiện đại.
  5. **Đợt 4 — Khu Vực Quản Trị Hệ Thống (`admin/courses/page.tsx`, `admin/lessons/[lessonId]/edit/page.tsx`, `admin/teachers/page.tsx`, `admin/sync/page.tsx`):**
     - Thu gọn các hộp giải thích quy tắc dài dòng trên trang Khóa học 14 buổi (`/admin/courses`), Soạn thảo bài học (`/edit`), Quản lý Giáo viên (`/admin/teachers`) và Đồng bộ Teaching (`/admin/sync`), giảm chiều cao cuộn trang tới ~30% mà vẫn giữ nguyên 100% chức năng và bộ kiểm thử.
- **Kiểm thử & Nghiệm thu hình ảnh:**
  - Chụp trọn bộ ảnh Trước & Sau (`1440px` full-screen) cho toàn bộ 19 màn hình.
  - Kiểm thử tự động: `381 / 381 PASS` (`23` bộ test Mốc 1 → Mốc 6), `npm run typecheck` = `0` lỗi, `npm run build` thành công.

---

### [2026-10-22] — Thiết kế lại 3 Màn hình Khu vực Đăng nhập (UI-01) theo Mẫu Giao diện Mới (UI UX Pro Max & Taste Skill)
- **Mục tiêu:** Cải tiến toàn diện giao diện khu vực Đăng nhập (`UI-01`) theo đúng 3 ảnh thiết kế chuẩn do Owner cung cấp: Tab Học sinh (Mã HS + PIN 8 số), Tab Giáo viên / Admin (Email + Mật khẩu), và Hộp thoại Quên mật khẩu.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Trang Đăng nhập (`src/app/login/page.tsx` — `[UI-01]`):**
     - Thiết kế lại thẻ Card trung tâm với góc bo cong mềm mại (`rounded-3xl`), đổ bóng khuếch tán thanh lịch (`shadow-[0_20px_50px_rgba(8,112,184,0.07)]`) và biểu tượng Khiên bảo mật ánh xanh 3D phát sáng.
     - Bộ chuyển Tab dạng thanh viên thuốc (Segmented Pill Switcher): Tab Học sinh có thanh nhấn màu xanh dương bên dưới; Tab Giáo viên / Admin chuyển đổi sang viên thuốc xanh dương rực rỡ (`bg-[#1d63ed] text-white shadow-md shadow-blue-500/30`).
     - Tối ưu các trường nhập liệu: ô nhập bo góc `rounded-xl`, biểu tượng mờ tinh tế, nhãn gọn gàng không bị rối chữ.
     - Nút đăng nhập Học sinh màu xanh dương nổi bật, nút đăng nhập Giáo viên/Admin màu đen than lịch lãm (`bg-[#0f172a]`).
     - Bổ sung hiệu ứng ngôi sao lấp lánh nhẹ (`✦`) ở góc dưới bên phải màn hình.
  2. **Hộp thoại Quên mật khẩu (`src/app/login/page.tsx` Modal):**
     - Nền tối làm mờ mượt mà (`backdrop-blur-sm bg-slate-900/40`), hộp thoại bo góc `rounded-2xl`, nút tắt `✕` góc phải, tiêu đề lớn không đường kẻ ngang, các nút thao tác `Đóng` và `Gửi liên kết đặt lại` căn phải chuẩn xác.
  3. **Thanh Điều hướng (`src/components/navbar.tsx`) & Chân trang (`src/components/footer.tsx`):**
     - Ẩn thanh cảnh báo màu cam khi ở trang đăng nhập; hiển thị logo `M MINDX LEARN` và nút `Đăng nhập` viền mảnh gọn gàng.
     - Chân trang hiển thị nhẹ nhàng dòng chữ `© 2026 MindX Education` căn giữa, không viền ngăn cách thô cứng.
- **Triển khai & Kiểm thử:**
  - Vercel Production: `dpl_4F1h3KQS6sJhVb4xoaf7W6cFhGUe` (**`READY`** tại `https://mindx-learn-test.vercel.app/login`).
  - Kiểm thử tự động: `381 / 381 PASS`, `npm run typecheck` = `0` lỗi.

### [2026-10-22] — Soạn Giáo trình JSB Buổi 1, Khung Xem trước Web HTML5 trực tiếp & Chế độ Xem trước cho Admin/Giáo viên
- **Mục tiêu:** Đưa khóa học chính thức đầu tiên (**`JSB — Lập trình Web Cơ bản`**) cùng giáo trình chi tiết **Buổi 1: Website hoạt động như thế nào** lên web thật để Owner xem và duyệt giao diện học tập thực tế.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Cơ sở dữ liệu (`supabase/migrations/20261022153000_m6_jsb_course_session1_curriculum.sql`):**
     - Tạo khóa học chính thức `44444444-4444-4444-8444-444444444411`: **`JSB — Lập trình Web Cơ bản (HTML5, CSS3 & JavaScript Basic)`** (`total_sessions = 14`, `is_fixture = false`).
     - Xuất bản (`published`) **Buổi 1 (`55555555-5555-4555-8555-555555555511`): "Buổi 1: Website hoạt động như thế nào"** (`has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`) gồm 5 phần bám sát 4 mục tiêu học tập (Khái niệm Website & Client–Server; Tiêu chuẩn W3C, URL, HTTPS; HTML5 & các thẻ cơ bản; Thực hành tạo trang web giới thiệu bản thân `index.html`).
     - Khởi tạo khung 13 buổi tiếp theo (**Buổi 2 → Buổi 14**, `55555555-5555-4555-8555-555555555512`..`5524`) ở trạng thái `draft`.
     - Thêm **6 câu hỏi trắc nghiệm (`quiz_questions`)** (`66666666-6666-4666-8666-666666666601`..`6606`) kiểm tra đủ 4 mục tiêu của Buổi 1.
  2. **Trình hiển thị Bài giảng Học sinh & Khung Xem trước HTML trực tiếp (`src/app/student/lessons/[lessonId]/page.tsx` — `[UI-12]`):**
     - Nâng cấp bộ hiển thị `lesson.materials`: hỗ trợ tiêu đề phân cấp (`##`, `###`), danh sách đánh số và gạch đầu dòng, hộp ghi chú (`> `), thẻ mã lệnh nội dòng (`` `...` ``).
     - Thêm **Khung mã nguồn kiểu IDE tối màu** cho khối ```` ```html ... ``` ```` kèm nút **"Sao chép code"** 1 chạm và **Khung "Kết quả hiển thị trên Trình duyệt" (`iframe srcDoc` cô lập an toàn `sandbox=""`)** giúp học sinh nhìn thấy ngay trang web HTML mẫu chạy trực tiếp bên dưới đoạn code.
  3. **Chế độ Xem trước Học sinh dành cho Admin & Giáo viên (`isStaffPreview`):**
     - Mở quyền cho vai trò `admin` và `teacher` truy cập trực tiếp `[UI-12]` (`/student/lessons/[lessonId]`) và `[UI-13]` (`/student/lessons/[lessonId]/quiz`) kèm thanh thông báo **"Chế độ Xem trước"** (trong khi vẫn chặn học sinh xem bài `draft`).
     - Thêm nút **"Xem bài [UI-12]"** trên từng dòng buổi học tại trang Quản lý Khóa học (`src/app/admin/courses/page.tsx` — `[UI-05]`) và nút **"Xem giao diện Học sinh [UI-12]"** trên trang Chỉnh sửa Bài học (`src/app/admin/lessons/[lessonId]/edit/page.tsx` — `[UI-06]`).
- **Triển khai & Kiểm증:**
  - Áp dụng migration lên Supabase `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`): `courses = 1`, `lessons = 14`, `quiz_questions = 6`.
  - Triển khai Vercel Production: `dpl_CXJGa6Hk8qPsQZvQMsSLaUbaVnUT` (`READY` tại `https://mindx-learn-test.vercel.app`).
  - Kiểm thử tự động: `381 / 381 PASS`, `npx tsc --noEmit` = `0` lỗi.

---

### [2026-10-22] — Chuẩn hóa Thứ tự Cấp độ Khóa học (`Basic → Advanced → Intensive`) & Tạo bộ Tài liệu Ngữ cảnh Nhanh cho AI
- **Mục tiêu:** Sửa lại thứ tự cấp độ khóa học chuẩn của MindX trên toàn bộ mã nguồn/tài liệu và thiết lập hệ thống tệp tóm tắt để AI đọc nhanh ở đầu mỗi phiên.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Chuẩn hóa thứ tự khóa học (`Basic (B)` → `Advanced (A)` → `Intensive (I)`):**
     - Cập nhật bộ phân tích mã lớp & ánh xạ khóa học trong `src/lib/teaching-sync-core.mjs` (`COURSE_TRACK_ORDER`: `Basic = 1`, `Advanced = 2`, `Intensive = 3` cho cả Robotics `ROBB → ROBA → ROBI` và các bộ môn Coding `C4K-SB/SA/SI`, `C4K-GB/GA/GI`, `C4K-PTB/PTA/PTI`, `JSB/JSA/JSI`, `CSB/CSA/CSI`).
     - Thêm bài kiểm thử tự động trong `tests/m4-teaching-sync.test.mjs` khóa cứng thứ tự `Basic (1) < Advanced (2) < Intensive (3)`.
     - Cập nhật tài liệu `PROJECT_PLAN.md` và `docs/M6_USER_GUIDE.md`.
  2. **Tạo bộ tài liệu theo dõi dự án cho AI:**
     - Tạo [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) và [`projectstates.md`](./projectstates.md), liên kết trực tiếp vào [`AGENTS.md`](./AGENTS.md) và [`docs/AI_AGENT_WORKFLOW.md`](./docs/AI_AGENT_WORKFLOW.md).

---

### [2026-10-22] — Mốc 6 (Bước 2): Dọn sạch Dữ liệu Mẫu, Chuyển sang Môi trường Chính thức (PROD) & Mở Đồng bộ Teaching Thật
- **Mục tiêu:** Chuyển dự án Supabase `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`) và Vercel `https://mindx-learn-test.vercel.app` từ môi trường thử nghiệm sang **Môi trường Chính thức (PROD)** theo quyết định của Owner, xóa sạch 100% học sinh/lớp/khóa mẫu và mở khóa luồng đồng bộ thật từ `teaching.mindx.edu.vn`.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Migration cắt chuyển PROD (`supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql`):**
     - Xóa sạch toàn bộ tài khoản thử nghiệm (`@test.mindx.local`, `TEST_M2QA_%`, các lớp/khóa học mẫu `is_fixture = true`), chỉ giữ duy nhất tài khoản Quản trị viên của Owner (`quangctm07@gmail.com`).
     - Chuyển `public.m5_storage_quota_config.environment_mode` sang `'production'`, khóa cứng mọi hàm RPC tạo dữ liệu mẫu (`m5_seed_course_close_fixture`, `m5_set_storage_quota_baseline`) khi ở PROD.
     - Nâng cấp RPC `public.m4_apply_teaching_sync` để chấp nhận nguồn **`real_teaching_sync`** bên cạnh `fixture_json` và `bookmarklet_postmessage`.
  2. **Khóa bảo vệ PROD trên Edge Function (`supabase/functions/m2-backend/index.ts` — Version `18`):**
     - Thêm hàm `coordinatorFixtureLock`: chặn toàn bộ các action tạo/xóa dữ liệu giả (`coordinator-seed-fixture`, `coordinator-storage-fixture`, `m5-seed-fixture`, `reset-teaching-sync`) với mã lỗi `HTTP 403 PRODUCTION_ENVIRONMENT_LOCKED` khi database ở chế độ `production`.
  3. **Giao diện Đồng bộ Teaching Thật (`src/app/admin/sync/page.tsx` — `[UI-08]` Tab 2):**
     - Nâng cấp Tab 2 của `/admin/sync` từ màn hình chỉ đọc sang **Quy trình Đồng bộ Thật 3 bước**: (1) Bấm Bookmarklet **`Đồng bộ MINDX LEARN (Thật)`** trên `teaching.mindx.edu.vn` để truyền dữ liệu về qua `window.opener.postMessage` (hoặc chọn tệp `.json`) → (2) Xem bảng đối chiếu Preview (`Tạo mới`, `Cập nhật`, `Bỏ qua`, `Cần rà soát`) → (3) Bấm **Áp dụng đồng bộ thật** vào database.
- **Bằng chứng:** [`docs/M6_EVIDENCE.md`](./docs/M6_EVIDENCE.md), [`docs/M6_USER_GUIDE.md`](./docs/M6_USER_GUIDE.md).

---

### [2026-10-21] — Mốc 6 (Bước 1): Tối ưu RLS/Index, Kiểm thử Tải 200 Học sinh (10 ca × 20 em/ca) & Rà soát Bảo mật
- **Mục tiêu:** Đảm bảo hệ thống chịu tải tốt cho quy mô trung tâm (`>200` học sinh hoạt động, `>1.000` học sinh trong danh sách, tối đa **20 học sinh nộp bài đồng thời/ca học**) trước khi mở PROD.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Tối ưu hiệu năng PostgreSQL RLS & Index (`supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql`):**
     - Bọc các lời gọi hàm quyền (`auth.uid()`, `public.current_role()`, `public.current_profile_id()`, `public.is_active_admin()`) trong `(SELECT ...)` InitPlan để Postgres chỉ tính 1 lần mỗi câu truy vấn thay vì tính lại trên từng dòng.
     - Bổ sung các composite index cho bảng `students`, `classes`, `quiz_results`, `practice_submissions`, `m3_upload_reservations`.
  2. **Chốt chặn bảo mật môi trường (`src/lib/server/crypto.mjs`, `next.config.mjs`, `src/app/layout.tsx`, `src/lib/store.tsx`):**
     - Chặn cờ `NEXT_PUBLIC_MINDX_DEMO=1` trên môi trường Production ngay từ lúc build, render server và khởi tạo client store.
     - Thêm cơ chế tự động thử lại (retry) an toàn ở tầng BFF (`src/app/api/m2/[action]/route.ts`) khi kết nối mạng tạm thời gián đoạn.
  3. **Kiểm thử tải thực tế trên môi trường Staging:**
     - Chạy thành công kịch bản **200 tài khoản học sinh phân biệt (`TEST_M2QA_M6_S001..S200`) chia thành 10 ca × 20 học sinh đồng thời/ca**: `200/200` đăng nhập PIN, tải bài học, nộp Quiz, nộp Thực hành và Giáo viên chấm bài (`0` lỗi 5xx).
     - Kiểm thử bảng danh sách và bộ lọc với **`1.200` học sinh** mượt mà.
- **Bằng chứng:** [`docs/M6_EVIDENCE.md`](./docs/M6_EVIDENCE.md), [`docs/M6_HOSTING_COST_AND_RETENTION.md`](./docs/M6_HOSTING_COST_AND_RETENTION.md), `tests/m6-staging-load-and-prod-readiness.test.mjs`.

---

### [2026-10-20] — Mốc 5: Đóng Đợt học 14 buổi, Xuất & Kiểm tra CSV Tổng kết, Xóa Dữ liệu Khóa cũ & Cổng Hạn mức Storage 700MB/800MB
- **Mục tiêu:** Giải phóng dung lượng cơ sở dữ liệu và Supabase Storage sau mỗi đợt học 14 buổi mà không làm mất bảng điểm tổng kết của trung tâm.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Lõi xử lý Đóng khóa & Kiểm tra CSV (`src/lib/m5-course-close-core.mjs`, `supabase/migrations/20261020220000_m5_course_close_and_storage_quota.sql`):**
     - Ghi nhận đầy đủ danh sách học sinh từng tham gia đợt học qua bảng `m5_class_cohort_members` (kể cả học sinh đã chuyển lớp hoặc lưu trữ giữa khóa).
     - Xuất tệp CSV tổng kết chuẩn UTF-8 BOM với đúng **`N học sinh × 14 dòng`** (mỗi học sinh đủ Buổi 1..14).
     - Bắt buộc tải lại tệp CSV lên để máy chủ đối chiếu mã băm SHA-256 và snapshot database (`m5_save_csv_verification`) trước khi mở khóa nút xóa vĩnh viễn.
     - Xóa tệp thực hành trên Supabase Storage theo từng lô (`<= 1.000` tệp/lô), có cơ chế lưu trạng thái `incomplete` và nút **Tiếp tục xóa phần còn lại (Resume)** nếu mạng đứt giữa chừng.
  2. **Cổng hạn mức dung lượng Storage (`700 MB` cảnh báo / `800 MB` chặn tải tệp):**
     - Tính tổng dung lượng thực tế trong `storage.objects` cộng với các lượt đang giữ chỗ tải lên (`m3_upload_reservations`).
     - Khi vượt `700 MB`: hiện cảnh báo vàng cho Admin. Khi chạm `800 MB`: chặn tải tệp đính kèm mới nhưng vẫn cho phép học sinh nộp bài bằng đường dẫn (Link).
- **Bằng chứng:** [`docs/M5_EVIDENCE.md`](./docs/M5_EVIDENCE.md), `tests/m5-course-close.test.mjs`.

---

### [2026-10-20] — Mốc 4: Đồng bộ Chỉ đọc từ Teaching MindX (`teaching.mindx.edu.vn`) & Bảng Đối chiếu Xem trước (`UI-08`)
- **Mục tiêu:** Giúp Admin lấy danh sách lớp học và học sinh từ hệ thống `teaching.mindx.edu.vn` về MINDX LEARN một cách an toàn, không cần nhập tay và tuyệt đối không gửi mật khẩu/cookie Teaching về máy chủ.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Tiện ích Bookmarklet đọc phân trang DataTables (`tools/teaching-readonly/reader-core.mjs`, `public/teaching-readonly/bookmarklet.js`):**
     - Chạy trực tiếp trên trình duyệt của Admin khi đang mở `teaching.mindx.edu.vn`, tự động đọc qua các trang của bảng DataTables, lọc theo bộ môn và gửi gói dữ liệu sang cửa sổ `/admin/sync` qua `window.opener.postMessage`.
  2. **Bộ đối chiếu danh tính an toàn (`src/lib/teaching-sync-core.mjs`, `supabase/migrations/20261020140000_m4_teaching_sync.sql`):**
     - Phân loại từng bản ghi thành 4 nhóm: `Tạo mới (create)`, `Cập nhật (update)`, `Không đổi (unchanged)`, và `Cần rà soát thủ công (needsReview)` (khi trùng tên nhưng khác mã học sinh, hoặc bản ghi đang ở trạng thái lưu trữ).
     - Quy tắc bất biến: **Không bao giờ tự động xóa** học sinh vắng mặt trong lượt đọc; **không tự động mở lại** lớp/học sinh đã lưu trữ.
- **Bằng chứng:** [`docs/M4_EVIDENCE.md`](./docs/M4_EVIDENCE.md), `tests/m4-teaching-sync.test.mjs`.

---

### [2026-10-19] — Mốc 3: Luồng Học tập 14 Buổi Cố định, Làm Trắc nghiệm (Quiz), Nộp Thực hành (Link/Tệp) & Giáo viên Chấm bài
- **Mục tiêu:** Xây dựng trọn vẹn luồng dạy và học trên cơ sở dữ liệu thật cho Admin, Giáo viên và Học sinh.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Schema & RPC học tập (`supabase/migrations/20261019031910_m3_courses_quiz_practice.sql`):**
     - Bảng `courses` (`total_sessions = 14`), `lessons` (`session_number` 1..14, `status` `draft`/`published`), `quiz_questions`, `quiz_results`, `practice_submissions`, `m3_upload_reservations`.
     - Quy tắc xuất bản: Không cho phép xuất bản buổi học chỉ có lý thuyết (`!has_quiz && !has_practice` → chặn với mã `CANNOT_PUBLISH_THEORY_ONLY`).
  2. **Chấm điểm Quiz trên máy chủ & Nộp tệp riêng tư (`src/app/api/m3/file/route.ts`):**
     - Máy chủ ẩn trường `correctOptionIndex` khi trả danh sách câu hỏi cho Học sinh; chấm điểm qua RPC `m3_submit_quiz_attempt` (đạt từ `>= 70%`, cho làm lại không giới hạn và luôn giữ `highest_score`).
     - Tải tệp thực hành (`<= 2 MB`) lên bucket riêng tư qua cơ chế giữ chỗ trước (`m3_reserve_practice_upload`), kiểm tra chữ ký byte của tệp và mở xem qua Signed URL ngắn hạn (`120 giây`).
  3. **Chấm duyệt của Giáo viên (`src/app/teacher/submissions/page.tsx` — `[UI-09]`):**
     - Giáo viên chấm `Đạt (approved)` hoặc `Cần làm lại (needs_revision)` kèm nhận xét, hoặc bấm `Mở lại quyền nộp (reopen-submission)` khi học sinh muốn nộp bản cải tiến sau khi đã đạt.
- **Bằng chứng:** [`docs/M3_EVIDENCE.md`](./docs/M3_EVIDENCE.md), `tests/m3-learning-flow.test.mjs`.

---

### [2026-10-17 → 2026-10-18] — Mốc 1 & Mốc 2: Khung 13 Màn hình (`UI-01..UI-13`), Xác thực Supabase Auth, Phiên Cookie Mã hóa BFF & Mã PIN 8 Chữ số
- **Mục tiêu:** Thiết lập nền tảng giao diện 13 màn hình và hệ thống đăng nhập bảo mật cho Nhân sự (Email + Mật khẩu) và Học sinh (Mã học sinh + Mã PIN 8 chữ số).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **13 Màn hình chuẩn (`UI-01` đến `UI-13`):** Chia rõ 4 khu vực: Tài khoản chung (`/login`, `/account`), Quản lý lớp & học sinh (`/manage`, `/manage/classes`), Cấu hình Admin (`/admin/courses`, `/admin/lessons/[lessonId]/edit`, `/admin/teachers`, `/admin/sync`), Chấm bài Giáo viên (`/teacher/submissions`), và Khu Học sinh (`/student`, `/student/course`, `/student/lessons/[lessonId]`, `/student/lessons/[lessonId]/quiz`).
  2. **Kiến trúc BFF + Phiên Cookie AES-256-GCM (`src/lib/server/crypto.mjs`, `src/app/api/m2/[action]/route.ts`):**
     - Trình duyệt không giữ token Supabase trong `localStorage`; mọi phiên đăng nhập được mã hóa AES-256-GCM trong cookie `HttpOnly` và gọi qua `/api/m2/[action]` kèm `x-mindx-bff-secret` tới Edge Function `m2-backend`.
  3. **Cấp mã PIN 8 chữ số một lần & Chống đoán PIN:**
     - Mã PIN chỉ hiển thị đúng 1 lần khi Admin xuất tệp CSV phát cho lớp; trong DB chỉ lưu mã băm kèm `MINDX_PIN_PEPPER`.
     - Cấp lại PIN cho từng học sinh sẽ tự động tăng `session_version`, thu hồi ngay lập tức phiên đăng nhập cũ của học sinh đó.
- **Bằng chứng:** [`docs/M1_EVIDENCE.md`](./docs/M1_EVIDENCE.md), [`docs/M2_EVIDENCE.md`](./docs/M2_EVIDENCE.md).

---

## Phần 2 — Sổ tay Cách làm Tính năng cho AI (Feature Implementation Playbook)

Khi Owner yêu cầu thêm tính năng mới, chỉnh sửa giao diện hoặc nạp thêm giáo trình, AI **bắt buộc làm theo đúng các mẫu kiến trúc dưới đây** để đảm bảo tính đồng nhất và không gây lỗi dây chuyền:

### 1. Luồng dữ liệu chuẩn từ Giao diện xuống Cơ sở dữ liệu
Mọi tính năng trong MINDX LEARN đều đi qua **4 tầng cố định**:
```
[Giao diện React Page (src/app/.../page.tsx)]
       ↓ gọi hàm trong Context
[Frontend Store (src/lib/store.tsx)]
       ↓(Chế độ Offline/Test: xử lý qua src/lib/simulation-rules.ts)
       ↓(Chế độ Live PROD: gọi fetch('/api/m2/<action>') hoặc '/api/m3/file')
[Next.js BFF Route (src/app/api/m2/[action]/route.ts)]
       ↓ giải mã cookie phiên HttpOnly + đính kèm header x-mindx-bff-secret
[Supabase Edge Function (supabase/functions/m2-backend/index.ts)]
       ↓ kiểm tra quyền actor (admin / teacher / student) + gọi RPC
[PostgreSQL RPC & Bảng dữ liệu (supabase/migrations/*.sql)]
```

---

### 2. Cách soạn & nạp Giáo trình Khóa học / Buổi học mới lên Web
Khi Owner yêu cầu *"Soạn giáo trình bài X của khóa Y và đưa lên web"*:
1. **Không sửa `src/lib/mock-data.ts`:** Các tệp kiểm thử đơn vị (`tests/m3-learning-flow.test.mjs`, `tests/m4-teaching-sync.test.mjs`, `tests/m5-course-close.test.mjs`) đang dùng dữ liệu giả định trong `src/lib/mock-data.ts` để test quy tắc nghiệp vụ. Hãy giữ nguyên `src/lib/mock-data.ts`.
2. **Viết tệp SQL Migration mới trong `supabase/migrations/YYYYMMDDHHMMSS_<ten_mo_ta>.sql`:**
   - Nếu là **khóa học mới**, `INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)` với `total_sessions = 14`, `is_fixture = false`, và tạo đủ **14 dòng `public.lessons` (`session_number` từ `1` đến `14`)** чтобы giữ đúng quy tắc bất biến 14 buổi.
   - Nếu là **buổi học có nội dung hoàn chỉnh**, đặt `status = 'published'`, bật `has_quiz = true` và/hoặc `has_practice = true`, chọn `practice_mode = 'file_allowed'` (nếu cho nộp tệp code/ảnh) hoặc `'link_only'`.
   - Thêm bộ câu hỏi trắc nghiệm vào `public.quiz_questions` (`id`, `lesson_id`, `question_text`, `options` kiểu `jsonb`, `correct_option_index` đánh số từ `0`).
3. **Định dạng Markdown chuẩn trong cột `materials` để hiển thị đẹp nhất trên `[UI-12]` (`src/app/student/lessons/[lessonId]/page.tsx`):**
   - Dùng `## Tiêu đề phần lớn` (sẽ tự động render khung nền xanh dương nhạt nổi bật).
   - Dùng `### Tiêu đề mục nhỏ` (chữ đậm có vạch kẻ chân).
   - Dùng `> Nội dung ghi nhớ...` để tạo **Hộp ghi chú (Callout Box)** viền xanh dương bên trái.
   - Dùng `- **Từ khóa:** Giải thích...` hoặc `1. **Bước 1:** ...` để tạo danh sách dễ đọc.
   - Dùng khối mã ```` ```html ... ``` ```` (hoặc `css`, `javascript`, `python`):
     - Nếu là khối ```` ```html ```` có chứa thẻ HTML (`<!DOCTYPE html>` hoặc `<html` / `<body` / `<h1`), giao diện `[UI-12]` sẽ **tự động hiển thị cả khung code IDE tối màu lẫn khung "Kết quả hiển thị trên Trình duyệt" (`iframe` chạy trực tiếp trang web mẫu)**!
4. **Áp dụng lên Database `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`):**
   - Dùng công cụ `supabase.apply_migration` để đẩy tệp SQL lên project `eythjapspkoyqdxlxtcd`.

---

### 3. Cách thêm hoặc sửa một Tính năng có Tác động Backend (`Action` mới)
Nếu cần thêm một thao tác nghiệp vụ mới (ví dụ: thêm tính năng mới cho Admin hoặc Giáo viên):
1. **Bước 1 — Database RPC (`supabase/migrations/*.sql`):** Viết hàm PostgreSQL `SECURITY DEFINER` (luôn `SET search_path = public, pg_temp`) thực hiện thay đổi dữ liệu nguyên tử (atomic) và kiểm tra quyền.
2. **Bước 2 — Edge Function (`supabase/functions/m2-backend/index.ts`):**
   - Thêm nhánh `if (action === '<ten-action-moi>')` xử lý xác thực phiên qua `verifyActorSession(adminClient, body.accessToken)`, kiểm tra `actor.role`, gọi `adminClient.rpc(...)` và trả kết quả JSON chuẩn `{ success: true, data, message }`.
3. **Bước 3 — Next.js BFF (`src/app/api/m2/[action]/route.ts`):**
   - Thêm `<ten-action-moi>` vào danh sách các action được phép đi qua route `/api/m2/[action]`.
4. **Bước 4 — Frontend Store (`src/lib/store.tsx`):**
   - Thêm hàm tương ứng vào `AppContextType` và nối cả nhánh `isLiveMode` (gọi `/api/m2/<ten-action-moi>`) lẫn nhánh mô phỏng cục bộ (nếu cần test offline).

---

### 4. Cách Triển khai (Deploy) Nhanh & Không Bị Treo lên Supabase + Vercel PROD
- **Thông tin định danh cố định của môi trường PROD:**
  - **Supabase Project:** `MINDX_LEARN` — Project ID: `eythjapspkoyqdxlxtcd`
  - **Vercel Project:** `mindx-learn-test` — Project ID: `prj_T9SLafrAyOywnv8PGm821eYBVBT7`, Team ID: `team_KjA2bxebH8S1hMts27rFbxn3`, Production URL: `https://mindx-learn-test.vercel.app`
- **Lưu ý quan trọng khi gọi `codex exec` trên Windows PowerShell:**
  - **Không bao giờ** gọi `codex exec` mà để trống `stdin` (sẽ bị treo ở `Reading additional input from stdin...`), và **không** dùng `-m gpt-5.4` (không hỗ trợ tài khoản ChatGPT).
  - **Cách gọi đúng:** Ghi nội dung yêu cầu vào tệp tạm rồi pipe qua `Get-Content <file> -Raw | codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-6-luna -` (hoặc `-m gpt-6.1-sol`).
- **Tối ưu tốc độ Deploy Vercel (~40 giây):**
  - Vercel đã lưu sẵn SHA1 của 50 tệp mã nguồn trong dự án. Khi chỉ sửa một vài tệp giao diện/code, chỉ cần `upload_file` cho đúng các tệp vừa thay đổi (kèm SHA1 và kích thước mới), sau đó gọi `create_deployment` (`target: "production"`) với danh sách 50 tệp đã cập nhật SHA1 của các tệp mới.

---

### 5. Danh sách Kiểm tra An toàn Trước khi Báo cáo Hoàn thành cho Owner
1. Chạy `npm run typecheck` (`npx tsc --noEmit`) → bắt buộc **`0` lỗi**.
2. Chạy `npm test` → toàn bộ bài kiểm thử tự động phải **`PASS` 100%**.
3. Kiểm tra tệp bảo vệ `teachingmindx-sync-trial.html` không bị thay đổi (SHA-256: `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`).
4. Cập nhật lại [`projectstates.md`](./projectstates.md) và ghi thêm mục mới vào [`changelog.md`](./changelog.md).
5. Trình bày kết quả cho Owner bằng **tiếng Việt đời thường, ngắn gọn, dễ hiểu**, kèm đường dẫn bấm vào xem ngay.
