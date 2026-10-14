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

    // Validation
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
          // Security: no old password required during authenticated recovery/invite flow context
        }),
      });

      const data = await res.json();
      setIsLoading(false);

      // Security: Clear password fields immediately
      setNewPassword('');
      setConfirmPassword('');

      if (res.ok && data.success) {
        setSuccessMessage('Thiết lập mật khẩu mới thành công! Phiên cũ đã được thu hồi an toàn. Đang chuyển tới trang Đăng nhập...');
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
    <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl shadow-xl border border-slate-200">
      <div className="text-center pb-4 border-b border-slate-100">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-3">
          <IconLock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900">Thiết lập Mật khẩu Mới</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dành cho Giáo viên / Admin thiết lập mật khẩu an toàn
        </p>
      </div>

      <div className="pt-6">
        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2 animate-in fade-in">
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2 animate-in fade-in">
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Mật khẩu mới (Tối thiểu 8 ký tự)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới an toàn"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Xác nhận mật khẩu mới
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
              autoComplete="new-password"
            />
          </div>

          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800 space-y-1">
            <div className="font-bold flex items-center gap-1">
              <IconShield className="w-4 h-4" />
              <span>Quy tắc bảo mật:</span>
            </div>
            <div>• Mật khẩu do chính bạn tự nhập trực tiếp, không sử dụng mật khẩu mặc định.</div>
            <div>• Sau khi lưu, hệ thống thu hồi mọi phiên cũ và yêu cầu đăng nhập lại.</div>
          </div>

          <button
            type="submit"
            disabled={isLoading || Boolean(successMessage)}
            className="w-full min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm shadow-md transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
