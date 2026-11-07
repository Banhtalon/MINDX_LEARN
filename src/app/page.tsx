'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import {
  IconShield,
  IconBookOpen,
  IconCheckCircle,
  IconFileText,
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
    <div className="space-y-6">
      {/* Hero Welcome Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-7 sm:p-9">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eff4ff] border border-[#dbeafe] text-[#1d63ed] text-[11px] font-bold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-[#1d63ed]" />
            <span>Hệ thống Quản lý Lớp học &amp; Học tập 14 Buổi</span>
          </div>

          <h1 className="text-2xl sm:text-[36px] font-extrabold text-[#0b1c30] tracking-[-0.02em] leading-tight mb-3">
            Chào mừng đến với MINDX LEARN
          </h1>
          <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed mb-6 max-w-2xl">
            Không gian học tập trực tuyến theo lộ trình chuẩn{' '}
            <span className="inline-block bg-[#eff4ff] text-[#1d63ed] font-bold px-2.5 py-0.5 rounded-full border border-[#dbeafe] text-xs">
              Basic → Advanced → Intensive
            </span>{' '}
            với 14 buổi học cố định mỗi khóa, kết hợp làm bài Trắc nghiệm và nộp dự án Thực hành trực tiếp.
          </p>

          {!isLiveMode ? (
            <div className="bg-[#f8f9ff] p-4 rounded-2xl border border-slate-200/80">
              <div className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-2.5">
                Chuyển nhanh vai trò thử nghiệm:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => switchDemoUser('admin')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    currentUser?.role === 'admin'
                      ? 'bg-[#1d63ed] text-white shadow-sm'
                      : 'bg-white text-[#0b1c30] border border-slate-200 hover:border-[#1d63ed]/50'
                  }`}
                >
                  Quản trị viên (Admin)
                </button>
                <button
                  onClick={() => switchDemoUser('teacher')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    currentUser?.role === 'teacher'
                      ? 'bg-[#1d63ed] text-white shadow-sm'
                      : 'bg-white text-[#0b1c30] border border-slate-200 hover:border-[#1d63ed]/50'
                  }`}
                >
                  Giáo viên
                </button>
                <button
                  onClick={() => switchDemoUser('student')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    currentUser?.role === 'student'
                      ? 'bg-[#1d63ed] text-white shadow-sm'
                      : 'bg-white text-[#0b1c30] border border-slate-200 hover:border-[#1d63ed]/50'
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
                    className="min-h-[42px] px-5 py-2.5 bg-[#1d63ed] hover:bg-[#164fc4] text-white font-bold rounded-xl text-xs shadow-sm transition-colors inline-flex items-center gap-2"
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
                    className="min-h-[42px] px-4 py-2.5 bg-[#eff4ff] hover:bg-[#dbeafe] text-[#1d63ed] font-bold rounded-xl text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <IconFileText className="w-3.5 h-3.5" />
                    <span>Hồ sơ tài khoản</span>
                  </Link>
                </>
              ) : (
                <Link
                  href="/login"
                  className="min-h-[42px] px-5 py-2.5 bg-[#1d63ed] hover:bg-[#164fc4] text-white font-bold rounded-xl text-xs shadow-sm transition-colors inline-flex items-center gap-2"
                >
                  <span>Đăng nhập vào lớp học</span>
                  <span>→</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3 Role Portals (shown when not logged in or in demo mode) */}
      {(!isLiveMode || !currentUser) && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Student Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-[#1d63ed]/40 hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#eff4ff] border border-[#dbeafe] text-[#1d63ed] flex items-center justify-center">
                <IconBookOpen className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] border border-[#dbeafe] text-[#1d63ed] text-[10px] font-bold uppercase tracking-wider">
                Học sinh
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Học sinh
            </h2>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Đăng nhập bằng Mã học sinh và mã PIN 8 chữ số. Xem bài giảng 14 buổi, làm bài Trắc nghiệm
              (đạt từ 70%) và nộp bài Thực hành.
            </p>
          </div>
          <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/student"
              className="text-[#1d63ed] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Góc học tập</span>
              <span>→</span>
            </Link>
            <Link
              href="/student/course"
              className="text-slate-500 hover:text-[#0b1c30] font-semibold"
            >
              Lộ trình 14 buổi
            </Link>
          </div>
        </div>

        {/* Teacher Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-[#047857]/40 hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] flex items-center justify-center">
                <IconFileText className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] text-[10px] font-bold uppercase tracking-wider">
                Giảng viên
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Giáo viên
            </h2>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Theo dõi danh sách học sinh và tiến độ X/14 buổi của các lớp được phân công. Chấm duyệt
              bài thực hành và gửi nhận xét chi tiết.
            </p>
          </div>
          <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/teacher/submissions"
              className="text-[#047857] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Chấm bài thực hành</span>
              <span>→</span>
            </Link>
            <Link
              href="/manage/classes"
              className="text-slate-500 hover:text-[#0b1c30] font-semibold"
            >
              Danh sách lớp
            </Link>
          </div>
        </div>

        {/* Admin Portal Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:border-[#6d28d9]/40 hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#f5f3ff] border border-[#ddd6fe] text-[#6d28d9] flex items-center justify-center">
                <IconShield className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#f5f3ff] border border-[#ddd6fe] text-[#6d28d9] text-[10px] font-bold uppercase tracking-wider">
                Quản trị
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Quản trị viên
            </h2>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Quản lý chương trình 14 buổi, phân công Giáo viên, cấp mã PIN 8 chữ số một lần, đồng bộ
              danh sách từ Teaching và xuất CSV tổng kết khóa.
            </p>
          </div>
          <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/manage/classes"
              className="text-[#6d28d9] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Quản lý lớp &amp; PIN</span>
              <span>→</span>
            </Link>
            <Link
              href="/admin/courses"
              className="text-slate-500 hover:text-[#0b1c30] font-semibold"
            >
              Khóa học 14 buổi
            </Link>
          </div>
        </div>
      </div>
      )}

      {/* Standard MindX Course Track Overview */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-extrabold text-[#0b1c30] tracking-tight">
              Lộ trình Đào tạo 3 Cấp Độ (Mỗi khóa 14 Buổi)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thứ tự học tập từ cơ bản đến chuyên sâu áp dụng thống nhất cho các bộ môn Robotics và Lập trình
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f8f9ff] border border-slate-200 text-[#0b1c30] text-[11px] font-bold uppercase tracking-wider">
            <IconCheckCircle className="w-3.5 h-3.5 text-[#047857]" />
            <span>Basic → Advanced → Intensive</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
          {/* Tier 1: Basic */}
          <div className="p-5 rounded-2xl bg-[#f8faff] border border-blue-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#dbeafe] text-[#1d63ed] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 1 - Khởi đầu
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-blue-200 text-[#1d63ed] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Basic (Cơ bản)</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Làm quen tư duy cốt lõi, công cụ nền tảng và hoàn thành sản phẩm đầu tay.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-blue-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBB', 'C4K-SB', 'JSB', 'CSB'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-white border border-blue-200/80 rounded-md text-[11px] font-mono font-bold text-[#0b1c30]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tier 2: Advanced */}
          <div className="p-5 rounded-2xl bg-[#fffdf7] border border-amber-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 2 - Phát triển
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-amber-200 text-[#b45309] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Advanced (Nâng cao)</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mở rộng thuật toán, kết hợp cảm biến/tương tác giao diện và tối ưu hóa cấu trúc dự án.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-amber-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBA', 'C4K-SA', 'JSA', 'CSA'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-white border border-amber-200/80 rounded-md text-[11px] font-mono font-bold text-[#0b1c30]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tier 3: Intensive */}
          <div className="p-5 rounded-2xl bg-[#fffafa] border border-rose-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 3 - Hoàn thiện
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-rose-200 text-[#b91c1c] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Intensive (Chuyên sâu)</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Thực hiện dự án tổng hợp cuối khóa và bảo vệ sản phẩm hoàn chỉnh trước hội đồng.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-rose-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBI', 'C4K-SI', 'JSI', 'CSI'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-white border border-rose-200/80 rounded-md text-[11px] font-mono font-bold text-[#0b1c30]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
