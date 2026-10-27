# Bằng chứng Mốc 4

Cập nhật: 20/10/2026. Trạng thái: **Mốc 4 đã nghiệm thu theo ủy quyền của Owner ngày 20/10/2026** (kết quả hosted trên Vercel Preview TEST ở mục “Nghiệm thu hosted theo ủy quyền của Owner” bên dưới).

## Trạng thái hiện tại

| Hạng mục | Kết quả đã xác nhận | Giới hạn |
|---|---|---|
| Supabase TEST: eythjapspkoyqdxlxtcd | Migration M4 và RPC/ACL đã xác minh. Edge m2-backend đang ACTIVE v6, verifyJwt=false; hai tệp Edge đọc lại khớp SHA-256. Thử dữ liệu giả lập: lần đầu tạo 1 lớp, thêm 2 học sinh, không cập nhật; chạy lại giống hệt không tạo/thêm/cập nhật gì; reset thành công. Sau reset: 35 lớp, 1.055 học sinh, 1.083 hồ sơ; 1 tệp lưu trữ, hàng chờ dọn tệp 0, hồ sơ thiếu/liên kết mồ côi 0, cờ M4 0, fixture M4 còn 0. | Máy chủ ghi phiên bản migration 20261020120901, tên m4_teaching_sync, trong khi tên tệp cục bộ mang phiên bản 20261020140000. MCP tự tạo mốc thời gian; lịch sử máy chủ được giữ nguyên và không viết lại. RPC stale thực sự trả P0001 STALE_PREVIEW_CONFLICT; mã Edge ánh xạ sang HTTP 409, nhưng chưa gọi HTTP thật để xác minh 409. Không thể so sánh digest toàn bộ dữ liệu vì công thức tạo digest trước chạy không được lưu; chỉ xác nhận số tổng và không còn fixture. |
| Vercel TEST | Tạo Preview mới: dpl_FsSFdbDD3uqr5rKNHCVMTg8RzazX, trạng thái READY. URL: https://mindx-learn-test-4jp7te0tj-quangctm07-5456s-projects.vercel.app. API trả target=null vì trường target được bỏ qua để tạo Preview; không gắn alias. | Kiểm tra GET chưa đăng nhập: /login 200 HTML, /api/m2/session 200 JSON, /admin/sync 200 HTML. Đây chỉ là kiểm tra trang/API có phản hồi, không phải chạy luồng sản phẩm đã đăng nhập hay Owner nghiệm thu. |
| Alias tên miền TEST | mindx-learn-test.vercel.app vẫn trỏ bản Mốc 3 dpl_H3yNw1AouwxegXyzj18tnx7HA8uN; thời điểm cập nhật alias là 20/10/2026 04:16:00 UTC và giống nhau trước/sau khi tạo Preview M4. Tài liệu Mốc 3 ghi alias được gắn sau khi Owner chốt Mốc 3. | Alias hiện vẫn phục vụ bản Mốc 3; không tự chuyển sang Mốc 4. Receipt tiền kiểm cũ nói target production là lịch sử; chỉ thị hiện hành là Preview riêng, không đổi alias. |
| Mã nguồn, build và kiểm tra tự động | Nhánh codex/moc-4, HEAD 5f727e282ecc495413b50c76d064b1c3492fd5f2. Build cục bộ đạt; 176/176 bài kiểm tra đạt. Gói upload khóa theo manifest 48 tệp, 1.044.998 byte, SHA-256 7e304434290564652e1f8a5dd7663ebff14ca04d67bbf14b4ab15873af8ecf75. | Worktree còn thay đổi chưa commit; không commit hoặc reset. Cây tệp Vercel đánh dấu truncated=true: chỉ trả 28 mục nhìn thấy và cả 28 mã SHA-1 khớp gói upload. API không cung cấp tùy chọn xem trang/thư mục, nên không tuyên bố đã đọc lại đủ 48/48 tệp từ máy chủ; yêu cầu tạo deployment đã gửi đủ 48 descriptor SHA-1/kích thước và cả 48 lượt upload không báo lỗi. |

Tên biến cấu hình được kiểm tra theo tên; so sánh trong bộ nhớ xác nhận URL Supabase TEST và domain TEST khớp ở Preview và Production của đúng project TEST. Không ghi hay lưu giá trị biến bí mật.

## Biên nhận

- [Biên nhận deployment Vercel Preview](../.workflow-local/m4/vercel-preview-deploy-receipt-20261020.json) ghi project, deployment ID/URL, trạng thái, 48 descriptor, smoke check, alias không đổi và các giới hạn xác minh.
- [Danh sách descriptor đã upload](../.workflow-local/m4/vercel-upload-descriptors-20261020.json) và [manifest ảnh chụp nguồn](../.workflow-local/m4/vercel-preview-source-manifest-20261020.json) gắn deployment với các tệp đã khóa.
- Biên nhận Supabase: [migration](../.workflow-local/m4/supabase-migration-20261020.json), [Edge](../.workflow-local/m4/supabase-edge-20261020.json), [thử live](../.workflow-local/m4/supabase-live-test-20261020.json), [review độc lập](../.workflow-local/m4/review-supabase-independent-20261020.json).
- Tiền kiểm lịch sử được giữ tại [Vercel preflight](../.workflow-local/m4/vercel-preflight-blocked-20261020.json); receipt mới hơn và chỉ thị Owner đã chọn Preview riêng thay cho target lịch sử đó.

