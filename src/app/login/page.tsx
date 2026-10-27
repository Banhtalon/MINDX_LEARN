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
  const { login, requestPasswordReset, switchDemoUser, isLiveMode, logoutWarning } = useStore();

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
    <div className="relative min-h-[calc(100vh-170px)] flex flex-col justify-center items-center py-6 px-4">
      {/* Decorative ambient elements */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-blue-100/35 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-12 right-12 text-slate-200/90 pointer-events-none select-none text-xl font-light">
        ✦
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[430px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.07)] border border-slate-100 p-8 sm:p-9 relative transition-all">
        {/* Shield Icon Header */}
        <div className="relative w-14 h-14 mx-auto mb-3 flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-500/15 rounded-2xl blur-sm" />
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/90 border border-blue-200/60 flex items-center justify-center text-[#1d63ed] shadow-sm">
            <IconShield className="w-6 h-6 drop-shadow-sm" />
          </div>
        </div>

        {/* Headings */}
        <h1 className="text-xl font-bold text-slate-900 text-center tracking-tight">
          Đăng nhập MINDX LEARN
        </h1>
        <p className="text-xs text-slate-500 text-center mt-1 mb-6 font-normal">
          Hệ thống học tập và quản lý lớp học
        </p>

        {/* Segmented Tab Switcher */}
        <div className="bg-slate-100/80 p-1 rounded-full flex gap-1 mb-6 border border-slate-200/50">
          <button
            type="button"
            onClick={() => {
              setTab('student');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-4 rounded-full text-xs font-semibold transition-all duration-200 text-center min-h-[36px] ${
              tab === 'student'
                ? 'bg-white text-[#1d63ed] shadow-sm relative after:content-[""] after:absolute after:bottom-0 after:left-1/4 after:right-1/4 after:h-[2.5px] after:bg-[#1d63ed] after:rounded-full'
                : 'text-slate-500 hover:text-slate-800'
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
            className={`flex-1 py-2 px-4 rounded-full text-xs font-semibold transition-all duration-200 text-center min-h-[36px] ${
              tab === 'staff'
                ? 'bg-[#1d63ed] text-white shadow-md shadow-blue-500/30'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Giáo viên / Admin
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2 animate-in fade-in">
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {logoutWarning && !errorMessage && !successMessage && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2 animate-in fade-in"
          >
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>{logoutWarning}</span>
          </div>
        )}

        {/* Student Form (UI-1 Screen 1) */}
        {tab === 'student' ? (
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-student-code"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Mã học sinh
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <IconUser className="w-4 h-4" />
                </span>
                <input
                  id="login-student-code"
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Ví dụ: HS_ROB_001"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-student-pin"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Mã PIN cá nhân
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
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
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 font-mono tracking-wider min-h-[44px] transition-all"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[44px] py-3 px-4 bg-[#1d63ed] hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all active:scale-[0.99] flex items-center justify-center gap-2 mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
              <span className="text-xs text-slate-500 leading-relaxed">
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
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <IconUser className="w-4 h-4" />
                </span>
                <input
                  id="login-staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nhập email của bạn"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-staff-password"
                  className="text-xs font-semibold text-slate-700"
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
                  className="text-xs text-[#1d63ed] hover:underline font-medium focus-visible:outline-none"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <IconLock className="w-4 h-4" />
                </span>
                <input
                  id="login-staff-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[44px] py-3 px-4 bg-[#0f172a] hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-modal-title"
            className="bg-white rounded-2xl max-w-[420px] w-full p-6 sm:p-7 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 relative"
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2
                id="forgot-modal-title"
                className="text-lg font-bold text-slate-900 tracking-tight"
              >
                Quên mật khẩu
              </h2>
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                aria-label="Đóng"
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
              Nhập email của bạn để nhận liên kết đặt lại mật khẩu.
            </p>

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-password-email"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
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
                  className="w-full py-2.5 px-3.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[42px] transition-all"
                  autoComplete="email"
                />
              </div>

              {forgotStatus && (
                <div
                  className={`p-3 rounded-xl text-xs leading-relaxed border ${
                    forgotSuccess
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {forgotStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="px-5 py-2.5 min-h-[40px] text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isForgotLoading}
                  className="px-5 py-2.5 min-h-[40px] text-xs font-semibold text-white bg-[#1d63ed] hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md shadow-blue-500/25 transition-all flex items-center gap-1.5"
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
