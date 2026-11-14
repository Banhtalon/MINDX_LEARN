# Nhật ký Phát triển Sản phẩm & Sổ tay Triển khai Tính năng (`changelog.md`)

> **Tài liệu theo dõi lịch sử phát triển tính năng và hướng dẫn cách làm (Playbook) dành cho AI & Đội phát triển.**
> - **Mục đích:** Giúp AI nắm nhanh lịch sử tiến hóa của sản phẩm qua từng mốc, biết mỗi tính năng đang nằm ở tệp nào, hoạt động ra sao và **cách chuẩn nhất để phát triển/mở rộng tính năng mới** mà không làm hỏng hệ thống đang chạy thật (PROD).
> - **Quy tắc bắt buộc cho AI:** Đọc tệp này cùng [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) và [`projectstates.md`](./projectstates.md) ở đầu mỗi phiên làm việc. Sau mỗi lần thêm tính năng, nạp giáo trình hoặc cập nhật hệ thống, **bắt buộc ghi thêm mục mới vào Phần 1 của `changelog.md`**.

---

## Phần 1 — Nhật ký Phát triển Sản phẩm (Theo thứ tự mới nhất ở trên)

### [2026-11-14] — Khởi tạo Khóa học JSA (14 Buổi) & Nạp Trọn bộ Buổi 2 (Bản nháp: 20 Câu Trắc nghiệm + Thực hành Đề bài 1 & 2)
- **Mục tiêu:**
  1. Khởi tạo khóa học chính thức **`JSA — Lập trình Web Nâng cao (JavaScript Advanced & Web App)`** (`id: 44444444-4444-4444-8444-444444444412`, đủ `14` buổi cố định theo lộ trình `JSB -> JSA -> JSI`, `is_fixture = false`), giữ toàn bộ 14 buổi ở trạng thái **Bản nháp (`draft`)**.
  2. Nạp trọn bộ **Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript** (`id: 55555555-5555-4555-8555-555555555702`, `status = 'draft'`, `has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`) gồm tóm tắt kiến thức trọng tâm, **2 bài Thực hành (`Đề bài 1: bai1.js` & `Đề bài 2: bai2.js`)** hiển thị trên khung code tối màu Antigravity IDE và đủ **20 câu trắc nghiệm** (`10` câu gốc + `10` câu mở rộng từ Thực hành Đề 1 & 2) theo cơ chế ẩn đáp án khi làm bài / làm lại, chỉ hiện đáp án + lời giải thích sau khi nộp đủ 20 câu.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Database Migration ([`20261114160000_m6_jsa_course_session2_quiz_practice.sql`](./supabase/migrations/20261114160000_m6_jsa_course_session2_quiz_practice.sql)):**
     - Tạo khóa `JSA` (`44444444-4444-4444-8444-444444444412`) và 14 buổi nháp (`55555555-5555-4555-8555-555555555701` → `5714`).
     - Cập nhật giáo trình Buổi 2 (`55555555-5555-4555-8555-555555555702`) với 2 bảng tra cứu nhanh (`var`/`let`/`const` và các phương thức chuỗi `.length`, `.toUpperCase()`, `.toLowerCase()`, `.replace()`, `.substring()`, `prompt()`), **Đề bài 1 (`bai1.js`)**, **Đề bài 2 (`bai2.js`)** và hướng dẫn chạy thử Console `F12` + nộp tệp `.zip`/`.js` (`<= 2 MB`) hoặc đường link (tuyệt đối không nhúng `new Function`/`eval` chạy mã tùy ý cùng nguồn trên LMS).
     - Nạp đủ `20` câu hỏi trắc nghiệm (`66666666-6666-4666-8666-666666666801` → `6820`, `order_index` `0..19`, trong đó `13` câu có khối mã ```` ```js ````) kèm lời giải thích `explanation` chuẩn xác về cú pháp JavaScript thực tế (chuẩn hóa khởi tạo `const myVariable = 10;` ở Câu 1 và làm rõ yêu cầu giữ hằng số `const number = 5;` ở Câu 10) cùng khối `DO $$ ... $$` kiểm tra toàn vẹn.
  2. **Bộ Phân tích Markdown Nội tuyến Tuyến tính $O(N)$ & Tô màu Cú pháp JS (`UI-12` & `UI-13`):**
     - [`src/lib/inline-markdown.ts`](./src/lib/inline-markdown.ts): Tách bộ phân tích khối mã rào ```` ``` ```` (`parseFencedCodeBlocks`, `trimCodeBlockContent`) và mã nội tuyến (`tokenizeInlineMarkdown`) sử dụng con trỏ đơn điệu không quay lui biểu thức chính quy, đảm bảo thời gian tuyến tính $O(N)$ tuyệt đối cho cả thẻ `<code>` dấu huyền kép (như `` `` `...${biến}...` `` `` ở Câu 18), thẻ `<code>` lồng trong `**...**` và liên kết an toàn `[nhãn](url)`.
     - [`src/lib/code-highlight.ts`](./src/lib/code-highlight.ts): Bổ sung tập đối tượng toàn cục trình duyệt (`console`, `document`, `window`, `localStorage`...) tô màu thuộc tính `#7fdbca` và mở rộng nhận diện tự động JavaScript cho `var` / `console.log(...)`.
     - [`src/app/student/lessons/[lessonId]/quiz/page.tsx`](./src/app/student/lessons/[lessonId]/quiz/page.tsx) & [`src/app/student/lessons/[lessonId]/page.tsx`](./src/app/student/lessons/[lessonId]/page.tsx): Tích hợp `inline-markdown.ts`, tra cứu lời giải theo `Map` $O(Q)$ trên trang Quiz và hiển thị tiêu đề `Mã nguồn (JAVASCRIPT)` chuẩn xác.
- **Kiểm thử & Nghiệm thu:**
  - Bộ kiểm thử mới [`tests/jsa-session2-quiz-practice.test.mjs`](./tests/jsa-session2-quiz-practice.test.mjs) (gồm kiểm chứng thực thi V8 `node:vm` cho `bai1.js`, `bai2.js` và bộ 20 câu hỏi JS, kiểm thử JSDOM đủ 20 câu Quiz + 2 bài Thực hành JSA, kiểm thử độ phức tạp tuyến tính $O(N)$ 64k ký tự bất lợi và kiểm thử chạy lặp migration + chấm điểm qua PostgreSQL 17 thật).
  - Đã áp dụng lên Supabase PROD `eythjapspkoyqdxlxtcd` và đối chiếu `--read-only` (`official_courses = 3`, `total_lessons = 42`, `jsa_b2_status = 'draft'`, `jsa_b2_q_count = 20`, `classes = 0`, `students = 0`).
  - Cập nhật bản đồ cục bộ `$env:GRAPHIFY_BACKEND="none"; graphify update .` (`83/83` tệp mã nguồn).
  - `git diff --check`: `0` cảnh báo; `npm run typecheck`: `0` lỗi; `npm test`: **`396 / 396 PASS`** (`25` bộ kiểm thử, `0` bị bỏ qua); `npm run build`: thành công.
  - Kiểm định độc lập bằng Codex CLI (`gpt-6.1-sol` `xhigh` `-s read-only`): **`VERDICT: GO`**.

---

### [2026-11-14] — Hoàn tất Bước 3 Tự động hóa Quy tắc Tra cứu & Cập nhật Bản đồ Mã nguồn Offline (`graphify` Rules)
- **Mục tiêu:** Thiết lập cơ chế để mọi AI (Antigravity, Codex, Gemini và các Subagent) tự động tra cứu bản đồ `graphify-out/graph.json` trước khi đọc tràn lan các tệp mã nguồn, tự động chạy `graphify update .` sau khi sửa code, bảo toàn tuyệt đối [`.graphifyignore`](./.graphifyignore) và chỉ chạy ở chế độ offline 100% (`$env:GRAPHIFY_BACKEND="none"`, `--code-only`).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Tạo quy tắc luôn bật [`.agents/rules/graphify.md`](./.agents/rules/graphify.md) (`trigger: always_on`):** Quy định rõ 3 bước bắt buộc: (1) Tra cứu `graphify query` / `explain` / `path` trên `graphify-out/graph.json` trước khi tìm kiếm hoặc đọc tràn lan tệp code (áp dụng cho cả Subagent); (2) Chạy `$env:GRAPHIFY_BACKEND="none"; graphify update .` sau mỗi lần thêm/sửa/xóa code; (3) Giữ nguyên `.graphifyignore`, luôn chạy offline 100% (`$env:GRAPHIFY_BACKEND="none"`, `--code-only`) và cấm gọi bất kỳ API bên ngoài nào.
  2. **Đồng bộ quy tắc ngắn gọn vào [`AGENTS.md`](./AGENTS.md) (mục 4) & [`GEMINI.md`](./GEMINI.md):** Đảm bảo mọi môi trường AI mở kho mã đều áp dụng thống nhất cùng một chuẩn an toàn và tra cứu cục bộ.
  3. **Chạy kiểm chứng thực tế `$env:GRAPHIFY_BACKEND="none"; graphify update .`:** Cập nhật bản đồ cục bộ khớp toàn bộ `81/81` tệp mã nguồn hiện có trên kho (gồm `16` tệp migration SQL), đạt `1.006` nút, `2.660` liên kết, `39` cụm chức năng (`0` API ngoài, `0` rò rỉ dữ liệu thật/session).
- **Kiểm thử & Nghiệm thu:**
  - Thử trực tiếp `graphify query`, `graphify explain`, `graphify path` và `graphify update .` ở chế độ `GRAPHIFY_BACKEND=none`: hoạt động chính xác, tức thì.
  - `git diff --check`: `0` cảnh báo; `teachingmindx-sync-trial.html` giữ nguyên SHA-256 gốc.

---

### [2026-11-14] — Nâng cấp Khung Mã nguồn Tối màu Đa sắc Chuẩn Antigravity IDE (`CodeBlock` & `code-highlight`) trên Trang Bài học (`UI-12`) & Trang Trắc nghiệm (`UI-13`)
- **Mục tiêu:**
  1. Cập nhật toàn bộ khung hiển thị mã nguồn nền tối trên cả **Trang chi tiết bài học & thực hành** ([`src/app/student/lessons/[lessonId]/page.tsx`](./src/app/student/lessons/[lessonId]/page.tsx)) lẫn **Trang làm bài trắc nghiệm** ([`src/app/student/lessons/[lessonId]/quiz/page.tsx`](./src/app/student/lessons/[lessonId]/quiz/page.tsx)) sang giao diện đa màu sắc theo phong cách **Antigravity Dark IDE**.
  2. Không cài thêm thư viện ngoài (giữ sạch phụ thuộc Ponytail), không dùng `dangerouslySetInnerHTML`, đảm bảo thời gian phân tích cú pháp tuyến tính $O(N)$ và giữ nguyên 100% nội dung mã gốc (kể cả `CRLF` `\r\n` và `LF` `\n`) khi học sinh bôi đen hoặc bấm **Sao chép code** (không bị dính số dòng).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Bộ phân tích cú pháp không mất mát tuyến tính $O(N)$ ([`src/lib/code-highlight.ts`](./src/lib/code-highlight.ts)):**
     - Hỗ trợ tô màu đa ngôn ngữ gồm `python`, `css` (`styleSheet` Qt Designer), `html` (tự động ủy quyền phần bên trong `<style>` sang CSS và `<script>` sang JS qua bản sao chữ thường bảo toàn độ dài), `js`/`ts`, `json`, `sql`, kèm tự nhận diện ngôn ngữ giới hạn an toàn `4 KB` đầu tiên khi khối mã không khai báo nhãn.
     - Phân biệt rõ ràng bảng màu Antigravity Dark IDE: từ khóa (`#c792ea`), `self`/`cls`/`super` (`#ff7b72`), tên lớp/kiểu PascalCase (`#ffcb6b`), tên hàm & lời gọi hàm (`#82aaff`), thuộc tính/dunder `__init__` (`#7fdbca`), chuỗi ký tự `f""` / `"""..."""` (`#c3e88d`), số & hằng (`#f78c6c`), decorator/toán tử (`#89ddff`), chú thích `# ...` / `/* ... */` (`#768396`) và ô xem trước màu mã hex `#rgb`/`#rrggbb` trực tiếp trong CSS.
  2. **Thành phần Khung Mã dùng chung ([`src/components/code-block.tsx`](./src/components/code-block.tsx)) & Bảng màu CSS ([`src/app/globals.css`](./src/app/globals.css)):**
     - Dựng khung cửa sổ tối màu (`#0d1117` / thanh tiêu đề `#161b24`) với 3 chấm cửa sổ, huy hiệu ngôn ngữ, cột số dòng `1..N` tách riêng ngoài `<pre><code>` (`user-select: none`, `aria-hidden="true"`), nút **Sao chép code** tự dọn bộ đếm thời gian khi rời trang, và khe `footer` giữ nguyên khung xem trước trực tiếp `<iframe>` cho giáo trình HTML5 (như JSB Buổi 1).
     - Sử dụng hệ lớp `.agy-code-*` và `.agy-tok-*` độc lập để không xung đột với các quy tắc `!important` của bảng màu sáng trong `globals.css`.
  3. **Tích hợp trên `UI-12` & `UI-13` ([`src/app/student/lessons/[lessonId]/page.tsx`](./src/app/student/lessons/[lessonId]/page.tsx), [`src/app/student/lessons/[lessonId]/quiz/page.tsx`](./src/app/student/lessons/[lessonId]/quiz/page.tsx)):**
     - Đồng bộ hiển thị `<CodeBlock />` cho mọi khối mã trong giáo trình/bài thực hành và trong câu hỏi trắc nghiệm (như các câu Python OOP Buổi 2 PTI), bảo toàn nguyên vẹn ký tự xuống dòng gốc.
- **Kiểm thử & Nghiệm thu:**
  - Nâng cấp `Test 4`, `Test 4b` và bổ sung `Test 4c` trong [`tests/pti-session2-quiz.test.mjs`](./tests/pti-session2-quiz.test.mjs) kiểm tra tô màu không mất mát, giữ nguyên `CRLF` khi hiển thị/sao chép, chuỗi Python đơn dòng chưa đóng vs chuỗi 3 dấu nháy, `<!DOCTYPE` thiếu `>` và hiệu năng tuyến tính $O(N)$.
  - `git diff --check`: `0` cảnh báo; `npm run typecheck`: `0` lỗi; `npm test`: **`391 / 391 PASS`** (`24` bộ kiểm thử, `0` bị bỏ qua); `npm run build`: thành công.
  - Kiểm định độc lập bằng Codex CLI (`gpt-6.1-sol` `xhigh` `-s read-only`): **`VERDICT: GO`**.

---

### [2026-11-14] — Bổ sung Bài Thực hành 1 Buổi 2 Khóa PTI (`Ứng dụng Bộ Đếm Số — Click Counter`) & Nâng cấp Hiển thị Bảng Markdown trên Trang Bài học (`UI-12`)
- **Mục tiêu:**
  1. Bổ sung trọn vẹn đề bài và hướng dẫn thực hành **`BÀI THỰC HÀNH 1: ỨNG DỤNG BỘ ĐẾM SỐ (CLICK COUNTER)`** (Qt Designer `counter.ui` + Python PyQt6 OOP `main_bai1.py`) vào **Buổi 2 khóa PTI** (`55555555-5555-4555-8555-555555555602`), giữ nguyên trạng thái **Bản nháp (`draft`)** và giữ nguyên đủ **20 câu trắc nghiệm**.
  2. Đảm bảo trang chi tiết bài học ([`src/app/student/lessons/[lessonId]/page.tsx`](./src/app/student/lessons/[lessonId]/page.tsx)) hiển thị chuẩn các bảng thông số Markdown, tiêu đề `# `, ngắt dòng `<br>` trong ô bảng và các khối mã CSS / Python mà không mở nhầm khung xem trước HTML (`<iframe>`).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Database Migration ([`20261114103000_m6_pti_session2_practice.sql`](./supabase/migrations/20261114103000_m6_pti_session2_practice.sql)):**
     - Cập nhật `description` và `materials` cho Buổi 2 khóa PTI (`55555555-5555-4555-8555-555555555602`) gồm: Mục tiêu bài học, lưu ý làm 20 câu trắc nghiệm, toàn văn 4 phần **Bài Thực hành 1: Ứng dụng Bộ Đếm Số (Click Counter)** (bảng thiết kế `txt_display`, `btn_inc`, `btn_dec`, `btn_reset` trong Qt Designer, 2 khối `styleSheet` CSS, mã nguồn lớp `CounterApp(QMainWindow)` nạp `uic.loadUi("counter.ui", self)` trong `main_bai1.py`, giải thích kiến thức trọng tâm) và hướng dẫn đóng gói `.zip` (`counter.ui` + `main_bai1.py`, `<= 2 MB`) hoặc nộp `.py` / đường link.
     - Giữ nguyên `status = 'draft'`, `has_quiz = true`, `has_practice = true`, `practice_mode = 'file_allowed'`, kèm khối kiểm tra `DO $$ ... $$` bảo toàn đúng `20` câu `quiz_questions` và ghi nhận vào `supabase_migrations.schema_migrations`.
  2. **Trang Chi tiết Bài học Học sinh ([`src/app/student/lessons/[lessonId]/page.tsx`](./src/app/student/lessons/[lessonId]/page.tsx)):**
     - Đổi ngôn ngữ mặc định của khối mã không gắn nhãn từ `'html'` sang `'text'` (vẫn giữ xem trước trực tiếp cho bài HTML có nhãn `html` hoặc `<!DOCTYPE html>`, đồng thời hiển thị khung mã tối màu kèm nút sao chép cho CSS/Python mà không sinh `<iframe>`) và giữ nguyên thụt lề dòng đầu tiên.
     - Hỗ trợ dựng an toàn bằng phần tử React (không dùng `dangerouslySetInnerHTML`) cho bảng Markdown (`| ... |` + dòng căn lề `:---`), thẻ `<br>` trong ô bảng, tiêu đề cấp 1 (`# `) và danh sách con thụt đầu dòng; siết chặt bộ lọc liên kết `[nhãn](url)` chỉ nhận `http(s)://` hoặc đường dẫn nội bộ `/...` (chặn `javascript:` và `//...`) kèm `rel="noopener noreferrer"`.
- **Kiểm thử & Nghiệm thu:**
  - Mở rộng [`tests/pti-session2-quiz.test.mjs`](./tests/pti-session2-quiz.test.mjs) với `Test 1c` (kiểm tra migration thực hành), `Test 4b` (kiểm thử JSDOM hiển thị bảng Qt Designer, 3 khối code không mở `<iframe>`, chế độ Admin xem trước bài nháp và chặn học sinh xem bài nháp) và `Test 5` (chạy lặp cả 3 migration trên PostgreSQL 17 thật + dọn sạch tiến trình/thư mục tạm).
  - Đã áp dụng lên Supabase PROD `eythjapspkoyqdxlxtcd` và đối chiếu `--read-only` (`status = 'draft'`, `q_count = 20`, `practice_mode = 'file_allowed'`, `materials_len = 5029`).
  - `npm run typecheck`: `0` lỗi; `npm test`: **`390 / 390 PASS`** (`24` bộ kiểm thử, `0` bị bỏ qua); `npm run build`: thành công.
  - Kiểm định độc lập bằng Codex CLI (`gpt-6-luna` `xhigh` `-s read-only`): **`VERDICT: GO`**.

---

### [2026-11-14] — Khởi tạo Khóa học PTI (14 Buổi), Nạp 20 Câu Trắc nghiệm Buổi 2 (Bản nháp) & Cơ chế Ẩn/Hiện Đáp án Trắc nghiệm Theo Lượt Làm bài
- **Mục tiêu:**
  1. Tạo khóa học chính thức **`PTI — Lập trình Ứng dụng Python Chuyên sâu (Python OOP & PyQt6)`** (đủ 14 buổi cố định theo lộ trình `PTB -> PTA -> PTI`).
  2. Nạp bộ **20 câu trắc nghiệm `"Ôn Tập Buổi 2: Python OOP & PyQt6"`** (kèm lời giải thích `explanation` và khối mã Python nhiều dòng cho các câu 2, 3, 4, 11) vào **Buổi 2** ở trạng thái **Bản nháp (`draft`)** để Owner kiểm tra trước khi xuất bản.
  3. Áp dụng chặt chẽ vòng đời hiển thị đáp án cho học sinh: **ẩn hoàn toàn đáp án đúng và lời giải thích khi đang làm bài (kể cả khi tải lại trang) -> bắt buộc chọn đủ mọi câu mới được nộp -> hiện điểm, đánh dấu Đúng/Chưa đúng, đáp án đúng và lời giải thích ngay sau khi nộp -> ẩn lại toàn bộ khi học sinh bấm `"Làm lại lần nữa"`**.
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Database Migrations ([`20261114090000_m6_pti_course_session2_quiz.sql`](./supabase/migrations/20261114090000_m6_pti_course_session2_quiz.sql), [`20261114093000_m6_submit_quiz_atomic_review.sql`](./supabase/migrations/20261114093000_m6_submit_quiz_atomic_review.sql)):**
     - Bổ sung cột `public.quiz_questions.explanation` và cập nhật hàm `public.m3_update_lesson` (giữ nguyên toàn bộ khóa tuần tự `R18-02`) để lưu và cập nhật trường lời giải thích.
     - Khởi tạo khóa chính thức `PTI` (`44444444-4444-4444-8444-444444444423`, `14` buổi ở trạng thái `draft`) và nạp đủ `20` câu trắc nghiệm (`66666666-6666-4666-8666-666666666701` → `6720`) vào Buổi 2 (`55555555-5555-4555-8555-555555555602`), làm rõ câu chữ Câu 17 để `QLineEdit` là đáp án đúng duy nhất.
     - Cập nhật nguyên tử hàm `public.m3_submit_quiz_attempt` (xóa sạch cả 2 overload cũ để tránh trùng hàm trên `pg_proc`, giữ nguyên thứ tự khóa M5 và quyền chỉ cấp cho `service_role`): kiểm tra đầy đủ số câu, chặn phần tử `NULL`/âm/ngoài giới hạn (`INCOMPLETE_QUIZ_ANSWERS`), đối chiếu snapshot danh sách mã câu hỏi `p_expected_question_ids` chống lệch đề khi giáo viên sửa giữa chừng (`QUIZ_CHANGED_MID_ATTEMPT`), và trả trực tiếp cột `answer_review JSONB` khớp 100% với bộ câu vừa chấm.
  2. **Backend Edge, BFF & Tầng Bảo mật ([`supabase/functions/m2-backend/domain.ts`](./supabase/functions/m2-backend/domain.ts), [`supabase/functions/m2-backend/index.ts`](./supabase/functions/m2-backend/index.ts), [`src/app/api/m2/[action]/route.ts`](./src/app/api/m2/[action]/route.ts), [`src/lib/server/crypto.mjs`](./src/lib/server/crypto.mjs)):**
     - Triển khai `m2-backend` **Version `22`** (`ACTIVE`, `verify_jwt: false`) lên Supabase `eythjapspkoyqdxlxtcd`: ẩn `correctOptionIndex` và `explanation` trong `bootstrap` & `sanitizeBootstrapDto` đối với `student`; chuyển `submit-quiz` sang trả nguyên tử `answerReview` từ `m3_submit_quiz_attempt` (không đọc rời `quiz_questions`), ánh xạ lỗi `QUIZ_CHANGED_MID_ATTEMPT` -> HTTP `409` và `INCOMPLETE_QUIZ_ANSWERS` -> HTTP `400`.
     - Sửa BFF `/api/m2/[action]` không ép nhầm `null`/`""` thành đáp án `0` (chuyển sang `-1`) và truyền tiếp `questionIds`.
  3. **Giao diện Học sinh & Quản trị ([`src/lib/types.ts`](./src/lib/types.ts), [`src/lib/store.tsx`](./src/lib/store.tsx), [`src/app/student/lessons/[lessonId]/quiz/page.tsx`](./src/app/student/lessons/[lessonId]/quiz/page.tsx), [`src/app/admin/lessons/[lessonId]/edit/page.tsx`](./src/app/admin/lessons/[lessonId]/edit/page.tsx)):**
     - Trang làm bài trắc nghiệm học sinh định danh lựa chọn theo `question.id`, đóng băng danh sách `submittedQuestions` khi xem kết quả, hiển thị khối code Python có thụt lề, bắt buộc chọn đủ câu mới mở nút nộp, hiện `Đáp án đúng` + `Lựa chọn của bạn` + `Giải thích:` ngay sau khi nộp, và tự xóa toàn bộ trạng thái kết quả/giải thích khi bấm **"Làm lại lần nữa"** hoặc khi nhận mã `409 QUIZ_CHANGED_MID_ATTEMPT`.
     - Trang soạn bài Admin hỗ trợ ô nhập đề bài nhiều dòng và ô `Giải thích đáp án`, đồng thời bỏ gợi ý `(Đáp án đúng)` khỏi placeholder mặc định của Lựa chọn A.
- **Kiểm thử & Nghiệm thu:**
  - Bộ kiểm thử mới [`tests/pti-session2-quiz.test.mjs`](./tests/pti-session2-quiz.test.mjs) (gồm kiểm tra chạy cả 2 migration & RPC trực tiếp trên PostgreSQL 17 thật + dọn dẹp server/thư mục tạm nghiêm ngặt).
  - `npm run typecheck`: `0` lỗi; `npm test`: **`388 / 388 PASS`** (`24` bộ kiểm thử, `0` bị bỏ qua); `npm run build`: thành công.
  - Kiểm tra rollback giao dịch (`BEGIN ... ROLLBACK`) trực tiếp trên `eythjapspkoyqdxlxtcd`: xác nhận Buổi 2 PTI giữ nguyên trạng thái `draft` (`20` câu hỏi), `0` lớp / `0` học sinh / `0` kết quả làm bài.
  - Kiểm định độc lập bằng Codex CLI (`gpt-6-luna` `xhigh` `-s read-only`): **`VERDICT: GO`**.

---

### [2026-11-13] — Thiết lập `.graphifyignore` Bảo vệ Dữ liệu Thật/Session & Quét Bản đồ Mã nguồn Cục bộ (`graphify --code-only`, `GRAPHIFY_BACKEND=none`)
- **Mục tiêu:** Thiết lập lớp chắn [`.graphifyignore`](./.graphifyignore) ngăn toàn bộ dữ liệu thật của học sinh/lớp học, phiên đăng nhập (cookie/session), khóa bí mật và tệp khảo sát thực tế đi vào bộ chỉ mục; ẩn `graphify-out/` trong [`.gitignore`](./.gitignore); tạo bản đồ kiến trúc mã nguồn cục bộ hoàn toàn không gọi AI bên ngoài (`GRAPHIFY_BACKEND=none`).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Tạo [`.graphifyignore`](./.graphifyignore):** Chặn 4 nhóm nhạy cảm/tạm thời gồm: biến môi trường & khóa bí mật (`.env*`, `.envrc*`, `*.pem`, `*.key`, `.netrc`, `.pgpass`, `.npmrc`, `_private/`, `supabase/.temp/`), phiên đăng nhập & nhật ký thực thi (`.workflow-local/`, `scratch/`, `*cookie*.json`, `*session*.json`, `*storageState*.json`, `docs/*RUNTIME_RESULTS*.json`), dữ liệu thật & tệp xuất (`teachingmindx-sync-trial.html`, `teachingmindx-*`, `*.csv`, `*.xlsx`, `*.sqlite`, `*.dump`), cùng thư mục build/lockfile (`node_modules/`, `.next/`, `graphify-out/`, `package-lock.json`).
  2. **Cập nhật [`.gitignore`](./.gitignore):** Bổ sung `graphify-out/` để giữ sạch kho Git.
  3. **Bật hỗ trợ SQL AST (`tree-sitter-sql`) & Quét bản đồ mã nguồn cục bộ (`GRAPHIFY_BACKEND=none graphify extract . --code-only` & `graphify cluster-only .`):** Trích xuất cấu trúc AST cục bộ đủ `73/73` tệp mã nguồn (bao gồm cả `12` tệp migration PostgreSQL trong `supabase/migrations/`), tạo `graphify-out/graph.json`, `GRAPH_REPORT.md`, `graph.html`, `extract.log` và `extract_receipt.json` (`938` nút, `2.519` liên kết, `33` cụm chức năng được đặt tên rõ ràng, `0` token gửi ra ngoài, `0` rò rỉ tệp nhạy cảm).
- **Kiểm thử & Nghiệm thu:**
  - Đối chiếu rò rỉ trên `graph.json` và `manifest.json`: `0` rò rỉ (kể cả khi thử `gitignore=False`).
  - `npm run typecheck`: `0` lỗi; `npm test`: `382 / 382 PASS`.

---

### [2026-11-07] — Nâng cấp Bản vá Bảo mật Next.js (`16.4.0 → 16.4.5`)
- **Mục tiêu:** Nâng cấp `next` từ `16.4.0` lên `16.4.5` theo khuyến nghị bản vá bảo mật chính thức của Next.js và bật cấu hình `experimental.agentUpgrade = 'security'` trong [`next.config.mjs`](./next.config.mjs).
- **Kiểm thử & Nghiệm thu:**
  - `npx next --version`: `Next.js v16.4.5`.
  - `npm run typecheck`: `0` lỗi.
  - `npm test`: `382 / 382 PASS`.
  - `npm run build`: Build Production sạch không còn cảnh báo bảo mật.

---

### [2026-11-07] — Đồng nhất Giao diện 19 Màn hình, Mở khóa Gán khóa học cho Lớp & Mở khóa Đồng bộ Lớp Lập trình (`JSB`, `JSA`, `CSB`, `VT-JSB16`...)
- **Mục tiêu:**
  1. Cập nhật quy trình phối hợp đội ngũ AI 3 vai trò (`Agent chính`, `Codex CLI — gpt-6.1-sol xhigh`, `Argon High`) trong `AGENTS.md`, `docs/AI_AGENT_WORKFLOW.md` và `.agents/skills/team-workflow/SKILL.md`.
  2. Đồng nhất phong cách thiết kế bo góc mềm mại (`rounded-2xl`/`rounded-3xl`, viền mảnh `border-slate-100`, xanh dương `#1d63ed`, đổ bóng mềm) trên `Navbar`, `Footer`, `Trang chủ` (`/`) và `Trang Đăng nhập` (`/login`) khớp 100% với 15 trang bên trong.
  3. Mở khóa chọn **Khóa học liên kết (14 buổi)** ngay trong hộp thoại *"Sửa lớp / Phân công giáo viên"* tại `/manage/classes` và lược bỏ các chuỗi mã băm `SHA-256` kỹ thuật trên giao diện.
  4. Mở rộng bộ máy Đồng bộ Teaching MindX (`/admin/sync`, `teaching-sync-core.mjs`, `m2-backend`, SQL RPC `m4_apply_teaching_sync`) để đồng bộ được **tất cả các lớp Lập trình (`JSB`, `JSA`, `JSI`, `CSB`, `CSA`, `CSI`, `C4K`, `PT`...) và Robotics (`ROB`)**, hỗ trợ lọc đích danh 1 mã lớp (ví dụ `VT-JSB16`) và đọc trực tiếp API lấy danh sách học sinh theo lớp (`?get_students_of_class=1&class_code=VT-JSB16`).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Đồng nhất Giao diện Khung chung & Đăng nhập (`src/components/navbar.tsx`, `src/components/footer.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`):**
     - `Navbar`: Chuyển sang nền trắng mờ `bg-white/90 backdrop-blur-md`, cụm menu dạng viên thuốc (`Segmented Pill`), huy hiệu vai trò bo tròn nhẹ nhàng.
     - `HomePage` (`/`) & `LoginPage` (`/login`): Chuyển toàn bộ khung viền vuông đậm sang thẻ bo góc `rounded-3xl` + bóng đổ mềm `shadow-[0_14px_40px_rgba(8,112,184,0.06)]`; ẩn thẻ thông tin kỹ thuật dư thừa trên trang Đăng nhập.
  2. **Mở khóa Gán khóa học cho Lớp & Ẩn mã SHA-256 (`src/app/manage/classes/page.tsx`):**
     - Thay ô khóa cứng trong modal *"Sửa lớp / Phân công giáo viên"* bằng ô chọn `<select id="edit-class-course-info">` giúp Admin gán khóa `JSB — Lập trình Web Cơ bản` (hoặc khóa 14 buổi bất kỳ) cho lớp vừa đồng bộ từ Teaching.
     - Ẩn các chuỗi mã kiểm tra tệp `SHA-256` khỏi giao diện Đóng khóa 14 buổi (vẫn giữ nguyên kiểm tra toàn vẹn ngầm ở tầng `store` và `backend`).
  3. **Mở khóa Đồng bộ Lớp Lập trình & Lọc theo Mã lớp (`src/lib/teaching-sync-core.mjs`, `src/lib/simulation-rules.ts`, `src/lib/store.tsx`, `src/app/admin/sync/page.tsx`, `supabase/functions/m2-backend/index.ts`, `supabase/migrations/20261022120000_m6_allow_coding_classes_sync.sql`):**
     - Hỗ trợ `robFilterMode = 'all_classes'` (mặc định trên giao diện Đồng bộ thật) và `targetClassCode` (ví dụ `VT-JSB16`).
     - Hỗ trợ đọc tệp JSON mảng học sinh của 1 lớp từ `?get_students_of_class=1&class_code=...` bên cạnh định dạng DataTables.
     - Cập nhật Bookmarklet trên `/admin/sync` cho phép nhập mã lớp cần lấy nhanh (ví dụ `VT-JSB16`) hoặc để trống để đọc toàn bộ các trang.
  4. **Làm gọn câu chữ trên `/admin/teachers` và `/admin/lessons/[lessonId]/edit`:**
     - Lược bỏ mã `[UI-08]` và các cụm từ kỹ thuật (`Markdown / Rich Text`, `courseId: null`, `[UI-07]`).
- **Kiểm thử & Nghiệm thu:**
  - `npm run typecheck`: `0` lỗi.
  - `npm test`: `382 / 382 PASS` (bổ sung test `M4-14` kiểm thử đồng bộ lớp lập trình `VT-JSB16`).

---

### [2026-11-07] — Tinh gọn Giao diện (UI Streamlining): Ẩn chi tiết kỹ thuật & công cụ kiểm thử trên môi trường thật (`isLiveMode`)
- **Mục tiêu:** Theo yêu cầu của Owner trước khi nạp thêm nội dung bài học mới, lược bỏ toàn bộ thông tin kỹ thuật nội bộ (UUID, `participantId`, thuật ngữ `RFC 4180` / `SHA-256 Digest`, đường dẫn tệp nội bộ, các hộp giải thích quy tắc hệ thống dài dòng) và ẩn các công cụ kiểm thử giả lập (`Fixture`, `Simulate Failure`) khi chạy trên môi trường thật (`isLiveMode`).
- **Tính năng & Thay đổi đã thực hiện:**
  1. **Trang Đồng bộ Teaching (`src/app/admin/sync/page.tsx`):**
     - Khi chạy ở chế độ thật (`isLiveMode = true`), tự động mở thẳng giao diện **Đồng bộ chính thức từ Teaching MindX**, ẩn nút *"Khôi phục dữ liệu mẫu ban đầu"*, thanh chuyển tab dữ liệu giả TEST và các hộp kiểm tra chẩn đoán Mốc 1/Mốc 4 (`CORS/SOP probe`, mẫu báo cáo giả lập).
     - Bổ sung bảng hiển thị danh sách lớp ROB mới và danh sách học sinh cần đối chiếu ngay trong thẻ Xem trước đồng bộ thật.
     - Vẫn giữ nguyên đầy đủ cấu trúc DOM khi `!isLiveMode` để tương thích 100% với bộ kiểm thử tự động `tests/m4-teaching-sync.test.mjs`.
  2. **Trang Quản lý Lớp học, Cấp PIN & Đóng khóa 14 buổi (`src/app/manage/classes/page.tsx`):**
     - Bỏ cột *"Mã định danh nội bộ"* (`participantId`) khỏi bảng danh sách học sinh chính và ngăn kéo chi tiết học sinh, giúp bảng gọn và dễ nhìn.
     - Bổ sung nút **Thu gọn / Mở rộng** (`isCloseSectionOpen`, mặc định thu gọn khi không có tác vụ dở dang) cho khu vực **Đóng khóa 14 buổi**, kèm nhãn tóm tắt dung lượng ngay trên tiêu đề để trang quản lý lớp hàng ngày ngắn gọn.
     - Ẩn các nút tạo dữ liệu mẫu *"Chuẩn bị Lớp mẫu 14 buổi Mốc 5 (ROB-K14-M5-01)"* và ô chọn *"Chế độ kiểm thử an toàn trên TEST"* đối với các lớp học thật trên môi trường `isLiveMode`.
     - Chuyển các thuật ngữ kỹ thuật (*"RFC 4180"*, *"SHA-256 Digest"*, *"Giữ chỗ đồng thời"*, *"no-store"*) sang tiếng Việt tự nhiên, dễ hiểu.
  3. **Trang Quản lý Khóa học & Soạn bài (`src/app/admin/courses/page.tsx`, `src/app/admin/lessons/[lessonId]/edit/page.tsx`):**
     - Loại bỏ mã UUID nội bộ (`44444444-...`) trên thẻ khóa học và tiêu đề chi tiết khóa học, thay bằng nhãn *"Khóa 14 buổi"* / *"Chương trình 14 buổi"*.
     - Làm gọn câu chữ mô tả và nhãn cột bảng 14 buổi học (*"Tải tệp / Link"*, *"Chưa bật bài tập"*).
  4. **Trang chủ, Khu vực Học sinh & Chấm bài (`src/app/page.tsx`, `src/app/student/course/page.tsx`, `src/app/student/lessons/[lessonId]/page.tsx`, `src/app/student/lessons/[lessonId]/quiz/page.tsx`, `src/app/teacher/submissions/page.tsx`):**
     - Khi người dùng đã đăng nhập trên môi trường thật (`isLiveMode && currentUser`), ẩn 3 thẻ giới thiệu vai trò chung trên Trang chủ để tập trung vào lối tắt vào thẳng không gian làm việc và lộ trình 3 cấp độ.
     - Bỏ hộp *"Quy tắc học tập"* dư thừa trên trang lộ trình khóa học của học sinh; rút gọn hộp hướng dẫn làm Quiz 4 dòng thành 1 dòng nhắc nhanh.
     - Hiển thị tên tệp bài nộp sạch sẽ (`currentSub.content.split('/').pop()`) thay vì đường dẫn lưu trữ nội bộ dài dòng trên cả trang Học sinh và trang Giáo viên chấm bài.
- **Kiểm thử & Nghiệm thu:**
  - `npm run typecheck` (`tsc --noEmit`): `0` lỗi.
  - `npm test`: `381 / 381 PASS` (23 bộ test từ Mốc 1 → Mốc 6).
  - `npm run build`: Build Production thành công.

---

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
