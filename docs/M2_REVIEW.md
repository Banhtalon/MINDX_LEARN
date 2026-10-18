# Rà soát độc lập Mốc 2 — cập nhật 18/10/2026

**Kết luận hiện tại:** Các tiêu chí kỹ thuật Mốc 2 trên TEST đạt 9/9 và nghiệm thu Owner đạt 4/4 theo hồ sơ hiện hành. Không mở PROD và không chuyển kết quả này thành xác nhận tải Mốc 6. Lượt hosted C13 vẫn `FAILED`: 199/200 đăng nhập và 199/200 xác minh phiên; nguyên nhân của một lỗi đăng nhập chưa rõ. C15 là lượt tập trung riêng, `PASS` 200/200, không retry. Không coi C15 là sửa hoặc thay kết quả C13.

Điều kiện UI Admin còn chờ ở lần rà trước đã được kiểm tra trực tiếp trên Chrome TEST tại 1280×720, 1440×900 và 1920×1080. Danh sách không tràn ngang và hiển thị đúng một lớp fixture tổng hợp. Modal trống có hai ô nhập rỗng, 25 lựa chọn chưa đánh dấu; Hủy đóng modal và không đổi route/lớp. Ở 1280×720, modal cao hơn vùng nhìn ban đầu và Hủy cần thao tác Tab/cuộn để vào màn hình; receipt xác nhận nút dùng được và Hủy không làm thay đổi dữ liệu. Đây là giới hạn trình bày cần giữ rõ, không che bằng ảnh crop.

Nguồn hiện tại được đối chiếu từ `scratch/m2-ui-viewport-20261018/hosted-source-receipt.json` và `scratch/m2-ui-viewport-20261018/viewport-receipt.json`: HEAD `8a6b6edd0dcaaf125581e880e4b1eeb7961c5a41`, bản sản phẩm trên alias TEST `https://mindx-learn-test.vercel.app` ở commit `7d17cbd0d99e02dbfa3355c532e4e1ffa752e331`, deployment `READY`, 42/42 tệp allowlist khớp và 0 hash mismatch. Bốn thay đổi từ commit sản phẩm là tài liệu. CUA chỉ xuất ảnh crop inline; không có tệp ảnh local được lưu hoặc tạo lại.

Các phần dưới đây ghi lại bằng chứng lịch sử và giữ phân biệt giữa thao tác Owner, kiểm tra theo ủy quyền và các lượt đo riêng. Tài liệu tổng hợp và kết quả runtime: [M2_EVIDENCE.md](M2_EVIDENCE.md), [M2_RUNTIME_RESULTS.json](M2_RUNTIME_RESULTS.json).

## Bằng chứng mới theo ủy quyền của Owner

Owner đã yêu cầu: “AI hãy tự làm hết, cấp quyền cho bạn”. AI kiểm tra trên lớp TEST riêng với hai học sinh giả mới; không đọc CSV Owner tải, không thu thập hay ghi PIN vào tệp/log, và không đụng đến hai học sinh mà Owner vừa cấp PIN.

- Cấp lần đầu trả HTTP 200, no-store, đúng hai hàng CSV với PIN khác nhau; cả hai học sinh đăng nhập và đọc lại phiên đúng danh tính.
- Cấp lại đúng một học sinh trả một hàng; PIN mới đăng nhập được, PIN cũ và phiên cũ bị từ chối; học sinh còn lại tiếp tục dùng PIN ban đầu.
- Trình duyệt Chrome đăng nhập bằng PIN mới cho thấy khu học sinh, nhãn TEST/dữ liệu giả, không có liên kết quản trị, và trạng thái chưa có khóa học. AI đã đăng xuất sau khi chụp bằng chứng.
- Rà soát cờ fixture qua phiên Admin QA có phạm vi đúng hai bảng `public.students` và `public.classes`; cả hai đều không có hàng `is_fixture` khác true. Trang học sinh hiển thị banner TEST. Một truy vấn rộng ban đầu không thành công và connector SQL từ chối quyền; kết luận chỉ dựa trên truy vấn REST hẹp đã xác minh, không khẳng định đã rà mọi bảng hoặc mọi hàng Auth.

Các receipt được lưu tại `.workflow-local/m2/delegated-pin-proof-20261015.json`, `.workflow-local/m2/delegated-student-browser-proof-20261015.json`, `.workflow-local/m2/delegated-fixture-audit-20261015.json`; ảnh màn hình là `.workflow-local/m2/screenshots/delegated-student-after-reissue-20261015.png`. Đây là AI kiểm tra theo ủy quyền, không ghi nhận Owner tự thao tác các bước này.

## Đối chiếu từng mục kỹ thuật trong PROJECT_PLAN.md

