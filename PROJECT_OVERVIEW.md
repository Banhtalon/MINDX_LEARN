# Tổng quan Chi tiết Dự án MINDX LEARN (`PROJECT_OVERVIEW.md`)

> **Tài liệu tóm tắt kiến trúc, nghiệp vụ và lộ trình khóa học dành cho AI & Đội triển khai.**
> Đọc tệp này cùng với [`projectstates.md`](./projectstates.md), [`changelog.md`](./changelog.md) và [`docs/AI_AGENT_WORKFLOW.md`](./docs/AI_AGENT_WORKFLOW.md) đầu tiên khi bắt đầu phiên làm việc mới để nắm toàn bộ ngữ cảnh dự án và cách triển khai tính năng mà không cần quét lại toàn bộ kho mã.

---

## 1. Mục tiêu cốt lõi & Phạm vi hệ thống

**MINDX LEARN** là ứng dụng web quản lý học tập và lớp học (LMS) dành cho trung tâm MindX (quy mô thiết kế `>200` học sinh hoạt động, danh sách nguồn `>1.000` học sinh, tải đồng thời tối đa **20 học sinh/ca học**):
- **3 vai trò người dùng:**
  1. **Quản trị viên (`admin`):** Toàn quyền quản lý khóa học (14 buổi cố định), giáo viên, lớp học, học sinh, cấp mã PIN 8 chữ số một lần (qua CSV), đồng bộ danh sách lớp/học sinh từ `teaching.mindx.edu.vn`, và đóng khóa học (xuất CSV tổng kết + xóa vĩnh viễn dữ liệu đợt cũ).
  2. **Giáo viên (`teacher`):** Chỉ xem và thao tác trên **đúng các lớp được phân công** (`class_teachers`); theo dõi tiến độ `X/14` buổi và chấm bài thực hành (`Đạt` / `Cần làm lại` / `Mở lại quyền nộp`).
  3. **Học sinh (`student`):** Đăng nhập bằng **Mã học sinh + Mã PIN 8 chữ số riêng** (không dùng email); xem các buổi học đã xuất bản của lớp hiện tại, làm bài Trắc nghiệm (Quiz) và nộp bài Thực hành (Link hoặc Tệp đính kèm `<= 2 MB`).

---

## 2. Lộ trình Khóa học chuẩn của MindX (Thứ tự cấp độ bắt buộc)

Tại MindX, mỗi bộ môn đều được chia thành **3 cấp độ (khóa học) từ thấp lên cao** theo đúng thứ tự:

$$\text{Basic (B — Cơ bản, Thấp nhất)} \longrightarrow \text{Advanced (A — Nâng cao, Cấp 2)} \longrightarrow \text{Intensive (I — Chuyên sâu, Cao nhất)}$$

> **Lưu ý quan trọng (Đã xác nhận với Owner ngày 22/10/2026):**
> Thứ tự tăng dần của mọi bộ môn là **`Basic (B)` → `Advanced (A)` → `Intensive (I)`** *(không phải Basic → Intensive → Advanced)*. Mỗi khóa có **đúng 14 buổi học cố định (Buổi 1–14)**.

### 2.1. Danh mục các khóa học theo bộ môn
1. **Mảng Robotics (`ROB` — trọng tâm đồng bộ mặc định):**
   - Khóa 1 (Thấp nhất): **`ROBB` (Robotics Basic — Cơ bản)**
   - Khóa 2 (Trung cấp): **`ROBA` (Robotics Advanced — Nâng cao)**
   - Khóa 3 (Cao nhất): **`ROBI` (Robotics Intensive — Chuyên sâu)**
   *(Nếu có lớp mầm non/tiểu học nhỏ: `PREB` → `PREA` → `PREI`).*

