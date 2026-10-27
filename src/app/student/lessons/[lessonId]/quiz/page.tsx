'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconArrowLeft,
  IconCheckCircle,
  IconAlertCircle,
  IconRefreshCw,
  IconAlertTriangle,
  IconRotateCcw,
} from '@/components/icons';

export default function StudentQuizPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;

  const { currentUser, lessons, quizResults, submitQuizAttempt, qaState, isLiveMode } = useStore();

  const lesson = lessons.find((l) => l.id === lessonId);

  // Student selected answers (index of option chosen for each question)
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qIndex: number]: number }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean; message: string } | null>(null);

  // Simulation: Quiz updated mid-attempt
  const [quizChangedMidAttempt, setQuizChangedMidAttempt] = useState(false);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-6">Vui lòng đăng nhập tài khoản Học sinh để làm trắc nghiệm.</p>
        <button
          onClick={() => router.push('/login')}
          className="px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          Đăng nhập Học sinh
        </button>
      </div>
    );
  }

  const isStaffPreview = currentUser.role === 'admin' || currentUser.role === 'teacher';

  if (!lesson || (!isStaffPreview && lesson.status !== 'published') || !lesson.hasQuiz || lesson.questions.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Quiz chưa xuất bản hoặc không khả dụng</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Bài trắc nghiệm này thuộc buổi học chưa được xuất bản hoặc không có câu hỏi trắc nghiệm.
        </p>
        <Link
          href={isStaffPreview ? '/admin/courses' : '/student/course'}
          className="inline-block px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all"
        >
          {isStaffPreview ? 'Quay lại Quản lý khóa học' : 'Quay lại danh sách bài học'}
        </Link>
      </div>
    );
  }

  const existingResult = quizResults.find(
    (q) => q.studentId === currentUser.id && q.lessonId === lesson.id
  );

  const handleSelectOption = (questionIndex: number, optionIndex: number) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [questionIndex]: optionIndex,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if quiz changed mid-attempt
    if (quizChangedMidAttempt) {
      alert(
        'Thông báo hệ thống: Nội dung bài trắc nghiệm đã được giáo viên cập nhật trong lúc bạn đang làm bài. Trang sẽ tự động tải lại bộ câu hỏi mới nhất.'
      );
      setQuizChangedMidAttempt(false);
      setSelectedAnswers({});
      return;
    }

    // Convert to array of selected indices
    const answersArray: number[] = lesson.questions.map((_, idx) =>
      selectedAnswers[idx] !== undefined ? selectedAnswers[idx] : -1
    );

    if (isStaffPreview) {
      let correctCount = 0;
      lesson.questions.forEach((q, idx) => {
        if (typeof q.correctOptionIndex === 'number' && answersArray[idx] === q.correctOptionIndex) {
          correctCount++;
        }
      });
      const score = Math.round((correctCount / lesson.questions.length) * 100);
      const passed = score >= 70;
      setLastResult({
        score,
        passed,
        message: `[Chế độ Xem trước Admin/GV] Đúng ${correctCount}/${lesson.questions.length} câu (${score}%). ${
          passed ? 'Đạt ngưỡng >= 70%!' : 'Chưa đạt ngưỡng 70%.'
        }`,
      });
      return;
    }

    setIsSubmitting(true);
    setTimeout(async () => {
      const res = await submitQuizAttempt(currentUser.id, lesson.id, answersArray);
      setIsSubmitting(false);
      setLastResult({
        score: res.score,
        passed: res.passed,
        message: res.message,
      });
    }, qaState.delayMs || 300);
  };

  const handleResetForm = () => {
    setSelectedAnswers({});
    setLastResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Navigation Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <Link
            href={`/student/lessons/${lesson.id}`}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
            title="Quay lại Bài học"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                Quiz Buổi {lesson.sessionNumber}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Trắc nghiệm: {lesson.title}
            </h1>
          </div>
        </div>

        {/* Existing Highest Score Badge */}
        {existingResult && (
          <div className="bg-blue-50/80 border border-blue-200/80 px-4 py-2.5 rounded-2xl text-xs font-bold text-blue-950 flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="text-slate-600">Điểm cao nhất:</span>
            <span className="text-[#1d63ed] font-black text-sm">{existingResult.highestScore}%</span>
            <span className={existingResult.passed ? 'text-emerald-700' : 'text-amber-700'}>
              ({existingResult.passed ? 'ĐẠT >= 70%' : 'Chưa đạt'})
            </span>
          </div>
        )}
      </div>

      {/* Rules Notice */}
      <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-xs text-xs text-slate-600 space-y-1.5">
        <div className="font-extrabold text-slate-900 text-sm mb-1">Hướng dẫn làm bài Trắc nghiệm:</div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
          <span>Mỗi câu hỏi có 1 đáp án đúng duy nhất, các câu hỏi có trọng số điểm bằng nhau.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
          <span>Ngưỡng hoàn thành ĐẠT: từ <strong>70%</strong> trở lên.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
          <span>Được phép làm lại không giới hạn số lần, hệ thống luôn lưu giữ điểm số cao nhất.</span>
        </div>
      </div>

      {/* Mid-attempt change simulator banner (only visible in Demo/QA mode) */}
      {!isLiveMode && (
        <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs flex items-center justify-between gap-2">
          <span className="text-blue-900 font-medium">
            Mô phỏng QA: Kiểm tra hành vi khi giáo viên cập nhật bài trắc nghiệm giữa lượt làm
          </span>
          <button
            type="button"
            onClick={() => setQuizChangedMidAttempt(true)}
            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition-colors cursor-pointer ${
              quizChangedMidAttempt
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-blue-200 text-[#1d63ed] hover:bg-blue-100'
            }`}
          >
            {quizChangedMidAttempt ? 'Đang kích hoạt giả lập' : 'Kích hoạt thử'}
          </button>
        </div>
      )}

      {/* Result Display after Submit */}
      {lastResult && (
        <div
          className={`p-6 rounded-3xl border shadow-sm animate-in fade-in space-y-3 ${
            lastResult.passed
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/90 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {lastResult.passed ? (
                <IconCheckCircle className="w-6 h-6 text-emerald-600" />
              ) : (
                <IconAlertTriangle className="w-6 h-6 text-amber-600" />
              )}
              <h2 className="text-base font-black">
                {lastResult.passed ? 'CHÚC MỪNG BẠN ĐÃ ĐẠT!' : 'BẠN CHƯA ĐẠT NGƯỠNG 70%'}
              </h2>
            </div>
            <div className="text-2xl font-black">{lastResult.score}%</div>
          </div>

          <p className="text-xs leading-relaxed">{lastResult.message}</p>

          <div className="pt-3 flex items-center justify-between border-t border-current/15">
            <span className="text-xs">
              Điểm cao nhất hệ thống ghi nhận:{' '}
              <strong>{existingResult ? existingResult.highestScore : lastResult.score}%</strong>
            </span>
            <button
              onClick={handleResetForm}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <IconRotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại lần nữa</span>
            </button>
          </div>
        </div>
      )}

      {/* Quiz Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {lesson.questions.map((q, qIndex) => {
          const selectedOption = selectedAnswers[qIndex];

          return (
            <div
              key={q.id}
              className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-7 shadow-[0_14px_40px_rgba(8,112,184,0.05)] space-y-4 text-xs"
            >
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-[#1d63ed] border border-blue-100 font-bold font-mono shrink-0">
                  Câu {qIndex + 1}
                </span>
                <h3 className="font-extrabold text-slate-900 text-sm leading-relaxed flex-1 pt-0.5">{q.prompt}</h3>
              </div>

              <div className="space-y-2.5 pt-1">
                {q.options.map((opt, optIndex) => {
                  const isChecked = selectedOption === optIndex;

                  return (
                    <label
                      key={optIndex}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-[#1d63ed] bg-blue-50/70 ring-2 ring-blue-500/15 font-bold text-slate-900'
                          : 'border-slate-200/80 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question_${q.id}`}
                        checked={isChecked}
                        onChange={() => handleSelectOption(qIndex, optIndex)}
                        className="w-4 h-4 text-[#1d63ed] focus:ring-[#1d63ed]"
                      />
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                          isChecked ? 'bg-[#1d63ed] text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {String.fromCharCode(65 + optIndex)}
                      </span>
                      <span className="flex-1 leading-relaxed">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Submit Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href={`/student/lessons/${lesson.id}`}
            className="px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            Quay lại bài học
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting && <IconRefreshCw className="w-4 h-4 animate-spin" />}
            <span>Nộp bài chấm điểm</span>
          </button>
        </div>
      </form>
    </div>
  );
}
