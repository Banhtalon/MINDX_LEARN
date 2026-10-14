# Prompt triển khai Mốc 1 — Sol 6.1 điều phối, Gemini làm, Luna Max duyệt

Hãy bắt đầu triển khai Mốc 1 của dự án trong thư mục:

`F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD`

Kho GitHub chính thức do Owner chỉ định: `https://github.com/Banhtalon/MINDX_LEARN.git`.

Đọc toàn bộ `PROJECT_PLAN.md` và hướng dẫn `AGENTS.md` áp dụng trước khi làm. `PROJECT_PLAN.md` là nguồn xác định phạm vi và checklist chính thức. Không coi prompt này là kế hoạch thay thế. Chỉ triển khai Mốc 1; không tự chuyển sang Mốc 2–6.

## 1. Phân vai bắt buộc

- **Điều phối: GPT-6.1 Sol (`gpt-6.1-sol`).** Đọc dự án, chia việc, chuẩn bị yêu cầu cho worker, gọi công cụ, kiểm tra tiến độ, quản lý bằng chứng, chuyển lỗi và báo cáo cho Owner. Sol được tạo tài liệu giao việc, kiểm tra chỉ đọc và thực hiện thao tác kết nối/triển khai cần thiết trong phạm vi Mốc 1. Sol không tự viết hoặc sửa mã ứng dụng thay worker và không tự tick hoàn thành.
- **Worker: Gemini 3.8 Flash High qua AGY CLI.** Dùng chính xác model `gemini-3.8-flash-high`, mức suy luận `high`. Worker viết/sửa mã, giao diện, công cụ đọc thử Teaching, cấu hình và kiểm tra cần thiết của Mốc 1. Worker không tick checklist và không tự kết luận đã được reviewer/Owner nghiệm thu.
- **Reviewer: GPT-6 Luna (`gpt-6-luna`), mức suy luận `max`.** Tạo subagent riêng chỉ làm review trong đợt triển khai này; không dùng lại phiên đã viết mã Mốc 1. Truyền rõ model và reasoning effort khi gọi công cụ; không chỉ ghi tên model trong lời nhắc. Nếu công cụ yêu cầu để chọn model riêng, tạo phiên không kế thừa toàn bộ hội thoại và gửi đầy đủ yêu cầu, đường dẫn, phạm vi cùng bằng chứng cho reviewer.
- **Chỉ Luna Max được tick các mục Mốc 1 trong `PROJECT_PLAN.md` sau khi xác minh đạt.** Luna được viết báo cáo review và cập nhật dấu checkbox/trạng thái bằng chứng; không sửa mã sản phẩm hoặc tự nới tiêu chí để làm cho bài kiểm tra đạt.
- Nếu không gọi được đúng model, hết quyền hoặc hết hạn mức, báo rõ vai trò đang thiếu và tiếp tục phần điều phối độc lập có thể làm. Không giả lập vai trò, không âm thầm đổi model, không để Sol/Luna thay Gemini viết mã. Các lựa chọn đổi người thực hiện phải do Owner quyết định.
- Không mở chat mới trong sidebar hoặc gửi tin nhắn ra ngoài. Dùng subagent cho Luna và tiến trình AGY CLI cho Gemini.

Owner không biết code. Mọi thao tác kỹ thuật có thể tự làm phải do đội triển khai thực hiện. Chỉ cần Owner khi đăng nhập, cấp quyền tài khoản, quyết định chi phí hoặc trực tiếp nghiệm thu. Không yêu cầu Owner mở Terminal, F12, chép JSON, gửi mật khẩu hay cookie.

## 2. Kiểm tra và gọi AGY CLI

Sol tự kiểm tra thư mục, `Get-Command agy`, `agy --version`, `agy --help` và `agy models`. Xác nhận catalog có `gemini-3.8-flash-high`; catalog có model chưa chứng minh một lượt worker đã chạy thành công.

Đã kiểm tra help và catalog trên máy ngày 14/10/2026: CLI có `--model`, `--effort`, `--mode`, `--print`, `--print-timeout`, `--output-format`; vẫn kiểm tra lại khi bắt đầu thực hiện.

Mỗi gói việc phải có phạm vi file, mục tiêu, tiêu chí kiểm tra và đầu ra cụ thể. Lưu gói việc dạng văn bản tại `.workflow-local/m1/worker-task.md`; nội dung chỉ có mã nguồn/yêu cầu và dữ liệu giả, không có thông tin học sinh thật hoặc bí mật.

Mẫu gọi PowerShell dành cho Sol, không yêu cầu Owner chạy:

