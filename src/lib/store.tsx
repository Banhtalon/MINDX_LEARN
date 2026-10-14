'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Role,
  QAScenario,
  QAState,
  Course,
  Lesson,
  ClassItem,
  StudentProfile,
  QuizResult,
  PracticeSubmission,
  CourseClosePreview,
  StudentOverallProgress,
  StudentSessionSummary,
  SubmissionType,
} from './types';
import {
  initialUsers,
  initialCourses,
  initialLessons,
  initialClasses,
  initialStudents,
  initialQuizResults,
  initialSubmissions,
} from './mock-data';
import {
  validatePin,
  generate8DigitPin,
  checkPublishRule,
  calculateProgress,
  getBatchParticipants,
  buildCourseCloseCsvContent,
} from './simulation-rules';

interface SyncDiffItem {
  id: string;
  name: string;
  classCode: string;
  action: 'create' | 'update' | 'skip';
  reason?: string;
}

interface SyncDiffReport {
  added: SyncDiffItem[];
  updated: SyncDiffItem[];
  ignored: SyncDiffItem[];
  warnings: string[];
  totalValid: number;
}

interface StoreContextType {
  currentUser: User | null;
  qaState: QAState;
  users: User[];
  courses: Course[];
  lessons: Lesson[];
  classes: ClassItem[];
  students: StudentProfile[];
  quizResults: QuizResult[];
  submissions: PracticeSubmission[];

  // QA Scenario Actions
  setQAScenario: (scenario: QAScenario) => void;

  // Auth / User Actions
  login: (credentials: { email?: string; password?: string; studentCode?: string; pin?: string }) => {
    success: boolean;
    message: string;
    user?: User;
  };
  requestPasswordReset: (email: string) => { success: boolean; message: string };
  switchDemoUser: (role: Role, userId?: string) => void;
  logout: () => void;
  changeStudentPin: (studentId: string, oldPin: string, newPin: string) => { success: boolean; message: string };
  changeUserPassword: (userId: string, oldPass: string, newPass: string) => { success: boolean; message: string };

  // Class Actions
  createClass: (data: { code: string; name: string; courseId: string | null; teacherId: string | null }) => {
    success: boolean;
    message: string;
  };
  updateClass: (id: string, data: Partial<ClassItem>) => { success: boolean; message: string };
  archiveClass: (id: string) => { success: boolean; message: string };
  restoreClass: (id: string) => { success: boolean; message: string };

  // Lesson & Course Actions
  updateLesson: (id: string, data: Partial<Lesson>) => { success: boolean; message: string };
  updateCourse: (id: string, data: Partial<Course>) => { success: boolean; message: string };
  createCourse: (
    title: string,
    description?: string
  ) => {
    success: boolean;
    message: string;
    course?: Course;
  };

  // Student Actions
  updateStudent: (id: string, data: Partial<StudentProfile>) => { success: boolean; message: string };
  transferStudent: (studentId: string, targetClassId: string) => { success: boolean; message: string };
  resetStudentProgress: (studentId: string) => { success: boolean; message: string };
  archiveStudent: (studentId: string) => { success: boolean; message: string };
  restoreStudent: (studentId: string) => { success: boolean; message: string };

  // Teacher Management Actions (Admin)
  createTeacher: (data: { name: string; email: string; assignedClassIds: string[] }) => {
    success: boolean;
    message: string;
  };

  // PIN Issuance Actions (Admin only)
  issueInitialPinsForClass: (classId: string) => {
    success: boolean;
    message: string;
    csvContent?: string;
    count?: number;
  };
  reissuePinForSingleStudent: (studentId: string) => {
    success: boolean;
    message: string;
    csvContent?: string;
    pin?: string;
  };

  // Course Close & 14-Session CSV (Admin only)
  generateCourseClosePreview: (classId: string) => CourseClosePreview;
  exportCourseCloseCsv: (classId: string) => {
    success: boolean;
    message: string;
    csvContent?: string;
    rowCount?: number;
    participantCount?: number;
  };
  verifyAndExecuteCourseClose: (classId: string, confirmed14Sessions: boolean) => {
    success: boolean;
    message: string;
  };

  // Quiz & Practice Actions
  submitQuizAttempt: (
    studentId: string,
    lessonId: string,
    answers: number[]
  ) => {
    success: boolean;
    message: string;
    score: number;
    passed: boolean;
  };
  submitPractice: (
    studentId: string,
    lessonId: string,
    data: { type: SubmissionType; content: string; notes?: string; fileSizeBytes?: number }
  ) => {
    success: boolean;
    message: string;
  };
  gradeSubmission: (
    submissionId: string,
    data: { status: 'approved' | 'needs_revision'; feedback: string }
  ) => {
    success: boolean;
    message: string;
  };
  reopenSubmission: (submissionId: string) => { success: boolean; message: string };

