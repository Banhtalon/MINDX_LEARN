-- ============================================================================
-- MINDX LEARN — Bổ sung Phần Thực hành Buổi 2 Khóa học PTI (Python Intensive)
-- Bài Thực hành 1: Ứng dụng Bộ Đếm Số (Click Counter) — Qt Designer & PyQt6
-- Giữ nguyên trạng thái Bản nháp ('draft') và giữ nguyên đủ 20 câu Trắc nghiệm Buổi 2
-- ============================================================================

BEGIN;

UPDATE public.lessons
SET title = 'Buổi 2: Python OOP & PyQt6',
    description = 'Ôn tập Lập trình hướng đối tượng (Class, Object, __init__, self), củng cố kiến thức giao diện PyQt6 qua bộ 20 câu hỏi trắc nghiệm và thực hành xây dựng Ứng dụng Bộ Đếm Số (Click Counter) bằng Qt Designer kết hợp Python OOP.',
    materials = $PTI_B2_PRACTICE$## Mục tiêu bài học (Buổi 2 / 14)
1. **Nắm vững Lập trình hướng đối tượng (Python OOP):** Phân biệt Lớp (`class`) và Đối tượng (`object`), cách dùng hàm khởi tạo `__init__` và tham số `self` để quản lý thuộc tính, phương thức của đối tượng.
2. **Hoàn thành bài kiểm tra 20 câu trắc nghiệm:** Chọn đủ 20 câu và đạt từ **70%** (tối thiểu 14/20 câu đúng).
3. **Thực hành xây dựng ứng dụng Desktop hoàn chỉnh:** Thiết kế giao diện trên **Qt Designer** (`counter.ui`) và lập trình lớp điều khiển bằng **Python PyQt6** (`main_bai1.py`) cho **Ứng dụng Bộ Đếm Số (Click Counter)**.

> 💡 **Lưu ý khi làm Trắc nghiệm Buổi 2:** Bộ đề gồm **20 câu hỏi** (A, B, C, D). Cần chọn đủ cả 20 câu trước khi bấm **Nộp bài chấm điểm**; sau khi nộp xong hệ thống sẽ hiển thị đáp án đúng và lời giải thích chi tiết (khi bấm **Làm lại lần nữa**, đáp án sẽ tự động ẩn đi để em tự rèn luyện lại).

---

# BÀI THỰC HÀNH 1: ỨNG DỤNG BỘ ĐẾM SỐ (CLICK COUNTER)

- **Bộ môn**: Coding - App Producer Intensive (Buổi 2)
- **Mức độ**: Cơ bản
- **Công cụ**: Qt Designer & Python (PyQt6)

---

## 1. ĐỀ BÀI & MỤC TIÊU

Hãy thiết kế giao diện bằng Qt Designer và viết chương trình Python áp dụng Lập trình hướng đối tượng (OOP) để tạo ứng dụng **Bộ Đếm Số**.

### Yêu cầu chức năng:
- Hiển thị số đếm ban đầu là 0 trên màn hình hiển thị.
- Khi nhấn nút **+1 (Tăng)**: Số đếm trên màn hình tăng thêm 1 đơn vị.
- Khi nhấn nút **-1 (Giảm)**: Số đếm trên màn hình giảm đi 1 đơn vị.
- Khi nhấn nút **Đặt lại (0)**: Số đếm quay về giá trị 0 ban đầu.

---

## 2. HƯỚNG DẪN THIẾT KẾ GIAO DIỆN (QT DESIGNER)

- Mở phần mềm **Qt Designer**, chọn tạo mới một cửa sổ **Main Window**.
- Kéo thả 1 ô Line Edit (`QLineEdit`) và 3 nút nhấn Push Button (`QPushButton`) vào cửa sổ.
- Đặt tên đối tượng (`objectName`) và các thuộc tính trong bảng Property Editor theo bảng dưới đây:

| Thành phần (Widget) | Tên đối tượng (objectName) | Văn bản hiển thị (text) | Thuộc tính bổ sung |
| :--- | :--- | :--- | :--- |
| Màn hình hiển thị (`QLineEdit`) | `txt_display` | `0` | - Tích chọn `readOnly = True`<br>- Căn lề `alignment`: `AlignRight` |
| Nút Tăng (`QPushButton`) | `btn_inc` | `+1 (Tăng)` | - |
| Nút Giảm (`QPushButton`) | `btn_dec` | `-1 (Giảm)` | - |
| Nút Đặt lại (`QPushButton`) | `btn_reset` | `Đặt lại (0)` | - |

### Gợi ý trang trí giao diện (styleSheet):

- Cho ô `txt_display` (`QLineEdit`):
```css
background-color: #333;
color: white;
border-radius: 8px;
padding: 10px;
font-size: 24px;
```

