'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconArrowLeft,
  IconBookOpen,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconExternalLink,
} from '@/components/icons';

export default function StudentCoursePage() {
  const router = useRouter();
  const { currentUser, classes, courses, lessons, students, getStudentProgress } = useStore();

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-6">Vui lòng đăng nhập với vai trò Học sinh để xem lộ trình buổi học.</p>
        <button
          onClick={() => router.push('/login')}
          className="px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          Đi tới Đăng nhập Học sinh
        </button>
      </div>
    );
  }

  const studentProfile = students.find((s) => s.id === currentUser.id || s.studentCode === currentUser.studentCode);
  const studentClass = classes.find((c) => c.id === studentProfile?.currentClassId);
  const studentCourse = courses.find((c) => c.id === studentClass?.courseId);

  if (!studentCourse) {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Chưa gán khóa học</h2>
        <p className="text-xs text-slate-500 mb-6">Lớp của bạn hiện chưa được liên kết khóa học nào.</p>
        <Link
          href="/student"
          className="inline-block px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all"
        >
          Quay lại góc học tập
        </Link>
      </div>
    );
  }

  const progress = getStudentProgress(currentUser.id, studentCourse.id);

  // Only published sessions are visible to students (UI-11)
  const publishedSessions = lessons
    .filter((l) => l.courseId === studentCourse.id && l.status === 'published')
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <Link
            href="/student"
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
            title="Quay lại Góc học tập"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1d63ed] border border-blue-100 mb-1">
              <span>Lộ trình 14 buổi học</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Danh sách Buổi học đã xuất bản — {studentCourse.title}
            </h1>
          </div>
        </div>

        {/* Progress Badge: Fixed 14 Sessions Denominator */}
        <div className="bg-blue-50/80 border border-blue-200/80 px-4 py-2.5 rounded-2xl text-xs font-bold text-blue-950 flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span className="text-slate-600">Tiến độ:</span>
          <span className="text-[#1d63ed] font-black text-sm">
            {progress.completedSessionsCount}/14 buổi ({progress.percentage}%)
          </span>
        </div>
      </div>

      <div className="p-4 bg-blue-50/60 text-slate-700 text-xs rounded-2xl border border-blue-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-white text-[#1d63ed] border border-blue-100 flex items-center justify-center shrink-0 shadow-xs">
          <IconBookOpen className="w-4 h-4" />
        </div>
        <span className="leading-relaxed">
          <strong className="text-slate-900">Quy tắc học tập:</strong> Học sinh được phép mở học bất kỳ bài học nào đã xuất bản mà
          không bắt buộc phải hoàn thành bài trước đó. Các bài ở trạng thái Bản nháp sẽ được mở dần theo tiến độ lớp.
        </span>
      </div>

      {/* Published Sessions Grid */}
      {publishedSessions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center text-slate-500 text-xs shadow-[0_14px_40px_rgba(8,112,184,0.06)]">
          <IconBookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Hiện chưa có bài học nào được xuất bản cho khóa học này.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {publishedSessions.map((les) => {
            const summary = progress.sessions.find((s) => s.sessionNumber === les.sessionNumber);

            return (
              <div
                key={les.id}
                className="rounded-3xl border border-slate-100 p-6 transition-all flex flex-col justify-between bg-white shadow-[0_14px_40px_rgba(8,112,184,0.05)] hover:shadow-[0_20px_50px_rgba(29,99,237,0.1)] hover:border-blue-200 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono font-bold text-xs px-3 py-1 rounded-xl bg-blue-50 text-[#1d63ed] border border-blue-100">
                      Buổi {les.sessionNumber}
                    </span>

                    {summary?.isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <IconCheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>Đang học</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-base mb-1.5 group-hover:text-[#1d63ed] transition-colors">
                    {les.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-5 leading-relaxed">
                    {les.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {les.hasQuiz && (
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          summary?.quizPassed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                        }`}
                      >
                        Quiz: {summary?.quizScore !== null ? `${summary?.quizScore}%` : 'Chưa làm'}
                      </span>
                    )}
                    {les.hasPractice && (
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          summary?.practiceStatus === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : summary?.practiceStatus === 'needs_revision'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200/80'
                        }`}
                      >
                        Thực hành:{' '}
                        {summary?.practiceStatus === 'approved'
                          ? 'Đạt'
                          : summary?.practiceStatus === 'needs_revision'
                          ? 'Làm lại'
                          : summary?.practiceStatus === 'submitted'
                          ? 'Chờ chấm'
                          : 'Chưa nộp'}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/student/lessons/${les.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1d63ed] hover:bg-[#154ec2] text-white font-bold text-xs shadow-sm shadow-blue-600/20 transition-all shrink-0"
                  >
                    <span>Vào học</span>
                    <IconExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
