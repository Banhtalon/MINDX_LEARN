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
  IconRefreshCw,
  IconX,
} from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const { login, requestPasswordReset, logoutWarning } = useStore();

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
  const [forgotSuccess, setForgotSuccess] = useState<boolean | null>(null);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await login({ studentCode, pin });
      setIsLoading(false);
      setPin('');

      if (result.success) {
        setSuccessMessage(result.message);
        setTimeout(() => router.push('/student'), 500);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setIsLoading(false);
      setPin('');
      setErrorMessage('Lỗi kết nối máy chủ. Vui lòng thử lại sau.');
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await login({ email, password });
      setIsLoading(false);
      setPassword('');

      if (result.success) {
        setSuccessMessage(result.message);
        setTimeout(() => router.push('/manage'), 500);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setIsLoading(false);
      setPassword('');
      setErrorMessage('Lỗi kết nối máy chủ. Vui lòng thử lại sau.');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotStatus(null);
    setForgotSuccess(null);
    setIsForgotLoading(true);

    try {
      const res = await requestPasswordReset(forgotEmail);
      setIsForgotLoading(false);
      setForgotStatus(res.message);
      setForgotSuccess(res.success);
    } catch {
      setIsForgotLoading(false);
      setForgotStatus('Lỗi kết nối máy chủ. Vui lòng thử lại sau.');
      setForgotSuccess(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-170px)] flex flex-col justify-center items-center py-6 px-4">
      {/* Main Login Card */}
      <div className="w-full max-w-[430px] bg-white rounded-lg border-[1.5px] border-[#cbd5e1] p-7 sm:p-8">
        {/* Shield Icon Header */}
        <div className="w-11 h-11 mx-auto mb-3 rounded-md bg-[#eff4ff] border border-[#b8c4ff] flex items-center justify-center text-[#1e40af]">
          <IconShield className="w-5 h-5" />
        </div>

        {/* Headings */}
        <h1 className="text-xl font-extrabold text-[#0b1c30] text-center tracking-tight">
          Đăng nhập MINDX LEARN
        </h1>
        <p className="text-xs text-[#44474d] text-center mt-1 mb-6 font-normal">
          Hệ thống học tập và quản lý lớp học
        </p>

        {/* High-Contrast Tab Switcher */}
        <div className="bg-[#f8f9ff] p-1 rounded-md flex gap-1 mb-6 border-[1.5px] border-[#cbd5e1]">
          <button
            type="button"
            onClick={() => {
              setTab('student');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-4 rounded text-xs font-bold transition-colors text-center min-h-[36px] ${
              tab === 'student'
                ? 'bg-[#1e40af] text-white'
                : 'text-[#44474d] hover:text-[#0b1c30]'
            }`}
          >
            Học sinh
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('staff');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-4 rounded text-xs font-bold transition-colors text-center min-h-[36px] ${
              tab === 'staff'
                ? 'bg-[#0f233a] text-white'
                : 'text-[#44474d] hover:text-[#0b1c30]'
            }`}
          >
            Giáo viên / Admin
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-[#ffdad6] border border-[#ba1a1a]/40 text-[#93000a] text-xs font-medium flex items-start gap-2">
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#ba1a1a]" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded bg-[#ecfdf5] border border-[#047857]/40 text-[#002115] text-xs font-medium flex items-start gap-2">
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#047857]" />
            <span>{successMessage}</span>
          </div>
        )}

        {logoutWarning && !errorMessage && !successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-start gap-2"
          >
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>{logoutWarning}</span>
          </div>
        )}

        {/* Student Form (UI-1 Screen 1) */}
        {tab === 'student' ? (
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-student-code"
                className="block text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-1.5"
              >
                Mã học sinh
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#74777e] pointer-events-none">
                  <IconUser className="w-4 h-4" />
                </span>
                <input
                  id="login-student-code"
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Ví dụ: HS_ROB_001"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border-[1.5px] border-[#cbd5e1] rounded focus:outline-none focus:border-[#1e40af] text-[#0b1c30] placeholder:text-[#74777e] min-h-[42px]"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-student-pin"
                className="block text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-1.5"
              >
                Mã PIN cá nhân
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#74777e] pointer-events-none">
                  <IconLock className="w-4 h-4" />
                </span>
                <input
                  id="login-student-pin"
                  type="password"
                  required
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="8 chữ số bảo mật (ví dụ: 88889999)"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border-[1.5px] border-[#cbd5e1] rounded focus:outline-none focus:border-[#1e40af] text-[#0b1c30] placeholder:text-[#74777e] font-mono tracking-wider min-h-[42px]"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#1e40af] hover:bg-[#0f233a] disabled:opacity-50 text-white font-bold rounded text-sm transition-colors flex items-center justify-center gap-2 mt-6"
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
              <span className="text-xs text-[#44474d] leading-relaxed">
                Bạn chưa có PIN hoặc quên PIN? Liên hệ Giáo viên / Admin
              </span>
            </div>
          </form>
        ) : (
          /* Staff Form (UI-1 Screen 3) */
          <form onSubmit={handleStaffLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-staff-email"
                className="block text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#74777e] pointer-events-none">
                  <IconUser className="w-4 h-4" />
                </span>
                <input
                  id="login-staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nhập email của bạn"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border-[1.5px] border-[#cbd5e1] rounded focus:outline-none focus:border-[#1e40af] text-[#0b1c30] placeholder:text-[#74777e] min-h-[42px]"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-staff-password"
                  className="text-xs font-bold text-[#0b1c30] uppercase tracking-wider"
                >
                  Mật khẩu
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotModalOpen(true);
                    setForgotStatus(null);
                    setForgotSuccess(null);
                    setForgotEmail(email);
                  }}
                  className="text-xs text-[#1e40af] hover:underline font-bold"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#74777e] pointer-events-none">
                  <IconLock className="w-4 h-4" />
                </span>
                <input
                  id="login-staff-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border-[1.5px] border-[#cbd5e1] rounded focus:outline-none focus:border-[#1e40af] text-[#0b1c30] placeholder:text-[#74777e] min-h-[42px]"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#0f233a] hover:bg-[#1e40af] disabled:opacity-50 text-white font-bold rounded text-sm transition-colors flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <>
                  <IconRefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <span>Đăng nhập</span>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Forgot Password Modal (UI-1 Screen 2) */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b1c30]/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-modal-title"
            className="bg-white rounded-lg max-w-[420px] w-full p-6 border-2 border-[#0f233a] shadow-[4px_4px_0px_#0f233a] relative"
          >
            {/* Header row */}
            <div className="flex items-center justify-between pb-3 border-b border-[#cbd5e1]">
              <h2
                id="forgot-modal-title"
                className="text-base font-extrabold text-[#0b1c30] tracking-tight"
              >
                Quên mật khẩu
              </h2>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                aria-label="Đóng"
                className="text-[#44474d] hover:text-[#0b1c30] p-1 rounded border border-transparent hover:border-[#cbd5e1] transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#44474d] mt-3 mb-4 leading-relaxed">
              Nhập email của bạn để nhận liên kết đặt lại mật khẩu.
            </p>

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-password-email"
                  className="block text-xs font-bold text-[#0b1c30] uppercase tracking-wider mb-1.5"
                >
                  Email đăng ký
                </label>
                <input
                  id="forgot-password-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Nhập email của bạn..."
                  className="w-full py-2.5 px-3.5 text-sm bg-white border-[1.5px] border-[#cbd5e1] rounded outline-none focus:border-[#1e40af] text-[#0b1c30] placeholder:text-[#74777e] min-h-[42px]"
                  autoComplete="email"
                />
              </div>

              {forgotStatus && (
                <div
                  className={`p-3 rounded text-xs leading-relaxed border ${
                    forgotSuccess
                      ? 'bg-[#ecfdf5] border-[#047857]/40 text-[#002115]'
                      : 'bg-[#ffdad6] border-[#ba1a1a]/40 text-[#93000a]'
                  }`}
                >
                  {forgotStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="px-4 py-2 min-h-[38px] text-xs font-bold text-[#0f233a] bg-white border-[1.5px] border-[#cbd5e1] hover:border-[#0f233a] rounded transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isForgotLoading}
                  className="px-4 py-2 min-h-[38px] text-xs font-bold text-white bg-[#1e40af] hover:bg-[#0f233a] disabled:opacity-50 rounded transition-colors flex items-center gap-1.5"
                >
                  {isForgotLoading ? (
                    <>
                      <IconRefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <span>Gửi liên kết đặt lại</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
