'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Question, PracticeMode, LessonStatus } from '@/lib/types';
import {
  IconArrowLeft,
  IconCheckCircle,
  IconAlertCircle,
  IconAlertTriangle,
  IconPlus,
  IconX,
  IconRefreshCw,
} from '@/components/icons';

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.lessonId as string;

  const { currentUser, lessons, updateLesson } = useStore();

  const lesson = lessons.find((l) => l.id === lessonId);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [materials, setMaterials] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [status, setStatus] = useState<LessonStatus>('draft');
  const [hasQuiz, setHasQuiz] = useState(true);
  const [hasPractice, setHasPractice] = useState(true);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('link_only');
  const [questions, setQuestions] = useState<Question[]>([]);

  // Dirty flag / Unsaved changes
  const [isDirty, setIsDirty] = useState(false);
  const [saveAlert, setSaveAlert] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setDescription(lesson.description);
      setMaterials(lesson.materials);
      setVideoUrl(lesson.videoUrl);
      setStatus(lesson.status);
      setHasQuiz(lesson.hasQuiz);
      setHasPractice(lesson.hasPractice);
      setPracticeMode(lesson.practiceMode);
      setQuestions(lesson.questions || []);
      setIsDirty(false);
    }
  }, [lesson]);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-6">
          Chỉ có Quản trị viên (Admin) mới có quyền chỉnh sửa nội dung bài học.
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

  if (!lesson) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Không tìm thấy bài học</h2>
        <p className="text-xs text-slate-500 mb-6">Mã bài học &ldquo;{lessonId}&rdquo; không tồn tại trong hệ thống.</p>
        <Link
          href="/admin/courses"
          className="inline-block px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20"
        >
          Quay lại danh sách khóa học
        </Link>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveAlert(null);

    // RULE: "Chặn xuất bản chỉ lý thuyết":
    if (status === 'published' && !hasQuiz && !hasPractice) {
      setSaveAlert({
        text: 'Chặn xuất bản: Buổi học phải có Quiz, Thực hành hoặc cả hai; không được xuất bản bài chỉ có lý thuyết.',
        isError: true,
      });
      return;
    }

    setIsSaving(true);
    setTimeout(async () => {
      const res = await updateLesson(lesson.id, {
        title,
        description,
        materials,
        videoUrl,
        status,
        hasQuiz,
        hasPractice,
        practiceMode,
        questions,
      });

      setIsSaving(false);
      setSaveAlert({ text: res.message, isError: !res.success });
      if (res.success) {
        setIsDirty(false);
      }
    }, 300);
  };

  const addQuestion = () => {
    const newQ: Question = {
      id: `q_${lesson.sessionNumber}_${Date.now()}`,
      prompt: `Câu hỏi trắc nghiệm mới số ${questions.length + 1}`,
      options: ['Lựa chọn A (Đáp án đúng)', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
      correctOptionIndex: 0,
    };
    setQuestions([...questions, newQ]);
    setIsDirty(true);
  };

  const removeQuestion = (qId: string) => {
    setQuestions(questions.filter((q) => q.id !== qId));
    setIsDirty(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Navigation Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <Link
            href="/admin/courses"
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
            title="Quay lại danh sách khóa 14 buổi"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                Buổi {lesson.sessionNumber} / 14
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Soạn thảo nội dung bài học
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto shrink-0">
          <Link
            href={`/student/lessons/${lesson.id}`}
            className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <span>Xem giao diện Học sinh</span>
          </Link>
          {isDirty && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5">
              <IconAlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Có thay đổi chưa lưu</span>
            </span>
          )}
        </div>
      </div>

      {/* Save Notification */}
      {saveAlert && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            saveAlert.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {saveAlert.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          )}
          <span className="font-semibold leading-relaxed flex-1">{saveAlert.text}</span>
          <button onClick={() => setSaveAlert(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Lesson Info */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
          <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">
            1. Thông tin chung của buổi học
          </h2>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Tiêu đề bài học</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-900 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Mô tả ngắn</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 leading-relaxed transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Liên kết video bài giảng (Nhúng URL)
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setIsDirty(true);
              }}
              placeholder="https://www.youtube.com/embed/..."
              className="w-full px-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 font-mono transition-all"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              * Quy tắc hệ thống: Không tải video trực tiếp lên ứng dụng, chỉ sử dụng link video ngoài.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Tài liệu học tập (Định dạng Markdown / Khối code HTML5 trực tiếp)
            </label>
            <textarea
              rows={6}
              value={materials}
              onChange={(e) => {
                setMaterials(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 font-mono leading-relaxed transition-all"
            />
          </div>
        </div>

        {/* Assessment Components & Publishing Rule */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <h2 className="text-base font-extrabold text-slate-900">2. Thành phần đánh giá &amp; Xuất bản</h2>
            <span className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-1 rounded-full border border-rose-200/80">
              Quy tắc bắt buộc: Chặn xuất bản bài chỉ có lý thuyết
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Assessment Toggles */}
            <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasQuiz}
                  onChange={(e) => {
                    setHasQuiz(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="w-4 h-4 text-[#1d63ed] rounded border-slate-300 focus:ring-[#1d63ed]"
                />
                <span className="text-xs font-bold text-slate-800">Có bài trắc nghiệm Quiz (Đạt từ 70%)</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPractice}
                  onChange={(e) => {
                    setHasPractice(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="w-4 h-4 text-[#1d63ed] rounded border-slate-300 focus:ring-[#1d63ed]"
                />
                <span className="text-xs font-bold text-slate-800">Có bài tập thực hành (Giáo viên chấm Đạt)</span>
              </label>

              {!hasQuiz && !hasPractice && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-xl font-medium">
                  Cảnh báo: Khi không có cả Quiz và Thực hành, hệ thống sẽ KHÔNG cho phép chuyển sang trạng thái
                  Đã xuất bản.
                </div>
              )}
            </div>

            {/* Practice Mode & Status */}
            <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chế độ nộp bài thực hành:
                </label>
                <select
                  disabled={!hasPractice}
                  value={practiceMode}
                  onChange={(e) => {
                    setPracticeMode(e.target.value as PracticeMode);
                    setIsDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="link_only">Chỉ nộp liên kết (URL)</option>
                  <option value="file_allowed">Cho phép tải tệp (Tối đa 2 MB, ZIP/PDF/PNG/PY/SB3...)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Trạng thái hiển thị bài học:
                </label>
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="draft"
                      checked={status === 'draft'}
                      onChange={() => {
                        setStatus('draft');
                        setIsDirty(true);
                      }}
                      className="text-amber-600"
                    />
                    <span className="text-amber-800">Bản nháp (Học sinh chưa thấy)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="published"
                      checked={status === 'published'}
                      onChange={() => {
                        setStatus('published');
                        setIsDirty(true);
                      }}
                      className="text-emerald-600"
                    />
                    <span className="text-emerald-800">Đã xuất bản (Mở cho học sinh)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quiz Questions Editor (if hasQuiz is true) */}
        {hasQuiz && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">3. Bộ câu hỏi trắc nghiệm Quiz</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Một đáp án đúng mỗi câu, câu hỏi có trọng số bằng nhau, đạt từ 70%, làm lại không giới hạn.
                </p>
              </div>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50 text-[#1d63ed] border border-blue-100 font-bold text-xs hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <IconPlus className="w-3.5 h-3.5" />
                <span>Thêm câu hỏi</span>
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q, qIndex) => (
                <div key={q.id} className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-[#1d63ed] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                      Câu hỏi {qIndex + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="text-slate-400 hover:text-rose-600 text-xs font-bold cursor-pointer"
                    >
                      Xóa câu
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    value={q.prompt}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[qIndex].prompt = e.target.value;
                      setQuestions(updated);
                      setIsDirty(true);
                    }}
                    placeholder="Nhập nội dung câu hỏi..."
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl bg-white font-semibold focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10"
                  />

                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-600 block">
                      Các đáp án (Chọn nút tròn để chỉ định đáp án ĐÚNG):
                    </span>
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name={`correct_${q.id}`}
                          checked={q.correctOptionIndex === optIndex}
                          onChange={() => {
                            const updated = [...questions];
                            updated[qIndex].correctOptionIndex = optIndex;
                            setQuestions(updated);
                            setIsDirty(true);
                          }}
                          className="text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <input
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => {
                            const updated = [...questions];
                            updated[qIndex].options[optIndex] = e.target.value;
                            setQuestions(updated);
                            setIsDirty(true);
                          }}
                          placeholder={`Lựa chọn ${String.fromCharCode(65 + optIndex)}`}
                          className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-[#1d63ed]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/admin/courses"
            className="px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            Hủy và quay lại
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isSaving ? (
              <>
                <IconRefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <span>Lưu nội dung Buổi {lesson.sessionNumber}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
