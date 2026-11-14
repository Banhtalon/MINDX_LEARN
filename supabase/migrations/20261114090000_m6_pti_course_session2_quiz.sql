-- ============================================================================
-- MINDX LEARN — Khóa học PTI (Python Intensive) & Bộ 20 Câu Trắc nghiệm Buổi 2
-- Chủ đề Buổi 2: Ôn Tập Buổi 2: Python OOP & PyQt6 (Bản nháp)
-- Lộ trình chuẩn MindX: Basic (C4K-PTB) -> Advanced (C4K-PTA) -> Intensive (C4K-PTI)
-- Bổ sung cột quiz_questions.explanation và cập nhật m3_update_lesson giữ nguyên khóa R18-02
-- ============================================================================

BEGIN;

-- 1. Thêm cột explanation vào public.quiz_questions (hiển thị sau khi nộp bài)
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';

-- 2. Cập nhật m3_update_lesson để lưu được trường explanation (giữ nguyên toàn bộ khóa tuần tự R18-02)
CREATE OR REPLACE FUNCTION public.m3_update_lesson(
    p_admin_profile_id UUID,
    p_lesson_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_materials TEXT,
    p_video_url TEXT,
    p_status TEXT,
    p_has_quiz BOOLEAN,
    p_has_practice BOOLEAN,
    p_practice_mode TEXT,
    p_questions JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
    v_clean_title TEXT;
    v_clean_status TEXT;
    v_clean_mode TEXT;
    v_q JSONB;
    v_idx INT := 0;
    v_valid_q_count INT := 0;
    v_prompt TEXT;
    v_options JSONB;
    v_correct INT;
    v_explanation TEXT;
    v_course_id UUID;
    v_cls_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = p_admin_profile_id AND role = 'admin' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Chỉ có Quản trị viên mới được chỉnh sửa bài học.';
    END IF;

    -- R18-02: Khóa tuần tự toàn cục trước, sau đó khóa từng lớp liên quan theo UUID tăng dần
    PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'));

    SELECT l.course_id INTO v_course_id
    FROM public.lessons l
    WHERE l.id = p_lesson_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài học.';
    END IF;

    FOR v_cls_id IN (
        SELECT x.class_id FROM (
            SELECT c.id AS class_id FROM public.classes c WHERE c.course_id = v_course_id
            UNION
            SELECT o.class_id FROM public.m5_course_close_operations o WHERE o.course_id = v_course_id
        ) x
        ORDER BY x.class_id ASC
    ) LOOP
        PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text));
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM public.m5_course_close_operations op
        WHERE op.course_id = v_course_id
          AND op.status IN ('deleting_storage', 'deleting_db', 'incomplete')
    ) THEN
        RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Khóa học này đang có lớp trong quá trình đóng khóa dở dang. Không thể chỉnh sửa bài học lúc này.' USING ERRCODE = 'P0001';
    END IF;

    v_clean_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF v_clean_title = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Tiêu đề bài học không được để trống.';
    END IF;

    v_clean_status := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_status, 'draft')));
    IF v_clean_status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Trạng thái bài học chỉ có thể là draft hoặc published.';
    END IF;

    v_clean_mode := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_practice_mode, 'link_only')));
    IF v_clean_mode NOT IN ('link_only', 'file_allowed') THEN
        v_clean_mode := 'link_only';
    END IF;

    -- Publish rule check: cannot publish lesson without quiz or practice
    IF v_clean_status = 'published' AND NOT p_has_quiz AND NOT p_has_practice THEN
        RAISE EXCEPTION 'CANNOT_PUBLISH_THEORY_ONLY: Chặn xuất bản: Buổi học phải có Quiz, Thực hành hoặc cả hai; không được xuất bản bài chỉ có lý thuyết.';
    END IF;

    UPDATE public.lessons
    SET title = v_clean_title,
        description = COALESCE(p_description, ''),
        materials = COALESCE(p_materials, ''),
        video_url = COALESCE(p_video_url, ''),
        status = v_clean_status,
        has_quiz = p_has_quiz,
        has_practice = p_has_practice,
        practice_mode = v_clean_mode,
        updated_at = now()
    WHERE lessons.id = p_lesson_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy bài học.';
    END IF;

    -- Update questions if provided (replaces question definitions for future attempts without wiping student quiz_results)
    IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) = 'array' THEN
        DELETE FROM public.quiz_questions WHERE lesson_id = p_lesson_id;

        FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
            v_prompt := pg_catalog.btrim(COALESCE(v_q->>'prompt', ''));
            v_options := v_q->'options';
            v_correct := COALESCE((v_q->>'correctOptionIndex')::INT, -1);
            v_explanation := pg_catalog.btrim(COALESCE(v_q->>'explanation', ''));

            -- Validate: prompt non-empty, options array length >= 2, and correct option index strictly within options array bounds
            IF v_prompt <> '' AND jsonb_typeof(v_options) = 'array' AND jsonb_array_length(v_options) >= 2 AND v_correct >= 0 AND v_correct < jsonb_array_length(v_options) THEN
                INSERT INTO public.quiz_questions (
                    lesson_id, prompt, options, correct_option_index, explanation, order_index
                )
                VALUES (
                    p_lesson_id, v_prompt, v_options, v_correct, v_explanation, v_idx
                );
                v_idx := v_idx + 1;
                v_valid_q_count := v_valid_q_count + 1;
            END IF;
        END LOOP;
    ELSE
        SELECT count(*)::INT INTO v_valid_q_count
        FROM public.quiz_questions
        WHERE lesson_id = p_lesson_id;
    END IF;

    -- Publish rule check: cannot publish quiz with 0 valid questions
    IF v_clean_status = 'published' AND p_has_quiz AND v_valid_q_count = 0 THEN
        RAISE EXCEPTION 'CANNOT_PUBLISH_EMPTY_QUIZ: Chặn xuất bản: Buổi học bật trắc nghiệm nhưng không có câu hỏi hợp lệ nào (mỗi câu cần ít nhất 2 đáp án và chỉ số đáp án đúng nằm trong danh sách đáp án).';
    END IF;

    RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) TO service_role;

