# MINDX LEARN — điểm nối tiếp Mốc 3 (2026-10-18)

Tài liệu này ghi nhận trạng thái để tiếp tục đúng repo sau khi chọn project Antigravity. Đây là checkpoint điều phối; chưa có mã Mốc 3 được triển khai.

## Trạng thái đã xác nhận

- Mốc 2 đã được Owner chấp nhận; baseline là `fd01c2e4d4651162bb3c3a7eb881565e17e98350` trên nhánh `codex/moc-2`.
- Nhánh tiếp tục Mốc 3 là `codex/moc-3`, tạo từ baseline trên. Trước khi tạo checkpoint, checkout MINDX sạch; chưa có thay đổi mã/SQL/migration M3.
- C13 vẫn là lỗi 199/200 chưa rõ nguyên nhân; C15 là lượt kiểm tra riêng 200/200. Không dùng các kết quả đó làm bằng chứng M6 hoặc PROD.
- Packet nội bộ nằm trong `.workflow-local/m3/` (thư mục bị Git bỏ qua):
  - `worker-task.md` — SHA-256 `BFFD32AAA454E569B62D6A44FD00D52170A09BED6FAF6F9BE0FCFC73F83ACA54`
  - `worker-dispatch-prompt.md` — SHA-256 `CDBC4676C7329AE4E1EF6F0C99A95A3F7FF89EF827967D0EE744CA8E4EB86BB0`

## Phạm vi và tiêu chí Mốc 3

- Một khóa có đúng 14 slot cố định, dùng được cho nhiều lớp; Admin gán khóa và soạn từng buổi. Bài nháp không lộ cho học sinh. Cho xuất bản bài có quiz, có thực hành hoặc có cả hai; chặn bài chỉ có lý thuyết.
- Quiz được chấm ở máy chủ, đạt từ 70%, cho làm lại không giới hạn và giữ điểm cao nhất/kết quả Đạt sau khi sửa quiz. Đáp án đúng không được gửi xuống dữ liệu học sinh.
- Bài thực hành nhận link hoặc tệp tối đa 2 MB theo allowlist trong PROJECT_PLAN.md. Không tăng giới hạn JSON 1 MiB của route M2 dùng chung; cần luồng upload M3 riêng có kiểm tra phía máy chủ và Storage private. Chỉ học sinh đúng lớp và giáo viên được phân công mới được đọc/tải.
- Học sinh chỉ thay bài đang chờ chấm hoặc bị yêu cầu làm lại. Sau khi bài Đạt, giáo viên phải mở quyền nộp lại; kết quả Đạt giữ tới khi bản thay được nộp. Giáo viên ngoài lớp không thể chấm.
- Tiến độ luôn dùng mẫu số 14, hiện “Đã hoàn thành X/14 buổi”; bài nháp vẫn nằm trong mẫu số và chỉ 14/14 mới là 100%. Loại đánh giá không có trong bài không bị yêu cầu.
- Kiểm tra luồng Admin → học sinh → giáo viên bằng dữ liệu TEST giả và tải lại trang; không báo thành công nếu máy chủ chưa xác nhận.

Ba tiêu chí Owner cần tự thử sau khi có bằng chứng TEST; cả ba hiện vẫn **chưa được tick**:

- [ ] Mở được khóa mẫu đủ 14 buổi; trạng thái nháp/xuất bản từng buổi dễ nhận biết.
- [ ] Thử quiz và thực hành trên dữ liệu giả, xem nhãn “Đã hoàn thành X/14 buổi”.
- [ ] Thấy kết quả của học sinh giả sau khi giáo viên chấm.

## Bằng chứng AGY và giới hạn hiện tại

- AGY CLI 1.4.2 có model `gemini-3.8-flash-high`; header TUI đã quan sát “Gemini 3.8 Flash (High)”. Đây là cấu hình và header TUI, không phải metadata định danh model do máy chủ báo.
- Lần chạy headless đầu yêu cầu RunCommand nhưng bị tự từ chối vì không hiện thẻ duyệt. Dù CLI trả `status SUCCESS`/exit 0, không có output hữu ích và không có diff, nên không được ghi nhận là Worker thành công.
- Lượt tiếp theo báo không tìm thấy conversation; lượt đầy đủ sau đó trả exit -1 và không có tệp output. Nguyên nhân chưa rõ.
- TUI interactive đầu tiên trỏ banner tới repo MINDX nhưng các thao tác đọc/lệnh của Worker lại nhắm repo khác; `git status` của Worker trả nhánh `main...origin/main`. Lệnh liệt kê tiếp theo đã bị từ chối và phiên đã dừng. Không có nội dung repo khác được đưa vào checkpoint; không có mã M3 nào được sửa.
- Metadata cửa sổ Antigravity cũng không khớp ứng dụng: lấy trạng thái cửa sổ trả ảnh trình duyệt. Không có thao tác bấm/nhập nào; Computer Use đã dừng, không dùng trình duyệt làm đường vòng.

## Điều kiện bắt buộc trước khi cho Worker viết mã

Đang chờ Owner cung cấp tên/ID project Antigravity đã xác minh chỉ gắn đúng thư mục `F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD`. Không đoán tên hoặc ID từ tên thư mục; không dùng project mặc định, không resume conversation cũ.

Khi có tên/ID đã xác minh, chạy một probe **read-only** trong `--mode plan`, gắn `--project=<tên hoặc ID đã xác minh>` và cùng model/effort Gemini 3.8 Flash High/high. Chỉ tiếp tục nếu trace đọc tệp thực tế xác nhận đúng repo MINDX và đọc đúng các đường dẫn tuyệt đối sau:

- `F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD\.git\HEAD` — phải trỏ tới `refs/heads/codex/moc-3`.
- `F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD\AGENTS.md`.
- `F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD\PROJECT_PLAN.md`.

Chỉ sau probe đạt mới khởi chạy Worker đầy đủ với `--project=<project đã xác minh>`, model `gemini-3.8-flash-high`, effort `high`, mode `accept-edits` và packet Mốc 3 đầy đủ. Mỗi yêu cầu lệnh local phải được Ops đọc đúng lệnh/phạm vi và duyệt riêng một lần; không chọn Always, không cấp quyền toàn cục, không dùng `--dangerously-skip-permissions`. Không cho phép truy cập cloud, auth, secrets, dữ liệu thật, thao tác phá hủy hay thay đổi Git.

## Chưa thực hiện

Chưa có thay đổi mã Mốc 3, chưa chạy kiểm tra Mốc 3, chưa áp dụng migration, chưa triển khai hoặc kiểm tra hosted TEST, và chưa nghiệm thu ba tiêu chí Owner. Không làm Mốc 4+, không tác động PROD hoặc dữ liệu Teaching thật.
