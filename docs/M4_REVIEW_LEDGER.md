# Sổ Đối Chiếu Review Độc Lập Mốc 4 (Rounds 1–8)

Tài liệu này ghi nhận đầy đủ các phát hiện (findings) từ 8 vòng review độc lập của Codex CLI (`gpt-6.1-sol`, mức suy luận `xhigh`) trên nhánh `codex/moc-4` cùng vị trí mã nguồn và bài kiểm thử tự động đã đóng từng mục.

---

## 1. Bảng đối chiếu đường dẫn tệp Mốc 4

- **Giao diện đồng bộ có xem trước [UI-08]:** `src/app/admin/sync/page.tsx`
- **Bộ đọc phân trang DataTables, phân loại trạng thái, đối chiếu ID & áp dụng fixture:** `src/lib/teaching-sync-core.mjs`, `src/lib/simulation-rules.ts`, `src/lib/teaching-sync.ts`
- **Tiện ích Dấu trang Cục bộ (Local Read-Only Bookmarklet):**
  - Mã nguồn lõi: `tools/teaching-readonly/reader-core.mjs`
  - Trình tạo dấu trang tĩnh: `scripts/generate-teaching-bookmark.mjs`
  - Bản phát hành tĩnh phục vụ trình duyệt: `public/teaching-readonly/bookmarklet.js`, `public/teaching-readonly/index.html`, `public/teaching-readonly/manifest.json`
- **Kho trạng thái & đồng bộ máy chủ (Store / BFF / Edge / SQL):**
  - Store: `src/lib/store.tsx`
  - BFF Route: `src/app/api/m2/[action]/route.ts`
  - Edge Function: `supabase/functions/m2-backend/index.ts`
  - SQL Migration (Atomic RPCs): `supabase/migrations/20261020140000_m4_teaching_sync.sql`
- **Bộ dữ liệu mẫu nhiều trang (Synthetic Multi-Page Fixture):** `public/fixtures/teaching_mock.json`
- **Bộ kiểm thử tự động Mốc 4:** `tests/m4-teaching-sync.test.mjs`, `tests/teaching-readonly.test.mjs`

---

## 2. Vòng 1 (Round 1 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R1-F1 | P1 | `applyTeachingSync` chỉ lưu trong bộ nhớ trình duyệt (`React state` / `localStorage`), chưa ghi bền vững lên máy chủ TEST và chưa cô lập theo vai trò khi tải lại trang. | Bổ sung hành động `apply-teaching-sync` và `reset-teaching-sync` xuyên suốt `src/lib/store.tsx`, `src/lib/server/crypto.ts`, `src/app/api/m2/[action]/route.ts`, và `supabase/functions/m2-backend/index.ts`; sau khi áp dụng gọi `refreshData()` từ máy chủ và không ghi đè dữ liệu máy chủ bằng `localStorage`. | `M4-9` (`tests/m4-teaching-sync.test.mjs`) |
| R1-F2 | P2 | Bộ đọc phân trang trong `tools/teaching-readonly/reader-core.mjs` dừng vòng lặp khi `pageIndex >= maxPages` nhưng trả về `success: true` thay vì hủy toàn bộ lượt đọc (`MAX_PAGES_EXCEEDED`). | Kiểm tra `expectedRecordsFiltered !== null && start < expectedRecordsFiltered` sau vòng lặp trong `tools/teaching-readonly/reader-core.mjs`, `src/lib/teaching-sync-core.mjs` và `src/lib/simulation-rules.ts` để trả về `makeAbort('MAX_PAGES_EXCEEDED', ...)`. | `M4-7` (`tests/m4-teaching-sync.test.mjs`) |
| R1-F3 | P2 | `String(row.id).trim()` ép kiểu đối tượng/mảng (`{}` / `[]`) thành chuỗi `"[object Object]"` thay vì từ chối cấu trúc dòng sai. | Kiểm tra nghiêm ngặt `typeof row.id === 'string' \|\| (typeof row.id === 'number' && Number.isFinite(row.id))` trước khi chuẩn hóa trong cả 3 bộ đọc (`reader-core.mjs`, `teaching-sync-core.mjs`, `simulation-rules.ts`). | `M4-7` (`tests/m4-teaching-sync.test.mjs`) |
| R1-F4 | P2 | Cách tạo ID nội bộ bằng `replace(/[^a-zA-Z0-9_-]/g, '_')` có thể gây va chạm giữa hai mã học sinh chỉ khác ký tự đặc biệt. | Thay bằng hàm mã hóa bảo toàn không mất thông tin `buildLosslessDeterministicId` và kiểm tra va chạm `INTERNAL_ID_COLLISION` trước khi thêm bản ghi. | `M4-8` (`tests/m4-teaching-sync.test.mjs`) |

