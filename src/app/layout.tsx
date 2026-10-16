import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Navbar } from '@/components/navbar';
import { QAController } from '@/components/qa-controller';
import { DemoDataState } from '@/components/demo-data-state';

export const metadata: Metadata = {
  title: 'MINDX LEARN — Hệ thống Học tập và Quản lý Lớp (Mốc 2)',
  description: 'Hệ thống Quản trị & Học tập MINDX LEARN — Giao diện Mốc 2',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <StoreProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <DemoDataState>{children}</DemoDataState>
          </main>
          <footer className="w-full border-t border-slate-200 bg-white py-4 px-4 sm:px-6 lg:px-8 text-sm text-slate-600">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>© 2026 MindX Education. Hệ thống Quản trị Lớp học & Đăng nhập Mốc 2.</span>
              <span className="text-xs text-slate-500 font-medium">Môi trường TEST — chỉ dữ liệu học sinh giả</span>
            </div>
          </footer>
          <QAController />
        </StoreProvider>
      </body>
    </html>
  );
}
