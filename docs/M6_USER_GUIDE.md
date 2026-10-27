# Hướng dẫn Sử dụng Hệ thống MINDX LEARN (Mốc 6)

Tài liệu hướng dẫn ngắn gọn dành cho **Quản trị viên (Admin)**, **Giáo viên (Teacher)** và **Học sinh (Student)** khi vận hành chính thức.

---

## 1. Dành cho Học sinh (Student)

### 1.1. Đăng nhập vào lớp học
1. Truy cập trang đăng nhập học sinh.
2. Nhập **Mã học sinh** (ví dụ: `MX-K14-0001`) và **Mã PIN 8 chữ số** do Admin/Giáo viên cung cấp.
3. Nhấn **Vào lớp học** để mở bảng điều khiển học tập.
   - *Lưu ý:* Nếu nhập sai mã PIN quá 6 lần liên tiếp trong 1 phút, tài khoản của em đó sẽ tạm khóa 1 phút để bảo mật (không ảnh hưởng đến các bạn khác ngồi cùng mạng Wi-Fi lớp học).

### 1.2. Xem bài học, làm Trắc nghiệm và nộp Bài thực hành
1. Trên trang **Lộ trình 14 buổi học**, chọn buổi học đã được mở.
2. **Đọc lý thuyết & tài liệu:** Xem nội dung hướng dẫn và video/tài liệu đính kèm.
3. **Làm bài Trắc nghiệm (Quiz):**
   - Chọn đáp án cho từng câu hỏi và nhấn **Nộp bài trắc nghiệm**.
   - Cần đạt tối thiểu **70%** để tính hoàn thành phần trắc nghiệm.
   - Nếu chưa đạt 70%, học sinh được **làm lại không giới hạn số lần**; hệ thống luôn giữ **điểm cao nhất**.
4. **Nộp bài Thực hành (Practice):**
   - **Cách 1 — Nộp đường dẫn (Link):** Dán đường dẫn bài làm (`https://...`, ví dụ link Scratch, Canva, Google Drive, GitHub) kèm ghi chú và nhấn **Gửi bài thực hành**.
   - **Cách 2 — Tải tệp đính kèm (khi bài học bật cho phép nộp tệp):** Chọn tệp `.pdf`, `.zip`, `.png`, `.jpg`, hoặc `.sb3` (dung lượng tối đa **2 MB/tệp**) và nhấn **Gửi bài thực hành**.
   - Khi bài thực hành được Giáo viên duyệt **Đạt**, nút nộp lại sẽ khóa để bảo toàn kết quả. Nếu Giáo viên đánh giá **Cần sửa** hoặc mở lại quyền nộp, học sinh có thể gửi lại bản cập nhật.

---

## 2. Dành cho Giáo viên (Teacher)

### 2.1. Đăng nhập và chọn lớp phụ trách
1. Đăng nhập bằng **Email** và **Mật khẩu** giáo viên.
2. Hệ thống chỉ hiển thị **đúng các lớp mà Giáo viên được phân công phụ trách**.

### 2.2. Theo dõi tiến độ và chấm bài thực hành
1. Mở trang **Chấm bài & Nhận xét** hoặc chi tiết từng lớp.
2. Xem danh sách học sinh cùng tiến độ hoàn thành trên tổng số **14 buổi cố định**.
3. Với mỗi bài nộp thực hành của học sinh:
   - Nhấn mở đường dẫn bài làm hoặc bấm **Tải tệp đính kèm** để kiểm tra.
   - Nhập nhận xét chi tiết và chọn kết quả:
     - **Đạt (Approved):** Ghi nhận học sinh hoàn thành phần thực hành của buổi học.
     - **Cần sửa (Needs Revision):** Cho phép học sinh chỉnh sửa và nộp lại.
   - Trường hợp học sinh đã **Đạt** nhưng muốn nộp bản nâng cấp tốt hơn, Giáo viên có thể nhấn **Mở lại quyền nộp bài**.

---

## 3. Dành cho Quản trị viên (Admin)

