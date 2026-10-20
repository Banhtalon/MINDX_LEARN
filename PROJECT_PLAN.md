# Kế hoạch v3 — Ứng dụng web học tập và quản lý lớp

> Cập nhật 14/10/2026 theo quyết định mới của Owner. Đây là kế hoạch, chưa phải ứng dụng đã triển khai. HTML thử nghiệm cũ được giữ nguyên làm tài liệu tham khảo; không tính nó là sản phẩm.

## 1. Mục tiêu, phạm vi và quyết định đã chốt

Xây một ứng dụng web dùng chung để quản lý khoảng 200 học sinh, giáo viên và Admin. Học sinh học khóa của lớp, làm quiz và nộp thực hành; giáo viên theo dõi lớp được giao và chấm thực hành; Admin quản lý nội dung, tài khoản, lớp, đồng bộ danh sách và kết thúc khóa học.

- Dùng một codebase web. Supabase TEST và Supabase PROD là hai môi trường/dự án riêng: TEST chỉ chứa dữ liệu giả; PROD chỉ nhận dữ liệu thật sau khi vượt các cổng kiểm tra và được Owner cho phép.
- Đưa bản TEST lên một địa chỉ web riêng từ sớm để Owner và người thử kiểm tra được trên mạng. Khi thử, chỉ dùng tài khoản và dữ liệu giả; không công khai dữ liệu cá nhân.
- Chọn nơi chạy tạm cho TEST sau khi kiểm tra chi phí, điều khoản và khả năng chạy ứng dụng. Chỉ chốt nơi chạy PROD sau pilot và kiểm tra tải. Không phát sinh phí nếu chưa được Owner đồng ý.
- Mục tiêu cuối là đồng bộ học sinh thật từ Teaching MindX sau khi cách đọc, nhận diện học sinh và các kiểm tra an toàn đã được xác nhận. Cho phép spike đọc Teaching thật ở chế độ chỉ đọc tại Mốc 1 sau khi Owner tự đăng nhập trực tiếp. Mốc 4 hoàn thiện giao diện UI-08 và quy trình đọc/đối chiếu đầy đủ; chỉ áp dụng dữ liệu học sinh thật vào PROD tại Mốc 6 sau khi Owner xác nhận riêng.
- Giao diện tiếng Việt, nền sáng và màu xanh dương chính. Bốn khu sử dụng là Đăng nhập, Học sinh, Giáo viên và Admin. Vẫn thử giao diện desktop ở 1280×720, 1440×900 và 1920×1080; chưa nhận nghiệm thu bố cục điện thoại.
- Mỗi lớp có một khóa hiện tại; nhiều lớp được dùng chung nội dung khóa. Không xây lịch sử nhiều khóa để học sinh/giáo viên tra cứu.
- Ngoài phạm vi: phụ huynh, AI chấm bài, tự đăng ký, chạy mã trong tệp, tải video, quét Teaching theo lịch và khôi phục điểm/tệp của khóa đã xóa.

Các phân biệt quan trọng:

| Nội dung | Trạng thái |
|---|---|
| Web-first, TEST/PROD tách riêng, kiểm tra bản web TEST sớm, hướng tới 200 học sinh | Đã chốt làm mục tiêu dự án |
| TEST chỉ dùng dữ liệu giả; không dùng TEST làm nơi nhập học sinh thật | Đã chốt |
| Teaching thật có thể được thử đọc an toàn từ Mốc 1; xem trước và xác nhận trước khi áp dụng | Đã chốt về luồng; cách kết nối chưa xác nhận kỹ thuật |
| Đường XHR, tên trường và trạng thái Teaching nêu ở Mục 5 | Đã quan sát trong khảo sát trước; chưa phải cam kết ổn định của Teaching và chưa kiểm chứng toàn bộ danh sách |
| Khả năng Owner đăng nhập trực tiếp rồi bấm nút giao diện/tiện ích để thử đọc mà không chuyển mật khẩu/cookie | Được phép kiểm chứng read-only ở Mốc 1; chưa xác nhận kỹ thuật |
| Tải thực tế, chi phí, hạn mức và khả năng giữ dữ liệu trong ngân sách | Chưa được kiểm thử; phải đo trước khi mở cho học sinh thật |

## 2. Người dùng, đăng nhập và quyền

