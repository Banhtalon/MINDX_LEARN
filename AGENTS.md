<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quy tắc làm việc AI của dự án

1. **Single Source of Truth & GitHub Sync:** Đọc [docs/AI_AGENT_WORKFLOW.md](docs/AI_AGENT_WORKFLOW.md), [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md), [projectstates.md](projectstates.md) và [changelog.md](changelog.md) đầu tiên trước khi thay đổi mã, cấu hình hoặc tài liệu kỹ thuật để nắm nhanh toàn bộ kiến trúc, tiến độ hiện tại và sổ tay cách làm từng tính năng. Luôn cập nhật lại [projectstates.md](projectstates.md) và [changelog.md](changelog.md) sau mỗi thay đổi quan trọng, sau đó `git add`, `git commit` và `git push` lên GitHub. Quy tắc Owner, an toàn dữ liệu, tiếng Việt dễ hiểu, nghiệm thu và hướng dẫn Next.js trong tệp này luôn được ưu tiên.
2. **Thiết kế giao diện:** Khi thiết kế hoặc chỉnh giao diện tiếp theo, áp dụng **UI UX Pro Max** và **Taste Skill** theo yêu cầu và trạng thái xác minh nguồn trong [docs/AI_AGENT_WORKFLOW.md](docs/AI_AGENT_WORKFLOW.md).
3. **Team Workflow & Owner Communication ([docs/AI_AGENT_WORKFLOW.md](docs/AI_AGENT_WORKFLOW.md) | [.agents/skills/team-workflow/SKILL.md](.agents/skills/team-workflow/SKILL.md)):**
   - **Điều phối & Code chính:** Agent hiện tại điều phối công việc và trực tiếp viết/sửa code chính.
   - **Reviewer (`Codex CLI` — `gpt-6.1-sol` `xhigh`):** Phụ trách kiểm định độc lập qua `codex exec`.
   - **Escalation (Subagent `Argon High` — `Model: "pro"` / `"inherit"`):** Gọi Subagent `Argon High` hỗ trợ khi gặp bài toán hoặc lỗi kỹ thuật quá khó (không sử dụng các mô hình Claude).
   - **Báo cáo cho Owner:** Luôn báo cáo **ngắn gọn, dễ hiểu bằng ngôn ngữ đời thường** vì Owner không biết code (hạn chế tối đa thuật ngữ lập trình phức tạp).
   - **Cấm tuyệt đối `send_input` (`Thêm dữ liệu từ bàn phím (stdin)`):** Cả Agent chính lẫn mọi Subagent **tuyệt đối KHÔNG BAO GIỜ** gọi `manage_task` với `Action: "send_input"`. Nếu lệnh chạy nền bị treo, chỉ dùng `manage_task(Action: "kill")`.
4. **Bản đồ Mã nguồn Cục bộ Graphify — Offline 100% ([.agents/rules/graphify.md](.agents/rules/graphify.md)):**
   - **Tra cứu trước khi đọc tràn lan:** Khi `graphify-out/graph.json` tồn tại, luôn chạy `graphify query "<câu hỏi>"`, `graphify explain "<nút>"` hoặc `graphify path "<A>" "<B>" --undirected` trước khi tìm kiếm hay mở đọc tràn lan các tệp code (áp dụng cho cả Subagent); chỉ mở đọc đúng các tệp/dòng code đã khoanh vùng.
   - **Cập nhật sau khi sửa code:** Sau khi thêm/sửa/xóa code, bắt buộc chạy `$env:GRAPHIFY_BACKEND="none"; graphify update .` (thêm `--force` nếu xóa code làm giảm nút; nếu chưa có `graphify-out/graph.json` thì chạy `$env:GRAPHIFY_BACKEND="none"; graphify extract . --code-only`).
   - **An toàn & Offline tuyệt đối:** Bắt buộc **giữ nguyên [.graphifyignore](.graphifyignore)** (và `graphify-out/` trong `.gitignore`), luôn chạy chế độ **offline 100%** (`$env:GRAPHIFY_BACKEND="none"`, `--code-only`), **tuyệt đối không gọi bất kỳ API bên ngoài nào**.
