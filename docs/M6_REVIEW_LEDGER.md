# Sổ cái kiểm toán độc lập Mốc 6 (Bước 1 Kiểm thử tải 200 học sinh & Bước 2 Mở môi trường chính thức PROD)

- **Reviewer độc lập (Chính):** `gpt-6.1-sol` (`model_reasoning_effort="high"`, chế độ `read-only`)
- **Reviewer dự phòng (Backup Reviewer theo `docs/AI_AGENT_WORKFLOW.md`):** `claude-sonnet-5-5-high` (`effort="high"`, dùng khi Reviewer chính chạm giới hạn hạn mức)
- **Phạm vi kiểm toán:**
  1. [`supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql`](../supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql) & [`supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql`](../supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql)
  2. [`supabase/functions/m2-backend/index.ts`](../supabase/functions/m2-backend/index.ts)
  3. [`next.config.mjs`](../next.config.mjs), [`src/app/layout.tsx`](../src/app/layout.tsx), [`src/lib/server/crypto.mjs`](../src/lib/server/crypto.mjs), [`src/lib/server/crypto.ts`](../src/lib/server/crypto.ts), [`src/lib/server/edge-client.ts`](../src/lib/server/edge-client.ts), [`src/lib/store.tsx`](../src/lib/store.tsx), [`src/lib/teaching-sync-core.mjs`](../src/lib/teaching-sync-core.mjs), [`src/lib/simulation-rules.ts`](../src/lib/simulation-rules.ts), [`src/app/admin/sync/page.tsx`](../src/app/admin/sync/page.tsx), [`src/app/api/m2/[action]/route.ts`](../src/app/api/m2/[action]/route.ts), [`src/app/api/m3/file/route.ts`](../src/app/api/m3/file/route.ts)
  4. [`tests/m6-staging-load-and-prod-readiness.test.mjs`](../tests/m6-staging-load-and-prod-readiness.test.mjs), [`tests/m2-teacher-connection.test.mjs`](../tests/m2-teacher-connection.test.mjs)
  5. [`docs/M6_HOSTING_COST_AND_RETENTION.md`](./M6_HOSTING_COST_AND_RETENTION.md), [`docs/M6_USER_GUIDE.md`](./M6_USER_GUIDE.md), [`docs/M6_EVIDENCE.md`](./M6_EVIDENCE.md), [`PROJECT_PLAN.md`](../PROJECT_PLAN.md)
  6. Biên nhận triển khai & kiểm thử trực tiếp: [`.workflow-local/m6/vercel-preview-deployment.json`](../.workflow-local/m6/vercel-preview-deployment.json), [`.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json`](../.workflow-local/m6/live-staging-load-and-security-receipt-20261021.json), [`.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json`](../.workflow-local/m6/prod-cutover-and-deployment-receipt-20261022.json)

---

## Trạng thái các vòng Review

| Giai đoạn & Vòng | Model Reviewer | Kết quả | P0 | P1 | P2 | Ghi chú |
|---|---|---|---:|---:|---:|---|
| **Bước 1 — Vòng 1** | `gpt-6.1-sol` (high) | Phát hiện 9 điểm cần khắc phục | 0 | 5 | 4 | Đã sửa triệt để các điểm kỹ thuật (`R1-01` .. `R1-09`), triển khai lên TEST và kiểm thử 200 tài khoản |
| **Bước 1 — Vòng 2** | `claude-sonnet-5-5-high` (Backup Reviewer) | Đã đóng 8/9 điểm Vòng 1; còn 1 P2 tài liệu (`R2-01`) | 0 | 0 | 1 | `R2-01`: Đồng bộ mô tả cơ chế retry trong tài liệu và mảng `extra` của `source-manifest.json` |
| **Bước 1 — Vòng 3** | `claude-sonnet-5-5-high` (Backup Reviewer) | **PASS** | 0 | 0 | 0 | Đã đóng toàn bộ phát hiện (`R1-01` .. `R1-09` & `R2-01`), đủ điều kiện báo cáo Owner |
| **Bước 2 — Vòng 1 (Cutover PROD)** | `gpt-6.1-sol` (high) | Phát hiện 1 điểm khóa `coordinatorFixtureLock` | 0 | 1 | 0 | Nâng cấp `coordinatorFixtureLock` chặn fail-closed khi `environment_mode` không phải `test` hoặc lỗi đọc cấu hình |
| **Bước 2 — Vòng 2 (Cutover PROD)** | `gpt-6.1-sol` (high) | Phát hiện thứ tự xóa `m5_storage_quota_config.updated_by` trong SQL | 0 | 1 | 0 | Cập nhật `updated_by = v_owner_profile_id` trước khi xóa `profiles` thử nghiệm và bỏ tham chiếu bảng không tồn tại `m5_csv_verifications` |
| **Bước 2 — Vòng 3 (Cutover PROD)** | `gpt-6.1-sol` (high) | **PASS** | 0 | 0 | 0 | Đã xác nhận migration chuyển đổi sạch PROD, `m2-backend` Version 18 và bản triển khai Vercel Production `dpl_8fHhJpiSRZXS8V6PqQVj9DSTB4G6` ([`.workflow-local/m6/prod-cutover-review-r3-20261022.txt`](../.workflow-local/m6/prod-cutover-review-r3-20261022.txt)) |

