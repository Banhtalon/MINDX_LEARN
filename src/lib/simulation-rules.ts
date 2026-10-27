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
  notes?: string;
  pinHash?: string | null;
}

// Re-export M5 core functions and constants from pure ESM module
export const STORAGE_WARNING_THRESHOLD_BYTES = 700 * 1024 * 1024; // 734,003,200 bytes (700 MB)
export const STORAGE_HARD_LIMIT_BYTES = 800 * 1024 * 1024;        // 838,860,800 bytes (800 MB)
export const MAX_STORAGE_BATCH_SIZE = 1000;                       // Giới hạn 1.000 object/request của Supabase Storage API

export const COURSE_CLOSE_CSV_HEADER =
  'Mã tham gia nội bộ,Mã học sinh,Họ và tên,Trạng thái học sinh,Lớp học,Buổi học,Tiêu đề buổi,Điểm Quiz cao nhất,Trạng thái Quiz,Trạng thái Thực hành,Nhận xét của GV,Trạng thái hoàn thành buổi\r\n';

export const M5_ERROR_CODES = Object.freeze({
  UNAUTHORIZED_ROLE: 'UNAUTHORIZED_ROLE',
  CLASS_COURSE_MISMATCH: 'CLASS_COURSE_MISMATCH',
  COURSE_SLOTS_INVALID: 'COURSE_SLOTS_INVALID',
  COHORT_ROSTER_INVALID: 'COHORT_ROSTER_INVALID',
  SCHEDULE_14_NOT_CONFIRMED: 'SCHEDULE_14_NOT_CONFIRMED',
  ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: 'ACTIVE_WRITE_OR_DELETE_IN_PROGRESS',
  CSV_NOT_VERIFIED: 'CSV_NOT_VERIFIED',
  CSV_SNAPSHOT_MISMATCH: 'CSV_SNAPSHOT_MISMATCH',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_BASELINE_UNVERIFIED: 'STORAGE_BASELINE_UNVERIFIED',
  CLASS_CLOSE_IN_PROGRESS: 'CLASS_CLOSE_IN_PROGRESS',
});

/**
 * Khử độc ô dữ liệu CSV để ngăn chặn tấn công CSV Formula Injection (DDE).
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Trình phân tích cú pháp CSV chuẩn RFC 4180.
 */
export function parseCsvRfc4180(text: string): string[][] {
  if (typeof text !== 'string') return [];
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    const nextChar = i + 1 < len ? text[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i += 2;
          continue;
        } else {
          currentRow.push(currentCell);
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          i++;
          continue;
        }
      } else if (char === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}

/**
 * Hàm băm SHA-256 an toàn isomorphic (chạy cả Node và trình duyệt, không cần module ngoài).
 */
export function computeIsomorphicSha256(rawText: string): string {
  if (typeof globalThis !== 'undefined' && (globalThis as any).process?.versions?.node) {
    try {
      const nodeCrypto = (globalThis as any).process.mainModule?.require?.('crypto') ||
        (typeof require === 'function' ? require('crypto') : null);
      if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
        return nodeCrypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
      }
    } catch {}
  }

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0, j = 0;
  let result = '';
  const words: number[] = [];
  let ascii = unescape(encodeURIComponent(rawText));
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        maj;
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Tập hợp toàn bộ học sinh từng tham gia đợt học của lớp.
 */
export function resolveBatchParticipants(options: {
  students?: any[];
  classId?: string;
  courseId?: string;
  cohortMembers?: any[];
  quizResults?: any[];
  submissions?: any[];
  lessons?: any[];
  closedOperations?: any[];
  closeOperations?: any[];
}): {
  success: boolean;
  code: string;
  message: string;
  participants: ParticipantLike[];
  errors: string[];
} {
  const {
    students = [],
    classId,
    courseId,
    cohortMembers = [],
    quizResults = [],
    submissions = [],
    lessons = [],
    closedOperations = [],
    closeOperations = [],
  } = options || {};

  if (!classId) {
    return {
      success: false,
      code: M5_ERROR_CODES.CLASS_COURSE_MISMATCH,
      message: 'Mã lớp học không được để trống.',
      participants: [],
      errors: ['Mã lớp học không được để trống.'],
    };
  }

  const candidateMap = new Map<string, ParticipantLike>();
  const participantToIdMap = new Map<string, string>();

  const courseLessonIds = new Set(
    (lessons || [])
      .filter((l: any) => !courseId || (!l.courseId && !l.course_id) || l.courseId === courseId || l.course_id === courseId)
      .map((l: any) => l.id)
  );

  const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;

  const allCloseOps = [...(closedOperations || []), ...(closeOperations || [])];
  const hasPriorClosedOtherCourse = allCloseOps.some(
    (op: any) =>
      op &&
      (op.classId === classId || op.class_id === classId) &&
      op.status === 'completed' &&
      (courseId ? (op.courseId !== courseId && op.course_id !== courseId) : false)
  );

  // 1. Học sinh từ cohortMembers (R4-03, R5-03: đúng cặp classId và courseId)
  for (const cm of cohortMembers) {
    if (!cm) continue;
    const cmClassId = cm.classId || cm.class_id;
    const cmCourseId = cm.courseId || cm.course_id;
    if (cmClassId === classId && (courseId ? cmCourseId === courseId : true)) {
      const stId = cm.studentId || cm.student_id || cm.id;
      if (!candidateMap.has(stId)) {
        const found = students.find((s) => s.id === stId);
        candidateMap.set(stId, {
          id: stId,
          // R12-01: ưu tiên dữ liệu hiện hành của học sinh (khớp m5_compute_db_snapshot_digest)
          participantId: (cm.participantId || cm.participant_id || found?.participantId || '').trim(),
          studentCode: (found?.studentCode || cm.studentCode || cm.student_code || '').trim(),
          fullName: (found?.fullName || found?.name || cm.fullName || cm.full_name || cm.name || '').trim(),
          originalClassId: found?.originalClassId || cm.originalClassId || cm.original_class_id || classId,
          currentClassId: found?.currentClassId || cm.currentClassId || cm.current_class_id || classId,
          status: found
            ? (found.status === 'archived'
                ? 'archived'
                : (found.currentClassId && found.currentClassId !== classId) ||
                  found.status === 'transferred' ||
                  cm.membership_status === 'transferred' ||
                  cm.membershipStatus === 'transferred' ||
                  cm.status === 'transferred'
                ? 'transferred'
                : (found.status || cm.status || cm.membershipStatus || cm.membership_status || 'active'))
            : (cm.status || cm.membershipStatus || cm.membership_status || 'active'),
          notes: found && found.notes !== undefined && found.notes !== null
            ? String(found.notes)
            : (cm.notes || cm.notesSnapshot || cm.notes_snapshot || ''),
          pinHash: found?.pinHash || null,
        });
      }
    }
  }

  // 2. Học sinh từ danh sách students (thuộc lớp hiện tại hoặc ban đầu nếu chưa đóng khóa) (R5-03)
  for (const st of students) {
    if (!st) continue;
    const isCurrent = st.currentClassId === classId;
    const hasOtherCourseCohortInClass = (cohortMembers || []).some((cm) => {
      if (!cm) return false;
      const cmStudentId = cm.studentId || cm.student_id || cm.id;
      const cmClassId = cm.classId || cm.class_id;
      const cmCourseId = cm.courseId || cm.course_id;
      return cmStudentId === st.id && cmClassId === classId && Boolean(cmCourseId) && (courseId ? cmCourseId !== courseId : false);
    });

    const isOriginalWithoutPriorClose =
      st.originalClassId === classId &&
      !hasPriorClosedOtherCourse &&
      !hasOtherCourseCohortInClass;

    if (isCurrent || isOriginalWithoutPriorClose) {
      if (!candidateMap.has(st.id)) {
        candidateMap.set(st.id, {
          id: st.id,
          participantId: (st.participantId || '').trim(),
          studentCode: (st.studentCode || '').trim(),
          fullName: (st.fullName || st.name || '').trim(),
          originalClassId: st.originalClassId || classId,
          currentClassId: st.currentClassId || classId,
          status: st.status || 'active',
          notes: st.notes || '',
          pinHash: st.pinHash || null,
        });
      }
    }
  }

  // 3. Học sinh có kết quả hoặc bài nộp gắn với classId thuộc bài học của courseId
  const studentIdsFromActivity = new Set<string>();
  for (const qr of quizResults) {
    if (qr && qr.studentId) {
      const qrClassId = qr.classId || qr.class_id;
      const qrLessonId = qr.lessonId || qr.lesson_id;
      if ((!qrClassId || qrClassId === classId) && (!enforceLessonFilter || courseLessonIds.has(qrLessonId))) {
        studentIdsFromActivity.add(qr.studentId);
      }
    }
  }
  for (const sub of submissions) {
    if (sub && sub.studentId) {
      const subClassId = sub.classId || sub.class_id;
      const subLessonId = sub.lessonId || sub.lesson_id;
      if ((!subClassId || subClassId === classId) && (!enforceLessonFilter || courseLessonIds.has(subLessonId))) {
        studentIdsFromActivity.add(sub.studentId);
      }
    }
  }

  for (const stId of studentIdsFromActivity) {
    if (!candidateMap.has(stId)) {
      const foundInStudents = students.find((s) => s.id === stId);
      if (foundInStudents) {
        candidateMap.set(stId, {
          id: foundInStudents.id,
          participantId: (foundInStudents.participantId || '').trim(),
          studentCode: (foundInStudents.studentCode || '').trim(),
          fullName: (foundInStudents.fullName || foundInStudents.name || '').trim(),
          originalClassId: foundInStudents.originalClassId || classId,
          currentClassId: foundInStudents.currentClassId || classId,
          status: foundInStudents.status || 'active',
          notes: foundInStudents.notes || '',
          pinHash: foundInStudents.pinHash || null,
        });
      }
    }
  }

  const errors: string[] = [];
  const participants: ParticipantLike[] = [];

  for (const student of candidateMap.values()) {
    if (!student.participantId) {
      errors.push(`Học sinh "${student.fullName}" (${student.studentCode || student.id}) bị thiếu mã tham gia nội bộ participantId.`);
      continue;
    }

    if (participantToIdMap.has(student.participantId)) {
      const existingId = participantToIdMap.get(student.participantId);
      if (existingId !== student.id) {
        errors.push(`Phát hiện xung đột mã tham gia: Mã "${student.participantId}" đang được gán cho nhiều học sinh khác nhau.`);
        continue;
      }
    } else {
      participantToIdMap.set(student.participantId, student.id);
      participants.push(student);
    }
  }

  participants.sort((a, b) => a.participantId.localeCompare(b.participantId, 'vi', { numeric: true }));

  if (errors.length > 0) {
    return {
      success: false,
      code: M5_ERROR_CODES.COHORT_ROSTER_INVALID,
      message: 'Danh sách đợt học có lỗi định danh mã tham gia participantId.',
      participants,
      errors,
    };
  }

  if (participants.length === 0) {
    return {
      success: false,
      code: M5_ERROR_CODES.COHORT_ROSTER_INVALID,
      message: 'Lớp học không có bất kỳ học sinh nào từng tham gia đợt học.',
      participants: [],
      errors: ['Không có học sinh nào trong đợt học.'],
    };
  }

  return {
    success: true,
    code: 'OK',
    message: `Xác định thành công ${participants.length} học sinh từng tham gia đợt học.`,
    participants,
    errors: [],
  };
}

/**
 * Lọc danh sách học sinh tham gia đợt học của lớp (tương thích ngược).
 */
export function getBatchParticipants<T extends { originalClassId: string; currentClassId: string; id?: string; participantId?: string; studentCode?: string; fullName?: string; name?: string; status?: string }>(
  students: T[],
  classId: string,
  options?: any
): T[] {
  const res = resolveBatchParticipants({
    students: students as any,
    classId,
    courseId: options?.courseId,
    cohortMembers: options?.cohortMembers,
    quizResults: options?.quizResults,
    submissions: options?.submissions,
    lessons: options?.lessons,
    closedOperations: options?.closedOperations,
  });
  const idMap = new Map((students as any[]).map((s) => [s.id, s]));
  const result: T[] = [];
  for (const p of res.participants) {
    if (idMap.has(p.id)) {
      result.push(idMap.get(p.id));
    } else {
      result.push(p as unknown as T);
    }
  }
  return result;
}

export interface LessonLike {
  id: string;
  courseId?: string;
  sessionNumber: number;
  title: string;
  hasQuiz: boolean;
  hasPractice: boolean;
  status?: string;
}

export interface QuizResultLike {
  studentId: string;
  lessonId: string;
  classId?: string;
  highestScore: number;
  passed: boolean;
}

export interface SubmissionLike {
  studentId: string;
  lessonId: string;
  classId?: string;
  type?: string;
  content?: string;
  fileSizeBytes?: number;
  status: string;
  teacherFeedback?: string;
}

/**
 * R3-02: Hàm mã hóa độ dài tiền tố (length-prefixed encoding) cho từng trường trong snapshotDigest.
 * Đếm ký tự theo Array.from(str).length (Unicode code points), đảm bảo khớp tuyệt đối 100%
 * với hàm char_length(text) của PostgreSQL trên mọi ký tự tiếng Việt UTF-8.
 */
export function encDigestField(val: any): string {
  const str = String(val ?? '');
  const len = Array.from(str).length;
  return `${len}#${str}`;
}

/**
 * Tạo chuỗi băm SHA-256 đại diện cho trạng thái dữ liệu hiện tại của đợt học (snapshotDigest).
 */
