# Bằng chứng Mốc 2 — cập nhật 16/10/2026

## Trạng thái hiện tại

- Quyết định Owner ngày 15/10/2026: bỏ thư mời giáo viên; Admin tạo email/mật khẩu trực tiếp trong Supabase rồi kết nối tài khoản đã có với hồ sơ Giáo viên và lớp. Sáu tệp E6 đã được review, push và triển khai lên TEST. API focused đạt 19/19; Owner đã xác nhận kết nối fixture giả qua Admin và tải lại vẫn thấy Giáo viên cùng lớp. Ba kích thước vẫn chưa xác minh, nên chưa đánh dấu tiêu chí hoàn tất. Các yêu cầu thư mời trong nhật ký cũ chỉ là lịch sử; Quên mật khẩu vẫn được giữ.
- Mốc 2 chưa nghiệm thu toàn bộ. Lần review gần nhất ghi nhận 8/9 mục kỹ thuật và 4/4 mục Owner; không đổi các số này trước khi reviewer cập nhật. API đạt 19/19 và Owner xác nhận thao tác kết nối/tải lại; ba kích thước Admin bắt buộc vẫn chưa được kiểm tra. Nguyên nhân lỗi đăng nhập đơn lẻ của C13 vẫn chưa rõ. Nhật ký bên dưới giữ trạng thái theo thời điểm và không thay thế receipt E6 mới.
- Bản TEST `https://mindx-learn-test.vercel.app` hiện `READY`: deployment `dpl_CPipjdZPvZusTGngJvnW76TzLP5v`, source sản phẩm `7d17cbd0d99e02dbfa3355c532e4e1ffa752e331`, nhánh `codex/moc-2`; metadata được đọc lại từ Vercel ngày 16/10/2026. Gói gồm 42 tệp/692352 byte từ allowlist. PR #1 vẫn ở trạng thái nháp: https://github.com/Banhtalon/MINDX_LEARN/pull/1 . Receipt chi tiết ở `.workflow-local/m2/vercel-deployment-receipt-e6-20261016.json`.
- Supabase TEST đang chạy Edge `m2-backend` v3 (`verify_jwt=false`), bundle digest `42b6289d6b8bec41af4c4fb6d1d63c9951781e2cb1a3fae974ed28549902a2ef`. API focused 19/19 PASS; chi tiết tại receipt mới trong thư mục `.workflow-local/m2/`. Bản B17 và C15 bên dưới vẫn là kết quả lịch sử riêng, không được đổi thành bằng chứng cho E6.
- Có bằng chứng riêng về quyền dữ liệu trực tiếp, PIN/CSV, phiên cũ, giới hạn tài khoản/IP, logout giả và tranh chấp cấp PIN. Lượt full hosted C13 đã có receipt: 28 đạt, 1 lỗi tải, 1 chưa thử trong harness, 1 chờ Owner. Tải 199/200 đăng nhập và xác minh phiên, 0 lượt429, 1 lỗi chưa rõ nguyên nhân; không coi là đạt200/200. [Số liệu tổng hợp](M2_RUNTIME_RESULTS.json).
- Owner đã xác nhận nhập email ổn và đăng nhập Admin được sau bản sửa B17, theo hướng dẫn Quên mật khẩu/đặt lại qua email ngày15/10. Cấp/tải CSV lần đầu cho hai học sinh giả đã được Owner xác nhận; Owner đã ủy quyền AI tự kiểm tra xem tài khoản học sinh và cấp lại PIN; bằng chứng riêng đã đạt, khác với thao tác Owner trực tiếp. Giữ TEST, dữ liệu học sinh giả, giới hạn Auth hiện tại; chưa mở PROD hoặc chuyển Mốc3–6.

## Phạm vi và điểm bắt đầu

- Owner yêu cầu triển khai Mốc 2 và cấp quyền làm việc với project Supabase `eythjapspkoyqdxlxtcd`, URL https://supabase.com/dashboard/project/eythjapspkoyqdxlxtcd . Chỉ TEST/dữ liệu học sinh giả; không triển khai PROD hoặc tự chuyển Mốc 3–6.
- Baseline đã nghiệm thu Mốc 1: commit `e28f74f`. Nhánh triển khai `codex/moc-2`. Hai thay đổi tài liệu UI skill từ yêu cầu Owner được giữ nguyên và cập nhật nguồn đã xác minh.
- Bản sao trước Mốc 2 của PROJECT_PLAN.md, AGENTS.md và AI_AGENT_WORKFLOW.md tại `.workflow-local/m2/baseline-20261014/`. Hash kế hoạch `0A817E6C05EF2890FDF826B03EAAA4FE81E4118351B1F39856464D6C386AEAEB`.
- Supabase đọc trực tiếp: tên `MINDX_LEARN`, trạng thái ACTIVE_HEALTHY, Postgres 17.11; org `xobqmgowsyxuxcazpalm` tên `MindxTeach`, plan Free. Đếm ban đầu: 0 Auth users, 0 bảng public, 0 buckets và 0 objects. Các project khác không thay đổi. Danh sách project của connector không liệt kê project mới này nhưng truy vấn metadata/SQL theo ref được phép và hoạt động.
- Khóa công khai truy xuất bằng connector được giữ trong bộ nhớ công cụ; không đưa giá trị vào hồ sơ. Chưa lấy/hiển thị khóa quản trị. Secret máy chủ sẽ được cấu hình riêng sau khi worker bàn giao, không gửi worker/model hoặc ghi Git/log.

## Phân vai và gói việc

