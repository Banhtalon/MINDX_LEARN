'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Modal } from '@/components/modal';
import {
  IconBookOpen,
  IconCheckCircle,
  IconAlertCircle,
  IconExternalLink,
  IconFileText,
  IconLock,
  IconPlus,
} from '@/components/icons';

export default function AdminCoursesPage() {
  const router = useRouter();
  const { currentUser, courses, lessons, createCourse, updateCourse } = useStore();

  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || 'crs_rob_k14');
  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0] || null;

  // Notification state
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập bị từ chối</h2>
        <p className="text-xs text-slate-500 mb-4">
          Chỉ có Admin mới có quyền truy cập trang quản trị khóa học [UI-05].
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

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateTitle('');
    setCreateDescription('');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!selectedCourse) return;
    setEditTitle(selectedCourse.title);
    setEditDescription(selectedCourse.description);
    setEditError(null);
    setIsEditOpen(true);
  };

  // Submit Create Course
  const handleCreateCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTitle = createTitle.trim();
    if (!trimmedTitle) {
      setCreateError('Tiêu đề khóa học không được để trống.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    // Hiển thị nhãn "Đang lưu..." trong tối đa khoảng 400ms (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const res = createCourse(trimmedTitle, createDescription.trim());
      if (!res.success) {
        // Dưới save_error: action trả lỗi, giữ modal/form, không thay dữ liệu, hiện lỗi và nút Thử lại
        setCreateError(res.message);
      } else {
        if (res.course) {
          setSelectedCourseId(res.course.id);
        }
        setSuccessMessage(res.message || 'Tạo khóa học thành công (đã lưu trong dữ liệu giả).');
        setIsCreateOpen(false);
        setCreateTitle('');
        setCreateDescription('');
        setCreateError(null);
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Có lỗi xảy ra khi lưu dữ liệu.');
    } finally {
      setIsCreating(false);
    }
  };

  // Submit Edit Course
  const handleUpdateCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCourse) return;

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setEditError('Tiêu đề khóa học không được để trống.');
      return;
    }

    setIsEditing(true);
    setEditError(null);

    // Hiển thị nhãn "Đang lưu..." trong tối đa khoảng 400ms (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const res = updateCourse(selectedCourse.id, {
        title: trimmedTitle,
        description: editDescription.trim(),
      });
      if (!res.success) {
        // Dưới save_error: action trả lỗi, giữ modal/form, không thay dữ liệu, hiện lỗi và nút Thử lại
        setEditError(res.message);
      } else {
        setSelectedCourseId(selectedCourse.id);
        setSuccessMessage(res.message || 'Cập nhật khóa học thành công (đã lưu trong dữ liệu giả).');
        setIsEditOpen(false);
        setEditError(null);
      }
    } catch (err: any) {
      setEditError(err?.message || 'Có lỗi xảy ra khi lưu dữ liệu.');
    } finally {
      setIsEditing(false);
    }
  };

  // Strictly sort 14 sessions by sessionNumber
  const courseLessons = selectedCourse
    ? lessons
        .filter((l) => l.courseId === selectedCourse.id)
        .sort((a, b) => a.sessionNumber - b.sessionNumber)
    : [];

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
              Quản trị Admin
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-05]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            Chương trình & Khóa học 14 Buổi Cố Định
          </h1>
          <p className="text-xs text-slate-500">
            Mỗi khóa học có đúng 14 vị trí Buổi 1–14 cố định. Không thêm, xóa hoặc đổi thứ tự vị trí để bảo
            toàn tính nhất quán của CSV tổng kết.
          </p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo khóa mẫu</span>
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
          <div className="flex items-center gap-2">
            <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold ml-2 underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Empty Courses State */}
      {courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm max-w-lg mx-auto my-6">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <IconBookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1.5">Chưa có khóa học nào trong hệ thống</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-sm mx-auto">
            Hiện tại danh sách khóa học đang trống (hoặc đang kích hoạt kịch bản dữ liệu rỗng). Vui lòng tạo khóa học mẫu mới để bắt đầu thiết lập chương trình 14 buổi học cố định.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo khóa mẫu</span>
          </button>
        </div>
      ) : (
        <>
          {/* Course Selection List */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <IconBookOpen className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Danh sách khóa học ({courses.length})
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">
                Bấm chọn khóa học để xem cấu trúc và bài học tương ứng
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {courses.map((crs) => {
                const isSelected = crs.id === selectedCourse?.id;
                return (
                  <button
                    key={crs.id}
                    type="button"
                    onClick={() => {
                      setSelectedCourseId(crs.id);
                      setSuccessMessage(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-bold text-blue-600 uppercase">
                          {crs.id}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                            <IconCheckCircle className="w-3 h-3" />
                            Đang chọn
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 line-clamp-1">{crs.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {crs.description}
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>14 buổi chuẩn</span>
                      <span className="text-blue-600 font-semibold">{isSelected ? 'Khóa hiện hành' : 'Bấm để chọn →'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Course Detail Card */}
          {selectedCourse && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-blue-600 uppercase tracking-wider">
                      Mã khóa: {selectedCourse.id}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-slate-900">{selectedCourse.title}</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selectedCourse.description}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 shrink-0">
                  <div className="bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl text-center w-full md:w-auto">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                      Cấu trúc chương trình
                    </span>
                    <span className="text-lg font-black text-blue-900 block mt-0.5">14 Buổi chuẩn</span>
                    <span className="text-[10px] text-blue-600 font-semibold">(Không lệch số buổi)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenEditModal}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold transition-colors shadow-sm w-full md:w-auto"
                  >
                    <IconFileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sửa thông tin khóa</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 border-t border-slate-100 font-medium">
                <span>
                  Đã xuất bản:{' '}
                  <strong className="text-emerald-700">
                    {courseLessons.filter((l) => l.status === 'published').length}/14 buổi
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Bản nháp:{' '}
                  <strong className="text-amber-700">
                    {courseLessons.filter((l) => l.status === 'draft').length}/14 buổi
                  </strong>
                </span>
                <span>•</span>
                <span className="text-slate-400 italic">
                  * Học sinh chỉ nhìn thấy các buổi ở trạng thái Đã xuất bản
                </span>
              </div>
            </div>
          )}

          {/* 14 Sessions Grid / Table */}
          {selectedCourse && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Danh sách 14 vị trí bài học ({selectedCourse.title})
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  Bấm &quot;Soạn [UI-06]&quot; để cập nhật nội dung bài học
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-20">Vị trí</th>
                      <th className="px-4 py-3">Tiêu đề bài học &amp; Chủ đề</th>
                      <th className="px-4 py-3 w-40">Thành phần đánh giá</th>
                      <th className="px-4 py-3 w-32">Chế độ nộp bài</th>
                      <th className="px-4 py-3 w-32">Trạng thái</th>
                      <th className="px-4 py-3 w-28 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {courseLessons.map((les) => {
                      const isPublished = les.status === 'published';

                      return (
                        <tr key={les.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded bg-slate-100 font-mono font-black text-slate-800 text-[11px]">
                              Buổi {les.sessionNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{les.title}</div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">{les.description}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {les.hasQuiz && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  Quiz (70%)
                                </span>
                              )}
                              {les.hasPractice && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Thực hành
                                </span>
                              )}
                              {!les.hasQuiz && !les.hasPractice && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  Chỉ lý thuyết (Chặn xuất bản)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                            {les.hasPractice
                              ? les.practiceMode === 'file_allowed'
                                ? 'Tệp <= 2MB'
                                : 'Chỉ nhận link'
                              : 'Không có TH'}
                          </td>
                          <td className="px-4 py-3">
                            {isPublished ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <IconCheckCircle className="w-3 h-3" />
                                <span>Đã xuất bản</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <IconLock className="w-3 h-3" />
                                <span>Bản nháp</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/admin/lessons/${les.id}/edit`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold hover:bg-blue-100 transition-colors"
                            >
                              <span>Soạn [UI-06]</span>
                              <IconExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Tạo khóa học mẫu mới */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          if (!isCreating) {
            setIsCreateOpen(false);
            setCreateError(null);
          }
        }}
        title="Tạo khóa học mẫu mới"
      >
        <form onSubmit={handleCreateCourse} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Khóa học mới sẽ được tự động khởi tạo đúng 14 buổi học cố định theo chuẩn chương trình (Dữ liệu giả).
          </p>

          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{createError}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleCreateCourse()}
                  disabled={isCreating}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1"
                >
                  {isCreating ? 'Đang lưu...' : 'Thử lại'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tiêu đề khóa học <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              disabled={isCreating}
              placeholder="VD: Robotics & Tự Động Hóa K15"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mô tả khóa học
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              disabled={isCreating}
              rows={3}
              placeholder="Nhập mô tả ngắn gọn về khóa học (Dữ liệu giả)..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateError(null);
              }}
              disabled={isCreating}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isCreating ? 'Đang lưu...' : 'Tạo khóa mẫu'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Sửa thông tin khóa học */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          if (!isEditing) {
            setIsEditOpen(false);
            setEditError(null);
          }
        }}
        title="Sửa thông tin khóa học"
      >
        <form onSubmit={handleUpdateCourse} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Cập nhật tiêu đề hoặc mô tả cho khóa học đang chọn. Dữ liệu sẽ được lưu trong bộ nhớ giả lập.
          </p>

          {editError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{editError}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleUpdateCourse()}
                  disabled={isEditing}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1"
                >
                  {isEditing ? 'Đang lưu...' : 'Thử lại'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tiêu đề khóa học <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={isEditing}
              placeholder="Nhập tiêu đề khóa học..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mô tả khóa học
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={isEditing}
              rows={3}
              placeholder="Nhập mô tả khóa học..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsEditOpen(false);
                setEditError(null);
              }}
              disabled={isEditing}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isEditing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
