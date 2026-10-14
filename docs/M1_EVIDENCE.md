# Bằng chứng Mốc 1

## Điểm bắt đầu — 14/10/2026

- Điều phối: Sol. Worker được yêu cầu Gemini `gemini-3.8-flash-high`, effort `high` qua AGY 1.3.5; chưa có lượt worker hoàn tất tại thời điểm ghi dòng này.
- Reviewer sẽ dùng subagent riêng `gpt-6-luna`, effort `max`; chỉ reviewer được tick checklist.
- Đã đọc toàn bộ PROJECT_PLAN.md/PROMPT_MOC_1.md và HTML tham khảo. Không có ứng dụng trước triển khai.
- Kho GitHub chính xác: https://github.com/Banhtalon/MINDX_LEARN.git. API GitHub xác nhận repo trống, public, nhánh mặc định main, tài khoản hiện có quyền push. Đã init Git main và nối origin, không ghi đè lịch sử.
- Kế hoạch trước triển khai đã sao lưu timestamp tại `.workflow-local/m1/PROJECT_PLAN.before-m1-*.md`; hash nền tại `.workflow-local/m1/baseline-hashes.json`.
- SHA256 HTML bảo toàn: `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`.
- SHA256 kế hoạch trước triển khai: `BAC97FE0CFD89332D9C1D73E1B1E727A78C6B422495E5FC7C1C44B3D89BBD5BF`.
- Node v24.21.0, npm 11.19.0. AGY help hỗ trợ các cờ yêu cầu; catalog có đúng model. Catalog chưa chứng minh worker chạy thành công.

## Gói M1-A