1. **Đạt — project TEST riêng và dữ liệu fixture.** Supabase ghi nhận tổ chức MindxTeach, gói Free và project TEST; ứng dụng Vercel dùng cấu hình TEST riêng. Kiểm tra mới xác nhận không có hàng học sinh/lớp không phải fixture trong hai bảng được rà. Chưa tạo PROD và không phát sinh nâng gói.
2. **Đạt — migration có phiên bản.** Project cloud ban đầu có 0 bảng public và lịch sử migration trống; ba migration đã được rà soát, áp dụng theo thứ tự để dựng schema, sửa lỗi chạy thật và sửa trạng thái fixture. Câu checklist yêu cầu có thể dựng TEST từ migration; bằng chứng dựng ban đầu từ project cloud rỗng đáp ứng câu chữ này. Chưa thực hiện lần dựng lại độc lập lần hai.
3. **Đạt — đăng nhập Admin/GV bằng email và HS bằng mã + PIN.** Owner xác nhận đặt mật khẩu qua email, Quên mật khẩu và đăng nhập Admin. Harness hosted còn đăng nhập tài khoản giáo viên QA qua BFF; phép thử cấp PIN chỉ ghi PASS 403 khi cookie giáo viên hợp lệ đã có. Đăng xuất, phiên, học sinh và callback lỗi cũng được thử. Đây là giáo viên QA giả; không thay cho mục Admin tạo/mời giáo viên, và không khẳng định có thư mời nhân viên thật.
4. **Đạt — mã học sinh được đổi ở máy chủ và gọi trực tiếp không vượt quyền.** PIN 8 chữ số thô bị Auth từ chối, mật khẩu HMAC qua máy chủ đăng nhập được; phiên BFF đã kiểm tra vòng lại và DTO không chứa dữ liệu nhạy cảm. Challenge dùng một lần bị từ chối khi phát lại; các thử nghiệm gọi trực tiếp bị giới hạn đúng.
5. **Đạt — cấp PIN lần đầu và cấp lại một người.** Receipt xác nhận CSV no-store, số hàng đúng, PIN chỉ giữ trong RAM; PIN mới hoạt động, PIN/phiên cũ bị thu hồi, người còn lại không đổi. Không lưu CSV/PIN trong bằng chứng.
6. **Đạt — quyền cấp và tải CSV.** Admin được phép; giáo viên, học sinh và người chưa đăng nhập bị từ chối khi gọi trực tiếp. Ảnh QA giáo viên trước đó cũng không có nút cấp PIN.
7. **Đạt — giới hạn thử sai và phép đo 200 học sinh của Mốc 2.** Kiểm tra tài khoản chặn từ lượt thứ 7; thử IP có 240 phản hồi từ chối rồi chặn lượt tiếp theo, header IP giả không vượt giới hạn; sau thời gian chờ đăng nhập hợp lệ lại được. Receipt C15 đo riêng 200 đăng nhập và 200 phiên thành công, không retry, đồng thời 4; đây là phép đo chẩn đoán yêu cầu ở Mốc 2, không phải 200 kết nối đồng thời hay cổng tải Mốc 6.
8. **Đạt — Admin kết nối giáo viên đã có và giữ phân công sau tải lại.** Owner đã bỏ yêu cầu thư mời; Admin tạo email/mật khẩu trực tiếp trong Supabase rồi kết nối hồ sơ giáo viên. API focused teacher-connection đạt 19/19 trên fixture giả; Owner xác nhận “Kết nối được, tải lại vẫn thấy giáo viên và lớp.” Lượt ngày 18/10 kiểm tra trang Admin ở ba kích thước desktop, modal để trống, bàn phím tới Hủy và không có thay đổi fixture khi hủy. Các luồng phân quyền, phân công, lưu trữ/khôi phục và reset PIN đã có bằng chứng riêng ở các mục trước; không tuyên bố SMTP hoặc thư mời đã chạy.
9. **Đạt — RLS và Storage trong ma trận đã thử.** Receipt kiểm tra trực tiếp các bảng API Mốc 2 và bucket riêng tư: học sinh không đọc/sửa hồ sơ học sinh khác, giáo viên ngoài lớp bị chặn, người không có quyền bị từ chối và Admin truy cập được. Supabase Advisor vẫn có cảnh báo helper `SECURITY DEFINER` và bảo vệ mật khẩu bị lộ chưa bật; kết quả không phải chứng nhận bảo mật toàn diện.

## Nghiệm thu Owner và các giới hạn còn lại

- **Email Quên mật khẩu và đăng nhập Admin — Owner xác nhận trực tiếp.** Owner nói đã nhập ổn, đặt mật khẩu và đăng nhập được.
- **Cấp PIN lần đầu/tải CSV cho hai học sinh giả — Owner xác nhận trực tiếp.** Không nhận CSV hay PIN trong chat.
- **Xem học sinh giả/cấp lại PIN — đạt theo ủy quyền.** Proof xác nhận đăng nhập học sinh trên trình duyệt, cấp lại đúng một em, PIN cũ bị từ chối và em còn lại không đổi.
- **Thấy rõ TEST chỉ có dữ liệu giả — đạt theo ủy quyền trong phạm vi đã rà.** Banner TEST hiện trên trình duyệt và hai bảng học sinh/lớp không có hàng không phải fixture. Đây không phải tuyên bố đã kiểm toán mọi bảng/database.

B17 đã qua kiểm tra focus bàn phím ở 1280/1440/1920px; Owner xác nhận luồng email/đăng nhập sau sửa. C15 focused đạt 200/200; tuy nhiên receipt full C13 vẫn `FAILED`: 199/200 login và phiên, 0 phản hồi 429, 1 lần login lỗi. Có một HTTP 500 trong log Edge nhưng chưa có dấu nối để xác định đó có phải lỗi đăng nhập hay không. C15 không tái hiện hoặc giải thích lỗi cũ; không được gọi lỗi đó là đã sửa. Thử tranh chấp trong receipt C13 vẫn `NOT_TESTED` dù có bằng chứng tranh chấp riêng A11.

Sau cập nhật này, checklist Mốc 2 được đánh dấu hoàn tất cho môi trường TEST. Kết luận không xóa lịch sử C13: lỗi đơn lẻ vẫn chưa rõ nguyên nhân, và C15 chỉ là lượt tập trung riêng đạt 200/200. Không tuyên bố SMTP hoạt động, không nói C13 đã sửa, không gọi đây là 200 kết nối đồng thời hoặc cổng tải Mốc 6; PROD vẫn chưa được cho phép.
