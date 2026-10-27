'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconUser,
  IconLogOut,
  IconAlertTriangle,
  IconAlertCircle,
} from './icons';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout, qaState, isLiveMode, bootstrapError, retryBootstrap } = useStore();

  const isLoginPage = pathname === '/login';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const getRoleBadge = () => {
    if (!currentUser) return null;
    switch (currentUser.role) {
      case 'admin':
        return (
          <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-blue-50 text-[#1d63ed] rounded-full border border-blue-200/70">
            Quản trị viên
          </span>
        );
      case 'teacher':
        return (
          <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200/70">
            Giáo viên
          </span>
        );
      case 'student':
        return (
          <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-sky-50 text-sky-700 rounded-full border border-sky-200/70">
            Học sinh
          </span>
        );
    }
  };

  if (isLoginPage) {
    return (
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-[#1d63ed] text-white flex items-center justify-center font-black text-base shadow-sm shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
                M
              </div>
              <span className="font-extrabold text-slate-900 text-base tracking-tight">MINDX LEARN</span>
            </Link>

            <button
              type="button"
              className="px-3.5 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-sm transition-colors cursor-default"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </header>
    );
  }

  const navPillClass = (isActive: boolean) =>
    `px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
      isActive
        ? 'bg-[#1d63ed] text-white shadow-sm shadow-blue-500/25'
        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-[0_2px_20px_rgba(15,23,42,0.03)]">
      {/* Only show simulation banner in offline/demo mode */}
      {!isLiveMode && (
        <div className="bg-amber-50 text-amber-900 px-4 py-1.5 text-xs font-medium flex items-center justify-between border-b border-amber-200/70">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <IconAlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold">Chế độ mô phỏng cục bộ (Offline Demo)</span>
            {qaState.scenario !== 'normal' && (
              <span className="ml-auto bg-slate-900 text-white px-2 py-0.5 rounded-full text-[11px] font-semibold">
                Kịch bản: {qaState.scenario.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bootstrap Error Alert in Live Mode */}
      {isLiveMode && bootstrapError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-800">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold flex-1">{bootstrapError}</span>
            <button
              onClick={() => retryBootstrap()}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-9 h-9 rounded-xl bg-[#1d63ed] text-white flex items-center justify-center font-black text-base shadow-sm shadow-blue-500/25 group-hover:bg-blue-700 transition-colors">
                M
              </div>
              <div className="leading-tight">
                <span className="font-extrabold text-slate-900 text-base tracking-tight block">
                  MINDX LEARN
                </span>
                <span className="block text-[10px] text-slate-400 font-semibold tracking-wide">
                  Hệ thống Học tập 14 Buổi
                </span>
              </div>
            </Link>

            {/* Role-based Segmented Pill Links */}
            {currentUser && (
              <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-full border border-slate-200/50">
                {currentUser.role === 'admin' && (
                  <>
                    <Link href="/manage" className={navPillClass(pathname === '/manage')}>
                      Tổng quan
                    </Link>
                    <Link
                      href="/manage/classes"
                      className={navPillClass(pathname === '/manage/classes')}
                    >
                      Lớp học & PIN
                    </Link>
                    <Link
                      href="/admin/courses"
                      className={navPillClass(
                        pathname.startsWith('/admin/courses') || pathname.startsWith('/admin/lessons')
                      )}
                    >
                      Khóa 14 Buổi
                    </Link>
                    <Link
                      href="/admin/teachers"
                      className={navPillClass(pathname === '/admin/teachers')}
                    >
                      Giáo viên
                    </Link>
                    <Link href="/admin/sync" className={navPillClass(pathname === '/admin/sync')}>
                      Đồng bộ Teaching
                    </Link>
                  </>
                )}

                {currentUser.role === 'teacher' && (
                  <>
                    <Link href="/manage" className={navPillClass(pathname === '/manage')}>
                      Lớp phụ trách
                    </Link>
                    <Link
                      href="/manage/classes"
                      className={navPillClass(pathname === '/manage/classes')}
                    >
                      Danh sách học sinh
                    </Link>
                    <Link
                      href="/teacher/submissions"
                      className={navPillClass(pathname === '/teacher/submissions')}
                    >
                      Chấm bài thực hành
                    </Link>
                  </>
                )}

                {currentUser.role === 'student' && (
                  <>
                    <Link href="/student" className={navPillClass(pathname === '/student')}>
                      Góc học tập
                    </Link>
                    <Link
                      href="/student/course"
                      className={navPillClass(
                        pathname.startsWith('/student/course') || pathname.startsWith('/student/lessons')
                      )}
                    >
                      Lộ trình 14 buổi
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* User Status / Actions */}
          <div className="flex items-center gap-2.5">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex flex-col items-end mr-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{currentUser.name}</span>
                    {getRoleBadge()}
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentUser.email || currentUser.studentCode}
                  </span>
                </div>

                <Link
                  href="/account"
                  className={`p-2 rounded-xl border transition-all ${
                    pathname === '/account'
                      ? 'border-[#1d63ed] bg-blue-50/80 text-[#1d63ed] shadow-sm'
                      : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title="Hồ sơ tài khoản & Bảo mật"
                  aria-label="Hồ sơ tài khoản"
                >
                  <IconUser className="w-4 h-4" />
                </Link>

                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl border border-slate-200/80 bg-white text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all"
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                >
                  <IconLogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 bg-[#1d63ed] text-white rounded-xl text-xs font-semibold hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all"
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
