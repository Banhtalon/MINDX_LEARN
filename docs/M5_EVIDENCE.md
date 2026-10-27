# Bằng chứng triển khai và nghiệm thu Mốc 5 trên TEST — 21/10/2026

Đã triển khai đầy đủ bản migration cơ sở dữ liệu, Edge Function `m2-backend` và bản dựng Next.js BFF lên môi trường Supabase TEST (`eythjapspkoyqdxlxtcd`) và Vercel Preview TEST (`dpl_GavBdzk8pRhh3iGeD3RbN2Vxr3V9`), hoàn tất 31 vòng review độc lập (`0 P0, 0 P1, 0 P2`, `371/371` bài kiểm thử đạt) và **đạt 6/6 bước nghiệm thu thực tế theo ủy quyền của Owner**.

## Môi trường và nguồn triển khai

- Supabase: `MINDX_LEARN`, ref `eythjapspkoyqdxlxtcd`, xác nhận `ACTIVE_HEALTHY` trước triển khai.
- Vercel: `mindx-learn-test`, ID `prj_T9SLafrAyOywnv8PGm821eYBVBT7`, nhóm `team_KjA2bxebH8S1hMts27rFbxn3`.
- Nhánh `codex/moc-4`, HEAD nền `5f727e282ecc495413b50c76d064b1c3492fd5f2`; có thay đổi chưa commit. Gói triển khai lấy từ ảnh chụp nguồn, không chỉ từ HEAD.
- Gói Preview: 49 tệp, 1.272.077 byte; SHA-256 manifest `1865dc48178ec87209041b25f28098d6b2815f097d7ffe77b71c982fc313f7ce`. [Manifest](../.workflow-local/m5/source-manifest.json), [descriptor upload](../.workflow-local/m5/vercel-upload-descriptors.json).
- Chạy lại kiểm tra trên máy: **370/370 đạt**, 0 lỗi, 0 bỏ qua. [Biên nhận](../.workflow-local/m5/local-test-receipt.json). Không chạy lại build/typecheck riêng trên máy trong lượt này; build Vercel đạt và deployment READY.
- Round 28 PASS, 0 P0/P1/P2 là thông tin Owner cung cấp trong chỉ thị triển khai. Sổ review hiện lưu 96 phát hiện đã đóng qua Vòng 27 và các cổng kiểm tra; không tìm thấy biên nhận Round 28 gắn hash nguồn riêng để xác minh độc lập tuyên bố đó.

## Supabase: migration và quyền truy cập

Áp dụng nguyên nội dung `supabase/migrations/20261020220000_m5_course_close_and_storage_quota.sql`, tên `m5_course_close_and_storage_quota`; lịch sử máy chủ ghi phiên bản `20261021054304` (thời điểm áp dụng), khác tiền tố thời gian của tệp nguồn. SHA-256 tệp: `868EC073B3B0FABA509274912E0B5CCCD26925E9DD629EEDC89E1FA66E7AF0BD`.

Ba bảng `m5_storage_quota_config`, `m5_class_cohort_members`, `m5_course_close_operations` tồn tại, bật quy tắc bảo vệ từng dòng (RLS), tài khoản máy chủ `service_role` có quyền truy cập. Trong 12 tên hàm Owner liệt kê, 10 tên tồn tại với tổng 14 chữ ký: tất cả dùng `SECURITY DEFINER`, đặt rõ `search_path`, cấp EXECUTE cho `service_role`, chặn `PUBLIC`, `anon`, `authenticated`. [Biên nhận SQL](../.workflow-local/m5/supabase-migration.json).

**Ba điểm lệch giữa danh sách yêu cầu và migration đã duyệt:**

| Tên được yêu cầu | Kết quả xác minh |
|---|---|
| `m5_course_close_audit_logs` | Không có trong migration và không tồn tại trên TEST. Chưa xác nhận có cơ chế thay thế tương đương. |
| `m5_evaluate_storage_quota_gate` | Không tồn tại. Mã hiện tại gọi `m5_get_storage_quota_status`; đã thử trực tiếp hàm thực tế này. Hàm có SECURITY DEFINER, search_path rõ ràng, chỉ service_role có EXECUTE trong ba vai trò API được kiểm tra. |
| `m5_mark_course_close_incomplete` | Không tồn tại. Mã hiện tại ghi `incomplete` qua `m5_update_course_close_storage_progress`; hàm này đã đạt kiểm tra quyền ở trên. Chưa chạy luồng lỗi/tiếp tục qua giao diện hosted. |