---

## 3. Vòng 2 (Round 2 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R2-F1 | P2 | Khi `applyTeachingSync` hoặc `resetTeachingFixtureSync` gặp lỗi mạng (`catch`), `src/lib/store.tsx` tự động áp dụng thay đổi vào state cục bộ trong chế độ không phải demo. | Sửa khối `catch` trong `src/lib/store.tsx`: chỉ cho phép fallback cục bộ khi `isDemoMode()` bật; khi chạy chế độ máy chủ thật mà lỗi mạng thì đóng an toàn (`fail-closed`, `success: false`). | `M4-9` (`tests/m4-teaching-sync.test.mjs`) |
| R2-F2 | P2 | Tab 2 ("Nguồn Teaching MindX Thật") dùng chung biến state với Tab 1 nên tự hiển thị báo cáo `35/35` của fixture giả ngay khi vừa đọc ở Tab 1. | Tách biệt hoàn toàn state `diffReport` (Tab 1) và `sampleAggregatePreview` (Tab 2) trong `src/app/admin/sync/page.tsx`, kèm nhãn rõ ràng nguồn mẫu dữ liệu giả. | `M4-10` (`tests/m4-teaching-sync.test.mjs`) |
| R2-F3 | P2 | Bấm liên tiếp nhiều nút kịch bản trên `UI-08` có thể khiến phản hồi cũ về muộn ghi đè kết quả mới. | Bổ sung bộ đếm tuần tự `previewReqSeqRef` và `sampleAggregateReqSeqRef` trong `src/app/admin/sync/page.tsx` để hủy bỏ mọi phản hồi bất đồng bộ đến muộn. | `M4-10` (`tests/m4-teaching-sync.test.mjs`) |

---

## 4. Vòng 3 (Round 3 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R3-F1 | P1 | `apply-teaching-sync` trên Edge thực hiện tuần tự nhiều lệnh `insert`/`update` không nằm trong một giao dịch DB nguyên tử; nếu lỗi ở bản ghi sau sẽ để lại dữ liệu một phần hoặc `profiles` mồ côi. | Chuyển toàn bộ logic ghi và khôi phục vào 2 hàm RPC PL/pgSQL chạy trong 1 giao dịch nguyên tử (`public.m4_apply_teaching_sync` và `public.m4_reset_teaching_sync` trong `supabase/migrations/20261020140000_m4_teaching_sync.sql`). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R3-F2 | P2 | Bản xem trước cũ (`stale preview`) có thể ghi đè họ tên hoặc lớp vừa được Admin cập nhật trên máy chủ sau thời điểm xem trước; `BFF` chưa chuyển tiếp `previousName` / `previousClassCode`. | Giữ nguyên `previousName` và `previousClassCode` qua `BFF` (`src/app/api/m2/[action]/route.ts`), kiểm tra khóa dòng `FOR UPDATE` và đối chiếu `previousName` / `previousClassCode` trong cả `applyTeachingSyncDiffToState` và RPC `public.m4_apply_teaching_sync` (trả mã `409 STALE_PREVIEW_CONFLICT` nếu lệch). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R3-F3 | P2 | `reset-teaching-sync` xóa mọi lớp có `is_fixture = true` đang trống, vô tình xóa cả lớp do Admin tạo thủ công (`create-class` cũng đặt `is_fixture = true`). | Thêm cột đánh dấu riêng `m4_synced BOOLEAN NOT NULL DEFAULT false` trên `classes`, `profiles`, `students` và cột `m4_previous_full_name` trên `students`; `m4_reset_teaching_sync` chỉ xóa bản ghi có `m4_synced = true`. | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |

---

## 5. Vòng 4 (Round 4 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R4-F1 | P1 | Máy chủ (`BFF`, `Edge`, `SQL RPC`) mặc định `sourceMode` bị thiếu thành `'synthetic_fixture'` và chưa đối chiếu danh mục bản ghi với bộ fixture mẫu Mốc 4, nên một request giả mạo có thể ghi dữ liệu ngoài mẫu vào TEST. | Bắt buộc `sourceMode === 'synthetic_fixture'` tường minh (từ chối nếu thiếu) và kiểm tra đối chiếu toàn bộ `newClassesToCreate`, `updated`, `added` với danh sách chuẩn `CANONICAL_M4_SYNTHETIC_CLASSES` & `CANONICAL_M4_SYNTHETIC_STUDENTS` tại cả 4 tầng: `src/lib/teaching-sync-core.mjs`, `src/lib/simulation-rules.ts`, `src/app/api/m2/[action]/route.ts`, `supabase/functions/m2-backend/index.ts`, và `supabase/migrations/20261020140000_m4_teaching_sync.sql`. | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R4-F2 | P2 | `normalizeClassCode` xóa toàn bộ khoảng trắng bên trong (`replace(/\s+/g, '')`) trong khi SQL chỉ `btrim`, có thể làm mã lớp `"ROB X"` bị gộp nhầm vào lớp `"ROBX"`. | Sửa `normalizeClassCode` chỉ chuẩn hóa khoảng trắng liên tiếp thành 1 khoảng trắng đơn (`value.trim().replace(/\s+/g, ' ').toUpperCase()`) đồng bộ với SQL (`regexp_replace(btrim(...), '\s+', ' ', 'g')`), đồng thời bổ sung `compactClassCodeKey` để phát hiện xung đột khoảng trắng mã lớp (`AMBIGUOUS_CLASS_CODE_SPACING`) và đưa vào `needsReview`. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |
| R4-F3 | P2 | Trên `UI-08` (`src/app/admin/sync/page.tsx`), người dùng vẫn có thể bấm `Hủy bỏ` hoặc `Khôi phục` trong khi `Xác nhận Áp dụng Fixture` đang chạy bất đồng bộ. | Bổ sung khóa đồng bộ `inFlightMutationRef` và cờ `isMutating = isApplyingSync \|\| isResetting` để vô hiệu hóa và chặn toàn bộ thao tác `Hủy bỏ`, `Khôi phục`, chuyển tab, đổi bộ lọc ROB và đọc kịch bản trong suốt thời gian đang áp dụng hoặc khôi phục. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |
| R4-F4 | P2 | Đổi radio `robFilterMode` trong lúc lượt đọc xem trước đang tải (`isLoading === true`) chỉ đổi giao diện radio mà không hủy/chạy lại lượt đọc theo chế độ lọc mới. | Bổ sung `robFilterModeRef` và hàm `handleRobFilterModeChange(nextMode)`: khi đổi bộ lọc lúc `isLoading \|\| diffReport \|\| abortError`, lập tức tăng `previewReqSeqRef` để hủy lượt đọc cũ và khởi chạy lượt đọc mới theo `nextMode`; đồng thời kiểm tra `diffReport.robFilterMode === robFilterModeRef.current` trước khi cho phép `handleApplySync`. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |
| R4-F5 | P2 | `snapshotIdsByBaseName` chỉ lập chỉ mục trên các dòng đã qua bộ lọc ROB và đang học (`isEligibleActive`), nên bỏ sót trường hợp học sinh có mã ID cũ ở trạng thái nghỉ/đóng lớp và được cấp mã ID mới cùng họ tên ở lớp đang chạy trong cùng snapshot. | Lập chỉ mục `snapshotIdsByBaseName` và `snapshotIdsByNormName` trên **toàn bộ** `validatedRows` của snapshot trước khi lọc ROB/trạng thái trong `src/lib/teaching-sync-core.mjs` và `src/lib/simulation-rules.ts`. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |
| R4-F6 | P2 | Bộ đọc nhiều trang chưa kiểm tra mã phiên bản snapshot (`snapshotVersion` / `etag`) giữa các trang và vẫn báo "đã xác thực nhất quán" khi đọc nhiều trang từ nguồn không có mã phiên bản. | Bổ sung trích xuất & đối chiếu `snapshotVersion` giữa các trang trong `tools/teaching-readonly/reader-core.mjs`, `public/teaching-readonly/bookmarklet.js`, `src/lib/teaching-sync-core.mjs`, `src/lib/simulation-rules.ts` (hủy với mã `SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES` nếu thay đổi giữa các trang; đặt `consistencyVerified = false` nếu `pagesRead > 1` mà nguồn không cấp `snapshotVersion`). | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |

---

## 6. Vòng 5 (Round 5 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R5-F1 (hoàn tất R4-F1) | P2 | `newClassesToCreate` kiểm tra `code` thuộc danh sách mẫu nhưng chưa kiểm tra `name` tương ứng, và SQL lấy `v_item->>'name'` từ request khi tạo lớp mới. | Bổ sung `buildCanonicalM4SyncedClassName(code)` và kiểm tra `name` (nếu có) phải khớp tuyệt đối `'Lớp Robotics ' + code + ' (Mới đồng bộ — Chờ Admin gán khóa học)'` tại `src/lib/teaching-sync-core.mjs`, `src/lib/simulation-rules.ts`, `src/app/api/m2/[action]/route.ts`, `supabase/functions/m2-backend/index.ts`, và `supabase/migrations/20261020140000_m4_teaching_sync.sql`; khi tạo lớp mới luôn tự sinh `name` chuẩn từ `code` trên máy chủ. | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R5-F2 (hoàn tất R3-F2) | P2 | Khi mục `updated` thiếu `classCode` hoặc `previousClassCode`, máy chủ chuyển thành chuỗi rỗng rồi bỏ qua bước đối chiếu lớp hiện tại. | Bắt buộc cả `classCode` và `previousClassCode` đều không rỗng (nếu thiếu trả `400 INVALID_DIFF_REPORT`), đối chiếu khớp `canonical.classCode` (`403 REAL_ROSTER_APPLY_FORBIDDEN_IN_M4`), và luôn so sánh `v_curr_class_code <> v_item_class_code OR v_curr_class_code <> v_prev_class_code` (`409 STALE_PREVIEW_CONFLICT`) tại mọi tầng (`teaching-sync-core.mjs`, `simulation-rules.ts`, `route.ts`, `m2-backend/index.ts`, `20261020140000_m4_teaching_sync.sql`). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |

---

## 7. Vòng 6 (Round 6 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R6-F1 | P2 | Nút kiểm tra trên Tab 2 (`handleProbeDirectCrossOriginTeaching` tại `src/app/admin/sync/page.tsx`) chỉ so sánh `window.location.origin !== 'https://teachingmindx.top'` (0 lần gọi mạng) nhưng lại gắn mã `CORS_OR_SOP_BLOCKED` và khẳng định trình duyệt đã chặn kết nối. | Đổi nhãn nút và kết quả hiển thị thành `"Khác nguồn — chưa thử kết nối trực tiếp"` (`DIFFERENT_ORIGIN_DIRECT_READ_NOT_ATTEMPTED`), nêu rõ hệ thống chỉ đối chiếu nguồn hiện tại và chưa thực hiện phép thử kết nối trực tiếp nên không khẳng định đã bị CORS chặn. | `M4-10` (`tests/m4-teaching-sync.test.mjs`) |