### 3.1. Quản lý Khóa học, Lớp học và Giáo viên
- **Khóa học & 14 buổi học:** Tạo/chỉnh sửa nội dung 14 buổi học. Mỗi buổi học bắt buộc phải có ít nhất **Trắc nghiệm** hoặc **Thực hành** mới được phép xuất bản (**Mở bài**).
- **Lớp học & Phân công:** Tạo lớp mới, gán khóa học cho lớp và phân công Giáo viên phụ trách.
- **Chuyển lớp / Đặt lại tiến độ:** Khi học sinh đổi ca học, dùng chức năng **Chuyển lớp** (mã học sinh giữ nguyên, lịch sử lớp cũ vẫn được ghi nhận trong báo cáo tổng kết).

### 3.2. Cấp mã PIN 8 chữ số & Quy tắc bảo mật tệp CSV một lần
1. Tại trang **Quản lý Học sinh**, chọn học sinh hoặc cả lớp cần cấp/đặt lại mã PIN.
2. Nhấn **Cấp / Đặt lại mã PIN** → Hệ thống sinh ngẫu nhiên **mã PIN 8 chữ số an toàn** (không bao giờ dùng mã yếu như `123456` hay `11111111`) và cho phép tải tệp **CSV mã PIN đúng 1 lần duy nhất**.
3. **Quy tắc bảo mật tệp CSV mã PIN:**
   - Hệ thống **không lưu mã PIN dạng rõ** trong cơ sở dữ liệu; nếu làm mất tệp CSV, Admin chỉ cần bấm **Đặt lại mã PIN** để cấp mã mới (phiên đăng nhập cũ của học sinh sẽ tự động hết hiệu lực ngay lập tức).
   - Không gửi tệp CSV chứa mã PIN của cả lớp vào nhóm chat công khai; chỉ phát mã riêng cho từng học sinh/phụ huynh và xóa tệp CSV tạm trên máy tính cá nhân sau khi đã bàn giao.

### 3.3. Đồng bộ danh sách học sinh từ `teaching.mindx.edu.vn`
1. Mở trang quản lý lớp trên `teaching.mindx.edu.vn`, đăng nhập tài khoản quản trị và bấm **Bookmarklet Đồng bộ MINDX LEARN** trên thanh dấu trang.
2. Công cụ đọc danh sách lớp/học sinh ngay trên trình duyệt của Admin và hiển thị **Bảng xem trước (Preview)**:
   - Số học sinh thêm mới, số học sinh cập nhật thông tin, số lớp mới phát hiện.
3. Kiểm tra kỹ bảng xem trước trên máy, sau đó nhấn **Xác nhận lưu đồng bộ** để cập nhật vào hệ thống.

### 3.4. Đóng khóa học, tải CSV tổng kết 14 buổi và xóa dữ liệu khóa cũ
Khi một lớp đã hoàn thành trọn vẹn 14 buổi học:
1. Mở mục **Kết thúc khóa & Xuất CSV tổng kết** tại trang **Quản lý Lớp học**.
2. Tích xác nhận **Lớp đã hoàn thành đủ 14 buổi** và nhấn **Xem trước & Xuất CSV tổng kết**.
3. Nhấn **Tải tệp CSV tổng kết khóa học** về máy tính và kiểm tra tệp mở tốt trên Excel/Google Sheets.
4. Hệ thống tự động đối chiếu 100% nội dung tệp CSV với cơ sở dữ liệu máy chủ. Chỉ khi trạng thái báo **Đã đối chiếu khớp 100%**, nút xóa mới được mở khóa.
5. **Cảnh báo quan trọng trước khi bấm Xóa:**
   - Thao tác đóng khóa sẽ **xóa vĩnh viễn toàn bộ bài nộp thực hành, tệp đính kèm và điểm trắc nghiệm của khóa cũ** để giải phóng dung lượng máy chủ (giữ dưới ngưỡng 700 MB / 800 MB).
   - Tệp CSV tổng kết đã tải về máy là bản lưu chính thức duy nhất. Hãy lưu tệp CSV vào thư mục lưu trữ của trung tâm trước khi nhấn **Xác nhận đóng khóa & Xóa dữ liệu khóa cũ**.
