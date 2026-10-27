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
      <div className="bg-white rounded-lg border-[1.5px] border-[#cbd5e1] p-7 sm:p-9">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eff4ff] border border-[#708cfd] text-[#1d4ed8] text-[11px] font-bold uppercase tracking-wider mb-4">
            <span className="w-2 h-2 rounded-full bg-[#1d4ed8]" />
            <span>Hệ thống Quản lý Lớp học &amp; Học tập 14 Buổi</span>
          </div>

          <h1 className="text-2xl sm:text-[36px] font-extrabold text-[#0b1c30] tracking-[-0.02em] leading-tight mb-3">
            Chào mừng đến với MINDX LEARN
          </h1>
          <p className="text-[#44474d] text-sm sm:text-[15px] leading-relaxed mb-6 max-w-2xl">
            Không gian học tập trực tuyến theo lộ trình chuẩn{' '}
            <span className="inline-block bg-[#e5eeff] text-[#0b1c30] font-bold px-2 py-0.5 rounded border border-[#cbdbf5] text-xs">
              Basic → Advanced → Intensive
            </span>{' '}
            với 14 buổi học cố định mỗi khóa, kết hợp làm bài Trắc nghiệm và nộp dự án Thực hành trực tiếp.
          </p>

          {!isLiveMode ? (
            <div className="bg-[#f8f9ff] p-4 rounded-lg border-[1.5px] border-[#cbd5e1]">
              <div className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-2.5">
                Chuyển nhanh vai trò thử nghiệm:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => switchDemoUser('admin')}
                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${
                    currentUser?.role === 'admin'
                      ? 'bg-[#0b1c30] text-white'
                      : 'bg-white text-[#0b1c30] border-[1.5px] border-[#cbd5e1] hover:border-[#0b1c30]'
                  }`}
                >
                  Quản trị viên (Admin)
                </button>
                <button
                  onClick={() => switchDemoUser('teacher')}
                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${
                    currentUser?.role === 'teacher'
                      ? 'bg-[#0b1c30] text-white'
                      : 'bg-white text-[#0b1c30] border-[1.5px] border-[#cbd5e1] hover:border-[#0b1c30]'
                  }`}
                >
                  Giáo viên
                </button>
                <button
                  onClick={() => switchDemoUser('student')}
                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${
                    currentUser?.role === 'student'
                      ? 'bg-[#0b1c30] text-white'
                      : 'bg-white text-[#0b1c30] border-[1.5px] border-[#cbd5e1] hover:border-[#0b1c30]'
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
                    className="min-h-[42px] px-5 py-2.5 bg-[#0b1c30] hover:bg-[#1e40af] text-white font-bold rounded-md text-xs transition-colors inline-flex items-center gap-2"
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
                    className="min-h-[42px] px-4 py-2.5 bg-white hover:bg-[#eff4ff] text-[#0b1c30] border-[1.5px] border-[#0b1c30] font-bold rounded-md text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <IconFileText className="w-3.5 h-3.5" />
                    <span>Hồ sơ tài khoản</span>
                  </Link>
                </>
              ) : (
                <Link
                  href="/login"
                  className="min-h-[42px] px-5 py-2.5 bg-[#0b1c30] hover:bg-[#1e40af] text-white font-bold rounded-md text-xs transition-colors inline-flex items-center gap-2"
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
        <div className="bg-white p-6 rounded-lg border-[1.5px] border-[#cbd5e1] hover:border-[#1d4ed8] transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-md bg-[#eff4ff] border border-[#b8c4ff] text-[#1d4ed8] flex items-center justify-center">
                <IconBookOpen className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] border border-[#b8c4ff] text-[#1d4ed8] text-[10px] font-bold uppercase tracking-wider">
                Học sinh
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Học sinh
            </h2>
            <p className="text-xs text-[#44474d] mb-5 leading-relaxed">
              Đăng nhập bằng Mã học sinh và mã PIN 8 chữ số. Xem bài giảng 14 buổi, làm bài Trắc nghiệm
              (đạt từ 70%) và nộp bài Thực hành.
            </p>
          </div>
          <div className="pt-3.5 border-t border-[#cbd5e1] flex items-center justify-between text-xs">
            <Link
              href="/student"
              className="text-[#1d4ed8] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Góc học tập</span>
              <span>→</span>
            </Link>
            <Link
              href="/student/course"
              className="text-[#44474d] hover:text-[#0b1c30] font-semibold"
            >
              Lộ trình 14 buổi
            </Link>
          </div>
        </div>

        {/* Teacher Portal Card */}
        <div className="bg-white p-6 rounded-lg border-[1.5px] border-[#cbd5e1] hover:border-[#047857] transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-md bg-[#ecfdf5] border border-[#97f5cc] text-[#047857] flex items-center justify-center">
                <IconFileText className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#ecfdf5] border border-[#97f5cc] text-[#047857] text-[10px] font-bold uppercase tracking-wider">
                Giảng viên
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Giáo viên
            </h2>
            <p className="text-xs text-[#44474d] mb-5 leading-relaxed">
              Theo dõi danh sách học sinh và tiến độ X/14 buổi của các lớp được phân công. Chấm duyệt
              bài thực hành và gửi nhận xét chi tiết.
            </p>
          </div>
          <div className="pt-3.5 border-t border-[#cbd5e1] flex items-center justify-between text-xs">
            <Link
              href="/teacher/submissions"
              className="text-[#047857] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Chấm bài thực hành</span>
              <span>→</span>
            </Link>
            <Link
              href="/manage/classes"
              className="text-[#44474d] hover:text-[#0b1c30] font-semibold"
            >
              Danh sách lớp
            </Link>
          </div>
        </div>

        {/* Admin Portal Card */}
        <div className="bg-white p-6 rounded-lg border-[1.5px] border-[#cbd5e1] hover:border-[#6d28d9] transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-md bg-[#f5f3ff] border border-[#ddd6fe] text-[#6d28d9] flex items-center justify-center">
                <IconShield className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-[#f5f3ff] border border-[#ddd6fe] text-[#6d28d9] text-[10px] font-bold uppercase tracking-wider">
                Quản trị
              </span>
            </div>
            <h2 className="font-extrabold text-[#0b1c30] text-base mb-1.5 tracking-tight">
              Khu vực Quản trị viên
            </h2>
            <p className="text-xs text-[#44474d] mb-5 leading-relaxed">
              Quản lý chương trình 14 buổi, phân công Giáo viên, cấp mã PIN 8 chữ số một lần, đồng bộ
              danh sách từ Teaching và xuất CSV tổng kết khóa.
            </p>
          </div>
          <div className="pt-3.5 border-t border-[#cbd5e1] flex items-center justify-between text-xs">
            <Link
              href="/manage/classes"
              className="text-[#6d28d9] font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Quản lý lớp &amp; PIN</span>
              <span>→</span>
            </Link>
            <Link
              href="/admin/courses"
              className="text-[#44474d] hover:text-[#0b1c30] font-semibold"
            >
              Khóa học 14 buổi
            </Link>
          </div>
        </div>
      </div>

      {/* Standard MindX Course Track Overview */}
      <div className="bg-white rounded-lg border-[1.5px] border-[#cbd5e1] p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#cbd5e1]">
          <div>
            <h2 className="text-lg font-extrabold text-[#0b1c30] tracking-tight">
              Lộ trình Đào tạo Chuẩn 3 Cấp Độ (Mỗi khóa 14 Buổi cố định)
            </h2>
            <p className="text-xs text-[#44474d] mt-0.5">
              Thứ tự học tập từ cơ bản đến chuyên sâu áp dụng thống nhất cho các bộ môn Robotics và Lập trình
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f8f9ff] border border-[#94a3b8] text-[#0b1c30] text-[11px] font-bold uppercase tracking-wider">
            <IconCheckCircle className="w-3.5 h-3.5 text-[#047857]" />
            <span>Basic → Advanced → Intensive</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5">
          {/* Tier 1: Basic */}
          <div className="p-5 rounded-lg bg-[#f8faff] border-[1.5px] border-[#93c5fd] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-[#dbeafe] text-[#1d4ed8] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 1 - Khởi đầu
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#93c5fd] text-[#1d4ed8] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Basic (Cơ bản)</div>
              <p className="text-xs text-[#44474d] leading-relaxed">
                Làm quen tư duy cốt lõi, công cụ nền tảng và hoàn thành sản phẩm đầu tay.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#bfdbfe]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#44474d] mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBB', 'C4K-SB', 'JSB', 'CSB'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-[#e2e8f0]/80 border border-[#cbd5e1] rounded text-[11px] font-mono font-bold text-[#0b1c30]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tier 2: Advanced */}
          <div className="p-5 rounded-lg bg-[#fffdf7] border-[1.5px] border-[#fcd34d] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-[#fef3c7] text-[#b45309] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 2 - Phát triển
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#fcd34d] text-[#b45309] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Advanced (Nâng cao)</div>
              <p className="text-xs text-[#44474d] leading-relaxed">
                Mở rộng thuật toán, kết hợp cảm biến/tương tác giao diện và tối ưu hóa cấu trúc dự án.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#fde68a]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#44474d] mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBA', 'C4K-SA', 'JSA', 'CSA'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-[#e2e8f0]/80 border border-[#cbd5e1] rounded text-[11px] font-mono font-bold text-[#0b1c30]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tier 3: Intensive */}
          <div className="p-5 rounded-lg bg-[#fffafa] border-[1.5px] border-[#fca5a5] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-[#fee2e2] text-[#b91c1c] text-[10px] font-bold uppercase tracking-wider">
                  Cấp độ 3 - Hoàn thiện
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#fca5a5] text-[#b91c1c] text-[11px] font-bold">
                  14 Buổi
                </span>
              </div>
              <div className="font-extrabold text-[#0b1c30] text-sm mb-1.5">Intensive (Chuyên sâu)</div>
              <p className="text-xs text-[#44474d] leading-relaxed">
                Thực hiện dự án tổng hợp cuối khóa và bảo vệ sản phẩm hoàn chỉnh trước hội đồng.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#fecaca]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#44474d] mb-1.5">
                Mã học phần:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ROBI', 'C4K-SI', 'JSI', 'CSI'].map((code) => (
                  <span
                    key={code}
                    className="px-2 py-0.5 bg-[#e2e8f0]/80 border border-[#cbd5e1] rounded text-[11px] font-mono font-bold text-[#0b1c30]"
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