- Sol điều phối, đọc tài liệu, chạy kiểm tra, cấu hình/kết nối/triển khai; không viết mã ứng dụng, không tự tick.
- AGY 1.3.5: help/catalog xác nhận có `gemini-3.8-flash-high`, effort `high`; catalog không được coi là bằng chứng worker hoàn thành.
- Gói A: versioned migration, Edge backend, RLS và kiểm tra M2. Gói B: Next BFF, cookie mã hóa, Auth/UI và các thao tác quản lý M2 có lưu thật trong TEST. Hai tiến trình AGY được gọi đúng model/effort, accept-edits, thời hạn 15m; chỉ đọc/ghi file trong phạm vi, Sol chạy lệnh. Chưa có kết quả cuối tại thời điểm ghi.
- Gói/contract chi tiết ở `.workflow-local/m2/contract.md`, `worker-a.md`, `worker-b.md`; không có mật khẩu/PIN thật, khóa hoặc dữ liệu học sinh thật.
- Reviewer độc lập `m2_luna_review`, `gpt-6-luna`, effort `max`, fork none. Đã review kiến trúc: cookie chỉ chứa token Supabase đã mã hóa, PIN-derived Auth password gắn Auth UUID với pepper chỉ ở máy chủ Next, private mapping, limiter account/IP nguyên tử và quyền/status/session-version kiểm tra lại từ database. Chưa duyệt source hoặc tick M2.
- Migration được tạo bằng CLI Supabase 2.120.0 (help đã kiểm tra): `supabase/migrations/20261014111216_m2_identity.sql`. Chưa áp dụng lên cloud; chỉ áp dụng sau review.
- Gói B lượt đầu trả `SUCCESS` nhưng `denied_actions` có `read_file`, phản hồi rỗng và không có thay đổi source; không tính là hoàn thành. Sol sao lưu cấu hình AGY, bổ sung quyền đọc/ghi các thư mục cụ thể của gói việc và hai skill, không thêm quyền Terminal hoặc `.env*`, rồi gọi lại đúng model/effort. Gói A đã ghi migration và domain nhưng chưa bàn giao; Luna đang đọc bản xây để tìm lỗi sớm.
- Gói A lượt đầu tạo source nhưng kết thúc `ERROR` (stream interrupted), exit code CLI vẫn 0. Không xem exit 0 hoặc báo cáo worker là bằng chứng đạt. Luna xác nhận BLOCK: Edge gọi nhầm schema private, API đăng xuất dùng UUID thay JWT, thiếu kiểm tra phiên hiện hành/class active, claim PIN/limiter đua đồng thời, Storage đọc chéo scope và bộ kiểm tra mô phỏng lại logic. Sol đã giao gói sửa `worker-a-fix-1.md` vào đúng phiên Gemini. Chưa apply migration hoặc chạy live-check có tác động tài khoản.
- Kiểm tra kiểu Edge bằng Deno 2.9.6: dùng `check --no-config` để không lấy cấu hình Next, còn 14 lỗi truy cập profile có thể null tại snapshot đầu. Chưa có kết quả chạy lại trên bản sửa.
- Luna tiếp tục BLOCK bản A sửa lần 1: phiên Auth cũ chưa được kiểm tra trong Edge; first-issue chưa đặt trước Auth UUID cho HMAC; khóa batch/single và ID trùng vẫn có lỗi; callback thiếu verifier PKCE thực tế; trạng thái khôi phục bỏ qua lỗi. Báo cáo có hash tại `.workflow-local/m2/M2_REVIEW_A_FIX1_20261014.md`. Sol giao A sửa lần 2 và B sửa/tích hợp lần 1 theo cùng `auth-pin-contract-v2.md` để thống nhất trường dữ liệu và luồng email miễn phí.
- B lượt triển khai ban đầu hết thời hạn 15m, trả `SUCCESS` nhưng output rỗng và partial; không tính hoàn thành. Kiểm tra Next tại snapshot đầu không đạt: còn nơi dùng kết quả chưa chờ Promise, cookie chưa có kiểu được xác nhận, và compiler Next đọc nhầm mã Deno. Chi tiết điều phối tại `.workflow-local/m2/m2-latest-checks.md`; chưa build/triển khai bản M2.
- Kiểm tra hồi quy M1 tại lần này: 16/16 đạt (simulation rules và Teaching read-only); HTML tham khảo vẫn giữ SHA256 `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`. Đây chỉ là bằng chứng phần cũ, không nghiệm thu M2.

## Cấu hình Auth TEST đã xác minh bằng giao diện

- Đã tắt `Allow new users to sign up`; anonymous sign-in và manual linking vẫn tắt, xác nhận email vẫn bật. Đây là chế độ chỉ đội triển khai/Admin tạo tài khoản theo kế hoạch.
- Site URL đã đổi từ localhost sang `https://mindx-learn-test.vercel.app`; đã thêm đúng một redirect URL `https://mindx-learn-test.vercel.app/auth/callback`, không wildcard/domain lạ. Ảnh trạng thái đã lưu tại `.workflow-local/m2/screenshots/auth-test-url.png`.
- Ảnh bằng chứng tại `.workflow-local/m2/screenshots/signup-disabled.png` và `site-url-test.png`. Chưa tạo người dùng Auth hoặc gửi thư mời Admin.
- Supabase Free hiện yêu cầu custom SMTP hoặc Pro để sửa mẫu thư. Không nâng cấp; kiểm tra luồng mẫu mặc định và ngữ cảnh đặt lại mật khẩu trước khi gửi liên kết Owner.

## Skill giao diện và tài liệu

