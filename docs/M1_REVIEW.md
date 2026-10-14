# Review độc lập Mốc 1

## Kết quả review snapshot sau M1-F — 14/10/2026

**Verdict: Mốc 1 chưa hoàn thành.** Chỉ mục bảo toàn tài liệu (1/10 checkbox Mốc 1) được xác nhận và vẫn được tick. Chín mục còn lại giữ `[ ]`; không thay đổi checklist Mốc 2–6.

- Reviewer độc lập: GPT-6 Luna (`gpt-6-luna`), mức suy luận `max`.
- Không có commit để tham chiếu: `main` chưa có commit và các tệp dự án hiện chưa được Git theo dõi. Để chốt đúng snapshot trước commit, SHA-256 manifest của 42 tệp trong `src/`, `public/`, `tests/`, `tools/`, `scripts/` và các cấu hình build/package (`package.json`, lockfile, TypeScript, Next, PostCSS, Tailwind, `.gitignore`, `.vercelignore`) là `987CBA27B871FEDC60EA7C644476CA14701251EAC8601461F4DB8B612254CF74`. Manifest được tính bằng cách sắp xếp đường dẫn tương đối, ghép mỗi dòng `đường-dẫn|SHA256-tệp`, rồi băm SHA-256 toàn bộ văn bản UTF-8.
- `teachingmindx-sync-trial.html` có SHA-256 `A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5`, khớp baseline. Bản sao kế hoạch trước Mốc 1 `.workflow-local/m1/PROJECT_PLAN.before-m1-20261014-103628.md` có SHA-256 `BAC97FE0CFD89332D9C1D73E1B1E727A78C6B422495E5FC7C1C44B3D89BBD5BF`, khớp baseline. `PROJECT_PLAN.md` hiện có SHA-256 `CCCF2697907FC7719AC9FE70EFE709367770681B7806E755F9693FB2AB0BC368`; review này không sửa tệp kế hoạch.
- Luna tự chạy tuần tự sau M1-F: `npm run typecheck` exit 0; `npm test` exit 0, 15/15 pass; `npm run build` exit 0, Next.js 16.4.0 tạo 13 route ứng dụng. Test có cảnh báo `MODULE_TYPELESS_PACKAGE_JSON` tại `src/lib/simulation-rules.ts`; cảnh báo không làm hỏng kiểm tra.
- Bằng chứng của Sol trong `docs/M1_EVIDENCE.md` ghi nhận 14/14 đường dẫn cục bộ trả HTTP 200 sau M1-F, gồm `/teaching-readonly/index.html`; UI-08 hiện dùng đường dẫn cùng website và không còn địa chỉ `127.0.0.1`. Luna kiểm tra lại source và xác nhận liên kết khớp trang tĩnh trong `public/`.
- Các lỗi source-review sớm về bài nháp của học sinh, lớp giáo viên ngoài phân công, danh sách giáo viên không theo store và hỗ trợ bàn phím cho hộp thoại đã được sửa trong snapshot hiện tại. UI-05 hiện có tạo/sửa khóa bằng dữ liệu giả và tạo đúng 14 buổi nháp; bằng chứng Sol ghi nhận thao tác tạo, trạng thái “Đang lưu…” và sửa tên thành công.