---

## 8. Vòng 7 (Round 7 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R7-F1 | P2 | Khi học sinh đồng bộ từ fixture M4 (`m4_synced = true`) đã được cấp mã PIN và nộp tệp thực hành vào kho `m3-practice-files`, thao tác “Khôi phục dữ liệu mẫu ban đầu” (`m4_reset_teaching_sync` / `reset-teaching-sync`) xóa hồ sơ và liên kết bài nộp trên DB nhưng để lại tệp trong kho `m3-practice-files`. | Bổ sung bảng hàng đợi bền vững `private.m4_storage_cleanup_queue`, cập nhật `public.m4_reset_teaching_sync` thu thập toàn bộ đường dẫn tệp trong `m3-practice-files` thuộc riêng học sinh `m4_synced = true` (từ `practice_submissions`, `m3_upload_reservations`, `storage.objects`, loại trừ tệp của học sinh gốc `m4_synced = false`) vào hàng đợi trước khi xóa học sinh và trả về `cleanup_paths`; cập nhật `reset-teaching-sync` trong `supabase/functions/m2-backend/index.ts` xóa các tệp này khỏi `m3-practice-files` và xác nhận qua `public.m4_ack_storage_cleanup` (nếu xóa kho lỗi thì trả `500 STORAGE_CLEANUP_FAILED` và giữ nguyên hàng đợi để lần khôi phục tiếp theo thử lại; nếu reset DB lỗi thì hoàn tác 100% và không gọi xóa kho). Đồng thời bổ sung kiểm thử riêng hành vi bấm nút `Hủy bỏ` xem trước trên `UI-08` không làm thay đổi dữ liệu. | `M4-11`, `M4-12` (`tests/m4-teaching-sync.test.mjs`) |

---

## 9. Vòng 8 (Round 8 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R8-F1 (hoàn tất R7-F1) | P2 | Khi hai lượt Reset đồng thời cùng nhận một danh sách `cleanup_paths`, lượt đầu tiên xóa tệp và xóa hàng đợi nên lượt thứ hai gọi `m4_ack_storage_cleanup` nhận `ROW_COUNT = 0`, dẫn đến báo lỗi giả `500 STORAGE_CLEANUP_FAILED` dù hàng đợi và kho đều đã sạch. | Sửa `public.m4_ack_storage_cleanup` trong `supabase/migrations/20261020140000_m4_teaching_sync.sql` (và bộ mô phỏng trong `tests/m4-teaching-sync.test.mjs`): sau khi xóa các mục đã sạch khỏi `private.m4_storage_cleanup_queue`, đếm số đường dẫn thực sự còn tồn đọng (`v_remaining_count`) trong `private.m4_storage_cleanup_queue` hoặc `storage.objects`, và trả về `array_length(p_paths, 1) - v_remaining_count` để các đường dẫn đã được lượt Reset đồng thời xử lý xong vẫn được ghi nhận hoàn tất. | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R8-F2 | P2 | Bài kiểm thử `Cancel preview` tại `M4-12` (`tests/m4-teaching-sync.test.mjs`) dùng hàm giả `resetTeachingFixtureSync` rỗng và không đếm số lần gọi, nên nếu nút `Hủy bỏ` vô tình gọi `resetTeachingFixtureSync` thì bài test không phát hiện được. | Cập nhật `resetTeachingFixtureSync` trong `M4-12` (`tests/m4-teaching-sync.test.mjs`) tăng biến đếm `resetCallCount++` và làm rỗng `state.classes`/`state.students` nếu bị gọi, đồng thời kiểm tra nghiêm ngặt `assert.equal(resetCallCount, 0)` và `assert.equal(applyCallCount, 1)` sau khi bấm `Hủy bỏ`. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |

---