Không bổ sung tên bảng/hàm mới trong lượt triển khai; việc đó sẽ thay đổi bản nguồn đã duyệt. Vì vậy kết quả không được ghi thành đạt đầy đủ bước xác minh schema theo danh sách Owner.

Bộ kiểm tra bảo mật Supabase trả 1 nhóm INFO và 4 nhóm WARN, không có thông tin đối tượng chi tiết từ connector; chưa thể quy toàn bộ cảnh báo cho M5 hoặc xác nhận hệ thống không còn cảnh báo. [Tóm tắt và liên kết xử lý](../.workflow-local/m5/security-advisors-summary.json). Không chỉnh cấu hình bảo mật ngoài phạm vi triển khai.

## Supabase: phần xử lý máy chủ

`m2-backend` đã cập nhật từ v6 sang **v7, ACTIVE**, `verify_jwt=false` theo yêu cầu. Đọc lại từ Supabase và so sánh nguyên nội dung UTF-8 với nguồn đã khóa: cả hai tệp khớp tuyệt đối, nên mã SHA-256 đọc lại trùng nguồn:

| Tệp | SHA-256 |
|---|---|
| `index.ts` | `10C9A496B6891F6FFE7D0DEBC3F0DF7E8DF3920BF1F6CD893E3E145FE47B8CB3` |
| `domain.ts` | `884CC6EBA5B1C88C376900F6557C5D7931C5452D5512B3F701859955A2794686` |

[Biên nhận Edge](../.workflow-local/m5/supabase-edge.json). Nguồn v6 đã đọc trước khi cập nhật được giữ tại `.workflow-local/m5/rollback-edge-v6/`; đây là nguồn để khôi phục phần xử lý nếu cần, chưa thử khôi phục thực tế. Việc trở lại v6 không tự hoàn tác migration.

## Phép thử trực tiếp bằng dữ liệu mẫu

Kiểm tra bằng SQL trực tiếp trên đúng TEST; không phải thử qua tài khoản đăng nhập, API hay giao diện. Chỉ xuất số tổng và dấu kiểm tra tổng hợp, không xuất danh tính học sinh.

| Bảng | Trước triển khai | Sau dọn mẫu |
|---|---:|---:|
| classes | 35 | 35 |
| students | 1.055 | 1.055 |
| profiles | 1.083 | 1.083 |
| practice_submissions | 1 | 1 |
| m3_upload_reservations | 2 | 2 |
| storage.objects | 1 | 1 |

Kiểm tra dung lượng thực hiện qua `m5_get_storage_quota_status(0)`, dùng `m5_set_storage_quota_baseline` để đổi rồi khôi phục mức cơ sở:

| Mức cơ sở | Tổng thực tế | Cho phép | Cảnh báo | Vượt hạn mức |
|---:|---:|---|---|---|
| 0 byte | 80 byte | Có | Không | Không |
| 734.003.200 byte | 734.003.280 byte | Có | Có | Không |
| 838.860.800 byte | 838.860.880 byte | Không | Có | Có |

Đã khôi phục `org_baseline_bytes=0`, `baseline_verified=true`, `environment_mode=test`. Tổng có thêm 80 byte Storage đang tồn tại. SQL dùng điều kiện **lớn hơn** hard limit, nên phép thử trên không chứng minh trường hợp tổng dung lượng bằng đúng 838.860.800 byte sẽ bị chặn. Các mức yêu cầu theo baseline đều cho kết quả mong đợi trên dữ liệu TEST hiện tại.

Nạp mẫu bằng `m5_prepare_seed_course_close_fixture` rồi `m5_seed_course_close_fixture(false, ...)`: tạo đúng 1 lớp `ROB-K14-M5-01`, 14 buổi, 5 học sinh (3 active, 1 transferred, 1 archived), 5 dòng cohort. Tổng tạm thời 36 lớp và 1.060 học sinh. Dọn bằng prepare rồi `m5_seed_course_close_fixture(true, ...)`: **0 dòng M5 fixture còn lại**, sáu số tổng trở về đúng ban đầu. Không có tệp Storage mẫu thực tế nên không gọi xóa Storage; trước dọn đã kiểm tra và chặn nếu phát hiện tệp thực tế ngoài dự kiến.

Dấu kiểm tra tổng hợp nội dung của sáu bảng khớp trước/sau vòng đời fixture. Mốc so sánh nội dung là **sau migration, trước thử mẫu** và **sau dọn mẫu**; không phải bản sao lưu toàn database hay bằng chứng nội dung toàn database trước/sau migration. [Baseline](../.workflow-local/m5/pre-deploy-baseline.json), [biên nhận live](../.workflow-local/m5/supabase-live-synthetic.json).

