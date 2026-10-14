# Quy tắc AI bổ sung cho MINDX LEARN

Tệp này áp dụng cho các agent làm việc trong kho MINDX LEARN. Nó bổ sung cho yêu cầu Owner và an toàn dữ liệu hiện có, không thay thế chúng.

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

## Nguồn và phạm vi đã duyệt

- Ponytail: `DietrichGebert/ponytail`, commit `2961b52fc1fe6a5a87c7a959a79512e5c2f3ffe5`, giấy phép MIT.
- Caveman: `juliusbrussee/caveman`, commit `d262ab3882952a59312ff3537cd86d894523c5ab`, phần skill đọc theo kho nguồn; không sử dụng proxy/hook/cài đặt riêng.

Các skill cốt lõi được cài vào môi trường Codex của Owner để sử dụng ở các lượt làm việc sau: Ponytail, Ponytail Review, Ponytail Audit, Caveman, Caveman Review và Verify-and-stop. Việc cài skill không thêm thư viện chạy vào ứng dụng MINDX LEARN, không thay đổi gói Node.js và không triển khai lên web.