## 10. Vòng 9 (Round 9 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R9-F1 | P2 | `update-student` trong `supabase/functions/m2-backend/index.ts` cập nhật `public.students` và `public.profiles` bằng hai truy vấn tách rời không có giao dịch chung và không giữ khóa `m4_teaching_sync`, nên nếu xen kẽ với `m4_reset_teaching_sync` hoặc lỗi giữa chừng thì `students.full_name` và `profiles.full_name` bị lệch nhau. | Bổ sung RPC nguyên tử `public.m4_update_student` trong `supabase/migrations/20261020140000_m4_teaching_sync.sql` giữ khóa `pg_advisory_xact_lock(hashtext('m4_teaching_sync'))` + `pg_advisory_xact_lock(hashtext('student:' \|\| p_student_id::text))`, khóa `FOR UPDATE` và cập nhật đồng thời `public.students` + `public.profiles` trong một giao dịch duy nhất (đồng thời xóa `m4_previous_full_name = NULL` khi Admin đổi tên thủ công để không bị tên cũ trước M4 ghi đè khi Reset); cập nhật `action === 'update-student'` trong `supabase/functions/m2-backend/index.ts` gọi `adminClient.rpc('m4_update_student', ...)` và đồng bộ `users.name` trong `src/lib/store.tsx`. | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |

---

## 11. Vòng 10 (Round 10 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R10-F1 (hoàn tất R7-F1) | P2 | Thao tác tải tệp (`public.m3_check_storage_insert_permission`) chỉ giữ khóa `reservation:...` mà không giữ khóa `m4_teaching_sync`, nên một lượt tải tệp đang chạy dở có thể ghi xong vào `storage.objects` sau khi `m4_reset_teaching_sync` và `m4_ack_storage_cleanup` đã hoàn tất, để lại tệp mồ côi. | Cập nhật `CREATE OR REPLACE FUNCTION public.m3_check_storage_insert_permission` trong `supabase/migrations/20261020140000_m4_teaching_sync.sql` giữ khóa `pg_advisory_xact_lock(hashtext('m4_teaching_sync'))` trước `reservation:...`, đồng thời khóa `FOR KEY SHARE OF s` trên `public.students` và `FOR UPDATE` trên `public.m3_upload_reservations` để tuần tự hóa hoàn toàn với `m4_reset_teaching_sync` (nếu upload xong trước thì reset sẽ thu gom & xóa; nếu reset xong trước thì `FOR KEY SHARE`/`FOR UPDATE` thấy học sinh/reservation đã xóa và từ chối `INSERT`). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R10-F2 (hoàn tất R9-F1) | P2 | Khi Admin mở hộp thoại sửa học sinh để chỉ sửa ghi chú (`notes`) và lưu lại đúng `fullName` đang có (sau khi học sinh đã được đổi tên bởi đồng bộ M4), `m4_update_student` vẫn xóa `m4_previous_full_name = NULL` dù tên thực tế không đổi, làm mất khả năng khôi phục tên gốc khi Reset. | Sửa `public.m4_update_student` trong `supabase/migrations/20261020140000_m4_teaching_sync.sql` (và bộ mô phỏng trong `tests/m4-teaching-sync.test.mjs`): chỉ đặt `m4_previous_full_name = NULL` khi `p_update_name` bật **và** tên chuẩn hóa mới thực sự khác tên chuẩn hóa hiện tại (`regexp_replace(btrim(COALESCE(s.full_name, '')), '\s+', ' ', 'g') <> v_clean_name`). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |

---

