'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function AppFooter() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <footer className="py-6 text-center text-xs font-semibold text-slate-500 select-none">
        © 2026 MindX Education
      </footer>
    );
  }

  return (
    <footer className="w-full border-t border-slate-200/80 bg-white py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="font-medium">© 2026 MindX Education — Hệ thống Quản lý Học tập & Lớp học</span>
        <span className="text-[#1d63ed] font-bold uppercase tracking-wider text-[11px]">
          MINDX LEARN • Lộ trình 14 Buổi Chuẩn
        </span>
      </div>
    </footer>
  );
}