2. **Mảng Lập trình Khối C4K & Coding (quan sát thực tế từ các mã lớp `VT-...` trên Teaching):**
   - **Bộ môn Scratch (`S` — Khởi đầu thấp nhất của lộ trình Coding C4K):**
     - `C4K-SB` (Scratch Basic — **Khóa thấp nhất**) → `C4K-SA` (Scratch Advanced) → `C4K-SI` (Scratch Intensive)
   - **Bộ môn Game (`G` — GameMaker):**
     - `C4K-GB` (Game Basic) → `C4K-GA` (Game Advanced) → `C4K-GI` (Game Intensive)
   - **Bộ môn Python / App (`PT`):**
     - `C4K-PTB` (Python Basic) → `C4K-PTA` (Python Advanced) → `C4K-PTI` (Python Intensive)
   - **Bộ môn Web JavaScript (`JS`):**
     - `JSB` (Web Basic) → `JSA` (Web Advanced) → `JSI` (Web Intensive)
   - **Bộ môn Khoa học Máy tính (`CS` — Computer Science):**
     - `CSB` (CS Basic) → `CSA` (CS Advanced) → `CSI` (CS Intensive)

---

## 3. Quy tắc Nghiệp vụ Bất biến (Invariants)

1. **Khung 14 buổi cố định (`total_sessions = 14`):**
   - Mọi khóa học khi tạo đều tự động sinh đúng **14 vị trí buổi học (`session_number` từ `1` đến `14`)** ở trạng thái `draft` (Nháp).
   - Không được thêm, xóa hoặc đảo vị trí làm lệch cấu trúc 14 buổi.
   - Chỉ được xuất bản (`published`) một buổi học khi buổi đó có ít nhất **Trắc nghiệm (`has_quiz = true`)** hoặc **Thực hành (`has_practice = true`)**.
   - Học sinh chỉ nhìn thấy và truy cập được các buổi `published`. Tiến độ luôn tính trên mẫu số 14: `Đã hoàn thành X/14 buổi` (`(X/14) * 100%`).

2. **Trắc nghiệm (Quiz) & Thực hành (Practice):**
   - **Quiz:** Đạt từ **70%**, cho phép làm lại không giới hạn, máy chủ chấm điểm (không gửi `correctOptionIndex` về trình duyệt học sinh) và luôn giữ **điểm cao nhất (`highest_score`)**.
   - **Practice:** Nộp liên kết (`https://...`) hoặc tệp riêng tư (`<= 2 MB`, các đuôi cho phép: `.zip, .pdf, .png, .jpg, .jpeg, .webp, .txt, .py, .js, .html, .css, .json, .md, .sb3`).
   - Khi bài thực hành đã được Giáo viên chấm **Đạt (`approved`)**, học sinh không thể tự nộp đè trừ khi Giáo viên bấm **Mở lại quyền nộp (`reopen-submission`)**.

3. **Đăng nhập Học sinh & Mã PIN 8 chữ số một lần:**
   - Học sinh đăng nhập bằng `student_code` + `PIN 8 chữ số`. Máy chủ ánh xạ `student_code` sang email nội bộ ẩn trong `private.actor_auth`.
   - Không lưu mã PIN dạng rõ trong DB/log/localStorage. Cấp PIN lần đầu theo lớp chỉ cấp cho học sinh chưa có PIN (`pin_issued_at IS NULL`); cấp lại PIN chỉ thực hiện cho từng học sinh riêng lẻ và lập tức thu hồi phiên cũ (`session_version` tăng).
   - Chống đoán PIN theo cả tài khoản học sinh và IP (khóa tạm 60 giây sau 6 lần sai liên tiếp trong 1 phút, không khóa oan các học sinh khác ngồi cùng phòng máy).

4. **Đồng bộ Teaching MindX (`UI-08` — `/admin/sync`):**
   - **Không truyền mật khẩu hoặc cookie Teaching** về máy chủ ứng dụng.
   - Admin đăng nhập `teaching.mindx.edu.vn` và bấm Bookmarklet để đọc dữ liệu phân trang DataTables rồi gửi snapshot sang `/admin/sync` qua `window.opener.postMessage` (hoặc chọn tệp `.json`).
   - **Không tự động xóa** học sinh vắng mặt trong lượt đọc; **không tự mở lại** học sinh/lớp đã lưu trữ; **không tự gộp** theo tên nếu mã `id` thay đổi (đưa vào danh sách `needsReview` để Admin kiểm tra thủ công).

