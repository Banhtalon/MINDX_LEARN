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
  IconLock,
  IconFileText,
  IconExternalLink,
} from '@/components/icons';

export default function StudentCoursePage() {
  const router = useRouter();
  const { currentUser, classes, courses, lessons, students, getStudentProgress } = useStore();

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-4">Vui lòng đăng nhập với vai trò Học sinh để xem [UI-11].</p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
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
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Chưa gán khóa học</h2>
        <p className="text-xs text-slate-500 mb-4">Lớp của bạn hiện chưa được liên kết khóa học nào.</p>
        <Link
          href="/student"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/student"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Quay lại Tổng quan [UI-10]"
          >
            <IconArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                Chương trình học
              </span>
              <span className="text-xs text-slate-400 font-mono">[UI-11]</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Danh sách Buổi học đã xuất bản — {studentCourse.title}
            </h1>
          </div>
        </div>

        {/* Progress Badge: Fixed 14 Sessions Denominator */}
        <div className="bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-900 flex items-center gap-2 self-start sm:self-auto">
          <span>Tiến độ:</span>
          <span className="text-blue-700 font-black">
            {progress.completedSessionsCount}/14 buổi ({progress.percentage}%)
          </span>
        </div>
      </div>

      <div className="p-3 bg-slate-100 text-slate-600 text-xs rounded-xl border border-slate-200 flex items-center gap-2">
        <IconBookOpen className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          <strong>Quy tắc học tập:</strong> Học sinh được phép mở học bất kỳ bài học nào đã xuất bản mà
          không bắt buộc phải hoàn thành bài trước đó. Các bài ở trạng thái Bản nháp sẽ được mở dần theo tiến độ lớp.
        </span>
      </div>

      {/* Published Sessions Grid */}
      {publishedSessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
          <IconBookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p>Hiện chưa có bài học nào được xuất bản cho khóa học này.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publishedSessions.map((les) => {
            const summary = progress.sessions.find((s) => s.sessionNumber === les.sessionNumber);

            return (
              <div
                key={les.id}
                className="rounded-xl border p-5 transition-all flex flex-col justify-between bg-white border-slate-200 shadow-sm hover:border-blue-400"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-800">
                      Buổi {les.sessionNumber}
                    </span>

                    {summary?.isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <IconCheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>Đang học</span>
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm mb-1.5">{les.title}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                    {les.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {les.hasQuiz && (
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          summary?.quizPassed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        Quiz: {summary?.quizScore !== null ? `${summary?.quizScore}%` : 'Chưa làm'}
                      </span>
                    )}
                    {les.hasPractice && (
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          summary?.practiceStatus === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : summary?.practiceStatus === 'needs_revision'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        TH:{' '}
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <span>Vào học [UI-12]</span>
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
