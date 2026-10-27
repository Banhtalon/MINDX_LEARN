'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconKey,
  IconLock,
  IconCheckCircle,
  IconAlertCircle,
  IconLogOut,
  IconShield,
} from '@/components/icons';

export default function AccountPage() {
  const router = useRouter();
  const { currentUser, logout, changeStudentPin, changeUserPassword } = useStore();

  // Student PIN change state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Staff Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl shadow-[0_20px_50px_rgba(8,112,184,0.07)] border border-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <IconAlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1.5">Chưa đăng nhập</h2>
        <p className="text-xs text-slate-500 mb-6">
          Bạn cần đăng nhập để truy cập trang quản lý hồ sơ tài khoản.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="min-h-[44px] px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-semibold hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all"
        >
          Đi tới Đăng nhập
        </button>
      </div>
    );
  }

  const roleLabel =
    currentUser.role === 'admin'
      ? 'Quản trị viên'
      : currentUser.role === 'teacher'
      ? 'Giáo viên'
      : 'Học sinh';

  const handleStudentPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPin !== confirmPin) {
      setMessage({ text: 'Mã PIN xác nhận không khớp với PIN mới.', isError: true });
      return;
    }

    setIsLoading(true);
    try {
      const res = await changeStudentPin(currentUser.id, currentPin, newPin);
      setMessage({ text: res.message, isError: !res.success });
      if (res.success) {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      }
    } catch {
      setMessage({ text: 'Lỗi khi đổi mã PIN.', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStaffPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPass !== confirmPass) {
      setMessage({ text: 'Mật khẩu xác nhận không khớp.', isError: true });
      return;
    }

    setIsLoading(true);
    try {
      const res = await changeUserPassword(currentUser.id, currentPass, newPass);
      setMessage({ text: res.message, isError: !res.success });
      if (res.success) {
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
        setTimeout(() => {
          router.push('/login');
        }, 1500);
      }
    } catch {
      setMessage({ text: 'Lỗi khi đổi mật khẩu.', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    const res = await logout();
    if (res && !res.serverConfirmed) {
      setMessage({ text: res.message, isError: true });
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 relative py-2">
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-100/35 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Hồ sơ tài khoản</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thông tin cá nhân và thiết lập bảo mật đăng nhập
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-xs font-semibold shadow-sm transition-all"
        >
          <IconLogOut className="w-4 h-4" />
          <span>Đăng xuất</span>
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-7 shadow-[0_20px_50px_rgba(8,112,184,0.06)]">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/90 border border-blue-200/60 text-[#1d63ed] flex items-center justify-center font-extrabold text-xl shrink-0 shadow-sm">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {currentUser.name}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1d63ed] border border-blue-200/70">
                {roleLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Tài khoản đăng nhập</span>
                <span className="font-mono font-semibold text-slate-800">
                  {currentUser.email || currentUser.studentCode}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Trạng thái tài khoản</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Đang hoạt động
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            message.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {message.isError ? (
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="font-medium leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* Security Form Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_20px_50px_rgba(8,112,184,0.06)]">
        {currentUser.role === 'student' ? (
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1d63ed] flex items-center justify-center">
                <IconKey className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Đổi mã PIN cá nhân (8 chữ số)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Mã PIN mới gồm đúng 8 chữ số và không dùng các dãy số dễ đoán (như 12345678 hoặc 11111111).
            </p>

            <form onSubmit={handleStudentPinSubmit} className="space-y-4">
              <div>
                <label htmlFor="student-current-pin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mã PIN hiện tại
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconLock className="w-4 h-4" />
                  </span>
                  <input
                    id="student-current-pin"
                    type="password"
                    required
                    maxLength={8}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nhập 8 chữ số đang dùng"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 font-mono tracking-widest min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="student-new-pin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mã PIN mới (8 chữ số)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconKey className="w-4 h-4" />
                  </span>
                  <input
                    id="student-new-pin"
                    type="password"
                    required
                    maxLength={8}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nhập 8 chữ số mới"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 font-mono tracking-widest min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="student-confirm-pin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Xác nhận mã PIN mới
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconShield className="w-4 h-4" />
                  </span>
                  <input
                    id="student-confirm-pin"
                    type="password"
                    required
                    maxLength={8}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nhập lại 8 chữ số mới"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 font-mono tracking-widest min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="min-h-[44px] py-2.5 px-6 bg-[#1d63ed] hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang cập nhật mã PIN...</span>
                    </>
                  ) : (
                    <span>Lưu mã PIN mới</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1d63ed] flex items-center justify-center">
                <IconLock className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Đổi mật khẩu tài khoản ({roleLabel})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Mật khẩu mới có tối thiểu 8 ký tự. Sau khi đổi mật khẩu thành công, bạn sẽ đăng nhập lại bằng mật khẩu mới.
            </p>

            <form onSubmit={handleStaffPasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="staff-current-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconLock className="w-4 h-4" />
                  </span>
                  <input
                    id="staff-current-pass"
                    type="password"
                    required
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="Nhập mật khẩu đang dùng"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="staff-new-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconKey className="w-4 h-4" />
                  </span>
                  <input
                    id="staff-new-pass"
                    type="password"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Tối thiểu 8 ký tự"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="staff-confirm-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Xác nhận mật khẩu mới
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <IconShield className="w-4 h-4" />
                  </span>
                  <input
                    id="staff-confirm-pass"
                    type="password"
                    required
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-2 focus:ring-blue-500/20 min-h-[44px] transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="min-h-[44px] py-2.5 px-6 bg-[#0f172a] hover:bg-slate-800 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang cập nhật mật khẩu...</span>
                    </>
                  ) : (
                    <span>Cập nhật mật khẩu</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
