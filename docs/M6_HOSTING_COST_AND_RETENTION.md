# Đánh giá Phương án Hosting PROD, Giới hạn Quota & Chính sách Lưu giữ Dữ liệu (Mốc 6)

Tài liệu này trình bày bảng đánh giá chi phí, điều khoản sử dụng, hạn mức kỹ thuật và chính sách lưu giữ bản sao của nhà cung cấp hạ tầng cho hệ thống **MINDX LEARN — Bảng điều khiển Học tập**, căn cứ theo quy mô vận hành thực tế đã xác nhận với Owner (**tối đa 20 học sinh học cùng lúc trong 1 ca**, tổng danh sách toàn hệ thống có thể trên 200 đến hơn 1.000 học sinh).

> [!IMPORTANT]
> **Trạng thái phê duyệt:** Tài liệu này được lập ở **Bước 1 Mốc 6** để **Owner xem xét và phê duyệt phương án chi phí / điều khoản trước khi mở môi trường PROD ở Bước 2**. Mục tương ứng tại [`PROJECT_PLAN.md`](../PROJECT_PLAN.md) (dòng 255 và 257) được giữ ở trạng thái chưa hoàn tất (`[ ]`) cho đến khi Owner xem và xác nhận.

---

## 1. So sánh Phương án Hosting, Giá cước, Điều khoản thương mại & Hành vi khi chạm Quota

### 1.1. Tầng Giao diện Web & Next.js BFF (Vercel)

