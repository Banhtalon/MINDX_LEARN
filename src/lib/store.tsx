'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

export interface SyncDiffItem {
  id: string;
  name: string;
  classCode: string;
  action: 'create' | 'update' | 'skip';
  reason?: string;
}

export interface SyncDiffReport {
  added: SyncDiffItem[];
  updated: SyncDiffItem[];
  ignored: SyncDiffItem[];
  warnings: string[];
  totalValid: number;
}

export interface LogoutResult {
  success: boolean;
  serverConfirmed: boolean;
  message: string;
  warning?: string | null;
}

export interface StoreContextType {
  currentUser: User | null;
  qaState: QAState;
  isLiveMode: boolean;
  isLoadingSession: boolean;
  bootstrapError: string | null;
  retryBootstrap: () => Promise<void>;
  logoutWarning: string | null;
  clearLogoutWarning: () => void;
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
  login: (credentials: { email?: string; password?: string; studentCode?: string; pin?: string }) => Promise<{
    success: boolean;
    message: string;
    user?: User;
  }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  switchDemoUser: (role: Role, userId?: string) => void;
  logout: () => Promise<LogoutResult>;
  changeStudentPin: (studentId: string, oldPin: string, newPin: string) => Promise<{ success: boolean; message: string }>;
  changeUserPassword: (userId: string, oldPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;

  // Class Actions
  createClass: (data: { code: string; name: string; courseId: string | null; teacherId: string | null }) => Promise<{
    success: boolean;
    message: string;
  }>;
  updateClass: (id: string, data: Partial<ClassItem>) => Promise<{ success: boolean; message: string }>;
  archiveClass: (id: string) => Promise<{ success: boolean; message: string }>;
  restoreClass: (id: string) => Promise<{ success: boolean; message: string }>;

  // Lesson & Course Actions
  updateLesson: (id: string, data: Partial<Lesson>) => Promise<{ success: boolean; message: string }>;
  updateCourse: (id: string, data: Partial<Course>) => Promise<{ success: boolean; message: string }>;
  createCourse: (
    title: string,
    description?: string
  ) => Promise<{
    success: boolean;
    message: string;
    course?: Course;
  }>;

  // Student Actions
  updateStudent: (id: string, data: Partial<StudentProfile>) => Promise<{ success: boolean; message: string }>;
  transferStudent: (studentId: string, targetClassId: string) => Promise<{ success: boolean; message: string }>;
  resetStudentProgress: (studentId: string) => Promise<{ success: boolean; message: string }>;
  archiveStudent: (studentId: string) => Promise<{ success: boolean; message: string }>;
  restoreStudent: (studentId: string) => Promise<{ success: boolean; message: string }>;

  // Teacher Management Actions (Admin)
  createTeacher: (data: { name: string; email: string; assignedClassIds: string[] }) => Promise<{
    success: boolean;
    message: string;
  }>;

  // PIN Issuance Actions (Admin only)
  issueInitialPinsForClass: (classId: string) => Promise<{
    success: boolean;
    message: string;
    csvContent?: string;
    count?: number;
  }>;
  reissuePinForSingleStudent: (studentId: string) => Promise<{
    success: boolean;
    message: string;
    csvContent?: string;
    pin?: string;
  }>;

  // Course Close & 14-Session CSV (Admin only)
  generateCourseClosePreview: (classId: string) => CourseClosePreview;
  exportCourseCloseCsv: (classId: string) => Promise<{
    success: boolean;
    message: string;
    csvContent?: string;
    rowCount?: number;
    participantCount?: number;
  }>;
  verifyAndExecuteCourseClose: (classId: string, confirmed14Sessions: boolean) => Promise<{
    success: boolean;
    message: string;
  }>;

  // Quiz & Practice Actions
  submitQuizAttempt: (
    studentId: string,
    lessonId: string,
    answers: number[]
  ) => Promise<{
    success: boolean;
    message: string;
    score: number;
    passed: boolean;
  }>;
  submitPractice: (
    studentId: string,
    lessonId: string,
    data: { type: SubmissionType; content: string; notes?: string; fileSizeBytes?: number }
  ) => Promise<{
    success: boolean;
    message: string;
  }>;
  gradeSubmission: (
    submissionId: string,
    data: { status: 'approved' | 'needs_revision'; feedback: string }
  ) => Promise<{
    success: boolean;
    message: string;
  }>;
  reopenSubmission: (submissionId: string) => Promise<{ success: boolean; message: string }>;

  // Sync Actions
  previewTeachingSync: (fixtureData?: any) => Promise<{ success: boolean; report?: SyncDiffReport; message?: string }>;
  applyTeachingSync: (diffReport: SyncDiffReport) => Promise<{ success: boolean; message: string }>;

  // Utilities
  getStudentProgress: (studentId: string, courseId?: string) => StudentOverallProgress;
  refreshData: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Mode detection: explicit demo env variable only
  const isLiveMode = process.env.NEXT_PUBLIC_MINDX_DEMO !== '1';

  // State: in live mode, start unauthenticated (null), never auto-Admin!
  const [currentUser, setCurrentUser] = useState<User | null>(
    isLiveMode ? null : initialUsers[0]
  );
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(isLiveMode);

  // QA Controller State (Active only in demo mode)
  const [qaState, setQaState] = useState<QAState>({
    scenario: 'normal',
    delayMs: 0,
  });

  // Domain data
  const [users, setUsers] = useState<User[]>(isLiveMode ? [] : initialUsers);
  const [courses, setCourses] = useState<Course[]>(isLiveMode ? [] : initialCourses);
  const [lessons, setLessons] = useState<Lesson[]>(isLiveMode ? [] : initialLessons);
  const [classes, setClasses] = useState<ClassItem[]>(isLiveMode ? [] : initialClasses);
  const [students, setStudents] = useState<StudentProfile[]>(isLiveMode ? [] : initialStudents);
  const [quizResults, setQuizResults] = useState<QuizResult[]>(isLiveMode ? [] : initialQuizResults);
  const [submissions, setSubmissions] = useState<PracticeSubmission[]>(isLiveMode ? [] : initialSubmissions);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);

