'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconUser,
  IconShield,
  IconKey,
  IconLock,
  IconCheckCircle,
  IconAlertCircle,
  IconLogOut,
  IconRefreshCw,
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
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Chưa đăng nhập</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bạn cần đăng nhập để truy cập trang quản lý tài khoản [UI-02].
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đi tới Đăng nhập
        </button>
      </div>
    );
  }

  const handleStudentPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPin !== confirmPin) {
      setMessage({ text: 'Mã PIN xác nhận không khớp với PIN mới.', isError: true });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const res = changeStudentPin(currentUser.id, currentPin, newPin);
      setIsLoading(false);
      setMessage({ text: res.message, isError: !res.success });
      if (res.success) {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      }
    }, 400);
  };

  const handleStaffPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPass !== confirmPass) {
      setMessage({ text: 'Mật khẩu xác nhận không khớp.', isError: true });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const res = changeUserPassword(currentUser.id, currentPass, newPass);
      setIsLoading(false);
      setMessage({ text: res.message, isError: !res.success });
      if (res.success) {
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      }
    }, 400);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Hồ sơ tài khoản [UI-02]</h1>
          <p className="text-xs text-slate-500">
            Xem thông tin định danh và tùy chọn đổi PIN / mật khẩu bảo mật
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors"
        >
          <IconLogOut className="w-4 h-4" />
          <span>Đăng xuất</span>
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xl shrink-0">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-slate-900">{currentUser.name}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                {currentUser.role}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 mt-3 font-mono">
              <div>
                <span className="text-slate-400">Định danh: </span>
                <span className="font-semibold text-slate-800">{currentUser.id}</span>
              </div>
              <div>
                <span className="text-slate-400">Liên hệ / Mã: </span>
                <span className="font-semibold text-slate-800">
                  {currentUser.email || currentUser.studentCode}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Trạng thái: </span>
                <span className="text-emerald-700 font-bold">Hoạt động (TEST)</span>
              </div>
              <div>
                <span className="text-slate-400">Chính sách bảo vệ: </span>
                <span className="text-slate-800">Không lưu mật khẩu/PIN thô</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Alert */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            message.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {message.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="font-medium leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* Security Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        {currentUser.role === 'student' ? (
          /* Student: Optional 8-digit PIN change */
          <div>
            <div className="flex items-center gap-2 mb-2">
              <IconKey className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">Đổi mã PIN cá nhân (Học sinh)</h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Học sinh có thể tùy chọn đổi mã PIN riêng bất kỳ lúc nào. Mã PIN mới phải gồm đúng 8 chữ số
              và không chấp nhận các dãy quá dễ đoán (như 12345678, 11111111).
            </p>

            <form onSubmit={handleStudentPinSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã PIN hiện tại (8 chữ số)
                </label>
                <input
                  type="password"
                  required
                  maxLength={8}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập 8 chữ số hiện tại"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã PIN mới (8 chữ số)
                </label>
                <input
                  type="password"
                  required
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="8 chữ số mới ngẫu nhiên"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Xác nhận mã PIN mới
                </label>
                <input
                  type="password"
                  required
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nhập lại 8 chữ số mới"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-sm transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang đổi mã PIN...</span>
                  </>
                ) : (
                  <span>Lưu mã PIN mới</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Staff: Password change */
          <div>
            <div className="flex items-center gap-2 mb-2">
              <IconLock className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">
                Đổi mật khẩu tài khoản ({currentUser.role === 'admin' ? 'Admin' : 'Giáo viên'})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Mật khẩu mới yêu cầu tối thiểu 8 ký tự. Mọi thao tác đổi mật khẩu trên TEST đều chạy mô phỏng
              trong bộ nhớ.
            </p>

            <form onSubmit={handleStaffPasswordSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  required
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  placeholder="Nhập mật khẩu đang dùng"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-sm transition-colors flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang đổi mật khẩu...</span>
                  </>
                ) : (
                  <span>Cập nhật mật khẩu</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