| Checkbox Mốc 1 | Trạng thái review | Lý do nếu chưa tick |
|---|---|---|
| Bảo toàn tài liệu | `[x]` Đạt | Hash HTML thử khớp baseline; có bản sao timestamped của kế hoạch trước Mốc 1. |
| Spike Teaching chỉ đọc | `[ ]` Chưa kiểm chứng | Chưa có lượt Owner đăng nhập Teaching và bấm tiện ích; test hiện tại dùng DOM giả. |
| Khung bốn khu và điều hướng vai trò | `[ ]` Chưa nghiệm thu | Route và nhãn dữ liệu giả có trong source/build; chưa kiểm tra đủ các luồng bằng trình duyệt cùng Owner. |
| Các trang UI-01 đến UI-13 | `[ ]` Chưa kiểm chứng đầy đủ | Build xác nhận 13 route; thao tác trình duyệt mới được ghi nhận ở `/admin/courses`, chưa duyệt từng luồng. HTTP 200 chỉ xác nhận đường dẫn mở được. |
| Trạng thái tải, trống, lỗi, hết phiên, thiếu quyền, đang lưu và lưu thất bại | `[ ]` Chưa kiểm chứng đầy đủ | Source có trạng thái mô phỏng dùng chung và xử lý lưu theo thao tác; chưa chạy toàn bộ trạng thái trên các luồng bằng trình duyệt. |
| Đưa TEST lên staging | `[ ]` Chưa đạt | Vercel project đã tạo nhưng chưa có deployment hoặc URL; chưa kiểm tra bản web từ bên ngoài. |
| Ba kích thước desktop | `[ ]` Chưa kiểm chứng | Chưa kiểm tra trực quan 1280×720, 1440×900 và 1920×1080. |
| Owner mở TEST và bấm các màn hình | `[ ]` Chờ Owner | Chưa có bản TEST/URL và xác nhận Owner trên đúng bản đó. |
| Owner bấm thử đọc Teaching | `[ ]` Chờ Owner | Chưa chạy lượt Teaching thật. |
| Owner xác nhận chi phí và dữ liệu thật không vào TEST | `[ ]` Chờ Owner | Chưa có xác nhận nghiệm thu của Owner trên bản TEST. |

Lượt xem lại trình duyệt cục bộ của Codex bị chính sách bảo vệ chặn tại `127.0.0.1`. Không tìm cách vượt chặn. Vì vậy không dùng lượt kiểm tra một màn hình trước đó để khẳng định toàn bộ UI hoặc bố cục responsive đã đạt. Cần có deployment URL để tiếp tục kiểm tra giao diện và để Owner nghiệm thu.

Các mục source-review bên dưới là ghi nhận lịch sử của snapshot trước các gói sửa C/D/F; trạng thái hiện tại được xác định bởi phần review mới này. Không dùng chúng thay cho kiểm tra browser hoặc nghiệm thu Owner.

## Đánh giá đề xuất spike Teaching bằng bookmarklet (chưa thực hiện)

Bookmarklet chỉ đọc DOM có thể đáp ứng mục “thử đọc Teaching” ở Mốc 1 nếu Owner tự đăng nhập và bấm trên đúng trang; mã chỉ đọc bảng đang hiển thị, đếm trong lúc chạy và chỉ hiện kết quả tổng hợp ngay trên trang. Không gọi `fetch`/XHR, không đọc cookie/storage, không gửi dữ liệu ra ngoài, không ghi vào nguồn, clipboard hay tệp. Báo rõ số hàng là của trang hiện tại; chỉ nêu trang hiện tại/tổng trang nếu giao diện nguồn thể hiện rõ, không suy ra tổng số học sinh từ đó.

Spike như vậy chỉ xác nhận đường đọc hẹp qua phiên Owner cho trang đang mở. Nó không xác nhận đã đọc hết roster, đủ phân trang, khóa ID ổn định, mapping trạng thái/lớp hay khả năng đồng bộ; các việc đó vẫn chờ Mốc 4. Nếu mất phiên, cấu trúc trang không rõ hoặc CSP/chính sách trình duyệt chặn bookmarklet, dừng và ghi chưa đạt, không tìm cách vượt chặn. Nhận xét này diễn giải yêu cầu UI/tiện ích của Mốc 1 cùng phạm vi đầy đủ phân trang của Mốc 4; chưa có lượt chạy bookmarklet thực tế.

Tham chiếu giới hạn trình duyệt: [Same-origin policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) nêu script từ URL `javascript:` kế thừa origin trang chứa nó; [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) nêu CSP có thể chặn `javascript:` URL.

## Review source giao diện sớm — 14/10/2026 (chưa phải kết luận cuối)

Đã đọc tĩnh một số trang và thành phần dùng chung trên snapshot hiện có để báo lỗi sớm cho Sol. Các file dưới đây có thời điểm sửa từ 10:44 đến 10:52 ngày 14/10/2026; hash tại lúc kiểm tra được ghi để đối chiếu lại. Vì gói B đang chỉnh mã và trang thử chưa chạy ổn định, các lỗi này chưa được xác nhận trên trình duyệt và phải kiểm tra lại đúng bản bàn giao. Không thay đổi checkbox nghiệm thu.