5. **Đóng đợt học 14 buổi, Xuất CSV tổng kết & Xóa dữ liệu cũ (Mốc 5):**
   - Gồm đầy đủ mọi học sinh từng tham gia đợt học của lớp (`m5_class_cohort_members`, kể cả học sinh đã chuyển lớp hoặc lưu trữ).
   - Mỗi học sinh có đúng **14 dòng (Buổi 1–14)** trong tệp CSV (`Tổng số dòng = Số học sinh đợt × 14`).
   - Chỉ mở khóa nút xóa sau khi máy chủ xác minh SHA-256 và đối chiếu 100% nội dung CSV khớp với DB.
   - Xóa tệp trên Supabase Storage theo lô (`<= 1.000` tệp/lô) trước, sau đó xóa kết quả `quiz_results` và `practice_submissions` của đúng đợt học đó. Giữ nguyên tài khoản học sinh, lớp học và nội dung khóa học dùng chung.

6. **Quản lý Hạn mức Dung lượng Storage (700 MB / 800 MB):**
   - Gói Supabase Free giới hạn 1 GB toàn tổ chức: hệ thống bật cảnh báo vàng ở **700 MB (`734,003,200` bytes)** và chặn tải tệp mới ở **800 MB (`838,860,800` bytes)**, có tính cả các lượt đang giữ chỗ tải đồng thời (`m3_upload_reservations`). Khi chạm ngưỡng 800 MB, học sinh vẫn nộp bài bằng đường dẫn (Link) bình thường.

---

## 4. Kiến trúc Kỹ thuật & Bản đồ Tệp chính

- **Frontend & BFF:** Next.js 16.4.0 (App Router), React 19.3.0, TypeScript, Tailwind CSS.
  - `src/app/login/page.tsx` (`UI-01`), `src/app/account/page.tsx` (`UI-02`)
  - `src/app/manage/page.tsx` (`UI-03`), `src/app/manage/classes/page.tsx` (`UI-04` — Lớp, Học sinh, Cấp PIN, Đóng khóa & Xuất CSV Mốc 5)
  - `src/app/admin/courses/page.tsx` (`UI-05`), `src/app/admin/lessons/[lessonId]/edit/page.tsx` (`UI-06`)
  - `src/app/admin/teachers/page.tsx` (`UI-07`), `src/app/admin/sync/page.tsx` (`UI-08` — Đồng bộ Teaching Mốc 4 & PROD Mốc 6)
  - `src/app/teacher/submissions/page.tsx` (`UI-09`)
  - `src/app/student/page.tsx` (`UI-10`), `src/app/student/course/page.tsx` (`UI-11`), `src/app/student/lessons/[lessonId]/page.tsx` (`UI-12`), `src/app/student/lessons/[lessonId]/quiz/page.tsx` (`UI-13`)
  - `src/lib/store.tsx`: Quản lý trạng thái ứng dụng và kết nối BFF.
  - `src/app/api/m2/[action]/route.ts` & `src/app/api/m3/file/route.ts`: Các cổng BFF kiểm tra phiên cookie mã hóa AES-256-GCM (`src/lib/server/crypto.mjs`), chống CSRF và chuyển tiếp có ký xác thực sang Edge Function.
- **Backend & Cơ sở dữ liệu (Supabase):**
  - **Project:** `MINDX_LEARN` (`eythjapspkoyqdxlxtcd`)
  - **Edge Function:** `supabase/functions/m2-backend/index.ts` & `domain.ts` (Đang chạy **Version `18` ACTIVE**).
  - **Database Migrations:** `supabase/migrations/` (từ Mốc 2 đến Mốc 6, đã áp dụng đầy đủ lên `eythjapspkoyqdxlxtcd`).
- **Tệp được bảo vệ tuyệt đối (Không bao giờ sửa/xóa):**
  - `teachingmindx-sync-trial.html` (SHA-256: `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`).