-- 3. Tạo khóa học chính thức PTI (14 buổi cố định, is_fixture = false)
INSERT INTO public.courses (id, title, description, total_sessions, is_fixture)
VALUES (
  '44444444-4444-4444-8444-444444444423',
  'PTI — Lập trình Ứng dụng Python Chuyên sâu (Python OOP & PyQt6)',
  'Khóa học chuyên sâu (Cấp độ 3: Intensive) trong lộ trình Python / App Producer tại MindX (PTB → PTA → PTI). Học sinh làm chủ Lập trình hướng đối tượng (Python OOP), thiết kế giao diện ứng dụng Desktop hiện đại với thư viện PyQt6 và hoàn thiện sản phẩm cuối khóa qua 14 buổi học.',
  14,
  false
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    total_sessions = 14,
    is_fixture = false,
    updated_at = now();

-- 4. Tạo đủ 14 buổi học cho khóa PTI (tất cả ở trạng thái Bản nháp 'draft')
DO $$
DECLARE
  v_s INT;
  v_titles TEXT[] := ARRAY[
    'Buổi 1: Ôn tập Python nâng cao & Nhập môn Lập trình Hướng đối tượng (OOP)',
    'Buổi 2: Python OOP & PyQt6',
    'Buổi 3: Kế thừa (Inheritance) & Đa hình (Polymorphism) trong Python OOP',
    'Buổi 4: Thiết kế giao diện PyQt6 với Qt Designer & Hệ thống bố cục (Layouts)',
    'Buổi 5: Tín hiệu & Khe cắm (Signals & Slots) — Xử lý tương tác người dùng',
    'Buổi 6: Các thành phần nhập liệu & Hộp thoại (QLineEdit, QComboBox, QMessageBox)',
    'Buổi 7: Thực hành Dự án Giữa khóa — Ứng dụng Tiện ích Desktop với PyQt6',
    'Buổi 8: Làm việc với Danh sách, Bảng dữ liệu (QListWidget, QTableWidget) & Đa cửa sổ',
    'Buổi 9: Lưu trữ dữ liệu ứng dụng với tệp JSON & CSV trong Python',
    'Buổi 10: Kết nối Cơ sở dữ liệu SQLite cho ứng dụng PyQt6',
    'Buổi 11: Trang trí giao diện hiện đại với QSS (Qt Style Sheets) & Biểu tượng',
    'Buổi 12: Xử lý ngoại lệ (Exception Handling) & Tối ưu hóa ứng dụng',
    'Buổi 13: Hoàn thiện Dự án Cuối khóa PTI — Ứng dụng App Producer hoàn chỉnh',
    'Buổi 14: Thuyết trình sản phẩm Cuối khóa (Demo Day) & Tổng kết lộ trình PTI'
  ];
BEGIN
  FOR v_s IN 1..14 LOOP
    INSERT INTO public.lessons (
      id, course_id, session_number, title, description, materials, video_url,
      status, has_quiz, has_practice, practice_mode
    )
    VALUES (
      ('55555555-5555-4555-8555-5555555556' || lpad(v_s::text, 2, '0'))::uuid,
      '44444444-4444-4444-8444-444444444423',
      v_s,
      v_titles[v_s],
      'Nội dung chuẩn bị cho ' || v_titles[v_s] || ' thuộc chương trình PTI 14 buổi.',
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

-- 5. Cập nhật nội dung tóm tắt Buổi 2 khóa PTI (giữ nguyên trạng thái Bản nháp 'draft')
UPDATE public.lessons
SET title = 'Buổi 2: Python OOP & PyQt6',
    description = 'Ôn tập và củng cố kiến thức Buổi 2 về Lập trình hướng đối tượng (Class, Object, __init__, self) và xây dựng giao diện ứng dụng Desktop với thư viện PyQt6 thông qua bộ 20 câu hỏi trắc nghiệm.',
    materials = $PTI_B2$## Mục tiêu bài học (Buổi 2 / 14)
1. **Nắm vững Lập trình hướng đối tượng (Python OOP):** Phân biệt Lớp (`class`) và Đối tượng (`object`), cách dùng hàm khởi tạo `__init__` (có và không có giá trị mặc định) cùng tham số `self`.
2. **Làm chủ các thành phần cốt lõi trong PyQt6:** Tạo ứng dụng với `QApplication`, cửa sổ chính `QMainWindow` (`setWindowTitle`, `show`), nút nhấn `QPushButton` (`setText`, `text`, sự kiện `clicked.connect`), ô nhập liệu `QLineEdit` và bố cục lưới `QGridLayout`.
3. **Hoàn thành bài kiểm tra 20 câu trắc nghiệm:** Chọn đủ 20 câu và đạt từ **70%** (tối thiểu 14/20 câu đúng).

---

## Phần 1. Tóm tắt Python OOP (`class`, `__init__`, `self`)
- **Lớp (`class`)** là bản thiết kế chung; **Đối tượng (`object`)** là thực thể cụ thể tạo từ lớp đó có thuộc tính và hành vi riêng.
- **`__init__(self, ...)`** là phương thức khởi tạo tự động chạy khi tạo đối tượng mới. Nếu tham số có giá trị mặc định (ví dụ `name="An"`), khi không truyền đối số thì Python sẽ tự lấy giá trị mặc định.
- **`self`** đại diện cho chính đối tượng (instance) đang gọi phương thức; muốn thay đổi thuộc tính của đối tượng bên trong hàm phải gán qua `self.<ten_thuoc_tinh>`.

---

## Phần 2. Tóm tắt Giao diện PyQt6 (`PyQt6.QtWidgets`)
- Các widget giao diện quen thuộc (`QMainWindow`, `QWidget`, `QPushButton`, `QLineEdit`, `QGridLayout`) đều được nhập từ `PyQt6.QtWidgets`.
- Mọi ứng dụng PyQt6 đều cần `QApplication` quản lý vòng lặp sự kiện và kết thúc sạch sẽ bằng `sys.exit(app.exec())`.

```python
import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QPushButton

app = QApplication(sys.argv)

window = QMainWindow()
window.setWindowTitle("Ứng dụng PyQt6 đầu tiên")

btn = QPushButton("Nhấn vào đây", window)
btn.setText("Click me")
btn.clicked.connect(lambda: print("Đã nhấn nút:", btn.text()))

window.show()
sys.exit(app.exec())
```

> 💡 **Lưu ý khi làm Trắc nghiệm Buổi 2:** Bộ đề gồm **20 câu hỏi** (A, B, C, D). Cần chọn đủ cả 20 câu trước khi bấm **Nộp bài chấm điểm**; sau khi nộp xong hệ thống sẽ hiển thị đáp án đúng và lời giải thích chi tiết để em ôn tập lại.$PTI_B2$,
    status = 'draft',
    has_quiz = true,
    has_practice = true,
    practice_mode = 'file_allowed',
    updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555602';

-- 6. Nạp trọn bộ 20 câu hỏi Trắc nghiệm "Ôn Tập Buổi 2: Python OOP & PyQt6"
DELETE FROM public.quiz_questions
WHERE lesson_id = '55555555-5555-4555-8555-555555555602';

INSERT INTO public.quiz_questions (id, lesson_id, prompt, options, correct_option_index, explanation, order_index)
VALUES
  (
    '66666666-6666-4666-8666-666666666701',
    '55555555-5555-4555-8555-555555555602',
    $P1$_____ là đại diện cho thực thể trong thế giới thực có thuộc tính và hành vi.$P1$,
    jsonb_build_array('Lớp', 'Đối tượng', 'Phương thức', 'Toán tử'),
    1,
    $E1$Đối tượng (Object) là thực thể cụ thể được tạo ra từ Lớp (Class), mang các thuộc tính và hành vi.$E1$,
    0
  ),
  (
    '66666666-6666-4666-8666-666666666702',
    '55555555-5555-4555-8555-555555555602',
    $P2$Đâu là kết quả in ra màn hình của đoạn code Python sau:

```python
class Test:
    def __init__(self, a="Hello World"):
        self.a = a
    def display(self):
        print(self.a)

obj = Test()
obj.display()
```$P2$,
    jsonb_build_array(
      'Chương trình bị lỗi vì hàm __init__ không được có giá trị mặc định',
      'Không có gì hiển thị trên màn hình.',
      '“Hello World” được hiện lên màn hình.',
      'Chương trình lỗi vì hàm display không có tham số truyền vào.'
    ),
    2,
    $E2$Tham số a có giá trị mặc định là "Hello World" nên khi gọi Test() không truyền đối số, self.a vẫn nhận giá trị "Hello World".$E2$,
    1
  ),
  (
    '66666666-6666-4666-8666-666666666703',
    '55555555-5555-4555-8555-555555555602',
    $P3$Đâu là kết quả in ra màn hình của đoạn code Python sau:

```python
class Test:
    def __init__(self, a):
        self.a = a
    def display(self):
        print(self.a)

obj = Test()
obj.display()
```$P3$,
    jsonb_build_array(
      'Chương trình chạy được, không có gì hiển thị lên màn hình',
      'Hiển thị 0, là giá trị mặc định.',
      'Lỗi do cần một đối số khi khởi tạo đối tượng.',
      'Lỗi do hàm display cần đối số bổ sung.'
    ),
    2,
    $E3$Hàm __init__ yêu cầu 1 tham số bắt buộc a (ngoài self), nhưng Test() không truyền đối số nào nên gây ra lỗi TypeError.$E3$,
    2
  ),
  (
    '66666666-6666-4666-8666-666666666704',
    '55555555-5555-4555-8555-555555555602',
    $P4$Đâu là kết quả in ra màn hình đoạn code Python sau:

```python
class test:
    def __init__(self):
        self.variable = 'Old'
        self.Change(self.variable)
    def Change(self, var):
        var = 'New'

obj = test()
print(obj.variable)
```$P4$,
    jsonb_build_array(
      'Lỗi vì không thể gọi hàm Change bên trong hàm __init__',
      '‘New’ được in ra màn hình.',
      '‘Old’ được in ra màn hình.',
      'Không có gì in ra màn hình.'
    ),
    2,
    $E4$Trong hàm Change, var = 'New' chỉ gán lại giá trị cho biến cục bộ var chứ không thay đổi thuộc tính self.variable.$E4$,
    3
  ),
  (
    '66666666-6666-4666-8666-666666666705',
    '55555555-5555-4555-8555-555555555602',
    $P5$Để kích hoạt (hiển thị) cửa sổ chính, ta sử dụng phương thức nào của class QMainWindow?$P5$,
    jsonb_build_array('activate()', 'show()', 'enable()', 'open()'),
    1,
    $E5$Phương thức show() dùng để hiển thị cửa sổ lên màn hình trong PyQt6.$E5$,
    4
  ),
  (
    '66666666-6666-4666-8666-666666666706',
    '55555555-5555-4555-8555-555555555602',
    $P6$Để tạo một nút nhấn trong PyQt6, ta sử dụng class nào?$P6$,
    jsonb_build_array('QPushButton', 'QButton', 'QClickButton', 'QWidget'),
    0,
    $E6$QPushButton là widget tạo nút bấm tiêu chuẩn trong PyQt6.$E6$,
    5
  ),
  (
    '66666666-6666-4666-8666-666666666707',
    '55555555-5555-4555-8555-555555555602',
    $P7$Để lấy hoặc làm việc với văn bản hiển thị trên một nút nhấn trong PyQt6, ta sử dụng phương thức/thuộc tính nào?$P7$,
    jsonb_build_array('text()', 'label()', 'name()', 'title()'),
    0,
    $E7$Phương thức text() trả về chuỗi văn bản hiện tại của nút nhấn.$E7$,
    6
  ),
  (
    '66666666-6666-4666-8666-666666666708',
    '55555555-5555-4555-8555-555555555602',
    $P8$Trong lập trình hướng đối tượng (OOP) với Python, từ khóa nào được dùng để định nghĩa một lớp (class)?$P8$,
    jsonb_build_array('def', 'object', 'class', 'struct'),
    2,
    $E8$Từ khóa class dùng để khai báo một lớp mới trong Python.$E8$,
    7
  ),
  (
    '66666666-6666-4666-8666-666666666709',
    '55555555-5555-4555-8555-555555555602',
    $P9$Phương thức đặc biệt nào trong Python được tự động gọi mỗi khi một đối tượng mới được khởi tạo từ lớp?$P9$,
    jsonb_build_array('__start__', '__main__', '__init__', '__create__'),
    2,
    $E9$__init__ là phương thức khởi tạo (constructor) tự động chạy khi tạo đối tượng.$E9$,
    8
  ),
  (
    '66666666-6666-4666-8666-666666666710',
    '55555555-5555-4555-8555-555555555602',
    $P10$Tham số đầu tiên bắt buộc phải có trong định nghĩa các phương thức của một class (thường được đặt tên là self) đại diện cho điều gì?$P10$,
    jsonb_build_array(
      'Bản thân lớp (class) đó',
      'Chính đối tượng (instance) đang gọi phương thức đó',
      'Một biến toàn cục trong chương trình',
      'Giá trị trả về của phương thức'
    ),
    1,
    $E10$self tham chiếu trực tiếp đến thể hiện (instance) của đối tượng đang gọi phương thức.$E10$,
    9
  ),
  (
    '66666666-6666-4666-8666-666666666711',
    '55555555-5555-4555-8555-555555555602',
    $P11$Đâu là kết quả in ra màn hình của đoạn code Python sau:

```python
class Student:
    def __init__(self, name="An", age=15):
        self.name = name
        self.age = age

s1 = Student("Bình")
print(s1.name, s1.age)
```$P11$,
    jsonb_build_array('An 15', 'Bình 15', 'Bình None', 'Lỗi vì thiếu tham số age'),
    1,
    $E11$Tham số name nhận giá trị truyền vào là "Bình", còn age giữ giá trị mặc định là 15.$E11$,
    10
  ),
  (
    '66666666-6666-4666-8666-666666666712',
    '55555555-5555-4555-8555-555555555602',
    $P12$Để thay đổi thuộc tính self.variable thành 'New' trong phương thức Change (tương tự Câu 4), dòng lệnh bên trong hàm Change(self, var) phải viết như thế nào?$P12$,
    jsonb_build_array('self.variable = var', $O12_1$var = 'New'$O12_1$, $O12_2$self.variable = 'New'$O12_2$, $O12_3$return 'New'$O12_3$),
    2,
    $E12$Phải truy cập thông qua self.variable để cập nhật trực tiếp thuộc tính của đối tượng.$E12$,
    11
  ),
  (
    '66666666-6666-4666-8666-666666666713',
    '55555555-5555-4555-8555-555555555602',
    $P13$Trong PyQt6, class QPushButton được nhập (import) từ module nào?$P13$,
    jsonb_build_array('PyQt6.QtCore', 'PyQt6.QtGui', 'PyQt6.QtWidgets', 'PyQt6.QtButtons'),
    2,
    $E13$Các thành phần giao diện người dùng như QPushButton, QLineEdit, QWidget đều nằm trong PyQt6.QtWidgets.$E13$,
    12
  ),
  (
    '66666666-6666-4666-8666-666666666714',
    '55555555-5555-4555-8555-555555555602',
    $P14$Để thay đổi nội dung chữ hiển thị trên một đối tượng btn = QPushButton(), ta sử dụng phương thức nào?$P14$,
    jsonb_build_array(
      'btn.setText("Click me")',
      'btn.setTitle("Click me")',
      'btn.setLabel("Click me")',
      'btn.changeText("Click me")'
    ),
    0,
    $E14$setText() là phương thức dùng để gán văn bản mới cho QPushButton.$E14$,
    13
  ),
  (
    '66666666-6666-4666-8666-666666666715',
    '55555555-5555-4555-8555-555555555602',
    $P15$Trong PyQt6, để thiết lập tiêu đề cho cửa sổ chính (QMainWindow hoặc QWidget), ta dùng phương thức nào?$P15$,
    jsonb_build_array('setName()', 'setWindowTitle()', 'setHeader()', 'setCaption()'),
    1,
    $E15$setWindowTitle() đặt dòng chữ hiển thị trên thanh tiêu đề cửa sổ.$E15$,
    14
  ),
  (
    '66666666-6666-4666-8666-666666666716',
    '55555555-5555-4555-8555-555555555602',
    $P16$Để kết nối sự kiện khi người dùng nhấn vào nút btn với một hàm xử lý on_click, cú pháp nào sau đây là đúng trong PyQt6?$P16$,
    jsonb_build_array('btn.click.connect(on_click)', 'btn.pressed.link(on_click)', 'btn.clicked.connect(on_click)', 'btn.onClick(on_click)'),
    2,
    $E16$Tín hiệu clicked kết nối với slot/hàm xử lý thông qua .connect().$E16$,
    15
  ),
  (
    '66666666-6666-4666-8666-666666666717',
    '55555555-5555-4555-8555-555555555602',
    $P17$Trong PyQt6, thành phần giao diện nào được dùng để tạo ô nhập liệu văn bản trên một dòng?$P17$,
    jsonb_build_array('QLabel', 'QLineEdit', 'QTextEdit', 'QPushButton'),
    1,
    $E17$QLineEdit là ô cho phép người dùng nhập và chỉnh sửa văn bản trên một dòng (khác với QLabel chỉ hiển thị nhãn văn bản tĩnh và QTextEdit dùng cho văn bản nhiều dòng).$E17$,
    16
  ),
  (
    '66666666-6666-4666-8666-666666666718',
    '55555555-5555-4555-8555-555555555602',
    $P18$Thành phần nào trong PyQt6 giúp sắp xếp các widget theo dạng lưới (hàng và cột)?$P18$,
    jsonb_build_array('QVBoxLayout', 'QHBoxLayout', 'QGridLayout', 'QFormLayout'),
    2,
    $E18$QGridLayout bố trí các widget theo tọa độ hàng (row) và cột (column).$E18$,
    17
  ),
  (
    '66666666-6666-4666-8666-666666666719',
    '55555555-5555-4555-8555-555555555602',
    $P19$Trong cấu trúc cơ bản của một ứng dụng PyQt6, lớp nào chịu trách nhiệm quản lý vòng lặp sự kiện chính và luồng điều khiển của toàn bộ ứng dụng giao diện?$P19$,
    jsonb_build_array('QMainWindow', 'QWidget', 'QApplication', 'QSystem'),
    2,
    $E19$QApplication quản lý luồng điều khiển chính và các cài đặt chung của ứng dụng PyQt6.$E19$,
    18
  ),
  (
    '66666666-6666-4666-8666-666666666720',
    '55555555-5555-4555-8555-555555555602',
    $P20$Lệnh nào sau đây được dùng để bắt đầu vòng lặp sự kiện và thoát ứng dụng an toàn khi người dùng đóng cửa sổ trong PyQt6?$P20$,
    jsonb_build_array('sys.exit(app.exec())', 'app.run()', 'window.loop()', 'sys.close(app.start())'),
    0,
    $E20$app.exec() khởi chạy vòng lặp sự kiện và sys.exit() đảm bảo thoát chương trình sạch sẽ khi đóng cửa sổ.$E20$,
    19
  );

-- 7. Ghi nhận migration vào lịch sử Supabase
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261114090000', 'm6_pti_course_session2_quiz')
ON CONFLICT (version) DO NOTHING;

COMMIT;
