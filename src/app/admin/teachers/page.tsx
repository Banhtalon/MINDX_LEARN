'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconUsers,
  IconPlus,
  IconShield,
  IconCheckCircle,
  IconAlertCircle,
  IconX,
} from '@/components/icons';
import { Modal } from '@/components/modal';

export default function AdminTeachersPage() {
  const router = useRouter();
  const { currentUser, users, classes, createTeacher } = useStore();

  // Teachers derived directly from store users state (persisted in RAM across pages)
  const teachers = users.filter((u) => u.role === 'teacher');

  // Only offer active unassigned classes; later changes use existing Manage/classes flow
  const availableClasses = classes.filter((c) => c.status === 'active' && !c.teacherId);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [alertNotice, setAlertNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-4">
          Chỉ có Admin mới có quyền quản lý danh sách và phân công giáo viên [UI-07].
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Đăng nhập vai trò Admin
        </button>
      </div>
    );
  }

  const handleCloseModal = () => {
    if (isSaving) return; // Prevent closing while real save to avoid stale operation issues
    setCreateModalOpen(false);
    setModalError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return; // Prevent double submit
    setIsSaving(true);
    setModalError(null);

    try {
      const res = await createTeacher({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        assignedClassIds: selectedClassIds,
      });

      if (res.success) {
        setAlertNotice({ text: res.message, isError: false });
        setCreateModalOpen(false);
        setName('');
        setEmail('');
        setSelectedClassIds([]);
      } else {
        setModalError(res.message);
      }
    } catch {
      setModalError('Đã xảy ra lỗi không mong muốn khi kết nối tài khoản. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClassSelect = (classId: string) => {
    if (selectedClassIds.includes(classId)) {
      setSelectedClassIds(selectedClassIds.filter((id) => id !== classId));
    } else {
      setSelectedClassIds([...selectedClassIds, classId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
              Quản trị Admin
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-07]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            Quản lý Giáo viên & Phân công lớp
          </h1>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Admin tạo trước tài khoản (email và mật khẩu) trực tiếp trên Supabase Auth, sau đó nhập chính xác email tại đây để gán vai trò Giáo viên và phân công lớp phụ trách.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalError(null);
            setCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors self-start sm:self-auto min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <IconPlus className="w-4 h-4" />
          <span>Kết nối giáo viên</span>
        </button>
      </div>

      {/* Alert Notice */}
      {alertNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            alertNotice.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {alertNotice.isError ? (
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1 leading-relaxed">{alertNotice.text}</span>
          <button
            type="button"
            onClick={() => setAlertNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Đóng thông báo"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Teacher List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconUsers className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Danh sách Giáo viên ({teachers.length})</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Họ và tên</th>
                <th className="px-4 py-3">Email tài khoản</th>
                <th className="px-4 py-3">Các lớp được phân công</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                    Chưa có giáo viên nào được kết nối. Bấm &quot;Kết nối giáo viên&quot; để bắt đầu.
                  </td>
                </tr>
              ) : (
                teachers.map((tea) => {
                  const assigned = classes.filter((c) => (tea.assignedClassIds || []).includes(c.id));

                  return (
                    <tr key={tea.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">{tea.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{tea.email}</td>
                      <td className="px-4 py-3">
                        {assigned.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {assigned.map((cls) => (
                              <span
                                key={cls.id}
                                className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200"
                              >
                                {cls.code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600 italic">Chưa phân công lớp nào</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Đang hoạt động
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connect Teacher Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={handleCloseModal}
        title="Kết nối tài khoản giáo viên"
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          {modalError && (
            <div
              role="alert"
              aria-live="assertive"
              id="teacher-modal-error"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
            >
              <IconAlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold flex-1 leading-relaxed">{modalError}</span>
            </div>
          )}

          {/* Concise Step-by-Step Instructions */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2 text-slate-700">
            <div className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
              <IconShield className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Quy trình tạo tài khoản trước khi kết nối:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed text-xs">
              <li>
                Truy cập <strong>Supabase → Authentication → Users → Add user → Create new user</strong>.
              </li>
              <li>
                Nhập email và mật khẩu tại đó và bật <strong>Auto Confirm User</strong>.
              </li>
              <li>
                Sau đó nhập chính xác địa chỉ email và họ tên đó tại biểu mẫu dưới đây để kết nối vai trò Giáo viên và phân công lớp.
              </li>
            </ol>
            <p className="text-[11px] text-slate-500 italic pt-0.5">
              Hệ thống không thu thập mật khẩu tại ứng dụng và không gửi email kích hoạt tự động.
            </p>
          </div>

          <div>
            <label htmlFor="teacher-name-input" className="block font-semibold text-slate-700 mb-1">
              Họ và tên giáo viên <span className="text-rose-500">*</span>
            </label>
            <input
              id="teacher-name-input"
              type="text"
              required
              disabled={isSaving}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Thầy Trần Quốc Tuấn"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="teacher-email-input" className="block font-semibold text-slate-700 mb-1">
              Email tài khoản Supabase <span className="text-rose-500">*</span>
            </label>
            <input
              id="teacher-email-input"
              type="email"
              required
              disabled={isSaving}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tuantran@mindx.edu.vn"
              aria-describedby="teacher-email-hint"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
            />
            <p id="teacher-email-hint" className="text-[11px] text-slate-500 mt-1">
              Địa chỉ email phải trùng khớp với tài khoản đã tạo trên Supabase Auth.
            </p>
          </div>

          <div>
            <label id="teacher-classes-label" className="block font-semibold text-slate-700 mb-0.5">
              Phân công lớp phụ trách (Tùy chọn)
            </label>
            <p id="teacher-classes-hint" className="text-[11px] text-slate-500 mb-1.5">
              Chỉ hiển thị các lớp đang hoạt động chưa có giáo viên phụ trách. Thay đổi sau này thực hiện tại Quản lý lớp.
            </p>
            <div
              role="group"
              aria-labelledby="teacher-classes-label"
              aria-describedby="teacher-classes-hint"
              className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 p-2.5 rounded-lg bg-slate-50"
            >
              {availableClasses.length === 0 ? (
                <p className="text-slate-400 italic py-2 text-center">
                  Không có lớp học chưa phân công nào đang hoạt động.
                </p>
              ) : (
                availableClasses.map((cls) => {
                  const isChecked = selectedClassIds.includes(cls.id);

                  return (
                    <label
                      key={cls.id}
                      htmlFor={`class-checkbox-${cls.id}`}
                      className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded transition-colors"
                    >
                      <input
                        id={`class-checkbox-${cls.id}`}
                        type="checkbox"
                        disabled={isSaving}
                        checked={isChecked}
                        onChange={() => toggleClassSelect(cls.id)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span className="font-mono font-bold text-slate-800">{cls.code}</span>
                      <span className="text-slate-600">— {cls.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleCloseModal}
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang kết nối...</span>
                </>
              ) : (
                'Kết nối tài khoản'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
