/**
 * Quy tắc nghiệp vụ và hàm thuần mô phỏng (Milestone 1 — MINDX LEARN)
 * Tách độc lập không chứa JSX để kiểm thử trực tiếp bằng Node 24 test runner.
 */

export interface PinValidationResult {
  valid: boolean;
  message?: string;
}

export const TRIVIAL_PINS = [
  '12345678',
  '87654321',
  '00000000',
  '11111111',
  '22222222',
  '33333333',
  '88888888',
];

/**
 * Kiểm tra tính hợp lệ của mã PIN 8 chữ số học sinh
 */
export function validatePin(pin: string): PinValidationResult {
  if (!/^\d{8}$/.test(pin)) {
    return { valid: false, message: 'Mã PIN phải gồm đúng 8 chữ số.' };
  }
  if (TRIVIAL_PINS.includes(pin)) {
    return { valid: false, message: 'Mã PIN quá dễ đoán. Vui lòng chọn dãy 8 chữ số ngẫu nhiên hơn.' };
  }
  return { valid: true };
}

/**
 * Tạo mã PIN ngẫu nhiên 8 chữ số
 */
export function generate8DigitPin(): string {
  const num = Math.floor(10000000 + Math.random() * 90000000);
  return num.toString();
}

export interface PublishRuleResult {
  allowed: boolean;
  message?: string;
}

/**
 * Kiểm tra quy tắc xuất bản bài học:
 * Chặn xuất bản bài chỉ có lý thuyết (phải có Quiz, Thực hành hoặc cả hai).
 */
export function checkPublishRule(
  status: 'draft' | 'published',
  hasQuiz: boolean,
  hasPractice: boolean
): PublishRuleResult {
  if (status === 'published' && !hasQuiz && !hasPractice) {
    return {
      allowed: false,
      message: 'Chặn xuất bản: Buổi học phải có Quiz, Thực hành hoặc cả hai; không được xuất bản bài chỉ có lý thuyết.',
    };
  }
  return { allowed: true };
}

export interface ProgressResult {
  completedCount: number;
  total: number;
  percentage: number;
  text: string;
}

/**
 * Tính tiến độ học sinh cố định theo mẫu số 14 buổi:
 * Luôn tính (X / 14) * 100%, chỉ 14/14 mới là 100%.
 */
export function calculateProgress(completedCount: number, totalSessions: number = 14): ProgressResult {
  const safeCount = Math.max(0, Math.min(completedCount, totalSessions));
  const percentage = Math.round((safeCount / totalSessions) * 100);
  const text = `Đã hoàn thành ${safeCount}/${totalSessions} buổi`;
  return {
    completedCount: safeCount,
    total: totalSessions,
    percentage,
    text,
  };
}

export interface ParticipantLike {
  id: string;
  participantId: string;
  studentCode: string;
  fullName: string;
  originalClassId: string;
  currentClassId: string;
  status: string;
}

/**
 * Lọc danh sách học sinh tham gia đợt học của lớp:
 * Bao gồm cả học sinh hiện tại, học sinh đã chuyển lớp (nhưng bắt đầu ở lớp này),
 * và học sinh đã chuyển từ lớp khác sang.
 */
export function getBatchParticipants<T extends { originalClassId: string; currentClassId: string }>(
  students: T[],
  classId: string
): T[] {
  return students.filter((s) => s.originalClassId === classId || s.currentClassId === classId);
}

export interface LessonLike {
  id: string;
  sessionNumber: number;
  title: string;
  hasQuiz: boolean;
  hasPractice: boolean;
}

export interface QuizResultLike {
  studentId: string;
  lessonId: string;
  highestScore: number;
  passed: boolean;
}

export interface SubmissionLike {
  studentId: string;
  lessonId: string;
  status: string;
  teacherFeedback?: string;
}

export const COURSE_CLOSE_CSV_HEADER =
  'Mã tham gia nội bộ,Mã học sinh,Họ và tên,Trạng thái học sinh,Lớp học,Buổi học,Tiêu đề buổi,Điểm Quiz cao nhất,Trạng thái Quiz,Trạng thái Thực hành,Nhận xét của GV,Trạng thái hoàn thành buổi\n';