---

## Chi tiết các phát hiện Vòng 1 (`gpt-6.1-sol` High) và kết quả khắc phục

### 1. Các phát hiện mức P1 (5 điểm — Đã khắc phục 5/5)

- **`R1-01` (P1 — Chính sách RLS bảng `public.courses` cho phép Giáo viên đọc toàn bộ khóa học):**
  - **Nguyên nhân:** Bản nháp đầu của migration Mốc 6 tách `m3_courses_select_authenticated` thành `m3_courses_select_staff` chỉ kiểm tra `(SELECT public.current_role()) = 'teacher'` mà thiếu điều kiện Giáo viên được phân công vào lớp đang học khóa đó.
  - **Khắc phục:** Đã sửa tại [`supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql`](../supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql#L126-L163) (xóa `m3_courses_select_staff` / `m3_courses_select_student` và tạo lại `m3_courses_select_authenticated` với điều kiện `ct.teacher_profile_id = (SELECT public.current_profile_id()) AND c.course_id = courses.id AND c.status = 'active'`). Đã áp dụng lên Supabase TEST `eythjapspkoyqdxlxtcd`, bổ sung kiểm tra trong Test `2.4` và kiểm chứng trực tiếp trên TEST (`teacherAssignedCoursesScopedOnly: true`).

- **`R1-02` (P1 — Cách ly môi trường PROD có thể bị lách nếu thiếu/sai biến `MINDX_ENV`):**
  - **Nguyên nhân:** Logic cũ mặc định `rawEnv = 'test'` khi biến môi trường bị bỏ trống hoặc ghi sai chính tả, và chưa kiểm tra xung đột giữa `MINDX_ENV`, `MINDX_APP_ENV`, `NEXT_PUBLIC_MINDX_ENV`.
  - **Khắc phục:** Đã viết lại `inspectEnvironmentFlags(env)`, `isProductionEnvironment(env)`, `resolveSupabaseUrl(env)`, `resolveTrustedSiteUrl(env)` và `assertRuntimeEnvironmentGuard(env)` trong [`src/lib/server/crypto.mjs`](../src/lib/server/crypto.mjs#L27-L150) cùng `isExactTestOrigin` / `isEdgeTestEnvironment` trong [`supabase/functions/m2-backend/index.ts`](../supabase/functions/m2-backend/index.ts#L56-L70): từ chối mọi giá trị lạ hoặc xung đột giữa các biến môi trường, đồng thời tự động coi mọi cấu hình có URL Supabase hoặc URL Site khác TEST (`eythjapspkoyqdxlxtcd` / `mindx-learn-test`) là **Production** ngay cả khi không khai báo `MINDX_ENV`.

- **`R1-03` (P1 — Chế độ Demo `NEXT_PUBLIC_MINDX_DEMO=1` trên PROD chưa bị chặn ngay từ Build / UI Startup):**
  - **Nguyên nhân:** Kiểm tra chặn Demo trước đó chỉ nằm trong hàm kiểm tra cấu hình máy chủ API, nên nếu build tĩnh hoặc mở trang giao diện chỉ dùng dữ liệu giả thì chưa bị chặn ngay.
  - **Khắc phục:** Đã gắn `assertRuntimeEnvironmentGuard(process.env)` trực tiếp vào [`next.config.mjs`](../next.config.mjs), [`src/app/layout.tsx`](../src/app/layout.tsx), [`src/lib/server/edge-client.ts`](../src/lib/server/edge-client.ts), và hàm `resolveIsLiveMode` trong [`src/lib/store.tsx`](../src/lib/store.tsx#L275-L368) để fail-closed ngay ở bước `next build`, khi khởi tạo `RootLayout`, và khi dựng `StoreProvider`.

- **`R1-04` (P1 — Bản thay đổi Next.js của Mốc 6 chưa được triển khai lên Vercel Preview trước khi chạy kiểm thử tải trực tiếp):**
  - **Nguyên nhân:** Lần chạy kiểm thử trực tiếp đầu tiên gọi vào URL Preview cũ của Mốc 5 (`mindx-learn-test-jo2kk5kvn...`) thay vì bản Preview chứa mã nguồn Mốc 6.
  - **Khắc phục:** Đã đóng gói 49 tệp nguồn Mốc 6 (`manifestSha256: 096eaa2d86d563c000ce1b0116a45e5b8bd2ea8ab7ba9dda50b25aac7cd2d407`), triển khai bản Vercel Preview Mốc 6 mới `dpl_5LFqyRA2YgCsNrJprrB8YEHEK2HC` (`https://mindx-learn-test-q2pug515z-quangctm07-5456s-projects.vercel.app`), triển khai `m2-backend` Version `17` lên `eythjapspkoyqdxlxtcd`, và chạy lại toàn bộ kịch bản kiểm thử tải trực tiếp trên URL Preview mới.

- **`R1-05` (P1 — Báo cáo chi phí duy trì và lưu trữ dữ liệu có thông số chưa khớp tài liệu chính thức của nhà cung cấp):**
  - **Nguyên nhân:** Tài liệu cũ chưa nêu rõ điều khoản phi thương mại của gói Vercel Hobby, ghi hạn mức cũ (100.000 lượt gọi), và giả định thời hạn tự xóa bản sao lưu hạ tầng khi chưa có nguồn xác minh.
  - **Khắc phục:** Đã biên soạn lại [`docs/M6_HOSTING_COST_AND_RETENTION.md`](./M6_HOSTING_COST_AND_RETENTION.md) với số liệu chính xác từ tài liệu chính thức của Vercel và Supabase (Vercel Hobby `$0` chỉ dùng cho mục đích cá nhân/phi thương mại với `1.000.000` lượt gọi hàm, `4 giờ` Active CPU, `360 GB-h`; đối chiếu rõ với Vercel Pro `$20/tháng` có Spend Management và Supabase Free `$0` tự tạm dừng sau 7 ngày so với Supabase Pro `$25/tháng` có Spend Cap và sao lưu DB hằng ngày 7 ngày không bao gồm tệp nhị phân Storage; ghi rõ thời gian giữ snapshot hạ tầng đám mây bên dưới là chưa xác minh). Đồng thời giữ trạng thái `- [ ]` cho các mục chờ Owner xem xét tại [`PROJECT_PLAN.md`](../PROJECT_PLAN.md#L255-L266).

### 2. Các phát hiện mức P2 ở Vòng 1 và Vòng 2 (Đóng toàn bộ)

- **`R1-06` (P2 — Hành động `coordinator-cleanup-m6-qa` chưa kiểm tra lỗi xóa và chưa hậu kiểm số dòng còn sót):**
  - **Khắc phục:** Đã nâng cấp `coordinator-cleanup-m6-qa` trong [`supabase/functions/m2-backend/index.ts`](../supabase/functions/m2-backend/index.ts#L3670-L3879) để kiểm tra lỗi trên từng thao tác đọc/xóa Storage, DB, Auth `deleteUser`, truy vấn hậu kiểm `remainingTargetRows` trên 5 bảng (`profiles`, `students`, `practice_submissions`, `m3_upload_reservations`, `quiz_results`), và trả về `HTTP 500 CLEANUP_INCOMPLETE` nếu có lỗi hoặc còn dòng mục tiêu chưa xóa. Đã kiểm thử tự động tại Test `2.5`.

- **`R1-07` (P2 — Kiểm thử tải trực tiếp trên TEST mới chạy 20 tài khoản (1 ca) thay vì đủ 200 tài khoản giả lập qua 10 ca):**
  - **Khắc phục:** Đã nâng cấp kịch bản kiểm thử trực tiếp và chạy đủ **200 tài khoản học sinh giả lập riêng biệt (`TEST_M2QA_M6_S001..TEST_M2QA_M6_S200`, UUID `000000061001..000000061200` / `000000062001..000000062200`)** chia thành **10 ca × 20 học sinh đồng thời/ca** trên bản Preview Mốc 6 `dpl_5LFqyRA2YgCsNrJprrB8YEHEK2HC`, sau đó thu dọn sạch 100% cả 200 tài khoản về đúng trạng thái nền (`classes: 35, students: 1055, profiles: 1090, practice_submissions: 1, m3_upload_reservations: 2`).

- **`R1-08` (P2 — Các mục trong `PROJECT_PLAN.md` phụ thuộc báo cáo chi phí/lưu trữ cần giữ `- [ ]` chờ Owner duyệt):**
  - **Khắc phục:** Đã cập nhật [`PROJECT_PLAN.md`](../PROJECT_PLAN.md#L253-L266) để các mục dòng 255–260 và 264–266 đều giữ trạng thái `- [ ]` kèm ghi chú rõ phần AI đã chuẩn bị xong ở Bước 1 và phần chờ Owner xem xét/quyết định ở Bước 2.

- **`R1-09` & `R2-01` (P2 — Đồng bộ kiểm thử tự động và mô tả cơ chế retry trong `docs/M6_EVIDENCE.md`, `docs/M6_REVIEW_LEDGER.md` và mảng `extra` trong `.workflow-local/m6/source-manifest.json`):**
  - **Khắc phục:**
    1. Trong [`tests/m6-staging-load-and-prod-readiness.test.mjs`](../tests/m6-staging-load-and-prod-readiness.test.mjs) (Test `1.3`, dòng 601–723), kiểm thử toàn diện hành vi retry của `student-login-complete` (`updateUserById` lỗi `502` và `signInWithPassword` lỗi `503` được thử lại tối đa 3 lần và thành công; các mã lỗi `400`, `401`, `429` dừng ngay sau 1 lần không thử lại; lỗi `503` liên tiếp dừng sau đúng 3 lần).
    2. Cập nhật Mục 2.2 khoản 3 của [`docs/M6_EVIDENCE.md`](./M6_EVIDENCE.md) và mục này để mô tả chính xác 100% hành vi trong mã nguồn: tại Edge Function (`supabase/functions/m2-backend/index.ts` dòng 674–714), `student-login-complete` thử lại tối đa 3 lần cho `updateUserById` và `signInWithPassword` khi gặp lỗi tạm thời `5xx`, không thử lại `400`/`401`/`429`; tại Next.js BFF (`src/lib/server/edge-client.ts` dòng 201–237), `callEdgeFunction` thử lại tối đa 3 lần cho các tác vụ đọc idempotent (`bootstrap`, `session`, `m5-storage-quota-status`) khi gặp lỗi mạng hoặc `HTTP >= 500`.
    3. Chạy lại `node .workflow-local/m6/release-tools.cjs snapshot` để đồng bộ mã băm mảng `extra` trong [`.workflow-local/m6/source-manifest.json`](../.workflow-local/m6/source-manifest.json) khớp 100% với đĩa (trong khi 49 tệp runtime giữ nguyên `manifestSha256 = 096eaa2d86d563c000ce1b0116a45e5b8bd2ea8ab7ba9dda50b25aac7cd2d407`).
