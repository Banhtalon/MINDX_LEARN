'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { StudentProfile, ClassItem } from '@/lib/types';
import {
  IconUsers,
  IconKey,
  IconDownload,
  IconAlertTriangle,
  IconCheckCircle,
  IconFileText,
  IconPlus,
  IconShield,
  IconSearch,
  IconX,
  IconRefreshCw,
  IconLock,
  IconAlertCircle,
  IconRotateCcw,
} from '@/components/icons';
import { Drawer, Modal, ConfirmDialog } from '@/components/modal';

function ClassesManagementContent() {
  const searchParams = useSearchParams();
  const urlClassId = searchParams.get('classId');

  const {
    currentUser,
    classes,
    courses,
    students,
    quizResults,
    submissions,
    createClass,
    updateClass,
    archiveClass,
    restoreClass,
    transferStudent,
    resetStudentProgress,
    archiveStudent,
    restoreStudent,
    issueInitialPinsForClass,
    reissuePinForSingleStudent,
    generateCourseClosePreview,
    exportCourseCloseCsv,
    verifyAndExecuteCourseClose,
    getStudentProgress,
  } = useStore();

  const isAdmin = currentUser?.role === 'admin';
  const isTeacher = currentUser?.role === 'teacher';

  // Visible classes derived by role:
  // Admin sees all classes; Teacher only sees assigned classes
  const visibleClasses = isAdmin
    ? classes
    : isTeacher
    ? classes.filter((c) => currentUser?.assignedClassIds?.includes(c.id))
    : [];

  // Selected Class
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    const isSelectedValid = visibleClasses.some((c) => c.id === selectedClassId);
    if (!isSelectedValid) {
      if (urlClassId && visibleClasses.some((c) => c.id === urlClassId)) {
        setSelectedClassId(urlClassId);
      } else if (visibleClasses.length > 0) {
        setSelectedClassId(visibleClasses[0].id);
      } else {
        setSelectedClassId('');
      }
    }
  }, [visibleClasses, urlClassId, selectedClassId]);

  const selectedClass = visibleClasses.find((c) => c.id === selectedClassId) || null;
  const selectedCourse = courses.find((c) => c.id === selectedClass?.courseId);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Notifications
  const [alertNotice, setAlertNotice] = useState<{ text: string; isError: boolean } | null>(null);

  // Drawer: Student Detail & Actions
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetTransferClassId, setTargetTransferClassId] = useState('');

  // Modals
  const [createClassModalOpen, setCreateClassModalOpen] = useState(false);
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassCourseId, setNewClassCourseId] = useState<string>('');

  // PIN CSV Download Modal
  const [pinCsvModalOpen, setPinCsvModalOpen] = useState(false);
  const [pinCsvData, setPinCsvData] = useState<{ title: string; content: string; count?: number } | null>(null);

  // Re-issue single PIN modal
  const [singlePinModalOpen, setSinglePinModalOpen] = useState(false);
  const [targetStudentForPin, setTargetStudentForPin] = useState<StudentProfile | null>(null);

  // Course Close Section State
  const [confirmed14Sessions, setConfirmed14Sessions] = useState(false);
  const [closeConfirmModalOpen, setCloseConfirmModalOpen] = useState(false);
  const [closeResultNotice, setCloseResultNotice] = useState<string | null>(null);

  // Students in selected class:
  // Active roster
  const classStudents = selectedClass ? students.filter((s) => s.currentClassId === selectedClass.id) : [];
  // All students ever in this batch (including transferred / archived)
  const batchStudents = selectedClass
    ? students.filter(
        (s) => s.originalClassId === selectedClass.id || s.currentClassId === selectedClass.id
      )
    : [];

  const filteredStudents = classStudents.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pending operation states
  const [isIssuingPins, setIsIssuingPins] = useState(false);
  const [isReissuingPin, setIsReissuingPin] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isArchivingStudent, setIsArchivingStudent] = useState(false);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [createClassError, setCreateClassError] = useState<string | null>(null);
  const [isClosingCourse, setIsClosingCourse] = useState(false);

  // Handler: Issue initial PINs (Mode 1 - Admin only)
  const handleIssueInitialPins = async () => {
    if (!selectedClass || isIssuingPins) return;
    setIsIssuingPins(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = issueInitialPinsForClass(selectedClass.id);
    setIsIssuingPins(false);
    if (res.success && res.csvContent) {
      setPinCsvData({
        title: `CSV Cấp mã PIN lần đầu — Lớp ${selectedClass.code}`,
        content: res.csvContent,
        count: res.count,
      });
      setPinCsvModalOpen(true);
      setAlertNotice({ text: res.message, isError: false });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Handler: Re-issue single PIN (Mode 2 - Admin only)
  const handleReissueSinglePin = async (student: StudentProfile) => {
    if (isReissuingPin) return;
    setIsReissuingPin(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = reissuePinForSingleStudent(student.id);
    setIsReissuingPin(false);
    if (res.success && res.csvContent) {
      setPinCsvData({
        title: `CSV Cấp lại mã PIN riêng — Học sinh ${student.fullName} (${student.studentCode})`,
        content: res.csvContent,
        count: 1,
      });
      setPinCsvModalOpen(true);
      setSinglePinModalOpen(false);
      setAlertNotice({ text: res.message, isError: false });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Download CSV helper (Simulates no-store one-time download)
  const downloadCsvFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handler: Export 14-session CSV
  const handleExportCloseCsv = () => {
    if (!selectedClass) return;
    const res = exportCourseCloseCsv(selectedClass.id);
    if (res.success && res.csvContent) {
      downloadCsvFile(`TongKet_14Buoi_${selectedClass.code}.csv`, res.csvContent);
      setAlertNotice({
        text: `${res.message} [Đã tải tệp TongKet_14Buoi_${selectedClass.code}.csv]`,
        isError: false,
      });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Handler: Execute course close
  const handleExecuteClose = async () => {
    if (!selectedClass || isClosingCourse) return;
    setIsClosingCourse(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = verifyAndExecuteCourseClose(selectedClass.id, confirmed14Sessions);
    setIsClosingCourse(false);
    setCloseConfirmModalOpen(false);
    if (res.success) {
      setCloseResultNotice(res.message);
      setAlertNotice({ text: res.message, isError: false });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Course close preview details
  const closePreview = selectedClass ? generateCourseClosePreview(selectedClass.id) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
              {isAdmin ? 'Quản trị viên (Admin)' : 'Giáo viên'}
            </span>
            <span className="text-xs text-slate-400 font-mono">[UI-04]</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-1">
            Quản lý Lớp học, Danh sách học sinh & Cấp mã PIN
          </h1>
          <p className="text-xs text-slate-500">
            Dùng chung cho Admin và Giáo viên theo phân quyền. Admin quản lý cấp phát PIN và kết thúc khóa;
            Giáo viên theo dõi tiến độ và học sinh.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setCreateClassError(null);
              setCreateClassModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo lớp học mới</span>
          </button>
        )}
      </div>

      {/* Alert Notice */}
      {alertNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            alertNotice.isError
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          }`}
        >
          {alertNotice.isError ? (
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="font-medium flex-1">{alertNotice.text}</span>
          <button onClick={() => setAlertNotice(null)} className="text-slate-400 hover:text-slate-600">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Class Selector Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
            Chọn lớp học:
          </span>
          {visibleClasses.length > 0 ? (
            visibleClasses.map((cls) => {
              const isSelected = cls.id === selectedClass?.id;
              return (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cls.code}
                </button>
              );
            })
          ) : (
            <span className="text-xs text-slate-400 italic">Không có lớp học nào thuộc quyền quản lý</span>
          )}
        </div>

        {selectedClass && (
          <div className="text-xs text-slate-500 font-mono">
            Khóa hiện tại:{' '}
            <span className="font-bold text-slate-800">
              {selectedCourse ? selectedCourse.title : 'Chưa gán khóa học'}
            </span>
          </div>
        )}
      </div>

      {/* Empty / Unassigned State for Teacher or Empty System */}
      {!selectedClass && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          <IconAlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {isTeacher ? 'Chưa được phân công phụ trách lớp học' : 'Chưa chọn lớp học'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isTeacher
              ? 'Tài khoản giáo viên hiện tại chưa được phân công lớp học nào, hoặc lớp trước đó nằm ngoài quyền hạn được giao. Bạn chỉ có quyền theo dõi danh sách và tiến độ của các lớp được phân công.'
              : 'Hiện chưa có lớp học nào khả dụng trong hệ thống.'}
          </p>
        </div>
      )}

      {/* Active Class Info & PIN Actions */}
      {selectedClass && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">{selectedClass.name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedClass.code}
                </span>
                {selectedClass.status === 'archived' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    Lớp đã lưu trữ
                  </span>
                )}
                {selectedClass.status === 'completed' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Đã kết thúc khóa 14 buổi
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Sĩ số lớp: <span className="font-bold text-slate-800">{classStudents.length} học sinh</span> |
                Tổng học sinh từng tham gia đợt:{' '}
                <span className="font-bold text-slate-800">{batchStudents.length} học sinh</span> (gồm cả đã
                chuyển/lưu trữ).
              </p>
            </div>

            {/* PIN Action Controls: ADMIN ONLY! Teacher has NO PIN buttons */}
            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isIssuingPins}
                  onClick={handleIssueInitialPins}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                  title="Chỉ tạo PIN cho các học sinh trong lớp chưa có mã PIN"
                >
                  {isIssuingPins ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Đang cấp PIN...</span>
                    </>
                  ) : (
                    <>
                      <IconKey className="w-4 h-4" />
                      <span>Cấp PIN lần đầu (Cho HS chưa có PIN)</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                (Quy tắc bảo mật: Giáo viên không có quyền cấp mã PIN hoặc xem lại CSV mã PIN)
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-3 pt-2">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <IconSearch className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc mã học sinh..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500">
              Hiển thị {filteredStudents.length}/{classStudents.length} học sinh
            </span>
          </div>

          {/* Student Roster Table */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Mã định danh nội bộ</th>
                  <th className="px-4 py-3">Mã học sinh</th>
                  <th className="px-4 py-3">Họ và tên</th>
                  <th className="px-4 py-3">Trạng thái PIN</th>
                  <th className="px-4 py-3">Tiến độ 14 buổi</th>
                  <th className="px-4 py-3">Trạng thái hồ sơ</th>
                  <th className="px-4 py-3 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      Không có học sinh nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const progress = getStudentProgress(st.id);
                    const hasPin = Boolean(st.pinHash);

                    return (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                          {st.participantId}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-blue-600">{st.studentCode}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{st.fullName}</td>
                        <td className="px-4 py-3">
                          {hasPin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <IconCheckCircle className="w-3 h-3" />
                              <span>Đã cấp PIN 8 số</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <IconAlertTriangle className="w-3 h-3" />
                              <span>Chưa có PIN</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {progress.completedSessionsCount}/14 buổi
                            </span>
                            <span className="text-[11px] text-slate-400">({progress.percentage}%)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {st.status === 'active' ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
                              Đang học
                            </span>
                          ) : st.status === 'transferred' ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700">
                              Đã chuyển lớp
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                              Đã lưu trữ
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudent(st);
                              setDrawerOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs transition-colors"
                          >
                            Mở hồ sơ
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Course Close Section: ADMIN ONLY (Mục 6 - Kế hoạch v3) */}
      {isAdmin && selectedClass && (
        <div className="bg-white rounded-xl border border-rose-200 p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
              <IconAlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Khu vực Kết thúc khóa 14 buổi, Xuất CSV & Xóa dữ liệu cũ
                </h3>
                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-xs">
                  Chỉ Admin
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Theo quy trình Mục 6 trong Kế hoạch v3: Chỉ Admin được bắt đầu đóng đợt sau khi xác nhận lớp
                đã học đủ 14 buổi theo lịch. CSV tổng kết phải bao gồm toàn bộ học sinh từng tham gia đợt (kể
                cả em đã chuyển lớp/lưu trữ) với đúng 14 dòng/em.
              </p>
            </div>
          </div>

          {/* Schedule Confirmation Checkbox */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed14Sessions}
                onChange={(e) => setConfirmed14Sessions(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  Admin xác nhận lớp {selectedClass.code} đã hoàn thành đủ 14 buổi theo lịch trình thực tế
                </span>
                <span className="text-slate-500">
                  (Điều kiện tiên quyết trước khi mở quy trình kiểm tra CSV và xóa dữ liệu cũ. Không suy ra từ
                  tỷ lệ nộp bài của học sinh.)
                </span>
              </div>
            </label>
          </div>

          {/* Close Preview Card */}
          {closePreview && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-0.5">Tổng số học sinh đợt học:</span>
                <span className="text-base font-black text-slate-900">
                  {closePreview.totalParticipants} học sinh
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  (Bao gồm cả học sinh đã chuyển/lưu trữ)
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-0.5">Số dòng CSV dự kiến:</span>
                <span className="text-base font-black text-blue-600">
                  {closePreview.totalParticipants * 14} dòng
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  ({closePreview.totalParticipants} học sinh x 14 buổi chuẩn)
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-0.5">Kết quả & Bài nộp sẽ xóa:</span>
                <span className="text-base font-black text-rose-600">
                  {closePreview.quizResultsCount} quiz / {closePreview.submissionsCount} bài nộp
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">Xóa vĩnh viễn không hoàn tác</span>
              </div>
            </div>
          )}

          {/* Red Warnings (Cảnh báo đỏ bài chưa nộp/chờ chấm) */}
          {closePreview && closePreview.warnings.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs space-y-1">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <IconAlertTriangle className="w-4 h-4 text-rose-600" />
                <span>CẢNH BÁO ĐỎ VỀ TIẾN ĐỘ BÀI LÀM CỦA HỌC SINH:</span>
              </div>
              <ul className="list-disc list-inside text-rose-800 space-y-0.5 pl-1">
                {closePreview.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-700 italic pt-1">
                * Lưu ý: Tình trạng học sinh chưa nộp bài hoặc còn bài chờ chấm là cảnh báo để Admin cân nhắc,
                KHÔNG phải lỗi kỹ thuật chặn. Admin vẫn có toàn quyền xác nhận đóng khóa.
              </p>
            </div>
          )}

          {/* Action Buttons for Close Course */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleExportCloseCsv}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <IconDownload className="w-4 h-4" />
              <span>Xuất & Đối chiếu CSV 14 Buổi ({closePreview ? closePreview.totalParticipants * 14 : 0} dòng)</span>
            </button>

            <button
              type="button"
              disabled={!confirmed14Sessions}
              onClick={() => setCloseConfirmModalOpen(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <IconAlertTriangle className="w-4 h-4" />
              <span>Xác nhận Đóng khóa & Xóa vĩnh viễn dữ liệu cũ</span>
            </button>
          </div>
        </div>
      )}

      {/* Drawer: Student Detail & Actions */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Hồ sơ học sinh: ${selectedStudent?.fullName || ''}`}
        width="lg"
      >
        {selectedStudent && (
          <div className="space-y-6 text-xs">
            {/* Student Info */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">{selectedStudent.fullName}</span>
                <span className="font-mono text-blue-700 font-bold">{selectedStudent.studentCode}</span>
              </div>
              <div className="text-slate-500">
                Mã tham gia nội bộ (bảo toàn qua chuyển lớp):{' '}
                <span className="font-mono text-slate-700 font-semibold">{selectedStudent.participantId}</span>
              </div>
              <div className="text-slate-500">
                Lớp hiện tại: <span className="font-bold text-slate-700">{selectedClass?.code}</span>
              </div>
              <div className="text-slate-500">
                Mã PIN: {selectedStudent.pinHash ? 'Đã cấp (Mã hóa)' : 'Chưa có PIN'}
              </div>
              {selectedStudent.notes && (
                <div className="text-slate-500 italic">Ghi chú: {selectedStudent.notes}</div>
              )}
            </div>

            {/* Student Progress Overview */}
            <div>
              <h4 className="font-bold text-slate-800 text-xs mb-2">Tiến độ 14 buổi học:</h4>
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
                <div className="text-sm font-black text-blue-800 mb-1">
                  Đã hoàn thành {getStudentProgress(selectedStudent.id).completedSessionsCount}/14 buổi (
                  {getStudentProgress(selectedStudent.id).percentage}%)
                </div>
                <p className="text-[11px] text-blue-700">
                  (Tiến độ tính trên mẫu số 14 buổi cố định theo quy định dự án)
                </p>
              </div>
            </div>

            {/* Admin Student Actions */}
            {isAdmin && (
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Thao tác quản trị dành cho Admin:
                </h4>

                {/* Mode 2: Re-issue PIN for single student */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">Cấp lại mã PIN riêng</span>
                    <span className="text-[11px] text-slate-500">
                      Tạo PIN 8 số mới cho riêng học sinh này. Không đổi PIN các bạn khác.
                    </span>
                  </div>
                  <button
                    disabled={isReissuingPin}
                    onClick={() => handleReissueSinglePin(selectedStudent)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-bold text-xs transition-colors shrink-0 flex items-center gap-1"
                  >
                    {isReissuingPin ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Đang cấp...</span>
                      </>
                    ) : (
                      'Cấp lại PIN'
                    )}
                  </button>
                </div>

                {/* Transfer Class */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div>
                    <span className="font-bold text-slate-800 block">Chuyển sang lớp khác</span>
                    <span className="text-[11px] text-slate-500">
                      Chuyển học sinh sang lớp đích. Lớp nguồn vẫn lưu học sinh trong đợt để xuất CSV tổng kết.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={targetTransferClassId}
                      onChange={(e) => setTargetTransferClassId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="">-- Chọn lớp chuyển tới --</option>
                      {classes
                        .filter((c) => c.id !== selectedClass?.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={!targetTransferClassId || isTransferring}
                      onClick={async () => {
                        setIsTransferring(true);
                        await new Promise((r) => setTimeout(r, 400));
                        const res = transferStudent(selectedStudent.id, targetTransferClassId);
                        setIsTransferring(false);
                        if (res.success) {
                          setDrawerOpen(false);
                          setTargetTransferClassId('');
                          setAlertNotice({ text: res.message, isError: false });
                        } else {
                          setAlertNotice({ text: res.message, isError: true });
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded font-bold text-xs flex items-center gap-1"
                    >
                      {isTransferring ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang chuyển...</span>
                        </>
                      ) : (
                        'Chuyển'
                      )}
                    </button>
                  </div>
                </div>

                {/* Reset Progress */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">Đặt lại kết quả (Reset)</span>
                    <span className="text-[11px] text-slate-500">
                      Xóa toàn bộ điểm quiz và bài nộp thực hành của em này.
                    </span>
                  </div>
                  <button
                    disabled={isResetting}
                    onClick={async () => {
                      if (confirm(`Xác nhận đặt lại kết quả của học sinh ${selectedStudent.fullName}?`)) {
                        setIsResetting(true);
                        await new Promise((r) => setTimeout(r, 400));
                        const res = resetStudentProgress(selectedStudent.id);
                        setIsResetting(false);
                        if (res.success) {
                          setDrawerOpen(false);
                          setAlertNotice({ text: res.message, isError: false });
                        } else {
                          setAlertNotice({ text: res.message, isError: true });
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded font-bold text-xs flex items-center gap-1"
                  >
                    {isResetting ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Đang reset...</span>
                      </>
                    ) : (
                      'Reset'
                    )}
                  </button>
                </div>

                {/* Archive / Restore Student */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">
                      {selectedStudent.status === 'archived' ? 'Khôi phục tài khoản' : 'Lưu trữ tài khoản'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {selectedStudent.status === 'archived'
                        ? 'Mở lại quyền đăng nhập cho học sinh.'
                        : 'Khóa quyền đăng nhập và các phiên cũ.'}
                    </span>
                  </div>
                  {selectedStudent.status === 'archived' ? (
                    <button
                      disabled={isArchivingStudent}
                      onClick={async () => {
                        setIsArchivingStudent(true);
                        await new Promise((r) => setTimeout(r, 400));
                        const res = restoreStudent(selectedStudent.id);
                        setIsArchivingStudent(false);
                        if (res.success) {
                          setDrawerOpen(false);
                          setAlertNotice({ text: res.message, isError: false });
                        } else {
                          setAlertNotice({ text: res.message, isError: true });
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-bold text-xs flex items-center gap-1"
                    >
                      {isArchivingStudent ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang mở...</span>
                        </>
                      ) : (
                        'Khôi phục'
                      )}
                    </button>
                  ) : (
                    <button
                      disabled={isArchivingStudent}
                      onClick={async () => {
                        setIsArchivingStudent(true);
                        await new Promise((r) => setTimeout(r, 400));
                        const res = archiveStudent(selectedStudent.id);
                        setIsArchivingStudent(false);
                        if (res.success) {
                          setDrawerOpen(false);
                          setAlertNotice({ text: res.message, isError: false });
                        } else {
                          setAlertNotice({ text: res.message, isError: true });
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded font-bold text-xs flex items-center gap-1"
                    >
                      {isArchivingStudent ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Đang khóa...</span>
                        </>
                      ) : (
                        'Lưu trữ'
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Modal: PIN CSV One-time Download (Mode 1 & Mode 2 Output) */}
      <Modal
        isOpen={pinCsvModalOpen}
        onClose={() => setPinCsvModalOpen(false)}
        title={pinCsvData?.title || 'CSV Cấp mã PIN'}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 leading-relaxed">
            <span className="font-bold block mb-1">QUY TẮC BẢO MẬT MÃ PIN (Mục 2 Kế hoạch v3):</span>
            Tệp CSV đăng nhập một lần chứa mã học sinh và PIN 8 số ngẫu nhiên để Admin bàn giao riêng cho
            giáo viên phát trực tiếp. Phản hồi tải mang tính tạm thời (no-store), hệ thống không lưu trữ PIN
            rõ trong database hoặc log. Vui lòng tải về máy và lưu trữ bảo mật.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Xem trước nội dung tệp CSV một lần:
            </label>
            <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap">
              {pinCsvData?.content}
            </pre>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPinCsvModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => {
                if (pinCsvData?.content) {
                  downloadCsvFile(`MINDX_PIN_CapMotLan_${selectedClass?.code || 'Class'}.csv`, pinCsvData.content);
                  setPinCsvModalOpen(false);
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5"
            >
              <IconDownload className="w-4 h-4" />
              <span>Tải file CSV về máy</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Create Class (Admin only) */}
      <Modal
        isOpen={createClassModalOpen}
        onClose={() => {
          setCreateClassModalOpen(false);
          setCreateClassError(null);
        }}
        title="Tạo lớp học mới (Mô phỏng)"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isCreatingClass) return;
            setIsCreatingClass(true);
            setCreateClassError(null);
            await new Promise((r) => setTimeout(r, 400));
            const res = createClass({
              code: newClassCode,
              name: newClassName,
              courseId: newClassCourseId || null,
              teacherId: null,
            });
            setIsCreatingClass(false);
            if (res.success) {
              setCreateClassModalOpen(false);
              setAlertNotice({ text: res.message, isError: false });
              setNewClassCode('');
              setNewClassName('');
              setNewClassCourseId('');
            } else {
              setCreateClassError(res.message);
            }
          }}
          className="space-y-4 text-xs"
        >
          {createClassError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <IconAlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold flex-1">{createClassError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mã lớp (Ví dụ: ROB-K14-04)</label>
            <input
              type="text"
              required
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value)}
              placeholder="ROB-K14-04"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tên lớp học</label>
            <input
              type="text"
              required
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Lớp Robotics K14 Chiều Thứ 5"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Gán khóa học 14 buổi</label>
            <select
              value={newClassCourseId}
              onChange={(e) => setNewClassCourseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Chưa gán khóa học --</option>
              {courses.map((crs) => (
                <option key={crs.id} value={crs.id}>
                  {crs.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              disabled={isCreatingClass}
              onClick={() => {
                setCreateClassModalOpen(false);
                setCreateClassError(null);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isCreatingClass}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingClass ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Đang tạo...</span>
                </>
              ) : (
                'Tạo lớp'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog: Course Close & Permanent Wipe */}
      <ConfirmDialog
        isOpen={closeConfirmModalOpen}
        onClose={() => setCloseConfirmModalOpen(false)}
        onConfirm={handleExecuteClose}
        title={`Xác nhận kết thúc khóa lớp ${selectedClass?.code || ''}?`}
        message="Hành động này sẽ XÓA VĨNH VIỄN toàn bộ điểm số quiz, bài nộp thực hành, tiến độ và nhận xét của lớp này để chuẩn bị đón khóa học mới. Tài khoản học sinh và nội dung bài học sẽ được bảo toàn. Thao tác không thể hoàn tác!"
        confirmText="Tôi hiểu và Xác nhận Xóa dữ liệu cũ"
        cancelText="Hủy bỏ"
        isDanger={true}
        isLoading={isClosingCourse}
      />
    </div>
  );
}

export default function ClassesManagementPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">Đang tải dữ liệu lớp học...</div>}>
      <ClassesManagementContent />
    </React.Suspense>
  );
}