- Đã cài UI UX Pro Max/Taste từ đúng URL Owner cung cấp, commit nguồn trong `docs/AI_AGENT_WORKFLOW.md`. Search UIUX lần đầu thiên về operations landing/dark nên không dùng palette đó; retry learning management chọn nguyên tắc minimal/accessible, giữ nền sáng và xanh đã chốt. Không dùng kết quả font trẻ em/palette teal thay quyết định Owner. Stack query Next xác nhận validation/authorization ở server. Không thêm thư viện trang trí.
- Đã đọc hướng dẫn Next 16.4 về Auth, cookies async và route handlers trước khi giao worker. Supabase changelog có cập nhật TLS/hook/SDK; không dùng kiến thức cũ để đoán API. SDK đã xác minh registry: `@supabase/supabase-js` 2.117.3.
- Supabase SMTP mặc định chỉ gửi email tới thành viên tổ chức và có giới hạn thấp (2 email/giờ). Không gửi thư thử tới email học sinh/giáo viên giả; không tự đăng ký SMTP trả phí. Owner đã chỉ định email Admin trực tiếp; giá trị được dùng khi cấu hình Auth, không đưa vào gói worker hoặc báo cáo kiểm tra.

## Tiến độ sau lượt tiếp tục

- A3 đã qua kiểm tra Deno; Luna vẫn BLOCK source/migration vì chốt cấp PIN chưa kiểm tra lại đủ phạm vi, lưu trữ học sinh có thể tác động sai vai trò và lời mời thiếu bằng chứng phiên/OTP. Đang giao A4 sửa đúng các lỗi; chưa áp dụng migration lên Supabase.
- B3 đã qua `npm run typecheck`. Kiểm tra helper B2 đạt 51/51, nhưng Luna phát hiện cookie đăng nhập thiếu `expiresAt` nên chưa thể coi luồng đăng nhập đạt. B4 đang sửa helper tạo phiên và kiểm tra từ mã được handler dùng thật.
- C tiếp nhận riêng `tests/m2-backend.test.mjs` và `scripts/m2-live-check.mjs`, dùng tài khoản QA mới, PIN riêng/HMAC theo AuthUUID, đăng nhập qua BFF và 200 tài khoản khác nhau khi bật cờ tải. Chưa chạy harness có ghi dữ liệu; không xem báo cáo worker là bằng chứng runtime.
- Vercel project TEST đã cấu hình ba khóa 256-bit ngẫu nhiên ở chế độ Sensitive cùng URL Supabase/Site URL. Kiểm tra danh sách chỉ tên/type/target, không đọc lại hoặc hiển thị giá trị. Bản khôi phục riêng tại thư mục local bị Git/Vercel loại trừ và nằm ngoài quyền đọc file của worker. Chưa tạo `.env.local` ở dự án khi ghi nhận này.
- Luồng invite mặc định của Supabase Free có ngoại lệ: token của chính nhân viên nhận lời mời tạm có trong fragment do nhà cung cấp tạo; ứng dụng phải xóa URL ngay, xác minh phiên OTP/timestamp và chuyển thành cookie mã hóa. Không dùng ngoại lệ này cho học sinh hoặc đăng nhập thông thường. Quên mật khẩu dùng PKCE để token không qua trình duyệt. Đây là thiết kế đang kiểm chứng, chưa xác nhận hoạt động thực tế.

Mọi checkbox Mốc 2 hiện chưa đủ bằng chứng: source, migration/RLS, Auth/phiên cũ, PIN/CSV một lần, thử tải 200 tài khoản giả, hosted UI và nghiệm thu Owner sẽ được cập nhật theo đúng bản chạy. Không dùng kết quả Mốc 1 để coi Mốc 2 đạt.

## Trạng thái mới nhất sau yêu cầu resume

- A4 kết thúc partial, không đạt gate cloud. Luna xác định finalizer chưa đối chiếu tập ID duy nhất đầy đủ; Edge còn nhánh QA mật khẩu chung, chưa truyền trạng thái chưa cấp PIN, tạo giáo viên chưa kiểm tra đủ lỗi/timestamp, đổi phân công giáo viên chưa nguyên tử. Đã giao A5 trong phiên Gemini mới, chỉ sửa `supabase/**`; chưa apply SQL hoặc deploy Edge.
- B5 bổ sung sửa lớp/phân công giáo viên và chuẩn hóa payload lồng `data`, bỏ fallback dùng ID học sinh làm Auth UUID, sửa nhãn đăng nhập/live Mốc 2. Typecheck đạt trên snapshot sau B5. 61 kiểm tra M2 hiện có 59 đạt/2 chưa đạt do đo TTL với đồng hồ thực lệch một giây; B6 sửa kiểm tra xác định và loại định danh nội bộ khỏi thông báo lỗi. Chưa coi đây là đăng nhập thực tế đã đạt.
- C2 thêm phép thử native REST theo vai trò và JWT cũ sau lưu trữ/khôi phục/đăng xuất. C3 đang loại các điều kiện có thể báo đạt sai; chưa chạy công cụ seed/tải cloud. Giữ ranh giới kiểm tra SQL tĩnh với quyền dữ liệu thực tế.
- Đã có `.env.local` riêng cho localhost cùng bản cấu hình local bị Git/Vercel loại trừ, ngoài quyền đọc worker. 6/6 kiểm tra HTTP bảo vệ cửa vào localhost đạt sau cấu hình: hành động nội bộ/không biết không mở công khai, phiên chưa đăng nhập không có token, payload thiếu/sai loại bị từ chối. Chưa chứng minh Edge, phiên đăng nhập hoặc RLS cloud.
- Đọc cloud mới nhất: 1 Auth user khớp tài khoản Owner được chỉ định, đã xác nhận email/có mật khẩu, chưa đăng nhập, chưa có metadata M2; vẫn 0 bảng public/0 bucket. Bảo toàn người dùng/mật khẩu hiện có. A5 được giao nhánh coordinator-only để thêm hồ sơ/quyền Admin cho tài khoản đã xác nhận, không xóa hoặc thay mật khẩu, không giả lời mời đã gửi. Chưa thực hiện nhánh này.
- Trình duyệt localhost xác nhận tiêu đề/nav Mốc 2 và tên input đăng nhập đã sửa; chưa kiểm tra màn hình có tài khoản thật hoặc ba kích thước cuối. Build đang chạy, chưa có kết quả cuối tại lần ghi này. Bản Vercel TEST vẫn là Mốc 1 đã nghiệm thu; chưa gửi thư đặt mật khẩu/reset hoặc yêu cầu Owner nghiệm thu Mốc 2.

