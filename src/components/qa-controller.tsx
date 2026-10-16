'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { QAScenario } from '@/lib/types';
import {
  IconSettings,
  IconShield,
  IconCheck,
  IconX,
  IconRefreshCw,
} from './icons';

export function QAController() {
  const { qaState, setQAScenario, currentUser, switchDemoUser, isLiveMode } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  // In live mode, never expose QA controller or role switching
  if (isLiveMode) {
    return null;
  }

  const scenarios: { key: QAScenario; label: string; desc: string; badgeColor: string }[] = [
    {
      key: 'normal',
      label: '1. Bình thường',
      desc: 'Mọi luồng dữ liệu giả hoạt động chuẩn, phản hồi tức thì.',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    {
      key: 'loading',
      label: '2. Đang tải',
      desc: 'Mô phỏng độ trễ mạng trong 2 giây để xem màn hình đang tải.',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      key: 'save_error',
      label: '3. Lưu thất bại',
      desc: 'Thao tác lưu báo lỗi máy chủ và không thay đổi dữ liệu.',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    },
    {
      key: 'network_error',
      label: '4. Mất kết nối',
      desc: 'Báo lỗi gián đoạn đường truyền mạng, hiển thị nút thử lại.',
      badgeColor: 'bg-red-100 text-red-800 border-red-300',
    },
    {
      key: 'session_expired',
      label: '5. Hết phiên',
      desc: 'Mô phỏng phiên làm việc hết hạn, yêu cầu đăng nhập lại.',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    {
      key: 'forbidden',
      label: '6. Không đủ quyền',
      desc: 'Mô phỏng tài khoản không có quyền truy cập vào khu vực này.',
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    {
      key: 'empty_data',
      label: '7. Danh sách trống',
      desc: 'Mô phỏng giao diện khi hệ thống chưa có dữ liệu nào.',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    },
  ];

  const currentInfo = scenarios.find((s) => s.key === qaState.scenario) || scenarios[0];

  const getRoleDisplayName = () => {
    if (!currentUser) return 'Chưa đăng nhập';
    switch (currentUser.role) {
      case 'admin':
        return 'Admin';
      case 'teacher':
        return 'Giáo viên';
      case 'student':
        return 'Học sinh';
      default:
        return currentUser.role;
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 z-40 pointer-events-auto" aria-label="Bảng điều khiển thử tình huống">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Mở bảng Thử tình huống hệ thống"
          className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg shadow-xl hover:bg-slate-800 border border-slate-700 text-xs font-medium transition-all"
        >
          <IconSettings className="w-4 h-4 text-blue-400" />
          <span>Thử tình huống:</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${currentInfo.badgeColor}`}>
            {currentInfo.label.replace(/^\d+\.\s*/, '')}
          </span>
        </button>
      )}

      {/* Expanded Panel */}
      {isOpen && (
        <div className="w-[360px] max-h-[80vh] flex flex-col bg-white rounded-xl shadow-2xl border border-slate-300 p-4 animate-in fade-in slide-in-from-bottom-4 duration-150">
          <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <IconShield className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Thử tình huống hệ thống</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng bảng thử tình huống"
              className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 space-y-3 pr-1">
            {/* Quick Role Switcher */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Đổi nhanh vai trò:</span>
                <span className="text-blue-700 font-bold">{getRoleDisplayName()}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => switchDemoUser('admin')}
                  className={`py-1.5 px-2 text-xs rounded font-medium transition-colors ${
                    currentUser?.role === 'admin'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => switchDemoUser('teacher')}
                  className={`py-1.5 px-2 text-xs rounded font-medium transition-colors ${
                    currentUser?.role === 'teacher'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Giáo viên
                </button>
                <button
                  type="button"
                  onClick={() => switchDemoUser('student')}
                  className={`py-1.5 px-2 text-xs rounded font-medium transition-colors ${
                    currentUser?.role === 'student'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Học sinh
                </button>
              </div>
            </div>

            {/* Scenario Selectors */}
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Chọn tình huống để kiểm tra:
              </div>

              <div className="space-y-1.5">
                {scenarios.map((sc) => {
                  const isSelected = qaState.scenario === sc.key;
                  return (
                    <button
                      type="button"
                      key={sc.key}
                      onClick={() => setQAScenario(sc.key)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {sc.label}
                        </span>
                        {isSelected && <IconCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{sc.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px] text-slate-500 shrink-0">
            <span>Dữ liệu giả lập trong RAM</span>
            <button
              type="button"
              onClick={() => setQAScenario('normal')}
              className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
            >
              <IconRefreshCw className="w-3 h-3" />
              <span>Đặt lại Bình thường</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
