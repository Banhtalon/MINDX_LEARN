'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconBookOpen,
  IconShield,
  IconUser,
  IconLogOut,
  IconAlertTriangle,
  IconAlertCircle,
  IconFileText,
  IconUsers,
  IconDatabase,
} from './icons';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout, qaState, isLiveMode, bootstrapError, retryBootstrap } = useStore();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const getRoleBadge = () => {
    if (!currentUser) return null;
    switch (currentUser.role) {
      case 'admin':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full border border-purple-200">Admin Quản trị</span>;
      case 'teacher':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">Giáo viên</span>;
      case 'student':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full border border-blue-200">Học sinh</span>;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      {/* Top Warning Banner */}
      <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-medium flex items-center justify-between border-b border-amber-600">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <IconAlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
          {isLiveMode ? (
            <span className="font-bold tracking-wide">TEST MỐC 2 — dữ liệu học sinh giả, đăng nhập thật</span>
          ) : (
            <>
              <span className="font-bold tracking-wide">DỮ LIỆU GIẢ — MÔI TRƯỜNG THỬ NGHIỆM MỐC 1 (MÔ PHỎNG)</span>
              <span className="text-slate-900 hidden md:inline">
                | Mọi thao tác lưu/cấp mã/đồng bộ đều đang chạy mô phỏng trong bộ nhớ tạm (không kết nối cơ sở dữ liệu thật).
              </span>
              {qaState.scenario !== 'normal' && (
                <span className="ml-auto bg-slate-900 text-white px-2 py-0.5 rounded text-[11px] font-semibold">
                  Kịch bản QA: {qaState.scenario.toUpperCase()}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bootstrap Error Alert in Live Mode */}
      {isLiveMode && bootstrapError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-800">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold flex-1">{bootstrapError}</span>
            <button
              onClick={() => retryBootstrap()}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-sm group-hover:bg-blue-700 transition-colors">
                M
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-base tracking-tight">MINDX LEARN</span>
                <span className="block text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                  {isLiveMode ? 'Bản thử nghiệm Mốc 2' : 'Bản thử nghiệm Mốc 1 (Mô phỏng)'}
                </span>
              </div>
            </Link>

            {/* Role-based Links */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              {currentUser?.role === 'admin' && (
                <>
                  <Link
                    href="/manage"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/manage'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Tổng quan
                  </Link>
                  <Link
                    href="/manage/classes"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/manage/classes'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Quản lý lớp & PIN
                  </Link>
                  <Link
                    href="/admin/courses"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname.startsWith('/admin/courses') || pathname.startsWith('/admin/lessons')
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Khóa 14 Buổi
                  </Link>
                  <Link
                    href="/admin/teachers"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/admin/teachers'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Giáo viên
                  </Link>
                  <Link
                    href="/admin/sync"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/admin/sync'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Đồng bộ Teaching
                  </Link>
                </>
              )}

              {currentUser?.role === 'teacher' && (
                <>
                  <Link
                    href="/manage"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/manage'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Lớp phụ trách
                  </Link>
                  <Link
                    href="/manage/classes"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/manage/classes'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Danh sách học sinh
                  </Link>
                  <Link
                    href="/teacher/submissions"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/teacher/submissions'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Hàng đợi chấm bài
                  </Link>
                </>
              )}

              {currentUser?.role === 'student' && (
                <>
                  <Link
                    href="/student"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname === '/student'
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Góc học tập
                  </Link>
                  <Link
                    href="/student/course"
                    className={`px-3 py-2 rounded-md transition-colors ${
                      pathname.startsWith('/student/course') || pathname.startsWith('/student/lessons')
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Danh sách 14 buổi
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* User Status / Actions */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{currentUser.name}</span>
                    {getRoleBadge()}
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {currentUser.email || currentUser.studentCode}
                  </span>
                </div>

                <Link
                  href="/account"
                  className={`p-2 rounded-lg border transition-colors ${
                    pathname === '/account'
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Hồ sơ tài khoản / Đổi mật khẩu hoặc PIN"
                >
                  <IconUser className="w-4 h-4" />
                </Link>

                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Đăng xuất"
                >
                  <IconLogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm transition-colors"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
