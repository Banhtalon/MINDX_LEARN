'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import {
  IconShield,
  IconUser,
  IconBookOpen,
  IconCheckCircle,
  IconArrowLeft,
  IconExternalLink,
  IconAlertTriangle,
  IconLock,
  IconFileText,
  IconUsers,
  IconDatabase,
} from '@/components/icons';

export default function HomePage() {
  const { currentUser, switchDemoUser } = useStore();

  const routes = [
    { code: 'UI-01', path: '/login', name: 'Đăng nhập chung', area: 'Xác thực', desc: 'HS dùng mã + PIN 8 số; Admin/GV dùng email + mật khẩu. Có Quên mật khẩu.' },
    { code: 'UI-02', path: '/account', name: 'Hồ sơ tài khoản', area: 'Tài khoản', desc: 'Đổi PIN 8 số cho HS; đổi mật khẩu cho Admin/GV; đăng xuất.' },
    { code: 'UI-03', path: '/manage', name: 'Tổng quan quản lý', area: 'Admin / GV', desc: 'Bảng theo dõi lớp được giao, số bài cần chấm, thông tin vai trò.' },
    { code: 'UI-04', path: '/manage/classes', name: 'Quản lý lớp & PIN', area: 'Admin / GV', desc: 'Admin gán khóa/GV; cấp PIN lần đầu / cấp lại 1 HS (GV không có nút PIN); kết thúc khóa 14 buổi.' },
    { code: 'UI-05', path: '/admin/courses', name: 'Khóa học 14 buổi', area: 'Admin', desc: 'Khóa cố định 14 vị trí; trạng thái Nháp / Đã xuất bản từng buổi.' },
    { code: 'UI-06', path: '/admin/lessons/les_rob_01/edit', name: 'Soạn thảo bài học', area: 'Admin', desc: 'Sửa video/tài liệu/quiz/thực hành; Chặn xuất bản bài chỉ có lý thuyết.' },
    { code: 'UI-07', path: '/admin/teachers', name: 'Quản lý giáo viên', area: 'Admin', desc: 'Tạo tài khoản email GV, gửi link mật khẩu giả lập, phân công lớp.' },
    { code: 'UI-08', path: '/admin/sync', name: 'Đồng bộ Teaching', area: 'Admin', desc: 'Thử nghiệm nguồn giả fixture, đối chiếu lớp ROB, không gửi mật khẩu/cookie.' },
    { code: 'UI-09', path: '/teacher/submissions', name: 'Hàng đợi chấm bài', area: 'Giáo viên', desc: 'Chấm Đạt / Cần làm lại, nhận xét, mở lại quyền nộp cho học sinh.' },
    { code: 'UI-10', path: '/student', name: 'Góc học sinh', area: 'Học sinh', desc: 'Tổng quan khóa, tiến độ cố định "Đã hoàn thành X/14 buổi" (X/14)*100%.' },
    { code: 'UI-11', path: '/student/course', name: 'Danh sách 14 buổi', area: 'Học sinh', desc: 'Xem mọi bài đã xuất bản (bài nháp bị ẩn); mở bài học tùy ý.' },
    { code: 'UI-12', path: '/student/lessons/les_rob_01', name: 'Chi tiết bài học', area: 'Học sinh', desc: 'Xem video, tài liệu, nộp bài thực hành dạng link hoặc tệp <= 2MB.' },
    { code: 'UI-13', path: '/student/lessons/les_rob_01/quiz', name: 'Làm bài trắc nghiệm', area: 'Học sinh', desc: 'Làm quiz, ngưỡng đạt 70%, làm lại không giới hạn, giữ điểm cao nhất.' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/40 border border-blue-400/40 text-xs font-semibold uppercase tracking-wider mb-3">
            Mốc 1 — Khung Web & Các luồng giao diện giả lập
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            MINDX LEARN — Nền tảng Học tập & Quản lý Lớp
          </h1>
          <p className="text-blue-100 text-sm leading-relaxed mb-6">
            Bản thử nghiệm giao diện dành cho Owner và Reviewer kiểm duyệt theo Kế hoạch v3. Toàn bộ dữ liệu
            hiện đang chạy trong bộ nhớ máy (RAM), không kết nối cơ sở dữ liệu thật, không email thật, không
            phát sinh chi phí.
          </p>

          {/* Quick Demo Switcher */}
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-200 mb-2">
              Chọn nhanh vai trò để bắt đầu trải nghiệm:
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => switchDemoUser('admin')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
                  currentUser?.role === 'admin'
                    ? 'bg-white text-blue-700 ring-2 ring-white'
                    : 'bg-blue-800/80 text-white hover:bg-blue-800'
                }`}
              >
                1. Đóng vai ADMIN Quản Trị
              </button>
              <button
                onClick={() => switchDemoUser('teacher')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
                  currentUser?.role === 'teacher'
                    ? 'bg-white text-emerald-700 ring-2 ring-white'
                    : 'bg-emerald-800/80 text-white hover:bg-emerald-800'
                }`}
              >
                2. Đóng vai GIÁO VIÊN
              </button>
              <button
                onClick={() => switchDemoUser('student')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
                  currentUser?.role === 'student'
                    ? 'bg-white text-amber-700 ring-2 ring-white'
                    : 'bg-amber-800/80 text-white hover:bg-amber-800'
                }`}
              >
                3. Đóng vai HỌC SINH
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Main Areas Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
            <IconLock className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Khu Xác thực & Đổi PIN</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            HS đăng nhập mã + PIN 8 số. Admin/GV dùng email + pass. Có Quên mật khẩu & đổi PIN 8 số.
          </p>
          <div className="space-y-1 text-xs">
            <Link href="/login" className="block text-blue-600 font-semibold hover:underline">
              → UI-01: Đăng nhập
            </Link>
            <Link href="/account" className="block text-blue-600 font-semibold hover:underline">
              → UI-02: Đổi PIN / Mật khẩu
            </Link>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
            <IconBookOpen className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Khu Học Sinh</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Tiến độ cố định X/14 buổi. Mở bài đã xuất bản tùy ý. Nộp link/file 2MB. Làm quiz đạt 70%.
          </p>
          <div className="space-y-1 text-xs">
            <Link href="/student" className="block text-emerald-600 font-semibold hover:underline">
              → UI-10: Tổng quan & Tiến độ
            </Link>
            <Link href="/student/course" className="block text-emerald-600 font-semibold hover:underline">
              → UI-11: Danh sách 14 bài
            </Link>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
            <IconFileText className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Khu Giáo Viên</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Xem lớp phân công, danh sách học sinh. Hàng đợi chấm bài Đạt / Cần làm lại, mở lại quyền nộp.
          </p>
          <div className="space-y-1 text-xs">
            <Link href="/manage" className="block text-purple-600 font-semibold hover:underline">
              → UI-03: Việc cần chấm
            </Link>
            <Link href="/teacher/submissions" className="block text-purple-600 font-semibold hover:underline">
              → UI-09: Hàng đợi chấm bài
            </Link>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 transition-all">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
            <IconShield className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Khu Quản Trị Admin</h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Khóa 14 buổi, chặn bài chỉ lý thuyết. Cấp PIN 2 chế độ (CSV 1 lần). Đóng khóa & xóa dữ liệu.
          </p>
          <div className="space-y-1 text-xs">
            <Link href="/manage/classes" className="block text-indigo-600 font-semibold hover:underline">
              → UI-04: Lớp & Cấp PIN
            </Link>
            <Link href="/admin/courses" className="block text-indigo-600 font-semibold hover:underline">
              → UI-05: Khóa 14 buổi
            </Link>
            <Link href="/admin/sync" className="block text-indigo-600 font-semibold hover:underline">
              → UI-08: Thử sync fixture
            </Link>
          </div>
        </div>
      </div>

      {/* UI Table (UI-01 to UI-13) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Bảng tổng hợp 13 màn hình UI-01 đến UI-13</h2>
            <p className="text-xs text-slate-500">
              Đối chiếu chính xác theo Mục 4 của PROJECT_PLAN.md. Bấm vào bất kỳ trang nào để duyệt thử.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 w-16">Mã UI</th>
                <th className="px-4 py-3 w-44">Tên trang & Đường dẫn</th>
                <th className="px-4 py-3 w-28">Khu vực</th>
                <th className="px-4 py-3">Mô tả hành vi & Quy tắc kiểm thử</th>
                <th className="px-4 py-3 w-24 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.map((r) => (
                <tr key={r.code} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600">{r.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{r.path}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-700 text-[11px]">
                      {r.area}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.desc}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={r.path}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 transition-colors"
                    >
                      <span>Mở</span>
                      <IconExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
