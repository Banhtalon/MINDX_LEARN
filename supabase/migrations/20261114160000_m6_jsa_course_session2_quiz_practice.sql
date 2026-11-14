-- ============================================================================
-- MINDX LEARN — Khóa học JSA (Web Developer - Advanced) & Trọn bộ Buổi 2
-- Chủ đề Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript (Bản nháp)
-- Lộ trình chuẩn MindX: Basic (JSB) -> Advanced (JSA) -> Intensive (JSI)
-- Bao gồm:
--   1. Khởi tạo khóa chính thức JSA (14 buổi cố định, is_fixture = false)
--   2. Giáo trình + Thực hành Đề bài 1 & Đề bài 2 cho Buổi 2 (status = 'draft')
--   3. Trọn bộ 20 câu hỏi Trắc nghiệm Buổi 2 (10 câu gốc + 10 câu mở rộng Thực hành)
-- ============================================================================

BEGIN;

-- 1. Tạo khóa học chính thức JSA (14 buổi cố định, is_fixture = false)
INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
VALUES (
  '44444444-4444-4444-8444-444444444412',
  'JSA — Lập trình Web Nâng cao (JavaScript Advanced & Web App)',
  'Khóa học nâng cao (Cấp độ 2: Advanced) trong lộ trình Web Developer tại MindX (JSB → JSA → JSI). Học sinh làm chủ ngôn ngữ lập trình JavaScript hiện đại (ES6+), thao tác chuỗi/mảng/đối tượng, xử lý bất đồng bộ, kết nối API, lưu trữ dữ liệu và hoàn thiện ứng dụng Web tương tác qua 14 buổi học.',
  14,
  false
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    total_sessions = 14,
    is_fixture = false,
    updated_at = now();

-- 2. Tạo đủ 14 buổi học cho khóa JSA (tất cả ở trạng thái Bản nháp 'draft')
DO $$
DECLARE
  v_s INT;
  v_titles TEXT[] := ARRAY[
    'Buổi 1: Ôn tập HTML5/CSS3 nâng cao & Tổ chức giao diện dự án Web',
    'Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript',
    'Buổi 3: Toán tử, Cấu trúc rẽ nhánh (if/else, switch) & Vòng lặp trong JavaScript',
    'Buổi 4: Mảng (Arrays), Đối tượng (Objects) & Duyệt dữ liệu thực tế',
    'Buổi 5: Hàm nâng cao (Arrow Functions, Callback) & Các phương thức mảng ES6 (map, filter, find)',
    'Buổi 6: Thao tác DOM nâng cao & Xử lý sự kiện người dùng (DOM & Events)',
    'Buổi 7: Thực hành Dự án Giữa khóa — Giao diện & Tính năng Tương tác Web App',
    'Buổi 8: Lưu trữ dữ liệu phía trình duyệt với LocalStorage & JSON',
    'Buổi 9: Lập trình Bất đồng bộ (Asynchronous JS), Promise & Async/Await',
    'Buổi 10: Kết nối dữ liệu thực tế từ máy chủ với Fetch API',
    'Buổi 11: Xác thực người dùng (Đăng ký / Đăng nhập) & Kiểm tra dữ liệu biểu mẫu',
    'Buổi 12: Tổ chức mã nguồn theo Module ES6 & Tối ưu hóa trải nghiệm ứng dụng',
    'Buổi 13: Hoàn thiện Dự án Cuối khóa JSA — Ứng dụng Web Động kết nối API',
    'Buổi 14: Thuyết trình sản phẩm Cuối khóa (Demo Day) & Tổng kết lộ trình JSA'
  ];
BEGIN
  FOR v_s IN 1..14 LOOP
    INSERT INTO public.lessons (
      id, course_id, session_number, title, description, materials, video_url,
      status, has_quiz, has_practice, practice_mode
    )
    VALUES (
      ('55555555-5555-4555-8555-5555555557' || lpad(v_s::text, 2, '0'))::uuid,
      '44444444-4444-4444-8444-444444444412',
      v_s,
      v_titles[v_s],
      'Nội dung chuẩn bị cho ' || v_titles[v_s] || ' thuộc chương trình JSA 14 buổi.',
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

-- 3. Cập nhật giáo trình chi tiết & 2 bài Thực hành (Đề bài 1 & Đề bài 2) cho Buổi 2 khóa JSA
UPDATE public.lessons
SET title = 'Buổi 2: Biến, Kiểu dữ liệu & Xử lý chuỗi trong JavaScript',
    description = 'Chinh phục JavaScript cơ bản trong lộ trình Web Developer - Advanced (JSA): Khai báo biến var/let/const, quy tắc đặt tên biến, các kiểu dữ liệu nguyên thủy (Primitive Types), toán tử typeof & NaN, các phương thức xử lý chuỗi (.toUpperCase, .toLowerCase, .replace, .substring, .length), hàm nhập liệu prompt(), bộ 20 câu hỏi trắc nghiệm và 2 bài thực hành trọng tâm (Đề bài 1 & Đề bài 2).',
    materials = $JSA_B2_PRACTICE$## Mục tiêu bài học (Buổi 2 / 14)
1. **Làm chủ khai báo biến & hằng số:** Phân biệt rõ `var`, `let`, `const` và áp dụng đúng quy tắc đặt tên biến hợp lệ trong JavaScript.
2. **Hiểu sâu kiểu dữ liệu nguyên thủy (Primitive Types):** Nhận diện `Number`, `String`, `Boolean`, `Undefined`, `Null`, `Symbol`, `BigInt`, cùng các trường hợp đặc biệt như `typeof NaN`, `typeof typeof 1` và ép kiểu chuỗi.
3. **Thành thạo xử lý chuỗi & tương tác dữ liệu:** Vận dụng `.length`, `.toUpperCase()`, `.toLowerCase()`, `.replace()`, `.substring()`, nối chuỗi (`+` hoặc Template String) và hàm nhập liệu `prompt()`.
4. **Hoàn thành 20 câu Trắc nghiệm & 2 đề Thực hành:** Đạt từ **70%** bài trắc nghiệm (tối thiểu 14/20 câu đúng) và hoàn thành trọn vẹn **Đề bài 1** cùng **Đề bài 2**.

> 💡 **Lưu ý khi làm Trắc nghiệm Buổi 2:** Bộ đề gồm **20 câu hỏi** (10 câu gốc từ tài liệu Buổi 2 và 10 câu mở rộng từ Thực hành Đề bài 1 & 2). Em cần chọn đủ cả 20 câu trước khi bấm **Nộp bài chấm điểm**; sau khi nộp xong hệ thống sẽ hiển thị đáp án đúng kèm lời giải thích chi tiết (khi bấm **Làm lại lần nữa**, đáp án sẽ tự động ẩn đi để em tự ôn luyện lại).

---

## Phần 1. Tóm tắt Kiến thức Trọng tâm Buổi 2

### 1.1. Khai báo biến (`var`, `let`, `const`) & Quy tắc đặt tên
- Tên biến trong JavaScript chỉ được bắt đầu bằng **chữ cái**, dấu gạch dưới **`_`** hoặc ký hiệu đô la **`$`** — **tuyệt đối không được bắt đầu bằng chữ số** (ví dụ: `_myVariable`, `$myVariable`, `myVariable2` là hợp lệ; `2myVariable`, `10cars` gây lỗi `SyntaxError`).

| Từ khóa | Mục đích sử dụng | Khởi tạo giá trị ngay khi khai báo | Cho phép gán lại giá trị mới |
| :--- | :--- | :--- | :--- |
| `var` | Khai báo biến kiểu cũ (phạm vi hàm) | Không bắt buộc (mặc định là `undefined`) | Có |
| `let` | Khai báo biến số hiện đại ES6 (phạm vi khối `{}`) | Không bắt buộc (mặc định là `undefined`) | Có |
| `const` | Khai báo hằng số cố định (phạm vi khối `{}`) | **Bắt buộc gán ngay trên dòng khai báo** | **Không** (gán lại gây lỗi) |

### 1.2. Các công cụ kiểm tra kiểu, xử lý chuỗi & nhập liệu cần nhớ

| Cú pháp / Phương thức | Công dụng chính | Ví dụ minh họa & Kết quả |
| :--- | :--- | :--- |
| `typeof x` | Trả về chuỗi tên kiểu dữ liệu của `x` | `typeof NaN` → `"number"`<br>`typeof typeof 1` → `"string"` |
| `str.length` | Đếm tổng số ký tự trong chuỗi (tính cả dấu cách) | `"Hà Nội".length` → `6` |
| `str.toUpperCase()` | Trả về chuỗi mới viết **IN HOA** toàn bộ | `"Hello".toUpperCase()` → `"HELLO"` |
| `str.toLowerCase()` | Trả về chuỗi mới viết **chữ thường** toàn bộ | `"baNaNa".toLowerCase()` → `"banana"` |
| `str.replace(a, b)` | Thay thế chuỗi con `a` đầu tiên bằng `b` | `"Hello MindX".replace("Hello", "Hi")` → `"Hi MindX"` |
| `str.substring(start, end)` | Cắt chuỗi từ vị trí `start` đến sát `end` | `"JavaScript".substring(0, 4)` → `"Java"` |
| `prompt("Lời nhắc:")` | Mở hộp thoại nhập văn bản từ bàn phím | Luôn trả về kiểu `"string"` khi nhấn OK (ví dụ `"15"`) |

---

# BÀI THỰC HÀNH ĐỀ BÀI 1: KHAI BÁO BIẾN & XỬ LÝ CHUỖI (`bai1.js`)

- **Bộ môn**: Coding — Web Developer Advanced (`JSA` • Buổi 2)
- **Độ tuổi**: 13 – 17 tuổi
- **Công cụ**: Visual Studio Code & Trình duyệt Web (Tab Console — `F12`)

## 1. Yêu cầu Đề bài 1
1. Khai báo biến `city` bằng từ khóa `var` với giá trị `"Hà Nội"`, biến `age` bằng `let` với giá trị `25`, và hằng số `PI` bằng `const` với giá trị `3.14`.
2. Khai báo đầy đủ các biến đại diện cho các kiểu dữ liệu cơ bản:
   - `temperature = 30.5` (số thực `number`)
   - `greeting = "Hello JSA Students!"` (chuỗi `string`)
   - `isJavaScriptFun = true` (logic `boolean`)
   - `nothing = null` (`null`)
   - `notDefined` (khai báo bằng `let` nhưng chưa gán giá trị để nhận `undefined`)
3. Sử dụng phương thức `.toUpperCase()` để tạo chuỗi in hoa `greetingUppercase` và `.replace("Hello", "Good afternoon")` để tạo chuỗi thay thế `greetingReplaced`, sau đó in toàn bộ kết quả kiểm tra ra màn hình bằng `console.log(...)`.

## 2. Mã nguồn hướng dẫn (`bai1.js`)

Tạo tệp `bai1.js` và hoàn thiện đoạn mã như mẫu dưới đây:

```js
// ĐỀ BÀI 1: Khai báo biến & các kiểu dữ liệu cơ bản
var city = "Hà Nội";
let age = 25;
const PI = 3.14;

let temperature = 30.5;
let greeting = "Hello JSA Students!";
let isJavaScriptFun = true;
let nothing = null;
let notDefined;

// Xử lý chuỗi với method .toUpperCase() và .replace()
let greetingUppercase = greeting.toUpperCase();
let greetingReplaced = greeting.replace("Hello", "Good afternoon");

console.log("Thành phố:", city, "| Tuổi:", age, "| Hằng số PI:", PI);
console.log("Kiểu của isJavaScriptFun:", typeof isJavaScriptFun);
console.log("Giá trị notDefined:", notDefined);
console.log("Chuỗi in hoa:", greetingUppercase);
console.log("Chuỗi thay thế:", greetingReplaced);
```

---

# BÀI THỰC HÀNH ĐỀ BÀI 2: TƯƠNG TÁC CHUỖI & NỐI CHUỖI (`bai2.js`)

## 1. Yêu cầu Đề bài 2
1. Khởi tạo một chuỗi mẫu (ví dụ `"Lập trình Web Developer"`), thực hiện cắt chuỗi bằng `.substring(0, 9)` và in độ dài chuỗi bằng thuộc tính `.length`.
2. Sử dụng hàm `prompt("Nhập vào một chuỗi:")` để cho phép người dùng nhập một chuỗi bất kỳ từ bàn phím, sau đó chuyển chuỗi vừa nhập sang chữ **IN HOA** bằng `.toUpperCase()` và in ra Console.
3. Khai báo biến tên `userName` (kiểu `String`) và biến tuổi `userAge` (kiểu `Number`), sau đó thực hiện nối chuỗi để in ra câu thông báo chuẩn: **`"Tên bạn là X và bạn Y tuổi."`** (có thể dùng toán tử `+` hoặc Template String `` `Tên bạn là ${userName} và bạn ${userAge} tuổi.` ``).
4. Sử dụng hàm `prompt("Nhập vào một câu:")` để người dùng nhập một câu bất kỳ, in câu đó ra màn hình kèm tổng số ký tự trong câu (`.length`).

## 2. Mã nguồn hướng dẫn (`bai2.js`)

Tạo tệp `bai2.js` và viết chương trình xử lý tương tác chuỗi như sau:

```js
// ĐỀ BÀI 2: Thao tác chuỗi & nhập dữ liệu người dùng
let sampleStr = "Lập trình Web Developer";
console.log("Cắt chuỗi substring(0, 9):", sampleStr.substring(0, 9));
console.log("Độ dài của sampleStr:", sampleStr.length);

// 1. Nhập chuỗi từ người dùng và in ra chữ IN HOA
let userStr = prompt("Nhập vào một chuỗi:") || "";
console.log("Chuỗi sau khi in hoa:", userStr.toUpperCase());

// 2. Khai báo tên (String) và tuổi (Number), sau đó nối chuỗi
let userName = "Minh";
let userAge = 15;
console.log("Tên bạn là " + userName + " và bạn " + userAge + " tuổi.");
console.log(`Tên bạn là ${userName} và bạn ${userAge} tuổi.`);

// 3. Nhập một câu và đếm tổng số ký tự
let sentence = prompt("Nhập vào một câu:") || "";
console.log("Câu của bạn:", sentence);
console.log("Tổng số ký tự trong câu:", sentence.length);
```

---

### Hướng dẫn Chạy thử & Nộp bài Thực hành Buổi 2 (Dành cho Học sinh)
1. **Cách chạy kiểm tra nhanh trên Trình duyệt:** Tạo một tệp `index.html` đơn giản nhúng `<script src="bai1.js"></script>` (hoặc `<script src="bai2.js"></script>`), mở bằng Chrome/Edge rồi nhấn **`F12` → Tab `Console`** để kiểm tra kết quả in ra màn hình và hộp thoại `prompt()`.
2. **Cách nộp bài tại mục `3. Nộp bài thực hành` bên dưới:**
   - **Cách 1 — Tải tệp (`<= 2MB`):** Nén thư mục chứa cả **`bai1.js`**, **`bai2.js`** (và `index.html` nếu có) thành 1 tệp **`.zip`** (hoặc nộp trực tiếp tệp `.js`) rồi tải lên hệ thống.
   - **Cách 2 — Nộp đường link:** Dán liên kết kho mã GitHub, CodePen hoặc thư mục Google Drive bài làm của em để giáo viên chấm duyệt.$JSA_B2_PRACTICE$,
    status = 'draft',
    has_quiz = true,
    has_practice = true,
    practice_mode = 'file_allowed',
    updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555702';

-- 4. Nạp trọn bộ 20 câu hỏi Trắc nghiệm Buổi 2 khóa JSA (10 câu gốc + 10 câu Thực hành Đề 1 & 2)
DELETE FROM public.quiz_questions
WHERE lesson_id = '55555555-5555-4555-8555-555555555702';

INSERT INTO public.quiz_questions (id, lesson_id, prompt, options, correct_option_index, explanation, order_index)
VALUES
  (
    '66666666-6666-4666-8666-666666666801',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P1$Cách khai báo biến hoặc hằng số nào sau đây là đúng cú pháp trong JavaScript?$JSA_P1$,
    jsonb_build_array(
      'var myVariable;',
      'let myVariable;',
      'const myVariable = 10;',
      'Tất cả các câu trên'
    ),
    3,
    $JSA_E1$Trong JavaScript, cả 3 câu lệnh trên đều hợp lệ: `var` và `let` cho phép khai báo biến chưa gán giá trị ban đầu, còn hằng số `const` bắt buộc gán ngay giá trị khởi tạo lúc khai báo (`const myVariable = 10;`). Do đó đáp án đúng là "Tất cả các câu trên".$JSA_E1$,
    0
  ),
  (
    '66666666-6666-4666-8666-666666666802',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P2$Kết quả đầu ra của đoạn mã dưới đây là gì?

```js
console.log(typeof NaN);
```$JSA_P2$,
    jsonb_build_array(
      'NaN',
      'number',
      'null',
      'undefined'
    ),
    1,
    $JSA_E2$Dù NaN (Not-a-Number) không đại diện cho một giá trị số hợp lệ, nhưng trong đặc tả của JavaScript, NaN là một giá trị đặc biệt vẫn thuộc kiểu dữ liệu "number".$JSA_E2$,
    1
  ),
  (
    '66666666-6666-4666-8666-666666666803',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P3$Đâu là một kiểu dữ liệu nguyên thuỷ (Primitive Types) của Javascript?$JSA_P3$,
    jsonb_build_array(
      $JSA_O3_1$'Object'$JSA_O3_1$,
      $JSA_O3_2$'Array'$JSA_O3_2$,
      $JSA_O3_3$'Function'$JSA_O3_3$,
      $JSA_O3_4$'Number'$JSA_O3_4$
    ),
    3,
    $JSA_E3$Trong JavaScript, các kiểu dữ liệu nguyên thủy (Primitive Types) bao gồm: Number, String, Boolean, Undefined, Null, Symbol, và BigInt. Còn Object, Array, và Function thuộc kiểu dữ liệu tham chiếu (Reference / Non-primitive Types).$JSA_E3$,
    2
  ),
  (
    '66666666-6666-4666-8666-666666666804',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P4$Kết quả của đoạn code sau?

```js
console.log(('b' + 'a' + + 'a' + 'a').toLowerCase());
```$JSA_P4$,
    jsonb_build_array(
      'bananaa',
      'baaa',
      'banana',
      'ananas'
    ),
    2,
    $JSA_E4$Cụm `+ 'a'` ở giữa sử dụng toán tử cộng một ngôi (unary plus) để ép chuỗi `'a'` thành số, nhưng `'a'` không phải là số nên kết quả trả về `NaN`. Khi nối chuỗi: `'b' + 'a' + NaN + 'a'` ta được `'baNaNa'`. Sau đó phương thức `.toLowerCase()` chuyển toàn bộ thành chữ thường là `'banana'`.$JSA_E4$,
    3
  ),
  (
    '66666666-6666-4666-8666-666666666805',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P5$Tên biến nào sau đây KHÔNG hợp lệ trong Javascript?$JSA_P5$,
    jsonb_build_array(
      '_myVariable',
      '$myVariable',
      '2myVariable',
      'myVariable2'
    ),
    2,
    $JSA_E5$Theo quy tắc đặt tên biến trong JavaScript, tên biến có thể bắt đầu bằng chữ cái, dấu gạch dưới (_) hoặc ký hiệu đô la ($), nhưng KHÔNG ĐƯỢC bắt đầu bằng chữ số. Do đó `2myVariable` là không hợp lệ.$JSA_E5$,
    4
  ),
  (
    '66666666-6666-4666-8666-666666666806',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P6$Mục đích của từ khóa ‘let’ trong JavaScript là gì?$JSA_P6$,
    jsonb_build_array(
      'Để khai tử một biến số không sử dụng trong chương trình',
      'Để khai báo biến số',
      'Để khai báo hằng số',
      'Không có đáp án đúng'
    ),
    1,
    $JSA_E6$Từ khóa `let` (được giới thiệu từ ES6) dùng để khai báo biến số có phạm vi khối (block scope) và giá trị của biến có thể thay đổi được. Còn khai báo hằng số thì dùng `const`.$JSA_E6$,
    5
  ),
  (
    '66666666-6666-4666-8666-666666666807',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P7$Đoạn code dưới đây có kết quả là gì?

```js
console.log(typeof typeof 1);
```$JSA_P7$,
    jsonb_build_array(
      'string',
      'number',
      '1',
      'true'
    ),
    0,
    $JSA_E7$Biểu thức được tính từ phải sang trái: `1` là một số, nên `typeof 1` sẽ trả về chuỗi `"number"`. Tiếp theo, `typeof "number"` kiểm tra kiểu của một chuỗi (string) nên kết quả cuối cùng luôn trả về `"string"`.$JSA_E7$,
    6
  ),
  (
    '66666666-6666-4666-8666-666666666808',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P8$Đâu KHÔNG phải một cách khai báo hợp lệ trong Javascript?$JSA_P8$,
    jsonb_build_array(
      'let length = 16;',
      'let color = "red";',
      'let lastName;',
      'let 10cars = "Mercedes";'
    ),
    3,
    $JSA_E8$`let 10cars = "Mercedes";` bị lỗi cú pháp (SyntaxError) vì tên biến `10cars` bắt đầu bằng con số `10`.$JSA_E8$,
    7
  ),
  (
    '66666666-6666-4666-8666-666666666809',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P9$Đoạn code sau có lỗi gì, cách để sửa?

```js
let greeting = 'Hello;
console.log(greeting);
```$JSA_P9$,
    jsonb_build_array(
      $JSA_O9_1$Thiếu dấu nháy đóng; sửa: let greeting = 'Hello';$JSA_O9_1$,
      $JSA_O9_2$Câu lệnh console không đúng; sửa: console.log('greeting');$JSA_O9_2$,
      $JSA_O9_3$Khai báo biến không đúng; sửa: const greeting = 'Hello';$JSA_O9_3$,
      'Không có lỗi'
    ),
    0,
    $JSA_E9$Chuỗi `'Hello` mở đầu bằng dấu nháy đơn `'` nhưng chưa có dấu nháy đơn đóng lại trước dấu chấm phẩy `;`, gây ra lỗi `Uncaught SyntaxError: Invalid or unexpected token`. Cần sửa thành `let greeting = 'Hello';`.$JSA_E9$,
    8
  ),
  (
    '66666666-6666-4666-8666-666666666810',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P10$Tìm nguyên nhân lỗi và cách sửa đúng đoạn code sau (biết `number` cần được giữ nguyên là hằng số `const`):

```js
const number;
number = 5;
console.log(number);
```$JSA_P10$,
    jsonb_build_array(
      $JSA_O10_1$Hằng số const không lưu được kiểu số, phải đổi thành chuỗi '5'$JSA_O10_1$,
      $JSA_O10_2$Câu lệnh in sai cú pháp, cần sửa thành console.log('number');$JSA_O10_2$,
      $JSA_O10_3$Hằng số const phải khởi tạo ngay khi khai báo và không gán lại; gộp 2 dòng đầu thành: const number = 5;$JSA_O10_3$,
      $JSA_O10_4$Đoạn code trên hợp lệ, không có lỗi cú pháp$JSA_O10_4$
    ),
    2,
    $JSA_E10$Khi sử dụng từ khóa `const` để khai báo hằng số, JavaScript bắt buộc gán giá trị khởi tạo ngay trên dòng khai báo và không cho phép gán lại giá trị ở dòng sau (`number = 5;`). Do đó cần gộp 2 dòng đầu thành câu lệnh duy nhất `const number = 5;`.$JSA_E10$,
    9
  ),
  (
    '66666666-6666-4666-8666-666666666811',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P11$Trong Đề bài 1, để khai báo hằng số PI với giá trị là số 3.14 không thể bị thay đổi trong suốt chương trình, câu lệnh nào sau đây là đúng?$JSA_P11$,
    jsonb_build_array(
      'var PI = 3.14;',
      'let PI = 3.14;',
      'const PI = 3.14;',
      'const PI; PI = 3.14;'
    ),
    2,
    $JSA_E11$Theo hướng dẫn Đề bài 1, PI là hằng số toán học cố định (3.14) nên cần được khai báo bằng từ khóa `const` và gán giá trị ngay lúc khai báo: `const PI = 3.14;`.$JSA_E11$,
    10
  ),
  (
    '66666666-6666-4666-8666-666666666812',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P12$Trong Đề bài 1, khi khai báo biến `notDefined` nhưng chưa gán giá trị như đoạn code dưới đây, kết quả in ra màn hình console là gì?

```js
let notDefined;
console.log(notDefined);
```$JSA_P12$,
    jsonb_build_array(
      'null',
      'undefined',
      'NaN',
      '"notDefined"'
    ),
    1,
    $JSA_E12$Một biến được khai báo bằng `var` hoặc `let` nhưng chưa được gán giá trị sẽ mang giá trị mặc định là `undefined` (kiểu dữ liệu cũng là `undefined`).$JSA_E12$,
    11
  ),
  (
    '66666666-6666-4666-8666-666666666813',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P13$Trong Đề bài 1, khi ta khai báo biến `isJavaScriptFun` như đoạn code dưới đây thì kiểu dữ liệu của biến này là gì?

```js
let isJavaScriptFun = true;
console.log(typeof isJavaScriptFun);
```$JSA_P13$,
    jsonb_build_array(
      'string',
      'boolean',
      'number',
      'object'
    ),
    1,
    $JSA_E13$Hai giá trị logic `true` (đúng) và `false` (sai) thuộc kiểu dữ liệu nguyên thủy `boolean` trong JavaScript.$JSA_E13$,
    12
  ),
  (
    '66666666-6666-4666-8666-666666666814',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P14$Để chuyển toàn bộ chuỗi `greeting` thành chữ IN HOA như yêu cầu trong Đề bài 1 & 2, đoạn mã dưới đây sẽ in ra kết quả gì?

```js
let greeting = "Hello World";
let greetingUppercase = greeting.toUpperCase();
console.log(greetingUppercase);
```$JSA_P14$,
    jsonb_build_array(
      'hello world',
      'Hello World',
      'HELLO WORLD',
      'Hello WORLD'
    ),
    2,
    $JSA_E14$Phương thức `.toUpperCase()` trả về một chuỗi mới với toàn bộ các ký tự chữ cái đã được chuyển sang chữ IN HOA: `"HELLO WORLD"`.$JSA_E14$,
    13
  ),
  (
    '66666666-6666-4666-8666-666666666815',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P15$Trong Đề bài 1, muốn thay thế từ "Hello" bằng "Good afternoon" trong biến `greeting`, kết quả của đoạn code sau là gì?

```js
let greeting = "Hello MindX";
let greetingReplaced = greeting.replace("Hello", "Good afternoon");
console.log(greetingReplaced);
```$JSA_P15$,
    jsonb_build_array(
      'Hello MindX',
      'Good afternoon',
      'Good afternoon MindX',
      'Hello Good afternoon'
    ),
    2,
    $JSA_E15$Phương thức `greeting.replace("Hello", "Good afternoon")` tìm chuỗi `"Hello"` và thay bằng `"Good afternoon"`, trả về chuỗi mới là `"Good afternoon MindX"`.$JSA_E15$,
    14
  ),
  (
    '66666666-6666-4666-8666-666666666816',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P16$Theo Đề bài 1 & 2, kết quả in ra của thuộc tính `.length` dùng để đếm số ký tự trong chuỗi dưới đây là bao nhiêu?

```js
var city = "Hà Nội";
console.log(city.length);
```$JSA_P16$,
    jsonb_build_array(
      '5',
      '6',
      '7',
      'undefined'
    ),
    1,
    $JSA_E16$Thuộc tính `.length` đếm tổng số ký tự trong chuỗi, tính cả dấu cách (khoảng trắng) ở giữa. Chuỗi `"Hà Nội"` gồm 2 chữ cái `'H'`, `'à'` + 1 khoảng trắng + 3 chữ cái `'N'`, `'ộ'`, `'i'` = tổng cộng `6` ký tự.$JSA_E16$,
    15
  ),
  (
    '66666666-6666-4666-8666-666666666817',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P17$Trong Đề bài 2, phương thức cắt chuỗi `.substring(0, 10)` dưới đây sẽ trả về kết quả nào?

```js
let course = "JavaScript Advanced";
console.log(course.substring(0, 10));
```$JSA_P17$,
    jsonb_build_array(
      '"JavaScript"',
      '"Advanced"',
      '"Java"',
      '"Script"'
    ),
    0,
    $JSA_E17$Phương thức `.substring(0, 10)` lấy các ký tự từ chỉ số `0` đến sát chỉ số `10` (10 ký tự đầu tiên), kết quả trả về chính xác là chuỗi `"JavaScript"`.$JSA_E17$,
    16
  ),
  (
    '66666666-6666-4666-8666-666666666818',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P18$Trong Đề bài 2, với biến `name = "An"` và `age = 15`, câu lệnh nào in ra đúng thông báo: "Tên bạn là An và bạn 15 tuổi."?

```js
let name = "An";
let age = 15;
```$JSA_P18$,
    jsonb_build_array(
      $JSA_O18_1$console.log("Tên bạn là " + name + " và bạn " + age + " tuổi.");$JSA_O18_1$,
      $JSA_O18_2$console.log(`Tên bạn là ${name} và bạn ${age} tuổi.`);$JSA_O18_2$,
      'Cả A và B đều cho kết quả đúng',
      $JSA_O18_4$console.log("Tên bạn là name và bạn age tuổi.");$JSA_O18_4$
    ),
    2,
    $JSA_E18$Bạn có thể nối chuỗi bằng toán tử cộng `+` (cách A) hoặc sử dụng Template String với dấu huyền `` `...${biến}...` `` (cách B). Cả hai cách đều in ra `"Tên bạn là An và bạn 15 tuổi."`.$JSA_E18$,
    17
  ),
  (
    '66666666-6666-4666-8666-666666666819',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P19$Theo hướng dẫn của Đề bài 2, hàm nào dưới đây dùng để hiển thị hộp thoại cho phép người dùng nhập một câu từ bàn phím?$JSA_P19$,
    jsonb_build_array(
      'alert("Nhập một câu bất kỳ:");',
      'console.log("Nhập một câu bất kỳ:");',
      'prompt("Nhập một câu bất kỳ:");',
      'confirm("Nhập một câu bất kỳ:");'
    ),
    2,
    $JSA_E19$Hàm `prompt("...")` được trình duyệt cung cấp để hiển thị hộp thoại có ô nhập văn bản, cho phép người dùng gõ dữ liệu từ bàn phím.$JSA_E19$,
    18
  ),
  (
    '66666666-6666-4666-8666-666666666820',
    '55555555-5555-4555-8555-555555555702',
    $JSA_P20$Giả sử người dùng gõ số `15` vào hộp thoại `prompt()` và nhấn OK. Kết quả của `typeof age` trong đoạn code sau là gì?

```js
let age = prompt("Nhập tuổi:"); // Người dùng nhập 15
console.log(typeof age);
```$JSA_P20$,
    jsonb_build_array(
      'number',
      'string',
      'boolean',
      'undefined'
    ),
    1,
    $JSA_E20$Mọi dữ liệu người dùng nhập vào qua hộp thoại `prompt()` khi nhấn OK đều được trả về dưới dạng chuỗi (`"string"`), ví dụ `"15"`. Nếu muốn tính toán như con số, ta cần chuyển đổi bằng `Number(age)`.$JSA_E20$,
    19
  );

-- 5. Kiểm tra tính toàn vẹn của khóa JSA, Buổi 2 (Bản nháp) và bộ 20 câu Trắc nghiệm
DO $$
DECLARE
  v_course_ok BOOLEAN;
  v_lesson_count INT;
  v_b2_ok BOOLEAN;
  v_q_count INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = '44444444-4444-4444-8444-444444444412'
      AND total_sessions = 14
      AND is_fixture = false
  ) INTO v_course_ok;

  IF NOT v_course_ok THEN
    RAISE EXCEPTION 'JSA_COURSE_INVALID: Không tìm thấy khóa học JSA (44444444-4444-4444-8444-444444444412) hợp lệ.';
  END IF;

  SELECT count(*)::INT INTO v_lesson_count
  FROM public.lessons
  WHERE course_id = '44444444-4444-4444-8444-444444444412';

  IF v_lesson_count <> 14 THEN
    RAISE EXCEPTION 'JSA_LESSON_COUNT_MISMATCH: Khóa JSA phải có đúng 14 buổi học (hiện có: %).', v_lesson_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lessons
    WHERE id = '55555555-5555-4555-8555-555555555702'
      AND course_id = '44444444-4444-4444-8444-444444444412'
      AND session_number = 2
      AND status = 'draft'
      AND has_quiz = true
      AND has_practice = true
      AND practice_mode = 'file_allowed'
      AND materials LIKE '%BÀI THỰC HÀNH ĐỀ BÀI 1%'
      AND materials LIKE '%BÀI THỰC HÀNH ĐỀ BÀI 2%'
  ) INTO v_b2_ok;

  IF NOT v_b2_ok THEN
    RAISE EXCEPTION 'JSA_SESSION_2_INVALID: Buổi 2 JSA phải ở trạng thái draft và có đủ Thực hành Đề bài 1 & 2.';
  END IF;

  SELECT count(*)::INT INTO v_q_count
  FROM public.quiz_questions
  WHERE lesson_id = '55555555-5555-4555-8555-555555555702'
    AND jsonb_array_length(options) = 4
    AND correct_option_index BETWEEN 0 AND 3
    AND pg_catalog.btrim(explanation) <> '';

  IF v_q_count <> 20 THEN
    RAISE EXCEPTION 'JSA_SESSION_2_QUIZ_COUNT_MISMATCH: Buổi 2 JSA phải có đủ 20 câu trắc nghiệm hợp lệ kèm giải thích (hiện có: %).', v_q_count;
  END IF;
END $$;

-- 6. Ghi nhận migration vào lịch sử Supabase
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261114160000', 'm6_jsa_course_session2_quiz_practice')
ON CONFLICT (version) DO NOTHING;

COMMIT;