## 12. Vòng 11 (Round 11 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R11-F1 | P2 | Khi chọn `"Loại trừ ROB"` ở Tab 1 rồi sang Tab 2 bấm `"Xem báo cáo tổng hợp mẫu (Chỉ con số)"`, hàm `handlePreviewAggregateOnlyDemo` truyền `robFilterMode` của Tab 1 và `buildTeachingAggregatePreview` đếm theo `robEval.passesFilter`, khiến ô `"Hợp lệ (ROB + Đang học + Running)"` hiển thị 12 học sinh ngoài ROB thay vì 14 học sinh ROB. | Cố định `robFilterMode: 'include_rob'` trong `handlePreviewAggregateOnlyDemo` tại `src/app/admin/sync/page.tsx` và sửa `buildTeachingAggregatePreview` trong `src/lib/teaching-sync-core.mjs` + `src/lib/simulation-rules.ts` luôn đếm `robEval.hasRob && statusEval.isEligibleActive` cho trường `eligibleActiveRobCount`. | `M4-10` (`tests/m4-teaching-sync.test.mjs`) |

---

## 13. Vòng 12 (Round 12 Findings & Resolution)

| Mã | Mức độ | Nội dung phát hiện | Giải pháp & Vị trí mã nguồn | Bài test kiểm chứng |
|---|---|---|---|---|
| R12-F1 | P1 | Khi phiên đăng nhập đã bị thu hồi hoặc `m2_session_version` tăng lên, `public.current_role()` và `public.current_profile_id()` trả về `NULL`. Trong PL/pgSQL, biểu thức `IF public.current_role() <> 'student'` và `IF v_student_id <> public.current_profile_id()` trả về `UNKNOWN` (không đi vào nhánh `THEN RETURN FALSE / RAISE EXCEPTION`), khiến người giữ JWT cũ có thể vượt qua bước kiểm tra vai trò/chủ sở hữu trong `m3_check_storage_insert_permission` và `m3_reserve_practice_upload`. | Cập nhật `public.m3_check_storage_insert_permission` và ghi đè (`CREATE OR REPLACE FUNCTION`) cả 3 RPC đặt chỗ tải tệp (`public.m3_reserve_practice_upload`, `public.m3_release_upload_reservation`, `public.m3_cleanup_stale_reservations`) trong `supabase/migrations/20261020140000_m4_teaching_sync.sql` sử dụng toán tử an toàn với `NULL` là `IS DISTINCT FROM` (`IF public.current_role() IS DISTINCT FROM 'student'`, `IF v_student_id IS DISTINCT FROM public.current_profile_id()`, `OR public.current_profile_id() IS DISTINCT FROM p_student_id`). | `M4-11` (`tests/m4-teaching-sync.test.mjs`) |
| R12-F2 | P2 | Nút `"↺ Khôi phục dữ liệu mẫu ban đầu"` trên `UI-08` (`src/app/admin/sync/page.tsx`) chạy ngay lập tức chỉ với 1 cú bấm mà không có bước hỏi xác nhận, có thể làm xóa nhầm học sinh đồng bộ Mốc 4 cùng kết quả bài làm và tệp đã tải lên trên TEST. | Bổ sung trạng thái `isConfirmingReset` và hộp thoại xác nhận (`role="alertdialog"`) trong `src/app/admin/sync/page.tsx` nêu rõ dữ liệu sẽ bị xóa kèm 2 nút `"Xác nhận Khôi phục TEST"` và `"Hủy khôi phục"`. | `M4-12` (`tests/m4-teaching-sync.test.mjs`) |

---

## 14. Vòng 13 — Kết quả Review Độc lập (Codex CLI `gpt-6.1-sol`, `xhigh`)

- **Kết luận:** **PASS** (0 lỗi P0, 0 lỗi P1, 0 lỗi P2).
- **Trạng thái đối chiếu:** Toàn bộ **28/28** điểm phát hiện từ Vòng 1 đến Vòng 12 (`R1-F1..F4`, `R2-F1..F3`, `R3-F1..F3`, `R4-F1..F6`, `R5-F1..F2`, `R6-F1`, `R7-F1`, `R8-F1..F2`, `R9-F1`, `R10-F1..F2`, `R11-F1`, `R12-F1..F2`) đã được xác nhận đóng hoàn toàn trong mã nguồn và kiểm thử tự động (`176/176` bài test pass, `12/12` bài test Mốc 4 `tests/m4-teaching-sync.test.mjs` pass).









