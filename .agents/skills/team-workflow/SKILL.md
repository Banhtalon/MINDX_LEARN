---
name: team-workflow
description: >-
  Quy trình phối hợp đội ngũ AI cho dự án MINDX LEARN: Agent chính điều phối và code chính,
  Codex CLI (gpt-6.1-sol xhigh) làm Reviewer kiểm định độc lập, Subagent Argon High xử lý các tác vụ quá khó,
  và báo cáo cho Owner ngắn gọn, dễ hiểu (không dùng thuật ngữ code phức tạp).
---

# Quy Trình Phối Hợp Đội Ngũ (Team Workflow) — MINDX LEARN

## 1. Phân Công Vai Trò (Role Assignment)

1. **Điều phối viên & Code chính (Main Agent / Orchestrator):**
   - Trực tiếp nhận yêu cầu từ Owner, lập kế hoạch, điều phối luồng công việc và trực tiếp viết/sửa phần lớn mã nguồn.
   - Chịu trách nhiệm tổng hợp kết quả, cập nhật `projectstates.md` + `changelog.md`, đồng bộ GitHub và báo cáo lại cho Owner.

2. **Kiểm định viên Độc lập — Reviewer (`Codex CLI` — `gpt-6.1-sol` `xhigh`):**
   - Sau khi Agent chính hoàn thành một tính năng hoặc giai đoạn, gọi **Codex CLI (`gpt-6.1-sol` `xhigh` qua `codex exec`)** để:
     - Kiểm tra chéo chất lượng code, phân quyền, an toàn dữ liệu và kết quả chạy bộ kiểm thử (`npm run typecheck`, `npm test`, `npm run build`).
     - Đưa ra kết luận **ĐẠT (`VERDICT: GO`)** hoặc danh sách điểm cần chỉnh sửa (`NO-GO`) trước khi bàn giao cho Owner.

3. **Chuyên gia Giải quyết Bài toán Khó (Subagent `Argon High` — `Model: "pro"` / `"inherit"`):**
   - Chỉ triệu tập Subagent `Argon High` khi gặp lỗi kiến trúc phức tạp, xung đột dữ liệu khó xử lý, hoặc khi sửa quá 2 lần vẫn chưa triệt để (không sử dụng các mô hình Claude).

---

## 2. Các Bước Thực Hiện Chuẩn (Standard Operating Steps)

1. **Bước 1 — Tiếp nhận & Triển khai (Main Agent):**
   - Đọc `docs/AI_AGENT_WORKFLOW.md`, `PROJECT_OVERVIEW.md`, `projectstates.md`, `changelog.md` và `AGENTS.md`.
   - Viết hoặc sửa code, tự chạy kiểm tra nhanh để đảm bảo tính năng hoạt động.
2. **Bước 2 — Nếu gặp việc quá khó (Escalation -> Subagent `Argon High`):**
   - Khởi tạo subagent với `Model: "pro"` / `"inherit"` (vai trò `Argon High Escalation Architect`) để phân tích nguyên nhân gốc rễ hoặc thiết kế giải pháp tối ưu.
3. **Bước 3 — Kiểm định chất lượng Độc lập (Review -> `Codex CLI` `gpt-6.1-sol` `xhigh`):**
   - Chạy kiểm định độc lập bằng **Codex CLI (`gpt-6.1-sol` `xhigh`)** để kiểm tra toàn bộ phần việc vừa làm.
   - **Quy tắc chống treo cứng (`stdin`):** Cả Agent chính lẫn mọi Subagent tuyệt đối KHÔNG dùng `manage_task(Action: 'send_input')` (Thêm dữ liệu từ bàn phím / stdin) vì sẽ làm treo cứng tiến trình mà không hiện nút bấm cho Owner; nếu lệnh bị treo chỉ được dùng `Action: 'kill'`.
   - Nếu Reviewer phát hiện lỗi: Agent chính sửa ngay và chạy kiểm định lại cho đến khi đạt `VERDICT: GO` 100%.
4. **Bước 4 — Báo cáo cho Owner (Ngắn gọn, Dễ hiểu, Không thuật ngữ code):**
   - Luôn trình bày theo ngôn ngữ đời thường, tập trung vào **ý nghĩa sử dụng thực tế** cho giáo viên/chủ dự án.

---

## 3. Chuẩn Báo Cáo Dành Cho Owner (Owner-Friendly Reporting)

Vì **Owner không biết code**, mọi báo cáo gửi Owner bắt buộc tuân thủ:
- **Ngắn gọn, đi thẳng vào kết quả:** Dùng gạch đầu dòng rõ ràng, tối đa 5–10 dòng cho mỗi mục chính.
- **Không dùng từ chuyên môn khó hiểu:** Diễn đạt bằng ngôn ngữ nghiệp vụ giảng dạy/quản lý lớp học dễ hiểu.
- **Bố cục 3 phần cố định:**
  1. **Kết quả chính:** (Đã xong chưa? Đạt chuẩn an toàn chưa?)
  2. **Hệ thống đã làm được gì cho giáo viên/học sinh:** (2–4 ý ngắn gọn dễ hiểu)
  3. **Bước tiếp theo:** (Owner cần làm gì hoặc có thể bấm nút gì tiếp theo)
