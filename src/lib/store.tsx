'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  StorageQuotaStatus,
  CourseCloseCsvVerification,
  CourseCloseExecutionResult,
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
  m5FixtureClass,
  m5Course14,
  m5NextCourse,
  m5Lessons14,
  m5Students,
  m5QuizResults,
  m5Submissions,
  m5CohortMembers,
  seedM5CourseCloseFixtureData,
  isM5FixtureStudentForeignClass,
} from './mock-data';
import {
  validatePin,
  generate8DigitPin,
  checkPublishRule,
  calculateProgress,
  getBatchParticipants,
  buildCourseCloseCsvContent,
  computeCourseClosePreview,
  verifyCourseCloseCsv,
  evaluateStorageQuotaGate,
  runCourseCloseExecution,
  chunkStoragePaths,
  computeCohortSnapshotDigest,
  STORAGE_WARNING_THRESHOLD_BYTES,
  STORAGE_HARD_LIMIT_BYTES,
  runTeachingSnapshotPreview,
  applyTeachingSyncDiffToState,
  TeachingSyncDiffReport,
  TeachingAggregatePreview,
} from './simulation-rules';

export type SyncDiffReport = TeachingSyncDiffReport;

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

  // Mốc 5: Course Close, CSV Verification & Storage Quota
  cohortMembers: any[];
  setCohortMembers: React.Dispatch<React.SetStateAction<any[]>>;
  storageQuota: StorageQuotaStatus | null;
  storageQuotaError: string | null;
  fetchStorageQuota: (incomingBytes?: number) => Promise<StorageQuotaStatus>;
  setStorageQuotaBaseline: (baselineBytes: number, warningBytes?: number, hardLimitBytes?: number) => Promise<{ success: boolean; message: string }>;
  seedM5CourseCloseFixture: (resetOnly?: boolean) => Promise<{ success: boolean; message: string; fixtureClassId?: string }>;
  generateCourseClosePreview: (classId: string, options?: { isSchedule14Confirmed?: boolean }) => CourseClosePreview;
  fetchCourseClosePreview: (classId: string, options?: { isSchedule14Confirmed?: boolean }) => Promise<CourseClosePreview>;
  setConfirmed14SessionsForClass: (classId: string, confirmed: boolean) => Promise<{ success: boolean; message?: string }>;
  exportCourseCloseCsv: (classId: string, confirmed14Sessions?: boolean, courseId?: string) => Promise<{
    success: boolean;
    message: string;
    csvContent?: string;
    rowCount?: number;
    participantCount?: number;
    verification?: CourseCloseCsvVerification;
  }>;
  verifyAndExecuteCourseClose: (
    classId: string,
    confirmed14Sessions: boolean,
    options?: {
      courseId?: string;
      nextCourseId?: string;
      simulateFailureStage?: string;
      isResume?: boolean;
      confirmedCsvOpened?: boolean;
      confirmedCsvSha256?: string;
    }
  ) => Promise<{
    success: boolean;
    message: string;
    status?: string;
    code?: string;
    deletedStoragePaths?: string[];
    remainingStoragePaths?: string[];
    nextCourseId?: string | null;
  }>;
  csvVerifications: Record<string, CourseCloseCsvVerification>;
  courseCloseOperations: Record<string, any>;

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
  previewTeachingSync: (
    fixtureData?: any,
    options?: {
      robFilterMode?: 'include_rob' | 'exclude_rob';
      sourceMode?: 'synthetic_fixture' | 'real_teaching_preview' | 'real_teaching_sync';
    }
  ) => Promise<{
    success: boolean;
    aborted?: boolean;
    partialApplied?: boolean;
    code?: string;
    message?: string;
    failedAtPage?: number;
    pagesRead?: number;
    report?: SyncDiffReport | null;
    aggregatePreview?: TeachingAggregatePreview;
  }>;
  applyTeachingSync: (diffReport: SyncDiffReport) => Promise<{
    success: boolean;
    code?: string;
    message: string;
    addedStudentsCount?: number;
    updatedStudentsCount?: number;
    createdClassesCount?: number;
  }>;
  resetTeachingFixtureSync: () => Promise<{ success: boolean; message: string }>;

  // Utilities
  getStudentProgress: (studentId: string, courseId?: string) => StudentOverallProgress;
  refreshData: () => Promise<void>;
}

export function createDefaultLessonSlots(courseId: string): Lesson[] {
  return Array.from({ length: 14 }, (_, index) => {
    const sessionNumber = index + 1;
    return {
      id: `les_${courseId}_${sessionNumber.toString().padStart(2, '0')}`,
      courseId,
      sessionNumber,
      title: `Buổi ${sessionNumber}: Bài học Buổi ${sessionNumber}`,
      description: `Nội dung tóm tắt buổi ${sessionNumber}`,
      materials: '',
      videoUrl: '',
      status: 'draft',
      hasQuiz: false,
      hasPractice: false,
      practiceMode: 'link_only',
      questions: [],
    };
  });
}

const StoreContext = createContext<StoreContextType | null>(null);

const STORE_TEST_SUPABASE_REF = 'eythjapspkoyqdxlxtcd';
const STORE_PROD_ENV_VALUES = new Set(['production', 'prod']);
const STORE_NON_PROD_ENV_VALUES = new Set(['test', 'staging', 'development', 'dev', 'local']);