export function computeCourseCloseSnapshotDigest(options: {
  classItem?: any;
  classId?: string;
  courseId?: string;
  classCode?: string;
  className?: string;
  is14SessionsConfirmed?: boolean;
  participants?: any[];
  lessons?: any[];
  quizResults?: any[];
  submissions?: any[];
}): string {
  const {
    classItem,
    classId: rawClassId,
    courseId: rawCourseId,
    classCode: rawClassCode,
    className: rawClassName,
    is14SessionsConfirmed: rawIs14,
    participants = [],
    lessons = [],
    quizResults = [],
    submissions = [],
  } = options || {};

  const classId = classItem?.id || rawClassId || '';
  const courseId = classItem?.courseId || rawCourseId || '';
  const classCode = classItem?.code || rawClassCode || '';

  const enc = encDigestField;

  // P1-03 / R3-02: Băm các trường thuộc nội dung đợt học & CSV bằng length-prefixed encoding
  const classPart = `${enc(classId)}:${enc(courseId)}:${enc(classCode)}`;

  const sortedLessons = [...lessons]
    .filter((l) => !courseId || !l.courseId || l.courseId === courseId)
    .sort((a, b) => Number(a.sessionNumber) - Number(b.sessionNumber));
  const lessonsPart = sortedLessons
    .map(
      (l) =>
        `${enc(l.sessionNumber)}:${enc(l.id)}:${enc(l.title)}:${enc(l.status)}:${enc(Boolean(l.hasQuiz))}:${enc(Boolean(l.hasPractice))}`
    )
    .join('|');

  const sortedParticipants = [...participants].sort((a, b) =>
    String(a.participantId || '').localeCompare(String(b.participantId || ''))
  );
  // P1-04 / R3-02: Đồng nhất 100% quy tắc effective_status giữa JS và SQL
  const participantsPart = sortedParticipants
    .map((p) => {
      const effStatus =
        p.status === 'archived'
          ? 'archived'
          : (p.currentClassId && p.currentClassId !== classId) || p.status === 'transferred'
          ? 'transferred'
          : (p.status || 'active');
      return `${enc(p.id)}:${enc(p.participantId)}:${enc(p.studentCode)}:${enc(p.fullName)}:${enc(effStatus)}:${enc(p.notes || '')}:${enc(p.currentClassId || '')}:${enc(p.originalClassId || '')}`;
    })
    .join('|');

  const participantIds = new Set(sortedParticipants.map((p) => p.id));
  // R13-02: chỉ băm kết quả/bài nộp thuộc các bài học của khóa (khớp JOIN public.lessons l ... l.course_id = p_course_id trong SQL)
  const lessonIdSet = new Set(sortedLessons.map((l) => l.id));

  const filteredQuizzes = quizResults
    .filter(
      (q) =>
        (!q.classId || q.classId === classId) &&
        participantIds.has(q.studentId) &&
        (lessonIdSet.size === 0 || lessonIdSet.has(q.lessonId))
    )
    .sort((a, b) => {
      const cmp = String(a.studentId).localeCompare(String(b.studentId));
      if (cmp !== 0) return cmp;
      return String(a.lessonId).localeCompare(String(b.lessonId));
    });
  const quizzesPart = filteredQuizzes
    .map(
      (q) =>
        `${enc(q.studentId)}:${enc(q.lessonId)}:${enc(q.highestScore)}:${enc(Boolean(q.passed))}:${enc(Number(q.attemptsCount || 0))}`
    )
    .join('|');

  const filteredSubs = submissions
    .filter(
      (s) =>
        (!s.classId || s.classId === classId) &&
        participantIds.has(s.studentId) &&
        (lessonIdSet.size === 0 || lessonIdSet.has(s.lessonId))
    )
    .sort((a, b) => {
      const cmp = String(a.studentId).localeCompare(String(b.studentId));
      if (cmp !== 0) return cmp;
      return String(a.lessonId).localeCompare(String(b.lessonId));
    });
  const subsPart = filteredSubs
    .map(
      (s) =>
        `${enc(s.studentId)}:${enc(s.lessonId)}:${enc(s.type)}:${enc(s.status)}:${enc(s.teacherFeedback || '')}:${enc(s.content || '')}:${enc(Number(s.fileSizeBytes || 0))}`
    )
    .join('|');

  const raw = `${classPart}##${lessonsPart}##${participantsPart}##${quizzesPart}##${subsPart}`;
  return computeIsomorphicSha256(raw);
}

export const computeCohortSnapshotDigest = computeCourseCloseSnapshotDigest;

/**
 * Tính toán xem trước đóng khóa học.
 */
export function computeCourseClosePreview(options: {
  currentUser?: any;
  classItem?: any;
  course?: any;
  lessons?: any[];
  students?: any[];
  cohortMembers?: any[];
  quizResults?: any[];
  submissions?: any[];
  storageFiles?: any[];
  activeReservationsCount?: number;
  isSchedule14Confirmed?: boolean;
  csvVerification?: any;
  currentOperation?: any;
}) {
  const {
    currentUser,
    classItem,
    course,
    lessons = [],
    students = [],
    cohortMembers = [],
    quizResults = [],
    submissions = [],
    storageFiles = [],
    activeReservationsCount = 0,
    isSchedule14Confirmed = false,
    csvVerification = null,
    currentOperation = null,
  } = options || {};

  const blockErrors: string[] = [];
  const blockErrorCodes: string[] = [];
  const warnings: string[] = [];

  const classId = classItem?.id || '';
  const courseId = course?.id || classItem?.courseId || '';

  // 1. Phân quyền
  if (!currentUser || currentUser.role !== 'admin') {
    blockErrors.push('Chỉ có Quản trị viên (Admin) mới có quyền đóng khóa học và xóa dữ liệu.');
    blockErrorCodes.push(M5_ERROR_CODES.UNAUTHORIZED_ROLE);
  }

  // 2. Kiểm tra lớp học và khóa học
  if (!classItem || !course || classItem.courseId !== course.id) {
    blockErrors.push('Lớp học không tồn tại, chưa được gán khóa học hoặc khóa học không khớp.');
    blockErrorCodes.push(M5_ERROR_CODES.CLASS_COURSE_MISMATCH);
  }

  // 3. Đúng 14 buổi Buổi 1–14
  const courseLessons = (lessons || []).filter((l) => l.courseId === courseId);
  const courseLessonIds = new Set(courseLessons.map((l) => l.id));
  const sessionNumbers = new Set(courseLessons.map((l) => l.sessionNumber));
  let has14Sessions = courseLessons.length === 14;
  for (let s = 1; s <= 14; s++) {
    if (!sessionNumbers.has(s)) {
      has14Sessions = false;
      break;
    }
  }
  if (!has14Sessions) {
    blockErrors.push('Khóa học phải có đúng 14 vị trí cố định từ Buổi 1 đến Buổi 14.');
    blockErrorCodes.push(M5_ERROR_CODES.COURSE_SLOTS_INVALID);
  }

  // 4. Danh sách học sinh (R4-03)
  const rosterResult = resolveBatchParticipants({
    students,
    classId,
    courseId,
    cohortMembers,
    quizResults,
    submissions,
    lessons: courseLessons,
    closedOperations: [currentOperation].filter(Boolean),
  });

  const participants = rosterResult.participants;
  if (!rosterResult.success) {
    blockErrors.push(...rosterResult.errors);
    blockErrorCodes.push(rosterResult.code);
  }

  // 5. Xác nhận lịch 14 buổi
  const confirmedSchedule = Boolean(isSchedule14Confirmed ?? classItem?.is14SessionsConfirmed);
  if (!confirmedSchedule) {
    blockErrors.push('Admin chưa đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch trình thực tế.');
    blockErrorCodes.push(M5_ERROR_CODES.SCHEDULE_14_NOT_CONFIRMED);
  }

  // 6. Tác vụ đang chạy
  const hasActiveReservations = activeReservationsCount > 0;
  const isOperationBusy =
    currentOperation &&
    ['deleting_storage', 'deleting_db', 'incomplete'].includes(currentOperation.status);

  if (hasActiveReservations || isOperationBusy) {
    blockErrors.push(
      `Hệ thống đang có tác vụ tải tệp (${activeReservationsCount} lượt) hoặc tác vụ đóng khóa chưa hoàn tất (${currentOperation?.status || 'đang chạy'}). Vui lòng chờ ổn định.`
    );
    blockErrorCodes.push(M5_ERROR_CODES.ACTIVE_WRITE_OR_DELETE_IN_PROGRESS);
  }

  let activeParticipantsCount = 0;
  let transferredCount = 0;
  let archivedCount = 0;

  for (const st of participants) {
    if (st.status === 'transferred') transferredCount++;
    else if (st.status === 'archived') archivedCount++;
    else activeParticipantsCount++;
  }

  const sortedLessons = [...courseLessons].sort((a, b) => a.sessionNumber - b.sessionNumber);
  let completedAll14Count = 0;
  let incompleteStudentsCount = 0;
  let unsubmittedStudentsCount = 0;

  for (const st of participants) {
    let completedSessions = 0;
    let attemptedSessions = 0;

    for (const les of sortedLessons) {
      const q = quizResults.find(
        (quiz) => quiz.studentId === st.id && quiz.lessonId === les.id && (!quiz.classId || quiz.classId === classId)
      );
      const sub = submissions.find(
        (s) => s.studentId === st.id && s.lessonId === les.id && (!s.classId || s.classId === classId)
      );

      const hasAttempt = Boolean(q || sub);
      if (hasAttempt) attemptedSessions++;

      const quizPass = les.hasQuiz ? (q?.passed ?? false) : true;
      const practicePass = les.hasPractice ? sub?.status === 'approved' : true;

      if (quizPass && practicePass) {
        completedSessions++;
      }
    }

    if (completedSessions === 14) {
      completedAll14Count++;
    } else {
      incompleteStudentsCount++;
    }

    if (attemptedSessions === 0) {
      unsubmittedStudentsCount++;
    }
  }

  // Thống kê bài chờ chấm (pendingGradingCount) (R5-02)
  const pendingGradingCount = submissions.filter(
    (s) => (!s.classId || s.classId === classId) && s.status === 'submitted' && courseLessonIds.has(s.lessonId)
  ).length;

  // Thống kê kết quả quiz và bài nộp (R5-02)
  const participantStudentIds = new Set(participants.map((p) => p.id));
  const relevantQuizResults = quizResults.filter(
    (q) => (!q.classId || q.classId === classId) && participantStudentIds.has(q.studentId) && courseLessonIds.has(q.lessonId)
  );
  const relevantSubmissions = submissions.filter(
    (s) => (!s.classId || s.classId === classId) && participantStudentIds.has(s.studentId) && courseLessonIds.has(s.lessonId)
  );

  let storageFilesCount = 0;
  let storageBytesCount = 0;
  const targetStoragePaths: string[] = [];

  for (const sub of relevantSubmissions) {
    if (sub.type === 'file' && sub.content) {
      storageFilesCount++;
      storageBytesCount += Number(sub.fileSizeBytes || 0);
      if (!targetStoragePaths.includes(sub.content)) {
        targetStoragePaths.push(sub.content);
      }
    }
  }

  for (const sf of storageFiles || []) {
    if (sf && sf.path && !targetStoragePaths.includes(sf.path)) {
      targetStoragePaths.push(sf.path);
      storageFilesCount++;
      storageBytesCount += Number(sf.size || sf.fileSizeBytes || 0);
    }
  }

  const draftLessonsCount = courseLessons.filter((l) => l.status === 'draft').length;

  const currentSnapshotDigest = computeCourseCloseSnapshotDigest({
    classItem,
    classId,
    courseId,
    classCode: classItem?.code || '',
    className: classItem?.name || '',
    is14SessionsConfirmed: confirmedSchedule,
    participants,
    lessons: courseLessons,
    quizResults: relevantQuizResults,
    submissions: relevantSubmissions,
  });

  const isCsvVerified = Boolean(
    csvVerification &&
    csvVerification.valid &&
    csvVerification.snapshotDigest === currentSnapshotDigest
  );

  if (unsubmittedStudentsCount > 0) {
    warnings.push(`Có ${unsubmittedStudentsCount} học sinh chưa nộp/làm bất kỳ bài nào trong đợt học.`);
  }
  if (incompleteStudentsCount > 0) {
    warnings.push(`Có ${incompleteStudentsCount} học sinh chưa hoàn tất đủ 14/14 buổi học.`);
  }
  if (pendingGradingCount > 0) {
    warnings.push(`Có ${pendingGradingCount} bài thực hành đang ở trạng thái Chờ chấm (chưa duyệt Đạt).`);
  }
  if (transferredCount > 0 || archivedCount > 0) {
    warnings.push(`Đợt học có ${transferredCount} học sinh đã chuyển lớp và ${archivedCount} học sinh đã lưu trữ tài khoản.`);
  }
  if (draftLessonsCount > 0) {
    warnings.push(`Khóa học còn ${draftLessonsCount} buổi đang ở trạng thái Nháp.`);
  }
  warnings.push(
    'CẢNH BÁO MẤT DỮ LIỆU: CSV là báo cáo tổng kết, không phải bản backup và không thể khôi phục điểm số, nhận xét hay tệp bài tập sau khi xóa.'
  );

  return {
    classId,
    className: classItem?.name || '',
    classCode: classItem?.code || '',
    courseId,
    courseName: course?.title || '',
    totalParticipants: participants.length,
    activeParticipantsCount,
    transferredCount,
    archivedCount,
    completedAll14Count,
    incompleteStudentsCount,
    unsubmittedStudentsCount,
    pendingGradingCount,
    draftLessonsCount,
    quizResultsCount: relevantQuizResults.length,
    submissionsCount: relevantSubmissions.length,
    storageFilesCount,
    storageBytesCount,
    activeReservationsCount,
    targetStoragePaths,
    isSchedule14Confirmed: confirmedSchedule,
    currentSnapshotDigest,
    csvVerified: isCsvVerified,
    canExportCsv: blockErrors.length === 0,
    canExecuteDelete: blockErrors.length === 0 && isCsvVerified,
    canExecute: blockErrors.length === 0,
    blockErrors,
    blockErrorCodes,
    warnings,
  };
}

/**
 * Sinh danh sách các dòng dữ liệu CSV tổng kết 14 buổi.
 */
export function generateCourseCloseCsvRows(
  batchStudents: ParticipantLike[],
  lessons: LessonLike[],
  classCode: string,
  quizResults: QuizResultLike[] = [],
  submissions: SubmissionLike[] = [],
  options: any = {}
): string[] {
  const classId = options.classId || '';
  const courseId = options.courseId || '';

  let courseLessons = [...lessons];
  if (courseId) {
    const matched = courseLessons.filter((l) => l.courseId === courseId);
    if (matched.length > 0) courseLessons = matched;
  }
  courseLessons = courseLessons
    .filter((l) => l.sessionNumber >= 1 && l.sessionNumber <= 14)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  const studentProgressMap = new Map<string, number>();
  for (const st of batchStudents) {
    let completedCount = 0;
    for (const les of courseLessons) {
      const quiz = quizResults.find(
        (q) => q.studentId === st.id && q.lessonId === les.id && (!classId || !q.classId || q.classId === classId)
      );
      const sub = submissions.find(
        (s) => s.studentId === st.id && s.lessonId === les.id && (!classId || !s.classId || s.classId === classId)
      );

      const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
      if (quizPass && practicePass) {
        completedCount++;
      }
    }
    studentProgressMap.set(st.id, completedCount);
  }

  const rows: string[] = [];

  for (const st of batchStudents) {
    const studentCompleted = studentProgressMap.get(st.id) || 0;
    const progressLabel = `${studentCompleted}/14`;

    for (const les of courseLessons) {
      const quiz = quizResults.find(
        (q) => q.studentId === st.id && q.lessonId === les.id && (!classId || !q.classId || q.classId === classId)
      );
      const sub = submissions.find(
        (s) => s.studentId === st.id && s.lessonId === les.id && (!classId || !s.classId || s.classId === classId)
      );

      const quizScoreStr = quiz ? `${quiz.highestScore}%` : 'Chưa làm';
      let quizStatusStr = 'Không có Quiz';
      if (les.hasQuiz) {
        quizStatusStr = quiz ? (quiz.passed ? 'Đạt' : 'Chưa đạt') : 'Chưa làm';
      }

      let practiceStatusStr = 'Không có TH';
      if (les.hasPractice) {
        if (!sub) practiceStatusStr = 'Chưa nộp';
        else if (sub.status === 'approved') practiceStatusStr = 'Đạt';
        else if (sub.status === 'needs_revision') practiceStatusStr = 'Cần làm lại';
        else practiceStatusStr = 'Chờ chấm';
      }

      const teacherFeedback = sub?.teacherFeedback || '';
      const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
      const sessionCompletedStr =
        quizPass && practicePass ? `Hoàn thành (${progressLabel})` : `Chưa hoàn thành (${progressLabel})`;

      const studentStatusStr = st.notes ? `${st.status} (${st.notes})` : st.status;

      const cells = [
        sanitizeCsvCell(st.participantId),
        sanitizeCsvCell(st.studentCode),
        sanitizeCsvCell(st.fullName),
        sanitizeCsvCell(studentStatusStr),
        sanitizeCsvCell(classCode),
        sanitizeCsvCell(`Buổi ${les.sessionNumber}`),
        sanitizeCsvCell(les.title),
        sanitizeCsvCell(quizScoreStr),
        sanitizeCsvCell(quizStatusStr),
        sanitizeCsvCell(practiceStatusStr),
        sanitizeCsvCell(teacherFeedback),
        sanitizeCsvCell(sessionCompletedStr),
      ];

      rows.push(cells.join(','));
    }
  }

  return rows;
}