### Kết quả kiểm tra bổ sung trên máy

- `npm run build` hoàn tất exit 0 trên snapshot B5/B6, tạo 18 tuyến trang/API; `npm run typecheck` đạt. Chưa chứng minh kết nối cloud. B7 đang đổi chữ giao diện và đồng hồ kiểm tra nên cần chạy lại kiểm tra cuối khi bàn giao.
- Trang `/login` của bản đóng gói đã mở qua `http://localhost:3000`, chụp ở 1280×720, 1440×900, 1920×1080; hai lựa chọn vai trò/nhãn input/nút đăng nhập không bị che. Hộp Quên mật khẩu live không còn ghi mô phỏng. Ảnh `login-b5-1280.png`, `login-b5-1440.png`, `login-b5-1920.png`, `forgot-b5.png` trong thư mục local evidence. Đây chỉ là trang chưa đăng nhập; chưa kiểm tra màn hình quản lý có dữ liệu/phiên thật. Chữ chú thích nhỏ/footer thuật ngữ nội bộ đã giao B7 chỉnh cho dễ đọc.
- B6 sửa TTL của helper nhưng roundtrip còn một test chưa đạt: mốc thử cố định tháng 2/2026 khác đồng hồ thật của decrypt tháng 10/2026. B7 dùng cùng đồng hồ giả cho toàn lượt encrypt/decrypt/validate; giữ nguyên việc từ chối phiên hết hạn trong mã thực tế.
- C3 đã bàn giao nhưng còn lệch cấu trúc `GET session` và probe IP chưa tới ngưỡng. Luna đang review bản chạy thử, chưa cho phép dùng báo cáo C3 làm bằng chứng nghiệm thu.

## Checkpoint tiếp tục lúc 23h ngày 14/10/2026

- A6/A7 đã sửa cấp PIN một phần, kiểm tra đồng bộ phiên sau finalizer, không hạ version của placeholder, bắt buộc email PKCE, giới hạn lớp QA, tạo object Storage giả qua API riêng cho điều phối. A7 sửa lại helper nâng phiên dùng chung để Admin/GV đổi mật khẩu/đăng xuất không bị chặn nhầm. Deno check đạt; Luna đang review trước apply. Hash SQL `A16D1BF3B574F11C31889139CEF9B05164E76CA2E457C78BD64A13F5052ADABA`, Edge `4262D17AABD156EACD853F9E43DF3E965F52AD30A0FBCC0BFFCF8B718B3059C7`.
- B8/B9 đã sửa PKCE lấy email/verifier từ cookie máy chủ, đổi PIN gọi prepare/commit thật và chặn PIN dễ đoán, CSV dùng mã lớp do Edge trả. Typecheck đạt và 78/78 test M2 đạt. B10 đang sửa kiểm tra Origin ở local/hosted và khóa phần tổng kết M5 trong live M2; B11 chuẩn bị bảo toàn mã lỗi an toàn để công cụ thử nhận diện đúng limiter.
- C4 đã sửa phản hồi phiên đúng cấu trúc, bỏ cookie/status giả, dùng operation cấp PIN thật cho test âm và Storage phải có object dương của Admin. Luna còn chặn riêng probe IP vì chấp nhận 429 bất kỳ; C5 đang yêu cầu đúng mã lỗi và đủ phản hồi hợp lệ, giữ verdict INCOMPLETE khi thiếu nghiệm thu/thử tranh chấp.
- Đọc Supabase fresh trước apply: đúng project `MINDX_LEARN`, ACTIVE_HEALTHY, vẫn 1 tài khoản Auth của Owner/0 bảng public/0 bucket, lịch sử migration trống. Chưa thêm quyền Admin, chưa gửi email, chưa deploy M2 hoặc áp dụng SQL. Không lấy kết quả CLI SUCCESS làm bằng chứng thực hiện; B10 có lượt bị từ chối RunCommand, đã giao lại phiên worker chỉ dùng quyền đọc/ghi tệp trong phạm vi.

## Supabase TEST đã áp dụng và phép thử thực tế đầu tiên

