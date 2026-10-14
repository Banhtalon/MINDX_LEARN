'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  IconUsers,
  IconBookOpen,
  IconFileText,
  IconCheckCircle,
  IconAlertCircle,
  IconArrowLeft,
  IconShield,
  IconExternalLink,
  IconClock,
} from '@/components/icons';

export default function ManageDashboardPage() {
  const router = useRouter();
  const { currentUser, classes, courses, submissions, students } = useStore();

  if (!currentUser || currentUser.role === 'student') {
    return (
      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white rounded-xl border border-slate-200">
        <IconAlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-2">Quyền truy cập hạn chế</h2>
        <p className="text-xs text-slate-500 mb-4">
          Trang quản trị và giảng dạy [UI-03] chỉ dành cho tài khoản Admin hoặc Giáo viên.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          Đăng nhập vai trò Cán bộ
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
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {isAdmin ? 'Khu vực Admin Quản Trị' : 'Khu vực Giáo Viên Giảng Dạy'}
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-03]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">
            Xin chào, {currentUser.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isAdmin
              ? 'Tổng quan toàn bộ hệ thống lớp học, khóa học 14 buổi và dữ liệu học sinh.'
              : 'Theo dõi tiến độ các lớp được giao phụ trách và hàng đợi bài tập thực hành cần chấm.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/manage/classes"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <IconUsers className="w-4 h-4" />
            <span>Quản lý lớp & Học sinh</span>
          </Link>
          <Link
            href="/teacher/submissions"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <IconFileText className="w-4 h-4" />
            <span>Hàng đợi chấm bài ({pendingSubmissions.length})</span>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lớp phụ trách
            </span>
            <IconBookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{assignedClasses.length}</div>
          <span className="text-[11px] text-slate-400">
            {isAdmin ? 'Toàn bộ lớp trong hệ thống' : 'Lớp được Ban quản trị phân công'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Việc cần chấm
            </span>
            <IconClock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{pendingSubmissions.length}</div>
          <span className="text-[11px] text-slate-400">Bài thực hành học sinh đang chờ chấm</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Tổng số học sinh
            </span>
            <IconUsers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{relevantStudentIds.size}</div>
          <span className="text-[11px] text-slate-400">Thuộc phạm vi lớp được giao</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Khóa học chuẩn
            </span>
            <IconShield className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{courses.length}</div>
          <span className="text-[11px] text-slate-400">Khóa học cố định 14 buổi</span>
        </div>
      </div>

      {/* Empty State Warning if Teacher has no assigned classes */}
      {assignedClasses.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <IconAlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">Chưa được phân công lớp học nào</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
            Tài khoản giáo viên của bạn hiện chưa được Admin gắn vào lớp học nào. Vui lòng liên hệ Admin
            để được phân công lớp phụ trách.
          </p>
          {isAdmin && (
            <Link
              href="/admin/teachers"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              Phân công lớp cho giáo viên
            </Link>
          )}
        </div>
      ) : (
        /* Assigned Classes Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Danh sách lớp được phân công</h2>
              <p className="text-xs text-slate-500">
                Bấm vào lớp để xem chi tiết học viên, tiến độ và cấp phát mã PIN
              </p>
            </div>
            <Link
              href="/manage/classes"
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>Xem chi tiết tại [UI-04]</span>
              <IconExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Mã lớp</th>
                  <th className="px-4 py-3">Tên lớp học</th>
                  <th className="px-4 py-3">Khóa học liên kết</th>
                  <th className="px-4 py-3">Số học sinh</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignedClasses.map((cls) => {
                  const course = courses.find((c) => c.id === cls.courseId);
                  const studentCount = students.filter((s) => s.currentClassId === cls.id).length;

                  return (
                    <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">{cls.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{cls.name}</td>
                      <td className="px-4 py-3">
                        {course ? (
                          <span className="text-slate-700">{course.title}</span>
                        ) : (
                          <span className="text-amber-600 font-medium italic">Chưa gán khóa</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{studentCount} học sinh</td>
                      <td className="px-4 py-3">
                        {cls.status === 'active' ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Đang hoạt động
                          </span>
                        ) : cls.status === 'completed' ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Đã kết thúc khóa
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Đã lưu trữ
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/manage/classes?classId=${cls.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-bold hover:bg-blue-100"
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