Theo tài liệu chính thức hiện hành của Vercel ([Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) và [Vercel Pro Plan](https://vercel.com/docs/plans/pro-plan)):

| Tiêu chí | Phương án A: **Vercel Hobby** | Phương án B: **Vercel Pro** (Khuyến nghị cho vận hành thương mại) |
| :--- | :--- | :--- |
| **Chi phí cố định** | **\$0 / tháng** | **\$20 / người dùng quản trị / tháng** |
| **Điều khoản mục đích sử dụng** | **Chỉ dành cho mục đích cá nhân, phi thương mại (Personal, non-commercial use)** theo Fair Use Policy của Vercel. **Không đủ điều kiện pháp lý** nếu dùng cho hoạt động vận hành kinh doanh/thương mại của trung tâm. | **Cho phép sử dụng thương mại đầy đủ (Commercial use)**, hỗ trợ nhóm quản trị và SLA doanh nghiệp. |
| **Hạn mức bao gồm sẵn / tháng** | - **1.000.000** lượt gọi hàm (Function Invocations)<br>- **4 giờ** Active CPU & **360 GB-hours** bộ nhớ cấp phát<br>- **100 GB** băng thông (Fast Data Transfer) | - **1.000.000** lượt gọi hàm (Function Invocations)<br>- **4 giờ** Active CPU & **360 GB-hours** bộ nhớ bao gồm sẵn (hoặc trừ vào \$20 Usage Credit)<br>- **1 TB** băng thông (Fast Data Transfer) |
| **Mức tiêu thụ thực tế (20 HS/ca, ~60 ca/tháng)** | ~36.000–50.000 lượt gọi hàm/tháng (< 5% hạn mức kỹ thuật). | ~36.000–50.000 lượt gọi hàm/tháng (< 5% hạn mức bao gồm sẵn, không phát sinh cước vượt trần). |
| **Hành vi khi chạm hoặc vượt Quota** | Vercel **tự động chặn/tạm dừng phục vụ (pause deployment)** cho đến chu kỳ tháng kế tiếp hoặc đến khi nâng cấp gói. Không tự động trừ tiền. | Cho phép đặt **Spend Management (Giới hạn chi tiêu = \$0 phát sinh thêm)**: khi chạm ngưỡng đặt trước, hệ thống gửi cảnh báo hoặc tự động tạm dừng theo cấu hình của Owner để không phát sinh phí ngoài ý muốn. |

### 1.2. Tầng Cơ sở dữ liệu, Xác thực, Edge Function & Lưu trữ tệp (Supabase)

Theo tài liệu chính thức của Supabase ([Supabase Pricing & Quotas](https://supabase.com/pricing) và [Supabase Backups](https://supabase.com/docs/guides/platform/backups)):

| Tiêu chí | Phương án A: **Supabase Free Plan** | Phương án B: **Supabase Pro Plan** (Khuyến nghị cho PROD ổn định) |
| :--- | :--- | :--- |
| **Chi phí cố định** | **\$0 / tháng** (Tối đa 2 dự án Free đang hoạt động mỗi tổ chức) | **\$25 / tháng** (Bao gồm \$10 Compute Credit cho 1 dự án PROD) |
| **Hạn mức chính** | - **500 MB** PostgreSQL Database<br>- **1 GB** File Storage (`m3-practice-files`)<br>- **5 GB** Egress (băng thông tải ra)<br>- **50.000** MAU Auth & **500.000** lượt gọi Edge Function/tháng | - **8 GB** PostgreSQL Database<br>- **100 GB** File Storage<br>- **250 GB** Egress<br>- **100.000** MAU Auth & **2.000.000** lượt gọi Edge Function/tháng |
| **Mức tiêu thụ thực tế (>1.000 hồ sơ, 20 HS/ca)** | - Database: ~15–25 MB (< 5% hạn mức 500 MB)<br>- Storage: được khóa cứng ở trần **800 MB** bởi ứng dụng. | Dư dả cho toàn bộ quy mô trung tâm nhiều năm liên tiếp. |
| **Hành vi khi không hoạt động / khi chạm Quota** | - **Tự động tạm dừng (Auto-pause)** nếu dự án không có truy vấn suốt **7 ngày liên tiếp** (cần khôi phục thủ công từ Dashboard).<br>- Khi vượt 500 MB DB, dự án chuyển sang chế độ **chỉ đọc (Read-only)**; khi vượt 1 GB Storage hoặc 5 GB Egress, thao tác tải lên/tải xuống mới bị từ chối. | - **Không bao giờ tự tạm dừng** khi vắng truy cập.<br>- Có tính năng **Spend Cap (Khóa trần chi phí mặc định BẬT)**: ngăn phát sinh cước vượt gói \$25/tháng và chặn tải mới khi chạm trần gói. |

### 1.3. Tổng hợp phương án để Owner quyết định trước Bước 2
1. **Nếu chạy thử nghiệm phi thương mại (Pilot nội bộ không thu phí):** Có thể dùng gói miễn phí (\$0/tháng), nhưng phải lưu ý điều khoản phi thương mại của Vercel Hobby và cơ chế tự tạm dừng sau 7 ngày không hoạt động của Supabase Free.
2. **Nếu mở vận hành chính thức cho trung tâm (Commercial Production):** Khuyến nghị duyệt ngân sách **Vercel Pro (\$20/tháng)** + **Supabase Pro (\$25/tháng, bật Spend Cap)** (tổng **\$45/tháng**) để tuân thủ đầy đủ điều khoản thương mại, không bị tự động tạm dừng dự án và có sao lưu cơ sở dữ liệu hàng ngày.

---

## 2. Đường dừng & Chặn tải lên tự động trong ứng dụng khi chạm ngưỡng (700 MB / 800 MB)

Bất kể sử dụng gói Free hay Pro, ứng dụng **MINDX LEARN** đã tích hợp sẵn cơ chế kiểm soát dung lượng chủ động ngay trên máy chủ (`m5_get_storage_quota_status` & `/api/m3/file`):

1. **Giới hạn cứng từng tệp (`2 MB` = `2.097.152 bytes`):**
   - Chỉ cho phép các định dạng bài học đã duyệt; tệp vượt quá `2 MB` bị từ chối ngay lập tức tại cả Next.js BFF, chính sách RLS `m3_check_storage_insert_permission` và RPC `m3_submit_practice`.
2. **Đặt chỗ dung lượng nguyên tử (Upload Reservation):**
   - Mỗi lượt tải tệp đều phải khóa trước số byte dự kiến trong bảng `m3_upload_reservations` (tự động hết hạn sau 10 phút) để ngăn 20 học sinh tải lên cùng lúc làm vượt trần.
3. **Ngưỡng Cảnh báo Sớm (`700 MB` = `734.003.200 bytes`):**
   - Khi tổng dung lượng (`kho hiện tại + giữ chỗ đang hoạt động + mức cơ sở`) đạt từ `700 MB` đến `800 MB`, hệ thống hiển thị **cảnh báo màu vàng** trên màn hình Quản lý Lớp của Admin để nhắc xuất CSV tổng kết và đóng các khóa đã học xong 14 buổi.
4. **Ngưỡng Chặn Cứng (`800 MB` = `838.860.800 bytes`):**
   - Khi tổng dung lượng vượt `800 MB`, hệ thống **tự động chặn mọi lượt tải tệp mới** (`STORAGE_QUOTA_EXCEEDED`), giữ lại vùng đệm an toàn 200 MB dưới trần 1 GB của gói Free. Học sinh vẫn nộp bài bằng **đường dẫn (Link)** và làm bài trắc nghiệm bình thường.

---

## 3. Chính sách xóa dữ liệu khóa cũ & Chính sách bản sao lưu của nhà cung cấp (Retention / Snapshot)

Căn cứ theo tài liệu chính thức của Supabase về sao lưu ([Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)), cần phân biệt rõ giữa **xóa dữ liệu ở tầng ứng dụng** và **bản sao vận hành của nhà cung cấp**:

1. **Phần ứng dụng và Supabase Storage xóa được ngay lập tức:**
   - Khi Admin tải tệp **CSV tổng kết 14 buổi**, xác minh khớp 100% với máy chủ (`verified_ok = true`) và bấm xác nhận đóng khóa học, hệ thống xóa ngay lập tức trên cơ sở dữ liệu đang chạy và bucket `m3-practice-files`:
     - Toàn bộ tệp bài nộp thực hành thuộc khóa học đó trong `storage.objects`.
     - Toàn bộ điểm trắc nghiệm (`quiz_results`), bài nộp thực hành (`practice_submissions`), danh sách đợt học (`m5_class_cohort_members`) thuộc khóa học vừa đóng, và hồ sơ học sinh đã chuyển lớp/lưu trữ không còn thuộc lớp đang hoạt động.
   - Sau khi hoàn tất, các dữ liệu này biến mất ngay lập tức khỏi ứng dụng và không thể truy vấn lại qua API.
2. **Phần bản sao lưu của nhà cung cấp (Provider Backups & Snapshots):**
   - **Trên gói Supabase Free:** Nhà cung cấp **không cung cấp** bản sao lưu tự động hàng ngày (Daily Backups) hay khôi phục theo thời điểm (PITR) cho người dùng trong trang quản trị.
   - **Trên gói Supabase Pro:** Nhà cung cấp lưu giữ các bản sao lưu cơ sở dữ liệu hàng ngày (Daily Backups) trong **7 ngày** (hoặc theo cửa sổ PITR nếu bật thêm). Do đó, dữ liệu bảng PostgreSQL đã xóa trên ứng dụng vẫn còn nằm trong các bản sao lưu cơ sở dữ liệu của 7 ngày gần nhất cho đến khi hết hạn xoay vòng.
   - **Đối với tệp trong Supabase Storage:** Tài liệu chính thức của Supabase quy định rõ **bản sao lưu cơ sở dữ liệu PostgreSQL không bao gồm nội dung nhị phân của các tệp trong Supabase Storage** (chỉ bao gồm siêu dữ liệu trong bảng `storage.objects`). Nội dung tệp được lưu trên hạ tầng lưu trữ đối tượng đám mây nền tảng (AWS S3).
   - **Điểm chưa xác minh từ nhà cung cấp (Unverified Infrastructure Purge Window):** Supabase và AWS S3 không công bố thời điểm chính xác đến từng giờ/ngày mà các bản sao dự phòng thảm họa nội bộ ở tầng ổ đĩa vật lý hoặc bộ nhớ đệm hạ tầng đám mây bị xóa trắng hoàn toàn sau khi gọi lệnh xóa API. Vì vậy, **không cam kết hoặc hứa hẹn một số ngày xóa vĩnh viễn tuyệt đối ở tầng vật lý của nhà cung cấp** khi chưa có xác nhận bằng văn bản riêng từ nhà cung cấp.
   - **Quy tắc vận hành bắt buộc cho Admin:** Tệp **CSV tổng kết khóa học** tải về máy Admin là bản lưu trữ kết quả chính thức duy nhất sau khi đóng khóa; đồng thời cần thông báo đúng cho người dùng rằng thao tác đóng khóa sẽ xóa ngay dữ liệu khỏi ứng dụng và kho tệp đang hoạt động, còn các bản sao lưu vận hành của nhà cung cấp (nếu có theo gói dịch vụ) sẽ tự động hết hạn theo chu kỳ của nhà cung cấp.
