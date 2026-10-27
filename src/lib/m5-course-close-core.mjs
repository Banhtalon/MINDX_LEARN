/**
 * MINDX LEARN — Mốc 5: CSV tổng kết 14 buổi, Kiểm tra toàn vẹn,
 * Xóa dữ liệu khóa cũ và Cổng dung lượng Storage 700 MB / 800 MB.
 *
 * Module logic thuần ESM (không phụ thuộc DOM, React hay Next.js)
 * để kiểm thử trực tiếp bằng Node 24 test runner và tái sử dụng ở frontend / backend.
 */

import crypto from 'node:crypto';

// ============================================================================
// HẰNG SỐ & ĐỊNH NGHĨA
// ============================================================================

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

// ============================================================================
// TIỆN ÍCH AN TOÀN CSV (CHỐNG FORMULA INJECTION & ESCAPE RFC 4180)
// ============================================================================

/**
 * Khử độc ô dữ liệu CSV để ngăn chặn tấn công CSV Formula Injection (DDE).
 * Nếu chuỗi bắt đầu bằng '=', '+', '-', '@', '\t', '\r', thêm dấu nháy đơn "'" phía trước.
 * Escape toàn bộ dấu ngoặc kép '"' thành '""' và bọc trong cặp ngoặc kép.
 * Tuyệt đối không chứa PIN hay bí mật.
 */
export function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Trình phân tích cú pháp CSV chuẩn RFC 4180 (hỗ trợ nhiều dòng, dấu ngoặc kép escape, xuống dòng \r\n hoặc \n).
 * @param {string} text
 * @returns {string[][]} Mảng 2 chiều các ô dữ liệu
 */
export function parseCsvRfc4180(text) {
  if (typeof text !== 'string') return [];
  const rows = [];
  let currentRow = [];
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

  // Kết thúc tệp
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  // Khử hàng trống ở cuối tệp
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}

// ============================================================================
// 1. TẬP HỌC SINH ĐỢT HỌC ỔN ĐỊNH (COHORT ROSTER)
// ============================================================================

/**
 * Tập hợp toàn bộ học sinh từng tham gia đợt học của lớp:
 * - Học sinh có originalClassId === classId hoặc currentClassId === classId
 * - Học sinh có trong cohortMembers của (classId, courseId)
 * - Học sinh có quizResults hoặc practiceSubmissions gắn với classId này
 * (bao gồm cả active, transferred, archived và học sinh 0/14 chưa nộp bài nào).
 *
 * Khử trùng lặp theo participantId ổn định.
 * Phát hiện lỗi kỹ thuật nếu thiếu participantId hoặc trùng participantId giữa 2 học sinh khác nhau.
 */
