'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconBookOpen,
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
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#6d28d9] text-white rounded">
            Quản trị viên
          </span>
        );
      case 'teacher':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#047857] text-white rounded">
            Giảng viên
          </span>
        );
      case 'student':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#1d4ed8] text-white rounded">
            Học sinh
          </span>
        );
    }
  };

  const navTabClass = (isActive: boolean) =>
    `h-16 inline-flex items-center px-1 border-b-[2.5px] text-xs transition-colors whitespace-nowrap ${
      isActive
        ? 'border-[#0b1c30] text-[#0b1c30] font-extrabold'
        : 'border-transparent text-[#44474d] hover:text-[#0b1c30] font-semibold'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white border-b-[1.5px] border-[#cbd5e1]">
      {/* Only show simulation banner in offline/demo mode */}
      {!isLiveMode && (
        <div className="bg-amber-50 text-amber-950 px-4 py-1.5 text-xs font-bold flex items-center justify-between border-b border-amber-300">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <IconAlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Chế độ mô phỏng cục bộ (Offline Demo)</span>
            {qaState.scenario !== 'normal' && (
              <span className="ml-auto bg-[#0b1c30] text-white px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider">
                Kịch bản: {qaState.scenario.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bootstrap Error Alert in Live Mode */}
      {isLiveMode && bootstrapError && (
        <div className="bg-[#ffdad6] border-b border-[#ba1a1a]/30 px-4 py-2 text-xs text-[#93000a]">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <IconAlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0" />
            <span className="font-bold flex-1">{bootstrapError}</span>
            <button
              onClick={() => retryBootstrap()}
              className="px-3 py-1 bg-[#ba1a1a] hover:bg-[#93000a] text-white rounded text-xs font-bold transition-colors"
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
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-9 h-9 rounded-md bg-[#0b1c30] text-white flex items-center justify-center group-hover:bg-[#1e40af] transition-colors">
                <IconBookOpen className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <span className="font-extrabold text-[#0b1c30] text-sm tracking-tight block">
                  MINDX LEARN
                </span>
                <span className="block text-[9px] text-[#44474d] font-bold uppercase tracking-wider">
                  Hệ thống Học tập 14 Buổi
                </span>
              </div>
            </Link>

            {/* Role-based High-Contrast Underline Links */}
            {!isLoginPage && currentUser && (
              <nav className="hidden md:flex items-center gap-6">
                <Link href="/" className={navTabClass(pathname === '/')}>
                  Trang chủ
                </Link>

                {currentUser.role === 'admin' && (
                  <>
                    <Link href="/manage" className={navTabClass(pathname === '/manage')}>
                      Tổng quan
                    </Link>
                    <Link
                      href="/manage/classes"
                      className={navTabClass(pathname === '/manage/classes')}
                    >
                      Lớp học & PIN
                    </Link>
                    <Link
                      href="/admin/courses"
                      className={navTabClass(
                        pathname.startsWith('/admin/courses') || pathname.startsWith('/admin/lessons')
                      )}
                    >
                      Khóa 14 Buổi
                    </Link>
                    <Link
                      href="/admin/teachers"
                      className={navTabClass(pathname === '/admin/teachers')}
                    >
                      Giáo viên
                    </Link>
                    <Link href="/admin/sync" className={navTabClass(pathname === '/admin/sync')}>
                      Đồng bộ Teaching
                    </Link>
                  </>
                )}

                {currentUser.role === 'teacher' && (
                  <>
                    <Link href="/manage" className={navTabClass(pathname === '/manage')}>
                      Lớp phụ trách
                    </Link>
                    <Link
                      href="/manage/classes"
                      className={navTabClass(pathname === '/manage/classes')}
                    >
                      Danh sách học sinh
                    </Link>
                    <Link
                      href="/teacher/submissions"
                      className={navTabClass(pathname === '/teacher/submissions')}
                    >
                      Chấm bài thực hành
                    </Link>
                  </>
                )}

                {currentUser.role === 'student' && (
                  <>
                    <Link href="/student" className={navTabClass(pathname === '/student')}>
                      Góc học tập
                    </Link>
                    <Link
                      href="/student/course"
                      className={navTabClass(
                        pathname.startsWith('/student/course') || pathname.startsWith('/student/lessons')
                      )}
                    >
                      Lộ trình 14 Buổi
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* User Status / Actions */}
          <div className="flex items-center gap-2.5">
            {currentUser && !isLoginPage ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex flex-col items-end mr-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#0b1c30]">{currentUser.name}</span>
                    {getRoleBadge()}
                  </div>
                  <span className="text-[11px] text-[#44474d] font-mono">
                    {currentUser.email || currentUser.studentCode}
                  </span>
                </div>

                <Link
                  href="/account"
                  className={`p-2 rounded-md border-[1.5px] transition-colors ${
                    pathname === '/account'
                      ? 'border-[#1e40af] bg-[#eff4ff] text-[#1e40af]'
                      : 'border-[#cbd5e1] bg-[#eff4ff] text-[#0b1c30] hover:border-[#0f233a]'
                  }`}
                  title="Hồ sơ tài khoản & Bảo mật"
                  aria-label="Hồ sơ tài khoản"
                >
                  <IconUser className="w-4 h-4" />
                </Link>

                <button
                  onClick={handleLogout}
                  className="p-2 rounded-md border-[1.5px] border-[#cbd5e1] bg-white text-[#44474d] hover:text-[#b91c1c] hover:bg-[#ffdad6]/40 hover:border-[#b91c1c] transition-colors"
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                >
                  <IconLogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 bg-[#0b1c30] hover:bg-[#1e40af] text-white rounded-md text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Đăng nhập</span>
                  <span>→</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