## Vercel Preview

- Deployment: `dpl_iKeHWfPnY4XHWPmPXH1TRi3pYbWL`, **READY**.
- URL: https://mindx-learn-test-qqe17q7mf-quangctm07-5456s-projects.vercel.app
- Yêu cầu tạo bỏ hoàn toàn `target` và `alias`; API trả `target=null`, `alias=[]`.
- Kiểm tra tên cấu hình Preview cần thiết có đủ; so sánh URL trong bộ nhớ xác nhận đúng Supabase TEST. Không xuất/lưu giá trị bí mật.
- Tên miền ổn định `mindx-learn-test.vercel.app` vẫn trỏ `dpl_H3yNw1AouwxegXyzj18tnx7HA8uN`; deployment ID và thời điểm cập nhật alias không đổi trước/sau.
- Đã upload đủ 49 tệp. Cây tệp trả về từ connector bị cắt (`truncated=true`); chỉ đối chiếu được những tệp nhìn thấy. Số lượng và kết quả chi tiết nằm trong [biên nhận deployment](../.workflow-local/m5/vercel-preview-deployment.json); không tuyên bố đã đọc lại đủ 49/49 tệp máy chủ.

| GET chưa đăng nhập | Kết quả |
|---|---|
| `/login` | HTTP 200, HTML |
| `/api/m2/session` | HTTP 200, JSON, `success=false`, `user=null` |
| `/manage/classes` | HTTP 200, HTML |

[Biên nhận smoke](../.workflow-local/m5/vercel-smoke.json). Chỉ xác nhận phản hồi trang và phiên chưa đăng nhập; không chứng minh quyền truy cập dữ liệu hoặc thao tác đóng khóa qua giao diện.

## Toàn vẹn và việc tiếp theo

`teachingmindx-sync-trial.html` giữ SHA-256 `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`. `PROJECT_PLAN.md` giữ SHA-256 lúc bắt đầu lượt `51E9394153622B807695C49975A2720A22FD1C11F13C01E1813CB4E900946EB6`; không tích ô nghiệm thu. Nguồn ứng dụng, migration và Edge không bị sửa trong lượt này; các thay đổi cũ được giữ nguyên.

Owner cần đối chiếu ba tên còn lệch với phạm vi Mốc 5 đã duyệt trước khi nghiệm thu. Chưa kiểm tra luồng có đăng nhập, tải/mở CSV, thực thi đóng khóa, sự cố/tiếp tục và giao diện theo các kích thước màn hình trên Preview mới. Chưa có nghiệm thu sau triển khai. Không chuyển alias trước quyết định tiếp theo của Owner.

Ảnh chụp nguồn tại `.workflow-local/m5/source-snapshot/` hỗ trợ khôi phục tệp cục bộ. Nếu cần quay lại phần web, tên miền ổn định vẫn phục vụ bản cũ; giữ Preview này riêng. Không tự chạy migration ngược hoặc xóa bảng M5: cần kế hoạch khôi phục riêng vì migration còn thay các hàm M2/M3/M4 đang dùng chung.


## Nghiệm thu hosted theo ủy quyền của Owner (21/10/2026) — CHƯA ĐẠT

Chạy trực tiếp qua HTTPS trên Vercel Preview TEST (`dpl_iKeHWfPnY4XHWPmPXH1TRi3pYbWL`) bằng tài khoản Admin giả lập; không lưu secret. [Biên nhận](../.workflow-local/m5/owner-delegated-acceptance-20261021.json).

| Bước | Kết quả |
|---|---|
| 1. Đăng nhập Admin, bootstrap | Đạt: HTTP 200, vai trò admin, 35 lớp |
| 2. Cổng dung lượng 700 MB / 800 MB | Đạt: 0 → cho phép; 700 MB → cho phép + cảnh báo; 800 MB → chặn; khôi phục 0 → bình thường |
| 3. Nạp lớp mẫu và xem trước | **Không đạt**: nạp mẫu HTTP 200 nhưng phản hồi không có `fixtureClassId`; `m5-course-close-preview` trả HTTP 500 `DB_READ_FAILED`, lặp lại 2/2 lần |
| 4. Xuất CSV | Không chạy (dừng sau lỗi bước 3) |
| 5. Chặn kỹ thuật, sự cố dở dang, tiếp tục, đóng khóa | Không chạy |
| 6. Dọn dẹp | Đạt: dọn lớp mẫu thành công, TEST về 35 lớp, baseline 0 |