```powershell
Set-Location -LiteralPath 'F:\MINDX_project test\PROJECT-8-LEARN-DASHBOARD'
$m1WorkerPrompt = Get-Content -LiteralPath '.workflow-local/m1/worker-task.md' -Raw
agy --model gemini-3.8-flash-high --effort high --mode accept-edits --print-timeout 15m --output-format json --print $m1WorkerPrompt
$m1WorkerExitCode = $LASTEXITCODE
```

Chỉ dùng mẫu trên nếu help tại lúc chạy vẫn hỗ trợ các tham số. Không dùng cờ bỏ qua toàn bộ quyền; không tự bịa lệnh đăng nhập AGY. Theo dõi tiến trình để vẫn cập nhật Owner, không khóa cuộc trò chuyện chờ hết 15 phút. Nếu CLI cần xác thực, mở đúng bước đăng nhập cho Owner và tiếp tục khi Owner hoàn tất.

Lưu bằng chứng gọi thực tế: thời gian, model/effort được yêu cầu, mã phiên nếu có, exit code, danh sách file thay đổi và kết quả kiểm tra. Ghi model thực tế nếu công cụ cung cấp; nếu không thì nói rõ chỉ có bằng chứng cấu hình yêu cầu, không lấy câu tự nhận tên model làm chứng cứ. Không ghi bí mật hoặc dữ liệu Teaching thô vào báo cáo. Nếu tiến trình hết giờ/lỗi, kiểm tra những thay đổi đã có trước khi giao tiếp để tránh sửa chồng hoặc tạo bản trùng.

## 3. Đầu việc Mốc 1

### A. Điểm bắt đầu và bảo toàn tài liệu

- Đọc cấu trúc dự án hiện tại, kiểm tra Git nếu có và mọi thay đổi chưa lưu/commit. Không giả định đã có ứng dụng chỉ vì có HTML thử nghiệm.
- Đối chiếu remote với `https://github.com/Banhtalon/MINDX_LEARN.git` và kiểm tra nội dung/nhánh hiện có trên GitHub bằng quyền truy cập được cấu hình. Nếu thư mục hiện tại chưa có Git, kiểm tra kho từ xa trước khi chọn cách kết nối; bảo toàn kế hoạch hiện tại và mã đã có trên GitHub. Không clone đè thư mục dự án, tự thay remote khác, force-push hoặc ghi đè lịch sử. Nếu GitHub cần đăng nhập, hướng dẫn Owner đăng nhập trực tiếp; không yêu cầu token trong chat.
- Sao lưu `PROJECT_PLAN.md` có ngày giờ trước khi bắt đầu thay đổi checklist; ghi hash của `teachingmindx-sync-trial.html` và giữ nguyên tệp đó.
- Khi chưa có Git, dùng bản sao lưu phù hợp cho những file sắp sửa; không reset, xóa hoặc ghi đè công việc khác. Nếu có người khác đang chỉnh, giải quyết phạm vi ghi file trước khi tiếp tục.

### B. Thử đọc Teaching sớm

- Làm thử khả năng đọc danh sách ở ngay Mốc 1. Đội triển khai chuẩn bị nút giao diện hoặc tiện ích cục bộ để Owner chỉ đăng nhập Teaching trực tiếp rồi bấm thử đọc.
- Chỉ đọc. Mật khẩu và cookie Teaching không đi qua máy chủ ứng dụng hoặc nội dung gửi cho worker/reviewer. Không chỉnh dữ liệu trên Teaching, không nhập học sinh thật vào TEST hay PROD.
- Dữ liệu đọc thật chỉ tồn tại tạm trong bộ nhớ trên máy; màn hình/báo cáo lưu lại chỉ có số tổng hợp và trạng thái. Không lưu tên/mã học sinh, payload gốc hoặc phiên đăng nhập trong log, ảnh chụp, tệp, kho dữ liệu hay đầu vào cho mô hình.
- Dùng dữ liệu giả để phát triển/kiểm tra lỗi cấu trúc, mất phiên và đọc thiếu. Với lượt thật, xác minh đường đọc và phản hồi qua phiên Owner đã đăng nhập, không suy luận rằng một mẫu cũ chứng minh kết nối mới đã đạt.
- Tôn trọng giới hạn của nguồn và trình duyệt. Nếu chưa có cách được phép đọc hoặc chưa có phiên đăng nhập, ghi rõ phần chưa đạt; không tìm cách vượt chặn. Tiếp tục phần giao diện và staging độc lập có thể làm.
- UI-08 đồng bộ hoàn chỉnh, đối chiếu đầy đủ và áp dụng dữ liệu thuộc các mốc sau. Mốc 1 phải chứng minh được thao tác đọc thử phù hợp cho Owner, không tự mở nút ghi dữ liệu thật.

### C. Khung web và giao diện UI-01 đến UI-13

