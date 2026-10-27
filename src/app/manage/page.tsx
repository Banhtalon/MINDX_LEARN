'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconUsers,
  IconBookOpen,
  IconFileText,
  IconAlertCircle,
  IconShield,
  IconExternalLink,
  IconClock,
} from '@/components/icons';

export default function ManageDashboardPage() {
  const router = useRouter();
  const { currentUser, classes, courses, submissions, students } = useStore();

  if (!currentUser || currentUser.role === 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-[0_20px_50px_rgba(8,112,184,0.07)]">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
          <IconAlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Trang quản trị và giảng dạy chỉ dành cho tài khoản Admin hoặc Giáo viên.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="min-h-[44px] px-5 py-2.5 bg-[#0f172a] text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md transition-all cursor-pointer"
        >
          Đăng nhập vai trò Giáo viên / Admin
        </button>
      </div>
    );
  }

  const isAdmin = currentUser.role === 'admin';

  // Filter classes according to role:
  // Admin sees all classes; Teacher only sees assigned classes
  const assignedClasses = isAdmin
    ? classes
    : classes.filter((c) => currentUser.assignedClassIds?.includes(c.id));

  // Count pending grading submissions for relevant classes
  const relevantClassIds = new Set(assignedClasses.map((c) => c.id));
  const relevantStudentIds = new Set(
    students
      .filter((s) => relevantClassIds.has(s.currentClassId))
      .map((s) => s.id)
  );

  const pendingSubmissions = submissions.filter(
    (s) => relevantStudentIds.has(s.studentId) && s.status === 'submitted'
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
        <div className="space-y-2 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
            <span>{isAdmin ? 'Khu vực Admin Quản Trị' : 'Khu vực Giáo Viên Giảng Dạy'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Xin chào, {currentUser.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAdmin
              ? 'Tổng quan toàn bộ hệ thống lớp học, khóa học 14 buổi và dữ liệu học sinh.'
              : 'Theo dõi tiến độ các lớp được giao phụ trách và hàng đợi bài tập thực hành cần chấm.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 relative shrink-0">
          <Link
            href="/manage/classes"
            className="min-h-[44px] px-5 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-2"
          >
            <IconUsers className="w-4 h-4" />
            <span>Quản lý lớp &amp; Học sinh</span>
          </Link>
          <Link
            href="/teacher/submissions"
            className="min-h-[44px] px-5 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md shadow-slate-900/15 transition-all flex items-center gap-2"
          >
            <IconFileText className="w-4 h-4" />
            <span>Hàng đợi chấm bài ({pendingSubmissions.length})</span>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lớp phụ trách
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1d63ed] flex items-center justify-center">
              <IconBookOpen className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{assignedClasses.length}</div>
            <span className="text-[11px] text-slate-400 font-medium block mt-1">
              {isAdmin ? 'Toàn bộ lớp trong hệ thống' : 'Lớp được Ban quản trị phân công'}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Việc cần chấm
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <IconClock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-amber-600 tracking-tight">{pendingSubmissions.length}</div>
            <span className="text-[11px] text-slate-400 font-medium block mt-1">
              Bài thực hành học sinh đang chờ chấm
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tổng số học sinh
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IconUsers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{relevantStudentIds.size}</div>
            <span className="text-[11px] text-slate-400 font-medium block mt-1">
              Thuộc phạm vi lớp được giao
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.05)] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Khóa học chuẩn
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <IconShield className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{courses.length}</div>
            <span className="text-[11px] text-slate-400 font-medium block mt-1">
              Khóa học cố định 14 buổi
            </span>
          </div>
        </div>
      </div>

      {/* Empty State Warning if Teacher has no assigned classes */}
      {assignedClasses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-[0_14px_40px_rgba(8,112,184,0.05)]">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <IconAlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">Chưa được phân công lớp học nào</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-5 leading-relaxed">
            Tài khoản giáo viên của bạn hiện chưa được Admin gắn vào lớp học nào. Vui lòng liên hệ Admin
            để được phân công lớp phụ trách.
          </p>
          {isAdmin && (
            <Link
              href="/admin/teachers"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1d63ed] text-white text-xs font-bold hover:bg-[#154ec2] shadow-md shadow-blue-600/20 transition-all"
            >
              Phân công lớp cho giáo viên
            </Link>
          )}
        </div>
      ) : (
        /* Assigned Classes Table */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_14px_40px_rgba(8,112,184,0.06)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Danh sách lớp được phân công</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bấm vào lớp để xem chi tiết học viên, tiến độ và cấp phát mã PIN
              </p>
            </div>
            <Link
              href="/manage/classes"
              className="text-xs font-bold text-[#1d63ed] hover:text-[#154ec2] flex items-center gap-1 self-start sm:self-auto"
            >
              <span>Quản lý chi tiết lớp học</span>
              <IconExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafc] text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-3.5">Mã lớp</th>
                  <th className="px-6 py-3.5">Tên lớp học</th>
                  <th className="px-6 py-3.5">Khóa học liên kết</th>
                  <th className="px-6 py-3.5">Số học sinh</th>
                  <th className="px-6 py-3.5">Trạng thái</th>
                  <th className="px-6 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignedClasses.map((cls) => {
                  const course = courses.find((c) => c.id === cls.courseId);
                  const studentCount = students.filter((s) => s.currentClassId === cls.id).length;

                  return (
                    <tr key={cls.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-block font-mono font-bold text-[#1d63ed] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 whitespace-nowrap">
                          {cls.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{cls.name}</td>
                      <td className="px-6 py-4">
                        {course ? (
                          <span className="text-slate-700 font-medium">{course.title}</span>
                        ) : (
                          <span className="text-amber-600 font-semibold italic">Chưa gán khóa</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap">{studentCount} học sinh</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {cls.status === 'active' ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                            Đang hoạt động
                          </span>
                        ) : cls.status === 'completed' ? (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-[#1d63ed] border border-blue-200 whitespace-nowrap">
                            Đã kết thúc khóa
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                            Đã lưu trữ
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Link
                          href={`/manage/classes?classId=${cls.id}`}
                          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-blue-50 text-[#1d63ed] font-bold hover:bg-[#1d63ed] hover:text-white transition-all whitespace-nowrap"
                        >
                          <span>Mở lớp</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
