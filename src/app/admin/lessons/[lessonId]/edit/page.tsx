'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Lesson, Question, PracticeMode, LessonStatus } from '@/lib/types';
import {
  IconArrowLeft,
  IconShield,
  IconCheckCircle,
  IconAlertCircle,
  IconSave,
  IconAlertTriangle,
  IconPlus,
  IconX,
  IconRefreshCw,
  IconLock,
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
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-4">
          Chỉ có Quản trị viên (Admin) mới có quyền chỉnh sửa nội dung bài học [UI-06].
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

  if (!lesson) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Không tìm thấy bài học</h2>
        <p className="text-xs text-slate-500 mb-4">Mã bài học "{lessonId}" không tồn tại trong hệ thống.</p>
        <Link
          href="/admin/courses"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
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
    setTimeout(() => {
      const res = updateLesson(lesson.id, {
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
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/courses"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Quay lại danh sách khóa 14 buổi [UI-05]"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-800">
                Buổi {lesson.sessionNumber} / 14
              </span>
              <span className="text-xs text-slate-400 font-mono">[UI-06]</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">Soạn thảo nội dung bài học</h1>
          </div>
        </div>

        {isDirty && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5">
            <IconAlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Có thay đổi chưa lưu</span>
          </span>
        )}
      </div>

      {/* Save Notification */}
      {saveAlert && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            saveAlert.isError
              ? 'bg-rose-50 border border-rose-300 text-rose-800'
              : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
          }`}
        >
          {saveAlert.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          )}
          <span className="font-semibold leading-relaxed flex-1">{saveAlert.text}</span>
          <button onClick={() => setSaveAlert(null)} className="text-slate-400 hover:text-slate-600">
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Lesson Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b pb-2">1. Thông tin chung của buổi học</h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu đề bài học</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả ngắn</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              * Quy tắc hệ thống: Không tải video trực tiếp lên ứng dụng, chỉ sử dụng link video ngoài.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tài liệu học tập (Định dạng Markdown / Liên kết tài liệu)
            </label>
            <textarea
              rows={4}
              value={materials}
              onChange={(e) => {
                setMaterials(e.target.value);
                setIsDirty(true);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
        </div>

        {/* Assessment Components & Publishing Rule */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-bold text-slate-900">2. Thành phần đánh giá & Xuất bản</h2>
            <span className="text-xs text-rose-600 font-bold">
              Quy tắc bắt buộc: Chặn xuất bản bài chỉ có lý thuyết
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Assessment Toggles */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasQuiz}
                  onChange={(e) => {
                    setHasQuiz(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-800">Có bài trắc nghiệm Quiz (Đạt từ 70%)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPractice}
                  onChange={(e) => {
                    setHasPractice(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-800">Có bài tập thực hành (Giáo viên chấm Đạt)</span>
              </label>

              {!hasQuiz && !hasPractice && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded font-medium">
                  Cảnh báo: Khi không có cả Quiz và Thực hành, hệ thống sẽ KHÔNG cho phép chuyển sang trạng thái
                  Đã xuất bản.
                </div>
              )}
            </div>

            {/* Practice Mode & Status */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chế độ nộp bài thực hành:
                </label>
                <select
                  disabled={!hasPractice}
                  value={practiceMode}
                  onChange={(e) => {
                    setPracticeMode(e.target.value as PracticeMode);
                    setIsDirty(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                >
                  <option value="link_only">Chỉ nộp liên kết (URL)</option>
                  <option value="file_allowed">Cho phép tải tệp (Tối đa 2 MB, ZIP/PDF/PNG/PY/SB3...)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Trạng thái hiển thị bài học:
                </label>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
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
                  <label className="flex items-center gap-1.5 cursor-pointer">
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
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">3. Bộ câu hỏi trắc nghiệm Quiz</h2>
                <p className="text-[11px] text-slate-500">
                  Một đáp án đúng mỗi câu, câu hỏi có trọng số bằng nhau, đạt từ 70%, làm lại không giới hạn.
                </p>
              </div>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs hover:bg-blue-100"
              >
                <IconPlus className="w-3.5 h-3.5" />
                <span>Thêm câu hỏi</span>
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q, qIndex) => (
                <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-700">Câu hỏi {qIndex + 1}:</span>
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="text-slate-400 hover:text-rose-600 text-xs font-semibold"
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
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white font-medium"
                  />

                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-600 block">
                      Các đáp án (Chọn nút tròn để chỉ định đáp án ĐÚNG):
                    </span>
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-2">
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
                          className="text-emerald-600 focus:ring-emerald-500"
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
                          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
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
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50"
          >
            Hủy và quay lại
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md transition-colors flex items-center gap-2"
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
