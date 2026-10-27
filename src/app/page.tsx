'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import {
  IconShield,
  IconBookOpen,
  IconCheckCircle,
  IconFileText,
  IconUsers,
} from '@/components/icons';

export default function HomePage() {
  const { currentUser, switchDemoUser, isLiveMode } = useStore();

  const primaryWorkspaceHref =
    currentUser?.role === 'student'
      ? '/student'
      : currentUser?.role === 'teacher' || currentUser?.role === 'admin'
      ? '/manage'
      : '/login';

  return (
    <div className="relative space-y-8 py-2">
      {/* Ambient Background Glow */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[680px] h-[340px] bg-blue-100/40 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Hero Welcome Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)] p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-blue-50/70 rounded-full blur-2xl pointer-events-none" />

        <div className="max-w-3xl relative">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-[#1d63ed] text-xs font-semibold mb-4">
            <span className="w-2 h-2 rounded-full bg-[#1d63ed]" />
            <span>Hệ thống Quản lý Lớp học & Học tập 14 Buổi</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            Chào mừng đến với MINDX LEARN
          </h1>
          <p className="text-slate-500 text-sm sm:text-base leading-relaxed mb-7 max-w-2xl">
            Không gian học tập trực tuyến theo lộ trình chuẩn{' '}
            <strong className="text-slate-700 font-semibold">Basic → Advanced → Intensive</strong> với
            14 buổi học cố định mỗi khóa, kết hợp làm bài Trắc nghiệm và nộp dự án Thực hành trực tiếp.
          </p>

          {!isLiveMode ? (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
              <div className="text-xs font-bold text-slate-600 mb-2.5">
                Chuyển nhanh vai trò thử nghiệm:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => switchDemoUser('admin')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    currentUser?.role === 'admin'
                      ? 'bg-[#1d63ed] text-white shadow-md shadow-blue-500/25'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Quản trị viên (Admin)
                </button>
                <button
                  onClick={() => switchDemoUser('teacher')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    currentUser?.role === 'teacher'
                      ? 'bg-[#1d63ed] text-white shadow-md shadow-blue-500/25'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Giáo viên
                </button>
                <button
                  onClick={() => switchDemoUser('student')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    currentUser?.role === 'student'
                      ? 'bg-[#1d63ed] text-white shadow-md shadow-blue-500/25'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Học sinh
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {currentUser ? (
                <>
                  <Link
                    href={primaryWorkspaceHref}
                    className="min-h-[44px] px-6 py-3 bg-[#1d63ed] hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all inline-flex items-center gap-2"
                  >
                    <span>
                      Vào không gian làm việc (
                      {currentUser.role === 'student'
                        ? 'Học sinh'
                        : currentUser.role === 'teacher'
                        ? 'Giáo viên'
                        : 'Quản trị viên'}
                      )
                    </span>
                    <span>→</span>
                  </Link>
                  <Link
                    href="/account"
                    className="min-h-[44px] px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold rounded-xl text-sm shadow-sm transition-all inline-flex items-center"
                  >
                    Hồ sơ tài khoản
                  </Link>
                </>
              ) : (
                <Link
                  href="/login"
                  className="min-h-[44px] px-6 py-3 bg-[#1d63ed] hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all inline-flex items-center gap-2"
                >
                  <span>Đăng nhập vào lớp học</span>
                  <span>→</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3 Role Portals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Student Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgba(15,23,42,0.04)] hover:border-blue-200 transition-all flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/80 border border-blue-200/60 text-[#1d63ed] flex items-center justify-center mb-4 shadow-sm">
              <IconBookOpen className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-slate-900 text-base mb-1.5 tracking-tight">
              Khu vực Học sinh
            </h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Đăng nhập bằng Mã học sinh và mã PIN 8 chữ số. Xem bài giảng 14 buổi, làm bài Trắc nghiệm
              (đạt từ 70%) và nộp bài Thực hành.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/student"
              className="text-[#1d63ed] font-semibold hover:underline inline-flex items-center gap-1"
            >
              <span>Góc học tập</span>
              <span>→</span>
            </Link>
            <Link
              href="/student/course"
              className="text-slate-500 hover:text-slate-800 font-medium"
            >
              Lộ trình 14 buổi
            </Link>
          </div>
        </div>

        {/* Teacher Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgba(15,23,42,0.04)] hover:border-blue-200 transition-all flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-emerald-50 to-emerald-100/80 border border-emerald-200/60 text-emerald-700 flex items-center justify-center mb-4 shadow-sm">
              <IconFileText className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-slate-900 text-base mb-1.5 tracking-tight">
              Khu vực Giáo viên
            </h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Theo dõi danh sách học sinh và tiến độ X/14 buổi của các lớp được phân công. Chấm duyệt
              bài thực hành và gửi nhận xét chi tiết.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/teacher/submissions"
              className="text-[#1d63ed] font-semibold hover:underline inline-flex items-center gap-1"
            >
              <span>Chấm bài thực hành</span>
              <span>→</span>
            </Link>
            <Link
              href="/manage/classes"
              className="text-slate-500 hover:text-slate-800 font-medium"
            >
              Danh sách lớp
            </Link>
          </div>
        </div>

        {/* Admin Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgba(15,23,42,0.04)] hover:border-blue-200 transition-all flex flex-col justify-between">
          <div>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200/80 border border-slate-300/60 text-slate-800 flex items-center justify-center mb-4 shadow-sm">
              <IconShield className="w-5 h-5" />
            </div>
            <h2 className="font-bold text-slate-900 text-base mb-1.5 tracking-tight">
              Khu vực Quản trị viên
            </h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Quản lý chương trình 14 buổi, phân công Giáo viên, cấp mã PIN 8 chữ số một lần, đồng bộ
              danh sách từ Teaching và xuất CSV tổng kết khóa.
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/manage/classes"
              className="text-[#1d63ed] font-semibold hover:underline inline-flex items-center gap-1"
            >
              <span>Quản lý lớp & PIN</span>
              <span>→</span>
            </Link>
            <Link
              href="/admin/courses"
              className="text-slate-500 hover:text-slate-800 font-medium"
            >
              Khóa học 14 buổi
            </Link>
          </div>
        </div>
      </div>

      {/* Standard MindX Course Track Overview */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgba(15,23,42,0.04)] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Lộ trình Đào tạo Chuẩn 3 Cấp Độ (Mỗi khóa 14 Buổi cố định)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thứ tự học tập từ cơ bản đến chuyên sâu áp dụng thống nhất cho các bộ môn Robotics và Lập trình
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
            <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Basic → Advanced → Intensive</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#1d63ed] uppercase tracking-wider">
                Cấp độ 1 • Khởi đầu
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1d63ed] text-[11px] font-semibold">
                14 Buổi
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm mb-1">Basic (Cơ bản)</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Làm quen tư duy cốt lõi, công cụ nền tảng và hoàn thành sản phẩm đầu tay (`ROBB`, `C4K-SB`, `JSB`, `CSB`).
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Cấp độ 2 • Phát triển
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 text-[11px] font-semibold">
                14 Buổi
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm mb-1">Advanced (Nâng cao)</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Mở rộng thuật toán, kết hợp cảm biến/tương tác giao diện và tối ưu hóa cấu trúc dự án (`ROBA`, `C4K-SA`, `JSA`, `CSA`).
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Cấp độ 3 • Hoàn thiện
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                14 Buổi
              </span>
            </div>
            <div className="font-bold text-slate-900 text-sm mb-1">Intensive (Chuyên sâu)</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Thực hiện dự án tổng hợp cuối khóa và bảo vệ sản phẩm hoàn chỉnh (`ROBI`, `C4K-SI`, `JSI`, `CSI`).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
