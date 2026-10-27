'use client';

import React, { useState, useEffect, useRef } from 'react';
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
    isLiveMode,
    users,
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
    storageQuota,
    storageQuotaError,
    fetchStorageQuota,
    setStorageQuotaBaseline,
    seedM5CourseCloseFixture,
    generateCourseClosePreview,
    fetchCourseClosePreview,
    setConfirmed14SessionsForClass,
    exportCourseCloseCsv,
    verifyAndExecuteCourseClose,
    csvVerifications,
    courseCloseOperations,
    getStudentProgress,
  } = useStore();

  const isAdmin = currentUser?.role === 'admin';
  const isTeacher = currentUser?.role === 'teacher';

  // Active teacher accounts for assignment
  const teachers = (users || []).filter((u) => u.role === 'teacher' && u.status === 'active');

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
  const [newClassTeacherId, setNewClassTeacherId] = useState<string>('');

  // Edit Class Modal (Admin only)
  const [editClassModalOpen, setEditClassModalOpen] = useState(false);
  const [editClassCode, setEditClassCode] = useState('');
  const [editClassName, setEditClassName] = useState('');
  const [editClassTeacherId, setEditClassTeacherId] = useState<string>('');
  const [isUpdatingClass, setIsUpdatingClass] = useState(false);
  const [updateClassError, setUpdateClassError] = useState<string | null>(null);

  // PIN CSV Download Modal
  const [pinCsvModalOpen, setPinCsvModalOpen] = useState(false);
  const [pinCsvData, setPinCsvData] = useState<{ title: string; content: string; count?: number } | null>(null);

  // Re-issue single PIN modal
  const [singlePinModalOpen, setSinglePinModalOpen] = useState(false);
  const [targetStudentForPin, setTargetStudentForPin] = useState<StudentProfile | null>(null);

  // Course Close Section State (Mốc 5)
  const [confirmed14Sessions, setConfirmed14Sessions] = useState(false);
  const [closeConfirmModalOpen, setCloseConfirmModalOpen] = useState(false);
  const [closeResultNotice, setCloseResultNotice] = useState<string | null>(null);
  const [csvVerificationResult, setCsvVerificationResult] = useState<any | null>(null);
  const [nextCourseId, setNextCourseId] = useState<string>('');
  const [simulateFailureStage, setSimulateFailureStage] = useState<string>('none');
  const [isSeedingFixture, setIsSeedingFixture] = useState(false);
  // R4-06 (hoàn tất R3-07): Quản lý trạng thái bận theo Record<string, boolean> cho từng lớp
  const [exportingByClassId, setExportingByClassId] = useState<Record<string, boolean>>({});
  const [closingByClassId, setClosingByClassId] = useState<Record<string, boolean>>({});
  // Tương thích ngược R3-07
  const [exportingClassId, setExportingClassId] = useState<string | null>(null);
  const [closingClassId, setClosingClassId] = useState<string | null>(null);
  const isExportingCsv = Boolean(selectedClass && (exportingByClassId[selectedClass.id] || exportingClassId === selectedClass.id));
  const isClosingCourse = Boolean(selectedClass && (closingByClassId[selectedClass.id] || closingClassId === selectedClass.id));

  // R8-03: Lưu mã hash SHA-256 của tệp CSV mà Admin đã tải, mở và kiểm tra cho từng lớp
  const [confirmedCsvOpenedByClass, setConfirmedCsvOpenedByClass] = useState<Record<string, string>>({});

  // M5-08: Only fetch quota once on mount in live mode
  useEffect(() => {
    // R9-02: Chỉ Admin được xem tổng dung lượng toàn tổ chức
    if (isLiveMode && isAdmin) {
      fetchStorageQuota().catch(() => {});
    }
  }, [isLiveMode, isAdmin, fetchStorageQuota]);

  // M5-09 / R6-03: Dùng ref giữ tham chiếu mới nhất của fetchCourseClosePreview tránh re-render loop
  const selectedClassIdRef = useRef(selectedClassId);
  const fetchCourseClosePreviewRef = useRef(fetchCourseClosePreview);
  fetchCourseClosePreviewRef.current = fetchCourseClosePreview;

  // M5-09 / R6-03 / R8-03: Chỉ reset trạng thái và gọi preview khi đổi lớp (selectedClassId) hoặc chế độ (isLiveMode)
  useEffect(() => {
    selectedClassIdRef.current = selectedClassId;
    setConfirmed14Sessions(Boolean(selectedClass?.is14SessionsConfirmed));
    setCsvVerificationResult(null);
    setCloseResultNotice(null);
    if (selectedClassId) {
      setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [selectedClassId]: '' }));
    }
    if (isLiveMode && selectedClassId) {
      fetchCourseClosePreviewRef.current(selectedClassId).catch(() => {});
    }
  }, [selectedClassId, isLiveMode]);

  // Đồng bộ cờ xác nhận 14 buổi từ dữ liệu lớp mà không xóa kết quả CSV hay gọi lại API
  useEffect(() => {
    if (selectedClass) {
      setConfirmed14Sessions(Boolean(selectedClass.is14SessionsConfirmed));
    }
  }, [selectedClass?.id, selectedClass?.is14SessionsConfirmed]);

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

  // Handler: Issue initial PINs (Mode 1 - Admin only)
  const handleIssueInitialPins = async () => {
    if (!selectedClass || isIssuingPins) return;
    setIsIssuingPins(true);
    await new Promise((r) => setTimeout(r, 400));
    const res = await issueInitialPinsForClass(selectedClass.id);
    setIsIssuingPins(false);
    if (res.success) {
      if (res.csvContent) {
        setPinCsvData({
          title: `CSV Cấp mã PIN lần đầu — Lớp ${selectedClass.code}`,
          content: res.csvContent,
          count: res.count,
        });
        setPinCsvModalOpen(true);
      }
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
    const res = await reissuePinForSingleStudent(student.id);
    setIsReissuingPin(false);
    if (res.success) {
      if (res.csvContent) {
        setPinCsvData({
          title: `CSV Cấp lại mã PIN riêng — Học sinh ${student.fullName} (${student.studentCode})`,
          content: res.csvContent,
          count: 1,
        });
        setPinCsvModalOpen(true);
      }
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

  // Handler: Seed or Reset M5 Fixture Class
  const handleSeedFixture = async (resetOnly = false) => {
    setIsSeedingFixture(true);
    const res = await seedM5CourseCloseFixture(resetOnly);
    setIsSeedingFixture(false);
    if (res.success) {
      // R23-01: Xóa kết quả CSV/thông báo đóng khóa cục bộ và xác nhận mở CSV của lớp mẫu,
      // kể cả khi Admin đang đứng sẵn ở lớp mẫu (selectedClassId không đổi nên useEffect không tự chạy lại).
      // Chỉ xóa trạng thái của riêng lớp mẫu; giữ nguyên trạng thái của lớp khác khi "Dọn mẫu" (resetOnly).
      const fixtureIdsToClear = new Set<string>([
        '00000000-0000-0000-0000-000000050001',
        'cls_rob_m5_01',
        ...(res.fixtureClassId ? [res.fixtureClassId] : []),
      ]);
      const isSelectedFixture = Boolean(selectedClassId && fixtureIdsToClear.has(selectedClassId));
      setCsvVerificationResult((prev: any) =>
        prev && (!prev.classId || fixtureIdsToClear.has(prev.classId)) ? null : prev
      );
      if (isSelectedFixture || Boolean(res.fixtureClassId)) {
        setCloseResultNotice(null);
      }
      setConfirmedCsvOpenedByClass((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const fid of fixtureIdsToClear) {
          if (fid in next) {
            next[fid] = '';
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      if (res.fixtureClassId) {
        setSelectedClassId(res.fixtureClassId);
        if (isLiveMode) {
          await fetchCourseClosePreview(res.fixtureClassId).catch(() => null);
        }
      }
      setAlertNotice({ text: res.message, isError: false });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Handler: Set Quota Baseline for Testing
  const handleSetQuotaBaseline = async (bytes: number) => {
    const res = await setStorageQuotaBaseline(bytes);
    if (res.success) {
      setAlertNotice({ text: res.message, isError: false });
    } else {
      setAlertNotice({ text: res.message, isError: true });
    }
  };

  // Handler: Export 14-session CSV (R4-06, R8-03)
  const handleExportCloseCsv = async () => {
    if (!selectedClass) return;
    const requestClassId = selectedClass.id;
    // R20-02: chụp khóa học Admin đang xác nhận lúc bấm nút để máy chủ từ chối nếu lớp đã sang khóa khác
    const requestCourseId = selectedClass.courseId || undefined;
    if (exportingByClassId[requestClassId]) return;
    setExportingByClassId((prev) => ({ ...prev, [requestClassId]: true }));
    setExportingClassId(requestClassId);
    // R8-03: Khi xuất CSV mới, xóa xác nhận mở CSV cũ của lớp này
    setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [requestClassId]: '' }));
    try {
      const res = await exportCourseCloseCsv(requestClassId, confirmed14Sessions, requestCourseId);
      // P2-01: Nếu người dùng đã đổi lớp trong lúc đang gọi bất đồng bộ thì không cập nhật
      if (selectedClassIdRef.current !== requestClassId) {
        return;
      }
      if (res.verification) {
        setCsvVerificationResult({
          ...res.verification,
          classId: requestClassId,
        });
      }
      if (res.success && res.csvContent) {
        downloadCsvFile(`TongKet_14Buoi_${selectedClass.code}.csv`, res.csvContent);
        setAlertNotice({
          text: `${res.message} [Đã tải tệp TongKet_14Buoi_${selectedClass.code}.csv]`,
          isError: false,
        });
      } else {
        setAlertNotice({ text: res.message, isError: true });
      }
    } finally {
      // R4-06 / R3-07: Luôn giải phóng đúng lớp vừa chạy xong bất kể người dùng chuyển sang lớp nào
      setExportingByClassId((prev) => ({ ...prev, [requestClassId]: false }));
      setExportingClassId((prev) => (prev === requestClassId ? null : prev));
    }
  };

  // Handler: Execute course close (R4-04, R4-06, R8-03)
  const handleExecuteClose = async (isResume = false) => {
    if (!selectedClass || isClosingCourse) return;
    const requestClassId = selectedClass.id;
    // R20-02: chụp khóa học Admin đang xác nhận lúc bấm nút (Resume dùng khóa của tác vụ dở dang trong store)
    const requestCourseId = selectedClass.courseId || undefined;
    if (closingByClassId[requestClassId]) return;

    // R8-03: Chặn nếu chưa mở và kiểm tra CSV mới nhất
    if (!isResume && !isLatestCsvOpenedConfirmed) {
      setAlertNotice({
        text: 'Vui lòng tải, mở tệp CSV mới nhất và đánh dấu xác nhận đã kiểm tra đúng lớp/khóa trước khi xóa.',
        isError: true,
      });
      return;
    }

    setClosingByClassId((prev) => ({ ...prev, [requestClassId]: true }));
    setClosingClassId(requestClassId);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const res = await verifyAndExecuteCourseClose(requestClassId, confirmed14Sessions, {
        courseId: requestCourseId,
        nextCourseId: nextCourseId || undefined,
        simulateFailureStage: simulateFailureStage !== 'none' ? simulateFailureStage : undefined,
        isResume,
        confirmedCsvOpened: isResume ? true : isLatestCsvOpenedConfirmed,
        confirmedCsvSha256: csvVerificationResult?.sha256 || undefined,
      });
      // P2-01: Nếu người dùng đã đổi lớp trong lúc đang gọi bất đồng bộ thì không cập nhật
      if (res.success) {
        // R17-03: Đóng khóa thành công (lớp đã sang khóa kế tiếp) -> xóa xác nhận mở CSV của khóa cũ
        setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [requestClassId]: '' }));
      }
      if (selectedClassIdRef.current !== requestClassId) {
        return;
      }
      setCloseConfirmModalOpen(false);
      if (res.success) {
        // R17-03: Đặt lại xác nhận 14 buổi của khóa cũ để không áp sang khóa mới
        setConfirmed14Sessions(false);
      }
      // R5-06: Đồng bộ ngay trạng thái preview/operation từ máy chủ để hiển thị khung incomplete / nút Resume
      if (isLiveMode) {
        // R17-03: Chỉ đọc trạng thái từ máy chủ (không truyền xác nhận 14 buổi của khóa cũ)
        await fetchCourseClosePreview(requestClassId);
        // R13-05: Người dùng có thể đã đổi lớp trong lúc chờ phản hồi mạng, không hiện thông báo của lớp cũ đè lên lớp mới
        if (selectedClassIdRef.current !== requestClassId) {
          return;
        }
      }
      if (res.success) {
        setCloseResultNotice(res.message);
        setAlertNotice({ text: res.message, isError: false });
        setCsvVerificationResult(null);
      } else {
        setAlertNotice({ text: res.message, isError: true });
      }
    } finally {
      // R4-06 / R3-07: Luôn giải phóng đúng lớp vừa chạy xong bất kể người dùng chuyển sang lớp nào
      setClosingByClassId((prev) => ({ ...prev, [requestClassId]: false }));
      setClosingClassId((prev) => (prev === requestClassId ? null : prev));
    }
  };

  // Course close preview details
  const closePreview = selectedClass
    ? generateCourseClosePreview(selectedClass.id, { isSchedule14Confirmed: confirmed14Sessions })
    : null;
  const currentCloseOp = selectedClass ? courseCloseOperations[selectedClass.id] : null;

  // R8-03: Kiểm tra Admin đã mở và xác nhận đúng bản CSV mới nhất của lớp hiện tại
  const isLatestCsvOpenedConfirmed = Boolean(
    selectedClass &&
    csvVerificationResult &&
    csvVerificationResult.classId === selectedClass.id &&
    csvVerificationResult.valid &&
    csvVerificationResult.sha256 &&
    confirmedCsvOpenedByClass[selectedClass.id] === csvVerificationResult.sha256
  );

  const isIncomplete = Boolean(currentCloseOp?.status && ['incomplete', 'deleting_storage', 'deleting_db'].includes(currentCloseOp.status));

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d63ed]" />
            <span>{isAdmin ? 'Quản trị viên (Admin)' : 'Giáo viên'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Quản lý Lớp học, Danh sách học sinh & Cấp mã PIN
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Dùng chung cho Admin và Giáo viên theo phân quyền. Admin quản lý cấp phát PIN và kết thúc khóa;
            Giáo viên theo dõi tiến độ và học sinh.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setCreateClassError(null);
              setNewClassCode('');
              setNewClassName('');
              setNewClassCourseId('');
              setNewClassTeacherId('');
              setCreateClassModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all self-start sm:self-auto shrink-0 cursor-pointer"
          >
            <IconPlus className="w-4 h-4" />
            <span>Tạo lớp học mới</span>
          </button>
        )}
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
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <IconCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold flex-1">{alertNotice.text}</span>
          <button onClick={() => setAlertNotice(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Class Selector Bar */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4 sm:px-6 shadow-[0_14px_40px_rgba(8,112,184,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
            Chọn lớp học:
          </span>
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/70">
            {visibleClasses.length > 0 ? (
              visibleClasses.map((cls) => {
                const isSelected = cls.id === selectedClass?.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1d63ed] text-white shadow-sm shadow-blue-600/20'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {cls.code}
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-slate-400 italic px-2">Không có lớp học nào thuộc quyền quản lý</span>
            )}
          </div>
        </div>

        {selectedClass && (
          <div className="text-xs text-slate-500 font-mono bg-[#f8fafc] px-3.5 py-2 rounded-xl border border-slate-200/70">
            Khóa hiện tại:{' '}
            <span className="font-bold text-slate-900">
              {selectedCourse ? selectedCourse.title : 'Chưa gán khóa học'}
            </span>
          </div>
        )}
      </div>

      {/* Empty / Unassigned State for Teacher or Empty System */}
      {!selectedClass && (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-slate-500 text-sm shadow-[0_14px_40px_rgba(8,112,184,0.06)]">
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
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">{selectedClass.name}</h2>
                <span className="px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold bg-blue-50 text-[#1d63ed] border border-blue-100">
                  {selectedClass.code}
                </span>
                {selectedClass.status === 'archived' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    Lớp đã lưu trữ
                  </span>
                )}
                {selectedClass.status === 'completed' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Đã kết thúc khóa 14 buổi
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Sĩ số lớp: <span className="font-bold text-slate-800">{classStudents.length} học sinh</span> |
                Tổng học sinh từng tham gia đợt:{' '}
                <span className="font-bold text-slate-800">{batchStudents.length} học sinh</span> (gồm cả đã
                chuyển/lưu trữ) |
                Giáo viên phụ trách:{' '}
                <span className="font-bold text-slate-800">
                  {users.find((u) => u.id === selectedClass.teacherId)?.name || 'Chưa phân công'}
                </span>
              </p>
            </div>

            {/* Class Actions (Admin only can edit class / assign teacher; PIN Actions Admin only) */}
            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditClassCode(selectedClass.code);
                    setEditClassName(selectedClass.name);
                    setEditClassTeacherId(selectedClass.teacherId || '');
                    setUpdateClassError(null);
                    setEditClassModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#1d63ed] border border-blue-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Sửa mã lớp, tên lớp và phân công giáo viên phụ trách"
                >
                  <IconFileText className="w-4 h-4" />
                  <span>Sửa lớp / Phân công GV</span>
                </button>

                <button
                  type="button"
                  disabled={isIssuingPins}
                  onClick={handleIssueInitialPins}
                  className="px-4 py-2.5 bg-[#1d63ed] hover:bg-[#154ec2] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
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
              <div className="text-xs text-slate-400 italic bg-[#f8fafc] px-3.5 py-2 rounded-xl border border-slate-200/80">
                (Quy tắc bảo mật: Giáo viên không có quyền cấp mã PIN, sửa lớp hoặc xem lại CSV mã PIN)
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <IconSearch className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên hoặc mã học sinh..."
                className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Hiển thị {filteredStudents.length}/{classStudents.length} học sinh
            </span>
          </div>

          {/* Student Roster Table */}
          <div className="border border-slate-200/80 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8fafc] text-slate-500 font-bold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Mã định danh nội bộ</th>
                  <th className="px-4 py-3.5">Mã học sinh</th>
                  <th className="px-4 py-3.5">Họ và tên</th>
                  <th className="px-4 py-3.5">Trạng thái PIN</th>
                  <th className="px-4 py-3.5">Tiến độ 14 buổi</th>
                  <th className="px-4 py-3.5">Trạng thái hồ sơ</th>
                  <th className="px-4 py-3.5 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Không có học sinh nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => {
                    const progress = getStudentProgress(st.id);
                    const hasPin = Boolean(st.hasPin ?? st.pinHash);

                    return (
                      <tr key={st.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                          {st.participantId}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-[#1d63ed]">{st.studentCode}</td>
                        <td className="px-4 py-3.5 font-bold text-slate-900">{st.fullName}</td>
                        <td className="px-4 py-3.5">
                          {hasPin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <IconCheckCircle className="w-3 h-3" />
                              <span>Đã cấp PIN 8 số</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <IconAlertTriangle className="w-3 h-3" />
                              <span>Chưa có PIN</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {progress.completedSessionsCount}/14 buổi
                            </span>
                            <span className="text-[11px] text-slate-400">({progress.percentage}%)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {st.status === 'active' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Đang học
                            </span>
                          ) : st.status === 'transferred' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Đã chuyển lớp
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Đã lưu trữ
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudent(st);
                              setDrawerOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#1d63ed] hover:text-white font-bold text-slate-700 text-xs transition-all cursor-pointer"
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

      {/* Course Close Section: ADMIN ONLY (Mốc 5 — Mục 6 Kế hoạch v3) */}
      {isAdmin && selectedClass && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-[0_14px_40px_rgba(8,112,184,0.06)] space-y-6">
          {/* Header Khu vực Mốc 5 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                <IconAlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#1d63ed] text-white">
                    Đóng khóa 14 buổi
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                    Kết thúc đợt 14 buổi, Xuất CSV tổng kết & Xóa vĩnh viễn dữ liệu cũ
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                    Chỉ Admin
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Chỉ Admin được bắt đầu đóng đợt sau khi xác nhận lớp đã học đủ 14 buổi theo lịch. CSV tổng kết gồm toàn bộ học sinh từng tham gia đợt (kể cả em đã chuyển lớp/lưu trữ) với đúng 14 dòng/em.
                </p>
              </div>
            </div>

            {/* Nút chuẩn bị/khôi phục Lớp mẫu 14 buổi Mốc 5 */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSeedingFixture}
                onClick={() => handleSeedFixture(false)}
                className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-[#1d63ed] border border-blue-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <IconRefreshCw className={`w-3.5 h-3.5 ${isSeedingFixture ? 'animate-spin' : ''}`} />
                <span>Chuẩn bị Lớp mẫu 14 buổi Mốc 5 (ROB-K14-M5-01)</span>
              </button>
              <button
                type="button"
                disabled={isSeedingFixture}
                onClick={() => handleSeedFixture(true)}
                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Dọn sạch dữ liệu lớp mẫu Mốc 5"
              >
                Dọn sạch
              </button>
            </div>
          </div>

          {/* 1. Thẻ Giám sát Dung lượng Storage (700 MB Cảnh báo / 800 MB Chặn tải tệp) */}
          <div className={`p-5 rounded-2xl border transition-colors ${
            storageQuota?.isExceeded
              ? 'bg-rose-50/90 border-rose-200'
              : storageQuota?.isWarning
              ? 'bg-amber-50/90 border-amber-200'
              : 'bg-[#f8fafc] border-slate-200/80'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs text-slate-900">
                  Giám sát Dung lượng Storage Tổ chức (Cổng 700 MB Cảnh báo / 800 MB Chặn tải tệp)
                </span>
                {(isLiveMode && (storageQuotaError || storageQuota?.code === 'STORAGE_QUOTA_STATUS_UNKNOWN' || (storageQuota as any)?.statusUnknown)) ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white flex items-center gap-1">
                    <IconAlertCircle className="w-3.5 h-3.5" />
                    LỖI KẾT NỐI HẠN MỨC STORAGE
                  </span>
                ) : storageQuota?.isExceeded ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                    ĐÃ CHẠM HẠN MỨC — CHẶN TẢI TỆP MỚI
                  </span>
                ) : storageQuota?.isWarning ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-600 text-white">
                    CẢNH BÁO DUNG LƯỢNG (≥ 700 MB)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Dung lượng an toàn
                  </span>
                )}
              </div>

              {/* Nút thử kịch bản dung lượng TEST */}
              {!isLiveMode ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 text-[11px]">Thử kịch bản:</span>
                  <button
                    type="button"
                    onClick={() => handleSetQuotaBaseline(0)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
                  >
                    0 MB
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuotaBaseline(720 * 1024 * 1024)}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-200 text-amber-800 hover:bg-amber-200 text-[11px] font-semibold"
                  >
                    720 MB (Cảnh báo)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetQuotaBaseline(810 * 1024 * 1024)}
                    className="px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-200 text-rose-800 hover:bg-rose-200 text-[11px] font-semibold"
                  >
                    810 MB (Chặn tải)
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchStorageQuota(0).catch(() => {})}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 text-[11px] font-semibold"
                  >
                    Làm mới
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => fetchStorageQuota(0).catch(() => {})}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-bold shadow-2xs cursor-pointer"
                  >
                    Kiểm tra lại hạn mức
                  </button>
                </div>
              )}
            </div>

            {/* Thanh tiến trình dung lượng */}
            <div className="space-y-2 text-xs">
              <div className="w-full bg-slate-200/80 rounded-full h-3 overflow-hidden flex p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    storageQuota?.isExceeded
                      ? 'bg-rose-600'
                      : storageQuota?.isWarning
                      ? 'bg-amber-500'
                      : 'bg-[#1d63ed]'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      ((storageQuota?.anticipatedTotalBytes || 0) / (800 * 1024 * 1024)) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2">
                <div>
                  Đang dùng: <strong>{(((storageQuota?.usedStorageBytes || 0) + (storageQuota?.orgBaselineBytes || 0)) / (1024 * 1024)).toFixed(1)} MB</strong>
                  {storageQuota?.activeReservedBytes ? (
                    <span> + Giữ chỗ đồng thời: <strong>{((storageQuota.activeReservedBytes) / (1024 * 1024)).toFixed(1)} MB</strong></span>
                  ) : null}
                  {' '}= Tổng dự kiến: <strong className={storageQuota?.isExceeded ? 'text-rose-600' : storageQuota?.isWarning ? 'text-amber-700' : 'text-slate-900'}>
                    {((storageQuota?.anticipatedTotalBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                  </strong> / 800 MB
                </div>
                <div className="text-slate-500">
                  Ngưỡng cảnh báo: 700 MB | Ngưỡng chặn: 800 MB (Nộp bằng liên kết link luôn mở)
                </div>
              </div>

              {isLiveMode && (storageQuotaError || storageQuota?.code === 'STORAGE_QUOTA_STATUS_UNKNOWN' || (storageQuota as any)?.statusUnknown) && (
                <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-rose-900 text-xs font-semibold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      {storageQuotaError || 'Chưa xác định được trạng thái dung lượng Storage từ máy chủ. Vui lòng bấm Kiểm tra lại hạn mức.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchStorageQuota(0).catch(() => {})}
                    className="px-3 py-1.5 bg-rose-700 text-white text-xs font-bold rounded-lg hover:bg-rose-800 shrink-0"
                  >
                    Kiểm tra lại hạn mức
                  </button>
                </div>
              )}

              {storageQuota?.isExceeded && !storageQuotaError && (
                <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-rose-900 text-xs font-semibold flex items-center gap-2">
                  <IconAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Chốt chặn dung lượng: Hệ thống đã chặn bắt đầu các lượt tải tệp mới để tránh vượt hạn mức tổ chức. Học sinh vẫn có thể nộp bài tập bằng liên kết (link) bình thường.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Bảng Xem trước Phạm vi & Tác động Đóng khóa */}
          {closePreview && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                Xem trước phạm vi đợt học & Dữ liệu sẽ bị xóa vĩnh viễn:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
                <div className="p-4 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
                  <span className="text-slate-500 block mb-1">Tổng số học sinh đợt:</span>
                  <span className="text-lg font-black text-slate-900">
                    {closePreview.totalParticipants} học sinh
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-1">
                    ({closePreview.activeParticipantsCount || 0} đang học, {closePreview.transferredCount || 0} chuyển lớp, {closePreview.archivedCount || 0} lưu trữ)
                  </span>
                </div>

                <div className="p-4 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
                  <span className="text-slate-500 block mb-1">Số dòng CSV 14 buổi:</span>
                  <span className="text-lg font-black text-[#1d63ed]">
                    {closePreview.totalParticipants * 14} dòng
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-1">
                    ({closePreview.totalParticipants} HS x 14 buổi chuẩn cố định)
                  </span>
                </div>

                <div className="p-4 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
                  <span className="text-slate-500 block mb-1">Hoàn tất 14/14 buổi:</span>
                  <span className="text-lg font-black text-emerald-600">
                    {closePreview.completedAll14Count || 0} / {closePreview.totalParticipants} HS
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-1">
                    Chưa xong: {closePreview.incompleteStudentsCount || 0} HS ({closePreview.unsubmittedStudentsCount || 0} chưa nộp bài nào)
                  </span>
                </div>

                <div className="p-4 bg-[#f8fafc] rounded-2xl border border-slate-200/80">
                  <span className="text-slate-500 block mb-1">Dữ liệu sẽ xóa vĩnh viễn:</span>
                  <span className="text-lg font-black text-rose-600">
                    {closePreview.quizResultsCount} quiz / {closePreview.submissionsCount} bài nộp
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-1">
                    {closePreview.storageFilesCount || 0} tệp ({(((closePreview.storageBytesCount || 0)) / (1024 * 1024)).toFixed(1)} MB) không thể hoàn tác
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CẢNH BÁO ĐỎ: Về tiến độ học sinh (KHÔNG chặn Admin xác nhận) */}
          {closePreview && closePreview.warnings.length > 0 && (
            <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl text-xs space-y-1.5">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <IconAlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>CẢNH BÁO ĐỎ VỀ TIẾN ĐỘ VÀ MẤT DỮ LIỆU CỦA ĐỢT HỌC (KHÔNG CHẶN ĐÓNG KHÓA):</span>
              </div>
              <ul className="list-disc list-inside text-rose-800 space-y-0.5 pl-1">
                {closePreview.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-700 italic pt-1 border-t border-rose-200/80 mt-1">
                * Ghi chú an toàn: Học sinh chưa nộp bài, chưa hoàn tất hoặc còn bài chờ chấm là cảnh báo đỏ để Admin cân nhắc, KHÔNG phải lỗi kỹ thuật chặn. Admin vẫn có toàn quyền xác nhận sau khi xem xét. CSV là báo cáo tổng kết, không phải bản backup và không thể khôi phục dữ liệu đã xóa.
              </p>
            </div>
          )}

          {/* LỖI KỸ THUẬT CHẶN (Buộc dừng kể cả khi Admin muốn tiếp tục) */}
          {closePreview && closePreview.blockErrors.length > 0 && (
            <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-1.5">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <IconAlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>ĐIỀU KIỆN KỸ THUẬT CHẶN (BUỘC DỪNG XÁC NHẬN CHO ĐẾN KHI XỬ LÝ):</span>
              </div>
              <ul className="list-disc list-inside text-amber-800 space-y-0.5 pl-1">
                {closePreview.blockErrors.map((err, idx) => (
                  <li key={idx} className="font-medium">{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tác vụ chưa hoàn tất (Incomplete Task Warning & Resume Button) */}
          {isIncomplete && (
            <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl text-xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <IconAlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>TÁC VỤ ĐÓNG KHÓA ĐANG Ở TRẠNG THÁI CHƯA HOÀN TẤT (INCOMPLETE)</span>
              </div>
              <p className="text-amber-800">
                Tác vụ xóa trước đó đã dừng lại giữa chừng (do sự cố mạng hoặc thử nghiệm lỗi). Đã xóa{' '}
                <strong>{(currentCloseOp.deletedStoragePaths || []).length} tệp</strong>, còn lại{' '}
                <strong>{(currentCloseOp.remainingStoragePaths || []).length} tệp</strong>. Khóa chặn ghi mới trên lớp vẫn được giữ nguyên để bảo vệ an toàn dữ liệu.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  disabled={isClosingCourse}
                  onClick={() => handleExecuteClose(true)}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <IconRotateCcw className={`w-4 h-4 ${isClosingCourse ? 'animate-spin' : ''}`} />
                  <span>Tiếp tục hoàn tất tác vụ xóa (Resume)</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. Bước 1: Xác nhận 14 buổi & Xuất + Tự kiểm tra CSV 14 buổi */}
          <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#1d63ed] text-white font-black text-xs flex items-center justify-center">
                1
              </span>
              <span className="font-extrabold text-slate-900 text-xs">
                Bước 1: Xác nhận đủ 14 buổi theo lịch & Xuất + Tự kiểm tra CSV 14 buổi
              </span>
            </div>

            <label className="flex items-start gap-3 cursor-pointer bg-white p-3.5 rounded-xl border border-slate-200/80 hover:border-blue-200 transition-colors">
              <input
                type="checkbox"
                checked={confirmed14Sessions}
                onChange={(e) => {
                  const val = e.target.checked;
                  setConfirmed14Sessions(val);
                  if (selectedClass) {
                    setConfirmed14SessionsForClass(selectedClass.id, val).catch(() => {});
                  }
                }}
                className="mt-0.5 w-4 h-4 text-[#1d63ed] rounded border-slate-300 focus:ring-[#1d63ed]"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">
                  Admin xác nhận lớp {selectedClass.code} đã hoàn thành đủ 14 buổi theo lịch trình thực tế
                </span>
                <span className="text-slate-500">
                  (Điều kiện tiên quyết bắt buộc. Không suy ra từ tỷ lệ hoàn thành của học sinh.)
                </span>
              </div>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isExportingCsv || !selectedClass}
                onClick={handleExportCloseCsv}
                className="px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/15 transition-all flex items-center gap-2 cursor-pointer"
              >
                <IconDownload className={`w-4 h-4 ${isExportingCsv ? 'animate-spin' : ''}`} />
                <span>
                  {isExportingCsv
                    ? 'Đang xuất & tự kiểm tra CSV...'
                    : `Xuất & Tự kiểm tra CSV 14 Buổi (${closePreview ? closePreview.totalParticipants * 14 : 0} dòng)`}
                </span>
              </button>
            </div>

            {/* Bảng kết quả tự kiểm tra CSV */}
            {csvVerificationResult && csvVerificationResult.classId === selectedClass.id && (
              <div className={`p-4 rounded-2xl border text-xs space-y-2 ${
                csvVerificationResult.valid
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50/90 border-rose-200 text-rose-950'
              }`}>
                <div className="font-bold flex items-center gap-1.5">
                  {csvVerificationResult.valid ? (
                    <IconCheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <IconAlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>
                    KẾT QUẢ TỰ ĐỘNG ĐỐI CHIẾU CSV THEO CHUẨN RFC 4180:{' '}
                    {csvVerificationResult.valid ? 'HỢP LỆ 100%' : 'PHÁT HIỆN LỖI TOÀN VẸN'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    • Số học sinh tham gia: <strong>{csvVerificationResult.participantCount}</strong> (đủ mọi em active, transferred, archived)
                  </div>
                  <div>
                    • Tổng số dòng dữ liệu: <strong>{csvVerificationResult.rowCount}</strong> dòng (đúng {csvVerificationResult.participantCount} x 14 buổi)
                  </div>
                  <div>
                    • Kiểm tra bảo mật: <strong>0 mã PIN / token / mật khẩu</strong> bị rò rỉ trong CSV
                  </div>
                  <div>
                    • SHA-256 Digest: <span className="font-mono text-[10px] break-all">{csvVerificationResult.sha256?.slice(0, 16)}...</span>
                  </div>
                </div>

                {!csvVerificationResult.valid && (
                  <ul className="list-disc list-inside text-rose-800 space-y-0.5 pt-1">
                    {csvVerificationResult.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}

                {csvVerificationResult.valid && (
                  <label className="flex items-start gap-2.5 cursor-pointer bg-white p-3 rounded-xl border border-emerald-200 mt-2">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        csvVerificationResult.sha256 &&
                        confirmedCsvOpenedByClass[selectedClass.id] === csvVerificationResult.sha256
                      )}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const sha = csvVerificationResult.sha256 || '';
                        setConfirmedCsvOpenedByClass((prev) => ({
                          ...prev,
                          [selectedClass.id]: checked ? sha : '',
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-emerald-400 focus:ring-emerald-500"
                    />
                    <div className="text-[11px] text-emerald-950">
                      <span className="font-bold block">
                        Admin/Owner xác nhận đã tải về, mở tệp CSV và kiểm tra đúng lớp ({selectedClass.code}) / khóa học ({selectedCourse?.title || '14 buổi'}) cùng bảng kiểm tra đủ 14 buổi
                      </span>
                      <span className="text-emerald-800">
                        (Bắt buộc trước khi xóa. Tệp CSV là báo cáo tổng kết, không phải bản backup và không khôi phục được dữ liệu đã xóa.)
                      </span>
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* 4. Bước 2: Chọn Khóa học mới (tùy chọn) & Xác nhận Xóa vĩnh viễn */}
          <div className="p-5 bg-[#f8fafc] rounded-2xl border border-slate-200/80 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center">
                2
              </span>
              <span className="font-extrabold text-slate-900 text-xs">
                Bước 2: Chọn Khóa học kế tiếp (tùy chọn) & Xác nhận Xóa vĩnh viễn dữ liệu cũ
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Gán Khóa học mới cho lớp sau khi xóa:
                </label>
                <select
                  value={nextCourseId}
                  onChange={(e) => setNextCourseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">-- Không gán khóa mới (Đóng lớp sang Hoàn thành) --</option>
                  {courses
                    .filter((c) => c.id !== selectedClass.courseId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} (14 Buổi)
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Nếu chọn khóa học mới, lớp sẽ được gán khóa này và đặt lại tiến độ mới 0/14.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Chế độ kiểm thử an toàn trên TEST:
                </label>
                <select
                  value={(selectedClass.isFixture || selectedClass.code === 'ROB-K14-M5-01') ? simulateFailureStage : 'none'}
                  disabled={!(selectedClass.isFixture || selectedClass.code === 'ROB-K14-M5-01')}
                  onChange={(e) => setSimulateFailureStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1d63ed] focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="none">Bình thường (Thực thi xóa thành công 100%)</option>
                  {(selectedClass.isFixture || selectedClass.code === 'ROB-K14-M5-01') && (
                    <>
                      <option value="mid_storage_batch">Mô phỏng lỗi giữa các lô Storage (Dừng ở Chưa hoàn tất)</option>
                      <option value="between_storage_and_db">Mô phỏng lỗi giữa Storage và DB (Dừng ở Chưa hoàn tất)</option>
                    </>
                  )}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {(selectedClass.isFixture || selectedClass.code === 'ROB-K14-M5-01')
                    ? 'Kiểm thử khả năng chịu lỗi và tính năng Tiếp tục (Resume) của Mốc 5 trên lớp fixture.'
                    : 'Chỉ khả dụng trên lớp fixture thử nghiệm (ROB-K14-M5-01).'}
                </p>
              </div>
            </div>

            {/* Nút xác nhận đóng khóa */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
              <div className="text-[11px] text-slate-500">
                {!confirmed14Sessions
                  ? 'Chưa tích xác nhận đủ 14 buổi theo lịch.'
                  : !closePreview?.csvVerified || (csvVerificationResult && csvVerificationResult.classId !== selectedClass.id)
                  ? 'Bắt buộc phải Xuất & Tự kiểm tra CSV thành công trước khi mở nút Xóa.'
                  : !isLatestCsvOpenedConfirmed
                  ? 'Bắt buộc phải tích xác nhận đã mở và kiểm tra tệp CSV mới nhất đúng lớp/khóa trước khi mở nút Xóa.'
                  : 'Đã sẵn sàng. Thao tác xóa vĩnh viễn không thể khôi phục.'}
              </div>

              <button
                type="button"
                disabled={!closePreview?.canExecuteDelete || isClosingCourse || (csvVerificationResult && csvVerificationResult.classId !== selectedClass.id) || !isLatestCsvOpenedConfirmed}
                onClick={() => setCloseConfirmModalOpen(true)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <IconAlertTriangle className="w-4 h-4" />
                <span>Xác nhận Đóng khóa & Xóa vĩnh viễn dữ liệu cũ</span>
              </button>
            </div>
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
                Mã PIN:{' '}
                {selectedStudent.hasPin || selectedStudent.pinHash
                  ? `Đã cấp${
                      selectedStudent.pinIssuedAt
                        ? ` (${new Date(selectedStudent.pinIssuedAt).toLocaleDateString('vi-VN')})`
                        : ''
                    }`
                  : 'Chưa có PIN'}
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
                        const res = await transferStudent(selectedStudent.id, targetTransferClassId);
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
                        const res = await resetStudentProgress(selectedStudent.id);
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
                        const res = await restoreStudent(selectedStudent.id);
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
                        const res = await archiveStudent(selectedStudent.id);
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
          if (!isCreatingClass) {
            setCreateClassModalOpen(false);
            setCreateClassError(null);
          }
        }}
        title="Tạo lớp học mới"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isCreatingClass) return;
            setIsCreatingClass(true);
            setCreateClassError(null);
            const res = await createClass({
              code: newClassCode.trim().toUpperCase(),
              name: newClassName.trim(),
              courseId: newClassCourseId || null,
              teacherId: newClassTeacherId ? newClassTeacherId.trim() : null,
            });
            setIsCreatingClass(false);
            if (res.success) {
              setCreateClassModalOpen(false);
              setAlertNotice({ text: res.message, isError: false });
              setNewClassCode('');
              setNewClassName('');
              setNewClassCourseId('');
              setNewClassTeacherId('');
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
            <label htmlFor="create-class-code" className="block font-semibold text-slate-700 mb-1">
              Mã lớp học (Ví dụ: ROB-K14-04)
            </label>
            <input
              id="create-class-code"
              type="text"
              required
              disabled={isCreatingClass}
              value={newClassCode}
              onChange={(e) => setNewClassCode(e.target.value)}
              placeholder="ROB-K14-04"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="create-class-name" className="block font-semibold text-slate-700 mb-1">
              Tên lớp học
            </label>
            <input
              id="create-class-name"
              type="text"
              required
              disabled={isCreatingClass}
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Lớp Robotics K14 Chiều Thứ 5"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="create-class-teacher" className="block font-semibold text-slate-700 mb-1">
              Phân công giáo viên phụ trách (tùy chọn)
            </label>
            <select
              id="create-class-teacher"
              disabled={isCreatingClass}
              value={newClassTeacherId}
              onChange={(e) => setNewClassTeacherId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
            >
              <option value="">-- Chưa phân công giáo viên --</option>
              {teachers.map((tea) => (
                <option key={tea.id} value={tea.id}>
                  {tea.name} ({tea.email || 'Giáo viên'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="create-class-course" className="block font-semibold text-slate-700 mb-1">
              Gán khóa học 14 buổi (tùy chọn)
            </label>
            <select
              id="create-class-course"
              disabled={isCreatingClass}
              value={newClassCourseId}
              onChange={(e) => setNewClassCourseId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
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
              className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isCreatingClass}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

      {/* Modal: Edit Class & Teacher Assignment (Admin only) */}
      <Modal
        isOpen={editClassModalOpen}
        onClose={() => {
          if (!isUpdatingClass) {
            setEditClassModalOpen(false);
            setUpdateClassError(null);
          }
        }}
        title="Sửa lớp / Phân công giáo viên"
      >
        {selectedClass && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isUpdatingClass) return;
              setIsUpdatingClass(true);
              setUpdateClassError(null);
              const res = await updateClass(selectedClass.id, {
                code: editClassCode.trim().toUpperCase(),
                name: editClassName.trim(),
                teacherId: editClassTeacherId ? editClassTeacherId.trim() : null,
              });
              setIsUpdatingClass(false);
              if (res.success) {
                setEditClassModalOpen(false);
                setAlertNotice({ text: res.message, isError: false });
              } else {
                setUpdateClassError(res.message);
              }
            }}
            className="space-y-4 text-xs"
          >
            {updateClassError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <IconAlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold flex-1">{updateClassError}</span>
              </div>
            )}

            <div>
              <label htmlFor="edit-class-code" className="block font-semibold text-slate-700 mb-1">
                Mã lớp học
              </label>
              <input
                id="edit-class-code"
                type="text"
                required
                disabled={isUpdatingClass}
                value={editClassCode}
                onChange={(e) => setEditClassCode(e.target.value)}
                placeholder="Ví dụ: ROB-K14-04"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="edit-class-name" className="block font-semibold text-slate-700 mb-1">
                Tên lớp học
              </label>
              <input
                id="edit-class-name"
                type="text"
                required
                disabled={isUpdatingClass}
                value={editClassName}
                onChange={(e) => setEditClassName(e.target.value)}
                placeholder="Ví dụ: Lớp Robotics K14 Chiều Thứ 5"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
              />
            </div>

            <div>
              <label htmlFor="edit-class-teacher" className="block font-semibold text-slate-700 mb-1">
                Phân công giáo viên phụ trách
              </label>
              <select
                id="edit-class-teacher"
                disabled={isUpdatingClass}
                value={editClassTeacherId}
                onChange={(e) => setEditClassTeacherId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:opacity-70 min-h-[44px]"
              >
                <option value="">-- Chưa phân công giáo viên (Để trống) --</option>
                {teachers.map((tea) => (
                  <option key={tea.id} value={tea.id}>
                    {tea.name} ({tea.email || 'Giáo viên'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Chọn giáo viên phụ trách lớp từ danh sách tài khoản đã kích hoạt. Chọn trống để hủy phân công.
              </p>
            </div>

            <div>
              <label htmlFor="edit-class-course-info" className="block font-semibold text-slate-700 mb-1">
                Khóa học liên kết (14 buổi)
              </label>
              <input
                id="edit-class-course-info"
                type="text"
                disabled
                value={selectedCourse ? selectedCourse.title : 'Chưa gán khóa học'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed min-h-[44px]"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Gán hoặc thay đổi khóa học thuộc phạm vi Mốc 3.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                disabled={isUpdatingClass}
                onClick={() => {
                  setEditClassModalOpen(false);
                  setUpdateClassError(null);
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isUpdatingClass}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {isUpdatingClass ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  'Lưu thay đổi'
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirmation Dialog: Course Close & Permanent Wipe */}
      <ConfirmDialog
        isOpen={closeConfirmModalOpen}
        onClose={() => setCloseConfirmModalOpen(false)}
        onConfirm={() => handleExecuteClose(false)}
        title={`Xác nhận kết thúc khóa lớp ${selectedClass?.code || ''}?`}
        message={`Hành động này sẽ XÓA VĨNH VIỄN toàn bộ điểm số quiz, bài nộp thực hành, tiến độ và nhận xét của lớp ${selectedClass?.code || ''} thuộc khóa "${selectedCourse?.title || '14 buổi'}" (Mã kiểm tra CSV: ${csvVerificationResult?.sha256?.slice(0, 12) || 'N/A'}). Lưu ý tệp CSV chỉ là báo cáo tổng kết, không phải bản backup và không thể khôi phục dữ liệu đã xóa!`}
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