## Nguồn đã review

Nhánh và HEAD ở trên là nguồn được dùng để lập gói Preview; 5 hash review tập trung khớp nguồn hiện tại. [Receipt review nguồn](../.workflow-local/m4/source-review-receipt-20261020.json) và [sổ review M4](./M4_REVIEW_LEDGER.md) ghi Round 13 PASS, 28/28 điểm đã đóng và 176/176 kiểm tra. Đây là bằng chứng review nguồn, không thay thế kiểm tra luồng hosted có đăng nhập.

Các điểm ranh giới được giữ nguyên từ review: request sai cấu trúc có thể trở thành thao tác 0 thay đổi nhưng vẫn trả thành công; reset chưa thể hiện xóa tài khoản Auth. Chưa có kiểm tra hosted đủ để kết luận hai ranh giới này gây lỗi hoặc được chấp nhận.

## Nghiệm thu hosted theo ủy quyền của Owner (20/10/2026)

Owner ủy quyền trực tiếp nghiệm thu và chốt Mốc 4. Kiểm tra chạy trên Vercel Preview TEST (dpl_FsSFdbDD3uqr5rKNHCVMTg8RzazX) bằng tài khoản Admin giả lập; không ghi email, mật khẩu, cookie hay dữ liệu học sinh thật. Biên nhận sạch: [owner-delegated-acceptance-20261020.json](../.workflow-local/m4/owner-delegated-acceptance-20261020.json).

| Hạng mục | Kết quả |
|---|---|
| Đăng nhập Admin | `POST /api/m2/staff-login` HTTP 200, vai trò admin. |
| Xem trước tổng hợp chỉ đọc (cục bộ, fixture `teaching_mock.json`) | Đọc 3 trang, 35 dòng; 23 dòng ROB, 14 học sinh ROB đang học đủ điều kiện; không có tên/mã học sinh trong kết quả. |
| Hủy toàn lượt | Mất phiên: `SESSION_EXPIRED`; lệch tổng giữa các trang: `TOTAL_CHANGED_BETWEEN_PAGES`. Cả hai hủy toàn bộ, không áp dụng một phần. |
| Stale thực tế | Báo cáo thêm học sinh vào lớp chưa tồn tại: máy chủ trả **HTTP 409 `STALE_PREVIEW_CONFLICT`**; lớp/học sinh không đổi. |
| Apply #1 | HTTP 200: +8 học sinh, cập nhật 1, tạo 1 lớp (`ROB-K14-M4-04`); 6 dòng mơ hồ giữ ở trạng thái cần đối chiếu; không cấp PIN. |
| Apply #2 | HTTP 200 idempotent: 0 lớp, 0 thêm, 0 cập nhật. |
| Reset | HTTP 200; số lớp về đúng 35. |
| Tệp tham chiếu | `teachingmindx-sync-trial.html` SHA-256 giữ nguyên `A2E61907…EAACAA5`. |

**Giới hạn đã ghi nhận:** `GET /api/m2/bootstrap` chỉ trả tối đa 1000 học sinh do giới hạn 1000 dòng mặc định của PostgREST (không phân trang), nên số học sinh hiển thị qua bootstrap là 1000 trước và sau reset. Tổng bảng `public.students` là 1.055, đã xác nhận bằng SQL trực tiếp tại [supabase-live-test-20261020.json](../.workflow-local/m4/supabase-live-test-20261020.json). Vì vậy 1.055 không được kiểm chứng lại qua bootstrap; số lớp 35 được kiểm chứng qua bootstrap. Việc phân trang bootstrap nên xử lý ở gói việc riêng.

Stale được tạo bằng báo cáo thêm học sinh vào lớp chưa tồn tại (API không có trường `expectedBaseline`); lớp `ROB-K14-03` đã có sẵn trên TEST từ trước.

## Kết luận nghiệm thu

Mốc 4 **đạt theo ủy quyền của Owner ngày 20/10/2026**. Không áp dụng roster Teaching thật; chỉ fixture giả đã áp dụng và đã reset. Sổ review: [M4_REVIEW_LEDGER.md](./M4_REVIEW_LEDGER.md).

(Lịch sử trước nghiệm thu) Trước lượt kiểm tra hosted ở trên, Mốc 4 chưa được Owner nghiệm thu: thiếu kiểm tra luồng hosted có đăng nhập và HTTP 409 stale chưa gọi thực tế; hai điểm này đã được xử lý ở mục nghiệm thu hosted. Digest toàn bộ dữ liệu trước/sau vẫn không thể khẳng định bằng receipt hiện có.
