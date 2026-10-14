'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { PracticeSubmission, SubmissionStatus } from '@/lib/types';
import {
  IconFileText,
  IconCheckCircle,
  IconAlertCircle,
  IconExternalLink,
  IconDownload,
  IconClock,
  IconUser,
  IconRotateCcw,
  IconRefreshCw,
  IconCheck,
} from '@/components/icons';

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const {
    currentUser,
    submissions,
    students,
    lessons,
    classes,
    gradeSubmission,
    reopenSubmission,
    qaState,
  } = useStore();

  const [selectedSubId, setSelectedSubId] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionAlert, setActionAlert] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentUser || currentUser.role === 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-4">
          Hàng đợi chấm bài [UI-09] chỉ dành cho Giáo viên và Ban Quản Trị.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập vai trò Giáo viên
        </button>
      </div>
    );
  }

  // Filter submissions by teacher assigned classes (if teacher)
  const isTeacher = currentUser.role === 'teacher';
  const assignedClassSet = new Set(currentUser.assignedClassIds || []);

  const relevantSubmissions = submissions.filter((sub) => {
    if (!isTeacher) return true; // Admin sees all
    const student = students.find((s) => s.id === sub.studentId);
    return student && assignedClassSet.has(student.currentClassId);
  });

  const filteredSubmissions = relevantSubmissions.filter((sub) => {
    if (filterStatus === 'all') return true;
    return sub.status === filterStatus;
  });

  const activeSub =
    filteredSubmissions.find((s) => s.id === selectedSubId) || filteredSubmissions[0];
  const activeStudent = students.find((s) => s.id === activeSub?.studentId);
  const activeLesson = lessons.find((l) => l.id === activeSub?.lessonId);
  const activeClass = classes.find((c) => c.id === activeStudent?.currentClassId);

  // Sync feedback textarea when active submission changes
  React.useEffect(() => {
    if (activeSub) {
      setFeedback(activeSub.teacherFeedback || '');
    }
  }, [activeSub]);

  const [gradingAction, setGradingAction] = useState<'needs_revision' | 'approved' | null>(null);
  const [isReopening, setIsReopening] = useState(false);

  const handleGrade = (status: 'approved' | 'needs_revision') => {
    if (!activeSub) return;
    setIsSaving(true);
    setGradingAction(status);
    setActionAlert(null);

    setTimeout(() => {
      const res = gradeSubmission(activeSub.id, {
        status,
        feedback,
      });
      setIsSaving(false);
      setGradingAction(null);
      setActionAlert({ text: res.message, isError: !res.success });
    }, qaState.delayMs || 300);
  };

  const handleReopen = async () => {
    if (!activeSub || isReopening) return;
    setIsReopening(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = reopenSubmission(activeSub.id);
    setIsReopening(false);
    setActionAlert({ text: res.message, isError: !res.success });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
              Giáo viên
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-09]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            Hàng đợi & Khung chấm bài thực hành
          </h1>
          <p className="text-xs text-slate-500">
            Duyệt bài nộp của học sinh, nhận xét chi tiết, xếp loại Đạt hoặc Cần làm lại, và mở lại quyền
            nộp bài nếu cần.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-lg text-xs font-bold">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterStatus === 'all' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({relevantSubmissions.length})
          </button>
          <button
            onClick={() => setFilterStatus('submitted')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterStatus === 'submitted'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            Chờ chấm ({relevantSubmissions.filter((s) => s.status === 'submitted').length})
          </button>
          <button
            onClick={() => setFilterStatus('approved')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filterStatus === 'approved'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-700 hover:text-emerald-900'
            }`}
          >
            Đã đạt ({relevantSubmissions.filter((s) => s.status === 'approved').length})
          </button>
        </div>
      </div>

      {/* Action Notification */}
      {actionAlert && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            actionAlert.isError
              ? 'bg-rose-50 border border-rose-300 text-rose-800'
              : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
          }`}
        >
          {actionAlert.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1 leading-relaxed">{actionAlert.text}</span>
          <button onClick={() => setActionAlert(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Desktop Layout (1280x720 / 1440x900 / 1920x1080) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Submissions Queue List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Danh sách bài nộp ({filteredSubmissions.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Dữ liệu giả lập</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredSubmissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Không có bài nộp nào phù hợp trong hàng đợi này.
              </div>
            ) : (
              filteredSubmissions.map((sub) => {
                const stu = students.find((s) => s.id === sub.studentId);
                const les = lessons.find((l) => l.id === sub.lessonId);
                const isSelected = sub.id === activeSub?.id;

                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setSelectedSubId(sub.id);
                      setActionAlert(null);
                    }}
                    className={`w-full text-left p-4 transition-all text-xs ${
                      isSelected
                        ? 'bg-blue-50/90 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 text-sm">{stu?.fullName}</span>
                      <span className="font-mono text-[11px] font-bold text-blue-700">
                        {stu?.studentCode}
                      </span>
                    </div>

                    <div className="text-slate-600 font-medium mb-2">
                      Buổi {les?.sessionNumber}: {les?.title}
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-mono">
                        {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                      </span>

                      {sub.status === 'submitted' && (
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                          Chờ chấm
                        </span>
                      )}
                      {sub.status === 'approved' && (
                        <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                          Đã đạt
                        </span>
                      )}
                      {sub.status === 'needs_revision' && (
                        <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                          Cần làm lại
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Submission Grading Pane (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          {activeSub && activeStudent && activeLesson ? (
            <>
              {/* Submission Header */}
              <div className="border-b pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block mb-1">
                      Chi tiết bài nộp — Buổi {activeLesson.sessionNumber}
                    </span>
                    <h2 className="text-lg font-black text-slate-900">{activeStudent.fullName}</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Mã: {activeStudent.studentCode} | Lớp: {activeClass?.code} ({activeClass?.name})
                    </p>
                  </div>

                  <div>
                    {activeSub.status === 'submitted' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Đang chờ giáo viên chấm
                      </span>
                    )}
                    {activeSub.status === 'approved' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Đã được duyệt Đạt
                      </span>
                    )}
                    {activeSub.status === 'needs_revision' && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        Yêu cầu làm lại
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submission Content */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Hình thức nộp:</span>
                  <span className="font-mono uppercase font-bold text-slate-900">
                    {activeSub.type === 'link' ? 'Liên kết ngoài (URL)' : 'Tệp tải lên (Dưới 2MB)'}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    <IconFileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-mono text-slate-800 truncate">{activeSub.content}</span>
                  </div>

                  {activeSub.type === 'link' ? (
                    <a
                      href={activeSub.content}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 shrink-0 flex items-center gap-1"
                    >
                      <span>Mở link</span>
                      <IconExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => alert(`[Mô phỏng]: Đang tải tệp an toàn ${activeSub.content}`)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 shrink-0 flex items-center gap-1"
                    >
                      <IconDownload className="w-3.5 h-3.5" />
                      <span>Tải tệp</span>
                    </button>
                  )}
                </div>

                {activeSub.notes && (
                  <div className="text-slate-600">
                    <span className="font-bold text-slate-700">Ghi chú của học sinh: </span>
                    <span>"{activeSub.notes}"</span>
                  </div>
                )}
              </div>

              {/* Grading Input */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nhận xét / Đóng góp ý kiến của Giáo viên:
                  </label>
                  <textarea
                    rows={4}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Nhập nhận xét chi tiết để học sinh nắm rõ ưu điểm hoặc phần cần khắc phục..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Grade Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleGrade('needs_revision')}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      {isSaving && gradingAction === 'needs_revision' ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <span>Cần làm lại</span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleGrade('approved')}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      {isSaving && gradingAction === 'approved' ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <>
                          <IconCheck className="w-4 h-4" />
                          <span>Duyệt ĐẠT</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Reopen approved submission button */}
                  {activeSub.status === 'approved' && (
                    <button
                      type="button"
                      disabled={isReopening}
                      onClick={handleReopen}
                      className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-xs font-bold flex items-center gap-1.5"
                      title="Mở lại quyền nộp bài cho học sinh"
                    >
                      {isReopening ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" />
                          <span>Đang mở lại...</span>
                        </>
                      ) : (
                        <>
                          <IconRotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Mở lại quyền nộp bài</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400 text-xs">
              Vui lòng chọn một bài nộp ở cột danh sách bên trái để tiến hành chấm bài.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