- **Admin:** tạo/sửa/xuất bản khóa và bài; tạo email/mật khẩu giáo viên trực tiếp trong Supabase rồi kết nối hồ sơ Giáo viên trong ứng dụng; phân công giáo viên vào lớp; quản lý học sinh/lớp; xem trước và áp dụng đồng bộ; kết thúc khóa; tải CSV tổng kết; cấp PIN lần đầu cho học sinh chưa có PIN; cấp lại PIN riêng cho đúng một học sinh; tự tải CSV đăng nhập một lần để bàn giao riêng cho giáo viên lớp đó nếu cần. Đội triển khai tạo tài khoản Admin đầu tiên; Owner tự đặt mật khẩu qua liên kết email, không nhận mật khẩu qua chat. Đồng bộ không tự cấp PIN hoặc tạo/tải CSV.
- **Giáo viên:** chỉ xem lớp được phân công; theo dõi tiến độ, xem/chấm bài thực hành; có thể nhận CSV đăng nhập do Admin cấp và bàn giao riêng để phát cho học sinh lớp được giao. Giáo viên không cấp/cấp lại PIN, không tải hoặc xem lại CSV trong ứng dụng, và không nhận danh sách lớp khác.
- **Học sinh:** đăng nhập bằng mã riêng và PIN riêng, không cần email; xem khóa hiện tại và mọi bài đã xuất bản; làm quiz, nộp thực hành, xem điểm/nhận xét và tiến độ; có thể tự đổi PIN.
- Admin và giáo viên đăng nhập bằng email và mật khẩu; không mở đăng ký tự do. UI đăng nhập có “Quên mật khẩu” gửi liên kết đặt lại qua email đã đăng ký. Đội triển khai tạo Admin đầu tiên và gửi Owner liên kết đặt mật khẩu an toàn; không gửi mật khẩu qua chat. Chỉ Admin được cấp/cấp lại PIN học sinh.
- **TEST:** chỉ dùng tài khoản giả; có thể dùng PIN mẫu 123456 để thử giao diện. Không dùng PIN mẫu này cho tài khoản thật.
- **PROD:** mỗi học sinh có một PIN ngẫu nhiên riêng gồm 8 chữ số; không dùng PIN chung cho cả lớp. Chọn 8 chữ số để vẫn dễ đọc/phát trực tiếp ở lớp mà dài ít nhất 8 ký tự; Supabase không khuyến nghị mật khẩu ngắn hơn 8 ký tự và 8 chữ số ngẫu nhiên có khoảng 2^27 khả năng đoán. Đây là lựa chọn tiện dụng, không tự đủ an toàn nếu thiếu giới hạn thử sai. [Supabase: bảo vệ mật khẩu](https://supabase.com/docs/guides/auth/password-security)
- Dịch vụ Auth lưu mật khẩu dưới dạng hash có salt, không lưu PIN rõ trong bảng nghiệp vụ. CSV đăng nhập một lần chứa tên/mã học sinh và PIN để phát đúng người; chỉ Admin tải ngay lúc cấp PIN. Cấp lần đầu theo lớp chỉ tạo PIN cho học sinh chưa có PIN; cấp lại phải chọn đúng một học sinh và không đổi PIN của cả lớp. Phản hồi tải dùng no-store; ứng dụng không giữ PIN rõ trong database, tệp máy chủ, log, localStorage/IndexedDB của trình duyệt hoặc CSV tổng kết. PIN rõ chỉ tồn tại tạm thời khi cấp và tạo phản hồi tải; người nhận giữ CSV riêng để phát rồi xóa bản tải. Nếu mất tệp, Admin cấp PIN mới cho đúng học sinh thay vì xem lại PIN cũ.
- Mã học sinh được xử lý ở máy chủ để ánh xạ sang định danh Auth nội bộ khó đoán, không công khai hoặc suy ra trực tiếp từ mã học sinh. Tài liệu Supabase mô tả đăng nhập mật khẩu bằng email hoặc số điện thoại, nên cách dùng mã học sinh phải được thử nghiệm ở Mốc 2; chưa coi đó là tính năng đã có. [Supabase: đăng nhập bằng mật khẩu](https://supabase.com/docs/guides/auth/passwords)
- Học sinh có thể đổi PIN tùy chọn; PIN mới vẫn gồm 8 chữ số, không chấp nhận dãy quá dễ đoán. Admin cấp lại PIN ngẫu nhiên mới cho riêng học sinh được chọn; PIN cũ hết hiệu lực. Mọi lần nhập sai đều trả thông báo chung, không tiết lộ mã có tồn tại hay không.
- Chống đoán PIN phải được kiểm tra ở phần xử lý máy chủ theo cả tài khoản học sinh và địa chỉ mạng đáng tin cậy: tăng thời gian chờ/tạm hạn chế khi thử sai, tránh khóa vĩnh viễn để kẻ khác không thể dễ dàng khóa hộ tài khoản. Không chỉ dựa vào giới hạn mặc định của Supabase, vì giới hạn token hiện được tính theo IP chứ không theo từng học sinh; nếu nhiều học sinh cùng đi qua máy chủ hoặc mạng trường, phải thử tải và cấu hình luồng phù hợp trước PROD. [Supabase: giới hạn đăng nhập](https://supabase.com/docs/guides/auth/rate-limits)
- Học sinh chỉ đọc/sửa dữ liệu của mình; giáo viên chỉ truy cập lớp được giao; Admin có quyền quản lý. Kiểm tra quyền ở máy chủ và chính sách dữ liệu, không chỉ ẩn nút.
- Admin có thể lưu trữ/khôi phục riêng học sinh hoặc lớp để khóa quyền truy cập, kể cả phiên cũ. Đây không phải cách lưu kết quả khóa cũ: kết quả/tệp của lớp-khóa đã kết thúc vẫn bị xóa theo Mục 6. Đồng bộ không tự mở lại tài khoản/lớp bị Admin khóa.
- Nhật ký chỉ ghi mã tác vụ, thời gian, trạng thái và số lượng. Không ghi PIN, tên, mã học sinh, nội dung bài nộp, cookie hoặc token.

## 3. Quy tắc khóa, bài học và nộp bài

### Nội dung và tiến độ

- Admin là người duy nhất tạo/sửa/xuất bản. Mỗi khóa có đúng 14 vị trí cố định, Buổi 1–14; không thêm, xóa hoặc đổi thứ tự vị trí làm lệch số buổi. Admin sửa nội dung trong từng vị trí và đặt trạng thái Nháp/Đã xuất bản riêng cho từng buổi.
- Mỗi bài có mô tả ngắn, tài liệu và liên kết video. Không tải video lên ứng dụng.
- Mỗi bài đã xuất bản phải có quiz, thực hành hoặc cả hai; không xuất bản bài chỉ có lý thuyết.
- Học sinh được mở mọi bài đã xuất bản, không phải hoàn thành bài trước.
- Tiến độ luôn hiển thị “Đã hoàn thành X/14 buổi”; nếu có phần trăm thì tính (X/14) × 100%, kể cả khi một số buổi còn ở trạng thái Nháp/chưa xuất bản. Chỉ 14/14 mới là 100%. Bất kỳ đổi lớp nào, kể cả lớp dùng cùng khóa, giữ tài khoản học sinh nhưng Admin phải xem trước/xác nhận và tạo tiến độ mới ở lớp đích. Đợt học lưu danh sách ổn định mọi học sinh từng tham gia, mỗi em có một mã tham gia nội bộ duy nhất; danh sách gồm cả em đã chuyển lớp hoặc bị lưu trữ, không chỉ roster hiện tại. Kết quả cũ gắn với đợt lớp nguồn được giữ ẩn đến khi đợt đó đóng và được tổng kết/xóa theo Mục 6; không hiển thị lịch sử khóa cũ cho học sinh/giáo viên.
- Sửa quiz không tự xóa điểm cao nhất, kết quả đã đạt hoặc bài thực hành đã duyệt; lần làm tiếp theo dùng nội dung mới. Chỉ thao tác reset riêng có xác nhận của Admin mới đặt lại kết quả trong lúc khóa vẫn đang diễn ra.

### Quiz và thực hành

- Quiz có một đáp án đúng mỗi câu, câu hỏi có trọng số bằng nhau, đạt từ 70%, làm lại không giới hạn và giữ điểm cao nhất.
- Đáp án đúng chỉ nằm ở phần xử lý có kiểm soát; không gửi sẵn đáp án cho trang học sinh.
- Mỗi bài nộp thực hành là một liên kết hoặc một tệp, kèm ghi chú tùy chọn. Admin chọn chế độ cho từng bài: chỉ liên kết hoặc cho tải tệp.
- Mỗi tệp tối đa 2 MB; định dạng cho phép: ZIP, PDF, PNG, JPG/JPEG, WEBP, TXT, PY, JS, HTML, CSS, JSON, MD và SB3. Dự án game khác phải đóng gói ZIP.
- Tệp chỉ để xem/tải trong phạm vi được phép; ứng dụng không chạy mã trong tệp. Tệp lưu trong vùng riêng tư, có chính sách quyền đọc/tải.
- Học sinh được thay bài đang chờ chấm hoặc bị yêu cầu làm lại. Sau khi bài được duyệt Đạt, giáo viên phải mở lại quyền nộp; kết quả Đạt giữ đến khi học sinh nộp bản thay thế.
- Giáo viên chấm Đạt/Cần làm lại và nhận xét. Chỉ giữ kết quả và bài nộp hiện tại, không xây lịch sử từng lần nộp.
- Bài hoàn thành khi các phần có trong bài đều đạt: quiz từ 70% và thực hành được duyệt. Bài chỉ có một loại đánh giá thì chỉ cần đạt loại đó.

### Dung lượng tệp

- Mặc định dùng liên kết để hạn chế lưu trữ. Mỗi bài có thể bật tải tệp tối đa 2 MB nếu thật sự cần; người dùng vẫn có thể nộp liên kết khi tệp đã bị tạm khóa vì dung lượng.
- Theo hạn mức Supabase Free đang công bố tại ngày cập nhật, dung lượng Storage 1 GB áp dụng cộng gộp trong toàn tổ chức, không phải 1 GB riêng cho mỗi dự án. Vì vậy TEST và PROD trong cùng tổ chức có thể cùng dùng hạn mức đó. Cần kiểm tra mức dùng thực tế của tổ chức trước khi bật upload; không coi gói miễn phí là bảo đảm lâu dài. [Hạn mức và cách tính Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase)
- 200 học sinh × 14 bài × 1 MB đã khoảng 2.8 GB; × 2 MB khoảng 5.6 GB nếu mỗi học sinh tải một tệp cho từng bài. Đây là ước tính kịch bản tối đa, chưa phải mức dùng thực tế. Liên kết ngoài cũng có thể hết hạn hoặc bị chủ trang gỡ.
- Cảnh báo Admin khi dùng đạt khoảng 700 MB; ngăn bắt đầu lượt tải mới nếu dung lượng dự kiến sau upload vượt 800 MB hoặc ngưỡng thấp hơn do hạn mức còn lại yêu cầu. Mức ngưỡng thực tế có thể hạ sau khi đo. Việc kiểm tra và giữ chỗ dung lượng phải tính cả các lượt tải đồng thời; không chỉ kiểm tra sau khi tệp đã tải xong.

## 4. Các khu giao diện

Ứng dụng có bốn khu điều hướng chính, bên trong có các trang con. Không cần hoàn thiện toàn bộ giao diện giả rồi mới nối dữ liệu; xây và thử từng luồng hoàn chỉnh trên TEST. Mọi trang cần có trạng thái đang tải, không có dữ liệu, lỗi có thể thử lại, không đủ quyền, hết phiên, đang lưu và lưu thất bại. Thao tác có thể xóa dữ liệu phải có trang xem trước và xác nhận riêng.

| Khu | Trang và hành vi chính |
|---|---|
| **Đăng nhập / tài khoản chung** | Học sinh dùng mã + PIN riêng 8 chữ số; Admin/GV dùng email + mật khẩu; có Quên mật khẩu qua email; đổi PIN tùy chọn; báo lỗi dễ hiểu, đăng xuất. CSV PIN chỉ Admin tải một lần khi cấp/cấp lại rồi bàn giao riêng nếu cần. |
| **Học sinh** | Tổng quan khóa và tiến độ; danh sách bài theo thứ tự; trang nội dung bài và nộp liên kết/tệp; trang quiz và kết quả. Mọi bài đã xuất bản mở được. Báo rõ lớp chưa có khóa/bài hoặc tài khoản chưa hoạt động. |
| **Giáo viên** | Tổng quan lớp được giao và việc cần chấm; danh sách lớp/roster/tiến độ ở trang quản lý lớp dùng chung; hàng đợi bài nộp và khung xem/chấm bài. Không truy cập được lớp ngoài phân công. |
| **Admin** | Tổng quan; lớp và roster; hồ sơ học sinh; khóa 14 buổi và bài; giáo viên/phân công; đồng bộ Teaching; cấp PIN lần đầu cho học sinh chưa có PIN hoặc cấp lại riêng một học sinh; kết thúc khóa, CSV tổng kết, xem trước cảnh báo và xóa. Không có màn hình backup/restore toàn bộ khóa đã xóa. |

Các trang/đường dẫn chính trong v1:

| Mã | Trang | Trạng thái và thao tác cần có |
|---|---|---|
| UI-01 | /login | HS nhập mã + PIN 8 chữ số; Admin/GV nhập email + mật khẩu; có “Quên mật khẩu” để Admin/GV nhận liên kết đặt lại qua email; trạng thái sai thông tin, đang đăng nhập, mất kết nối, email hết hạn, tài khoản bị khóa/tạm chờ; thông báo chung không tiết lộ mã có tồn tại không. |
| UI-02 | /account | Hiện đúng vai trò; HS đổi PIN 8 chữ số tùy chọn; Admin/GV đổi mật khẩu tùy chọn; báo thành công/lỗi; đăng xuất. |
| UI-03 | /manage | Nội dung tổng quan theo vai trò; lớp và việc cần chấm; trạng thái tài khoản/lớp rỗng hoặc chưa được phân công. |
| UI-04 | /manage/classes | Danh sách lớp + lớp đang chọn + roster/tiến độ; Admin tạo/sửa/lưu trữ/khôi phục lớp, gán khóa/giáo viên; cấp PIN lần đầu chỉ cho HS chưa có PIN, hoặc chọn một HS để cấp lại riêng em đó rồi tự tải CSV một lần; drawer học sinh để sửa, chuyển lớp, reset hoặc lưu trữ/khôi phục; khu kết thúc khóa/CSV tổng kết/xóa nằm trong trang này. Admin có thể bàn giao CSV riêng cho GV lớp đó; GV không tải/xem lại trong ứng dụng. |
| UI-05 | /admin/courses | Danh sách khóa và curriculum đang chọn; tạo/sửa khóa đúng 14 vị trí cố định Buổi 1–14, không thêm/xóa/đảo vị trí làm lệch CSV; xem trạng thái nháp/đã xuất bản từng buổi; mở UI-06 để chỉnh nội dung một buổi. |
| UI-06 | /admin/lessons/[lessonId]/edit | Tạo/sửa nội dung của đúng vị trí Buổi 1–14, tài liệu, liên kết video, quiz, chế độ nộp thực hành; đặt Nháp/Đã xuất bản riêng; chặn xuất bản nếu thiếu quiz/practice; cảnh báo nội dung chưa lưu. |
| UI-07 | /admin/teachers | Kết nối tài khoản giáo viên đã được Admin tạo email/mật khẩu trong Supabase (xác nhận email sẵn), rồi phân công lớp. Không gửi thư mời; giáo viên vẫn có thể dùng Quên mật khẩu ở UI-01; không có tự đăng ký. |
| UI-08 | /admin/sync | Phân biệt dữ liệu giả TEST với nguồn Teaching; trạng thái lấy dữ liệu, xem trước chênh lệch, xác nhận áp dụng, hủy, dữ liệu không hợp lệ và lỗi cần đăng nhập lại. Không xóa bản ghi vì vắng mặt; đồng bộ không tự cấp PIN hoặc tạo/tải CSV đăng nhập. |
| UI-09 | /teacher/submissions | Hàng đợi + bài đang chọn; mở liên kết/tải tệp có quyền; nhận xét, Đạt/Cần làm lại, mở lại bài đã đạt; trạng thái rỗng/lỗi tải/lỗi lưu. |
| UI-10 | /student | Tổng quan khóa hiện tại và tiến độ; lớp chưa gán khóa hoặc tài khoản bị khóa hiển thị hướng xử lý. |
| UI-11 | /student/course | Danh sách bài đã xuất bản theo thứ tự và trạng thái quiz/thực hành; tất cả bài đều mở được. |
| UI-12 | /student/lessons/[lessonId] | Mô tả/tài liệu/video, trạng thái bài, nộp liên kết hoặc tệp theo chế độ bài; báo rõ vì sao chưa được thay bài. |
| UI-13 | /student/lessons/[lessonId]/quiz | Làm quiz, nộp, xem điểm lần này/điểm cao nhất/đạt hay chưa; làm lại không giới hạn; báo tải lại nếu quiz đổi giữa lượt làm. |

Nút điều hướng chỉ hiện theo vai trò nhưng mọi đường gọi dữ liệu vẫn phải kiểm tra quyền ở máy chủ. Thiết kế từng trang phù hợp desktop; bảng có thể lọc/tìm và phân trang. Không làm bảng dài đến mức che nút chính ở 1280×720.

## 5. Teaching MindX: bằng chứng, giả thuyết và luồng an toàn

### Điều đã quan sát trước đây

Trong một phiên Chrome đã đăng nhập, trang danh sách dùng yêu cầu XHR có đường dẫn dạng hocsinh.php?datatable=students; phản hồi quan sát có cấu trúc DataTables với các trường draw, recordsTotal, recordsFiltered, data. Một mẫu dòng có các trường id, student_name, class_code, status và class_status. Giao diện khi đó hiển thị 15 dòng mỗi trang. Đây là bằng chứng từ khảo sát trước, không phải xác nhận mới trong bản kế hoạch.

Đây là bằng chứng của một lượt khảo sát trước, không phải hợp đồng API được Teaching công bố. Nó chưa chứng minh rằng một yêu cầu length lớn sẽ trả đủ danh sách, id là mã học sinh bất biến khi chuyển lớp, hoặc các trạng thái/field không thay đổi.

### Việc phải xác thực trước khi cho phép áp dụng

- Kiểm tra cấu trúc dòng, bộ lọc mặc định, trạng thái lớp/học sinh và cách tính tổng số dòng trên chính phiên được Owner đăng nhập.
- Đọc phân trang đến hết tập dữ liệu theo length và recordsFiltered/recordsTotal thực nhận; không cố định 30 trang và không giả định start=0 với length=2000 trả toàn bộ dữ liệu.
- Giữ nguyên bộ lọc mặc định của nguồn. Với giao thức DataTables server-side, recordsTotal là số bản ghi trước lọc và recordsFiltered là số sau lọc; phải đối chiếu cả hai, draw, số dòng trong từng trang, trang cuối, và mã trùng/thiếu. [Giao thức server-side DataTables](https://datatables.net/manual/server-side)
- Nếu tổng số thay đổi giữa các trang, mất phiên, có trang lỗi, draw không khớp hoặc cấu trúc đổi thì đánh dấu lượt đọc không hợp lệ và không áp dụng một phần. Không gọi tên hoặc mã thật vào log.
- Chỉ dùng id làm khóa chống trùng sau khi xác nhận nó đại diện cùng một học sinh qua đổi lớp/khóa. Nếu không chắc hoặc id đổi, giữ hồ sơ hiện tại và đưa trường hợp vào đối chiếu thủ công; không tự ghép chỉ theo tên.
- Sau khi xác nhận mapping, lọc mã lớp chứa ROB không phân biệt hoa thường; chỉ nhận học sinh đang học trong lớp đang hoạt động. Mẫu status đang học/class_status Running phải được kiểm tra với các trạng thái thực tế khác trước khi chốt mapping. Trạng thái nghỉ/hết khóa rõ ràng đưa vào báo cáo chờ Admin; không tự xóa tài khoản hoặc điểm.
- Dòng không xuất hiện trong một lần đọc, kể cả khi đọc đủ trang, không tự trở thành lệnh xóa. Việc kết thúc khóa và xóa dữ liệu cũ là luồng riêng ở Mục 6.
- Việc đồng bộ có tính lặp lại an toàn: chạy lại cùng một snapshot không tạo học sinh/lớp trùng, không ghi đè mật khẩu, điểm hoặc nhận xét bằng trường nguồn không liên quan. Sau xác nhận, lớp/học sinh hợp lệ mới có thể được tạo; lớp mới chưa được gán khóa thì ở trạng thái chờ Admin.

### Không chuyển mật khẩu/cookie sang ứng dụng

Owner chỉ cần tự đăng nhập Teaching trực tiếp rồi bấm nút trên giao diện ứng dụng hoặc tiện ích cục bộ đã được kiểm tra. Đội triển khai xử lý phần kỹ thuật; không yêu cầu Owner mở F12, sao chép JSON/dữ liệu thô, chạy lệnh hoặc gửi mật khẩu/cookie cho ứng dụng. Ứng dụng không yêu cầu, lưu hoặc gửi mật khẩu/cookie Teaching lên máy chủ. Trình duyệt áp dụng quy tắc cùng nguồn và CORS, nên cách chuyển dữ liệu phải được kiểm chứng; nếu bị chặn thì dừng và báo, không tìm cách vượt chặn. Không nhúng cookie hoặc lưu phiên để chạy nền. [Quy tắc cùng nguồn của trình duyệt](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

Luồng theo mốc: tại Mốc 1, sau khi Owner đăng nhập trực tiếp, đội triển khai thử đọc Teaching ở chế độ chỉ đọc qua giao diện/tiện ích; dữ liệu gốc chỉ nằm tạm trong bộ nhớ trên máy, báo cáo chỉ có số tổng hợp và không lưu tên/mã học sinh thật vào TEST, tệp hoặc log. Tại Mốc 4, hoàn thiện UI-08 để đọc, kiểm tra toàn bộ phân trang và xem trước; dữ liệu thật vẫn chỉ là preview, TEST chỉ áp dụng fixture giả. Tại Mốc 6, chỉ sau khi Owner xem danh sách thay đổi và bấm xác nhận riêng mới áp dụng dữ liệu hợp lệ vào PROD. Nếu cách đọc không được trình duyệt/Teaching cho phép hoặc danh tính không rõ, dừng ở preview và báo lý do.

## 6. Kết thúc đợt 14 buổi, CSV và xóa vĩnh viễn dữ liệu cũ

Chỉ Admin được bắt đầu đóng đợt sau khi xác nhận lớp đã học đủ 14 buổi theo lịch; không suy ra điều này từ phần trăm học sinh hoàn thành. Mỗi khóa có đúng 14 vị trí Buổi 1–14. Không chạy tự động theo ngày hoặc lượt đồng bộ. Học sinh chưa nộp, chưa hoàn tất hoặc còn bài chờ chấm **không chặn** thao tác: ứng dụng hiện cảnh báo đỏ với số lượng và dữ liệu sẽ bị xóa; Admin vẫn có quyền xác nhận sau khi xem cảnh báo và tác động.

Chỉ chặn vì điều kiện an toàn kỹ thuật: người dùng không có quyền Admin; lớp, khóa, roster hoặc phạm vi dữ liệu không khớp; CSV không xuất được/không đọc kiểm tra được/sai số lượng; hoặc đang có việc ghi/xóa Storage còn chạy, lỗi hay chưa xác định trạng thái. Bài của học sinh đang chờ chấm là cảnh báo; một thao tác chấm hoặc tải lên còn chạy dở mới là việc kỹ thuật cần chờ ổn định.

1. **Xem trước:** hiển thị lớp, khóa, số học sinh từng tham gia đợt, số kết quả và số tệp thuộc đúng đợt. Tách cảnh báo đỏ về bài chưa nộp/chưa hoàn thành/chờ chấm khỏi lỗi kỹ thuật buộc phải dừng; ghi số lượng và tác động. Nếu Admin chưa xác nhận lớp đã dạy đủ 14 buổi theo lịch hoặc phạm vi dữ liệu không khớp, chưa cho bắt đầu.
2. **Xuất CSV tổng kết:** gồm toàn bộ học sinh từng tham gia đợt của lớp, kể cả em đã chuyển lớp, bị lưu trữ, chưa làm hoặc không có kết quả; mỗi em có đúng 14 dòng (Buổi 1–14), kèm trạng thái/ghi chú. Có mã tham gia nội bộ ổn định, mã/tên cần thiết, điểm cao nhất/trạng thái quiz, trạng thái thực hành/nhận xét và tiến độ. Kiểm tra số dòng bằng số học sinh duy nhất trong danh sách đợt × 14; không dựa riêng vào roster hiện tại. Không đưa PIN, tệp bài nộp, token, cookie, key hoặc dữ liệu thô Teaching vào CSV.
3. **Kiểm tra và xác nhận:** ứng dụng tự đọc lại CSV, kiểm tra tính toàn vẹn, đủ 14 buổi cho từng mã tham gia duy nhất và số dòng = số học sinh của đợt × 14; đối chiếu với danh sách đợt ổn định, gồm cả em đã chuyển/lưu trữ; xác nhận điểm, trạng thái và nhận xét trong CSV khớp dữ liệu của đợt. Owner chỉ cần kiểm tra đúng lớp/khóa, tải và mở CSV, rồi xác nhận. CSV chỉ Admin tải, không gửi tự động/ghi log. Nếu xuất, mở kiểm tra hoặc đối chiếu thất bại thì buộc dừng. CSV là báo cáo tổng kết, **không phải bản backup và không khôi phục được điểm, nhận xét hay tệp đã xóa**.
4. **Xóa không thể hoàn tác:** sau khi các kiểm tra kỹ thuật đạt và Admin xác nhận riêng với cảnh báo đỏ rõ ràng, xóa vĩnh viễn điểm quiz, nhận xét, tiến độ và metadata/tệp bài nộp của đúng lớp và khóa cũ. Giữ tài khoản/Auth học sinh, hồ sơ học sinh, lớp, phân công cần cho lớp và nội dung khóa dùng chung; không đụng dữ liệu lớp khác. Bài chưa làm, chưa đạt hoặc chờ chấm không ngăn Admin xác nhận.
5. **Mở khóa mới:** chỉ sau khi xóa được kiểm đếm thành công mới gán khóa mới và tạo tiến độ mới cho lớp. Không lưu lịch sử khóa cũ trong giao diện.

Tệp phải xóa bằng Storage API, không xóa metadata bằng SQL rồi để tệp mồ côi. Tài liệu Supabase nêu tệp đã xóa là không khôi phục được và mỗi yêu cầu remove có giới hạn 1.000 object; nếu lớp có nhiều tệp, chia lô và kiểm tra kết quả từng lô. [Xóa object bằng Storage API](https://supabase.com/docs/guides/storage/management/delete-objects)

Việc xóa Storage và các dòng cơ sở dữ liệu không phải một giao dịch nguyên tử. Đóng khóa phải ngăn ghi mới, lưu trạng thái tác vụ/phạm vi mục tiêu, xóa tệp theo lô rồi xóa kết quả; nếu lỗi, trạng thái là **chưa hoàn tất**, không chuyển khóa hoặc báo thành công cho đến khi kiểm đếm xong. Chỉ tiếp tục phần còn lại sau khi xác định được phần nào đã xóa và tác vụ đã ổn định. Không hứa khôi phục dữ liệu đã xóa. Trước PROD phải xác minh chính sách lưu bản sao hệ thống của nhà cung cấp và giải thích rằng ứng dụng xóa dữ liệu khỏi ứng dụng/Storage, nhưng không chứng minh mọi bản sao vận hành của nhà cung cấp bị xóa tức thì.

Không có full backup/restore trong luồng này. Mọi bảng kết quả và tệp cần xóa phải gắn chính xác với lớp/đợt học và mã tham gia nội bộ; không dựa vào tên, roster hiện tại hoặc xóa theo toàn khóa dùng chung.

## 7. Cấu trúc triển khai và dữ liệu

- Một ứng dụng web Next.js/Node.js dùng cùng code cho TEST và PROD. Địa chỉ web, khóa kết nối và cài đặt được tách theo môi trường; không chỉ đổi URL rồi mặc định an toàn.
- Deploy TEST lên môi trường staging sớm bằng dữ liệu giả. Sau pilot, so sánh chi phí, quy định dịch vụ, khả năng chạy tác vụ, đăng nhập, CORS/callback và tải dự kiến rồi mới chọn hosting PROD.
- Supabase TEST và PROD là hai project riêng. Không sao chép dữ liệu học sinh thật sang TEST. Kiểm tra hạn mức và mức sử dụng của toàn tổ chức trước khi bật Storage.
- Thay đổi cấu trúc database đi qua các migration SQL có phiên bản, chạy và kiểm tra ở TEST trước rồi mới áp dụng có kiểm soát ở PROD; không dùng một file schema.sql duy nhất để thay thế lịch sử thay đổi. [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- Các nhóm dữ liệu gồm tài khoản/vai trò và liên kết Auth; học sinh/giáo viên/lớp/phân công; khóa đúng 14 buổi/quiz; tiến độ X/14/kết quả hiện tại; bài thực hành hiện tại/nhận xét; mã nguồn sau khi xác thực; đợt học lớp với danh sách ổn định và mã tham gia nội bộ của mọi học sinh từng tham gia; tác vụ sync và đóng khóa. Không thêm lịch sử tất cả lần làm/nộp hoặc nhiều khóa cũ.
- Bật chính sách RLS (quy tắc giới hạn ai được đọc/sửa từng dòng) cho dữ liệu được mở qua API; có chính sách riêng cho tệp riêng tư. Không để service-role/secret key trong trình duyệt. Kiểm thử quyền bằng từng vai trò và yêu cầu trực tiếp, không chỉ qua màn hình. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- Theo dõi dung lượng dùng, tăng tải, lỗi truy cập và số liệu sync bằng số tổng hợp. Không lưu dữ liệu gốc của Teaching trong log.

## 8. Sáu mốc, checklist và điều kiện nghiệm thu

Tất cả ô bắt đầu để trống. Chỉ đánh dấu hoàn thành khi có bằng chứng từ đúng bản chạy; prototype HTML, mock và test dữ liệu giả không được tính là đồng bộ thật.

### Mốc 1 — Nền tảng web và staging sớm

- [x] Đọc lại source hiện có, giữ nguyên HTML thử và bản kế hoạch trước. **Kiểm tra:** hash HTML không đổi; có bản sao timestamped của kế hoạch trước khi sửa.
- [x] Spike Teaching chỉ đọc sau khi Owner tự đăng nhập và bấm nút trên giao diện/tiện ích cục bộ. **Kiểm tra:** Owner không mở F12, sao chép dữ liệu thô hoặc chạy lệnh; chỉ giữ báo cáo tổng hợp; không có tên/mã thật trong TEST, tệp hay log; lỗi kết nối thì dừng.
- [x] Tạo khung web với bốn khu Đăng nhập/Học sinh/Giáo viên/Admin và điều hướng theo vai trò. **Kiểm tra:** Owner mở được các luồng chính; mọi màn hình ghi rõ dữ liệu giả.
- [x] Dựng các trang chính UI-01 đến UI-13 theo bảng Mục 4, làm từng luồng có thể bấm và xem trạng thái. **Kiểm tra:** không yêu cầu xong toàn bộ mockup trước khi nối TEST; không có thao tác giả báo đã ghi dữ liệu thật.
- [x] Làm trạng thái tải, trống, lỗi/thử lại, hết phiên, không đủ quyền, đang lưu và lưu thất bại ở các luồng dữ liệu. **Kiểm tra:** dùng dữ liệu thiếu/lỗi giả, không hiện thành công giả.
- [x] Deploy bản staging sớm bằng dữ liệu giả; chọn nhà cung cấp tạm thời sau khi đọc giá/điều khoản và xác nhận không có phí chưa duyệt. **Kiểm tra:** Owner truy cập được qua web; chỉ có fixture; không index/công khai dữ liệu học sinh; secret không xuất hiện trong trình duyệt.
- [x] Kiểm tra giao diện desktop ở 1280×720, 1440×900 và 1920×1080. **Kiểm tra:** nút chính, bảng, drawer và hộp xác nhận không bị cắt.

**Nghiệm thu của Owner (Mốc 1)**

- [x] Mở được trang TEST và bấm qua các màn hình với nhãn “Dữ liệu giả”.
- [x] Đăng nhập Teaching trực tiếp, bấm nút thử đọc; báo cáo chỉ hiện số tổng hợp, không yêu cầu F12, sao chép JSON hoặc chạy lệnh.
- [x] Xác nhận chưa phát sinh phí và chưa ghi dữ liệu học sinh thật vào TEST.

### Mốc 2 — Supabase TEST, đăng nhập và phân quyền

- [x] Tạo/kết nối project Supabase TEST riêng sau khi xác nhận chi phí và tổ chức chứa project. **Kiểm tra:** không nhầm ref/key với PROD; TEST chỉ có fixture.
- [x] Thiết lập migration có phiên bản cho bảng, quyền, chỉ mục và chính sách. **Kiểm tra:** có thể dựng TEST từ các migration; thay đổi được rà soát trước khi đưa PROD.
- [x] Đội triển khai tạo Admin đầu tiên; Owner tự đặt mật khẩu qua liên kết email. Làm đăng nhập Admin/GV bằng email và HS bằng mã + PIN; có Quên mật khẩu cho Admin/GV. Dữ liệu thử chỉ dùng fixture; PIN mẫu 123456 chỉ có trong TEST. **Kiểm tra:** đặt lại qua email, đúng/sai, đăng xuất, hết phiên; không gửi mật khẩu qua chat, không có đăng ký tự do hoặc PIN chung trên tài khoản thật.
- [x] Thử ánh xạ mã học sinh ở máy chủ sang định danh Auth nội bộ khó đoán, không lộ trong trình duyệt. **Kiểm tra:** xác minh cách đăng nhập mã + PIN với Supabase Auth; gọi trực tiếp các đường đăng nhập không bỏ qua quyền hoặc giới hạn thử sai. Nếu cách này chưa an toàn/chưa hoạt động, chưa mở PROD.
- [x] Cấp PIN giả lần đầu chỉ cho học sinh chưa có PIN; thử cấp lại bằng cách chọn đúng một học sinh. Chỉ Admin tải CSV một lần rồi tự bàn giao riêng cho GV nếu cần. **Kiểm tra:** PIN giả 8 chữ số ngẫu nhiên; cấp lại không đổi PIN học sinh khác; PIN rõ chỉ xuất hiện tạm thời trong phản hồi tải no-store của Admin, không vào database ứng dụng, log, tệp tạm hoặc CSV tổng kết; mất CSV thì Admin cấp PIN mới cho đúng học sinh.
- [x] Kiểm tra quyền cấp/tải CSV đăng nhập: chỉ Admin được cấp PIN; cấp lần đầu chỉ cho người chưa có PIN, cấp lại chỉ đúng một học sinh. **Kiểm tra:** GV không tải/xem lại trong ứng dụng; học sinh và người không có quyền không lấy được PIN qua giao diện hay gọi trực tiếp.
- [x] Chống thử sai PIN tại máy chủ theo tài khoản và IP đáng tin cậy, báo lỗi chung, có chờ/tạm hạn chế nhưng không khóa vĩnh viễn chỉ vì người khác nhập sai. **Kiểm tra:** thử nhiều lần qua giao diện và gọi trực tiếp; không thể bỏ qua giới hạn, không lộ mã tồn tại; đo kịch bản 200 học sinh đăng nhập để phát hiện giới hạn Auth theo IP dùng chung trước PROD.
- [x] Làm hồ sơ vai trò, kết nối tài khoản giáo viên đã tạo trực tiếp trong Supabase (không thư mời), phân công lớp, lưu trữ/khôi phục lớp và HS, và reset PIN HS bởi Admin. **Kiểm tra:** lưu trữ chặn login mới lẫn JWT cũ; chỉ Admin khôi phục/cấp lại; GV/HS không tự nâng quyền; PIN không bị ghi vào dữ liệu nghiệp vụ hoặc log. Bằng chứng và phạm vi rà soát ngày 18/10/2026: [M2_REVIEW.md](docs/M2_REVIEW.md).
- [x] Bật và kiểm tra RLS trên mọi bảng API và bucket riêng tư. **Kiểm tra:** HS A không đọc/sửa HS B; GV ngoài lớp không đọc; yêu cầu gọi trực tiếp cũng bị từ chối; Admin có quyền cần thiết.

**Nghiệm thu của Owner (Mốc 2)**

- [x] Đặt mật khẩu Admin qua email và đăng nhập được; thử liên kết Quên mật khẩu.
- [x] Cấp PIN lần đầu cho các học sinh giả chưa có PIN và tải CSV một lần.
- [x] Xem thử tài khoản học sinh giả và cấp lại PIN cho một em mà không đổi PIN của lớp.
- [x] Thấy rõ TEST chỉ có tài khoản/lớp giả.

### Mốc 3 — Học, quiz và thực hành trên TEST

- [x] Admin tạo/sửa khóa dùng chung với đúng 14 vị trí cố định Buổi 1–14 và gán cho lớp. **Kiểm tra:** không thêm/xóa/đổi thứ tự làm lệch số buổi; nhiều lớp dùng chung được; lớp chưa gán có thông báo.
- [x] Làm soạn bài và xuất bản; mỗi bài có quiz/thực hành. **Kiểm tra:** bài chỉ lý thuyết không xuất bản; bài nháp chưa hiện với HS.
- [x] Làm quiz chấm điểm, ngưỡng 70%, làm lại và giữ điểm cao nhất. **Kiểm tra:** dưới/đúng/trên 70%, lần sau thấp hơn, sửa quiz giữ kết quả đã đạt.
- [x] Làm nộp link và chế độ tệp tối đa 2 MB; tệp riêng tư. **Kiểm tra:** loại đúng/sai, quá cỡ, link; chỉ đúng HS/GV được tải.
- [x] Làm GV chấm Đạt/Cần làm lại, nhận xét, mở lại bài đã đạt; HS thay bài đúng thời điểm. **Kiểm tra:** người ngoài lớp không chấm; bài đã duyệt không bị đổi âm thầm.
- [x] Tính tiến độ và hoàn thành bài. **Kiểm tra:** luôn hiện “Đã hoàn thành X/14 buổi”; phần trăm nếu có = (X/14) × 100% dù còn buổi nháp; chỉ 14/14 là 100%; bài chỉ quiz, chỉ thực hành, cả hai; kết quả đạt không tự mất.
- [x] Chạy luồng Admin → HS → GV trên staging TEST và tải lại trang. **Kiểm tra:** dữ liệu lưu/nạp đúng, phân quyền không đổi; giao diện xử lý mạng lỗi. Bằng chứng và rà soát độc lập ngày 20/10/2026: [M3_EVIDENCE.md](docs/M3_EVIDENCE.md), [M3_REVIEW.md](docs/M3_REVIEW.md).

**Nghiệm thu của Owner (Mốc 3 — đạt theo ủy quyền của Owner ngày 20/10/2026)**

- [x] Mở được khóa mẫu đủ 14 buổi; trạng thái nháp/xuất bản từng buổi dễ nhận biết.
- [x] Thử quiz và thực hành trên dữ liệu giả, xem nhãn “Đã hoàn thành X/14 buổi”.
- [x] Thấy kết quả của học sinh giả sau khi giáo viên chấm.

### Mốc 4 — Hoàn thiện UI-08 Teaching và đồng bộ có xem trước

- [ ] Tạo bộ fixture Teaching giả theo cấu trúc DataTables đã quan sát. **Kiểm tra:** test đủ trang, trang cuối, trùng/thiếu mã, sai cấu trúc, mất phiên, tổng thay đổi; không sử dụng tên/mã thật.
- [ ] Hoàn thiện UI-08 dùng phiên Teaching do Owner đăng nhập trực tiếp; Owner chỉ bấm nút giao diện/tiện ích đã kiểm tra. **Kiểm tra:** không hỏi mật khẩu/cookie, không cần F12/JSON/lệnh; nếu CORS/CSP/quyền trình duyệt chặn thì dừng và báo, không vượt chặn.
- [ ] Xác nhận cấu trúc, trạng thái nguồn và dữ liệu mẫu đủ để đối chiếu qua phiên Owner đăng nhập trực tiếp. **Kiểm tra:** báo cáo preview chỉ hiển thị tổng hợp; không lưu tên/mã học sinh thật hoặc payload vào TEST, tệp hay log.
- [ ] Đọc hết các trang theo tổng thực nhận ở Mốc 4 và kiểm tra tính nhất quán. **Kiểm tra:** recordsTotal/recordsFiltered, draw, số dòng mỗi trang và trang cuối khớp; thay đổi/mất phiên thì hủy toàn lượt, không áp dụng một phần.
- [ ] Kiểm chứng ý nghĩa id khi học sinh đổi lớp; thử nguồn giả cho cùng tên khác mã và đổi mã. **Kiểm tra:** không hợp nhất theo tên; ID chưa chắc thì dừng ở trạng thái cần Admin đối chiếu.
- [ ] Thử lọc mã lớp có ROB và trạng thái học sinh/lớp. **Kiểm tra:** mapping chỉ được chốt sau khi các trạng thái nguồn cần thiết có bằng chứng; trường không biết được đưa vào cần xem xét.
- [ ] Xem trước thêm/cập nhật trên fixture TEST, xác nhận rồi mới áp dụng fixture. **Kiểm tra:** chạy lại không trùng; trường không liên quan không ghi đè điểm/mật khẩu; dòng vắng mặt không xóa; hủy không làm thay đổi; đồng bộ không tự cấp PIN hoặc tạo/tải CSV, việc cấp PIN chỉ qua thao tác Admin riêng sau xác nhận.
- [ ] Không áp dụng roster Teaching thật ở Mốc 4; chỉ áp dụng fixture giả vào TEST. Việc áp dụng dữ liệu thật chờ Mốc 6. **Kiểm tra:** preview thật chỉ có số tổng hợp; không dữ liệu thật vào TEST; fixture chạy lại không tạo trùng.

**Nghiệm thu của Owner (Mốc 4)**

- [ ] Đăng nhập Teaching trực tiếp và bấm xem trước; nhìn thấy báo cáo tổng hợp.
- [ ] Xác nhận lỗi/mất phiên làm lượt đọc bị hủy, không áp dụng một phần.
- [ ] Thấy dữ liệu giả được đối chiếu trên TEST; dữ liệu Teaching thật chưa ghi vào TEST.

### Mốc 5 — CSV tổng kết và xóa dữ liệu khóa cũ

- [ ] Tạo fixture lớp đã học đủ 14 bài/buổi, gồm HS đã xong, chưa nộp, chưa hoàn tất và bài chờ chấm; kèm điểm, nhận xét, tiến độ và tệp giả. **Kiểm tra:** tình trạng học sinh hiện cảnh báo đỏ kèm số lượng/tác động, nhưng tự nó không chặn Admin đóng khóa.
- [ ] Xuất CSV cho toàn bộ học sinh từng tham gia đợt, kể cả đã chuyển/lưu trữ hoặc chưa có bài làm; mỗi mã tham gia duy nhất có đúng 14 buổi. **Kiểm tra:** số dòng = số người trong danh sách đợt × 14; có trạng thái/ghi chú; điểm, trạng thái và nhận xét khớp dữ liệu fixture trên TEST; không lấy riêng roster hiện tại; không có PIN, cookie, token, key hay nội dung tệp; CSV không thể khôi phục dữ liệu.
- [ ] Hệ thống tự kiểm tra CSV và đối chiếu danh sách đợt ổn định; Admin tải/mở file, kiểm tra lớp/khóa rồi xác nhận. **Kiểm tra:** thiếu em đã chuyển/lưu trữ, sai số dòng, lỗi đọc hoặc lỗi toàn vẹn thì dừng; Owner không phải đếm thủ công từng dòng.
- [ ] Làm preview phạm vi lớp/khóa, kết quả/tệp sẽ xóa, cùng cảnh báo đỏ có số lượng và tác động. **Kiểm tra:** khi kỹ thuật an toàn, Admin vẫn có thể xác nhận dù còn bài chưa nộp/chưa hoàn tất/chờ chấm; hủy thì dữ liệu nguyên vẹn.
- [ ] Kiểm tra các điều kiện kỹ thuật chặn riêng: sai quyền, lớp/khóa/roster không khớp, lượt ghi hoặc xóa còn chạy/lỗi/chưa rõ trạng thái, CSV chưa qua kiểm tra. **Kiểm tra:** từng lỗi buộc dừng kể cả khi Admin muốn tiếp tục; trạng thái lỗi giải thích cách xử lý.
- [ ] Xóa tệp riêng tư qua Storage API theo lô tối đa 1.000 object mỗi yêu cầu; xóa dòng quiz/nhận xét/tiến độ/bài nộp đúng lớp-khóa. **Kiểm tra:** không xóa metadata bằng SQL đơn lẻ; kiểm đếm đúng phạm vi và còn 0.
- [ ] Thử lỗi giữa các lô Storage và giữa xóa tệp/xóa dòng. **Kiểm tra:** tác vụ báo chưa hoàn tất, giữ phạm vi/trạng thái để tiếp tục an toàn; không chuyển khóa cho đến khi thao tác ổn định và kiểm đếm xong.
- [ ] Sau khi xóa đủ, gán khóa mới và tạo tiến độ mới cho lớp. **Kiểm tra:** Auth/tài khoản học sinh, lớp và nội dung khóa chung còn nguyên; điểm/nhận xét/tiến độ/tệp của khóa cũ không còn trong ứng dụng và CSV không được coi là bản khôi phục.
- [ ] Thử tải nhiều tệp đồng thời; cảnh báo ở khoảng 700 MB và chặn trước khi vượt 800 MB hoặc ngưỡng thấp hơn. **Kiểm tra:** cổng upload tính cả lượt đang tải; link vẫn hoạt động; số dung lượng TEST/PROD được đối chiếu với toàn tổ chức.

**Nghiệm thu của Owner (Mốc 5)**

- [ ] Xem đúng lớp/khóa và cảnh báo đỏ về số bài còn thiếu/chờ chấm.
- [ ] Tải/mở CSV, xác nhận lớp/khóa và bảng kiểm tra đủ 14 buổi.
- [ ] Thử đóng một đợt giả trên TEST; xác nhận xóa chỉ ảnh hưởng dữ liệu giả của lớp đó.

### Mốc 6 — Kiểm thử web 200 học sinh và mở PROD

- [ ] Đo thử trên staging với 200 tài khoản giả và mức đồng thời Owner dự kiến. **Kiểm tra:** login, mở bài, quiz, nộp link/tệp, chấm và phân quyền không lỗi ở mức tải đã ghi rõ; không gọi là 200 kết nối đồng thời nếu chưa thử.
- [ ] Rà bảo mật quyền, đăng nhập HS bằng mã + PIN 8 số, secret, log, phiên cũ, upload và tệp private. **Kiểm tra:** PIN riêng không bị lộ; chống đoán theo tài khoản/IP không bị bỏ qua qua đường gọi trực tiếp; không có dữ liệu giả vượt quyền hoặc khóa server trong mã frontend.
- [ ] Đánh giá hosting PROD sau pilot online; ghi rõ giá, giới hạn và hành vi khi hết quota. **Kiểm tra:** Owner duyệt chi phí/điều khoản; có đường dừng hoặc chặn upload khi ngưỡng đạt.
- [ ] Tạo hoặc kết nối Supabase PROD riêng và áp dụng migrations đã kiểm tra ở TEST. **Kiểm tra:** xác minh project, chính sách RLS, bucket riêng tư, URL/callback; không copy DB TEST chứa dữ liệu giả vào PROD.
- [ ] Kiểm tra retention/snapshot của nhà cung cấp trước khi hứa xóa vĩnh viễn. **Kiểm tra:** Owner hiểu phần ứng dụng/Storage xóa được và phần bản sao vận hành nhà cung cấp có thể tuân theo thời hạn riêng.
- [ ] Chạy lượt Teaching thật cuối với Owner đăng nhập trực tiếp; kiểm tra số trang/tổng bản ghi và báo cáo trước khi áp dụng. **Kiểm tra:** không lưu cookie/mật khẩu; apply chỉ sau khi Owner xem thay đổi và xác nhận riêng.
- [ ] Chỉ mở sync/apply và cấp tài khoản thật sau phê duyệt của Owner. **Kiểm tra:** danh sách thay đổi được xem trước, không tạo trùng, không xóa vì vắng mặt; PROD cấp PIN ngẫu nhiên riêng 8 chữ số bằng CSV một lần, quyền phát đúng lớp và chống thử sai đã được kiểm chứng; không dùng PIN chung 123456.
- [ ] Bàn giao hướng dẫn ngắn theo ba vai trò Admin/GV/HS, phân phát CSV PIN nhạy cảm, kiểm tra CSV tổng kết và cảnh báo xóa. **Kiểm tra:** Owner tự đi qua luồng chính; chưa đạt mục nào ghi rõ; không gọi mock/TEST là nghiệm thu PROD.

**Nghiệm thu của Owner (Mốc 6)**

- [ ] Xem báo cáo thử tải 200 tài khoản giả và chi phí/giới hạn trước khi dùng thật.
- [ ] Xem preview Teaching cuối, số thay đổi và cảnh báo trước mọi lần áp dụng.
- [ ] Chỉ xác nhận mở PROD/áp dụng dữ liệu thật sau khi đã xem và đồng ý từng phạm vi.

## 9. Tiêu chuẩn hoàn thành

V1 chỉ được xem là sẵn sàng khi các luồng học tập chạy trên web staging với dữ liệu giả, quyền đọc/sửa và Storage vượt kiểm tra, việc đóng khóa được thử bằng fixture với CSV + xóa có kiểm đếm, tải thực tế được đo, và cách lấy dữ liệu Teaching không truyền mật khẩu/cookie đã được xác minh. Áp dụng lên học sinh thật và vận hành PROD chỉ bắt đầu sau cổng Mốc 6 và xác nhận của Owner.

Nếu giao tiếp với Teaching hoặc giới hạn hosting/Storage chưa được xác minh, phần đó ghi **chưa đạt/chưa kiểm chứng**; tiếp tục phần TEST được phép nhưng không tuyên bố đã đồng bộ thật.

**Tài liệu kỹ thuật dùng để đối chiếu khi triển khai:** [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage quyền truy cập](https://supabase.com/docs/guides/storage/security/access-control), [DataTables server-side](https://datatables.net/manual/server-side), [quy tắc cùng nguồn](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