/**
 * Xây dựng nội dung tệp CSV hoàn chỉnh.
 */
export function buildCourseCloseCsvContent(
  batchStudents: ParticipantLike[],
  lessons: LessonLike[],
  classCode: string,
  quizResults: QuizResultLike[] = [],
  submissions: SubmissionLike[] = [],
  options: any = {}
): {
  success: boolean;
  message: string;
  csvContent?: string;
  rowCount: number;
  participantCount: number;
} {
  const participantCount = batchStudents.length;
  if (participantCount === 0) {
    return {
      success: false,
      message: 'Không có học sinh nào trong đợt học của lớp này.',
      rowCount: 0,
      participantCount: 0,
    };
  }

  const rows = generateCourseCloseCsvRows(
    batchStudents,
    lessons,
    classCode,
    quizResults,
    submissions,
    options
  );

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

  const csvContent = COURSE_CLOSE_CSV_HEADER + rows.join('\r\n');
  return {
    success: true,
    message: `Xuất và đối chiếu CSV thành công: Đủ ${actualRowCount} dòng (14 buổi x ${participantCount} học sinh).`,
    csvContent,
    rowCount: actualRowCount,
    participantCount,
  };
}

/**
 * Tự động đọc lại và đối chiếu CSV.
 */
export function verifyCourseCloseCsv(csvContent: string, expectedData: any) {
  const {
    participants = [],
    lessons = [],
    classCode = '',
    classId = '',
    courseId = '',
    quizResults = [],
    submissions = [],
  } = expectedData || {};

  const errors: string[] = [];

  if (typeof csvContent !== 'string' || csvContent.trim().length === 0) {
    return {
      valid: false,
      errors: ['Nội dung CSV rỗng hoặc không hợp lệ.'],
      rowCount: 0,
      participantCount: 0,
      sha256: null,
      snapshotDigest: null,
    };
  }

  const parsedGrid = parseCsvRfc4180(csvContent);
  if (parsedGrid.length === 0) {
    return {
      valid: false,
      errors: ['Không thể phân tích cú pháp tệp CSV theo chuẩn RFC 4180.'],
      rowCount: 0,
      participantCount: 0,
      sha256: null,
      snapshotDigest: null,
    };
  }

  // R14-01 / R15-01: Kiểm tra cả nội dung các ô đã giải mã RFC 4180 (dấu " nhân đôi thành "" trong CSV thô)
  const decodedCellsText = parsedGrid.map((row) => row.join('\n')).join('\n');

  const SENSITIVE_PATTERNS = [
    /pinHash/i,
    /pin_hash/i,
    /MOCK_HASH_PIN/i,
    /MOCK_HASH_\d+/i,
    /session_token/i,
    /service_role/i,
    /jwt\./i,
    /password_hash/i,
    /authPassword/i,
    /["']+password["']+\s*:/i,
    /\bpassword\s*=\s*\S+/i,
    /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  ];
  for (const pat of SENSITIVE_PATTERNS) {
    if (pat.test(csvContent) || pat.test(decodedCellsText)) {
      errors.push(`Phát hiện chuỗi nhạy cảm tiềm ẩn trong tệp CSV khớp mẫu: ${pat.source}`);
    }
  }
  for (const p of participants as any[]) {
    if (!p || typeof p !== 'object') continue;
    const secrets = [p.pinHash, p.pin_hash, p.password, p.password_hash];
    if (secrets.some((s) => typeof s === 'string' && s.length >= 4 && (csvContent.includes(s) || decodedCellsText.includes(s)))) {
      errors.push('Phát hiện chuỗi nhạy cảm tiềm ẩn trong tệp CSV khớp mẫu: participant_secret_leak');
      break;
    }
  }

  const headerRow = parsedGrid[0];
  const expectedHeaderCols = COURSE_CLOSE_CSV_HEADER.trim().split(',');
  if (headerRow.length !== expectedHeaderCols.length) {
    errors.push(`Số lượng cột tiêu đề không khớp: mong đợi ${expectedHeaderCols.length}, thực tế ${headerRow.length}.`);
  } else {
    for (let c = 0; c < expectedHeaderCols.length; c++) {
      if (headerRow[c].trim() !== expectedHeaderCols[c].trim()) {
        errors.push(`Tiêu đề cột ${c + 1} không khớp: mong đợi "${expectedHeaderCols[c]}", thực tế "${headerRow[c]}".`);
      }
    }
  }

  const dataRows = parsedGrid.slice(1);
  const expectedRowCount = participants.length * 14;

  if (dataRows.length !== expectedRowCount) {
    errors.push(
      `Tổng số dòng dữ liệu (${dataRows.length}) không khớp với công thức ${participants.length} học sinh x 14 buổi (${expectedRowCount} dòng).`
    );
  }

  const expectedParticipantMap = new Map();
  for (const p of participants) {
    expectedParticipantMap.set(p.participantId, p);
  }

  const parsedByParticipant = new Map<string, any[]>();

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const row = dataRows[rIdx];
    if (row.length !== expectedHeaderCols.length) {
      errors.push(`Dòng ${rIdx + 2} có số lượng cột (${row.length}) không đúng (${expectedHeaderCols.length}).`);
      continue;
    }

    const participantId = row[0].replace(/^'/, '');
    if (!expectedParticipantMap.has(participantId)) {
      errors.push(`Dòng ${rIdx + 2}: Mã tham gia "${participantId}" không nằm trong danh sách đợt học đã xác minh.`);
      continue;
    }

    if (!parsedByParticipant.has(participantId)) {
      parsedByParticipant.set(participantId, []);
    }
    parsedByParticipant.get(participantId)!.push({ rowIdx: rIdx + 2, cells: row });
  }

  for (const expectedP of participants) {
    const pRows = parsedByParticipant.get(expectedP.participantId);
    if (!pRows || pRows.length === 0) {
      errors.push(`Học sinh "${expectedP.fullName}" (${expectedP.participantId}) bị thiếu hoàn toàn trong CSV.`);
      continue;
    }

    if (pRows.length !== 14) {
      errors.push(
        `Học sinh "${expectedP.fullName}" (${expectedP.participantId}) có ${pRows.length} dòng trong CSV thay vì đủ 14 buổi.`
      );
    }

    const sessionSeen = new Set<string>();
    for (let sIdx = 0; sIdx < pRows.length; sIdx++) {
      const sessionCell = pRows[sIdx].cells[5].replace(/^'/, '');
      const expectedSession = `Buổi ${sIdx + 1}`;
      if (sessionCell !== expectedSession) {
        errors.push(
          `Dòng ${pRows[sIdx].rowIdx}: Sai thứ tự buổi học cho học sinh ${expectedP.participantId} (mong đợi "${expectedSession}", thực tế "${sessionCell}").`
        );
      }
      sessionSeen.add(sessionCell);
    }

    if (sessionSeen.size !== 14) {
      errors.push(`Học sinh ${expectedP.participantId} bị trùng lặp hoặc thiếu buổi học (chỉ có ${sessionSeen.size}/14 buổi duy nhất).`);
    }
  }

  // 5b. Đối chiếu từng ô giá trị với dữ liệu nguồn chuẩn (M5-05)
  const CSV_COLUMN_KEYS = [
    'participantId',
    'studentCode',
    'fullName',
    'studentStatus',
    'classCode',
    'sessionLabel',
    'lessonTitle',
    'highestScore',
    'quizStatus',
    'practiceStatus',
    'teacherFeedback',
    'completionStatus',
  ];

  function normalizeCell(val: any): string {
    if (val === null || val === undefined) return '';
    // R13-03: khoảng trắng đầu/cuối là dữ liệu có nghĩa theo RFC 4180, không trim
    let str = String(val);
    if (str.startsWith("'") && /^[=+\-@\t\r]/.test(str.slice(1))) {
      str = str.slice(1);
    }
    return str;
  }

  const expectedCsvRows = generateCourseCloseCsvRows(
    participants,
    lessons,
    classCode,
    quizResults,
    submissions,
    { classId, courseId }
  );
  const expectedGrid = parseCsvRfc4180(expectedCsvRows.join('\r\n'));

  if (dataRows.length === expectedGrid.length) {
    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const actualRow = dataRows[rIdx];
      const expectedRow = expectedGrid[rIdx];
      for (let c = 0; c < CSV_COLUMN_KEYS.length; c++) {
        const actualVal = normalizeCell(actualRow[c]);
        const expectedVal = normalizeCell(expectedRow[c]);
        if (actualVal !== expectedVal) {
          errors.push(
            `CSV_CELL_VALUE_MISMATCH: Dòng ${rIdx + 2}, Cột ${c + 1} (${CSV_COLUMN_KEYS[c]}): mong đợi "${expectedVal}", thực tế "${actualVal}".`
          );
        }
      }
    }
  }

  const sha256 = computeIsomorphicSha256(csvContent);
  const snapshotDigest = computeCourseCloseSnapshotDigest({
    classItem: expectedData?.classItem,
    classId: expectedData?.classItem?.id || classId,
    courseId: expectedData?.classItem?.courseId || courseId,
    classCode: expectedData?.classItem?.code || classCode,
    participants,
    lessons,
    quizResults,
    submissions,
  });

  return {
    valid: errors.length === 0,
    errors,
    rowCount: dataRows.length,
    participantCount: parsedByParticipant.size,
    sha256,
    snapshotDigest,
  };
}

/**
 * Chia mảng object path thành các lô nhỏ tối đa 1.000 object.
 */
export function chunkStoragePaths(paths: string[] = [], chunkSize = MAX_STORAGE_BATCH_SIZE): string[][] {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const safeChunkSize = Math.max(1, Math.min(chunkSize, MAX_STORAGE_BATCH_SIZE));
  const chunks: string[][] = [];
  for (let i = 0; i < paths.length; i += safeChunkSize) {
    chunks.push(paths.slice(i, i + safeChunkSize));
  }
  return chunks;
}

/**
 * R10-01: Đọc toàn bộ dòng dữ liệu theo từng trang (mặc định 1.000 dòng/trang). Fail-Closed khi có lỗi.
 */
export async function fetchAllPaginatedRows<T = any>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<{ data: T[] | null; error: any }> {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || 1000);
  const allRows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + safePageSize - 1);
    if (error) return { data: null, error };
    if (!Array.isArray(data) || data.length === 0) break;
    allRows.push(...data);
    if (data.length < safePageSize) break;
    offset += safePageSize;
  }
  return { data: allRows, error: null };
}

/**
 * Điều phối quy trình đóng khóa học và xóa vĩnh viễn dữ liệu cũ.
 */
export async function runCourseCloseExecution(options: {
  classId: string;
  courseId: string;
  nextCourseId?: string | null;
  targetStoragePaths?: string[];
  existingOperation?: any;
  storageClient?: any;
  dbClient?: any;
  csvVerification?: any;
  currentSnapshotDigest?: string | null;
  simulateFailureStage?: string | null;
}) {
  const {
    classId,
    courseId,
    nextCourseId = null,
    targetStoragePaths = [],
    existingOperation = null,
    storageClient,
    dbClient,
    csvVerification = null,
    currentSnapshotDigest = null,
    simulateFailureStage = null,
  } = options || {};

  const isResume = existingOperation && existingOperation.status === 'incomplete';

  if (!isResume) {
    if (!csvVerification || !csvVerification.valid) {
      return {
        success: false,
        status: 'blocked',
        code: M5_ERROR_CODES.CSV_NOT_VERIFIED,
        message: 'CSV tổng kết 14 buổi chưa được xuất hoặc chưa vượt qua bước tự kiểm tra toàn vẹn.',
      };
    }

    if (csvVerification.snapshotDigest !== currentSnapshotDigest) {
      return {
        success: false,
        status: 'blocked',
        code: M5_ERROR_CODES.CSV_SNAPSHOT_MISMATCH,
        message: 'Dữ liệu đợt học đã thay đổi sau khi xuất CSV. Vui lòng xuất và đối chiếu lại tệp CSV mới nhất.',
      };
    }
  }

  let pathsToDelete = isResume
    ? [...(existingOperation.remainingStoragePaths || [])]
    : [...targetStoragePaths];

  let deletedPaths = isResume ? [...(existingOperation.deletedStoragePaths || [])] : [];

  const chunks = chunkStoragePaths(pathsToDelete, MAX_STORAGE_BATCH_SIZE);

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    if (simulateFailureStage === 'mid_storage_batch' && cIdx >= 1) {
      const remaining = pathsToDelete.slice(pathsToDelete.indexOf(chunk[0]));
      return {
        success: false,
        status: 'incomplete',
        code: 'SIMULATED_MID_STORAGE_BATCH_FAILURE',
        message: `Mô phỏng lỗi kỹ thuật ở lô Storage thứ ${cIdx + 1}. Tác vụ dừng ở trạng thái Chưa hoàn tất (incomplete) để bảo vệ dữ liệu.`,
        deletedStoragePaths: deletedPaths,
        remainingStoragePaths: remaining,
      };
    }

    if (storageClient && typeof storageClient.remove === 'function') {
      try {
        const removeRes = await storageClient.remove(chunk);
        if (removeRes && removeRes.error) {
          const remaining = pathsToDelete.slice(pathsToDelete.indexOf(chunk[0]));
          return {
            success: false,
            status: 'incomplete',
            code: 'STORAGE_REMOVE_ERROR',
            message: `Lỗi Storage API khi xóa lô ${cIdx + 1}: ${removeRes.error.message || 'Lỗi không xác định'}.`,
            deletedStoragePaths: deletedPaths,
            remainingStoragePaths: remaining,
          };
        }
      } catch (err: any) {
        const remaining = pathsToDelete.slice(pathsToDelete.indexOf(chunk[0]));
        return {
          success: false,
          status: 'incomplete',
          code: 'STORAGE_REMOVE_EXCEPTION',
          message: `Ngoại lệ khi gọi Storage API ở lô ${cIdx + 1}: ${err.message}.`,
          deletedStoragePaths: deletedPaths,
          remainingStoragePaths: remaining,
        };
      }
    }

    deletedPaths.push(...chunk);
  }

  const remainingStoragePaths = pathsToDelete.filter((p) => !deletedPaths.includes(p));
  if (remainingStoragePaths.length > 0) {
    return {
      success: false,
      status: 'incomplete',
      code: 'STORAGE_FILES_REMAINING',
      message: `Vẫn còn ${remainingStoragePaths.length} tệp chưa được xóa khỏi Storage. Tác vụ dừng ở trạng thái Chưa hoàn tất.`,
      deletedStoragePaths: deletedPaths,
      remainingStoragePaths,
    };
  }

  if (simulateFailureStage === 'between_storage_and_db') {
    return {
      success: false,
      status: 'incomplete',
      code: 'SIMULATED_BETWEEN_STORAGE_AND_DB_FAILURE',
      message: 'Mô phỏng sự cố mạng/máy chủ giữa công đoạn xóa tệp Storage và xóa dòng cơ sở dữ liệu. Tác vụ dừng ở trạng thái Chưa hoàn tất.',
      deletedStoragePaths: deletedPaths,
      remainingStoragePaths: [],
    };
  }

  if (dbClient && typeof dbClient.finalizeDbDeletion === 'function') {
    try {
      const dbRes = await dbClient.finalizeDbDeletion({
        classId,
        courseId,
        nextCourseId,
      });
      if (!dbRes || !dbRes.success) {
        return {
          success: false,
          status: 'incomplete',
          code: dbRes?.code || 'DB_FINALIZE_ERROR',
          message: dbRes?.message || 'Không thể xóa dữ liệu đợt học trong cơ sở dữ liệu.',
          deletedStoragePaths: deletedPaths,
          remainingStoragePaths: [],
        };
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'incomplete',
        code: 'DB_FINALIZE_EXCEPTION',
        message: `Ngoại lệ khi xóa dữ liệu cơ sở dữ liệu: ${err.message}`,
        deletedStoragePaths: deletedPaths,
        remainingStoragePaths: [],
      };
    }
  }

  return {
    success: true,
    status: 'completed',
    code: 'OK',
    message: nextCourseId
      ? 'Đã xóa sạch dữ liệu đợt học cũ và gán thành công khóa học mới cho lớp (tiến độ mới 0/14).'
      : 'Đã xóa sạch dữ liệu đợt học cũ và chuyển lớp học sang trạng thái Hoàn thành (completed).',
    deletedStoragePaths: deletedPaths,
    remainingStoragePaths: [],
    nextCourseId,
  };
}

