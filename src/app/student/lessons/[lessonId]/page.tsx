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
  IconUpload,
  IconDownload,
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
  const [, setFileName] = useState('');
  const [, setFileSize] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [alertNotice, setAlertNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [showLiveHtmlPreview, setShowLiveHtmlPreview] = useState<boolean>(true);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-6">Vui lòng đăng nhập tài khoản Học sinh để vào học.</p>
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

  if (!lesson || (!isStaffPreview && lesson.status !== 'published')) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Bài học chưa xuất bản</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Bài học này hiện chưa được mở hoặc đang ở trạng thái Bản nháp. Nội dung chưa được công bố cho học sinh.
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
  const handleSubmitPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertNotice(null);

    let submitContent = '';
    let finalFileSize: number | undefined = undefined;

    if (submissionType === 'file') {
      if (!selectedFile) {
        setAlertNotice({ text: 'Vui lòng chọn một tệp bài làm thực tế từ thiết bị của bạn (tối đa 2 MB).', isError: true });
        return;
      }
      if (selectedFile.size > 2 * 1024 * 1024) {
        setAlertNotice({ text: 'Kích thước tệp vượt quá giới hạn 2 MB.', isError: true });
        return;
      }

      setIsSubmitting(true);
      try {
        const form = new FormData();
        form.append('file', selectedFile);
        form.append('lessonId', lesson.id);

        const uploadRes = await fetch('/api/m3/file', {
          method: 'POST',
          body: form,
        });
        const uploadJson = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok || !uploadJson?.success || !uploadJson?.filePath) {
          setIsSubmitting(false);
          setAlertNotice({ text: uploadJson?.message || 'Không thể tải tệp lên máy chủ.', isError: true });
          return;
        }

        submitContent = uploadJson.filePath;
        finalFileSize = typeof uploadJson.fileSize === 'number' ? uploadJson.fileSize : selectedFile.size;
      } catch {
        setIsSubmitting(false);
        setAlertNotice({ text: 'Lỗi kết nối khi tải tệp lên máy chủ.', isError: true });
        return;
      }
    } else {
      submitContent = content.trim();
      if (!submitContent) {
        setAlertNotice({ text: 'Vui lòng nhập đường dẫn liên kết bài làm.', isError: true });
        return;
      }
      setIsSubmitting(true);
    }

    setTimeout(async () => {
      const res = await submitPractice(currentUser.id, lesson.id, {
        type: submissionType,
        content: submitContent,
        notes,
        fileSizeBytes: finalFileSize,
      });

      setIsSubmitting(false);
      setAlertNotice({ text: res.message, isError: !res.success });
      if (res.success) {
        setContent('');
        setFileName('');
        setFileSize(0);
        setSelectedFile(null);
        setNotes('');
      }
    }, qaState.delayMs || 300);
  };

  // Parse materials into structured blocks (text sections and fenced code blocks)
  const parseMaterialBlocks = (raw: string) => {
    if (!raw) return [];
    const blocks: Array<{ type: 'text' | 'code'; lang?: string; content: string }> = [];
    const regex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
      }
      blocks.push({
        type: 'code',
        lang: (match[1] || 'html').toLowerCase(),
        content: match[2].trim(),
      });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < raw.length) {
      blocks.push({ type: 'text', content: raw.slice(lastIndex) });
    }
    return blocks;
  };

  // Render inline formatting: **bold**, `code`, and [link](url)
  const renderInlineTokens = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-50 text-[#1d63ed] border border-blue-200/70 font-mono text-[11px] font-semibold"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-[#1d63ed] hover:text-[#154ec2] font-bold underline"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const materialBlocks = parseMaterialBlocks(lesson.materials || '');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Staff Preview Banner */}
      {isStaffPreview && (
        <div className="p-4 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold uppercase tracking-wider text-[10px]">
              Chế độ Xem trước
            </span>
            <span className="font-semibold">
              Bạn đang xem giao diện bài học với tư cách {currentUser.role === 'admin' ? 'Quản trị viên (Admin)' : 'Giáo viên'}.
            </span>
            {lesson.status === 'draft' && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[11px]">
                Đang ở trạng thái Bản nháp
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin/courses"
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-colors"
            >
              ← Danh sách khóa
            </Link>
            {currentUser.role === 'admin' && (
              <Link
                href={`/admin/lessons/${lesson.id}/edit`}
                className="px-3.5 py-1.5 rounded-xl bg-[#1d63ed] hover:bg-[#154ec2] text-white text-xs font-bold transition-colors"
              >
                Chỉnh sửa bài này
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Navigation Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <Link
            href={isStaffPreview ? '/admin/courses' : '/student/course'}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
            title={isStaffPreview ? 'Quay lại Quản lý khóa học' : 'Quay lại Danh sách 14 buổi'}
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                Buổi {lesson.sessionNumber} / 14
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{lesson.title}</h1>
          </div>
        </div>

        {/* Overall Status Badge */}
        <div className="self-start sm:self-auto shrink-0">
          {sessionCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <IconCheckCircle className="w-4 h-4" />
              <span>Đã hoàn thành buổi học</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <IconClock className="w-4 h-4" />
              <span>Chưa hoàn tất các yêu cầu</span>
            </span>
          )}
        </div>
      </div>

      {/* Alert Notice */}
      {alertNotice && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            alertNotice.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {alertNotice.isError ? (
            <IconAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1 leading-relaxed">{alertNotice.text}</span>
          <button onClick={() => setAlertNotice(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Video & Structured Curriculum Section */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1d63ed] flex items-center justify-center">
              <IconBookOpen className="w-4 h-4" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900">1. Nội dung bài giảng &amp; Giáo trình chi tiết</h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Đọc kỹ kiến thức trọng tâm trước khi làm Quiz và Thực hành
          </span>
        </div>

        {/* Summary Description Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 border border-blue-100 text-xs text-slate-700 leading-relaxed">
          <span className="font-extrabold text-[#1d63ed] block mb-1 uppercase tracking-wider text-[11px]">
            Tóm tắt trọng tâm buổi học
          </span>
          {lesson.description}
        </div>

        {lesson.videoUrl && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Video minh họa bài học:</span>
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm">
              <iframe
                src={lesson.videoUrl}
                title={lesson.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Rich Curriculum Renderer */}
        <div className="space-y-4">
          {materialBlocks.map((block, bIdx) => {
            if (block.type === 'code') {
              const isHtmlCode = block.lang === 'html' || block.content.includes('<!DOCTYPE html>');
              return (
                <div key={bIdx} className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-md my-4">
                  <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                      <span className="ml-2 font-mono font-bold text-slate-200 text-[11px]">
                        {isHtmlCode ? 'index.html (HTML5 Chuẩn)' : `Mã nguồn (${block.lang?.toUpperCase()})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHtmlCode && (
                        <button
                          type="button"
                          onClick={() => setShowLiveHtmlPreview((prev) => !prev)}
                          className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          {showLiveHtmlPreview ? 'Ẩn kết quả chạy thử' : 'Xem kết quả trang web'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(block.content);
                            setCopiedCodeIdx(bIdx);
                            setTimeout(() => setCopiedCodeIdx(null), 2000);
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold text-[11px] transition-colors cursor-pointer"
                      >
                        {copiedCodeIdx === bIdx ? '✓ Đã sao chép' : 'Sao chép code'}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 sm:p-5 text-xs font-mono text-slate-100 overflow-x-auto leading-relaxed">
                    <code>{block.content}</code>
                  </pre>

                  {isHtmlCode && showLiveHtmlPreview && (
                    <div className="bg-slate-100 border-t border-slate-300 p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                        <div className="flex items-center gap-2 font-semibold text-slate-800">
                          <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                            Kết quả hiển thị trên Trình duyệt
                          </span>
                          <span className="font-mono text-slate-500">
                            🔒 https://hocsinh.mindx.edu.vn/gioi-thieu-ban-than/index.html
                          </span>
                        </div>
                        <span className="text-slate-400">Chế độ xem trước an toàn (Sandbox)</span>
                      </div>
                      <iframe
                        title={`Xem trước HTML ${bIdx + 1}`}
                        sandbox=""
                        srcDoc={block.content}
                        className="w-full h-72 rounded-xl bg-white border border-slate-300 shadow-inner"
                      />
                    </div>
                  )}
                </div>
              );
            }

            // Text block: split by lines and render headings, callouts, lists, and paragraphs cleanly
            const lines = block.content.split(/\r?\n/);
            return (
              <div key={bIdx} className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                {lines.map((rawLine, lIdx) => {
                  const line = rawLine.trim();
                  if (!line) return <div key={lIdx} className="h-1" />;

                  if (line === '---') {
                    return <hr key={lIdx} className="border-slate-100 my-4" />;
                  }

                  if (line.startsWith('## ')) {
                    return (
                      <div
                        key={lIdx}
                        className="pt-4 pb-2 border-b border-slate-100 flex items-center gap-2.5 text-sm font-black text-slate-900"
                      >
                        <span className="w-1.5 h-4 rounded-full bg-[#1d63ed] inline-block shrink-0" />
                        <span>{renderInlineTokens(line.slice(3))}</span>
                      </div>
                    );
                  }

                  if (line.startsWith('### ')) {
                    return (
                      <h3 key={lIdx} className="pt-2 font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="text-[#1d63ed]">▸</span>
                        <span>{renderInlineTokens(line.slice(4))}</span>
                      </h3>
                    );
                  }

                  if (line.startsWith('> ')) {
                    return (
                      <div
                        key={lIdx}
                        className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-950 text-xs leading-relaxed"
                      >
                        {renderInlineTokens(line.slice(2))}
                      </div>
                    );
                  }

                  if (line.startsWith('- ') || line.startsWith('* ')) {
                    return (
                      <div key={lIdx} className="flex items-start gap-2.5 pl-2">
                        <span className="text-[#1d63ed] font-bold mt-0.5">•</span>
                        <div className="flex-1">{renderInlineTokens(line.slice(2))}</div>
                      </div>
                    );
                  }

                  const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
                  if (numMatch) {
                    return (
                      <div key={lIdx} className="flex items-start gap-2.5 pl-2">
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[#1d63ed] border border-blue-100 font-mono font-bold text-[11px] shrink-0 mt-0.5">
                          {numMatch[1]}
                        </span>
                        <div className="flex-1">{renderInlineTokens(numMatch[2])}</div>
                      </div>
                    );
                  }

                  return <p key={lIdx}>{renderInlineTokens(line)}</p>;
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quiz Section (if hasQuiz) */}
      {lesson.hasQuiz && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold text-base text-slate-900">2. Trắc nghiệm Quiz (Yêu cầu đạt từ 70%)</span>
              {quizPassed ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Đã đạt
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Chưa đạt
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Điểm cao nhất hiện tại:{' '}
              <strong className={quizPassed ? 'text-emerald-700 font-extrabold' : 'text-slate-800 font-extrabold'}>
                {currentQuiz ? `${currentQuiz.highestScore}%` : 'Chưa làm'}
              </strong>{' '}
              {currentQuiz && `(Đã làm ${currentQuiz.attemptsCount} lần)`}
            </p>
          </div>

          <Link
            href={`/student/lessons/${lesson.id}/quiz`}
            className="px-5 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 self-start sm:self-auto shrink-0"
          >
            <span>{currentQuiz ? 'Làm lại Quiz' : 'Bắt đầu làm Quiz'}</span>
            <IconExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Practice Submission Section (if hasPractice) */}
      {lesson.hasPractice && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">
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
            <div className="self-start sm:self-auto">
              {currentSub ? (
                currentSub.status === 'approved' ? (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                    <IconCheckCircle className="w-3.5 h-3.5" />
                    <span>Bài thực hành: ĐẠT</span>
                  </span>
                ) : currentSub.status === 'needs_revision' ? (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                    <IconAlertCircle className="w-3.5 h-3.5" />
                    <span>Cần làm lại theo góp ý</span>
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                    <IconClock className="w-3.5 h-3.5" />
                    <span>Đang chờ giáo viên chấm</span>
                  </span>
                )
              ) : (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Chưa nộp bài
                </span>
              )}
            </div>
          </div>

          {/* Current Submission Display & Teacher Feedback */}
          {currentSub && (
            <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Bài đã nộp lần gần nhất:</span>
                <span className="text-slate-400 font-mono">
                  {new Date(currentSub.submittedAt).toLocaleString('vi-VN')}
                </span>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
                <span className="font-mono text-slate-800 font-semibold truncate">
                  {currentSub.content}
                </span>
                {currentSub.type === 'link' ? (
                  <a
                    href={currentSub.content}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#1d63ed] hover:underline font-bold shrink-0 flex items-center gap-1"
                  >
                    <span>Mở link</span>
                    <IconExternalLink className="w-3 h-3" />
                  </a>
                ) : currentSub.type === 'text' ? (
                  <span className="text-slate-500 font-semibold shrink-0">
                    Bài nộp văn bản
                  </span>
                ) : (
                  <a
                    href={`/api/m3/file?path=${encodeURIComponent(currentSub.content)}`}
                    download
                    className="text-[#1d63ed] hover:underline font-bold shrink-0 flex items-center gap-1"
                  >
                    <span>Tải tệp</span>
                    <IconDownload className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {currentSub.teacherFeedback && (
                <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-950 space-y-1">
                  <span className="font-bold block text-[#1d63ed]">Nhận xét của Giáo viên:</span>
                  <p className="italic leading-relaxed">&ldquo;{currentSub.teacherFeedback}&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {/* Practice Submission Form or Locked Warning */}
          {currentSub && currentSub.status === 'approved' && !currentSub.canResubmit ? (
            /* BLOCKED from resubmitting approved task */
            <div className="p-5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-2">
                <IconLock className="w-4 h-4 text-amber-700" />
                <span>BÀI LÀM ĐÃ ĐƯỢC DUYỆT ĐẠT — KHÓA QUYỀN NỘP LẠI</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Bài thực hành của bạn đã được giáo viên đánh giá Đạt. Để bảo vệ dữ liệu kết quả, hệ thống không
                cho phép tự ý nộp đè bài mới. Nếu có nhu cầu bổ sung hoặc làm lại, bạn vui lòng nhờ Giáo viên
                phụ trách bấm <strong>&ldquo;Mở lại quyền nộp bài&rdquo;</strong> trên trang chấm bài của giáo viên.
              </p>
            </div>
          ) : (
            /* Allowed to submit or resubmit */
            <form onSubmit={handleSubmitPractice} className="space-y-4 text-xs">
              <span className="font-bold text-slate-800 block text-sm">
                {currentSub ? 'Gửi bài nộp thay thế:' : 'Điền thông tin nộp bài:'}
              </span>

              {/* Toggle Mode: Link vs File (if allowed) */}
              {lesson.practiceMode === 'file_allowed' ? (
                <div className="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200/80 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSubmissionType('link')}
                    className={`py-2 px-4 rounded-xl transition-all cursor-pointer ${
                      submissionType === 'link'
                        ? 'bg-[#1d63ed] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Nộp đường link
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionType('file')}
                    className={`py-2 px-4 rounded-xl transition-all cursor-pointer ${
                      submissionType === 'file'
                        ? 'bg-[#1d63ed] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tải tệp (&lt;= 2MB)
                  </button>
                </div>
              ) : null}

              {/* Link Input */}
              {submissionType === 'link' ? (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Đường dẫn bài làm (GitHub, Scratch, Drive, CodePen...):
                  </label>
                  <input
                    type="url"
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl font-mono focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                </div>
              ) : (
                /* Real File Input (Max 2MB) */
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">
                    Chọn tệp bài làm (ZIP, PDF, PNG, JPG/JPEG, WEBP, TXT, PY, JS, HTML, CSS, JSON, MD, SB3 | Tối đa 2MB):
                  </label>

                  <div className="p-6 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-2xl text-center bg-[#f8fafc] space-y-3 transition-colors">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1d63ed] flex items-center justify-center mx-auto">
                      <IconUpload className="w-6 h-6" />
                    </div>
                    <div>
                      <input
                        type="file"
                        accept=".zip,.pdf,.png,.jpg,.jpeg,.webp,.txt,.py,.js,.html,.css,.json,.md,.sb3"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                            setFileName(file.name);
                            setFileSize(file.size);
                          } else {
                            setSelectedFile(null);
                            setFileName('');
                            setFileSize(0);
                          }
                        }}
                        className="block w-full max-w-sm mx-auto text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-[#1d63ed] hover:file:bg-blue-100 cursor-pointer"
                      />
                    </div>
                    <span className="text-slate-500 block text-xs">
                      {selectedFile
                        ? `Đã chọn: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
                        : 'Vui lòng chọn tệp từ máy tính để tải lên máy chủ bảo mật.'}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Ghi chú gửi thầy cô (Tùy chọn):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ví dụ: Em đã sửa lại hàm quay động cơ theo nhận xét lần trước."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
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
