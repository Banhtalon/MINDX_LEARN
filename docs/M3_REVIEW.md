# Rà soát độc lập Mốc 3 — cập nhật 20/10/2026

**Kết luận hiện tại:** Các tiêu chí kỹ thuật Mốc 3 trên môi trường TEST đạt **7/7** và mục nghiệm thu của Owner đạt **3/3** (theo ủy quyền của Owner ngày 20/10/2026). Không mở PROD, không sử dụng dữ liệu học sinh thật từ Teaching trong môi trường TEST, và không coi kết quả này là xác nhận tải 200 học sinh của Mốc 6.

Tài liệu tổng hợp bằng chứng chi tiết: [M3_EVIDENCE.md](M3_EVIDENCE.md).

---

## 1. Đối chiếu từng mục kỹ thuật của Mốc 3 trong PROJECT_PLAN.md

1. **Đạt — Admin tạo/sửa khóa dùng chung với đúng 14 vị trí cố định (Buổi 1–14) và gán cho lớp.**
   - Ràng buộc cơ sở dữ liệu (`total_sessions = 14`, `session_number BETWEEN 1 AND 14`, `UNIQUE(course_id, session_number)`) và RPC `m3_save_course` tự động khởi tạo đúng 14 vị trí cố định ở trạng thái `draft`, không có thao tác thêm/xóa/đảo vị trí buổi học.
   - Chu trình QA14 trên TEST Preview (`dpl_H3yNw1AouwxegXyzj18tnx7HA8uN`) đã tạo khóa `TEST_M3_QA` (`bb33f849-c640-4fa9-aede-71a1302d6166`), xác minh đủ 14 buổi, gán dùng chung cho 2 lớp `ROB-K14-01` và `ROB-K14-02`, sau đó khôi phục an toàn về khóa gốc `44444444-4444-4444-8444-444444444401` (`status: "restore_succeeded"`).

2. **Đạt — Soạn bài và xuất bản; chặn xuất bản bài chỉ có lý thuyết; ẩn bài nháp với học sinh.**
   - RPC `m3_save_lesson` và giao diện Admin chặn đặt `status = 'published'` khi cả `has_quiz = false` và `has_practice = false`.
   - Kiểm tra đa vai trò trên TEST xác nhận Giáo viên phụ trách thấy đủ `14/14` buổi (`1` đã xuất bản, `13` bản nháp) của lớp mình, trong khi Học sinh chỉ nhận được các buổi `published` (`1/14` trên `TEST_M3_QA`, `3/14` trên khóa chuẩn) và bị chặn khi mở trực tiếp đường dẫn URL của buổi nháp (`/student/lessons/fbe6ee91-d967-4257-86b6-74315e1b5bab`).

3. **Đạt — Quiz chấm điểm tại máy chủ, ngưỡng đạt 70%, làm lại không giới hạn và giữ điểm cao nhất.**
   - Đáp án đúng (`correctIndex`) bị loại khỏi payload trả về cho Học sinh; việc chấm điểm thực hiện trong RPC `m3_submit_quiz`.
   - Kiểm tra thực tế trên Buổi 1 (`55555555-5555-4555-8555-555555555501`) xác nhận: lần 1 đạt `0%` (`passed=false`), lần 2 đạt `100%` (`passed=true`), lần 3 đạt `50%` nhưng vẫn giữ `highestScore=100` và `passed=true`. Nộp Quiz vào bài nháp bị từ chối (`400 QUIZ_SUBMIT_FAILED`).

