---
trigger: always_on
description: Luôn tra cứu bản đồ mã nguồn cục bộ tại graphify-out/graph.json trước khi đọc tràn lan tệp code, cập nhật bằng graphify update . sau khi sửa code, giữ nguyên .graphifyignore và chạy offline 100% (GRAPHIFY_BACKEND=none, --code-only).
---

## Quy tắc bắt buộc sử dụng Bản đồ Mã nguồn Graphify (Offline 100%)

Dự án **MINDX LEARN** đã có sẵn lớp chắn bảo vệ [`.graphifyignore`](../../.graphifyignore) và bản đồ kiến trúc mã nguồn cục bộ tại `graphify-out/graph.json` (`graphify-out/` được ẩn trong `.gitignore`).

### 1. Luôn tra cứu bản đồ trước khi đọc tràn lan tệp code
- Sau khi đọc bộ tài liệu ngữ cảnh đầu phiên (`docs/AI_AGENT_WORKFLOW.md`, `PROJECT_OVERVIEW.md`, `projectstates.md`, `changelog.md`), trước khi dùng `grep`, tìm kiếm diện rộng hoặc mở đọc hàng loạt tệp mã nguồn để tìm hiểu kiến trúc / luồng dữ liệu / hàm / bảng SQL:
  - Khi `graphify-out/graph.json` tồn tại, **bắt buộc tra cứu trước** bằng một trong các lệnh cục bộ:
    - `graphify query "<câu hỏi hoặc từ khóa chức năng>"` — lấy nhánh đồ thị liên quan trực tiếp.
    - `graphify explain "<tên hàm, tệp hoặc bảng>"` — xem chi tiết nút và toàn bộ điểm kết nối vào/ra.
    - `graphify path "<Nút A>" "<Nút B>" --undirected` — tìm đường liên kết ngắn nhất giữa 2 thành phần.
  - Chỉ mở đọc trực tiếp các tệp và vùng dòng code mà kết quả đồ thị đã chỉ điểm. Chỉ đọc `graphify-out/GRAPH_REPORT.md` khi cần rà soát tổng quan toàn bộ kiến trúc hoặc khi `query` / `explain` / `path` chưa đủ thông tin.
  - Khi giao việc khảo sát mã nguồn cho bất kỳ Subagent nào, **bắt buộc đính kèm quy tắc tra cứu `graphify-out/graph.json` trước và chế độ offline 100%** vào nội dung giao việc.

### 2. Bắt buộc cập nhật bản đồ sau khi sửa code
- Sau khi thêm, sửa hoặc xóa bất kỳ tệp mã nguồn nào trong phiên làm việc, **bắt buộc chạy cập nhật cục bộ**:
  ```powershell
  $env:GRAPHIFY_BACKEND="none"; graphify update .
  ```
- Nếu xóa bớt tệp/hàm làm giảm số lượng nút hợp lệ, chạy:
  ```powershell
  $env:GRAPHIFY_BACKEND="none"; graphify update . --force
  ```
- Nếu làm việc trên máy mới clone chưa có `graphify-out/graph.json`, khởi tạo mới hoàn toàn offline bằng:
  ```powershell
  $env:GRAPHIFY_BACKEND="none"; graphify extract . --code-only
  $env:GRAPHIFY_BACKEND="none"; graphify cluster-only . --no-label
  ```

### 3. Quy định an toàn bất biến (Cấm vi phạm)
- **Giữ nguyên `.graphifyignore`:** Tuyệt đối **KHÔNG** xóa, không nới lỏng quy tắc lọc và không vô hiệu hóa `.graphifyignore` (bảo vệ tuyệt đối `.env*`, khóa bí mật, session/cookie, `.workflow-local/`, `scratch/`, `teachingmindx-sync-trial.html`, các tệp xuất CSV mã PIN / bảng điểm và dữ liệu thật học sinh/lớp học). Giữ nguyên `graphify-out/` trong `.gitignore`.
- **Chế độ Offline 100% (`$env:GRAPHIFY_BACKEND="none"`, `--code-only`):** Luôn đặt `$env:GRAPHIFY_BACKEND="none"` cho mọi thao tác `graphify` và luôn dùng cờ `--code-only` khi trích xuất (`extract`), chỉ phân tích cấu trúc AST cục bộ ngay trên máy.
- **Tuyệt đối không gọi API bên ngoài:** Cấm kết nối mạng hoặc gửi mã nguồn, tài liệu, tên tệp hay dữ liệu dự án qua bất kỳ dịch vụ AI / LLM / Cloud API bên ngoài nào (Gemini, OpenAI, Anthropic, DeepSeek, Kimi, Ollama từ xa, Graphify Cloud, Neo4j/FalkorDB từ xa...).