/**
 * Cổng kiểm soát dung lượng tải tệp lên Storage.
 */
export function evaluateStorageQuotaGate(options?: {
  usedStorageBytes?: number;
  activeReservedBytes?: number;
  orgBaselineBytes?: number;
  incomingBytes?: number;
  orgCapBytes?: number;
  hardLimitBytes?: number;
  warningThresholdBytes?: number;
  baselineVerified?: boolean;
  environmentMode?: string;
}) {
  const {
    usedStorageBytes = 0,
    activeReservedBytes = 0,
    orgBaselineBytes = 0,
    incomingBytes = 0,
    orgCapBytes = STORAGE_HARD_LIMIT_BYTES,
    warningThresholdBytes = STORAGE_WARNING_THRESHOLD_BYTES,
    baselineVerified = true,
    environmentMode = 'test',
  } = options || {};

  const currentTotalBytes =
    Number(usedStorageBytes) + Number(activeReservedBytes) + Number(orgBaselineBytes);
  const anticipatedTotalBytes = currentTotalBytes + Number(incomingBytes);
  const hardLimitInput = options?.hardLimitBytes ?? orgCapBytes;
  const effectiveHardLimit = Math.min(
    Number(hardLimitInput) || STORAGE_HARD_LIMIT_BYTES,
    STORAGE_HARD_LIMIT_BYTES
  );
  const effectiveWarningLimit = Number(warningThresholdBytes) || STORAGE_WARNING_THRESHOLD_BYTES;

  const isWarning = anticipatedTotalBytes >= effectiveWarningLimit;
  const isExceeded = anticipatedTotalBytes > effectiveHardLimit;

  if (options?.baselineVerified === false || options?.environmentMode === 'unverified') {
    return {
      allowed: false,
      isWarning,
      isExceeded: true,
      code: M5_ERROR_CODES.STORAGE_BASELINE_UNVERIFIED,
      message: 'Chưa xác minh dung lượng dùng chung của tổ chức (org_baseline_bytes). Admin cần đối chiếu dung lượng tổ chức trước khi mở tải tệp. Học sinh vẫn có thể nộp bài bằng liên kết (link).',
      currentTotalBytes,
      anticipatedTotalBytes,
      usedStorageBytes: Number(usedStorageBytes),
      activeReservedBytes: Number(activeReservedBytes),
      orgBaselineBytes: Number(orgBaselineBytes),
      incomingBytes: Number(incomingBytes),
      warningThresholdBytes: effectiveWarningLimit,
      hardLimitBytes: effectiveHardLimit,
      remainingBytes: 0,
    };
  }

  return {
    allowed: !isExceeded,
    isWarning,
    isExceeded,
    code: isExceeded ? M5_ERROR_CODES.STORAGE_QUOTA_EXCEEDED : 'OK',
    message: isExceeded
      ? `Dung lượng lưu trữ dự kiến (${(anticipatedTotalBytes / (1024 * 1024)).toFixed(1)} MB) vượt quá hạn mức tối đa cho phép (${(effectiveHardLimit / (1024 * 1024)).toFixed(1)} MB). Lượt tải tệp mới bị chặn để bảo vệ hệ thống. Học sinh vẫn có thể nộp bài bằng liên kết (link).`
      : isWarning
      ? `Cảnh báo dung lượng: Dự kiến ${(anticipatedTotalBytes / (1024 * 1024)).toFixed(1)} MB (đã vượt ngưỡng cảnh báo 700 MB).`
      : 'Dung lượng lưu trữ nằm trong giới hạn an toàn.',
    currentTotalBytes,
    anticipatedTotalBytes,
    usedStorageBytes: Number(usedStorageBytes),
    activeReservedBytes: Number(activeReservedBytes),
    orgBaselineBytes: Number(orgBaselineBytes),
    incomingBytes: Number(incomingBytes),
    warningThresholdBytes: effectiveWarningLimit,
    hardLimitBytes: effectiveHardLimit,
    remainingBytes: Math.max(0, effectiveHardLimit - anticipatedTotalBytes),
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

/**
 * Mốc 4 — Teaching MindX DataTables Multi-Page Reader, Validator,
 * Identity/Status Classifier, Aggregate Previewer, and TEST Fixture Sync Engine.
 *
 * Self-contained TypeScript module (zero runtime imports) so both Next.js 16.4
 * webpack builds and the custom TypeScript loader in `tests/m3-store-bootstrap.test.mjs`
 * resolve it directly.
 */

export interface TeachingDataTablesRow {
  id: string;
  student_name: string;
  class_code: string;
  status: string;
  class_status: string;
  [key: string]: unknown;
}

export interface TeachingDataTablesPagePayload {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: TeachingDataTablesRow[];
}

export interface TeachingMultiPageFixture {
  fixtureId?: string;
  description?: string;
  pageLength?: number;
  pages?: Array<
    | TeachingDataTablesPagePayload
    | {
        status?: number;
        redirectedToLogin?: boolean;
        __simulateSessionExpired?: boolean;
        __simulateCorsBlocked?: boolean;
        __simulateNetworkError?: boolean;
        payload?: TeachingDataTablesPagePayload | string;
      }
  >;
  scenarios?: Record<string, TeachingMultiPageFixture>;
  draw?: number;
  recordsTotal?: number;
  recordsFiltered?: number;
  data?: TeachingDataTablesRow[];
}

export interface TeachingSyncAddedItem {
  id: string;
  name: string;
  classCode: string;
  targetClassId: string | null;
  isNewClass: boolean;
  status: string;
  classStatus: string;
  action: string;
}

export interface TeachingSyncUpdatedItem {
  id: string;
  studentId: string;
  name: string;
  previousName: string;
  classCode: string;
  previousClassCode: string;
  targetClassId: string;
  status: string;
  classStatus: string;
  action: string;
}

export interface TeachingSyncUnchangedItem {
  id: string;
  name: string;
  classCode: string;
  status: string;
  classStatus: string;
  action: string;
}

export interface TeachingSyncNeedsReviewItem {
  id: string;
  name: string;
  classCode: string;
  previousClassCode?: string;
  conflictingIds?: string[];
  status: string;
  classStatus: string;
  reasonCode:
    | 'UNKNOWN_STATUS_MAPPING'
    | 'INACTIVE_TARGET_CLASS'
    | 'ARCHIVED_STUDENT_CONFLICT'
    | 'CLASS_CHANGE_NEEDS_REVIEW'
    | 'SAME_NAME_DIFFERENT_ID_OR_ID_CHANGED'
    | 'AMBIGUOUS_CLASS_CODE_SPACING';
  reason: string;
}

export interface TeachingSyncIgnoredItem {
  id: string;
  name: string;
  classCode: string;
  status: string;
  classStatus: string;
  existedInRoster?: boolean;
  reasonCode: 'NON_ROB_CLASS' | 'EXCLUDED_ROB_CLASS' | 'INACTIVE_STUDENT_STATUS' | 'INACTIVE_CLASS_STATUS';
  reason: string;
}

export interface TeachingSyncAbsentPreservedItem {
  id: string;
  name: string;
  classCode: string;
  status: string;
  note: string;
}

export interface TeachingSyncNewClassItem {
  code: string;
  name: string;
  courseId: null;
  teacherId: null;
  status: 'active';
}

export interface TeachingSyncDiffReport {
  sourceMode: 'synthetic_fixture' | 'real_teaching_preview' | 'real_teaching_sync';
  robFilterMode: 'include_rob' | 'exclude_rob';
  pagination: {
    pagesRead: number;
    pageLength: number;
    recordsTotal: number;
    recordsFiltered: number;
    lastPageRowCount: number;
    consistencyVerified?: boolean;
    snapshotVersion?: string | null;
  };
  counts: {
    sourceTotalRows: number;
    robClassRowCount: number;
    nonRobClassRowCount: number;
    addedCount: number;
    updatedCount: number;
    unchangedCount: number;
    needsReviewCount: number;
    ignoredCount: number;
    absentPreservedCount: number;
    newClassesCount: number;
    actionableCount: number;
  };
  added: TeachingSyncAddedItem[];
  updated: TeachingSyncUpdatedItem[];
  unchanged: TeachingSyncUnchangedItem[];
  needsReview: TeachingSyncNeedsReviewItem[];
  ignored: TeachingSyncIgnoredItem[];
  absentPreserved: TeachingSyncAbsentPreservedItem[];
  newClassesToCreate: TeachingSyncNewClassItem[];
  totalValid: number;
  actionableTotal: number;
  warnings: string[];
}

export interface TeachingAggregatePreview {
  success: boolean;
  aborted: boolean;
  partialApplied: boolean;
  mode: 'READONLY_AGGREGATE_M4';
  code: string;
  message: string;
  failedAtPage?: number;
  pagesRead: number;
  pageLength: number;
  recordsTotal: number;
  recordsFiltered: number;
  lastPageRowCount?: number;
  totalRowsVerified: number;
  uniqueIdCount: number;
  robClassRowCount: number;
  nonRobClassRowCount: number;
  eligibleActiveRobCount: number;
  inactiveStatusRowCount: number;
  unknownStatusRowCount: number;
  sameNameDifferentIdCount: number;
  consistencyVerified?: boolean;
  snapshotConsistent?: boolean;
  snapshotVersion?: string | null;
  piiStoredOrSent: false;
  realApplyAllowedInM4: false;
  timestamp: string;
}

export const TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH = 15;
export const TEACHING_DATATABLES_MAX_PAGES = 500;

export const ACTIVE_STUDENT_STATUS_MAP = new Map<string, string>([
  ['đang học', 'Đang học'],
  ['dang hoc', 'Đang học'],
  ['active', 'Đang học'],
]);

export const INACTIVE_STUDENT_STATUS_MAP = new Map<string, string>([
  ['nghỉ', 'Nghỉ'],
  ['nghi', 'Nghỉ'],
  ['nghỉ học', 'Nghỉ học'],
  ['nghi hoc', 'Nghỉ học'],
  ['đã nghỉ', 'Đã nghỉ'],
  ['da nghi', 'Đã nghỉ'],
  ['đã nghỉ học', 'Đã nghỉ học'],
  ['da nghi hoc', 'Đã nghỉ học'],
  ['đã hết khóa', 'Đã hết khóa'],
  ['da het khoa', 'Đã hết khóa'],
  ['hết khóa', 'Hết khóa'],
  ['het khoa', 'Hết khóa'],
  ['bảo lưu', 'Bảo lưu'],
  ['bao luu', 'Bảo lưu'],
  ['tạm dừng', 'Tạm dừng'],
  ['tam dung', 'Tạm dừng'],
  ['inactive', 'Inactive'],
  ['dropped', 'Dropped'],
  ['finished', 'Finished'],
]);

export const ACTIVE_CLASS_STATUS_MAP = new Map<string, string>([
  ['running', 'Running'],
  ['đang hoạt động', 'Đang hoạt động'],
  ['dang hoat dong', 'Đang hoạt động'],
  ['đang mở', 'Đang mở'],
  ['dang mo', 'Đang mở'],
  ['active', 'Active'],
]);

export const INACTIVE_CLASS_STATUS_MAP = new Map<string, string>([
  ['closed', 'Closed'],
  ['finished', 'Finished'],
  ['đã đóng', 'Đã đóng'],
  ['da dong', 'Đã đóng'],
  ['đóng', 'Đóng'],
  ['dong', 'Đóng'],
  ['đã kết thúc', 'Đã kết thúc'],
  ['da ket thuc', 'Đã kết thúc'],
  ['đã hết khóa', 'Đã hết khóa'],
  ['da het khoa', 'Đã hết khóa'],
  ['archived', 'Archived'],
]);

export function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizePersonName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeBasePersonName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeClassCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function compactClassCodeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function evaluateTeachingRowStatuses(rawStudentStatus: string, rawClassStatus: string) {
  const normStudent = normalizeToken(rawStudentStatus);
  const normClass = normalizeToken(rawClassStatus);

  let studentState: 'active' | 'inactive' | 'unknown' = 'unknown';
  if (ACTIVE_STUDENT_STATUS_MAP.has(normStudent)) {
    studentState = 'active';
  } else if (INACTIVE_STUDENT_STATUS_MAP.has(normStudent)) {
    studentState = 'inactive';
  }

  let classState: 'active' | 'inactive' | 'unknown' = 'unknown';
  if (ACTIVE_CLASS_STATUS_MAP.has(normClass)) {
    classState = 'active';
  } else if (INACTIVE_CLASS_STATUS_MAP.has(normClass)) {
    classState = 'inactive';
  }

  return {
    studentState,
    classState,
    isKnown: studentState !== 'unknown' && classState !== 'unknown',
    isEligibleActive: studentState === 'active' && classState === 'active',
    isClearlyInactive: studentState === 'inactive' || classState === 'inactive',
  };
}

export function evaluateRobClassFilter(
  classCode: string,
  robFilterMode: 'include_rob' | 'exclude_rob' = 'include_rob'
) {
  const hasRob = /rob/i.test(String(classCode || ''));
  const passesFilter = robFilterMode === 'exclude_rob' ? !hasRob : hasRob;
  return {
    hasRob,
    passesFilter,
    robFilterMode,
  };
}

export function createFixturePageFetcher(fixtureInput: any) {
  if (!fixtureInput || typeof fixtureInput !== 'object') {
    return async () => ({
      ok: false,
      status: 500,
      errorCode: 'MALFORMED_DATATABLES_PAYLOAD',
    });
  }

  const pages = Array.isArray(fixtureInput.pages) ? fixtureInput.pages : [fixtureInput];

  return async ({ pageIndex }: { pageIndex: number }) => {
    const pageSpec = pages[pageIndex];
    if (!pageSpec) {
      return {
        ok: false,
        status: 404,
        errorCode: 'MISSING_PAGE_IN_FIXTURE',
      };
    }

    if (
      pageSpec.__simulateSessionExpired ||
      pageSpec.status === 401 ||
      pageSpec.status === 403 ||
      pageSpec.redirectedToLogin
    ) {
      return {
        ok: false,
        status: pageSpec.status || 401,
        redirectedToLogin: Boolean(pageSpec.redirectedToLogin ?? true),
        errorCode: 'SESSION_EXPIRED',
      };
    }

    if (pageSpec.__simulateCorsBlocked) {
      return {
        ok: false,
        status: 0,
        errorCode: 'CORS_OR_SOP_BLOCKED',
      };
    }

    if (pageSpec.__simulateNetworkError || (typeof pageSpec.status === 'number' && pageSpec.status >= 400)) {
      return {
        ok: false,
        status: pageSpec.status || 502,
        errorCode: 'PAGE_FETCH_ERROR',
      };
    }

    const rawPayload = pageSpec.payload !== undefined ? pageSpec.payload : pageSpec;
    const defaultVersion =
      typeof fixtureInput.snapshotVersion === 'string' && fixtureInput.snapshotVersion.trim()
        ? fixtureInput.snapshotVersion.trim()
        : typeof fixtureInput.fixtureId === 'string' && fixtureInput.fixtureId.trim()
          ? fixtureInput.fixtureId.trim()
          : null;
    const payload =
      rawPayload &&
      typeof rawPayload === 'object' &&
      !Array.isArray(rawPayload) &&
      defaultVersion &&
      rawPayload.snapshotVersion === undefined
        ? { ...rawPayload, snapshotVersion: defaultVersion }
        : rawPayload;
    return {
      ok: true,
      status: 200,
      payload,
    };
  };
}

export async function readAllTeachingDataTablesPages(options: any = {}) {
  const fetchPage = options.fetchPage;
  const pageLength =
    typeof options.pageLength === 'number' && Number.isInteger(options.pageLength) && options.pageLength > 0
      ? options.pageLength
      : TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH;
  const maxPages =
    typeof options.maxPages === 'number' && Number.isInteger(options.maxPages) && options.maxPages > 0
      ? options.maxPages
      : TEACHING_DATATABLES_MAX_PAGES;
  const requireUnfilteredSource = options.requireUnfilteredSource !== false;

  const makeAbort = (code: string, message: string, pageNumber: number, pagesReadSoFar: number) => ({
    success: false,
    aborted: true,
    partialApplied: false,
    code,
    message,
    failedAtPage: pageNumber as number | undefined,
    pagesRead: pagesReadSoFar,
    pageLength,
    recordsTotal: 0,
    recordsFiltered: 0,
    lastPageRowCount: 0,
    consistencyVerified: false,
    snapshotConsistent: false,
    snapshotVersion: null as string | null,
    rows: [] as any[],
  });

  const extractPageSnapshotVersion = (resp: any, body: any): string | null => {
    const candidates = [
      body?.snapshotVersion,
      body?.datasetVersion,
      body?.revision,
      body?.etag,
      body?.version,
      resp?.snapshotVersion,
      resp?.etag,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
      if (typeof c === 'number' && Number.isFinite(c)) return String(c);
    }
    return null;
  };

  if (typeof fetchPage !== 'function') {
    return makeAbort(
      'INVALID_FETCHER',
      'Chưa cấu hình bộ đọc phân trang DataTables hợp lệ. Đã hủy lượt đọc.',
      1,
      0
    );
  }

  const collectedRows: any[] = [];
  const seenIds = new Set<string>();

  let expectedRecordsTotal: number | null = null;
  let expectedRecordsFiltered: number | null = null;
  let expectedSnapshotVersion: string | null = null;
  let pageIndex = 0;
  let start = 0;

  while (pageIndex < maxPages) {
    const pageNumber = pageIndex + 1;
    const requestedDraw = pageNumber;

    let response: any;
    try {
      response = await fetchPage({
        draw: requestedDraw,
        start,
        length: pageLength,
        pageIndex,
      });
    } catch (err: any) {
      const isCors =
        err &&
        (err.code === 'CORS_OR_SOP_BLOCKED' ||
          err.name === 'SecurityError' ||
          /cors|same-origin|failed to fetch|networkerror/i.test(String(err.message || '')));
      if (isCors) {
        return makeAbort(
          'CORS_OR_SOP_BLOCKED',
          'Trình duyệt chặn yêu cầu đọc trực tiếp khác nguồn (CORS / Same-Origin Policy). Đã dừng an toàn, không vượt rào bảo mật.',
          pageNumber,
          pageIndex
        );
      }
      return makeAbort(
        'PAGE_FETCH_ERROR',
        `Lỗi kết nối khi đọc trang ${pageNumber}. Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    if (!response || typeof response !== 'object') {
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Phản hồi trang ${pageNumber} rỗng hoặc không đúng định dạng đối tượng. Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (response.errorCode === 'CORS_OR_SOP_BLOCKED') {
      return makeAbort(
        'CORS_OR_SOP_BLOCKED',
        'Trình duyệt chặn đọc trực tiếp khác nguồn (CORS / Same-Origin Policy) từ ứng dụng web sang teachingmindx.top. Đã dừng an toàn theo quy tắc không vượt chặn bảo mật.',
        pageNumber,
        pageIndex
      );
    }

    if (
      response.errorCode === 'SESSION_EXPIRED' ||
      response.redirectedToLogin ||
      response.status === 401 ||
      response.status === 403
    ) {
      return makeAbort(
        'SESSION_EXPIRED',
        `Phiên đăng nhập Teaching đã hết hạn hoặc bị từ chối ở trang ${pageNumber} (401/403/Redirect Login). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    if (!response.ok || (typeof response.status === 'number' && response.status >= 400)) {
      return makeAbort(
        response.errorCode || 'PAGE_FETCH_ERROR',
        `Không thể đọc trang ${pageNumber} từ nguồn DataTables (mã trạng thái ${response.status || 'lỗi'}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    const payload = response.payload !== undefined ? response.payload : response;

    if (typeof payload === 'string') {
      if (/login|password|đăng nhập/i.test(payload)) {
        return makeAbort(
          'SESSION_EXPIRED',
          `Phản hồi trang ${pageNumber} trả về màn hình đăng nhập thay vì JSON DataTables. Phiên làm việc đã hết hạn; hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Phản hồi trang ${pageNumber} không phải JSON DataTables hợp lệ. Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Cấu trúc phản hồi DataTables ở trang ${pageNumber} không hợp lệ. Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    const { draw, recordsTotal, recordsFiltered, data } = payload;

    if (
      typeof draw !== 'number' ||
      !Number.isInteger(draw) ||
      typeof recordsTotal !== 'number' ||
      !Number.isInteger(recordsTotal) ||
      recordsTotal < 0 ||
      typeof recordsFiltered !== 'number' ||
      !Number.isInteger(recordsFiltered) ||
      recordsFiltered < 0 ||
      !Array.isArray(data)
    ) {
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Trang ${pageNumber} thiếu hoặc sai kiểu dữ liệu bắt buộc (draw, recordsTotal, recordsFiltered, data). Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (draw !== requestedDraw) {
      return makeAbort(
        'DRAW_MISMATCH',
        `Tham số đồng bộ draw ở trang ${pageNumber} không khớp (yêu cầu draw=${requestedDraw}, nhận draw=${draw}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
        pageNumber,
        pageIndex
      );
    }

    if (requireUnfilteredSource && recordsTotal !== recordsFiltered) {
      return makeAbort(
        'UNEXPECTED_SOURCE_FILTER',
        `Nguồn DataTables ở trang ${pageNumber} đang có bộ lọc tìm kiếm (recordsTotal=${recordsTotal} khác recordsFiltered=${recordsFiltered}). Đã hủy toàn bộ lượt đọc để giữ nguyên bộ lọc mặc định.`,
        pageNumber,
        pageIndex
      );
    }

    const pageSnapshotVersion = extractPageSnapshotVersion(response, payload);
    if (pageIndex === 0) {
      expectedRecordsTotal = recordsTotal;
      expectedRecordsFiltered = recordsFiltered;
      expectedSnapshotVersion = pageSnapshotVersion;
    } else {
      if (recordsTotal !== expectedRecordsTotal || recordsFiltered !== expectedRecordsFiltered) {
        return makeAbort(
          'TOTAL_CHANGED_BETWEEN_PAGES',
          `Tổng số bản ghi nguồn thay đổi giữa các trang (trang 1: ${expectedRecordsFiltered}, trang ${pageNumber}: ${recordsFiltered}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
          pageNumber,
          pageIndex
        );
      }
      if (
        (expectedSnapshotVersion !== null || pageSnapshotVersion !== null) &&
        pageSnapshotVersion !== expectedSnapshotVersion
      ) {
        return makeAbort(
          'SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES',
          `Phiên bản snapshot nguồn thay đổi giữa các trang (trang 1: "${expectedSnapshotVersion || 'không có'}", trang ${pageNumber}: "${pageSnapshotVersion || 'không có'}"). Đã hủy toàn bộ lượt đọc để tránh lệch trang khi dữ liệu nguồn biến động.`,
          pageNumber,
          pageIndex
        );
      }
    }

    if (expectedRecordsFiltered === 0) {
      if (data.length !== 0) {
        return makeAbort(
          'PAGE_ROW_COUNT_MISMATCH',
          `Trang 1 báo tổng số 0 bản ghi nhưng trả về ${data.length} dòng. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }
      pageIndex++;
      break;
    }

    const remainingRows = (expectedRecordsFiltered ?? 0) - start;
    const expectedPageRows = Math.min(pageLength, remainingRows);
    const isLastPage = start + expectedPageRows >= (expectedRecordsFiltered ?? 0);

    if (data.length !== expectedPageRows) {
      const errorCode = isLastPage ? 'LAST_PAGE_ROW_COUNT_MISMATCH' : 'PAGE_ROW_COUNT_MISMATCH';
      return makeAbort(
        errorCode,
        isLastPage
          ? `Số dòng ở trang cuối (trang ${pageNumber}) không khớp tổng thực nhận (kỳ vọng ${expectedPageRows} dòng cuối, nhận ${data.length} dòng). Đã hủy toàn bộ lượt đọc.`
          : `Số dòng ở trang ${pageNumber} không khớp kích thước phân trang (kỳ vọng ${expectedPageRows} dòng, nhận ${data.length} dòng). Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      const globalRowNumber = start + rowIdx + 1;

      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) không phải đối tượng hợp lệ. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      if (row.id === undefined || row.id === null) {
        return makeAbort(
          'MISSING_STUDENT_ID',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) bị thiếu trường định danh id. Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
          pageNumber,
          pageIndex
        );
      }

      if (
        (typeof row.id !== 'string' && typeof row.id !== 'number') ||
        (typeof row.id === 'number' && !Number.isFinite(row.id))
      ) {
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) có trường định danh id sai kiểu dữ liệu. Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
          pageNumber,
          pageIndex
        );
      }

      const rawId = String(row.id).trim();
      if (!rawId) {
        return makeAbort(
          'MISSING_STUDENT_ID',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) bị thiếu trường định danh id. Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
          pageNumber,
          pageIndex
        );
      }

      if (
        typeof row.student_name !== 'string' ||
        !row.student_name.trim() ||
        typeof row.class_code !== 'string' ||
        !row.class_code.trim() ||
        typeof row.status !== 'string' ||
        !row.status.trim() ||
        typeof row.class_status !== 'string' ||
        !row.class_status.trim()
      ) {
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) thiếu hoặc sai kiểu trường bắt buộc (student_name, class_code, status, class_status). Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      const normalizedIdKey = rawId.toUpperCase();
      if (seenIds.has(normalizedIdKey)) {
        return makeAbort(
          'DUPLICATE_STUDENT_ID',
          `Phát hiện mã định danh id trùng lặp tại bản ghi thứ ${globalRowNumber} (trang ${pageNumber}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
          pageNumber,
          pageIndex
        );
      }
      seenIds.add(normalizedIdKey);

      collectedRows.push({
        id: rawId.toUpperCase(),
        studentName: row.student_name.trim().replace(/\s+/g, ' '),
        classCode: normalizeClassCode(row.class_code),
        rawClassCode: row.class_code.trim(),
        status: row.status.trim(),
        classStatus: row.class_status.trim(),
        pageNumber,
        globalRowNumber,
      });
    }

    pageIndex++;
    start += data.length;

    if (start >= (expectedRecordsFiltered ?? 0)) {
      break;
    }
  }

  if (expectedRecordsFiltered !== null && start < expectedRecordsFiltered) {
    return makeAbort(
      'MAX_PAGES_EXCEEDED',
      `Vượt ngưỡng an toàn số trang tối đa (${maxPages} trang) trước khi đọc đủ ${expectedRecordsFiltered} bản ghi. Đã hủy toàn bộ lượt đọc.`,
      pageIndex,
      pageIndex
    );
  }

  if (collectedRows.length !== (expectedRecordsFiltered ?? 0)) {
    return makeAbort(
      'TOTAL_ROW_COUNT_MISMATCH',
      `Tổng số dòng thu thập (${collectedRows.length}) không khớp recordsFiltered (${expectedRecordsFiltered}). Đã hủy toàn bộ lượt đọc.`,
      pageIndex,
      pageIndex
    );
  }

  const consistencyVerified = pageIndex <= 1 || expectedSnapshotVersion !== null;

  return {
    success: true,
    aborted: false,
    partialApplied: false,
    code: 'OK',
    message: consistencyVerified
      ? `Đã đọc và xác thực nhất quán toàn bộ ${pageIndex} trang DataTables (${collectedRows.length}/${expectedRecordsFiltered ?? 0} bản ghi).`
      : `Đã đọc toàn bộ ${pageIndex} trang DataTables (${collectedRows.length}/${expectedRecordsFiltered ?? 0} bản ghi), nhưng nguồn không cấp mã phiên bản snapshot giữa các trang nên chưa thể chứng minh bất biến đa trang.`,
    failedAtPage: undefined as number | undefined,
    pagesRead: pageIndex,
    pageLength,
    recordsTotal: expectedRecordsTotal ?? 0,
    recordsFiltered: expectedRecordsFiltered ?? 0,
    snapshotVersion: expectedSnapshotVersion,
    consistencyVerified,
    lastPageRowCount:
      pageIndex === 0 || (expectedRecordsFiltered ?? 0) === 0
        ? 0
        : (expectedRecordsFiltered ?? 0) - (pageIndex - 1) * pageLength,
    rows: collectedRows,
  };
}

export function classifyAndDiffTeachingSnapshot(
  validatedRows: any[],
  currentState: any = {},
  options: any = {}
): TeachingSyncDiffReport {
  const existingStudents = Array.isArray(currentState.students) ? currentState.students : [];
  const existingClasses = Array.isArray(currentState.classes) ? currentState.classes : [];
  const robFilterMode: 'include_rob' | 'exclude_rob' =
    options.robFilterMode === 'exclude_rob' ? 'exclude_rob' : 'include_rob';

  const classByCode = new Map<string, any>();
  const classCodesByCompactKey = new Map<string, Set<string>>();
  const classById = new Map<string, any>();
  for (const cls of existingClasses) {
    if (!cls) continue;
    const normCode = normalizeClassCode(cls.code);
    if (normCode) {
      classByCode.set(normCode, cls);
      const compactKey = compactClassCodeKey(normCode);
      if (compactKey) {
        if (!classCodesByCompactKey.has(compactKey)) {
          classCodesByCompactKey.set(compactKey, new Set());
        }
        classCodesByCompactKey.get(compactKey)!.add(normCode);
      }
    }
    if (cls.id) classById.set(cls.id, cls);
  }

  const studentByCode = new Map<string, any>();
  const existingCodeSetByNormName = new Map<string, Set<string>>();
  const existingCodeSetByBaseName = new Map<string, Set<string>>();

  for (const stu of existingStudents) {
    if (!stu || !stu.studentCode) continue;
    const normCode = String(stu.studentCode).trim().toUpperCase();
    studentByCode.set(normCode, stu);

    const normFull = normalizePersonName(stu.fullName);
    if (normFull) {
      if (!existingCodeSetByNormName.has(normFull)) {
        existingCodeSetByNormName.set(normFull, new Set());
      }
      existingCodeSetByNormName.get(normFull)!.add(normCode);
    }

    const normBase = normalizeBasePersonName(stu.fullName);
    if (normBase) {
      if (!existingCodeSetByBaseName.has(normBase)) {
        existingCodeSetByBaseName.set(normBase, new Set());
      }
      existingCodeSetByBaseName.get(normBase)!.add(normCode);
    }
  }

  const snapshotIdsByBaseName = new Map<string, Set<string>>();
  const snapshotIdsByNormName = new Map<string, Set<string>>();
  const snapshotClassCodesByCompactKey = new Map<string, Set<string>>();
  let robClassRowCount = 0;
  let nonRobClassRowCount = 0;

  for (const row of validatedRows) {
    const robEval = evaluateRobClassFilter(row.classCode, robFilterMode);
    if (robEval.hasRob) {
      robClassRowCount++;
    } else {
      nonRobClassRowCount++;
    }

    const rowNormCode = normalizeClassCode(row.classCode);
    const rowCompactClassKey = compactClassCodeKey(rowNormCode);
    if (rowCompactClassKey) {
      if (!snapshotClassCodesByCompactKey.has(rowCompactClassKey)) {
        snapshotClassCodesByCompactKey.set(rowCompactClassKey, new Set());
      }
      snapshotClassCodesByCompactKey.get(rowCompactClassKey)!.add(rowNormCode);
    }

    const rowId = String(row.id || '').trim().toUpperCase();
    const baseName = normalizeBasePersonName(row.studentName);
    if (baseName && rowId) {
      if (!snapshotIdsByBaseName.has(baseName)) {
        snapshotIdsByBaseName.set(baseName, new Set());
      }
      snapshotIdsByBaseName.get(baseName)!.add(rowId);
    }

    const normFull = normalizePersonName(row.studentName);
    if (normFull && rowId) {
      if (!snapshotIdsByNormName.has(normFull)) {
        snapshotIdsByNormName.set(normFull, new Set());
      }
      snapshotIdsByNormName.get(normFull)!.add(rowId);
    }
  }

  const added: TeachingSyncAddedItem[] = [];
  const updated: TeachingSyncUpdatedItem[] = [];
  const unchanged: TeachingSyncUnchangedItem[] = [];
  const needsReview: TeachingSyncNeedsReviewItem[] = [];
  const ignored: TeachingSyncIgnoredItem[] = [];
  const newClassesMap = new Map<string, TeachingSyncNewClassItem>();
  const seenSnapshotStudentCodes = new Set<string>();

  for (const row of validatedRows) {
    const sourceId = String(row.id).trim().toUpperCase();
    seenSnapshotStudentCodes.add(sourceId);

    const robEval = evaluateRobClassFilter(row.classCode, robFilterMode);
    const statusEval = evaluateTeachingRowStatuses(row.status, row.classStatus);
    const existingStudent = studentByCode.get(sourceId) || null;

    if (!robEval.passesFilter) {
      ignored.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: robFilterMode === 'exclude_rob' ? 'EXCLUDED_ROB_CLASS' : 'NON_ROB_CLASS',
        reason:
          robFilterMode === 'exclude_rob'
            ? `Bỏ qua lớp có mã ROB (${row.classCode}) theo chế độ loại trừ ROB`
            : `Mã lớp (${row.classCode}) không chứa tiền tố ROB`,
      });
      continue;
    }

    if (!statusEval.isKnown) {
      needsReview.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: 'UNKNOWN_STATUS_MAPPING',
        reason: `Trạng thái nguồn chưa có trong bảng ánh xạ chuẩn (Học sinh: "${row.status}", Lớp: "${row.classStatus}") — giữ chờ Admin đối chiếu`,
      });
      continue;
    }

    if (statusEval.isClearlyInactive) {
      const isInactiveStudent = statusEval.studentState === 'inactive';
      ignored.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        status: row.status,
        classStatus: row.classStatus,
        existedInRoster: Boolean(existingStudent),
        reasonCode: isInactiveStudent ? 'INACTIVE_STUDENT_STATUS' : 'INACTIVE_CLASS_STATUS',
        reason: existingStudent
          ? `Trạng thái nghỉ/đóng lớp (${row.status} / ${row.classStatus}) — báo cáo chờ Admin, tuyệt đối không tự xóa tài khoản hay điểm`
          : isInactiveStudent
            ? `Trạng thái học sinh không hoạt động (${row.status}) — bỏ qua, không tạo mới`
            : `Trạng thái lớp không hoạt động (${row.classStatus}) — bỏ qua, không tạo mới`,
      });
      continue;
    }

    const rowCompactClassKey = compactClassCodeKey(row.classCode);
    const matchingExistingClassCodes = new Set<string>(
      classCodesByCompactKey.get(rowCompactClassKey) || []
    );
    matchingExistingClassCodes.delete(row.classCode);
    const matchingSnapshotClassCodes = new Set<string>(
      snapshotClassCodesByCompactKey.get(rowCompactClassKey) || []
    );
    matchingSnapshotClassCodes.delete(row.classCode);

    if (matchingExistingClassCodes.size > 0 || matchingSnapshotClassCodes.size > 0) {
      const collidingCodes = [
        ...Array.from(matchingExistingClassCodes),
        ...Array.from(matchingSnapshotClassCodes),
      ];
      needsReview.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: 'AMBIGUOUS_CLASS_CODE_SPACING',
        reason: `Mã lớp "${row.classCode}" chỉ khác khoảng trắng so với mã lớp "${collidingCodes.join(', ')}" — không tự động gộp mã lớp hoặc tạo lớp trùng gần giống, chờ Admin đối chiếu`,
      });
      continue;
    }

    const targetClass = classByCode.get(row.classCode) || null;

    if (targetClass && targetClass.status !== 'active') {
      needsReview.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: 'INACTIVE_TARGET_CLASS',
        reason: `Lớp đích ${row.classCode} trên hệ thống đang ở trạng thái "${targetClass.status}" — không tự mở lại lớp đã đóng/lưu trữ, chờ Admin đối chiếu`,
      });
      continue;
    }

    if (existingStudent) {
      if (existingStudent.status === 'archived') {
        needsReview.push({
          id: sourceId,
          name: row.studentName,
          classCode: row.classCode,
          status: row.status,
          classStatus: row.classStatus,
          reasonCode: 'ARCHIVED_STUDENT_CONFLICT',
          reason: `Hồ sơ ${sourceId} đang ở trạng thái Lưu trữ (Archived) trên hệ thống — giữ nguyên trạng thái khóa, chờ Admin đối chiếu thủ công`,
        });
        continue;
      }

      const existingClassObj = classById.get(existingStudent.currentClassId) || null;
      const existingClassCode = existingClassObj ? normalizeClassCode(existingClassObj.code) : '';

      if (existingClassCode && existingClassCode !== row.classCode) {
        needsReview.push({
          id: sourceId,
          name: row.studentName,
          classCode: row.classCode,
          previousClassCode: existingClassCode,
          status: row.status,
          classStatus: row.classStatus,
          reasonCode: 'CLASS_CHANGE_NEEDS_REVIEW',
          reason: `Học sinh ${sourceId} đổi mã lớp từ ${existingClassCode} sang ${row.classCode} — giữ nguyên lớp hiện tại, chờ Admin đối chiếu và xác nhận chuyển lớp riêng`,
        });
        continue;
      }

      const currentFullName = String(existingStudent.fullName || '').trim().replace(/\s+/g, ' ');
      if (currentFullName === row.studentName && (!existingClassCode || existingClassCode === row.classCode)) {
        unchanged.push({
          id: sourceId,
          name: row.studentName,
          classCode: row.classCode,
          status: row.status,
          classStatus: row.classStatus,
          action: 'Giữ nguyên hồ sơ, mã PIN và kết quả học tập',
        });
      } else {
        updated.push({
          id: sourceId,
          studentId: existingStudent.id,
          name: row.studentName,
          previousName: currentFullName,
          classCode: row.classCode,
          previousClassCode: existingClassCode || row.classCode,
          targetClassId: targetClass ? targetClass.id : existingStudent.currentClassId,
          status: row.status,
          classStatus: row.classStatus,
          action: 'Cập nhật họ tên hiển thị (Bảo toàn mã PIN, mật khẩu và toàn bộ điểm/bài nộp)',
        });
      }
      continue;
    }

    const baseName = normalizeBasePersonName(row.studentName);
    const exactNormName = normalizePersonName(row.studentName);

    const existingCodesWithSameName = new Set<string>([
      ...(existingCodeSetByNormName.get(exactNormName) || []),
      ...(existingCodeSetByBaseName.get(baseName) || []),
    ]);
    existingCodesWithSameName.delete(sourceId);

    const snapshotCodesWithSameName = new Set<string>([
      ...(snapshotIdsByNormName.get(exactNormName) || []),
      ...(snapshotIdsByBaseName.get(baseName) || []),
    ]);
    snapshotCodesWithSameName.delete(sourceId);

    if (existingCodesWithSameName.size > 0 || snapshotCodesWithSameName.size > 0) {
      const conflictIds = Array.from(
        new Set([...Array.from(existingCodesWithSameName), ...Array.from(snapshotCodesWithSameName)])
      );
      needsReview.push({
        id: sourceId,
        name: row.studentName,
        classCode: row.classCode,
        conflictingIds: conflictIds,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: 'SAME_NAME_DIFFERENT_ID_OR_ID_CHANGED',
        reason:
          existingCodesWithSameName.size > 0
            ? `Trùng họ tên "${row.studentName}" với hồ sơ hiện có mang mã khác (${conflictIds.join(', ')}) — nghi vấn đổi mã ID khi chuyển lớp hoặc hai học sinh trùng tên khác mã; tuyệt đối không tự gộp theo tên, chờ Admin đối chiếu`
            : `Trùng họ tên "${row.studentName}" giữa nhiều mã ID khác nhau ngay trong nguồn đọc (${conflictIds.join(', ')}) — nghi vấn đổi mã ID hoặc hai học sinh trùng tên, không tự gộp theo tên, chờ Admin đối chiếu`,
      });
      continue;
    }

    if (!targetClass && !newClassesMap.has(row.classCode)) {
      newClassesMap.set(row.classCode, {
        code: row.classCode,
        name: `Lớp Robotics ${row.classCode} (Mới đồng bộ — Chờ Admin gán khóa học)`,
        courseId: null,
        teacherId: null,
        status: 'active',
      });
    }

    added.push({
      id: sourceId,
      name: row.studentName,
      classCode: row.classCode,
      targetClassId: targetClass ? targetClass.id : null,
      isNewClass: !targetClass,
      status: row.status,
      classStatus: row.classStatus,
      action: targetClass
        ? '+ Thêm học sinh mới vào lớp hiện có (Chưa cấp PIN)'
        : '+ Tạo lớp mới chờ gán khóa & Thêm học sinh (Chưa cấp PIN)',
    });
  }

  const absentPreserved: TeachingSyncAbsentPreservedItem[] = [];
  for (const stu of existingStudents) {
    if (!stu || !stu.studentCode) continue;
    const normCode = String(stu.studentCode).trim().toUpperCase();
    if (!seenSnapshotStudentCodes.has(normCode)) {
      const clsObj = classById.get(stu.currentClassId) || null;
      absentPreserved.push({
        id: normCode,
        name: stu.fullName,
        classCode: clsObj ? clsObj.code : stu.currentClassId,
        status: stu.status,
        note: 'Vắng mặt trong lần đọc này — được bảo toàn nguyên vẹn, không tự động xóa',
      });
    }
  }

  const newClassesToCreate = Array.from(newClassesMap.values());
  const pagination = options.paginationSummary || {
    pagesRead: 1,
    pageLength: TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH,
    recordsTotal: validatedRows.length,
    recordsFiltered: validatedRows.length,
    lastPageRowCount: validatedRows.length,
  };

  return {
    sourceMode: options.sourceMode || 'synthetic_fixture',
    robFilterMode,
    pagination: {
      pagesRead: pagination.pagesRead,
      pageLength: pagination.pageLength,
      recordsTotal: pagination.recordsTotal,
      recordsFiltered: pagination.recordsFiltered,
      lastPageRowCount: pagination.lastPageRowCount,
    },
    counts: {
      sourceTotalRows: validatedRows.length,
      robClassRowCount,
      nonRobClassRowCount,
      addedCount: added.length,
      updatedCount: updated.length,
      unchangedCount: unchanged.length,
      needsReviewCount: needsReview.length,
      ignoredCount: ignored.length,
      absentPreservedCount: absentPreserved.length,
      newClassesCount: newClassesToCreate.length,
      actionableCount: added.length + updated.length,
    },
    added,
    updated,
    unchanged,
    needsReview,
    ignored,
    absentPreserved,
    newClassesToCreate,
    totalValid: added.length + updated.length + unchanged.length,
    actionableTotal: added.length + updated.length,
    warnings:
      needsReview.length > 0
        ? [
            `Có ${needsReview.length} bản ghi cần Admin đối chiếu thủ công (trùng tên khác mã / đổi lớp / trạng thái lạ / tài khoản lưu trữ). Các dòng này được giữ an toàn và không tự động ghi đè.`,
          ]
        : [],
  };
}

export function buildTeachingAggregatePreview(
  pageReadResult: any,
  options: any = {}
): TeachingAggregatePreview {
  const timestamp = new Date().toISOString();
  const robFilterMode: 'include_rob' | 'exclude_rob' =
    options.robFilterMode === 'exclude_rob' ? 'exclude_rob' : 'include_rob';

  if (!pageReadResult || !pageReadResult.success) {
    return {
      success: false,
      aborted: true,
      partialApplied: false,
      mode: 'READONLY_AGGREGATE_M4',
      code: pageReadResult?.code || 'READ_ABORTED',
      message:
        pageReadResult?.message ||
        'Lượt đọc phân trang không hợp lệ. Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.',
      failedAtPage: pageReadResult?.failedAtPage || 1,
      pagesRead: pageReadResult?.pagesRead || 0,
      pageLength: pageReadResult?.pageLength || TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH,
      recordsTotal: 0,
      recordsFiltered: 0,
      totalRowsVerified: 0,
      uniqueIdCount: 0,
      robClassRowCount: 0,
      nonRobClassRowCount: 0,
      eligibleActiveRobCount: 0,
      inactiveStatusRowCount: 0,
      unknownStatusRowCount: 0,
      sameNameDifferentIdCount: 0,
      consistencyVerified: false,
      snapshotVersion: null,
      piiStoredOrSent: false,
      realApplyAllowedInM4: false,
      timestamp,
    };
  }

  const rows = Array.isArray(pageReadResult.rows) ? pageReadResult.rows : [];
  let robClassRowCount = 0;
  let nonRobClassRowCount = 0;
  let eligibleActiveRobCount = 0;
  let inactiveStatusRowCount = 0;
  let unknownStatusRowCount = 0;

  const idsByBaseName = new Map<string, Set<string>>();

  for (const row of rows) {
    const robEval = evaluateRobClassFilter(row.classCode, robFilterMode);
    if (robEval.hasRob) {
      robClassRowCount++;
    } else {
      nonRobClassRowCount++;
    }

    const statusEval = evaluateTeachingRowStatuses(row.status, row.classStatus);
    if (!statusEval.isKnown) {
      unknownStatusRowCount++;
    } else if (statusEval.isClearlyInactive) {
      inactiveStatusRowCount++;
    } else if (robEval.hasRob && statusEval.isEligibleActive) {
      eligibleActiveRobCount++;
    }

    const baseName = normalizeBasePersonName(row.studentName);
    if (baseName) {
      if (!idsByBaseName.has(baseName)) {
        idsByBaseName.set(baseName, new Set());
      }
      idsByBaseName.get(baseName)!.add(row.id);
    }
  }

  let sameNameDifferentIdCount = 0;
  for (const idSet of idsByBaseName.values()) {
    if (idSet.size > 1) {
      sameNameDifferentIdCount += idSet.size;
    }
  }

  const consistencyVerified =
    pageReadResult.consistencyVerified !== undefined
      ? Boolean(pageReadResult.consistencyVerified)
      : pageReadResult.pagesRead <= 1 || Boolean(pageReadResult.snapshotVersion);

  return {
    success: true,
    aborted: false,
    partialApplied: false,
    mode: 'READONLY_AGGREGATE_M4',
    code: 'OK',
    message: consistencyVerified
      ? `Đã đọc kiểm tra hết ${pageReadResult.pagesRead} trang DataTables (${rows.length} bản ghi). Báo cáo chỉ hiển thị số lượng tổng hợp, không lưu tên hoặc mã học sinh thật.`
      : `Đã đọc kiểm tra hết ${pageReadResult.pagesRead} trang DataTables (${rows.length} bản ghi). Lưu ý: nguồn không cấp mã phiên bản snapshot giữa các trang nên chỉ xác thực số lượng tổng hợp, chưa chứng minh bất biến đa trang.`,
    pagesRead: pageReadResult.pagesRead,
    pageLength: pageReadResult.pageLength,
    recordsTotal: pageReadResult.recordsTotal,
    recordsFiltered: pageReadResult.recordsFiltered,
    lastPageRowCount: pageReadResult.lastPageRowCount,
    totalRowsVerified: rows.length,
    uniqueIdCount: rows.length,
    robClassRowCount,
    nonRobClassRowCount,
    eligibleActiveRobCount,
    inactiveStatusRowCount,
    unknownStatusRowCount,
    sameNameDifferentIdCount,
    consistencyVerified,
    snapshotVersion: pageReadResult.snapshotVersion || null,
    piiStoredOrSent: false,
    realApplyAllowedInM4: false,
    timestamp,
  };
}

export const CANONICAL_M4_SYNTHETIC_CLASSES = new Set([
  'ROB-K14-01',
  'ROB-K14-02',
  'ROB-K14-03',
  'ROB-K14-M4-04',
  'WEB-K14-01',
  'WEB-K14-02',
  'GAM-K14-02',
  'GAM-K14-03',
  'PYT-K14-01',
  'UIX-K14-01',
  'DAT-K14-01',
]);

export const CANONICAL_M4_SYNTHETIC_STUDENTS = new Map<
  string,
  { name: string; classCode: string; previousName?: string }
>([
  ['HS_ROB_001', { name: 'Lê Bảo Nam', classCode: 'ROB-K14-01' }],
  [
    'HS_ROB_002',
    {
      name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
      previousName: 'Phạm Quỳnh Chi',
      classCode: 'ROB-K14-01',
    },
  ],
  ['HS_ROB_M4_101', { name: 'Học Sinh Giả Lập M4-01', classCode: 'ROB-K14-01' }],
  ['HS_ROB_M4_102', { name: 'Học Sinh Giả Lập M4-02', classCode: 'ROB-K14-01' }],
  ['HS_ROB_M4_103', { name: 'Học Sinh Giả Lập M4-03', classCode: 'ROB-K14-02' }],
  ['HS_ROB_M4_104', { name: 'Học Sinh Giả Lập M4-04', classCode: 'ROB-K14-02' }],
  ['HS_ROB_M4_105', { name: 'Học Sinh Giả Lập M4-05', classCode: 'ROB-K14-03' }],
  ['HS_ROB_M4_106', { name: 'Học Sinh Giả Lập M4-06', classCode: 'ROB-K14-03' }],
  ['HS_ROB_M4_107', { name: 'Học Sinh Giả Lập M4-07', classCode: 'ROB-K14-M4-04' }],
  ['HS_ROB_M4_108', { name: 'Học Sinh Giả Lập M4-08', classCode: 'ROB-K14-M4-04' }],
  ['HS_WEB_M4_201', { name: 'Học Sinh Giả Web 01', classCode: 'WEB-K14-01' }],
  ['HS_GAM_M4_202', { name: 'Học Sinh Giả Game 02', classCode: 'GAM-K14-02' }],
  ['HS_WEB_M4_203', { name: 'Học Sinh Giả Web 03', classCode: 'WEB-K14-01' }],
  ['HS_WEB_M4_204', { name: 'Học Sinh Giả Web 04', classCode: 'WEB-K14-02' }],
  ['HS_PYT_M4_205', { name: 'Học Sinh Giả Python 05', classCode: 'PYT-K14-01' }],
  ['HS_PYT_M4_206', { name: 'Học Sinh Giả Python 06', classCode: 'PYT-K14-01' }],
  ['HS_UIX_M4_207', { name: 'Học Sinh Giả UIUX 07', classCode: 'UIX-K14-01' }],
  ['HS_UIX_M4_208', { name: 'Học Sinh Giả UIUX 08', classCode: 'UIX-K14-01' }],
  ['HS_DAT_M4_209', { name: 'Học Sinh Giả Data 09', classCode: 'DAT-K14-01' }],
  ['HS_DAT_M4_210', { name: 'Học Sinh Giả Data 10', classCode: 'DAT-K14-01' }],
  ['HS_GAM_M4_211', { name: 'Học Sinh Giả Game 11', classCode: 'GAM-K14-03' }],
  ['HS_GAM_M4_212', { name: 'Học Sinh Giả Game 12', classCode: 'GAM-K14-03' }],
]);

export function buildCanonicalM4SyncedClassName(classCode: string): string {
  const code = normalizeClassCode(classCode);
  return `Lớp Robotics ${code} (Mới đồng bộ — Chờ Admin gán khóa học)`;
}

export function validateCanonicalM4SyntheticDiffReport(diffReport: any): {
  valid: boolean;
  code?: string;
  message?: string;
} {
  if (!diffReport || typeof diffReport !== 'object' || Array.isArray(diffReport)) {
    return {
      valid: false,
      code: 'INVALID_DIFF_REPORT',
      message: 'Báo cáo xem trước đồng bộ không hợp lệ.',
    };
  }
  if (diffReport.sourceMode !== 'synthetic_fixture') {
    return {
      valid: false,
      code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
      message:
        'Chốt chặn an toàn Mốc 4: Báo cáo thiếu nhãn synthetic_fixture hoặc thuộc nguồn Teaching thật. Tuyệt đối không ghi vào TEST.',
    };
  }

  const newClasses = Array.isArray(diffReport.newClassesToCreate) ? diffReport.newClassesToCreate : [];
  for (const cls of newClasses) {
    const code = normalizeClassCode(cls?.code);
    const rawName = typeof cls?.name === 'string' ? cls.name.trim().replace(/\s+/g, ' ') : '';
    const expectedName = buildCanonicalM4SyncedClassName(code);
    if (!code || !CANONICAL_M4_SYNTHETIC_CLASSES.has(code) || (rawName && rawName !== expectedName)) {
      return {
        valid: false,
        code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
        message: `Chốt chặn an toàn Mốc 4: Mã lớp hoặc tên lớp "${code || '(rỗng)'}" không thuộc danh mục fixture giả lập chuẩn.`,
      };
    }
  }

  const updatedList = Array.isArray(diffReport.updated) ? diffReport.updated : [];
  for (const item of updatedList) {
    const code = String(item?.id || '').trim().toUpperCase();
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const prevName =
      typeof item?.previousName === 'string'
        ? item.previousName.trim().replace(/\s+/g, ' ')
        : '';
    const classCode = normalizeClassCode(item?.classCode);
    const prevClassCode = normalizeClassCode(item?.previousClassCode);
    if (!code || !name || !prevName || !classCode || !prevClassCode) {
      return {
        valid: false,
        code: 'INVALID_DIFF_REPORT',
        message:
          'Báo cáo xem trước thiếu thông tin đối chiếu bắt buộc (id, name, previousName, classCode, previousClassCode).',
      };
    }
    const allowed = CANONICAL_M4_SYNTHETIC_STUDENTS.get(code);
    if (
      !allowed ||
      !allowed.previousName ||
      allowed.name !== name ||
      allowed.previousName !== prevName ||
      allowed.classCode !== classCode ||
      allowed.classCode !== prevClassCode
    ) {
      return {
        valid: false,
        code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
        message:
          'Chốt chặn an toàn Mốc 4: Phát hiện bản ghi cập nhật học sinh không khớp bộ fixture giả lập chuẩn (/public/fixtures/teaching_mock.json). Đã từ chối ghi vào TEST.',
      };
    }
  }

  const addedList = Array.isArray(diffReport.added) ? diffReport.added : [];
  for (const item of addedList) {
    const code = String(item?.id || '').trim().toUpperCase();
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const classCode = normalizeClassCode(item?.classCode);
    if (!code || !name || !classCode) {
      return {
        valid: false,
        code: 'INVALID_DIFF_REPORT',
        message: 'Báo cáo xem trước thiếu thông tin bắt buộc ở mục thêm mới (id, name, classCode).',
      };
    }
    const allowed = CANONICAL_M4_SYNTHETIC_STUDENTS.get(code);
    if (
      !allowed ||
      allowed.previousName ||
      code === 'HS_ROB_001' ||
      allowed.name !== name ||
      allowed.classCode !== classCode
    ) {
      return {
        valid: false,
        code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
        message:
          'Chốt chặn an toàn Mốc 4: Phát hiện bản ghi thêm mới không khớp bộ fixture giả lập chuẩn (/public/fixtures/teaching_mock.json). Đã từ chối ghi vào TEST.',
      };
    }
  }

  return { valid: true };
}

export function validateRealTeachingSyncDiffReport(diffReport: any): {
  valid: boolean;
  code?: string;
  message?: string;
} {
  if (!diffReport || typeof diffReport !== 'object' || Array.isArray(diffReport)) {
    return {
      valid: false,
      code: 'INVALID_DIFF_REPORT',
      message: 'Báo cáo xem trước đồng bộ không hợp lệ.',
    };
  }
  if (diffReport.sourceMode !== 'real_teaching_sync') {
    return {
      valid: false,
      code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
      message: 'Báo cáo xem trước thiếu nhãn real_teaching_sync hoặc synthetic_fixture hợp lệ.',
    };
  }

  const newClasses = Array.isArray(diffReport.newClassesToCreate) ? diffReport.newClassesToCreate : [];
  for (const cls of newClasses) {
    const code = normalizeClassCode(cls?.code);
    const rawName = typeof cls?.name === 'string' ? cls.name.trim().replace(/\s+/g, ' ') : '';
    const expectedName = buildCanonicalM4SyncedClassName(code);
    if (!code || !/rob/i.test(code) || (rawName && rawName !== expectedName)) {
      return {
        valid: false,
        code: 'INVALID_DIFF_REPORT',
        message: `Mã lớp hoặc tên lớp "${code || '(rỗng)'}" không hợp lệ (chỉ chấp nhận lớp có mã ROB).`,
      };
    }
  }

  const updatedList = Array.isArray(diffReport.updated) ? diffReport.updated : [];
  for (const item of updatedList) {
    const code = String(item?.id || '').trim().toUpperCase();
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const prevName =
      typeof item?.previousName === 'string'
        ? item.previousName.trim().replace(/\s+/g, ' ')
        : '';
    const classCode = normalizeClassCode(item?.classCode);
    const prevClassCode = normalizeClassCode(item?.previousClassCode);
    if (
      !code ||
      !name ||
      !prevName ||
      !classCode ||
      !prevClassCode ||
      classCode !== prevClassCode ||
      !/rob/i.test(classCode)
    ) {
      return {
        valid: false,
        code: 'INVALID_DIFF_REPORT',
        message:
          'Báo cáo xem trước thiếu thông tin đối chiếu bắt buộc (id, name, previousName, classCode, previousClassCode) hoặc lớp không thuộc diện ROB.',
      };
    }
  }

  const addedList = Array.isArray(diffReport.added) ? diffReport.added : [];
  for (const item of addedList) {
    const code = String(item?.id || '').trim().toUpperCase();
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const classCode = normalizeClassCode(item?.classCode);
    if (!code || !name || !classCode || !/rob/i.test(classCode)) {
      return {
        valid: false,
        code: 'INVALID_DIFF_REPORT',
        message: 'Báo cáo xem trước thiếu thông tin bắt buộc ở mục thêm mới (id, name, classCode ROB).',
      };
    }
  }

  return { valid: true };
}

export function buildLosslessDeterministicId(prefix: string, rawCode: string): string {
  const encoded = Array.from(String(rawCode || '')).map((ch) =>
    /^[A-Za-z0-9]$/.test(ch)
      ? ch.toLowerCase()
      : `_x${ch.codePointAt(0)!.toString(16).padStart(4, '0')}_`
  );
  return `${prefix}${encoded.join('')}`;
}

export function applyTeachingSyncDiffToState(
  currentState: any,
  diffReport: any,
  options: { enforceCanonicalM4Fixture?: boolean } = {}
) {
  if (!diffReport || typeof diffReport !== 'object' || Array.isArray(diffReport)) {
    return {
      success: false,
      code: 'INVALID_DIFF_REPORT',
      message: 'Báo cáo xem trước đồng bộ không hợp lệ. Không thực hiện thay đổi nào.',
      state: currentState,
    };
  }

  const isRealTeachingSync = diffReport.sourceMode === 'real_teaching_sync';
  if (diffReport.sourceMode !== 'synthetic_fixture' && !isRealTeachingSync) {
    return {
      success: false,
      code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
      message:
        'Chốt chặn an toàn Mốc 4: Chỉ chấp nhận báo cáo xem trước có sourceMode="synthetic_fixture" hoặc "real_teaching_sync". Tuyệt đối không áp dụng danh sách học sinh Teaching thật vào TEST.',
      state: currentState,
    };
  }

  if (isRealTeachingSync) {
    const realCheck = validateRealTeachingSyncDiffReport(diffReport);
    if (!realCheck.valid) {
      return {
        success: false,
        code: realCheck.code || 'INVALID_DIFF_REPORT',
        message: realCheck.message,
        state: currentState,
      };
    }
  } else if (options.enforceCanonicalM4Fixture) {
    const canonicalCheck = validateCanonicalM4SyntheticDiffReport(diffReport);
    if (!canonicalCheck.valid) {
      return {
        success: false,
        code: canonicalCheck.code || 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
        message: canonicalCheck.message,
        state: currentState,
      };
    }
  }

  const prevClasses = Array.isArray(currentState.classes) ? [...currentState.classes] : [];
  const prevStudents = Array.isArray(currentState.students) ? [...currentState.students] : [];
  const prevUsers = Array.isArray(currentState.users) ? [...currentState.users] : [];

  const classByCode = new Map<string, any>();
  const usedClassIds = new Set<string>();
  for (const cls of prevClasses) {
    classByCode.set(normalizeClassCode(cls.code), cls);
    if (cls.id) usedClassIds.add(String(cls.id));
  }

  let createdClassesCount = 0;
  const newClassesList = Array.isArray(diffReport.newClassesToCreate)
    ? diffReport.newClassesToCreate
    : [];

  for (const newCls of newClassesList) {
    const code = normalizeClassCode(newCls.code);
    if (!code || classByCode.has(code)) continue;
    const deterministicClassId = buildLosslessDeterministicId('cls_sync_', code);
    if (usedClassIds.has(deterministicClassId)) {
      return {
        success: false,
        code: 'INTERNAL_ID_COLLISION',
        message: `Phát hiện xung đột mã định danh lớp nội bộ (${deterministicClassId}). Đã hủy toàn bộ lượt áp dụng.`,
        state: currentState,
      };
    }
    const createdClass = {
      id: deterministicClassId,
      code,
      name: buildCanonicalM4SyncedClassName(code),
      courseId: null,
      teacherId: null,
      status: 'active' as const,
      is14SessionsConfirmed: false,
    };
    prevClasses.push(createdClass);
    classByCode.set(code, createdClass);
    usedClassIds.add(deterministicClassId);
    createdClassesCount++;
  }

  const studentIndexByCode = new Map<string, number>();
  const usedStudentIds = new Set<string>();
  const usedParticipantIds = new Set<string>();
  for (let idx = 0; idx < prevStudents.length; idx++) {
    const code = String(prevStudents[idx].studentCode || '').trim().toUpperCase();
    if (code) studentIndexByCode.set(code, idx);
    if (prevStudents[idx].id) usedStudentIds.add(String(prevStudents[idx].id));
    if (prevStudents[idx].participantId) usedParticipantIds.add(String(prevStudents[idx].participantId));
  }

  const userIndexByCode = new Map<string, number>();
  const usedUserIds = new Set<string>();
  for (let idx = 0; idx < prevUsers.length; idx++) {
    const code = String(prevUsers[idx].studentCode || '').trim().toUpperCase();
    if (code) userIndexByCode.set(code, idx);
    if (prevUsers[idx].id) usedUserIds.add(String(prevUsers[idx].id));
  }

  let addedStudentsCount = 0;
  let updatedStudentsCount = 0;

  const updatedList = Array.isArray(diffReport.updated) ? diffReport.updated : [];
  for (const item of updatedList) {
    const code = String(item.id || '').trim().toUpperCase();
    const nextName = String(item.name || '').trim().replace(/\s+/g, ' ');
    const expectedPrevName =
      typeof item.previousName === 'string'
        ? item.previousName.trim().replace(/\s+/g, ' ')
        : '';
    const itemClassCode = normalizeClassCode(item.classCode);
    const expectedPrevClassCode = normalizeClassCode(item.previousClassCode);
    if (!code || !nextName || !expectedPrevName || !itemClassCode || !expectedPrevClassCode) {
      return {
        success: false,
        code: 'INVALID_DIFF_REPORT',
        message:
          'Báo cáo xem trước thiếu thông tin đối chiếu bắt buộc (id, name, previousName, classCode, previousClassCode). Không thực hiện thay đổi nào.',
        state: currentState,
      };
    }

    const stuIdx = studentIndexByCode.get(code);
    if (stuIdx === undefined) {
      return {
        success: false,
        code: 'STALE_PREVIEW_CONFLICT',
        message: `Hồ sơ học sinh ${code} không còn tồn tại như lúc xem trước. Đã hủy áp dụng để bảo vệ dữ liệu.`,
        state: currentState,
      };
    }

    const existingStu = prevStudents[stuIdx];
    if (existingStu.status === 'archived') {
      return {
        success: false,
        code: 'STALE_PREVIEW_CONFLICT',
        message: `Hồ sơ học sinh ${code} đã chuyển sang trạng thái Lưu trữ sau thời điểm xem trước. Đã hủy áp dụng.`,
        state: currentState,
      };
    }

    const existingCls = prevClasses.find((c) => c.id === existingStu.currentClassId) || null;
    const existingClassCode = existingCls ? normalizeClassCode(existingCls.code) : '';
    if (
      !existingClassCode ||
      existingClassCode !== itemClassCode ||
      existingClassCode !== expectedPrevClassCode
    ) {
      return {
        success: false,
        code: 'STALE_PREVIEW_CONFLICT',
        message: `Lớp của học sinh ${code} đã thay đổi sau thời điểm xem trước. Đã hủy áp dụng để tránh ghi đè.`,
        state: currentState,
      };
    }

    const currentStuName = String(existingStu.fullName || '').trim().replace(/\s+/g, ' ');
    const usrIdx = userIndexByCode.get(code);
    const currentUsrName =
      usrIdx !== undefined
        ? String(prevUsers[usrIdx].name || '').trim().replace(/\s+/g, ' ')
        : currentStuName;

    if (currentStuName === nextName && currentUsrName === nextName) {
      continue;
    }

    if (currentStuName !== expectedPrevName || currentUsrName !== expectedPrevName) {
      return {
        success: false,
        code: 'STALE_PREVIEW_CONFLICT',
        message: `Họ tên học sinh ${code} trên hệ thống đã thay đổi sau thời điểm xem trước. Đã hủy áp dụng để không ghi đè dữ liệu mới.`,
        state: currentState,
      };
    }

    prevStudents[stuIdx] = {
      ...existingStu,
      fullName: nextName,
      participantId: existingStu.participantId,
      currentClassId: existingStu.currentClassId,
      originalClassId: existingStu.originalClassId,
      pinHash: existingStu.pinHash,
      hasPin: existingStu.hasPin,
      pinIssuedAt: existingStu.pinIssuedAt,
      status: existingStu.status,
      notes: existingStu.notes,
    };

    if (usrIdx !== undefined) {
      prevUsers[usrIdx] = {
        ...prevUsers[usrIdx],
        name: nextName,
      };
    }

    updatedStudentsCount++;
  }

  const addedList = Array.isArray(diffReport.added) ? diffReport.added : [];
  for (const item of addedList) {
    const code = String(item.id || '').trim().toUpperCase();
    if (!code || studentIndexByCode.has(code)) continue;

    const classCode = normalizeClassCode(item.classCode);
    const targetClass = classByCode.get(classCode);
    if (!targetClass || targetClass.status !== 'active') continue;

    const deterministicId = buildLosslessDeterministicId('usr_stu_sync_', code);
    const deterministicParticipantId = buildLosslessDeterministicId('part_sync_', code);

    if (
      usedStudentIds.has(deterministicId) ||
      usedParticipantIds.has(deterministicParticipantId) ||
      ( !userIndexByCode.has(code) && usedUserIds.has(deterministicId) )
    ) {
      return {
        success: false,
        code: 'INTERNAL_ID_COLLISION',
        message: `Phát hiện xung đột mã định danh học sinh nội bộ (${deterministicId}) cho mã ${code}. Đã hủy toàn bộ lượt áp dụng.`,
        state: currentState,
      };
    }

    const newStudent = {
      id: deterministicId,
      participantId: deterministicParticipantId,
      studentCode: code,
      fullName: String(item.name || '').trim().replace(/\s+/g, ' '),
      currentClassId: targetClass.id,
      originalClassId: targetClass.id,
      pinHash: null,
      hasPin: false,
      pinIssuedAt: null,
      status: 'active' as const,
      notes: isRealTeachingSync
        ? 'Đồng bộ từ Teaching MindX (Chờ Admin cấp mã PIN riêng)'
        : 'Đồng bộ từ fixture DataTables Mốc 4 (Chờ Admin cấp mã PIN riêng)',
    };

    prevStudents.push(newStudent);
    studentIndexByCode.set(code, prevStudents.length - 1);
    usedStudentIds.add(deterministicId);
    usedParticipantIds.add(deterministicParticipantId);

    if (!userIndexByCode.has(code)) {
      prevUsers.push({
        id: deterministicId,
        name: newStudent.fullName,
        studentCode: code,
        role: 'student' as const,
        status: 'active' as const,
      });
      userIndexByCode.set(code, prevUsers.length - 1);
      usedUserIds.add(deterministicId);
    }

    addedStudentsCount++;
  }

  return {
    success: true,
    code: isRealTeachingSync ? 'APPLIED_REAL_TEACHING_SYNC' : 'APPLIED_SYNTHETIC_FIXTURE',
    addedStudentsCount,
    updatedStudentsCount,
    createdClassesCount,
    pinsAutoIssued: 0,
    csvGenerated: false,
    deletedAbsentCount: 0,
    message:
      addedStudentsCount === 0 && updatedStudentsCount === 0 && createdClassesCount === 0
        ? 'Snapshot không có thay đổi mới (0 thêm mới, 0 cập nhật). Dữ liệu đã đồng bộ nhất quán, không tạo bản ghi trùng.'
        : isRealTeachingSync
          ? `Đã đồng bộ thành công danh sách Teaching thật: +${addedStudentsCount} học sinh mới, cập nhật ${updatedStudentsCount} hồ sơ, +${createdClassesCount} lớp ROB mới chờ gán khóa. Không tự cấp mã PIN, không xóa học sinh vắng mặt.`
          : `Đã áp dụng an toàn bộ fixture giả vào TEST: +${addedStudentsCount} học sinh mới, cập nhật ${updatedStudentsCount} hồ sơ, +${createdClassesCount} lớp mới chờ gán khóa. Không tự cấp mã PIN, không xóa học sinh vắng mặt.`,
    state: {
      ...currentState,
      classes: prevClasses,
      students: prevStudents,
      users: prevUsers,
    },
  };
}

export async function runTeachingSnapshotPreview(
  fixtureInput: any,
  currentState: any = {},
  options: any = {}
) {
  const pageLength =
    typeof fixtureInput?.pageLength === 'number'
      ? fixtureInput.pageLength
      : options.pageLength || TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH;

  const fetchPage =
    typeof options.fetchPage === 'function'
      ? options.fetchPage
      : createFixturePageFetcher(fixtureInput);

  const pageReadResult = await readAllTeachingDataTablesPages({
    fetchPage,
    pageLength,
    maxPages: options.maxPages,
    requireUnfilteredSource: options.requireUnfilteredSource,
  });

  if (!pageReadResult.success) {
    return {
      success: false,
      aborted: true,
      partialApplied: false,
      code: pageReadResult.code,
      message: pageReadResult.message,
      failedAtPage: pageReadResult.failedAtPage,
      pagesRead: pageReadResult.pagesRead,
      report: null,
      aggregatePreview: buildTeachingAggregatePreview(pageReadResult, options),
    };
  }

  const aggregatePreview = buildTeachingAggregatePreview(pageReadResult, options);

  if (options.sourceMode === 'real_teaching_preview') {
    return {
      success: true,
      aborted: false,
      partialApplied: false,
      code: 'OK',
      message: aggregatePreview.message,
      report: null,
      aggregatePreview,
    };
  }

  const report = classifyAndDiffTeachingSnapshot(pageReadResult.rows, currentState, {
    ...options,
    sourceMode: options.sourceMode || 'synthetic_fixture',
    paginationSummary: {
      pagesRead: pageReadResult.pagesRead,
      pageLength: pageReadResult.pageLength,
      recordsTotal: pageReadResult.recordsTotal,
      recordsFiltered: pageReadResult.recordsFiltered,
      lastPageRowCount: pageReadResult.lastPageRowCount,
    },
  });

  return {
    success: true,
    aborted: false,
    partialApplied: false,
    code: 'OK',
    message: pageReadResult.message,
    report,
    aggregatePreview,
  };
}
