import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Navbar } from '@/components/navbar';
import { QAController } from '@/components/qa-controller';
import { DemoDataState } from '@/components/demo-data-state';

export const metadata: Metadata = {
  title: 'MINDX LEARN — Hệ thống Học tập và Quản lý Lớp (TEST Mốc 1)',
  description: 'Môi trường web thử nghiệm với dữ liệu giả lập — Phục vụ nghiệm thu Mốc 1',
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
          <QAController />
        </StoreProvider>
      </body>
    </html>
  );
}