- Luna duyệt A7 `APPROVE_TO_TEST_APPLY` đúng hash trong báo cáo local. Đã áp dụng `m2_identity`, cloud ghi version `20261014161110`; nội dung tương ứng file CLI local `20261014111216_m2_identity.sql` hash A16D1B… giữ nguyên. Timestamp cloud do connector tạo, không tự sửa lịch sử hoặc reset để ép khớp tên file.
- Edge `m2-backend` ACTIVE v1, custom BFF secret kiểm tra trong body trước mọi action; platform `verify_jwt:false` dùng cho xác thực tùy chỉnh này. Khóa service-role chỉ ở Edge, Next dùng shared secret riêng. Yêu cầu thiếu secret trả 401 `UNAUTHORIZED_BFF` thực tế.
- Đã tiếp nhận tài khoản Auth hiện có của Owner bằng action điều phối riêng, tạo hồ sơ Admin/mapping 200 thành công, không đổi mật khẩu/email và không gửi lời mời giả. Root tạo thêm Admin QA độc lập, mật khẩu ngẫu nhiên chỉ RAM; đăng nhập qua BFF 200, cookie mã hóa, `GET session` đúng ID công khai và không lộ Auth UUID.
- SQL đọc thực tế: mọi bảng public bật RLS; không có học sinh non-fixture. Storage tạo 1 object văn bản giả qua action riêng điều phối; native Admin đọc 200. Native HS đọc hàng mình đúng 1, đọc HS khác 0; Storage trả HTTP 400 kèm statusCode 404/not_found (đối tượng đã được Admin chứng minh tồn tại). Bộ thử C8 được giao nhận diện chính xác phản hồi này, không coi mọi 400 là đạt.
- Native HS giả đăng nhập PIN riêng 200 và session hợp lệ; đổi PIN qua BFF 200, PIN dễ đoán bị từ chối 400, cookie cũ gọi bootstrap 401, PIN mới đăng nhập 200. PIN/CSV/token giữ RAM, không ghi giá trị vào hồ sơ hoặc log.
- Cấp PIN lần đầu trên lớp mẫu: 200 `text/csv`, đúng 1 hàng chưa cấp PIN, `no-store`; dữ liệu CSV chỉ RAM. Chưa dùng kết quả đơn lẻ để thay việc Owner tự cấp/tải CSV.
- Khi thử tạo lớp qua BFF, runtime phát hiện SQL 42702 do output `id` của RETURNS TABLE trùng cột chưa định danh. Worker A8 tạo bản sửa riêng `20261014161419_m2_rpc_runtime_fix.sql` bằng CLI; Luna duyệt hash `490BB9F07295B05DB7A908AD154367448ABE192B30498C8D784FBD3F6B5AE387`, giữ quyền và giao dịch. Apply bản sửa thành công; tạo lớp lại 200, sửa tên/phân công teacher QA 200, mã lớp trùng/teacher sai vai trò bị từ chối và phân công cũ vẫn đúng sau reload.
- Advisor security có 5 cảnh báo cho helper SECURITY DEFINER được authenticated thực thi nhằm chính sách RLS, và cảnh báo leaked-password protection chưa bật. Đây không phải biên bản chứng nhận an toàn; reviewer cần đối chiếu phạm vi helper và giới hạn Free trước nghiệm thu. Chưa bật gói trả phí.
- B10/B11 typecheck/test đã chạy lại: 87/87 test M2 trước B12; B12 đang sửa Origin khác giao thức và không tự tạo RATE_LIMITED chỉ từ status HTTP. C7 làm mới cửa sổ mạng và yêu cầu đúng 240 lượt/241 chặn; C8 xử lý Storage provider response. Chưa chạy toàn harness/tải 200, chưa deploy Next M2 lên Vercel, chưa xác nhận email reset/Owner nghiệm thu.

## Kết quả chạy cloud đầy đủ C8 và sửa tiếp

- Receipt local `m2-live-20261014.log`, bắt đầu 2026-10-14T16:31:51.702Z: 31 kiểm tra, 24 đạt, 5 lỗi, 1 chưa thử tranh chấp đồng thời, 1 chờ Owner kiểm tra email. Không coi bộ thử này đạt hoặc Mốc 2 hoàn tất.
- RLS trực tiếp HS/GV, RPC riêng, Storage đối tượng đã có, PIN native HMAC, challenge một lần, archive/restore/logout làm phiên cũ chết, ngưỡng tài khoản và mạng thật đã đạt. Mạng: 240 yêu cầu sai trả 401; yêu cầu 241 trả 429 RATE_LIMITED; giả header IP không vượt; sau 62 giây đăng nhập lại được.
- Cấp/cấp lại PIN API đã trả CSV200 nhưng bộ thử so mã học sinh có chữ thường với mã chuẩn chữ hoa nên bỏ sót PIN. C9 sửa so danh tính chuẩn, bỏ fallback PIN giả và không mặc định học sinh khác không đổi khi chưa kiểm tra. 6 test CSV local đạt, reviewer đang rà; đây chưa phải runtime C9.
- Lặp cấp lần đầu trả409 OPERATION_LOCKED do ngoại lệ SQL chỉ báo không còn học sinh chưa cấp; A9/B13 đang tách mã NO_UNISSUED_STUDENTS an toàn, không reset PIN đã cấp hoặc nới khóa thao tác.
- Thử tải: seed200 tài khoản giả thành công; 188/200 đăng nhập + kiểm tra phiên đạt, 12 trả401 do Edge gộp lỗi provider. Aggregate Auth logs xác nhận đúng12 yêu cầu /token429 over_request_rate_limit. A9 sửa báo429 RATE_LIMITED trung thực. Thời gian90308ms, mức song song4, không phải200 kết nối đồng thời.
- Đọc dashboard Auth Rate Limits: token150 yêu cầu/5phút/IP, sign-in/signup30/5phút, IP forwarding tắt. Giữ nguyên tất cả, không tăng hạn mức để làm xanh báo cáo. Mốc2 yêu cầu đo để phát hiện giới hạn; Mốc6 vẫn cần đạt thử tải theo mức Owner chốt. Nguồn: https://supabase.com/docs/guides/auth/rate-limits .
- Cloud migration2 version20261014162412 name m2_rpc_runtime_fix tương ứng local20261014161419 file/hash đã duyệt. Không sửa lịch sử migration.
- B12 được Luna duyệt, typecheck96 testM2 trước C9 đạt. Root thử cookie mã hóa hợp lệ nhưng expiresAt quá hạn: GETsession200 successfalse usernull; không nhận quyền.
- Chưa deploy NextM2 lên Vercel, chưa Owner thử thư/mật khẩu/cấpCSV. Checklist Mốc2 giữ chưa tick.