- Dùng cấu trúc web trong kế hoạch. Worker tự kiểm tra công cụ, phiên bản và tài liệu liên quan; tạo nền tảng có thể phát triển tiếp thành sản phẩm, dùng chung thành phần giao diện hợp lý.
- Bám bảng UI ở Mục 4 và đầy đủ quy tắc đã chốt trong kế hoạch. Dựng các trang/luồng chính có thể bấm thử, dùng dữ liệu giả và luôn có nhãn “Dữ liệu giả”. Đây là giao diện để Owner duyệt, chưa phải giao diện cuối đã được chấp thuận.
- Trình bày tiếng Việt dễ hiểu, nền sáng và xanh dương chủ đạo; chữ/nút rõ, thao tác chính dễ tìm. Không hiển thị thuật ngữ kỹ thuật cho người dùng nếu không cần.
- Giữ bốn khu Đăng nhập, Học sinh, Giáo viên và Admin. Admin/Giáo viên dùng chung phần quản lý lớp theo vai trò; tránh làm hai bộ giao diện trùng nhau. Học sinh chọn buổi, xem nội dung, quiz và thực hành thuận tiện theo các đường dẫn đã định.
- Trong thiết kế phải thể hiện: Quên mật khẩu Admin/GV; hai chế độ cấp PIN; khung Buổi 1–14; nhãn “Đã hoàn thành X/14 buổi”; tổng kết có học sinh đã chuyển lớp; cảnh báo bài còn thiếu/chờ chấm khi đóng khóa.
- Các thao tác chưa có xử lý thật chỉ mô phỏng bằng dữ liệu giả, có thông báo đúng phạm vi. Không giả báo đã gửi email, ghi Supabase, đồng bộ thật hoặc xóa dữ liệu thật. Đăng nhập và phân quyền thật được triển khai ở Mốc 2.
- Có trạng thái đang tải, trống, lỗi/thử lại, hết phiên, thiếu quyền, đang lưu và lưu thất bại; làm đủ cho những luồng được dựng ở Mốc 1, không coi vài trang tĩnh là đã hoàn thành toàn bộ luồng.
- Không phải hoàn thiện toàn bộ thiết kế cuối trước khi nối dữ liệu ở mốc sau. Dùng cấu trúc và thành phần có thể tái sử dụng; Owner duyệt từng luồng hiển thị.

### D. Bản web TEST và kiểm tra giao diện

- Kiểm tra chạy cục bộ trước, sau đó chuẩn bị và đưa bản TEST lên địa chỉ web riêng theo Mốc 1. Sol chọn phương án phù hợp sau khi kiểm tra điều khoản và chi phí hiện hành.
- Có thể triển khai bản TEST chỉ chứa dữ liệu giả trong phạm vi yêu cầu này; chỉ cần Owner thao tác khi đăng nhập/cấp quyền nhà cung cấp hoặc duyệt phát sinh phí. Không tự đăng ký dịch vụ trả phí, không triển khai PROD.
- Kiểm tra cả bản cục bộ và bản đã đưa lên web bằng trình duyệt: điều hướng, tải lại đường dẫn, trạng thái lỗi, nút/hộp xác nhận, nhãn dữ liệu giả và tài nguyên tải được. Không tick staging chỉ vì build cục bộ thành công.
- Kiểm tra ba kích thước 1280×720, 1440×900 và 1920×1080. Nút chính, bảng, bảng phụ và hộp xác nhận phải đọc/bấm được, không bị cắt hoặc che. Lưu ảnh kiểm tra chỉ với dữ liệu giả.
- Chưa có quyền hosting thì giữ bản chạy cục bộ, ghi rõ việc cần Owner đăng nhập và để trống mục staging. Owner được mở bản xem thử bằng đường dẫn/công cụ giao diện; không phải chạy lệnh.

## 4. Quy trình giao việc và sửa lỗi

1. Sol đọc kế hoạch, đối chiếu điều kiện hiện có và gửi báo cáo mở đầu ngắn bằng tiếng Việt.
2. Sol chia gói việc nhỏ cho Gemini qua AGY CLI. Mỗi gói chỉ định rõ file/phạm vi; không để nhiều tiến trình cùng sửa một phần.
3. Gemini thực hiện, chạy kiểm tra phù hợp, báo file đổi và bằng chứng. Sol kiểm tra đầu ra/tiến trình thực tế rồi chuyển cho Luna Max.
4. Luna đọc file thay đổi, chạy lại các kiểm tra trọng yếu và xem giao diện thật. Không chỉ đọc bản tự báo cáo của Gemini.
5. Nếu có lỗi, Luna ghi vị trí, tác động và cách tái hiện. Sol giao Gemini sửa đúng lỗi; Luna kiểm tra lại bản mới. Không lấy kết quả duyệt bản cũ để áp cho file đã thay đổi.
6. Khi kỹ thuật đạt, Sol mở bản TEST để Owner thực hiện checklist giao diện. Mọi thao tác cần đăng nhập Teaching hoặc tài khoản hosting phải được trình bày cụ thể, từng bước ngắn.
7. Luna đối chiếu bằng chứng mới nhất và xác nhận của Owner rồi cập nhật checkbox theo quy tắc bên dưới. Sol báo kết quả cuối và dừng tại phạm vi Mốc 1.

