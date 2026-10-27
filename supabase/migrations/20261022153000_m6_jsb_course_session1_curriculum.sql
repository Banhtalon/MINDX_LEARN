-- ============================================================================
-- MINDX LEARN — Khóa học JSB (Web Basic) & Giáo trình chi tiết Buổi 1
-- Chủ đề Buổi 1: Website hoạt động như thế nào
-- Lộ trình chuẩn MindX: Basic (JSB) -> Advanced (JSA) -> Intensive (JSI)
-- ============================================================================

BEGIN;

-- 1. Tạo khóa học chính thức JSB (14 buổi cố định)
INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
VALUES (
  '44444444-4444-4444-8444-444444444411',
  'JSB — Lập trình Web Cơ bản (HTML5, CSS3 & JavaScript Basic)',
  'Khóa học mở đầu (Cấp độ 1: Basic) trong lộ trình Web tại MindX (JSB → JSA → JSI). Học sinh nắm vững nguyên lý vận hành Website, tiêu chuẩn W3C/HTTPS, cấu trúc HTML5, trang trí giao diện CSS3 và lập trình tương tác JavaScript cơ bản qua 14 buổi học.',
  14,
  false
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    total_sessions = 14,
    is_fixture = false,
    updated_at = now();

-- 2. Tạo giáo trình chi tiết cho Buổi 1 (Đã xuất bản, có đủ Quiz 6 câu + Thực hành nộp Link/File <= 2MB)
INSERT INTO public.lessons (
  id, course_id, session_number, title, description, materials, video_url,
  status, has_quiz, has_practice, practice_mode
)
VALUES (
  '55555555-5555-4555-8555-555555555511',
  '44444444-4444-4444-8444-444444444411',
  1,
  'Buổi 1: Website hoạt động như thế nào',
  'Buổi 1 có chủ đề Website hoạt động như thế nào. Cùng ôn tập 4 mục tiêu chính: (1) Hiểu khái niệm website và cách trang web hoạt động; (2) Nhận biết các tiêu chuẩn, khái niệm W3C, URL và HTTPS; (3) Nhận biết HTML5 và các thẻ HTML cơ bản; (4) Tự tay tạo trang web đơn giản giới thiệu bản thân.',
  $JSB_B1$## Mục tiêu bài học (Buổi 1 / 14)
1. **Hiểu khái niệm Website** và quy trình một trang web hoạt động theo mô hình **Client – Server**.
2. **Nhận biết các tiêu chuẩn & khái niệm cốt lõi:** Tổ chức **W3C**, địa chỉ **URL** và giao thức bảo mật **HTTPS**.
3. **Làm chủ nền tảng HTML5:** Hiểu cấu trúc khung xương chuẩn của một tệp `.html` và cách dùng các thẻ HTML5 cơ bản.
4. **Thực hành sáng tạo:** Tự tay viết mã và hiển thị **Trang web đơn giản giới thiệu bản thân (My First Profile Page)**.

---

## Phần 1. Website là gì và Trang web hoạt động như thế nào?

### 1.1. Phân biệt Trang web (Webpage) và Website
- **Trang web (Webpage):** Là một tài liệu đơn lẻ hiển thị trên trình duyệt (ví dụ: chỉ riêng trang Đăng nhập hoặc trang Giới thiệu).
- **Website:** Là tập hợp nhiều **trang web** được liên kết chặt chẽ với nhau dưới cùng một tên miền (ví dụ: toàn bộ hệ thống học tập `mindx.edu.vn`).

### 1.2. Mô hình Client – Server (Trình duyệt & Máy chủ)
Mỗi khi bạn nhập địa chỉ web và nhấn **Enter**, một cuộc hội thoại tốc độ cao diễn ra qua 3 bước:
1. **Bước 1 — Gửi yêu cầu (Request):** Máy tính/điện thoại của bạn mở **Trình duyệt (Browser / Client)** như Chrome, Edge, Safari và gửi một bức thư yêu cầu qua mạng Internet đến **Máy chủ (Web Server)**.
2. **Bước 2 — Xử lý & Phản hồi (Response):** Máy chủ tìm đúng tài liệu của trang web đó và gửi trả về trình duyệt bộ 3 tệp nền tảng: **`HTML`**, **`CSS`** và **`JavaScript`**.
3. **Bước 3 — Hiển thị (Render):** Trình duyệt đọc mã nguồn nhận được và vẽ lên màn hình trang web hoàn chỉnh có chữ, hình ảnh, màu sắc và nút bấm.

> 💡 **Ghi nhớ nhanh bộ 3 ngôn ngữ tạo nên mọi trang web:**
> • **HTML (HyperText Markup Language):** Bộ khung xương & nội dung chính (tiêu đề, đoạn văn, hình ảnh).
> • **CSS (Cascading Style Sheets):** Lớp áo thẩm mỹ (màu sắc, phông chữ, bố cục đẹp mắt).
> • **JavaScript (JS):** Bộ não tương tác (xử lý khi bấm nút, kiểm tra biểu mẫu, hiệu ứng động).

---

## Phần 2. Các tiêu chuẩn Web: W3C, URL và HTTPS

### 2.1. Tổ chức W3C là gì?
- **W3C (World Wide Web Consortium):** Là tổ chức tiêu chuẩn quốc tế cho mạng lưới Web toàn cầu (do nhà phát minh Web **Tim Berners-Lee** sáng lập).
- **Vai trò của W3C:** Đưa ra bộ quy tắc chuẩn cho **HTML5** và **CSS3** để một trang web khi viết ra có thể hiển thị đúng và đồng nhất trên mọi trình duyệt (Chrome, Firefox, Safari, Edge) cũng như mọi thiết bị.

### 2.2. Giải phẫu một địa chỉ URL (Uniform Resource Locator)
- **URL** là địa chỉ định danh duy nhất giúp trình duyệt tìm đúng tài nguyên trên Internet.
- Ví dụ giải phẫu địa chỉ: `https://mindx.edu.vn/khoa-hoc/jsb-bai-1`
  - **`https://` (Giao thức / Protocol):** Quy tắc truyền tải dữ liệu giữa trình duyệt và máy chủ.
  - **`mindx.edu.vn` (Tên miền / Domain Name):** Địa chỉ định danh dễ nhớ của máy chủ Website.
  - **`/khoa-hoc/jsb-bai-1` (Đường dẫn / Path):** Vị trí chính xác của trang học tập bên trong máy chủ.

### 2.3. Tại sao HTTPS lại quan trọng hơn HTTP?
- **HTTP (HyperText Transfer Protocol):** Dữ liệu truyền đi ở dạng văn bản thường, dễ bị kẻ xấu nghe lén trên đường truyền.
- **HTTPS (HTTP Secure — có biểu tượng ổ khóa 🔒):** Dữ liệu giữa trình duyệt và máy chủ được **mã hóa an toàn (SSL/TLS)**, giúp bảo vệ mật khẩu, mã PIN và thông tin cá nhân của người dùng.

---

## Phần 3. Ngôn ngữ HTML5 & Các thẻ HTML cơ bản

### 3.1. Cấu trúc chuẩn của một tài liệu HTML5
Mọi tệp trang web (`.html`) đều tuân theo cấu trúc khung chuẩn gồm 4 thành phần:
- **`<!DOCTYPE html>`:** Dòng khai báo đầu tiên báo cho trình duyệt biết tệp này sử dụng chuẩn **HTML5** mới nhất.
- **`<html> ... </html>`:** Thẻ gốc (Root) bao bọc toàn bộ nội dung của trang.
- **`<head> ... </head>`:** Phần thông tin cấu hình của trang (bảng mã tiếng Việt `<meta charset="UTF-8">`, tiêu đề hiển thị trên thanh tab trình duyệt `<title>`).
- **`<body> ... </body>`:** Phần thân chứa **toàn bộ nội dung hiển thị trực tiếp** trên màn hình cho người xem.

### 3.2. Nhóm các thẻ HTML5 cơ bản thường dùng nhất
- **Thẻ tiêu đề (`<h1>` đến `<h6>`):** `<h1>` là tiêu đề chính lớn nhất và quan trọng nhất trên trang; nhỏ dần đến `<h6>`.
- **Thẻ văn bản & định dạng:**
  - `<p>`: Tạo một đoạn văn bản (Paragraph).
  - `<strong>`: In đậm nội dung quan trọng.
  - `<em>`: In nghiêng để nhấn mạnh câu chữ.
  - `<br>`: Ngắt xuống dòng; `<hr>`: Tạo đường kẻ ngang phân cách phần nội dung.
- **Thẻ danh sách (Lists):**
  - `<ul>`: Danh sách không thứ tự (hiển thị dấu chấm tròn `•`).
  - `<ol>`: Danh sách có thứ tự (hiển thị số `1, 2, 3...`).
  - `<li>`: Từng mục nhỏ nằm bên trong `<ul>` hoặc `<ol>`.
- **Thẻ hình ảnh & liên kết:**
  - `<img src="duong-dan-anh.jpg" alt="Mô tả ảnh">`: Chèn hình ảnh (thuộc tính `alt` giúp hiển thị chữ thay thế khi ảnh lỗi).
  - `<a href="https://mindx.edu.vn" target="_blank">Trang chủ MindX</a>`: Tạo liên kết bấm vào để mở trang khác.

---

## Phần 4. Thực hành: Tạo trang web đơn giản giới thiệu bản thân

Dưới đây là mã nguồn chuẩn của trang web **Giới thiệu bản thân (`index.html`)** áp dụng trọn vẹn các thẻ HTML5 vừa học. Em có thể bấm **"Sao chép code"** để dán vào Visual Studio Code hoặc xem ngay kết quả hiển thị bên dưới:

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Trang cá nhân của Minh — Học viên JSB MindX</title>
  <style>
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background-color: #f0f6ff;
      color: #1e293b;
      margin: 0;
      padding: 20px;
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #bfdbfe;
      border-radius: 16px;
      padding: 20px 24px;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08);
    }
    .badge {
      display: inline-block;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 12px;
      font-weight: bold;
      padding: 4px 10px;
      border-radius: 999px;
    }
    h1 { color: #1e3a8a; margin: 10px 0 6px; font-size: 22px; }
    h2 { color: #2563eb; font-size: 16px; margin-top: 16px; margin-bottom: 6px; }
    p { line-height: 1.5; font-size: 14px; margin: 6px 0; }
    ul { margin: 6px 0; padding-left: 20px; font-size: 14px; }
    li { margin-bottom: 4px; }
    a { color: #2563eb; font-weight: bold; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Khóa JSB • Buổi 1: HTML5 Cơ bản</span>
    <h1>Xin chào! Mình là Nguyễn Hoàng Minh 👋</h1>
    <p>Mình đang là học viên lớp <strong>Lập trình Web Cơ bản (JSB)</strong> tại <em>MindX Technology School</em>.</p>
    <hr>
    <h2>🎯 Sở thích & Đam mê của mình</h2>
    <ul>
      <li>Khám phá cách các <strong>Website</strong> và trò chơi trực tuyến hoạt động.</li>
      <li>Thiết kế giao diện sáng tạo bằng <strong>HTML5 & CSS3</strong>.</li>
      <li>Đọc sách khoa học, lắp ráp mô hình và chơi bóng rổ.</li>
    </ul>
    <h2>🔗 Kết nối với mình</h2>
    <p>Xem lộ trình học của mình tại: <a href="https://mindx.edu.vn" target="_blank">Trường học Công nghệ MindX</a></p>
  </div>
</body>
</html>
```

### Đề bài Nộp Thực hành Buổi 1 (Dành cho Học sinh)
1. Tạo tệp `index.html` trên máy tính (hoặc trên CodePen / GitHub) và thay đổi nội dung theo **thông tin thật của chính em**:
   - Có khai báo chuẩn `<!DOCTYPE html>`, `<head>`, `<title>` và `<body>`.
   - Có thẻ tiêu đề `<h1>` giới thiệu **Họ và tên** của em.
   - Có ít nhất 1 đoạn văn `<p>` giới thiệu trường/lớp và mục tiêu học lập trình Web.
   - Có danh sách `<ul>` hoặc `<ol>` liệt kê **ít nhất 3 sở thích hoặc môn học yêu thích** (`<li>`).
   - Có ít nhất 1 thẻ hình ảnh `<img>` hoặc thẻ liên kết `<a>`.
2. **Cách nộp bài ở mục số 3 bên dưới:** Em có thể dán **Đường link** (CodePen / GitHub / Google Drive) hoặc chọn tab **Tải tệp (`<= 2MB`)** để nộp trực tiếp tệp `index.html` hoặc `.zip` lên hệ thống.$JSB_B1$,
  'https://www.youtube-nocookie.com/embed/qz0aGYrrlhU',
  'published',
  true,
  true,
  'file_allowed'
)
ON CONFLICT (course_id, session_number) DO UPDATE
SET id = EXCLUDED.id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    materials = EXCLUDED.materials,
    video_url = EXCLUDED.video_url,
    status = EXCLUDED.status,
    has_quiz = EXCLUDED.has_quiz,
    has_practice = EXCLUDED.has_practice,
    practice_mode = EXCLUDED.practice_mode,
    updated_at = now();

-- 3. Tạo khung 13 buổi tiếp theo (Buổi 2..14) của khóa JSB ở trạng thái Bản nháp (draft)
DO $$
DECLARE
  v_s INT;
  v_titles TEXT[] := ARRAY[
    'Buổi 2: Các thẻ HTML5 nâng cao — Bảng biểu (Table), Biểu mẫu (Form) & Ngữ nghĩa (Semantic)',
    'Buổi 3: Làm quen với CSS3 — Màu sắc, Phông chữ (Typography) & Bộ chọn (Selectors)',
    'Buổi 4: Mô hình Hộp (CSS Box Model) — Margin, Border, Padding & Kích thước phần tử',
    'Buổi 5: Bố cục trang web hiện đại với CSS Flexbox',
    'Buổi 6: Định vị phần tử (Position) & Thiết kế đáp ứng đa màn hình (Responsive Web)',
    'Buổi 7: Thực hành Dự án Giữa khóa — Xây dựng Landing Page Cá nhân hoàn chỉnh',
    'Buổi 8: Nhập môn ngôn ngữ lập trình JavaScript — Biến, Kiểu dữ liệu & Toán tử',
    'Buổi 9: Cấu trúc điều khiển rẽ nhánh (if/else) & Vòng lặp (for/while) trong JavaScript',
    'Buổi 10: Hàm (Functions), Mảng (Arrays) & Đối tượng (Objects) cơ bản',
    'Buổi 11: Tương tác trang web với DOM (Document Object Model) & Sự kiện (Events)',
    'Buổi 12: Kiểm tra dữ liệu Biểu mẫu (Form Validation) & Lưu trữ cục bộ (LocalStorage)',
    'Buổi 13: Hoàn thiện Dự án Cuối khóa JSB — Ứng dụng Web Tương tác',
    'Buổi 14: Thuyết trình sản phẩm Cuối khóa (Demo Day) & Tổng kết lộ trình JSB'
  ];
BEGIN
  FOR v_s IN 2..14 LOOP
    INSERT INTO public.lessons (
      id, course_id, session_number, title, description, materials, video_url,
      status, has_quiz, has_practice, practice_mode
    )
    VALUES (
      ('55555555-5555-4555-8555-5555555555' || lpad((10 + v_s)::text, 2, '0'))::uuid,
      '44444444-4444-4444-8444-444444444411',
      v_s,
      v_titles[v_s - 1],
      'Nội dung chuẩn bị cho ' || v_titles[v_s - 1] || ' thuộc chương trình JSB 14 buổi.',
      'Đang cập nhật giáo trình chi tiết cho buổi học này.',
      '',
      'draft',
      true,
      true,
      'file_allowed'
    )
    ON CONFLICT (course_id, session_number) DO UPDATE
    SET title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = now();
  END LOOP;
END;
$$;

-- 4. Tạo bộ 6 câu hỏi Trắc nghiệm (Quiz) cho Buổi 1 khóa JSB
DELETE FROM public.quiz_questions
WHERE lesson_id = '55555555-5555-4555-8555-555555555511';

INSERT INTO public.quiz_questions (id, lesson_id, prompt, options, correct_option_index, order_index)
VALUES
  (
    '66666666-6666-4666-8666-666666666601',
    '55555555-5555-4555-8555-555555555511',
    'Khi bạn nhập một địa chỉ web vào trình duyệt (Client) và nhấn Enter, trình duyệt nhận về bộ 3 thành phần cốt lõi nào từ Máy chủ (Web Server) để hiển thị trang web?',
    '["HTML (khung xương nội dung), CSS (màu sắc & bố cục thẩm mỹ) và JavaScript (tương tác & hành động)", "Chỉ duy nhất một bức ảnh chụp màn hình cố định từ máy chủ gửi về", "Mã nguồn hệ điều hành Windows và trình điều khiển phần cứng máy tính", "Cơ sở dữ liệu thô chưa qua xử lý và mật khẩu quản trị của máy chủ"]'::jsonb,
    0,
    0
  ),
  (
    '66666666-6666-4666-8666-666666666602',
    '55555555-5555-4555-8555-555555555511',
    'Tổ chức W3C (World Wide Web Consortium) đóng vai trò gì trong thế giới Internet?',
    '["Xây dựng và duy trì các tiêu chuẩn chung cho Web (như HTML5, CSS3) để trang web hiển thị đồng nhất trên mọi trình duyệt", "Cung cấp dịch vụ lắp đặt mạng cáp quang Wi-Fi cho các hộ gia đình", "Sản xuất máy tính cá nhân và điện thoại thông minh trên toàn cầu", "Lưu trữ toàn bộ mật khẩu tài khoản mạng xã hội của người dùng"]'::jsonb,
    0,
    1
  ),
  (
    '66666666-6666-4666-8666-666666666603',
    '55555555-5555-4555-8555-555555555511',
    'Trong địa chỉ URL https://mindx.edu.vn/khoa-hoc/jsb, chữ "S" ở cuối giao thức HTTPS có ý nghĩa quan trọng gì?',
    '["Secure (Bảo mật) — Dữ liệu truyền giữa trình duyệt và máy chủ được mã hóa an toàn (SSL/TLS), chống nghe lén", "Speed (Tốc độ) — Giúp trang web tự động tải nhanh gấp 10 lần mà không cần kết nối mạng", "Simple (Đơn giản) — Chỉ cho phép trang web hiển thị chữ đen trắng cơ bản, không có hình ảnh", "Server (Máy chủ) — Báo hiệu trang web này chỉ mở được trên máy tính của lập trình viên"]'::jsonb,
    0,
    2
  ),
  (
    '66666666-6666-4666-8666-666666666604',
    '55555555-5555-4555-8555-555555555511',
    'Trong một tệp HTML5 chuẩn, toàn bộ nội dung hiển thị trực tiếp trên màn hình cho người xem (tiêu đề, đoạn văn, hình ảnh, danh sách) phải được đặt bên trong cặp thẻ nào?',
    '["<body> ... </body>", "<head> ... </head>", "<title> ... </title>", "<meta> ... </meta>"]'::jsonb,
    0,
    3
  ),
  (
    '66666666-6666-4666-8666-666666666605',
    '55555555-5555-4555-8555-555555555511',
    'Để hiển thị Tiêu đề chính lớn nhất của trang giới thiệu bản thân và một danh sách sở thích có dấu chấm đầu dòng, em cần kết hợp các thẻ nào sau đây?',
    '["Thẻ <h1> cho tiêu đề chính và cặp thẻ <ul> kết hợp <li> cho danh sách sở thích", "Thẻ <h6> cho tiêu đề lớn nhất và thẻ <br> cho danh sách sở thích", "Thẻ <p> cho tiêu đề lớn nhất và thẻ <hr> để tạo các mục danh sách", "Thẻ <title> đặt trong <head> để làm tiêu đề giữa trang và thẻ <a> để tạo danh sách"]'::jsonb,
    0,
    4
  ),
  (
    '66666666-6666-4666-8666-666666666606',
    '55555555-5555-4555-8555-555555555511',
    'Khi chèn ảnh đại diện vào trang giới thiệu bản thân bằng thẻ <img src="avatar.jpg" alt="Ảnh chân dung của Minh">, thuộc tính alt có tác dụng gì?',
    '["Hiển thị dòng chữ mô tả thay thế nếu ảnh bị lỗi đường dẫn và hỗ trợ công cụ tìm kiếm/trình đọc màn hình hiểu nội dung bức ảnh", "Tự động phóng to kích thước bức ảnh lên gấp đôi màn hình", "Đổi định dạng tệp ảnh từ .jpg sang video .mp4", "Biến bức ảnh thành một nút bấm tự động đóng trình duyệt"]'::jsonb,
    0,
    5
  );

COMMIT;
