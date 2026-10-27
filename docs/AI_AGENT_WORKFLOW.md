# Quy tắc AI bổ sung cho MINDX LEARN

Tệp này áp dụng cho các agent làm việc trong kho MINDX LEARN. Nó bổ sung cho yêu cầu Owner và an toàn dữ liệu hiện có, không thay thế chúng.

## Đọc nhanh ngữ cảnh và cập nhật tiến độ đầu mỗi phiên

- **Trước khi bắt đầu bất kỳ công việc nào:** AI bắt buộc đọc [`PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) (tổng quan kiến trúc, quy tắc 14 buổi và thứ tự cấp độ khóa học chuẩn `Basic -> Advanced -> Intensive`), [`projectstates.md`](../projectstates.md) (trạng thái môi trường PROD, số liệu DB và các việc đang chờ) và [`changelog.md`](../changelog.md) (lịch sử phát triển tính năng & sổ tay cách làm từng feature) để nắm nhanh ngữ cảnh mà không phải quét lại từ đầu.
- **Sau khi hoàn thành mỗi hạng mục hoặc thay đổi trạng thái hệ thống:** AI bắt buộc cập nhật lại [`projectstates.md`](../projectstates.md) và ghi nhật ký thay đổi vào [`changelog.md`](../changelog.md) để phiên làm việc tiếp theo đọc được ngay trạng thái và cách làm mới nhất.

## Phân vai bắt buộc và bàn giao chat

Đây là quy tắc phân vai chuẩn cho mọi gói việc trong dự án. Yêu cầu của Owner, an toàn dữ liệu và hướng dẫn Next.js trong AGENTS.md vẫn được ưu tiên. Nếu một prompt cũ phân vai khác, dùng quy tắc này mà không tự thay đổi phạm vi sản phẩm đã duyệt.

### Phân vai thực thi và kiểm duyệt

- **Điều phối & Code chính:** Agent hiện tại trực tiếp điều phối công việc và thực hiện viết/sửa code chính.
- **Tham vấn việc quá khó:** Khi gặp bài toán hoặc lỗi kỹ thuật quá phức tạp, tham khảo `opus 5.5 high` (`claude-opus-5-5-high`, effort `high`).
- **Reviewer độc lập (Chính):** Dùng Codex CLI model `gpt-6.1-sol` mức `high` (`codex exec -m gpt-6.1-sol -c 'model_reasoning_effort="high"' -s read-only -`).
- **Reviewer dự phòng (Backup Reviewer):** Dùng `claude-sonnet-5-5-high` (effort `high`) khi Reviewer chính không khả dụng hoặc chạm giới hạn.
- **Cách báo cáo cho Owner:** Luôn trình bày ngắn gọn, đi thẳng vào kết quả bằng ngôn ngữ đời thường dễ hiểu, hạn chế tối đa thuật ngữ kỹ thuật/tên hàm vì Owner không biết code.

### Bàn giao khi ngữ cảnh vượt 60%

- Owner muốn chuyển phần việc còn lại sang chat mới khi mức dùng ngữ cảnh của **chat hiện tại** vượt 60%; chat mới dùng đúng model gpt-6.1-sol, effort high. Chỉ kích hoạt ngưỡng này từ số đo đáng tin cậy của riêng chat, không dùng phần trăm hạn mức tài khoản.
- Kiểm tra capabilities của phiên ngày 16/10/2026 không thấy công cụ trả phần trăm ngữ cảnh của chat. get_usage_limits trả mức dùng hạn mức tài khoản; create_thread có thể tạo chat mới với model/effort được chỉ định; handoff_thread chỉ chuyển một chat khác giữa các checkout và không tạo chat mới hoặc chuyển chính chat đang gọi. Các chức năng đó không tạo ngưỡng kích hoạt tự động.
- Vì chưa có số đo ngữ cảnh đáng tin cậy, hiện chưa thể tuyên bố đã cài hoặc chạy bàn giao tự động đúng ngưỡng 60%. Không tạo automation, hook, watcher, cấu hình toàn máy hay chat mới để giả lập ngưỡng. Giữ một tệp bàn giao trong dự án; chỉ chuyển tự động khi phiên sau có số đo riêng của chat đáng tin cậy và có thể tạo chat mới với đúng model/effort. Nếu không có số đo, báo rõ giới hạn và dùng cảnh báo/số đo thật mà giao diện cung cấp để Owner hoặc điều phối quyết định thời điểm chuyển.
- OpenAI API có hướng dẫn thu gọn ngữ cảnh cho ứng dụng tự gọi Responses API, nhưng đó không phải phép đo ngữ cảnh hay cơ chế tự chuyển chat của Codex hiện tại: [Compaction](https://developers.openai.com/api/docs/guides/compaction).

## Mục tiêu

- Chọn thay đổi nhỏ nhất nhưng giải quyết trọn vẹn yêu cầu.
- Giữ kiểm tra, xử lý lỗi, phân quyền, khả năng truy cập và bảo vệ dữ liệu.
- Dùng từ ngắn gọn trong ghi chú kỹ thuật nội bộ, nhưng báo cáo cho Owner vẫn bằng tiếng Việt rõ ràng, đủ bước và dễ hiểu.

## Cách áp dụng Ponytail

Trước khi sửa, đọc luồng đang bị tác động: nơi gọi, dữ liệu giả, kiểm tra, cấu hình và màn hình liên quan. Ưu tiên theo thứ tự: thành phần sẵn có của dự án, tính năng có sẵn của trình duyệt/Node.js, thư viện đã cài, rồi mới cân nhắc thêm thư viện.

Không tạo lớp bọc, tùy chọn hoặc cấu hình chỉ để dùng về sau. Thay đổi có nhánh điều kiện, vòng lặp, phân tích dữ liệu, bảo mật hoặc phân quyền phải có kiểm tra phù hợp. Không rút gọn các bước kiểm tra, xử lý lỗi, an toàn, trợ năng hoặc cảnh báo mất dữ liệu.

## Cách áp dụng Caveman

Chỉ dùng tinh thần viết gọn cho gói việc nội bộ, ghi chú kỹ thuật và phần tóm tắt kiểm tra. Không dùng lối viết rút gọn khi trao đổi với Owner, hướng dẫn thao tác, cảnh báo an toàn, tài liệu tồn tại lâu dài hoặc khi câu chữ có thể gây hiểu nhầm.

Không cài hoặc chạy proxy, hook vòng đời, phần mềm nền, tiện ích trình duyệt, MCP hay trình cài đặt của Caveman trong dự án này. Không để dữ liệu dự án, mã nguồn, nhật ký hoặc thông tin Teaching đi qua dịch vụ bên ngoài chỉ để giảm token.

## Thiết kế giao diện: UI UX Pro Max và Taste Skill

Theo yêu cầu Owner, các lần thiết kế hoặc chỉnh giao diện tiếp theo phải áp dụng **UI UX Pro Max** và **Taste Skill** từ các kho nguồn tương ứng. UI UX Pro Max hỗ trợ bố cục và trải nghiệm thao tác; Taste Skill hỗ trợ phong cách thị giác và tính nhất quán. Đọc hướng dẫn thực tế của cả hai skill trước khi làm, giữ các thành phần phù hợp đang có và tránh viết lại toàn bộ giao diện chỉ để đổi phong cách.

Chốt phong cách chung với Owner trước khi triển khai giao diện ở Mốc 2; tiếp tục hoàn thiện từng luồng tại Mốc 2–5 và kiểm tra tổng thể tại Mốc 6. Giữ tiếng Việt dễ hiểu, nền sáng, xanh dương chủ đạo, bốn khu theo vai trò, trợ năng và kiểm tra desktop 1280×720, 1440×900, 1920×1080. Mọi thay đổi vẫn phải tuân thủ phạm vi mốc, phân vai và quy tắc nghiệm thu của dự án.

Owner đã cung cấp và đội triển khai đã xác minh/cài hai nguồn ngày 14/10/2026:

- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill , commit `7246805992a42b7bba37d4cac83b01416f0c6c44`, skill `.claude/skills/ui-ux-pro-max`.
- Taste Skill: https://github.com/leonxlnx/taste-skill , commit `a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9`, skill `skills/taste-skill`.

Hai skill đã được cài trong môi trường Codex của Owner. Phong cách ứng dụng tiếp tục theo quyết định trong kế hoạch: nền sáng, xanh dương chủ đạo, chữ dễ đọc, điều hướng rõ và chuyển động nhẹ. Taste v2 thiên về trang giới thiệu, nên chỉ áp dụng nguyên tắc phù hợp cho các màn hình ứng dụng: chữ/màu nhất quán, bề mặt đơn giản, ít trang trí, kiểm tra ảnh thật; không ép dashboard có ảnh tiếp thị hoặc chuyển động liên tục. Không tuyên bố đã chạy bộ kiểm tra riêng của Taste khi chưa chạy; giao diện được reviewer kiểm tra bằng trình duyệt theo kích thước dự án.

Việc cài hai skill không có nghĩa giao diện Mốc 1 đã dùng chúng hoặc đã chốt thiết kế cuối. Không đưa mã nguồn, dữ liệu học sinh, cookie hay mật khẩu vào dịch vụ ngoài chỉ để thiết kế giao diện.

## Nguồn và phạm vi đã duyệt

- Ponytail: `DietrichGebert/ponytail`, commit `2961b52fc1fe6a5a87c7a959a79512e5c2f3ffe5`, giấy phép MIT.
- Caveman: `juliusbrussee/caveman`, commit `d262ab3882952a59312ff3537cd86d894523c5ab`, phần skill đọc theo kho nguồn; không sử dụng proxy/hook/cài đặt riêng.

Các skill cốt lõi được cài vào môi trường Codex của Owner để sử dụng ở các lượt làm việc sau: Ponytail, Ponytail Review, Ponytail Audit, Caveman, Caveman Review và Verify-and-stop. Việc cài skill không thêm thư viện chạy vào ứng dụng MINDX LEARN, không thay đổi gói Node.js và không triển khai lên web.