1. **Học sinh nhìn thấy bài nháp và có thể mở bài nháp bằng đường dẫn trực tiếp.** `src/app/student/course/page.tsx` không lọc bài theo trạng thái xuất bản trước khi dựng danh sách (dòng 61–63), rồi hiện nội dung bài (dòng 109–114). Trang bài và quiz cũng chỉ kiểm tra bài có tồn tại, không chặn trạng thái nháp (`src/app/student/lessons/[lessonId]/page.tsx`, dòng 28 và 56; `src/app/student/lessons/[lessonId]/quiz/page.tsx`, dòng 25 và 51). Điều này trái yêu cầu UI-11 rằng học sinh chỉ thấy bài đã xuất bản. Cần ẩn bài nháp khỏi danh sách và chặn cả đường dẫn trực tiếp.
2. **Giáo viên có thể chọn lớp ngoài phân công và thấy roster của lớp đó.** `src/app/manage/classes/page.tsx` tạo bộ chọn từ toàn bộ danh sách lớp (dòng 248); roster được lấy theo lớp đang chọn (dòng 101–105). Fixture hiện có ba lớp, trong khi giáo viên mẫu chỉ được phân công hai lớp đầu (`src/lib/mock-data.ts`, dòng 25 và 128–152). Cần giới hạn cả lớp mặc định, bộ chọn và dữ liệu roster theo các lớp được giao. Điều này trái quy tắc §2/§3 và UI-04.
3. **Giáo viên vừa tạo biến mất khỏi bảng sau khi rời trang hoặc tải lại.** `src/app/admin/teachers/page.tsx` khởi tạo bảng từ danh sách cục bộ cố định (dòng 22–37), dù thao tác tạo cũng ghi người dùng vào store (dòng 65–81; `src/lib/store.tsx`, dòng 508–517). Bảng không lấy danh sách đã tạo từ store nên hai phần không đồng bộ. Cần dùng cùng một nguồn danh sách.
4. **Modal và hộp xác nhận thiếu hỗ trợ truy cập bàn phím/trình đọc màn hình.** `src/components/modal.tsx` chưa đánh dấu ngữ nghĩa hộp thoại, nút đóng chỉ có biểu tượng, không xử lý phím Escape và không giữ điểm chọn trong hộp đang mở (dòng 26–40, 62–81, 111–149). Người dùng dựa vào bàn phím hoặc trình đọc màn hình có thể khó nhận biết/điều khiển hộp. Ưu tiên thấp hơn hai lỗi về quyền xem dữ liệu.

Hash snapshot: `src/app/student/course/page.tsx` `D95381113CBB4EBA8A98CCB3821316C747CADEFBDE9EC61FE2640A8AEA180EF6`; `src/app/student/lessons/[lessonId]/page.tsx` `1B48FBF1561741A6D0B258203F4DF43CAE30B438BE7C3D5295ACF4F17BEB97D4`; `src/app/student/lessons/[lessonId]/quiz/page.tsx` `2DB9631C65BD452D2293896B5F93C96AFBE8321D7474CD567C1B20A1C7EE1C18`; `src/app/manage/classes/page.tsx` `E6A07655B2291234193C569FEC8B37A62CC8040D9FFEBFCF5522AA19DC76B0A2`; `src/app/admin/teachers/page.tsx` `9EB41997FFAE9CB0BDFB22910AFE3D38FDCDE599703966B95D3A1D5CEB1F9B3F`; `src/components/modal.tsx` `B090BFC61B99BD4209B95FBBA24591615F47A30FCA7CCA0CE559A58477CC7136`.


## Kiểm tra sớm trạng thái dùng chung — chưa phải kết luận cuối

