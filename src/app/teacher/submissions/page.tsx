'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconFileText,
  IconCheckCircle,
  IconAlertCircle,
  IconExternalLink,
  IconDownload,
  IconRotateCcw,
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
    isLiveMode,
  } = useStore();

  const [selectedSubId, setSelectedSubId] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionAlert, setActionAlert] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentUser || currentUser.role === 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Hàng đợi chấm bài thực hành chỉ dành cho Giáo viên và Ban Quản Trị.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-5 py-2.5 bg-[#0f172a] text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md transition-all cursor-pointer"
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

    setTimeout(async () => {
      const res = await gradeSubmission(activeSub.id, {
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
    const res = await reopenSubmission(activeSub.id);
    setIsReopening(false);
    setActionAlert({ text: res.message, isError: !res.success });
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span>Khu vực Chấm bài Giáo viên</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Hàng đợi &amp; Khung chấm bài thực hành
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Duyệt bài nộp của học sinh, nhận xét chi tiết, xếp loại Đạt hoặc Cần làm lại, và mở lại quyền
            nộp bài nếu cần.
          </p>
        </div>

        {/* Segmented Filter Pills */}
        <div className="inline-flex items-center gap-1 self-start md:self-auto bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/70 text-xs font-bold shrink-0">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              filterStatus === 'all' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({relevantSubmissions.length})
          </button>
          <button
            onClick={() => setFilterStatus('submitted')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              filterStatus === 'submitted'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            Chờ chấm ({relevantSubmissions.filter((s) => s.status === 'submitted').length})
          </button>
          <button
            onClick={() => setFilterStatus('approved')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              filterStatus === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
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
          className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            actionAlert.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {actionAlert.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1 leading-relaxed">{actionAlert.text}</span>
          <button onClick={() => setActionAlert(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Desktop Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Submissions Queue List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.06)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-[#f8fafc] flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Danh sách bài nộp ({filteredSubmissions.length})
            </h3>
            {!isLiveMode && <span className="text-[11px] text-slate-400 font-mono">Dữ liệu giả lập</span>}
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredSubmissions.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">
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
                    className={`w-full text-left p-4 sm:px-5 transition-all text-xs cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-[#1d63ed]'
                        : 'hover:bg-slate-50/80 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-extrabold text-slate-900 text-sm">{stu?.fullName}</span>
                      <span className="font-mono text-[11px] font-bold text-[#1d63ed] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        {stu?.studentCode}
                      </span>
                    </div>

                    <div className="text-slate-600 font-semibold mb-2.5">
                      Buổi {les?.sessionNumber}: {les?.title}
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-mono">
                        {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                      </span>

                      {sub.status === 'submitted' && (
                        <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Chờ chấm
                        </span>
                      )}
                      {sub.status === 'approved' && (
                        <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Đã đạt
                        </span>
                      )}
                      {sub.status === 'needs_revision' && (
                        <span className="px-2.5 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">
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
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.06)] p-6 sm:p-8 space-y-6">
          {activeSub && activeStudent && activeLesson ? (
            <>
              {/* Submission Header */}
              <div className="border-b border-slate-100 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-[#1d63ed] uppercase tracking-wider block mb-1">
                      Chi tiết bài nộp — Buổi {activeLesson.sessionNumber}
                    </span>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">{activeStudent.fullName}</h2>
                    <p className="text-xs text-slate-500 font-mono mt-1">
                      Mã: <strong className="text-slate-800">{activeStudent.studentCode}</strong> | Lớp:{' '}
                      <strong className="text-slate-800">{activeClass?.code}</strong> ({activeClass?.name})
                    </p>
                  </div>

                  <div className="self-start sm:self-auto">
                    {activeSub.status === 'submitted' && (
                      <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-block">
                        Đang chờ giáo viên chấm
                      </span>
                    )}
                    {activeSub.status === 'approved' && (
                      <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                        Đã được duyệt Đạt
                      </span>
                    )}
                    {activeSub.status === 'needs_revision' && (
                      <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-block">
                        Yêu cầu làm lại
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Submission Content */}
              <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">Hình thức nộp:</span>
                  <span className="font-mono uppercase font-extrabold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {activeSub.type === 'link'
                      ? 'Liên kết ngoài (URL)'
                      : activeSub.type === 'text'
                      ? 'Văn bản trực tiếp'
                      : 'Tệp tải lên (Dưới 2MB)'}
                  </span>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1d63ed] flex items-center justify-center shrink-0">
                      <IconFileText className="w-4 h-4" />
                    </div>
                    <span className="font-mono font-semibold text-slate-800 truncate">{activeSub.content}</span>
                  </div>

                  {activeSub.type === 'link' ? (
                    <a
                      href={activeSub.content}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-blue-50 text-[#1d63ed] font-bold hover:bg-[#1d63ed] hover:text-white transition-all shrink-0 flex items-center gap-1.5"
                    >
                      <span>Mở link</span>
                      <IconExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : activeSub.type === 'text' ? (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shrink-0">
                      Bài nộp dạng văn bản
                    </span>
                  ) : (
                    <a
                      href={`/api/m3/file?path=${encodeURIComponent(activeSub.content)}`}
                      download
                      className="px-3.5 py-2 rounded-xl bg-[#0f172a] text-white font-bold hover:bg-slate-800 shrink-0 flex items-center gap-1.5 transition-all"
                    >
                      <IconDownload className="w-3.5 h-3.5" />
                      <span>Tải tệp</span>
                    </a>
                  )}
                </div>

                {activeSub.notes && (
                  <div className="text-slate-600 pt-1">
                    <span className="font-bold text-slate-800">Ghi chú của học sinh: </span>
                    <span className="italic">&ldquo;{activeSub.notes}&rdquo;</span>
                  </div>
                )}
              </div>

              {/* Grading Input */}
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Nhận xét / Đóng góp ý kiến của Giáo viên:
                  </label>
                  <textarea
                    rows={4}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Nhập nhận xét chi tiết để học sinh nắm rõ ưu điểm hoặc phần cần khắc phục..."
                    className="w-full px-4 py-3 text-xs border border-slate-200 rounded-2xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 transition-all leading-relaxed"
                  />
                </div>

                {/* Grade Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleGrade('needs_revision')}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
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
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
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
                      className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Mở lại quyền nộp bài cho học sinh"
                    >
                      {isReopening ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" />
                          <span>Đang mở lại...</span>
                        </>
                      ) : (
                        <>
                          <IconRotateCcw className="w-3.5 h-3.5 text-[#1d63ed]" />
                          <span>Mở lại quyền nộp bài</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-slate-400 text-xs">
              Vui lòng chọn một bài nộp ở cột danh sách bên trái để tiến hành chấm bài.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