### Checkpoint ngày 15/10/2026

- A9 phân loại đúng lỗi provider429 thành RATE_LIMITED và trường hợp cấp PIN đầu đã hết học sinh chưa cấp thành NO_UNISSUED_STUDENTS; Deno check đạt, chờ Luna. B13 121 test toàn dự án đạt nhưng typecheck không đạt vì exported helper trong route; B14 đang chuyển sang helper dùng chung và bỏ test chép lại. Chưa deploy snapshot lỗi.
- Bằng chứng local m2-race-proof.json: hai pin-prepare thật song song cùng lớp QA, đúng một200/1target và một409 OPERATION_LOCKED, không commit/PIN/CSV. Đây là bằng chứng riêng, harness vẫn đánh dấu chưa thử tranh chấp để không sửa báo cáo cũ.
- Kiểm tra 36 file src/public không thấy 3 giá trị bí mật thực tế. Backup mã A9/B13 trước sửa tiếp ở workflow-local; không chứa env.

## Bản TEST đã triển khai và kiểm tra bổ sung ngày 15/10/2026

- Cloud migration thứ ba: version `20261014174106`, tên `m2_fixture_pin_state_fix`; tương ứng local `20261014173008_m2_fixture_pin_state_fix.sql`, SHA256 `F2C06050501612856179C7018FF7E87B6DB64BA063428AD104D5C072C278B3F1`. Chỉ sửa marker của fixture chưa có ánh xạ Auth; không sửa lịch sử hai migration trước.
- Edge A11 v2: index SHA256 `0E7331723A1C24CEE82E62D472CAC8B3121F837125564447CCABB665F28548AD`; domain SHA256 `BA07A5CC8AD26F5AE84E2FB498111A8A5620DC97B497602F38AF13E0B64B9BA8`. B15 crypto SHA256 `A0FA3D59958DBF0A3771B8523CE0CD18EABEF1D41CCB27EA263CD735F469C097`.
- Vercel nhận 42 tệp sản phẩm/687627 byte; không gửi `.env`, QA, SQL hoặc báo cáo riêng. Hai URL và ba secret phía máy chủ đã cấu hình riêng cho TEST. Kiểm tra HTTP hosted 6/6 đạt; không có phiên thì trả user null; tác vụ nội bộ không mở qua BFF.
- Receipt local A11/B15/C9: 31 mục, 28 PASS, 0 FAIL, 2 mục chưa thử trong harness (tranh chấp và tải), 1 chờ Owner email. Đây là Next trên máy nối Supabase TEST, không phải full hosted.
- Hosted IP proof riêng: 240/240 yêu cầu sai trả 401 trong 36153 ms; lượt 241 và lượt đổi header giả tiếp theo đều 429 RATE_LIMITED, tổng 40949 ms. Không tăng hạn mức. Logout với JWT giả 401, phiên hợp lệ không bị vô hiệu hóa.
- Phép thử mới Edge v2 A11: hai yêu cầu pin-prepare song song cùng fixture cho đúng một 200/1 học sinh và một 409 OPERATION_LOCKED; chỉ chuẩn bị thao tác, không tạo CSV. Học sinh fixture chưa cấp PIN archive/restore qua hosted BFF đều 200; khôi phục active và vẫn chưa cấp PIN.
- Browser hosted: Admin và Giáo viên kiểm tra ba kích thước 1280×720/1440×900/1920×1080; Giáo viên chỉ thấy lớp được phân công và không có nút cấp PIN. Học sinh đăng nhập bằng PIN riêng, chỉ thấy khu học sinh, trang chưa có khóa học báo rõ; ba kích thước không tràn ngang. Hồ sơ học sinh 1280 không tràn; đã đăng xuất, xóa ghi đè kích thước trình duyệt. Ảnh nằm trong thư mục bằng chứng local, không đưa dữ liệu đăng nhập lên GitHub.
- C13 hash `C67D5AB9435745D79E49326D7D2EC8E432988FBB0C2B3C2DCFE0944355B6F1EC`: 24 luồng đồng thời, tổng 241 yêu cầu đo IP, vẫn đúng241 yêu cầu/240x401+1x429, cửa sổ<60giây. Overrun sạch là NOT_TESTED;500 / phản hồi sai/lỗi mạng vẫn FAIL. Luna duyệt phạm vi công cụ; Root kiểm tra trực tiếp nhánh nguồn 4/4 đạt.
- Đối soát dữ liệu ngày 15/10: không có học sinh ngoài fixture. Advisor vẫn cảnh báo 5 helper SECURITY DEFINER phục vụ RLS được authenticated gọi: chúng chỉ trả profile/role/phân công của tài khoản hiện hành qua auth.uid(), search_path đã ghim. Leaked-password protection chưa bật; đây không phải chứng nhận an toàn, không tự nâng gói.
- Lượt hosted C13 kết thúc exit1/FAILED: 31 mục, 28 PASS, 1 FAIL (tải), 1 NOT_TESTED (tranh chấp đã có proof riêng), 1 MANUAL_PENDING (email Owner). 200 tài khoản được tạo; 199 đăng nhập +199 xác minh phiên, 0 lượt429, 1 login fail, thời gian338112ms,4 luồng đồng thời. Kết quả nguyên vẹn ở [M2_RUNTIME_RESULTS.json](M2_RUNTIME_RESULTS.json); stderr footer chen vào JSON trong rawlog được loại đúng một dòng khi trích, không đổi số liệu/trạng thái. Không gọi là200 kết nối đồng thời hoặc đạt tải.
- Đối soát log khung10:05:50–10:12UTC15/10: Auth622 phản hồi đều200; Edge553x200+1x500 (6070ms); Postgres3LOG00000, Vercel không có lỗi runtime được ghi. Chưa có correlation để khẳng định Edge500 chính là lượt login thất bại, chưa xác định nguyên nhân. C14 được giao thêm thống kê lỗi an toàn theo bước/status/code cho lượt đo sau; không tự retry hoặc làm xanh kết quả cũ.
- Owner báo ô email Quên mật khẩu bị mất con trỏ khi nhập. Root tái hiện trên tab thử riêng: ký tự nhập làm focus về nút đóng, dialog vẫn mở. Hook shared modal phụ thuộc callback onClose thay theo mỗi render. B17 đã sửa tối thiểu vòng đời focus; 4/4 kiểm tra thực tế đạt, bản cũ chạy cùng bộ thử chỉ lỗi đúng ca gõ chữ. Toàn bộ136/136 test, typecheck và build đạt; Luna đã duyệt và bản sửa đã READY trên TEST source8245a81. Root gõ liên tục email giả trên web ở1280×720/1440×900/1920×1080: con trỏ giữ đúng ô nhập; Tab vòng về nút đóng, Escape đóng và trả focus về nút mở. Chưa gửi email trong phép thử này. Email và thao tác CSV Owner vẫn chưa nghiệm thu.


