# MINDX LEARN — Nền tảng Học tập & Quản lý Lớp (Mốc 1)

Ứng dụng web dùng chung để quản lý học sinh, giáo viên và Admin theo Kế hoạch v3 (`PROJECT_PLAN.md`).
Gói triển khai **M1-A**: Dựng khung Next.js, Node.js, TypeScript và toàn bộ 13 màn hình giao diện giả lập (UI-01 đến UI-13).

> **Cảnh báo môi trường TEST:** Toàn bộ dữ liệu hiện tại chạy hoàn toàn trong bộ nhớ máy (RAM). Không kết nối cơ sở dữ liệu Supabase, không gửi email thật, không lưu mật khẩu hay mã PIN thô.

---

## 1. Bốn khu vực giao diện chính

1. **Khu Xác thực & Tài khoản chung:**
   - `/login` [UI-01]: Đăng nhập học sinh (Mã HS + PIN 8 số) hoặc cán bộ (Email + Mật khẩu). Có "Quên mật khẩu" gửi email mô phỏng. Nút đăng nhập nhanh 1-click cho kiểm thử.
   - `/account` [UI-02]: Xem hồ sơ; học sinh đổi PIN 8 chữ số; Admin/GV đổi mật khẩu; đăng xuất.

2. **Khu Học sinh:**
   - `/student` [UI-10]: Tổng quan lớp học và tiến độ cố định **"Đã hoàn thành X/14 buổi"** ((X/14)*100%).
   - `/student/course` [UI-11]: Danh sách 14 buổi học (chỉ hiển thị các bài Đã xuất bản). Học sinh được mở học bài tùy ý mà không bắt buộc theo thứ tự tuần tự.
   - `/student/lessons/[lessonId]` [UI-12]: Chi tiết bài học, xem video, tài liệu, nộp bài thực hành (liên kết hoặc tệp <= 2MB). Khóa nộp lại khi bài đã được duyệt Đạt.
   - `/student/lessons/[lessonId]/quiz` [UI-13]: Làm trắc nghiệm Quiz, ngưỡng đạt >= 70%, làm lại không giới hạn và lưu điểm cao nhất.

3. **Khu Giáo viên:**
   - `/manage` [UI-03]: Bảng điều khiển theo dõi lớp phụ trách và số lượng bài nộp cần chấm ("Việc cần chấm").
   - `/manage/classes` [UI-04]: Theo dõi danh sách học sinh và tiến độ lớp được giao (Giáo viên không có nút cấp PIN).
   - `/teacher/submissions` [UI-09]: Hàng đợi bài nộp, chấm bài Đạt / Cần làm lại, nhận xét và mở lại quyền nộp bài cho học sinh.

4. **Khu Quản trị Admin:**
   - `/manage/classes` [UI-04]: Quản lý lớp, gán khóa/giáo viên; cấp PIN lần đầu (cho HS chưa có PIN) hoặc cấp lại 1 HS với CSV một lần; kết thúc khóa học 14 buổi, xuất đối chiếu CSV và xóa vĩnh viễn dữ liệu cũ.
   - `/admin/courses` [UI-05]: Quản lý khóa học đúng 14 vị trí Buổi 1–14 cố định; xem trạng thái Nháp / Đã xuất bản.
   - `/admin/lessons/[lessonId]/edit` [UI-06]: Soạn thảo video, tài liệu, quiz, chế độ thực hành; **Chặn xuất bản bài học chỉ có lý thuyết**.
   - `/admin/teachers` [UI-07]: Tạo tài khoản giáo viên bằng email công vụ, gửi liên kết thiết lập mật khẩu, phân công lớp.
   - `/admin/sync` [UI-08]: Thử nghiệm đồng bộ fixture Teaching MindX, đối chiếu mã lớp ROB, cam kết an toàn không chuyển mật khẩu/cookie.

---

## 2. Quy tắc nghiệp vụ trọng tâm đã cài đặt

- **Khóa 14 buổi cố định:** Mỗi khóa học có đúng 14 vị trí Buổi 1–14. Không thêm/xóa/đảo vị trí làm lệch số buổi và cấu trúc báo cáo.
- **Tiến độ X/14:** Luôn tính trên mẫu số 14 buổi: `(X / 14) * 100%`. Kể cả khi một số buổi đang là Bản nháp, chỉ khi hoàn thành 14/14 mới đạt 100%.
- **Chặn xuất bản chỉ lý thuyết:** Hệ thống từ chối xuất bản bài học nếu thiếu cả Quiz và Thực hành.
- **Bảo mật PIN 8 chữ số:**
  - PIN gồm đúng 8 chữ số ngẫu nhiên, từ chối các dãy số dễ đoán.
  - Cấp PIN lần đầu chỉ tạo mã cho học sinh chưa có PIN.
  - Cấp lại PIN chỉ tác động đúng 1 học sinh được chọn.
  - Tải CSV một lần (no-store), không lưu PIN thô trong cơ sở dữ liệu.
  - Giáo viên không có nút cấp PIN và không tải/xem lại CSV mã PIN.
- **Kết thúc khóa & CSV tổng kết 14 buổi:**
  - Yêu cầu Admin xác nhận lớp đã học đủ 14 buổi theo lịch.
  - Cảnh báo đỏ về bài chưa nộp/chờ chấm là thông tin để Admin cân nhắc, không tự chặn kỹ thuật.
  - CSV tổng kết bao gồm toàn bộ học sinh từng tham gia đợt (kể cả em đã chuyển lớp hoặc bị lưu trữ).
  - Đúng 14 dòng cho mỗi học sinh (`Tổng số HS x 14 dòng`). Tuyệt đối không chứa mã PIN.
  - Xóa vĩnh viễn điểm quiz, bài nộp, nhận xét của lớp; giữ nguyên tài khoản người dùng và nội dung bài học.

---

## 3. Bộ điều khiển kiểm thử QA (QA Controller)

Giao diện tích hợp sẵn thanh công cụ nổi **"Mô phỏng QA"** ở góc dưới bên phải màn hình để QA và Reviewer chủ động chọn các tình huống:
1. `Normal`: Hoạt động bình thường.
2. `Loading Delay`: Mô phỏng độ trễ mạng 2 giây để kiểm tra skeleton/spinner.
3. `Save Error`: Mô phỏng lỗi lưu máy chủ — **thao tác lưu báo lỗi và dữ liệu trong kho hoàn toàn không bị thay đổi (Rollback)**.
4. `Network Error`: Mô phỏng mất kết nối, hiển thị nút thử lại.
5. `Session Expired`: Mô phỏng hết phiên làm việc (401).
6. `Forbidden`: Mô phỏng lỗi không đủ quyền (403).
7. `Empty Data`: Mô phỏng trạng thái không có dữ liệu (Empty State).

---

## 4. Hướng dẫn chạy và kiểm thử

Môi trường yêu cầu: Node 24.x, npm 11.x, Next.js 16.4.0, React 19.3.0.

```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Kiểm tra kiểu TypeScript toàn bộ dự án
npm run typecheck

# 3. Chạy bộ kiểm thử tự động (Unit Test kiểm chứng quy tắc nghiệp vụ trong src/lib/simulation-rules.ts)
npm test

# 4. Khởi chạy máy chủ phát triển cục bộ (cổng mặc định 3000)
npm run dev

# 5. Kiểm tra biên dịch ứng dụng production
npm run build

# 6. Khởi chạy bản production build
npm run start
```
