'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function AppFooter() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <footer className="py-6 text-center text-xs font-semibold text-[#44474d] select-none">
        © 2026 MindX Education
      </footer>
    );
  }

  return (
    <footer className="w-full border-t-[1.5px] border-[#cbd5e1] bg-white py-5 px-4 sm:px-6 lg:px-8 text-xs text-[#44474d]">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="font-medium">© 2026 MindX Education — Hệ thống Quản lý Học tập & Lớp học</span>
        <span className="text-[#0b1c30] font-bold uppercase tracking-wider text-[11px]">
          MINDX LEARN • Lộ trình 14 Buổi Chuẩn
        </span>
      </div>
    </footer>
  );
}
