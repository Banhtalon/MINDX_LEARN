import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Navbar } from '@/components/navbar';
import { AppFooter } from '@/components/footer';
import { QAController } from '@/components/qa-controller';
import { DemoDataState } from '@/components/demo-data-state';
import { assertRuntimeEnvironmentGuard } from '@/lib/server/crypto';

export const metadata: Metadata = {
  title: 'MINDX LEARN — Hệ thống Học tập và Quản lý Lớp học',
  description: 'Nền tảng Quản lý Lớp học & Học tập 14 Buổi MINDX LEARN',
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
  assertRuntimeEnvironmentGuard(process.env);
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
        <StoreProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7">
            <DemoDataState>{children}</DemoDataState>
          </main>
          <AppFooter />
          <QAController />
        </StoreProvider>
      </body>
    </html>
  );
}
