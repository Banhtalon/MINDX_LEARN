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
  IconBookOpen,
  IconX,
} from '@/components/icons';
import { Modal } from '@/components/modal';

export default function AdminTeachersPage() {
  const router = useRouter();
  const { currentUser, users, classes, createTeacher } = useStore();

  // Teachers derived directly from store users state (persisted in RAM across pages)
  const teachers = users.filter((u) => u.role === 'teacher');

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
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập vai trò Admin
        </button>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setModalError(null);
    await new Promise((r) => setTimeout(r, 400));
    const res = createTeacher({
      name,
      email,
      assignedClassIds: selectedClassIds,
    });
    setIsSaving(false);

    if (res.success) {
      setAlertNotice({ text: res.message, isError: false });
      setCreateModalOpen(false);
      setName('');
      setEmail('');
      setSelectedClassIds([]);
    } else {
      setModalError(res.message);
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
            Quản lý Tài khoản Giáo viên & Phân công lớp
          </h1>
          <p className="text-xs text-slate-500">
            Tạo tài khoản giáo viên bằng email công vụ, gửi liên kết mời thiết lập mật khẩu bảo mật. Hệ thống
            không mở đăng ký tự do.
          </p>
        </div>

        <button
          onClick={() => {
            setModalError(null);
            setCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
        >
          <IconPlus className="w-4 h-4" />
          <span>Thêm giáo viên mới</span>
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
          <button onClick={() => setAlertNotice(null)} className="text-slate-400 hover:text-slate-600">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Teacher List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Danh sách Giáo viên ({teachers.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Họ và tên</th>
                <th className="px-4 py-3">Email tài khoản</th>
                <th className="px-4 py-3">Các lớp được phân công</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((tea) => {
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setAlertNotice({
                            text: `[Mô phỏng]: Đã gửi lại liên kết đặt mật khẩu tới ${tea.email}. Giáo viên có thể tự kích hoạt hoặc dùng "Quên mật khẩu" ở UI-01.`,
                            isError: false,
                          });
                        }}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs transition-colors"
                      >
                        Gửi lại link mời
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Teacher Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setModalError(null);
        }}
        title="Thêm tài khoản Giáo viên mới (Mô phỏng)"
      >
        <form onSubmit={handleCreate} className="space-y-4 text-xs">
          {modalError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <IconAlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold flex-1">{modalError}</span>
            </div>
          )}
          <p className="text-slate-500 leading-relaxed">
            Hệ thống sẽ mô phỏng gửi email chứa liên kết an toàn để giáo viên tự thiết lập mật khẩu lần đầu.
            Mật khẩu không bao giờ được gửi qua tin nhắn.
          </p>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Họ và tên giáo viên</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Thầy Trần Quốc Tuấn"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email công vụ (@mindx.edu.vn)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tuantran@mindx.edu.vn"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Phân công lớp phụ trách (Tùy chọn):
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 p-2.5 rounded-lg bg-slate-50">
              {classes.map((cls) => (
                <label key={cls.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(cls.id)}
                    onChange={() => toggleClassSelect(cls.id)}
                    className="w-3.5 h-3.5 text-blue-600 rounded"
                  />
                  <span className="font-mono font-bold text-slate-800">{cls.code}</span>
                  <span className="text-slate-500">— {cls.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setCreateModalOpen(false);
                setModalError(null);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                'Tạo và gửi link mời (Mô phỏng)'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
