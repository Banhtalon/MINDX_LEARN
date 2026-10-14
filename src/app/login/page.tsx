'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconLock,
  IconUser,
  IconShield,
  IconAlertCircle,
  IconCheckCircle,
  IconKey,
  IconRefreshCw,
} from '@/components/icons';
import { Modal } from '@/components/modal';

export default function LoginPage() {
  const router = useRouter();
  const { login, requestPasswordReset, switchDemoUser, qaState } = useStore();

  const [tab, setTab] = useState<'student' | 'staff'>('student');

  // Student form state
  const [studentCode, setStudentCode] = useState('');
  const [pin, setPin] = useState('');

  // Staff form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Forgot password modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  const handleStudentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      const result = login({ studentCode, pin });
      setIsLoading(false);
      // Security: Clear PIN from input field immediately
      setPin('');

      if (result.success) {
        setSuccessMessage(result.message);
        setTimeout(() => router.push('/student'), 600);
      } else {
        setErrorMessage(result.message);
      }
    }, qaState.delayMs || 300);
  };

  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      const result = login({ email, password });
      setIsLoading(false);
      // Security: Clear password from input field immediately
      setPassword('');

      if (result.success) {
        setSuccessMessage(result.message);
        setTimeout(() => router.push('/manage'), 600);
      } else {
        setErrorMessage(result.message);
      }
    }, qaState.delayMs || 300);
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = requestPasswordReset(forgotEmail);
    setForgotStatus(res.message);
  };

  const handleQuickDemo = (role: 'admin' | 'teacher' | 'student') => {
    switchDemoUser(role);
    if (role === 'student') router.push('/student');
    else router.push('/manage');
  };

  return (
    <div className="max-w-md mx-auto my-6">
      {/* Demo Quick Login Helper Banner */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
        <div className="font-bold text-blue-900 mb-1.5 flex items-center justify-between">
          <span>ĐĂNG NHẬP NHANH MẪU (Dành cho kiểm thử):</span>
          <span className="text-[10px] font-normal text-blue-700">1-click không cần gõ</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickDemo('admin')}
            className="py-1.5 px-2 bg-purple-600 text-white font-bold rounded hover:bg-purple-700 transition-colors text-center"
          >
            Mẫu Admin
          </button>
          <button
            type="button"
            onClick={() => handleQuickDemo('teacher')}
            className="py-1.5 px-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700 transition-colors text-center"
          >
            Mẫu Giáo viên
          </button>
          <button
            type="button"
            onClick={() => handleQuickDemo('student')}
            className="py-1.5 px-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition-colors text-center"
          >
            Mẫu Học sinh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-3">
            <IconShield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">Đăng nhập MINDX LEARN</h1>
          <p className="text-xs text-slate-500 mt-1">
            Giao diện xác thực phân quyền [UI-01] — Môi trường TEST
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setTab('student');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              tab === 'student'
                ? 'border-blue-600 bg-white text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Học sinh (Mã HS + PIN 8 số)
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('staff');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              tab === 'staff'
                ? 'border-blue-600 bg-white text-blue-600 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Giáo viên / Admin (Email)
          </button>
        </div>

        {/* Status Messages */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
              <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2 animate-in fade-in">
              <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Student Form */}
          {tab === 'student' ? (
            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã học sinh</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <IconUser className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={studentCode}
                    onChange={(e) => setStudentCode(e.target.value)}
                    placeholder="Ví dụ: HS_ROB_001"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    autoComplete="off"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Mã riêng được trường cấp (không phân biệt hoa/thường).</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã PIN cá nhân (8 chữ số)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <IconKey className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="8 chữ số bảo mật (ví dụ: 88889999)"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mã PIN 8 chữ số do Admin cấp một lần. Form không lưu trữ PIN của bạn.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <IconRefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  <span>Đăng nhập Học sinh</span>
                )}
              </button>

              <div className="text-center pt-2">
                <span className="text-[11px] text-slate-500">
                  Học sinh chưa có PIN hoặc quên PIN? Vui lòng báo Giáo viên/Admin để được cấp lại riêng.
                </span>
              </div>
            </form>
          ) : (
            /* Staff Form (Teacher / Admin) */
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email công vụ</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <IconUser className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@mindx.edu.vn hoặc gv@mindx.edu.vn"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Mật khẩu</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotModalOpen(true);
                      setForgotStatus(null);
                      setForgotEmail(email);
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <IconLock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu tài khoản"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <IconRefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <span>Đăng nhập Cán bộ</span>
                )}
              </button>

              <div className="text-center pt-2">
                <span className="text-[11px] text-slate-400">
                  Hệ thống không mở đăng ký tự do. Mọi tài khoản cán bộ do Quản trị viên cấp.
                </span>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Forgot Password Modal (UI-01 Requirement) */}
      <Modal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
        title="Quên mật khẩu cán bộ (Mô phỏng)"
      >
        <form onSubmit={handleForgotSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Nhập email tài khoản Admin hoặc Giáo viên đã đăng ký. Hệ thống sẽ mô phỏng gửi liên kết đặt lại
            mật khẩu an toàn qua email (không gửi mật khẩu qua chat).
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email đăng ký</label>
            <input
              type="email"
              required
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="admin@mindx.edu.vn"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {forgotStatus && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs leading-relaxed">
              {forgotStatus}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setForgotModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
            >
              Gửi liên kết đặt lại
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
