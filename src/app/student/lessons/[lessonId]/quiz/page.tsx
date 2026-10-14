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
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconRotateCcw,
} from '@/components/icons';

export default function StudentQuizPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;

  const { currentUser, lessons, quizResults, submitQuizAttempt, qaState } = useStore();

  const lesson = lessons.find((l) => l.id === lessonId);

  // Student selected answers (index of option chosen for each question)
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qIndex: number]: number }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; passed: boolean; message: string } | null>(null);

  // Simulation: Quiz updated mid-attempt
  const [quizChangedMidAttempt, setQuizChangedMidAttempt] = useState(false);

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-4">Vui lòng đăng nhập tài khoản Học sinh để làm trắc nghiệm.</p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập Học sinh
        </button>
      </div>
    );
  }

  if (!lesson || lesson.status !== 'published' || !lesson.hasQuiz || lesson.questions.length === 0) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quiz chưa xuất bản hoặc không khả dụng</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bài trắc nghiệm này thuộc buổi học chưa được xuất bản hoặc không có câu hỏi trắc nghiệm.
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

    setIsSubmitting(true);
    setTimeout(() => {
      const res = submitQuizAttempt(currentUser.id, lesson.id, answersArray);
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
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/student/lessons/${lesson.id}`}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Quay lại Bài học [UI-12]"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-purple-100 text-purple-800">
                Quiz Buổi {lesson.sessionNumber}
              </span>
              <span className="text-xs text-slate-400 font-mono">[UI-13]</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Trắc nghiệm: {lesson.title}
            </h1>
          </div>
        </div>

        {/* Existing Highest Score Badge */}
        {existingResult && (
          <div className="bg-purple-50 border border-purple-200 px-3.5 py-1.5 rounded-xl text-xs font-bold text-purple-900 flex items-center gap-2 self-start sm:self-auto">
            <span>Điểm cao nhất:</span>
            <span className="text-purple-700 font-black text-sm">{existingResult.highestScore}%</span>
            <span>({existingResult.passed ? 'ĐẠT >= 70%' : 'Chưa đạt'})</span>
          </div>
        )}
      </div>

      {/* Rules Notice */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
        <div className="font-bold text-slate-800">Quy tắc làm bài Quiz (Kế hoạch v3):</div>
        <div>• Mỗi câu hỏi có 1 đáp án đúng duy nhất, các câu hỏi có trọng số điểm bằng nhau.</div>
        <div>• Ngưỡng hoàn thành ĐẠT: từ 70% trở lên.</div>
        <div>• Được phép làm lại không giới hạn số lần, hệ thống luôn lưu giữ điểm số cao nhất.</div>
      </div>

      {/* Mid-attempt change simulator banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs flex items-center justify-between">
        <span className="text-blue-900">
          Mô phỏng QA: Kiểm tra hành vi khi giáo viên cập nhật bài trắc nghiệm giữa lượt làm
        </span>
        <button
          type="button"
          onClick={() => setQuizChangedMidAttempt(true)}
          className={`px-2.5 py-1 rounded font-bold text-[11px] transition-colors ${
            quizChangedMidAttempt
              ? 'bg-amber-600 text-white'
              : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-100'
          }`}
        >
          {quizChangedMidAttempt ? 'Đang kích hoạt giả lập' : 'Kích hoạt thử'}
        </button>
      </div>

      {/* Result Display after Submit */}
      {lastResult && (
        <div
          className={`p-6 rounded-2xl border shadow-sm animate-in fade-in space-y-3 ${
            lastResult.passed
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {lastResult.passed ? (
                <IconCheckCircle className="w-6 h-6 text-emerald-600" />
              ) : (
                <IconAlertTriangle className="w-6 h-6 text-amber-600" />
              )}
              <h2 className="text-base font-black">
                {lastResult.passed ? 'CHÚC MỪNG BẠN ĐÃ ĐẠT!' : 'BẠN CHƯA ĐẠT NGƯỠNG 70%'}
              </h2>
            </div>
            <div className="text-xl font-black">{lastResult.score}%</div>
          </div>

          <p className="text-xs leading-relaxed">{lastResult.message}</p>

          <div className="pt-2 flex items-center justify-between border-t border-current/20">
            <span className="text-xs">
              Điểm cao nhất hệ thống ghi nhận:{' '}
              <strong>{existingResult ? existingResult.highestScore : lastResult.score}%</strong>
            </span>
            <button
              onClick={handleResetForm}
              className="px-3.5 py-1.5 rounded-lg bg-white/80 hover:bg-white text-slate-800 font-bold text-xs shadow-sm transition-colors flex items-center gap-1"
            >
              <IconRotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại lần nữa</span>
            </button>
          </div>
        </div>
      )}

      {/* Quiz Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {lesson.questions.map((q, qIndex) => {
          const selectedOption = selectedAnswers[qIndex];

          return (
            <div
              key={q.id}
              className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4 text-xs"
            >
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold font-mono">
                  Câu {qIndex + 1}
                </span>
                <h3 className="font-bold text-slate-900 text-sm leading-relaxed flex-1">{q.prompt}</h3>
              </div>

              <div className="space-y-2 pt-1 pl-1">
                {q.options.map((opt, optIndex) => {
                  const isChecked = selectedOption === optIndex;

                  return (
                    <label
                      key={optIndex}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-blue-600 bg-blue-50/80 ring-1 ring-blue-600 font-semibold text-blue-900'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question_${q.id}`}
                        checked={isChecked}
                        onChange={() => handleSelectOption(qIndex, optIndex)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-slate-400 font-bold">
                        {String.fromCharCode(65 + optIndex)}.
                      </span>
                      <span className="flex-1">{opt}</span>
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
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50"
          >
            Quay lại bài học
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-2"
          >
            {isSubmitting && <IconRefreshCw className="w-4 h-4 animate-spin" />}
            <span>Nộp bài chấm điểm</span>
          </button>
        </div>
      </form>
    </div>
  );
}