export function resolveBatchParticipants(options) {
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

  // Tập hợp danh sách thô
  const candidateMap = new Map(); // id -> student record
  const participantToIdMap = new Map(); // participantId -> student id

  const courseLessonIds = new Set(
    (lessons || [])
      .filter((l) => !courseId || (!l.courseId && !l.course_id) || l.courseId === courseId || l.course_id === courseId)
      .map((l) => l.id)
  );

  const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;

  const allCloseOps = [...(closedOperations || []), ...(closeOperations || [])];
  const hasPriorClosedOtherCourse = allCloseOps.some(
    (op) =>
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

  // 3. Học sinh có quizResults hoặc submissions gắn với classId này thuộc bài học của courseId
  const studentIdsFromActivity = new Set();
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

  const errors = [];
  const participants = [];

  for (const student of candidateMap.values()) {
    // Kiểm tra thiếu participantId
    if (!student.participantId) {
      errors.push(`Học sinh "${student.fullName}" (${student.studentCode || student.id}) bị thiếu mã tham gia nội bộ participantId.`);
      continue;
    }

    // Kiểm tra trùng participantId giữa 2 học sinh khác nhau
    if (participantToIdMap.has(student.participantId)) {
      const existingId = participantToIdMap.get(student.participantId);
      if (existingId !== student.id) {
        errors.push(`Phát hiện xung đột mã tham gia: Mã "${student.participantId}" đang được gán cho nhiều học sinh khác nhau (${existingId} và ${student.id}).`);
        continue;
      }
    } else {
      participantToIdMap.set(student.participantId, student.id);
      participants.push(student);
    }
  }

  // Sắp xếp ổn định theo participantId
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
 * Tương thích ngược với hàm getBatchParticipants cũ của Milestone 1-4.
 * Trả về mảng học sinh tham gia đợt.
 */
export function getBatchParticipants(students, classId, options = {}) {
  const res = resolveBatchParticipants({
    students,
    classId,
    courseId: options.courseId,
    cohortMembers: options.cohortMembers,
    quizResults: options.quizResults,
    submissions: options.submissions,
    lessons: options.lessons,
    closedOperations: options.closedOperations,
    closeOperations: options.closeOperations,
  });
  return res.participants;
}

// ============================================================================
// 2. TÍNH BẢN TÓM TẮT & TOÀN VẸN SNAPSHOT (DIGEST)
// ============================================================================

/**
 * R3-02: Hàm mã hóa độ dài tiền tố (length-prefixed encoding) cho từng trường trong snapshotDigest.
 * Đếm ký tự theo Array.from(str).length (Unicode code points), đảm bảo khớp tuyệt đối 100%
 * với hàm char_length(text) của PostgreSQL trên mọi ký tự tiếng Việt UTF-8.
 */
export function encDigestField(val) {
  const str = String(val ?? '');
  const len = Array.from(str).length;
  return `${len}#${str}`;
}

/**
 * Tạo chuỗi băm SHA-256 đại diện cho trạng thái dữ liệu hiện tại của đợt học (snapshotDigest).
 * Bất kỳ sự thay đổi nào về học sinh, ghi chú, họ tên, điểm quiz, bài nộp, nhận xét GV,
 * tiêu đề buổi học hay thông tin lớp sau khi xuất CSV sẽ làm đổi digest này,
 * giúp phát hiện sự mất đồng bộ và chặn xóa dữ liệu lỗi thời.
 */
export function computeCourseCloseSnapshotDigest(options) {
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

  // P1-03 / R3-02: Chỉ băm các trường thực sự thuộc nội dung đợt học & CSV bằng length-prefixed encoding
  const classPart = `${enc(classId)}:${enc(courseId)}:${enc(classCode)}`;

  // Lessons sorted by sessionNumber ASC
  const sortedLessons = [...lessons]
    .filter((l) => !courseId || !l.courseId || l.courseId === courseId)
    .sort((a, b) => Number(a.sessionNumber) - Number(b.sessionNumber));
  const lessonsPart = sortedLessons
    .map(
      (l) =>
        `${enc(l.sessionNumber)}:${enc(l.id)}:${enc(l.title)}:${enc(l.status)}:${enc(Boolean(l.hasQuiz))}:${enc(Boolean(l.hasPractice))}`
    )
    .join('|');

  // Participants sorted by participantId ASC
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

  // Quiz results (sorted by studentId ASC, lessonId ASC)
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

  // Submissions (sorted by studentId ASC, lessonId ASC)
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
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export const computeCohortSnapshotDigest = computeCourseCloseSnapshotDigest;

// ============================================================================
// 3. XEM TRƯỚC ĐÓNG KHÓA (COMPUTE COURSE CLOSE PREVIEW)
// ============================================================================

/**
 * Tính toán chi tiết xem trước phạm vi và tác động đóng khóa:
 * - Tách bạch Cảnh báo đỏ (warnings - không chặn) khỏi Lỗi kỹ thuật (blockErrors - buộc dừng).
 */
export function computeCourseClosePreview({
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
}) {
  const blockErrors = [];
  const blockErrorCodes = [];
  const warnings = [];

  const classId = classItem?.id || '';
  const courseId = course?.id || classItem?.courseId || '';

  // 1. Kiểm tra quyền Admin
  if (!currentUser || currentUser.role !== 'admin') {
    blockErrors.push('Chỉ có Quản trị viên (Admin) mới có quyền đóng khóa học và xóa dữ liệu.');
    blockErrorCodes.push(M5_ERROR_CODES.UNAUTHORIZED_ROLE);
  }

  // 2. Kiểm tra lớp học và khóa học hợp lệ
  if (!classItem || !course || classItem.courseId !== course.id) {
    blockErrors.push('Lớp học không tồn tại, chưa được gán khóa học hoặc khóa học không khớp.');
    blockErrorCodes.push(M5_ERROR_CODES.CLASS_COURSE_MISMATCH);
  }

  // 3. Kiểm tra khóa học có đúng 14 buổi cố định Buổi 1–14
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

  // 4. Kiểm tra danh sách học sinh tham gia đợt (R4-03)
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

  // 5. Kiểm tra Admin xác nhận lịch 14 buổi
  const confirmedSchedule = Boolean(isSchedule14Confirmed ?? classItem?.is14SessionsConfirmed);
  if (!confirmedSchedule) {
    blockErrors.push('Admin chưa đánh dấu xác nhận lớp đã học đủ 14 buổi theo lịch trình thực tế.');
    blockErrorCodes.push(M5_ERROR_CODES.SCHEDULE_14_NOT_CONFIRMED);
  }

  // 6. Kiểm tra tải tệp giữ chỗ hoặc tác vụ ghi/xóa đang chạy
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

  // Tính các số liệu chi tiết
  let activeParticipantsCount = 0;
  let transferredCount = 0;
  let archivedCount = 0;

  for (const st of participants) {
    if (st.status === 'transferred') transferredCount++;
    else if (st.status === 'archived') archivedCount++;
    else activeParticipantsCount++;
  }

  // Thống kê tiến độ học sinh trên 14 buổi
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

  // Thống kê tệp trong Storage
  let storageFilesCount = 0;
  let storageBytesCount = 0;
  const targetStoragePaths = [];

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

  // Thống kê buổi học ở trạng thái Nháp (draft)
  const draftLessonsCount = courseLessons.filter((l) => l.status === 'draft').length;

  // Tính snapshot digest hiện tại
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

  // Kiểm tra điều kiện mở nút Xóa vĩnh viễn (canExecuteDelete)
  const isCsvVerified = Boolean(
    csvVerification &&
    csvVerification.valid &&
    csvVerification.snapshotDigest === currentSnapshotDigest
  );

  // CẢNH BÁO ĐỎ (Không chặn Admin xác nhận)
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

// ============================================================================
// 4. XUẤT CSV 14 BUỔI TỔNG KẾT
// ============================================================================

/**
 * Sinh danh sách các dòng dữ liệu CSV tổng kết 14 buổi cho toàn bộ học sinh trong đợt.
 * Mỗi học sinh có đúng 14 dòng (Buổi 1 đến Buổi 14).
 * Số dòng = totalParticipants * 14.
 */
export function generateCourseCloseCsvRows(
  batchStudents,
  lessons,
  classCode,
  quizResults = [],
  submissions = [],
  options = {}
) {
  const classId = options.classId || '';
  const courseId = options.courseId || '';

  // Lọc đúng 14 buổi của khóa học được chỉ định (hoặc 14 buổi truyền vào)
  let courseLessons = [...lessons];
  if (courseId) {
    const matched = courseLessons.filter((l) => l.courseId === courseId);
    if (matched.length > 0) courseLessons = matched;
  }
  courseLessons = courseLessons
    .filter((l) => l.sessionNumber >= 1 && l.sessionNumber <= 14)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);

  // Tính trước tiến độ X/14 cho từng học sinh
  const studentProgressMap = new Map();
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

  const rows = [];

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

      // Điểm Quiz
      const quizScoreStr = quiz ? `${quiz.highestScore}%` : 'Chưa làm';
      let quizStatusStr = 'Không có Quiz';
      if (les.hasQuiz) {
        quizStatusStr = quiz ? (quiz.passed ? 'Đạt' : 'Chưa đạt') : 'Chưa làm';
      }

      // Trạng thái Thực hành
      let practiceStatusStr = 'Không có TH';
      if (les.hasPractice) {
        if (!sub) practiceStatusStr = 'Chưa nộp';
        else if (sub.status === 'approved') practiceStatusStr = 'Đạt';
        else if (sub.status === 'needs_revision') practiceStatusStr = 'Cần làm lại';
        else practiceStatusStr = 'Chờ chấm';
      }

      // Nhận xét giáo viên
      const teacherFeedback = sub?.teacherFeedback || '';

      // Trạng thái hoàn thành buổi
      const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
      const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
      const sessionCompletedStr =
        quizPass && practicePass ? `Hoàn thành (${progressLabel})` : `Chưa hoàn thành (${progressLabel})`;

      // Trạng thái học sinh (kèm ghi chú nếu có)
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
 * Xây dựng nội dung tệp CSV hoàn chỉnh kèm kiểm tra sơ bộ số dòng.
 */
export function buildCourseCloseCsvContent(
  batchStudents,
  lessons,
  classCode,
  quizResults = [],
  submissions = [],
  options = {}
) {
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

// ============================================================================
// 5. TỰ ĐỘNG ĐỌC LẠI VÀ ĐỐI CHIẾU CSV (VERIFY COURSE CLOSE CSV)
// ============================================================================

/**
 * Tự động phân tích lại nội dung tệp CSV theo chuẩn RFC 4180 và đối chiếu với dữ liệu gốc của đợt:
 * 1. Header đúng chuẩn COURSE_CLOSE_CSV_HEADER.
 * 2. Tổng số dòng dữ liệu = expectedParticipants.length * 14.
 * 3. Đủ mọi học sinh (kể cả transferred, archived, unsubmitted), không thừa mã lạ.
 * 4. Mỗi học sinh có đủ 14 buổi từ 1 đến 14 không trùng/thiếu.
 * 5. Điểm quiz, trạng thái quiz/thực hành, nhận xét GV, trạng thái HS khớp dữ liệu snapshot.
 * 6. Không chứa từ khóa nhạy cảm (pinHash, password, token, key, secret).
 */
export function verifyCourseCloseCsv(csvContent, expectedData) {
  const {
    participants = [],
    lessons = [],
    classCode = '',
    classId = '',
    courseId = '',
    quizResults = [],
    submissions = [],
  } = expectedData || {};

  const errors = [];

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

  // 2. Parse RFC 4180
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

  // 1. Kiểm tra chuỗi nhạy cảm
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
  for (const p of participants) {
    if (!p || typeof p !== 'object') continue;
    const secrets = [p.pinHash, p.pin_hash, p.password, p.password_hash];
    if (secrets.some((s) => typeof s === 'string' && s.length >= 4 && (csvContent.includes(s) || decodedCellsText.includes(s)))) {
      errors.push('Phát hiện chuỗi nhạy cảm tiềm ẩn trong tệp CSV khớp mẫu: participant_secret_leak');
      break;
    }
  }

  // 3. Kiểm tra Header
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

  // 4. Kiểm tra tổng số dòng dữ liệu
  if (dataRows.length !== expectedRowCount) {
    errors.push(
      `Tổng số dòng dữ liệu (${dataRows.length}) không khớp với công thức ${participants.length} học sinh x 14 buổi (${expectedRowCount} dòng).`
    );
  }

  // 5. Kiểm tra danh sách học sinh và 14 buổi
  const expectedParticipantMap = new Map();
  for (const p of participants) {
    expectedParticipantMap.set(p.participantId, p);
  }

  const parsedByParticipant = new Map(); // participantId -> Array<row>

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const row = dataRows[rIdx];
    if (row.length !== expectedHeaderCols.length) {
      errors.push(`Dòng ${rIdx + 2} có số lượng cột (${row.length}) không đúng (${expectedHeaderCols.length}).`);
      continue;
    }

    const participantId = row[0].replace(/^'/, ''); // Bỏ dấu nháy khử formula nếu có
    if (!expectedParticipantMap.has(participantId)) {
      errors.push(`Dòng ${rIdx + 2}: Mã tham gia "${participantId}" không nằm trong danh sách đợt học đã xác minh.`);
      continue;
    }

    if (!parsedByParticipant.has(participantId)) {
      parsedByParticipant.set(participantId, []);
    }
    parsedByParticipant.get(participantId).push({ rowIdx: rIdx + 2, cells: row });
  }

  // Kiểm tra không thiếu bất kỳ học sinh nào
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

    // Kiểm tra đúng thứ tự Buổi 1 đến 14
    const sessionSeen = new Set();
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

  function normalizeCell(val) {
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

  // 6. Tính mã băm SHA-256 của CSV và Snapshot Digest (P1-03)
  const sha256 = crypto.createHash('sha256').update(csvContent, 'utf8').digest('hex');
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

// ============================================================================
// 6. CHIA LÔ STORAGE <= 1000 OBJECT & THỰC THI ĐÓNG KHÓA
// ============================================================================

/**
 * Chia mảng object path thành các lô nhỏ tối đa 1.000 object mỗi yêu cầu (theo giới hạn Supabase Storage API).
 */
export function chunkStoragePaths(paths = [], chunkSize = MAX_STORAGE_BATCH_SIZE) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const safeChunkSize = Math.max(1, Math.min(chunkSize, MAX_STORAGE_BATCH_SIZE));
  const chunks = [];
  for (let i = 0; i < paths.length; i += safeChunkSize) {
    chunks.push(paths.slice(i, i + safeChunkSize));
  }
  return chunks;
}

/**
 * R10-01: Đọc toàn bộ dòng dữ liệu theo từng trang (mặc định 1.000 dòng/trang theo giới hạn PostgREST).
 * Fail-Closed: bất kỳ trang nào lỗi thì trả ngay { data: null, error }.
 *
 * @param {(from: number, to: number) => Promise<{ data: any[] | null, error: any }>} fetchPage
 * @param {number} pageSize
 */
export async function fetchAllPaginatedRows(fetchPage, pageSize = 1000) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || 1000);
  const allRows = [];
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
 * Điều phối quy trình đóng khóa học và xóa vĩnh viễn dữ liệu cũ:
 * 1. Kiểm tra xác nhận CSV và snapshotDigest khớp.
 * 2. Xóa các tệp Storage theo lô <= 1000 object (hỗ trợ mô phỏng lỗi giữa các lô).
 * 3. Nếu xảy ra lỗi ở Storage hoặc giữa Storage và DB: dừng ở trạng thái 'incomplete' để tiếp tục an toàn (resume).
 * 4. Khi Storage kiểm đếm còn 0 tệp: xóa các bản ghi DB quiz_results, practice_submissions, reservations của đúng (classId, courseId).
 * 5. Khi DB kiểm đếm còn 0: nếu có nextCourseId thì gán khóa mới và đặt lại is14SessionsConfirmed = false, status = 'active'; nếu không thì chuyển status = 'completed'.
 */
export async function runCourseCloseExecution(options) {
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
    simulateFailureStage = null, // 'mid_storage_batch' | 'between_storage_and_db' | null
  } = options || {};

  const isResume =
    existingOperation &&
    ['incomplete', 'deleting_storage', 'deleting_db'].includes(existingOperation.status);

  // Kiểm tra tính hợp lệ trước khi bắt đầu
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

  // Xác định danh sách tệp cần xóa
  let pathsToDelete = isResume
    ? [...(existingOperation.remainingStoragePaths || [])]
    : [...targetStoragePaths];

  let deletedPaths = isResume ? [...(existingOperation.deletedStoragePaths || [])] : [];

  const chunks = chunkStoragePaths(pathsToDelete, MAX_STORAGE_BATCH_SIZE);

  // Bước 1: Xóa tệp trên Storage theo từng lô
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    // Mô phỏng lỗi giữa các lô Storage nếu được yêu cầu
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
      } catch (err) {
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

  // Kiểm đếm tệp còn lại
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

  // Bước 2: Mô phỏng lỗi giữa Storage và DB nếu được yêu cầu
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

  // Bước 3: Xóa dữ liệu cơ sở dữ liệu (quiz_results, practice_submissions, reservations)
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
    } catch (err) {
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

// ============================================================================
// 7. CỔNG KIỂM SOÁT DUNG LƯỢNG STORAGE 700 MB / 800 MB
// ============================================================================

/**
 * Cổng kiểm soát dung lượng tải tệp lên Storage:
 * - Tính tổng dung lượng dự kiến = usedStorageBytes + activeReservedBytes + orgBaselineBytes + incomingBytes.
 * - Cảnh báo ở ngưỡng 700 MB (734,003,200 bytes).
 * - Chặn bắt đầu lượt tải tệp mới trước khi vượt 800 MB (838,860,800 bytes) hoặc ngưỡng thấp hơn của tổ chức.
 * - Trả mã lỗi STORAGE_QUOTA_EXCEEDED.
 * - Chế độ nộp bằng liên kết (link) vẫn luôn hoạt động bình thường.
 */
export function evaluateStorageQuotaGate(options) {
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