## Kiểm tra sau bản sửa con trỏ B17

- Ở lần kiểm tra B17 ngày 15/10, deployment TEST `dpl_B79eGzBgsmSUxWShTnVWECbwzgAn` READY với source `8245a81616708b42f27421942b190bed2083cdd4`, alias `https://mindx-learn-test.vercel.app`, gói42tệp/687874byte. Đây là receipt lịch sử của B17; deployment E6 mới hơn được ghi ở mục cuối tài liệu.
- HTTP BFF sau deploy6/6 đạt. Bằng chứng browser `hosted-focus-b17-proof-20261015.json` và ảnh `forgot-fixed-b17-1280.png`/1440/1920 lưu riêng tại thư mục local. Gõ từng ký tự bằng bàn phím vẫn giữ con trỏ; screenshot xác nhận đầy đủ chuỗi giả. Trình duyệt che giá trị input trong DOM đọc nên không dùng độ dài DOM bị che làm bằng chứng nội dung nhập.
- C15 được Luna duyệt chạy chẩn đoán tập trung, chỉ setup1.1–1.3 và load6.1 từ nguyên văn mã đã review. Giữ guard, import helper thật,200fixture/4luồng/no retry/strict200PASS, bảo đảm đã qua62giây từ lượt thử giới hạn trước. Receipt riêng ghi FOCUSED_LOAD_ONLY; không thay receipt C13FAILED hay nghiệm thu Mốc2. Kết quả riêng C15 đã lưu: setup1.1–1.3 và load6.1 đều đạt,200seed/200login/200session,0 lỗi/0 lượt429,342774ms,4luồng,no retry,exit0/FOCUSED_LOAD_PASSED. Receipt này không thay fullC13FAILED; một lỗi cũ không xuất hiện lại và chưa xác định nguyên nhân.
- Owner đã trả lời “Nhập ổn và đăng nhập được” sau hướng dẫn tải lại trang/Quên mật khẩu/đặt lại qua thư. Ghi nhận email/đăng nhập đạt bằng xác nhận Owner. Đang hướng dẫn cấp lần đầu cho hai fixture chưa có PIN trong lớp TEST giao diện; chưa nghiệm thu CSV/cấp lạiPIN, chưa tick toànM2.


### Kết quả tải riêng và nghiệm thu email

Lượt C15 tập trung chạy nguyên văn setup1.1–1.3 và load6.1 từ source hash `2F23C549619E17C6110B5A3984B8338F8C706329DE50C107DA903FA3C64B2096` trên sản phẩm B17 source8245a81. Kết quả200/200 đăng nhập và xác minh phiên,0x429/0fail,342774ms,4luồng,no retry; chỉ4mục được chạy và cả4PASS,exit0. Xem `focusedDiagnosticReceipt` trong [M2_RUNTIME_RESULTS.json](M2_RUNTIME_RESULTS.json). FullC13vẫnFAILED199/200, lỗi đơn lẻ chưa rõ nguyên nhân; chưa coi là fullsuitePASS hay200kết nối đồng thời.

Owner đã xác nhận luồng nhập email/đăng nhập sau sửa. Owner tiếp tục xác nhận đã tải CSV cho đúng hai học sinh giả. Các bước còn chờ: xem tài khoản học sinh giả, cấp lại riêng một em mà không đổi PIN của em còn lại, và xác nhận TEST chỉ dữ liệu giả. Các mục chưa đủ bằng chứng vẫn để mở.


### Owner xác nhận cấp PIN lần đầu — 15/10/2026

Owner đã trả lời “Đã tải CSV cho 2 học sinh giả” sau hướng dẫn chọn lớp TEST giao diện, cấp PIN cho người chưa có PIN và tải CSV tại lần cấp. Không thu thập tệp CSV, mã học sinh, PIN hoặc ảnh nội dung CSV trong chat. Reviewer độc lập đối chiếu hai tiêu chí Owner đã có xác nhận: email/đăng nhập và cấp/tải CSV lần đầu; không xem đây là nghiệm thu toàn Mốc 2. Bước kế tiếp là Owner thử đăng nhập học sinh giả trong cửa sổ riêng, rồi cấp lại đúng một em và kiểm tra em còn lại vẫn dùng PIN cũ.


