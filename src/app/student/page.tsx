'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconBookOpen,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconExternalLink,
  IconLock,
} from '@/components/icons';

export default function StudentDashboardPage() {
  const router = useRouter();
  const { currentUser, classes, courses, lessons, students, getStudentProgress } = useStore();

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Bạn đang đăng nhập với vai trò {currentUser?.role || 'khách'}. Vui lòng chuyển sang tài khoản Học sinh để vào góc học tập.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          Đi tới Đăng nhập Học sinh
        </button>
      </div>
    );
  }

  // Find student profile and class
  const studentProfile = students.find((s) => s.id === currentUser.id || s.studentCode === currentUser.studentCode);
  const studentClass = classes.find((c) => c.id === studentProfile?.currentClassId);
  const studentCourse = courses.find((c) => c.id === studentClass?.courseId);

  // Check account status
  if (studentProfile?.status === 'archived') {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white rounded-3xl border border-rose-100 p-8 text-center shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
          <IconLock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Tài khoản học sinh tạm thời bị khóa</h2>
        <p className="text-xs text-slate-600 mb-6 leading-relaxed">
          Hồ sơ của bạn hiện đang ở trạng thái Lưu trữ. Bạn không thể nộp bài hoặc làm trắc nghiệm lúc này.
          Vui lòng liên hệ với Giáo viên phụ trách hoặc Ban Quản Trị cơ sở để được kiểm tra và kích hoạt lại.
        </p>
        <Link
          href="/account"
          className="inline-block px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
        >
          Xem thông tin tài khoản
        </Link>
      </div>
    );
  }

  // Check class course assignment
  if (!studentCourse) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white rounded-3xl border border-amber-100 p-8 text-center shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Lớp chưa được gán khóa học</h2>
        <p className="text-xs text-slate-600 mb-6 leading-relaxed">
          Lớp của bạn ({studentClass ? studentClass.code : 'Chưa xếp lớp'}) hiện chưa được phân công chương
          trình học 14 buổi. Vui lòng liên hệ Giáo viên phụ trách hoặc Admin để cập nhật khóa học.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-[#1d63ed] text-white rounded-xl text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all"
        >
          Quay lại Trang chủ
        </Link>
      </div>
    );
  }

  // Calculate progress: always X/14
  const progress = getStudentProgress(currentUser.id, studentCourse.id);
  const publishedLessons = lessons
    .filter((l) => l.courseId === studentCourse.id && l.status === 'published')
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  return (
    <div className="space-y-6">
      {/* Welcome Card & Progress */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
        <div className="space-y-2 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
            <span>Góc học tập Học sinh</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Chào mừng bạn, {currentUser.name}!
          </h1>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold">
              Mã HS: {currentUser.studentCode}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
              Lớp: <strong className="font-mono text-slate-900">{studentClass?.code}</strong> ({studentClass?.name})
            </span>
          </div>
        </div>

        {/* Fixed 14-Session Progress Widget */}
        <div className="bg-[#f8fafc] border border-slate-200/80 p-5 rounded-2xl min-w-[280px] shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Tiến độ toàn khóa
            </span>
            <span className="text-lg font-black text-[#1d63ed]">{progress.percentage}%</span>
          </div>

          <div className="w-full bg-slate-200/80 rounded-full h-3 mb-3 overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-[#1d63ed] to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(progress.percentage, 4)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">
              Hoàn thành {progress.completedSessionsCount}/14 buổi
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              Đủ 14/14 buổi = 100%
            </span>
          </div>
        </div>
      </div>

      {/* Current Course Information */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#1d63ed] block">
              Khóa học hiện tại của lớp
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              {studentCourse.title}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
              {studentCourse.description}
            </p>
          </div>
          <Link
            href="/student/course"
            className="px-5 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 self-start sm:self-auto shrink-0"
          >
            <IconBookOpen className="w-4 h-4" />
            <span>Xem toàn bộ 14 buổi học</span>
          </Link>
        </div>

        {/* Recent Published Lessons List */}
        <div className="rounded-2xl border border-slate-200/80 overflow-hidden bg-[#f8fafc]/50">
          <div className="bg-slate-50/90 px-5 py-3.5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <span className="font-bold text-slate-800">Các bài học đã mở gần đây</span>
            <span className="text-slate-500 font-medium text-[11px]">
              Học sinh được mở học bất kỳ bài nào đã xuất bản
            </span>
          </div>

          <div className="divide-y divide-slate-200/60 text-xs bg-white">
            {publishedLessons.slice(0, 5).map((les) => {
              const summary = progress.sessions.find((s) => s.sessionNumber === les.sessionNumber);

              return (
                <div
                  key={les.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-[#1d63ed] bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg text-[11px]">
                        Buổi {les.sessionNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{les.title}</span>
                    </div>
                    <div className="text-slate-500 text-[11px] flex flex-wrap items-center gap-3 pl-0.5">
                      {les.hasQuiz && (
                        <span className="inline-flex items-center gap-1">
                          <span>Quiz:</span>
                          <strong
                            className={summary?.quizPassed ? 'text-emerald-700' : 'text-slate-700'}
                          >
                            {summary?.quizScore !== null ? `${summary?.quizScore}%` : 'Chưa làm'}
                          </strong>
                        </span>
                      )}
                      {les.hasPractice && (
                        <span className="inline-flex items-center gap-1">
                          <span>Thực hành:</span>
                          <strong
                            className={
                              summary?.practiceStatus === 'approved'
                                ? 'text-emerald-700'
                                : summary?.practiceStatus === 'needs_revision'
                                ? 'text-rose-700'
                                : 'text-slate-700'
                            }
                          >
                            {summary?.practiceStatus === 'approved'
                              ? 'Đạt'
                              : summary?.practiceStatus === 'needs_revision'
                              ? 'Cần làm lại'
                              : summary?.practiceStatus === 'submitted'
                              ? 'Chờ chấm'
                              : 'Chưa nộp'}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                    {summary?.isCompleted ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <IconCheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>Chưa hoàn tất</span>
                      </span>
                    )}

                    <Link
                      href={`/student/lessons/${les.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 text-[#1d63ed] font-bold hover:bg-[#1d63ed] hover:text-white transition-all"
                    >
                      <span>Vào học</span>
                      <IconExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
