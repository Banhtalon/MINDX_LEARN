import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Navbar } from '@/components/navbar';
import { AppFooter } from '@/components/footer';
import { QAController } from '@/components/qa-controller';
import { DemoDataState } from '@/components/demo-data-state';
import { assertRuntimeEnvironmentGuard } from '@/lib/server/crypto';

const publicSans = Public_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-public-sans',
});

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
    <html lang="vi" className={publicSans.variable}>
      <body className={`${publicSans.className} min-h-screen flex flex-col bg-[#f8f9ff] text-[#0b1c30]`}>
        <StoreProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <DemoDataState>{children}</DemoDataState>
          </main>
          <AppFooter />
          <QAController />
        </StoreProvider>
      </body>
    </html>
  );
}