4. **Đạt — Nộp liên kết và tệp tối đa 2 MB; bucket riêng tư và kiểm soát quyền tải `/api/m3/file`.**
   - Kiểm tra biên trên Buổi 2 (`55555555-5555-4555-8555-555555555502`) xác nhận chặn link `javascript:` (`400 INVALID_LINK_SCHEME`), chặn tệp `.exe` (`400 FILE_VALIDATION_FAILED`), chặn tệp `2 MiB + 1B` (`400 FILE_TOO_LARGE`), và chấp nhận tệp `.txt` đúng `2 MiB` (`2,097,152` bytes).
   - Sau khi vá policy `m3_storage_select_policy` định danh rõ `objects.name`, kiểm tra `GET /api/m3/file` xác nhận Học sinh chủ bài nộp (`student_a`), Giáo viên phụ trách lớp (`teacher_a`), và Admin tải được tệp (`200`) kèm đầy đủ header `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`; Học sinh khác (`student_b`) và Giáo viên lớp khác (`teacher_b`) bị chặn (`403`).

5. **Đạt — Giáo viên chấm Đạt/Cần làm lại, nhận xét, mở lại bài đã đạt; học sinh thay bài đúng thời điểm.**
   - Giáo viên ngoài lớp (`teacher_b`) gọi chấm bài bị chặn (`400 GRADE_FAILED`).
   - Sau khi Giáo viên phụ trách (`teacher_a`) chấm `approved`, học sinh bị chặn tải tệp mới (`403`) và chặn nộp lại (`400 CANNOT_RESUBMIT_APPROVED`); giáo viên cũng không thể hạ trực tiếp từ `approved` xuống `needs_revision` (`400 GRADE_FAILED`).
   - Khi Giáo viên gọi `reopen-submission`, trạng thái `approved` vẫn được bảo lưu cho đến khi học sinh nộp bản thay thế mới; ngay khi bản thay thế được nộp, đường dẫn tệp cũ bị thu hồi quyền truy cập (`403`).

6. **Đạt — Tính tiến độ theo mẫu số 14 cố định (“Đã hoàn thành X/14 buổi”).**
   - Tiến độ luôn tính trên tổng số 14 buổi cố định của khóa học kể cả khi còn các buổi đang ở trạng thái bản nháp. Các bài chỉ có Quiz, chỉ có Thực hành, hoặc có cả hai đều chỉ hoàn thành khi đạt đủ các phần có trong bài đó.

7. **Đạt — Luồng Admin → Học sinh → Giáo viên trên TEST và tải lại trang.**
   - Đã kiểm tra xuyên suốt trên môi trường TEST kết hợp trình duyệt và BFF API; phiên đăng nhập và dữ liệu lớp/khóa/tiến độ giữ nguyên sau khi tải lại trang (`reload`), và dữ liệu thử nghiệm của `student_a` đã được reset sạch cuối phiên.

---

## 2. Nghiệm thu của Owner và Phạm vi Ủy quyền

- Owner đã phản hồi: **“Đồng ý chốt Mốc 3, ủy quyền AI”** ngày 20/10/2026.
- Ba mục nghiệm thu Owner của Mốc 3 trong [PROJECT_PLAN.md](../PROJECT_PLAN.md) được đánh dấu hoàn tất theo ủy quyền của Owner dựa trên bộ bằng chứng tự động trên môi trường TEST ([M3_EVIDENCE.md](M3_EVIDENCE.md)), giữ phân biệt minh bạch giữa kiểm tra theo ủy quyền của AI và thao tác bấm trực tiếp của Owner.
- Tên miền TEST chính thức `https://mindx-learn-test.vercel.app` đã được trỏ sang bản triển khai Mốc 3 `dpl_H3yNw1AouwxegXyzj18tnx7HA8uN` và vượt qua kiểm tra smoke check (`/login`, `/api/m2/session`, `staff-login`, `/api/m2/bootstrap` đều trả `HTTP 200`).
- Các phiên review độc lập (`gpt-6-luna` `max` và `gpt-6.1-sol` `xhigh`) đã kết luận **PASS / APPROVE** đối với cả mã nguồn Mốc 3, bản vá SQL RPC/Storage RLS, bộ công cụ kiểm tra QA14 (`28/28` mock tests PASS) và biên lai khôi phục dữ liệu trên TEST.