  const clearLogoutWarning = useCallback(() => {
    setLogoutWarning(null);
  }, []);


  // Fetch bootstrap data from real server in live mode
  const fetchBootstrapData = useCallback(async () => {
    if (!isLiveMode) return;
    try {
      const res = await fetch('/api/m2/bootstrap', { cache: 'no-store' });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !data.success) {
        setBootstrapError(data?.message || 'Không thể tải dữ liệu từ máy chủ. Vui lòng bấm Thử lại.');
        return;
      }

      const d = data.data;
      if (!d || typeof d !== 'object') {
        setBootstrapError('Cấu trúc dữ liệu máy chủ không hợp lệ.');
        return;
      }

      if (d.currentUser) setCurrentUser(d.currentUser);
      if (Array.isArray(d.classes)) setClasses(d.classes);
      if (Array.isArray(d.users)) setUsers(d.users);
      if (Array.isArray(d.students)) {
        const mappedStudents: StudentProfile[] = d.students.map((s: any) => ({
          id: s.id,
          participantId: s.participantId || s.participant_id || `PART_${s.id}`,
          studentCode: s.studentCode || s.student_code || '',
          fullName: s.fullName || s.full_name || '',
          currentClassId: s.currentClassId || s.current_class_id || '',
          originalClassId: s.originalClassId || s.original_class_id || '',
          pinHash: null, // Never stored in client
          hasPin: Boolean(s.hasPin || s.has_pin || s.pinIssuedAt || s.pin_issued_at),
          pinIssuedAt: s.pinIssuedAt || s.pin_issued_at || null,
          status: s.status || 'active',
          notes: s.notes || '',
        }));
        setStudents(mappedStudents);
      }
      // Courses, lessons, submissions locked/empty for M3
      if (Array.isArray(d.courses)) setCourses(d.courses);
      if (Array.isArray(d.lessons)) setLessons(d.lessons);
      if (Array.isArray(d.quizResults)) setQuizResults(d.quizResults);
      if (Array.isArray(d.submissions)) setSubmissions(d.submissions);

      setBootstrapError(null);
    } catch {
      setBootstrapError('Lỗi kết nối máy chủ khi nạp dữ liệu. Vui lòng kiểm tra mạng và thử lại.');
    }
  }, [isLiveMode]);

  // Initial session check on mount in live mode
  useEffect(() => {
    if (!isLiveMode) {
      setIsLoadingSession(false);
      return;
    }

    let isMounted = true;

    async function initSession() {
      try {
        const res = await fetch('/api/m2/session', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
          } else if (isMounted) {
            setCurrentUser(null);
          }
        } else if (isMounted) {
          setCurrentUser(null);
        }
      } catch {
        if (isMounted) setCurrentUser(null);
      } finally {
        if (isMounted) setIsLoadingSession(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [isLiveMode, fetchBootstrapData]);

  // Helper for demo QA scenario blocks
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

  // Auth / Login
  const login = async (credentials: {
    email?: string;
    password?: string;
    studentCode?: string;
    pin?: string;
  }): Promise<{ success: boolean; message: string; user?: User }> => {
    setLogoutWarning(null);
    if (isLiveMode) {
      try {
        if (credentials.studentCode) {
          const res = await fetch('/api/m2/student-login-prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentCode: credentials.studentCode,
              pin: credentials.pin,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
            return { success: true, message: data.message, user: data.user };
          }
          return { success: false, message: data.message || 'Thông tin đăng nhập không chính xác.' };
        }

        if (credentials.email) {
          const res = await fetch('/api/m2/staff-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
            return { success: true, message: data.message, user: data.user };
          }
          return { success: false, message: data.message || 'Email hoặc mật khẩu không chính xác.' };
        }

        return { success: false, message: 'Vui lòng nhập đầy đủ thông tin đăng nhập.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.' };
      }
    }

    // Demo Mode Simulation
    if (qaState.scenario === 'session_expired') {
      setQaState({ scenario: 'normal', delayMs: 0 });
    } else {
      const qaCheck = checkQABlock('Đăng nhập');
      if (qaCheck.blocked && qaState.scenario !== 'normal') {
        return { success: false, message: qaCheck.message! };
      }
    }

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
      if (!pin || pin.length !== 8) {
        return { success: false, message: 'Mã PIN học sinh phải gồm đúng 8 chữ số.' };
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
        return { success: false, message: 'Mật khẩu không hợp lệ.' };
      }
      setCurrentUser(user);
      return { success: true, message: `Đăng nhập thành công với vai trò ${user.role}.`, user };
    }

    return { success: false, message: 'Vui lòng nhập đầy đủ thông tin đăng nhập.' };
  };

  const requestPasswordReset = async (email: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/password-reset-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          return {
            success: false,
            message: data?.message || 'Không thể gửi yêu cầu đặt lại mật khẩu lúc này. Vui lòng thử lại sau.',
          };
        }
        return {
          success: true,
          message: data.message || 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.',
        };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Yêu cầu đặt lại mật khẩu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    return {
      success: true,
      message: `[Mô phỏng]: Nếu email ${email} tồn tại trong hệ thống, liên kết đặt lại mật khẩu an toàn đã được gửi. (Mô phỏng không gửi email thật).`,
    };
  };

  const switchDemoUser = (role: Role, userId?: string) => {
    if (isLiveMode) return; // Strict safety: Never allow demo switching in live mode!
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

  const logout = async (): Promise<LogoutResult> => {
    let serverConfirmed = false;
    let warningMsg: string | null = null;
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/logout', { method: 'POST' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success === true) {
          serverConfirmed = true;
        } else {
          serverConfirmed = false;
          warningMsg = data?.message || 'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.';
        }
      } catch {
        serverConfirmed = false;
        warningMsg = 'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.';
      }
    } else {
      serverConfirmed = true;
    }
    if (qaState.scenario === 'session_expired') {
      setQaState({ scenario: 'normal', delayMs: 0 });
    }
    setCurrentUser(null);
    if (isLiveMode) {
      setClasses([]);
      setStudents([]);
      setUsers([]);
    }
    setLogoutWarning(warningMsg);
    return {
      success: serverConfirmed,
      serverConfirmed,
      warning: warningMsg,
      message: warningMsg || 'Đăng xuất thành công.',
    };
  };

  const changeStudentPin = async (studentId: string, oldPin: string, newPin: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/change-student-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPin, newPin }),
        });
        const data = await res.json();
        if (data.success) {
          setCurrentUser(null);
        }
        return { success: Boolean(data.success), message: data.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Đổi mã PIN');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const pinCheck = validatePin(newPin);
    if (!pinCheck.valid) return { success: false, message: pinCheck.message! };

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, hasPin: true, pinIssuedAt: new Date().toISOString() } : s))
    );
    return { success: true, message: 'Đổi mã PIN 8 chữ số thành công (Mô phỏng).' };
  };

  const changeUserPassword = async (userId: string, oldPass: string, newPass: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
        });
        const data = await res.json();
        if (data.success) {
          setCurrentUser(null);
        }
        return { success: Boolean(data.success), message: data.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Đổi mật khẩu');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (newPass.length < 8) {
      return { success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' };
    }
    return { success: true, message: 'Đổi mật khẩu tài khoản thành công (Mô phỏng).' };
  };

  // Class Actions
  const createClass = async (data: { code: string; name: string; courseId: string | null; teacherId: string | null }) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/create-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

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

  const updateClass = async (id: string, data: Partial<ClassItem>) => {
    if (isLiveMode) {
      try {
        const payloadData: Record<string, unknown> = {};
        if (data.name !== undefined) payloadData.name = data.name;
        if (data.code !== undefined) payloadData.code = data.code;
        if (data.teacherId !== undefined) payloadData.teacherId = data.teacherId;

        const res = await fetch('/api/m2/update-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, data: payloadData }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Cập nhật lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.code !== undefined ? { code: data.code } : {}),
              ...(data.teacherId !== undefined ? { teacherId: data.teacherId } : {}),
            }
          : c
      )
    );
    return { success: true, message: 'Cập nhật thông tin lớp học thành công (Mô phỏng).' };
  };

  const archiveClass = async (id: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/archive-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Lưu trữ lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'archived' } : c)));
    return { success: true, message: 'Đã lưu trữ lớp học. Quyền truy cập tạm khóa (Mô phỏng).' };
  };

  const restoreClass = async (id: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/restore-class', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const qaCheck = checkQABlock('Khôi phục lớp học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'active' } : c)));
    return { success: true, message: 'Đã khôi phục lớp học hoạt động trở lại (Mô phỏng).' };
  };

  // Lesson & Course Actions
  const updateLesson = async (id: string, data: Partial<Lesson>) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Chức năng cập nhật bài học thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
      };
    }

    const qaCheck = checkQABlock('Lưu bài học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const targetLesson = lessons.find((l) => l.id === id);
    if (!targetLesson) return { success: false, message: 'Không tìm thấy bài học.' };

    const nextHasQuiz = data.hasQuiz !== undefined ? data.hasQuiz : targetLesson.hasQuiz;
    const nextHasPractice = data.hasPractice !== undefined ? data.hasPractice : targetLesson.hasPractice;
    const nextStatus = data.status !== undefined ? data.status : targetLesson.status;

    const publishCheck = checkPublishRule(nextStatus, nextHasQuiz, nextHasPractice);
    if (!publishCheck.allowed) {
      return { success: false, message: publishCheck.message! };
    }

    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
    return { success: true, message: `Lưu bài Buổi ${targetLesson.sessionNumber} thành công (Mô phỏng).` };
  };

  const updateCourse = async (id: string, data: Partial<Course>) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Chức năng cập nhật khóa học thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
      };
    }

    const qaCheck = checkQABlock('Cập nhật khóa học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền cập nhật khóa học.' };
    }

    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    return { success: true, message: 'Cập nhật khóa học thành công.' };
  };

  const createCourse = async (title: string, description: string = '') => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Chức năng tạo khóa học thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
      };
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) return { success: false, message: 'Tiêu đề không được để trống.' };

    const newCourseId = `crs_${Date.now()}`;
    const newCourse: Course = {
      id: newCourseId,
      title: cleanTitle,
      description: description.trim() || 'Khóa học mẫu',
      totalSessions: 14,
      createdAt: new Date().toISOString(),
    };

    setCourses((prev) => [...prev, newCourse]);
    return { success: true, message: 'Tạo khóa học thành công (Mô phỏng).', course: newCourse };
  };

  // Student Actions
  const updateStudent = async (id: string, data: Partial<StudentProfile>) => {
    if (isLiveMode) {
      try {
        const payloadData: Record<string, unknown> = {};
        if (data.fullName !== undefined) payloadData.fullName = data.fullName;
        if (data.notes !== undefined) payloadData.notes = data.notes;

        const res = await fetch('/api/m2/update-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, data: payloadData }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    setStudents((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
            }
          : s
      )
    );
    return { success: true, message: 'Cập nhật học sinh thành công (Mô phỏng).' };
  };

  const transferStudent = async (studentId: string, targetClassId: string) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Chức năng chuyển lớp học sinh thuộc phạm vi Mốc 3 (kèm reset tiến độ đợt mới). Hiện đang khóa ở Mốc 2.',
      };
    }

    const targetClass = classes.find((c) => c.id === targetClassId);
    if (!targetClass) return { success: false, message: 'Lớp đích không tồn tại.' };

    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId ? { ...s, currentClassId: targetClassId, status: 'active' } : s
      )
    );
    return { success: true, message: `Đã chuyển học sinh sang lớp ${targetClass.code} (Mô phỏng).` };
  };

  const resetStudentProgress = async (studentId: string) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Chức năng đặt lại điểm thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
      };
    }

    setQuizResults((prev) => prev.filter((q) => q.studentId !== studentId));
    setSubmissions((prev) => prev.filter((sub) => sub.studentId !== studentId));
    return { success: true, message: 'Đã đặt lại kết quả học tập của học sinh (Mô phỏng).' };
  };

  const archiveStudent = async (studentId: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/archive-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: 'archived' } : s)));
    return { success: true, message: 'Đã lưu trữ hồ sơ học sinh (Mô phỏng).' };
  };

  const restoreStudent = async (studentId: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/restore-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId }),
        });
        const d = await res.json();
        if (d.success) await fetchBootstrapData();
        return { success: Boolean(d.success), message: d.message };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: 'active' } : s)));
    return { success: true, message: 'Đã khôi phục tài khoản học sinh (Mô phỏng).' };
  };

  // Teacher Management
  const createTeacher = async (data: { name: string; email: string; assignedClassIds: string[] }) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/create-teacher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success === true) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Kết nối tài khoản giáo viên thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể kết nối tài khoản giáo viên.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    if (!data.name.trim() || !data.email.trim()) {
      return { success: false, message: 'Họ tên và email giáo viên không được để trống.' };
    }

    const trimmedEmail = data.email.trim().toLowerCase();
    const existing = users.find((u) => u.email?.toLowerCase() === trimmedEmail);
    if (existing) {
      return { success: false, message: `Email "${trimmedEmail}" đã tồn tại trong hệ thống.` };
    }

    const newTeacher: User = {
      id: `usr_tea_${Date.now()}`,
      name: data.name.trim(),
      email: trimmedEmail,
      role: 'teacher',
      status: 'active',
      assignedClassIds: data.assignedClassIds,
    };

    setUsers((prev) => [...prev, newTeacher]);
    if (data.assignedClassIds && data.assignedClassIds.length > 0) {
      setClasses((prev) =>
        prev.map((c) =>
          data.assignedClassIds.includes(c.id) ? { ...c, teacherId: newTeacher.id } : c
        )
      );
    }
    return {
      success: true,
      message: `Đã kết nối tài khoản giáo viên "${newTeacher.name}" (${newTeacher.email}) thành công (Mô phỏng).`,
    };
  };

  // PIN Issuance (Admin Only)
  const issueInitialPinsForClass = async (classId: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/pin-issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId }),
        });

        // Direct CSV response from authenticated POST with no-store
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('text/csv')) {
          const blob = await res.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.setAttribute('download', `DanhSachPIN_Lop_${classId}_${Date.now()}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Security: immediately revoke object URL, never store CSV in React state
          URL.revokeObjectURL(downloadUrl);

          // Reload bootstrap data to update students' hasPin status
          await fetchBootstrapData();

          return {
            success: true,
            message: 'Đã cấp mã PIN lần đầu thành công và tải tệp CSV về máy. Tệp chỉ được tải 1 lần duy nhất.',
          };
        }

        const data = await res.json();
        return { success: false, message: data.message || 'Cấp PIN không thành công.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ khi cấp PIN.' };
      }
    }

    // Demo Mode Simulation
    const targetStudents = students.filter(
      (s) => s.currentClassId === classId && !s.hasPin && !s.pinHash && s.status === 'active'
    );

    if (targetStudents.length === 0) {
      return { success: false, message: 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.' };
    }

    const pinPairs = targetStudents.map((s) => ({ student: s, pin: generate8DigitPin() }));
    const csvHeader = 'Mã học sinh,Họ và tên,Lớp,Mã PIN tạm thời,Thời gian cấp,Ghi chú\n';
    const csvRows = pinPairs
      .map(
        (p) =>
          `"${p.student.studentCode}","${p.student.fullName}","${classId}","${p.pin}","${new Date().toISOString()}","Cấp PIN lần đầu - Người nhận tự bảo quản"`
      )
      .join('\n');

    const updatedIds = new Set(targetStudents.map((s) => s.id));
    setStudents((prev) =>
      prev.map((s) => (updatedIds.has(s.id) ? { ...s, hasPin: true, pinIssuedAt: new Date().toISOString() } : s))
    );

    return {
      success: true,
      message: `Đã cấp PIN cho ${targetStudents.length} học sinh (Mô phỏng).`,
      csvContent: csvHeader + csvRows,
      count: targetStudents.length,
    };
  };

  const reissuePinForSingleStudent = async (studentId: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/pin-reissue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('text/csv')) {
          const blob = await res.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.setAttribute('download', `PIN_${studentId}_${Date.now()}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(downloadUrl);

          await fetchBootstrapData();

          return {
            success: true,
            message: 'Đã cấp lại PIN mới riêng cho học sinh và tải tệp CSV về máy. PIN cũ đã bị vô hiệu hóa.',
          };
        }

        const data = await res.json();
        return { success: false, message: data.message || 'Cấp lại PIN không thành công.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const student = students.find((s) => s.id === studentId);
    if (!student) return { success: false, message: 'Không tìm thấy học sinh.' };

    const newPin = generate8DigitPin();
    const csvContent =
      'Mã học sinh,Họ và tên,Lớp,Mã PIN mới,Thời gian cấp,Ghi chú\n' +
      `"${student.studentCode}","${student.fullName}","${student.currentClassId}","${newPin}","${new Date().toISOString()}","Cấp lại riêng 1 học sinh"`;

    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, hasPin: true, pinIssuedAt: new Date().toISOString() } : s))
    );

    return {
      success: true,
      message: `Đã cấp lại PIN mới cho riêng học sinh ${student.fullName}.`,
      csvContent,
      pin: newPin,
    };
  };

  // Course Close & 14-Session CSV (Admin only)
  const generateCourseClosePreview = (classId: string): CourseClosePreview => {
    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);
    const batchStudents = getBatchParticipants(students, classId);

    const blockErrors: string[] = [];
    const warnings: string[] = [];

    if (currentUser?.role !== 'admin') {
      blockErrors.push('Người dùng hiện tại không có quyền Quản trị viên (Admin).');
    }
    if (!cls || !crs) {
      blockErrors.push('Lớp học chưa được gán khóa học hoặc phạm vi dữ liệu không hợp lệ.');
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
      pendingGradingCount: 0,
      incompleteLessonsCount: 0,
      isSchedule14Confirmed: isConfirmed,
      canExecute: blockErrors.length === 0,
      blockErrors,
      warnings,
    };
  };

  const exportCourseCloseCsv = async (classId: string) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Tính năng xuất CSV tổng kết 14 buổi đóng khóa thuộc phạm vi Mốc 5. Hiện đang khóa ở Mốc 2.',
      };
    }

    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);

    if (!cls || !crs) {
      return { success: false, message: 'Không tìm thấy lớp học hoặc khóa học liên kết.' };
    }

    const batchStudents = getBatchParticipants(students, classId);
    return buildCourseCloseCsvContent(batchStudents, lessons, cls.code, quizResults, submissions);
  };

  const verifyAndExecuteCourseClose = async (classId: string, confirmed14Sessions: boolean) => {
    if (isLiveMode) {
      return {
        success: false,
        message: 'Tính năng đóng khóa và xóa vĩnh viễn dữ liệu cũ thuộc phạm vi Mốc 5. Hiện đang khóa ở Mốc 2.',
      };
    }

    if (!confirmed14Sessions) {
      return { success: false, message: 'Admin phải đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch.' };
    }

    return {
      success: true,
      message: 'Đã đóng khóa học thành công (Mô phỏng Mốc 1).',
    };
  };

  // Quiz / Practice placeholders
  const submitQuizAttempt = async () => ({
    success: false,
    message: 'Nộp bài Quiz thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
    score: 0,
    passed: false,
  });

  const submitPractice = async () => ({
    success: false,
    message: 'Nộp bài thực hành thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
  });

  const gradeSubmission = async () => ({
    success: false,
    message: 'Chấm bài thực hành thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
  });

  const reopenSubmission = async () => ({
    success: false,
    message: 'Mở lại bài nộp thuộc phạm vi Mốc 3. Hiện đang khóa ở Mốc 2.',
  });

  const previewTeachingSync = async (fixtureData?: any) => {
    return {
      success: true,
      report: {
        added: [],
        updated: [],
        ignored: [],
        warnings: ['Đồng bộ Teaching thuộc phạm vi Mốc 4 & 6.'],
        totalValid: 0,
      },
    };
  };

  const applyTeachingSync = async () => ({
    success: false,
    message: 'Áp dụng đồng bộ thuộc phạm vi Mốc 4 & 6. Hiện đang khóa ở Mốc 2.',
  });

  const getStudentProgress = (studentId: string, courseId = 'crs_rob_k14'): StudentOverallProgress => {
    const sortedLessons = [...lessons]
      .filter((l) => l.courseId === courseId)
      .sort((a, b) => a.sessionNumber - b.sessionNumber);

    const summaries: StudentSessionSummary[] = sortedLessons.map((les) => {
      const quiz = quizResults.find((q) => q.studentId === studentId && q.lessonId === les.id);
      const sub = submissions.find((s) => s.studentId === studentId && s.lessonId === les.id);
      const quizPassed = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePassed = les.hasPractice ? (sub?.status === 'approved') : true;

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
        isCompleted: quizPassed && practicePassed,
      };
    });

    const completedCount = summaries.filter((s) => s.isCompleted).length;
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
        isLiveMode,
        isLoadingSession,
        bootstrapError,
        retryBootstrap: fetchBootstrapData,
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
        logoutWarning,
        clearLogoutWarning,
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
        refreshData: fetchBootstrapData,
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