- Giao việc: `.workflow-local/m1/worker-task.md`. Phạm vi khung Next.js và UI-01..13 bằng fixture. Không nối Supabase, không dữ liệu thật, không sửa checklist.
- Worker: Gemini (`gemini-3.8-flash-high`) thực hiện trong AGY CLI.
- Các tệp đã tạo:
  - `package.json`: Khai báo Next.js 14.2.15, React 18.3.1, Tailwind CSS, TypeScript, script test dùng Node.js native test runner (`node --test tests/simulation-rules.test.mjs`).
  - `tsconfig.json`: Cấu hình TypeScript cho App Router Next.js (`@/*` alias).
  - `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `README.md`.
  - `public/robots.txt`: Thêm `Disallow: /` cho môi trường TEST (không index). Metadata layout cũng đặt `robots: { index: false, follow: false }`.
  - `public/fixtures/teaching_mock.json`: Fixture mẫu DataTables (draw, recordsTotal, recordsFiltered, data mẫu với tiền tố ROB và trạng thái).
  - `src/lib/types.ts`: Định nghĩa toàn bộ kiểu dữ liệu (User, Role, ClassItem, Course, Lesson, StudentProfile, QuizResult, PracticeSubmission, QAState).
  - `src/lib/mock-data.ts`: Dữ liệu bộ nhớ khởi tạo gồm 1 khóa 14 buổi cố định, các lớp học, học sinh (gồm cả học sinh đã chuyển lớp `usr_stu_3` và học sinh đã lưu trữ `usr_stu_4`), bài nộp thực hành và kết quả quiz.
  - `src/lib/store.tsx`: Trình quản lý trạng thái trong bộ nhớ với đầy đủ kịch bản QA (Normal, Loading delay, Save Error rollback, Network Error, Session Expired 401, Forbidden 403, Empty State); xử lý cấp PIN 2 chế độ (lần đầu cho HS chưa có PIN / cấp lại 1 HS), xuất CSV 14 buổi x số học sinh đợt, đóng khóa xóa vĩnh viễn kết quả cũ, kiểm tra chặn xuất bản bài chỉ lý thuyết.
  - `src/components/icons.tsx`: Bộ icon SVG thuần độc lập (zero external package dependencies).
  - `src/components/navbar.tsx`: Thanh điều hướng phân quyền và banner cảnh báo dữ liệu giả TEST thường trực.
  - `src/components/qa-controller.tsx`: Thanh công cụ nổi kiểm thử tình huống QA, cho phép chuyển nhanh vai trò Admin/GV/HS và kích hoạt lỗi mô phỏng.
  - `src/components/modal.tsx`: Modal, Drawer hồ sơ học sinh, và hộp thoại xác nhận cảnh báo nguy hiểm (ConfirmDialog).
  - `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`: Giao diện trang chủ và bố cục chuẩn desktop 1280x720, 1440x900, 1920x1080.
  - Toàn bộ 13 màn hình giao diện UI-01 đến UI-13:
    - `src/app/login/page.tsx` [UI-01]
    - `src/app/account/page.tsx` [UI-02]
    - `src/app/manage/page.tsx` [UI-03]
    - `src/app/manage/classes/page.tsx` [UI-04]
    - `src/app/admin/courses/page.tsx` [UI-05]
    - `src/app/admin/lessons/[lessonId]/edit/page.tsx` [UI-06]
    - `src/app/admin/teachers/page.tsx` [UI-07]
    - `src/app/admin/sync/page.tsx` [UI-08]
    - `src/app/teacher/submissions/page.tsx` [UI-09]
    - `src/app/student/page.tsx` [UI-10]
    - `src/app/student/course/page.tsx` [UI-11]
    - `src/app/student/lessons/[lessonId]/page.tsx` [UI-12]
    - `src/app/student/lessons/[lessonId]/quiz/page.tsx` [UI-13]
  - `tests/simulation-rules.test.mjs`: Bộ kiểm thử 6 quy tắc nghiệp vụ cốt lõi (chặn xuất bản bài chỉ lý thuyết; kiểm tra PIN 8 số; rollback khi lỗi lưu; cấp PIN 2 chế độ; tiến độ X/14; CSV đóng khóa đủ 14 dòng/học sinh).
- Lệnh cần thực hiện kiểm chứng:
  1. `npm install`
  2. `npm test`
  3. `npm run build`
  4. `npm run dev` (kiểm tra trên trình duyệt tại http://localhost:3000)
- Teaching thật, staging và 3 mục nghiệm thu Owner: chưa kiểm chứng.


## AGY — bằng chứng gọi thực tế

- M1-A đầu: bắt đầu 14/10/2026 10:37:22 +07:00, kết thúc 10:37:50, cấu hình `gemini-3.8-flash-high` / `high`, conversation `5777506e-f5e9-467c-a707-f6845294fcb2`, exit 0. JSON ghi SUCCESS nhưng response rỗng và denied_actions `command` / RunCommand. Không có file ứng dụng; lượt này KHÔNG đạt.
- M1-A retry: bắt đầu 10:39:11 +07:00, giữ cùng model/effort; giới hạn chỉ công cụ đọc/ghi file, không lệnh Terminal, không đổi quyền AGY. Conversation quan sát trong hồ sơ của chính lượt gọi: `ab8dc63b-1cfc-4b67-a5a9-76d9446b36ca`. Đã thấy công cụ WriteToFile tạo file trong đúng workspace, chưa có kết quả cuối.
- Chưa có trường model thực tế trong đầu ra đã kiểm tra; chỉ xác nhận cấu hình model được yêu cầu, không dùng lời tự nhận model làm chứng cứ.
- Không sao chép nội dung học sinh thật, cookie hay mật khẩu vào bất kỳ gói việc/báo cáo nào.

## Reviewer

- Đã tạo subagent độc lập `m1_luna_review`, model override `gpt-6-luna`, reasoning `max`, fork_turns `none` theo prompt.
- Luna xác minh bảo toàn và tick duy nhất mục thứ nhất Mốc 1. Các mục khác chưa được nghiệm thu.

## Hosting — khảo sát chưa triển khai

- Kết nối Vercel đọc được team hiện có; dữ liệu trả về chưa cho biết gói billing nên chưa đủ chứng cứ chặn phát sinh phí. Trang billing yêu cầu đăng nhập trực tiếp; đã mở cho Owner, đang chờ Owner.
- Đã đọc giá/điều khoản: https://vercel.com/docs/plans/hobby , https://vercel.com/legal/terms . Hobby chỉ dành cá nhân/phi thương mại; chưa mặc định dự án được dùng miễn phí.
- Đã đối chiếu phương án demo tĩnh: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages , https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits , https://docs.github.com/en/site-policy/github-terms/github-terms-of-service . Pages public repo có Free nhưng cấm hosting business/SaaS và giao dịch nhạy cảm; chưa chọn làm nơi vận hành sản phẩm.
- Next.js hỗ trợ demo static rồi nâng lên máy chủ: https://nextjs.org/docs/app/guides/static-exports . Không coi build/export cục bộ là staging đạt.

- Owner trả lời “Vercel xong”. Đã xem billing qua đúng tab Owner đăng nhập: team `quangctm07-5456s-projects`, Hobby Plan Active. Không nâng cấp, không nhập thẻ.
- Chọn Vercel preview cho bản mẫu fixture M1 chỉ để Owner duyệt, không mở vận hành/kinh doanh hoặc tài khoản thật. Gói Hobby phi thương mại; cần chọn lại hosting khi pilot/PROD theo kế hoạch. Không dùng add-on trả phí.
- Đã tạo project TEST riêng `mindx-learn-test`, id `prj_T9SLafrAyOywnv8PGm821eYBVBT7`, team `team_KjA2bxebH8S1hMts27rFbxn3`, Node24. Chưa có deployment/URL. Bảo vệ đăng nhập Vercel mặc định được giữ; không sửa project cũ.
- Lượt tạo với resourceConfig basic bị API từ chối 400 vì Hobby không hỗ trợ tùy chọn build machine. Đã bỏ tùy chọn đó và tạo thành công bằng cấu hình mặc định, không nâng cấp.

## Kiểm tra sơ bộ khi mã đang dựng — chưa nghiệm thu

- Sol chạy npm install --no-audit --no-fund: 105 packages, exit0. Range ban đầu cài Next14.2.35. Đã xác minh registry latest Next16.4.0/React19.3.0; sẽ giao Gemini nâng trước nghiệm thu/deploy.
- Cổng3000 đã bận; không dừng chương trình khác. Dev server do Sol giữ ở http://127.0.0.1:3008 (session63224), Ready. Trang login trả500 vì IconSettings không export; chưa mở bản hỏng cho Owner.
- npx tsc --noEmit --pretty false: exit2, thiếu IconSave và IconSettings exports. Kết quả ở `.workflow-local/m1/m1-a-preliminary-types.txt`; giao gói B sửa sau khi A bàn giao. Đây là kiểm tra nguồn đang dựng, không PASS bản cuối.

## Gói M1-B và kiểm tra nền tảng

- AGY B cấu hình Gemini3.8FlashHigh/high, conversation `62f398cc-453d-403e-bd03-e0b652660558`, 10:55:48–11:06, exit0; đã có báo cáo `.workflow-local/m1/m1-b-result.md` và thay đổi file thực tế. Chỉ công cụ đọc/ghi, Sol chạy lệnh kiểm chứng. M1-A retry trước đó hết15m lúc10:54:19 dù exit0, ghi chưa bàn giao response; nguồn đã tạo được bảo toàn, B sửa tiếp thay vì tạo bản trùng.
- npm install bản mới exit0. npm ls xác nhận Next16.4.0, React/ReactDOM19.3.0 đúng package. Warning chuyển peer version cũ trong lúc install đã kết thúc; tree cuối đúng versions.
- npm run typecheck exit0, npm test exit0: 4 test trực tiếp helper sản phẩm (PIN8số, chặn xuất bản thiếu đánh giá, X/14, CSV danh sách đợt gồm em đã chuyển). Chưa coi đây là bằng chứng browser hoặc hoàn thành M1. B đã loại test mirror/rollback giả trước đó.
- Luna review source sớm phát hiện: draft hiện với HS/directURL; GV thấy lớp ngoài phân công; bảng GV giữ state riêng mất khi điều hướng; dialog thiếu trợ giúp bàn phím. Đã giao C1 sửa, chưa tick các mục liên quan.
- Giao C1 và C2 vào hai tiến trình AGY cùng model/effort, file scope tách biệt: C1 sở hữu pagesHS/roster/GV/modal/store/package; C2 sở hữu Teaching utility/public/testsTeaching/UI08. Không cùng sửa file. C1 reuse worker B, reviewer vẫn subagent độc lập.
- Sol chỉ đối chiếu tiêu đề cột DOM nguồn Teaching: STT, Tên học sinh, Mã lớp, Trạng thái học sinh, GV chính, Trợ giảng, Trạng thái lớp, Thao tác. Không lấy hàng HS hoặc tên/ID/cookie. Đây là kiểm tra cấu trúc chuẩn bị tiện ích, CHƯA lượt spike Owner bấm.

## Kiểm tra kỹ thuật cuối trước khi đưa TEST — 14/10/2026

- `npm run typecheck`: đạt (exit 0).
- `npm test`: đạt 15/15 (exit 0), gồm 4 quy tắc nghiệp vụ fixture và 11 kiểm tra tiện ích Teaching chỉ đọc. Node có cảnh báo cách nhận diện kiểu mô-đun cho tệp kiểm tra TypeScript; không có kiểm tra nào thất bại và không thay đổi cấu hình chỉ để che cảnh báo.
- `npm run build`: đạt (exit 0) với Next.js 16.4.0; tạo đủ 13 trang Mốc 1.
- Đã kiểm tra thao tác cục bộ bằng dữ liệu giả tại `/admin/courses`: tạo khóa mẫu, thấy trạng thái `Đang lưu…`, sau lưu có 2 khóa và khóa mới có đúng 14 buổi nháp; đã mở sửa tên và lưu. Dữ liệu chỉ ở bộ nhớ của trang thử.
- Lượt xem lại trang cục bộ sau đó bị chính sách bảo vệ trình duyệt của Codex chặn quyền đọc `127.0.0.1`. Không tìm cách vượt chặn; phần bố cục ba kích thước desktop cần được kiểm tra lại trên đúng URL TEST sau khi triển khai.
- Quét các tệp sẽ đưa vào kho (loại trừ thư mục cài đặt, bản sao cục bộ, HTML thử và `.workflow-local`) không thấy mẫu khóa truy cập phổ biến. `teachingmindx-sync-trial.html` và bản sao kế hoạch tiếp tục bị Git bỏ qua, đúng phạm vi bảo toàn.

## Áp dụng quy tắc hỗ trợ AI

- Đã thêm `docs/AI_AGENT_WORKFLOW.md` và liên kết từ `AGENTS.md`: áp dụng nguyên tắc Ponytail là sửa nhỏ nhưng đủ, giữ kiểm tra/phân quyền/trợ năng; Caveman chỉ dùng cho ghi chú nội bộ ngắn gọn và không đưa dữ liệu dự án sang proxy, hook, tiện ích hay dịch vụ bên ngoài.
- Đã cài skill vào môi trường Codex của Owner cho các lượt sau, không thêm thư viện chạy vào ứng dụng: Ponytail, Ponytail Review, Ponytail Audit, Caveman, Caveman Review, Verify-and-stop.

## Gói M1-F — sửa đường dẫn hướng dẫn Teaching

- Worker AGY: cấu hình `gemini-3.8-flash-high` / `high`, conversation `9c8b8d4c-fa47-4297-a957-57055d599130`, exit 0. Worker chỉ sửa `src/app/admin/sync/page.tsx` và báo cáo cục bộ bị Git bỏ qua.
- Đã thay liên kết cục bộ hard-code bằng `/teaching-readonly/index.html` cùng website; hướng dẫn trên UI nói rõ chỉ xem hướng dẫn, không kết nối hay đồng bộ thật.
- Sol kiểm tra cục bộ lại: 14/14 đường dẫn Mốc 1 trả HTTP 200, gồm `/teaching-readonly/index.html`; quét UI-08 xác nhận không còn `127.0.0.1` và liên kết khớp chính xác.
- Sau M1-F: `npm run typecheck`, `npm test` (15/15), `npm run build` đều exit 0. Đây là snapshot Luna cần duyệt trước commit/deploy.

## Bàn giao mã và kết nối TEST

- Commit mã nguồn đã được Luna duyệt: `0990b14` (`feat: implement milestone 1 test dashboard`), đã push thành công lên `origin/main` của `Banhtalon/MINDX_LEARN`.
- Project TEST Vercel `mindx-learn-test` đã được kết nối với `Banhtalon/MINDX_LEARN` sau khi Owner đăng nhập Vercel. Không bật Analytics, Speed Insights, Git LFS, deploy hook hay gói trả phí.
- Commit mã nguồn có trước thời điểm kết nối Git nên Vercel chưa tự tạo deployment. Commit tài liệu bằng chứng tiếp theo chỉ kích hoạt pipeline của Vercel; không đổi mã nguồn, fixture hay dữ liệu thử.

## TEST chạy trên web và lượt đọc Teaching của Owner

- Deployment Vercel `dpl_4VbN2dC8DnpXdXKokdGQBPsZ5PN7`: READY, commit `1574b13cc0fcff352810bff1e9b95f7f2d1591cf`; project riêng `mindx-learn-test`. URL TEST: https://mindx-learn-test.vercel.app . URL phiên bản: https://mindx-learn-test-hk3ck56gz-quangctm07-5456s-projects.vercel.app . Vercel gọi nhánh chính của project TEST là `production`; đây vẫn là project TEST fixture, chưa triển khai môi trường PROD trong kế hoạch.
- Sol mở trang bằng trình duyệt, thấy đủ chỉ mục UI-01..13 và nhãn dữ liệu giả. Đường dẫn 13 màn hình, hướng dẫn tiện ích và robots.txt trả HTTP 200 trên Vercel. Ảnh dữ liệu giả cục bộ: `.workflow-local/m1/screenshots/hosted-home-1574b13.jpg`.
- Owner lượt đầu bấm sai trang, nhận `WRONG_ORIGIN` và 0; tiện ích dừng đúng guard. Lượt này không tính là đọc Teaching thành công.
- Sau hướng dẫn kéo nút thành dấu trang rồi bấm trên đúng `https://teachingmindx.top/hocsinh.php`, Owner xác nhận: `ĐÃ NHẬN DIỆN ĐÚNG BẢNG HỌC SINH (8 CỘT)`, đọc thành công 15 hàng hiển thị, tổng hàng DOM 15. Chỉ lưu phản hồi tổng hợp này; không thu nhận tên/mã học sinh, ảnh nguồn, mật khẩu, cookie hoặc payload thật. Đây là lượt đọc thử một trang hiện tại, không chứng minh toàn bộ danh sách/phân trang hay đồng bộ.
- Sol phát hiện lỗi scope JavaScript trong nút fixture của trang hướng dẫn, đang giao gói M1-G cho Gemini sửa generator và thêm regression trên chính HTML đã sinh. Lỗi này không đổi core bookmarklet đã dùng cho lượt Owner; chưa dùng deployment cũ để xác nhận bản sửa G.