export function resolveIsLiveMode(env: Record<string, string | undefined> = process.env): boolean {
  const flagKeys = ['MINDX_ENV', 'MINDX_APP_ENV', 'NEXT_PUBLIC_MINDX_ENV'] as const;
  let hasProdFlag = false;
  let hasNonProdFlag = false;

  for (const key of flagKeys) {
    const rawVal = typeof env?.[key] === 'string' ? env[key]!.trim() : '';
    if (!rawVal) continue;
    const normalized = rawVal.toLowerCase();
    if (STORE_PROD_ENV_VALUES.has(normalized)) {
      hasProdFlag = true;
    } else if (STORE_NON_PROD_ENV_VALUES.has(normalized)) {
      hasNonProdFlag = true;
    } else {
      throw new Error(
        `Chốt chặn an toàn Mốc 6: Giá trị biến môi trường ${key}="${rawVal}" không hợp lệ (chỉ chấp nhận test/staging/development hoặc production/prod).`
      );
    }
  }

  if (hasProdFlag && hasNonProdFlag) {
    throw new Error(
      'Chốt chặn an toàn Mốc 6: Xung đột biến môi trường TEST và PROD giữa MINDX_ENV, MINDX_APP_ENV và NEXT_PUBLIC_MINDX_ENV.'
    );
  }

  let hasNonTestSupabase = false;
  for (const key of ['MINDX_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const) {
    const rawUrl = typeof env?.[key] === 'string' ? env[key]!.trim() : '';
    if (!rawUrl) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`${key} không phải là URL hợp lệ.`);
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== `${STORE_TEST_SUPABASE_REF}.supabase.co`) {
      hasNonTestSupabase = true;
    }
  }

  let hasNonTestSite = false;
  for (const key of ['MINDX_SITE_URL', 'NEXT_PUBLIC_SITE_URL'] as const) {
    const rawSite = typeof env?.[key] === 'string' ? env[key]!.trim() : '';
    if (!rawSite) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawSite);
    } catch {
      throw new Error(`${key} không phải là URL hợp lệ.`);
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('mindx-learn-test')) {
      hasNonTestSite = true;
    }
  }

  if (hasNonProdFlag && (hasNonTestSupabase || hasNonTestSite)) {
    throw new Error(
      `Chốt chặn an toàn Mốc 6: Cờ môi trường đang đặt là TEST nhưng địa chỉ Supabase hoặc Site URL lại trỏ ra ngoài dự án TEST (${STORE_TEST_SUPABASE_REF}).`
    );
  }

  const isProd = hasProdFlag || hasNonTestSupabase || hasNonTestSite;
  const isDemoRequested = String(env?.NEXT_PUBLIC_MINDX_DEMO || '').trim() === '1';

  if (isProd && isDemoRequested) {
    throw new Error(
      'Chốt chặn an toàn Mốc 6: Chế độ dữ liệu giả (NEXT_PUBLIC_MINDX_DEMO=1) bị cấm hoàn toàn trên môi trường Production.'
    );
  }

  return !isDemoRequested;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Mode detection with strict Mốc 6 PROD / Demo guard
  const isLiveMode = resolveIsLiveMode({
    NEXT_PUBLIC_MINDX_DEMO: process.env.NEXT_PUBLIC_MINDX_DEMO,
    NEXT_PUBLIC_MINDX_ENV: process.env.NEXT_PUBLIC_MINDX_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    MINDX_ENV: process.env.MINDX_ENV,
    MINDX_APP_ENV: process.env.MINDX_APP_ENV,
    MINDX_SUPABASE_URL: process.env.MINDX_SUPABASE_URL,
    MINDX_SITE_URL: process.env.MINDX_SITE_URL,
  });

  const authEpochRef = useRef<number>(0);
  const bootstrapSeqRef = useRef<number>(0);

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

  // Mốc 5: Storage Quota & Course Close State
  const [cohortMembers, setCohortMembers] = useState<any[]>(m5CohortMembers);
  const [storageQuota, setStorageQuota] = useState<StorageQuotaStatus | null>(null);
  const [storageQuotaError, setStorageQuotaError] = useState<string | null>(null);
  const [csvVerifications, setCsvVerifications] = useState<Record<string, CourseCloseCsvVerification>>({});
  const [courseCloseOperations, setCourseCloseOperations] = useState<Record<string, any>>({});
  const [demoOrgBaselineBytes, setDemoOrgBaselineBytes] = useState<number>(0);
  const [activeReservationsByClass, setActiveReservationsByClass] = useState<Record<string, number>>({});
  // R24-01: Bộ đếm số thứ tự yêu cầu xem trước theo từng lớp để bỏ qua phản hồi về muộn (out-of-order)
  const previewReqSeqByClassRef = useRef<Record<string, number>>({});
  // R25-01: Phiên bản danh sách học sinh dùng chung; tăng khi bộ mẫu bị đặt lại/dọn để bỏ qua danh sách học sinh cũ từ phản hồi của lớp khác
  const sharedStudentsEpochRef = useRef<number>(0);
  const latestPreviewByClassRef = useRef<Record<string, CourseClosePreview | null>>({});

  // R26-01: Vô hiệu hóa mọi yêu cầu Mốc 5 đang bay khi đổi phiên đăng nhập (đăng nhập, đăng xuất, đổi người dùng Demo)
  const invalidateM5AsyncState = () => {
    sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;
    const seqMap = previewReqSeqByClassRef.current;
    seqMap.__shared_students_epoch__ = (seqMap.__shared_students_epoch__ || 0) + 1;
    for (const key of Object.keys(seqMap)) {
      if (key !== '__shared_students_epoch__') {
        seqMap[key] = (seqMap[key] || 0) + 1;
      }
    }
    latestPreviewByClassRef.current = {};
  };

  const clearLogoutWarning = useCallback(() => {
    setLogoutWarning(null);
  }, []);


  // Fetch bootstrap data from real server in live mode
  const fetchBootstrapData = useCallback(async () => {
    if (!isLiveMode) return;
    const epoch = authEpochRef.current;
    const seq = ++bootstrapSeqRef.current;

    try {
      const res = await fetch('/api/m2/bootstrap', { cache: 'no-store' });
      if (authEpochRef.current !== epoch || bootstrapSeqRef.current !== seq) return;

      const data = await res.json().catch(() => null);
      if (authEpochRef.current !== epoch || bootstrapSeqRef.current !== seq) return;

      if (!res.ok || !data || !data.success) {
        if (authEpochRef.current === epoch && bootstrapSeqRef.current === seq) {
          setBootstrapError(data?.message || 'Không thể tải dữ liệu từ máy chủ. Vui lòng bấm Thử lại.');
        }
        return;
      }

      const d = data.data;
      if (!d || typeof d !== 'object') {
        if (authEpochRef.current === epoch && bootstrapSeqRef.current === seq) {
          setBootstrapError('Cấu trúc dữ liệu máy chủ không hợp lệ.');
        }
        return;
      }

      if (authEpochRef.current !== epoch || bootstrapSeqRef.current !== seq) return;

      if (d.currentUser) setCurrentUser(d.currentUser);
      let nextClasses: ClassItem[] = Array.isArray(d.classes) ? d.classes : [];
      let nextUsers: User[] = Array.isArray(d.users) ? d.users : [];
      let nextStudents: StudentProfile[] = [];
      if (Array.isArray(d.students)) {
        nextStudents = d.students.map((s: any) => ({
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
      }

      setClasses(nextClasses);
      setUsers(nextUsers);
      setStudents(nextStudents);
      // Courses, lessons, submissions locked/empty for M3
      if (Array.isArray(d.courses)) setCourses(d.courses);
      if (Array.isArray(d.lessons)) setLessons(d.lessons);
      if (Array.isArray(d.quizResults)) setQuizResults(d.quizResults);
      if (Array.isArray(d.submissions)) setSubmissions(d.submissions);
      if (Array.isArray(d.cohortMembers)) setCohortMembers(d.cohortMembers);

      setBootstrapError(null);
    } catch {
      if (authEpochRef.current === epoch && bootstrapSeqRef.current === seq) {
        setBootstrapError('Lỗi kết nối máy chủ khi nạp dữ liệu. Vui lòng kiểm tra mạng và thử lại.');
      }
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
      const epoch = ++authEpochRef.current;
      ++bootstrapSeqRef.current;

      try {
        const res = await fetch('/api/m2/session', { cache: 'no-store' });
        if (!isMounted || authEpochRef.current !== epoch) return;

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (!isMounted || authEpochRef.current !== epoch) return;

          if (data?.success && data?.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
          } else {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      } catch {
        if (isMounted && authEpochRef.current === epoch) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted && authEpochRef.current === epoch) {
          setIsLoadingSession(false);
        }
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
      const epoch = ++authEpochRef.current;
      ++bootstrapSeqRef.current;
      if (typeof invalidateM5AsyncState === 'function') { invalidateM5AsyncState(); }
      setCurrentUser(null);
      setClasses([]);
      setStudents([]);
      setUsers([]);
      setCourses([]);
      setLessons([]);
      setQuizResults([]);
      setSubmissions([]);
      setCohortMembers([]);
      setCsvVerifications({});
      setCourseCloseOperations({});
      setActiveReservationsByClass({});
      if (typeof setStorageQuota === 'function') setStorageQuota(null);
      if (typeof setStorageQuotaError === 'function') setStorageQuotaError(null);
      setBootstrapError(null);
      setIsLoadingSession(false);

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
          if (authEpochRef.current !== epoch) {
            return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
          }
          const data = await res.json().catch(() => null);
          if (authEpochRef.current !== epoch) {
            return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
          }
          if (res.ok && data?.success && data?.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
            if (authEpochRef.current !== epoch) {
              return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
            }
            return { success: true, message: data.message, user: data.user };
          }
          return { success: false, message: data?.message || 'Thông tin đăng nhập không chính xác.' };
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
          if (authEpochRef.current !== epoch) {
            return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
          }
          const data = await res.json().catch(() => null);
          if (authEpochRef.current !== epoch) {
            return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
          }
          if (res.ok && data?.success && data?.user) {
            setCurrentUser(data.user);
            await fetchBootstrapData();
            if (authEpochRef.current !== epoch) {
              return { success: false, message: 'Thao tác đăng nhập đã bị hủy.' };
            }
            return { success: true, message: data.message, user: data.user };
          }
          return { success: false, message: data?.message || 'Email hoặc mật khẩu không chính xác.' };
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
    ++authEpochRef.current;
    if (typeof invalidateM5AsyncState === 'function') { invalidateM5AsyncState(); }
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
    const epoch = ++authEpochRef.current;
    ++bootstrapSeqRef.current;
    // R26-01: Vô hiệu hóa trực tiếp (tự đủ khi cắt riêng hàm này) rồi gọi thêm helper nếu có
    if (typeof sharedStudentsEpochRef !== 'undefined' && sharedStudentsEpochRef) {
      sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;
    }
    if (typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current) {
      const logoutSeqMap = previewReqSeqByClassRef.current;
      logoutSeqMap.__shared_students_epoch__ = (logoutSeqMap.__shared_students_epoch__ || 0) + 1;
      for (const key of Object.keys(logoutSeqMap)) {
        if (key !== '__shared_students_epoch__') {
          logoutSeqMap[key] = (logoutSeqMap[key] || 0) + 1;
        }
      }
    }
    if (typeof latestPreviewByClassRef !== 'undefined' && latestPreviewByClassRef) {
      latestPreviewByClassRef.current = {};
    }
    if (typeof invalidateM5AsyncState === 'function') { invalidateM5AsyncState(); }

    if (isLiveMode) {
      setCurrentUser(null);
      setClasses([]);
      setStudents([]);
      setUsers([]);
      setCourses([]);
      setLessons([]);
      setQuizResults([]);
      setSubmissions([]);
      setCohortMembers([]);
      setCsvVerifications({});
      setCourseCloseOperations({});
      setActiveReservationsByClass({});
      if (typeof setStorageQuota === 'function') setStorageQuota(null);
      if (typeof setStorageQuotaError === 'function') setStorageQuotaError(null);
      setBootstrapError(null);
      setIsLoadingSession(false);
    } else {
      if (qaState.scenario === 'session_expired') {
        setQaState({ scenario: 'normal', delayMs: 0 });
      }
      setCurrentUser(null);
    }

    let serverConfirmed = false;
    let warningMsg: string | null = null;
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/logout', { method: 'POST' });
        if (authEpochRef.current !== epoch) {
          return {
            success: false,
            serverConfirmed: false,
            warning: null,
            message: 'Phiên đã thay đổi.',
          };
        }
        const data = await res.json().catch(() => null);
        if (authEpochRef.current !== epoch) {
          return {
            success: false,
            serverConfirmed: false,
            warning: null,
            message: 'Phiên đã thay đổi.',
          };
        }
        if (res.ok && data?.success === true) {
          serverConfirmed = true;
        } else {
          serverConfirmed = false;
          warningMsg = data?.message || 'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.';
        }
      } catch {
        if (authEpochRef.current !== epoch) {
          return {
            success: false,
            serverConfirmed: false,
            warning: null,
            message: 'Phiên đã thay đổi.',
          };
        }
        serverConfirmed = false;
        warningMsg = 'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.';
      }
    } else {
      serverConfirmed = true;
    }

    if (authEpochRef.current === epoch) {
      setLogoutWarning(warningMsg);
    }

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

  // R17-02: Phát hiện lớp/khóa/học sinh đang thuộc tác vụ đóng khóa dở dang để chặn sửa dữ liệu làm đổi snapshot digest
  const CLASS_CLOSE_IN_PROGRESS_MESSAGE =
    'Lớp hoặc đợt học liên quan đang trong quá trình đóng khóa dở dang. Vui lòng hoàn tất tác vụ đóng khóa (Resume) trước khi thay đổi dữ liệu.';

  const getClosingOperations = (): Array<{ classId: string; courseId: string }> =>
    Object.entries(courseCloseOperations)
      .filter(
        ([, op]) =>
          op &&
          (op.status === 'deleting_storage' || op.status === 'deleting_db' || op.status === 'incomplete')
      )
      .map(([key, op]) => {
        const opClassId: string = op.classId || key;
        return {
          classId: opClassId,
          courseId: op.courseId || classes.find((c) => c.id === opClassId)?.courseId || '',
        };
      });

  const isClassInClosingOperation = (classId?: string | null) =>
    Boolean(classId) && getClosingOperations().some((op) => op.classId === classId);

  const isCourseInClosingOperation = (courseId?: string | null) =>
    Boolean(courseId) && getClosingOperations().some((op) => op.courseId === courseId);

  const isStudentInClosingCohort = (studentId: string) => {
    const closingOps = getClosingOperations();
    if (closingOps.length === 0) return false;
    const student = students.find((s) => s.id === studentId);
    return closingOps.some(
      (op) =>
        student?.currentClassId === op.classId ||
        student?.originalClassId === op.classId ||
        cohortMembers.some(
          (cm) =>
            (cm.studentId || cm.student_id || cm.id) === studentId &&
            (cm.classId || cm.class_id) === op.classId &&
            (!op.courseId || !(cm.courseId || cm.course_id) || (cm.courseId || cm.course_id) === op.courseId)
        )
    );
  };

  const updateClass = async (id: string, data: Partial<ClassItem>) => {
    if (isClassInClosingOperation(id)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
    if (isLiveMode) {
      try {
        const payloadData: Record<string, unknown> = {};
        if (data.name !== undefined) payloadData.name = data.name;
        if (data.code !== undefined) payloadData.code = data.code;
        if (data.courseId !== undefined) payloadData.courseId = data.courseId;
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
              ...(data.courseId !== undefined ? { courseId: data.courseId } : {}),
              ...(data.teacherId !== undefined ? { teacherId: data.teacherId } : {}),
            }
          : c
      )
    );
    return { success: true, message: 'Cập nhật thông tin lớp học thành công (Mô phỏng).' };
  };

  const archiveClass = async (id: string) => {
    if (isClassInClosingOperation(id)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
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
    if (isClassInClosingOperation(id)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
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
    if (isCourseInClosingOperation(lessons.find((l) => l.id === id)?.courseId)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
    const qaCheck = checkQABlock('Lưu bài học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/update-lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, data }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Cập nhật bài học thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể cập nhật bài học.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

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
    const qaCheck = checkQABlock('Cập nhật khóa học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/update-course', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, title: data.title, description: data.description }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Cập nhật khóa học thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể cập nhật khóa học.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    if (currentUser?.role !== 'admin') {
      return { success: false, message: 'Chỉ Admin mới có quyền cập nhật khóa học.' };
    }

    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    return { success: true, message: 'Cập nhật khóa học thành công.' };
  };

  const createCourse = async (title: string, description: string = '') => {
    const qaCheck = checkQABlock('Tạo khóa học');
    if (qaCheck.blocked) return { success: false, message: qaCheck.message! };

    const cleanTitle = title.trim();
    if (!cleanTitle) return { success: false, message: 'Tiêu đề không được để trống.' };

    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/create-course', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: cleanTitle, description: description.trim() }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Tạo khóa học thành công.', course: d.data };
        }
        return { success: false, message: d?.message || 'Không thể tạo khóa học.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const newCourseId = `crs_${Date.now()}`;
    const newCourse: Course = {
      id: newCourseId,
      title: cleanTitle,
      description: description.trim() || 'Khóa học mẫu',
      totalSessions: 14,
      createdAt: new Date().toISOString(),
    };

    const newLessons = createDefaultLessonSlots(newCourseId);

    setCourses((prev) => [...prev, newCourse]);
    setLessons((prev) => [...prev, ...newLessons]);
    return { success: true, message: 'Tạo khóa học thành công (Mô phỏng).', course: newCourse };
  };

  // Student Actions
  const updateStudent = async (id: string, data: Partial<StudentProfile>) => {
    if (isStudentInClosingCohort(id)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
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

    const trimmedFullName = typeof data.fullName === 'string' ? data.fullName.trim() : undefined;
    setStudents((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(trimmedFullName ? { fullName: trimmedFullName } : {}),
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
            }
          : s
      )
    );
    if (trimmedFullName) {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, name: trimmedFullName } : u))
      );
    }
    // R12-01: đồng bộ họ tên/ghi chú vào mọi bản ghi cohort của học sinh để khớp dữ liệu hiện hành
    if (trimmedFullName || data.notes !== undefined) {
      setCohortMembers((prev) =>
        prev.map((cm) => {
          const cmStudentId = cm.studentId || cm.student_id || cm.id;
          if (cmStudentId !== id) return cm;
          return {
            ...cm,
            ...(trimmedFullName ? { fullName: trimmedFullName } : {}),
            ...(data.notes !== undefined
              ? { notes: data.notes, notesSnapshot: data.notes, notes_snapshot: data.notes }
              : {}),
          };
        })
      );
    }
    return { success: true, message: 'Cập nhật học sinh thành công (Mô phỏng).' };
  };

  const transferStudent = async (studentId: string, targetClassId: string) => {
    if (isStudentInClosingCohort(studentId) || isClassInClosingOperation(targetClassId)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/transfer-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, targetClassId }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Chuyển lớp học sinh thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể chuyển lớp học sinh.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    const targetClass = classes.find((c) => c.id === targetClassId);
    if (!targetClass) return { success: false, message: 'Lớp đích không tồn tại.' };

    const movingStudent = students.find((s) => s.id === studentId);
    const oldClassId = movingStudent?.currentClassId;
    const oldClass = classes.find((c) => c.id === oldClassId);

    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId ? { ...s, currentClassId: targetClassId, status: 'active' } : s
      )
    );

    // M5-04 / R6-06: Cập nhật cohortMembers lưu vết lịch sử đợt học của cả lớp cũ và lớp mới theo đúng courseId
    setCohortMembers((prev) => {
      const next = [...prev];
      const oldCourseId = oldClass?.courseId || '';
      // R13-08: chỉ cập nhật cohort lớp cũ khi lớp còn courseId hiện hành, tránh sửa nhầm lịch sử của khóa đã đóng
      if (oldClassId && oldCourseId) {
        const oldIdx = next.findIndex(
          (m) =>
            m.classId === oldClassId &&
            (!m.courseId || m.courseId === oldCourseId) &&
            (m.studentId === studentId || m.id === studentId)
        );
        if (oldIdx >= 0) {
          next[oldIdx] = { ...next[oldIdx], membershipStatus: 'transferred', status: 'transferred' };
        } else if (movingStudent) {
          next.push({
            id: studentId,
            studentId,
            classId: oldClassId,
            courseId: oldCourseId,
            participantId: movingStudent.participantId || `PART_${studentId.slice(0, 8)}`,
            studentCode: movingStudent.studentCode,
            fullName: movingStudent.fullName,
            membershipStatus: 'transferred',
            status: 'transferred',
            notes: movingStudent.notes || '',
          });
        }
      }

      // R13-08: chỉ cập nhật cohort lớp đích khi lớp đích có courseId hiện hành
      const targetCourseId = targetClass.courseId || '';
      if (targetCourseId) {
        const targetIdx = next.findIndex(
          (m) =>
            m.classId === targetClassId &&
            (!m.courseId || m.courseId === targetCourseId) &&
            (m.studentId === studentId || m.id === studentId)
        );
        if (targetIdx >= 0) {
          next[targetIdx] = { ...next[targetIdx], membershipStatus: 'active', status: 'active', courseId: targetCourseId || next[targetIdx].courseId };
        } else if (movingStudent) {
          next.push({
            id: studentId,
            studentId,
            classId: targetClassId,
            courseId: targetCourseId,
            participantId: movingStudent.participantId || `PART_${studentId.slice(0, 8)}`,
            studentCode: movingStudent.studentCode,
            fullName: movingStudent.fullName,
            membershipStatus: 'active',
            status: 'active',
            notes: movingStudent.notes || '',
          });
        }
      }
      return next;
    });

    return { success: true, message: `Đã chuyển học sinh sang lớp ${targetClass.code} (Mô phỏng).` };
  };

  const resetStudentProgress = async (studentId: string) => {
    if (isStudentInClosingCohort(studentId)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/reset-student-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Đặt lại kết quả học tập thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể đặt lại kết quả học tập.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    setQuizResults((prev) => prev.filter((q) => q.studentId !== studentId));
    setSubmissions((prev) => prev.filter((sub) => sub.studentId !== studentId));
    return { success: true, message: 'Đã đặt lại kết quả học tập của học sinh (Mô phỏng).' };
  };

  const archiveStudent = async (studentId: string) => {
    if (isStudentInClosingCohort(studentId)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
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
    const targetStudent = students.find((s) => s.id === studentId);
    if (targetStudent) {
      const cls = classes.find((c) => c.id === targetStudent.currentClassId);
      const clsCourseId = cls?.courseId;
      // R13-08: chỉ cập nhật cohort khi lớp còn courseId hiện hành, tránh sửa nhầm lịch sử của khóa đã đóng
      if (clsCourseId) {
        setCohortMembers((prev) =>
          prev.map((m) =>
            (m.studentId === studentId || m.id === studentId) &&
            m.classId === targetStudent.currentClassId &&
            (!m.courseId || m.courseId === clsCourseId)
              ? { ...m, membershipStatus: 'archived', status: 'archived' }
              : m
          )
        );
      }
    }
    return { success: true, message: 'Đã lưu trữ hồ sơ học sinh (Mô phỏng).' };
  };

  const restoreStudent = async (studentId: string) => {
    if (isStudentInClosingCohort(studentId)) {
      return { success: false, message: CLASS_CLOSE_IN_PROGRESS_MESSAGE };
    }
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
    const targetStudent = students.find((s) => s.id === studentId);
    if (targetStudent) {
      const cls = classes.find((c) => c.id === targetStudent.currentClassId);
      const clsCourseId = cls?.courseId;
      // R13-08: chỉ cập nhật cohort khi lớp còn courseId hiện hành, tránh sửa nhầm lịch sử của khóa đã đóng
      if (clsCourseId) {
        setCohortMembers((prev) =>
          prev.map((m) =>
            (m.studentId === studentId || m.id === studentId) &&
            m.classId === targetStudent.currentClassId &&
            (!m.courseId || m.courseId === clsCourseId)
              ? { ...m, membershipStatus: 'active', status: 'active' }
              : m
          )
        );
      }
    }
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

  // ============================================================================
  // MỐC 5: STORAGE QUOTA, FIXTURE SEEDING & COURSE CLOSE OPERATIONS
  // ============================================================================

  const submissionsRef = useRef(submissions);
  submissionsRef.current = submissions;

  const fetchStorageQuota = useCallback(async (incomingBytes: number = 0): Promise<StorageQuotaStatus> => {
    // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu; phản hồi của phiên cũ không được cập nhật state phiên mới
    const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
    const isStaleAuth = () =>
      Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/m5-storage-quota-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incomingBytes }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data?.data) {
          if (!isStaleAuth()) {
            setStorageQuota(data.data);
            setStorageQuotaError(null);
          }
          return data.data;
        }
      } catch {}

      // P2-02: Ở chế độ Live, khi API lỗi tuyệt đối không rơi về tính từ mảng submissions cục bộ với allowed: true!
      const errorMsg = 'Chưa xác định được trạng thái dung lượng Storage từ máy chủ. Vui lòng bấm Kiểm tra lại hạn mức.';
      const staleAuthSession = isStaleAuth();
      if (!staleAuthSession) {
        setStorageQuotaError(errorMsg);
      }
      const unknownStatus: StorageQuotaStatus = {
        allowed: false,
        isWarning: false,
        isExceeded: true,
        code: 'STORAGE_QUOTA_STATUS_UNKNOWN',
        message: errorMsg,
        statusUnknown: true,
        currentTotalBytes: 0,
        anticipatedTotalBytes: incomingBytes,
        usedStorageBytes: 0,
        activeReservedBytes: 0,
        orgBaselineBytes: 0,
        incomingBytes,
        warningThresholdBytes: STORAGE_WARNING_THRESHOLD_BYTES,
        hardLimitBytes: STORAGE_HARD_LIMIT_BYTES,
        remainingBytes: 0,
      };
      if (!staleAuthSession) {
        setStorageQuota(unknownStatus);
      }
      return unknownStatus;
    }

    setStorageQuotaError(null);
    let usedBytes = 0;
    submissionsRef.current.forEach((s) => {
      if (s.type === 'file' && s.fileSizeBytes) {
        usedBytes += s.fileSizeBytes;
      }
    });

    const status = evaluateStorageQuotaGate({
      usedStorageBytes: usedBytes,
      activeReservedBytes: 0,
      orgBaselineBytes: demoOrgBaselineBytes,
      incomingBytes,
      orgCapBytes: STORAGE_HARD_LIMIT_BYTES,
      warningThresholdBytes: STORAGE_WARNING_THRESHOLD_BYTES,
    });
    setStorageQuota(status);
    return status;
  }, [isLiveMode, demoOrgBaselineBytes]);

  const setStorageQuotaBaseline = useCallback(async (
    baselineBytes: number,
    warningBytes: number = STORAGE_WARNING_THRESHOLD_BYTES,
    hardLimitBytes: number = STORAGE_HARD_LIMIT_BYTES
  ) => {
    if (isLiveMode) {
      // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu
      const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
      const isStaleAuth = () =>
        Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
      try {
        const res = await fetch('/api/m2/m5-set-storage-quota-baseline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgBaselineBytes: baselineBytes,
            warningThresholdBytes: warningBytes,
            hardLimitBytes,
          }),
        });
        const data = await res.json().catch(() => null);
        if (isStaleAuth()) {
          return { success: false, message: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.' };
        }
        if (res.ok && data?.success) {
          await fetchStorageQuota(0);
          return { success: true, message: data.message || 'Cập nhật dung lượng tổ chức thành công.' };
        }
        return { success: false, message: data?.message || 'Không thể cập nhật dung lượng tổ chức.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ khi cập nhật hạn mức Storage.' };
      }
    }

    setDemoOrgBaselineBytes(baselineBytes);
    await fetchStorageQuota(0);
    return { success: true, message: 'Đã cập nhật dung lượng đối chiếu tổ chức (Mô phỏng).' };
  }, [isLiveMode, fetchStorageQuota]);

  const seedM5CourseCloseFixture = useCallback(async (resetOnly = false) => {
    if (isLiveMode) {
      // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu; phản hồi của phiên cũ không được cập nhật state phiên mới
      const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
      const isStaleAuth = () =>
        Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
      try {
        const res = await fetch('/api/m2/m5-seed-fixture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resetOnly }),
        });
        const data = await res.json().catch(() => null);
        if (isStaleAuth()) {
          return { success: false, message: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.' };
        }
        if (res.ok && data?.success) {
          // R24-01: Vô hiệu hóa mọi yêu cầu xem trước của RIÊNG lớp mẫu đã gửi trước khi đặt lại xong
          // (không ảnh hưởng yêu cầu đang bay của lớp khác).
          const invalidateFixturePreviews = (ids: Iterable<string>) => {
            // R25-01: Tăng phiên bản danh sách học sinh dùng chung
            if (typeof sharedStudentsEpochRef !== 'undefined' && sharedStudentsEpochRef) {
              sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;
            }
            if (typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current) {
              previewReqSeqByClassRef.current.__shared_students_epoch__ =
                (previewReqSeqByClassRef.current.__shared_students_epoch__ || 0) + 1;
              for (const fid of ids) {
                previewReqSeqByClassRef.current[fid] = (previewReqSeqByClassRef.current[fid] || 0) + 1;
              }
            }
            if (typeof latestPreviewByClassRef !== 'undefined' && latestPreviewByClassRef?.current) {
              for (const fid of ids) {
                latestPreviewByClassRef.current[fid] = null;
              }
            }
          };
          invalidateFixturePreviews([m5FixtureClass.id, '00000000-0000-0000-0000-000000050001']);
          await fetchBootstrapData();
          if (isStaleAuth()) {
            return { success: false, message: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.' };
          }
          // R17-04: Lấy đúng mã lớp mẫu thật (UUID) trên máy chủ thay vì mã Demo `cls_rob_m5_01`
          const seedRow = Array.isArray(data?.data) ? data.data[0] : data?.data;
          const liveFixtureClassId: string =
            data?.fixtureClassId ||
            seedRow?.fixture_class_id ||
            seedRow?.fixtureClassId ||
            '00000000-0000-0000-0000-000000050001';
          const resolvedFixtureClassId: string | undefined = resetOnly ? undefined : liveFixtureClassId;
          // R23-01: Xóa trạng thái tác vụ đóng khóa, xác minh CSV và giữ chỗ tải tệp cũ CHỈ của riêng lớp mẫu,
          // giữ nguyên trạng thái của mọi lớp khác (tránh tác vụ `incomplete` cũ chặn giao diện Live sau khi đặt lại).
          const fixtureIdsToClear = new Set<string>([
            liveFixtureClassId,
            m5FixtureClass.id,
            '00000000-0000-0000-0000-000000050001',
          ]);
          invalidateFixturePreviews(fixtureIdsToClear);
          setCourseCloseOperations((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const fid of fixtureIdsToClear) {
              if (fid in next) {
                delete next[fid];
                changed = true;
              }
            }
            return changed ? next : prev;
          });
          setCsvVerifications((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const fid of fixtureIdsToClear) {
              if (fid in next) {
                delete next[fid];
                changed = true;
              }
            }
            return changed ? next : prev;
          });
          setActiveReservationsByClass((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const fid of fixtureIdsToClear) {
              if (fid in next) {
                delete next[fid];
                changed = true;
              }
            }
            return changed ? next : prev;
          });
          return {
            success: true,
            message: data.message || 'Khởi tạo lớp mẫu 14 buổi Mốc 5 thành công.',
            fixtureClassId: resolvedFixtureClassId,
          };
        }
        return { success: false, message: data?.message || 'Không thể khởi tạo lớp mẫu Mốc 5.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ khi tạo dữ liệu mẫu Mốc 5.' };
      }
    }

    // R17-01 / R19-02 / R19-03: Chặn đặt lại nếu bộ mẫu Mốc 5 đang có tham chiếu chéo với lớp/khóa/học sinh ngoài bộ mẫu
    // (giữ nguyên dữ liệu của họ, không sửa bất kỳ trạng thái nào).
    const fixtureStudentIds = new Set(m5Students.map((s) => s.id));
    const fixtureCourseIds = new Set([m5Course14.id, m5NextCourse.id]);
    const cmClassOf = (cm: any): string => cm.classId || cm.class_id || '';
    const cmCourseOf = (cm: any): string => cm.courseId || cm.course_id || '';
    const cmStudentOf = (cm: any): string => cm.studentId || cm.student_id || cm.id || '';
    // Chiều 1: học sinh/dữ liệu ngoài bộ mẫu đang gắn với lớp mẫu hoặc khóa mẫu
    const hasOutsiderOnFixture =
      students.some(
        (s) =>
          !fixtureStudentIds.has(s.id) &&
          (s.currentClassId === m5FixtureClass.id || s.originalClassId === m5FixtureClass.id)
      ) ||
      cohortMembers.some(
        (cm) =>
          !fixtureStudentIds.has(cmStudentOf(cm)) &&
          (cmClassOf(cm) === m5FixtureClass.id || fixtureCourseIds.has(cmCourseOf(cm)))
      ) ||
      quizResults.some((q) => !fixtureStudentIds.has(q.studentId) && q.classId === m5FixtureClass.id) ||
      submissions.some((s) => !fixtureStudentIds.has(s.studentId) && s.classId === m5FixtureClass.id);
    // Chiều 2 (R19-03): lớp khác đang dùng khóa mẫu, hoặc lịch sử đợt học của lớp khác gắn với khóa mẫu
    const hasOtherClassUsingFixtureCourse =
      classes.some((c) => c.id !== m5FixtureClass.id && fixtureCourseIds.has(c.courseId || '')) ||
      cohortMembers.some((cm) => cmClassOf(cm) !== m5FixtureClass.id && fixtureCourseIds.has(cmCourseOf(cm)));
    // Chiều 3 (R19-02): học sinh mẫu đang gắn với lớp khác ngoài lớp mẫu (classId && classId !== m5FixtureClass.id).
    // Chỉ currentClassId do chính bộ mẫu khai báo (học sinh chuyển lớp mẫu số 4 ở 'cls_rob_02') không tính là tham chiếu chéo;
    // originalClassId và mọi bản ghi cohortMembers/quizResults/submissions phải thuộc lớp mẫu.
    const hasFixtureStudentInOtherClass =
      students.some(
        (s) =>
          fixtureStudentIds.has(s.id) &&
          (isM5FixtureStudentForeignClass(s.id, s.currentClassId, 'current') ||
            isM5FixtureStudentForeignClass(s.id, s.originalClassId, 'original'))
      ) ||
      cohortMembers.some(
        (cm) =>
          fixtureStudentIds.has(cmStudentOf(cm)) &&
          isM5FixtureStudentForeignClass(cmStudentOf(cm), cmClassOf(cm), 'record')
      ) ||
      quizResults.some(
        (q) => fixtureStudentIds.has(q.studentId) && isM5FixtureStudentForeignClass(q.studentId, q.classId, 'record')
      ) ||
      submissions.some(
        (s) => fixtureStudentIds.has(s.studentId) && isM5FixtureStudentForeignClass(s.studentId, s.classId, 'record')
      );
    const hasNonFixtureAttached =
      hasOutsiderOnFixture || hasOtherClassUsingFixtureCourse || hasFixtureStudentInOtherClass;
    if (hasNonFixtureAttached) {
      return {
        success: false,
        message: 'Lớp, khóa hoặc học sinh mẫu Mốc 5 đang có dữ liệu tham chiếu chéo với lớp/học sinh khác. Vui lòng tách tham chiếu dùng chung trước khi đặt lại bộ mẫu.',
      };
    }

    const currentSnapshot = {
      classes,
      courses,
      lessons,
      students,
      users,
      quizResults,
      submissions,
    };
    const nextState = seedM5CourseCloseFixtureData(currentSnapshot, resetOnly);
    setClasses(nextState.classes);
    setCourses(nextState.courses);
    setLessons(nextState.lessons);
    setStudents(nextState.students);
    setUsers(nextState.users);
    setQuizResults(nextState.quizResults);
    setSubmissions(nextState.submissions);
    // R18-03 / R19-02: Chỉ thay thế phần danh sách tham gia của đúng lớp mẫu Mốc 5, giữ nguyên 100% cohortMembers của mọi lớp khác (kể cả lịch sử chuyển lớp)
    setCohortMembers((prev) => {
      const preserved = prev.filter((cm) => {
        const cmClassId = cm.classId || cm.class_id || '';
        return cmClassId !== m5FixtureClass.id;
      });
      return resetOnly ? preserved : [...preserved, ...m5CohortMembers];
    });
    // R24-01: Vô hiệu hóa yêu cầu xem trước đang bay của riêng lớp mẫu (Demo)
    // R25-01: Tăng phiên bản danh sách học sinh dùng chung (Demo)
    if (typeof sharedStudentsEpochRef !== 'undefined' && sharedStudentsEpochRef) {
      sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;
    }
    if (typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current) {
      previewReqSeqByClassRef.current.__shared_students_epoch__ =
        (previewReqSeqByClassRef.current.__shared_students_epoch__ || 0) + 1;
      previewReqSeqByClassRef.current[m5FixtureClass.id] = (previewReqSeqByClassRef.current[m5FixtureClass.id] || 0) + 1;
    }
    if (typeof latestPreviewByClassRef !== 'undefined' && latestPreviewByClassRef?.current) {
      latestPreviewByClassRef.current[m5FixtureClass.id] = null;
    }
    // R18-03: Chỉ xóa tác vụ đóng khóa và biên nhận CSV của riêng lớp mẫu, giữ nguyên các lớp khác
    setCourseCloseOperations((prev) => {
      if (!(m5FixtureClass.id in prev)) return prev;
      const { [m5FixtureClass.id]: _removedOp, ...rest } = prev;
      return rest;
    });
    setCsvVerifications((prev) => {
      if (!(m5FixtureClass.id in prev)) return prev;
      const { [m5FixtureClass.id]: _removedCsv, ...rest } = prev;
      return rest;
    });

    return {
      success: true,
      message: resetOnly
        ? 'Đã dọn sạch lớp mẫu 14 buổi Mốc 5 (ROB-K14-M5-01).'
        : 'Đã khởi tạo thành công lớp mẫu 14 buổi Mốc 5 (ROB-K14-M5-01) kèm 5 học sinh mẫu.',
      fixtureClassId: resetOnly ? undefined : m5FixtureClass.id,
    };
  }, [isLiveMode, classes, courses, lessons, students, users, quizResults, submissions, cohortMembers, fetchBootstrapData]);

  const generateCourseClosePreview = useCallback((
    classId: string,
    options?: { isSchedule14Confirmed?: boolean }
  ): CourseClosePreview => {
    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);

    const preview = computeCourseClosePreview({
      currentUser,
      classItem: cls,
      course: crs,
      lessons,
      students,
      cohortMembers,
      quizResults,
      submissions,
      activeReservationsCount: activeReservationsByClass[classId] ?? 0,
      isSchedule14Confirmed: options?.isSchedule14Confirmed ?? Boolean(cls?.is14SessionsConfirmed),
      csvVerification: csvVerifications[classId],
      currentOperation: courseCloseOperations[classId],
    });

    // P2-02: Nếu ở chế độ Live và storageQuotaError đang tồn tại, bổ sung lỗi kỹ thuật chặn vào blockErrors
    if (isLiveMode && (storageQuotaError || storageQuota?.code === 'STORAGE_QUOTA_STATUS_UNKNOWN' || (storageQuota as any)?.statusUnknown)) {
      preview.blockErrors.push('Chưa xác định được trạng thái dung lượng Storage từ máy chủ. Vui lòng bấm Kiểm tra lại hạn mức.');
      if (preview.blockErrorCodes) {
        preview.blockErrorCodes.push('STORAGE_QUOTA_STATUS_UNKNOWN');
      }
      preview.canExecuteDelete = false;
    }

    return preview;
  }, [classes, courses, currentUser, lessons, students, cohortMembers, quizResults, submissions, csvVerifications, courseCloseOperations, isLiveMode, storageQuotaError, storageQuota, activeReservationsByClass]);

  const fetchCourseClosePreview = useCallback(async (
    classId: string,
    options?: { isSchedule14Confirmed?: boolean }
  ): Promise<CourseClosePreview> => {
    if (isLiveMode) {
      // R24-01: Đánh số thứ tự yêu cầu xem trước theo từng lớp để bỏ qua phản hồi về muộn (out-of-order)
      const seqMap =
        typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current
          ? previewReqSeqByClassRef.current
          : null;
      const latestPreviewMap =
        typeof latestPreviewByClassRef !== 'undefined' && latestPreviewByClassRef?.current
          ? latestPreviewByClassRef.current
          : null;
      const reqSeq = seqMap ? (seqMap[classId] = (seqMap[classId] || 0) + 1) : 0;
      // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu; phản hồi của phiên cũ không được ghi vào state phiên mới
      const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
      const isStaleAuth = () =>
        Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
      const isStalePreviewRequest = () => isStaleAuth() || Boolean(seqMap && seqMap[classId] !== reqSeq);
      // R25-01: Ghi nhận phiên bản danh sách học sinh dùng chung lúc gửi yêu cầu
      const getSharedStudentsEpoch = () =>
        (typeof sharedStudentsEpochRef !== 'undefined' && sharedStudentsEpochRef
          ? sharedStudentsEpochRef.current || 0
          : 0) +
        (seqMap ? seqMap.__shared_students_epoch__ || 0 : 0);
      const reqStudentsEpoch = getSharedStudentsEpoch();
      const isStaleSharedStudents = () => getSharedStudentsEpoch() !== reqStudentsEpoch;
      // Phản hồi cũ: không gọi bất kỳ setter nào; trả bản xem trước mới nhất đã có, hoặc tính bản an toàn với currentOperation: null
      const resolveStalePreview = (): CourseClosePreview => {
        // R26-01: Phiên đăng nhập đã đổi -> không đọc bản xem trước/state của phiên cũ; trả bản an toàn rỗng, không tác vụ
        if (isStaleAuth()) {
          return computeCourseClosePreview({
            currentUser,
            classItem: undefined,
            course: undefined,
            lessons: [],
            students: [],
            cohortMembers: [],
            quizResults: [],
            submissions: [],
            activeReservationsCount: 0,
            isSchedule14Confirmed: false,
            csvVerification: undefined,
            currentOperation: null,
          });
        }
        const latest = latestPreviewMap?.[classId];
        if (latest) return latest;
        // null = lớp mẫu vừa được đặt lại (tác vụ cũ đã xóa); undefined = chỉ là hai yêu cầu xem trước chồng nhau
        const wasReset = Boolean(latestPreviewMap && classId in latestPreviewMap && latestPreviewMap[classId] === null);
        const staleCls = classes.find((c) => c.id === classId);
        const fallbackPreview = computeCourseClosePreview({
          currentUser,
          classItem: staleCls,
          course: courses.find((c) => c.id === staleCls?.courseId),
          lessons,
          students,
          cohortMembers,
          quizResults,
          submissions,
          activeReservationsCount: activeReservationsByClass[classId] ?? 0,
          isSchedule14Confirmed: options?.isSchedule14Confirmed ?? Boolean(staleCls?.is14SessionsConfirmed),
          csvVerification: csvVerifications[classId],
          currentOperation: wasReset ? null : courseCloseOperations[classId],
        });
        if (isLiveMode && (storageQuotaError || storageQuota?.code === 'STORAGE_QUOTA_STATUS_UNKNOWN' || (storageQuota as any)?.statusUnknown)) {
          fallbackPreview.blockErrors.push('Chưa xác định được trạng thái dung lượng Storage từ máy chủ. Vui lòng bấm Kiểm tra lại hạn mức.');
          if (fallbackPreview.blockErrorCodes) {
            fallbackPreview.blockErrorCodes.push('STORAGE_QUOTA_STATUS_UNKNOWN');
          }
          fallbackPreview.canExecuteDelete = false;
        }
        return fallbackPreview;
      };
      try {
        // R17-03: fetchCourseClosePreview chỉ ĐỌC trạng thái xem trước từ máy chủ, không gửi confirmed14Sessions
        // để việc đọc lại preview không vô tình ghi đè is_14_sessions_confirmed trong cơ sở dữ liệu
        // (việc ghi xác nhận do setConfirmed14SessionsForClass đảm nhiệm).
        const res = await fetch('/api/m2/m5-course-close-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
          }),
        });
        if (isStalePreviewRequest()) return resolveStalePreview();
        const data = await res.json().catch(() => null);
        if (isStalePreviewRequest()) return resolveStalePreview();
        if (res.ok && data?.success && data?.data) {
          const srvData = data.data;

          const currentCls = classes.find((c) => c.id === classId);
          const mappedClass: ClassItem = srvData.classItem
            ? {
                ...currentCls,
                ...srvData.classItem,
                id: srvData.classItem.id,
                code: srvData.classItem.code,
                name: srvData.classItem.name,
                courseId: srvData.classItem.course_id ?? srvData.classItem.courseId,
                teacherId: srvData.classItem.teacher_id ?? srvData.classItem.teacherId,
                status: srvData.classItem.status,
                is14SessionsConfirmed: Boolean(
                  srvData.classItem.is_14_sessions_confirmed ?? srvData.classItem.is14SessionsConfirmed
                ),
                isFixture: Boolean(srvData.classItem.is_fixture ?? srvData.classItem.isFixture),
              }
            : currentCls!;

          const courseId = mappedClass?.courseId || '';
          const currentCrs = courses.find((c) => c.id === courseId);
          const mappedCourse: Course | undefined = srvData.course
            ? {
                ...currentCrs,
                ...srvData.course,
                id: srvData.course.id,
                code: srvData.course.code,
                name: srvData.course.name,
                description: srvData.course.description ?? '',
                totalSessions: srvData.course.total_sessions ?? srvData.course.totalSessions ?? 14,
                status: srvData.course.status ?? 'active',
              }
            : currentCrs;

          // R13-04: phân biệt danh sách rỗng [] từ máy chủ với dữ liệu không có (undefined)
          const hasServerLessons = Array.isArray(srvData.lessons);
          const mappedLessons: Lesson[] = hasServerLessons
            ? srvData.lessons.map((l: any) => ({
                id: l.id,
                courseId: l.course_id ?? l.courseId ?? courseId,
                sessionNumber: Number(l.session_number ?? l.sessionNumber ?? 0),
                title: l.title,
                description: l.description ?? '',
                materials: l.materials ?? '',
                videoUrl: l.video_url ?? l.videoUrl ?? '',
                status: l.status,
                hasQuiz: Boolean(l.has_quiz ?? l.hasQuiz),
                hasPractice: Boolean(l.has_practice ?? l.hasPractice),
                practiceMode: l.practice_mode ?? l.practiceMode ?? 'link_only',
                questions: l.questions ?? [],
              }))
            : lessons.filter((l) => l.courseId === courseId);

          const courseLessonIds = new Set(mappedLessons.map((l) => l.id));

          const mappedCohort = Array.isArray(srvData.cohortMembers)
            ? srvData.cohortMembers.map((cm: any) => ({
                id: cm.student_id ?? cm.studentId ?? cm.id,
                classId: cm.class_id ?? cm.classId ?? classId,
                courseId: cm.course_id ?? cm.courseId ?? courseId,
                studentId: cm.student_id ?? cm.studentId ?? cm.id,
                participantId: cm.participant_id ?? cm.participantId,
                membershipStatus: cm.membership_status ?? cm.membershipStatus ?? 'active',
                status: cm.membership_status ?? cm.membershipStatus ?? cm.status ?? 'active',
                notes: cm.notes_snapshot ?? cm.notesSnapshot ?? cm.notes ?? '',
                notesSnapshot: cm.notes_snapshot ?? cm.notesSnapshot ?? cm.notes ?? '',
                isFixture: Boolean(cm.is_m5_fixture ?? cm.isFixture),
              }))
            : [];

          const mappedQuizzes: QuizResult[] = Array.isArray(srvData.quizResults)
            ? srvData.quizResults.map((q: any) => ({
                studentId: q.student_id ?? q.studentId,
                lessonId: q.lesson_id ?? q.lessonId,
                classId: q.class_id ?? q.classId ?? classId,
                highestScore: Number(q.highest_score ?? q.highestScore ?? 0),
                passed: Boolean(q.passed),
                attemptsCount: Number(q.attempts_count ?? q.attemptsCount ?? 0),
                lastAttemptAt: q.last_attempt_at ?? q.lastAttemptAt ?? new Date().toISOString(),
              }))
            : [];

          const mappedSubs: PracticeSubmission[] = Array.isArray(srvData.submissions)
            ? srvData.submissions.map((s: any) => ({
                id: s.id,
                studentId: s.student_id ?? s.studentId,
                lessonId: s.lesson_id ?? s.lessonId,
                classId: s.class_id ?? s.classId ?? classId,
                type: s.type,
                content: s.content,
                fileSizeBytes: s.file_size_bytes ?? s.fileSizeBytes,
                status: s.status,
                teacherFeedback: s.teacher_feedback ?? s.teacherFeedback,
                notes: s.notes,
                canResubmit: Boolean(s.can_resubmit ?? s.canResubmit ?? true),
                submittedAt: s.submitted_at ?? s.submittedAt ?? new Date().toISOString(),
                gradedAt: s.graded_at ?? s.gradedAt,
                gradedBy: s.graded_by ?? s.gradedBy,
              }))
            : [];

          // R23-01: phân biệt máy chủ trả tường minh `currentOperation: null` với việc không có trường này
          const hasServerCurrentOp =
            srvData !== null &&
            typeof srvData === 'object' &&
            ('currentOperation' in srvData || 'current_operation' in srvData);
          const rawCurrentOp = hasServerCurrentOp
            ? ('currentOperation' in srvData ? srvData.currentOperation : srvData.current_operation)
            : undefined;
          const mappedOp = rawCurrentOp
            ? {
                ...rawCurrentOp,
                id: rawCurrentOp.id,
                classId: rawCurrentOp.class_id ?? rawCurrentOp.classId,
                courseId: rawCurrentOp.course_id ?? rawCurrentOp.courseId,
                status: rawCurrentOp.status,
                stage: rawCurrentOp.stage,
                deletedStoragePaths: rawCurrentOp.deleted_storage_paths ?? rawCurrentOp.deletedStoragePaths ?? [],
                remainingStoragePaths: rawCurrentOp.remaining_storage_paths ?? rawCurrentOp.remainingStoragePaths ?? [],
                storageFilesCount: rawCurrentOp.storage_files_count ?? rawCurrentOp.storageFilesCount,
                storageBytesCount: rawCurrentOp.storage_bytes_count ?? rawCurrentOp.storageBytesCount,
                snapshotDigest: rawCurrentOp.snapshot_digest ?? rawCurrentOp.snapshotDigest,
                csvSha256: rawCurrentOp.csv_sha256 ?? rawCurrentOp.csvSha256,
              }
            : null;

          // Cập nhật đầy đủ vào React state
          if (mappedClass) {
            setClasses((prev) => prev.map((c) => (c.id === classId ? mappedClass : c)));
          }
          if (mappedCourse) {
            setCourses((prev) =>
              prev.some((crs) => crs.id === mappedCourse.id)
                ? prev.map((crs) => (crs.id === mappedCourse.id ? mappedCourse : crs))
                : [...prev, mappedCourse]
            );
          }
          if (hasServerLessons) {
            setLessons((prev) => {
              const otherLessons = prev.filter((l) => l.courseId !== courseId);
              return [...otherLessons, ...mappedLessons];
            });
          }
          if (Array.isArray(srvData.cohortMembers)) {
            setCohortMembers((prev) => {
              const otherMembers = prev.filter(
                (cm) => cm.classId !== classId || (courseId && cm.courseId && cm.courseId !== courseId)
              );
              return [...otherMembers, ...mappedCohort];
            });
          }
          if (Array.isArray(srvData.quizResults)) {
            setQuizResults((prev) => {
              const otherQuizzes = prev.filter(
                (q) => q.classId !== classId || !courseLessonIds.has(q.lessonId)
              );
              return [...otherQuizzes, ...mappedQuizzes];
            });
          }
          if (Array.isArray(srvData.submissions)) {
            setSubmissions((prev) => {
              const otherSubs = prev.filter(
                (s) => s.classId !== classId || !courseLessonIds.has(s.lessonId)
              );
              return [...otherSubs, ...mappedSubs];
            });
          }
          if (typeof srvData.activeReservationsCount === 'number') {
            setActiveReservationsByClass((prev) => ({
              ...prev,
              [classId]: srvData.activeReservationsCount,
            }));
          }
          if (mappedOp) {
            setCourseCloseOperations((prev) => ({
              ...prev,
              [classId]: mappedOp,
            }));
          } else if (hasServerCurrentOp && rawCurrentOp === null) {
            // R23-01: Máy chủ xác nhận lớp không còn tác vụ đóng khóa -> xóa trạng thái cũ của riêng lớp này
            setCourseCloseOperations((prev) => {
              if (!(classId in prev)) return prev;
              const { [classId]: _removedOp, ...rest } = prev;
              return rest;
            });
          }

          // R25-01: Bỏ qua danh sách học sinh dùng chung cũ nếu bộ mẫu đã được đặt lại/dọn trong lúc yêu cầu đang bay
          const canApplySharedStudents = !isStaleSharedStudents();
          const rawMappedStudents: StudentProfile[] | null =
            Array.isArray(srvData.students)
              ? srvData.students.map((st: any) => {
                  const existing = students.find((s) => s.id === st.id);
                  return {
                    ...existing,
                    id: st.id,
                    participantId: st.participantId ?? st.participant_id ?? existing?.participantId ?? '',
                    studentCode: st.studentCode ?? st.student_code ?? existing?.studentCode ?? '',
                    fullName: st.fullName ?? st.full_name ?? existing?.fullName ?? '',
                    currentClassId: st.currentClassId ?? st.current_class_id ?? existing?.currentClassId ?? '',
                    originalClassId: st.originalClassId ?? st.original_class_id ?? existing?.originalClassId ?? '',
                    pinHash: existing?.pinHash ?? st.pinHash ?? null,
                    hasPin: st.hasPin ?? existing?.hasPin,
                    pinIssuedAt: st.pinIssuedAt ?? st.pin_issued_at ?? existing?.pinIssuedAt ?? null,
                    status: st.status ?? existing?.status ?? 'active',
                    notes: st.notes ?? existing?.notes ?? '',
                  } as StudentProfile;
                })
              : null;
          // Chỉ ghi vào danh sách học sinh dùng chung khi phản hồi không cũ (giữ nguyên bản sửa R25-01)
          if (canApplySharedStudents && rawMappedStudents) {
            setStudents(rawMappedStudents);
          }
          // Khi danh sách dùng chung đã cũ: vẫn dùng học sinh mới của máy chủ cho bản xem trước, nhưng loại học sinh mẫu Mốc 5
          const staleFixtureStudentIds = new Set<string>([
            ...m5Students.map((s) => s.id),
            '00000000-0000-0000-0000-000000050101',
            '00000000-0000-0000-0000-000000050102',
            '00000000-0000-0000-0000-000000050103',
            '00000000-0000-0000-0000-000000050104',
            '00000000-0000-0000-0000-000000050105',
          ]);
          const previewStudents: StudentProfile[] = rawMappedStudents
            ? canApplySharedStudents
              ? rawMappedStudents
              : rawMappedStudents.filter((s) => !staleFixtureStudentIds.has(s.id))
            : students;

          // R6-04: Tính trực tiếp freshPreview từ dữ liệu mới nhận của máy chủ
          const freshPreview = computeCourseClosePreview({
            currentUser,
            classItem: mappedClass,
            course: mappedCourse,
            lessons: hasServerLessons ? mappedLessons : lessons,
            students: previewStudents,
            cohortMembers: [
              ...cohortMembers.filter(
                (cm) => cm.classId !== classId || (courseId && cm.courseId && cm.courseId !== courseId)
              ),
              ...mappedCohort,
            ],
            quizResults: [
              ...quizResults.filter((q) => q.classId !== classId || !courseLessonIds.has(q.lessonId)),
              ...mappedQuizzes,
            ],
            submissions: [
              ...submissions.filter((s) => s.classId !== classId || !courseLessonIds.has(s.lessonId)),
              ...mappedSubs,
            ],
            activeReservationsCount: srvData.activeReservationsCount ?? activeReservationsByClass[classId] ?? 0,
            isSchedule14Confirmed: options?.isSchedule14Confirmed ?? Boolean(mappedClass?.is14SessionsConfirmed),
            csvVerification: csvVerifications[classId],
            currentOperation: hasServerCurrentOp ? mappedOp : (mappedOp ?? courseCloseOperations[classId]),
          });

          if (isLiveMode && (storageQuotaError || storageQuota?.code === 'STORAGE_QUOTA_STATUS_UNKNOWN' || (storageQuota as any)?.statusUnknown)) {
            freshPreview.blockErrors.push('Chưa xác định được trạng thái dung lượng Storage từ máy chủ. Vui lòng bấm Kiểm tra lại hạn mức.');
            if (freshPreview.blockErrorCodes) {
              freshPreview.blockErrorCodes.push('STORAGE_QUOTA_STATUS_UNKNOWN');
            }
            freshPreview.canExecuteDelete = false;
          }

          if (latestPreviewMap && !isStalePreviewRequest()) {
            latestPreviewMap[classId] = freshPreview;
          }
          return freshPreview;
        }
      } catch {
        if (isStalePreviewRequest() && !isStaleAuth() && latestPreviewMap?.[classId]) {
          return latestPreviewMap[classId];
        }
      }
      if (isStalePreviewRequest()) return resolveStalePreview();
    }
    return generateCourseClosePreview(classId, options);
  }, [
    isLiveMode,
    generateCourseClosePreview,
    classes,
    courses,
    lessons,
    students,
    cohortMembers,
    quizResults,
    submissions,
    csvVerifications,
    courseCloseOperations,
    currentUser,
    activeReservationsByClass,
    storageQuotaError,
    storageQuota,
  ]);

  const setConfirmed14SessionsForClass = useCallback(async (classId: string, confirmed: boolean) => {
    const currentCls = classes.find((c) => c.id === classId);
    // R20-02: chỉ cập nhật xác nhận cho đúng khóa Admin đang xác nhận, không ghi sang khóa mới của lớp
    const targetCourseId = currentCls?.courseId;
    setClasses((prev) =>
      prev.map((c) => (c.id === classId && c.courseId === targetCourseId ? { ...c, is14SessionsConfirmed: confirmed } : c))
    );
    if (isLiveMode) {
      try {
        await fetch('/api/m2/m5-course-close-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            // R17-03: kèm courseId hiện tại để máy chủ không ghi xác nhận của khóa cũ sang khóa mới
            courseId: currentCls?.courseId,
            confirmed14Sessions: confirmed,
          }),
        });
      } catch {}
    }
    return { success: true };
  }, [isLiveMode, classes]);

  const exportCourseCloseCsv = useCallback(async (classId: string, confirmed14Sessions?: boolean, courseId?: string) => {
    const cls = classes.find((c) => c.id === classId);
    const crs = courses.find((c) => c.id === cls?.courseId);

    if (!cls || !crs) {
      return { success: false, message: 'Không tìm thấy lớp học hoặc khóa học liên kết.' };
    }

    // R20-02: courseId Admin đang xác nhận phải khớp khóa hiện tại của lớp
    const targetCourseId = courseId ? String(courseId).trim() : String(crs.id || '').trim();
    if (!targetCourseId || String(cls.courseId || '') !== targetCourseId) {
      return { success: false, message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.' };
    }

    const is14Confirmed = confirmed14Sessions ?? Boolean(cls.is14SessionsConfirmed);

    // P1-02: Ở chế độ Live, gọi thẳng API Edge Function và dùng chính kết quả server trả về
    if (isLiveMode) {
      // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu
      const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
      const isStaleAuth = () =>
        Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
      try {
        const res = await fetch('/api/m2/m5-export-course-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            courseId: targetCourseId,
            confirmed14Sessions: is14Confirmed,
          }),
        });

        const data = await res.json().catch(() => null);
        if (isStaleAuth()) {
          return { success: false, message: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.' };
        }
        if (res.ok && data?.success && data?.data) {
          const srvData = data.data;
          if (Array.isArray(srvData.cohortMembers)) {
            setCohortMembers((prev) => {
              const otherMembers = prev.filter((cm) => cm.classId !== classId);
              return [...otherMembers, ...srvData.cohortMembers];
            });
          }
          if (srvData.verification) {
            setCsvVerifications((prev) => ({
              ...prev,
              [classId]: srvData.verification,
            }));
          }
          if (is14Confirmed) {
            setClasses((prev) =>
              prev.map((c) => (c.id === classId && c.courseId === targetCourseId ? { ...c, is14SessionsConfirmed: true } : c))
            );
          }
          return {
            success: true,
            message: data.message || `Xuất và đối chiếu CSV thành công từ máy chủ: Đủ ${srvData.rowCount} dòng.`,
            csvContent: srvData.csvContent,
            rowCount: srvData.rowCount,
            participantCount: srvData.participantCount,
            verification: srvData.verification,
          };
        }
        return {
          success: false,
          message: data?.message || 'Không thể xuất tệp CSV từ máy chủ.',
          verification: data?.errors
            ? {
                valid: false,
                errors: Array.isArray(data.errors) ? data.errors : [String(data.errors)],
                rowCount: 0,
                participantCount: 0,
                sha256: null,
                snapshotDigest: null,
              }
            : undefined,
        };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Lỗi mạng khi xuất CSV đóng khóa từ máy chủ.',
        };
      }
    }

    // R13-02: chỉ dùng bài học, kết quả quiz và bài nộp thuộc khóa hiện hành để CSV và digest khớp nhau
    const courseLessons = lessons.filter((l) => l.courseId === crs.id && l.sessionNumber >= 1 && l.sessionNumber <= 14);
    const courseLessonIds = new Set(courseLessons.map((l) => l.id));
    const courseQuizzes = quizResults.filter((q) => (!q.classId || q.classId === classId) && courseLessonIds.has(q.lessonId));
    const courseSubs = submissions.filter((s) => (!s.classId || s.classId === classId) && courseLessonIds.has(s.lessonId));

    const batchStudents = getBatchParticipants(students, classId, {
      courseId: crs.id,
      cohortMembers,
      quizResults: courseQuizzes,
      submissions: courseSubs,
      lessons: courseLessons,
      closedOperations: Object.values(courseCloseOperations),
    });

    const exportRes = buildCourseCloseCsvContent(
      batchStudents,
      courseLessons,
      cls.code,
      courseQuizzes,
      courseSubs,
      { classId, courseId: crs.id }
    );

    if (!exportRes.success || !exportRes.csvContent) {
      return {
        success: false,
        message: exportRes.message,
        rowCount: exportRes.rowCount,
        participantCount: exportRes.participantCount,
      };
    }

    const verification = verifyCourseCloseCsv(exportRes.csvContent, {
      participants: batchStudents,
      lessons: courseLessons,
      classCode: cls.code,
      classId,
      courseId: crs.id,
      quizResults: courseQuizzes,
      submissions: courseSubs,
      classItem: cls,
    });

    if (!verification.valid) {
      return {
        success: false,
        message: `Tự kiểm tra CSV thất bại: ${verification.errors.join('; ')}`,
        csvContent: exportRes.csvContent,
        rowCount: exportRes.rowCount,
        participantCount: exportRes.participantCount,
        verification,
      };
    }

    setCsvVerifications((prev) => ({
      ...prev,
      [classId]: verification,
    }));

    return {
      success: true,
      message: `Xuất và đối chiếu CSV thành công: Đủ ${exportRes.rowCount} dòng (14 buổi x ${exportRes.participantCount} học sinh). Tự kiểm tra hợp lệ 100%.`,
      csvContent: exportRes.csvContent,
      rowCount: exportRes.rowCount,
      participantCount: exportRes.participantCount,
      verification,
    };
  }, [classes, courses, students, cohortMembers, quizResults, submissions, lessons, courseCloseOperations, isLiveMode]);

  const verifyAndExecuteCourseClose = useCallback(async (
    classId: string,
    confirmed14Sessions: boolean,
    options?: {
      courseId?: string;
      nextCourseId?: string;
      simulateFailureStage?: string;
      isResume?: boolean;
      confirmedCsvOpened?: boolean;
      confirmedCsvSha256?: string;
    }
  ) => {
    if (!confirmed14Sessions) {
      return {
        success: false,
        status: 'blocked',
        code: 'SCHEDULE_14_NOT_CONFIRMED',
        message: 'Admin phải đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch trình thực tế.',
      };
    }

    // R8-03: Kiểm tra Admin đã mở và kiểm tra CSV mới nhất trước khi thực thi xóa
    if (!options?.isResume && options?.confirmedCsvOpened === false) {
      return {
        success: false,
        status: 'blocked',
        code: 'CSV_OPEN_NOT_CONFIRMED',
        message: 'Admin phải xác nhận đã tải, mở và kiểm tra tệp CSV đúng lớp/khóa trước khi xóa.',
      };
    }

    // R20-02: xác định tường minh khóa học Admin đang đóng khóa (Resume dùng khóa của tác vụ dở dang)
    const currentCls = classes.find((c) => c.id === classId);
    const activeOp = courseCloseOperations[classId];
    const targetCourseId = String(
      options?.courseId || (options?.isResume && activeOp?.courseId ? activeOp.courseId : currentCls?.courseId || '')
    ).trim();

    // R26-02: Vô hiệu hóa mọi yêu cầu xem trước cũ của lớp này (đã gửi trước khi đóng khóa) và tăng phiên bản danh sách học sinh dùng chung
    const invalidateClassPreviews = () => {
      if (typeof sharedStudentsEpochRef !== 'undefined' && sharedStudentsEpochRef) {
        sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;
      }
      if (typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current) {
        previewReqSeqByClassRef.current.__shared_students_epoch__ =
          (previewReqSeqByClassRef.current.__shared_students_epoch__ || 0) + 1;
        previewReqSeqByClassRef.current[classId] = (previewReqSeqByClassRef.current[classId] || 0) + 1;
      }
      if (typeof latestPreviewByClassRef !== 'undefined' && latestPreviewByClassRef?.current) {
        latestPreviewByClassRef.current[classId] = null;
      }
    };

    if (isLiveMode) {
      // R26-01: Ghi nhận phiên đăng nhập lúc gửi yêu cầu; phản hồi của phiên cũ không được cập nhật state phiên mới
      const reqAuthEpoch = typeof authEpochRef !== 'undefined' && authEpochRef ? authEpochRef.current : 0;
      const isStaleAuth = () =>
        Boolean(typeof authEpochRef !== 'undefined' && authEpochRef && authEpochRef.current !== reqAuthEpoch);
      try {
        invalidateClassPreviews();
        const res = await fetch('/api/m2/m5-execute-course-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            courseId: targetCourseId,
            confirmed14Sessions,
            nextCourseId: options?.nextCourseId || null,
            simulateFailureStage: options?.simulateFailureStage || null,
            isResume: Boolean(options?.isResume),
            confirmedCsvOpened: options?.isResume ? true : Boolean(options?.confirmedCsvOpened ?? true),
            confirmedCsvSha256: options?.confirmedCsvSha256 || null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          if (isStaleAuth()) {
            return {
              success: true,
              status: 'completed',
              code: 'OK',
              message: data.message || 'Đóng khóa học và xóa dữ liệu thành công.',
            };
          }
          // R26-02: Vô hiệu hóa xem trước cũ và xóa sạch trạng thái cục bộ của lớp vừa đóng khóa (kể cả khi Admin đã chuyển sang lớp khác)
          invalidateClassPreviews();
          setCsvVerifications((prev) => {
            if (!(classId in prev)) return prev;
            const { [classId]: _removedCsv, ...rest } = prev;
            return rest;
          });
          setCourseCloseOperations((prev) => {
            if (!(classId in prev)) return prev;
            const { [classId]: _removedOp, ...rest } = prev;
            return rest;
          });
          setActiveReservationsByClass((prev) => {
            if (!(classId in prev)) return prev;
            const { [classId]: _removedRes, ...rest } = prev;
            return rest;
          });
          await fetchBootstrapData();
          // R27-01: Phiên cũ không được vô hiệu hóa xem trước của phiên đăng nhập mới sau khi chờ tải lại dữ liệu
          if (isStaleAuth()) {
            return {
              success: true,
              status: 'completed',
              code: 'OK',
              message: data.message || 'Đóng khóa học và xóa dữ liệu thành công.',
            };
          }
          invalidateClassPreviews();
          return {
            success: true,
            status: 'completed',
            code: 'OK',
            message: data.message || 'Đóng khóa học và xóa dữ liệu thành công.',
          };
        }

        if (isStaleAuth()) {
          return {
            success: false,
            status: data?.status || 'incomplete',
            code: data?.code || 'EXECUTION_FAILED',
            message: data?.message || 'Không thể thực hiện tác vụ đóng khóa học.',
          };
        }

        // R5-06: Khi phản hồi incomplete hoặc có dữ liệu dở dang, cập nhật ngay courseCloseOperations
        const targetClass = classes.find((c) => c.id === classId);
        if (data?.status === 'incomplete' || data?.data) {
          // R26-02: Xem trước cũ (gửi trước khi chạy đóng khóa) không được ghi đè trạng thái incomplete mới
          if (typeof previewReqSeqByClassRef !== 'undefined' && previewReqSeqByClassRef?.current) {
            previewReqSeqByClassRef.current[classId] = (previewReqSeqByClassRef.current[classId] || 0) + 1;
          }
          setCourseCloseOperations((prev) => ({
            ...prev,
            [classId]: {
              ...(prev[classId] || {}),
              id: data?.data?.operationId || prev[classId]?.id || `op_${classId}`,
              classId,
              courseId: targetClass?.courseId || '',
              status: data?.status || 'incomplete',
              deletedStoragePaths: data?.data?.deletedPaths ?? prev[classId]?.deletedStoragePaths ?? [],
              remainingStoragePaths: data?.data?.remainingPaths ?? prev[classId]?.remainingStoragePaths ?? [],
              deleted_storage_paths: data?.data?.deletedPaths ?? prev[classId]?.deleted_storage_paths ?? [],
              remaining_storage_paths: data?.data?.remainingPaths ?? prev[classId]?.remaining_storage_paths ?? [],
              lastErrorCode: data?.code,
              lastErrorMessage: data?.message,
            },
          }));
          // R17-03: chỉ đọc lại trạng thái từ máy chủ (không truyền xác nhận 14 buổi của khóa cũ)
          await fetchCourseClosePreview(classId).catch(() => null);
        }

        return {
          success: false,
          status: data?.status || 'incomplete',
          code: data?.code || 'EXECUTION_FAILED',
          message: data?.message || 'Không thể thực hiện tác vụ đóng khóa học.',
        };
      } catch {
        return {
          success: false,
          status: 'incomplete',
          code: 'NETWORK_ERROR',
          message: 'Lỗi kết nối máy chủ khi thực hiện tác vụ đóng khóa.',
        };
      }
    }

    // Demo Mode execution
    const cls = classes.find((c) => c.id === classId);
    // R20-02: Demo cũng từ chối khi lớp đã sang khóa khác so với khóa Admin đang xác nhận
    if (options?.courseId && String(cls?.courseId || '') !== String(options.courseId).trim()) {
      return {
        success: false,
        status: 'blocked',
        code: 'CLASS_COURSE_MISMATCH',
        message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.',
      };
    }
    const crs = courses.find((c) => c.id === cls?.courseId);
    const verification = csvVerifications[classId];
    const preview = generateCourseClosePreview(classId, { isSchedule14Confirmed: confirmed14Sessions });

    // R18-01: Chặn bắt đầu đóng khóa nếu đợt học có chung học sinh với tác vụ đóng khóa dở dang của một lớp khác
    // (hoàn tất lớp này sẽ làm lệch snapshot digest của lớp kia và kẹt CSV_SNAPSHOT_MISMATCH). Resume của chính lớp đang dở vẫn được chạy.
    if (!options?.isResume) {
      const otherClosingOps = Object.entries(courseCloseOperations)
        .filter(
          ([key, op]) =>
            op &&
            (op.classId || key) !== classId &&
            (op.status === 'deleting_storage' || op.status === 'deleting_db' || op.status === 'incomplete')
        )
        .map(([key, op]) => {
          const otherClassId: string = op.classId || key;
          return {
            classId: otherClassId,
            courseId: op.courseId || classes.find((c) => c.id === otherClassId)?.courseId || '',
          };
        });

      if (otherClosingOps.length > 0) {
        const cohortOf = (targetClassId: string, targetCourseId: string) => {
          const lessonIds = new Set(lessons.filter((l) => l.courseId === targetCourseId).map((l) => l.id));
          const ids = new Set<string>();
          students.forEach((s) => {
            if (s.currentClassId === targetClassId || s.originalClassId === targetClassId) ids.add(s.id);
          });
          cohortMembers.forEach((cm) => {
            if (
              (cm.classId || cm.class_id) === targetClassId &&
              (cm.courseId || cm.course_id) === targetCourseId
            ) {
              ids.add(cm.studentId || cm.student_id || cm.id);
            }
          });
          quizResults.forEach((q) => {
            if ((q.classId === targetClassId || !q.classId) && lessonIds.has(q.lessonId)) ids.add(q.studentId);
          });
          submissions.forEach((s) => {
            if (s.classId === targetClassId && lessonIds.has(s.lessonId)) ids.add(s.studentId);
          });
          return ids;
        };

        const thisCohort = cohortOf(classId, crs?.id || '');
        const sharesStudent = otherClosingOps.some((op) => {
          const otherCohort = cohortOf(op.classId, op.courseId);
          return Array.from(thisCohort).some((studentId) => otherCohort.has(studentId));
        });
        if (sharesStudent) {
          return {
            success: false,
            status: 'blocked',
            code: 'SHARED_COHORT_CLOSE_IN_PROGRESS',
            message:
              'Có học sinh thuộc đợt học này đang nằm trong tác vụ đóng khóa dở dang của một lớp khác. Vui lòng hoàn tất tác vụ đóng khóa của lớp đó trước.',
          };
        }
      }
    }

    const storageClient = {
      remove: async (paths: string[]) => ({ error: null, data: paths }),
    };

    const dbClient = {
      finalizeDbDeletion: async () => ({ success: true }),
    };

    const execRes = await runCourseCloseExecution({
      classId,
      courseId: crs?.id || '',
      nextCourseId: options?.nextCourseId || null,
      targetStoragePaths: preview.targetStoragePaths || [],
      existingOperation: courseCloseOperations[classId],
      storageClient,
      dbClient,
      csvVerification: verification,
      currentSnapshotDigest: preview.currentSnapshotDigest,
      simulateFailureStage: options?.simulateFailureStage || null,
    });

    if (execRes.status === 'incomplete') {
      setCourseCloseOperations((prev) => ({
        ...prev,
        [classId]: {
          status: 'incomplete',
          deletedStoragePaths: execRes.deletedStoragePaths || [],
          remainingStoragePaths: execRes.remainingStoragePaths || [],
          code: execRes.code,
          message: execRes.message,
        },
      }));
      return execRes;
    }

    if (execRes.success) {
      // R26-02: Vô hiệu hóa xem trước cũ của lớp vừa đóng khóa (Demo)
      invalidateClassPreviews();
      // R7-03: Lọc chính xác theo bài học của khóa đang đóng, giữ nguyên dữ liệu của khóa khác
      const closingCourseLessonIds = new Set(
        lessons.filter((l) => l.courseId === crs?.id).map((l) => l.id)
      );
      setQuizResults((prev) =>
        prev.filter(
          (q) => q.classId !== classId || !closingCourseLessonIds.has(q.lessonId)
        )
      );
      setSubmissions((prev) =>
        prev.filter(
          (s) => s.classId !== classId || !closingCourseLessonIds.has(s.lessonId)
        )
      );

      // R4-03: Cập nhật originalClassId cho học sinh đã rời lớp để không bị kéo nhầm vào khóa kế tiếp
      // R18-01: Không chạm vào học sinh đang thuộc đợt đóng khóa chưa hoàn tất của lớp mà họ đã chuyển sang (giữ nguyên snapshot digest của lớp đó)
      setStudents((prev) =>
        prev.map((s) => {
          if (s.originalClassId === classId && s.currentClassId && s.currentClassId !== classId) {
            const destOp = courseCloseOperations[s.currentClassId];
            const destPending =
              Boolean(csvVerifications[s.currentClassId]) ||
              (destOp &&
                ['previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete'].includes(destOp.status));
            if (destPending) return s;
            return { ...s, originalClassId: s.currentClassId };
          }
          return s;
        })
      );

      // R4-03: Nếu có khóa kế tiếp, khởi tạo danh sách thành viên đợt mới trong cohortMembers cho học sinh hiện tại của lớp
      if (options?.nextCourseId) {
        const nextCrs = options.nextCourseId;
        setCohortMembers((prev) => {
          const currentStudents = students.filter((s) => s.currentClassId === classId);
          const newEntries = currentStudents.map((s) => ({
            id: `cm_${classId}_${nextCrs}_${s.id}`,
            classId,
            courseId: nextCrs,
            studentId: s.id,
            participantId: s.participantId || `PART_${s.id.slice(0, 8)}`,
            membershipStatus: s.status === 'archived' ? 'archived' : 'active',
            notesSnapshot: s.notes || '',
            joinedAt: new Date().toISOString(),
          }));
          return [...prev, ...newEntries];
        });
      }

      setClasses((prev) =>
        prev.map((c) => {
          if (c.id === classId) {
            return {
              ...c,
              courseId: options?.nextCourseId || null,
              is14SessionsConfirmed: false,
              status: options?.nextCourseId ? 'active' : 'completed',
            };
          }
          return c;
        })
      );

      setCsvVerifications((prev) => {
        const copy = { ...prev };
        delete copy[classId];
        return copy;
      });
      // R7-03: Lưu trạng thái tác vụ đã hoàn tất vào courseCloseOperations để phản ánh chính xác đợt học cũ đã đóng
      setCourseCloseOperations((prev) => ({
        ...prev,
        [classId]: {
          id: `op_${classId}_${crs?.id || Date.now()}`,
          classId,
          courseId: crs?.id || '',
          status: 'completed',
          deletedStoragePaths: execRes.deletedStoragePaths || [],
          remainingStoragePaths: [],
          updatedAt: new Date().toISOString(),
        },
      }));
    }

    return execRes;
  }, [
    isLiveMode,
    fetchBootstrapData,
    classes,
    courses,
    lessons,
    students,
    cohortMembers,
    quizResults,
    submissions,
    csvVerifications,
    generateCourseClosePreview,
    courseCloseOperations,
  ]);

  // Quiz / Practice Actions
  const submitQuizAttempt = async (
    studentId: string,
    lessonId: string,
    answers: number[]
  ) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/submit-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, answers }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return {
            success: true,
            message: d.message || 'Nộp bài trắc nghiệm thành công.',
            score: d.score ?? d.data?.score ?? 0,
            passed: d.passed ?? d.data?.passed ?? false,
          };
        }
        return {
          success: false,
          message: d?.message || 'Không thể nộp bài trắc nghiệm.',
          score: 0,
          passed: false,
        };
      } catch {
        return {
          success: false,
          message: 'Lỗi kết nối máy chủ khi nộp bài trắc nghiệm.',
          score: 0,
          passed: false,
        };
      }
    }

    // Demo mode simulation with 70% threshold and highest score retained
    const targetLesson = lessons.find((l) => l.id === lessonId);
    if (!targetLesson || !targetLesson.questions || targetLesson.questions.length === 0) {
      return { success: false, message: 'Bài học không có câu hỏi trắc nghiệm.', score: 0, passed: false };
    }

    let correctCount = 0;
    targetLesson.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOptionIndex) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / targetLesson.questions.length) * 100);
    const passed = score >= 70;

    const student = students.find((s) => s.id === studentId);
    setQuizResults((prev) => {
      const existing = prev.find(
        (q) => q.studentId === studentId && q.lessonId === lessonId && (!q.classId || q.classId === student?.currentClassId)
      );
      if (existing) {
        return prev.map((q) =>
          q.studentId === studentId && q.lessonId === lessonId && (!q.classId || q.classId === student?.currentClassId)
            ? {
                ...q,
                classId: student?.currentClassId,
                highestScore: Math.max(q.highestScore, score),
                attemptsCount: q.attemptsCount + 1,
                passed: q.passed || passed,
                lastAttemptAt: new Date().toISOString(),
              }
            : q
        );
      }
      return [
        ...prev,
        {
          studentId,
          lessonId,
          classId: student?.currentClassId,
          highestScore: score,
          attemptsCount: 1,
          passed,
          lastAttemptAt: new Date().toISOString(),
        },
      ];
    });

    return {
      success: true,
      message: passed
        ? 'Chúc mừng! Bạn đã đạt bài trắc nghiệm.'
        : 'Bạn chưa đạt ngưỡng 70%. Bạn có thể làm lại bài không giới hạn số lần.',
      score,
      passed,
    };
  };

  const submitPractice = async (
    studentId: string,
    lessonId: string,
    data: { type: SubmissionType; content: string; notes?: string; fileSizeBytes?: number }
  ) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/submit-practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, ...data }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Nộp bài thực hành thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể nộp bài thực hành.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    // Demo mode simulation with can_resubmit rule
    const existing = submissions.find((s) => s.studentId === studentId && s.lessonId === lessonId);
    if (existing && existing.status === 'approved' && !existing.canResubmit) {
      return {
        success: false,
        message: 'Bài nộp đã được giáo viên duyệt Đạt. Giáo viên phải mở lại quyền nộp bài trước khi học sinh được nộp bản thay thế.',
      };
    }

    const student = students.find((s) => s.id === studentId);
    const newSubmission: PracticeSubmission = {
      id: existing ? existing.id : `sub_${Date.now()}`,
      studentId,
      lessonId,
      classId: student?.currentClassId,
      type: data.type,
      content: data.content,
      fileSizeBytes: data.fileSizeBytes,
      notes: data.notes,
      status: 'submitted',
      teacherFeedback: undefined,
      submittedAt: new Date().toISOString(),
      canResubmit: true,
    };

    setSubmissions((prev) => {
      const filtered = prev.filter(
        (s) => !(s.studentId === studentId && s.lessonId === lessonId && (!s.classId || s.classId === student?.currentClassId))
      );
      return [...filtered, newSubmission];
    });

    return { success: true, message: 'Nộp bài thực hành thành công (Mô phỏng).' };
  };

  const gradeSubmission = async (
    submissionId: string,
    data: { status: 'approved' | 'needs_revision'; feedback: string }
  ) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/grade-submission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId, ...data }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Chấm bài thực hành thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể chấm bài thực hành.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    // Demo mode simulation
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              status: data.status,
              teacherFeedback: data.feedback,
              gradedAt: new Date().toISOString(),
              gradedBy: currentUser?.id,
              canResubmit: data.status === 'needs_revision',
            }
          : s
      )
    );

    return { success: true, message: 'Chấm bài thực hành thành công (Mô phỏng).' };
  };

  const reopenSubmission = async (submissionId: string) => {
    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/reopen-submission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId }),
        });
        const d = await res.json().catch(() => null);
        if (res.ok && d?.success) {
          await fetchBootstrapData();
          return { success: true, message: d.message || 'Mở lại quyền nộp bài thành công.' };
        }
        return { success: false, message: d?.message || 'Không thể mở lại quyền nộp bài.' };
      } catch {
        return { success: false, message: 'Lỗi kết nối máy chủ.' };
      }
    }

    // Demo mode simulation
    setSubmissions((prev) =>
      prev.map((s) =>
        s.id === submissionId
          ? {
              ...s,
              canResubmit: true,
            }
          : s
      )
    );

    return { success: true, message: 'Mở lại quyền nộp bài thành công (Mô phỏng).' };
  };

  const previewTeachingSync = async (
    fixtureData?: any,
    options?: {
      robFilterMode?: 'include_rob' | 'exclude_rob';
      sourceMode?: 'synthetic_fixture' | 'real_teaching_preview' | 'real_teaching_sync';
    }
  ) => {
    if (!isLiveMode) {
      const qaCheck = checkQABlock('Xem trước đồng bộ Teaching');
      if (qaCheck.blocked) {
        return {
          success: false,
          aborted: true,
          partialApplied: false,
          code: 'QA_BLOCKED',
          message: qaCheck.message,
          report: null,
        };
      }
    }

    const res = await runTeachingSnapshotPreview(
      fixtureData,
      { students, classes },
      {
        robFilterMode: options?.robFilterMode || 'include_rob',
        sourceMode: options?.sourceMode || 'synthetic_fixture',
      }
    );

    return res as {
      success: boolean;
      aborted?: boolean;
      partialApplied?: boolean;
      code?: string;
      message?: string;
      failedAtPage?: number;
      pagesRead?: number;
      report?: SyncDiffReport | null;
      aggregatePreview?: TeachingAggregatePreview;
    };
  };

  const applyTeachingSync = async (diffReport: SyncDiffReport) => {
    if (!isLiveMode) {
      const qaCheck = checkQABlock('Áp dụng đồng bộ fixture TEST');
      if (qaCheck.blocked) {
        return {
          success: false,
          code: 'QA_BLOCKED',
          message: qaCheck.message!,
        };
      }
    }

    const applied = applyTeachingSyncDiffToState(
      { classes, students, users, quizResults, submissions },
      diffReport
    );

    if (!applied.success || !applied.state) {
      return {
        success: false,
        code: applied.code,
        message: applied.message,
      };
    }

    if (isLiveMode) {
      try {
        const res = await fetch('/api/m2/apply-teaching-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diffReport }),
        });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.success) {
          if (d?.code === 'STALE_PREVIEW_CONFLICT') {
            await fetchBootstrapData();
          }
          return {
            success: false,
            code: d?.code || 'SERVER_APPLY_FAILED',
            message: d?.message || 'Không thể lưu kết quả đồng bộ fixture vào máy chủ TEST.',
          };
        }
        await fetchBootstrapData();
        return {
          success: true,
          code: applied.code,
          message: d.message || applied.message,
          addedStudentsCount: d.data?.addedStudentsCount ?? applied.addedStudentsCount,
          updatedStudentsCount: d.data?.updatedStudentsCount ?? applied.updatedStudentsCount,
          createdClassesCount: d.data?.createdClassesCount ?? applied.createdClassesCount,
        };
      } catch {
        return {
          success: false,
          code: 'NETWORK_ERROR',
          message: 'Lỗi kết nối máy chủ khi lưu đồng bộ fixture vào TEST.',
        };
      }
    }

    const nextState = applied.state as {
      classes: ClassItem[];
      students: StudentProfile[];
      users: User[];
    };
    setClasses(nextState.classes);
    setStudents(nextState.students);
    setUsers(nextState.users);

    return {
      success: true,
      code: applied.code,
      message: applied.message,
      addedStudentsCount: applied.addedStudentsCount,
      updatedStudentsCount: applied.updatedStudentsCount,
      createdClassesCount: applied.createdClassesCount,
    };
  };

  const resetTeachingFixtureSync = async () => {
    if (isLiveMode) {
      let successMsg = 'Đã khôi phục dữ liệu lớp và học sinh TEST về trạng thái chuẩn trên máy chủ.';
      try {
        const res = await fetch('/api/m2/reset-teaching-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.success) {
          if (d?.code === 'STORAGE_CLEANUP_FAILED') {
            await fetchBootstrapData();
          }
          return {
            success: false,
            message: d?.message || 'Không thể khôi phục dữ liệu mẫu trên máy chủ TEST.',
          };
        }
        if (typeof d?.message === 'string' && d.message.trim()) {
          successMsg = d.message.trim();
        }
      } catch {
        return {
          success: false,
          message: 'Lỗi kết nối máy chủ khi khôi phục dữ liệu mẫu TEST.',
        };
      }
      await fetchBootstrapData();
      return {
        success: true,
        message: successMsg,
      };
    }
    const initialStudentIds = new Set(initialStudents.map((s) => s.id));
    setClasses(initialClasses);
    setStudents(initialStudents);
    setUsers(initialUsers);
    setQuizResults((prev) => prev.filter((q) => initialStudentIds.has(q.studentId)));
    setSubmissions((prev) => prev.filter((sub) => initialStudentIds.has(sub.studentId)));
    return {
      success: true,
      message: 'Đã khôi phục dữ liệu lớp và học sinh mẫu về trạng thái ban đầu.',
    };
  };

  const getStudentProgress = (studentId: string, courseId = 'crs_rob_k14'): StudentOverallProgress => {
    const student = students.find((s) => s.id === studentId);
    const currentClassId = student?.currentClassId;

    const sortedLessons = [...lessons]
      .filter((l) => l.courseId === courseId)
      .sort((a, b) => a.sessionNumber - b.sessionNumber);

    const summaries: StudentSessionSummary[] = sortedLessons.map((les) => {
      const quiz = quizResults.find(
        (q) => q.studentId === studentId && q.lessonId === les.id && (!q.classId || !currentClassId || q.classId === currentClassId)
      );
      const sub = submissions.find(
        (s) => s.studentId === studentId && s.lessonId === les.id && (!s.classId || !currentClassId || s.classId === currentClassId)
      );
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
        cohortMembers,
        setCohortMembers,
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
        submitQuizAttempt,
        submitPractice,
        gradeSubmission,
        reopenSubmission,
        previewTeachingSync,
        applyTeachingSync,
        resetTeachingFixtureSync,
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