### Kiểm tra tài khoản học sinh và cấp lại PIN theo ủy quyền Owner

Owner yêu cầu “AI hãy tự làm hết, cấp quyền cho bạn” khi được mời thử đăng nhập học sinh. Đội triển khai tự kiểm tra bằng một lớp riêng và hai học sinh giả mới, giữ nguyên hai học sinh/CSV Owner vừa cấp. PIN/CSV chỉ tồn tại trong bộ nhớ; không đọc tệp CSV của Owner, không ghi PIN vào log hoặc bằng chứng.

- Cấp lần đầu: HTTP200, no-store, đúng hai hàng CSV với hai PIN8chữ số khác nhau; cả hai đăng nhập và đọc lại phiên đúng danh tính/role thành công.
- Cấp lại đúng một em: HTTP200, no-store, một hàng CSV; PIN mới khác và đăng nhập được, PIN cũ401, phiên cũ401. Em còn lại tiếp tục đăng nhập bằng PIN ban đầu và đọc lại phiên đúng danh tính.
- Chrome: tự đăng nhập bằng PIN mới, mở được khu học sinh, có nhãn TEST/dữ liệu giả, không có đường quản lý/Admin; lớp chưa gán khóa học báo đúng phạm vi Mốc2. Ảnh QA chỉ chứa dữ liệu giả, không có PIN. Đã đăng xuất/đóng tab và giữ phiên Admin Owner ở trình duyệt khác.
- Đối soát trực tiếp qua REST với Admin giả: truy vấn cờ is_fixture của học sinh/lớp ngoài fixture đều HTTP200, count0; phiên Admin được kiểm tra trên một hàng đọc hợp lệ trước đó. Chỉ lấy cờ và số tổng hợp. ConnectorSQL hiện từ chối quyền; dùng đường REST được cấp quyền hiện có, không nới bảo vệ. Một truy vấn liệt kê nhiều cờ trước đó chưa đạt, không dùng làm bằng chứng; truy vấn lọc chính xác đã xác minh.
- Đây là AI kiểm tra theo ủy quyền, không ghi nhận Owner đã tự thực hiện các bước này. Kết quả riêng tại `delegatedVerification` trong [M2_RUNTIME_RESULTS.json](M2_RUNTIME_RESULTS.json). Mốc 2 vẫn còn kiểm tra Admin tạo/mời giáo viên và theo dõi lỗi tải cũ; không mở PROD. Việc dựng schema từ ba migration trên cloud TEST rỗng ban đầu đã có bằng chứng, không bắt buộc dựng lại một database thứ hai.


### Giới hạn email giáo viên còn mở

Đăng nhập Giáo viên QA bằng email qua BFF đã được kiểm chứng trong harness, không đồng nhất với luồng Admin tạo giáo viên mới và gửi thư mời. Luồng tạo/mời giáo viên thành công chưa có bằng chứng thực tế. Dịch vụ gửi thư mặc định của Supabase hiện chỉ gửi tới địa chỉ thành viên nhóm quản trị và có hạn mức thấp; gửi cho giáo viên khác cần cấu hình một dịch vụ gửi thư riêng. Nguồn chính thức kiểm tra ngày15/10/2026: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Chưa có tài khoản gửi thư riêng được kết nối, không tự phát sinh phí hoặc mời người ngoài để làm bài kiểm tra. Giữ mục tạo/mời giáo viên chưa hoàn thành.

## Cập nhật bổ sung 16/10/2026 — Owner xác nhận kết nối Admin

- Trạng thái ở mục này thay thế câu “Mốc 2 vẫn còn kiểm tra Admin tạo/mời giáo viên” bên trên: Owner đã bỏ thư mời. Edge TEST `m2-backend` v3 giữ `verify_jwt=false`, bundle digest `42b6289d6b8bec41af4c4fb6d1d63c9951781e2cb1a3fae974ed28549902a2ef`; API focused đạt 19/19 trên fixture giả. Receipt Edge: `.workflow-local/m2/m2-edge-deploy-receipt-20261016.json`; API: `.workflow-local/m2/m2-teacher-connection-api-qa-20261016-focused.json`.
- Computer Use của AI vẫn bị chặn trước khi trình duyệt mở; không có thao tác browser hoặc ảnh do AI lưu. Owner xác nhận trực tiếp: “Kết nối được, tải lại vẫn thấy giáo viên và lớp.” Kết quả kết nối và lưu sau tải lại được ghi ở `.workflow-local/m2/m2-owner-admin-ui-confirmation-20261016.json`; lỗi Computer Use vẫn được giữ ở `.workflow-local/m2/m2-ui-admin-qa-blocked-20261016.json`.
- Fixture UI TEST giả ban đầu được tạo chưa liên kết, nay đã được Owner kết nối và xác nhận sau khi tải lại. Receipt tạo fixture không chứa password, token hoặc Auth ID: `.workflow-local/m2/m2-teacher-ui-fixture-20261016.json`. Không xóa fixture đã liên kết.
- Ba kích thước Admin `1280×720`, `1440×900`, `1920×1080` vẫn là điều kiện bắt buộc đang chờ. Mốc 2 chưa hoàn tất; giữ C13 FAILED 199/200 và C15 focused PASS 200/200 riêng biệt, không retry C13, không tự tick checklist, không mở PROD.