## Gói M1-G — trang hướng dẫn thử các trường hợp giả

- AGY Worker cấu hình `gemini-3.8-flash-high` / `high`, conversation `baf72261-0fe1-4d4e-a948-87f07ea91faf`, exit 0. Phạm vi generator, HTML hướng dẫn đã sinh và test. Mã ứng dụng, `reader-core.mjs` và giới hạn chỉ đọc Teaching giữ nguyên; reader hash `86a6d8577a23a5818b62732aa75a4bf51df892d5d229b1c8c24f789a2b6241cc`.
- Tách phần hàm đọc khỏi lệnh tự thực thi: guide không tự chạy khi tải; 5 nút fixture gọi được hàm và cập nhật panel. Bookmarklet vẫn thực thi trên chính trang Teaching với origin/path guard cũ; phần sinh chỉ đổi một dòng trắng.
- Sol chạy generator và `npm test`: exit 0, 16/16 đạt. Test mới chạy trên HTML thực đã sinh: ban đầu không panel; 3 hàng/empty/login/headers/origin cho kết quả đúng; panel đơn và đóng được; không ReferenceError, request mạng hay storage.
- Owner xác nhận trên TEST `1574b13`: “xác nhận các trang mở được”; “xác nhận hiện chưa thấy Vercel yêu cầu thanh toán/nâng cấp, chưa nhập học sinh thật”. Các xác nhận đó bổ sung cho lượt đọc Teaching 15 hàng nêu trên. Bản sửa G chỉ ảnh hưởng guide; cần review/kiểm tra guide trên deployment mới trước khi chốt M1.

## Gói M1-H — bảng hồ sơ không bị nút QA che

- Luna kiểm tra drawer ở 1280×720 thấy nút QA nổi che một phần nút Lưu trữ khi cuộn cuối bảng hồ sơ; drawer và hộp xác nhận vẫn nằm trong màn hình tại ba cỡ yêu cầu.
- Worker AGY cấu hình `gemini-3.8-flash-high` / `high`, conversation `67f453ba-3584-460b-9284-8cab58d24586`, exit 0. Sửa duy nhất `src/components/qa-controller.tsx`: lớp QA z-50 thành z-40, thấp hơn drawer/dialog z-50. Không thay logic vai trò/dữ liệu/lưu hoặc thêm thư viện.
- Sol đối chiếu diff chỉ một lớp hiển thị; `npm run typecheck` và `npm run build` exit 0. Test 16/16 trước đó của G vẫn áp dụng vì H không đổi logic đã test. Chờ Luna kiểm tra lại trực quan trên deployment G+H cuối.