- Cho cả 3 nút nhấn (`QPushButton`):
```css
background-color: #4CAF50;
color: white;
border-radius: 8px;
padding: 10px;
font-size: 18px;
```

- Nhấn **Ctrl + S** và lưu file giao diện với tên `counter.ui` (lưu cùng thư mục với file code Python).

---

## 3. CODE XỬ LÝ PYTHON (main_bai1.py)

Tạo file `main_bai1.py` nằm cùng thư mục với file `counter.ui` và nhập đoạn code sau:

```python
import sys
from PyQt6.QtWidgets import QApplication, QMainWindow
from PyQt6 import uic

class CounterApp(QMainWindow):
    def __init__(self):
        super().__init__()
        # 1. Tải giao diện từ file thiết kế Qt Designer
        uic.loadUi("counter.ui", self)

        # 2. Khởi tạo thuộc tính lưu giá trị đếm ban đầu
        self.count = 0

        # 3. Kết nối sự kiện nhấn nút (clicked) với các phương thức xử lý
        self.btn_inc.clicked.connect(self.increase_count)
        self.btn_dec.clicked.connect(self.decrease_count)
        self.btn_reset.clicked.connect(self.reset_count)

    def increase_count(self):
        # Tăng biến đếm lên 1 và cập nhật lên màn hình
        self.count += 1
        self.txt_display.setText(str(self.count))

    def decrease_count(self):
        # Giảm biến đếm đi 1 và cập nhật lên màn hình
        self.count -= 1
        self.txt_display.setText(str(self.count))

    def reset_count(self):
        # Đưa biến đếm về 0 và cập nhật lên màn hình
        self.count = 0
        self.txt_display.setText(str(self.count))

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = CounterApp()
    window.show()
    sys.exit(app.exec())
```

---

## 4. GIẢI THÍCH KIẾN THỨC TRỌNG TÂM

- `uic.loadUi("counter.ui", self)`: Giúp nạp toàn bộ giao diện đã kéo thả trong Qt Designer vào thẳng lớp `CounterApp`.
- `self.count`: Thuộc tính của đối tượng dùng để lưu trữ con số hiện tại trong bộ nhớ.
- `str(self.count)`: Vì phương thức `.setText()` chỉ nhận dữ liệu kiểu chuỗi (`str`), ta cần ép kiểu số nguyên `self.count` sang chuỗi trước khi hiển thị lên `txt_display`.
- `clicked.connect(...)`: Kết nối tín hiệu khi người dùng bấm vào nút với hàm xử lý tương ứng.

---

### Hướng dẫn Nộp bài Thực hành Buổi 2 (Dành cho Học sinh)
1. Kiểm tra chương trình chạy mượt trên máy tính với đủ 3 chức năng **`+1 (Tăng)`**, **`-1 (Giảm)`** và **`Đặt lại (0)`**.
2. Nén thư mục chứa cả 2 tệp **`counter.ui`** và **`main_bai1.py`** thành 1 tệp **`.zip`** (`<= 2 MB`), sau đó chọn tab **Tải tệp (`<= 2MB`)** tại mục **3. Nộp bài thực hành** bên dưới để tải lên hệ thống (hoặc nộp tệp `main_bai1.py` / dán **Đường link** GitHub, Google Drive).$PTI_B2_PRACTICE$,
    status = 'draft',
    has_quiz = true,
    has_practice = true,
    practice_mode = 'file_allowed',
    updated_at = now()
WHERE id = '55555555-5555-4555-8555-555555555602';

DO $$
DECLARE
  v_lesson_exists BOOLEAN;
  v_q_count INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.lessons
    WHERE id = '55555555-5555-4555-8555-555555555602'
      AND course_id = '44444444-4444-4444-8444-444444444423'
      AND status = 'draft'
      AND has_quiz = true
      AND has_practice = true
      AND practice_mode = 'file_allowed'
  ) INTO v_lesson_exists;

  IF NOT v_lesson_exists THEN
    RAISE EXCEPTION 'MISSING_PTI_SESSION_2: Không tìm thấy Buổi 2 khóa PTI (55555555-5555-4555-8555-555555555602) ở trạng thái draft.';
  END IF;

  SELECT count(*)::INT INTO v_q_count
  FROM public.quiz_questions
  WHERE lesson_id = '55555555-5555-4555-8555-555555555602';

  IF v_q_count <> 20 THEN
    RAISE EXCEPTION 'PTI_SESSION_2_QUIZ_COUNT_MISMATCH: Buổi 2 PTI phải giữ nguyên đủ 20 câu trắc nghiệm (hiện có: %).', v_q_count;
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261114103000', 'm6_pti_session2_practice')
ON CONFLICT (version) DO NOTHING;

COMMIT;