/**
 * Tạo các dòng CSV tổng kết 14 buổi cho toàn bộ học sinh trong đợt học:
 * Mỗi học sinh có đúng 14 dòng (tương ứng Buổi 1 đến 14).
 * Tuyệt đối không chứa PIN hay bí mật.
 */
export function generateCourseCloseCsvRows(
  batchStudents: ParticipantLike[],
  lessons: LessonLike[],
  classCode: string,
  quizResults: QuizResultLike[] = [],
  submissions: SubmissionLike[] = []
): string[] {
  const sortedLessons = [...lessons].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const rows: string[] = [];

  batchStudents.forEach((st) => {
    sortedLessons.forEach((les) => {
      const quiz = quizResults.find((q) => q.studentId === st.id && q.lessonId === les.id);
      const sub = submissions.find((s) => s.studentId === st.id && s.lessonId === les.id);

      const quizScoreStr = quiz ? `${quiz.highestScore}%` : 'Chưa làm';
      const quizStatusStr = les.hasQuiz
        ? quiz?.passed
          ? 'Đạt'
          : 'Chưa đạt'
        : 'Không có Quiz';

      let practiceStatusStr = 'Không có TH';
      if (les.hasPractice) {
        if (!sub) practiceStatusStr = 'Chưa nộp';
        else if (sub.status === 'approved') practiceStatusStr = 'Đạt';
        else if (sub.status === 'needs_revision') practiceStatusStr = 'Cần làm lại';
        else practiceStatusStr = 'Chờ chấm';
      }

      const teacherComment = sub?.teacherFeedback
        ? `"${sub.teacherFeedback.replace(/"/g, '""')}"`
        : '""';

      const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
      const sessionCompletedStr = quizPass && practicePass ? 'Hoàn thành' : 'Chưa hoàn thành';

      rows.push(
        `"${st.participantId}","${st.studentCode}","${st.fullName}","${st.status}","${classCode}","Buổi ${les.sessionNumber}","${les.title}","${quizScoreStr}","${quizStatusStr}","${practiceStatusStr}",${teacherComment},"${sessionCompletedStr}"`
      );
    });
  });

  return rows;
}

/**
 * Tạo nội dung tệp CSV hoàn chỉnh và kiểm tra tính toàn vẹn số dòng:
 * Số dòng dữ liệu phải bằng chính xác: Số học sinh trong đợt x 14 buổi.
 */
export function buildCourseCloseCsvContent(
  batchStudents: ParticipantLike[],
  lessons: LessonLike[],
  classCode: string,
  quizResults: QuizResultLike[] = [],
  submissions: SubmissionLike[] = []
): { success: boolean; message: string; csvContent?: string; rowCount: number; participantCount: number } {
  const participantCount = batchStudents.length;
  if (participantCount === 0) {
    return {
      success: false,
      message: 'Không có học sinh nào trong đợt học của lớp này.',
      rowCount: 0,
      participantCount: 0,
    };
  }

  const rows = generateCourseCloseCsvRows(batchStudents, lessons, classCode, quizResults, submissions);
  const expectedRowCount = participantCount * 14;
  const actualRowCount = rows.length;

  if (actualRowCount !== expectedRowCount) {
    return {
      success: false,
      message: `Lỗi kiểm tra toàn vẹn CSV: Số dòng (${actualRowCount}) không khớp với công thức số học sinh (${participantCount}) x 14 buổi (${expectedRowCount}). Đã hủy thao tác.`,
      rowCount: actualRowCount,
      participantCount,
    };
  }

  const csvContent = COURSE_CLOSE_CSV_HEADER + rows.join('\n');
  return {
    success: true,
    message: `Xuất và đối chiếu CSV thành công: Đủ ${actualRowCount} dòng (14 buổi x ${participantCount} học sinh).`,
    csvContent,
    rowCount: actualRowCount,
    participantCount,
  };
}

export const ALLOWED_PRACTICE_EXTENSIONS = Object.freeze([
  'zip', 'pdf', 'png', 'jpg', 'jpeg', 'webp',
  'txt', 'py', 'js', 'html', 'css', 'json', 'md', 'sb3'
]);

export const MAX_PRACTICE_FILE_SIZE = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)
export const MULTIPART_FORM_OVERHEAD_BYTES = 64 * 1024; // 64 KiB named overhead constant for multipart form boundaries and fields
export const MAX_MULTIPART_REQUEST_BYTES = MAX_PRACTICE_FILE_SIZE + MULTIPART_FORM_OVERHEAD_BYTES; // 2 MiB + 64 KiB = 2,162,688 bytes

