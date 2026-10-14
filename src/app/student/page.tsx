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
  IconArrowLeft,
  IconExternalLink,
  IconLock,
  IconUser,
} from '@/components/icons';

export default function StudentDashboardPage() {
  const router = useRouter();
  const { currentUser, classes, courses, lessons, students, getStudentProgress } = useStore();

  if (!currentUser || currentUser.role !== 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Trang dành cho Học sinh</h2>
        <p className="text-xs text-slate-500 mb-4">
          Bạn đang đăng nhập với vai trò {currentUser?.role || 'khách'}. Vui lòng chuyển sang vai trò Học sinh
          để xem giao diện [UI-10].
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
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
      <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <IconLock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-extrabold text-slate-900 mb-2">Tài khoản học sinh tạm thời bị khóa</h2>
        <p className="text-xs text-slate-600 mb-6 leading-relaxed">
          Hồ sơ của bạn hiện đang ở trạng thái Lưu trữ. Bạn không thể nộp bài hoặc làm trắc nghiệm lúc này.
          Vui lòng liên hệ với Giáo viên phụ trách hoặc Ban Quản Trị cơ sở để được kiểm tra và kích hoạt lại.
        </p>
        <Link
          href="/account"
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50"
        >
          Xem thông tin tài khoản [UI-02]
        </Link>
      </div>
    );
  }

  // Check class course assignment
  if (!studentCourse) {
    return (
      <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border border-amber-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <IconAlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-extrabold text-slate-900 mb-2">Lớp chưa được gán khóa học</h2>
        <p className="text-xs text-slate-600 mb-6 leading-relaxed">
          Lớp của bạn ({studentClass ? studentClass.code : 'Chưa xếp lớp'}) hiện chưa được phân công chương
          trình học 14 buổi. Vui lòng liên hệ Giáo viên phụ trách hoặc Admin để cập nhật khóa học.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Góc học sinh
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-10]</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">
            Chào mừng bạn, {currentUser.name}!
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            Mã học sinh: {currentUser.studentCode} | Lớp: {studentClass?.code} ({studentClass?.name})
          </p>
        </div>

        {/* Fixed 14-Session Progress Widget */}
        <div className="bg-blue-50/80 border border-blue-200 p-4 rounded-xl min-w-[260px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tiến độ học tập:
            </span>
            <span className="text-sm font-black text-blue-700">{progress.percentage}%</span>
          </div>

          <div className="w-full bg-blue-200 rounded-full h-2.5 mb-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          <div className="text-center font-bold text-xs text-blue-900">
            Đã hoàn thành {progress.completedSessionsCount}/14 buổi
          </div>
          <div className="text-[10px] text-blue-600 text-center mt-0.5">
            (Chỉ khi đạt đủ 14/14 buổi mới tính 100%)
          </div>
        </div>
      </div>

      {/* Current Course Information */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block mb-1">
              Khóa học hiện tại của lớp
            </span>
            <h2 className="text-base font-extrabold text-slate-900">{studentCourse.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{studentCourse.description}</p>
          </div>
          <Link
            href="/student/course"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 self-start sm:self-auto"
          >
            <IconBookOpen className="w-4 h-4" />
            <span>Xem toàn bộ bài học [UI-11]</span>
          </Link>
        </div>

        {/* Recent Published Lessons List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Các bài học đã mở gần đây</span>
            <span className="text-slate-400 font-normal">Học sinh được mở làm mọi bài đã xuất bản</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {publishedLessons.slice(0, 5).map((les) => {
              const summary = progress.sessions.find((s) => s.sessionNumber === les.sessionNumber);

              return (
                <div
                  key={les.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        Buổi {les.sessionNumber}
                      </span>
                      <span className="font-bold text-slate-900">{les.title}</span>
                    </div>
                    <div className="text-slate-500 text-[11px] flex flex-wrap items-center gap-3">
                      {les.hasQuiz && (
                        <span>
                          Quiz:{' '}
                          <strong
                            className={summary?.quizPassed ? 'text-emerald-700' : 'text-slate-600'}
                          >
                            {summary?.quizScore !== null ? `${summary?.quizScore}%` : 'Chưa làm'}
                          </strong>
                        </span>
                      )}
                      {les.hasPractice && (
                        <span>
                          Thực hành:{' '}
                          <strong
                            className={
                              summary?.practiceStatus === 'approved'
                                ? 'text-emerald-700'
                                : summary?.practiceStatus === 'needs_revision'
                                ? 'text-rose-700'
                                : 'text-slate-600'
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

                  <div className="flex items-center gap-2">
                    {summary?.isCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <IconCheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <IconClock className="w-3.5 h-3.5" />
                        <span>Chưa hoàn tất</span>
                      </span>
                    )}

                    <Link
                      href={`/student/lessons/${les.id}`}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition-colors"
                    >
                      Vào học
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
