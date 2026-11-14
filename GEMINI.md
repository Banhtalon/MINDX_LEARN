# Quy tắc Dự án MINDX LEARN (`GEMINI.md`)

Tuân thủ toàn bộ quy tắc dự án trong [AGENTS.md](AGENTS.md), [docs/AI_AGENT_WORKFLOW.md](docs/AI_AGENT_WORKFLOW.md), [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), [projectstates.md](projectstates.md) và [changelog.md](changelog.md).

## Quy tắc Bản đồ Mã nguồn Graphify (Offline 100%)

Dự án đã có sẵn tệp bảo vệ [.graphifyignore](.graphifyignore) và bản đồ kiến trúc cục bộ tại `graphify-out/graph.json` (xem chi tiết tại [.agents/rules/graphify.md](.agents/rules/graphify.md)):

- **Luôn tra cứu trước khi đọc tràn lan tệp code:** Khi `graphify-out/graph.json` tồn tại, bắt buộc chạy `graphify query "<câu hỏi>"`, `graphify explain "<nút>"` hoặc `graphify path "<A>" "<B>" --undirected` để xác định đúng tệp và vị trí liên quan trước khi `grep` hoặc mở đọc nhiều tệp mã nguồn (truyền cả quy tắc này cho mọi Subagent khảo sát code). Chỉ đọc `graphify-out/GRAPH_REPORT.md` khi cần tổng quan kiến trúc rộng.
- **Cập nhật sau khi sửa code:** Sau mỗi lần thêm/sửa/xóa tệp mã nguồn, bắt buộc chạy `$env:GRAPHIFY_BACKEND="none"; graphify update .` (thêm `--force` nếu xóa code làm giảm số nút; nếu máy mới chưa có `graphify-out/graph.json` thì tạo bằng `$env:GRAPHIFY_BACKEND="none"; graphify extract . --code-only`).
- **Quy định an toàn bắt buộc:**
  1. **Giữ nguyên `.graphifyignore`** (tuyệt đối không xóa hay nới lỏng bộ lọc bảo vệ dữ liệu thật học sinh/lớp học, session/cookie, tệp CSV PIN/bảng điểm và khóa bí mật; giữ `graphify-out/` trong `.gitignore`).
  2. **Luôn chạy chế độ offline 100%** với `$env:GRAPHIFY_BACKEND="none"` và `--code-only` (chỉ phân tích AST cục bộ trên máy).
  3. **Tuyệt đối không gọi API bên ngoài** (không gửi mã nguồn, tài liệu hay dữ liệu dự án tới bất kỳ LLM / Cloud API nào).