export const PRACTICE_FILE_MIME_MAP: Record<string, { canonical: string; allowedBrowserMimes: readonly string[] }> = Object.freeze({
  zip: { canonical: 'application/zip', allowedBrowserMimes: ['application/zip', 'application/x-zip-compressed'] },
  pdf: { canonical: 'application/pdf', allowedBrowserMimes: ['application/pdf'] },
  png: { canonical: 'image/png', allowedBrowserMimes: ['image/png'] },
  jpg: { canonical: 'image/jpeg', allowedBrowserMimes: ['image/jpeg', 'image/jpg'] },
  jpeg: { canonical: 'image/jpeg', allowedBrowserMimes: ['image/jpeg', 'image/jpg'] },
  webp: { canonical: 'image/webp', allowedBrowserMimes: ['image/webp'] },
  txt: { canonical: 'text/plain', allowedBrowserMimes: ['text/plain'] },
  py: { canonical: 'text/x-python', allowedBrowserMimes: ['text/x-python', 'text/plain'] },
  js: { canonical: 'text/javascript', allowedBrowserMimes: ['text/javascript', 'application/javascript'] },
  html: { canonical: 'text/html', allowedBrowserMimes: ['text/html'] },
  css: { canonical: 'text/css', allowedBrowserMimes: ['text/css'] },
  json: { canonical: 'application/json', allowedBrowserMimes: ['application/json'] },
  md: { canonical: 'text/markdown', allowedBrowserMimes: ['text/markdown', 'text/plain'] },
  sb3: { canonical: 'application/x.scratch.sb3', allowedBrowserMimes: ['application/x.scratch.sb3', 'application/zip', 'application/x-zip-compressed'] },
});

export function getCanonicalMimeForExtension(ext: string): string | null {
  const norm = ext.toLowerCase().replace(/^\./, '').trim();
  return PRACTICE_FILE_MIME_MAP[norm]?.canonical || null;
}

export function validatePracticeFile(
  fileName: string,
  fileSizeBytes: number,
  _clientMime?: string | null
): { valid: boolean; error?: string; canonicalMime?: string; extension?: string } {
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    return { valid: false, error: 'Tên tệp không được để trống.' };
  }

  if (typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0) {
    return { valid: false, error: 'Kích thước tệp không hợp lệ.' };
  }

  if (fileSizeBytes > MAX_PRACTICE_FILE_SIZE) {
    return { valid: false, error: 'Kích thước tệp vượt quá giới hạn 2 MB.' };
  }

  const parts = fileName.trim().split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Tệp phải có phần mở rộng hợp lệ.' };
  }

  const ext = parts.pop()!.toLowerCase();
  const canonicalMime = getCanonicalMimeForExtension(ext);
  if (!ALLOWED_PRACTICE_EXTENSIONS.includes(ext) || !canonicalMime) {
    return {
      valid: false,
      error: `Định dạng tệp ".${ext}" không được hỗ trợ. Chỉ chấp nhận các định dạng: ZIP, PDF, PNG, JPG/JPEG, WEBP, TXT, PY, JS, HTML, CSS, JSON, MD, SB3.`,
    };
  }

  // Canonical MIME determined exclusively from extension; do not reject or accept based on browser file.type
  return { valid: true, canonicalMime, extension: ext };
}

export async function readBoundedMultipartStream(
  bodyStream: ReadableStream<Uint8Array>,
  maxBytes: number = MAX_MULTIPART_REQUEST_BYTES
): Promise<
  | { success: true; buffer: Buffer; totalBytes: number }
  | { success: false; code: 'PAYLOAD_TOO_LARGE' | 'STREAM_READ_ERROR'; totalBytes: number }
> {
  const reader = bodyStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalStreamBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalStreamBytes += value.byteLength;
        if (totalStreamBytes > maxBytes) {
          await reader.cancel('PAYLOAD_TOO_LARGE');
          return { success: false, code: 'PAYLOAD_TOO_LARGE', totalBytes: totalStreamBytes };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { success: false, code: 'STREAM_READ_ERROR', totalBytes: totalStreamBytes };
  }

  return { success: true, buffer: Buffer.concat(chunks), totalBytes: totalStreamBytes };
}
