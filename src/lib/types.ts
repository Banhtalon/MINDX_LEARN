// MINDX LEARN - Domain and Simulation Types

export type Role = 'admin' | 'teacher' | 'student';

export type UserStatus = 'active' | 'archived';

export interface User {
  id: string;
  name: string;
  email?: string;
  studentCode?: string;
  role: Role;
  status: UserStatus;
  assignedClassIds?: string[];
}

export type QAScenario =
  | 'normal'
  | 'loading'
  | 'save_error'
  | 'network_error'
  | 'session_expired'
  | 'forbidden'
  | 'empty_data';

export interface QAState {
  scenario: QAScenario;
  delayMs: number;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  totalSessions: 14;
  createdAt: string;
}

export type LessonStatus = 'draft' | 'published';
export type PracticeMode = 'link_only' | 'file_allowed';

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  sessionNumber: number; // 1 to 14
  title: string;
  description: string;
  materials: string;
  videoUrl: string;
  status: LessonStatus;
  hasQuiz: boolean;
  hasPractice: boolean;
  practiceMode: PracticeMode;
  questions: Question[];
}

export type ClassStatus = 'active' | 'archived' | 'completed';

export interface ClassItem {
  id: string;
  code: string;
  name: string;
  courseId: string | null;
  teacherId: string | null;
  status: ClassStatus;
  is14SessionsConfirmed?: boolean;
}

export type StudentStatus = 'active' | 'transferred' | 'archived';

export interface StudentProfile {
  id: string;
  participantId: string; // Stable internal participant ID for the batch
  studentCode: string;
  fullName: string;
  currentClassId: string;
  originalClassId: string;
  pinHash: string | null; // null if not yet issued
  pinIssuedAt: string | null;
  status: StudentStatus;
  notes?: string;
}

export interface QuizResult {
  studentId: string;
  lessonId: string;
  highestScore: number; // 0..100
  attemptsCount: number;
  passed: boolean; // highestScore >= 70
  lastAttemptAt: string;
}

export type SubmissionStatus = 'submitted' | 'approved' | 'needs_revision';
export type SubmissionType = 'link' | 'file';

export interface PracticeSubmission {
  id: string;
  studentId: string;
  lessonId: string;
  type: SubmissionType;
  content: string; // URL or filename
  fileSizeBytes?: number; // <= 2MB
  notes?: string;
  status: SubmissionStatus;
  teacherFeedback?: string;
  submittedAt: string;
  gradedAt?: string;
  gradedBy?: string;
  canResubmit: boolean; // Locked if approved, unless reopened by teacher
}

export interface StudentSessionSummary {
  sessionNumber: number;
  lessonTitle: string;
  lessonStatus: LessonStatus;
  hasQuiz: boolean;
  quizScore: number | null;
  quizPassed: boolean;
  hasPractice: boolean;
  practiceStatus: SubmissionStatus | 'not_submitted';
  practicePassed: boolean;
  isCompleted: boolean;
}

export interface StudentOverallProgress {
  studentId: string;
  completedSessionsCount: number; // X in X/14
  percentage: number; // (X/14)*100
  sessions: StudentSessionSummary[];
}

export interface CourseClosePreview {
  classId: string;
  className: string;
  courseId: string;
  courseName: string;
  totalParticipants: number;
  quizResultsCount: number;
  submissionsCount: number;
  pendingGradingCount: number;
  incompleteLessonsCount: number;
  isSchedule14Confirmed: boolean;
  canExecute: boolean;
  blockErrors: string[];
  warnings: string[];
}