Chủ động làm hết phần đã được cho phép; không hỏi lại về các quyết định kỹ thuật thông thường. Khi chờ đăng nhập/quyết định cần Owner, tiếp tục những phần độc lập. Nếu bế tắc vì cùng một lỗi bên ngoài, nêu rõ cần thay đổi gì để tiếp tục; không báo hoàn thành giả và không chạy vòng lặp tốn công vô ích.

## 5. Quyền tick checklist của Luna Max

- Giữ `PROJECT_PLAN.md` là checklist chính thức. Sol và Gemini không đổi `[ ]` thành `[x]`.
- Luna chỉ tick từng mục Mốc 1 khi đã kiểm chứng đầy đủ tiêu chí của chính mục đó, gắn với đúng bản mã và đúng bản web được kiểm tra. Một mục có nhiều điều kiện chỉ được tick khi tất cả điều kiện đều đạt.
- Với 3 mục “Nghiệm thu của Owner”, cần Owner đã thao tác hoặc xác nhận rõ kết quả trên đúng bản thử. Kiểm tra tự động của agent không thay thế việc Owner nghiệm thu. Owner nói đồng ý kế hoạch hoặc đồng ý bắt đầu không phải xác nhận đã dùng thử đạt.
- Thiếu đăng nhập Teaching thật, thiếu link staging hoặc chưa có phản hồi Owner: giữ trống những mục tương ứng và ghi rõ “Chờ Owner” hoặc “Chưa kiểm chứng”. Có thể tick các mục độc lập đã đạt; không tuyên bố toàn bộ Mốc 1 hoàn thành khi còn điều kiện bắt buộc chưa đạt.
- Luna chỉ chỉnh checkbox/trạng thái bằng chứng của Mốc 1; không sửa quy tắc sản phẩm, không tick Mốc 2–6. Nếu cần sửa phạm vi, báo Sol để Owner quyết định.
- Nếu mã nguồn thay đổi sau review, Luna phải đánh giá lại các mục bị ảnh hưởng; chưa đạt thì bỏ tick mục đó và ghi lý do. Thay đổi thuần checkbox/báo cáo không tự làm mất hiệu lực review mã nguồn.
- Chỉ kết luận “Mốc 1 hoàn thành” khi tất cả đầu việc kỹ thuật và nghiệm thu Owner của Mốc 1 đã đạt. Việc đó không đồng nghĩa dự án hoàn thành hoặc đã được phép mở PROD.

## 6. Bằng chứng và bàn giao

Giữ hồ sơ ngắn gọn, tránh tạo thêm nhiều bảng tiến độ cạnh tranh:

- `docs/M1_EVIDENCE.md`: Sol/Gemini ghi các gói việc, bằng chứng AGY được gọi, file thay đổi, lệnh/kết quả kiểm tra, địa chỉ local/TEST, ảnh giao diện giả và phần còn cần Owner. Ghi commit nếu có hoặc hash tập file đã kiểm tra, kèm định danh bản web nếu có. Không chứa bí mật/dữ liệu học sinh thật.
- `docs/M1_REVIEW.md`: Luna ghi model/effort được cấu hình, bản đã duyệt, kết quả từng tiêu chí Mốc 1, lỗi còn lại, mục nào được tick và bằng chứng Owner cho các mục nghiệm thu. Không báo PASS chung nếu còn tiêu chí bắt buộc chưa được kiểm tra.
- `PROJECT_PLAN.md`: Luna cập nhật dấu hoàn thành đúng mục; giữ nguyên nội dung kế hoạch và checklist các mốc khác.

Báo cáo cuối cho Owner bằng tiếng Việt, ngắn gọn:

**Đã làm:** các phần Mốc 1 đã thực hiện, đúng vai trò nào làm.

**Kết quả:** link xem thử; bao nhiêu mục được Luna xác nhận/tick; Mốc 1 đã hoàn thành hay còn phần nào.

**Chưa kiểm tra:** liệt kê đúng phần thiếu bằng chứng, không dùng câu chung chung.

**Việc tiếp theo:** thao tác cụ thể Owner cần bấm/đăng nhập nếu có. Không đưa Owner code, SQL hoặc lệnh Terminal để tự xử lý.

Bắt đầu bằng việc đọc `PROJECT_PLAN.md`, kiểm tra môi trường và chia gói đầu tiên cho Gemini. Đừng dừng ở việc nhắc lại kế hoạch.
