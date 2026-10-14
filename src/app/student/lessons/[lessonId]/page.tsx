'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { SubmissionType } from '@/lib/types';
import {
  IconArrowLeft,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconLock,
  IconFileText,
  IconUpload,
  IconExternalLink,
  IconRefreshCw,
  IconBookOpen,
} from '@/components/icons';

export default function StudentLessonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;

  const { currentUser, lessons, submissions, quizResults, submitPractice, qaState } = useStore();

  const lesson = lessons.find((l) => l.id === lessonId);

  // Form state
  const [submissionType, setSubmissionType] = useState<SubmissionType>('link');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);

  const [alertNotice, setAlertNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-4">Vui lòng đăng nhập tài khoản Học sinh để vào học.</p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập Học sinh
        </button>
      </div>
    );
  }

  if (!lesson || lesson.status !== 'published') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Bài học chưa xuất bản</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bài học này hiện chưa được mở hoặc đang ở trạng thái Bản nháp. Nội dung chưa được công bố cho học sinh.
        </p>
        <Link
          href="/student/course"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Quay lại danh sách bài học [UI-11]
        </Link>
      </div>
    );
  }

  // Get current submission & quiz result for this lesson
  const currentSub = submissions.find(
    (s) => s.studentId === currentUser.id && s.lessonId === lesson.id
  );
  const currentQuiz = quizResults.find(
    (q) => q.studentId === currentUser.id && q.lessonId === lesson.id
  );

  const quizPassed = lesson.hasQuiz ? (currentQuiz?.passed ?? false) : true;
  const practicePassed = lesson.hasPractice ? currentSub?.status === 'approved' : true;
  const sessionCompleted = quizPassed && practicePassed;

  // Handle practice form submission
  const handleSubmitPractice = (e: React.FormEvent) => {
    e.preventDefault();
    setAlertNotice(null);

    let submitContent = content.trim();
    if (submissionType === 'file') {
      if (!fileName) {
        setAlertNotice({ text: 'Vui lòng chọn một tệp hợp lệ (dung lượng tối đa 2 MB).', isError: true });
        return;
      }
      submitContent = fileName;
    } else {
      if (!submitContent) {
        setAlertNotice({ text: 'Vui lòng nhập đường dẫn liên kết bài làm.', isError: true });
        return;
      }
    }

    setIsSubmitting(true);
    setTimeout(async () => {
      const res = await submitPractice(currentUser.id, lesson.id, {
        type: submissionType,
        content: submitContent,
        notes,
        fileSizeBytes: submissionType === 'file' ? fileSize : undefined,
      });

      setIsSubmitting(false);
      setAlertNotice({ text: res.message, isError: !res.success });
      if (res.success) {
        setContent('');
        setFileName('');
        setNotes('');
      }
    }, qaState.delayMs || 300);
  };

  // Mock file chooser simulation
  const handleSimulateFileSelect = (simulatedName: string, simulatedSizeKB: number) => {
    const sizeBytes = simulatedSizeKB * 1024;
    setFileName(simulatedName);
    setFileSize(sizeBytes);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/student/course"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Quay lại Danh sách 14 buổi [UI-11]"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-800">
                Buổi {lesson.sessionNumber} / 14
              </span>
              <span className="text-xs text-slate-400 font-mono">[UI-12]</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-0.5">{lesson.title}</h1>
          </div>
        </div>

        {/* Overall Status Badge */}
        <div>
          {sessionCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <IconCheckCircle className="w-4 h-4" />
              <span>Đã hoàn thành buổi học</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              <IconClock className="w-4 h-4" />
              <span>Chưa hoàn tất các yêu cầu</span>
            </span>
          )}
        </div>
      </div>

      {/* Alert Notice */}
      {alertNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            alertNotice.isError
              ? 'bg-rose-50 border border-rose-300 text-rose-800'
              : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
          }`}
        >
          {alertNotice.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1 leading-relaxed">{alertNotice.text}</span>
          <button onClick={() => setAlertNotice(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Video & Description Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 border-b pb-2">1. Video bài giảng & Nội dung</h2>
        <p className="text-xs text-slate-600 leading-relaxed">{lesson.description}</p>

        {lesson.videoUrl && (
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
            <iframe
              src={lesson.videoUrl}
              title={lesson.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <span className="font-bold text-slate-800 block mb-1">Tài liệu tham khảo buổi học:</span>
          <div className="text-slate-600 whitespace-pre-wrap font-sans">{lesson.materials}</div>
        </div>
      </div>

      {/* Quiz Section (if hasQuiz) */}
      {lesson.hasQuiz && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">2. Trắc nghiệm Quiz (Yêu cầu đạt từ 70%)</span>
              {quizPassed ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Đã đạt
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Chưa đạt
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Điểm cao nhất hiện tại:{' '}
              <strong className={quizPassed ? 'text-emerald-700' : 'text-slate-700'}>
                {currentQuiz ? `${currentQuiz.highestScore}%` : 'Chưa làm'}
              </strong>{' '}
              {currentQuiz && `(Đã làm ${currentQuiz.attemptsCount} lần)`}
            </p>
          </div>

          <Link
            href={`/student/lessons/${lesson.id}/quiz`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>{currentQuiz ? 'Làm lại Quiz [UI-13]' : 'Bắt đầu làm Quiz [UI-13]'}</span>
            <IconExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Practice Submission Section (if hasPractice) */}
      {lesson.hasPractice && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {lesson.hasQuiz ? '3. Nộp bài thực hành' : '2. Nộp bài thực hành'}
              </h2>
              <p className="text-xs text-slate-500">
                Chế độ bài học:{' '}
                <strong className="text-slate-700">
                  {lesson.practiceMode === 'file_allowed'
                    ? 'Cho phép nộp liên kết hoặc tải tệp <= 2MB'
                    : 'Chỉ nhận liên kết ngoài (URL)'}
                </strong>
              </p>
            </div>

            {/* Current Practice Status */}
            <div>
              {currentSub ? (
                currentSub.status === 'approved' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <IconCheckCircle className="w-3.5 h-3.5" />
                    <span>Bài thực hành: ĐẠT</span>
                  </span>
                ) : currentSub.status === 'needs_revision' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                    <IconAlertCircle className="w-3.5 h-3.5" />
                    <span>Cần làm lại theo góp ý</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <IconClock className="w-3.5 h-3.5" />
                    <span>Đang chờ giáo viên chấm</span>
                  </span>
                )
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Chưa nộp bài
                </span>
              )}
            </div>
          </div>

          {/* Current Submission Display & Teacher Feedback */}
          {currentSub && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Bài đã nộp lần gần nhất:</span>
                <span className="text-slate-400 font-mono">
                  {new Date(currentSub.submittedAt).toLocaleString('vi-VN')}
                </span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                <span className="font-mono text-slate-800 font-semibold truncate mr-2">
                  {currentSub.content}
                </span>
                {currentSub.type === 'link' ? (
                  <a
                    href={currentSub.content}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-bold shrink-0 flex items-center gap-1"
                  >
                    <span>Mở link</span>
                    <IconExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-slate-400 font-mono shrink-0">Tệp đính kèm</span>
                )}
              </div>

              {currentSub.teacherFeedback && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 space-y-1">
                  <span className="font-bold block">Nhận xét của Giáo viên:</span>
                  <p className="italic leading-relaxed">"{currentSub.teacherFeedback}"</p>
                </div>
              )}
            </div>
          )}

          {/* Practice Submission Form or Locked Warning */}
          {currentSub && currentSub.status === 'approved' && !currentSub.canResubmit ? (
            /* BLOCKED from resubmitting approved task */
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <IconLock className="w-4 h-4 text-amber-700" />
                <span>BÀI LÀM ĐÃ ĐƯỢC DUYỆT ĐẠT — KHÓA QUYỀN NỘP LẠI</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Bài thực hành của bạn đã được giáo viên đánh giá Đạt. Để bảo vệ dữ liệu kết quả, hệ thống không
                cho phép tự ý nộp đè bài mới. Nếu có nhu cầu bổ sung hoặc làm lại, bạn vui lòng nhờ Giáo viên
                phụ trách bấm <strong>"Mở lại quyền nộp bài"</strong> trên giao diện của giáo viên [UI-09].
              </p>
            </div>
          ) : (
            /* Allowed to submit or resubmit */
            <form onSubmit={handleSubmitPractice} className="space-y-4 text-xs">
              <span className="font-bold text-slate-800 block">
                {currentSub ? 'Gửi bài nộp thay thế:' : 'Điền thông tin nộp bài:'}
              </span>

              {/* Toggle Mode: Link vs File (if allowed) */}
              {lesson.practiceMode === 'file_allowed' ? (
                <div className="flex border rounded-lg overflow-hidden max-w-xs text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSubmissionType('link')}
                    className={`flex-1 py-1.5 px-3 transition-colors ${
                      submissionType === 'link' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    Nộp đường link
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionType('file')}
                    className={`flex-1 py-1.5 px-3 transition-colors ${
                      submissionType === 'file' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    Tải tệp (&lt;= 2MB)
                  </button>
                </div>
              ) : null}

              {/* Link Input */}
              {submissionType === 'link' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Đường dẫn bài làm (GitHub, Scratch, Drive, CodePen...):
                  </label>
                  <input
                    type="url"
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              ) : (
                /* File Input Simulation (Max 2MB, allowed formats: zip, pdf, png, jpg, webp, txt, py, js, html, css, json, md, sb3) */
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700">
                    Chọn tệp bài làm (Định dạng cho phép: ZIP, PDF, PNG, PY, JS, SB3... | Tối đa 2MB):
                  </label>

                  <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl text-center bg-slate-50">
                    <IconUpload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <span className="text-slate-600 block mb-2">
                      {fileName
                        ? `Đã chọn: ${fileName} (${Math.round(fileSize / 1024)} KB)`
                        : 'Bấm chọn tệp mẫu để kiểm thử'}
                    </span>

                    {/* Simulation buttons */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateFileSelect('bai_lam_robot_scratch.sb3', 450)}
                        className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                      >
                        Mẫu 1: robot.sb3 (450KB)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateFileSelect('ma_nguon_python.py', 25)}
                        className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                      >
                        Mẫu 2: code.py (25KB)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateFileSelect('bao_cao_du_an.pdf', 1200)}
                        className="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                      >
                        Mẫu 3: baocao.pdf (1.2MB)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateFileSelect('tep_qua_co_3mb.zip', 3100)}
                        className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 font-mono text-[11px]"
                      >
                        Thử tệp lỗi &gt; 2MB (3.1MB)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ghi chú gửi thầy cô (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ví dụ: Em đã sửa lại hàm quay động cơ theo nhận xét lần trước."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-2"
              >
                {isSubmitting && <IconRefreshCw className="w-4 h-4 animate-spin" />}
                <span>Gửi bài nộp</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
