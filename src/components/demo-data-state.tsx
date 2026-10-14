'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconRefreshCw,
  IconAlertTriangle,
  IconLock,
  IconShield,
  IconClock,
  IconDatabase,
  IconCheck,
} from './icons';

interface DemoDataStateProps {
  children: React.ReactNode;
}

/**
 * Shared Client Boundary mô phỏng 7 trạng thái dữ liệu (Mốc 1)
 * Giúp mọi trang (kể cả UI-05 courses, UI-10, UI-03...) phản ứng đúng
 * với kịch bản thử nghiệm mà Owner chọn, không chặn trang /login.
 */
export function DemoDataState({ children }: DemoDataStateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { qaState, setQAScenario, currentUser, logout } = useStore();

  // State cho hiệu ứng Đang tải (Loading delay 2 giây)
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  useEffect(() => {
    if (qaState.scenario === 'loading') {
      setIsLoadingActive(true);
      const timer = setTimeout(() => {
        setIsLoadingActive(false);
      }, qaState.delayMs || 2000);
      return () => clearTimeout(timer);
    } else {
      setIsLoadingActive(false);
    }
  }, [qaState.scenario, qaState.delayMs, pathname]);

  // Trang đăng nhập /login không bị bao vây bởi boundary để luôn có thể đăng nhập hoặc hồi phục
  const isLoginPage = pathname === '/login';
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 1. Trạng thái Đang tải (Loading)
  if (isLoadingActive) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-150 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
          <IconRefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">Đang tải dữ liệu mô phỏng...</h2>
        <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
          Hệ thống đang mô phỏng độ trễ mạng trong 2 giây. Nội dung trang sẽ tự động hiển thị ngay sau khi tải xong.
        </p>
        <button
          type="button"
          onClick={() => setIsLoadingActive(false)}
          className="text-xs text-blue-600 font-bold hover:underline"
        >
          Bỏ qua thời gian chờ
        </button>
      </div>
    );
  }

  // 2. Trạng thái Dữ liệu trống (Empty Data)
  if (qaState.scenario === 'empty_data') {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconDatabase className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              <strong>Tình huống đang chọn:</strong> Danh sách trống (Empty State). Hệ thống mô phỏng cơ sở
              dữ liệu chưa có khóa học, lớp học hoặc bài nộp nào.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQAScenario('normal')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shrink-0 transition-colors"
          >
            Khôi phục dữ liệu mẫu
          </button>
        </div>
        {children}
      </div>
    );
  }

  // 3. Trạng thái Mất kết nối (Network Error)
  if (qaState.scenario === 'network_error') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <IconAlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">Mất kết nối máy chủ (Mô phỏng)</h2>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
          Hệ thống đang mô phỏng tình huống gián đoạn đường truyền mạng đến máy chủ. Vui lòng kiểm tra lại
          kết nối hoặc nhấn nút bên dưới để thử lại.
        </p>
        <button
          type="button"
          onClick={() => setQAScenario('normal')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
        >
          <IconRefreshCw className="w-4 h-4" />
          <span>Thử lại kết nối</span>
        </button>
      </div>
    );
  }

  // 4. Trạng thái Hết phiên làm việc (Session Expired)
  if (qaState.scenario === 'session_expired') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
          <IconLock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">Phiên làm việc đã hết hạn (Mô phỏng)</h2>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
          Phiên đăng nhập tạm thời đã kết thúc để kiểm tra tình huống bảo mật. Nội dung trang được bảo vệ và
          tạm ẩn. Vui lòng bấm đăng nhập lại để tiếp tục.
        </p>
        <button
          type="button"
          onClick={() => {
            setQAScenario('normal');
            logout();
            router.push('/login');
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
        >
          <span>Đăng nhập lại</span>
        </button>
      </div>
    );
  }

  // 5. Trạng thái Không đủ quyền (Forbidden)
  if (qaState.scenario === 'forbidden') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
          <IconShield className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">Không đủ quyền truy cập (Mô phỏng)</h2>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
          Tài khoản hiện tại ({currentUser?.role || 'Khách'}) không có quyền thao tác trên trang này theo
          mô phỏng phân quyền. Bạn có thể quay lại khu vực làm việc của mình hoặc đặt lại tình huống.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setQAScenario('normal');
              if (currentUser?.role === 'student') router.push('/student');
              else if (currentUser?.role === 'teacher') router.push('/manage');
              else router.push('/manage');
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            Quay về khu vực của vai trò
          </button>
          <button
            type="button"
            onClick={() => setQAScenario('normal')}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors"
          >
            Đặt lại tình huống bình thường
          </button>
        </div>
      </div>
    );
  }

  // 6 & 7: Normal hoặc Save Error (hiển thị giao diện con bình thường)
  return <>{children}</>;
}