  // Sync Actions
  previewTeachingSync: (fixtureData?: any) => { success: boolean; report?: SyncDiffReport; message?: string };
  applyTeachingSync: (diffReport: SyncDiffReport) => { success: boolean; message: string };

  // Utilities
  getStudentProgress: (studentId: string, courseId?: string) => StudentOverallProgress;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Current active user simulation
  const [currentUser, setCurrentUser] = useState<User | null>(initialUsers[0]); // Default to Admin for testing

  // QA Controller State
  const [qaState, setQaState] = useState<QAState>({
    scenario: 'normal',
    delayMs: 0,
  });

  // Domain memory data
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses);
  const [students, setStudents] = useState<StudentProfile[]>(initialStudents);
  const [quizResults, setQuizResults] = useState<QuizResult[]>(initialQuizResults);
  const [submissions, setSubmissions] = useState<PracticeSubmission[]>(initialSubmissions);

  // Helper to check and enforce QA scenario rules
  const checkQABlock = (actionName: string): { blocked: boolean; message?: string } => {
    if (qaState.scenario === 'save_error') {
      return {
        blocked: true,
        message: `[Mô phỏng lỗi lưu]: Không thể lưu thay đổi cho tác vụ "${actionName}". Thao tác đã bị hủy và dữ liệu trên máy chủ không thay đổi.`,
      };
    }
    if (qaState.scenario === 'session_expired') {
      return {
        blocked: true,
        message: `[Mô phỏng hết phiên]: Phiên làm việc của bạn đã hết hạn (401). Vui lòng đăng nhập lại.`,
      };
    }
    if (qaState.scenario === 'forbidden') {
      return {
        blocked: true,
        message: `[Mô phỏng thiếu quyền]: Bạn không có quyền (403) thực hiện tác vụ "${actionName}".`,
      };
    }
    if (qaState.scenario === 'network_error') {
      return {
        blocked: true,
        message: `[Mô phỏng mất kết nối]: Lỗi kết nối mạng. Vui lòng kiểm tra đường truyền và thử lại.`,
      };
    }
    return { blocked: false };
  };

  const setQAScenario = (scenario: QAScenario) => {
    if (scenario === 'session_expired') {
      setCurrentUser(null);
    }
    setQaState({
      scenario,
      delayMs: scenario === 'loading' ? 2000 : 0,
    });
  };

  // Auth / Login simulation
  const login = (credentials: {
    email?: string;
    password?: string;
    studentCode?: string;
    pin?: string;
  }) => {
    if (qaState.scenario === 'session_expired') {
      setQaState({ scenario: 'normal', delayMs: 0 });
    } else {
      const qaCheck = checkQABlock('Đăng nhập');
      if (qaCheck.blocked && qaState.scenario !== 'normal') {
        return { success: false, message: qaCheck.message! };
      }
    }

    // Student Login
    if (credentials.studentCode) {
      const code = credentials.studentCode.trim().toUpperCase();
      const pin = credentials.pin?.trim();

      const student = students.find((s) => s.studentCode.toUpperCase() === code);
      if (!student || student.status === 'archived') {
        return {
          success: false,
          message: 'Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.',
        };
      }

      // Check PIN: 8 digits
      if (!pin || pin.length !== 8) {
        return {
          success: false,
          message: 'Mã PIN học sinh phải gồm đúng 8 chữ số.',
        };
      }

      // Demo validation: in TEST, student with PIN can login with any 8 digits or test PIN
      if (!student.pinHash) {
        return {
          success: false,
          message: 'Tài khoản học sinh này chưa được cấp mã PIN. Vui lòng liên hệ Admin/Giáo viên.',
        };
      }

      const user = users.find((u) => u.studentCode?.toUpperCase() === code) || {
        id: student.id,
        name: student.fullName,
        studentCode: student.studentCode,
        role: 'student' as Role,
        status: 'active' as const,
      };

      setCurrentUser(user);
      return { success: true, message: 'Đăng nhập học sinh thành công (Dữ liệu giả).', user };
    }

    // Admin / Teacher Login
    if (credentials.email) {
      const email = credentials.email.trim().toLowerCase();
      const user = users.find((u) => u.email?.toLowerCase() === email);

      if (!user || user.status === 'archived') {
        return {
          success: false,
          message: 'Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa kích hoạt.',
        };
      }

      if (!credentials.password || credentials.password.length < 6) {
        return {
          success: false,
          message: 'Mật khẩu không hợp lệ.',
        };
      }

      setCurrentUser(user);
      return { success: true, message: `Đăng nhập thành công với vai trò ${user.role}.`, user };
    }

    return { success: false, message: 'Vui lòng nhập đầy đủ thông tin đăng nhập.' };
  };

  const requestPasswordReset = (email: string) => {
    const qaCheck = checkQABlock('Yêu cầu đặt lại mật khẩu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    return {
      success: true,
      message: `[Mô phỏng]: Nếu email ${email} tồn tại trong hệ thống, liên kết đặt lại mật khẩu an toàn đã được gửi. (Mô phỏng không gửi email thật).`,
    };
  };

  const switchDemoUser = (role: Role, userId?: string) => {
    if (qaState.scenario === 'session_expired') {
      setQaState({ scenario: 'normal', delayMs: 0 });
    }
    if (userId) {
      const target = users.find((u) => u.id === userId);
      if (target) {
        setCurrentUser(target);
        return;
      }
    }
    const match = users.find((u) => u.role === role);
    if (match) setCurrentUser(match);
  };

  const logout = () => {
    if (qaState.scenario === 'session_expired') {
      setQaState({ scenario: 'normal', delayMs: 0 });
    }
    setCurrentUser(null);
  };

  const changeStudentPin = (studentId: string, oldPin: string, newPin: string) => {
    const qaCheck = checkQABlock('Đổi mã PIN');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const pinCheck = validatePin(newPin);
    if (!pinCheck.valid) {
      return { success: false, message: pinCheck.message! };
    }

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, pinHash: `HASH_${newPin}`, pinIssuedAt: new Date().toISOString() } : s))
    );

    return { success: true, message: 'Đổi mã PIN 8 chữ số thành công (Mô phỏng).' };
  };

  const changeUserPassword = (userId: string, _oldPass: string, newPass: string) => {
    const qaCheck = checkQABlock('Đổi mật khẩu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (newPass.length < 8) {
      return { success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' };
    }
    return { success: true, message: 'Đổi mật khẩu tài khoản thành công (Mô phỏng).' };
  };

  // Class Actions
  const createClass = (data: { code: string; name: string; courseId: string | null; teacherId: string | null }) => {
    const qaCheck = checkQABlock('Tạo lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (!data.code.trim() || !data.name.trim()) {
      return { success: false, message: 'Mã lớp và tên lớp không được để trống.' };
    }

    const newClass: ClassItem = {
      id: `cls_${Date.now()}`,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      courseId: data.courseId,
      teacherId: data.teacherId,
      status: 'active',
      is14SessionsConfirmed: false,
    };

    setClasses((prev) => [newClass, ...prev]);
    return { success: true, message: `Tạo lớp "${newClass.code}" thành công (Mô phỏng).` };
  };

  const updateClass = (id: string, data: Partial<ClassItem>) => {
    const qaCheck = checkQABlock('Cập nhật lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    return { success: true, message: 'Cập nhật thông tin lớp học thành công (Mô phỏng).' };
  };

  const archiveClass = (id: string) => {
    const qaCheck = checkQABlock('Lưu trữ lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'archived' } : c)));
    return { success: true, message: 'Đã lưu trữ lớp học. Quyền truy cập tạm khóa (Mô phỏng).' };
  };

  const restoreClass = (id: string) => {
    const qaCheck = checkQABlock('Khôi phục lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'active' } : c)));
    return { success: true, message: 'Đã khôi phục lớp học hoạt động trở lại (Mô phỏng).' };
  };

  // Lesson & Course Actions
  const updateLesson = (id: string, data: Partial<Lesson>) => {
    const qaCheck = checkQABlock('Lưu bài học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const targetLesson = lessons.find((l) => l.id === id);
    if (!targetLesson) return { success: false, message: 'Không tìm thấy bài học.' };

    const nextHasQuiz = data.hasQuiz !== undefined ? data.hasQuiz : targetLesson.hasQuiz;
    const nextHasPractice = data.hasPractice !== undefined ? data.hasPractice : targetLesson.hasPractice;
    const nextStatus = data.status !== undefined ? data.status : targetLesson.status;

    // RULE: "Chặn xuất bản chỉ lý thuyết":
    const publishCheck = checkPublishRule(nextStatus, nextHasQuiz, nextHasPractice);
    if (!publishCheck.allowed) {
      return {
        success: false,
        message: publishCheck.message!,
      };
    }

    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
    return { success: true, message: `Lưu bài Buổi ${targetLesson.sessionNumber} thành công (Mô phỏng).` };
  };

  const updateCourse = (id: string, data: Partial<Course>) => {
    const qaCheck = checkQABlock('Cập nhật khóa học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền cập nhật khóa học.' };
    }

    if (data.title !== undefined && !data.title.trim()) {
      return { success: false, message: 'Tiêu đề khóa học không được để trống.' };
    }

    setCourses((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              ...data,
              ...(data.title !== undefined ? { title: data.title.trim() } : {}),
              ...(data.description !== undefined ? { description: data.description.trim() } : {}),
            }
          : c
      )
    );
    return { success: true, message: 'Cập nhật khóa học thành công (đã lưu trong dữ liệu giả).' };
  };

  const createCourse = (title: string, description: string = '') => {
    const qaCheck = checkQABlock('Tạo khóa học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền tạo khóa học.' };
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { success: false, message: 'Tiêu đề khóa học không được để trống.' };
    }

    const newCourseId = `crs_${Date.now()}`;
    const newCourse: Course = {
      id: newCourseId,
      title: cleanTitle,
      description: description.trim() || 'Khóa học mẫu mới (Dữ liệu giả)',
      totalSessions: 14,
      createdAt: new Date().toISOString(),
    };

    const newLessons: Lesson[] = Array.from({ length: 14 }, (_, idx) => {
      const sessionNumber = idx + 1;
      return {
        id: `les_${newCourseId}_${sessionNumber.toString().padStart(2, '0')}`,
        courseId: newCourseId,
        sessionNumber,
        title: `Buổi ${sessionNumber}: Bài học mẫu ${sessionNumber} (Dữ liệu giả)`,
        description: `Nội dung học tập mẫu cho buổi ${sessionNumber} (Dữ liệu giả).`,
        materials: `### Tài liệu học tập Buổi ${sessionNumber} (Dữ liệu giả)\n- Nội dung tài liệu bài học mẫu.`,
        videoUrl: '',
        status: 'draft' as const,
        hasQuiz: false,
        hasPractice: false,
        practiceMode: 'link_only' as const,
        questions: [],
      };
    });

    setCourses((prev) => [...prev, newCourse]);
    setLessons((prev) => [...prev, ...newLessons]);

    return {
      success: true,
      message: `Tạo khóa "${newCourse.title}" thành công (đã lưu trong dữ liệu giả).`,
      course: newCourse,
    };
  };

  // Student Actions
  const updateStudent = (id: string, data: Partial<StudentProfile>) => {
    const qaCheck = checkQABlock('Cập nhật học sinh');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    return { success: true, message: 'Cập nhật thông tin học sinh thành công (Mô phỏng).' };
  };

  const transferStudent = (studentId: string, targetClassId: string) => {
    const qaCheck = checkQABlock('Chuyển lớp học sinh');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const targetClass = classes.find((c) => c.id === targetClassId);
    if (!targetClass) return { success: false, message: 'Lớp đích không tồn tại.' };

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            currentClassId: targetClassId,
            status: 'active',
            notes: `${s.notes || ''} [Đã chuyển sang lớp ${targetClass.code}]`.trim(),
          };
        }
        return s;
      })
    );

    return {
      success: true,
      message: `Đã chuyển học sinh sang lớp ${targetClass.code}. Hồ sơ và tiến độ cũ trong đợt trước vẫn được lưu giữ an toàn.`,
    };
  };

  const resetStudentProgress = (studentId: string) => {
    const qaCheck = checkQABlock('Đặt lại kết quả học tập');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setQuizResults((prev) => prev.filter((q) => q.studentId !== studentId));
    setSubmissions((prev) => prev.filter((sub) => sub.studentId !== studentId));

    return { success: true, message: 'Đã đặt lại toàn bộ kết quả quiz và bài thực hành của học sinh (Mô phỏng).' };
  };

  const archiveStudent = (studentId: string) => {
    const qaCheck = checkQABlock('Lưu trữ học sinh');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: 'archived' } : s)));
    return { success: true, message: 'Đã lưu trữ hồ sơ học sinh. Tài khoản bị tạm khóa phiên (Mô phỏng).' };
  };

  const restoreStudent = (studentId: string) => {
    const qaCheck = checkQABlock('Khôi phục học sinh');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: 'active' } : s)));
    return { success: true, message: 'Đã khôi phục tài khoản học sinh (Mô phỏng).' };
  };

  // Teacher Management (Admin)
  const createTeacher = (data: { name: string; email: string; assignedClassIds: string[] }) => {
    const qaCheck = checkQABlock('Tạo tài khoản giáo viên');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (!data.name.trim() || !data.email.trim()) {
      return { success: false, message: 'Họ tên và email giáo viên không được để trống.' };
    }

    const newTeacher: User = {
      id: `usr_tea_${Date.now()}`,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      role: 'teacher',
      status: 'active',
      assignedClassIds: data.assignedClassIds,
    };

    setUsers((prev) => [...prev, newTeacher]);
    return {
      success: true,
      message: `Đã tạo giáo viên "${newTeacher.name}". [Mô phỏng]: Đã gửi liên kết đặt mật khẩu tới email ${newTeacher.email}.`,
    };
  };

  // PIN Issuance Actions (Admin only)

  const issueInitialPinsForClass = (classId: string) => {
    const qaCheck = checkQABlock('Cấp PIN lần đầu cho lớp');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền cấp mã PIN học sinh.' };
    }

    const cls = classes.find((c) => c.id === classId);
    if (!cls) return { success: false, message: 'Lớp học không tồn tại.' };

    // Filter students in class with NO PIN yet
    const targetStudents = students.filter(
      (s) => s.currentClassId === classId && s.pinHash === null && s.status === 'active'
    );

    if (targetStudents.length === 0) {
      return {
        success: false,
        message: 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.',
      };
    }

    const pinPairs: { student: StudentProfile; pin: string }[] = targetStudents.map((s) => ({
      student: s,
      pin: generate8DigitPin(),
    }));

    // Generate one-time CSV
    const csvHeader = 'Mã học sinh,Họ và tên,Lớp,Mã PIN tạm thời,Thời gian cấp,Ghi chú\n';
    const csvRows = pinPairs
      .map(
        (p) =>
          `"${p.student.studentCode}","${p.student.fullName}","${cls.code}","${p.pin}","${new Date().toISOString()}","Cấp PIN lần đầu - Người nhận tự bảo quản"`
      )
      .join('\n');
    const csvContent = csvHeader + csvRows;

    // Update students state with simulated hash
    const updatedIds = new Set(targetStudents.map((s) => s.id));
    setStudents((prev) =>
      prev.map((s) => {
        if (updatedIds.has(s.id)) {
          const pair = pinPairs.find((p) => p.student.id === s.id);
          return {
            ...s,
            pinHash: `HASH_${pair?.pin}`,
            pinIssuedAt: new Date().toISOString(),
          };
        }
        return s;
      })
    );

    return {
      success: true,
      message: `Đã cấp PIN 8 chữ số thành công cho ${targetStudents.length} học sinh chưa có PIN. Tệp CSV một lần đã được chuẩn bị.`,
      csvContent,
      count: targetStudents.length,
    };
  };

  const reissuePinForSingleStudent = (studentId: string) => {
    const qaCheck = checkQABlock('Cấp lại PIN cho học sinh');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền cấp lại mã PIN học sinh.' };
    }

    const student = students.find((s) => s.id === studentId);
    if (!student) return { success: false, message: 'Không tìm thấy học sinh.' };

    const newPin = generate8DigitPin();
    const cls = classes.find((c) => c.id === student.currentClassId);

    const csvContent =
      'Mã học sinh,Họ và tên,Lớp,Mã PIN mới,Thời gian cấp,Ghi chú\n' +
      `"${student.studentCode}","${student.fullName}","${cls?.code || ''}","${newPin}","${new Date().toISOString()}","Cấp lại riêng 1 học sinh - PIN cũ đã bị vô hiệu hóa"`;

    // Only update this student
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              pinHash: `HASH_${newPin}`,
              pinIssuedAt: new Date().toISOString(),
            }
          : s
      )
    );

    return {
      success: true,
      message: `Đã cấp lại PIN mới cho riêng học sinh ${student.fullName}. PIN cũ đã hết hiệu lực.`,
      csvContent,
      pin: newPin,
    };
  };

  // Course Close & 14-Session CSV (Admin only)
  const generateCourseClosePreview = (classId: string): CourseClosePreview => {
    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);

    // Retrieve ALL students who ever participated in this class batch
    // (originalClassId === classId OR currentClassId === classId)
    const batchStudents = getBatchParticipants(students, classId);

    const blockErrors: string[] = [];
    const warnings: string[] = [];

    if (currentUser?.role !== 'admin') {
      blockErrors.push('Người dùng hiện tại không có quyền Quản trị viên (Admin).');
    }
    if (!cls || !crs) {
      blockErrors.push('Lớp học chưa được gán khóa học hoặc phạm vi dữ liệu không hợp lệ.');
    }
    if (qaState.scenario === 'network_error') {
      blockErrors.push('Đang có lỗi kết nối mạng máy chủ (Mô phỏng).');
    }

    // Check progress
    let pendingGradingCount = 0;
    let missingSubmissionsCount = 0;
    let incompleteLessonsCount = 0;

    batchStudents.forEach((st) => {
      lessons.forEach((les) => {
        const sub = submissions.find((sub) => sub.studentId === st.id && sub.lessonId === les.id);
        const quiz = quizResults.find((q) => q.studentId === st.id && q.lessonId === les.id);

        if (les.hasPractice) {
          if (!sub) missingSubmissionsCount++;
          else if (sub.status === 'submitted') pendingGradingCount++;
        }
        const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
        const practicePass = les.hasPractice ? (sub?.status === 'approved') : true;

        if (!quizPass || !practicePass) {
          incompleteLessonsCount++;
        }
      });
    });

    if (pendingGradingCount > 0) {
      warnings.push(`Còn ${pendingGradingCount} bài thực hành đang chờ giáo viên chấm.`);
    }
    if (missingSubmissionsCount > 0) {
      warnings.push(`Có ${missingSubmissionsCount} lượt bài học sinh chưa nộp thực hành.`);
    }
    if (incompleteLessonsCount > 0) {
      warnings.push(`Có ${incompleteLessonsCount} lượt bài chưa hoàn tất (chưa đạt quiz hoặc thực hành).`);
    }

    const isConfirmed = Boolean(cls?.is14SessionsConfirmed);
    if (!isConfirmed) {
      blockErrors.push('Admin chưa đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch trình.');
    }

    return {
      classId,
      className: cls?.name || 'Không xác định',
      courseId: crs?.id || '',
      courseName: crs?.title || 'Chưa gán khóa',
      totalParticipants: batchStudents.length,
      quizResultsCount: quizResults.filter((q) => batchStudents.some((st) => st.id === q.studentId)).length,
      submissionsCount: submissions.filter((s) => batchStudents.some((st) => st.id === s.studentId)).length,
      pendingGradingCount,
      incompleteLessonsCount,
      isSchedule14Confirmed: isConfirmed,
      canExecute: blockErrors.length === 0,
      blockErrors,
      warnings,
    };
  };

  const exportCourseCloseCsv = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);

    if (!cls || !crs) {
      return { success: false, message: 'Không tìm thấy lớp học hoặc khóa học liên kết.' };
    }

    const batchStudents = getBatchParticipants(students, classId);

    return buildCourseCloseCsvContent(
      batchStudents,
      lessons,
      cls.code,
      quizResults,
      submissions
    );
  };

  const verifyAndExecuteCourseClose = (classId: string, confirmed14Sessions: boolean) => {
    const qaCheck = checkQABlock('Đóng khóa học và xóa dữ liệu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền đóng khóa và xóa dữ liệu.' };
    }

    if (!confirmed14Sessions) {
      return { success: false, message: 'Admin phải đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch.' };
    }

    const cls = classes.find((c) => c.id === classId);
    if (!cls) return { success: false, message: 'Không tìm thấy lớp học.' };

    const batchStudents = getBatchParticipants(students, classId);
    const batchStudentIds = new Set(batchStudents.map((s) => s.id));

    // Permanently wipe quiz results and submissions belonging to this batch
    setQuizResults((prev) => prev.filter((q) => !batchStudentIds.has(q.studentId)));
    setSubmissions((prev) => prev.filter((s) => !batchStudentIds.has(s.studentId)));

    // Update class status
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId
          ? {
              ...c,
              status: 'completed',
              courseId: null, // Ready for a new course to be assigned
              is14SessionsConfirmed: false,
            }
          : c
      )
    );

    return {
      success: true,
      message: `Đã đóng khóa và xóa vĩnh viễn dữ liệu điểm/bài nộp của lớp ${cls.code}. Tài khoản học sinh và nội dung bài học được bảo toàn an toàn. Lớp hiện ở trạng thái sẵn sàng gán khóa mới.`,
    };
  };

  // Quiz Attempt Submission
  const submitQuizAttempt = (studentId: string, lessonId: string, answers: number[]) => {
    const qaCheck = checkQABlock('Nộp bài trắc nghiệm Quiz');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message!, score: 0, passed: false };

    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson || !lesson.hasQuiz || lesson.questions.length === 0) {
      return { success: false, message: 'Bài học không có quiz.', score: 0, passed: false };
    }

    let correctCount = 0;
    lesson.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / lesson.questions.length) * 100);
    const passed = score >= 70;

    setQuizResults((prev) => {
      const existing = prev.find((r) => r.studentId === studentId && r.lessonId === lessonId);
      if (existing) {
        const newHighest = Math.max(existing.highestScore, score);
        return prev.map((r) =>
          r.studentId === studentId && r.lessonId === lessonId
            ? {
                ...r,
                highestScore: newHighest,
                attemptsCount: r.attemptsCount + 1,
                passed: newHighest >= 70,
                lastAttemptAt: new Date().toISOString(),
              }
            : r
        );
      }
      return [
        ...prev,
        {
          studentId,
          lessonId,
          highestScore: score,
          attemptsCount: 1,
          passed,
          lastAttemptAt: new Date().toISOString(),
        },
      ];
    });

    return {
      success: true,
      message: `Đã nộp bài Quiz! Điểm lần này: ${score}%. ${passed ? 'Chúc mừng bạn đã ĐẠT (>= 70%)!' : 'Chưa đạt 70%. Bạn có thể làm lại không giới hạn!'}`,
      score,
      passed,
    };
  };

  // Practice Submission
  const submitPractice = (
    studentId: string,
    lessonId: string,
    data: { type: SubmissionType; content: string; notes?: string; fileSizeBytes?: number }
  ) => {
    const qaCheck = checkQABlock('Nộp bài thực hành');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson || !lesson.hasPractice) {
      return { success: false, message: 'Buổi học này không yêu cầu thực hành.' };
    }

    if (data.type === 'file' && (data.fileSizeBytes || 0) > 2 * 1024 * 1024) {
      return { success: false, message: 'Dung lượng tệp vượt quá giới hạn 2 MB cho phép.' };
    }

    const existing = submissions.find((s) => s.studentId === studentId && s.lessonId === lessonId);
    if (existing && existing.status === 'approved' && !existing.canResubmit) {
      return {
        success: false,
        message: 'Bài nộp đã được giáo viên duyệt Đạt. Vui lòng liên hệ giáo viên để mở lại quyền nộp bài nếu cần thay đổi.',
      };
    }

    if (existing) {
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === existing.id
            ? {
                ...s,
                type: data.type,
                content: data.content,
                notes: data.notes,
                fileSizeBytes: data.fileSizeBytes,
                status: 'submitted',
                submittedAt: new Date().toISOString(),
              }
            : s
        )
      );
    } else {
      const newSub: PracticeSubmission = {
        id: `sub_${Date.now()}`,
        studentId,
        lessonId,
        type: data.type,
        content: data.content,
        notes: data.notes,
        fileSizeBytes: data.fileSizeBytes,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        canResubmit: true,
      };
      setSubmissions((prev) => [newSub, ...prev]);
    }

    return { success: true, message: 'Nộp bài thực hành thành công. Bài đang chờ giáo viên chấm (Mô phỏng).' };
  };

  const gradeSubmission = (
    submissionId: string,
    data: { status: 'approved' | 'needs_revision'; feedback: string }
  ) => {
    const qaCheck = checkQABlock('Chấm bài thực hành');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              status: data.status,
              teacherFeedback: data.feedback,
              gradedAt: new Date().toISOString(),
              gradedBy: currentUser?.id,
              canResubmit: data.status === 'approved' ? false : true,
            }
          : s
      )
    );

    return {
      success: true,
      message: `Đã lưu kết quả chấm bài (${data.status === 'approved' ? 'Đạt' : 'Cần làm lại'}).`,
    };
  };

  const reopenSubmission = (submissionId: string) => {
    const qaCheck = checkQABlock('Mở lại quyền nộp bài');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setSubmissions((prev) =>
      prev.map((s) => (s.id === submissionId ? { ...s, canResubmit: true } : s))
    );
    return { success: true, message: 'Đã mở lại quyền nộp bài cho học sinh.' };
  };

  // Sync Actions UI-08
  const previewTeachingSync = (fixtureData?: any) => {
    const qaCheck = checkQABlock('Đồng bộ Teaching MindX');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const data = fixtureData?.data || [];
    const added: SyncDiffItem[] = [];
    const updated: SyncDiffItem[] = [];
    const ignored: SyncDiffItem[] = [];
    const warnings: string[] = [];

    // Filter rule: class code contains 'ROB' (case insensitive), active student, running class
    data.forEach((item: any) => {
      const classCode = (item.class_code || '').toUpperCase();
      const isRob = classCode.includes('ROB');
      const isRunning = (item.class_status || '').toLowerCase() === 'running';
      const isStudying = (item.status || '').toLowerCase().includes('đang học');

      if (!isRob) {
        ignored.push({
          id: item.id,
          name: item.student_name,
          classCode: item.class_code,
          action: 'skip',
          reason: 'Mã lớp không chứa tiền tố ROB',
        });
        return;
      }

      if (!isRunning || !isStudying) {
        ignored.push({
          id: item.id,
          name: item.student_name,
          classCode: item.class_code,
          action: 'skip',
          reason: `Trạng thái không hoạt động (HS: ${item.status}, Lớp: ${item.class_status})`,
        });
        return;
      }

      // Check if student exists
      const existing = students.find((s) => s.studentCode === item.id);
      if (existing) {
        updated.push({
          id: item.id,
          name: item.student_name,
          classCode: item.class_code,
          action: 'update',
          reason: 'Cập nhật thông tin học sinh hiện có',
        });
      } else {
        added.push({
          id: item.id,
          name: item.student_name,
          classCode: item.class_code,
          action: 'create',
          reason: 'Học sinh mới từ nguồn đồng bộ',
        });
      }
    });

    if (added.length === 0 && updated.length === 0) {
      warnings.push('Không có học sinh hợp lệ nào cần thêm hoặc cập nhật trong đợt này.');
    }

    const report: SyncDiffReport = {
      added,
      updated,
      ignored,
      warnings,
      totalValid: added.length + updated.length,
    };

    return { success: true, report };
  };

  const applyTeachingSync = (diffReport: SyncDiffReport) => {
    const qaCheck = checkQABlock('Áp dụng đồng bộ dữ liệu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    // Apply added
    const newStudents: StudentProfile[] = diffReport.added.map((item, idx) => {
      // Find or assign class
      const cls = classes.find((c) => c.code === item.classCode) || classes[0];
      return {
        id: `stu_sync_${Date.now()}_${idx}`,
        participantId: `PART_SYNC_${item.id}`,
        studentCode: item.id,
        fullName: item.name,
        currentClassId: cls.id,
        originalClassId: cls.id,
        pinHash: null, // Sync NEVER auto-issues PINs!
        pinIssuedAt: null,
        status: 'active',
        notes: 'Được đồng bộ từ fixture Teaching (Mô phỏng)',
      };
    });

    setStudents((prev) => [...prev, ...newStudents]);

    return {
      success: true,
      message: `Đã áp dụng đồng bộ thành công: Thêm ${newStudents.length} học sinh mới vào danh sách TEST. (Đồng bộ không tự cấp mã PIN).`,
    };
  };

  // Student progress calculation helper
  const getStudentProgress = (studentId: string, courseId = 'crs_rob_k14'): StudentOverallProgress => {
    const sortedLessons = [...lessons]
      .filter((l) => l.courseId === courseId)
      .sort((a, b) => a.sessionNumber - b.sessionNumber);

    const summaries: StudentSessionSummary[] = sortedLessons.map((les) => {
      const quiz = quizResults.find((q) => q.studentId === studentId && q.lessonId === les.id);
      const sub = submissions.find((s) => s.studentId === studentId && s.lessonId === les.id);

      const quizPassed = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePassed = les.hasPractice ? (sub?.status === 'approved') : true;

      const isCompleted = quizPassed && practicePassed;

      return {
        sessionNumber: les.sessionNumber,
        lessonTitle: les.title,
        lessonStatus: les.status,
        hasQuiz: les.hasQuiz,
        quizScore: quiz ? quiz.highestScore : null,
        quizPassed,
        hasPractice: les.hasPractice,
        practiceStatus: sub ? sub.status : 'not_submitted',
        practicePassed,
        isCompleted,
      };
    });

    const completedCount = summaries.filter((s) => s.isCompleted).length;
    // Always out of 14 sessions: (X / 14) * 100%
    const progress = calculateProgress(completedCount, 14);

    return {
      studentId,
      completedSessionsCount: progress.completedCount,
      percentage: progress.percentage,
      sessions: summaries,
    };
  };

  return (
    <StoreContext.Provider
      value={{
        currentUser,
        qaState,
        users: qaState.scenario === 'empty_data' ? [] : users,
        courses: qaState.scenario === 'empty_data' ? [] : courses,
        lessons: qaState.scenario === 'empty_data' ? [] : lessons,
        classes: qaState.scenario === 'empty_data' ? [] : classes,
        students: qaState.scenario === 'empty_data' ? [] : students,
        quizResults: qaState.scenario === 'empty_data' ? [] : quizResults,
        submissions: qaState.scenario === 'empty_data' ? [] : submissions,
        setQAScenario,
        login,
        requestPasswordReset,
        switchDemoUser,
        logout,
        changeStudentPin,
        changeUserPassword,
        createClass,
        updateClass,
        archiveClass,
        restoreClass,
        updateLesson,
        updateCourse,
        createCourse,
        updateStudent,
        transferStudent,
        resetStudentProgress,
        archiveStudent,
        restoreStudent,
        createTeacher,
        issueInitialPinsForClass,
        reissuePinForSingleStudent,
        generateCourseClosePreview,
        exportCourseCloseCsv,
        verifyAndExecuteCourseClose,
        submitQuizAttempt,
        submitPractice,
        gradeSubmission,
        reopenSubmission,
        previewTeachingSync,
        applyTeachingSync,
        getStudentProgress,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
