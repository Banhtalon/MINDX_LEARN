'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconLock, IconShield, IconAlertCircle, IconCheckCircle, IconRefreshCw } from '@/components/icons';

export default function SetupPasswordPage() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/m2/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await res.json();
      setIsLoading(false);

      setNewPassword('');
      setConfirmPassword('');

      if (res.ok && data.success) {
        setSuccessMessage(
          'Thiết lập mật khẩu mới thành công! Phiên cũ đã được thu hồi an toàn. Đang chuyển tới trang Đăng nhập...'
        );
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      } else {
        setErrorMessage(data.message || 'Không thể cập nhật mật khẩu. Vui lòng thử lại.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Lỗi kết nối máy chủ khi cập nhật mật khẩu. Vui lòng thử lại sau.');
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-180px)] flex flex-col justify-center items-center py-6 px-4">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[340px] bg-blue-100/35 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-[430px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.07)] border border-slate-100 p-8 sm:p-9">
        <div className="relative w-14 h-14 mx-auto mb-3 flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-500/15 rounded-2xl blur-sm" />
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/90 border border-blue-200/60 flex items-center justify-center text-[#1d63ed] shadow-sm">
            <IconLock className="w-6 h-6" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-slate-900 text-center tracking-tight">
          Thiết lập Mật khẩu Mới
        </h1>
        <p className="text-xs text-slate-500 text-center mt-1 mb-6">
          Dành cho Giáo viên / Quản trị viên thiết lập mật khẩu an toàn
        </p>

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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Mật khẩu mới (Tối thiểu 8 ký tự)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                <IconLock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới an toàn"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Xác nhận mật khẩu mới
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                <IconShield className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 text-slate-800 placeholder:text-slate-400 min-h-[44px] transition-all"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <IconShield className="w-4 h-4 text-[#1d63ed]" />
              <span>Lưu ý bảo mật</span>
            </div>
            <div>• Mật khẩu do chính bạn tự nhập trực tiếp, không dùng mật khẩu mặc định.</div>
            <div>• Sau khi lưu, hệ thống tự động thu hồi phiên cũ và chuyển về trang đăng nhập.</div>
          </div>

          <button
            type="submit"
            disabled={isLoading || Boolean(successMessage)}
            className="w-full min-h-[44px] py-3 px-4 bg-[#1d63ed] hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all active:scale-[0.99] flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? (
              <>
                <IconRefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang cập nhật mật khẩu...</span>
              </>
            ) : (
              <span>Lưu mật khẩu & Hoàn tất</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
