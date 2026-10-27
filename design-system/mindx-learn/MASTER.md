# MINDX LEARN — Master Design System (`MASTER.md`)

> **Tài liệu Quy chuẩn Thiết kế Hệ thống (System Design Source of Truth)**
> Kết hợp từ: **Dembrandt Design Tokens** (rút trích từ mẫu chuẩn `/login` đã được Owner duyệt) + **UI UX Pro Max** + **Taste Skill** + **Genjutsu Micro-Interactions**.

---

## 1. Bảng Màu Chuẩn (Color Tokens)

| Vai trò | Giá trị / Lớp Tailwind | Mục đích sử dụng |
|---|---|---|
| **Primary Brand Blue** | `#1d63ed` (`bg-[#1d63ed]`, `text-[#1d63ed]`) | Nút hành động chính của Học sinh / Admin, tab đang chọn, điểm nhấn thương hiệu MindX |
| **Primary Hover & Glow** | `hover:bg-blue-700`, `shadow-lg shadow-blue-500/25` | Trạng thái di chuột và bóng đổ phát sáng nhẹ cho nút chính |
| **Secondary Dark Action** | `#0f172a` (`bg-[#0f172a] hover:bg-slate-800`) | Nút hành động phụ quan trọng (Đăng nhập nhân sự, Hàng đợi chấm bài, Xuất CSV) |
| **Background Canvas** | `#f8fafc` (`bg-[#f8fafc]` / `bg-slate-50/70`) | Nền tổng thể toàn trang sáng, sạch, tạo độ tương phản êm mắt với thẻ trắng |
| **Ambient Soft Glow** | `bg-blue-100/35 blur-3xl rounded-full` | Quầng sáng nền dịu nhẹ phía sau các khung trung tâm |
| **Card Surface (Lớp 1)** | `bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]` | Khung thẻ chính (Hero card, biểu mẫu trung tâm, khung tổng quan lớn) |
| **Card Surface (Lớp 2)** | `bg-white rounded-2xl border border-slate-100/90 shadow-[0_8px_30px_rgba(15,23,42,0.04)]` | Thẻ thông số (Metric card), thẻ bài học 14 buổi, khung danh sách |
| **Subtle Surface (Lớp 3)** | `bg-slate-50/80 rounded-2xl border border-slate-200/60` | Vùng thông tin phụ, thanh công cụ lọc, khung ghi chú |
| **Semantic Status** | `emerald` (Đạt / Đã xuất bản), `amber` (Chờ chấm / Nháp), `rose` (Cần sửa / Cảnh báo xóa) | Chỉ dùng dạng nhãn viên thuốc (`rounded-full px-2.5 py-0.5 text-xs font-semibold`) nhẹ nhàng, không tô đậm cả mảng lớn gây chói mắt |

---

## 2. Kiểu Chữ & Phân Cấp Thị Giác (Typography & Hierarchy)

- **Tiêu đề trang (Page Title):** `text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight`
- **Tiêu đề khu vực (Section Title):** `text-base font-bold text-slate-900 tracking-tight`
- **Nhãn biểu mẫu (Field Label):** `text-xs font-semibold text-slate-700 mb-1.5`
- **Văn bản nội dung (Body):** `text-sm text-slate-600 leading-relaxed`
- **Chú thích phụ (Caption):** `text-xs text-slate-400`
- **Mã định danh / Số liệu (Mono):** `font-mono text-xs text-slate-500`

---

## 3. Thành Phần Giao Diện Chuẩn (Component Tokens)

1. **Thanh Điều Hướng (`Navbar`):**
   - Nền kính mờ `bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40`.
   - Menu chuyển trang dạng **Segmented Pill** (`rounded-full px-3.5 py-1.5 text-xs font-semibold`): mục đang chọn dùng `bg-[#1d63ed] text-white shadow-sm shadow-blue-500/20`, mục khác dùng `text-slate-600 hover:text-slate-900 hover:bg-slate-100/70`.
   - **Quy tắc chống rối:** Trên môi trường chạy thật (`isLiveMode = true`), **ẩn hoàn toàn** thanh cảnh báo màu cam thử nghiệm Mốc 1/Mốc 2 và dòng chữ *"Bản thử nghiệm Mốc 2"*.
2. **Bộ Chuyển Tab Viên Thuốc (`Segmented Pill Tabs`):**
   - Khung ngoài: `bg-slate-100/80 p-1 rounded-full inline-flex gap-1 border border-slate-200/50`.
   - Nút đang chọn: `bg-[#1d63ed] text-white shadow-md shadow-blue-500/25 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200`.
3. **Ô Nhập Liệu (`Inputs & Selects`):**
   - `w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all`.
4. **Nút Bấm (`Buttons`):**
   - **Primary Blue:** `min-h-[44px] px-4 py-2.5 bg-[#1d63ed] hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all active:scale-[0.99]`.
   - **Primary Dark:** `min-h-[44px] px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-all active:scale-[0.99]`.
   - **Secondary Outline:** `min-h-[44px] px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-all`.
5. **Hộp Thoại (`Modal` & `Drawer`):**
   - Nền phủ mờ `bg-slate-900/40 backdrop-blur-sm`.
   - Khung hộp thoại `bg-white rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] border border-slate-100`.

---

## 4. Quy Tắc Chống Rối ("Anti-Slop" & Progressive Disclosure)

1. **Loại bỏ nhãn kỹ thuật nội bộ trên giao diện người dùng:** Không hiển thị các mã `[UI-01]`..`[UI-13]`, `Mốc 1..6`, hay các câu mô tả kỹ thuật (`AES-256-GCM`, `RLS`, `Dữ liệu giả lập`) trước mắt người dùng.
2. **Mỗi màn hình chỉ có 1 điểm nhấn chính:** Không đặt quá nhiều hộp cảnh báo đậm màu chồng lên nhau.
3. **Giữ nguyên 100% logic nghiệp vụ và khả năng vượt 381 bài kiểm thử tự động (`npm test`).**
