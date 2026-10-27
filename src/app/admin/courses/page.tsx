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
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Quyền truy cập bị từ chối</h2>
        <p className="text-xs text-slate-500 mb-6">
          Chỉ có Admin mới có quyền truy cập trang quản trị khóa học 14 buổi.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-5 py-2.5 bg-[#0f172a] text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md transition-all cursor-pointer"
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

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const res = await createCourse(trimmedTitle, createDescription.trim());
      if (!res.success) {
        setCreateError(res.message);
      } else {
        if (res.course) {
          setSelectedCourseId(res.course.id);
        }
        setSuccessMessage(res.message || 'Tạo khóa học thành công.');
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

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const res = await updateCourse(selectedCourse.id, {
        title: trimmedTitle,
        description: editDescription.trim(),
      });
      if (!res.success) {
        setEditError(res.message);
      } else {
        setSelectedCourseId(selectedCourse.id);
        setSuccessMessage(res.message || 'Cập nhật khóa học thành công.');
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
      {/* Title & Actions Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
            <span>Quản trị Khóa học (Admin)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Chương trình &amp; Khóa học 14 Buổi Cố Định
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Mỗi khóa học có đúng 14 vị trí Buổi 1–14 cố định. Không thêm, xóa hoặc đổi thứ tự vị trí để bảo
            toàn tính nhất quán của báo cáo CSV tổng kết.
          </p>
        </div>
        <div className="shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo khóa học mới</span>
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold">
          <div className="flex items-center gap-2">
            <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold ml-2 underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Empty Courses State */}
      {courses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-[0_14px_40px_rgba(8,112,184,0.06)] max-w-lg mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1d63ed] flex items-center justify-center mx-auto mb-4">
            <IconBookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mb-1.5">Chưa có khóa học nào trong hệ thống</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-sm mx-auto">
            Hiện tại danh sách khóa học đang trống. Vui lòng tạo khóa học mới để bắt đầu thiết lập chương trình 14 buổi học cố định.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo khóa học mới</span>
          </button>
        </div>
      ) : (
        <>
          {/* Course Selection List */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-[0_14px_40px_rgba(8,112,184,0.05)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1d63ed] flex items-center justify-center">
                  <IconBookOpen className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Danh sách khóa học ({courses.length})
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">
                Bấm chọn khóa học để xem cấu trúc và 14 buổi học tương ứng
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-[#1d63ed] bg-blue-50/60 shadow-sm ring-2 ring-blue-500/15'
                        : 'border-slate-200/80 bg-white hover:border-blue-200 hover:bg-slate-50/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono font-bold text-[#1d63ed] uppercase bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {crs.id}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1d63ed] bg-white px-2.5 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                            <IconCheckCircle className="w-3 h-3" />
                            Đang chọn
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 line-clamp-1">{crs.title}</div>
                      <div className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {crs.description}
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-medium">14 buổi chuẩn</span>
                      <span className="text-[#1d63ed] font-bold">{isSelected ? 'Khóa hiện hành' : 'Bấm để chọn →'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Course Detail Card */}
          {selectedCourse && (
            <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#1d63ed] uppercase tracking-wider bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                      Mã khóa: {selectedCourse.id}
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{selectedCourse.title}</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selectedCourse.description}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 shrink-0">
                  <div className="bg-blue-50/80 border border-blue-200/80 px-5 py-3 rounded-2xl text-center w-full md:w-auto">
                    <span className="text-[10px] font-bold text-[#1d63ed] uppercase tracking-wider block">
                      Cấu trúc chương trình
                    </span>
                    <span className="text-lg font-black text-slate-900 block mt-0.5">14 Buổi chuẩn</span>
                    <span className="text-[10px] text-slate-500 font-semibold">(Không lệch số buổi)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenEditModal}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors shadow-2xs w-full md:w-auto cursor-pointer"
                  >
                    <IconFileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sửa thông tin khóa</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 border-t border-slate-100 font-medium">
                <span>
                  Đã xuất bản:{' '}
                  <strong className="text-emerald-700 font-extrabold">
                    {courseLessons.filter((l) => l.status === 'published').length}/14 buổi
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Bản nháp:{' '}
                  <strong className="text-amber-700 font-extrabold">
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
            <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.06)] overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Danh sách 14 vị trí bài học ({selectedCourse.title})
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  Bấm &ldquo;Soạn bài&rdquo; để cập nhật giáo trình và câu hỏi Quiz
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f8fafc] text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-3.5 w-24">Vị trí</th>
                      <th className="px-5 py-3.5">Tiêu đề bài học &amp; Chủ đề</th>
                      <th className="px-5 py-3.5 w-44">Thành phần đánh giá</th>
                      <th className="px-5 py-3.5 w-36">Chế độ nộp bài</th>
                      <th className="px-5 py-3.5 w-36">Trạng thái</th>
                      <th className="px-5 py-3.5 w-52 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {courseLessons.map((les) => {
                      const isPublished = les.status === 'published';

                      return (
                        <tr key={les.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 font-mono font-bold text-[#1d63ed] text-[11px] whitespace-nowrap">
                              Buổi {les.sessionNumber}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-bold text-slate-900">{les.title}</div>
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{les.description}</div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1.5">
                              {les.hasQuiz && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 whitespace-nowrap">
                                  Quiz (70%)
                                </span>
                              )}
                              {les.hasPractice && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 whitespace-nowrap">
                                  Thực hành
                                </span>
                              )}
                              {!les.hasQuiz && !les.hasPractice && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                                  Chỉ lý thuyết (Chặn xuất bản)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                            {les.hasPractice
                              ? les.practiceMode === 'file_allowed'
                                ? 'Tệp <= 2MB'
                                : 'Chỉ nhận link'
                              : 'Không có TH'}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            {isPublished ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                <IconCheckCircle className="w-3 h-3 shrink-0" />
                                <span>Đã xuất bản</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                <IconLock className="w-3 h-3 shrink-0" />
                                <span>Bản nháp</span>
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-2">
                              <Link
                                href={`/student/lessons/${les.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                                title="Xem trước giao diện bài học của Học sinh"
                              >
                                <IconBookOpen className="w-3.5 h-3.5 shrink-0" />
                                <span>Xem thử</span>
                              </Link>
                              <Link
                                href={`/admin/lessons/${les.id}/edit`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-[#1d63ed] font-bold hover:bg-[#1d63ed] hover:text-white transition-all whitespace-nowrap"
                              >
                                <span>Soạn bài</span>
                                <IconExternalLink className="w-3.5 h-3.5 shrink-0" />
                              </Link>
                            </div>
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
        title="Tạo khóa học mới (14 buổi chuẩn)"
      >
        <form onSubmit={handleCreateCourse} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Khóa học mới sẽ được tự động khởi tạo đúng 14 buổi học cố định theo chuẩn chương trình.
          </p>

          {createError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
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
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Tiêu đề khóa học <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              disabled={isCreating}
              placeholder="VD: Robotics & Tự Động Hóa K15"
              className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Mô tả khóa học
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              disabled={isCreating}
              rows={3}
              placeholder="Nhập mô tả ngắn gọn về khóa học..."
              className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateError(null);
              }}
              disabled={isCreating}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-5 py-2 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] transition-all disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {isCreating ? 'Đang lưu...' : 'Tạo khóa học'}
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
            Cập nhật tiêu đề hoặc mô tả cho khóa học đang chọn.
          </p>

          {editError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
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
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Tiêu đề khóa học <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={isEditing}
              placeholder="Nhập tiêu đề khóa học..."
              className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Mô tả khóa học
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={isEditing}
              rows={3}
              placeholder="Nhập mô tả khóa học..."
              className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsEditOpen(false);
                setEditError(null);
              }}
              disabled={isEditing}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isEditing}
              className="px-5 py-2 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] transition-all disabled:opacity-50 shadow-md shadow-blue-600/20"
            >
              {isEditing ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