PROJECT_PLAN.md §4 yêu cầu mọi trang có trạng thái tải, rỗng, lỗi/thử lại, không đủ quyền, hết phiên, đang lưu và lưu thất bại. Trong snapshot đọc lần này, `src/app/layout.tsx` chỉ bọc `StoreProvider`, `Navbar`, nội dung trang và `QAController`; không có lớp trạng thái chung cho các trang. `src/lib/store.tsx` chỉ đổi `delayMs` khi chọn Loading; tìm kiếm source thấy delay được dùng ở đăng nhập, gửi/chấm bài và quiz, nhưng UI-05 `/admin/courses` không đọc trạng thái này. Vì vậy chọn Loading ở QAController vẫn để trang khóa học hiện như bình thường. Khi chọn Dữ liệu rỗng, Provider đưa danh sách khóa/bài về rỗng, nhưng UI-05 vẫn hiện bảng 14 vị trí không có dòng hay thông báo “chưa có dữ liệu”. Các lỗi mạng/hết phiên/thiếu quyền/lỗi lưu hiện chủ yếu được trả về từ hàm thao tác ghi; không có phản hồi chung cho trang đang đọc.

Cụ thể hơn, `session_expired` chỉ làm `checkQABlock` từ chối thao tác, không xóa `currentUser` hoặc thay nội dung trang; đồng thời `login()` cũng gọi cùng helper nên đăng nhập lại bị từ chối khi kịch bản hết phiên còn bật (`src/lib/store.tsx`, dòng 192–224 và 234–237 trong snapshot). Đây là thiếu sót của mô phỏng UI: người kiểm thử chọn hết phiên nhưng vẫn ở lại dữ liệu/điều hướng hiện tại, rồi không thể đi qua luồng đăng nhập lại như người dùng thật. Khuyến nghị gói D thêm status boundary dùng chung cho tải/lỗi kết nối/403/hết phiên (hết phiên cần xóa phiên mẫu và cho phép mở lại đăng nhập); thông báo rỗng gắn theo từng trang/danh sách; trạng thái đang lưu và lưu thất bại gắn với chính thao tác.

Hash snapshot: `src/app/layout.tsx` `65C4C341BFA4CD2892EB0C7CF1B367933C4864ED592F1A8219A91F1F35590E8B`; `src/app/admin/courses/page.tsx` `A8015A7F8F3B1F3A458E3E26162080A8080F2CB77B7E2168BF4B02E012EB9395`; `src/lib/store.tsx` `A0A28BD27B0F922EDECC07DC7B11681150EBA5960036862A79572CDCFF4198DD`; `src/components/qa-controller.tsx` `4BBEF573C1304F3E0984F897E8E0A31F311C4F2C215FDD29DF899F468548B2F9`. Đây là review source-only; chưa chạy browser với trạng thái QA này và chưa tick nghiệm thu.


## Finding UI-05 trong snapshot trước khi bổ sung tạo/sửa khóa

Đối chiếu `PROJECT_PLAN.md` §4, dòng 92 với `PROMPT_MOC_1.md` §C, dòng 64 và 68: Mốc 1 yêu cầu luồng chính UI-05 bấm thử được; thao tác chưa có xử lý thật được phép mô phỏng bằng dữ liệu giả. Snapshot cũ chỉ chọn ngầm khóa đầu tiên, hiện một curriculum và 14 hàng buổi học/link sang UI-06. Không có danh sách/chọn khóa hoặc nút tạo/sửa khóa. Vì vậy Admin chưa thể thử phần UI-05 “tạo/sửa khóa” trong snapshot đó, dù việc lưu vào cơ sở dữ liệu thật có thể chờ Mốc 3. Gói sửa tối thiểu khi ấy là thêm danh sách/chọn khóa và thao tác tạo/sửa khóa bằng dữ liệu giả; vẫn giữ 14 vị trí Buổi 1–14 cố định. Đây là finding source-only của snapshot cũ, không phải trạng thái source hiện tại và không phải bằng chứng nghiệm thu toàn bộ UI-05. Snapshot review mới nhất phía trên ghi nhận thao tác tạo/sửa đã được bổ sung và Sol đã thử tạo khóa 14 buổi rồi sửa tên thành công.

Hash snapshot `src/app/admin/courses/page.tsx`: `A8015A7F8F3B1F3A458E3E26162080A8080F2CB77B7E2168BF4B02E012EB9395` (sửa lần cuối 14/10/2026 10:49:08).
