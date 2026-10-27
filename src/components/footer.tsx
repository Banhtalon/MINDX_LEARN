'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function AppFooter() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <footer className="py-6 text-center text-xs text-slate-400 select-none">
        © 2026 MindX Education
      </footer>
    );
  }

  return (
    <footer className="w-full border-t border-slate-100 bg-white/80 backdrop-blur-sm py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 MindX Education — Hệ thống Quản lý Học tập & Lớp học</span>
        <span className="text-slate-400 font-medium">MINDX LEARN • Lộ trình 14 Buổi Chuẩn</span>
      </div>
    </footer>
  );
}