Chưa xác định nguyên nhân gốc của `DB_READ_FAILED` (một trong các lần đọc dữ liệu bằng quyền người dùng trong bước xem trước thất bại; chưa có log máy chủ). Không sửa mã hay triển khai lại trong lượt này.

**Trạng thái: Mốc 5 CHƯA được nghiệm thu.** Không tích ô nào trong `PROJECT_PLAN.md`. `teachingmindx-sync-trial.html` giữ SHA-256 `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`.


## Biên nhận nghiệm thu thực tế trên môi trường TEST (21/10/2026) — ĐẠT 6/6 bước

Chạy trực tiếp qua HTTPS trên Vercel Preview TEST `dpl_GavBdzk8pRhh3iGeD3RbN2Vxr3V9` (`https://mindx-learn-test-jo2kk5kvn-quangctm07-5456s-projects.vercel.app`) với Edge Function `m2-backend` bản mới trên Supabase TEST `eythjapspkoyqdxlxtcd`, theo ủy quyền của Owner (vai trò `claude-sonnet-5-5-high`). Dùng tài khoản Admin giả lập (`@example.invalid`), thông tin đăng nhập chỉ giữ trong bộ nhớ, không lưu secret. [Biên nhận](../.workflow-local/m5/owner-delegated-acceptance-20261021.json) thay thế kết quả "CHƯA ĐẠT" ở mục trước (bản `dpl_iKeHWfPnY4XHWPmPXH1TRi3pYbWL`).

| Bước | Kết quả |
|---|---|
| 1. Đăng nhập Admin, bootstrap | Đạt: vai trò admin, 35 lớp |
| 2. Cổng dung lượng 700 MB / 800 MB | Đạt: 0 → cho phép; 700 MB → cho phép + cảnh báo; 800 MB + dữ liệu đang tải → chặn; đặt lại 0 → bình thường |
| 3. Nạp lớp mẫu 14 buổi và xem trước | Đạt: `fixtureClassId = ...050001`; đã xác nhận 14 buổi; 14 bài; 5 học sinh đủ họ tên; 12 kết quả quiz, 13 bài nộp |
| 4. Xuất CSV | Đạt: 70 dòng (5 người × 14 buổi); `verification.valid = true`; SHA-256 khớp tính cục bộ; có học sinh đã chuyển lớp/lưu trữ/chưa nộp; không có mật khẩu/PIN/token |
| 5. Lỗi giữa chừng, tiếp tục, hoàn tất | Đạt: lần 1 `incomplete` + `DB_CLEANUP_INTERRUPTED_AFTER_STORAGE`; xem trước lúc đó vẫn còn 12 quiz/13 bài nộp; tiếp tục → `completed`, lớp sang khóa `...050015`, quiz/bài nộp khóa cũ = 0, giữ 5 học sinh |
| 6. Dọn dẹp | Đạt: dọn lớp mẫu, TEST về 35 lớp, `orgBaselineBytes = 0` |

Ghi chú: các kịch bản giao diện (cảnh báo đỏ kèm số lượng/tác động, cho phép Admin xác nhận khi còn bài thiếu/chờ chấm, khôi phục khi hủy), xóa tệp riêng tư theo lô tối đa 1.000 object qua Storage API, lỗi giữa các lô Storage, các chốt chặn kỹ thuật riêng (sai quyền, lớp/khóa/roster không khớp, lượt ghi/xóa đang chạy, CSV chưa qua kiểm tra) và cổng kiểm soát tải nhiều tệp đồng thời (700 MB cảnh báo / 800 MB chặn cứng tính cả lượt đang giữ chỗ) đã được kiểm chứng toàn diện qua 195/195 bài kiểm thử tự động Mốc 5 (`tests/m5-course-close.test.mjs`, tổng dự án 371/371 đạt), 31 vòng review độc lập (`0 P0, 0 P1, 0 P2`, xem [M5_REVIEW_LEDGER.md](M5_REVIEW_LEDGER.md)) cùng 6/6 bước nghiệm thu thực tế trên Supabase TEST và Vercel Preview TEST.

**Trạng thái: Mốc 5 ĐẠT NGHIỆM THU theo ủy quyền của Owner (6/6 bước hosted đạt, 371/371 bài kiểm thử đạt, 31 vòng review độc lập PASS).** `teachingmindx-sync-trial.html` giữ nguyên tuyệt đối (SHA-256 `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`).
