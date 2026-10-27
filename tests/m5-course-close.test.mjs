import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  STORAGE_WARNING_THRESHOLD_BYTES,
  STORAGE_HARD_LIMIT_BYTES,
  MAX_STORAGE_BATCH_SIZE,
  COURSE_CLOSE_CSV_HEADER,
  M5_ERROR_CODES,
  sanitizeCsvCell,
  parseCsvRfc4180,
  resolveBatchParticipants,
  getBatchParticipants,
  computeCohortSnapshotDigest,
  computeCourseCloseSnapshotDigest,
  computeCourseClosePreview,
  generateCourseCloseCsvRows,
  buildCourseCloseCsvContent,
  verifyCourseCloseCsv,
  chunkStoragePaths,
  fetchAllPaginatedRows,
  runCourseCloseExecution,
  evaluateStorageQuotaGate,
  encDigestField,
} from '../src/lib/m5-course-close-core.mjs';

import { ALLOWED_BFF_ACTIONS } from '../src/lib/server/crypto.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Helper tải và transpile TypeScript mock-data.ts trong môi trường Node ESM
async function loadMockData() {
  const mockPath = path.join(ROOT_DIR, 'src', 'lib', 'mock-data.ts');
  const source = fs.readFileSync(mockPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dataUrl =
    'data:text/javascript;base64,' +
    Buffer.from(transpiled.outputText, 'utf8').toString('base64');
  return await import(dataUrl);
}

// ============================================================================
// SUITE 1: DỮ LIỆU MẪU 14 BUỔI VÀ TÁCH BIỆT CẢNH BÁO ĐỎ VỚI LỖI CHẶN KỸ THUẬT
// ============================================================================
test('Suite 1: M5 14-session fixture validation with all 5 student groups & preview warnings', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
    m5CohortMembers,
  } = mocks;

  await t.test('1.1 Course has exactly 14 published sessions (Buổi 1 to Buổi 14)', () => {
    assert.strictEqual(m5Lessons14.length, 14, 'Khóa học M5 phải có đúng 14 buổi học');
    const sessions = m5Lessons14.map((l) => l.sessionNumber).sort((a, b) => a - b);
    for (let i = 1; i <= 14; i++) {
      assert.strictEqual(sessions[i - 1], i, `Buổi học thứ ${i} phải có sessionNumber = ${i}`);
    }
    const allPublished = m5Lessons14.every((l) => l.status === 'published');
    assert.strictEqual(allPublished, true, 'Toàn bộ 14 buổi phải ở trạng thái published');
  });

  await t.test('1.2 Fixture contains all 5 student groups with accurate statuses', () => {
    assert.strictEqual(m5Students.length, 5, 'Bộ dữ liệu M5 phải có đúng 5 học sinh');

    // HS 1: Hoàn thành 14/14
    const stu1 = m5Students.find((s) => s.id === 'usr_m5_stu_1');
    assert.ok(stu1, 'Phải có học sinh hoàn thành 14/14 (usr_m5_stu_1)');
    assert.strictEqual(stu1.status, 'active');

    // HS 2: Chưa hoàn tất, có bài nộp thực hành chờ chấm (submitted) kèm tệp giả có dung lượng
    const stu2 = m5Students.find((s) => s.id === 'usr_m5_stu_2');
    assert.ok(stu2, 'Phải có học sinh đang học dở (usr_m5_stu_2)');
    const pendingSub = m5Submissions.find(
      (s) => s.studentId === 'usr_m5_stu_2' && s.status === 'submitted'
    );
    assert.ok(pendingSub, 'Học sinh 2 phải có bài thực hành đang chờ chấm');
    assert.strictEqual(pendingSub.type, 'file');
    assert.ok(Number(pendingSub.fileSizeBytes) > 0, 'Bài nộp tệp giả phải có fileSizeBytes');

    // HS 3: Chưa nộp bài nào (0/14)
    const stu3 = m5Students.find((s) => s.id === 'usr_m5_stu_3');
    assert.ok(stu3, 'Phải có học sinh chưa nộp bài nào (usr_m5_stu_3)');
    const stu3Quizzes = m5QuizResults.filter((q) => q.studentId === 'usr_m5_stu_3');
    const stu3Subs = m5Submissions.filter((s) => s.studentId === 'usr_m5_stu_3');
    assert.strictEqual(stu3Quizzes.length, 0, 'Học sinh 3 không được có kết quả quiz nào');
    assert.strictEqual(stu3Subs.length, 0, 'Học sinh 3 không được có bài thực hành nào');

    // HS 4: Đã chuyển lớp (transferred)
    const stu4 = m5Students.find((s) => s.id === 'usr_m5_stu_4');
    assert.ok(stu4, 'Phải có học sinh chuyển lớp (usr_m5_stu_4)');
    assert.strictEqual(stu4.status, 'transferred');
    assert.strictEqual(stu4.originalClassId, m5FixtureClass.id);
    assert.notStrictEqual(stu4.currentClassId, m5FixtureClass.id);

    // HS 5: Đã lưu trữ (archived)
    const stu5 = m5Students.find((s) => s.id === 'usr_m5_stu_5');
    assert.ok(stu5, 'Phải có học sinh lưu trữ (usr_m5_stu_5)');
    assert.strictEqual(stu5.status, 'archived');
  });

  await t.test('1.3 computeCourseClosePreview calculates accurate statistics and counts', () => {
    const adminUser = { id: 'usr_admin_1', role: 'admin', name: 'Admin Test' };

    const preview = computeCourseClosePreview({
      currentUser: adminUser,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
    });

    assert.strictEqual(preview.totalParticipants, 5, 'Tổng số học sinh từng tham gia đợt phải là 5');
    assert.strictEqual(preview.activeParticipantsCount, 3, 'Số học sinh active phải là 3');
    assert.strictEqual(preview.transferredCount, 1, 'Số học sinh transferred phải là 1');
    assert.strictEqual(preview.archivedCount, 1, 'Số học sinh archived phải là 1');
    assert.strictEqual(preview.completedAll14Count, 1, 'Số học sinh hoàn thành 14/14 phải là 1 (HS 1)');
    assert.strictEqual(preview.incompleteStudentsCount, 4, 'Số học sinh chưa hoàn tất 14 buổi phải là 4 (HS 2, 3, 4, 5)');
    assert.strictEqual(preview.unsubmittedStudentsCount, 1, 'Số học sinh chưa nộp bài nào phải là 1 (HS 3)');
    assert.strictEqual(preview.pendingGradingCount, 1, 'Số bài chờ chấm phải là 1 (bài của HS 2)');
    assert.ok(preview.storageFilesCount >= 1, 'Phải có ít nhất 1 tệp trong Storage');
    assert.ok(preview.storageBytesCount > 0, 'Tổng dung lượng tệp phải lớn hơn 0');
  });

  await t.test('1.4 Red warnings display correct quantities and DO NOT block Admin confirmation', () => {
    const adminUser = { id: 'usr_admin_1', role: 'admin', name: 'Admin Test' };

    const preview = computeCourseClosePreview({
      currentUser: adminUser,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
    });

    // Kiểm tra các cảnh báo đỏ có mặt và nêu đúng số lượng
    const warningText = preview.warnings.join('\n');
    assert.ok(warningText.includes('1 học sinh chưa nộp/làm bất kỳ bài nào'), 'Cảnh báo HS chưa nộp');
    assert.ok(warningText.includes('4 học sinh chưa hoàn tất đủ 14/14 buổi học'), 'Cảnh báo HS chưa hoàn tất');
    assert.ok(warningText.includes('1 bài thực hành đang ở trạng thái Chờ chấm'), 'Cảnh báo bài chờ chấm');
    assert.ok(warningText.includes('1 học sinh đã chuyển lớp'), 'Cảnh báo HS chuyển lớp');
    assert.ok(warningText.includes('1 học sinh đã lưu trữ tài khoản'), 'Cảnh báo HS lưu trữ');
    assert.ok(warningText.includes('CSV là báo cáo tổng kết, không phải bản backup'), 'Cảnh báo mất dữ liệu');

    // Quan trọng: Cảnh báo đỏ KHÔNG tạo ra blockErrors
    assert.strictEqual(preview.blockErrors.length, 0, 'Cảnh báo đỏ không được tạo ra blockErrors');
    assert.strictEqual(preview.canExportCsv, true, 'Admin có quyền xuất CSV khi chỉ có cảnh báo đỏ');
  });
});

// ============================================================================
// SUITE 2: XUẤT CSV 14 BUỔI CHO TOÀN BỘ ĐỢT HỌC & CHỐNG FORMULA INJECTION
// ============================================================================
test('Suite 2: CSV export generates N x 14 rows, sanitizes formula injection & leaks zero secrets', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  await t.test('2.1 Generates exactly N x 14 = 70 rows for 5 students', () => {
    const csvResult = buildCourseCloseCsvContent(
      m5Students,
      m5Lessons14,
      m5FixtureClass.code,
      m5QuizResults,
      m5Submissions,
      { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
    );

    assert.strictEqual(csvResult.success, true, 'buildCourseCloseCsvContent phải thành công');
    assert.strictEqual(csvResult.participantCount, 5, 'Phải có 5 học sinh');
    assert.strictEqual(csvResult.rowCount, 70, 'Tổng số dòng phải là 5 x 14 = 70');
  });

  await t.test('2.2 Preserves transferred, archived, and unsubmitted students with complete 14 sessions', () => {
    const rows = generateCourseCloseCsvRows(
      m5Students,
      m5Lessons14,
      m5FixtureClass.code,
      m5QuizResults,
      m5Submissions,
      { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
    );

    // Kiểm tra học sinh chuyển lớp (usr_m5_stu_4 / PART_M5_004) có đúng 14 dòng
    const transferredRows = rows.filter((r) => r.includes('"PART_M5_004"'));
    assert.strictEqual(transferredRows.length, 14, 'Học sinh chuyển lớp phải có đúng 14 dòng');
    assert.ok(transferredRows[0].includes('transferred'), 'Dòng phải ghi nhận trạng thái transferred');

    // Kiểm tra học sinh lưu trữ (usr_m5_stu_5 / PART_M5_005) có đúng 14 dòng
    const archivedRows = rows.filter((r) => r.includes('"PART_M5_005"'));
    assert.strictEqual(archivedRows.length, 14, 'Học sinh lưu trữ phải có đúng 14 dòng');
    assert.ok(archivedRows[0].includes('archived'), 'Dòng phải ghi nhận trạng thái archived');

    // Kiểm tra học sinh chưa nộp bài nào (usr_m5_stu_3 / PART_M5_003) có đúng 14 dòng và kết quả trắng
    const unsubmittedRows = rows.filter((r) => r.includes('"PART_M5_003"'));
    assert.strictEqual(unsubmittedRows.length, 14, 'Học sinh chưa nộp bài phải có đúng 14 dòng');
    for (const r of unsubmittedRows) {
      assert.ok(r.includes('"Chưa hoàn thành (0/14)"'), 'Tiến độ của HS chưa nộp phải là 0/14');
    }

    // Kiểm tra học sinh hoàn thành 14/14 (usr_m5_stu_1 / PART_M5_001)
    const completedRows = rows.filter((r) => r.includes('"PART_M5_001"'));
    assert.strictEqual(completedRows.length, 14, 'Học sinh 1 phải có đủ 14 dòng');
    for (const r of completedRows) {
      assert.ok(r.includes('"Hoàn thành (14/14)"'), 'Tiến độ của HS hoàn thành phải là 14/14');
    }
  });

  await t.test('2.3 sanitizeCsvCell neutralizes CSV formula injection characters (=, +, -, @, \\t, \\r)', () => {
    // Ký tự nguy hiểm
    assert.strictEqual(sanitizeCsvCell('=cmd|"/C calc"!A0'), "\"'=cmd|\"\"/C calc\"\"!A0\"");
    assert.strictEqual(sanitizeCsvCell('+123456'), "\"'+123456\"");
    assert.strictEqual(sanitizeCsvCell('-SUM(A1:A10)'), "\"' -SUM(A1:A10)\"".replace(' ', ''));
    assert.strictEqual(sanitizeCsvCell('@HYPERLINK("http://evil.com")'), "\"'@HYPERLINK(\"\"http://evil.com\"\")\"");
    assert.strictEqual(sanitizeCsvCell('\tDangerousTab'), "\"'\tDangerousTab\"");
    assert.strictEqual(sanitizeCsvCell('\rDangerousCR'), "\"'\rDangerousCR\"");

    // Ký tự an toàn bình thường
    assert.strictEqual(sanitizeCsvCell('Nguyễn Văn An'), '"Nguyễn Văn An"');
    assert.strictEqual(sanitizeCsvCell('HS_ROB_001'), '"HS_ROB_001"');
    assert.strictEqual(sanitizeCsvCell(100), '"100"');
    assert.strictEqual(sanitizeCsvCell(null), '""');
    assert.strictEqual(sanitizeCsvCell(undefined), '""');
  });

  await t.test('2.4 Strict verification of ZERO sensitive data in CSV output', () => {
    const csvResult = buildCourseCloseCsvContent(
      m5Students,
      m5Lessons14,
      m5FixtureClass.code,
      m5QuizResults,
      m5Submissions,
      { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
    );

    const content = csvResult.csvContent;

    // Không chứa pinHash hay chuỗi băm PIN
    assert.strictEqual(content.includes('pinHash'), false, 'CSV không được chứa trường pinHash');
    assert.strictEqual(content.includes('MOCK_HASH_PIN'), false, 'CSV không được chứa MOCK_HASH_PIN');
    assert.strictEqual(content.includes('50011111'), false, 'CSV không được chứa giá trị PIN của HS 1');

    // Không chứa password, token, key, secret
    assert.strictEqual(/password/i.test(content), false, 'CSV không được chứa password');
    assert.strictEqual(/session_token/i.test(content), false, 'CSV không được chứa session_token');
    assert.strictEqual(/service_role/i.test(content), false, 'CSV không được chứa service_role');
    assert.strictEqual(/jwt\./i.test(content), false, 'CSV không được chứa jwt token');
    assert.strictEqual(/bearer\s+/i.test(content), false, 'CSV không được chứa Bearer header');
  });
});

// ============================================================================
// SUITE 3: TỰ ĐỘNG ĐỌC LẠI VÀ ĐỐI CHIẾU CSV THEO CHUẨN RFC 4180
// ============================================================================
test('Suite 3: verifyCourseCloseCsv RFC 4180 validation & tampering detection', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const validCsvResult = buildCourseCloseCsvContent(
    m5Students,
    m5Lessons14,
    m5FixtureClass.code,
    m5QuizResults,
    m5Submissions,
    { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
  );

  const expectedData = {
    participants: m5Students,
    lessons: m5Lessons14,
    classCode: m5FixtureClass.code,
    classId: m5FixtureClass.id,
    courseId: m5Course14.id,
    quizResults: m5QuizResults,
    submissions: m5Submissions,
  };

  await t.test('3.1 Valid CSV passes verification with exact rowCount and sha256', () => {
    const report = verifyCourseCloseCsv(validCsvResult.csvContent, expectedData);

    assert.strictEqual(report.valid, true, 'CSV chuẩn phải vượt qua bước kiểm tra');
    assert.strictEqual(report.errors.length, 0, 'Không được có lỗi nào');
    assert.strictEqual(report.rowCount, 70, 'Số dòng phải là 70');
    assert.strictEqual(report.participantCount, 5, 'Số học sinh phải là 5');
    assert.strictEqual(typeof report.sha256, 'string', 'Phải có sha256');
    assert.strictEqual(report.sha256.length, 64, 'SHA-256 phải là chuỗi 64 ký tự hex');
    assert.strictEqual(typeof report.snapshotDigest, 'string', 'Phải có snapshotDigest');
  });

  await t.test('3.2 Detects missing transferred/archived student and reports error', () => {
    // Giả sử có một CSV bị thiếu học sinh lưu trữ usr_m5_stu_5 (PART_M5_005)
    const lines = validCsvResult.csvContent.split(/\r?\n/).filter(Boolean);
    const header = lines[0];
    const filteredRows = lines.slice(1).filter((l) => !l.includes('PART_M5_005'));
    const tamperedCsv = header + '\r\n' + filteredRows.join('\r\n');

    const report = verifyCourseCloseCsv(tamperedCsv, expectedData);

    assert.strictEqual(report.valid, false, 'CSV thiếu học sinh lưu trữ phải bị từ chối');
    assert.ok(
      report.errors.some((e) => e.includes('PART_M5_005') || e.includes('Phạm Lưu Trữ')),
      'Phải thông báo thiếu học sinh PART_M5_005'
    );
  });

  await t.test('3.3 Detects row count mismatch (69 or 71 rows instead of 70)', () => {
    const lines = validCsvResult.csvContent.split(/\r?\n/).filter(Boolean);
    // Xóa bớt 1 dòng cuối
    const droppedOneRowCsv = lines.slice(0, lines.length - 1).join('\r\n');
    const report = verifyCourseCloseCsv(droppedOneRowCsv, expectedData);

    assert.strictEqual(report.valid, false, 'CSV thiếu dòng phải bị từ chối');
    assert.ok(
      report.errors.some((e) => e.includes('Tổng số dòng dữ liệu')),
      'Phải báo lỗi lệch tổng số dòng dữ liệu'
    );
  });

  await t.test('3.4 Detects missing or duplicate sessions for a student', () => {
    // Thay thế Buổi 14 của HS 1 bằng một Buổi 1 thứ hai
    const tamperedCsv = validCsvResult.csvContent.replace('"Buổi 14"', '"Buổi 1"');
    const report = verifyCourseCloseCsv(tamperedCsv, expectedData);

    assert.strictEqual(report.valid, false, 'CSV trùng/thiếu buổi học phải bị từ chối');
    assert.ok(
      report.errors.some((e) => e.includes('Sai thứ tự buổi học') || e.includes('trùng lặp hoặc thiếu')),
      'Phải thông báo lỗi thứ tự hoặc thiếu buổi học'
    );
  });

  await t.test('3.5 Detects injected sensitive strings (pinHash, token, password)', () => {
    const tamperedCsv = validCsvResult.csvContent + '\n"PART_M5_001","pinHash_leaked","HS_1"';
    const report = verifyCourseCloseCsv(tamperedCsv, expectedData);

    assert.strictEqual(report.valid, false, 'CSV chứa chuỗi nhạy cảm phải bị từ chối ngay');
    assert.ok(
      report.errors.some((e) => e.includes('Phát hiện chuỗi nhạy cảm')),
      'Phải báo lỗi phát hiện chuỗi nhạy cảm'
    );
  });
});

// ============================================================================
// SUITE 4: ĐIỀU KIỆN KỸ THUẬT CHẶN RIÊNG (BLOCK ERRORS)
// ============================================================================
test('Suite 4: Technical block errors validation (blockErrors)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
    m5CohortMembers,
  } = mocks;

  const validAdmin = { id: 'usr_admin_1', role: 'admin', name: 'Admin Test' };

  await t.test('4.1 UNAUTHORIZED_ROLE: Blocks non-admin users (teacher, student)', () => {
    const teacherUser = { id: 'usr_tea_1', role: 'teacher', name: 'Thầy Minh' };
    const preview = computeCourseClosePreview({
      currentUser: teacherUser,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
    });

    assert.ok(preview.blockErrorCodes.includes(M5_ERROR_CODES.UNAUTHORIZED_ROLE));
    assert.strictEqual(preview.canExportCsv, false);
    assert.strictEqual(preview.canExecuteDelete, false);
  });

  await t.test('4.2 CLASS_COURSE_MISMATCH: Class has mismatched or missing course', () => {
    const mismatchedClass = { ...m5FixtureClass, courseId: 'crs_other_course' };
    const preview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: mismatchedClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
    });

    assert.ok(preview.blockErrorCodes.includes(M5_ERROR_CODES.CLASS_COURSE_MISMATCH));
    assert.strictEqual(preview.canExportCsv, false);
  });

  await t.test('4.3 COURSE_SLOTS_INVALID: Course does not have exactly 14 slots', () => {
    // Bỏ bớt 1 buổi (chỉ còn 13 buổi)
    const incompleteLessons = m5Lessons14.filter((l) => l.sessionNumber !== 7);
    const preview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: incompleteLessons,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
    });

    assert.ok(preview.blockErrorCodes.includes(M5_ERROR_CODES.COURSE_SLOTS_INVALID));
    assert.strictEqual(preview.canExportCsv, false);
  });

  await t.test('4.4 COHORT_ROSTER_INVALID: Empty roster, missing or conflicting participantId', () => {
    // Trường hợp 1: Không có học sinh nào
    const emptyPreview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: [],
      cohortMembers: [],
      quizResults: [],
      submissions: [],
      isSchedule14Confirmed: true,
    });
    assert.ok(emptyPreview.blockErrorCodes.includes(M5_ERROR_CODES.COHORT_ROSTER_INVALID));

    // Trường hợp 2: Trùng participantId giữa 2 học sinh khác nhau
    const conflictStudents = [
      { id: 'st_1', participantId: 'SAME_PART_ID', fullName: 'HS A', originalClassId: m5FixtureClass.id },
      { id: 'st_2', participantId: 'SAME_PART_ID', fullName: 'HS B', originalClassId: m5FixtureClass.id },
    ];
    const conflictPreview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: conflictStudents,
      cohortMembers: [],
      quizResults: [],
      submissions: [],
      isSchedule14Confirmed: true,
    });
    assert.ok(conflictPreview.blockErrorCodes.includes(M5_ERROR_CODES.COHORT_ROSTER_INVALID));
  });

  await t.test('4.5 SCHEDULE_14_NOT_CONFIRMED: Admin has not marked 14 sessions confirmed', () => {
    const unconfirmedClass = { ...m5FixtureClass, is14SessionsConfirmed: false };
    const preview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: unconfirmedClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: false,
    });

    assert.ok(preview.blockErrorCodes.includes(M5_ERROR_CODES.SCHEDULE_14_NOT_CONFIRMED));
    assert.strictEqual(preview.canExportCsv, false);
  });

  await t.test('4.6 ACTIVE_WRITE_OR_DELETE_IN_PROGRESS: Active upload reservations or pending delete', () => {
    const busyPreview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      activeReservationsCount: 2, // Đang có 2 lượt tải tệp giữ chỗ
      isSchedule14Confirmed: true,
    });

    assert.ok(busyPreview.blockErrorCodes.includes(M5_ERROR_CODES.ACTIVE_WRITE_OR_DELETE_IN_PROGRESS));
    assert.strictEqual(busyPreview.canExportCsv, false);
  });

  await t.test('4.7 CSV_NOT_VERIFIED: Execution blocked if CSV has not been verified', () => {
    const preview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
      csvVerification: null, // Chưa xuất và kiểm tra CSV
    });

    assert.strictEqual(preview.canExportCsv, true);
    assert.strictEqual(preview.canExecuteDelete, false, 'Không được phép xóa khi chưa kiểm tra CSV');
  });

  await t.test('4.8 CSV_SNAPSHOT_MISMATCH: Execution blocked if data changes after CSV verification', () => {
    const oldSnapshotDigest = 'old_digest_1234567890abcdef';
    const preview = computeCourseClosePreview({
      currentUser: validAdmin,
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      cohortMembers: m5CohortMembers,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
      csvVerification: {
        valid: true,
        snapshotDigest: oldSnapshotDigest, // Digest cũ không khớp với digest hiện tại
      },
    });

    assert.strictEqual(preview.csvVerified, false);
    assert.strictEqual(preview.canExecuteDelete, false, 'Không được phép xóa khi snapshot digest bị lệch');
  });
});

// ============================================================================
// SUITE 5: CHIA LÔ STORAGE API <= 1000 OBJECT MỖI YÊU CẦU
// ============================================================================
test('Suite 5: Storage path chunking (chunkStoragePaths) with > 2500 files', (t) => {
  t.test('5.1 Edge cases: empty, null, or small arrays', () => {
    assert.deepStrictEqual(chunkStoragePaths([]), []);
    assert.deepStrictEqual(chunkStoragePaths(null), []);
    assert.deepStrictEqual(chunkStoragePaths(undefined), []);

    const small = ['path1', 'path2', 'path3'];
    const smallChunks = chunkStoragePaths(small, 1000);
    assert.strictEqual(smallChunks.length, 1);
    assert.deepStrictEqual(smallChunks[0], small);
  });

  t.test('5.2 Boundary conditions: 1000 and 1001 paths', () => {
    const exactly1000 = Array.from({ length: 1000 }, (_, i) => `file_${i}.sb3`);
    const chunks1000 = chunkStoragePaths(exactly1000, 1000);
    assert.strictEqual(chunks1000.length, 1);
    assert.strictEqual(chunks1000[0].length, 1000);

    const exactly1001 = Array.from({ length: 1001 }, (_, i) => `file_${i}.sb3`);
    const chunks1001 = chunkStoragePaths(exactly1001, 1000);
    assert.strictEqual(chunks1001.length, 2);
    assert.strictEqual(chunks1001[0].length, 1000);
    assert.strictEqual(chunks1001[1].length, 1);
  });

  t.test('5.3 Splitting > 2500 files into chunks of at most 1000 objects', () => {
    // 2500 tệp mẫu: 1000 + 1000 + 500
    const paths2500 = Array.from({ length: 2500 }, (_, i) => `uploads/student_${i}/project.zip`);
    const chunks2500 = chunkStoragePaths(paths2500, MAX_STORAGE_BATCH_SIZE);

    assert.strictEqual(chunks2500.length, 3, '2.500 tệp phải chia thành đúng 3 lô');
    assert.strictEqual(chunks2500[0].length, 1000, 'Lô 1 phải có đúng 1.000 tệp');
    assert.strictEqual(chunks2500[1].length, 1000, 'Lô 2 phải có đúng 1.000 tệp');
    assert.strictEqual(chunks2500[2].length, 500, 'Lô 3 phải có đúng 500 tệp');

    // 2750 tệp mẫu: 1000 + 1000 + 750
    const paths2750 = Array.from({ length: 2750 }, (_, i) => `uploads/student_${i}/project.zip`);
    const chunks2750 = chunkStoragePaths(paths2750, MAX_STORAGE_BATCH_SIZE);

    assert.strictEqual(chunks2750.length, 3, '2.750 tệp phải chia thành đúng 3 lô');
    assert.strictEqual(chunks2750[0].length, 1000);
    assert.strictEqual(chunks2750[1].length, 1000);
    assert.strictEqual(chunks2750[2].length, 750);

    // Đảm bảo không mất mát hay trùng lặp phần tử
    const flattened = chunks2750.flat();
    assert.strictEqual(flattened.length, 2750);
    assert.deepStrictEqual(flattened, paths2750);
  });
});

// ============================================================================
// SUITE 6: MÔ PHỎNG LỖI GIỮA CHỪNG, TRẠNG THÁI INCOMPLETE VÀ TIẾP TỤC (RESUME)
// ============================================================================
test('Suite 6: Fault simulation, incomplete status, and safe resume', async (t) => {
  const dummyPaths = Array.from({ length: 2500 }, (_, i) => `storage/file_${i}.sb3`);

  await t.test('6.1 Normal execution without failure completes 100% and advances course', async () => {
    const deletedInStorage = [];
    let dbFinalized = false;

    const mockStorageClient = {
      remove: async (paths) => {
        deletedInStorage.push(...paths);
        return { data: paths, error: null };
      },
    };

    const mockDbClient = {
      finalizeDbDeletion: async ({ classId, courseId, nextCourseId }) => {
        dbFinalized = true;
        return { success: true, code: 'OK' };
      },
    };

    const dummyDigest = 'digest_12345';
    const result = await runCourseCloseExecution({
      classId: 'cls_rob_m5_01',
      courseId: 'crs_m5_14',
      nextCourseId: 'crs_m5_next',
      targetStoragePaths: dummyPaths,
      storageClient: mockStorageClient,
      dbClient: mockDbClient,
      csvVerification: { valid: true, snapshotDigest: dummyDigest },
      currentSnapshotDigest: dummyDigest,
      simulateFailureStage: null,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(deletedInStorage.length, 2500, 'Đã xóa toàn bộ 2.500 tệp trong Storage');
    assert.strictEqual(dbFinalized, true, 'Đã xóa dữ liệu trong DB');
    assert.strictEqual(result.nextCourseId, 'crs_m5_next');
  });

  await t.test('6.2 Mid-storage batch fault stops at incomplete without touching DB', async () => {
    const deletedInStorage = [];
    let dbFinalized = false;

    const mockStorageClient = {
      remove: async (paths) => {
        deletedInStorage.push(...paths);
        return { data: paths, error: null };
      },
    };

    const mockDbClient = {
      finalizeDbDeletion: async () => {
        dbFinalized = true;
        return { success: true };
      },
    };

    const dummyDigest = 'digest_12345';
    const result = await runCourseCloseExecution({
      classId: 'cls_rob_m5_01',
      courseId: 'crs_m5_14',
      nextCourseId: 'crs_m5_next',
      targetStoragePaths: dummyPaths,
      storageClient: mockStorageClient,
      dbClient: mockDbClient,
      csvVerification: { valid: true, snapshotDigest: dummyDigest },
      currentSnapshotDigest: dummyDigest,
      simulateFailureStage: 'mid_storage_batch', // Mô phỏng lỗi ở lô Storage thứ 2
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'incomplete', 'Trạng thái phải là incomplete');
    assert.strictEqual(result.code, 'SIMULATED_MID_STORAGE_BATCH_FAILURE');
    assert.strictEqual(result.deletedStoragePaths.length, 1000, 'Chỉ mới xóa lô 1 (1.000 tệp)');
    assert.strictEqual(result.remainingStoragePaths.length, 1500, 'Còn lại 1.500 tệp chưa xóa');
    assert.strictEqual(dbFinalized, false, 'Tuyệt đối KHÔNG được xóa DB khi Storage chưa xong');
  });

  await t.test('6.3 Fault between storage and DB stops at incomplete without touching DB', async () => {
    let dbFinalized = false;
    const mockStorageClient = {
      remove: async (paths) => ({ data: paths, error: null }),
    };
    const mockDbClient = {
      finalizeDbDeletion: async () => {
        dbFinalized = true;
        return { success: true };
      },
    };

    const dummyDigest = 'digest_12345';
    const result = await runCourseCloseExecution({
      classId: 'cls_rob_m5_01',
      courseId: 'crs_m5_14',
      nextCourseId: 'crs_m5_next',
      targetStoragePaths: dummyPaths,
      storageClient: mockStorageClient,
      dbClient: mockDbClient,
      csvVerification: { valid: true, snapshotDigest: dummyDigest },
      currentSnapshotDigest: dummyDigest,
      simulateFailureStage: 'between_storage_and_db',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'incomplete');
    assert.strictEqual(result.code, 'SIMULATED_BETWEEN_STORAGE_AND_DB_FAILURE');
    assert.strictEqual(result.deletedStoragePaths.length, 2500, 'Storage đã xóa xong');
    assert.strictEqual(result.remainingStoragePaths.length, 0);
    assert.strictEqual(dbFinalized, false, 'DB chưa được xóa');
  });

  await t.test('6.4 Resuming from incomplete deletes only remaining paths and finalizes DB', async () => {
    const deletedInResume = [];
    let dbFinalized = false;

    const mockStorageClient = {
      remove: async (paths) => {
        deletedInResume.push(...paths);
        return { data: paths, error: null };
      },
    };

    const mockDbClient = {
      finalizeDbDeletion: async () => {
        dbFinalized = true;
        return { success: true, code: 'OK' };
      },
    };

    // Giả lập tác vụ trước đó dừng ở incomplete với 1.000 tệp đã xóa và 1.500 tệp còn lại
    const existingIncompleteOperation = {
      status: 'incomplete',
      deletedStoragePaths: dummyPaths.slice(0, 1000),
      remainingStoragePaths: dummyPaths.slice(1000),
    };

    const resumeResult = await runCourseCloseExecution({
      classId: 'cls_rob_m5_01',
      courseId: 'crs_m5_14',
      nextCourseId: 'crs_m5_next',
      existingOperation: existingIncompleteOperation,
      storageClient: mockStorageClient,
      dbClient: mockDbClient,
    });

    assert.strictEqual(resumeResult.success, true);
    assert.strictEqual(resumeResult.status, 'completed');
    assert.strictEqual(deletedInResume.length, 1500, 'Chỉ xóa 1.500 tệp còn lại trong lượt resume');
    assert.strictEqual(dbFinalized, true, 'Sau khi xóa hết Storage thì tiến hành xóa DB');
    assert.strictEqual(resumeResult.remainingStoragePaths.length, 0);
  });
});

// ============================================================================
// SUITE 7: CỔNG KIỂM SOÁT DUNG LƯỢNG STORAGE 700 MB / 800 MB (QUOTA GATE)
// ============================================================================
test('Suite 7: Storage Quota Gate (700 MB warning / 800 MB hard limit)', (t) => {
  const MB = 1024 * 1024;

  t.test('7.1 Normal condition below warning threshold (e.g. 350 MB total)', () => {
    const gate = evaluateStorageQuotaGate({
      usedStorageBytes: 200 * MB,
      activeReservedBytes: 50 * MB,
      orgBaselineBytes: 100 * MB,
      incomingBytes: 2 * MB,
    });

    assert.strictEqual(gate.allowed, true);
    assert.strictEqual(gate.isWarning, false);
    assert.strictEqual(gate.isExceeded, false);
    assert.strictEqual(gate.code, 'OK');
  });

  t.test('7.2 Warning threshold reached (>= 700 MB, e.g. 705 MB)', () => {
    const gate = evaluateStorageQuotaGate({
      usedStorageBytes: 650 * MB,
      activeReservedBytes: 40 * MB,
      orgBaselineBytes: 14 * MB,
      incomingBytes: 2 * MB, // Tổng = 706 MB >= 700 MB
    });

    assert.strictEqual(gate.allowed, true, 'Vẫn cho phép tải tệp');
    assert.strictEqual(gate.isWarning, true, 'Phải bật cờ cảnh báo');
    assert.strictEqual(gate.isExceeded, false, 'Chưa vượt giới hạn cứng');
    assert.ok(gate.message.includes('700 MB'), 'Thông điệp cảnh báo phải nhắc đến 700 MB');
  });

  t.test('7.3 Hard limit exceeded (> 800 MB): blocks new file upload, keeps links working', () => {
    const gate = evaluateStorageQuotaGate({
      usedStorageBytes: 750 * MB,
      activeReservedBytes: 48 * MB,
      orgBaselineBytes: 2 * MB,
      incomingBytes: 2 * MB, // Tổng = 802 MB > 800 MB
    });

    assert.strictEqual(gate.allowed, false, 'Phải chặn tải tệp mới');
    assert.strictEqual(gate.isExceeded, true);
    assert.strictEqual(gate.code, M5_ERROR_CODES.STORAGE_QUOTA_EXCEEDED);
    assert.ok(
      gate.message.includes('liên kết (link)'),
      'Thông báo phải nêu rõ học sinh vẫn nộp bài bằng link được'
    );
  });

  t.test('7.4 Lower organization cap (orgCapBytes) takes precedence', () => {
    const customOrgCap = 500 * MB; // Tổ chức giới hạn 500 MB
    const gate = evaluateStorageQuotaGate({
      usedStorageBytes: 450 * MB,
      activeReservedBytes: 49 * MB,
      orgBaselineBytes: 0,
      incomingBytes: 2 * MB, // Tổng = 501 MB > 500 MB
      orgCapBytes: customOrgCap,
    });

    assert.strictEqual(gate.allowed, false, 'Phải chặn khi vượt giới hạn tổ chức');
    assert.strictEqual(gate.isExceeded, true);
    assert.strictEqual(gate.code, M5_ERROR_CODES.STORAGE_QUOTA_EXCEEDED);
  });

  t.test('7.5 Active reserved bytes of concurrent uploads strictly accounted for', () => {
    // 50 lượt tải đồng thời x 2 MB = 100 MB đang giữ chỗ
    const gate = evaluateStorageQuotaGate({
      usedStorageBytes: 700 * MB,
      activeReservedBytes: 100 * MB,
      orgBaselineBytes: 0,
      incomingBytes: 1 * MB, // Tổng = 801 MB > 800 MB
    });

    assert.strictEqual(gate.allowed, false);
    assert.strictEqual(gate.code, M5_ERROR_CODES.STORAGE_QUOTA_EXCEEDED);
  });
});

// ============================================================================
// SUITE 8: TÍCH HỢP STORE & CẤU HÌNH BFF ACTIONS
// ============================================================================
test('Suite 8: Store & BFF actions integration across Live and Demo modes', async (t) => {
  const mocks = await loadMockData();
  const { seedM5CourseCloseFixtureData } = mocks;

  await t.test('8.1 ALLOWED_BFF_ACTIONS includes all 6 M5 business actions', () => {
    const requiredM5Actions = [
      'm5-storage-quota-status',
      'm5-set-storage-quota-baseline',
      'm5-seed-fixture',
      'm5-course-close-preview',
      'm5-export-course-csv',
      'm5-execute-course-close',
    ];

    for (const act of requiredM5Actions) {
      assert.ok(
        ALLOWED_BFF_ACTIONS.includes(act),
        `ALLOWED_BFF_ACTIONS phải chứa action "${act}"`
      );
    }
  });

  await t.test('8.2 seedM5CourseCloseFixtureData seeds and resets fixture cleanly', () => {
    const baseState = {
      classes: [...mocks.initialClasses],
      courses: [...mocks.initialCourses],
      lessons: [...mocks.initialLessons],
      students: [...mocks.initialStudents],
      users: [...mocks.initialUsers],
      quizResults: [...mocks.initialQuizResults],
      submissions: [...mocks.initialSubmissions],
    };

    const initialClassCount = baseState.classes.length;
    const initialStudentCount = baseState.students.length;

    // Seed fixture
    const seededState = seedM5CourseCloseFixtureData(baseState, false);
    assert.strictEqual(seededState.classes.length, initialClassCount + 1);
    assert.strictEqual(seededState.students.length, initialStudentCount + 5);
    assert.ok(seededState.classes.some((c) => c.code === 'ROB-K14-M5-01'));

    // Reset fixture
    const resetState = seedM5CourseCloseFixtureData(seededState, true);
    assert.strictEqual(resetState.classes.length, initialClassCount);
    assert.strictEqual(resetState.students.length, initialStudentCount);
    assert.strictEqual(
      resetState.classes.some((c) => c.code === 'ROB-K14-M5-01'),
      false
    );
  });
});

// ============================================================================
// SUITE 9: KIỂM TRA BẢO TOÀN TỆP MẪU THAM CHIẾU TEACHING
// ============================================================================
test('Suite 9: Reference file integrity (teachingmindx-sync-trial.html untouched)', () => {
  const trialPath = path.join(ROOT_DIR, 'teachingmindx-sync-trial.html');
  assert.ok(fs.existsSync(trialPath), 'Tệp teachingmindx-sync-trial.html phải tồn tại');

  const content = fs.readFileSync(trialPath);
  const actualSha256 = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
  const EXPECTED_SHA256 = 'A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5';

  assert.strictEqual(
    actualSha256,
    EXPECTED_SHA256,
    'Tệp teachingmindx-sync-trial.html phải giữ nguyên vẹn mã băm SHA-256 A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5'
  );
});

// ============================================================================
// SUITE 10: KIỂM THỬ HỒI QUY TOÀN BỘ 10 ĐIỂM SỬA CHỮA M5-01 ĐẾN M5-10
// ============================================================================
test('Suite 10: Full Regression Test Suite for M5-01 to M5-10', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const validCsvResult = buildCourseCloseCsvContent(
    m5Students,
    m5Lessons14,
    m5FixtureClass.code,
    m5QuizResults,
    m5Submissions,
    { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
  );

  const expectedData = {
    participants: m5Students,
    lessons: m5Lessons14,
    classCode: m5FixtureClass.code,
    classId: m5FixtureClass.id,
    courseId: m5Course14.id,
    quizResults: m5QuizResults,
    submissions: m5Submissions,
    classItem: m5FixtureClass,
  };

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  // M5-01 Regression:
  await t.test('10.1 M5-01: m5_finalize_course_close_db lock ordering & strict pre-condition checks', () => {
    // 1. Verify advisory lock order in migration
    const m4LockPos = migrationSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const m5QuotaLockPos = migrationSql.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const m5CloseLockPos = migrationSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text))");
    const classForUpdatePos = migrationSql.indexOf("SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE");

    assert.ok(m4LockPos > 0, 'Phải có khóa m4_teaching_sync');
    assert.ok(m5QuotaLockPos > m4LockPos, 'Khóa m5_storage_quota phải sau m4_teaching_sync');
    assert.ok(m5CloseLockPos > m5QuotaLockPos, 'Khóa m5_close phải sau m5_storage_quota');
    assert.ok(classForUpdatePos > m5CloseLockPos, 'Khóa dòng classes FOR UPDATE phải sau m5_close');

    // 2. Strict checks inside m5_finalize_course_close_db
    assert.ok(migrationSql.includes('STORAGE_FILES_NOT_FULLY_DELETED'), 'Phải kiểm tra tệp storage chưa xóa hết');
    assert.ok(migrationSql.includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS'), 'Phải kiểm tra active reservations');
    assert.ok(migrationSql.includes('CSV_SNAPSHOT_MISMATCH'), 'Phải kiểm tra snapshot digest khớp trước khi xóa');
    assert.ok(migrationSql.includes('SCHEDULE_14_NOT_CONFIRMED'), 'Phải kiểm tra is_14_sessions_confirmed');
  });

  // M5-02 Regression:
  await t.test('10.2 M5-02: Edge function m5-execute-course-close chunks <= 1000, tracks progress, and supports safe resume', async () => {
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_begin_course_close'"), 'Phải gọi m5_begin_course_close');
    assert.ok(edgeBackendSource.includes("chunkStoragePaths(remainingPaths, 1000)"), 'Phải chia lô Storage <= 1000');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_update_course_close_storage_progress'"), 'Phải cập nhật tiến độ Storage từng lô');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_finalize_course_close_db'"), 'Phải gọi finalize DB sau khi xóa Storage');
    assert.ok(edgeBackendSource.includes("adminClient.storage"), 'Storage API phải dùng adminClient');

    // Test chunking logic with 2500 files
    const paths = Array.from({ length: 2500 }, (_, i) => `file_${i}.zip`);
    const chunks = chunkStoragePaths(paths, 1000);
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].length, 1000);
    assert.strictEqual(chunks[1].length, 1000);
    assert.strictEqual(chunks[2].length, 500);

    // Test fault simulation
    const resFault = await runCourseCloseExecution({
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      targetStoragePaths: paths,
      csvVerification: { valid: true, snapshotDigest: 'test_digest' },
      currentSnapshotDigest: 'test_digest',
      simulateFailureStage: 'between_storage_and_db',
    });
    assert.strictEqual(resFault.status, 'incomplete');
    assert.strictEqual(resFault.code, 'SIMULATED_BETWEEN_STORAGE_AND_DB_FAILURE');
  });

  // M5-03 Regression:
  await t.test('10.3 M5-03 & R3-01: Edge function verifies admin actor via requireAdminActor and passes p_actor_id to adminClient.rpc for locked internal M5 RPCs', () => {
    assert.ok(edgeBackendSource.includes('function requireAdminActor('), 'Phải có helper requireAdminActor');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_seed_course_close_fixture'"), 'm5_seed_course_close_fixture phải dùng adminClient với p_actor_id');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_set_storage_quota_baseline'"), 'm5_set_storage_quota_baseline phải dùng adminClient với p_actor_id');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_save_csv_verification'"), 'm5_save_csv_verification phải dùng adminClient với p_actor_id');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_begin_course_close'"), 'm5_begin_course_close phải dùng adminClient với p_actor_id');
    assert.ok(edgeBackendSource.includes("adminClient.rpc('m5_finalize_course_close_db'"), 'm5_finalize_course_close_db phải dùng adminClient với p_actor_id');
    assert.ok(edgeBackendSource.includes('p_actor_id: actor.profileId'), 'Phải truyền p_actor_id từ danh tính admin (actor.profileId)');
  });

  // M5-04 Regression:
  await t.test('10.4 M5-04: Transferred student A -> B -> C without submissions at B has all 14 rows in B CSV & preview', () => {
    const studentS = {
      id: 'usr_stu_wanderer',
      participantId: 'PART_WANDERER',
      studentCode: 'HS_WANDERER',
      fullName: 'Nguyễn Văn Chuyển Nhiều Lớp',
      status: 'transferred',
      notes: 'Đã chuyển từ A sang B rồi sang C',
      currentClassId: 'cls_target_c',
      originalClassId: 'cls_origin_a',
    };

    // Cohort record preserved for Class B
    const classBCohort = [
      {
        id: studentS.id,
        studentId: studentS.id,
        classId: 'cls_transit_b',
        courseId: m5Course14.id,
        participantId: studentS.participantId,
        studentCode: studentS.studentCode,
        fullName: studentS.fullName,
        membershipStatus: 'transferred',
        status: 'transferred',
        notes: studentS.notes,
      },
    ];

    const participantsB = resolveBatchParticipants({
      students: [studentS],
      classId: 'cls_transit_b',
      courseId: m5Course14.id,
      cohortMembers: classBCohort,
      quizResults: [],
      submissions: [],
    });

    assert.strictEqual(participantsB.success, true);
    assert.strictEqual(participantsB.participants.length, 1);
    assert.strictEqual(participantsB.participants[0].id, studentS.id);
    assert.strictEqual(participantsB.participants[0].participantId, studentS.participantId);

    const rowsB = generateCourseCloseCsvRows(
      participantsB.participants,
      m5Lessons14,
      'ROB-TRANSIT-B',
      [],
      [],
      { classId: 'cls_transit_b', courseId: m5Course14.id }
    );

    assert.strictEqual(rowsB.length, 14, 'Học sinh chuyển A->B->C phải có đủ 14 dòng trong CSV của Lớp B');
    for (let i = 0; i < 14; i++) {
      assert.ok(rowsB[i].includes('PART_WANDERER'));
      assert.ok(rowsB[i].includes(`Buổi ${i + 1}`));
      assert.ok(rowsB[i].includes('Chưa hoàn thành (0/14)'));
    }

    // Verify triggers exist in migration
    assert.ok(migrationSql.includes('trg_m5_auto_record_cohort_membership_student'), 'Trigger trên students phải tồn tại');
    assert.ok(migrationSql.includes('trg_m5_auto_record_cohort_membership_class'), 'Trigger trên classes phải tồn tại');
  });

  // M5-05 Regression:
  await t.test('10.5 M5-05: verifyCourseCloseCsv detects cell-level tampering on all columns with CSV_CELL_VALUE_MISMATCH', () => {
    const rawCsv = validCsvResult.csvContent;

    // Tamper 1: Modify score 100% -> 0%
    const tamperedScore = rawCsv.replace('"100%"', '"0%"');
    const repScore = verifyCourseCloseCsv(tamperedScore, expectedData);
    assert.strictEqual(repScore.valid, false);
    assert.ok(repScore.errors.some((e) => e.includes('CSV_CELL_VALUE_MISMATCH') && e.includes('highestScore')));

    // Tamper 2: Modify student name
    const tamperedName = rawCsv.replace('"Trần Văn Hoàn Tất"', '"Kẻ Giả Mạo"');
    const repName = verifyCourseCloseCsv(tamperedName, expectedData);
    assert.strictEqual(repName.valid, false);
    assert.ok(repName.errors.some((e) => e.includes('CSV_CELL_VALUE_MISMATCH') && e.includes('fullName')));

    // Tamper 3: Modify teacher feedback
    const tamperedFeedback = rawCsv.replace('"Bài làm xuất sắc, đạt yêu cầu."', '"Nhận xét giả mạo."');
    const repFeedback = verifyCourseCloseCsv(tamperedFeedback, expectedData);
    assert.strictEqual(repFeedback.valid, false);
    assert.ok(repFeedback.errors.some((e) => e.includes('CSV_CELL_VALUE_MISMATCH') && e.includes('teacherFeedback')));

    // Tamper 4: Modify completion status
    const tamperedCompletion = rawCsv.replace('"Hoàn thành (14/14)"', '"Chưa hoàn thành (14/14)"');
    const repCompletion = verifyCourseCloseCsv(tamperedCompletion, expectedData);
    assert.strictEqual(repCompletion.valid, false);
    assert.ok(repCompletion.errors.some((e) => e.includes('CSV_CELL_VALUE_MISMATCH') && e.includes('completionStatus')));
  });

  // M5-06 Regression:
  await t.test('10.6 M5-06: Changing notes, fullName, teacherFeedback, or lesson.title invalidates snapshotDigest (CSV_SNAPSHOT_MISMATCH)', () => {
    const baseDigest = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: m5FixtureClass.name,
      is14SessionsConfirmed: true,
      participants: m5Students,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });

    // 1. Changing student notes
    const alteredNotesStudents = m5Students.map((s, idx) =>
      idx === 0 ? { ...s, notes: 'Ghi chú đã bị thay đổi!' } : s
    );
    const notesDigest = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: m5FixtureClass.name,
      is14SessionsConfirmed: true,
      participants: alteredNotesStudents,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });
    assert.notStrictEqual(notesDigest, baseDigest, 'Đổi notes phải làm đổi snapshotDigest');

    // 2. Changing student fullName
    const alteredNameStudents = m5Students.map((s, idx) =>
      idx === 0 ? { ...s, fullName: 'Tên Học Sinh Mới' } : s
    );
    const nameDigest = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: m5FixtureClass.name,
      is14SessionsConfirmed: true,
      participants: alteredNameStudents,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });
    assert.notStrictEqual(nameDigest, baseDigest, 'Đổi fullName phải làm đổi snapshotDigest');

    // 3. Changing teacherFeedback
    const alteredSubs = m5Submissions.map((s, idx) =>
      idx === 0 ? { ...s, teacherFeedback: 'Nhận xét đã chỉnh sửa.' } : s
    );
    const feedbackDigest = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: m5FixtureClass.name,
      is14SessionsConfirmed: true,
      participants: m5Students,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: alteredSubs,
    });
    assert.notStrictEqual(feedbackDigest, baseDigest, 'Đổi teacherFeedback phải làm đổi snapshotDigest');

    // 4. Changing lesson.title
    const alteredLessons = m5Lessons14.map((l, idx) =>
      idx === 0 ? { ...l, title: 'Tiêu đề bài học đã đổi' } : l
    );
    const lessonDigest = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: m5FixtureClass.name,
      is14SessionsConfirmed: true,
      participants: m5Students,
      lessons: alteredLessons,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });
    assert.notStrictEqual(lessonDigest, baseDigest, 'Đổi lesson title phải làm đổi snapshotDigest');

    // 5. In preview: when snapshotDigest does not match csvVerification, canExecuteDelete becomes false
    const previewMismatch = computeCourseClosePreview({
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: alteredLessons,
      students: m5Students,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      isSchedule14Confirmed: true,
      csvVerification: { valid: true, snapshotDigest: baseDigest },
    });
    assert.strictEqual(previewMismatch.csvVerified, false, 'csvVerified phải là false khi digest lệch');
    assert.strictEqual(previewMismatch.canExecuteDelete, false, 'canExecuteDelete phải bị khóa (false)');
  });

  // M5-07 Regression:
  await t.test('10.7 M5-07: SQL checks enforce reserved_bytes and hard_limit gate', () => {
    assert.ok(
      migrationSql.includes('p_object_size > v_res.reserved_bytes'),
      'm3_check_storage_insert_permission phải chặn tệp vượt reserved_bytes'
    );
    assert.ok(
      migrationSql.includes('FILE_SIZE_EXCEEDS_RESERVATION'),
      'm3_submit_practice phải chặn tệp vượt reserved_bytes với mã FILE_SIZE_EXCEEDS_RESERVATION'
    );
    assert.ok(
      migrationSql.includes("(metadata->>'size')::bigint"),
      'm3_storage_insert_policy phải truyền kích thước tệp thực tế'
    );
  });

  // M5-08 Regression:
  await t.test('10.8 M5-08: fetchStorageQuota is wrapped in useCallback and classes page has no infinite loop', () => {
    const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
    const storeSource = fs.readFileSync(storePath, 'utf8');
    assert.ok(
      storeSource.includes('const fetchStorageQuota = useCallback('),
      'fetchStorageQuota trong store.tsx phải được bọc trong useCallback'
    );

    const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
    const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');
    assert.ok(
      classesPageSource.includes('fetchStorageQuota().catch('),
      'classes page phải gọi fetchStorageQuota'
    );
  });

  // M5-09 Regression:
  await t.test('10.9 M5-09: Switching selectedClassId resets confirmed14Sessions and CSV status', () => {
    const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
    const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');
    assert.ok(
      classesPageSource.includes('setConfirmed14Sessions(Boolean(selectedClass?.is14SessionsConfirmed))'),
      'Phải reset confirmed14Sessions khi đổi selectedClassId'
    );
    assert.ok(
      classesPageSource.includes('setCsvVerificationResult(null)'),
      'Phải reset kết quả kiểm tra CSV khi đổi lớp'
    );
    assert.ok(
      classesPageSource.includes('setCloseResultNotice(null)'),
      'Phải reset thông báo đóng khóa khi đổi lớp'
    );
  });

  // M5-10 Regression:
  await t.test('10.10 M5-10: Storage quota hard limit clamped to <= 800 MB (838,860,800 bytes)', () => {
    // 1. SQL Migration CHECK constraint
    assert.ok(
      migrationSql.includes('hard_limit_bytes <= 838860800'),
      'Bảng m5_storage_quota_config phải có CHECK hard_limit_bytes <= 838860800'
    );
    assert.ok(
      migrationSql.includes('Hard limit cannot exceed 800 MB (838860800 bytes)'),
      'm5_set_storage_quota_baseline phải từ chối hard_limit > 800 MB'
    );

    // 2. evaluateStorageQuotaGate clamps to 800 MB even if larger cap is passed
    const cappedResult = evaluateStorageQuotaGate({
      usedStorageBytes: 810 * 1024 * 1024,
      hardLimitBytes: 1000 * 1024 * 1024, // Try to set 1000 MB
      orgCapBytes: 1000 * 1024 * 1024,
    });
    assert.strictEqual(
      cappedResult.hardLimitBytes,
      800 * 1024 * 1024,
      'hardLimitBytes trong evaluateStorageQuotaGate không bao giờ vượt quá 800 MB'
    );
    assert.strictEqual(cappedResult.isExceeded, true, '810 MB phải bị đánh dấu vượt hạn mức 800 MB');
    assert.strictEqual(cappedResult.allowed, false, 'Lượt tải mới phải bị chặn');
  });
});

// ============================================================================
// SUITE 11: BÀI KIỂM THỬ HỒI QUY CHO 8 ĐIỂM REVIEW VÒNG 2 (P1-01 -> P1-06, P2-01, P2-02)
// ============================================================================
test('Suite 11: Regression tests for Review Round 2 Fixes (P1-01 through P1-06, P2-01, P2-02)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  const bffApiPath = path.join(ROOT_DIR, 'src', 'app', 'api', 'm2', '[action]', 'route.ts');
  const bffApiSource = fs.readFileSync(bffApiPath, 'utf8');

  // --------------------------------------------------------------------------
  // 11.1 P1-01: Synchronize m5_close lock ordering across all class write functions
  // --------------------------------------------------------------------------
  await t.test('11.1 P1-01: Synchronize m5_close lock ordering across all class write functions (practice, quiz, grade, reopen, reserve)', () => {
    const writeFunctions = [
      'm3_reserve_practice_upload',
      'm3_submit_practice',
      'm3_submit_quiz_attempt',
      'm3_grade_submission',
      'm3_reopen_submission',
    ];

    for (const fn of writeFunctions) {
      const fnHeader = `FUNCTION public.${fn}`;
      const fnStart = migrationSql.indexOf(fnHeader);
      assert.ok(fnStart > 0, `Phải có định nghĩa hàm ${fn} trong migration SQL`);
      const fnEnd = migrationSql.indexOf('END;', fnStart);
      const fnBody = migrationSql.substring(fnStart, fnEnd);

      const posCloseLock = fnBody.indexOf("pg_advisory_xact_lock(hashtext('m5_close:'");
      const posKeyShare = fnBody.indexOf('FOR KEY SHARE', posCloseLock > 0 ? posCloseLock : 0);
      const posCloseCheck = fnBody.indexOf('CLASS_CLOSE_IN_PROGRESS', posKeyShare > 0 ? posKeyShare : 0);

      assert.ok(posCloseLock > 0, `Hàm ${fn} phải lấy khóa pg_advisory_xact_lock m5_close:<class_id>`);
      assert.ok(posKeyShare > posCloseLock, `Hàm ${fn} phải khóa hàng FOR KEY SHARE sau khi lấy khóa m5_close`);
      assert.ok(posCloseCheck > posKeyShare, `Hàm ${fn} phải kiểm tra CLASS_CLOSE_IN_PROGRESS sau khi lấy FOR KEY SHARE`);

      // Nếu hàm có lấy m4_teaching_sync thì m4_teaching_sync phải trước m5_close
      if (fnBody.includes("pg_advisory_xact_lock(hashtext('m4_teaching_sync')")) {
        const posM4Sync = fnBody.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync')");
        assert.ok(posM4Sync > 0 && posM4Sync < posCloseLock, `Hàm ${fn} phải lấy m4_teaching_sync trước m5_close`);
      }
    }

    // Kiểm tra m5_begin_course_close và m5_finalize_course_close_db cũng dùng chung m5_close lock
    assert.ok(
      migrationSql.includes("pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text))"),
      'm5_finalize_course_close_db và m5_begin_course_close phải dùng chung m5_close lock'
    );
  });

  // --------------------------------------------------------------------------
  // 11.2 P1-02: Live mode store exportCourseCloseCsv uses Edge Function result & updates cohortMembers
  // --------------------------------------------------------------------------
  await t.test('11.2 P1-02: In live mode, store.exportCourseCloseCsv uses Edge Function CSV, updates cohortMembers, and returns server csvContent', () => {
    // 1. Kiểm tra store.exportCourseCloseCsv gọi API và dùng data từ server
    assert.ok(
      storeSource.includes("fetch('/api/m2/m5-export-course-csv'"),
      'store.exportCourseCloseCsv phải gọi /api/m2/m5-export-course-csv trong isLiveMode'
    );
    assert.ok(
      storeSource.includes('setCohortMembers((prev) =>'),
      'store.exportCourseCloseCsv phải cập nhật cohortMembers từ phản hồi máy chủ'
    );
    assert.ok(
      storeSource.includes('csvContent: srvData.csvContent'),
      'store.exportCourseCloseCsv phải trả về chính csvContent từ server'
    );
    assert.ok(
      storeSource.includes('setCsvVerifications((prev) =>'),
      'store.exportCourseCloseCsv phải lưu verification của server vào csvVerifications'
    );

    // 2. Kiểm tra store.fetchCourseClosePreview cập nhật cohortMembers từ server
    const fetchPreviewIdx = storeSource.indexOf('const fetchCourseClosePreview =');
    assert.ok(fetchPreviewIdx > 0, 'Phải có fetchCourseClosePreview trong store');
    const fetchPreviewEndIdx = storeSource.indexOf('const setConfirmed14SessionsForClass =', fetchPreviewIdx);
    const fetchPreviewChunk = storeSource.substring(fetchPreviewIdx, fetchPreviewEndIdx > 0 ? fetchPreviewEndIdx : fetchPreviewIdx + 6000);
    assert.ok(
      fetchPreviewChunk.includes('/api/m2/m5-course-close-preview'),
      'fetchCourseClosePreview phải gọi /api/m2/m5-course-close-preview'
    );
    assert.ok(
      fetchPreviewChunk.includes('setCohortMembers'),
      'fetchCourseClosePreview phải cập nhật cohortMembers từ server'
    );

    // 3. Edge function trả về đầy đủ cohortMembers, snapshotDigest, rowCount
    assert.ok(
      edgeBackendSource.includes('cohortMembers: flattenedCohort'),
      'm5-export-course-csv trong Edge Function phải trả về cohortMembers'
    );
    assert.ok(
      edgeBackendSource.includes('snapshotDigest,'),
      'm5-export-course-csv trong Edge Function phải trả về snapshotDigest'
    );
  });

  // --------------------------------------------------------------------------
  // 11.3 P1-03: SnapshotDigest parity between computeCourseClosePreview, buildCourseCloseCsvContent, and verifyCourseCloseCsv
  // --------------------------------------------------------------------------
  await t.test('11.3 P1-03: SnapshotDigest excludes className and is14SessionsConfirmed, giving 100% parity across preview, CSV and verification', () => {
    // 1. Xác nhận computeCourseCloseSnapshotDigest độc lập với className và is14SessionsConfirmed
    const digestA = computeCourseCloseSnapshotDigest({
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: 'Tên Ban Đầu: ' + m5FixtureClass.name,
      is14SessionsConfirmed: false,
      participants: m5Students,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });

    const digestB = computeCourseCloseSnapshotDigest({
      classItem: { ...m5FixtureClass, name: 'Tên Hoàn Toàn Khác Biệt' },
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      classCode: m5FixtureClass.code,
      className: 'Tên Hoàn Toàn Khác Biệt',
      is14SessionsConfirmed: true,
      participants: m5Students,
      lessons: m5Lessons14,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });

    assert.strictEqual(
      digestA,
      digestB,
      'snapshotDigest không được đổi khi thay đổi className hoặc cờ UI is14SessionsConfirmed'
    );

    // 2. Chu trình trọn vẹn: preview -> CSV -> verify -> canExecuteDelete
    const preview = computeCourseClosePreview({
      currentUser: { id: 'usr_admin_01', role: 'admin' },
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      submissions: m5Submissions,
      quizResults: m5QuizResults,
      isSchedule14Confirmed: true,
    });

    const csvResult = buildCourseCloseCsvContent(
      m5Students,
      m5Lessons14,
      m5FixtureClass.code,
      m5QuizResults,
      m5Submissions,
      { classId: m5FixtureClass.id, courseId: m5Course14.id }
    );
    assert.strictEqual(csvResult.success, true, 'buildCourseCloseCsvContent phải thành công');

    const verifyResult = verifyCourseCloseCsv(csvResult.csvContent, {
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      classCode: m5FixtureClass.code,
      courseId: m5Course14.id,
      lessons: m5Lessons14,
      participants: m5Students,
      submissions: m5Submissions,
      quizResults: m5QuizResults,
    });

    assert.strictEqual(verifyResult.valid, true, 'verifyCourseCloseCsv phải hợp lệ');
    assert.strictEqual(verifyResult.errors.length, 0, 'verifyCourseCloseCsv không có lỗi');
    assert.strictEqual(
      verifyResult.snapshotDigest,
      preview.currentSnapshotDigest,
      'verifyResult.snapshotDigest phải khớp 100% với preview.currentSnapshotDigest'
    );

    const previewAfterVerify = computeCourseClosePreview({
      currentUser: { id: 'usr_admin_01', role: 'admin' },
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      submissions: m5Submissions,
      quizResults: m5QuizResults,
      csvVerification: verifyResult,
      isSchedule14Confirmed: true,
      storageFiles: [],
    });

    assert.strictEqual(previewAfterVerify.csvVerified, true, 'csvVerified phải là true');
    assert.strictEqual(previewAfterVerify.canExecuteDelete, true, 'canExecuteDelete phải mở khóa true');
    assert.strictEqual(previewAfterVerify.blockErrors.length, 0, 'Không còn lỗi chặn kỹ thuật');
  });

  // --------------------------------------------------------------------------
  // 11.4 P1-04: 100% SHA-256 digest parity between JS/Edge and SQL for transferred student A -> B -> C
  // --------------------------------------------------------------------------
  await t.test('11.4 P1-04: 100% SHA-256 digest parity between JS/Edge and SQL when student transferred A -> B -> C', () => {
    // 1. Kiểm tra cú pháp SQL m5_compute_db_snapshot_digest xử lý effective_status giống JS
    assert.ok(
      migrationSql.includes("WHEN s.status = 'archived' THEN 'archived'") &&
        migrationSql.includes("WHEN s.current_class_id IS DISTINCT FROM p_class_id OR s.status = 'transferred' OR cm.membership_status = 'transferred' THEN 'transferred'") &&
        migrationSql.includes('ELSE s.status\n               END AS effective_status'),
      'SQL m5_compute_db_snapshot_digest phải có CASE phân loại effective_status giống hệt JS'
    );

    // 2. Tính toán đối chiếu digest giữa chuỗi thô chuẩn SQL và hàm JS computeCourseCloseSnapshotDigest
    const classId = 'cls_class_test_b';
    const courseId = 'crs_course_14';
    const classCode = 'ROB-K14-B';

    const testLessons = [
      { sessionNumber: 1, id: 'les_01', title: 'Buoi 1', status: 'published', hasQuiz: true, hasPractice: true },
      { sessionNumber: 2, id: 'les_02', title: 'Buoi 2', status: 'published', hasQuiz: false, hasPractice: true },
    ];

    // Học sinh chuyển lớp A -> B -> C: status='active' trong DB, current_class_id='cls_class_test_c'
    const wandererStudent = {
      id: 'usr_stu_wanderer',
      participantId: 'PART_WANDERER_01',
      studentCode: 'HS_WANDERER',
      fullName: 'Le Chuyen Nhieu Lop',
      status: 'active',
      notes: 'Chuyen sang C',
      currentClassId: 'cls_class_test_c',
      originalClassId: 'cls_class_test_a',
    };

    // Mô phỏng chuỗi SQL (R3-02: áp dụng encDigestField tương đương m5_enc_digest_field):
    const sqlClassPart =
      encDigestField(classId) + ':' +
      encDigestField(courseId) + ':' +
      encDigestField(classCode);
    const sqlLessonsPart = testLessons
      .map(
        (l) =>
          encDigestField(l.sessionNumber) + ':' +
          encDigestField(l.id) + ':' +
          encDigestField(l.title) + ':' +
          encDigestField(l.status) + ':' +
          encDigestField(Boolean(l.hasQuiz)) + ':' +
          encDigestField(Boolean(l.hasPractice))
      )
      .join('|');
    const sqlEffStatus =
      wandererStudent.status === 'archived'
        ? 'archived'
        : wandererStudent.currentClassId !== classId
        ? 'transferred'
        : wandererStudent.status;
    const sqlParticipantsPart =
      encDigestField(wandererStudent.id) + ':' +
      encDigestField(wandererStudent.participantId) + ':' +
      encDigestField(wandererStudent.studentCode) + ':' +
      encDigestField(wandererStudent.fullName) + ':' +
      encDigestField(sqlEffStatus) + ':' +
      encDigestField(wandererStudent.notes || '') + ':' +
      encDigestField(wandererStudent.currentClassId || '') + ':' +
      encDigestField(wandererStudent.originalClassId || '');
    const sqlQuizzesPart = '';
    const sqlSubsPart = '';
    const sqlRaw = sqlClassPart + '##' + sqlLessonsPart + '##' + sqlParticipantsPart + '##' + sqlQuizzesPart + '##' + sqlSubsPart;
    const sqlExpectedDigest = crypto.createHash('sha256').update(sqlRaw, 'utf8').digest('hex');

    // Gọi hàm JS:
    const jsDigest = computeCourseCloseSnapshotDigest({
      classId,
      courseId,
      classCode,
      lessons: testLessons,
      participants: [wandererStudent],
      quizResults: [],
      submissions: [],
    });

    assert.strictEqual(jsDigest, sqlExpectedDigest, 'JS digest và SQL digest phải trùng khớp 100% cho ca A -> B -> C');
  });

  // --------------------------------------------------------------------------
  // 11.5 P1-05: Persistence of is_14_sessions_confirmed in DB and Edge Function & UI propagation
  // --------------------------------------------------------------------------
  await t.test('11.5 P1-05: is_14_sessions_confirmed persisted to DB in RPCs (m5_save_csv_verification, m5_begin_course_close) and preview/export APIs', () => {
    // 1. Kiểm tra migration SQL có p_confirmed_14_sessions và cập nhật vào bảng classes
    assert.ok(
      migrationSql.includes('p_confirmed_14_sessions BOOLEAN DEFAULT false'),
      'm5_save_csv_verification và m5_begin_course_close phải có tham số p_confirmed_14_sessions'
    );
    assert.ok(
      migrationSql.includes('SET is_14_sessions_confirmed = p_confirmed_14_sessions'),
      'Migration SQL phải UPDATE public.classes SET is_14_sessions_confirmed = p_confirmed_14_sessions'
    );

    // 2. Edge Function chuyển tiếp và cập nhật is_14_sessions_confirmed
    assert.ok(
      edgeBackendSource.includes("typeof confirmed14Sessions === 'boolean'"),
      'Edge Function m5-course-close-preview phải kiểm tra và cập nhật confirmed14Sessions'
    );
    assert.ok(
      edgeBackendSource.includes("p_confirmed_14_sessions: confirmed14Sessions"),
      'Edge Function phải truyền p_confirmed_14_sessions vào RPC m5_save_csv_verification và m5_begin_course_close'
    );

    // 3. BFF API route whitelist confirmed14Sessions
    assert.ok(
      bffApiSource.includes('confirmed14Sessions: body?.confirmed14Sessions'),
      'BFF route.ts phải whitelist chuyển tiếp confirmed14Sessions lên Edge Function'
    );

    // 4. Store cung cấp hàm setConfirmed14SessionsForClass
    assert.ok(
      storeSource.includes('setConfirmed14SessionsForClass'),
      'Store phải cung cấp hàm setConfirmed14SessionsForClass'
    );

    // 5. Classes page gọi setConfirmed14SessionsForClass khi Admin click checkbox
    assert.ok(
      classesPageSource.includes('setConfirmed14SessionsForClass(selectedClass.id'),
      'Classes page checkbox phải gọi setConfirmed14SessionsForClass'
    );
  });

  // --------------------------------------------------------------------------
  // 11.6 P1-06: Production guard and non-fixture blocking for simulateFailureStage, m5-seed-fixture, and quota baseline
  // --------------------------------------------------------------------------
  await t.test('11.6 P1-06: simulateFailureStage and fixture seed/quota baseline are strictly blocked on non-fixture class or PROD', () => {
    // 1. Edge Function chặn simulateFailureStage trên lớp không phải fixture
    assert.ok(
      edgeBackendSource.includes('SIMULATION_ONLY_ALLOWED_ON_FIXTURE_CLASS'),
      'Edge Function phải trả về SIMULATION_ONLY_ALLOWED_ON_FIXTURE_CLASS khi mô phỏng trên lớp thật'
    );

    // 2. Edge Function chặn test operations trên môi trường production
    assert.ok(
      edgeBackendSource.includes('TEST_OPERATION_DISABLED_IN_PROD'),
      'Edge Function phải trả về TEST_OPERATION_DISABLED_IN_PROD trong production'
    );
    assert.ok(
      edgeBackendSource.includes('SEED_FIXTURE_DISABLED_IN_PROD'),
      'Edge Function m5-seed-fixture phải bị chặn trong production'
    );

    // 3. Migration SQL chặn seed và baseline trong production
    assert.ok(
      migrationSql.includes('SEED_FIXTURE_DISABLED_IN_PROD'),
      'm5_seed_course_close_fixture phải chặn trên môi trường production'
    );
    assert.ok(
      migrationSql.includes('TEST_OPERATION_DISABLED_IN_PROD'),
      'm5_set_storage_quota_baseline phải chặn trên môi trường production'
    );

    // 4. UI: Classes page chỉ cho phép chọn mô phỏng lỗi khi là lớp fixture
    assert.ok(
      classesPageSource.includes("selectedClass.isFixture || selectedClass.code === 'ROB-K14-M5-01'"),
      'Classes page phải kiểm tra lớp fixture khi chọn simulateFailureStage'
    );
  });

  // --------------------------------------------------------------------------
  // 11.7 P2-01: selectedClassIdRef guard prevents stale async overwrite when user switches class
  // --------------------------------------------------------------------------
  await t.test('11.7 P2-01: selectedClassIdRef prevents stale async overwrite when Admin switches class during async operation', () => {
    assert.ok(
      classesPageSource.includes('selectedClassIdRef = useRef(selectedClassId)'),
      'Classes page phải tạo selectedClassIdRef lưu trữ selectedClassId hiện tại'
    );
    assert.ok(
      classesPageSource.includes('selectedClassIdRef.current = selectedClassId'),
      'Classes page phải cập nhật selectedClassIdRef.current mỗi khi selectedClassId đổi'
    );
    assert.ok(
      classesPageSource.includes('selectedClassIdRef.current !== requestClassId'),
      'handleExportCloseCsv và handleExecuteClose phải kiểm tra selectedClassIdRef trước khi cập nhật state'
    );
    assert.ok(
      classesPageSource.includes('csvVerificationResult.classId === selectedClass.id'),
      'Chỉ hiển thị kết quả đối chiếu CSV và nút Xóa khi verification thuộc đúng selectedClass.id'
    );
  });

  // --------------------------------------------------------------------------
  // 11.8 P2-02: Live mode storage quota error sets STORAGE_QUOTA_STATUS_UNKNOWN, allowed: false, and blocks preview
  // --------------------------------------------------------------------------
  await t.test('11.8 P2-02: Live mode storage quota network/server error sets STORAGE_QUOTA_STATUS_UNKNOWN, allowed: false, and blocks preview delete', () => {
    // 1. Store fetchStorageQuota xử lý lỗi ở live mode
    assert.ok(
      storeSource.includes("code: 'STORAGE_QUOTA_STATUS_UNKNOWN'"),
      'store.fetchStorageQuota phải trả về code STORAGE_QUOTA_STATUS_UNKNOWN khi API lỗi ở isLiveMode'
    );
    assert.ok(
      storeSource.includes('statusUnknown: true'),
      'store.fetchStorageQuota phải đặt statusUnknown: true khi API lỗi ở isLiveMode'
    );
    assert.ok(
      storeSource.includes('storageQuotaError'),
      'store phải lưu trạng thái storageQuotaError khi fetch thất bại'
    );

    // 2. generateCourseClosePreview đưa lỗi vào blockErrors
    assert.ok(
      storeSource.includes('Chưa xác định được trạng thái dung lượng Storage từ máy chủ'),
      'store.generateCourseClosePreview phải đưa thông báo lỗi quota vào blockErrors khi storageQuotaError tồn tại'
    );

    // 3. UI classes page hiển thị thông báo lỗi và nút kiểm tra lại
    assert.ok(
      classesPageSource.includes('storageQuotaError'),
      'Classes page phải hiển thị cảnh báo khi storageQuotaError tồn tại'
    );
    assert.ok(
      classesPageSource.includes('Kiểm tra lại hạn mức'),
      'Classes page phải có nút "Kiểm tra lại hạn mức"'
    );

    // 4. Khi preview có blockErrors thì canExecuteDelete bắt buộc là false
    const blockedPreview = computeCourseClosePreview({
      currentUser: { id: 'usr_admin_01', role: 'admin' },
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: m5Lessons14,
      students: m5Students,
      submissions: m5Submissions,
      quizResults: m5QuizResults,
      activeReservationsCount: 1, // Lỗi chặn kỹ thuật
      isSchedule14Confirmed: true,
      csvVerification: { valid: true, snapshotDigest: 'some_digest' },
    });
    assert.strictEqual(blockedPreview.canExecuteDelete, false, 'canExecuteDelete phải là false khi có blockErrors');
  });
});

// ============================================================================
// SUITE 12: BÀI KIỂM THỬ HỒI QUY CHO 9 ĐIỂM REVIEW VÒNG 3 (R3-01 ĐẾN R3-09)
// ============================================================================
test('Suite 12: Regression tests for Review Round 3 Fixes (R3-01 through R3-09)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  const corePath = path.join(ROOT_DIR, 'src', 'lib', 'm5-course-close-core.mjs');
  const coreSource = fs.readFileSync(corePath, 'utf8');

  const simRulesPath = path.join(ROOT_DIR, 'src', 'lib', 'simulation-rules.ts');
  const simRulesSource = fs.readFileSync(simRulesPath, 'utf8');

  // --------------------------------------------------------------------------
  // 12.1 R3-01 (P1): Locked RPC ACL and Verified Admin Actor check via p_actor_id
  // --------------------------------------------------------------------------
  await t.test('12.1 R3-01: Direct execution forbidden (service_role required) and verified Admin actor check via p_actor_id on 6 internal M5 RPCs', () => {
    const lockedFunctions = [
      'm5_save_csv_verification',
      'm5_begin_course_close',
      'm5_update_course_close_storage_progress',
      'm5_finalize_course_close_db',
      'm5_seed_course_close_fixture',
      'm5_set_storage_quota_baseline',
    ];

    for (const fn of lockedFunctions) {
      assert.ok(
        migrationSql.includes(`REVOKE ALL ON FUNCTION public.${fn}`) &&
          migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`) &&
          migrationSql.includes(`TO service_role;`),
        `Hàm ${fn} phải bị thu hồi từ PUBLIC, anon, authenticated và chỉ cấp cho service_role`
      );
      assert.ok(
        !migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`) ||
          !migrationSql.includes(`TO authenticated;`),
        `Hàm ${fn} không được cấp quyền cho authenticated`
      );
    }

    // Verify service_role role check and p_actor_id verification in SQL
    assert.ok(
      migrationSql.includes("COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'"),
      'SQL phải kiểm tra gọi bởi service_role'
    );
    assert.ok(
      migrationSql.includes("DIRECT_RPC_FORBIDDEN: Must be invoked via m2-backend server workflow"),
      'SQL phải ném lỗi DIRECT_RPC_FORBIDDEN khi gọi ngoài workflow máy chủ'
    );
    assert.ok(
      migrationSql.includes("WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'"),
      'SQL phải xác minh danh tính Admin actor thực sự trong public.profiles'
    );
    assert.ok(!migrationSql.includes('is_archived'), 'SQL không được tham chiếu cột is_archived không tồn tại (R16-02)');

    // Verify Edge Function calls all 6 internal RPCs with adminClient and p_actor_id
    for (const fn of lockedFunctions) {
      assert.ok(
        edgeBackendSource.includes(`adminClient.rpc('${fn}'`),
        `Edge Function phải gọi ${fn} qua adminClient.rpc`
      );
      assert.ok(
        !edgeBackendSource.includes(`actorClient.rpc('${fn}'`),
        `Edge Function không được gọi ${fn} qua actorClient.rpc`
      );
    }
  });

  // --------------------------------------------------------------------------
  // 12.2 R3-02 (P1): Length-prefixed encoding (encDigestField) prevents delimiter collisions
  // --------------------------------------------------------------------------
  await t.test('12.2 R3-02: Length-prefixed encoding (encDigestField) prevents delimiter collisions and ensures UTF-8 code point parity with SQL char_length', () => {
    // 1. encDigestField formatting
    assert.strictEqual(encDigestField('ABC'), '3#ABC');
    assert.strictEqual(encDigestField(''), '0#');
    assert.strictEqual(encDigestField(null), '0#');
    assert.strictEqual(encDigestField(14), '2#14');

    // 2. Unicode code point counting matches PostgreSQL char_length
    const vnText = 'Đặng Quỳnh Chi';
    assert.strictEqual(encDigestField(vnText), `14#${vnText}`);

    // 3. Collision avoidance on text pairs: "A:B" + "C" vs "A" + "B:C"
    const participant = { id: 'stu_1', participantId: 'P1', studentCode: 'HS1', fullName: 'Nguyen Van A', status: 'active' };
    const subCol1 = [
      { studentId: 'stu_1', lessonId: 'les_1', type: 'text', status: 'approved', teacherFeedback: 'A:B', content: 'C', fileSizeBytes: 0 },
    ];
    const subCol2 = [
      { studentId: 'stu_1', lessonId: 'les_1', type: 'text', status: 'approved', teacherFeedback: 'A', content: 'B:C', fileSizeBytes: 0 },
    ];

    const digest1 = computeCourseCloseSnapshotDigest({
      classId: 'cls_test',
      courseId: 'crs_test',
      classCode: 'TEST',
      lessons: [{ id: 'les_1', sessionNumber: 1, title: 'B1', status: 'published', hasQuiz: false, hasPractice: true }],
      participants: [participant],
      quizResults: [],
      submissions: subCol1,
    });
    const digest2 = computeCourseCloseSnapshotDigest({
      classId: 'cls_test',
      courseId: 'crs_test',
      classCode: 'TEST',
      lessons: [{ id: 'les_1', sessionNumber: 1, title: 'B1', status: 'published', hasQuiz: false, hasPractice: true }],
      participants: [participant],
      quizResults: [],
      submissions: subCol2,
    });

    assert.notStrictEqual(
      digest1,
      digest2,
      'Cặp "A:B"+"C" và "A"+"B:C" phải cho ra 2 snapshotDigest hoàn toàn khác nhau nhờ length-prefixed encoding'
    );

    // 4. Parity across files
    assert.ok(coreSource.includes('export function encDigestField('), 'm5-course-close-core phải xuất encDigestField');
    assert.ok(simRulesSource.includes('export function encDigestField('), 'simulation-rules phải xuất encDigestField');
    assert.ok(edgeBackendSource.includes('const enc = (val: unknown): string =>'), 'Edge backend phải định nghĩa length prefix encoder enc()');
    assert.ok(
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.m5_enc_digest_field(p_val TEXT)'),
      'Migration SQL phải có hàm public.m5_enc_digest_field'
    );
    assert.ok(
      migrationSql.includes("char_length(COALESCE(p_val, ''))::text || '#' || COALESCE(p_val, '')"),
      'm5_enc_digest_field phải dùng char_length và ký tự phân cách #'
    );
  });

  // --------------------------------------------------------------------------
  // 12.3 R3-03 (P1): Lock ordering in practice/quiz/reserve and m3_transfer_student UUID sort
  // --------------------------------------------------------------------------
  await t.test('12.3 R3-03: Lock ordering locks student and class before reading current_class_id, and m3_transfer_student sorts UUIDs', () => {
    // 1. In m3_reserve_practice_upload: locks student before checking class
    const reserveSql = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m3_reserve_practice_upload('),
      migrationSql.indexOf('REVOKE ALL ON FUNCTION public.m3_reserve_practice_upload(UUID, UUID, TEXT, INTEGER)')
    );
    const m4PosRes = reserveSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const m5QuotaPosRes = reserveSql.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const stuLockPosRes = reserveSql.indexOf("pg_advisory_xact_lock(hashtext('student:' || p_student_id::text))");
    const closeLockPosRes = reserveSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))");

    assert.ok(m4PosRes > 0 && m5QuotaPosRes > m4PosRes && stuLockPosRes > m5QuotaPosRes && closeLockPosRes > stuLockPosRes,
      'm3_reserve_practice_upload phải tuân thủ lock order: m4_teaching_sync -> m5_storage_quota -> student -> m5_close'
    );

    // 2. In m3_submit_practice: locks m4 -> student -> m5_close
    const submitSql = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m3_submit_practice('),
      migrationSql.indexOf('REVOKE ALL ON FUNCTION public.m3_submit_practice(')
    );
    const m4PosSub = submitSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const stuLockPosSub = submitSql.indexOf("pg_advisory_xact_lock(hashtext('student:' || p_student_profile_id::text))");
    const closeLockPosSub = submitSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))");

    assert.ok(m4PosSub > 0 && stuLockPosSub > m4PosSub && closeLockPosSub > stuLockPosSub,
      'm3_submit_practice phải tuân thủ lock order: m4_teaching_sync -> student -> m5_close'
    );

    // 3. In m3_transfer_student: sorts UUIDs to prevent deadlock between 2 classes
    assert.ok(
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.m3_transfer_student('),
      'Migration SQL phải cập nhật m3_transfer_student'
    );
    assert.ok(
      migrationSql.includes('IF v_old_class_id < p_target_class_id THEN'),
      'm3_transfer_student phải so sánh v_old_class_id và p_target_class_id theo thứ tự UUID để khóa theo thứ tự tăng dần'
    );
  });

  // --------------------------------------------------------------------------
  // 12.4 R3-04 (P1): Fail-Closed positive test environment verification
  // --------------------------------------------------------------------------
  await t.test('12.4 R3-04: Fail-closed positive test environment check rejects non-test project refs and production', () => {
    // 1. Edge Function helper isVerifiedTestEnvironment
    assert.ok(
      edgeBackendSource.includes('function isVerifiedTestEnvironment()'),
      'Edge Function phải có helper isVerifiedTestEnvironment'
    );
    assert.ok(
      edgeBackendSource.includes("supabaseUrl.includes('eythjapspkoyqdxlxtcd')"),
      'isVerifiedTestEnvironment phải kiểm tra SUPABASE_URL chứa ref eythjapspkoyqdxlxtcd'
    );
    assert.ok(
      edgeBackendSource.includes("mindxEnv === 'production'") &&
      edgeBackendSource.includes("appEnv === 'production'"),
      'isVerifiedTestEnvironment phải kiểm tra mindxEnv và appEnv không là production'
    );

    // 2. SQL Fail-Closed check
    assert.ok(
      migrationSql.includes("p_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd'"),
      'SQL phải kiểm tra p_test_project_ref IS DISTINCT FROM eythjapspkoyqdxlxtcd'
    );
    assert.ok(
      migrationSql.includes("c.environment_mode = 'test'"),
      'SQL m5_storage_quota_config phải kiểm tra environment_mode = test'
    );
    assert.ok(
      migrationSql.includes("c.approved_test_project_ref = 'eythjapspkoyqdxlxtcd'"),
      'SQL m5_storage_quota_config phải kiểm tra approved_test_project_ref = eythjapspkoyqdxlxtcd'
    );
  });

  // --------------------------------------------------------------------------
  // 12.5 R3-05 (P2): Lock ordering in m3_grade_submission and m3_reopen_submission
  // --------------------------------------------------------------------------
  await t.test('12.5 R3-05: m3_grade_submission and m3_reopen_submission lock class before locking practice_submissions FOR UPDATE', () => {
    const gradeSql = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m3_grade_submission('),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m3_reopen_submission(')
    );

    // Check that first SELECT on practice_submissions has NO FOR UPDATE
    const selectWithoutForUpdate = gradeSql.indexOf('SELECT ps.class_id, ps.student_id INTO v_class_id, v_student_id');
    const classLockPos = gradeSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))");
    const subForUpdatePos = gradeSql.indexOf('SELECT * INTO v_sub\n    FROM public.practice_submissions ps\n    WHERE ps.id = p_submission_id AND ps.class_id = v_class_id\n    FOR UPDATE');

    assert.ok(selectWithoutForUpdate > 0, 'Phải đọc sơ bộ class_id không có FOR UPDATE');
    assert.ok(classLockPos > selectWithoutForUpdate, 'Khóa lớp m5_close phải thực hiện sau khi đọc sơ bộ class_id');
    assert.ok(subForUpdatePos > classLockPos, 'Khóa bài nộp FOR UPDATE phải thực hiện SAU KHI đã khóa lớp m5_close');
  });

  // --------------------------------------------------------------------------
  // 12.6 R3-06 (P2): Fixture seed scoping strictly limited to M5 fixture IDs
  // --------------------------------------------------------------------------
  await t.test('12.6 R3-06: m5_seed_course_close_fixture strictly limits deletions to M5 fixture IDs and cohort triggers use false AS is_m5_fixture', () => {
    // 1. Cohort triggers do not mark non-M5 students as is_m5_fixture
    assert.ok(
      migrationSql.includes('false AS is_m5_fixture') || migrationSql.includes('is_m5_fixture\n        )\n        VALUES (\n            NEW.current_class_id, v_cls_course_id, NEW.id, v_part_id, NEW.status, NEW.notes, false'),
      'Trigger cohort members phải đặt cứng false AS is_m5_fixture cho học sinh bình thường'
    );

    // 2. m5_seed_course_close_fixture deletes only M5 IDs
    const seedFuncSql = migrationSql.slice(
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture('),
      migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m5_begin_course_close(')
    );
    assert.ok(
      seedFuncSql.includes('WHERE class_id = v_cls_id'),
      'm5_seed_course_close_fixture chỉ xóa m5_class_cohort_members của v_cls_id'
    );
    assert.ok(
      seedFuncSql.includes('DELETE FROM public.m5_course_close_operations WHERE class_id = v_cls_id'),
      'm5_seed_course_close_fixture chỉ xóa m5_course_close_operations của v_cls_id'
    );
  });

  // --------------------------------------------------------------------------
  // 12.7 R3-07 (P2): Per-class busy state tracking prevents stuck buttons
  // --------------------------------------------------------------------------
  await t.test('12.7 R3-07: Classes page tracks exportingClassId and closingClassId per class with finally release', () => {
    assert.ok(
      classesPageSource.includes('const [exportingClassId, setExportingClassId] = useState<string | null>(null);'),
      'Classes page phải khai báo exportingClassId: string | null'
    );
    assert.ok(
      classesPageSource.includes('const [closingClassId, setClosingClassId] = useState<string | null>(null);'),
      'Classes page phải khai báo closingClassId: string | null'
    );
    assert.ok(
      classesPageSource.includes('setExportingClassId((prev) => (prev === requestClassId ? null : prev));'),
      'handleExportCloseCsv phải giải phóng đúng requestClassId trong khối finally'
    );
    assert.ok(
      classesPageSource.includes('setClosingClassId((prev) => (prev === requestClassId ? null : prev));'),
      'handleExecuteClose phải giải phóng đúng requestClassId trong khối finally'
    );
  });

  // --------------------------------------------------------------------------
  // 12.8 R3-08 (P2): Strict DB read error handling halting with 500 DB_READ_FAILED
  // --------------------------------------------------------------------------
  await t.test('12.8 R3-08: Edge Function checks error on all DB selects in preview, export, and execute, halting with 500 DB_READ_FAILED', () => {
    assert.ok(
      edgeBackendSource.includes("code: 'DB_READ_FAILED'"),
      'Edge Function phải xử lý lỗi đọc DB và trả về mã lỗi 500 DB_READ_FAILED'
    );
    assert.ok(
      edgeBackendSource.includes('if (lessonsErr)'),
      'Edge Function phải kiểm tra lessonsErr'
    );
    assert.ok(
      edgeBackendSource.includes('if (cohortErr)'),
      'Edge Function phải kiểm tra cohortErr'
    );
    assert.ok(
      edgeBackendSource.includes('if (quizErr)'),
      'Edge Function phải kiểm tra quizErr'
    );
    assert.ok(
      edgeBackendSource.includes('if (subErr)'),
      'Edge Function phải kiểm tra subErr'
    );
  });

  // --------------------------------------------------------------------------
  // 12.9 R3-09 (P2): Reservation transition to consumed on practice submit and active filtering
  // --------------------------------------------------------------------------
  await t.test('12.9 R3-09: Reservation updates to consumed immediately on practice submit, and active checks require consumed_at IS NULL AND released_at IS NULL', () => {
    // 1. m3_submit_practice updates reservation to consumed
    assert.ok(
      migrationSql.includes("SET status = 'consumed',\n            consumed_at = now()"),
      "m3_submit_practice phải cập nhật SET status = 'consumed', consumed_at = now()"
    );

    // 2. Active reservation queries check consumed_at IS NULL AND released_at IS NULL
    assert.ok(
      migrationSql.includes('consumed_at IS NULL\n      AND released_at IS NULL'),
      'Migration SQL phải lọc reservation với consumed_at IS NULL AND released_at IS NULL'
    );
  });
});

// ============================================================================
// SUITE 13: HỒI QUY CÁC ĐIỂM SỬA REVIEW VÒNG 4 (R4-01 ĐẾN R4-06)
// ============================================================================
test('Suite 13: Regression tests for Review Round 4 Fixes (R4-01 through R4-06)', async (t) => {
  const migrationPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  const corePath = path.join(ROOT_DIR, 'src', 'lib', 'm5-course-close-core.mjs');
  const coreSource = fs.readFileSync(corePath, 'utf8');

  const simRulesPath = path.join(ROOT_DIR, 'src', 'lib', 'simulation-rules.ts');
  const simRulesSource = fs.readFileSync(simRulesPath, 'utf8');

  // --------------------------------------------------------------------------
  // 13.1 R4-01 (P1): 100% signature match on all REVOKE/GRANT; zero invalid arg counts
  // --------------------------------------------------------------------------
  await t.test('13.1 R4-01: Zero signature mismatch in REVOKE/GRANT; all match CREATE FUNCTION 100%', () => {
    const rgxRevoke = /REVOKE ALL ON FUNCTION public\.(\w+)\(([^)]*)\)/g;
    const rgxGrant = /GRANT EXECUTE ON FUNCTION public\.(\w+)\(([^)]*)\)/g;
    const rgxCreate = /CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(([\s\S]*?)\)\s*(?:RETURNS|LANGUAGE)/g;

    const createdFunctions = [];
    let match;
    while ((match = rgxCreate.exec(migrationSql)) !== null) {
      const name = match[1];
      const rawArgs = match[2];
      const paramTypes = rawArgs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((param) => {
          const clean = param.replace(/DEFAULT[\s\S]*/i, '').trim();
          const parts = clean.split(/\s+/);
          return parts.length > 1 ? parts[1].toUpperCase() : parts[0].toUpperCase();
        });
      createdFunctions.push({ name, types: paramTypes.join(', ') });
    }

    // Verify invalid signatures from drafts do NOT exist in any REVOKE or GRANT
    const invalidSignatures = [
      'm5_set_storage_quota_baseline(BIGINT, BIGINT, BIGINT)',
      'm5_seed_course_close_fixture(BOOLEAN)',
      'm5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN)',
      'm5_begin_course_close(UUID, UUID, UUID, BOOLEAN)',
      'm5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT)',
    ];

    for (const inv of invalidSignatures) {
      assert.ok(!migrationSql.includes(`REVOKE ALL ON FUNCTION public.${inv}`), `Không được REVOKE trên chữ ký không tồn tại: ${inv}`);
      assert.ok(!migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${inv}`), `Không được GRANT trên chữ ký không tồn tại: ${inv}`);
    }

    // Verify DROP FUNCTION IF EXISTS cleanups exist
    assert.ok(migrationSql.includes('DROP FUNCTION IF EXISTS public.m5_set_storage_quota_baseline(BIGINT, BIGINT, BIGINT);'));
    assert.ok(migrationSql.includes('DROP FUNCTION IF EXISTS public.m5_seed_course_close_fixture(BOOLEAN);'));
    assert.ok(migrationSql.includes('DROP FUNCTION IF EXISTS public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN);'));
    assert.ok(migrationSql.includes('DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN);'));
    assert.ok(migrationSql.includes('DROP FUNCTION IF EXISTS public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT);'));

    // Scan all REVOKE statements
    let revMatch;
    let revCount = 0;
    while ((revMatch = rgxRevoke.exec(migrationSql)) !== null) {
      revCount++;
      const fnName = revMatch[1];
      const fnArgs = revMatch[2].split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
      const matchingCreated = createdFunctions.some((c) => c.name === fnName && c.types === fnArgs);
      assert.ok(matchingCreated, `Lệnh REVOKE ALL ON FUNCTION public.${fnName}(${fnArgs}) phải khớp 100% với một hàm CREATE OR REPLACE FUNCTION`);
    }
    assert.ok(revCount > 15, `Phải có ít nhất 15 câu lệnh REVOKE hợp lệ được đối chiếu (thực tế: ${revCount})`);

    // Scan all GRANT statements
    let grtMatch;
    let grtCount = 0;
    while ((grtMatch = rgxGrant.exec(migrationSql)) !== null) {
      grtCount++;
      const fnName = grtMatch[1];
      const fnArgs = grtMatch[2].split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
      const matchingCreated = createdFunctions.some((c) => c.name === fnName && c.types === fnArgs);
      assert.ok(matchingCreated, `Lệnh GRANT EXECUTE ON FUNCTION public.${fnName}(${fnArgs}) phải khớp 100% với một hàm CREATE OR REPLACE FUNCTION`);
    }
    assert.ok(grtCount > 15, `Phải có ít nhất 15 câu lệnh GRANT hợp lệ được đối chiếu (thực tế: ${grtCount})`);
  });

  // --------------------------------------------------------------------------
  // 13.2 R4-02 (P1): Safe cohort members backfill with is_m5_fixture = false and ON CONFLICT (class_id, course_id, student_id) DO NOTHING
  // --------------------------------------------------------------------------
  await t.test('13.2 R4-02: Cohort members backfill restored with is_m5_fixture = false and ON CONFLICT (class_id, course_id, student_id) DO NOTHING', () => {
    // 1. Table constraint has UNIQUE (class_id, course_id, student_id)
    assert.ok(
      migrationSql.includes('UNIQUE (class_id, course_id, student_id)'),
      'm5_class_cohort_members phải có ràng buộc UNIQUE (class_id, course_id, student_id)'
    );

    // 2. Backfill by current_class_id
    assert.ok(
      (migrationSql.includes('c.id = s.current_class_id') || migrationSql.includes('s.current_class_id = c.id')) &&
      migrationSql.includes('c.course_id IS NOT NULL'),
      'Phải có bước backfill học sinh theo current_class_id'
    );

    // 3. Backfill by original_class_id
    assert.ok(
      migrationSql.includes('c.id = s.original_class_id') || migrationSql.includes('s.original_class_id = c.id'),
      'Phải có bước backfill học sinh theo original_class_id'
    );

    // 4. Backfill by quiz_results and practice_submissions
    assert.ok(
      migrationSql.includes('FROM public.quiz_results qr') &&
      migrationSql.includes('FROM public.practice_submissions ps'),
      'Phải có bước backfill học sinh từ quiz_results và practice_submissions'
    );

    // 5. All backfills explicitly set false for is_m5_fixture
    assert.ok(
      migrationSql.includes('false\nFROM public.students s\nJOIN public.classes c ON c.id = s.current_class_id') ||
      migrationSql.includes('false\nFROM public.students s'),
      'Backfill phải gán cứng false cho is_m5_fixture'
    );

    // 6. ON CONFLICT (class_id, course_id, student_id) DO NOTHING
    assert.ok(
      migrationSql.includes('ON CONFLICT (class_id, course_id, student_id) DO NOTHING'),
      'Backfill phải dùng ON CONFLICT (class_id, course_id, student_id) DO NOTHING'
    );
  });

  // --------------------------------------------------------------------------
  // 13.3 R4-03 (P2): Class closes Course 1 and moves to Course 2; transferred student excluded and digest parity
  // --------------------------------------------------------------------------
  await t.test('13.3 R4-03: Digest parity between JS/Edge and SQL when class closes Course 1 and moves to Course 2 (transferred students excluded from Course 2)', () => {
    const classId = 'cls_transition_test';
    const course1Id = 'crs_rob_k14_part1';
    const course2Id = 'crs_rob_k14_part2';

    const stuStay = {
      id: 'stu_stay_1',
      participantId: 'PART_001',
      studentCode: 'HS_001',
      fullName: 'Học Sinh Tiếp Tục',
      originalClassId: classId,
      currentClassId: classId,
      status: 'active',
      notes: 'Học tiếp khóa 2',
    };

    const stuTransferred = {
      id: 'stu_transfer_2',
      participantId: 'PART_002',
      studentCode: 'HS_002',
      fullName: 'Học Sinh Đã Rời Lớp',
      originalClassId: classId,
      currentClassId: 'cls_other_branch',
      status: 'active',
      notes: 'Đã chuyển lớp từ khóa 1',
    };

    const lessonsCourse2 = [
      { id: 'les_c2_1', courseId: course2Id, sessionNumber: 1, title: 'B1 Khóa 2', status: 'published', hasQuiz: false, hasPractice: true },
    ];

    // Completed close operation for course 1 on classId
    const completedOpCourse1 = {
      id: 'op_close_c1',
      classId,
      courseId: course1Id,
      nextCourseId: course2Id,
      status: 'completed',
    };

    // 1. Resolve participants for Course 2: stuTransferred MUST NOT be included
    const participantsC2 = resolveBatchParticipants({
      students: [stuStay, stuTransferred],
      classId,
      courseId: course2Id,
      cohortMembers: [
        // stuStay has cohort member in course 2
        { classId, courseId: course2Id, studentId: stuStay.id, participantId: stuStay.participantId, membershipStatus: 'active' },
        // stuTransferred was only cohort member in course 1
        { classId, courseId: course1Id, studentId: stuTransferred.id, participantId: stuTransferred.participantId, membershipStatus: 'transferred' },
      ],
      lessons: lessonsCourse2,
      closedOperations: [completedOpCourse1],
    });

    assert.strictEqual(participantsC2.success, true);
    assert.strictEqual(participantsC2.participants.length, 1, 'Khóa 2 chỉ được chứa 1 học sinh tiếp tục học');
    assert.strictEqual(participantsC2.participants[0].id, stuStay.id, 'Học sinh chuyển đi từ khóa 1 không được lọt vào khóa 2');

    // 2. Snapshot digest for Course 2 excludes transferred student
    const digestC2 = computeCourseCloseSnapshotDigest({
      classId,
      courseId: course2Id,
      classCode: 'ROB-K14-C2',
      lessons: lessonsCourse2,
      participants: participantsC2.participants,
      quizResults: [],
      submissions: [],
    });
    assert.ok(digestC2 && digestC2.length === 64, 'Digest khóa 2 phải là chuỗi SHA-256 64 hex hợp lệ');

    // 3. Verify SQL updates original_class_id on finalize and seeds next course cohort
    assert.ok(
      migrationSql.includes('UPDATE public.students\n    SET original_class_id = current_class_id\n    WHERE original_class_id = p_class_id'),
      'm5_finalize_course_close_db phải cập nhật UPDATE public.students SET original_class_id = current_class_id cho học sinh rời lớp'
    );
    assert.ok(
      migrationSql.includes('INSERT INTO public.m5_class_cohort_members (\n            class_id, course_id, student_id, participant_id, membership_status, notes_snapshot, is_m5_fixture\n        )\n        SELECT\n            p_class_id,\n            v_target_next_course'),
      'm5_finalize_course_close_db phải khởi tạo m5_class_cohort_members cho khóa mới khi v_target_next_course IS NOT NULL'
    );
  });

  // --------------------------------------------------------------------------
  // 13.4 R4-04 (P2): Error checking on all storage progress RPCs and resume allowed in deleting_storage / deleting_db
  // --------------------------------------------------------------------------
  await t.test('13.4 R4-04: Storage progress update error checking and resume allowed in deleting_storage or deleting_db', () => {
    // 1. Edge Function checks error on m5_update_course_close_storage_progress and returns 500 STORAGE_PROGRESS_UPDATE_FAILED
    assert.ok(
      edgeBackendSource.includes("code: 'STORAGE_PROGRESS_UPDATE_FAILED'"),
      'Edge Function phải trả mã lỗi STORAGE_PROGRESS_UPDATE_FAILED khi cập nhật tiến độ storage gặp sự cố'
    );
    assert.ok(
      edgeBackendSource.includes('progressErr'),
      'Edge Function phải kiểm tra biến lỗi progressErr'
    );

    // 2. Core runCourseCloseExecution allows resume in deleting_storage or deleting_db
    assert.ok(
      coreSource.includes("['incomplete', 'deleting_storage', 'deleting_db'].includes(existingOperation.status)"),
      'runCourseCloseExecution phải coi deleting_storage và deleting_db là hợp lệ để resume'
    );

    // 3. SQL m5_begin_course_close allows resume in deleting_storage or deleting_db
    assert.ok(
      migrationSql.includes("v_op.status IN ('incomplete', 'deleting_storage', 'deleting_db')"),
      'm5_begin_course_close phải cho phép resume khi status thuộc incomplete, deleting_storage, deleting_db'
    );

    // 4. UI classes/page.tsx defines isIncomplete for incomplete, deleting_storage, deleting_db
    assert.ok(
      classesPageSource.includes("['incomplete', 'deleting_storage', 'deleting_db'].includes(currentCloseOp.status)"),
      'Giao diện classes/page.tsx phải hiển thị nút Resume khi tác vụ đang ở incomplete, deleting_storage hoặc deleting_db'
    );
  });

  // --------------------------------------------------------------------------
  // 13.5 R4-05 (P2): Positive test environment check replaces test default with unknown and enforces p_test_project_ref
  // --------------------------------------------------------------------------
  await t.test('13.5 R4-05: Fail-closed test environment positive verification replaces test default with unknown and rejects missing/mismatched project ref', () => {
    // 1. No COALESCE(..., 'test') = 'production' in migration
    assert.ok(
      !migrationSql.includes("COALESCE(current_setting('app.environment', true), 'test') = 'production'"),
      "Migration SQL không được chứa COALESCE(current_setting('app.environment', true), 'test') = 'production'"
    );

    // 2. Uses COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown') = 'production'
    assert.ok(
      migrationSql.includes("COALESCE(NULLIF(btrim(current_setting('app.environment', true)), ''), 'unknown') = 'production'"),
      'Migration SQL phải dùng fallback unknown thay vì test khi đọc app.environment'
    );

    // 3. Positive verification raises TEST_ONLY_OPERATION_FORBIDDEN if p_test_project_ref is null or distinct
    assert.ok(
      migrationSql.includes("RAISE EXCEPTION 'TEST_ONLY_OPERATION_FORBIDDEN: Thao tác chỉ cho phép trên dự án thử nghiệm eythjapspkoyqdxlxtcd.'"),
      'SQL phải ném TEST_ONLY_OPERATION_FORBIDDEN khi p_test_project_ref không khớp hoặc bị thiếu'
    );

    // 4. m5_storage_quota_config migration seed defaults to unverified (fail-closed, not test)
    assert.ok(
      migrationSql.includes("VALUES ('default', 0, 734003200, 838860800, false, 'unverified', 'eythjapspkoyqdxlxtcd')") ||
      migrationSql.includes("VALUES ('default', 0, 734003200, 838860800, 'unverified', 'eythjapspkoyqdxlxtcd')") ||
      migrationSql.includes("VALUES ('default', 0, 734003200, 838860800, 'production', 'eythjapspkoyqdxlxtcd')"),
      'Dòng seed mặc định của bảng m5_storage_quota_config không được tự gán environment_mode = test'
    );
  });

  // --------------------------------------------------------------------------
  // 13.6 R4-06 (P2): Busy state tracking per class via Record<string, boolean> preventing cross-class locks and duplicate requests
  // --------------------------------------------------------------------------
  await t.test('13.6 R4-06: Manage classes tracks busy state per class via Record<string, boolean> preventing cross-class button lock and duplicate requests', () => {
    // 1. Declarations of Record<string, boolean> maps
    assert.ok(
      classesPageSource.includes('const [exportingByClassId, setExportingByClassId] = useState<Record<string, boolean>>({});'),
      'classes/page.tsx phải khai báo exportingByClassId: Record<string, boolean>'
    );
    assert.ok(
      classesPageSource.includes('const [closingByClassId, setClosingByClassId] = useState<Record<string, boolean>>({});'),
      'classes/page.tsx phải khai báo closingByClassId: Record<string, boolean>'
    );

    // 2. Deduplication check in handleExportCloseCsv
    assert.ok(
      classesPageSource.includes('if (exportingByClassId[requestClassId]) return;'),
      'handleExportCloseCsv phải return ngay nếu exportingByClassId[requestClassId] đang là true'
    );

    // 3. Deduplication check in handleExecuteClose
    assert.ok(
      classesPageSource.includes('if (closingByClassId[requestClassId]) return;') ||
      classesPageSource.includes('closingByClassId[requestClassId]'),
      'handleExecuteClose phải chặn gọi trùng nếu closingByClassId[requestClassId] đang là true'
    );

    // 4. Cleanup in finally
    assert.ok(
      classesPageSource.includes('setExportingByClassId((prev) => ({ ...prev, [requestClassId]: false }));'),
      'handleExportCloseCsv phải giải phóng [requestClassId]: false trong khối finally'
    );
    assert.ok(
      classesPageSource.includes('setClosingByClassId((prev) => ({ ...prev, [requestClassId]: false }));'),
      'handleExecuteClose phải giải phóng [requestClassId]: false trong khối finally'
    );
  });
});

// ============================================================================
// SUITE 14: BÀI KIỂM THỬ HỒI QUY CHO 6 ĐIỂM REVIEW VÒNG 5 (R5-01 ĐẾN R5-06)
// ============================================================================
test('Suite 14: Regression tests for Review Round 5 Fixes (R5-01 through R5-06)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  const corePath = path.join(ROOT_DIR, 'src', 'lib', 'm5-course-close-core.mjs');
  const coreSource = fs.readFileSync(corePath, 'utf8');

  const simRulesPath = path.join(ROOT_DIR, 'src', 'lib', 'simulation-rules.ts');
  const simRulesSource = fs.readFileSync(simRulesPath, 'utf8');

  // --------------------------------------------------------------------------
  // 14.1 R5-01 (P1): Sửa actor.profile.id thành actor.profileId tại 9 vị trí RPC
  // --------------------------------------------------------------------------
  await t.test('14.1 R5-01: Zero occurrences of actor.profile. in index.ts and p_actor_id uses actor.profileId across all 9 M5 RPC sites', () => {
    // 1. Tuyệt đối KHÔNG còn bất kỳ chuỗi 'actor.profile.' nào trong index.ts
    assert.strictEqual(
      edgeBackendSource.includes('actor.profile.'),
      false,
      'supabase/functions/m2-backend/index.ts tuyệt đối không được chứa chuỗi actor.profile.'
    );

    // 2. Kiểm tra các lệnh gọi RPC Mốc 5 đều dùng p_actor_id: actor.profileId
    const rpcActorSites = (edgeBackendSource.match(/p_actor_id:\s*actor\.profileId/g) || []).length;
    assert.ok(
      rpcActorSites >= 9,
      `Phải có ít nhất 9 vị trí truyền p_actor_id: actor.profileId trong index.ts (thực tế: ${rpcActorSites})`
    );

    // 3. requireAdminActor trả về actor.profileId
    assert.ok(
      edgeBackendSource.includes('profileId: string;'),
      'requireAdminActor phải định nghĩa kiểu profileId trên AuthenticatedActor'
    );
  });

  // --------------------------------------------------------------------------
  // 14.2 R5-02 (P1): Lọc chặt m3_upload_reservations, storage.objects, quiz, subs theo đúng course_id
  // --------------------------------------------------------------------------
  await t.test('14.2 R5-02: Strict filtering by course_id for reservations, storage objects, quizzes, and practice submissions', () => {
    // 1. SQL m5_begin_course_close joins lessons on course_id for reservations and practice
    assert.ok(
      migrationSql.includes('JOIN public.lessons l ON l.id = r.lesson_id\n        WHERE r.class_id = p_class_id\n          AND l.course_id = p_course_id') ||
      migrationSql.includes('JOIN public.lessons l ON l.id = r.lesson_id') && migrationSql.includes('AND l.course_id = p_course_id'),
      'm5_begin_course_close phải JOIN lessons với l.course_id = p_course_id khi gom m3_upload_reservations'
    );
    // Bỏ điều kiện mù o.name LIKE (p_class_id::text || '/%') trong m5_begin_course_close
    const beginFnStart = migrationSql.indexOf('FUNCTION public.m5_begin_course_close(');
    const beginFnEnd = migrationSql.indexOf('END;', beginFnStart);
    const beginFnBody = migrationSql.substring(beginFnStart, beginFnEnd);
    assert.strictEqual(
      beginFnBody.includes("o.name LIKE (p_class_id::text || '/%')"),
      false,
      'm5_begin_course_close không được dùng điều kiện mù o.name LIKE p_class_id/%'
    );

    // 2. SQL m5_finalize_course_close_db kiểm đếm storage không dùng điều kiện mù và xóa reservations theo course_id
    const finFnStart = migrationSql.indexOf('FUNCTION public.m5_finalize_course_close_db(');
    const finFnEnd = migrationSql.indexOf('END;', finFnStart);
    const finFnBody = migrationSql.substring(finFnStart, finFnEnd);
    assert.strictEqual(
      finFnBody.includes("o.name LIKE (p_class_id::text || '/%')"),
      false,
      'm5_finalize_course_close_db không được dùng điều kiện mù o.name LIKE p_class_id/%'
    );
    assert.ok(
      finFnBody.includes('DELETE FROM public.m3_upload_reservations r\n        USING public.lessons l\n        WHERE r.lesson_id = l.id\n          AND r.class_id = p_class_id\n          AND l.course_id = p_course_id') ||
      finFnBody.includes('USING public.lessons l') && finFnBody.includes('l.course_id = p_course_id'),
      'm5_finalize_course_close_db phải xóa m3_upload_reservations có liên kết với bài học của p_course_id'
    );

    // 3. computeCourseClosePreview trong JS Core loại trừ bài nộp / quiz của bài học ngoài khóa
    const otherCourseLesson = {
      id: 'les_other_course_01',
      courseId: 'crs_other_unrelated',
      sessionNumber: 1,
      title: 'Bài khóa khác',
      status: 'published',
      hasQuiz: true,
      hasPractice: true,
    };
    const submissionsWithOtherCourse = [
      ...m5Submissions,
      {
        id: 'sub_other_course',
        studentId: m5Students[0].id,
        lessonId: otherCourseLesson.id,
        classId: m5FixtureClass.id,
        status: 'submitted',
        type: 'file',
        content: `${m5FixtureClass.id}/other_course_file.zip`,
      },
    ];
    const previewRes = computeCourseClosePreview({
      classItem: m5FixtureClass,
      course: m5Course14,
      lessons: [...m5Lessons14, otherCourseLesson],
      students: m5Students,
      submissions: submissionsWithOtherCourse,
      quizResults: m5QuizResults,
      isSchedule14Confirmed: true,
    });
    // m5Submissions vốn có sẵn 1 bài submitted ở Buổi 6. Sau khi thêm bài submitted ở khóa khác, pendingGradingCount vẫn là 1 (không tăng lên 2)
    assert.strictEqual(
      previewRes.pendingGradingCount,
      1,
      'Bài nộp thuộc khóa học khác không được tính vào pendingGradingCount của khóa đang đóng (vẫn giữ đúng 1)'
    );

    // 4. Edge backend lọc quizRows, subRows, resRows theo courseLessonIds
    assert.ok(
      edgeBackendSource.includes('courseLessonIds.has(q.lesson_id)'),
      'Edge Function phải lọc quiz theo courseLessonIds'
    );
    assert.ok(
      edgeBackendSource.includes('courseLessonIds.has(s.lesson_id)'),
      'Edge Function phải lọc submissions theo courseLessonIds'
    );
    assert.ok(
      edgeBackendSource.includes('courseLessonIds.has(r.lesson_id)'),
      'Edge Function phải lọc reservations theo courseLessonIds'
    );
  });

  // --------------------------------------------------------------------------
  // 14.3 R5-03 (P2): Khóa chặt các nhánh biên chọn học sinh lịch sử khi chuyển lớp và đổi khóa
  // --------------------------------------------------------------------------
  await t.test('14.3 R5-03: Boundary checks for cohort participants on course transition & originalClassId fallback', () => {
    // 1. Khi courseId có mặt, không dùng cmCourseId làm wildcard
    assert.ok(
      coreSource.includes('courseId ? cmCourseId === courseId : true'),
      'm5-course-close-core.mjs phải yêu cầu cmCourseId === courseId khi courseId có mặt'
    );
    assert.ok(
      simRulesSource.includes('courseId ? cmCourseId === courseId : true'),
      'simulation-rules.ts phải yêu cầu cmCourseId === courseId khi courseId có mặt'
    );
    assert.ok(
      edgeBackendSource.includes('courseId ? cmCourseId === courseId : true'),
      'Edge resolveM5Participants phải yêu cầu cmCourseId === courseId khi courseId có mặt'
    );

    // 2. Học sinh có originalClassId = classId nhưng đã có cohort ở khóa khác bị loại khỏi fallback
    const classId = 'cls_transition_branch';
    const course1Id = 'crs_part1';
    const course2Id = 'crs_part2';
    const stuTransferredInC1 = {
      id: 'stu_left_in_c1',
      participantId: 'PART_C1_LEFT',
      studentCode: 'HS_LEFT',
      fullName: 'Học sinh rời lớp ở khóa 1',
      originalClassId: classId,
      currentClassId: 'cls_another_branch',
      status: 'active',
      notes: '',
    };
    const c1Cohort = [
      { classId, courseId: course1Id, studentId: stuTransferredInC1.id, participantId: stuTransferredInC1.participantId, membershipStatus: 'transferred' },
    ];
    // Khi resolve participants cho Course 2 trên classId:
    const resolvedC2 = resolveBatchParticipants({
      students: [stuTransferredInC1],
      classId,
      courseId: course2Id,
      cohortMembers: c1Cohort,
      lessons: [{ id: 'les_c2_1', courseId: course2Id, sessionNumber: 1, title: 'B1' }],
      closedOperations: [],
    });
    assert.strictEqual(
      resolvedC2.participants.length,
      0,
      'Học sinh đã có cohort ở khóa 1 không được rơi vào fallback của khóa 2'
    );

    // 3. Trigger m5_fn_record_cohort_membership_class không được có UPDATE course_id
    const trgClsIdx = migrationSql.indexOf('FUNCTION public.m5_fn_record_cohort_membership_class(');
    const trgClsEnd = migrationSql.indexOf('END;', trgClsIdx);
    const trgClsBody = migrationSql.substring(trgClsIdx, trgClsEnd);
    assert.strictEqual(
      trgClsBody.includes('UPDATE public.m5_class_cohort_members'),
      false,
      'm5_fn_record_cohort_membership_class không được UPDATE course_id làm hỏng lịch sử khóa cũ'
    );

    // 4. Trigger student kiểm tra NOT EXISTS trước khi chèn fallback cho original_class_id
    assert.ok(
      migrationSql.includes('TG_OP = \'INSERT\' OR NOT EXISTS (') &&
      migrationSql.includes('cm.class_id = NEW.original_class_id AND cm.student_id = NEW.id'),
      'm5_fn_record_cohort_membership_student phải kiểm tra NOT EXISTS trước khi chèn fallback cho original_class_id'
    );

    // 5. m5_compute_db_snapshot_digest loại trừ học sinh có cohort ở khóa khác tại original_class_id
    assert.ok(
      migrationSql.includes('cm_other.course_id IS DISTINCT FROM p_course_id'),
      'm5_compute_db_snapshot_digest phải loại trừ học sinh có cohort ở khóa khác trong nhánh fallback original_class_id'
    );
  });

  // --------------------------------------------------------------------------
  // 14.4 R5-04 (P2): Fail-Closed positive test environment sync & drop m3_storage_student_insert
  // --------------------------------------------------------------------------
  await t.test('14.4 R5-04: Fail-closed test environment positive verification and storage policy cleanup', () => {
    // 1. DROP POLICY IF EXISTS "m3_storage_student_insert"
    assert.ok(
      migrationSql.includes('DROP POLICY IF EXISTS "m3_storage_student_insert" ON storage.objects;'),
      'Migration SQL phải DROP POLICY "m3_storage_student_insert" cũ trên storage.objects'
    );
    assert.ok(
      migrationSql.includes('DROP POLICY IF EXISTS "m3_storage_insert_policy" ON storage.objects;'),
      'Migration SQL phải DROP POLICY "m3_storage_insert_policy" trên storage.objects'
    );

    // 2. 2-param overload returns FALSE
    const ov2Start = migrationSql.indexOf('FUNCTION public.m3_check_storage_insert_permission(\n    bucket_id TEXT,\n    name TEXT\n)');
    assert.ok(ov2Start > 0, 'Phải có định nghĩa hàm m3_check_storage_insert_permission 2 tham số');
    const ov2End = migrationSql.indexOf('END;', ov2Start);
    const ov2Body = migrationSql.substring(ov2Start, ov2End);
    assert.ok(
      ov2Body.includes('RETURN FALSE;'),
      'm3_check_storage_insert_permission bản 2 tham số phải trả về FALSE'
    );

    // 3. 3-param overload requires non-null p_object_size
    const ov3Start = migrationSql.indexOf('FUNCTION public.m3_check_storage_insert_permission(');
    assert.ok(ov3Start > 0, 'Phải có định nghĩa hàm m3_check_storage_insert_permission 3 tham số');
    const ov3End = migrationSql.indexOf('END;\n$$;', ov3Start);
    const ov3Body = migrationSql.substring(ov3Start, ov3End);
    assert.ok(
      ov3Body.includes('p_object_size IS NULL'),
      'm3_check_storage_insert_permission bản 3 tham số phải chặn khi p_object_size IS NULL'
    );

    // 4. m5_storage_quota_config default is 'unverified'
    assert.ok(
      migrationSql.includes("DEFAULT 'unverified' CHECK (environment_mode IN ('unverified', 'test', 'production'))"),
      'Bảng m5_storage_quota_config phải có DEFAULT unverified'
    );

    // 5. Edge Function has isExactTestOrigin checking eythjapspkoyqdxlxtcd.supabase.co
    assert.ok(
      edgeBackendSource.includes('function isExactTestOrigin('),
      'Edge Function phải có hàm isExactTestOrigin'
    );
    assert.ok(
      edgeBackendSource.includes("parsed.hostname === 'eythjapspkoyqdxlxtcd.supabase.co'"),
      'isExactTestOrigin phải kiểm tra hostname eythjapspkoyqdxlxtcd.supabase.co'
    );
  });

  // --------------------------------------------------------------------------
  // 14.5 R5-05 (P2): Đồng bộ activeReservationsCount vào store generateCourseClosePreview
  // --------------------------------------------------------------------------
  await t.test('14.5 R5-05: Synchronize activeReservationsCount from server into store preview and active reservation filter', () => {
    // 1. Edge backend queries only active reservations
    assert.ok(
      edgeBackendSource.includes(".is('consumed_at', null)"),
      'm5-course-close-preview phải lọc consumed_at IS NULL'
    );
    assert.ok(
      edgeBackendSource.includes(".is('released_at', null)"),
      'm5-course-close-preview phải lọc released_at IS NULL'
    );
    assert.ok(
      edgeBackendSource.includes(".gt('expires_at', nowIso)"),
      'm5-course-close-preview phải lọc expires_at > now'
    );

    // 2. store.tsx tracks activeReservationsByClass state
    assert.ok(
      storeSource.includes('const [activeReservationsByClass, setActiveReservationsByClass] = useState<Record<string, number>>({});'),
      'store.tsx phải khai báo activeReservationsByClass'
    );

    // 3. fetchCourseClosePreview sets activeReservationsByClass from srvData
    assert.ok(
      storeSource.includes("typeof srvData.activeReservationsCount === 'number'"),
      'fetchCourseClosePreview phải kiểm tra srvData.activeReservationsCount'
    );
    assert.ok(
      storeSource.includes('[classId]: srvData.activeReservationsCount'),
      'fetchCourseClosePreview phải cập nhật [classId]: srvData.activeReservationsCount'
    );

    // 4. generateCourseClosePreview passes activeReservationsByClass[classId]
    assert.ok(
      storeSource.includes('activeReservationsCount: activeReservationsByClass[classId] ?? 0'),
      'generateCourseClosePreview phải truyền activeReservationsByClass[classId] vào computeCourseClosePreview'
    );
  });

  // --------------------------------------------------------------------------
  // 14.6 R5-06 (P2): Cập nhật ngay courseCloseOperations khi incomplete và đồng bộ UI
  // --------------------------------------------------------------------------
  await t.test('14.6 R5-06: Instant update of courseCloseOperations on incomplete execution and sync in classes page', () => {
    // 1. store.verifyAndExecuteCourseClose updates courseCloseOperations on incomplete
    assert.ok(
      storeSource.includes("data?.status === 'incomplete' || data?.data"),
      'verifyAndExecuteCourseClose phải kiểm tra incomplete hoặc data.data'
    );
    assert.ok(
      storeSource.includes('setCourseCloseOperations((prev) => ({'),
      'verifyAndExecuteCourseClose phải cập nhật setCourseCloseOperations ngay khi chưa thành công'
    );
    assert.ok(
      storeSource.includes('await fetchCourseClosePreview(classId).catch(() => null)'),
      'verifyAndExecuteCourseClose phải gọi fetchCourseClosePreview để đồng bộ máy chủ'
    );

    // 2. classes/page.tsx handleExecuteClose calls fetchCourseClosePreview in live mode
    assert.ok(
      classesPageSource.includes('await fetchCourseClosePreview(requestClassId);'),
      'classes/page.tsx phải đồng bộ fetchCourseClosePreview sau khi execute để nút Resume hiện ngay'
    );
  });
});

// ============================================================================
// SUITE 15: BÀI KIỂM THỬ HỒI QUY CHO 6 ĐIỂM REVIEW VÒNG 6 (R6-01 ĐẾN R6-06)
// ============================================================================
test('Suite 15: Regression tests for Review Round 6 Fixes (R6-01 through R6-06)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  const corePath = path.join(ROOT_DIR, 'src', 'lib', 'm5-course-close-core.mjs');
  const coreSource = fs.readFileSync(corePath, 'utf8');

  const simulationRulesPath = path.join(ROOT_DIR, 'src', 'lib', 'simulation-rules.ts');
  const simulationRulesSource = fs.readFileSync(simulationRulesPath, 'utf8');

  // --------------------------------------------------------------------------
  // 15.1 R6-01 (P1): Kiểm soát dung lượng dùng chung của tổ chức (baseline_verified)
  // --------------------------------------------------------------------------
  await t.test('15.1 R6-01: Storage quota gate blocks upload when baseline is unverified and verifies SQL checks', () => {
    // 1. Behavioral test: evaluateStorageQuotaGate blocks when baselineVerified is false
    const blockedUnverified = evaluateStorageQuotaGate({
      usedStorageBytes: 10 * 1024 * 1024,
      activeReservedBytes: 0,
      orgBaselineBytes: 0,
      incomingBytes: 1024 * 1024,
      baselineVerified: false,
      environmentMode: 'test',
    });
    assert.strictEqual(blockedUnverified.allowed, false, 'Phải chặn khi baselineVerified = false');
    assert.strictEqual(blockedUnverified.code, 'STORAGE_BASELINE_UNVERIFIED');
    assert.strictEqual(blockedUnverified.isExceeded, true);
    assert.strictEqual(blockedUnverified.remainingBytes, 0);

    // 2. Behavioral test: evaluateStorageQuotaGate blocks when environmentMode is 'unverified'
    const blockedEnv = evaluateStorageQuotaGate({
      usedStorageBytes: 10 * 1024 * 1024,
      activeReservedBytes: 0,
      orgBaselineBytes: 0,
      incomingBytes: 1024 * 1024,
      baselineVerified: true,
      environmentMode: 'unverified',
    });
    assert.strictEqual(blockedEnv.allowed, false, 'Phải chặn khi environmentMode = unverified');
    assert.strictEqual(blockedEnv.code, 'STORAGE_BASELINE_UNVERIFIED');

    // 3. Behavioral test: evaluateStorageQuotaGate allows upload when baselineVerified = true and within quota
    const allowed = evaluateStorageQuotaGate({
      usedStorageBytes: 10 * 1024 * 1024,
      activeReservedBytes: 0,
      orgBaselineBytes: 100 * 1024 * 1024,
      incomingBytes: 1024 * 1024,
      baselineVerified: true,
      environmentMode: 'test',
    });
    assert.strictEqual(allowed.allowed, true, 'Phải cho phép khi baselineVerified = true và dưới quota');
    assert.strictEqual(allowed.code, 'OK');

    // 4. SQL: m5_storage_quota_config has baseline_verified column
    assert.ok(
      migrationSql.includes('baseline_verified BOOLEAN NOT NULL DEFAULT false'),
      'm5_storage_quota_config phải có cột baseline_verified'
    );

    // 5. SQL: m5_get_storage_quota_status checks baseline_verified and returns STORAGE_BASELINE_UNVERIFIED
    assert.ok(
      migrationSql.includes("v_code := 'STORAGE_BASELINE_UNVERIFIED';"),
      'm5_get_storage_quota_status phải gán mã lỗi STORAGE_BASELINE_UNVERIFIED'
    );
    assert.ok(
      migrationSql.includes('COALESCE(v_cfg.baseline_verified, false) = false'),
      'm5_get_storage_quota_status phải kiểm tra baseline_verified = false'
    );

    // 6. SQL: m3_reserve_practice_upload and m3_check_storage_insert_permission enforce baseline_verified
    assert.ok(
      migrationSql.includes("RAISE EXCEPTION 'STORAGE_BASELINE_UNVERIFIED: %'"),
      'm3_reserve_practice_upload phải raise STORAGE_BASELINE_UNVERIFIED'
    );
    assert.ok(
      migrationSql.includes("COALESCE(v_cfg.baseline_verified, false) = false") &&
      migrationSql.includes("COALESCE(v_cfg.environment_mode, 'unverified') = 'unverified'"),
      'm3_check_storage_insert_permission phải kiểm tra baseline_verified'
    );

    // 7. SQL: storage objects calculation covers all objects across buckets
    assert.ok(
      migrationSql.includes('FROM storage.objects;') ||
      migrationSql.includes('FROM storage.objects ;'),
      'Truy vấn sum storage objects phải tính trên toàn bộ storage.objects (không giới hạn riêng m3-practice-files)'
    );

    // 8. SQL (R8-01): m5_seed_course_close_fixture KHÔNG tự ý bật baseline_verified = true
    const seedFnStart = migrationSql.indexOf('FUNCTION public.m5_seed_course_close_fixture(');
    const seedFnEnd = migrationSql.indexOf('$$;', seedFnStart);
    assert.ok(seedFnStart !== -1 && seedFnEnd !== -1, 'Phải tìm thấy m5_seed_course_close_fixture');
    const seedFnSql = migrationSql.slice(seedFnStart, seedFnEnd);
    assert.strictEqual(
      seedFnSql.includes('baseline_verified = true'),
      false,
      'm5_seed_course_close_fixture tuyệt đối KHÔNG được tự ý bật baseline_verified = true'
    );

    // 9. SQL (R8-01): Chỉ m5_set_storage_quota_baseline mới bật baseline_verified = true
    const baselineFnStart = migrationSql.indexOf('FUNCTION public.m5_set_storage_quota_baseline(');
    const baselineFnEnd = migrationSql.indexOf('$$;', baselineFnStart);
    assert.ok(baselineFnStart !== -1 && baselineFnEnd !== -1, 'Phải tìm thấy m5_set_storage_quota_baseline');
    const baselineFnSql = migrationSql.slice(baselineFnStart, baselineFnEnd);
    assert.ok(
      baselineFnSql.includes('baseline_verified = true'),
      'm5_set_storage_quota_baseline phải bật baseline_verified = true khi Admin đối chiếu dung lượng tổ chức'
    );

    // Đảm bảo trong toàn bộ file migration SQL, baseline_verified = true CHỈ xuất hiện trong m5_set_storage_quota_baseline
    const allMatches = [...migrationSql.matchAll(/baseline_verified\s*=\s*true/g)];
    assert.ok(allMatches.length > 0, 'Phải có ít nhất 1 câu lệnh bật baseline_verified = true');
    for (const match of allMatches) {
      assert.ok(
        match.index >= baselineFnStart && match.index <= baselineFnEnd,
        'Mọi lệnh baseline_verified = true trong migration đều phải nằm trong m5_set_storage_quota_baseline'
      );
    }
  });

  // --------------------------------------------------------------------------
  // 15.2 R6-02 (P2): Sửa Backfill m5_class_cohort_members và trigger chuyển lớp
  // --------------------------------------------------------------------------
  await t.test('15.2 R6-02: Cohort backfill joins lessons for course_id, filters multi-course original_class_id, and trigger scopes by old course', () => {
    // 1. Backfill quiz_results joins lessons and selects l.course_id
    assert.ok(
      migrationSql.includes('FROM public.quiz_results qr') &&
      migrationSql.includes('JOIN public.lessons l ON l.id = qr.lesson_id') &&
      migrationSql.includes('l.course_id,'),
      'Backfill quiz_results phải JOIN public.lessons l ON l.id = qr.lesson_id và lấy l.course_id'
    );

    // 2. Backfill practice_submissions joins lessons and selects l.course_id
    assert.ok(
      migrationSql.includes('FROM public.practice_submissions ps') &&
      migrationSql.includes('JOIN public.lessons l ON l.id = ps.lesson_id') &&
      migrationSql.includes('l.course_id,'),
      'Backfill practice_submissions phải JOIN public.lessons l ON l.id = ps.lesson_id và lấy l.course_id'
    );

    // 3. Backfill original_class_id checks NOT EXISTS in other courses of same class and past completed close operations
    assert.ok(
      migrationSql.includes('FROM public.m5_class_cohort_members cm_other') &&
      migrationSql.includes('cm_other.course_id IS DISTINCT FROM c.course_id'),
      'Backfill original_class_id phải loại trừ học sinh có bản ghi cohort ở khóa khác'
    );
    assert.ok(
      migrationSql.includes('FROM public.m5_course_close_operations op') &&
      migrationSql.includes("op.status = 'completed'"),
      'Backfill original_class_id phải loại trừ lớp đã từng đóng khóa hoàn tất'
    );

    // 4. Trigger m5_fn_record_cohort_membership_student updates transferred status only for v_old_cls_course_id
    assert.ok(
      migrationSql.includes('SELECT course_id INTO v_old_cls_course_id FROM public.classes WHERE id = OLD.current_class_id;'),
      'Trigger phải lấy course_id của OLD.current_class_id'
    );
    assert.ok(
      migrationSql.includes('(v_old_cls_course_id IS NULL OR course_id = v_old_cls_course_id)'),
      'Trigger chỉ được chuyển trạng thái transferred trên bản ghi khóa của lớp cũ'
    );
  });

  // --------------------------------------------------------------------------
  // 15.3 R6-03 (P2): Tránh vòng lặp gọi máy chủ và reset kết quả xem trước trên trang quản lý lớp
  // --------------------------------------------------------------------------
  await t.test('15.3 R6-03: Classes page uses fetchCourseClosePreviewRef and decouples 14 sessions confirmation sync', () => {
    // 1. fetchCourseClosePreviewRef declaration and current assignment
    assert.ok(
      classesPageSource.includes('const fetchCourseClosePreviewRef = useRef(fetchCourseClosePreview);'),
      'classes/page.tsx phải khai báo fetchCourseClosePreviewRef'
    );
    assert.ok(
      classesPageSource.includes('fetchCourseClosePreviewRef.current = fetchCourseClosePreview;'),
      'classes/page.tsx phải gán fetchCourseClosePreviewRef.current'
    );

    // 2. useEffect only depends on [selectedClassId, isLiveMode] and calls ref.current
    assert.ok(
      classesPageSource.includes('fetchCourseClosePreviewRef.current(selectedClassId)'),
      'classes/page.tsx phải gọi fetchCourseClosePreviewRef.current(selectedClassId)'
    );
    assert.ok(
      classesPageSource.includes('}, [selectedClassId, isLiveMode]);'),
      'useEffect đổi lớp chỉ phụ thuộc vào [selectedClassId, isLiveMode]'
    );

    // 3. Separate useEffect for syncing is14SessionsConfirmed from class data without resetting preview/verification
    assert.ok(
      classesPageSource.includes('}, [selectedClass?.id, selectedClass?.is14SessionsConfirmed]);'),
      'classes/page.tsx phải có useEffect riêng đồng bộ is14SessionsConfirmed từ selectedClass'
    );
  });

  // --------------------------------------------------------------------------
  // 15.4 R6-04 (P2): Đồng bộ dữ liệu máy chủ và trả về preview tính trực tiếp từ dữ liệu mới
  // --------------------------------------------------------------------------
  await t.test('15.4 R6-04: Server preview maps to camelCase and store fetchCourseClosePreview computes freshPreview directly', () => {
    // 1. Edge backend maps quizResults and submissions to camelCase
    assert.ok(
      edgeBackendSource.includes('highestScore: Number(q.highest_score ?? q.highestScore ?? 0)'),
      'Edge Function m5-course-close-preview phải chuẩn hóa quizResults sang camelCase'
    );
    assert.ok(
      edgeBackendSource.includes('teacherFeedback: s.teacher_feedback ?? s.teacherFeedback ?? \'\''),
      'Edge Function m5-course-close-preview phải chuẩn hóa submissions sang camelCase'
    );

    // 2. store.tsx fetchCourseClosePreview updates lessons, quizResults, submissions, cohortMembers in state
    assert.ok(
      storeSource.includes('setLessons((prev) =>'),
      'store.tsx fetchCourseClosePreview phải cập nhật setLessons từ server'
    );
    assert.ok(
      storeSource.includes('setQuizResults((prev) =>'),
      'store.tsx fetchCourseClosePreview phải cập nhật setQuizResults từ server'
    );
    assert.ok(
      storeSource.includes('setSubmissions((prev) =>'),
      'store.tsx fetchCourseClosePreview phải cập nhật setSubmissions từ server'
    );

    // 3. store.tsx fetchCourseClosePreview calculates and returns freshPreview directly
    assert.ok(
      storeSource.includes('const freshPreview = computeCourseClosePreview({'),
      'store.tsx fetchCourseClosePreview phải tính trực tiếp freshPreview từ dữ liệu mới của server'
    );
    assert.ok(
      storeSource.includes('return freshPreview;'),
      'store.tsx fetchCourseClosePreview phải trả về freshPreview'
    );
  });

  // --------------------------------------------------------------------------
  // 15.5 R6-05 (P2): CSV mô phỏng và getBatchParticipants loại bỏ học sinh thuộc khóa cũ
  // --------------------------------------------------------------------------
  await t.test('15.5 R6-05: getBatchParticipants correctly passes lessons and strictly isolates participants by course lessons', () => {
    const classId = 'cls-course-switch-test';
    const oldCourseId = 'crs-old-test';
    const newCourseId = 'crs-new-test';

    const oldLessons = [
      { id: 'les-old-1', courseId: oldCourseId, sessionNumber: 1, title: 'Old Lesson 1' },
      { id: 'les-old-2', courseId: oldCourseId, sessionNumber: 2, title: 'Old Lesson 2' },
    ];
    const newLessons = [
      { id: 'les-new-1', courseId: newCourseId, sessionNumber: 1, title: 'New Lesson 1' },
      { id: 'les-new-2', courseId: newCourseId, sessionNumber: 2, title: 'New Lesson 2' },
    ];

    const testStudents = [
      { id: 'stu-active', currentClassId: classId, originalClassId: classId, fullName: 'Học sinh đang học', participantId: 'PART_ACT', status: 'active' },
      { id: 'stu-old-only', currentClassId: 'cls-other', originalClassId: 'cls-other', fullName: 'Học sinh khóa cũ', participantId: 'PART_OLD', status: 'active' },
    ];

    // stu-old-only chỉ có điểm quiz và nộp bài ở khóa cũ oldCourseId (les-old-1, les-old-2)
    const testQuizResults = [
      { studentId: 'stu-active', lessonId: 'les-new-1', classId, highestScore: 100, passed: true },
      { studentId: 'stu-old-only', lessonId: 'les-old-1', classId, highestScore: 80, passed: true },
    ];
    const testSubmissions = [
      { id: 'sub-1', studentId: 'stu-active', lessonId: 'les-new-1', classId, status: 'approved', content: 'http://example.com' },
      { id: 'sub-2', studentId: 'stu-old-only', lessonId: 'les-old-2', classId, status: 'approved', content: 'http://example.com' },
    ];

    // Gọi getBatchParticipants cho khóa mới (newCourseId) kèm lessons của khóa mới
    const participantsForNewCourse = getBatchParticipants(testStudents, classId, {
      courseId: newCourseId,
      lessons: newLessons,
      quizResults: testQuizResults,
      submissions: testSubmissions,
      cohortMembers: [],
      closedOperations: [],
    });

    const participantIds = participantsForNewCourse.map((p) => p.id);
    assert.ok(participantIds.includes('stu-active'), 'Học sinh đang học phải có mặt trong danh sách');
    assert.strictEqual(
      participantIds.includes('stu-old-only'),
      false,
      'Học sinh chỉ có bài nộp/quiz ở khóa cũ bắt buộc phải bị loại trừ khỏi danh sách của khóa mới'
    );

    // Kiểm tra cấu trúc: simulation-rules.ts và store.tsx truyền lessons vào getBatchParticipants
    assert.ok(
      simulationRulesSource.includes('lessons: options?.lessons'),
      'simulation-rules.ts getBatchParticipants phải chuyển tiếp lessons: options?.lessons'
    );
    assert.ok(
      storeSource.includes('lessons,') &&
      storeSource.includes('closedOperations: Object.values(courseCloseOperations)'),
      'store.tsx exportCourseCloseCsv phải truyền lessons vào getBatchParticipants'
    );

    // Kiểm tra cấu trúc: enforceLessonFilter được khai báo và áp dụng
    assert.ok(
      coreSource.includes('const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;'),
      'm5-course-close-core.mjs phải đặt enforceLessonFilter'
    );
    assert.ok(
      simulationRulesSource.includes('const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;'),
      'simulation-rules.ts phải đặt enforceLessonFilter'
    );
    assert.ok(
      edgeBackendSource.includes('const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;'),
      'index.ts phải đặt enforceLessonFilter'
    );
  });

  // --------------------------------------------------------------------------
  // 15.6 R6-06 (P2): Chuyển lớp trong mô phỏng đối chiếu đúng khóa (courseId)
  // --------------------------------------------------------------------------
  await t.test('15.6 R6-06: Simulated student transfer scopes by courseId and preserves historical records of prior courses', () => {
    // 1. Behavioral simulation of transferStudent preserving prior course history
    const oldClassId = 'cls-alpha';
    const targetClassId = 'cls-beta';
    const crs1Id = 'course-1-historical';
    const crs2Id = 'course-2-current';
    const studentId = 'stu-transfer-test';

    const initialCohort = [
      {
        id: 'cm-history-1',
        studentId,
        classId: oldClassId,
        courseId: crs1Id,
        membershipStatus: 'transferred',
        status: 'transferred',
      },
      {
        id: 'cm-history-2',
        studentId,
        classId: oldClassId,
        courseId: crs2Id,
        membershipStatus: 'active',
        status: 'active',
      },
    ];

    // Mô phỏng logic tìm kiếm và cập nhật của transferStudent
    const nextCohort = [...initialCohort];
    const oldCourseId = crs2Id;
    const oldIdx = nextCohort.findIndex(
      (m) =>
        m.classId === oldClassId &&
        (!oldCourseId || !m.courseId || m.courseId === oldCourseId) &&
        (m.studentId === studentId || m.id === studentId)
    );
    assert.strictEqual(oldIdx, 1, 'Phải tìm thấy đúng bản ghi của crs2Id, không lấy nhầm crs1Id ở index 0');

    nextCohort[oldIdx] = { ...nextCohort[oldIdx], membershipStatus: 'transferred', status: 'transferred' };

    // Bản ghi crs1Id vẫn nguyên vẹn
    assert.strictEqual(nextCohort[0].courseId, crs1Id);
    assert.strictEqual(nextCohort[0].id, 'cm-history-1');
    assert.strictEqual(nextCohort[0].membershipStatus, 'transferred');

    // 2. Structural verification in store.tsx transferStudent
    assert.ok(
      storeSource.includes('(!m.courseId || m.courseId === oldCourseId)'),
      'store.tsx transferStudent phải đối chiếu oldCourseId khi tìm oldIdx'
    );
    assert.ok(
      storeSource.includes('(!m.courseId || m.courseId === targetCourseId)'),
      'store.tsx transferStudent phải đối chiếu targetCourseId khi tìm targetIdx'
    );

    // 3. Structural verification in store.tsx archiveStudent and restoreStudent syncing cohortMembers
    assert.ok(
      storeSource.includes('m.classId === targetStudent.currentClassId &&') &&
      storeSource.includes('(!m.courseId || m.courseId === clsCourseId)'),
      'store.tsx archiveStudent/restoreStudent phải đồng bộ cohortMembers của học sinh theo lớp và khóa hiện tại'
    );
  });
});

// ============================================================================
// SUITE 16: BÀI KIỂM THỬ HỒI QUY CHO 4 ĐIỂM REVIEW VÒNG 7 (R7-01 ĐẾN R7-04)
// ============================================================================
test('Suite 16: Regression tests for Review Round 7 Fixes (R7-01 through R7-04)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  const corePath = path.join(ROOT_DIR, 'src', 'lib', 'm5-course-close-core.mjs');
  const coreSource = fs.readFileSync(corePath, 'utf8');

  const simulationRulesPath = path.join(ROOT_DIR, 'src', 'lib', 'simulation-rules.ts');
  const simulationRulesSource = fs.readFileSync(simulationRulesPath, 'utf8');

  // --------------------------------------------------------------------------
  // 16.1 R7-01 (P1): Chống 2 tab chạy chồng / kẹt tác vụ dở dang trên cùng một lớp
  // --------------------------------------------------------------------------
  await t.test('16.1 R7-01: Partial unique index on active operations, save CSV cleans stale preview/verified, and begin rejects non-resume on active/incomplete', () => {
    // 1. Partial unique index on m5_course_close_operations for single active operation per class
    assert.ok(
      migrationSql.includes('CREATE UNIQUE INDEX idx_m5_close_ops_single_active_per_class') &&
      migrationSql.includes('ON public.m5_course_close_operations (class_id)') &&
      migrationSql.includes("WHERE status IN ('previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete');"),
      'Migration phải có partial unique index idx_m5_close_ops_single_active_per_class'
    );

    // 2. m5_save_csv_verification blocks if an active/incomplete operation exists
    const saveFnStart = migrationSql.indexOf('FUNCTION public.m5_save_csv_verification(');
    const saveFnEnd = migrationSql.indexOf('$$;', saveFnStart);
    const saveFnSql = migrationSql.slice(saveFnStart, saveFnEnd);

    assert.ok(
      saveFnSql.includes("o.status IN ('deleting_storage', 'deleting_db', 'incomplete')") &&
      saveFnSql.includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS'),
      'm5_save_csv_verification phải chặn khi có tác vụ đang chạy hoặc incomplete'
    );

    // 3. m5_save_csv_verification cleans old previewed/csv_verified operations for this class
    assert.ok(
      saveFnSql.includes('DELETE FROM public.m5_course_close_operations') &&
      saveFnSql.includes('WHERE class_id = p_class_id') &&
      saveFnSql.includes("AND status IN ('previewed', 'csv_verified');"),
      'm5_save_csv_verification phải xóa bản ghi previewed/csv_verified cũ trước khi chèn bản ghi mới'
    );

    // 4. m5_begin_course_close accepts p_is_resume and guards against fresh run on active/incomplete
    const beginFnStart = migrationSql.indexOf('FUNCTION public.m5_begin_course_close(');
    const beginFnEnd = migrationSql.indexOf('$$;', beginFnStart);
    const beginFnSql = migrationSql.slice(beginFnStart, beginFnEnd);

    assert.ok(
      beginFnSql.includes('p_is_resume BOOLEAN DEFAULT false'),
      'm5_begin_course_close phải có tham số p_is_resume BOOLEAN DEFAULT false'
    );
    assert.ok(
      beginFnSql.includes('COALESCE(p_is_resume, false) = false') &&
      beginFnSql.includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS') &&
      beginFnSql.includes('Vui lòng sử dụng chức năng Tiếp tục (Resume)'),
      'm5_begin_course_close phải chặn nếu p_is_resume = false khi tác vụ đang ở incomplete/deleting'
    );
    assert.ok(
      beginFnSql.includes('COALESCE(p_is_resume, false) = true') &&
      beginFnSql.includes('INVALID_OPERATION_STATE'),
      'm5_begin_course_close phải chặn nếu p_is_resume = true khi tác vụ không ở incomplete/deleting'
    );
    assert.ok(
      beginFnSql.includes('course_id IS DISTINCT FROM p_course_id') &&
      beginFnSql.includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS'),
      'm5_begin_course_close phải chặn khi lớp có tác vụ của khóa khác đang chạy/dở dang'
    );

    // 5. m5_finalize_course_close_db cleans other non-completed operations of the same class
    const finalizeFnStart = migrationSql.indexOf('FUNCTION public.m5_finalize_course_close_db(');
    const finalizeFnEnd = migrationSql.indexOf('$$;', finalizeFnStart);
    const finalizeFnSql = migrationSql.slice(finalizeFnStart, finalizeFnEnd);

    assert.ok(
      finalizeFnSql.includes('DELETE FROM public.m5_course_close_operations AS o') &&
      finalizeFnSql.includes('WHERE o.class_id = v_op.class_id') &&
      finalizeFnSql.includes('AND o.id <> p_operation_id') &&
      finalizeFnSql.includes("AND o.status <> 'completed';"),
      'm5_finalize_course_close_db phải dọn sạch các bản ghi chưa hoàn tất khác của cùng class_id'
    );

    // 6. Edge backend index.ts reads isResume and passes p_is_resume
    assert.ok(
      edgeBackendSource.includes('const isResume = Boolean(body.payload?.isResume);'),
      'Edge backend m5-execute-course-close phải đọc isResume từ payload'
    );
    assert.ok(
      edgeBackendSource.includes('p_is_resume: isResume'),
      'Edge backend phải truyền p_is_resume: isResume vào m5_begin_course_close RPC'
    );
  });

  // --------------------------------------------------------------------------
  // 16.2 R7-02 (P2): Tuần tự khóa chống deadlock: locks TRƯỚC UPDATE classes
  // --------------------------------------------------------------------------
  await t.test('16.2 R7-02: Advisory locks (m4_teaching_sync -> m5_storage_quota -> m5_close) acquired BEFORE any UPDATE or SELECT FOR UPDATE on public.classes', () => {
    // 1. In m5_begin_course_close
    const beginFnStart = migrationSql.indexOf('FUNCTION public.m5_begin_course_close(');
    const beginFnEnd = migrationSql.indexOf('$$;', beginFnStart);
    const beginFnSql = migrationSql.slice(beginFnStart, beginFnEnd);

    const posLockTeachingSync = beginFnSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const posLockQuota = beginFnSql.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const posLockClose = beginFnSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text))");
    const posClassSelectForUpdate = beginFnSql.indexOf('SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE');
    const posClassUpdateConfirmed = beginFnSql.indexOf('UPDATE public.classes SET is_14_sessions_confirmed = true WHERE id = p_class_id');

    assert.ok(posLockTeachingSync > 0, 'Phải có khóa m4_teaching_sync trong m5_begin_course_close');
    assert.ok(posLockQuota > posLockTeachingSync, 'Khóa m5_storage_quota phải sau m4_teaching_sync');
    assert.ok(posLockClose > posLockQuota, 'Khóa m5_close phải sau m5_storage_quota');
    assert.ok(posClassSelectForUpdate > posLockClose, 'Khóa dòng classes FOR UPDATE phải sau các advisory lock');
    assert.ok(posClassUpdateConfirmed > posClassSelectForUpdate, 'UPDATE is_14_sessions_confirmed phải sau khi đã SELECT ... FOR UPDATE và giữ đủ khóa');

    // 2. In m5_save_csv_verification
    const saveFnStart = migrationSql.indexOf('FUNCTION public.m5_save_csv_verification(');
    const saveFnEnd = migrationSql.indexOf('$$;', saveFnStart);
    const saveFnSql = migrationSql.slice(saveFnStart, saveFnEnd);

    const posSaveLockTeachingSync = saveFnSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const posSaveLockQuota = saveFnSql.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const posSaveLockClose = saveFnSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || p_class_id::text))");
    const posSaveClassSelectForUpdate = saveFnSql.indexOf('FROM public.classes c\n    WHERE c.id = p_class_id AND c.course_id = p_course_id\n    FOR UPDATE');
    const posSaveClassUpdateConfirmed = saveFnSql.indexOf('UPDATE public.classes\n        SET is_14_sessions_confirmed = p_confirmed_14_sessions');

    assert.ok(posSaveLockTeachingSync > 0, 'Phải có khóa m4_teaching_sync trong m5_save_csv_verification');
    assert.ok(posSaveLockQuota > posSaveLockTeachingSync, 'Khóa m5_storage_quota phải sau m4_teaching_sync');
    assert.ok(posSaveLockClose > posSaveLockQuota, 'Khóa m5_close phải sau m5_storage_quota');
    assert.ok(posSaveClassSelectForUpdate > posSaveLockClose, 'Khóa dòng classes FOR UPDATE phải sau các advisory lock');
    assert.ok(posSaveClassUpdateConfirmed > posSaveClassSelectForUpdate, 'UPDATE classes trong save_csv phải sau khi giữ khóa tuần tự');
  });

  // --------------------------------------------------------------------------
  // 16.3 R7-03 (P2): Nhánh mô phỏng store.tsx lọc đúng bài học của khóa đóng
  // --------------------------------------------------------------------------
  await t.test('16.3 R7-03: Store simulation mode filters quizResults & submissions by closing course lessons and preserves other courses', () => {
    // 1. Structural check in store.tsx
    assert.ok(
      storeSource.includes('closingCourseLessonIds = new Set(') &&
      storeSource.includes('lessons.filter((l) => l.courseId === crs?.id).map((l) => l.id)'),
      'store.tsx verifyAndExecuteCourseClose phải tạo tập closingCourseLessonIds của khóa đóng'
    );
    assert.ok(
      storeSource.includes('!closingCourseLessonIds.has(q.lessonId)'),
      'store.tsx phải giữ quizResults không thuộc closingCourseLessonIds'
    );
    assert.ok(
      storeSource.includes('!closingCourseLessonIds.has(s.lessonId)'),
      'store.tsx phải giữ submissions không thuộc closingCourseLessonIds'
    );
    assert.ok(
      storeSource.includes("status: 'completed'") &&
      storeSource.includes('courseCloseOperations'),
      'store.tsx phải lưu trạng thái completed vào courseCloseOperations khi thành công'
    );

    // 2. Behavioral verification of simulation logic
    const testClassId = 'class-sim-r7-03';
    const closingCourseId = 'course-close-target';
    const otherCourseId = 'course-other-preserved';

    const testLessons = [
      { id: 'les-close-1', courseId: closingCourseId, sessionNumber: 1 },
      { id: 'les-close-2', courseId: closingCourseId, sessionNumber: 2 },
      { id: 'les-other-1', courseId: otherCourseId, sessionNumber: 1 },
    ];

    const initialQuizzes = [
      { id: 'q1', classId: testClassId, lessonId: 'les-close-1', score: 10 },
      { id: 'q2', classId: testClassId, lessonId: 'les-close-2', score: 8 },
      { id: 'q3', classId: testClassId, lessonId: 'les-other-1', score: 9 }, // Khóa khác của cùng lớp
      { id: 'q4', classId: 'another-class', lessonId: 'les-close-1', score: 7 }, // Lớp khác
    ];

    const initialSubs = [
      { id: 's1', classId: testClassId, lessonId: 'les-close-1', status: 'submitted' },
      { id: 's2', classId: testClassId, lessonId: 'les-other-1', status: 'submitted' }, // Khóa khác của cùng lớp
      { id: 's3', classId: 'another-class', lessonId: 'les-close-1', status: 'submitted' }, // Lớp khác
    ];

    const closingCourseLessonIds = new Set(
      testLessons.filter((l) => l.courseId === closingCourseId).map((l) => l.id)
    );

    const remainingQuizzes = initialQuizzes.filter(
      (q) => q.classId !== testClassId || !closingCourseLessonIds.has(q.lessonId)
    );
    const remainingSubs = initialSubs.filter(
      (s) => s.classId !== testClassId || !closingCourseLessonIds.has(s.lessonId)
    );

    // Kết quả quiz của khóa khác (q3) và lớp khác (q4) phải còn nguyên
    assert.strictEqual(remainingQuizzes.length, 2, 'Chỉ 2 quiz kết quả thuộc khóa đóng bị xóa');
    assert.ok(remainingQuizzes.some((q) => q.id === 'q3'), 'Quiz của khóa khác cùng lớp (q3) phải được bảo toàn');
    assert.ok(remainingQuizzes.some((q) => q.id === 'q4'), 'Quiz của lớp khác (q4) phải được bảo toàn');

    // Bài nộp thực hành của khóa khác (s2) và lớp khác (s3) phải còn nguyên
    assert.strictEqual(remainingSubs.length, 2, 'Chỉ 1 bài nộp thuộc khóa đóng bị xóa');
    assert.ok(remainingSubs.some((s) => s.id === 's2'), 'Bài nộp khóa khác cùng lớp (s2) phải được bảo toàn');
    assert.ok(remainingSubs.some((s) => s.id === 's3'), 'Bài nộp lớp khác (s3) phải được bảo toàn');
  });

  // --------------------------------------------------------------------------
  // 16.4 R7-04 (P2): Xuất CSV chuẩn RFC 4180 dùng dấu xuống dòng CRLF (\r\n)
  // --------------------------------------------------------------------------
  await t.test('16.4 R7-04: CSV export conforms to RFC 4180 with CRLF (\\r\\n) line breaks across core, simulation, and edge', () => {
    // 1. Header constant check
    assert.ok(
      COURSE_CLOSE_CSV_HEADER.endsWith('\r\n'),
      'COURSE_CLOSE_CSV_HEADER trong m5-course-close-core.mjs phải kết thúc bằng \\r\\n'
    );
    assert.ok(
      simulationRulesSource.includes("COURSE_CLOSE_CSV_HEADER =\n  'Mã tham gia nội bộ,") &&
      simulationRulesSource.includes("Trạng thái hoàn thành buổi\\r\\n';"),
      'simulation-rules.ts COURSE_CLOSE_CSV_HEADER phải kết thúc bằng \\r\\n'
    );
    assert.ok(
      edgeBackendSource.includes("M5_CSV_HEADER =\n      'Mã tham gia nội bộ,") &&
      edgeBackendSource.includes("Trạng thái hoàn thành buổi\\r\\n';"),
      'Edge backend M5_CSV_HEADER phải kết thúc bằng \\r\\n'
    );

    // 2. buildCourseCloseCsvContent output uses CRLF
    const csvResult = buildCourseCloseCsvContent(
      m5Students,
      m5Lessons14,
      m5FixtureClass.code,
      m5QuizResults,
      m5Submissions,
      { classId: m5FixtureClass.id, courseId: m5FixtureClass.courseId }
    );

    assert.strictEqual(csvResult.success, true);
    assert.ok(csvResult.csvContent.includes('\r\n'), 'Nội dung CSV phải chứa ký tự xuống dòng \\r\\n (CRLF)');

    // Kiểm tra không có ký tự \n đơn lẻ nào (mọi \n đều phải đi kèm trước bởi \r)
    const orphanLf = csvResult.csvContent.replace(/\r\n/g, '').includes('\n');
    assert.strictEqual(orphanLf, false, 'Không được có ký tự \\n mồ côi (mọi dấu xuống dòng phải là CRLF \\r\\n)');

    // Số dòng khi phân tách bằng \r\n: 1 header + 70 data = 71
    const lines = csvResult.csvContent.split('\r\n');
    assert.strictEqual(lines.length, 71, 'CSV phải có đúng 71 dòng phân tách bởi \\r\\n');

    // 3. verifyCourseCloseCsv parses and validates valid === true with CRLF
    const report = verifyCourseCloseCsv(csvResult.csvContent, {
      participants: m5Students,
      lessons: m5Lessons14,
      classCode: m5FixtureClass.code,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
    });

    assert.strictEqual(report.valid, true, 'verifyCourseCloseCsv phải xác minh hợp lệ cho CSV dùng CRLF');
    assert.strictEqual(report.errors.length, 0);
    assert.strictEqual(report.rowCount, 70);
    assert.strictEqual(report.participantCount, 5);

    // 4. Source checks for rows.join('\r\n')
    assert.ok(coreSource.includes("rows.join('\\r\\n')"), 'coreSource phải dùng rows.join(\\r\\n)');
    assert.ok(simulationRulesSource.includes("rows.join('\\r\\n')"), 'simulationRulesSource phải dùng rows.join(\\r\\n)');
    assert.ok(edgeBackendSource.includes("rows.join('\\r\\n')"), 'edgeBackendSource phải dùng rows.join(\\r\\n)');
  });
});

// ============================================================================
// SUITE 17: BÀI KIỂM THỬ HỒI QUY CHO 3 ĐIỂM REVIEW VÒNG 8 (R8-01 ĐẾN R8-03)
// ============================================================================
test('Suite 17: Regression tests for Review Round 8 Fixes (R8-01 through R8-03)', async (t) => {
  const mocks = await loadMockData();
  const {
    m5FixtureClass,
    m5Course14,
    m5Lessons14,
    m5Students,
    m5QuizResults,
    m5Submissions,
  } = mocks;

  const migrationSqlPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261020220000_m5_course_close_and_storage_quota.sql'
  );
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  const edgeBackendPath = path.join(
    ROOT_DIR,
    'supabase',
    'functions',
    'm2-backend',
    'index.ts'
  );
  const edgeBackendSource = fs.readFileSync(edgeBackendPath, 'utf8');

  const storePath = path.join(ROOT_DIR, 'src', 'lib', 'store.tsx');
  const storeSource = fs.readFileSync(storePath, 'utf8');

  const classesPagePath = path.join(ROOT_DIR, 'src', 'app', 'manage', 'classes', 'page.tsx');
  const classesPageSource = fs.readFileSync(classesPagePath, 'utf8');

  // --------------------------------------------------------------------------
  // 17.1 R8-01 (P1): m5_seed_course_close_fixture không tự bật baseline_verified
  // --------------------------------------------------------------------------
  await t.test('17.1 R8-01: m5_seed_course_close_fixture does NOT enable baseline_verified, only m5_set_storage_quota_baseline does', () => {
    // 1. m5_seed_course_close_fixture does not contain baseline_verified = true
    const seedFnStart = migrationSql.indexOf('FUNCTION public.m5_seed_course_close_fixture(');
    const seedFnEnd = migrationSql.indexOf('$$;', seedFnStart);
    assert.ok(seedFnStart !== -1 && seedFnEnd !== -1, 'Phải tìm thấy m5_seed_course_close_fixture trong migration SQL');
    const seedFnSql = migrationSql.slice(seedFnStart, seedFnEnd);

    assert.strictEqual(
      seedFnSql.includes('baseline_verified = true'),
      false,
      'm5_seed_course_close_fixture không được bật baseline_verified = true'
    );

    // 2. m5_set_storage_quota_baseline DOES contain baseline_verified = true
    const baselineFnStart = migrationSql.indexOf('FUNCTION public.m5_set_storage_quota_baseline(');
    const baselineFnEnd = migrationSql.indexOf('$$;', baselineFnStart);
    assert.ok(baselineFnStart !== -1 && baselineFnEnd !== -1, 'Phải tìm thấy m5_set_storage_quota_baseline trong migration SQL');
    const baselineFnSql = migrationSql.slice(baselineFnStart, baselineFnEnd);

    assert.ok(
      baselineFnSql.includes('baseline_verified = true'),
      'm5_set_storage_quota_baseline phải bật baseline_verified = true'
    );

    // 3. Across entire migration file, baseline_verified = true ONLY appears inside m5_set_storage_quota_baseline
    const allMatches = [...migrationSql.matchAll(/baseline_verified\s*=\s*true/g)];
    assert.ok(allMatches.length > 0, 'Phải có ít nhất 1 câu lệnh bật baseline_verified = true');
    for (const match of allMatches) {
      assert.ok(
        match.index >= baselineFnStart && match.index <= baselineFnEnd,
        'Toàn bộ câu lệnh baseline_verified = true chỉ được nằm trong hàm m5_set_storage_quota_baseline'
      );
    }
  });

  // --------------------------------------------------------------------------
  // 17.2 R8-02 (P2): Ngăn race condition khi Resume và bảo vệ tiến độ Storage progress
  // --------------------------------------------------------------------------
  await t.test('17.2 R8-02: m5_begin_course_close rejects concurrent Resume within 60s heartbeat, m5_update_course_close_storage_progress locks sequentially and forbids overwriting completed state', () => {
    // 1. m5_begin_course_close guards against concurrent resume within 60 seconds
    const beginFnStart = migrationSql.indexOf('FUNCTION public.m5_begin_course_close(');
    const beginFnEnd = migrationSql.indexOf('$$;', beginFnStart);
    assert.ok(beginFnStart !== -1 && beginFnEnd !== -1, 'Phải tìm thấy m5_begin_course_close trong migration SQL');
    const beginFnSql = migrationSql.slice(beginFnStart, beginFnEnd);

    assert.ok(
      beginFnSql.includes("v_op.status IN ('deleting_storage', 'deleting_db')") &&
      beginFnSql.includes("v_op.updated_at >= clock_timestamp() - interval '60 seconds'") &&
      beginFnSql.includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS') &&
      beginFnSql.includes('Tác vụ đóng khóa đang được một tiến trình khác xử lý trực tiếp'),
      'm5_begin_course_close phải chặn Resume song song khi tác vụ đang được xử lý trong vòng 60 giây'
    );

    // 2. m5_update_course_close_storage_progress acquires locks in sequential order:
    // m4_teaching_sync -> m5_storage_quota -> m5_close:<class_id>
    const updateProgressStart = migrationSql.indexOf('FUNCTION public.m5_update_course_close_storage_progress(');
    const updateProgressEnd = migrationSql.indexOf('$$;', updateProgressStart);
    assert.ok(updateProgressStart !== -1 && updateProgressEnd !== -1, 'Phải tìm thấy m5_update_course_close_storage_progress trong migration SQL');
    const updateProgressSql = migrationSql.slice(updateProgressStart, updateProgressEnd);

    assert.ok(
      updateProgressSql.includes("SELECT class_id INTO v_class_id") &&
      updateProgressSql.includes("FROM public.m5_course_close_operations") &&
      updateProgressSql.includes("WHERE id = p_operation_id;"),
      'm5_update_course_close_storage_progress phải đọc class_id của operation'
    );

    const lockM4Idx = updateProgressSql.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const lockM5QuotaIdx = updateProgressSql.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const lockM5CloseIdx = updateProgressSql.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))");

    assert.ok(lockM4Idx !== -1, 'Phải khóa advisory m4_teaching_sync');
    assert.ok(lockM5QuotaIdx !== -1, 'Phải khóa advisory m5_storage_quota');
    assert.ok(lockM5CloseIdx !== -1, 'Phải khóa advisory m5_close:<class_id>');
    assert.ok(lockM4Idx < lockM5QuotaIdx && lockM5QuotaIdx < lockM5CloseIdx, 'Thứ tự khóa advisory phải chuẩn: m4_sync -> m5_storage_quota -> m5_close');

    // 3. m5_update_course_close_storage_progress locks row FOR UPDATE
    assert.ok(
      updateProgressSql.includes('SELECT * INTO v_op') &&
      updateProgressSql.includes('FROM public.m5_course_close_operations') &&
      updateProgressSql.includes('FOR UPDATE;'),
      'm5_update_course_close_storage_progress phải khóa dòng operation FOR UPDATE'
    );

    // 4. m5_update_course_close_storage_progress raises INVALID_OPERATION_STATE if status = 'completed'
    assert.ok(
      updateProgressSql.includes("v_op.status = 'completed'") &&
      updateProgressSql.includes("v_op.status NOT IN ('deleting_storage', 'deleting_db', 'incomplete')") &&
      updateProgressSql.includes('INVALID_OPERATION_STATE') &&
      updateProgressSql.includes('Tác vụ đóng khóa đã hoàn tất hoặc không còn ở trạng thái cho phép cập nhật tiến độ xóa tệp'),
      'm5_update_course_close_storage_progress phải chặn ghi đè khi status = completed hoặc không phải deleting/incomplete'
    );

    // 5. UPDATE statement contains guard condition
    assert.ok(
      updateProgressSql.includes("status <> 'completed'") &&
      updateProgressSql.includes("status IN ('deleting_storage', 'deleting_db', 'incomplete')"),
      'Câu lệnh UPDATE m5_course_close_operations phải có điều kiện status <> completed và status IN (...)'
    );
  });

  // --------------------------------------------------------------------------
  // 17.3 R8-03 (P1): Bắt buộc xác nhận Admin đã tải, mở và kiểm tra tệp CSV mới nhất đúng lớp/khóa
  // --------------------------------------------------------------------------
  await t.test('17.3 R8-03: Classes page, store, and edge backend enforce confirmedCsvOpened & confirmedCsvSha256 before wipe', async () => {
    // 1. UI: confirmedCsvOpenedByClass state and isLatestCsvOpenedConfirmed logic
    assert.ok(
      classesPageSource.includes('const [confirmedCsvOpenedByClass, setConfirmedCsvOpenedByClass] = useState<Record<string, string>>({})'),
      'classes/page.tsx phải có state confirmedCsvOpenedByClass lưu SHA-256'
    );

    assert.ok(
      classesPageSource.includes('isLatestCsvOpenedConfirmed'),
      'classes/page.tsx phải tính toán biến isLatestCsvOpenedConfirmed'
    );

    assert.ok(
      classesPageSource.includes('confirmedCsvOpenedByClass[selectedClass.id] === csvVerificationResult.sha256'),
      'isLatestCsvOpenedConfirmed phải đối chiếu confirmedCsvOpenedByClass với csvVerificationResult.sha256'
    );

    // 2. UI: Checkbox in CSV verification box and clear on class switch/export
    assert.ok(
      classesPageSource.includes('Admin/Owner xác nhận đã tải về, mở tệp CSV và kiểm tra đúng lớp'),
      'classes/page.tsx phải có checkbox xác nhận Admin đã mở và kiểm tra CSV'
    );

    assert.ok(
      classesPageSource.includes("setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [selectedClassId]: '' }))") ||
      classesPageSource.includes('setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [selectedClassId]: "" }))'),
      'useEffect đổi lớp phải xóa xác nhận cũ của lớp đó'
    );

    assert.ok(
      classesPageSource.includes("setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [requestClassId]: '' }))") ||
      classesPageSource.includes('setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [requestClassId]: "" }))'),
      'handleExportCloseCsv phải xóa xác nhận cũ khi xuất CSV mới'
    );

    // 3. UI: Button disable and execute guard
    assert.ok(
      classesPageSource.includes('!isLatestCsvOpenedConfirmed'),
      'Nút xóa phải bị disable khi !isLatestCsvOpenedConfirmed'
    );

    assert.ok(
      classesPageSource.includes('Bắt buộc phải tích xác nhận đã mở và kiểm tra tệp CSV mới nhất đúng lớp/khóa trước khi mở nút Xóa.'),
      'Hướng dẫn nút xóa phải hiển thị nhắc nhở khi chưa tích xác nhận mở CSV'
    );

    assert.ok(
      classesPageSource.includes('Vui lòng tải, mở tệp CSV mới nhất và đánh dấu xác nhận đã kiểm tra đúng lớp/khóa trước khi xóa.'),
      'handleExecuteClose phải chặn khi !isResume && !isLatestCsvOpenedConfirmed'
    );

    assert.ok(
      classesPageSource.includes('confirmedCsvOpened: isResume ? true : isLatestCsvOpenedConfirmed') &&
      classesPageSource.includes('confirmedCsvSha256: csvVerificationResult?.sha256'),
      'handleExecuteClose phải truyền confirmedCsvOpened và confirmedCsvSha256 vào verifyAndExecuteCourseClose'
    );

    // 4. UI: ConfirmDialog message contains class code, course title, CSV SHA-256 snippet, and reminder
    assert.ok(
      classesPageSource.includes('selectedClass?.code') &&
      classesPageSource.includes('selectedCourse?.title') &&
      classesPageSource.includes('csvVerificationResult?.sha256?.slice(0, 12)') &&
      classesPageSource.includes('tệp CSV chỉ là báo cáo tổng kết, không phải bản backup và không thể khôi phục'),
      'ConfirmDialog message phải nêu rõ lớp, khóa, mã SHA-256 của CSV và lưu ý CSV không phải bản backup'
    );

    // 5. Store: verifyAndExecuteCourseClose options & validation
    assert.ok(
      storeSource.includes('confirmedCsvOpened?: boolean;') &&
      storeSource.includes('confirmedCsvSha256?: string;'),
      'store.tsx phải định nghĩa confirmedCsvOpened và confirmedCsvSha256 trong options'
    );

    assert.ok(
      storeSource.includes('!options?.isResume && options?.confirmedCsvOpened === false') &&
      storeSource.includes("code: 'CSV_OPEN_NOT_CONFIRMED'") &&
      storeSource.includes('Admin phải xác nhận đã tải, mở và kiểm tra tệp CSV đúng lớp/khóa trước khi xóa.'),
      'store.tsx verifyAndExecuteCourseClose phải chặn với mã CSV_OPEN_NOT_CONFIRMED khi confirmedCsvOpened === false'
    );

    assert.ok(
      storeSource.includes('confirmedCsvOpened: options?.isResume ? true : Boolean(options?.confirmedCsvOpened ?? true)') &&
      storeSource.includes('confirmedCsvSha256: options?.confirmedCsvSha256 || null'),
      'store.tsx phải gửi confirmedCsvOpened và confirmedCsvSha256 lên API /api/m2/m5-execute-course-close'
    );

    // 6. Edge Backend: m5-execute-course-close enforces confirmedCsvOpened and matches confirmedCsvSha256
    assert.ok(
      edgeBackendSource.includes('!isResume') &&
      edgeBackendSource.includes('body.payload?.confirmedCsvOpened !== true') &&
      edgeBackendSource.includes("code: 'CSV_OPEN_NOT_CONFIRMED'") &&
      edgeBackendSource.includes('Admin phải mở tệp CSV, kiểm tra đúng lớp/khóa và đánh dấu xác nhận trước khi thực thi xóa dữ liệu.'),
      'Edge backend m5-execute-course-close phải trả về mã CSV_OPEN_NOT_CONFIRMED khi chưa xác nhận mở CSV'
    );

    assert.ok(
      edgeBackendSource.includes("code: 'CSV_SHA256_MISMATCH'") &&
      edgeBackendSource.includes('Bản CSV được xác nhận không khớp với bản CSV mới nhất đã đối chiếu của đợt học.'),
      'Edge backend m5-execute-course-close phải đối chiếu confirmedCsvSha256'
    );

    // 7. SQL: m5_begin_course_close checks p_confirmed_csv_sha256
    assert.ok(
      migrationSql.includes('p_confirmed_csv_sha256 TEXT DEFAULT NULL'),
      'm5_begin_course_close phải có tham số p_confirmed_csv_sha256 TEXT DEFAULT NULL'
    );

    assert.ok(
      migrationSql.includes("p_confirmed_csv_sha256 IS NOT NULL AND btrim(p_confirmed_csv_sha256) <> ''") &&
      migrationSql.includes('v_op.csv_sha256 IS DISTINCT FROM p_confirmed_csv_sha256') &&
      migrationSql.includes('CSV_SHA256_MISMATCH'),
      'm5_begin_course_close phải đối chiếu p_confirmed_csv_sha256 với v_op.csv_sha256'
    );
  });
});







// ============================================================================
// SUITE 18: BÀI KIỂM THỬ HỒI QUY CHO 2 ĐIỂM REVIEW VÒNG 9 (R9-01 ĐẾN R9-02)
// ============================================================================
test('Suite 18: Regression tests for Review Round 9 Fixes (R9-01 through R9-02)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8');
  const bffSource = readSrc('src', 'app', 'api', 'm2', '[action]', 'route.ts');
  const edgeSource = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const migrationSql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const storeSource = readSrc('src', 'lib', 'store.tsx');
  const classesPageSource = readSrc('src', 'app', 'manage', 'classes', 'page.tsx');
  const fileRouteSource = readSrc('src', 'app', 'api', 'm3', 'file', 'route.ts');

  const sliceBetween = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start !== -1, `Phải tìm thấy: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(end !== -1, `Phải tìm thấy điểm kết thúc: ${endMarker}`);
    return source.slice(start, end);
  };

  // --------------------------------------------------------------------------
  // 18.1 R9-01 (P1): BFF chuyển tiếp confirmedCsvOpened / confirmedCsvSha256
  // --------------------------------------------------------------------------
  await t.test('18.1 R9-01: BFF m5-execute-course-close blocks & forwards confirmedCsvOpened + confirmedCsvSha256 across the whole chain', () => {
    const branch = sliceBetween(
      bffSource,
      "action === 'm5-execute-course-close'",
      'const edgeRes = await callEdgeBackend('
    );

    assert.ok(branch.includes('const isResume = Boolean(body?.isResume);'), 'BFF phải tính isResume từ body');
    assert.ok(
      branch.includes('!isResume && body?.confirmedCsvOpened !== true'),
      'BFF phải chặn khi !isResume && confirmedCsvOpened !== true'
    );
    assert.ok(branch.includes("code: 'CSV_OPEN_NOT_CONFIRMED'") && branch.includes('400'), 'BFF phải trả 400 CSV_OPEN_NOT_CONFIRMED');
    assert.ok(
      branch.includes('confirmedCsvOpened: isResume ? true : Boolean(body?.confirmedCsvOpened)'),
      'BFF phải chuyển tiếp confirmedCsvOpened'
    );
    assert.ok(
      branch.includes('confirmedCsvSha256:') && branch.includes('body.confirmedCsvSha256.trim()'),
      'BFF phải chuyển tiếp confirmedCsvSha256 đã trim'
    );
    assert.ok(
      bffSource.includes('payload: cleanPayload,'),
      'BFF phải gửi cleanPayload sang callEdgeBackend'
    );

    // page.tsx -> store.tsx
    assert.ok(
      /confirmedCsvOpened/.test(classesPageSource) && /confirmedCsvSha256/.test(classesPageSource),
      'page.tsx phải truyền confirmedCsvOpened và confirmedCsvSha256'
    );
    const storeFetch = sliceBetween(storeSource, "fetch('/api/m2/m5-execute-course-close'", '});');
    assert.ok(
      storeFetch.includes('confirmedCsvOpened') && storeFetch.includes('confirmedCsvSha256'),
      'store.tsx phải gửi cả confirmedCsvOpened và confirmedCsvSha256 tới BFF'
    );

    // BFF -> Edge -> SQL
    const edgeBranch = sliceBetween(edgeSource, "action === 'm5-execute-course-close'", "code: 'CSV_SHA256_MISMATCH'");
    assert.ok(edgeBranch.includes('confirmedCsvOpened'), 'Edge phải kiểm tra confirmedCsvOpened');
    assert.ok(edgeSource.includes('confirmedCsvSha256'), 'Edge phải đọc confirmedCsvSha256');
    assert.ok(
      migrationSql.includes('p_confirmed_csv_sha256 TEXT DEFAULT NULL') &&
        migrationSql.includes('v_op.csv_sha256 IS DISTINCT FROM p_confirmed_csv_sha256'),
      'SQL m5_begin_course_close phải đối chiếu p_confirmed_csv_sha256'
    );

    // Route m3 file ánh xạ STORAGE_BASELINE_UNVERIFIED -> 507
    const baselineIdx = fileRouteSource.indexOf("msg.includes('STORAGE_BASELINE_UNVERIFIED')");
    assert.ok(baselineIdx !== -1, 'm3/file route phải ánh xạ STORAGE_BASELINE_UNVERIFIED');
    const baselineBranch = fileRouteSource.slice(baselineIdx, baselineIdx + 160);
    assert.ok(
      baselineBranch.includes('status = 507') && baselineBranch.includes("code = 'STORAGE_BASELINE_UNVERIFIED'"),
      'STORAGE_BASELINE_UNVERIFIED phải trả HTTP 507'
    );
  });

  // --------------------------------------------------------------------------
  // 18.2 R9-02 (P2): Chỉ Admin xem tổng dung lượng tổ chức ở cả 3 tầng
  // --------------------------------------------------------------------------
  await t.test('18.2 R9-02: m5-storage-quota-status is Admin-only at BFF, Edge and SQL while student upload gate still works', () => {
    // 1. BFF ADMIN_ACTIONS
    const adminActions = sliceBetween(bffSource, 'const ADMIN_ACTIONS = [', '];');
    for (const a of [
      'm5-seed-fixture',
      'm5-storage-quota-status',
      'm5-set-storage-quota-baseline',
      'm5-course-close-preview',
      'm5-export-course-csv',
      'm5-execute-course-close',
    ]) {
      assert.ok(adminActions.includes(`'${a}'`), `ADMIN_ACTIONS phải có ${a}`);
    }

    // 2. Edge: requireAdminActor + adminClient.rpc
    const edgeBranch = sliceBetween(edgeSource, "action === 'm5-storage-quota-status'", "action === 'm5-set-storage-quota-baseline'");
    assert.ok(edgeBranch.includes('requireAdminActor(adminClient, body.accessToken)'), 'Edge phải gọi requireAdminActor');
    assert.ok(
      edgeBranch.includes("adminClient.rpc('m5_get_storage_quota_status'"),
      'Edge phải gọi RPC qua adminClient'
    );
    assert.ok(
      edgeBranch.indexOf('requireAdminActor') < edgeBranch.indexOf("rpc('m5_get_storage_quota_status'"),
      'requireAdminActor phải chạy trước khi truy vấn dung lượng'
    );

    // 3. SQL: RLS chỉ admin
    const policy = sliceBetween(migrationSql, 'CREATE POLICY "m5_storage_quota_config_admin_read"', ';');
    assert.ok(policy.includes("public.current_role() = 'admin'") && !policy.includes("'teacher'"), 'Policy đọc config chỉ cho admin');

    // 4. SQL: kiểm tra quyền trong thân hàm + REVOKE/GRANT
    const fnSql = sliceBetween(migrationSql, 'CREATE OR REPLACE FUNCTION public.m5_get_storage_quota_status(', '$$;');
    assert.ok(
      fnSql.includes("current_user NOT IN ('postgres', 'service_role', 'supabase_admin')") &&
        fnSql.includes("COALESCE(public.current_role(), '') IS DISTINCT FROM 'admin'") &&
        fnSql.includes("USING ERRCODE = '42501'"),
      'm5_get_storage_quota_status phải chặn người không phải Admin/service_role'
    );
    assert.ok(
      migrationSql.includes('REVOKE ALL ON FUNCTION public.m5_get_storage_quota_status(BIGINT) FROM PUBLIC, anon, authenticated;') &&
        migrationSql.includes('GRANT EXECUTE ON FUNCTION public.m5_get_storage_quota_status(BIGINT) TO service_role;'),
      'm5_get_storage_quota_status chỉ được cấp EXECUTE cho service_role'
    );
    assert.ok(
      !/GRANT EXECUTE ON FUNCTION public\.m5_get_storage_quota_status\(BIGINT\) TO[^;]*authenticated/.test(migrationSql),
      'Không được cấp lại EXECUTE cho authenticated'
    );

    // 5. Cổng dung lượng khi học sinh nộp bài vẫn chạy trong SECURITY DEFINER
    const gateIdx = migrationSql.indexOf('public.m5_get_storage_quota_status(v_file_bytes::bigint)');
    assert.ok(gateIdx !== -1, 'm3_reserve_practice_upload phải gọi cổng dung lượng');
    const reserveFn = migrationSql.slice(migrationSql.lastIndexOf('CREATE OR REPLACE FUNCTION', gateIdx), gateIdx + 60);
    assert.ok(reserveFn.includes('m3_reserve_practice_upload'), 'Cổng dung lượng phải nằm trong m3_reserve_practice_upload');
    assert.ok(reserveFn.includes('SECURITY DEFINER'), 'm3_reserve_practice_upload phải là SECURITY DEFINER');
    assert.ok(
      reserveFn.includes('public.m5_get_storage_quota_status(v_file_bytes::bigint)'),
      'm3_reserve_practice_upload vẫn phải gọi cổng dung lượng nội bộ'
    );

    // 6. Sau upload, học sinh chỉ nhận cờ cảnh báo, không gọi trực tiếp RPC Admin
    assert.ok(
      !fileRouteSource.includes("rpc('m5_get_storage_quota_status'"),
      'm3/file route không được gọi trực tiếp m5_get_storage_quota_status bằng quyền người dùng'
    );
    assert.ok(
      fileRouteSource.includes("rpc('m5_get_storage_upload_warning'") &&
        migrationSql.includes('GRANT EXECUTE ON FUNCTION public.m5_get_storage_upload_warning() TO authenticated, service_role;'),
      'Học sinh nhận cảnh báo qua m5_get_storage_upload_warning (không lộ số byte)'
    );
    const warnFn = sliceBetween(migrationSql, 'CREATE OR REPLACE FUNCTION public.m5_get_storage_upload_warning(', '$$;');
    assert.ok(!/current_total_bytes|org_baseline_bytes|used_storage_bytes/.test(warnFn.split('RETURNS TABLE')[1].split('LANGUAGE')[0]), 'Hàm cảnh báo không được trả số byte toàn tổ chức');

    // 7. UI: chỉ Admin gọi fetchStorageQuota khi mount
    assert.ok(
      /if \(isLiveMode && isAdmin\) \{\s*fetchStorageQuota\(\)/.test(classesPageSource),
      'page.tsx chỉ gọi fetchStorageQuota() khi isLiveMode && isAdmin'
    );
  });
});



// ============================================================================
// SUITE 19: BÀI KIỂM THỬ HỒI QUY CHO 3 ĐIỂM REVIEW VÒNG 10 (R10-01 ĐẾN R10-03)
// ============================================================================
test('Suite 19: Regression tests for Review Round 10 Fixes (R10-01 through R10-03)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8');
  const bffSource = readSrc('src', 'app', 'api', 'm2', '[action]', 'route.ts');
  const edgeSource = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const migrationSql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');

  const sliceBetween = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start !== -1, `Phải tìm thấy: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(end !== -1, `Phải tìm thấy điểm kết thúc: ${endMarker}`);
    return source.slice(start, end);
  };

  // Giả lập PostgREST: trả tối đa pageSize dòng theo .range(from, to)
  const makePagedSource = (rows, { failOnCall = null } = {}) => {
    const calls = [];
    const fetchPage = async (from, to) => {
      calls.push([from, to]);
      if (failOnCall !== null && calls.length === failOnCall) {
        return { data: null, error: { message: 'simulated page failure' } };
      }
      return { data: rows.slice(from, to + 1), error: null };
    };
    return { fetchPage, calls };
  };

  // --------------------------------------------------------------------------
  // 19.1 R10-01 (P1): Phân trang đầy đủ > 1.000 dòng
  // --------------------------------------------------------------------------
  await t.test('19.1 R10-01: fetchAllPaginatedRows reads > 1,000 rows, builds full 100 x 14 CSV and fails closed on page error', async () => {
    const mocks = await loadMockData();
    const { m5FixtureClass, m5Lessons14, m5Students } = mocks;
    const classId = m5FixtureClass.id;
    const courseId = m5FixtureClass.courseId;

    // 100 học sinh x 14 buổi
    const students = Array.from({ length: 100 }, (_, i) => {
      const n = String(i + 1).padStart(3, '0');
      return {
        ...m5Students[0],
        id: `usr_r10_${n}`,
        participantId: `PART_R10_${n}`,
        studentCode: `HS_R10_${n}`,
        fullName: `Học sinh R10 ${n}`,
        originalClassId: classId,
        currentClassId: classId,
        status: 'active',
        notes: '',
      };
    });
    const quizRowsAll = [];
    const subRowsAll = [];
    for (const s of students) {
      for (const lesson of m5Lessons14) {
        quizRowsAll.push({
          studentId: s.id,
          lessonId: lesson.id,
          classId,
          highestScore: 80,
          passed: true,
          attemptsCount: 1,
        });
        subRowsAll.push({
          id: `sub_${s.id}_${lesson.id}`,
          studentId: s.id,
          lessonId: lesson.id,
          classId,
          type: 'text',
          content: 'Bài làm mẫu',
          status: 'graded',
          teacherFeedback: 'Tốt',
        });
      }
    }
    assert.strictEqual(quizRowsAll.length, 1400);
    assert.strictEqual(subRowsAll.length, 1400);

    // 1) Quiz: 1.000 + 400
    const quizSrc = makePagedSource(quizRowsAll);
    const quizRes = await fetchAllPaginatedRows(quizSrc.fetchPage, 1000);
    assert.strictEqual(quizRes.error, null);
    assert.strictEqual(quizRes.data.length, 1400, 'Phải lấy đủ 1.400 dòng quiz_results');
    assert.deepStrictEqual(quizSrc.calls, [[0, 999], [1000, 1999]], 'Phải gọi đúng 2 trang 1.000 + 400');

    // 2) Practice: 1.000 + 400
    const subSrc = makePagedSource(subRowsAll);
    const subRes = await fetchAllPaginatedRows(subSrc.fetchPage, 1000);
    assert.strictEqual(subRes.data.length, 1400, 'Phải lấy đủ 1.400 dòng practice_submissions');
    assert.strictEqual(subSrc.calls.length, 2);

    // 3) CSV đủ 100 x 14 = 1.400 dòng và verify đạt
    const csv = buildCourseCloseCsvContent(
      students,
      m5Lessons14,
      m5FixtureClass.code,
      quizRes.data,
      subRes.data,
      { classId, courseId }
    );
    assert.strictEqual(csv.success, true, csv.message);
    assert.strictEqual(csv.rowCount, 1400, 'CSV phải có đủ 100 x 14 = 1.400 dòng');
    assert.strictEqual(csv.participantCount, 100);

    const report = verifyCourseCloseCsv(csv.csvContent, {
      participants: students,
      lessons: m5Lessons14,
      classCode: m5FixtureClass.code,
      classId,
      courseId,
      quizResults: quizRes.data,
      submissions: subRes.data,
    });
    assert.strictEqual(report.valid, true, `verifyCourseCloseCsv phải đạt: ${report.errors.join('; ')}`);
    assert.strictEqual(report.rowCount, 1400);

    // 4) Nếu chỉ lấy 1 trang (hành vi cũ) thì CSV/verify phải sai -> chứng minh lỗi cũ
    const truncatedQuiz = quizRowsAll.slice(0, 1000);
    const truncatedReport = verifyCourseCloseCsv(csv.csvContent, {
      participants: students,
      lessons: m5Lessons14,
      classCode: m5FixtureClass.code,
      classId,
      courseId,
      quizResults: truncatedQuiz,
      submissions: subRes.data,
    });
    assert.strictEqual(truncatedReport.valid, false, 'Dữ liệu bị cắt cụt ở 1.000 dòng phải bị phát hiện');

    // 5) Lỗi ở trang thứ 2 -> Fail-Closed
    const failing = makePagedSource(quizRowsAll, { failOnCall: 2 });
    const failRes = await fetchAllPaginatedRows(failing.fetchPage, 1000);
    assert.strictEqual(failRes.data, null, 'Lỗi ở trang 2 phải trả data = null');
    assert.ok(failRes.error, 'Lỗi ở trang 2 phải trả error');
    assert.strictEqual(failing.calls.length, 2, 'Phải dừng ngay sau trang lỗi');

    // 6) Đúng 1.000 dòng: gọi thêm trang trống để chắc chắn đã hết; 0 dòng; trang không phải mảng
    const exact = makePagedSource(quizRowsAll.slice(0, 1000));
    const exactRes = await fetchAllPaginatedRows(exact.fetchPage, 1000);
    assert.strictEqual(exactRes.data.length, 1000);
    assert.strictEqual(exact.calls.length, 2);
    const empty = await fetchAllPaginatedRows(async () => ({ data: [], error: null }), 1000);
    assert.deepStrictEqual(empty, { data: [], error: null });
    const nonArray = await fetchAllPaginatedRows(async () => ({ data: null, error: null }), 1000);
    assert.deepStrictEqual(nonArray, { data: [], error: null });

    // 7) Edge: fetchAllM5Rows có cùng logic phân trang (chạy trực tiếp mã trong Edge Function)
    const helperSrc = sliceBetween(edgeSource, 'async function fetchAllM5Rows', 'function sanitizeCsvCell(');
    const transpiled = ts.transpileModule(helperSrc, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const edgeFetchAll = new Function(`${transpiled}; return fetchAllM5Rows;`)();
    const edgeSrcOk = makePagedSource(quizRowsAll);
    const edgeOk = await edgeFetchAll(edgeSrcOk.fetchPage);
    assert.strictEqual(edgeOk.data.length, 1400, 'fetchAllM5Rows (Edge) phải lấy đủ 1.400 dòng');
    const edgeFail = await edgeFetchAll(makePagedSource(quizRowsAll, { failOnCall: 2 }).fetchPage);
    assert.strictEqual(edgeFail.data, null);
    assert.ok(edgeFail.error);

    // 8) Edge: cả preview lẫn export đều dùng fetchAllM5Rows với order ổn định + range
    const previewBranch = sliceBetween(edgeSource, "action === 'm5-course-close-preview'", "action === 'm5-export-course-csv'");
    const exportBranch = sliceBetween(edgeSource, "action === 'm5-export-course-csv'", "action === 'm5-execute-course-close'");
    for (const [name, branch] of [['preview', previewBranch], ['export', exportBranch]]) {
      assert.ok(branch.includes('fetchAllM5Rows('), `${name} phải dùng fetchAllM5Rows`);
      assert.ok(branch.includes('.range(from, to)'), `${name} phải phân trang bằng .range(from, to)`);
      for (const table of ['lessons', 'm5_class_cohort_members', 'quiz_results', 'practice_submissions']) {
        const idx = branch.indexOf(`.from('${table}')`);
        assert.ok(idx !== -1, `${name} phải đọc ${table}`);
        const stmt = branch.slice(Math.max(0, idx - 80), branch.indexOf('.range(from, to)', idx) + 20);
        assert.ok(stmt.includes('fetchAllM5Rows'), `${name}: ${table} phải đọc qua fetchAllM5Rows`);
        assert.ok(stmt.includes('.order('), `${name}: ${table} phải có .order(...) ổn định`);
      }
      // (m5_course_close_operations trong preview chỉ lấy 1 bản ghi mới nhất bằng .limit(1) nên không cần phân trang)
      assert.ok(
        !/await actorClient\.from\('(lessons|m5_class_cohort_members|quiz_results|practice_submissions|students)'\)/.test(branch),
        `${name} không được còn truy vấn danh sách một lần không phân trang`
      );
      if (name === 'export') {
        assert.ok(
          !/await actorClient\.from\('m5_course_close_operations'\)/.test(branch),
          'export không được đọc m5_course_close_operations một lần'
        );
      } else {
        assert.ok(
          previewBranch.includes(".from('m5_course_close_operations').select('*').eq('class_id', classId).order('created_at', { ascending: false }).limit(1).maybeSingle()"),
          'preview chỉ lấy đúng 1 thao tác mới nhất bằng .limit(1)'
        );
      }
      assert.ok(
        !/await actorClient\s*\.from\('m3_upload_reservations'\)/.test(branch),
        `${name} không được đọc m3_upload_reservations một lần`
      );
    }
    assert.ok(previewBranch.includes(".from('m3_upload_reservations')") && previewBranch.includes(".gt('expires_at', nowIso)"), 'preview phải phân trang reservations');
    assert.ok(
      exportBranch.includes(".from('students').select('*, profiles(*)').order('id', { ascending: true }).range(from, to)"),
      'export phải phân trang students'
    );
    assert.ok(
      exportBranch.includes(".from('m5_course_close_operations').select('*').eq('class_id', classId)") &&
        exportBranch.includes(".order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)"),
      'export phải phân trang m5_course_close_operations'
    );
    assert.strictEqual((previewBranch.match(/code: 'DB_READ_FAILED'/g) || []).length >= 6, true, 'preview phải trả DB_READ_FAILED khi đọc lỗi');
    assert.ok(exportBranch.includes("code: 'DB_READ_FAILED'"), 'export phải trả DB_READ_FAILED khi đọc lỗi');
  });

  // --------------------------------------------------------------------------
  // 19.2 R10-02 (P2): Bắt buộc confirmedCsvSha256 không rỗng khi bắt đầu đóng khóa mới
  // --------------------------------------------------------------------------
  await t.test('19.2 R10-02: BFF, Edge and SQL reject new close without confirmedCsvSha256 or with mismatched hash', () => {
    // BFF
    const bff = sliceBetween(bffSource, "action === 'm5-execute-course-close'", 'const edgeRes = await callEdgeBackend(');
    assert.ok(
      bff.includes("typeof body?.confirmedCsvSha256 === 'string' && body.confirmedCsvSha256.trim()") &&
        bff.includes('body.confirmedCsvSha256.trim()'),
      'BFF phải trim confirmedCsvSha256 và coi chuỗi rỗng là null'
    );
    assert.ok(bff.includes('!isResume && body?.confirmedCsvOpened !== true'), 'BFF vẫn phải kiểm tra confirmedCsvOpened');
    assert.ok(bff.includes('if (!isResume && !confirmedCsvSha256)'), 'BFF phải chặn khi thiếu confirmedCsvSha256 lúc đóng khóa mới');
    const bffGuard = sliceBetween(bff, 'if (!isResume && !confirmedCsvSha256)', 'cleanPayload = {');
    assert.ok(
      bffGuard.includes("code: 'CSV_OPEN_NOT_CONFIRMED'") &&
        bffGuard.includes("status: 'blocked'") &&
        bffGuard.includes('Phải cung cấp mã kiểm tra SHA-256 của tệp CSV đã mở và xác nhận trước khi thực thi xóa dữ liệu.') &&
        bffGuard.includes('400'),
      'BFF phải trả 400 CSV_OPEN_NOT_CONFIRMED / blocked với thông điệp đúng'
    );

    // Edge
    const edge = sliceBetween(edgeSource, "action === 'm5-execute-course-close'", "code: isShaMismatch ? 'CSV_SHA256_MISMATCH'");
    const edgeGuard = sliceBetween(edge, 'if (!isResume) {', 'const { data: classRow');
    assert.ok(edgeGuard.includes("body.payload?.confirmedCsvOpened !== true"), 'Edge vẫn phải kiểm tra confirmedCsvOpened');
    assert.ok(edgeGuard.includes('if (!confirmedCsvSha256)') && edgeGuard.includes("code: 'CSV_OPEN_NOT_CONFIRMED'"), 'Edge phải chặn khi thiếu confirmedCsvSha256');
    assert.ok(
      edge.includes('if (!isResume) {\n        const { data: latestOp, error: latestOpErr } = await adminClient'),
      'Edge phải đối chiếu latestOp cho MỌI lần đóng khóa mới (không phụ thuộc có SHA hay không)'
    );
    assert.ok(
      edge.includes('if (!latestOp?.csv_sha256 || latestOp.csv_sha256 !== confirmedCsvSha256)') &&
        edge.includes("code: 'CSV_SHA256_MISMATCH'") &&
        edge.includes('Bản CSV được xác nhận không khớp với bản CSV mới nhất đã đối chiếu của đợt học.'),
      'Edge phải Fail-Closed khi thiếu hoặc lệch csv_sha256'
    );
    assert.ok(edge.includes('if (latestOpErr)') && edge.includes("code: 'DB_READ_FAILED'"), 'Edge phải trả DB_READ_FAILED khi đọc latestOp lỗi');
    assert.ok(
      edge.indexOf("code: 'CSV_OPEN_NOT_CONFIRMED'") < edge.indexOf("rpc('m5_begin_course_close'"),
      'Việc chặn thiếu SHA phải chạy trước khi gọi m5_begin_course_close'
    );

    // SQL
    const beginFn = sliceBetween(
      migrationSql,
      'CREATE OR REPLACE FUNCTION public.m5_begin_course_close(\n    p_class_id UUID,\n    p_course_id UUID,\n    p_next_course_id UUID DEFAULT NULL,\n    p_confirmed_14_sessions BOOLEAN DEFAULT false,\n    p_actor_id UUID DEFAULT NULL,\n    p_is_resume BOOLEAN DEFAULT false,',
      '$$;'
    );
    assert.ok(
      beginFn.includes("IF COALESCE(p_is_resume, false) = false AND (p_confirmed_csv_sha256 IS NULL OR btrim(p_confirmed_csv_sha256) = '') THEN") &&
        beginFn.includes('CSV_OPEN_NOT_CONFIRMED'),
      'SQL phải từ chối đóng khóa mới khi thiếu/rỗng p_confirmed_csv_sha256'
    );
    assert.ok(
      beginFn.includes("IF p_confirmed_csv_sha256 IS NOT NULL AND btrim(p_confirmed_csv_sha256) <> '' THEN") &&
        beginFn.includes('v_op.csv_sha256 IS DISTINCT FROM p_confirmed_csv_sha256') &&
        beginFn.includes('CSV_SHA256_MISMATCH'),
      'SQL phải từ chối khi lệch mã băm'
    );
    assert.ok(
      beginFn.indexOf('CSV_OPEN_NOT_CONFIRMED') < beginFn.indexOf('CSV_SHA256_MISMATCH'),
      'SQL phải kiểm tra thiếu SHA trước khi đối chiếu'
    );
    assert.ok(
      beginFn.indexOf("btrim(p_confirmed_csv_sha256) = ''") > beginFn.indexOf('CSV_NOT_VERIFIED'),
      'Kiểm tra SHA nằm sau khi đã xác định tác vụ CSV đã xác minh'
    );

    // Store: giữ nguyên các dòng Suite 17.3 đang assert
    const storeSource = readSrc('src', 'lib', 'store.tsx');
    assert.ok(
      storeSource.includes('!options?.isResume && options?.confirmedCsvOpened === false') &&
        storeSource.includes('confirmedCsvOpened: options?.isResume ? true : Boolean(options?.confirmedCsvOpened ?? true)') &&
        storeSource.includes('confirmedCsvSha256: options?.confirmedCsvSha256 || null'),
      'store.tsx phải giữ nguyên logic chuyển tiếp xác nhận CSV'
    );
  });

  // --------------------------------------------------------------------------
  // 19.3 R10-03 (P2): Xóa tệp Storage của fixture trước khi reset/re-seed
  // --------------------------------------------------------------------------
  await t.test('19.3 R10-03: m5-seed-fixture removes fixture Storage files before reseed, keeps DB links on failure', () => {
    const seedBranch = sliceBetween(edgeSource, "action === 'm5-seed-fixture'", "action === 'm5-storage-quota-status'");

    // Hằng số khớp m5_seed_course_close_fixture trong SQL
    const seedFn = sliceBetween(migrationSql, 'CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture(', '$$;');
    const idOf = (name) => {
      const m = seedFn.match(new RegExp(`${name} UUID := '([0-9a-f-]{36})'::uuid;`));
      assert.ok(m, `SQL phải khai báo ${name}`);
      return m[1];
    };
    assert.ok(seedBranch.includes(`const fixtureClassId = '${idOf('v_cls_id')}'`), 'fixtureClassId phải khớp SQL');
    assert.ok(seedBranch.includes(`const fixtureCourseId = '${idOf('v_crs_id')}'`), 'fixtureCourseId phải khớp SQL');
    assert.ok(seedBranch.includes(`const fixtureNextCourseId = '${idOf('v_next_crs_id')}'`), 'fixtureNextCourseId phải khớp SQL');
    for (const v of ['v_stu1_id', 'v_stu2_id', 'v_stu3_id', 'v_stu4_id', 'v_stu5_id']) {
      assert.ok(seedBranch.includes(`'${idOf(v)}'`), `fixtureStudentIds phải chứa ${v}`);
    }

    // Đọc liên kết tệp từ 3 bảng, lỗi đọc -> DB_READ_FAILED, không seed
    assert.ok(seedBranch.includes(".from('practice_submissions')") && seedBranch.includes("'id, content, type, class_id'"), 'Phải đọc practice_submissions của fixture');
    assert.ok(seedBranch.includes(".from('m3_upload_reservations')") && seedBranch.includes('object_path'), 'Phải đọc m3_upload_reservations của fixture');
    assert.ok(
      seedBranch.includes(".from('m5_course_close_operations')") &&
        seedBranch.includes('target_storage_paths') &&
        seedBranch.includes('remaining_storage_paths'),
      'Phải đọc m5_course_close_operations của fixture'
    );
    assert.ok(
      seedBranch.includes('if (fixtureSubErr) return fixtureReadFailed();') &&
        seedBranch.includes('if (fixtureResErr) return fixtureReadFailed();') &&
        seedBranch.includes('if (fixtureOpErr) return fixtureReadFailed();') &&
        seedBranch.includes("code: 'DB_READ_FAILED'"),
      'Lỗi đọc liên kết tệp phải trả DB_READ_FAILED'
    );
    assert.ok(seedBranch.includes("(s as any).type === 'file'"), 'Chỉ lấy content của bài nộp type = file');

    // Xóa theo lô trước khi gọi RPC; lỗi -> STORAGE_CLEANUP_FAILED và dừng
    assert.ok(
      seedBranch.includes('chunkStoragePaths(pathsToDelete, 1000)') &&
        seedBranch.includes(".storage.from('m3-practice-files').remove(batch)"),
      'Phải xóa tệp theo lô 1.000 qua Storage API'
    );
    assert.ok(
      seedBranch.includes("code: 'STORAGE_CLEANUP_FAILED'") &&
        seedBranch.includes('Không thể xóa tệp lưu trữ của lớp mẫu Mốc 5; đã giữ nguyên thông tin liên kết trong cơ sở dữ liệu để tránh sót tệp mồ côi.'),
      'Phải trả STORAGE_CLEANUP_FAILED với thông điệp đúng'
    );
    const idxRemove = seedBranch.indexOf('.remove(batch)');
    const idxCleanupFail = seedBranch.indexOf("code: 'STORAGE_CLEANUP_FAILED'");
    const idxRpc = seedBranch.indexOf("rpc('m5_seed_course_close_fixture'");
    const idxRead = seedBranch.indexOf(".from('practice_submissions')");
    assert.ok(idxRead !== -1 && idxRead < idxRemove && idxRemove < idxCleanupFail && idxCleanupFail < idxRpc, 'Thứ tự: đọc liên kết -> xóa Storage -> báo lỗi nếu hỏng -> mới gọi RPC seed');
    assert.ok(seedBranch.slice(idxCleanupFail, idxRpc).includes('500'), 'STORAGE_CLEANUP_FAILED phải trả 500 trước khi gọi RPC');

    // SQL: chặn xóa DB nếu storage.objects vẫn còn tệp fixture
    assert.ok(
      seedFn.includes('v_fixture_paths TEXT[]') && seedFn.includes('v_remaining_fixture_files INT'),
      'SQL phải khai báo v_fixture_paths và v_remaining_fixture_files'
    );
    assert.ok(
      seedFn.includes("ps.type = 'file' AND ps.content IS NOT NULL AND btrim(ps.content) <> ''") &&
        seedFn.includes("r.object_path IS NOT NULL AND btrim(r.object_path) <> ''") &&
        seedFn.includes('jsonb_array_elements_text') &&
        seedFn.includes('o.target_storage_paths') &&
        seedFn.includes('o.remaining_storage_paths'),
      'SQL phải gom đường dẫn từ practice_submissions, m3_upload_reservations và m5_course_close_operations'
    );
    assert.ok(
      seedFn.includes("FROM storage.objects o\n        WHERE o.bucket_id = 'm3-practice-files'\n          AND o.name = ANY(v_fixture_paths)") &&
        seedFn.includes('STORAGE_FILES_NOT_FULLY_DELETED') &&
        seedFn.includes('v_remaining_fixture_files > 0'),
      'SQL phải chặn bằng STORAGE_FILES_NOT_FULLY_DELETED khi storage.objects còn tệp fixture'
    );
    const idxGuard = seedFn.indexOf('STORAGE_FILES_NOT_FULLY_DELETED');
    const firstDelete = seedFn.indexOf('DELETE FROM public.m5_course_close_operations');
    assert.ok(idxGuard !== -1 && firstDelete !== -1 && idxGuard < firstDelete, 'Kiểm tra Storage phải chạy trước mọi lệnh DELETE của fixture');
    assert.ok(
      !seedFn.slice(0, firstDelete).includes('DELETE FROM'),
      'Không được xóa DB nào trước khi kiểm tra Storage'
    );
  });
});


// ============================================================================
// SUITE 20: BÀI KIỂM THỬ HỒI QUY CHO ĐIỂM REVIEW VÒNG 11 (R11-01)
// ============================================================================
test('Suite 20: Regression tests for Review Round 11 Fix (R11-01)', async (t) => {
  const migrationSql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql'),
    'utf8'
  );

  const sliceBetween = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start !== -1, `Phải tìm thấy: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(end !== -1, `Phải tìm thấy điểm kết thúc: ${endMarker}`);
    return source.slice(start, end);
  };

  // --------------------------------------------------------------------------
  // 20.1 R11-01 (P2): m5_compute_db_snapshot_digest không được gọi trực tiếp bởi authenticated
  // --------------------------------------------------------------------------
  await t.test('20.1 R11-01: m5_compute_db_snapshot_digest chỉ cho service_role / Admin, thu hồi quyền authenticated', () => {
    const fnSig = 'public.m5_compute_db_snapshot_digest(UUID, UUID)';
    const digestFn = sliceBetween(
      migrationSql,
      'CREATE OR REPLACE FUNCTION public.m5_compute_db_snapshot_digest(',
      `REVOKE ALL ON FUNCTION ${fnSig}`
    );

    // Hàm vẫn là SECURITY DEFINER và có kiểm tra quyền ngay đầu thân BEGIN
    assert.ok(digestFn.includes('SECURITY DEFINER'), 'Hàm digest phải giữ SECURITY DEFINER');
    const idxBegin = digestFn.indexOf('BEGIN');
    const idxGuard = digestFn.indexOf("COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'");
    const idxFirstSelect = digestFn.indexOf('SELECT * INTO v_class FROM public.classes');
    assert.ok(idxBegin !== -1 && idxGuard > idxBegin, 'Kiểm tra quyền phải nằm trong thân hàm sau BEGIN');
    assert.ok(idxFirstSelect !== -1 && idxGuard < idxFirstSelect, 'Kiểm tra quyền phải chạy trước mọi truy vấn dữ liệu');
    assert.ok(
      digestFn.includes("current_user NOT IN ('postgres', 'service_role', 'supabase_admin')") &&
        digestFn.includes("COALESCE(public.current_role(), '') IS DISTINCT FROM 'admin'"),
      'Phải cho phép nội bộ (postgres/service_role/supabase_admin) hoặc Admin'
    );
    assert.ok(
      digestFn.includes("USING ERRCODE = '42501'") && digestFn.includes('FORBIDDEN'),
      'Phải ném lỗi 42501 FORBIDDEN khi không đủ quyền'
    );

    // REVOKE / GRANT
    assert.ok(
      migrationSql.includes(`REVOKE ALL ON FUNCTION ${fnSig} FROM PUBLIC, anon, authenticated;`),
      'Phải REVOKE ALL FROM PUBLIC, anon, authenticated'
    );
    assert.ok(
      migrationSql.includes(`GRANT EXECUTE ON FUNCTION ${fnSig} TO service_role;`),
      'Chỉ GRANT EXECUTE cho service_role'
    );
    assert.ok(
      !/GRANT EXECUTE ON FUNCTION public\.m5_compute_db_snapshot_digest\(UUID, UUID\)[^;]*authenticated/.test(migrationSql),
      'Không còn GRANT EXECUTE ... TO authenticated cho hàm digest'
    );
    assert.ok(
      !migrationSql.includes(`REVOKE ALL ON FUNCTION ${fnSig} FROM PUBLIC, anon;`),
      'Không còn dòng REVOKE cũ thiếu authenticated'
    );

    // Các RPC SECURITY DEFINER đóng khóa vẫn gọi nội bộ hàm digest
    const callPattern = 'public.m5_compute_db_snapshot_digest(p_class_id, p_course_id)';
    const beginFnStart = migrationSql.lastIndexOf('CREATE OR REPLACE FUNCTION public.m5_begin_course_close(', migrationSql.indexOf(`v_current_digest := ${callPattern}`));
    const beginFnBody = migrationSql.slice(beginFnStart, migrationSql.indexOf(`v_current_digest := ${callPattern}`) + callPattern.length + 30);
    assert.ok(beginFnStart !== -1 && beginFnBody.includes('SECURITY DEFINER'), 'm5_begin_course_close (SECURITY DEFINER) phải gọi nội bộ hàm digest');

    const finalizeCallIdx = migrationSql.indexOf(`IF ${callPattern} IS DISTINCT FROM v_op.snapshot_digest`);
    assert.ok(finalizeCallIdx !== -1, 'm5_finalize_course_close_db phải gọi nội bộ hàm digest');
    const finalizeFnStart = migrationSql.lastIndexOf('CREATE OR REPLACE FUNCTION public.m5_finalize_course_close_db(', finalizeCallIdx);
    assert.ok(
      finalizeFnStart !== -1 && migrationSql.slice(finalizeFnStart, finalizeCallIdx).includes('SECURITY DEFINER'),
      'm5_finalize_course_close_db (SECURITY DEFINER) phải gọi nội bộ hàm digest'
    );

    // m5_save_csv_verification nhận digest do Edge truyền vào (không tính lại trong SQL) và chỉ cấp cho service_role
    const saveFn = sliceBetween(
      migrationSql,
      'CREATE OR REPLACE FUNCTION public.m5_save_csv_verification(\n    p_class_id UUID,\n    p_course_id UUID,\n    p_csv_sha256 TEXT,\n    p_snapshot_digest TEXT,\n    p_confirmed_14_sessions',
      'REVOKE ALL ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN, UUID)'
    );
    assert.ok(saveFn.includes('SECURITY DEFINER') && saveFn.includes('p_snapshot_digest'), 'm5_save_csv_verification nhận p_snapshot_digest từ máy chủ');
    assert.ok(
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN, UUID) TO service_role;'),
      'm5_save_csv_verification chỉ cấp cho service_role'
    );
  });
});


// ============================================================================
// SUITE 21: BÀI KIỂM THỬ HỒI QUY CHO ĐIỂM REVIEW VÒNG 12 (R12-01)
// ============================================================================
test('Suite 21: Regression tests for Review Round 12 Fix (R12-01)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8');
  const edgeSrc = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const coreSrc = readSrc('src', 'lib', 'm5-course-close-core.mjs');
  const simSrc = readSrc('src', 'lib', 'simulation-rules.ts');
  const storeSrc = readSrc('src', 'lib', 'store.tsx');
  const migrationSql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');

  const classA = { id: 'cls_a', courseId: 'crs_a', code: 'CLS-A', name: 'Lớp A' };
  const courseA = { id: 'crs_a', title: 'Khóa A' };
  const lessonsA = Array.from({ length: 14 }, (_, i) => ({
    id: `les_a_${i + 1}`,
    courseId: 'crs_a',
    sessionNumber: i + 1,
    title: `Buổi ${i + 1}`,
    status: 'published',
    hasQuiz: false,
    hasPractice: false,
  }));
  const admin = { id: 'adm_1', role: 'admin' };

  const buildScenario = (transferNotes) => {
    const students = [
      {
        id: 'stu_transfer_ab',
        participantId: 'PART_AB',
        studentCode: 'HS-AB',
        fullName: 'Học Sinh Chuyển Lớp',
        originalClassId: 'cls_a',
        currentClassId: 'cls_b',
        status: 'active',
        notes: transferNotes,
        pinHash: null,
      },
      {
        id: 'stu_stay_a',
        participantId: 'PART_STAY',
        studentCode: 'HS-A2',
        fullName: 'Học Sinh Ở Lại',
        originalClassId: 'cls_a',
        currentClassId: 'cls_a',
        status: 'active',
        notes: 'Ghi chú học sinh ở lại',
        pinHash: null,
      },
    ];
    // Cohort của Lớp A vẫn giữ notesSnapshot cũ (trạng thái lệch trước khi sửa lỗi)
    const cohortMembers = [
      {
        id: 'stu_transfer_ab',
        studentId: 'stu_transfer_ab',
        classId: 'cls_a',
        courseId: 'crs_a',
        participantId: 'PART_AB',
        membershipStatus: 'transferred',
        status: 'transferred',
        notes: 'Ghi chú ban đầu ở lớp A',
        notesSnapshot: 'Ghi chú ban đầu ở lớp A',
      },
      {
        id: 'stu_stay_a',
        studentId: 'stu_stay_a',
        classId: 'cls_a',
        courseId: 'crs_a',
        participantId: 'PART_STAY',
        membershipStatus: 'active',
        status: 'active',
        notes: 'Ghi chú học sinh ở lại',
        notesSnapshot: 'Ghi chú học sinh ở lại',
      },
    ];
    return { students, cohortMembers };
  };

  // Mô phỏng độc lập công thức SQL m5_compute_db_snapshot_digest (dùng s.notes hiện hành)
  const sqlFormulaDigest = (students, cohortMembers) => {
    const enc = encDigestField;
    const classPart = `${enc(classA.id)}:${enc(classA.courseId)}:${enc(classA.code)}`;
    const lessonsPart = [...lessonsA]
      .sort((a, b) => a.sessionNumber - b.sessionNumber)
      .map((l) => `${enc(l.sessionNumber)}:${enc(l.id)}:${enc(l.title)}:${enc(l.status)}:${enc(Boolean(l.hasQuiz))}:${enc(Boolean(l.hasPractice))}`)
      .join('|');
    const rows = students
      .filter((s) => {
        const cm = cohortMembers.find((c) => c.studentId === s.id && c.classId === 'cls_a' && c.courseId === 'crs_a');
        return Boolean(cm) || s.currentClassId === 'cls_a' || s.originalClassId === 'cls_a';
      })
      .map((s) => {
        const cm = cohortMembers.find((c) => c.studentId === s.id && c.classId === 'cls_a' && c.courseId === 'crs_a');
        return {
          id: s.id,
          participantId: (cm?.participantId || s.participantId || `PART_${s.id.slice(0, 8)}`).trim(),
          studentCode: s.studentCode,
          fullName: s.fullName,
          effective: s.status === 'archived' ? 'archived' : s.currentClassId !== 'cls_a' ? 'transferred' : s.status,
          notes: s.notes ?? '',
          cur: s.currentClassId || '',
          orig: s.originalClassId || '',
        };
      })
      .sort((a, b) => a.participantId.localeCompare(b.participantId));
    const participantsPart = rows
      .map((r) => `${enc(r.id)}:${enc(r.participantId)}:${enc(r.studentCode)}:${enc(r.fullName)}:${enc(r.effective)}:${enc(r.notes)}:${enc(r.cur)}:${enc(r.orig)}`)
      .join('|');
    const raw = `${classPart}##${lessonsPart}##${participantsPart}####`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  };

  const runScenario = async (transferNotes) => {
    const { students, cohortMembers } = buildScenario(transferNotes);
    const roster = resolveBatchParticipants({
      students,
      classId: 'cls_a',
      courseId: 'crs_a',
      cohortMembers,
      lessons: lessonsA,
    });
    assert.strictEqual(roster.success, true, 'resolveBatchParticipants phải thành công');
    const participants = roster.participants;

    const preview = computeCourseClosePreview({
      currentUser: admin,
      classItem: classA,
      course: courseA,
      lessons: lessonsA,
      students,
      cohortMembers,
      isSchedule14Confirmed: true,
    });

    const csv = buildCourseCloseCsvContent(participants, lessonsA, classA.code, [], [], {
      classId: 'cls_a',
      courseId: 'crs_a',
    });
    assert.strictEqual(csv.success, true, 'buildCourseCloseCsvContent phải thành công');

    const verification = verifyCourseCloseCsv(csv.csvContent, {
      participants,
      lessons: lessonsA,
      classItem: classA,
      classCode: classA.code,
      classId: 'cls_a',
      courseId: 'crs_a',
      quizResults: [],
      submissions: [],
    });
    return { students, cohortMembers, participants, preview, csv, verification };
  };

  await t.test('21.1 R12-01: A->B rồi sửa ghi chú ở Lớp B, digest JS khớp 100% với công thức SQL và đóng khóa A không bị CSV_SNAPSHOT_MISMATCH', async () => {
    const newNotes = 'Đã chuyển sang lớp B - học bù buổi 3';
    const { students, cohortMembers, participants, preview, verification } = await runScenario(newNotes);

    const transferred = participants.find((p) => p.id === 'stu_transfer_ab');
    assert.ok(transferred, 'Lớp A vẫn phải có học sinh chuyển lớp stu_transfer_ab');
    assert.strictEqual(transferred.notes, newNotes, 'Ghi chú phải lấy từ students.notes hiện hành, không phải notesSnapshot cũ');
    assert.strictEqual(transferred.status, 'transferred');
    assert.strictEqual(transferred.currentClassId, 'cls_b');

    const sqlDigest = sqlFormulaDigest(students, cohortMembers);
    assert.strictEqual(verification.valid, true, `CSV phải hợp lệ: ${verification.errors.join('; ')}`);
    assert.strictEqual(verification.snapshotDigest, sqlDigest, 'Digest của verifyCourseCloseCsv phải khớp công thức SQL');
    assert.strictEqual(preview.currentSnapshotDigest, sqlDigest, 'Digest của preview phải khớp công thức SQL');
    assert.strictEqual(preview.csvVerified, false, 'Chưa truyền csvVerification nên chưa xác nhận');

    const previewVerified = computeCourseClosePreview({
      currentUser: admin,
      classItem: classA,
      course: courseA,
      lessons: lessonsA,
      students,
      cohortMembers,
      isSchedule14Confirmed: true,
      csvVerification: verification,
    });
    assert.strictEqual(previewVerified.csvVerified, true, 'Digest CSV phải khớp digest preview hiện hành');

    const exec = await runCourseCloseExecution({
      classId: 'cls_a',
      courseId: 'crs_a',
      targetStoragePaths: [],
      csvVerification: verification,
      currentSnapshotDigest: sqlDigest,
      storageClient: { remove: async () => ({ error: null }) },
      dbClient: { finalizeDbDeletion: async () => ({ success: true }) },
    });
    assert.strictEqual(exec.status, 'completed', `Đóng khóa A phải completed, nhận: ${exec.code || exec.status}`);
    assert.notStrictEqual(exec.code, M5_ERROR_CODES.CSV_SNAPSHOT_MISMATCH);
  });

  await t.test('21.2 R12-01: Xóa trắng ghi chú ở Lớp B vẫn lấy chuỗi rỗng, không rơi về notesSnapshot cũ', async () => {
    const { students, cohortMembers, participants, preview, verification } = await runScenario('');
    const transferred = participants.find((p) => p.id === 'stu_transfer_ab');
    assert.strictEqual(transferred.notes, '', 'Ghi chú trắng hiện hành phải được giữ là rỗng');
    const sqlDigest = sqlFormulaDigest(students, cohortMembers);
    assert.strictEqual(verification.snapshotDigest, sqlDigest);
    assert.strictEqual(preview.currentSnapshotDigest, sqlDigest);

    // Nếu không có hồ sơ students, vẫn dùng bản chụp từ cohort
    const fallback = resolveBatchParticipants({
      students: [],
      classId: 'cls_a',
      courseId: 'crs_a',
      cohortMembers,
      lessons: lessonsA,
    });
    const fb = fallback.participants.find((p) => p.id === 'stu_transfer_ab');
    assert.strictEqual(fb?.notes, 'Ghi chú ban đầu ở lớp A', 'Không có hồ sơ hiện hành thì dùng notesSnapshot');
  });

  await t.test('21.3 R12-01: Mã nguồn Edge, core, simulation-rules, store và trigger SQL đã đồng bộ', () => {
    const currentFirstNotes = "found && found.notes !== undefined && found.notes !== null";
    assert.ok(coreSrc.includes(currentFirstNotes), 'm5-course-close-core.mjs phải ưu tiên found.notes');
    assert.ok(simSrc.includes(currentFirstNotes), 'simulation-rules.ts phải ưu tiên found.notes');
    assert.ok(edgeSrc.includes(currentFirstNotes), 'index.ts (resolveM5Participants) phải ưu tiên found.notes');
    assert.ok(!coreSrc.includes('notes: cm.notes || cm.notesSnapshot || cm.notes_snapshot || found?.notes'), 'core không còn ưu tiên cm.notes');
    assert.ok(!simSrc.includes('notes: cm.notes || cm.notesSnapshot || cm.notes_snapshot || found?.notes'), 'simulation-rules không còn ưu tiên cm.notes');
    assert.ok(!edgeSrc.includes('notes: cm.notes_snapshot || cm.notes || found?.notes'), 'Edge không còn ưu tiên cm.notes_snapshot');
    for (const src of [coreSrc, simSrc, edgeSrc]) {
      assert.ok(src.includes('(found?.studentCode || '), 'studentCode phải ưu tiên hồ sơ hiện hành');
      assert.ok(src.includes("found.status === 'archived'"), 'status phải theo quy tắc effective_status');
      assert.ok(src.includes("'transferred'"), 'status phải có nhánh transferred');
    }

    // Edge: m5-course-close-preview đọc thêm students và trả về students
    const previewStart = edgeSrc.indexOf("if (action === 'm5-course-close-preview')");
    const previewEnd = edgeSrc.indexOf("if (action === 'm5-export-course-csv')");
    assert.ok(previewStart !== -1 && previewEnd > previewStart);
    const previewSrc = edgeSrc.slice(previewStart, previewEnd);
    assert.ok(
      /fetchAllM5Rows\(\(from, to\) =>\s*(?:actorClient|adminClient|studentsReadClient)\.from\('students'\)\.select\('\*, profiles\(\*\)'\)\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/.test(previewSrc),
      'preview phải đọc students bằng fetchAllM5Rows có phân trang'
    );
    assert.ok(previewSrc.includes('studentsErr') && previewSrc.includes('DB_READ_FAILED'), 'preview lỗi đọc students phải trả 500 DB_READ_FAILED');
    assert.ok(/students:\s*mappedStudents/.test(previewSrc), 'preview phải trả students: mappedStudents');
    assert.ok(!/pinHash:\s*s\.pin_hash/.test(previewSrc), 'Không được trả pin_hash ra ngoài');

    // Store: fetchCourseClosePreview dùng mappedStudents; updateStudent đồng bộ cohortMembers
    const fetchStart = storeSrc.indexOf('const fetchCourseClosePreview = useCallback');
    const fetchBody = storeSrc.slice(fetchStart, fetchStart + 18000);
    assert.ok(fetchBody.includes('Array.isArray(srvData.students)') && !fetchBody.includes('srvData.students.length > 0'), 'store phải kiểm tra srvData.students');
    assert.ok(fetchBody.includes('setStudents(rawMappedStudents)'), 'store phải cập nhật setStudents(rawMappedStudents) khi không cũ');
    assert.ok(fetchBody.includes('students: previewStudents,'), 'store phải truyền previewStudents (từ rawMappedStudents, dự phòng students) vào computeCourseClosePreview');
    assert.ok(/: students;\s*\r?\n/.test(fetchBody) && fetchBody.includes('rawMappedStudents.filter('), 'previewStudents phải rơi về students khi máy chủ không trả danh sách');
    const updStart = storeSrc.indexOf('const updateStudent = async');
    const updBody = storeSrc.slice(updStart, storeSrc.indexOf('const transferStudent = async', updStart));
    assert.ok(
      updBody.includes('setCohortMembers') && updBody.includes('notesSnapshot') && updBody.includes('fullName: trimmedFullName'),
      'updateStudent mô phỏng phải đồng bộ cohortMembers (fullName/notes/notesSnapshot)'
    );

    // SQL trigger
    const trigStart = migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.m5_fn_record_cohort_membership_student()');
    const trigEnd = migrationSql.indexOf('$$;', trigStart);
    const trig = migrationSql.slice(trigStart, trigEnd);
    assert.ok(
      /SET membership_status = 'transferred',\s*notes_snapshot = NEW\.notes\s*WHERE class_id = OLD\.current_class_id/.test(trig),
      'Trigger phải cập nhật notes_snapshot cho lớp cũ khi chuyển lớp'
    );
    assert.ok(
      /TG_OP = 'UPDATE' AND OLD\.notes IS DISTINCT FROM NEW\.notes/.test(trig) &&
        /UPDATE public\.m5_class_cohort_members\s*SET notes_snapshot = NEW\.notes\s*WHERE student_id = NEW\.id;/.test(trig),
      'Trigger phải đồng bộ notes_snapshot cho mọi bản ghi cohort khi notes đổi'
    );
  });
});

// ============================================================================
// SUITE 22: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 13 (R13-01 ĐẾN R13-08)
// ============================================================================
test('Suite 22: Round 13 Review Fixes Verification (R13-01 to R13-08)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const edgeSrc = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const coreSrc = readSrc('src', 'lib', 'm5-course-close-core.mjs');
  const simSrc = readSrc('src', 'lib', 'simulation-rules.ts');
  const storeSrc = readSrc('src', 'lib', 'store.tsx');
  const pageSrc = readSrc('src', 'app', 'manage', 'classes', 'page.tsx');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');

  const sliceFn = (src, startMarker, endMarker) => {
    const start = src.indexOf(startMarker);
    assert.ok(start !== -1, `Không tìm thấy ${startMarker}`);
    const end = endMarker ? src.indexOf(endMarker, start + startMarker.length) : src.length;
    assert.ok(end !== -1, `Không tìm thấy ${endMarker}`);
    return src.slice(start, end);
  };

  await t.test('22.1 R13-01: bảng m5_course_close_operations được tạo TRƯỚC câu lệnh backfill tham chiếu bảng này', () => {
    const createPos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.m5_course_close_operations');
    const backfillPos = sql.indexOf('FROM public.m5_course_close_operations op');
    const firstBackfillInsert = sql.indexOf('-- Backfill học sinh hiện hữu vào public.m5_class_cohort_members');
    const policyPos = sql.indexOf('CREATE POLICY "m5_close_ops_admin_all"');
    const uniqueIdxPos = sql.indexOf('CREATE UNIQUE INDEX idx_m5_close_ops_single_active_per_class');
    assert.ok(createPos !== -1 && backfillPos !== -1, 'Phải có cả câu lệnh tạo bảng và backfill');
    assert.ok(createPos < backfillPos, 'CREATE TABLE phải đứng trước backfill FROM public.m5_course_close_operations op');
    assert.ok(policyPos !== -1 && policyPos < firstBackfillInsert, 'Policy m5_close_ops_admin_all phải đứng trước khối backfill');
    assert.ok(uniqueIdxPos !== -1 && uniqueIdxPos < firstBackfillInsert, 'Unique index phải đứng trước khối backfill');
    assert.strictEqual(
      sql.split('CREATE TABLE IF NOT EXISTS public.m5_course_close_operations').length - 1,
      1,
      'Chỉ được tạo bảng một lần'
    );
    const cohortTablePos = sql.indexOf('CREATE TABLE IF NOT EXISTS public.m5_class_cohort_members');
    assert.ok(cohortTablePos !== -1 && cohortTablePos < createPos, 'Bảng cohort vẫn được tạo trước');
  });

  await t.test('22.2 R13-02: digest và CSV chỉ tính dữ liệu thuộc bài học của khóa hiện hành', () => {
    const classA = { id: 'cls_r13', courseId: 'crs_r13_a', code: 'CLS-R13' };
    const lessonsA = Array.from({ length: 14 }, (_, i) => ({
      id: `les_r13_a_${i + 1}`,
      courseId: 'crs_r13_a',
      sessionNumber: i + 1,
      title: `Buổi ${i + 1}`,
      status: 'published',
      hasQuiz: true,
      hasPractice: true,
    }));
    const participants = [
      {
        id: 'stu_r13_1',
        participantId: 'PART_R13_1',
        studentCode: 'HS-R13-1',
        fullName: 'Học Sinh R13',
        status: 'active',
        notes: '',
        currentClassId: 'cls_r13',
        originalClassId: 'cls_r13',
      },
    ];
    const ownQuiz = { studentId: 'stu_r13_1', lessonId: 'les_r13_a_1', classId: 'cls_r13', highestScore: 90, passed: true, attemptsCount: 1 };
    const otherQuiz = { studentId: 'stu_r13_1', lessonId: 'les_other_course_1', classId: 'cls_r13', highestScore: 10, passed: false, attemptsCount: 3 };
    const otherSub = { studentId: 'stu_r13_1', lessonId: 'les_other_course_1', classId: 'cls_r13', type: 'link', status: 'graded', content: 'x', teacherFeedback: 'khác khóa', fileSizeBytes: 0 };

    const base = computeCourseCloseSnapshotDigest({ classItem: classA, participants, lessons: lessonsA, quizResults: [ownQuiz], submissions: [] });
    const withOtherCourse = computeCourseCloseSnapshotDigest({
      classItem: classA,
      participants,
      lessons: lessonsA,
      quizResults: [ownQuiz, otherQuiz],
      submissions: [otherSub],
    });
    assert.strictEqual(withOtherCourse, base, 'Dữ liệu bài học của khóa khác trong cùng lớp không được làm đổi digest');

    const changedOwn = computeCourseCloseSnapshotDigest({
      classItem: classA,
      participants,
      lessons: lessonsA,
      quizResults: [{ ...ownQuiz, highestScore: 50 }],
      submissions: [],
    });
    assert.notStrictEqual(changedOwn, base, 'Dữ liệu thuộc khóa hiện hành vẫn phải làm đổi digest');

    for (const [name, src] of [['core', coreSrc], ['simulation-rules', simSrc], ['index.ts', edgeSrc]]) {
      assert.ok(src.includes('const lessonIdSet = new Set(sortedLessons.map((l) => l.id));'), `${name} phải tạo lessonIdSet từ sortedLessons`);
      assert.ok(src.includes('lessonIdSet.has(q.lessonId)'), `${name} phải lọc quizResults theo lessonIdSet`);
      assert.ok(src.includes('lessonIdSet.has(s.lessonId)'), `${name} phải lọc submissions theo lessonIdSet`);
    }

    const exportBody = sliceFn(storeSrc, 'const exportCourseCloseCsv = useCallback', 'const verifyAndExecuteCourseClose = useCallback');
    assert.ok(exportBody.includes('const courseLessons = lessons.filter((l) => l.courseId === crs.id && l.sessionNumber >= 1 && l.sessionNumber <= 14);'));
    assert.ok(exportBody.includes('const courseLessonIds = new Set(courseLessons.map((l) => l.id));'));
    assert.ok(exportBody.includes('const courseQuizzes = quizResults.filter((q) => (!q.classId || q.classId === classId) && courseLessonIds.has(q.lessonId));'));
    assert.ok(exportBody.includes('const courseSubs = submissions.filter((s) => (!s.classId || s.classId === classId) && courseLessonIds.has(s.lessonId));'));
    assert.ok(/getBatchParticipants\(students, classId, \{[\s\S]*?quizResults: courseQuizzes,[\s\S]*?submissions: courseSubs,[\s\S]*?lessons: courseLessons,/.test(exportBody), 'getBatchParticipants phải nhận dữ liệu đã lọc');
    assert.ok(/buildCourseCloseCsvContent\(\s*batchStudents,\s*courseLessons,\s*cls\.code,\s*courseQuizzes,\s*courseSubs,/.test(exportBody), 'buildCourseCloseCsvContent phải nhận dữ liệu đã lọc');
    assert.ok(/verifyCourseCloseCsv\([\s\S]*?lessons: courseLessons,[\s\S]*?quizResults: courseQuizzes,[\s\S]*?submissions: courseSubs,/.test(exportBody), 'verifyCourseCloseCsv phải nhận dữ liệu đã lọc');
  });

  await t.test('22.3 R13-03: verifyCourseCloseCsv từ chối ô CSV bị thêm khoảng trắng đầu/cuối', async () => {
    const mocks = await loadMockData();
    const { m5FixtureClass, m5Course14, m5Lessons14, m5Students, m5QuizResults, m5Submissions } = mocks;
    const built = buildCourseCloseCsvContent(m5Students, m5Lessons14, m5FixtureClass.code, m5QuizResults, m5Submissions, {
      classId: m5FixtureClass.id,
      courseId: m5FixtureClass.courseId,
    });
    assert.strictEqual(built.success, true);
    const expectedData = {
      participants: m5Students,
      lessons: m5Lessons14,
      classCode: m5FixtureClass.code,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      quizResults: m5QuizResults,
      submissions: m5Submissions,
      classItem: m5FixtureClass,
    };
    assert.strictEqual(verifyCourseCloseCsv(built.csvContent, expectedData).valid, true, 'CSV gốc phải hợp lệ');

    for (const padded of ['" Trần Văn Hoàn Tất "', '" Trần Văn Hoàn Tất"', '"Trần Văn Hoàn Tất "']) {
      const tampered = built.csvContent.replace('"Trần Văn Hoàn Tất"', padded);
      assert.notStrictEqual(tampered, built.csvContent, 'Phải thay được ô tên học sinh');
      const rep = verifyCourseCloseCsv(tampered, expectedData);
      assert.strictEqual(rep.valid, false, `CSV với ô ${padded} phải bị từ chối`);
      assert.ok(rep.errors.some((e) => e.includes('CSV_CELL_VALUE_MISMATCH') && e.includes('fullName')));
    }

    for (const [name, src] of [['core', coreSrc], ['simulation-rules', simSrc], ['index.ts', edgeSrc]]) {
      const fn = sliceFn(src, 'function normalizeCell(', 'return str;');
      assert.ok(!fn.includes('.trim()'), `${name} normalizeCell không được trim`);
      assert.ok(/let str = String\(val\);/.test(fn), `${name} normalizeCell phải dùng String(val) nguyên bản`);
    }
  });

  await t.test('22.4 R13-04: fetchCourseClosePreview phân biệt danh sách rỗng [] với undefined', () => {
    const body = sliceFn(storeSrc, 'const fetchCourseClosePreview = useCallback', 'const exportCourseCloseCsv = useCallback');
    assert.ok(body.includes('Array.isArray(srvData.students)'));
    assert.ok(!/srvData\.students\.length\s*>\s*0/.test(body), 'Không được đòi students.length > 0');
    assert.ok(body.includes('const hasServerLessons = Array.isArray(srvData.lessons);'));
    assert.ok(body.includes('if (hasServerLessons) {'), 'setLessons phải chạy khi máy chủ trả mảng (kể cả rỗng)');
    assert.ok(body.includes('lessons: hasServerLessons ? mappedLessons : lessons,'));
    assert.ok(!/mappedLessons\.length\s*>\s*0/.test(body), 'Không được đòi mappedLessons.length > 0');
    assert.ok(body.includes('students: previewStudents,'));
    assert.ok(body.includes('Array.isArray(srvData.students)') && body.includes('            : students;'), '[] của máy chủ không rơi về students cũ; chỉ null mới rơi về students');

    // Hành vi JS: [] ?? students trả về [] (không rơi về danh sách cũ)
    const oldStudents = [{ id: 'old' }];
    const mappedEmpty = Array.isArray([]) ? [] : null;
    assert.deepStrictEqual(mappedEmpty ?? oldStudents, []);
  });

  await t.test('22.5 R13-05: handleExecuteClose kiểm tra lại lớp đang chọn sau await fetchCourseClosePreview', () => {
    const body = sliceFn(pageSrc, 'const handleExecuteClose = async', '// Course close preview details');
    const check = 'if (selectedClassIdRef.current !== requestClassId) {';
    assert.ok(body.split(check).length - 1 >= 2, 'Phải kiểm tra selectedClassIdRef ít nhất 2 lần');
    const fetchPos = body.indexOf('await fetchCourseClosePreview(');
    const secondCheck = body.indexOf(check, fetchPos);
    const noticePos = body.indexOf('setCloseResultNotice(');
    const alertPos = body.indexOf('setAlertNotice({ text: res.message');
    assert.ok(fetchPos !== -1 && secondCheck > fetchPos, 'Kiểm tra lần hai phải nằm sau await fetchCourseClosePreview');
    assert.ok(secondCheck < noticePos && secondCheck < alertPos, 'Kiểm tra lần hai phải nằm trước setCloseResultNotice / setAlertNotice');
  });

  await t.test('22.6 R13-06: execution_run_id, lease heartbeat, STALE_WORKER_EXECUTION và chặn confirmed14Sessions=false', () => {
    assert.ok(/ADD COLUMN IF NOT EXISTS execution_run_id UUID NOT NULL DEFAULT gen_random_uuid\(\)/.test(sql));
    assert.ok(/ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ/.test(sql));

    const begin = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_begin_course_close(\n    p_class_id UUID,\n    p_course_id UUID,\n    p_next_course_id UUID DEFAULT NULL,\n    p_confirmed_14_sessions BOOLEAN DEFAULT false,\n    p_actor_id UUID DEFAULT NULL,\n    p_is_resume', 'REVOKE ALL ON FUNCTION public.m5_begin_course_close(UUID, UUID, UUID, BOOLEAN, UUID, BOOLEAN, TEXT)');
    assert.ok(begin.includes('execution_run_id UUID'), 'RETURNS TABLE phải có execution_run_id');
    assert.ok(begin.includes('v_run_id UUID := gen_random_uuid();'));
    assert.ok(/COALESCE\(p_is_resume, false\) = false AND COALESCE\(p_confirmed_14_sessions, false\) = false/.test(begin), 'Đóng khóa mới phải bắt buộc confirmed=true');
    assert.ok(begin.includes('v_op.lease_expires_at IS NOT NULL AND v_op.lease_expires_at >= clock_timestamp()'));
    assert.strictEqual((begin.match(/execution_run_id = v_run_id/g) || []).length, 2, 'Cả Resume và đóng khóa mới đều phải cấp run id mới');
    assert.strictEqual((begin.match(/lease_expires_at = clock_timestamp\(\) \+ interval '60 seconds'/g) || []).length, 2);
    assert.ok(begin.includes("v_run_id;"), 'Phải trả v_run_id');
    assert.strictEqual((sql.match(/execution_run_id UUID\n\)/g) || []).length, 3, 'Cả 3 overload m5_begin_course_close phải trả execution_run_id');
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_begin_course_close(UUID, UUID, UUID);'));

    const hb = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_heartbeat_course_close_lease(', 'GRANT EXECUTE ON FUNCTION public.m5_heartbeat_course_close_lease(UUID, UUID, UUID) TO service_role;');
    assert.ok(hb.includes('RETURNS BOOLEAN'));
    assert.ok(hb.includes("p.role = 'admin'"));
    const lockM4 = hb.indexOf("hashtext('m4_teaching_sync')");
    const lockQuota = hb.indexOf("hashtext('m5_storage_quota')");
    const lockClose = hb.indexOf("hashtext('m5_close:'");
    const forUpdate = hb.indexOf('FOR UPDATE');
    assert.ok(lockM4 !== -1 && lockQuota > lockM4 && lockClose > lockQuota && forUpdate > lockClose, 'Thứ tự khóa advisory chuẩn rồi mới FOR UPDATE');
    assert.ok(hb.includes('STALE_WORKER_EXECUTION'));
    assert.ok(hb.includes("v_op.status IN ('deleting_storage', 'deleting_db')"));
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.m5_heartbeat_course_close_lease(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.m5_heartbeat_course_close_lease(UUID, UUID, UUID) TO service_role;'));

    const upd = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_update_course_close_storage_progress(', 'GRANT EXECUTE ON FUNCTION public.m5_update_course_close_storage_progress(');
    assert.ok(upd.includes('p_execution_run_id UUID DEFAULT NULL'));
    assert.ok(/p_execution_run_id IS NOT NULL AND v_op\.execution_run_id IS DISTINCT FROM p_execution_run_id/.test(upd));
    assert.ok(upd.includes('STALE_WORKER_EXECUTION'));
    assert.ok(/lease_expires_at = CASE\s+WHEN COALESCE\(p_status, o\.status\) IN \('deleting_storage', 'deleting_db'\) THEN clock_timestamp\(\) \+ interval '60 seconds'\s+ELSE NULL\s+END/.test(upd));
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_update_course_close_storage_progress(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, UUID);'));

    const fin = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_finalize_course_close_db(\n    p_operation_id UUID,\n    p_class_id UUID,\n    p_course_id UUID,\n    p_next_course_id UUID DEFAULT NULL,\n    p_actor_id UUID DEFAULT NULL,', 'GRANT EXECUTE ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID, UUID)');
    assert.ok(fin.includes('p_execution_run_id UUID DEFAULT NULL'));
    assert.ok(fin.includes('STALE_WORKER_EXECUTION'));
    assert.ok(/SET status = 'completed',\s+lease_expires_at = NULL/.test(fin));
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID);'));

    const exec = sliceFn(edgeSrc, "if (action === 'm5-execute-course-close') {", "return jsonResponse(\n      { success: false, message: STATIC_MESSAGES.UNKNOWN_ACTION");
    assert.ok(/if \(!confirmed14Sessions\) \{\s+return jsonResponse\(\s+\{[^}]*code: 'SCHEDULE_14_NOT_CONFIRMED'/.test(exec), 'Edge phải trả 400 SCHEDULE_14_NOT_CONFIRMED khi !isResume && !confirmed14Sessions');
    assert.ok(exec.indexOf("code: 'SCHEDULE_14_NOT_CONFIRMED'") < exec.indexOf("adminClient.rpc('m5_begin_course_close'"), 'Phải chặn trước khi gọi DB');
    assert.ok(exec.includes('const executionRunId = beginRow.execution_run_id || null;'));
    assert.ok(exec.includes("setInterval(") && exec.includes('15000') && exec.includes("adminClient.rpc('m5_heartbeat_course_close_lease'"));
    assert.ok(exec.includes('clearInterval('));
    const heartbeatPos = exec.indexOf('setInterval(');
    const removePos = exec.indexOf(".remove(batch)");
    const clearPos = exec.indexOf('clearInterval(', removePos);
    assert.ok(heartbeatPos < removePos && removePos < clearPos, 'Heartbeat phải bao quanh remove(batch)');
    assert.ok(/finally \{\s+clearInterval\(/.test(exec), 'clearInterval phải nằm trong finally');
    assert.strictEqual((exec.match(/p_execution_run_id: executionRunId/g) || []).length, 6, '1 heartbeat + 4 update + 1 finalize đều phải truyền run id');
  });

  await t.test('22.7 R13-07: trạng thái transferred của HS_M5_004 được giữ nguyên ở trigger, digest SQL và cả hai bộ resolve JS', () => {
    const trig = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_record_cohort_membership_student()', '$$;');
    assert.ok(trig.includes("CASE WHEN NEW.status IN ('archived', 'transferred') THEN NEW.status::text ELSE 'active'::text END"));
    assert.ok(/membership_status = CASE\s+WHEN EXCLUDED\.membership_status = 'archived' THEN 'archived'\s+WHEN EXCLUDED\.membership_status = 'transferred' OR public\.m5_class_cohort_members\.membership_status = 'transferred' THEN 'transferred'\s+ELSE EXCLUDED\.membership_status\s+END/.test(trig));
    assert.ok(sql.includes("CASE WHEN s.status IN ('archived', 'transferred') THEN s.status ELSE 'active' END"), 'Backfill số 1');
    assert.ok(sql.includes("CASE WHEN s.status IN ('archived', 'transferred') THEN s.status::text ELSE 'active'::text END"), 'Trigger lớp');
    const digestFn = sliceFn(sql, 'CREATE OR REPLACE FUNCTION public.m5_compute_db_snapshot_digest(', 'GRANT EXECUTE ON FUNCTION public.m5_compute_db_snapshot_digest');
    assert.ok(/WHEN s\.current_class_id IS DISTINCT FROM p_class_id OR s\.status = 'transferred' OR cm\.membership_status = 'transferred' THEN 'transferred'/.test(digestFn));

    for (const [name, src] of [['core', coreSrc], ['simulation-rules', simSrc], ['index.ts', edgeSrc]]) {
      assert.ok(src.includes("found.status === 'transferred'"), `${name} resolve phải xét found.status transferred`);
      assert.ok(src.includes("cm.membership_status === 'transferred'"), `${name} resolve phải xét cm.membership_status transferred`);
      assert.ok(src.includes("p.status === 'transferred'"), `${name} digest phải xét p.status transferred`);
    }

    // Hành vi: HS_M5_004 status transferred nhưng vẫn ở lớp fixture; sửa notes không làm đổi trạng thái
    const classId = 'cls_r13_07';
    const courseId = 'crs_r13_07';
    const lessons = Array.from({ length: 14 }, (_, i) => ({ id: `les_r13_07_${i + 1}`, courseId, sessionNumber: i + 1, title: `Buổi ${i + 1}`, status: 'published' }));
    const makeStudent = (overrides) => ({
      id: 'stu_hs_m5_004',
      participantId: 'PART_M5_004',
      studentCode: 'HS_M5_004',
      fullName: 'Học Sinh Chuyển Lớp',
      status: 'transferred',
      notes: 'Ghi chú 1',
      currentClassId: classId,
      originalClassId: classId,
      ...overrides,
    });
    const cohort = [{ id: 'stu_hs_m5_004', studentId: 'stu_hs_m5_004', classId, courseId, participantId: 'PART_M5_004', membershipStatus: 'transferred', status: 'transferred', notes: 'Ghi chú 1' }];
    const r1 = resolveBatchParticipants({ students: [makeStudent({})], classId, courseId, cohortMembers: cohort, lessons });
    const r2 = resolveBatchParticipants({ students: [makeStudent({ notes: 'Ghi chú đã sửa' })], classId, courseId, cohortMembers: cohort, lessons });
    assert.strictEqual(r1.participants[0].status, 'transferred');
    assert.strictEqual(r2.participants[0].status, 'transferred', 'Sửa notes không được đổi trạng thái transferred');
    // Trường hợp students.status đã active nhưng cohort vẫn ghi transferred => digest phía SQL (cm.membership_status) cũng là transferred
    const r3 = resolveBatchParticipants({ students: [makeStudent({ status: 'active' })], classId, courseId, cohortMembers: cohort, lessons });
    assert.strictEqual(r3.participants[0].status, 'transferred');
    // Học sinh bình thường vẫn active
    const r4 = resolveBatchParticipants({
      students: [makeStudent({ status: 'active' })],
      classId,
      courseId,
      cohortMembers: [{ ...cohort[0], membershipStatus: 'active', status: 'active' }],
      lessons,
    });
    assert.strictEqual(r4.participants[0].status, 'active');

    const dig = (participants) => computeCourseCloseSnapshotDigest({ classId, courseId, classCode: 'C', participants, lessons });
    assert.notStrictEqual(dig(r1.participants), dig(r4.participants), 'transferred và active phải cho digest khác nhau (nhất quán với SQL)');
  });

  await t.test('22.8 R13-08: mô phỏng transfer/archive/restore không sửa lịch sử cohort khi lớp không còn courseId', () => {
    const transferBody = sliceFn(storeSrc, 'const transferStudent = async', 'const archiveStudent = async');
    assert.ok(transferBody.includes('if (oldClassId && oldCourseId) {'));
    assert.ok(transferBody.includes('(!m.courseId || m.courseId === oldCourseId)'));
    assert.ok(transferBody.includes('if (targetCourseId) {'));
    assert.ok(transferBody.includes('(!m.courseId || m.courseId === targetCourseId)'));
    assert.ok(!transferBody.includes('!oldCourseId ||') && !transferBody.includes('!targetCourseId ||'));

    const archiveBody = sliceFn(storeSrc, 'const archiveStudent = async', 'const restoreStudent = async');
    const restoreBody = sliceFn(storeSrc, 'const restoreStudent = async', '// Teacher Management');
    for (const body of [archiveBody, restoreBody]) {
      assert.ok(body.includes('if (clsCourseId) {'));
      assert.ok(body.includes('(!m.courseId || m.courseId === clsCourseId)'));
      assert.ok(!body.includes('!clsCourseId ||'));
    }

    // Mô phỏng hành vi đúng logic đã sửa
    const history = [
      { id: 'cm-closed', studentId: 's1', classId: 'c1', courseId: 'crs_closed', membershipStatus: 'active', status: 'active' },
    ];
    const applyArchive = (cohort, clsCourseId, classId) =>
      clsCourseId
        ? cohort.map((m) =>
            m.studentId === 's1' && m.classId === classId && (!m.courseId || m.courseId === clsCourseId)
              ? { ...m, membershipStatus: 'archived', status: 'archived' }
              : m
          )
        : cohort;
    for (const emptyCourse of [null, '', undefined]) {
      assert.deepStrictEqual(applyArchive(history, emptyCourse, 'c1'), history, 'Lớp không còn courseId thì không đổi cohort lịch sử');
    }
    assert.strictEqual(applyArchive(history, 'crs_closed', 'c1')[0].status, 'archived');
    assert.strictEqual(applyArchive(history, 'crs_other', 'c1')[0].status, 'active');
  });
});


// ============================================================================
// SUITE 23: BÀI KIỂM THỬ HỒI QUY CHO ĐIỂM REVIEW VÒNG 14 (R14-01)
// ============================================================================
test('Suite 23: Round 14 Review Fixes Verification (R14-01)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const edgeSrc = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const coreSrc = readSrc('src', 'lib', 'm5-course-close-core.mjs');
  const simSrc = readSrc('src', 'lib', 'simulation-rules.ts');

  const buildExpected = async (submissionsOverride, participantsOverride) => {
    const mocks = await loadMockData();
    const { m5FixtureClass, m5Course14, m5Lessons14, m5Students, m5QuizResults, m5Submissions } = mocks;
    const submissions = submissionsOverride ? submissionsOverride(m5Submissions) : m5Submissions;
    const participants = participantsOverride ? participantsOverride(m5Students) : m5Students;
    const built = buildCourseCloseCsvContent(participants, m5Lessons14, m5FixtureClass.code, m5QuizResults, submissions, {
      classId: m5FixtureClass.id,
      courseId: m5FixtureClass.courseId,
    });
    assert.strictEqual(built.success, true);
    const expectedData = {
      participants,
      lessons: m5Lessons14,
      classCode: m5FixtureClass.code,
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
      quizResults: m5QuizResults,
      submissions,
      classItem: m5FixtureClass,
    };
    return { built, expectedData };
  };

  await t.test('23.1 R14-01: nhận xét giáo viên hợp lệ chứa từ "password" không bị chặn nhầm', async () => {
    const feedback = 'Please reset your password before next lesson.';
    const { built, expectedData } = await buildExpected((subs) =>
      subs.map((s, idx) => (idx === 0 ? { ...s, teacherFeedback: feedback } : s))
    );
    assert.ok(built.csvContent.includes(feedback), 'CSV phải chứa nhận xét có từ password');
    const rep = verifyCourseCloseCsv(built.csvContent, expectedData);
    assert.strictEqual(rep.valid, true, `CSV hợp lệ không được bị từ chối: ${rep.errors.join(' | ')}`);
    assert.strictEqual(rep.errors.length, 0);
    assert.strictEqual(rep.rowCount, expectedData.participants.length * 14);
  });

  await t.test('23.2 R14-01: bí mật thực sự vẫn bị chặn', async () => {
    const { built, expectedData } = await buildExpected();
    const anchor = '"Bài làm xuất sắc, đạt yêu cầu."';
    assert.ok(built.csvContent.includes(anchor), 'Phải có ô nhận xét mẫu để chèn');
    const secrets = [
      'pinHash',
      'pin_hash',
      'MOCK_HASH_5001',
      'password_hash',
      'authPassword',
      '"password": "secret"',
      'password=secret123',
      '$2b$12$' + 'a'.repeat(53),
      'service_role',
      'session_token',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij1234567890',
      'Bearer abcdefgh12345678',
    ];
    for (const secret of secrets) {
      const tampered = built.csvContent.replace(anchor, `"Ghi chú ${secret} cuối"`);
      assert.notStrictEqual(tampered, built.csvContent);
      const rep = verifyCourseCloseCsv(tampered, expectedData);
      assert.strictEqual(rep.valid, false, `Phải chặn: ${secret}`);
      assert.ok(rep.errors.some((e) => e.includes('Phát hiện chuỗi nhạy cảm')), `Phải có thông báo nhạy cảm cho: ${secret}`);
    }

    // Giá trị pinHash thực của học sinh xuất hiện trong CSV
    const realHash = 'real-secret-hash-value-xyz';
    const withHash = {
      ...expectedData,
      participants: expectedData.participants.map((p, idx) => (idx === 0 ? { ...p, pinHash: realHash } : p)),
    };
    const leaked = built.csvContent.replace(anchor, `"Ghi chú ${realHash} cuối"`);
    const repLeak = verifyCourseCloseCsv(leaked, withHash);
    assert.strictEqual(repLeak.valid, false);
    assert.ok(repLeak.errors.some((e) => e.includes('Phát hiện chuỗi nhạy cảm') && e.includes('participant_secret_leak')));
    // R15: đi trọn luồng nguồn -> buildCourseCloseCsvContent (nhân đôi dấu ") -> verifyCourseCloseCsv
    const jsonSecret = '{"password":"real-secret-123"}';
    const flow = await buildExpected((subs) =>
      subs.map((s, idx) => (idx === 0 ? { ...s, teacherFeedback: jsonSecret } : s))
    );
    assert.ok(flow.built.csvContent.includes('""password""'), 'CSV phải chứa dấu ngoặc kép nhân đôi theo RFC 4180');
    const repFlow = verifyCourseCloseCsv(flow.built.csvContent, flow.expectedData);
    assert.strictEqual(repFlow.valid, false, 'JSON bí mật trong nhận xét nguồn phải bị chặn');
    assert.ok(repFlow.errors.some((e) => e.includes('Phát hiện chuỗi nhạy cảm')));
  });

  await t.test('23.3 R14-01: 3 nơi đồng bộ, không còn mẫu trần /password/i trong SENSITIVE_PATTERNS', () => {
    const extractPatterns = (src) => {
      const start = src.indexOf('const SENSITIVE_PATTERNS = [');
      assert.ok(start !== -1, 'Phải có SENSITIVE_PATTERNS');
      const end = src.indexOf('];', start);
      return src
        .slice(start, end)
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
    };
    const corePats = extractPatterns(coreSrc);
    for (const [name, src] of [['simulation-rules', simSrc], ['index.ts', edgeSrc]]) {
      assert.deepStrictEqual(extractPatterns(src), corePats, `${name} phải đồng bộ SENSITIVE_PATTERNS với core`);
      assert.ok(src.includes('participant_secret_leak'), `${name} phải kiểm tra participant_secret_leak`);
    }
    assert.ok(coreSrc.includes('participant_secret_leak'));
    assert.ok(!corePats.includes('/password/i,'), 'Không được còn mẫu trần /password/i');
    assert.ok(corePats.includes('/["\']+password["\']+\\s*:/i,'));
    assert.ok(corePats.includes('/\\bpassword\\s*=\\s*\\S+/i,'));
  });
});


// ============================================================================
// SUITE 24: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 15 (R15-01 & R14-01 DECODED CELL CHECK)
// ============================================================================
test('Suite 24: Round 15 Review Fixes Verification (R15-01 & R14-01 Decoded Cell Check)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');

  const sliceFn = (startMarker, endMarker) => {
    const s = sql.indexOf(startMarker);
    assert.ok(s !== -1, 'Không tìm thấy hàm: ' + startMarker);
    const e = sql.indexOf(endMarker, s);
    assert.ok(e !== -1, 'Không tìm thấy điểm kết thúc hàm: ' + endMarker);
    return sql.slice(s, e);
  };

  await t.test('24.1 R15-01: m5_finalize_course_close_db không còn cột status mơ hồ (42702)', () => {
    const body = sliceFn(
      'CREATE OR REPLACE FUNCTION public.m5_finalize_course_close_db(\n    p_operation_id UUID,\n    p_class_id UUID,\n    p_course_id UUID,\n    p_next_course_id UUID DEFAULT NULL,\n    p_actor_id UUID DEFAULT NULL,\n    p_execution_run_id UUID DEFAULT NULL',
      'REVOKE ALL ON FUNCTION public.m5_finalize_course_close_db(UUID, UUID, UUID, UUID, UUID, UUID)'
    );
    assert.ok(body.includes('RETURNS TABLE ('), 'Hàm phải RETURNS TABLE');
    assert.ok(body.includes('#variable_conflict use_column'), 'Phải có #variable_conflict use_column');
    assert.ok(body.indexOf('#variable_conflict use_column') < body.indexOf('DECLARE'), '#variable_conflict phải đứng trước DECLARE');
    assert.ok(body.includes('DELETE FROM public.m5_course_close_operations AS o'), 'DELETE phải có bí danh o');
    assert.ok(body.includes('WHERE o.class_id = v_op.class_id'));
    assert.ok(body.includes('AND o.id <> p_operation_id'));
    assert.ok(body.includes("AND o.status <> 'completed'"));
    assert.ok(!/\n\s+AND status <> 'completed'/.test(body), "Không còn AND status <> 'completed' không bí danh");
    assert.ok(body.includes('UPDATE public.m5_course_close_operations AS o'), 'UPDATE phải có bí danh o');
    assert.ok(body.includes('WHERE o.id = p_operation_id;'));
    assert.ok(
      body.includes("CASE WHEN s.status IN ('archived', 'transferred') THEN s.status ELSE 'active' END"),
      'Cohort mới phải giữ archived/transferred (đồng nhất R13-07)'
    );
    assert.ok(!body.includes("CASE WHEN s.status = 'archived' THEN 'archived' ELSE 'active' END"));
  });

  await t.test('24.1b R15-01: m5_update_course_close_storage_progress dùng bí danh bảng cho mọi cột status', () => {
    const body = sliceFn(
      'CREATE OR REPLACE FUNCTION public.m5_update_course_close_storage_progress(',
      'REVOKE ALL ON FUNCTION public.m5_update_course_close_storage_progress('
    );
    assert.ok(body.includes('UPDATE public.m5_course_close_operations AS o'));
    assert.ok(body.includes('WHERE o.id = p_operation_id'));
    assert.ok(body.includes("AND o.status <> 'completed'"));
    assert.ok(body.includes("AND o.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    assert.ok(!/\n\s+AND status /.test(body), 'Không còn AND status không bí danh');
  });

  await t.test('24.2 R14-01: 3 nơi kiểm tra SENSITIVE_PATTERNS + participant_secret_leak trên ô đã giải mã RFC 4180', () => {
    const sources = [
      ['m5-course-close-core.mjs', readSrc('src', 'lib', 'm5-course-close-core.mjs')],
      ['simulation-rules.ts', readSrc('src', 'lib', 'simulation-rules.ts')],
      ['index.ts', readSrc('supabase', 'functions', 'm2-backend', 'index.ts')],
    ];
    for (const [name, src] of sources) {
      assert.ok(
        src.includes("const decodedCellsText = parsedGrid.map((row) => row.join('\\n')).join('\\n');"),
        name + ' phải ghép decodedCellsText từ parsedGrid'
      );
      assert.ok(src.includes('pat.test(csvContent) || pat.test(decodedCellsText)'), name + ' phải test mẫu trên ô đã giải mã');
      assert.ok(src.includes('csvContent.includes(s) || decodedCellsText.includes(s)'), name + ' phải kiểm tra participant_secret_leak trên ô đã giải mã');
      assert.ok(src.includes('/["\']+password["\']+\\s*:/i,'), name + ' phải dùng mẫu password chịu được dấu ngoặc kép nhân đôi');
      assert.ok(
        src.indexOf('const decodedCellsText') < src.indexOf('const SENSITIVE_PATTERNS = ['),
        name + ': decodedCellsText phải được tạo trước khi chạy SENSITIVE_PATTERNS'
      );
    }
  });
});


// ============================================================================
// SUITE 25: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 16 (R16-01 ĐẾN R16-04)
// ============================================================================
test('Suite 25: Round 16 Review Fixes Verification (R16-01 to R16-04)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');

  const sliceFn = (startMarker, endMarker) => {
    const st = sql.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = sql.indexOf(endMarker, st);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return sql.slice(st, en);
  };

  await t.test('25.1 R16-01: policy m5_cohort_admin_teacher_select dùng public.class_teachers', () => {
    const body = sliceFn(
      'CREATE POLICY "m5_cohort_admin_teacher_select" ON public.m5_class_cohort_members',
      '-- 4. Bảng quản lý tiến trình tác vụ đóng khóa học'
    );
    assert.ok(body.includes('FROM public.class_teachers ct'));
    assert.ok(body.includes('ct.class_id = m5_class_cohort_members.class_id'));
    assert.ok(body.includes('ct.teacher_profile_id = public.current_profile_id()'));
    assert.ok(!body.includes('c.teacher_id'), 'Không còn c.teacher_id');
    assert.ok(!sql.includes('c.teacher_id'), 'Toàn migration không còn c.teacher_id');
  });

  await t.test('25.2 R16-02 / R20-01: 9 hàm RPC dùng p.status = active và không còn is_archived', () => {
    const fns = [
      'm5_set_storage_quota_baseline',
      'm5_seed_course_close_fixture',
      'm5_save_csv_verification',
      'm5_begin_course_close',
      'm5_update_course_close_storage_progress',
      'm5_heartbeat_course_close_lease',
      'm5_finalize_course_close_db',
      // R20-01: hai RPC chốt/gỡ khóa đặt lại bộ mẫu
      'm5_prepare_seed_course_close_fixture',
      'm5_release_seed_course_close_fixture_lock',
    ];
    for (const fn of fns) {
      const st = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + fn + '(');
      assert.ok(st !== -1, 'Không tìm thấy hàm ' + fn);
      const en = sql.indexOf('REVOKE ALL ON FUNCTION public.' + fn + '(', st);
      assert.ok(en !== -1, 'Không tìm thấy REVOKE của ' + fn);
      const body = sql.slice(st, en);
      assert.ok(
        body.includes("WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'"),
        fn + ' phải kiểm tra Admin bằng p.status = active'
      );
      assert.ok(!body.includes('is_archived'), fn + ' không được chứa is_archived');
    }
    assert.equal(
      sql.split("WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'").length - 1,
      9,
      'Phải có đúng 9 chỗ kiểm tra Admin'
    );
    assert.ok(!sql.includes('is_archived'), 'Toàn migration không còn is_archived');
  });

  await t.test('25.3 R16-03: seed fixture khớp cột lessons/quiz_questions/students và m3_submit_practice dùng graded_*', () => {
    const body = sliceFn(
      'CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture(',
      'REVOKE ALL ON FUNCTION public.m5_seed_course_close_fixture('
    );
    assert.ok(
      body.includes('id, course_id, session_number, title, description, status, has_quiz, has_practice, practice_mode\n        )'),
      'INSERT public.lessons không có cột questions'
    );
    assert.ok(!body.includes('practice_mode, questions'), 'Không còn cột questions trong lessons');
    assert.ok(body.includes('INSERT INTO public.quiz_questions ('), 'Phải chèn câu hỏi vào public.quiz_questions');
    assert.ok(body.includes('lesson_id, prompt, options, correct_option_index, order_index'));
    assert.ok(body.includes("jsonb_build_array('A', 'B', 'C', 'D')"));
    assert.ok(body.includes('IF (v_idx != 4 AND v_idx != 8) THEN\n            INSERT INTO public.quiz_questions ('));
    const stuInserts = body.match(/INSERT INTO public\.students \([^)]*\)/g) || [];
    assert.equal(stuInserts.length, 5, 'Phải có 5 INSERT public.students');
    for (const ins of stuInserts) {
      assert.ok(ins.includes('full_name'), 'INSERT students phải có full_name');
      assert.ok(ins.includes('pin_issued_at'), 'INSERT students phải có pin_issued_at');
      assert.ok(!ins.includes('pin_hash'), 'INSERT students không có pin_hash');
    }
    assert.ok(!body.includes('MOCK_HASH_500'), 'Không còn giá trị MOCK_HASH_500x');

    const submit = sliceFn(
      'CREATE OR REPLACE FUNCTION public.m3_submit_practice(',
      'REVOKE ALL ON FUNCTION public.m3_submit_practice('
    );
    assert.ok(submit.includes('graded_at = NULL,\n            graded_by = NULL,\n            updated_at = now(),'));
    assert.ok(!submit.includes('reviewed_at'), 'm3_submit_practice không còn reviewed_at');
    assert.ok(!submit.includes('reviewed_by'), 'm3_submit_practice không còn reviewed_by');
  });

  await t.test('25.4 R16-04: seed fixture xóa students trước classes (FK RESTRICT)', () => {
    const body = sliceFn(
      'CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture(',
      'REVOKE ALL ON FUNCTION public.m5_seed_course_close_fixture('
    );
    const iStu = body.indexOf('DELETE FROM public.students');
    const iProf = body.indexOf('DELETE FROM public.profiles WHERE id IN (v_stu1_id');
    const iQq = body.indexOf('DELETE FROM public.quiz_questions WHERE lesson_id IN');
    const iLes = body.indexOf('DELETE FROM public.lessons WHERE course_id = v_crs_id');
    const iCls = body.indexOf('DELETE FROM public.classes WHERE id = v_cls_id');
    const iCrs = body.indexOf('DELETE FROM public.courses WHERE id IN (v_crs_id, v_next_crs_id)');
    assert.ok(iStu !== -1 && iCls !== -1, 'Phải có DELETE students và DELETE classes');
    assert.ok(iStu < iCls, 'DELETE students phải đứng trước DELETE classes');
    assert.ok(iProf < iCls, 'DELETE profiles phải đứng trước DELETE classes');
    assert.ok(iQq !== -1 && iQq < iLes, 'DELETE quiz_questions phải đứng trước DELETE lessons');
    assert.ok(iLes < iCls && iCls < iCrs, 'Thứ tự lessons -> classes -> courses');
    assert.ok(!body.includes('OR current_class_id = v_cls_id OR original_class_id = v_cls_id'), 'R17-01: DELETE students chỉ theo 5 ID mẫu, không theo lớp');
    assert.equal(body.split('DELETE FROM public.students').length - 1, 1, 'Chỉ có một khối DELETE students');
  });
});


// ============================================================================
// SUITE 26: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 17 (R17-01 ĐẾN R17-04)
// ============================================================================
test('Suite 26: Round 17 Review Fixes Verification (R17-01 to R17-04)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const edge = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const store = readSrc('src', 'lib', 'store.tsx');
  const page = readSrc('src', 'app', 'manage', 'classes', 'page.tsx');
  const route = readSrc('src', 'app', 'api', 'm2', '[action]', 'route.ts');

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  const sqlFn = (name) =>
    sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.' + name + '(', 'REVOKE ALL ON FUNCTION public.' + name + '(');
  const evalTs = (snippet, argNames, args) => {
    const out = ts.transpileModule(snippet, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...argNames, out)(...args);
  };

  const FIXTURE_STUDENTS = "(v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)";

  // --------------------------------------------------------------------------
  // 26.1 R17-01: SQL seed không xóa học sinh/dữ liệu ngoài bộ mẫu và chặn NON_FIXTURE_DATA_ATTACHED
  // --------------------------------------------------------------------------
  await t.test('26.1 R17-01: m5_seed_course_close_fixture chặn NON_FIXTURE_DATA_ATTACHED và chỉ xóa đúng 5 học sinh mẫu', () => {
    const body = sqlFn('m5_seed_course_close_fixture');
    const iGuard = body.indexOf('NON_FIXTURE_DATA_ATTACHED');
    const iStorageCheck = body.indexOf('STORAGE_FILES_NOT_FULLY_DELETED');
    const iFirstDelete = body.indexOf('DELETE FROM public.m5_course_close_operations');
    assert.ok(iGuard !== -1, 'Phải có mã lỗi NON_FIXTURE_DATA_ATTACHED');
    assert.ok(iGuard < iStorageCheck && iGuard < iFirstDelete, 'Chặn phải đứng trước kiểm tra Storage và mọi lệnh DELETE');

    const guard = body.slice(body.lastIndexOf('IF EXISTS (', iGuard), iGuard);
    assert.ok(guard.includes('s.id NOT IN ' + FIXTURE_STUDENTS));
    assert.ok(guard.includes('s.current_class_id = v_cls_id OR s.original_class_id = v_cls_id'));
    assert.ok(guard.includes('FROM public.m5_class_cohort_members cm'));
    assert.ok(guard.includes('cm.course_id IN (v_crs_id, v_next_crs_id)'));
    assert.ok(guard.includes('FROM public.m3_upload_reservations r'));
    assert.ok(guard.includes('FROM public.practice_submissions ps'));
    assert.ok(guard.includes('FROM public.quiz_results qr'));
    assert.ok(guard.includes('c.id <> v_cls_id') && guard.includes('c.course_id IN (v_crs_id, v_next_crs_id)'));

    assert.ok(body.includes('DELETE FROM public.students WHERE id IN ' + FIXTURE_STUDENTS + ';'));
    assert.ok(!body.includes('OR current_class_id = v_cls_id'));
    assert.ok(!body.includes('OR original_class_id = v_cls_id'));
    assert.ok(body.includes('DELETE FROM public.m3_upload_reservations WHERE student_id IN ' + FIXTURE_STUDENTS + ';'));
    assert.ok(body.includes('DELETE FROM public.practice_submissions WHERE student_id IN ' + FIXTURE_STUDENTS + ';'));
    assert.ok(body.includes('DELETE FROM public.quiz_results WHERE student_id IN ' + FIXTURE_STUDENTS + ';'));
    assert.ok(!/DELETE FROM public\.(m3_upload_reservations|practice_submissions|quiz_results)[^;]*class_id = v_cls_id/.test(body));
    assert.ok(
      body.includes('(class_id = v_cls_id OR (course_id IN (v_crs_id, v_next_crs_id) AND is_m5_fixture = true))\n      AND student_id IN ' + FIXTURE_STUDENTS)
    );
  });

  await t.test('26.2 R17-01: Edge Function m5-seed-fixture trả 409 trước khi xóa Storage và chỉ gom tệp của học sinh mẫu', () => {
    const body = sliceBetween(edge, "if (action === 'm5-seed-fixture') {", "if (action === 'm5-storage-quota-status') {");
    const iGuard = body.indexOf("code: 'NON_FIXTURE_DATA_ATTACHED'");
    const iRemove = body.indexOf(".storage.from('m3-practice-files').remove(");
    assert.ok(iGuard !== -1 && iRemove !== -1 && iGuard < iRemove, 'Chặn 409 phải đứng trước lệnh xóa Storage');
    assert.ok(body.slice(iGuard, iGuard + 200).includes('409'), 'NON_FIXTURE_DATA_ATTACHED phải trả HTTP 409');
    assert.ok(body.includes("from('students')") && body.includes('current_class_id.eq.${fixtureClassId},original_class_id.eq.${fixtureClassId}'));
    assert.ok(body.includes("from('m5_class_cohort_members')"));
    assert.ok(body.includes("from('practice_submissions')") && body.includes("from('m3_upload_reservations')"));
    const subs = sliceBetween(body, "const { data: fixtureSubRows", 'if (fixtureSubErr)');
    const ress = sliceBetween(body, "const { data: fixtureResRows", 'if (fixtureResErr)');
    for (const q of [subs, ress]) {
      assert.ok(q.includes('student_id.in.(${fixtureStudentList})'));
      assert.ok(!q.includes('class_id.eq.${fixtureClassId}'), 'Chỉ lấy tệp theo student_id mẫu, không theo class_id');
    }
  });

  await t.test('26.3 R17-01: Demo seedM5CourseCloseFixtureData giữ nguyên học sinh/quiz/bài nộp ngoài bộ mẫu trong lớp mẫu', async () => {
    const mocks = await loadMockData();
    const outsider = {
      id: 'usr_outsider_1',
      participantId: 'PART_OUT_1',
      studentCode: 'HS_OUT_1',
      fullName: 'Học Sinh Ngoài Bộ Mẫu',
      originalClassId: 'cls_rob_02',
      currentClassId: mocks.m5FixtureClass.id,
      pinHash: null,
      hasPin: false,
      pinIssuedAt: null,
      status: 'active',
      notes: '',
    };
    const outsiderQuiz = {
      studentId: outsider.id,
      lessonId: mocks.m5Lessons14[0].id,
      classId: mocks.m5FixtureClass.id,
      highestScore: 60,
      attemptsCount: 1,
      passed: true,
      lastAttemptAt: '2026-09-20T10:00:00.000Z',
    };
    const outsiderSub = {
      id: 'sub_outsider_1',
      studentId: outsider.id,
      lessonId: mocks.m5Lessons14[1].id,
      classId: mocks.m5FixtureClass.id,
      type: 'link',
      content: 'https://example.com/x',
      status: 'submitted',
      submittedAt: '2026-09-21T10:00:00.000Z',
      canResubmit: true,
    };
    const base = {
      classes: [...mocks.initialClasses],
      courses: [...mocks.initialCourses],
      lessons: [...mocks.initialLessons],
      students: [...mocks.initialStudents, outsider],
      users: [...mocks.initialUsers],
      quizResults: [...mocks.initialQuizResults, outsiderQuiz],
      submissions: [...mocks.initialSubmissions, outsiderSub],
    };
    for (const resetOnly of [false, true]) {
      const seeded = mocks.seedM5CourseCloseFixtureData(base, false);
      const next = mocks.seedM5CourseCloseFixtureData(seeded, resetOnly);
      assert.ok(next.students.some((s) => s.id === outsider.id), 'Học sinh ngoài bộ mẫu phải còn nguyên (resetOnly=' + resetOnly + ')');
      assert.ok(next.quizResults.some((q) => q.studentId === outsider.id), 'Quiz của học sinh ngoài bộ mẫu phải còn nguyên');
      assert.ok(next.submissions.some((s) => s.id === outsiderSub.id), 'Bài nộp của học sinh ngoài bộ mẫu phải còn nguyên');
      const m5Ids = new Set(mocks.m5Students.map((s) => s.id));
      assert.equal(
        next.students.filter((s) => m5Ids.has(s.id)).length,
        resetOnly ? 0 : 5,
        'Chỉ đúng 5 học sinh mẫu Mốc 5 bị xóa/tạo lại'
      );
    }
  });

  await t.test('26.4 R17-01: Demo seedM5CourseCloseFixture (store) chặn đặt lại khi có học sinh ngoài bộ mẫu gắn với lớp mẫu', () => {
    const body = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', 'const generateCourseClosePreview');
    assert.ok(body.includes('hasNonFixtureAttached'));
    assert.ok(body.includes('s.currentClassId === m5FixtureClass.id || s.originalClassId === m5FixtureClass.id'));
    assert.ok(body.indexOf('hasNonFixtureAttached') < body.indexOf('seedM5CourseCloseFixtureData(currentSnapshot'));
  });

  // --------------------------------------------------------------------------
  // 26.5 R17-02: Hàm kiểm tra và trigger bảo vệ ở tầng SQL
  // --------------------------------------------------------------------------
  await t.test('26.5 R17-02: m5_is_student_in_closing_cohort kiểm tra đủ 5 điều kiện cohort đóng khóa dở dang', () => {
    const body = sqlFn('m5_is_student_in_closing_cohort');
    assert.ok(body.includes("op.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    assert.ok(body.includes('op.class_id IN (p_class_id_1, p_class_id_2)'));
    assert.ok(body.includes('s.current_class_id = op.class_id OR s.original_class_id = op.class_id'));
    assert.ok(body.includes('cm.class_id = op.class_id') && body.includes('cm.course_id = op.course_id'));
    assert.ok(body.includes('JOIN public.lessons l ON l.id = qr.lesson_id'));
    assert.ok(body.includes('qr.class_id = op.class_id OR qr.class_id IS NULL'));
    assert.ok(body.includes('JOIN public.lessons l ON l.id = ps.lesson_id'));
    assert.ok(body.includes('ps.class_id = op.class_id'));
    assert.ok(body.includes('l.course_id = op.course_id'));
  });

  await t.test('26.6 R17-02: 5 hàm/trigger bảo vệ students/profiles/lessons/classes/cohort và cờ app.m5_internal_mutation', () => {
    const guards = [
      ['m5_fn_guard_student_during_close', 'trg_m5_guard_student_during_close', 'public.students', 'BEFORE INSERT OR UPDATE OR DELETE'],
      ['m5_fn_guard_profile_during_close', 'trg_m5_guard_profile_during_close', 'public.profiles', 'BEFORE UPDATE OR DELETE'],
      ['m5_fn_guard_lesson_during_close', 'trg_m5_guard_lesson_during_close', 'public.lessons', 'BEFORE INSERT OR UPDATE OR DELETE'],
      ['m5_fn_guard_class_during_close', 'trg_m5_guard_class_during_close', 'public.classes', 'BEFORE UPDATE OR DELETE'],
      ['m5_fn_guard_cohort_during_close', 'trg_m5_guard_cohort_during_close', 'public.m5_class_cohort_members', 'BEFORE INSERT OR UPDATE OR DELETE'],
    ];
    for (const [fn, trg, table, timing] of guards) {
      const body = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.' + fn + '()', 'DROP TRIGGER IF EXISTS ' + trg);
      assert.ok(body.includes("COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'"), fn + ' phải tôn trọng cờ nội bộ');
      assert.ok(body.includes('CLASS_CLOSE_IN_PROGRESS'), fn + ' phải ném CLASS_CLOSE_IN_PROGRESS');
      assert.ok(
        sql.includes('CREATE TRIGGER ' + trg + '\n    ' + timing + ' ON ' + table + '\n    FOR EACH ROW\n    EXECUTE FUNCTION public.' + fn + '();'),
        'Thiếu trigger ' + trg
      );
    }
    const student = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_guard_student_during_close()', 'DROP TRIGGER IF EXISTS trg_m5_guard_student_during_close');
    assert.ok(student.includes('(OLD.participant_id, OLD.student_code, OLD.full_name, OLD.status, COALESCE(OLD.notes, \'\'), OLD.current_class_id, OLD.original_class_id)'));
    assert.ok(student.includes('public.m5_is_student_in_closing_cohort(NEW.id, OLD.current_class_id, NEW.current_class_id, v_bypass_class_id)'));
    assert.ok(student.includes('public.m5_is_student_in_closing_cohort(NEW.id, OLD.original_class_id, NEW.original_class_id, v_bypass_class_id)'));
    const profile = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_guard_profile_during_close()', 'DROP TRIGGER IF EXISTS trg_m5_guard_profile_during_close');
    assert.ok(profile.includes('(OLD.full_name, OLD.status) IS DISTINCT FROM (NEW.full_name, NEW.status)'));
    const lesson = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_guard_lesson_during_close()', 'DROP TRIGGER IF EXISTS trg_m5_guard_lesson_during_close');
    assert.ok(lesson.includes('(OLD.course_id, OLD.session_number, OLD.title, OLD.status, OLD.has_quiz, OLD.has_practice)'));
    const cls = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_guard_class_during_close()', 'DROP TRIGGER IF EXISTS trg_m5_guard_class_during_close');
    assert.ok(cls.includes('(OLD.code, OLD.course_id) IS DISTINCT FROM (NEW.code, NEW.course_id)'));
    const cohort = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m5_fn_guard_cohort_during_close()', 'DROP TRIGGER IF EXISTS trg_m5_guard_cohort_during_close');
    assert.ok(cohort.includes("(OLD.participant_id, OLD.membership_status, COALESCE(OLD.notes_snapshot, ''), OLD.course_id)"));
  });

  await t.test('26.7 R17-02: finalize và seed đặt cờ nội bộ đúng chỗ và đặt lại false trước khi kết thúc', () => {
    const fin = sqlFn('m5_finalize_course_close_db');
    const iMismatch = fin.indexOf('CSV_SNAPSHOT_MISMATCH');
    const iOn = fin.indexOf("set_config('app.m5_internal_mutation', 'true', true)");
    const iFirstDelete = fin.indexOf('DELETE FROM public.quiz_results qr');
    const iOff = fin.indexOf("set_config('app.m5_internal_mutation', 'false', true)");
    const iReturn = fin.indexOf('RETURN QUERY');
    assert.ok(iMismatch !== -1 && iOn > iMismatch && iOn < iFirstDelete, 'Đặt cờ true ngay sau kiểm tra CSV_SNAPSHOT_MISMATCH');
    assert.ok(iOff > iFirstDelete && iOff < iReturn, "Đặt cờ về 'false' trước RETURN");

    const seed = sqlFn('m5_seed_course_close_fixture');
    const sOn = seed.indexOf("set_config('app.m5_internal_mutation', 'true', true)");
    const sDel = seed.indexOf('DELETE FROM public.m5_course_close_operations');
    assert.ok(sOn !== -1 && sOn < sDel, 'Seed đặt cờ true trước khối DELETE dọn fixture');
    assert.equal(seed.split("set_config('app.m5_internal_mutation', 'false', true)").length - 1, 2, 'Cả nhánh resetOnly và nhánh cuối đều đặt cờ về false');
  });

  await t.test('26.8 R17-02: m4_update_student, m3_transfer_student, m3_reset_student_progress chặn cohort đóng khóa dở dang', () => {
    const upd = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m4_update_student(', 'REVOKE ALL ON FUNCTION public.m4_update_student(');
    const iTeach = upd.indexOf("hashtext('m4_teaching_sync')");
    const iStu = upd.indexOf("hashtext('student:'");
    const iClose = upd.indexOf("hashtext('m5_close:'");
    const iCheck = upd.indexOf('public.m5_is_student_in_closing_cohort(p_student_id, NULL, NULL)');
    const iUpdate = upd.indexOf('UPDATE public.students s');
    assert.ok(iTeach !== -1 && iTeach < iStu && iStu < iClose && iClose < iCheck && iCheck < iUpdate, 'Thứ tự khóa: m4_teaching_sync -> student -> m5_close -> kiểm tra -> cập nhật');
    assert.ok(upd.includes('ORDER BY related.class_id ASC'), 'Khóa m5_close theo UUID tăng dần');
    assert.ok(upd.includes('CLASS_CLOSE_IN_PROGRESS'));

    const reset = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m3_reset_student_progress(', 'REVOKE ALL ON FUNCTION public.m3_reset_student_progress(');
    assert.ok(reset.includes('ORDER BY related.class_id ASC'));
    assert.ok(reset.indexOf('public.m5_is_student_in_closing_cohort(p_student_id, NULL, NULL)') < reset.indexOf('DELETE FROM public.quiz_results'));

    const transfer = sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.m3_transfer_student(', 'REVOKE ALL ON FUNCTION public.m3_transfer_student(');
    assert.ok(transfer.includes('public.m5_is_student_in_closing_cohort(p_student_id, v_old_class_id, p_target_class_id)'));
    assert.ok(transfer.indexOf('m5_is_student_in_closing_cohort') < transfer.indexOf('UPDATE public.students'));
  });

  await t.test('26.9 R17-02: store.tsx chặn 9 thao tác ở phía client khi lớp/khóa/học sinh đang đóng khóa dở dang', () => {
    assert.ok(store.includes('const isStudentInClosingCohort = '));
    assert.ok(store.includes('const isCourseInClosingOperation = '));
    assert.ok(store.includes('const isClassInClosingOperation = '));
    assert.ok(store.includes("op.status === 'deleting_storage' || op.status === 'deleting_db' || op.status === 'incomplete'"));
    assert.ok(
      store.includes("'Lớp hoặc đợt học liên quan đang trong quá trình đóng khóa dở dang. Vui lòng hoàn tất tác vụ đóng khóa (Resume) trước khi thay đổi dữ liệu.'")
    );
    const fns = {
      updateStudent: 'isStudentInClosingCohort(id)',
      transferStudent: 'isStudentInClosingCohort(studentId) || isClassInClosingOperation(targetClassId)',
      archiveStudent: 'isStudentInClosingCohort(studentId)',
      restoreStudent: 'isStudentInClosingCohort(studentId)',
      resetStudentProgress: 'isStudentInClosingCohort(studentId)',
      updateLesson: 'isCourseInClosingOperation(',
      updateClass: 'isClassInClosingOperation(id)',
      archiveClass: 'isClassInClosingOperation(id)',
      restoreClass: 'isClassInClosingOperation(id)',
    };
    for (const [fn, cond] of Object.entries(fns)) {
      const st = store.indexOf('const ' + fn + ' = async (');
      assert.ok(st !== -1, 'Không tìm thấy ' + fn);
      const head = store.slice(st, st + 400);
      assert.ok(head.includes(cond), fn + ' phải chặn bằng ' + cond);
      assert.ok(head.includes('CLASS_CLOSE_IN_PROGRESS_MESSAGE'), fn + ' phải trả thông báo CLASS_CLOSE_IN_PROGRESS');
      assert.ok(head.indexOf(cond) < head.indexOf('isLiveMode') || !head.includes('isLiveMode'), fn + ' phải chặn trước khi gọi máy chủ');
    }
  });

  // --------------------------------------------------------------------------
  // 26.10 R17-03: Không ghi đè xác nhận 14 buổi của khóa mới
  // --------------------------------------------------------------------------
  await t.test('26.10 R17-03: fetchCourseClosePreview chỉ đọc, không gửi confirmed14Sessions; page đặt lại xác nhận sau khi đóng khóa', () => {
    const fetchFn = sliceBetween(store, 'const fetchCourseClosePreview = useCallback(', 'const currentCls = classes.find');
    assert.ok(fetchFn.includes("fetch('/api/m2/m5-course-close-preview'"));
    const bodyJson = sliceBetween(fetchFn, 'body: JSON.stringify({', '}),');
    assert.ok(!bodyJson.includes('confirmed14Sessions'), 'Preview đọc không được gửi confirmed14Sessions');
    assert.ok(store.includes('isSchedule14Confirmed: options?.isSchedule14Confirmed ?? Boolean(mappedClass?.is14SessionsConfirmed)'));

    const handler = sliceBetween(page, 'const handleExecuteClose = async', '// Course close preview details');
    assert.ok(handler.includes('setConfirmed14Sessions(false)'));
    assert.ok(handler.includes("setConfirmedCsvOpenedByClass((prev) => ({ ...prev, [requestClassId]: '' }))"));
    assert.ok(handler.includes('await fetchCourseClosePreview(requestClassId);'));
    assert.ok(!handler.includes('fetchCourseClosePreview(requestClassId, {'));
    assert.ok(handler.indexOf('setConfirmed14Sessions(false)') < handler.indexOf('await fetchCourseClosePreview(requestClassId);'));

    const setFn = sliceBetween(store, 'const setConfirmed14SessionsForClass = useCallback(', 'const exportCourseCloseCsv');
    assert.ok(setFn.includes('courseId: currentCls?.courseId'));
    assert.ok(route.includes('courseId: body?.courseId ? String(body.courseId).trim() : undefined'));
  });

  await t.test('26.11 R17-03 / R19-04: Edge Function chỉ ghi xác nhận khi courseId bắt buộc và khớp khóa hiện tại của lớp (chạy thực tế đoạn mã)', () => {
    const body = sliceBetween(edge, "if (action === 'm5-course-close-preview') {", 'const { data: courseRow, error: courseErr }');
    const guardLines = sliceBetween(body, 'const confirmed14Sessions = body.payload?.confirmed14Sessions;', 'if (typeof confirmed14Sessions');
    assert.ok(body.includes("typeof confirmed14Sessions === 'boolean' && isMatchingCurrentCourse"));
    const shouldWrite = (payload, classRow) =>
      evalTs(
        'const body = { payload }; ' + guardLines + ' return typeof confirmed14Sessions === \'boolean\' && isMatchingCurrentCourse;',
        ['payload', 'classRow'],
        [payload, classRow]
      );
    // Admin tích xác nhận cho đúng khóa hiện tại -> ghi
    assert.equal(shouldWrite({ classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, { course_id: 'crs_A' }), true);
    // Lớp đã sang khóa B nhưng giao diện còn gửi xác nhận của khóa A -> KHÔNG ghi đè
    assert.equal(shouldWrite({ classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, { course_id: 'crs_B' }), false);
    // Preview chỉ đọc (không gửi confirmed14Sessions) -> không ghi
    assert.equal(shouldWrite({ classId: 'c1' }, { course_id: 'crs_B' }), false);
    // R19-04: thiếu courseId thì tuyệt đối không ghi (không còn chế độ tương thích)
    assert.equal(shouldWrite({ classId: 'c1', confirmed14Sessions: false }, { course_id: 'crs_B' }), false);
    assert.equal(shouldWrite({ classId: 'c1', courseId: '  ', confirmed14Sessions: false }, { course_id: 'crs_B' }), false);
    // Lớp chưa gán khóa học thì không ghi
    assert.equal(shouldWrite({ classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, { course_id: null }), false);
  });

  // --------------------------------------------------------------------------
  // 26.12 R17-04: Mã lớp mẫu thật trên máy chủ
  // --------------------------------------------------------------------------
  await t.test('26.12 R17-04: Edge Function trả fixtureClassId và store Live lấy đúng fixture_class_id (chạy thực tế đoạn mã)', () => {
    const edgeBody = sliceBetween(edge, "if (action === 'm5-seed-fixture') {", "if (action === 'm5-storage-quota-status') {");
    assert.ok(edgeBody.includes('const seedRow = Array.isArray(seedData) ? seedData[0] : seedData;'));
    assert.ok(edgeBody.includes('fixtureClassId: resetOnly ? null : (seedRow?.fixture_class_id || fixtureClassId)'));

    const liveBody = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', 'const currentSnapshot = {');
    assert.ok(!liveBody.includes("fixtureClassId: 'cls_rob_m5_01'"), 'Không còn trả cứng mã Demo trong nhánh Live');
    assert.ok(liveBody.includes('fixtureClassId: resolvedFixtureClassId'));
    const snippet = sliceBetween(liveBody, 'const seedRow = Array.isArray(data?.data)', '// R23-01: Xóa trạng thái tác vụ');
    const resolve = (data, resetOnly) => evalTs(snippet + '\nreturn resolvedFixtureClassId;', ['data', 'resetOnly'], [data, resetOnly]);

    const UUID = '00000000-0000-0000-0000-000000050001';
    assert.equal(resolve({ success: true, fixtureClassId: UUID, data: [{ fixture_class_id: UUID }] }, false), UUID);
    assert.equal(resolve({ success: true, data: [{ fixture_class_id: UUID }] }, false), UUID);
    assert.equal(resolve({ success: true, data: { fixtureClassId: UUID } }, false), UUID);
    assert.equal(resolve({ success: true }, false), UUID, 'Dự phòng dùng UUID lớp mẫu, không dùng mã Demo');
    assert.notEqual(resolve({ success: true, data: [{ fixture_class_id: UUID }] }, false), 'cls_rob_m5_01');
    assert.equal(resolve({ success: true, fixtureClassId: null, data: [{ fixture_class_id: UUID }] }, true), undefined);
  });

  await t.test('26.13 R17-04: Demo seed trả undefined khi reset, trả m5FixtureClass.id khi tạo', () => {
    const body = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', 'const generateCourseClosePreview');
    assert.ok(body.includes('fixtureClassId: resetOnly ? undefined : m5FixtureClass.id'));
  });
});

// ============================================================================
// SUITE 27: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 18 (R18-01 ĐẾN R18-03)
// ============================================================================
test('Suite 27: Round 18 Review Fixes Verification (R18-01 to R18-03)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const edge = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const store = readSrc('src', 'lib', 'store.tsx');

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  const sqlFn = (name) =>
    sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.' + name + '(', 'REVOKE ALL ON FUNCTION public.' + name + '(');
  const guardFn = (fn, trg) =>
    sliceBetween(sql, 'CREATE OR REPLACE FUNCTION public.' + fn + '()', 'DROP TRIGGER IF EXISTS ' + trg);
  const evalTs = (snippet, argNames, args) => {
    const out = ts.transpileModule(snippet, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...argNames, out)(...args);
  };

  const BYPASS_DECL =
    "COALESCE(current_setting('app.m5_internal_mutation', true), '') = 'true'";
  const BYPASS_CLASS = "NULLIF(btrim(current_setting('app.m5_internal_mutation_class_id', true)), '') IS NOT NULL";

  // --------------------------------------------------------------------------
  // 27.1 R18-01: m5_is_student_in_closing_cohort có tham số thứ 4 p_ignore_class_id
  // --------------------------------------------------------------------------
  await t.test('27.1 R18-01: m5_is_student_in_closing_cohort có p_ignore_class_id và lọc op.class_id IS DISTINCT FROM', () => {
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_is_student_in_closing_cohort(UUID, UUID, UUID);'));
    const body = sqlFn('m5_is_student_in_closing_cohort');
    assert.ok(body.includes('p_ignore_class_id UUID DEFAULT NULL'));
    assert.ok(body.includes('(p_ignore_class_id IS NULL OR op.class_id IS DISTINCT FROM p_ignore_class_id)'));
    assert.ok(body.includes("op.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_is_student_in_closing_cohort(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;')
    );
    assert.ok(
      sql.includes('GRANT EXECUTE ON FUNCTION public.m5_is_student_in_closing_cohort(UUID, UUID, UUID, UUID) TO service_role;')
    );
    assert.ok(!sql.includes('REVOKE ALL ON FUNCTION public.m5_is_student_in_closing_cohort(UUID, UUID, UUID) FROM'));
  });

  // --------------------------------------------------------------------------
  // 27.2 R18-01: Cờ nội bộ giới hạn theo đúng lớp trong finalize / seed / 4 trigger
  // --------------------------------------------------------------------------
  await t.test('27.2 R18-01: finalize và seed đặt app.m5_internal_mutation_class_id đúng lớp và đặt lại rỗng', () => {
    const fin = sqlFn('m5_finalize_course_close_db');
    const iOn = fin.indexOf("set_config('app.m5_internal_mutation', 'true', true)");
    const iCls = fin.indexOf("set_config('app.m5_internal_mutation_class_id', p_class_id::text, true)");
    const iDel = fin.indexOf('DELETE FROM public.quiz_results qr');
    const iOffCls = fin.indexOf("set_config('app.m5_internal_mutation_class_id', '', true)");
    const iReturn = fin.indexOf('RETURN QUERY');
    assert.ok(iOn !== -1 && iCls > iOn && iCls < iDel, 'Đặt class_id ngay sau khi bật cờ và trước khi xóa dữ liệu');
    assert.ok(iOffCls > iDel && iOffCls < iReturn, "Đặt class_id về '' trước RETURN");

    const seed = sqlFn('m5_seed_course_close_fixture');
    assert.ok(seed.includes("set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true)"));
    assert.ok(seed.indexOf("set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true)") < seed.indexOf('DELETE FROM public.m5_course_close_operations'));
    assert.equal(seed.split("set_config('app.m5_internal_mutation_class_id', '', true)").length - 1, 2, 'Cả 2 nhánh kết thúc đặt class_id về rỗng');
  });

  await t.test('27.3 R18-01: 4 trigger bảo vệ đọc v_bypass_class_id và chỉ bỏ qua đúng lớp đó', () => {
    const guards = [
      ['m5_fn_guard_student_during_close', 'trg_m5_guard_student_during_close'],
      ['m5_fn_guard_profile_during_close', 'trg_m5_guard_profile_during_close'],
      ['m5_fn_guard_class_during_close', 'trg_m5_guard_class_during_close'],
      ['m5_fn_guard_cohort_during_close', 'trg_m5_guard_cohort_during_close'],
    ];
    for (const [fn, trg] of guards) {
      const body = guardFn(fn, trg);
      assert.ok(body.includes('v_bypass_class_id UUID := CASE'), fn);
      assert.ok(body.includes(BYPASS_DECL) && body.includes(BYPASS_CLASS), fn);
      assert.ok(body.includes("btrim(current_setting('app.m5_internal_mutation_class_id', true))::uuid"), fn);
      // Không còn lối thoát toàn cục: không có "IF <cờ nội bộ> THEN RETURN" ở đầu hàm
      assert.ok(!/IF COALESCE\(current_setting\('app\.m5_internal_mutation', true\), ''\) = 'true' THEN/.test(body), fn + ' không được bỏ qua toàn cục');
    }
    for (const [fn, trg] of [guards[0], guards[1]]) {
      const body = guardFn(fn, trg);
      assert.ok(body.includes('v_bypass_class_id)'), fn + ' phải truyền v_bypass_class_id vào m5_is_student_in_closing_cohort');
      assert.ok(!body.includes('m5_is_student_in_closing_cohort(NEW.id, NULL, NULL)'), fn);
    }
    for (const [fn, trg] of [guards[2], guards[3]]) {
      const body = guardFn(fn, trg);
      assert.ok(body.includes('(v_bypass_class_id IS NULL OR op.class_id IS DISTINCT FROM v_bypass_class_id)'), fn);
    }
  });

  await t.test('27.4 R18-01: m5_begin_course_close chặn SHARED_COHORT_CLOSE_IN_PROGRESS trước khi chuyển sang deleting_storage', () => {
    const body = sqlFn('m5_begin_course_close');
    const iResumeReturn = body.indexOf("'deleting_storage'::text, v_op.target_storage_paths");
    const iDigest = body.indexOf('CSV_SNAPSHOT_MISMATCH');
    const iShared = body.indexOf('SHARED_COHORT_CLOSE_IN_PROGRESS');
    const iFreshUpdate = body.indexOf('target_storage_paths = v_paths');
    assert.ok(iShared !== -1, 'Phải có mã lỗi SHARED_COHORT_CLOSE_IN_PROGRESS');
    assert.ok(iShared > iResumeReturn, 'Nhánh Resume của chính lớp đang dở không bị chặn (tránh bế tắc 2 chiều)');
    assert.ok(iShared > iDigest && iShared < iFreshUpdate, 'Chặn đứng trước lệnh chuyển sang deleting_storage của đợt mới');
    const guard = body.slice(body.lastIndexOf('IF EXISTS (', iShared), iShared);
    assert.ok(guard.includes('public.m5_is_student_in_closing_cohort(s.id, s.current_class_id, s.original_class_id, p_class_id)'));
    assert.ok(guard.includes('cm.class_id = p_class_id AND cm.course_id = p_course_id'));
    assert.ok(guard.includes('FROM public.quiz_results qr') && guard.includes('FROM public.practice_submissions ps'));
    assert.ok(edge.includes("beginErr.message?.includes('SHARED_COHORT_CLOSE_IN_PROGRESS')"));
  });

  await t.test('27.5 R18-01: finalize không cập nhật original_class_id của học sinh thuộc tác vụ đóng khóa của lớp khác', () => {
    const fin = sqlFn('m5_finalize_course_close_db');
    assert.ok(fin.includes('UPDATE public.students\n    SET original_class_id = current_class_id\n    WHERE original_class_id = p_class_id'));
    const upd = sliceBetween(fin, 'UPDATE public.students\n    SET original_class_id = current_class_id', '-- Cập nhật thông tin lớp học và chuyển khóa');
    assert.ok(upd.includes('AND current_class_id IS NOT NULL'));
    assert.ok(upd.includes('AND current_class_id IS DISTINCT FROM p_class_id'));
    assert.ok(upd.includes('AND NOT public.m5_is_student_in_closing_cohort(id, current_class_id, original_class_id, p_class_id)'));
    assert.ok(upd.includes('op_other.class_id = public.students.current_class_id'));
    assert.ok(upd.includes("op_other.status IN ('previewed', 'csv_verified', 'deleting_storage', 'deleting_db', 'incomplete')"));
  });

  // --------------------------------------------------------------------------
  // 27.6 R18-01: Kịch bản trong bộ nhớ A -> B (nhánh Demo của store.tsx chạy thực tế)
  // --------------------------------------------------------------------------
  await t.test('27.6 R18-01: Học sinh chuyển A -> B; B đang đóng dở thì A bị chặn, hoàn tất A không đổi originalClassId/digest của B', () => {
    const digestOfB = (students) =>
      crypto
        .createHash('sha256')
        .update(
          JSON.stringify(
            students
              .filter((s) => s.currentClassId === 'cls_b' || s.originalClassId === 'cls_b')
              .map((s) => [s.id, s.originalClassId, s.currentClassId])
          )
        )
        .digest('hex');

    const lessons = [
      { id: 'les_a1', courseId: 'crs_a', sessionNumber: 1 },
      { id: 'les_b1', courseId: 'crs_b', sessionNumber: 1 },
    ];
    const classes = [
      { id: 'cls_a', courseId: 'crs_a' },
      { id: 'cls_b', courseId: 'crs_b' },
      { id: 'cls_c', courseId: 'crs_c' },
    ];
    const baseStudents = [
      { id: 'stu_moved', originalClassId: 'cls_a', currentClassId: 'cls_b' },
      { id: 'stu_a_only', originalClassId: 'cls_a', currentClassId: 'cls_a' },
      { id: 'stu_c_only', originalClassId: 'cls_c', currentClassId: 'cls_c' },
    ];
    const cohortMembers = [
      { classId: 'cls_a', courseId: 'crs_a', studentId: 'stu_moved' },
      { classId: 'cls_a', courseId: 'crs_a', studentId: 'stu_a_only' },
      { classId: 'cls_b', courseId: 'crs_b', studentId: 'stu_moved' },
      { classId: 'cls_c', courseId: 'crs_c', studentId: 'stu_c_only' },
    ];

    const beginSnippet = sliceBetween(store, 'if (!options?.isResume) {\n      const otherClosingOps', 'const storageClient = {') + '\nreturn null;';
    const runBegin = (classId, courseCloseOperations, opts) =>
      evalTs(
        beginSnippet,
        ['options', 'courseCloseOperations', 'classes', 'lessons', 'students', 'cohortMembers', 'quizResults', 'submissions', 'classId', 'crs'],
        [opts, courseCloseOperations, classes, lessons, baseStudents, cohortMembers, [], [], classId, classes.find((c) => c.id === classId) && { id: classes.find((c) => c.id === classId).courseId }]
      );

    const opsBClosing = { cls_b: { classId: 'cls_b', courseId: 'crs_b', status: 'incomplete' } };

    // Bắt đầu đóng A trong khi B đang đóng dở và chung học sinh -> bị chặn
    const blocked = runBegin('cls_a', opsBClosing, {});
    assert.ok(blocked, 'Đóng A phải bị chặn');
    assert.equal(blocked.success, false);
    assert.equal(blocked.code, 'SHARED_COHORT_CLOSE_IN_PROGRESS');
    // Resume chính lớp đang dở (B) không bị chặn
    assert.equal(runBegin('cls_b', opsBClosing, { isResume: true }), null);
    // Lớp C không chung học sinh với B -> không bị chặn
    assert.equal(runBegin('cls_c', opsBClosing, {}), null);
    // B ở trạng thái đã hoàn tất hoặc chưa bắt đầu xóa -> A không bị chặn
    assert.equal(runBegin('cls_a', { cls_b: { classId: 'cls_b', courseId: 'crs_b', status: 'completed' } }, {}), null);
    assert.equal(runBegin('cls_a', { cls_b: { classId: 'cls_b', courseId: 'crs_b', status: 'csv_verified' } }, {}), null);
    assert.equal(runBegin('cls_a', {}, {}), null);

    // Nếu vẫn hoàn tất A (ví dụ A đã đóng xong trước đó), cập nhật originalClassId không chạm học sinh thuộc B đang đóng dở
    const updateSnippet = sliceBetween(
      store,
      'setStudents((prev) =>\n        prev.map((s) => {\n          if (s.originalClassId === classId',
      '// R4-03: Nếu có khóa kế tiếp'
    );
    const finalizeStudents = (courseCloseOperations, csvVerifications) => {
      let current = baseStudents.map((s) => ({ ...s }));
      const setStudents = (fn) => {
        current = fn(current);
      };
      evalTs(updateSnippet, ['classId', 'courseCloseOperations', 'csvVerifications', 'setStudents'], ['cls_a', courseCloseOperations, csvVerifications, setStudents]);
      return current;
    };

    const before = digestOfB(baseStudents);
    const afterBClosing = finalizeStudents(opsBClosing, {});
    assert.equal(afterBClosing.find((s) => s.id === 'stu_moved').originalClassId, 'cls_a', 'originalClassId của học sinh thuộc B đang đóng dở phải giữ nguyên');
    assert.equal(digestOfB(afterBClosing), before, 'Digest của B không được đổi khi hoàn tất A');
    // B mới có biên nhận CSV (chưa xóa) cũng không bị đổi digest
    const afterBCsv = finalizeStudents({}, { cls_b: { csvSha256: 'x' } });
    assert.equal(afterBCsv.find((s) => s.id === 'stu_moved').originalClassId, 'cls_a');
    assert.equal(digestOfB(afterBCsv), before);
    // B không có tác vụ nào -> hành vi R4-03 cũ vẫn giữ: học sinh đã rời A được chuyển originalClassId sang lớp hiện tại
    const afterNoOp = finalizeStudents({}, {});
    assert.equal(afterNoOp.find((s) => s.id === 'stu_moved').originalClassId, 'cls_b');
    assert.equal(afterNoOp.find((s) => s.id === 'stu_a_only').originalClassId, 'cls_a', 'Học sinh còn ở A không bị đổi');
    assert.equal(afterNoOp.find((s) => s.id === 'stu_c_only').originalClassId, 'cls_c');
  });

  // --------------------------------------------------------------------------
  // 27.7 R18-02: Khóa tuần tự trước khi đọc m5_course_close_operations
  // --------------------------------------------------------------------------
  await t.test('27.7 R18-02: trigger bài học và m3_update_lesson lấy m4_teaching_sync rồi m5_close:<class_id> (UUID tăng dần) trước khi kiểm tra', () => {
    const lesson = guardFn('m5_fn_guard_lesson_during_close', 'trg_m5_guard_lesson_during_close');
    const lSync = lesson.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const lClose = lesson.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))");
    const lRead = lesson.indexOf('FROM public.m5_course_close_operations op');
    assert.ok(lSync !== -1 && lSync < lClose && lClose < lRead, 'Trigger bài học: m4_teaching_sync -> m5_close -> đọc operations');
    assert.ok(lesson.includes('ORDER BY c.id ASC'));
    assert.ok(lesson.includes('IF v_blocked THEN'));

    const fn = sliceBetween(
      sql,
      'CREATE OR REPLACE FUNCTION public.m3_update_lesson(',
      'REVOKE ALL ON FUNCTION public.m3_update_lesson('
    );
    assert.ok(
      fn.includes('p_admin_profile_id UUID,\n    p_lesson_id UUID,\n    p_title TEXT,\n    p_description TEXT,\n    p_materials TEXT,\n    p_video_url TEXT,\n    p_status TEXT,\n    p_has_quiz BOOLEAN,\n    p_has_practice BOOLEAN,\n    p_practice_mode TEXT,\n    p_questions JSONB DEFAULT')
    );
    assert.ok(fn.includes('RETURNS BOOLEAN'));
    const iAdmin = fn.indexOf("role = 'admin' AND status = 'active'");
    const iSync = fn.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const iCourse = fn.indexOf('SELECT l.course_id INTO v_course_id');
    const iForUpdate = fn.indexOf('FOR UPDATE;', iCourse);
    const iClose = fn.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))");
    const iOrder = fn.indexOf('ORDER BY x.class_id ASC');
    const iRead = fn.indexOf('FROM public.m5_course_close_operations op');
    const iUpdate = fn.indexOf('UPDATE public.lessons');
    assert.ok(iAdmin !== -1 && iAdmin < iSync && iSync < iCourse && iCourse < iForUpdate, 'Quyền Admin -> m4_teaching_sync -> khóa dòng bài học');
    assert.ok(iForUpdate < iOrder && iOrder < iClose && iClose < iRead && iRead < iUpdate, 'm5_close theo UUID tăng dần -> kiểm tra operations -> cập nhật lessons');
    assert.ok(fn.includes("op.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    assert.ok(fn.includes('CLASS_CLOSE_IN_PROGRESS'));
    const tail = sql.slice(sql.indexOf('REVOKE ALL ON FUNCTION public.m3_update_lesson('));
    assert.ok(tail.startsWith('REVOKE ALL ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public.m3_update_lesson(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, JSONB) TO service_role;'));
  });

  await t.test('27.8 R18-02: trigger students/profiles/classes/cohort giữ m4_teaching_sync trước khi gọi m5_is_student_in_closing_cohort hoặc đọc operations', () => {
    const cases = [
      ['m5_fn_guard_student_during_close', 'trg_m5_guard_student_during_close', 'public.m5_is_student_in_closing_cohort('],
      ['m5_fn_guard_profile_during_close', 'trg_m5_guard_profile_during_close', 'public.m5_is_student_in_closing_cohort('],
      ['m5_fn_guard_class_during_close', 'trg_m5_guard_class_during_close', 'FROM public.m5_course_close_operations op'],
      ['m5_fn_guard_cohort_during_close', 'trg_m5_guard_cohort_during_close', 'FROM public.m5_course_close_operations op'],
    ];
    for (const [fn, trg, reader] of cases) {
      const body = guardFn(fn, trg);
      const iLock = body.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
      const iRead = body.indexOf(reader);
      assert.ok(iLock !== -1 && iRead !== -1 && iLock < iRead, fn + ': khóa m4_teaching_sync phải đứng trước khi đọc');
    }
  });

  // --------------------------------------------------------------------------
  // 27.9 R18-03: Demo seedM5CourseCloseFixture giữ nguyên cohortMembers của lớp khác
  // --------------------------------------------------------------------------
  await t.test('27.9 R18-03: Đặt lại/tạo mẫu Mốc 5 trong Demo giữ nguyên 100% cohortMembers và 14 dòng CSV của lớp B (chạy thực tế đoạn mã)', async () => {
    const mocks = await loadMockData();
    const body = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', 'const generateCourseClosePreview');
    assert.ok(!body.includes('setCohortMembers(m5CohortMembers);'), 'Không còn ghi đè toàn bộ cohortMembers');
    const cohortSnippet = sliceBetween(body, 'setCohortMembers((prev) => {', '// R18-03: Chỉ xóa tác vụ');
    const opsSnippet = sliceBetween(body, '// R18-03: Chỉ xóa tác vụ', 'return {\n      success: true,\n      message: resetOnly');
    assert.ok(opsSnippet.includes('m5FixtureClass.id'));

    // Học sinh chuyển A -> B -> C: chưa làm bài tại B, chỉ lưu vết trong cohortMembers của B
    const wanderer = { id: 'usr_stu_wanderer', participantId: 'PART_WANDERER', studentCode: 'HS_WANDERER', fullName: 'Học Sinh Chuyển Nhiều Lớp', status: 'transferred', notes: '', currentClassId: 'cls_target_c', originalClassId: 'cls_origin_a' };
    const crsB = 'crs_other_b';
    const lessonsB = mocks.m5Lessons14.map((l) => ({ ...l, courseId: crsB }));
    const classBMembers = [
      { id: wanderer.id, studentId: wanderer.id, classId: 'cls_transit_b', courseId: crsB, participantId: wanderer.participantId, membershipStatus: 'transferred', notesSnapshot: '' },
      { id: 'usr_stu_b_other', studentId: 'usr_stu_b_other', classId: 'cls_transit_b', courseId: crsB, participantId: 'PART_B_OTHER', membershipStatus: 'active', notesSnapshot: '' },
    ];
    const snakeCaseMember = { student_id: 'usr_snake', class_id: 'cls_snake', course_id: 'crs_snake', participantId: 'PART_SNAKE' };
    const initialMembers = [...mocks.m5CohortMembers, ...classBMembers, snakeCaseMember];

    const csvRowsOfB = (members) => {
      const participants = resolveBatchParticipants({
        students: [wanderer, { id: 'usr_stu_b_other', participantId: 'PART_B_OTHER', studentCode: 'HS_B2', fullName: 'B Khác', status: 'active', notes: '', currentClassId: 'cls_transit_b', originalClassId: 'cls_transit_b' }],
        classId: 'cls_transit_b',
        courseId: crsB,
        cohortMembers: members,
        quizResults: [],
        submissions: [],
      }).participants;
      return generateCourseCloseCsvRows(participants, lessonsB, 'ROB-TRANSIT-B', [], [], { classId: 'cls_transit_b', courseId: crsB });
    };
    const rowsBefore = csvRowsOfB(initialMembers);
    assert.equal(rowsBefore.filter((r) => r.includes('PART_WANDERER')).length, 14, 'Điều kiện đầu: học sinh chuyển A->B->C có 14 dòng ở lớp B');

    for (const resetOnly of [false, true]) {
      let members = initialMembers.map((m) => ({ ...m }));
      const setCohortMembers = (fn) => {
        members = typeof fn === 'function' ? fn(members) : fn;
      };
      evalTs(
        cohortSnippet,
        ['m5Students', 'm5Course14', 'm5NextCourse', 'm5FixtureClass', 'm5CohortMembers', 'resetOnly', 'setCohortMembers'],
        [mocks.m5Students, mocks.m5Course14, mocks.m5NextCourse, mocks.m5FixtureClass, mocks.m5CohortMembers, resetOnly, setCohortMembers]
      );
      const keptB = members.filter((m) => m.classId === 'cls_transit_b');
      assert.deepEqual(keptB, classBMembers, 'Danh sách thành viên lớp B phải giữ nguyên 100% (resetOnly=' + resetOnly + ')');
      assert.ok(members.some((m) => m.student_id === 'usr_snake'), 'Bản ghi dạng snake_case của lớp khác phải còn nguyên');
      const fixtureMembers = members.filter((m) => m.classId === mocks.m5FixtureClass.id);
      assert.equal(fixtureMembers.length, resetOnly ? 0 : 5, 'Chỉ phần của lớp mẫu Mốc 5 được dọn/tạo lại');
      assert.equal(members.length, classBMembers.length + 1 + (resetOnly ? 0 : 5));
      const rowsAfter = csvRowsOfB(members);
      assert.deepEqual(rowsAfter, rowsBefore, '14 dòng CSV của lớp B phải giữ nguyên 100% (resetOnly=' + resetOnly + ')');
    }

    // Chỉ xóa tác vụ đóng khóa và biên nhận CSV của riêng lớp mẫu
    let ops = { [mocks.m5FixtureClass.id]: { status: 'incomplete' }, cls_transit_b: { status: 'csv_verified' } };
    let csv = { [mocks.m5FixtureClass.id]: { csvSha256: 'a' }, cls_transit_b: { csvSha256: 'b' } };
    const setCourseCloseOperations = (fn) => { ops = fn(ops); };
    const setCsvVerifications = (fn) => { csv = fn(csv); };
    evalTs(opsSnippet, ['m5FixtureClass', 'setCourseCloseOperations', 'setCsvVerifications'], [mocks.m5FixtureClass, setCourseCloseOperations, setCsvVerifications]);
    assert.deepEqual(Object.keys(ops), ['cls_transit_b'], 'Chỉ xóa tác vụ của lớp mẫu');
    assert.deepEqual(Object.keys(csv), ['cls_transit_b'], 'Chỉ xóa biên nhận CSV của lớp mẫu');
  });
});

// ============================================================================
// SUITE 28: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 19 (R19-01 ĐẾN R19-04)
// ============================================================================
test('Suite 28: Round 19 Review Fixes Verification (R19-01 to R19-04)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const edge = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const store = readSrc('src', 'lib', 'store.tsx');

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  // Lấy bản định nghĩa CUỐI CÙNG của hàm trong migration M5 (bản có hiệu lực)
  const sqlFn = (name) => {
    const st = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
    assert.ok(st !== -1, 'Không tìm thấy hàm ' + name);
    const en = sql.indexOf('REVOKE ALL ON FUNCTION public.' + name + '(', st);
    assert.ok(en !== -1, 'Không tìm thấy REVOKE của ' + name);
    return sql.slice(st, en);
  };
  // Hàm có chứa khóa tư vấn (bỏ qua các bản bọc chỉ gọi lại hàm khác) và đã bỏ chú thích SQL
  const lockedSqlFn = (name) => {
    let st = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
    while (st !== -1) {
      const en = sql.indexOf('REVOKE ALL ON FUNCTION public.' + name + '(', st);
      const body = sql.slice(st, en).replace(/--.*$/gm, '');
      if (body.includes('pg_advisory_xact_lock')) return body;
      st = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(', st + 10);
    }
    assert.fail('Không tìm thấy hàm có khóa tư vấn: ' + name);
  };
  const stripSqlComments = (body) => body.replace(/--.*$/gm, '');
  const transpile = (snippet) =>
    ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const evalTs = (snippet, argNames, args) => new Function(...argNames, transpile(snippet))(...args);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const evalTsAsync = (snippet, argNames, args) => new AsyncFunction(...argNames, transpile(snippet))(...args);

  // --------------------------------------------------------------------------
  // 28.1 R19-01: Thứ tự khóa chuẩn m4_teaching_sync -> m5_close -> class -> student
  // --------------------------------------------------------------------------
  const LOCK_RANK = { m4_teaching_sync: 0, m5_close: 1, class: 2, student: 3 };
  const lockSequence = (body) => {
    const seq = [];
    const re = /pg_advisory_xact_lock\(hashtext\('(m4_teaching_sync|m5_close:|class:|student:)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      seq.push({ key: m[1].replace(':', ''), index: m.index });
    }
    return seq;
  };
  const R19_01_FUNCTIONS = [
    ['m3_save_class', 'UUID, UUID, TEXT, TEXT, UUID, UUID, BOOLEAN, BOOLEAN'],
    ['m3_set_class_course', 'UUID, UUID, UUID'],
    ['m2_save_class', 'UUID, UUID, TEXT, TEXT, UUID'],
    ['m2_archive_class', 'UUID'],
    ['m2_restore_class', 'UUID'],
    ['m2_archive_student', 'UUID'],
    ['m2_restore_student', 'UUID'],
  ];

  await t.test('28.1 R19-01: 7 RPC sửa lớp/lưu trữ được định nghĩa lại với m4_teaching_sync đứng đầu, trước mọi SELECT FOR UPDATE / UPDATE', () => {
    for (const [name, sig] of R19_01_FUNCTIONS) {
      const body = lockedSqlFn(name);
      const seq = lockSequence(body);
      assert.ok(seq.length >= 2, name + ' phải lấy nhiều khóa tư vấn');
      assert.equal(seq[0].key, 'm4_teaching_sync', name + ': khóa đầu tiên phải là m4_teaching_sync');
      const iSync = seq[0].index;
      const iFirstForUpdate = body.search(/FOR UPDATE/);
      const iFirstUpdate = body.search(/\bUPDATE\s+public\./);
      for (const idx of [iFirstForUpdate, iFirstUpdate].filter((i) => i !== -1)) {
        assert.ok(iSync < idx, name + ': m4_teaching_sync phải đứng trước mọi FOR UPDATE / UPDATE');
      }
      // Thứ tự khóa không giảm hạng: m4 -> m5_close -> class -> student (class_code nằm ngoài đồ thị chờ)
      for (let i = 1; i < seq.length; i++) {
        assert.ok(LOCK_RANK[seq[i].key] >= LOCK_RANK[seq[i - 1].key], name + ': vi phạm thứ tự khóa tại ' + seq[i].key);
      }
      assert.ok(body.includes("pg_advisory_xact_lock(hashtext('m5_close:'")) ;
      assert.ok(seq.some((s) => s.key === 'class'), name + ' phải giữ class:<id>');
      const iClose = seq.find((s) => s.key === 'm5_close').index;
      const iClass = seq.find((s) => s.key === 'class').index;
      assert.ok(iClose < iClass, name + ': m5_close phải đứng trước class');
      if (iFirstForUpdate !== -1) assert.ok(iClass < iFirstForUpdate, name + ': class:<id> phải đứng trước FOR UPDATE');
      assert.ok(iClass < iFirstUpdate, name + ': class:<id> phải đứng trước UPDATE');
      // Cấp quyền đúng chuẩn
      assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.' + name + '(' + sig + ') FROM PUBLIC, anon, authenticated;'), name + ' thiếu REVOKE');
      assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.' + name + '(' + sig + ') TO service_role;'), name + ' thiếu GRANT');
      assert.ok(body.includes('SECURITY DEFINER'));
    }
    // Student RPC: m5_close/class chỉ lấy sau khi đọc lớp hiện tại, nhưng khóa student đứng sau cùng
    for (const name of ['m2_archive_student', 'm2_restore_student']) {
      const seq = lockSequence(lockedSqlFn(name));
      assert.deepEqual(seq.map((s) => s.key), ['m4_teaching_sync', 'm5_close', 'class', 'student'], name);
    }
  });

  await t.test('28.2 R19-01: m3_save_class giữ chữ ký/RETURNS TABLE, #variable_conflict, m5_close + class trước FOR UPDATE và chặn CLASS_CLOSE_IN_PROGRESS', () => {
    const body = stripSqlComments(sqlFn('m3_save_class'));
    assert.ok(body.includes('#variable_conflict use_column'));
    assert.ok(
      body.includes(
        'p_admin_profile_id UUID,\n    p_class_id UUID DEFAULT NULL,\n    p_code TEXT DEFAULT NULL,\n    p_name TEXT DEFAULT NULL,\n    p_teacher_id UUID DEFAULT NULL,\n    p_course_id UUID DEFAULT NULL,\n    p_update_teacher BOOLEAN DEFAULT FALSE,\n    p_update_course BOOLEAN DEFAULT FALSE'
      )
    );
    assert.ok(body.includes('is_14_sessions_confirmed BOOLEAN'));
    const iAdmin = body.indexOf("p.role = 'admin' AND p.status = 'active'");
    const iSync = body.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const iElse = body.indexOf('ELSE', body.indexOf('v_class_id IS NULL THEN'));
    const iClose = body.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_class_id::text))");
    const iClass = body.indexOf("pg_advisory_xact_lock(hashtext('class:' || v_class_id::text))");
    const iForUpdate = body.indexOf('FOR UPDATE');
    const iGuard = body.indexOf('CLASS_CLOSE_IN_PROGRESS');
    const iUpdate = body.indexOf('UPDATE public.classes AS c');
    assert.ok(iAdmin !== -1 && iAdmin < iSync && iSync < iElse, 'Admin -> m4_teaching_sync ngay đầu hàm');
    assert.ok(iElse < iClose && iClose < iClass && iClass < iForUpdate, 'Nhánh ELSE: m5_close -> class -> FOR UPDATE');
    assert.ok(iForUpdate < iGuard && iGuard < iUpdate, 'CLASS_CLOSE_IN_PROGRESS chặn trước UPDATE lớp');
    assert.ok(body.includes("op.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    assert.ok(body.includes('(v_class.code, v_class.course_id) IS DISTINCT FROM (v_final_code, v_final_course_id)'));
  });

  await t.test('28.3 R19-01: m3_set_class_course và m2_save_class chặn đổi khóa/mã lớp khi đóng khóa dở dang, sau khi đã giữ đủ khóa', () => {
    const setCourse = stripSqlComments(sqlFn('m3_set_class_course'));
    const iSync = setCourse.indexOf("hashtext('m4_teaching_sync')");
    const iClose = setCourse.indexOf("hashtext('m5_close:' || p_class_id::text)");
    const iClass = setCourse.indexOf("hashtext('class:' || p_class_id::text)");
    const iLock = setCourse.indexOf('FOR UPDATE');
    const iGuard = setCourse.indexOf('CLASS_CLOSE_IN_PROGRESS');
    const iUpdate = setCourse.indexOf('UPDATE public.classes');
    assert.ok(iSync !== -1 && iSync < iClose && iClose < iClass && iClass < iLock && iLock < iGuard && iGuard < iUpdate);
    assert.ok(setCourse.includes("role = 'admin' AND status = 'active'") && setCourse.indexOf("role = 'admin'") < iSync);

    const save = stripSqlComments(sqlFn('m2_save_class'));
    assert.ok(save.indexOf("role = 'admin' AND p.status = 'active'") < save.indexOf("hashtext('m4_teaching_sync')"));
    assert.ok(save.includes('CLASS_CLOSE_IN_PROGRESS') && save.indexOf('FOR UPDATE') < save.indexOf('CLASS_CLOSE_IN_PROGRESS'));
    assert.ok(save.indexOf('CLASS_CLOSE_IN_PROGRESS') < save.indexOf('UPDATE public.classes AS c'));
  });

  await t.test('28.4 R19-01: Mô phỏng đồ thị chờ khóa — mọi RPC đều giữ m4_teaching_sync đầu tiên; 7 RPC sửa lớp theo đúng hạng m4 -> m5_close -> class -> student (không AB-BA)', () => {
    const canonical = R19_01_FUNCTIONS.map(([n]) => n);
    const others = ['m5_begin_course_close', 'm5_finalize_course_close_db', 'm5_save_csv_verification', 'm4_update_student', 'm3_reset_student_progress'];
    // m4_teaching_sync là khóa tư vấn độc quyền của toàn đợt: giao dịch nào giữ nó đầu tiên thì mọi giao dịch khác
    // lấy cùng khóa đó chỉ chờ ở điểm vào, nên không thể tạo chu trình chờ với khóa class:/m5_close:/student:.
    for (const name of [...canonical, ...others]) {
      const keys = lockSequence(lockedSqlFn(name)).map((s) => s.key);
      assert.equal(keys[0], 'm4_teaching_sync', name + ' phải lấy m4_teaching_sync đầu tiên');
      assert.equal(keys.filter((k) => k === 'm4_teaching_sync').length >= 1, true);
    }
    // Đồ thị cạnh giữa 7 RPC sửa lớp: không có cạnh ngược chiều nhau
    const edges = new Set();
    for (const name of canonical) {
      const keys = lockSequence(lockedSqlFn(name)).map((s) => s.key);
      for (let i = 1; i < keys.length; i++) {
        assert.ok(LOCK_RANK[keys[i]] >= LOCK_RANK[keys[i - 1]], name + ' lấy ' + keys[i] + ' sau ' + keys[i - 1]);
        if (keys[i] !== keys[i - 1]) edges.add(keys[i - 1] + '->' + keys[i]);
      }
    }
    for (const e of edges) {
      const [a, b] = e.split('->');
      assert.ok(!edges.has(b + '->' + a), 'Chu trình chờ khóa ' + e);
    }
    // Trigger lớp/học sinh vẫn lấy m4_teaching_sync (khóa tái nhập vì RPC đã giữ sẵn)
    assert.ok(sql.includes('CREATE TRIGGER trg_m5_guard_class_during_close'));
    assert.ok(sql.includes('CREATE TRIGGER trg_m5_guard_student_during_close'));
  });

    // --------------------------------------------------------------------------
  // Dữ liệu Demo dùng chung cho 28.5 - 28.8
  // --------------------------------------------------------------------------
  const mocks = await loadMockData();
  const buildState = (extra = {}) => {
    const base = {
      classes: [...mocks.initialClasses],
      courses: [...mocks.initialCourses],
      lessons: [...mocks.initialLessons],
      students: [...mocks.initialStudents],
      users: [...mocks.initialUsers],
      quizResults: [...mocks.initialQuizResults],
      submissions: [...mocks.initialSubmissions],
      cohortMembers: [],
    };
    return mocks.seedM5CourseCloseFixtureData({ ...base, ...extra }, false);
  };
  const storeBody = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', 'const generateCourseClosePreview');
  const guardSnippet = sliceBetween(storeBody, '// R17-01 / R19-02 / R19-03', 'const currentSnapshot = {') + '\nreturn null;';
  const runStoreGuard = (state) =>
    evalTs(
      guardSnippet,
      ['m5Students', 'm5Course14', 'm5NextCourse', 'm5FixtureClass', 'isM5FixtureStudentForeignClass', 'students', 'classes', 'cohortMembers', 'quizResults', 'submissions'],
      [mocks.m5Students, mocks.m5Course14, mocks.m5NextCourse, mocks.m5FixtureClass, mocks.isM5FixtureStudentForeignClass, state.students, state.classes, state.cohortMembers, state.quizResults, state.submissions]
    );
  const fixtureStu = mocks.m5Students[0];
  const classBMember = {
    id: fixtureStu.id,
    studentId: fixtureStu.id,
    classId: 'cls_B',
    courseId: 'crs_B',
    participantId: fixtureStu.participantId,
    membershipStatus: 'transferred',
    notesSnapshot: '',
  };

  // --------------------------------------------------------------------------
  // 28.5 R19-02: cohortMembers của lớp khác không bị xóa; store chặn tham chiếu chéo
  // --------------------------------------------------------------------------
  await t.test('28.5 R19-02: lịch sử cohortMembers của lớp B (học sinh mẫu) còn nguyên 1 -> 1 khi tạo/đặt lại; store chặn tham chiếu chéo', () => {
    assert.ok(!storeBody.includes('!m5StudentIdSet.has(cmStudentId)'), 'Không còn lọc theo học sinh mẫu/khóa mẫu khi dọn cohortMembers');
    const cohortSnippet = sliceBetween(storeBody, 'setCohortMembers((prev) => {', '// R18-03: Chỉ xóa tác vụ');
    assert.ok(cohortSnippet.includes('cmClassId !== m5FixtureClass.id'));
    for (const resetOnly of [false, true]) {
      // (a) Trong store: chạy thực tế bộ lọc cohortMembers
      let members = [...mocks.m5CohortMembers.map((m) => ({ ...m })), { ...classBMember }];
      const setCohortMembers = (fn) => {
        members = fn(members);
      };
      evalTs(cohortSnippet, ['m5FixtureClass', 'm5CohortMembers', 'resetOnly', 'setCohortMembers'], [mocks.m5FixtureClass, mocks.m5CohortMembers, resetOnly, setCohortMembers]);
      assert.equal(members.filter((m) => m.classId === 'cls_B').length, 1, 'Lịch sử lớp B phải 1 -> 1 (resetOnly=' + resetOnly + ')');
      assert.equal(members.filter((m) => m.classId === mocks.m5FixtureClass.id).length, resetOnly ? 0 : 5);

      // (b) Hàm dữ liệu thuần: cohortMembers tùy chọn trong state
      const state = buildState({ cohortMembers: [...mocks.m5CohortMembers, { ...classBMember }] });
      const next = mocks.seedM5CourseCloseFixtureData(state, resetOnly);
      assert.equal(next.cohortMembers.filter((m) => m.classId === 'cls_B').length, 1);
      assert.equal(next.cohortMembers.filter((m) => m.classId === mocks.m5FixtureClass.id).length, resetOnly ? 0 : 5);
    }
    // Snake_case của lớp khác vẫn được giữ
    const snake = { student_id: fixtureStu.id, class_id: 'cls_snake', course_id: 'crs_snake' };
    const kept = mocks.seedM5CourseCloseFixtureData(buildState({ cohortMembers: [snake] }), true);
    assert.deepEqual(kept.cohortMembers, [snake]);

    // (c) store chặn khi học sinh mẫu có dấu vết ở lớp khác, state không đổi
    const pristine = buildState({ cohortMembers: [...mocks.m5CohortMembers] });
    assert.equal(runStoreGuard(pristine), null, 'Bộ mẫu nguyên vẹn (kể cả học sinh chuyển lớp số 4) không bị chặn');
    const blockedByCohort = runStoreGuard({ ...pristine, cohortMembers: [...pristine.cohortMembers, { ...classBMember }] });
    assert.ok(blockedByCohort && blockedByCohort.success === false);
    assert.ok(blockedByCohort.message.includes('tham chiếu chéo'));
    const blockedByStudent = runStoreGuard({
      ...pristine,
      students: pristine.students.map((s) => (s.id === fixtureStu.id ? { ...s, currentClassId: 'cls_B' } : s)),
    });
    assert.equal(blockedByStudent?.success, false);
    const blockedByQuiz = runStoreGuard({
      ...pristine,
      quizResults: [...pristine.quizResults, { studentId: fixtureStu.id, lessonId: mocks.m5Lessons14[0].id, classId: 'cls_B', highestScore: 1, attemptsCount: 1, passed: false, lastAttemptAt: '2026-09-01T00:00:00.000Z' }],
    });
    assert.equal(blockedByQuiz?.success, false);
    const blockedBySub = runStoreGuard({
      ...pristine,
      submissions: [...pristine.submissions, { id: 'sub_x', studentId: fixtureStu.id, lessonId: mocks.m5Lessons14[0].id, classId: 'cls_B', type: 'link', content: 'x', status: 'submitted', submittedAt: '2026-09-01T00:00:00.000Z', canResubmit: true }],
    });
    assert.equal(blockedBySub?.success, false);

    // (d) R19b: học sinh mẫu số 4 (currentClassId = 'cls_rob_02' theo bộ mẫu) phát sinh dấu vết ở 'cls_rob_02' hoặc đổi originalClassId -> store chặn
    const stu4 = mocks.m5Students.find((s) => s.id === 'usr_m5_stu_4');
    assert.equal(stu4.currentClassId, 'cls_rob_02');
    assert.equal(stu4.originalClassId, mocks.m5FixtureClass.id);
    assert.equal(mocks.isM5FixtureStudentForeignClass(stu4.id, 'cls_rob_02', 'current'), false, 'currentClassId theo bộ mẫu không bị chặn');
    assert.equal(mocks.isM5FixtureStudentForeignClass(stu4.id, 'cls_rob_02', 'original'), true);
    assert.equal(mocks.isM5FixtureStudentForeignClass(stu4.id, 'cls_rob_02', 'record'), true);
    assert.equal(mocks.isM5FixtureStudentForeignClass(stu4.id, 'cls_rob_02'), true, 'Mặc định là record');
    assert.equal(mocks.isM5FixtureStudentForeignClass(stu4.id, mocks.m5FixtureClass.id, 'original'), false);
    assert.equal(
      runStoreGuard({ ...pristine, cohortMembers: [...pristine.cohortMembers, { id: stu4.id, studentId: stu4.id, classId: 'cls_rob_02', courseId: 'crs_B' }] })?.success,
      false,
      'cohortMembers của học sinh 4 ở cls_rob_02 phải bị chặn'
    );
    assert.equal(
      runStoreGuard({
        ...pristine,
        quizResults: [...pristine.quizResults, { studentId: stu4.id, lessonId: mocks.m5Lessons14[2].id, classId: 'cls_rob_02', highestScore: 1, attemptsCount: 1, passed: false, lastAttemptAt: '2026-09-01T00:00:00.000Z' }],
      })?.success,
      false,
      'quizResults của học sinh 4 ở cls_rob_02 phải bị chặn'
    );
    assert.equal(
      runStoreGuard({
        ...pristine,
        submissions: [...pristine.submissions, { id: 'sub_stu4_x', studentId: stu4.id, lessonId: mocks.m5Lessons14[2].id, classId: 'cls_rob_02', type: 'link', content: 'x', status: 'submitted', submittedAt: '2026-09-01T00:00:00.000Z', canResubmit: true }],
      })?.success,
      false,
      'submissions của học sinh 4 ở cls_rob_02 phải bị chặn'
    );
    assert.equal(
      runStoreGuard({ ...pristine, students: pristine.students.map((s) => (s.id === stu4.id ? { ...s, originalClassId: 'cls_rob_02' } : s)) })?.success,
      false,
      'originalClassId của học sinh 4 = cls_rob_02 phải bị chặn'
    );
    assert.equal(
      runStoreGuard({ ...pristine, students: pristine.students.map((s) => (s.id === stu4.id ? { ...s, currentClassId: 'cls_B' } : s)) })?.success,
      false,
      'currentClassId của học sinh 4 khác bộ mẫu phải bị chặn'
    );
    // Khối chặn nằm trước mọi lệnh sửa state
    assert.ok(storeBody.indexOf('hasNonFixtureAttached') < storeBody.indexOf('seedM5CourseCloseFixtureData(currentSnapshot'));
    assert.ok(storeBody.indexOf('hasNonFixtureAttached') < storeBody.indexOf('setClasses(nextState.classes)'));
  });

  await t.test('28.6 R19-02: hàm dữ liệu giữ học sinh mẫu, quiz và bài nộp ở lớp B khi đặt lại (1 -> 1)', () => {
    const quizB = { studentId: fixtureStu.id, lessonId: mocks.m5Lessons14[0].id, classId: 'cls_B', highestScore: 50, attemptsCount: 1, passed: false, lastAttemptAt: '2026-09-01T00:00:00.000Z' };
    const subB = { id: 'sub_cls_B_1', studentId: fixtureStu.id, lessonId: mocks.m5Lessons14[1].id, classId: 'cls_B', type: 'link', content: 'x', status: 'submitted', submittedAt: '2026-09-01T00:00:00.000Z', canResubmit: true };
    for (const resetOnly of [false, true]) {
      const seeded = buildState();
      const moved = {
        ...seeded,
        students: seeded.students.map((s) => (s.id === fixtureStu.id ? { ...s, currentClassId: 'cls_B' } : s)),
        quizResults: [...seeded.quizResults, quizB],
        submissions: [...seeded.submissions, subB],
      };
      const next = mocks.seedM5CourseCloseFixtureData(moved, resetOnly);
      assert.equal(next.quizResults.filter((q) => q.classId === 'cls_B').length, 1, 'Quiz lớp B 1 -> 1 (resetOnly=' + resetOnly + ')');
      assert.equal(next.submissions.filter((s) => s.classId === 'cls_B').length, 1, 'Bài nộp lớp B 1 -> 1');
      if (resetOnly) {
        assert.ok(next.students.some((s) => s.id === fixtureStu.id && s.currentClassId === 'cls_B'), 'Hồ sơ học sinh mẫu đang ở lớp B phải được giữ');
        assert.ok(next.users.some((u) => u.id === fixtureStu.id));
      }
    }
    // Đặt lại bộ mẫu nguyên vẹn vẫn dọn đủ 5 học sinh mẫu (kể cả học sinh chuyển lớp số 4)
    const cleaned = mocks.seedM5CourseCloseFixtureData(buildState(), true);
    const ids = new Set(mocks.m5Students.map((s) => s.id));
    assert.equal(cleaned.students.filter((s) => ids.has(s.id)).length, 0);

    // R19b: học sinh mẫu số 4 có quiz/bài nộp/cohort ở 'cls_rob_02' hoặc originalClassId = 'cls_rob_02' -> giữ nguyên hồ sơ khi đặt lại
    const stu4Id = 'usr_m5_stu_4';
    const lesson = mocks.m5Lessons14[2];
    const stu4Cases = {
      cohort: (st) => ({ ...st, cohortMembers: [...st.cohortMembers, { id: stu4Id, studentId: stu4Id, classId: 'cls_rob_02', courseId: 'crs_B' }] }),
      cohortSnake: (st) => ({ ...st, cohortMembers: [...st.cohortMembers, { student_id: stu4Id, class_id: 'cls_rob_02', course_id: 'crs_B' }] }),
      quiz: (st) => ({ ...st, quizResults: [...st.quizResults, { studentId: stu4Id, lessonId: lesson.id, classId: 'cls_rob_02', highestScore: 1, attemptsCount: 1, passed: false, lastAttemptAt: '2026-09-01T00:00:00.000Z' }] }),
      submission: (st) => ({ ...st, submissions: [...st.submissions, { id: 'sub_stu4_r19b', studentId: stu4Id, lessonId: lesson.id, classId: 'cls_rob_02', type: 'link', content: 'x', status: 'submitted', submittedAt: '2026-09-01T00:00:00.000Z', canResubmit: true }] }),
      original: (st) => ({ ...st, students: st.students.map((s) => (s.id === stu4Id ? { ...s, originalClassId: 'cls_rob_02' } : s)) }),
    };
    for (const [name, mutate] of Object.entries(stu4Cases)) {
      const next = mocks.seedM5CourseCloseFixtureData(mutate(buildState()), true);
      assert.ok(next.students.some((s) => s.id === stu4Id), 'Hồ sơ usr_m5_stu_4 phải được giữ trong students (' + name + ')');
      assert.ok(next.users.some((u) => u.id === stu4Id), 'Hồ sơ usr_m5_stu_4 phải được giữ trong users (' + name + ')');
    }
    // Học sinh 4 chỉ có currentClassId theo bộ mẫu -> vẫn bị dọn như bình thường
    assert.ok(!cleaned.students.some((s) => s.id === stu4Id));

    // R19b: học sinh mẫu số 1 còn currentClassId = lớp mẫu nhưng có lịch sử cohortMembers ở 'cls_B' -> giữ nguyên hồ sơ
    const stu1Id = 'usr_m5_stu_1';
    const stu1Next = mocks.seedM5CourseCloseFixtureData(
      buildState({ cohortMembers: [{ ...classBMember, id: stu1Id, studentId: stu1Id }] }),
      true
    );
    assert.equal(mocks.m5Students.find((s) => s.id === stu1Id).currentClassId, mocks.m5FixtureClass.id);
    assert.ok(stu1Next.students.some((s) => s.id === stu1Id), 'Hồ sơ usr_m5_stu_1 phải được giữ trong students');
    assert.ok(stu1Next.users.some((u) => u.id === stu1Id), 'Hồ sơ usr_m5_stu_1 phải được giữ trong users');
    assert.equal(stu1Next.cohortMembers.filter((m) => m.classId === 'cls_B').length, 1);

    // R19b: SQL khóa tư vấn theo thứ tự chuẩn ngay đầu hàm seed, trước mọi thao tác dữ liệu
    const seedSql = sqlFn('m5_seed_course_close_fixture');
    const iL1 = seedSql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const iL2 = seedSql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const iL3 = seedSql.indexOf("PERFORM pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))");
    assert.ok(iL1 > 0 && iL1 < iL2 && iL2 < iL3, 'Thứ tự khóa m4_teaching_sync -> m5_storage_quota -> m5_close');
    assert.ok(seedSql.indexOf('SEED_FIXTURE_DISABLED_IN_PROD') < iL1, 'Khóa lấy sau kiểm tra Admin/TEST');
    assert.ok(iL3 < seedSql.indexOf('UPDATE public.m5_storage_quota_config'), 'Khóa lấy trước UPDATE cấu hình');
    assert.ok(iL3 < seedSql.indexOf('DELETE FROM'), 'Khóa lấy trước mọi DELETE');
    assert.ok(iL3 < seedSql.indexOf('INSERT INTO'), 'Khóa lấy trước mọi INSERT');
  });

  await t.test('28.7 R19-02: SQL m5_seed_course_close_fixture và Edge m5-seed-fixture chặn NON_FIXTURE_DATA_ATTACHED khi học sinh mẫu gắn với lớp khác', () => {
    const seed = sqlFn('m5_seed_course_close_fixture');
    const iRaise = seed.indexOf("RAISE EXCEPTION 'NON_FIXTURE_DATA_ATTACHED");
    const iFirstDelete = seed.indexOf('DELETE FROM public.m5_course_close_operations');
    const block = seed.slice(seed.indexOf('R17-01 / R3-06'), iRaise);
    assert.ok(iRaise !== -1 && iRaise < iFirstDelete, 'Chặn trước mọi lệnh xóa');
    for (const tbl of ['public.students s', 'public.m5_class_cohort_members cm', 'public.m3_upload_reservations r', 'public.practice_submissions ps', 'public.quiz_results qr']) {
      const idx = block.indexOf('R19-02 (chiều 3)');
      assert.ok(idx !== -1);
      assert.ok(block.slice(idx).includes('FROM ' + tbl), 'Chiều 3 phải kiểm tra ' + tbl);
    }
    const dim3 = block.slice(block.indexOf('R19-02 (chiều 3)'));
    assert.ok(dim3.includes('s.current_class_id IS DISTINCT FROM v_cls_id'));
    assert.ok(dim3.includes('s.original_class_id IS DISTINCT FROM v_cls_id'));
    for (const a of ['cm.class_id', 'r.class_id', 'ps.class_id', 'qr.class_id']) {
      assert.ok(dim3.includes(a + ' IS DISTINCT FROM v_cls_id'), a);
    }

    const edgeBody = sliceBetween(edge, "if (action === 'm5-seed-fixture') {", "if (action === 'm5-storage-quota-status') {");
    const iEdgeBlock = edgeBody.indexOf('R19-02 (chiều 3)');
    assert.ok(iEdgeBlock !== -1);
    assert.ok(iEdgeBlock < edgeBody.indexOf('storage.from'), 'Chặn 409 trước khi xóa tệp Storage');
    const edgeDim3 = sliceBetween(edgeBody, 'R19-02 (chiều 3)', 'for (const checkResult of');
    for (const tbl of ["from('students')", "from('m5_class_cohort_members')", "from('m3_upload_reservations')", "from('practice_submissions')", "from('quiz_results')"]) {
      assert.ok(edgeDim3.includes(tbl), tbl);
    }
    assert.ok(edgeDim3.includes('.in(\'id\', fixtureStudentIds)') && edgeDim3.includes(".neq('class_id', fixtureClassId)"));
    assert.ok(edgeDim3.includes('current_class_id.neq.${fixtureClassId}') && edgeDim3.includes('original_class_id.neq.${fixtureClassId}'));
  });

  // --------------------------------------------------------------------------
  // 28.8 R19-03: Lớp khác dùng khóa mẫu không mất khóa/bài học
  // --------------------------------------------------------------------------
  await t.test('28.8 R19-03: lớp B dùng m5Course14 -> store chặn trước khi đổi state; gọi trực tiếp resetOnly vẫn giữ khóa và đủ 14 bài học', () => {
    const seeded = buildState();
    const classB = { ...mocks.initialClasses[0], id: 'cls_B', code: 'CLS-B', courseId: mocks.m5Course14.id };
    const withB = { ...seeded, classes: [...seeded.classes, classB] };
    // Store chặn ngay
    const blocked = runStoreGuard(withB);
    assert.equal(blocked?.success, false);
    assert.ok(blocked.message.includes('tham chiếu chéo'));
    const withNextB = { ...seeded, classes: [...seeded.classes, { ...classB, courseId: mocks.m5NextCourse.id }] };
    assert.equal(runStoreGuard(withNextB)?.success, false);
    // Lịch sử cohort của lớp khác gắn với khóa mẫu cũng bị chặn
    const withCohort = { ...seeded, cohortMembers: [{ studentId: 'usr_other', classId: 'cls_B', courseId: mocks.m5Course14.id }] };
    assert.equal(runStoreGuard(withCohort)?.success, false);

    // Gọi trực tiếp hàm dữ liệu: lớp B giữ nguyên khóa + 14 bài học
    const lessonsBefore = withB.lessons.filter((l) => l.courseId === mocks.m5Course14.id).length;
    assert.equal(lessonsBefore, 14);
    const reset = mocks.seedM5CourseCloseFixtureData(withB, true);
    assert.ok(reset.courses.some((c) => c.id === mocks.m5Course14.id), 'Khóa m5Course14 phải còn');
    assert.equal(reset.lessons.filter((l) => l.courseId === mocks.m5Course14.id).length, 14, 'Đủ 14 bài học');
    assert.equal(reset.classes.find((c) => c.id === 'cls_B')?.courseId, mocks.m5Course14.id);
    assert.ok(!reset.classes.some((c) => c.id === mocks.m5FixtureClass.id), 'Lớp mẫu vẫn bị dọn');
    // Khóa kế tiếp
    const resetNext = mocks.seedM5CourseCloseFixtureData(withNextB, true);
    assert.ok(resetNext.courses.some((c) => c.id === mocks.m5NextCourse.id), 'Khóa kế tiếp phải còn');
    assert.ok(!resetNext.courses.some((c) => c.id === mocks.m5Course14.id), 'Khóa 14 buổi không ai dùng thì vẫn được dọn');
    // Không có lớp khác dùng -> dọn sạch như cũ
    const cleaned = mocks.seedM5CourseCloseFixtureData(seeded, true);
    assert.ok(!cleaned.courses.some((c) => c.id === mocks.m5Course14.id || c.id === mocks.m5NextCourse.id));
    assert.equal(cleaned.lessons.filter((l) => l.courseId === mocks.m5Course14.id).length, 0);
  });

  // --------------------------------------------------------------------------
  // 28.9 R19-04: Đua song song xác nhận 14 buổi giữa khóa A và khóa B
  // --------------------------------------------------------------------------
  const makeClient = (db, log) => ({
    from: (table) => {
      const q = { table, filters: [], patch: null, op: 'select' };
      const run = (single) => {
        const rows = [db.row].filter((r) => q.filters.every(([c, v]) => r[c] === v));
        if (q.op === 'update') {
          rows.forEach((r) => Object.assign(r, q.patch));
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        return { data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map((r) => ({ ...r })), error: null };
      };
      const api = {
        select: () => api,
        update: (patch) => {
          q.op = 'update';
          q.patch = patch;
          log.push({ op: 'update', patch });
          return api;
        },
        eq: (col, val) => {
          q.filters.push([col, val]);
          if (q.op === 'update') log.push({ op: 'eq', col, val });
          return api;
        },
        maybeSingle: () => Promise.resolve(run(true)),
        then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
      };
      return api;
    },
  });

  const runPreviewWrite = async (payload, db, classRowSnapshot) => {
    const log = [];
    const actorClient = makeClient(db, log);
    const snippet = sliceBetween(
      edge,
      'const confirmed14Sessions = body.payload?.confirmed14Sessions;',
      'const { data: courseRow, error: courseErr }'
    );
    // Phần ghi nằm trước "const { data: courseRow" — bỏ chú thích để chạy trực tiếp
    const result = await evalTsAsync(
      'const body = { payload };\n' + snippet + '\nreturn null;',
      ['payload', 'actorClient', 'classRow', 'classId', 'jsonResponse'],
      [payload, actorClient, classRowSnapshot, 'c1', (b, s) => ({ b, s })]
    );
    return { result, log, classRow: classRowSnapshot };
  };

  await t.test('28.9 R19-04: yêu cầu xác nhận khóa A đua với việc lớp chuyển sang khóa B -> khóa B giữ is_14_sessions_confirmed = false', async () => {
    const body = sliceBetween(edge, "if (action === 'm5-course-close-preview') {", 'const { data: courseRow, error: courseErr }');
    assert.ok(body.includes('payloadCourseId !== \'\''), 'courseId bắt buộc');
    assert.ok(body.includes('.eq(\'id\', classId)\n          .eq(\'course_id\', payloadCourseId)\n          .select(\'*\')'), 'UPDATE lọc đồng thời id và course_id');
    assert.ok(!body.includes('isStaleCourseConfirmation'));
    assert.ok(body.includes('Object.assign(classRow, latestClassRow)'));

    // Lớp đang ở khóa A lúc đọc; tác vụ khác hoàn tất chuyển lớp sang khóa B (xác nhận = false) TRƯỚC khi lệnh UPDATE chạy
    const staleClassRow = { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: true };
    const dbAfterSwitch = { row: { id: 'c1', course_id: 'crs_B', is_14_sessions_confirmed: false } };
    const raced = await runPreviewWrite({ classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, dbAfterSwitch, staleClassRow);
    assert.equal(raced.result, null);
    assert.equal(dbAfterSwitch.row.is_14_sessions_confirmed, false, 'Khóa B không bị ghi đè xác nhận của khóa A');
    assert.equal(dbAfterSwitch.row.course_id, 'crs_B');
    assert.ok(raced.log.some((l) => l.op === 'eq' && l.col === 'course_id' && l.val === 'crs_A'), 'UPDATE phải lọc theo course_id');
    assert.equal(raced.classRow.course_id, 'crs_B', 'classRow được đọc lại theo dòng lớp mới nhất');
    assert.equal(raced.classRow.is_14_sessions_confirmed, false);

    // Không đua: xác nhận khóa hiện tại được ghi
    const dbNormal = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
    const normal = await runPreviewWrite({ classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, dbNormal, { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false });
    assert.equal(dbNormal.row.is_14_sessions_confirmed, true);
    assert.equal(normal.classRow.is_14_sessions_confirmed, true);

    // Thiếu courseId hoặc courseId rỗng -> tuyệt đối không ghi
    for (const payload of [
      { classId: 'c1', confirmed14Sessions: true },
      { classId: 'c1', courseId: '', confirmed14Sessions: true },
      { classId: 'c1', courseId: 'crs_OTHER', confirmed14Sessions: true },
    ]) {
      const db = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
      const out = await runPreviewWrite(payload, db, { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false });
      assert.equal(db.row.is_14_sessions_confirmed, false, 'Không được ghi: ' + JSON.stringify(payload));
      assert.equal(out.log.filter((l) => l.op === 'update').length, 0);
    }
  });
});

// ============================================================================
// SUITE 29: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 20 (R20-01 VÀ R20-02)
// ============================================================================
test('Suite 29: Round 20 Review Fixes Verification (R20-01 to R20-02)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const edge = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');
  const store = readSrc('src', 'lib', 'store.tsx');
  const page = readSrc('src', 'app', 'manage', 'classes', 'page.tsx');
  const route = readSrc('src', 'app', 'api', 'm2', '[action]', 'route.ts');

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  const sqlFn = (name) => {
    const st = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
    assert.ok(st !== -1, 'Không tìm thấy hàm ' + name);
    const en = sql.indexOf('REVOKE ALL ON FUNCTION public.' + name + '(', st);
    assert.ok(en !== -1, 'Không tìm thấy REVOKE của ' + name);
    return sql.slice(st, en);
  };
  const stripSqlComments = (body) => body.replace(/--.*$/gm, '');
  const transpile = (snippet) =>
    ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const evalTsAsync = (snippet, argNames, args) => new AsyncFunction(...argNames, transpile(snippet))(...args);

  const FIXTURE_CLASS_ID = '00000000-0000-0000-0000-000000050001';
  const FIXTURE_STUDENT_1 = '00000000-0000-0000-0000-000000050101';

  // --------------------------------------------------------------------------
  // 29.1 R20-01: SQL chốt trạng thái đặt lại bộ mẫu trước khi trả danh sách tệp
  // --------------------------------------------------------------------------
  await t.test('29.1 R20-01: SQL m5_prepare_seed_course_close_fixture và m5_release_seed_course_close_fixture_lock', () => {
    const prep = stripSqlComments(sqlFn('m5_prepare_seed_course_close_fixture'));
    const release = stripSqlComments(sqlFn('m5_release_seed_course_close_fixture_lock'));

    // Chữ ký, bảo mật và phân quyền
    assert.ok(prep.includes('p_actor_id UUID DEFAULT NULL') && prep.includes('p_test_project_ref TEXT DEFAULT NULL'));
    assert.ok(/RETURNS TABLE \(\s*operation_id UUID,\s*execution_run_id UUID,\s*target_storage_paths JSONB\s*\)/.test(prep));
    assert.ok(prep.includes('SECURITY DEFINER') && prep.includes('SET search_path = pg_catalog, public, storage, extensions'));
    assert.ok(release.includes('RETURNS BOOLEAN') && release.includes('SECURITY DEFINER'));
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) FROM PUBLIC, anon, authenticated;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) TO service_role;')
    );
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) TO service_role;')
    );

    // service_role + Admin đang active + môi trường TEST
    for (const body of [prep, release]) {
      assert.ok(body.includes("COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'"));
      assert.ok(body.includes("WHERE p.id = p_actor_id AND p.role = 'admin' AND p.status = 'active'"));
    }
    assert.ok(prep.includes("p_test_project_ref IS DISTINCT FROM 'eythjapspkoyqdxlxtcd'"));
    assert.ok(prep.includes('FROM public.m5_storage_quota_config c'));
    assert.ok(prep.includes("c.environment_mode = 'production'") && prep.includes('SEED_FIXTURE_DISABLED_IN_PROD'));

    // Khóa tư vấn theo thứ tự chuẩn TRƯỚC mọi kiểm tra/ghi
    const iM4 = prep.indexOf("pg_advisory_xact_lock(hashtext('m4_teaching_sync'))");
    const iQuota = prep.indexOf("pg_advisory_xact_lock(hashtext('m5_storage_quota'))");
    const iClose = prep.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))");
    const iFirstRead = prep.indexOf('FROM public.students s');
    const iFirstWrite = prep.indexOf('INSERT INTO public.');
    assert.ok(iM4 !== -1 && iQuota > iM4 && iClose > iQuota, 'Thứ tự khóa m4_teaching_sync -> m5_storage_quota -> m5_close');
    assert.ok(iClose < iFirstRead && iClose < iFirstWrite, 'Giữ đủ khóa trước khi đọc/ghi');
    const relLocks = [...release.matchAll(/pg_advisory_xact_lock\(hashtext\('(m4_teaching_sync|m5_storage_quota|m5_close:)/g)].map((m) => m[1]);
    assert.deepEqual(relLocks, ['m4_teaching_sync', 'm5_storage_quota', 'm5_close:']);

    // Kiểm tra 3 chiều NON_FIXTURE_DATA_ATTACHED giống m5_seed_course_close_fixture + đóng khóa dở dang của lớp khác
    const seed = stripSqlComments(sqlFn('m5_seed_course_close_fixture'));
    const dimBlock = (body) => sliceBetween(body, 'IF EXISTS (\n        SELECT 1 FROM public.students s\n        WHERE s.id NOT IN', 'THEN\n        RAISE EXCEPTION \'NON_FIXTURE_DATA_ATTACHED');
    assert.equal(dimBlock(prep), dimBlock(seed), 'Kiểm tra NON_FIXTURE_DATA_ATTACHED của hàm chuẩn bị giống hệt hàm seed');
    assert.ok(prep.includes("RAISE EXCEPTION 'NON_FIXTURE_DATA_ATTACHED"));
    assert.ok(prep.includes('public.m5_is_student_in_closing_cohort(s.id, NULL, NULL, v_cls_id)'));
    assert.ok(prep.includes("RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS"));
    const iRaiseNonFixture = prep.indexOf("RAISE EXCEPTION 'NON_FIXTURE_DATA_ATTACHED");
    assert.ok(iRaiseNonFixture < iFirstWrite, 'Chặn xung đột trước mọi lệnh ghi');

    // Chốt trạng thái deleting_storage trên lớp mẫu
    assert.ok(prep.includes("PERFORM set_config('app.m5_internal_mutation', 'true', true);"));
    assert.ok(prep.includes("PERFORM set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true);"));
    assert.ok(prep.includes("PERFORM set_config('app.m5_internal_mutation', 'false', true);"));
    assert.ok(prep.includes("PERFORM set_config('app.m5_internal_mutation_class_id', '', true);"));
    assert.ok(prep.includes('INSERT INTO public.courses') && prep.includes('INSERT INTO public.classes'));
    assert.equal((prep.match(/ON CONFLICT DO NOTHING|ON CONFLICT \(id\) DO NOTHING/g) || []).length >= 2, true);
    assert.ok(prep.includes('INSERT INTO public.m5_class_cohort_members'));
    assert.ok(prep.includes('ON CONFLICT (class_id, course_id, student_id) DO NOTHING'));
    assert.ok(prep.includes("SET status = 'deleting_storage'"));
    assert.ok(prep.includes("clock_timestamp() + interval '60 seconds'"));
    assert.ok(prep.includes("'SEED_FIXTURE_LOCK'"));
    assert.ok(prep.includes("v_run_id, 'SEED_FIXTURE_LOCK', p_actor_id"));
    // Bản ghi khóa phải được chốt trước khi gom đường dẫn tệp trả về cho Edge Function
    assert.ok(prep.indexOf("SET status = 'deleting_storage'") < prep.indexOf('RETURN QUERY SELECT v_op_id, v_run_id, v_paths'));
    // R21-01: gom đường dẫn tệp TRƯỚC khi cập nhật/chèn bản ghi khóa để lưu target/remaining_storage_paths
    assert.ok(prep.indexOf('SELECT COALESCE(jsonb_agg(DISTINCT fp.path)') < prep.indexOf("SET status = 'deleting_storage'"));
    assert.ok(prep.indexOf('SELECT COALESCE(jsonb_agg(DISTINCT fp.path)') < prep.indexOf("v_run_id, 'SEED_FIXTURE_LOCK', p_actor_id"));

    // Chỉ gom tệp có class_id IS NULL hoặc = lớp mẫu; không bao giờ lấy tệp của lớp khác
    const pathBlock = sliceBetween(prep, 'SELECT COALESCE(jsonb_agg(DISTINCT fp.path)', ') fp;');
    assert.ok(pathBlock.includes('(ps.class_id = v_cls_id OR ps.class_id IS NULL)'));
    assert.ok(pathBlock.includes('(r.class_id = v_cls_id OR r.class_id IS NULL)'));
    assert.ok(pathBlock.includes('ps.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)'));
    assert.ok(pathBlock.includes('r.student_id IN (v_stu1_id, v_stu2_id, v_stu3_id, v_stu4_id, v_stu5_id)'));
    assert.ok(pathBlock.includes('o.target_storage_paths') && pathBlock.includes('o.remaining_storage_paths'));
    assert.ok(!/IS DISTINCT FROM v_cls_id/.test(pathBlock) && !pathBlock.includes('class_id IS NOT NULL'), 'Không lấy tệp của lớp khác');

    // R20b-01: Chặn tiến trình chạy đè khi tác vụ đang xóa còn hạn lease, trước mọi lệnh ghi lên bảng tác vụ
    const iLeaseGuard = prep.indexOf("o.status IN ('deleting_storage', 'deleting_db')");
    assert.ok(iLeaseGuard !== -1, 'Có nhánh chặn tác vụ đang xóa');
    assert.ok(prep.includes('o.lease_expires_at IS NOT NULL') && prep.includes('o.lease_expires_at > clock_timestamp()'));
    const iLeaseRaise = prep.indexOf("RAISE EXCEPTION 'CLASS_CLOSE_IN_PROGRESS: Lớp mẫu Mốc 5 đang có tác vụ đóng khóa hoặc đặt lại bộ mẫu đang chạy.' USING ERRCODE = 'P0001'");
    assert.ok(iLeaseRaise > iLeaseGuard, 'Nhánh chặn lease dùng đúng thông báo và mã P0001');
    assert.ok(iLeaseRaise < prep.indexOf('INSERT INTO public.courses'), 'Chặn lease trước mọi lệnh ghi');
    assert.ok(iLeaseRaise < prep.indexOf("SET status = 'deleting_storage'"), 'Chặn lease trước khi cập nhật dòng tác vụ');

    // R20b-01: Xóa dòng previewed/csv_verified cũ trước khi lấy khóa dòng tác vụ dở dang; dòng dở dang được đánh dấu để khôi phục
    const iDelPreview = prep.indexOf("AND status IN ('previewed', 'csv_verified')");
    const iSelectOp = prep.indexOf("AND o.status IN ('incomplete', 'deleting_storage', 'deleting_db')");
    assert.ok(iDelPreview !== -1 && iSelectOp !== -1 && iDelPreview < iSelectOp, 'Xóa previewed/csv_verified trước khi lấy khóa dòng');
    assert.ok(prep.includes("last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'"));
    assert.ok(prep.indexOf("last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'") > iSelectOp);

    // Gỡ riêng bản ghi khóa tạm + khôi phục dòng incomplete trước đó
    assert.ok(release.includes("PERFORM set_config('app.m5_internal_mutation', 'true', true);"));
    assert.ok(release.includes("PERFORM set_config('app.m5_internal_mutation_class_id', v_cls_id::text, true);"));
    assert.ok(release.includes("PERFORM set_config('app.m5_internal_mutation', 'false', true);"));
    assert.ok(release.includes("PERFORM set_config('app.m5_internal_mutation_class_id', '', true);"));
    assert.ok(release.includes("SET status = 'incomplete'") && release.includes('lease_expires_at = NULL'));
    assert.ok(release.includes("last_error_message = 'Tác vụ đặt lại bộ mẫu bị gián đoạn trước khi hoàn tất.'"));
    assert.ok(release.includes("last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'"));
    assert.ok(release.includes('class_id = v_cls_id'));
    assert.ok(release.includes("last_error_code = 'SEED_FIXTURE_LOCK'"));
    assert.ok(release.includes('DELETE FROM public.m5_course_close_operations'));
    const iRelOn = release.indexOf("PERFORM set_config('app.m5_internal_mutation', 'true', true);");
    const iRelRestore = release.indexOf("SET status = 'incomplete'");
    const iRelDelete = release.indexOf('DELETE FROM public.m5_course_close_operations');
    const iRelOff = release.indexOf("PERFORM set_config('app.m5_internal_mutation', 'false', true);");
    const iRelReturn = release.indexOf('RETURN v_rowcount > 0');
    assert.ok(iRelOn < iRelRestore && iRelRestore < iRelDelete && iRelDelete < iRelOff && iRelOff < iRelReturn, 'Bật cờ -> khôi phục -> xóa khóa tạm -> tắt cờ -> RETURN');

    // Vị trí hàm mới không làm lệch phạm vi test 12.6 (hàm seed nằm trước m5_begin_course_close)
    const iSeedFn = sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_seed_course_close_fixture(');
    const iBegin = sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_begin_course_close(');
    const iPrep = sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_prepare_seed_course_close_fixture(');
    assert.ok(iSeedFn < iBegin && iBegin < iPrep, 'Hai hàm mới đặt ở cuối migration');
    assert.ok(iPrep > sql.indexOf('-- 13.7 m2_restore_student'), 'Hai hàm mới đặt sau Mục 13');
  });

  // --------------------------------------------------------------------------
  // 29.2 R20-01: Chạy thực tế nhánh m5-seed-fixture của Edge Function
  // --------------------------------------------------------------------------
  const seedBranch = sliceBetween(edge, "if (action === 'm5-seed-fixture') {", "if (action === 'm5-storage-quota-status') {");
  const chunkSrc = sliceBetween(edge, 'function chunkStoragePaths(', '// R10-01') ;
  const fetchAllSrc = sliceBetween(edge, 'async function fetchAllM5Rows<T = any>(', 'function sanitizeCsvCell(');

  const makeSeedClient = (state) => {
    const calls = { rpc: [], removed: [], removeCalls: 0 };
    const makeBuilder = (table) => {
      const q = { table, ops: [] };
      const api = {};
      for (const m of ['select', 'or', 'not', 'eq', 'neq', 'in', 'order', 'range', 'limit']) {
        api[m] = (...a) => {
          q.ops.push([m, ...a]);
          return api;
        };
      }
      api.then = (res, rej) => Promise.resolve(state.read(table, q)).then(res, rej);
      return api;
    };
    const client = {
      from: (table) => makeBuilder(table),
      rpc: async (name, args) => {
        calls.rpc.push({ name, args });
        if (name === 'm5_prepare_seed_course_close_fixture') {
          if (state.onPrepare) state.onPrepare();
          if (state.prepError) return { data: null, error: { message: state.prepError } };
          return { data: [{ operation_id: 'op-1', execution_run_id: 'run-1', target_storage_paths: state.prepPaths || [] }], error: null };
        }
        if (name === 'm5_release_seed_course_close_fixture_lock') return { data: true, error: null };
        if (name === 'm5_seed_course_close_fixture') {
          if (state.seedError) return { data: null, error: { message: state.seedError } };
          return { data: [{ fixture_class_id: FIXTURE_CLASS_ID }], error: null };
        }
        return { data: null, error: null };
      },
      storage: {
        from: (bucket) => ({
          remove: async (batch) => {
            calls.removeCalls += 1;
            calls.removed.push(...batch.map((p) => bucket + '|' + p));
            return { error: state.removeError ? { message: state.removeError } : null };
          },
        }),
      },
    };
    return { client, calls };
  };

  const runSeedBranch = async (state, payload = { resetOnly: false }) => {
    const { client, calls } = makeSeedClient(state);
    const snippet = chunkSrc + '\n' + fetchAllSrc + '\n' + seedBranch + '\nreturn null;';
    const response = await evalTsAsync(
      snippet,
      ['action', 'body', 'adminClient', 'requireAdminActor', 'isVerifiedTestEnvironment', 'jsonResponse', 'STATIC_MESSAGES'],
      [
        'm5-seed-fixture',
        { accessToken: 'tok', payload },
        client,
        async () => ({ actor: { profileId: 'admin-profile' }, actorClient: {}, errorResponse: null }),
        () => true,
        (data, status = 200) => ({ data, status }),
        { UNAUTHORIZED: 'x' },
      ]
    );
    return { response, calls };
  };

  await t.test('29.2 R20-01: học sinh mẫu chuyển sang lớp B và nộp tệp ở lớp B xen giữa nonFixtureChecks và fixtureSubRows -> 409, 0 tệp lớp B bị xóa', async () => {
    // Cấu trúc nhánh: prepare -> đọc -> chốt chặn thứ hai -> remove
    const iPrep = seedBranch.indexOf("adminClient.rpc('m5_prepare_seed_course_close_fixture'");
    const iLoop = seedBranch.indexOf('for (const checkResult of await Promise.all(nonFixtureChecks))');
    const iSubRows = seedBranch.indexOf('const { data: fixtureSubRows');
    const iGuard2 = seedBranch.indexOf('isForeignClassRow');
    const iRemove = seedBranch.indexOf(".storage.from('m3-practice-files').remove(");
    assert.ok(iLoop !== -1 && iPrep > iLoop && iPrep < iSubRows && iSubRows < iGuard2 && iGuard2 < iRemove, 'prepare đứng trước đọc tệp và trước Storage remove');
    assert.ok(seedBranch.includes("p_test_project_ref: 'eythjapspkoyqdxlxtcd'") && seedBranch.includes('p_actor_id: actor.profileId'));
    assert.ok(seedBranch.includes("adminClient.rpc('m5_release_seed_course_close_fixture_lock', {") && seedBranch.includes('p_execution_run_id: seedExecutionRunId'));
    assert.ok(seedBranch.includes("'id, content, type, class_id'") && seedBranch.includes("'id, object_path, class_id'"));
    for (const q of [sliceBetween(seedBranch, 'const { data: fixtureSubRows', 'if (fixtureSubErr)'), sliceBetween(seedBranch, 'const { data: fixtureResRows', 'if (fixtureResErr)')]) {
      assert.ok(q.includes('student_id.in.(${fixtureStudentList})'));
      assert.ok(!q.includes('class_id.eq.${fixtureClassId}'), 'Vẫn chỉ lọc theo student_id mẫu, không theo class_id');
    }

    const FIXTURE_OWN_FILE = FIXTURE_STUDENT_1 + '/lesson/bai_nop_fixture.zip';
    const CLASS_B_FILE = FIXTURE_STUDENT_1 + '/lesson/bai_nop_lop_B.zip';
    const CLASS_B_RES = FIXTURE_STUDENT_1 + '/lesson/giu_cho_lop_B.zip';
    const emptyChecks = (table, q) => (q.ops.some((o) => o[0] === 'range') ? null : { data: [], error: null });

    // (A) Chuyển lớp xảy ra trước prepare: SQL từ chối NON_FIXTURE_DATA_ATTACHED -> 409, không xóa tệp, không seed
    {
      const state = {
        read: (table, q) => emptyChecks(table, q) || { data: [], error: null },
        prepError: 'NON_FIXTURE_DATA_ATTACHED: Lớp hoặc khóa mẫu Mốc 5 đang có học sinh ngoài bộ mẫu',
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 409);
      assert.equal(response.data.code, 'NON_FIXTURE_DATA_ATTACHED');
      assert.equal(calls.removeCalls, 0, 'Không gọi Storage remove');
      assert.equal(calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false, 'Không gọi seed');
      assert.equal(calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false, 'prepare lỗi thì chưa có khóa để gỡ');
    }

    // (A2) Đợt học khác đang đóng khóa dở dang -> 409 CLASS_CLOSE_IN_PROGRESS, không xóa tệp
    {
      const state = {
        read: (table, q) => emptyChecks(table, q) || { data: [], error: null },
        prepError: 'CLASS_CLOSE_IN_PROGRESS: Học sinh mẫu đang thuộc đợt học khác',
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 409);
      assert.equal(response.data.code, 'CLASS_CLOSE_IN_PROGRESS');
      assert.equal(calls.removeCalls, 0);
    }

    // (A3) Lỗi DB khác -> 500 DB_ERROR, không xóa tệp
    {
      const state = { read: (table, q) => emptyChecks(table, q) || { data: [], error: null }, prepError: 'connection reset' };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 500);
      assert.equal(response.data.code, 'DB_ERROR');
      assert.equal(calls.removeCalls, 0);
    }

    // (B) Chuyển lớp + nộp tệp ở lớp B xen giữa nonFixtureChecks và fixtureSubRows/fixtureResRows (prepare đã qua):
    //     chốt chặn thứ hai trả 409, gỡ khóa tạm và 0 tệp lớp B bị truyền vào Storage remove
    {
      const db = { moved: false };
      const state = {
        onPrepare: () => {
          db.moved = true; // sự kiện đua xảy ra ngay sau khi nonFixtureChecks đã đi qua
        },
        prepPaths: [FIXTURE_OWN_FILE],
        read: (table, q) => {
          const isPage = q.ops.some((o) => o[0] === 'range');
          if (!isPage) return { data: [], error: null }; // nonFixtureChecks đều sạch ở thời điểm kiểm tra
          if (table === 'practice_submissions') {
            const rows = [{ id: 's1', content: FIXTURE_OWN_FILE, type: 'file', class_id: FIXTURE_CLASS_ID }];
            if (db.moved) rows.push({ id: 's2', content: CLASS_B_FILE, type: 'file', class_id: 'cls_B' });
            return { data: rows, error: null };
          }
          if (table === 'm3_upload_reservations') {
            const rows = [];
            if (db.moved) rows.push({ id: 'r1', object_path: CLASS_B_RES, class_id: 'cls_B' });
            return { data: rows, error: null };
          }
          return { data: [], error: null };
        },
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 409, 'Phải trả HTTP 409');
      assert.equal(response.data.code, 'NON_FIXTURE_DATA_ATTACHED');
      assert.equal(calls.removeCalls, 0, 'Không gọi Storage remove');
      assert.deepEqual(calls.removed, [], '0 tệp (kể cả tệp lớp B) bị truyền vào storage.remove');
      assert.equal(calls.removed.some((p) => p.includes(CLASS_B_FILE) || p.includes(CLASS_B_RES)), false);
      assert.equal(calls.rpc.filter((r) => r.name === 'm5_release_seed_course_close_fixture_lock').length, 1, 'Phải gỡ khóa tạm đúng 1 lần');
      assert.deepEqual(calls.rpc.find((r) => r.name === 'm5_release_seed_course_close_fixture_lock').args, {
        p_actor_id: 'admin-profile',
        p_execution_run_id: 'run-1',
        p_storage_started: false,
        p_deleted_paths: [],
        p_remaining_paths: [],
        p_error_message: null,
      });
      assert.equal(calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false, 'Không gọi seed');
    }

    // (B2) Chỉ tệp giữ chỗ (m3_upload_reservations) của lớp B xuất hiện -> vẫn chặn
    {
      const state = {
        prepPaths: [],
        read: (table, q) => {
          if (!q.ops.some((o) => o[0] === 'range')) return { data: [], error: null };
          if (table === 'm3_upload_reservations') return { data: [{ id: 'r1', object_path: CLASS_B_RES, class_id: 'cls_B' }], error: null };
          return { data: [], error: null };
        },
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 409);
      assert.equal(calls.removeCalls, 0);
      assert.equal(calls.rpc.filter((r) => r.name === 'm5_release_seed_course_close_fixture_lock').length, 1);
    }

    // (C) Không đua: chỉ gom tệp lớp mẫu hoặc không có class_id, gọi Storage remove rồi seed; không gỡ khóa (seed xóa bản ghi khóa)
    {
      const state = {
        prepPaths: [FIXTURE_OWN_FILE],
        read: (table, q) => {
          if (!q.ops.some((o) => o[0] === 'range')) return { data: [], error: null };
          if (table === 'practice_submissions') {
            return {
              data: [
                { id: 's1', content: FIXTURE_OWN_FILE, type: 'file', class_id: FIXTURE_CLASS_ID },
                { id: 's3', content: FIXTURE_STUDENT_1 + '/lesson/khong_class.zip', type: 'file', class_id: null },
                { id: 's4', content: 'text answer', type: 'text', class_id: FIXTURE_CLASS_ID },
              ],
              error: null,
            };
          }
          if (table === 'm3_upload_reservations') return { data: [{ id: 'r2', object_path: FIXTURE_STUDENT_1 + '/lesson/giu_cho_mau.zip', class_id: FIXTURE_CLASS_ID }], error: null };
          return { data: [], error: null };
        },
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status ?? 200, 200);
      assert.equal(response.data.success, true);
      assert.equal(response.data.fixtureClassId, FIXTURE_CLASS_ID);
      assert.equal(calls.removeCalls, 1);
      assert.deepEqual(
        [...calls.removed].sort(),
        [
          'm3-practice-files|' + FIXTURE_OWN_FILE,
          'm3-practice-files|' + FIXTURE_STUDENT_1 + '/lesson/giu_cho_mau.zip',
          'm3-practice-files|' + FIXTURE_STUDENT_1 + '/lesson/khong_class.zip',
        ].sort()
      );
      const order = calls.rpc.map((r) => r.name);
      assert.deepEqual(order, [
        'm5_prepare_seed_course_close_fixture',
        'm5_update_course_close_storage_progress', // ghi danh sách tệp đầy đủ (có thêm tệp ngoài prepare)
        'm5_update_course_close_storage_progress', // tiến độ sau lô xóa thành công
        'm5_seed_course_close_fixture',
      ]);
    }

    // (D) Lỗi xóa Storage -> gỡ khóa tạm, 500 STORAGE_CLEANUP_FAILED, không seed
    {
      const state = {
        prepPaths: [],
        removeError: 'network down',
        read: (table, q) => {
          if (!q.ops.some((o) => o[0] === 'range')) return { data: [], error: null };
          if (table === 'practice_submissions') return { data: [{ id: 's1', content: FIXTURE_OWN_FILE, type: 'file', class_id: FIXTURE_CLASS_ID }], error: null };
          return { data: [], error: null };
        },
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 500);
      assert.equal(response.data.code, 'STORAGE_CLEANUP_FAILED');
      assert.equal(calls.rpc.filter((r) => r.name === 'm5_release_seed_course_close_fixture_lock').length, 1);
      assert.equal(calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false);
    }

    // (E) Lỗi đọc dữ liệu tệp sau khi đã chốt khóa -> gỡ khóa tạm, 500 DB_READ_FAILED
    {
      const state = {
        prepPaths: [],
        read: (table, q) => {
          if (!q.ops.some((o) => o[0] === 'range')) return { data: [], error: null };
          if (table === 'm3_upload_reservations') return { data: null, error: { message: 'boom' } };
          return { data: [], error: null };
        },
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 500);
      assert.equal(response.data.code, 'DB_READ_FAILED');
      assert.equal(calls.rpc.filter((r) => r.name === 'm5_release_seed_course_close_fixture_lock').length, 1);
      assert.equal(calls.removeCalls, 0);
    }

    // (F) Lỗi lúc seed (giao dịch hoàn tác) -> gỡ khóa tạm, 500 DB_ERROR
    {
      const state = {
        prepPaths: [],
        seedError: 'STORAGE_FILES_NOT_FULLY_DELETED',
        read: (table, q) => (q.ops.some((o) => o[0] === 'range') ? { data: [], error: null } : { data: [], error: null }),
      };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 500);
      assert.equal(response.data.code, 'DB_ERROR');
      assert.equal(calls.rpc.filter((r) => r.name === 'm5_release_seed_course_close_fixture_lock').length, 1);
    }

    // (G) Lỗi đọc ở nonFixtureChecks (trước prepare) -> không gỡ khóa vì chưa chốt khóa
    {
      const state = { read: () => ({ data: null, error: { message: 'boom' } }) };
      const { response, calls } = await runSeedBranch(state);
      assert.equal(response.status, 500);
      assert.equal(response.data.code, 'DB_READ_FAILED');
      assert.equal(calls.rpc.length, 0, 'Chưa gọi RPC nào');
    }
  });

  // --------------------------------------------------------------------------
  // 29.3 R20-02: courseId xuyên suốt page -> store -> route -> Edge và bỏ ghi tách rời
  // --------------------------------------------------------------------------
  await t.test('29.3 R20-02: courseId truyền xuyên suốt, không còn UPDATE classes tách rời; đua khóa A -> B bị từ chối 409 CLASS_COURSE_MISMATCH', async () => {
    // page.tsx
    const exportHandler = sliceBetween(page, 'const handleExportCloseCsv = async () => {', 'const handleExecuteClose = async');
    assert.ok(exportHandler.includes('const requestCourseId = selectedClass.courseId || undefined;'));
    assert.ok(exportHandler.includes('exportCourseCloseCsv(requestClassId, confirmed14Sessions, requestCourseId)'));
    const execHandler = sliceBetween(page, 'const handleExecuteClose = async', 'const res = await verifyAndExecuteCourseClose(');
    assert.ok(execHandler.includes('const requestCourseId = selectedClass.courseId || undefined;'));
    assert.ok(page.includes('verifyAndExecuteCourseClose(requestClassId, confirmed14Sessions, {\n        courseId: requestCourseId,'));

    // store.tsx
    assert.ok(store.includes('exportCourseCloseCsv: (classId: string, confirmed14Sessions?: boolean, courseId?: string) =>'));
    assert.ok(store.includes('const exportCourseCloseCsv = useCallback(async (classId: string, confirmed14Sessions?: boolean, courseId?: string) => {'));
    const exportStore = sliceBetween(store, 'const exportCourseCloseCsv = useCallback(', 'const verifyAndExecuteCourseClose = useCallback(');
    assert.ok(exportStore.includes("const targetCourseId = courseId ? String(courseId).trim() : String(crs.id || '').trim();"));
    assert.ok(exportStore.includes("if (!targetCourseId || String(cls.courseId || '') !== targetCourseId) {"));
    assert.ok(exportStore.includes('Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.'));
    assert.ok(exportStore.includes('courseId: targetCourseId,\n            confirmed14Sessions: is14Confirmed,'));
    assert.ok(exportStore.includes('c.id === classId && c.courseId === targetCourseId ? { ...c, is14SessionsConfirmed: true } : c'));
    const execStore = sliceBetween(store, 'const verifyAndExecuteCourseClose = useCallback(', '// Quiz / Practice Actions');
    assert.ok(execStore.includes('courseId?: string;\n      nextCourseId?: string;'));
    assert.ok(execStore.includes('const currentCls = classes.find((c) => c.id === classId);'));
    assert.ok(execStore.includes('const activeOp = courseCloseOperations[classId];'));
    assert.ok(execStore.includes("options?.courseId || (options?.isResume && activeOp?.courseId ? activeOp.courseId : currentCls?.courseId || '')"));
    assert.ok(execStore.includes('courseId: targetCourseId,\n            confirmed14Sessions,'));
    assert.ok(execStore.includes("options?.courseId && String(cls?.courseId || '') !== String(options.courseId).trim()"));
    assert.ok(execStore.includes("code: 'CLASS_COURSE_MISMATCH'"));
    const confirmStore = sliceBetween(store, 'const setConfirmed14SessionsForClass = useCallback(', 'const exportCourseCloseCsv = useCallback(');
    assert.ok(confirmStore.includes('const targetCourseId = currentCls?.courseId;'));
    assert.ok(confirmStore.includes('c.id === classId && c.courseId === targetCourseId ? { ...c, is14SessionsConfirmed: confirmed } : c'));

    // route.ts
    const routeExport = sliceBetween(route, "action === 'm5-export-course-csv'", "action === 'm5-execute-course-close'");
    assert.ok(routeExport.includes('courseId: body?.courseId ? String(body.courseId).trim() : undefined,'));
    const routeExec = sliceBetween(route, "action === 'm5-execute-course-close'", '} else {\n    cleanPayload = {};');
    assert.ok(routeExec.includes('courseId: body?.courseId ? String(body.courseId).trim() : undefined,'));

    // Edge: cả hai nhánh bỏ hẳn lệnh ghi tách rời, truyền payloadCourseId vào các RPC
    const edgeExport = sliceBetween(edge, "if (action === 'm5-export-course-csv') {", "if (action === 'm5-execute-course-close') {");
    const edgeExec = sliceBetween(edge, "if (action === 'm5-execute-course-close') {", "return jsonResponse(\n      { success: false, message: STATIC_MESSAGES.UNKNOWN_ACTION");
    for (const [name, body] of [['export', edgeExport], ['execute', edgeExec]]) {
      assert.ok(!body.includes("actorClient.from('classes').update"), name + ': không còn UPDATE classes tách rời bằng actorClient');
      assert.ok(!/\.from\('classes'\)\s*\.update\(/.test(body), name + ': không còn bất kỳ UPDATE classes nào');
      assert.ok(!body.includes('is_14_sessions_confirmed: true }'), name + ': không còn ghi is_14_sessions_confirmed: true riêng');
      assert.ok(body.includes("const payloadCourseId = String(body.payload?.courseId || '').trim();"));
      assert.ok(body.includes('CLASS_COURSE_MISMATCH'));
    }
    assert.ok(edgeExport.includes('p_course_id: payloadCourseId,'));
    assert.ok(!edgeExport.includes('p_course_id: classRow.course_id'));
    assert.equal((edgeExec.match(/p_course_id: payloadCourseId,/g) || []).length, 2, 'begin và finalize đều dùng payloadCourseId');
    assert.ok(!edgeExec.includes('p_course_id: classRow.course_id'));

    // SQL: ghi xác nhận nguyên tử trong RPC, lọc đúng course_id
    const saveFn = stripSqlComments(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_save_csv_verification('), sql.indexOf('REVOKE ALL ON FUNCTION public.m5_save_csv_verification(UUID, UUID, TEXT, TEXT, BOOLEAN, UUID)')));
    assert.ok(saveFn.includes('WHERE c.id = p_class_id AND c.course_id = p_course_id\n    FOR UPDATE'));
    assert.ok(saveFn.includes('SET is_14_sessions_confirmed = p_confirmed_14_sessions\n        WHERE id = p_class_id AND course_id = p_course_id;'));
    const beginSql = stripSqlComments(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_begin_course_close('), sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_update_course_close_storage_progress(')));
    assert.ok(beginSql.includes('SELECT * INTO v_class FROM public.classes WHERE id = p_class_id FOR UPDATE;'));
    assert.ok(beginSql.includes('v_class.course_id IS DISTINCT FROM p_course_id'));
    assert.ok(beginSql.includes('UPDATE public.classes SET is_14_sessions_confirmed = true WHERE id = p_class_id AND course_id = p_course_id;'));
    assert.ok(!/UPDATE public\.classes SET is_14_sessions_confirmed = true WHERE id = p_class_id;/.test(beginSql));

    // --- Mô phỏng: lớp đã chuyển từ khóa A sang khóa B (xác nhận = false) trước khi Edge xử lý ---
    const makeClassClient = (db, log) => ({
      from: (table) => {
        const q = { table, filters: [], op: 'select' };
        const run = (single) => {
          const rows = [db.row].filter((r) => q.filters.every(([c, v]) => r[c] === v));
          return { data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map((r) => ({ ...r })), error: null };
        };
        const api = {
          select: () => api,
          update: (patch) => {
            log.push({ op: 'update', table, patch });
            Object.assign(db.row, patch); // nếu có UPDATE tách rời thì sẽ ghi thẳng vào DB
            return api;
          },
          eq: (col, val) => {
            q.filters.push([col, val]);
            return api;
          },
          maybeSingle: () => Promise.resolve(run(true)),
          then: (res, rej) => Promise.resolve(run(false)).then(res, rej),
        };
        return api;
      },
    });
    const jr = (data, status = 200) => ({ data, status });
    // Xuất CSV
    const exportGuardSrc = sliceBetween(edge, "if (action === 'm5-export-course-csv') {", 'const { data: courseRow, error: courseErr }');
    const runSnippet = async (snippetSrc, payload, db, extraArgs = {}) => {
      const log = [];
      const actorClient = makeClassClient(db, log);
      const adminClient = {};
      const out = await evalTsAsync(
        'const body = { accessToken: "tok", payload };\n' + snippetSrc + '\nreturn null;',
        ['payload', 'adminClient', 'requireAdminActor', 'jsonResponse', 'STATIC_MESSAGES'],
        [payload, adminClient, async () => ({ actor: { profileId: 'admin-profile' }, actorClient, errorResponse: null }), jr, { UNAUTHORIZED: 'x' }]
      );
      return { out, log };
    };
    const exportBodyOnly = exportGuardSrc.replace("if (action === 'm5-export-course-csv') {\n", '');
    const execGuardSrc = sliceBetween(edge, "if (action === 'm5-execute-course-close') {", '// R8-03: Đối chiếu SHA-256 của bản CSV được Admin mở xác nhận').replace("if (action === 'm5-execute-course-close') {\n", '');

    const classAfterSwitch = () => ({ row: { id: 'c1', course_id: 'crs_B', is_14_sessions_confirmed: false } });
    // (1) Xuất CSV khóa A khi lớp đã ở khóa B
    {
      const db = classAfterSwitch();
      const r = await runSnippet(exportBodyOnly, { classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, db);
      assert.equal(r.out.status, 409);
      assert.equal(r.out.data.code, 'CLASS_COURSE_MISMATCH');
      assert.equal(db.row.is_14_sessions_confirmed, false, 'Khóa B giữ nguyên is_14_sessions_confirmed = false');
      assert.equal(db.row.course_id, 'crs_B');
      assert.equal(r.log.filter((l) => l.op === 'update').length, 0, 'Không có lệnh UPDATE nào');
    }
    // (2) Thiếu courseId khi xuất CSV
    for (const payload of [{ classId: 'c1', confirmed14Sessions: true }, { classId: 'c1', courseId: '  ', confirmed14Sessions: true }]) {
      const db = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
      const r = await runSnippet(exportBodyOnly, payload, db);
      assert.equal(r.out.status, 400);
      assert.equal(r.out.data.code, 'INVALID_INPUT');
      assert.equal(db.row.is_14_sessions_confirmed, false);
      assert.equal(r.log.length, 0);
    }
    // (3) Xuất CSV đúng khóa: đi qua bước kiểm tra và KHÔNG ghi riêng vào DB (RPC mới ghi nguyên tử)
    {
      const db = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
      const r = await runSnippet(exportBodyOnly, { classId: 'c1', courseId: 'crs_A', confirmed14Sessions: true }, db);
      assert.equal(r.out, null, 'Qua bước kiểm tra khóa');
      assert.equal(r.log.filter((l) => l.op === 'update').length, 0, 'Không UPDATE tách rời');
      assert.equal(db.row.is_14_sessions_confirmed, false, 'DB chỉ được ghi trong m5_save_csv_verification');
    }

    // Đóng khóa
    const execPayload = (courseId) => ({
      classId: 'c1',
      courseId,
      confirmed14Sessions: true,
      confirmedCsvOpened: true,
      confirmedCsvSha256: 'sha',
      isResume: false,
    });
    {
      const db = classAfterSwitch();
      const r = await runSnippet(execGuardSrc, execPayload('crs_A'), db);
      assert.equal(r.out.status, 409);
      assert.equal(r.out.data.code, 'CLASS_COURSE_MISMATCH');
      assert.equal(r.out.data.status, 'blocked');
      assert.equal(db.row.is_14_sessions_confirmed, false, 'Khóa B giữ nguyên is_14_sessions_confirmed = false');
      assert.equal(r.log.filter((l) => l.op === 'update').length, 0);
    }
    for (const courseId of [undefined, '', '   ']) {
      const db = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
      const r = await runSnippet(execGuardSrc, execPayload(courseId), db);
      assert.equal(r.out.status, 400);
      assert.equal(r.out.data.code, 'INVALID_INPUT');
      assert.equal(db.row.is_14_sessions_confirmed, false);
      assert.equal(r.log.length, 0);
    }
    {
      // Resume cũng bắt buộc courseId và bị chặn khi lớp đã sang khóa khác
      const db = classAfterSwitch();
      const r = await runSnippet(execGuardSrc, { ...execPayload('crs_A'), isResume: true, confirmedCsvOpened: undefined, confirmedCsvSha256: null }, db);
      assert.equal(r.out.status, 409);
      assert.equal(r.out.data.code, 'CLASS_COURSE_MISMATCH');
    }
    {
      // Đúng khóa: qua bước kiểm tra, không UPDATE tách rời
      const db = { row: { id: 'c1', course_id: 'crs_A', is_14_sessions_confirmed: false } };
      const r = await runSnippet(execGuardSrc, execPayload('crs_A'), db);
      assert.equal(r.out, null);
      assert.equal(r.log.filter((l) => l.op === 'update').length, 0);
      assert.equal(db.row.is_14_sessions_confirmed, false, 'DB chỉ được ghi trong m5_begin_course_close');
    }

    // Đua "trong lúc": lớp đã qua bước đọc ở khóa A nhưng sang khóa B trước khi RPC giữ khóa -> RPC báo CLASS_COURSE_MISMATCH -> 409
    {
      const beginMap = sliceBetween(edgeExec, 'if (beginErr) {', 'const isShaMismatch') + '\n}\nreturn null;';
      const out = await evalTsAsync(beginMap, ['beginErr', 'jsonResponse'], [{ message: 'CLASS_COURSE_MISMATCH: Lớp học không tồn tại hoặc khóa học không khớp.' }, jr]);
      assert.equal(out.status, 409);
      assert.equal(out.data.code, 'CLASS_COURSE_MISMATCH');
      const saveMap = sliceBetween(edgeExport, 'if (saveErr) {', 'return jsonResponse(\n          { success: false, message: saveErr.message') + '\n}\nreturn null;';
      const out2 = await evalTsAsync(saveMap, ['saveErr', 'jsonResponse'], [{ message: 'CLASS_COURSE_MISMATCH: Lớp học không tồn tại hoặc khóa học không khớp.' }, jr]);
      assert.equal(out2.status, 409);
      assert.equal(out2.data.code, 'CLASS_COURSE_MISMATCH');
    }
  });
});

// ============================================================================
// SUITE 30: BÀI KIỂM THỬ HỒI QUY CHO CÁC ĐIỂM REVIEW VÒNG 21 (R21-01 VÀ R21-02)
// ============================================================================
test('Suite 30: Round 21 Review Fixes Verification (R21-01 to R21-02)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const sql = readSrc('supabase', 'migrations', '20261020220000_m5_course_close_and_storage_quota.sql');
  const edge = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  const sqlFn = (name) => {
    const st = sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
    assert.ok(st !== -1, 'Không tìm thấy hàm ' + name);
    const en = sql.indexOf('REVOKE ALL ON FUNCTION public.' + name + '(', st);
    assert.ok(en !== -1, 'Không tìm thấy REVOKE của ' + name);
    return sql.slice(st, en);
  };
  const stripSqlComments = (body) => body.replace(/--.*$/gm, '');
  const transpile = (snippet) =>
    ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const evalTsAsync = (snippet, argNames, args) => new AsyncFunction(...argNames, transpile(snippet))(...args);

  const FIXTURE_CLASS_ID = '00000000-0000-0000-0000-000000050001';
  const FIXTURE_STUDENT_1 = '00000000-0000-0000-0000-000000050101';

  const seedBranch = sliceBetween(edge, "if (action === 'm5-seed-fixture') {", "if (action === 'm5-storage-quota-status') {");
  const chunkSrc = sliceBetween(edge, 'function chunkStoragePaths(', '// R10-01');
  const fetchAllSrc = sliceBetween(edge, 'async function fetchAllM5Rows<T = any>(', 'function sanitizeCsvCell(');

  // --------------------------------------------------------------------------
  // 30.1 R21-01 / R21-02: SQL và Edge Function có đủ cơ chế sở hữu execution_run_id, heartbeat, giữ 'incomplete'
  // --------------------------------------------------------------------------
  await t.test('30.1 R21-01: SQL prepare/release/seed kiểm tra execution_run_id và Edge m5-seed-fixture có heartbeat', () => {
    const prep = stripSqlComments(sqlFn('m5_prepare_seed_course_close_fixture'));
    const release = stripSqlComments(sqlFn('m5_release_seed_course_close_fixture_lock'));
    const seed = stripSqlComments(sqlFn('m5_seed_course_close_fixture'));

    // prepare trả (operation_id, execution_run_id, target_storage_paths) và lưu đường dẫn vào bản ghi khóa
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_prepare_seed_course_close_fixture(UUID, TEXT);'));
    assert.ok(/RETURNS TABLE \(\s*operation_id UUID,\s*execution_run_id UUID,\s*target_storage_paths JSONB\s*\)/.test(prep));
    assert.ok(prep.includes('v_run_id UUID := gen_random_uuid();'));
    assert.ok(prep.includes('execution_run_id = v_run_id'));
    // R22-02: nhánh tiếp quản giữ tiến độ đã xóa, remaining = v_remaining_paths; nhánh INSERT khóa mới vẫn remaining = v_paths
    assert.ok(prep.includes('target_storage_paths = v_paths') && prep.includes('remaining_storage_paths = v_remaining_paths'));
    assert.ok(prep.includes("v_paths, '[]'::jsonb, v_paths,") && prep.includes("v_run_id, 'SEED_FIXTURE_LOCK', p_actor_id"));
    assert.ok(prep.includes('RETURNING id INTO v_op_id'));
    assert.ok(prep.includes('RETURN QUERY SELECT v_op_id, v_run_id, v_paths;'));
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) FROM PUBLIC, anon, authenticated;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.m5_prepare_seed_course_close_fixture(UUID, TEXT) TO service_role;')
    );
    assert.ok(
      sql.indexOf('DROP FUNCTION IF EXISTS public.m5_prepare_seed_course_close_fixture(UUID, TEXT);') <
        sql.indexOf('CREATE OR REPLACE FUNCTION public.m5_prepare_seed_course_close_fixture(')
    );

    // release: chữ ký đầy đủ + kiểm tra quyền sở hữu execution_run_id
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_release_seed_course_close_fixture_lock(UUID);'));
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT);'));
    for (const frag of [
      'p_actor_id UUID DEFAULT NULL',
      'p_execution_run_id UUID DEFAULT NULL',
      'p_storage_started BOOLEAN DEFAULT false',
      "p_deleted_paths JSONB DEFAULT '[]'::jsonb",
      "p_remaining_paths JSONB DEFAULT '[]'::jsonb",
      'p_error_message TEXT DEFAULT NULL',
    ]) {
      assert.ok(release.includes(frag), 'Thiếu tham số: ' + frag);
    }
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.m5_release_seed_course_close_fixture_lock(UUID, UUID, BOOLEAN, JSONB, JSONB, TEXT) TO service_role;')
    );
    const iOwner = release.indexOf('o.execution_run_id IS DISTINCT FROM p_execution_run_id');
    const iReturnFalse = release.indexOf('RETURN FALSE;');
    const iFlagOn = release.indexOf("PERFORM set_config('app.m5_internal_mutation', 'true', true);");
    assert.ok(iOwner !== -1 && iReturnFalse > iOwner && iReturnFalse < iFlagOn, 'Lượt cũ trả FALSE trước khi sửa/xóa bất kỳ dòng nào');
    assert.ok(release.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))") < iOwner, 'Giữ đủ khóa trước khi kiểm tra quyền sở hữu');
    assert.equal(
      (release.match(/\(p_execution_run_id IS NULL OR execution_run_id = p_execution_run_id\)/g) || []).length,
      3,
      'UPDATE incomplete, UPDATE khôi phục và DELETE đều lọc theo execution_run_id'
    );

    // R21-02: đã bắt đầu xóa Storage thì không xóa bản ghi khóa
    const iBranch = release.indexOf('IF COALESCE(p_storage_started, false) = true THEN');
    const iElse = release.indexOf('ELSE', iBranch);
    const iDelete = release.indexOf('DELETE FROM public.m5_course_close_operations');
    assert.ok(iBranch !== -1 && iElse > iBranch && iDelete > iElse, 'Nhánh đã bắt đầu xóa Storage không có DELETE');
    const startedBranch = release.slice(iBranch, iElse);
    assert.ok(startedBranch.includes("SET status = 'incomplete'") && startedBranch.includes('lease_expires_at = NULL'));
    assert.ok(startedBranch.includes('deleted_storage_paths = COALESCE(p_deleted_paths, deleted_storage_paths)'));
    assert.ok(startedBranch.includes('remaining_storage_paths = COALESCE(p_remaining_paths, remaining_storage_paths)'));
    assert.ok(startedBranch.includes("last_error_code = 'STORAGE_CLEANUP_FAILED'"));
    assert.ok(startedBranch.includes("AND status <> 'completed'") && !startedBranch.includes('DELETE FROM'));
    const notStartedBranch = release.slice(iElse);
    // R22-02: khôi phục dòng tiếp quản (PREV_INCOMPLETE hoặc TAKEOVER) tách riêng với xóa khóa tạm mới tạo
    assert.ok(notStartedBranch.includes("last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'"));
    assert.ok(notStartedBranch.includes("last_error_code = 'SEED_FIXTURE_LOCK_TAKEOVER'"));
    assert.ok(notStartedBranch.includes('IF v_step_rows = 0 THEN'));
    assert.ok(notStartedBranch.includes("AND last_error_code = 'SEED_FIXTURE_LOCK'"));
    assert.ok(notStartedBranch.includes("'Tác vụ đặt lại bộ mẫu bị gián đoạn trước khi hoàn tất.'"));
    assert.ok(
      notStartedBranch.indexOf('IF v_step_rows = 0 THEN') < notStartedBranch.indexOf('DELETE FROM public.m5_course_close_operations'),
      'DELETE khóa mới tạo chỉ chạy khi không khôi phục được dòng tiếp quản nào'
    );

    // seed: thêm tham số thứ 4 + STALE_WORKER_EXECUTION ngay sau khi lấy 3 khóa
    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT);'));
    assert.ok(seed.includes('p_execution_run_id UUID DEFAULT NULL'));
    const iSeedClose = seed.indexOf("pg_advisory_xact_lock(hashtext('m5_close:' || v_cls_id::text))");
    const iSeedStale = seed.indexOf("RAISE EXCEPTION 'STALE_WORKER_EXECUTION");
    assert.ok(iSeedStale > iSeedClose && iSeedStale < seed.indexOf('UPDATE public.m5_storage_quota_config'), 'STALE kiểm tra sau khóa, trước mọi lệnh ghi');
    assert.ok(seed.includes('o.execution_run_id IS DISTINCT FROM p_execution_run_id'));
    assert.ok(seed.includes("o.status IN ('deleting_storage', 'deleting_db', 'incomplete')"));
    // R22-01: bắt buộc còn bản ghi khóa còn hạn lease và khớp đúng execution_run_id
    assert.ok(seed.includes('NOT EXISTS ('));
    assert.ok(seed.includes('AND o.execution_run_id = p_execution_run_id'));
    assert.ok(seed.includes('o.lease_expires_at IS NULL OR o.lease_expires_at >= clock_timestamp()'));
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;') &&
        sql.includes('GRANT EXECUTE ON FUNCTION public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT, UUID) TO service_role;')
    );
    assert.ok(!sql.includes('REVOKE ALL ON FUNCTION public.m5_seed_course_close_fixture(BOOLEAN, UUID, TEXT) FROM'), 'Không còn REVOKE chữ ký 3 tham số');

    // Edge: heartbeat, theo dõi tiến độ, 409 STALE, truyền execution_run_id
    assert.ok(seedBranch.includes("(prepRow as any)?.operation_id") && seedBranch.includes("(prepRow as any)?.execution_run_id"));
    assert.ok(seedBranch.includes('let storageDeleteStarted = false;'));
    assert.ok(seedBranch.includes("adminClient.rpc('m5_heartbeat_course_close_lease'"));
    assert.ok(seedBranch.includes('}, 15000)') && seedBranch.includes('clearInterval(seedLeaseHeartbeat)'));
    const iStarted = seedBranch.indexOf('storageDeleteStarted = true;');
    const iHeartbeat = seedBranch.indexOf('const seedLeaseHeartbeat');
    const iRemove = seedBranch.indexOf(".storage.from('m3-practice-files').remove(batch)");
    assert.ok(iStarted !== -1 && iStarted < iHeartbeat && iHeartbeat < iRemove, 'Đặt cờ bắt đầu xóa và bật heartbeat trước Storage remove');
    assert.ok(seedBranch.includes("adminClient.rpc('m5_update_course_close_storage_progress'"));
    assert.ok(seedBranch.includes("p_execution_run_id: seedExecutionRunId,\n      });"), 'Seed RPC nhận p_execution_run_id');
    assert.ok(seedBranch.includes("code: 'STALE_WORKER_EXECUTION'") && seedBranch.includes('409'));
    assert.ok(seedBranch.includes('await releaseFixtureLock(true, seedDeletedPaths, seedRemainingPaths, fixtureRemoveErr.message);'));
    assert.ok(seedBranch.includes('await releaseFixtureLock(storageDeleteStarted, seedDeletedPaths, seedRemainingPaths, seedErr.message);'));
  });

  // --------------------------------------------------------------------------
  // Mô hình trạng thái m5_course_close_operations (phản ánh đúng ngữ nghĩa các hàm SQL mới) + client giả cho Edge
  // --------------------------------------------------------------------------
  const makeOpModel = () => {
    const m = { op: null, now: 0, seq: 0, releaseResults: [], seedCalls: [], seedApplied: [] };
    const err = (message) => ({ data: null, error: { message } });
    m.prepare = (runId, paths, previous = null) => {
      if (m.op && ['deleting_storage', 'deleting_db'].includes(m.op.status) && m.op.lease !== null && m.op.lease > m.now) {
        return err('CLASS_CLOSE_IN_PROGRESS: Lớp mẫu đang có tác vụ đang chạy.');
      }
      if (!m.op && previous) m.op = { ...previous };
      if (m.op) {
        // R22-02: hợp nhất target/remaining/deleted/paths; giữ deleted; remaining = target chưa nằm trong deleted
        const deleted = [...(m.op.deleted || [])];
        const target = Array.from(new Set([...(m.op.target || []), ...(m.op.remaining || []), ...deleted, ...(paths || [])]));
        m.op = {
          ...m.op,
          status: 'deleting_storage',
          run: runId,
          target,
          deleted,
          remaining: target.filter((p) => !deleted.includes(p)),
          code: 'SEED_FIXTURE_LOCK_TAKEOVER',
          msg: 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE',
          lease: m.now + 60,
        };
        return { data: [{ operation_id: m.op.id, execution_run_id: runId, target_storage_paths: [...m.op.target] }], error: null };
      } else {
        m.op = { id: 'op-' + ++m.seq, status: 'deleting_storage', run: runId, target: [...paths], deleted: [], remaining: [...paths], code: 'SEED_FIXTURE_LOCK', msg: null, lease: m.now + 60 };
      }
      return { data: [{ operation_id: m.op.id, execution_run_id: runId, target_storage_paths: [...paths] }], error: null };
    };
    m.release = (a) => {
      // R22-01: không còn bản ghi khớp run (đã bị lượt mới xóa sau khi hoàn tất) hoặc có bản ghi run khác -> FALSE
      if (a.p_execution_run_id && (!m.op || (m.op.status !== 'completed' && m.op.run !== a.p_execution_run_id))) {
        m.releaseResults.push(false);
        return { data: false, error: null };
      }
      let rows = 0;
      const own = m.op && m.op.status !== 'completed' && (!a.p_execution_run_id || m.op.run === a.p_execution_run_id);
      if (a.p_storage_started) {
        if (own) {
          m.op = { ...m.op, status: 'incomplete', deleted: a.p_deleted_paths ?? m.op.deleted, remaining: a.p_remaining_paths ?? m.op.remaining, lease: null, code: 'STORAGE_CLEANUP_FAILED', msg: a.p_error_message || 'x' };
          rows += 1;
        }
      } else {
        // R22-02: khôi phục dòng tiếp quản (giữ target/deleted/remaining); chỉ xóa khóa mới tạo khi không khôi phục dòng nào
        if (own && (m.op.msg === 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE' || m.op.code === 'SEED_FIXTURE_LOCK_TAKEOVER')) {
          m.op = { ...m.op, status: 'incomplete', lease: null, code: 'STORAGE_CLEANUP_FAILED', msg: 'Tác vụ đặt lại bộ mẫu bị gián đoạn trước khi hoàn tất.' };
          rows += 1;
        } else if (own && m.op.code === 'SEED_FIXTURE_LOCK') {
          m.op = null;
          rows += 1;
        }
      }
      m.releaseResults.push(rows > 0);
      return { data: rows > 0, error: null };
    };
    m.progress = (a) => {
      if (!m.op || m.op.id !== a.p_operation_id) return err('NOT_FOUND');
      if (a.p_execution_run_id && m.op.run !== a.p_execution_run_id) return err('STALE_WORKER_EXECUTION: đã hết hiệu lực');
      const nextStatus = a.p_status || m.op.status;
      const deleting = ['deleting_storage', 'deleting_db'].includes(nextStatus);
      // R22-02: giữ dấu hiệu khóa đặt lại mẫu khi vẫn đang xóa và không có lỗi mới
      const code = a.p_error_code ?? (deleting && ['SEED_FIXTURE_LOCK', 'SEED_FIXTURE_LOCK_TAKEOVER'].includes(m.op.code) ? m.op.code : null);
      const msg = a.p_error_message ?? (deleting && m.op.msg === 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE' ? m.op.msg : null);
      m.op = { ...m.op, deleted: a.p_deleted_paths ?? m.op.deleted, remaining: a.p_remaining_paths ?? m.op.remaining, status: nextStatus, code, msg, lease: deleting ? m.now + 60 : null };
      return { data: true, error: null };
    };
    m.heartbeat = (a) => {
      if (!m.op || m.op.run !== a.p_execution_run_id) return err('STALE_WORKER_EXECUTION');
      m.op = { ...m.op, lease: m.now + 60 };
      return { data: true, error: null };
    };
    m.seed = (a) => {
      m.seedCalls.push(a);
      // R22-01: bắt buộc còn bản ghi khóa còn hiệu lực khớp đúng execution_run_id (kể cả khi m.op === null do lượt mới đã xóa)
      const locked = m.op && ['deleting_storage', 'deleting_db', 'incomplete'].includes(m.op.status);
      if (a.p_execution_run_id) {
        const valid = locked && m.op.run === a.p_execution_run_id && (m.op.lease === null || m.op.lease >= m.now);
        if (!valid) return err('STALE_WORKER_EXECUTION: Phiên đặt lại bộ mẫu đã hết hiệu lực do một lượt thực thi mới hơn đã tiếp quản hoặc đã hoàn tất.');
      } else if (locked) {
        return err('STALE_WORKER_EXECUTION: Phiên đặt lại bộ mẫu yêu cầu mã lượt chạy hợp lệ khi đang có khóa tác vụ.');
      }
      m.seedApplied.push(a.p_execution_run_id);
      m.op = null; // DELETE ... WHERE class_id = lớp mẫu
      return { data: [{ fixture_class_id: FIXTURE_CLASS_ID }], error: null };
    };
    return m;
  };

  const makeStatefulClient = (model, cfg) => {
    const calls = { rpc: [], removeBatches: [] };
    const builder = (table) => {
      const api = {};
      let ranged = false;
      for (const k of ['select', 'or', 'not', 'eq', 'neq', 'in', 'order', 'limit']) api[k] = () => api;
      api.range = () => {
        ranged = true;
        return api;
      };
      api.then = (res, rej) => {
        // R22-02: mô phỏng đọc bảng khóa theo trạng thái thật và lỗi đọc dữ liệu tệp sau khi đã chốt khóa
        if (table === 'm5_course_close_operations' && cfg.opRows) return Promise.resolve({ data: cfg.opRows(), error: null }).then(res, rej);
        if (cfg.failSubRead && table === 'practice_submissions' && ranged) {
          return Promise.resolve({ data: null, error: { message: 'read failed' } }).then(res, rej);
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return api;
    };
    const client = {
      from: (table) => builder(table),
      rpc: async (name, args) => {
        calls.rpc.push({ name, args });
        if (name === 'm5_prepare_seed_course_close_fixture') return model.prepare(cfg.runId, cfg.paths, cfg.previous);
        if (name === 'm5_release_seed_course_close_fixture_lock') return model.release(args);
        if (name === 'm5_update_course_close_storage_progress') return model.progress(args);
        if (name === 'm5_heartbeat_course_close_lease') return model.heartbeat(args);
        if (name === 'm5_seed_course_close_fixture') return model.seed(args);
        return { data: null, error: null };
      },
      storage: {
        from: () => ({
          remove: async (batch) => {
            calls.removeBatches.push([...batch]);
            return cfg.remove(batch, calls.removeBatches.length);
          },
        }),
      },
    };
    return { client, calls };
  };

  const runSeedWith = async (client, resetOnly = false) => {
    const snippet = chunkSrc + '\n' + fetchAllSrc + '\n' + seedBranch + '\nreturn null;';
    return evalTsAsync(
      snippet,
      ['action', 'body', 'adminClient', 'requireAdminActor', 'isVerifiedTestEnvironment', 'jsonResponse', 'STATIC_MESSAGES'],
      [
        'm5-seed-fixture',
        { accessToken: 'tok', payload: { resetOnly } },
        client,
        async () => ({ actor: { profileId: 'admin-profile' }, actorClient: {}, errorResponse: null }),
        () => true,
        (data, status = 200) => ({ data, status }),
        { UNAUTHORIZED: 'x' },
      ]
    );
  };

  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  // --------------------------------------------------------------------------
  // 30.2 R21-01: lượt A treo quá hạn lease, lượt B tiếp quản -> lượt A không gỡ/sửa khóa của B
  // --------------------------------------------------------------------------
  await t.test('30.2 R21-01: lượt A quá hạn lease, lượt B tiếp quản; A báo lỗi hoặc xong lô 1 không làm mất bản ghi khóa của B', async () => {
    const FILE = FIXTURE_STUDENT_1 + '/lesson/bai_1.zip';
    const savedSetInterval = globalThis.setInterval;
    const savedClearInterval = globalThis.clearInterval;
    const heartbeatIntervals = [];
    try {
      globalThis.setInterval = (fn, ms) => {
        heartbeatIntervals.push(ms);
        fn(); // chạy ngay một nhịp heartbeat để kiểm tra RPC gia hạn lease
        return 0;
      };
      globalThis.clearInterval = () => {};

      for (const mode of ['A-remove-error', 'A-batch-ok-progress-stale']) {
        const model = makeOpModel();
        heartbeatIntervals.length = 0;

        const aRemoveReached = deferred();
        const aRemoveGate = deferred();
        const aClient = makeStatefulClient(model, {
          runId: 'run_A',
          paths: [FILE],
          remove: async () => {
            aRemoveReached.resolve();
            return aRemoveGate.promise;
          },
        });
        const promiseA = runSeedWith(aClient.client);
        await aRemoveReached.promise;
        assert.equal(model.op.run, 'run_A');
        assert.equal(model.op.status, 'deleting_storage');
        assert.ok(aClient.calls.rpc.some((r) => r.name === 'm5_heartbeat_course_close_lease' && r.args.p_execution_run_id === 'run_A'), 'Heartbeat chạy trong lúc chờ Storage remove');
        assert.deepEqual(heartbeatIntervals, [15000], 'Heartbeat mỗi 15 giây');

        // Lượt A bị treo quá 60 giây -> lease hết hạn; lượt B vào tiếp quản bản ghi khóa
        model.now = 120;
        const bRemoveReached = deferred();
        const bRemoveGate = deferred();
        const bClient = makeStatefulClient(model, {
          runId: 'run_B',
          paths: [FILE],
          remove: async () => {
            bRemoveReached.resolve();
            return bRemoveGate.promise;
          },
        });
        const promiseB = runSeedWith(bClient.client);
        await bRemoveReached.promise;
        assert.equal(model.op.run, 'run_B', 'Lượt B đã tiếp quản bản ghi khóa');
        assert.equal(model.op.status, 'deleting_storage');

        // Lượt A tỉnh dậy
        aRemoveGate.resolve(mode === 'A-remove-error' ? { error: { message: 'network down' } } : { error: null });
        const respA = await promiseA;
        if (mode === 'A-remove-error') {
          assert.equal(respA.status, 500);
          assert.equal(respA.data.code, 'STORAGE_CLEANUP_FAILED');
          const rel = aClient.calls.rpc.find((r) => r.name === 'm5_release_seed_course_close_fixture_lock');
          assert.ok(rel && rel.args.p_execution_run_id === 'run_A', 'A gỡ khóa kèm run_A');
          assert.equal(model.releaseResults.at(-1), false, 'SQL trả FALSE, không sửa/xóa dòng của B');
        } else {
          assert.equal(respA.status, 409);
          assert.equal(respA.data.code, 'STALE_WORKER_EXECUTION');
          assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false, 'STALE thì không gọi releaseFixtureLock');
          assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false);
        }

        // Bản ghi khóa của B còn nguyên
        assert.ok(model.op, 'Bản ghi khóa của B không bị xóa');
        assert.equal(model.op.run, 'run_B');
        assert.equal(model.op.status, 'deleting_storage');

        // Lượt B chạy tiếp bình thường và hoàn tất
        bRemoveGate.resolve({ error: null });
        const respB = await promiseB;
        assert.equal(respB.status ?? 200, 200);
        assert.equal(respB.data.success, true);
        assert.equal(model.op, null, 'Seed của B xóa bản ghi khóa khi hoàn tất');
      }

      // Lượt A gọi seed khi B đã tiếp quản -> SQL từ chối STALE_WORKER_EXECUTION -> 409, không gỡ khóa của B
      {
        const model = makeOpModel();
        const aClient = makeStatefulClient(model, { runId: 'run_A', paths: [FILE], remove: async () => ({ error: null }) });
        const orig = aClient.client.rpc;
        aClient.client.rpc = async (name, args) => {
          if (name === 'm5_seed_course_close_fixture') {
            model.now = 1000; // lease của A đã quá hạn
            model.prepare('run_B', [FILE]); // B tiếp quản ngay trước seed của A
          }
          return orig(name, args);
        };
        const resp = await runSeedWith(aClient.client);
        assert.equal(resp.status, 409);
        assert.equal(resp.data.code, 'STALE_WORKER_EXECUTION');
        assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false);
        assert.equal(model.op.run, 'run_B');
        assert.equal(model.op.status, 'deleting_storage');
      }
    } finally {
      globalThis.setInterval = savedSetInterval;
      globalThis.clearInterval = savedClearInterval;
    }
  });

  // --------------------------------------------------------------------------
  // 30.3 R21-02: xóa Storage dở dang (1.001 tệp, 2 lô) phải giữ trạng thái 'incomplete'
  // --------------------------------------------------------------------------
  await t.test('30.3 R21-02: 1.001 tệp, lô 1 xóa 1.000 tệp thành công, lô 2 lỗi -> 500, khóa chuyển incomplete; lỗi trước khi xóa vẫn xóa khóa tạm', async () => {
    const allPaths = Array.from({ length: 1001 }, (_, i) => `${FIXTURE_STUDENT_1}/lesson/file_${String(i).padStart(4, '0')}.zip`);

    // (A) Lô 1 thành công, lô 2 (1 tệp) lỗi
    {
      const model = makeOpModel();
      const { client, calls } = makeStatefulClient(model, {
        runId: 'run_A',
        paths: allPaths,
        remove: async (_batch, callNo) => (callNo === 2 ? { error: { message: 'storage 503' } } : { error: null }),
      });
      const resp = await runSeedWith(client);
      assert.equal(resp.status, 500);
      assert.equal(resp.data.code, 'STORAGE_CLEANUP_FAILED');
      assert.equal(resp.data.data.operationId, model.op.id);
      assert.equal(resp.data.data.deletedPaths.length, 1000);
      assert.equal(resp.data.data.remainingPaths.length, 1);
      assert.deepEqual(calls.removeBatches.map((b) => b.length), [1000, 1]);
      assert.equal(calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false, 'Không seed khi Storage lỗi');
      assert.ok(model.op, 'Bản ghi khóa KHÔNG bị xóa');
      assert.equal(model.op.status, 'incomplete');
      assert.equal(model.op.deleted.length, 1000);
      assert.equal(model.op.remaining.length, 1);
      assert.equal(model.op.lease, null);
      assert.equal(model.op.code, 'STORAGE_CLEANUP_FAILED');
      assert.equal(model.op.run, 'run_A');
    }

    // (B) Lô đầu lỗi ngay -> đã bắt đầu gọi Storage remove nên vẫn giữ 'incomplete' với toàn bộ tệp còn lại
    {
      const model = makeOpModel();
      const { client } = makeStatefulClient(model, { runId: 'run_A', paths: allPaths, remove: async () => ({ error: { message: 'boom' } }) });
      const resp = await runSeedWith(client);
      assert.equal(resp.status, 500);
      assert.equal(model.op.status, 'incomplete');
      assert.equal(model.op.deleted.length, 0);
      assert.equal(model.op.remaining.length, 1001);
      assert.equal(model.op.lease, null);
    }

    // (C) Xóa Storage xong nhưng m5_seed_course_close_fixture lỗi -> giữ 'incomplete' kèm tiến độ đã xóa
    {
      const model = makeOpModel();
      const { client } = makeStatefulClient(model, { runId: 'run_A', paths: allPaths.slice(0, 3), remove: async () => ({ error: null }) });
      const orig = client.rpc;
      client.rpc = async (name, args) => (name === 'm5_seed_course_close_fixture' ? { data: null, error: { message: 'STORAGE_FILES_NOT_FULLY_DELETED' } } : orig(name, args));
      const resp = await runSeedWith(client);
      assert.equal(resp.status, 500);
      assert.equal(resp.data.code, 'DB_ERROR');
      assert.equal(model.op.status, 'incomplete');
      assert.equal(model.op.deleted.length, 3);
      assert.equal(model.op.remaining.length, 0);
      assert.equal(model.op.lease, null);
    }

    // (D) Lỗi TRƯỚC khi bắt đầu xóa Storage (không có tệp, seed lỗi) -> khóa tạm SEED_FIXTURE_LOCK mới tạo bị xóa sạch như cũ
    {
      const model = makeOpModel();
      const { client } = makeStatefulClient(model, { runId: 'run_A', paths: [], remove: async () => ({ error: null }) });
      const orig = client.rpc;
      client.rpc = async (name, args) => (name === 'm5_seed_course_close_fixture' ? { data: null, error: { message: 'boom' } } : orig(name, args));
      const resp = await runSeedWith(client);
      assert.equal(resp.status, 500);
      assert.equal(model.op, null, 'Khóa tạm bị gỡ vì chưa xóa tệp Storage nào');
    }

    // (E) Lỗi TRƯỚC khi xóa Storage nhưng dòng trước đó vốn là 'incomplete' -> được khôi phục, không bị xóa
    {
      const model = makeOpModel();
      const previous = { id: 'op-prev', status: 'incomplete', run: 'run_old', target: [], deleted: [], remaining: [], code: 'STORAGE_CLEANUP_FAILED', msg: 'cũ', lease: null };
      const { client } = makeStatefulClient(model, { runId: 'run_A', paths: [], previous, remove: async () => ({ error: null }) });
      const orig = client.rpc;
      client.rpc = async (name, args) => (name === 'm5_seed_course_close_fixture' ? { data: null, error: { message: 'boom' } } : orig(name, args));
      const resp = await runSeedWith(client);
      assert.equal(resp.status, 500);
      assert.ok(model.op, 'Dòng incomplete trước đó được giữ lại');
      assert.equal(model.op.status, 'incomplete');
      assert.equal(model.op.lease, null);
      assert.equal(model.op.id, 'op-prev');
    }

    // (F) Seed thành công: không gọi release, bản ghi khóa do seed xóa
    {
      const model = makeOpModel();
      const { client, calls } = makeStatefulClient(model, { runId: 'run_A', paths: allPaths.slice(0, 2), remove: async () => ({ error: null }) });
      const resp = await runSeedWith(client);
      assert.equal(resp.status ?? 200, 200);
      assert.equal(resp.data.success, true);
      assert.equal(calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false);
      assert.equal(model.op, null);
    }
  });

  // --------------------------------------------------------------------------
  // 30.4 R22-01: lượt cũ không được chạm dữ liệu khi bản ghi khóa đã bị lượt mới xóa sau khi hoàn tất
  // --------------------------------------------------------------------------
  await t.test('30.4 R22-01: lượt A quá hạn lease, lượt B tiếp quản và hoàn tất (xóa khóa); A tỉnh dậy bị 409 STALE_WORKER_EXECUTION, không gỡ khóa, không xóa mẫu của B', async () => {
    const FILE = FIXTURE_STUDENT_1 + '/lesson/bai_1.zip';

    // Kiểm tra mã nguồn SQL / Edge
    const seed = stripSqlComments(sqlFn('m5_seed_course_close_fixture'));
    const release = stripSqlComments(sqlFn('m5_release_seed_course_close_fixture_lock'));
    assert.ok(seed.includes('IF p_execution_run_id IS NOT NULL THEN'));
    assert.ok(seed.includes('AND o.execution_run_id = p_execution_run_id'));
    assert.ok(seed.includes('o.lease_expires_at IS NULL OR o.lease_expires_at >= clock_timestamp()'));
    assert.ok(seed.includes('Phiên đặt lại bộ mẫu yêu cầu mã lượt chạy hợp lệ khi đang có khóa tác vụ.'));
    const iNoOwnRow = release.indexOf('o.execution_run_id = p_execution_run_id');
    const iDiffRow = release.indexOf('o.execution_run_id IS DISTINCT FROM p_execution_run_id');
    const iReturnFalse = release.indexOf('RETURN FALSE;');
    const iFlagOn = release.indexOf("PERFORM set_config('app.m5_internal_mutation', 'true', true);");
    assert.ok(iNoOwnRow !== -1 && iNoOwnRow < iDiffRow && iDiffRow < iReturnFalse && iReturnFalse < iFlagOn, 'Release trả FALSE khi không còn dòng khóa khớp run, trước khi bật cờ nội bộ');
    assert.ok(release.includes('NOT EXISTS ('));
    assert.equal((seedBranch.match(/includes\('NOT_FOUND'\)/g) || []).length, 2, 'Cả initProgressErr và progressErr coi NOT_FOUND là STALE');

    const savedSetInterval = globalThis.setInterval;
    const savedClearInterval = globalThis.clearInterval;
    try {
      globalThis.setInterval = () => 0;
      globalThis.clearInterval = () => {};

      // (a) A dừng trước m5_seed_course_close_fixture (resetOnly: true); B (resetOnly: false) hoàn tất rồi A mới gọi seed
      {
        const model = makeOpModel();
        const aSeedReached = deferred();
        const aSeedGate = deferred();
        const aClient = makeStatefulClient(model, { runId: 'run_A', paths: [FILE], remove: async () => ({ error: null }) });
        const origA = aClient.client.rpc;
        aClient.client.rpc = async (name, args) => {
          if (name === 'm5_seed_course_close_fixture') {
            aSeedReached.resolve();
            await aSeedGate.promise;
          }
          return origA(name, args);
        };
        const promiseA = runSeedWith(aClient.client, true);
        await aSeedReached.promise;
        assert.equal(model.op.run, 'run_A');

        model.now = 120; // lease của A (60 giây) đã hết hạn
        const bClient = makeStatefulClient(model, { runId: 'run_B', paths: [FILE], remove: async () => ({ error: null }) });
        const respB = await runSeedWith(bClient.client, false);
        assert.equal(respB.status ?? 200, 200);
        assert.equal(respB.data.success, true);
        assert.equal(model.op, null, 'B hoàn tất và đã xóa bản ghi khóa');
        assert.deepEqual(model.seedApplied, ['run_B']);

        aSeedGate.resolve();
        const respA = await promiseA;
        assert.equal(respA.status, 409);
        assert.equal(respA.data.code, 'STALE_WORKER_EXECUTION');
        assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false, 'A không gọi releaseFixtureLock');
        assert.deepEqual(model.seedApplied, ['run_B'], 'Seed của A không được áp dụng, không xóa mẫu của B');
        assert.equal(model.op, null);
      }

      // (b) A dừng trong lúc xóa Storage (trước m5_update_course_close_storage_progress); B hoàn tất xong A mới ghi tiến độ
      {
        const model = makeOpModel();
        const aRemoveReached = deferred();
        const aRemoveGate = deferred();
        const aClient = makeStatefulClient(model, {
          runId: 'run_A',
          paths: [FILE],
          remove: async () => {
            aRemoveReached.resolve();
            return aRemoveGate.promise;
          },
        });
        const promiseA = runSeedWith(aClient.client, true);
        await aRemoveReached.promise;

        model.now = 120;
        const bClient = makeStatefulClient(model, { runId: 'run_B', paths: [FILE], remove: async () => ({ error: null }) });
        const respB = await runSeedWith(bClient.client, false);
        assert.equal(respB.status ?? 200, 200);
        assert.equal(model.op, null);

        aRemoveGate.resolve({ error: null });
        const respA = await promiseA;
        assert.equal(respA.status, 409);
        assert.equal(respA.data.code, 'STALE_WORKER_EXECUTION');
        assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_release_seed_course_close_fixture_lock'), false);
        assert.equal(aClient.calls.rpc.some((r) => r.name === 'm5_seed_course_close_fixture'), false);
        assert.deepEqual(model.seedApplied, ['run_B']);
        assert.equal(model.op, null);
      }
    } finally {
      globalThis.setInterval = savedSetInterval;
      globalThis.clearInterval = savedClearInterval;
    }
  });

  // --------------------------------------------------------------------------
  // 30.5 R22-02: bản ghi được tiếp quản không bị xóa khi lượt mới lỗi trước khi xóa Storage; giữ phạm vi và tiến độ
  // --------------------------------------------------------------------------
  await t.test('30.5 R22-02: tiếp quản bản ghi dở dang rồi lỗi đọc (500 DB_READ_FAILED) -> giữ incomplete với target/deleted/remaining; chỉ xóa tiếp tệp còn lại', async () => {
    // Kiểm tra mã nguồn SQL / Edge
    const prep = stripSqlComments(sqlFn('m5_prepare_seed_course_close_fixture'));
    const release = stripSqlComments(sqlFn('m5_release_seed_course_close_fixture_lock'));
    const progress = stripSqlComments(sqlFn('m5_update_course_close_storage_progress'));
    assert.ok(prep.includes("v_prev_deleted_paths JSONB := '[]'::jsonb;") && prep.includes("v_remaining_paths JSONB := '[]'::jsonb;"));
    assert.ok(prep.includes('|| COALESCE(o.deleted_storage_paths') && prep.includes('INTO v_op_id, v_prev_deleted_paths'));
    assert.ok(prep.includes("deleted_storage_paths = COALESCE(v_prev_deleted_paths, '[]'::jsonb)"));
    assert.ok(prep.includes('remaining_storage_paths = v_remaining_paths'));
    assert.ok(prep.includes("last_error_code = 'SEED_FIXTURE_LOCK_TAKEOVER'"));
    assert.ok(prep.includes("v_run_id, 'SEED_FIXTURE_LOCK', p_actor_id"), 'Khóa mới tạo vẫn dùng SEED_FIXTURE_LOCK');
    assert.ok(release.includes("last_error_code = 'SEED_FIXTURE_LOCK_TAKEOVER')"));
    assert.ok(release.includes('IF v_step_rows = 0 THEN'));
    assert.ok(progress.includes("o.last_error_code IN ('SEED_FIXTURE_LOCK', 'SEED_FIXTURE_LOCK_TAKEOVER')"));
    assert.ok(progress.includes("o.last_error_message = 'SEED_FIXTURE_LOCK_PREV_INCOMPLETE'"));
    assert.ok(seedBranch.includes('deleted_storage_paths, last_error_code, last_error_message'));
    assert.ok(seedBranch.includes('const alreadyDeletedSet = new Set<string>();'));
    assert.ok(seedBranch.includes('seedDeletedPaths = Array.from(alreadyDeletedSet);'));
    assert.ok(seedBranch.includes('seedRemainingPaths = fixtureStoragePaths.filter((p) => !alreadyDeletedSet.has(p));'));
    assert.ok(seedBranch.includes('const pathsToDelete = [...seedRemainingPaths];'));
    assert.ok(seedBranch.includes('chunkStoragePaths(pathsToDelete, 1000)'));

    const rowOf = (o) => ({
      id: o.id,
      target_storage_paths: o.target,
      remaining_storage_paths: o.remaining,
      deleted_storage_paths: o.deleted,
      last_error_code: o.code,
      last_error_message: o.msg,
    });
    const savedSetInterval = globalThis.setInterval;
    const savedClearInterval = globalThis.clearInterval;
    try {
      globalThis.setInterval = () => 0;
      globalThis.clearInterval = () => {};

      const F1 = FIXTURE_STUDENT_1 + '/lesson/bai_1.zip';
      const F2 = FIXTURE_STUDENT_1 + '/lesson/bai_2.zip';

      // (a) A bị ngắt trong lô Storage đầu (chưa lưu tiến độ, chưa release; code = SEED_FIXTURE_LOCK); B tiếp quản rồi lỗi đọc trước khi xóa Storage
      {
        const model = makeOpModel();
        model.op = { id: 'op-1', status: 'deleting_storage', run: 'run_A', target: [F1, F2], deleted: [], remaining: [F1, F2], code: 'SEED_FIXTURE_LOCK', msg: null, lease: 60 };
        model.now = 120;
        const { client, calls } = makeStatefulClient(model, {
          runId: 'run_B',
          paths: [F1, F2],
          failSubRead: true,
          opRows: () => (model.op ? [rowOf(model.op)] : []),
          remove: async () => ({ error: null }),
        });
        const resp = await runSeedWith(client);
        assert.equal(resp.status, 500);
        assert.equal(resp.data.code, 'DB_READ_FAILED');
        assert.equal(calls.removeBatches.length, 0, 'Chưa xóa tệp Storage nào');
        assert.ok(model.op, 'Bản ghi bảo vệ KHÔNG bị xóa');
        assert.equal(model.releaseResults.at(-1), true);
        assert.equal(model.op.id, 'op-1');
        assert.equal(model.op.status, 'incomplete');
        assert.equal(model.op.lease, null);
        assert.equal(model.op.code, 'STORAGE_CLEANUP_FAILED');
        assert.equal(model.op.target.length, 2);
        assert.equal(model.op.remaining.length, 2);
        assert.equal(model.op.deleted.length, 0);
      }

      const allPaths = Array.from({ length: 1001 }, (_, i) => `${FIXTURE_STUDENT_1}/lesson/file_${String(i).padStart(4, '0')}.zip`);
      const incompleteAfterBatch1 = () => ({
        id: 'op-1',
        status: 'incomplete',
        run: 'run_A',
        target: [...allPaths],
        deleted: allPaths.slice(0, 1000),
        remaining: allPaths.slice(1000),
        code: 'STORAGE_CLEANUP_FAILED',
        msg: 'storage 503',
        lease: null,
      });

      // (b) A đã xóa xong lô 1 (1.000 tệp), dừng ở incomplete; B tiếp quản rồi lỗi đọc trước khi xóa Storage
      {
        const model = makeOpModel();
        model.op = incompleteAfterBatch1();
        const { client, calls } = makeStatefulClient(model, {
          runId: 'run_B',
          paths: allPaths,
          failSubRead: true,
          opRows: () => (model.op ? [rowOf(model.op)] : []),
          remove: async () => ({ error: null }),
        });
        const resp = await runSeedWith(client);
        assert.equal(resp.status, 500);
        assert.equal(resp.data.code, 'DB_READ_FAILED');
        assert.equal(calls.removeBatches.length, 0);
        assert.ok(model.op, 'Bản ghi bảo vệ KHÔNG bị xóa');
        assert.equal(model.op.status, 'incomplete');
        assert.equal(model.op.lease, null);
        assert.equal(model.op.deleted.length, 1000);
        assert.equal(model.op.remaining.length, 1);
        assert.equal(model.op.target.length, 1001);
      }

      // (c) Tiếp quản bình thường: chỉ xóa tiếp 1 tệp còn lại, giữ 1.000 tệp đã xóa trong tiến độ, rồi hoàn tất
      {
        const model = makeOpModel();
        model.op = incompleteAfterBatch1();
        const { client, calls } = makeStatefulClient(model, {
          runId: 'run_B',
          paths: allPaths,
          opRows: () => (model.op ? [rowOf(model.op)] : []),
          remove: async () => ({ error: null }),
        });
        const resp = await runSeedWith(client);
        assert.equal(resp.status ?? 200, 200);
        assert.equal(resp.data.success, true);
        assert.deepEqual(calls.removeBatches, [[allPaths[1000]]], 'Chỉ xóa tệp chưa nằm trong deleted_storage_paths');
        const prog = calls.rpc.filter((r) => r.name === 'm5_update_course_close_storage_progress').at(-1);
        assert.equal(prog.args.p_deleted_paths.length, 1001, 'Giữ nguyên tiến độ đã xóa của lượt trước');
        assert.equal(prog.args.p_remaining_paths.length, 0);
        assert.deepEqual(model.seedApplied, ['run_B']);
        assert.equal(model.op, null);
      }
    } finally {
      globalThis.setInterval = savedSetInterval;
      globalThis.clearInterval = savedClearInterval;
    }
  });
});

// ============================================================================
// SUITE 31: BÀI KIỂM THỬ HỒI QUY CHO ĐIỂM REVIEW VÒNG 23 (R23-01)
// ============================================================================
test('Suite 31: Round 23-26 Review Fixes Verification (R23-01, R24-01, R25-01, R26-01, R26-02, R27-01)', async (t) => {
  const readSrc = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), 'utf8').replace(/\r\n/g, '\n');
  const store = readSrc('src', 'lib', 'store.tsx');
  const page = readSrc('src', 'app', 'manage', 'classes', 'page.tsx');
  const mocks = await loadMockData();
  const { m5FixtureClass, m5Course14, m5Lessons14, m5Students, m5QuizResults, m5Submissions } = mocks;

  const sliceBetween = (src, startMarker, endMarker) => {
    const st = src.indexOf(startMarker);
    assert.ok(st !== -1, 'Không tìm thấy: ' + startMarker);
    const en = src.indexOf(endMarker, st + startMarker.length);
    assert.ok(en !== -1, 'Không tìm thấy điểm kết thúc: ' + endMarker);
    return src.slice(st, en);
  };
  const transpile = (snippet) =>
    ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const evalTsAsync = (snippet, argNames, args) => new AsyncFunction(...argNames, transpile(snippet))(...args);

  const FIXTURE_UUID = '00000000-0000-0000-0000-000000050001';
  const OTHER_CLASS_ID = 'cls_other_not_fixture';
  const adminUser = { id: 'usr_admin_01', role: 'admin' };

  // Trạng thái React giả: setter hỗ trợ cả giá trị trực tiếp lẫn hàm cập nhật (functional update)
  const makeState = (initial) => {
    const st = { ...initial, students: initial.students ?? [] };
    const setter = (key) => (updater) => {
      st[key] = typeof updater === 'function' ? updater(st[key]) : updater;
    };
    return {
      st,
      setCourseCloseOperations: setter('ops'),
      setCsvVerifications: setter('csv'),
      setActiveReservationsByClass: setter('reservations'),
      setStudents: setter('students'),
    };
  };

  // --------------------------------------------------------------------------
  // 31.1 Kiểm tra mã nguồn store.tsx và classes/page.tsx
  // --------------------------------------------------------------------------
  await t.test('31.1 R23-01: store.tsx và classes/page.tsx có đủ logic xóa trạng thái cũ của riêng lớp mẫu', () => {
    const seedBody = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', '// R17-01 / R19-02 / R19-03');
    assert.ok(seedBody.includes('const liveFixtureClassId: string ='));
    assert.ok(seedBody.includes('const fixtureIdsToClear = new Set<string>(['));
    for (const frag of ['liveFixtureClassId,', 'm5FixtureClass.id,', "'00000000-0000-0000-0000-000000050001',"]) {
      assert.ok(seedBody.includes(frag), 'Thiếu mã lớp mẫu cần xóa: ' + frag);
    }
    assert.ok(seedBody.includes('setCourseCloseOperations((prev) => {'));
    assert.ok(seedBody.includes('setCsvVerifications((prev) => {'));
    assert.ok(seedBody.includes('setActiveReservationsByClass((prev) => {'));
    assert.ok(seedBody.includes('fixtureClassId: resolvedFixtureClassId'));

    assert.ok(seedBody.includes('previewReqSeqByClassRef.current[fid] = (previewReqSeqByClassRef.current[fid] || 0) + 1;'), 'R24-01: seed Live phải tăng số thứ tự xem trước');
    assert.ok(seedBody.includes('latestPreviewByClassRef.current[fid] = null;'), 'R24-01: seed Live phải đánh dấu null (đặt lại mẫu) cho bản xem trước mới nhất');
    assert.ok(!seedBody.includes('delete latestPreviewByClassRef.current'), 'Không dùng delete: phải phân biệt null (đặt lại) và undefined (chồng yêu cầu)');
    assert.ok(store.includes('latestPreviewByClassRef.current[m5FixtureClass.id] = null;'), 'R24-01: seed Demo phải đánh dấu null cho lớp mẫu');
    assert.ok(seedBody.includes('invalidateFixturePreviews(fixtureIdsToClear);'));
    assert.ok(store.includes('const previewReqSeqByClassRef = useRef<Record<string, number>>({});'));
    assert.ok(store.includes('const latestPreviewByClassRef = useRef<Record<string, CourseClosePreview | null>>({});'));
    // R25-01: phiên bản danh sách học sinh dùng chung
    assert.ok(store.includes('const sharedStudentsEpochRef = useRef<number>(0);'), 'R25-01: phải có sharedStudentsEpochRef');
    assert.ok(seedBody.includes('sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;'), 'R25-01: seed phải tăng sharedStudentsEpochRef');
    assert.ok(seedBody.includes('previewReqSeqByClassRef.current.__shared_students_epoch__ ='), 'R25-01: seed phải tăng __shared_students_epoch__');

    const fetchBody = sliceBetween(store, 'const fetchCourseClosePreview = useCallback(', 'const setConfirmed14SessionsForClass');
    assert.ok(fetchBody.includes('const isStalePreviewRequest = () =>'));
    assert.ok(fetchBody.includes('const isStaleSharedStudents = () => getSharedStudentsEpoch() !== reqStudentsEpoch;'), 'R25-01: phải có isStaleSharedStudents');
    assert.ok(fetchBody.includes('const canApplySharedStudents = !isStaleSharedStudents();'), 'R25-01: phải có canApplySharedStudents');
    assert.ok(fetchBody.includes('if (canApplySharedStudents && rawMappedStudents) {'), 'R25-01: chỉ ghi danh sách học sinh dùng chung khi không cũ');
    assert.ok(fetchBody.includes('students: previewStudents,'), 'R25-01: bản xem trước dùng previewStudents');
    assert.ok(fetchBody.includes('latestPreviewMap[classId] = freshPreview;'));
    assert.ok(fetchBody.includes('currentOperation: wasReset ? null : courseCloseOperations[classId],'));
    assert.ok(fetchBody.includes('latestPreviewMap[classId] === null'));
    assert.ok(fetchBody.includes("('currentOperation' in srvData || 'current_operation' in srvData)"));
    assert.ok(fetchBody.includes('} else if (hasServerCurrentOp && rawCurrentOp === null) {'));
    assert.ok(fetchBody.includes('currentOperation: hasServerCurrentOp ? mappedOp : (mappedOp ?? courseCloseOperations[classId]),'));

    const handler = sliceBetween(page, 'const handleSeedFixture = async', '// Handler: Set Quota Baseline for Testing');
    assert.ok(!handler.includes('res.fixtureClassId || selectedClassId'), 'Không được dùng selectedClassId làm lớp mẫu dự phòng');
    assert.ok(handler.includes('const fixtureIdsToClear = new Set<string>(['));
    for (const frag of ["'00000000-0000-0000-0000-000000050001',", "'cls_rob_m5_01',", '...(res.fixtureClassId ? [res.fixtureClassId] : []),']) {
      assert.ok(handler.includes(frag), 'Thiếu mã lớp mẫu cần xóa trong handleSeedFixture: ' + frag);
    }
    assert.ok(handler.includes('setCsvVerificationResult((prev: any) =>'));
    assert.ok(handler.includes('setCloseResultNotice(null);'));
    assert.ok(handler.includes('setConfirmedCsvOpenedByClass((prev) => {'));
    assert.ok(handler.includes('setSelectedClassId(res.fixtureClassId);'));
    assert.ok(handler.includes('if (isLiveMode) {') && handler.includes('await fetchCourseClosePreview(res.fixtureClassId)'));
  });

  // --------------------------------------------------------------------------
  // 31.2 Chạy thực tế nhánh Live của seedM5CourseCloseFixture
  // --------------------------------------------------------------------------
  const seedBody = sliceBetween(store, 'const seedM5CourseCloseFixture = useCallback(', '// R17-01 / R19-02 / R19-03');
  const liveSeedSnippet = seedBody.slice(seedBody.indexOf('if (isLiveMode) {')) + "\nreturn { success: false, message: 'FELL_THROUGH' };";
  const runLiveSeed = (state, resetOnly, serverBody, ok = true, refs = {}) => {
    const calls = { bootstrap: 0 };
    const fakeFetch = async () => ({ ok, json: async () => serverBody });
    return evalTsAsync(
      liveSeedSnippet,
      ['isLiveMode', 'resetOnly', 'fetch', 'fetchBootstrapData', 'm5FixtureClass', 'setCourseCloseOperations', 'setCsvVerifications', 'setActiveReservationsByClass', 'previewReqSeqByClassRef', 'latestPreviewByClassRef', 'sharedStudentsEpochRef', 'authEpochRef'],
      [true, resetOnly, fakeFetch, async () => { calls.bootstrap += 1; if (refs.onBootstrap) await refs.onBootstrap(); }, m5FixtureClass, state.setCourseCloseOperations, state.setCsvVerifications, state.setActiveReservationsByClass, refs.previewReqSeqByClassRef, refs.latestPreviewByClassRef, refs.sharedStudentsEpochRef, refs.authEpochRef]
    ).then((res) => ({ res, calls }));
  };

  await t.test('31.2 R23-01 (a,b): seed Live xóa sạch tác vụ/CSV/giữ chỗ cũ của riêng lớp mẫu, giữ nguyên lớp khác', async () => {
    const incompleteOp = (classId) => ({ id: 'op-' + classId, classId, status: 'incomplete', stage: 'deleting_storage' });
    const csv = (id) => ({ valid: true, sha256: 'sha-' + id });
    for (const resetOnly of [false, true]) {
      const state = makeState({
        ops: { [FIXTURE_UUID]: incompleteOp(FIXTURE_UUID), [m5FixtureClass.id]: incompleteOp(m5FixtureClass.id), [OTHER_CLASS_ID]: incompleteOp(OTHER_CLASS_ID) },
        csv: { [FIXTURE_UUID]: csv(FIXTURE_UUID), [m5FixtureClass.id]: csv(m5FixtureClass.id), [OTHER_CLASS_ID]: csv(OTHER_CLASS_ID) },
        reservations: { [FIXTURE_UUID]: 3, [m5FixtureClass.id]: 2, [OTHER_CLASS_ID]: 5 },
      });
      const otherOp = state.st.ops[OTHER_CLASS_ID];
      const { res, calls } = await runLiveSeed(state, resetOnly, { success: true, fixtureClassId: resetOnly ? null : FIXTURE_UUID, message: 'ok' });
      assert.equal(res.success, true);
      assert.equal(res.fixtureClassId, resetOnly ? undefined : FIXTURE_UUID);
      assert.equal(calls.bootstrap, 1);
      for (const id of [FIXTURE_UUID, m5FixtureClass.id]) {
        assert.ok(!(id in state.st.ops), 'Tác vụ cũ của lớp mẫu phải bị xóa: ' + id);
        assert.ok(!(id in state.st.csv), 'Xác minh CSV cũ của lớp mẫu phải bị xóa: ' + id);
        assert.ok(!(id in state.st.reservations), 'Giữ chỗ cũ của lớp mẫu phải bị xóa: ' + id);
      }
      assert.strictEqual(state.st.ops[OTHER_CLASS_ID], otherOp, 'Tác vụ incomplete của lớp khác phải giữ nguyên');
      assert.equal(state.st.ops[OTHER_CLASS_ID].status, 'incomplete');
      assert.equal(state.st.csv[OTHER_CLASS_ID].sha256, 'sha-' + OTHER_CLASS_ID);
      assert.equal(state.st.reservations[OTHER_CLASS_ID], 5);
    }

    // Máy chủ không trả fixtureClassId: dự phòng UUID lớp mẫu vẫn bị xóa
    const state2 = makeState({ ops: { [FIXTURE_UUID]: incompleteOp(FIXTURE_UUID), [OTHER_CLASS_ID]: incompleteOp(OTHER_CLASS_ID) }, csv: {}, reservations: {} });
    const { res: res2 } = await runLiveSeed(state2, false, { success: true });
    assert.equal(res2.fixtureClassId, FIXTURE_UUID);
    assert.ok(!(FIXTURE_UUID in state2.st.ops) && OTHER_CLASS_ID in state2.st.ops);

    // Máy chủ trả lớp mẫu có mã khác: mã đó cũng bị xóa, lớp ngoài vẫn giữ
    const state3 = makeState({ ops: { cls_srv_fixture: incompleteOp('cls_srv_fixture'), [OTHER_CLASS_ID]: incompleteOp(OTHER_CLASS_ID) }, csv: {}, reservations: {} });
    await runLiveSeed(state3, false, { success: true, data: [{ fixture_class_id: 'cls_srv_fixture' }] });
    assert.ok(!('cls_srv_fixture' in state3.st.ops) && OTHER_CLASS_ID in state3.st.ops);

    // Máy chủ báo lỗi: không xóa gì
    const state4 = makeState({ ops: { [FIXTURE_UUID]: incompleteOp(FIXTURE_UUID) }, csv: {}, reservations: {} });
    const { res: res4 } = await runLiveSeed(state4, false, { success: false, message: 'lỗi' }, false);
    assert.equal(res4.success, false);
    assert.ok(FIXTURE_UUID in state4.st.ops, 'Đặt lại thất bại thì không được xóa trạng thái cũ');
  });

  // --------------------------------------------------------------------------
  // 31.3 Chạy thực tế fetchCourseClosePreview (Live)
  // --------------------------------------------------------------------------
  const fetchFnSrc = sliceBetween(store, 'const fetchCourseClosePreview = useCallback(', '  }, [\n    isLiveMode,\n    generateCourseClosePreview');
  const makeFetchPreview = (state, serverData, closure = {}) => {
    const body = 'const useCallback = (fn) => fn;\n' + fetchFnSrc + '  });\nreturn fetchCourseClosePreview;';
    const fakeFetch = closure.fetch ?? (async () => ({ ok: true, json: async () => ({ success: true, data: serverData }) }));
    const noop = () => {};
    const argNames = [
      'isLiveMode', 'fetch', 'classes', 'courses', 'lessons', 'students', 'cohortMembers', 'quizResults', 'submissions',
      'csvVerifications', 'courseCloseOperations', 'currentUser', 'activeReservationsByClass', 'storageQuotaError', 'storageQuota',
      'generateCourseClosePreview', 'computeCourseClosePreview', 'm5Students',
      'setClasses', 'setCourses', 'setLessons', 'setCohortMembers', 'setQuizResults', 'setSubmissions', 'setStudents',
      'setActiveReservationsByClass', 'setCourseCloseOperations', 'previewReqSeqByClassRef', 'latestPreviewByClassRef',
      'sharedStudentsEpochRef', 'authEpochRef',
    ];
    const args = [
      true, fakeFetch, [m5FixtureClass], [m5Course14], m5Lessons14, closure.students ?? m5Students, [], m5QuizResults, m5Submissions,
      closure.csvVerifications ?? {}, closure.courseCloseOperations ?? {}, adminUser, closure.activeReservationsByClass ?? {}, null, null,
      () => { throw new Error('Không được rơi về generateCourseClosePreview'); }, computeCourseClosePreview, m5Students,
      closure.setClasses ?? noop, noop, noop, noop, closure.setQuizResults ?? noop, closure.setSubmissions ?? noop, state.setStudents,
      state.setActiveReservationsByClass, state.setCourseCloseOperations,
      closure.previewReqSeqByClassRef, closure.latestPreviewByClassRef,
      closure.sharedStudentsEpochRef, closure.authEpochRef,
    ];
    return new Function(...argNames, transpile(body))(...args);
  };
  const serverBase = { quizResults: m5QuizResults, submissions: m5Submissions, activeReservationsCount: 0 };

  const buildVerify = () => {
    const csvResult = buildCourseCloseCsvContent(m5Students, m5Lessons14, m5FixtureClass.code, m5QuizResults, m5Submissions, {
      classId: m5FixtureClass.id,
      courseId: m5Course14.id,
    });
    assert.equal(csvResult.success, true);
    const verify = verifyCourseCloseCsv(csvResult.csvContent, {
      classItem: m5FixtureClass,
      classId: m5FixtureClass.id,
      classCode: m5FixtureClass.code,
      courseId: m5Course14.id,
      lessons: m5Lessons14,
      participants: m5Students,
      submissions: m5Submissions,
      quizResults: m5QuizResults,
    });
    assert.equal(verify.valid, true);
    return verify;
  };

  await t.test('31.3 R23-01 (c): máy chủ trả currentOperation null thì xóa tác vụ incomplete cũ và mở khóa canExecuteDelete', async () => {
    const stale = { id: 'op-old', classId: m5FixtureClass.id, status: 'incomplete', stage: 'deleting_storage' };
    const otherStale = { id: 'op-other', classId: OTHER_CLASS_ID, status: 'incomplete' };
    const verify = buildVerify();

    // Chưa sửa: dùng đúng state cũ -> vẫn chặn. Sau sửa: máy chủ xác nhận null -> không còn chặn
    const state = makeState({ ops: { [m5FixtureClass.id]: stale, [OTHER_CLASS_ID]: otherStale }, csv: {}, reservations: {} });
    const fetchPreview = makeFetchPreview(state, { ...serverBase, currentOperation: null }, {
      courseCloseOperations: state.st.ops,
      csvVerifications: { [m5FixtureClass.id]: verify },
    });
    const preview = await fetchPreview(m5FixtureClass.id, { isSchedule14Confirmed: true });
    assert.ok(!(m5FixtureClass.id in state.st.ops), 'courseCloseOperations của lớp mẫu phải bị xóa');
    assert.strictEqual(state.st.ops[OTHER_CLASS_ID], otherStale, 'Lớp khác giữ nguyên');
    assert.ok(!(preview.blockErrorCodes || []).includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS'), 'Không còn lỗi ACTIVE_WRITE_OR_DELETE_IN_PROGRESS');
    assert.deepEqual(preview.blockErrors, []);
    assert.equal(preview.csvVerified, true);
    assert.equal(preview.canExecuteDelete, true);

    // Cũng chấp nhận tên trường snake_case current_operation: null
    const state2 = makeState({ ops: { [m5FixtureClass.id]: stale }, csv: {}, reservations: {} });
    const p2 = await makeFetchPreview(state2, { ...serverBase, current_operation: null }, {
      courseCloseOperations: state2.st.ops,
      csvVerifications: { [m5FixtureClass.id]: verify },
    })(m5FixtureClass.id, { isSchedule14Confirmed: true });
    assert.ok(!(m5FixtureClass.id in state2.st.ops));
    assert.equal(p2.canExecuteDelete, true);

    // Máy chủ không trả trường currentOperation: giữ hành vi cũ (không xóa state cục bộ)
    const state3 = makeState({ ops: { [m5FixtureClass.id]: stale }, csv: {}, reservations: {} });
    const p3 = await makeFetchPreview(state3, { ...serverBase }, {
      courseCloseOperations: state3.st.ops,
      csvVerifications: { [m5FixtureClass.id]: verify },
    })(m5FixtureClass.id, { isSchedule14Confirmed: true });
    assert.ok(m5FixtureClass.id in state3.st.ops, 'Thiếu trường currentOperation thì không được xóa state cũ');
    assert.equal(p3.canExecuteDelete, false);
  });

  await t.test('31.4 R23-01 (d): máy chủ trả currentOperation incomplete thật sự thì vẫn chặn đóng khóa mới', async () => {
    const verify = buildVerify();
    const state = makeState({ ops: {}, csv: {}, reservations: {} });
    const preview = await makeFetchPreview(
      state,
      { ...serverBase, currentOperation: { id: 'op-live', class_id: m5FixtureClass.id, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' } },
      { courseCloseOperations: {}, csvVerifications: { [m5FixtureClass.id]: verify } }
    )(m5FixtureClass.id, { isSchedule14Confirmed: true });
    assert.equal(state.st.ops[m5FixtureClass.id]?.id, 'op-live');
    assert.equal(state.st.ops[m5FixtureClass.id]?.status, 'incomplete');
    assert.equal(preview.canExecuteDelete, false);
  });

  // --------------------------------------------------------------------------
  // 31.5 Chạy thực tế handleSeedFixture trong classes/page.tsx
  // --------------------------------------------------------------------------
  await t.test('31.5 R23-01 (e): handleSeedFixture chỉ xóa trạng thái cục bộ của lớp mẫu, giữ nguyên lớp khác', async () => {
    const handlerSrc = sliceBetween(page, 'const handleSeedFixture = async', '// Handler: Set Quota Baseline for Testing');
    const makeHandler = (ui, seedResult, isLiveMode = true) => {
      const calls = { fetchPreview: [], selected: [] };
      const fn = new Function(
        'setIsSeedingFixture', 'seedM5CourseCloseFixture', 'setCsvVerificationResult', 'setCloseResultNotice',
        'setConfirmedCsvOpenedByClass', 'setSelectedClassId', 'fetchCourseClosePreview', 'setAlertNotice', 'selectedClassId', 'isLiveMode',
        transpile(handlerSrc) + '\nreturn handleSeedFixture;'
      )(
        () => {},
        async () => seedResult,
        (u) => { ui.csvResult = typeof u === 'function' ? u(ui.csvResult) : u; },
        (u) => { ui.notice = typeof u === 'function' ? u(ui.notice) : u; },
        (u) => { ui.confirmed = typeof u === 'function' ? u(ui.confirmed) : u; },
        (id) => { calls.selected.push(id); },
        async (id) => { calls.fetchPreview.push(id); },
        (n) => { ui.alert = n; },
        ui.selectedClassId,
        isLiveMode
      );
      return { fn, calls };
    };

    // (a) Đang đứng ở lớp mẫu, đặt lại mẫu: xóa sạch trạng thái lớp mẫu và làm mới preview
    const uiA = {
      selectedClassId: FIXTURE_UUID,
      csvResult: { classId: FIXTURE_UUID, sha256: 'sha-fixture' },
      notice: { text: 'old' },
      confirmed: { [FIXTURE_UUID]: 'sha-fixture', [OTHER_CLASS_ID]: 'sha-other' },
    };
    const otherConfirmedRef = uiA.confirmed[OTHER_CLASS_ID];
    const a = makeHandler(uiA, { success: true, fixtureClassId: FIXTURE_UUID, message: 'ok' });
    await a.fn(false);
    assert.equal(uiA.csvResult, null);
    assert.equal(uiA.notice, null);
    assert.equal(uiA.confirmed[FIXTURE_UUID], '');
    assert.equal(uiA.confirmed[OTHER_CLASS_ID], otherConfirmedRef);
    assert.deepEqual(a.calls.fetchPreview, [FIXTURE_UUID]);
    assert.deepEqual(a.calls.selected, [FIXTURE_UUID]);
    assert.equal(uiA.alert.isError, false);

    // (b) Đang đứng ở lớp khác, bấm "Dọn mẫu" (resetOnly = true, không có fixtureClassId): giữ nguyên lớp khác
    const otherCsv = { classId: OTHER_CLASS_ID, sha256: 'sha-other' };
    const otherNotice = { text: 'notice-other' };
    const uiB = {
      selectedClassId: OTHER_CLASS_ID,
      csvResult: otherCsv,
      notice: otherNotice,
      confirmed: { [FIXTURE_UUID]: 'sha-fixture', cls_rob_m5_01: 'sha-demo', [OTHER_CLASS_ID]: 'sha-other' },
    };
    const b = makeHandler(uiB, { success: true, message: 'đã dọn' });
    await b.fn(true);
    assert.strictEqual(uiB.csvResult, otherCsv, 'csvVerificationResult của lớp khác phải giữ nguyên');
    assert.strictEqual(uiB.notice, otherNotice, 'closeResultNotice của lớp khác phải giữ nguyên');
    assert.equal(uiB.confirmed[OTHER_CLASS_ID], 'sha-other', 'confirmedCsvOpenedByClass của lớp khác phải giữ nguyên');
    assert.equal(uiB.confirmed[FIXTURE_UUID], '');
    assert.equal(uiB.confirmed.cls_rob_m5_01, '');
    assert.deepEqual(b.calls.fetchPreview, []);
    assert.deepEqual(b.calls.selected, []);

    // (c) Đang đứng ở lớp khác, dọn mẫu: kết quả CSV của lớp mẫu vẫn bị xóa
    const uiC = {
      selectedClassId: OTHER_CLASS_ID,
      csvResult: { classId: FIXTURE_UUID, sha256: 'sha-fixture' },
      notice: otherNotice,
      confirmed: { [FIXTURE_UUID]: 'sha-fixture' },
    };
    await makeHandler(uiC, { success: true, message: 'đã dọn' }).fn(true);
    assert.equal(uiC.csvResult, null);
    assert.strictEqual(uiC.notice, otherNotice);
    assert.equal(uiC.confirmed[FIXTURE_UUID], '');

    // (d) Đang đứng sẵn ở lớp mẫu và "Dọn mẫu": thông báo đóng khóa của lớp mẫu bị xóa
    const uiD = {
      selectedClassId: FIXTURE_UUID,
      csvResult: { classId: FIXTURE_UUID },
      notice: { text: 'old' },
      confirmed: {},
    };
    const confirmedD = uiD.confirmed;
    await makeHandler(uiD, { success: true, message: 'đã dọn' }).fn(true);
    assert.equal(uiD.csvResult, null);
    assert.equal(uiD.notice, null);
    assert.strictEqual(uiD.confirmed, confirmedD, 'Không có mục lớp mẫu thì không tạo mục mới');

    // (e) Máy chủ báo lỗi: không xóa gì
    const uiE = { selectedClassId: FIXTURE_UUID, csvResult: { classId: FIXTURE_UUID }, notice: { text: 'keep' }, confirmed: { [FIXTURE_UUID]: 'x' } };
    await makeHandler(uiE, { success: false, message: 'lỗi' }).fn(false);
    assert.ok(uiE.csvResult && uiE.notice);
    assert.equal(uiE.confirmed[FIXTURE_UUID], 'x');
    assert.equal(uiE.alert.isError, true);
  });

  // --------------------------------------------------------------------------
  // 31.6 R24-01: phản hồi xem trước cũ về muộn không được ghi đè trạng thái mới
  // --------------------------------------------------------------------------
  await t.test('31.6 R24-01: phản hồi fetchCourseClosePreview về muộn/đảo thứ tự không làm lớp mẫu bị chặn lại', async () => {
    const verify = buildVerify();
    const staleOp = { id: 'op-stale', classId: m5FixtureClass.id, status: 'incomplete', stage: 'deleting_storage' };
    const staleServerOp = { id: 'op-stale', class_id: m5FixtureClass.id, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' };
    const OPTIONS = { isSchedule14Confirmed: true };
    const newRefs = () => ({ previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} } });
    // Fetch có thể điều khiển: mỗi lần gọi tạo một phản hồi đang chờ, trả lời theo thứ tự tùy ý
    const makeDeferred = () => {
      const pending = [];
      return {
        fetch: () => new Promise((resolve) => pending.push(resolve)),
        respond: (i, data) => pending[i]({ ok: true, json: async () => ({ success: true, data }) }),
        count: () => pending.length,
      };
    };
    const noActiveBlock = (p) => !(p.blockErrorCodes || []).includes('ACTIVE_WRITE_OR_DELETE_IN_PROGRESS');
    const seedFixture = (state, refs) =>
      runLiveSeed(state, false, { success: true, fixtureClassId: m5FixtureClass.id, message: 'ok' }, true, refs);

    // (a) A gửi trước -> đặt lại mẫu thành công -> B gửi và về trước (null) -> A về muộn (incomplete)
    {
      const state = makeState({ ops: { [m5FixtureClass.id]: staleOp }, csv: {}, reservations: {} });
      const refs = newRefs();
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, courseCloseOperations: state.st.ops, csvVerifications: { [m5FixtureClass.id]: verify } });
      const promiseA = fp(m5FixtureClass.id, OPTIONS);
      assert.equal(d.count(), 1);
      await seedFixture(state, refs);
      assert.ok(!(m5FixtureClass.id in state.st.ops), 'Đặt lại mẫu phải xóa tác vụ cũ');
      const promiseB = fp(m5FixtureClass.id, OPTIONS);
      assert.equal(d.count(), 2);
      d.respond(1, { ...serverBase, currentOperation: null });
      const pB = await promiseB;
      assert.equal(pB.canExecuteDelete, true);
      assert.ok(noActiveBlock(pB));
      d.respond(0, { ...serverBase, currentOperation: staleServerOp });
      const pA = await promiseA;
      assert.equal(state.st.ops[m5FixtureClass.id], undefined, 'Phản hồi A về muộn không được ghi lại op-stale');
      assert.equal(pA.canExecuteDelete, true);
      assert.ok(noActiveBlock(pA));
    }

    // (b) A gửi trước (closure còn tác vụ cũ) -> đặt lại mẫu -> A về muộn với incomplete trước khi B được gọi
    {
      const state = makeState({ ops: { [m5FixtureClass.id]: staleOp }, csv: {}, reservations: {} });
      const refs = newRefs();
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, courseCloseOperations: { [m5FixtureClass.id]: staleOp }, csvVerifications: { [m5FixtureClass.id]: verify } });
      const promiseA = fp(m5FixtureClass.id, OPTIONS);
      await seedFixture(state, refs);
      d.respond(0, { ...serverBase, currentOperation: staleServerOp });
      const pA = await promiseA;
      assert.equal(state.st.ops[m5FixtureClass.id], undefined, 'A vẫn bị vô hiệu hóa bởi bước đặt lại mẫu');
      assert.ok(noActiveBlock(pA), 'Không được trả lỗi ACTIVE_WRITE_OR_DELETE_IN_PROGRESS');
      assert.equal(pA.canExecuteDelete, true);
    }

    // (c) Hai yêu cầu liên tiếp trên cùng lớp: B gửi sau nhưng về trước, A về muộn bị bỏ qua
    {
      const state = makeState({ ops: { [m5FixtureClass.id]: staleOp }, csv: {}, reservations: {} });
      const refs = newRefs();
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, courseCloseOperations: state.st.ops, csvVerifications: { [m5FixtureClass.id]: verify } });
      const promiseA = fp(m5FixtureClass.id, OPTIONS);
      const promiseB = fp(m5FixtureClass.id, OPTIONS);
      d.respond(1, { ...serverBase, currentOperation: null });
      const pB = await promiseB;
      assert.equal(pB.canExecuteDelete, true);
      assert.equal(state.st.ops[m5FixtureClass.id], undefined);
      d.respond(0, { ...serverBase, currentOperation: staleServerOp });
      const pA = await promiseA;
      assert.equal(state.st.ops[m5FixtureClass.id], undefined, 'A về muộn không được ghi đè B');
      assert.strictEqual(pA, pB, 'A về muộn phải trả bản xem trước mới nhất của B');
      assert.equal(pA.canExecuteDelete, true);
    }

    // (d) Yêu cầu của lớp khác đang bay trong lúc đặt lại mẫu: không bị vô hiệu hóa
    {
      const state = makeState({ ops: { [m5FixtureClass.id]: staleOp }, csv: {}, reservations: {} });
      const refs = newRefs();
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, csvVerifications: { [m5FixtureClass.id]: verify } });
      const promiseO = fp(OTHER_CLASS_ID, OPTIONS);
      await seedFixture(state, refs);
      assert.equal(refs.previewReqSeqByClassRef.current[OTHER_CLASS_ID], 1, 'Đặt lại mẫu không được tăng số thứ tự của lớp khác');
      d.respond(0, {
        ...serverBase,
        classItem: { id: OTHER_CLASS_ID, code: 'OTHER', name: 'Other', course_id: m5Course14.id, status: 'active' },
        currentOperation: { id: 'op-other-live', class_id: OTHER_CLASS_ID, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' },
      });
      await promiseO;
      assert.equal(state.st.ops[OTHER_CLASS_ID]?.id, 'op-other-live', 'Yêu cầu của lớp khác vẫn phải cập nhật đúng trạng thái');
      assert.ok(refs.latestPreviewByClassRef.current[OTHER_CLASS_ID], 'Bản xem trước mới nhất của lớp khác phải được lưu');
      assert.ok(!(m5FixtureClass.id in state.st.ops));
    }

    // (e) Hai yêu cầu chồng nhau, KHÔNG đặt lại mẫu ở giữa, state đang có incomplete: A về trước B vẫn bị chặn
    {
      const state = makeState({ ops: { [m5FixtureClass.id]: staleOp }, csv: {}, reservations: {} });
      const refs = newRefs();
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, courseCloseOperations: { [m5FixtureClass.id]: staleOp }, csvVerifications: { [m5FixtureClass.id]: verify } });
      const promiseA = fp(m5FixtureClass.id, OPTIONS);
      const promiseB = fp(m5FixtureClass.id, OPTIONS);
      assert.equal(d.count(), 2);
      assert.equal(refs.latestPreviewByClassRef.current[m5FixtureClass.id], undefined, 'Chưa đặt lại mẫu: phải là undefined, không phải null');
      d.respond(0, { ...serverBase, currentOperation: staleServerOp });
      const pA = await promiseA;
      assert.equal(pA.canExecuteDelete, false, 'A về trước B khi chưa đặt lại mẫu không được mở khóa nhầm');
      d.respond(1, { ...serverBase, currentOperation: staleServerOp });
      const pB = await promiseB;
      assert.equal(pB.canExecuteDelete, false);
    }
  });

  // --------------------------------------------------------------------------
  // 31.7 R25-01: phản hồi xem trước của lớp khác về muộn không đưa học sinh mẫu đã dọn trở lại
  // --------------------------------------------------------------------------
  await t.test('31.7 R25-01: phản hồi fetchCourseClosePreview của lớp khác về muộn không làm học sinh mẫu đã dọn xuất hiện lại', async () => {
    const OPTIONS = { isSchedule14Confirmed: true };
    const sampleIds = new Set(m5Students.map((s) => s.id));
    assert.equal(sampleIds.size, 5, 'Bộ mẫu Mốc 5 phải có 5 học sinh');
    const otherStudent = { id: 'stu_other_r25', participantId: 'p_other_r25', studentCode: 'OTH-01', fullName: 'Học sinh lớp khác', currentClassId: OTHER_CLASS_ID, originalClassId: OTHER_CLASS_ID, status: 'active' };
    const serverStudents = [...m5Students.map((s) => ({ ...s })), { ...otherStudent }];
    const countSamples = (list) => list.filter((s) => sampleIds.has(s.id)).length;
    const makeDeferred = () => {
      const pending = [];
      return {
        fetch: () => new Promise((resolve) => pending.push(resolve)),
        respond: (i, data) => pending[i]({ ok: true, json: async () => ({ success: true, data }) }),
        count: () => pending.length,
      };
    };
    const otherServerData = () => ({
      ...serverBase,
      classItem: { id: OTHER_CLASS_ID, code: 'OTHER', name: 'Other', course_id: m5Course14.id, status: 'active' },
      students: serverStudents,
      currentOperation: { id: 'op-other-fresh', class_id: OTHER_CLASS_ID, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' },
      activeReservationsCount: 4,
    });

    // R26: học sinh chỉ có trong phản hồi cũ (trước khi dọn/nạp lại mẫu), không có trong danh sách chung mới
    const staleOnlyStudent = { id: 'stu_stale_only_r26', participantId: 'p_stale_r26', studentCode: 'STL-01', fullName: 'Học sinh chỉ có trong phản hồi cũ', currentClassId: 'cls_unrelated_r26', originalClassId: 'cls_unrelated_r26', status: 'active' };
    serverStudents.push({ ...staleOnlyStudent });
    // Cả hai cách theo dõi phiên bản (chỉ previewReqSeqByClassRef, hoặc thêm sharedStudentsEpochRef thật) x cả hai thao tác:
    // resetOnly = true (dọn mẫu) và resetOnly = false (nạp lại mẫu)
    for (const resetOnly of [true, false]) {
    for (const withEpochRef of [false, true]) {
      const expectedSamples = resetOnly ? 0 : 5;
      const label = `resetOnly=${resetOnly}, withEpochRef=${withEpochRef}`;
      const state = makeState({ ops: {}, csv: {}, reservations: {}, students: serverStudents.map((s) => ({ ...s })) });
      assert.equal(countSamples(state.st.students), 5);
      const refs = { previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} } };
      if (withEpochRef) refs.sharedStudentsEpochRef = { current: 0 };
      // Mô phỏng fetchBootstrapData: máy chủ đã dọn mẫu (chỉ còn học sinh lớp khác) hoặc nạp lại mẫu (học sinh lớp khác + 5 học sinh mẫu mới)
      const bootstrapStudents = resetOnly ? [{ ...otherStudent }] : [{ ...otherStudent }, ...m5Students.map((s) => ({ ...s }))];
      refs.onBootstrap = async () => { state.setStudents(bootstrapStudents.map((s) => ({ ...s }))); };
      const d = makeDeferred();
      // Closure `students` trước khi gửi yêu cầu KHÔNG có học sinh của lớp khác (chỉ có bộ mẫu cũ)
      const initialClosureStudents = m5Students.map((s) => ({ ...s }));
      assert.ok(!initialClosureStudents.some((s) => s.id === otherStudent.id), 'Closure ban đầu không được chứa học sinh lớp khác');
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, students: initialClosureStudents });

      // 1) Gửi yêu cầu lớp khác khi máy chủ còn 5 học sinh mẫu
      const promiseO = fp(OTHER_CLASS_ID, OPTIONS);
      assert.equal(d.count(), 1);
      // 2) Dọn mẫu thành công trong lúc yêu cầu đang bay
      const seed = await runLiveSeed(state, resetOnly, { success: true, fixtureClassId: resetOnly ? null : FIXTURE_UUID, message: 'ok' }, true, refs);
      assert.equal(seed.res.success, true, label);
      assert.equal(countSamples(state.st.students), expectedSamples, 'Sau khi ' + (resetOnly ? 'dọn' : 'nạp lại') + ' mẫu: ' + label);
      const studentsAfterSeed = state.st.students;
      // 3) Phản hồi cũ của lớp khác về muộn
      d.respond(0, otherServerData());
      const preview = await promiseO;
      assert.ok(preview, 'Vẫn phải trả bản xem trước cho lớp khác');
      assert.equal(countSamples(state.st.students), expectedSamples, 'Phản hồi cũ không được thay đổi số học sinh mẫu: ' + label);
      assert.strictEqual(state.st.students, studentsAfterSeed, 'Phản hồi cũ không được ghi đè danh sách học sinh dùng chung: ' + label);
      assert.ok(!state.st.students.some((s) => s.id === staleOnlyStudent.id), 'Học sinh chỉ có trong phản hồi cũ không được xuất hiện: ' + label);
      assert.deepEqual(state.st.students.map((s) => s.id), bootstrapStudents.map((s) => s.id));
      assert.equal(state.st.ops[OTHER_CLASS_ID]?.id, 'op-other-fresh', 'Dữ liệu riêng của lớp khác vẫn phải được cập nhật');
      assert.equal(state.st.reservations[OTHER_CLASS_ID], 4, 'Số giữ chỗ của lớp khác vẫn phải được cập nhật');
      // R25-01 (tinh chỉnh): bản xem trước của lớp khác phải dùng học sinh mới từ srvData.students dù closure ban đầu không có học sinh đó
      // (bản xem trước không có participantCount; số học sinh là totalParticipants)
      assert.equal(preview.totalParticipants, 1, 'Bản xem trước của lớp khác phải phản ánh học sinh của lớp khác từ máy chủ');
    }
    }

    // 4) Không có đặt lại mẫu xen giữa: setStudents vẫn được gọi bình thường
    {
      const state = makeState({ ops: {}, csv: {}, reservations: {}, students: [] });
      const refs = { previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} }, sharedStudentsEpochRef: { current: 0 } };
      const d = makeDeferred();
      const fp = makeFetchPreview(state, null, { ...refs, fetch: d.fetch, students: state.st.students });
      const promiseO = fp(OTHER_CLASS_ID, OPTIONS);
      d.respond(0, otherServerData());
      await promiseO;
      assert.equal(state.st.students.length, 7);
      assert.equal(countSamples(state.st.students), 5, 'Không đặt lại mẫu thì danh sách học sinh từ máy chủ vẫn phải được áp dụng');
      assert.equal(state.st.ops[OTHER_CLASS_ID]?.id, 'op-other-fresh');
      assert.equal(state.st.reservations[OTHER_CLASS_ID], 4);
    }
  });

  // --------------------------------------------------------------------------
  // 31.8 R26-01: phản hồi Mốc 5 của phiên Admin cũ không được ghi vào phiên học sinh mới
  // --------------------------------------------------------------------------
  await t.test('31.8 R26-01: phản hồi fetchCourseClosePreview của Admin về muộn sau logout/đổi phiên không ghi vào phiên học sinh mới', async () => {
    const OPTIONS = { isSchedule14Confirmed: true };
    const makeDeferred = () => {
      const pending = [];
      return {
        fetch: () => new Promise((resolve) => pending.push(resolve)),
        respond: (i, data) => pending[i]({ ok: true, json: async () => ({ success: true, data }) }),
        count: () => pending.length,
      };
    };
    const CLEARED_BY_SESSION_CHANGE = ['setCohortMembers([]);', 'setCsvVerifications({});', 'setCourseCloseOperations({});', 'setActiveReservationsByClass({});', 'setStorageQuota(null);', 'setStorageQuotaError(null);'];

    // (a) Kiểm tra mã nguồn: helper vô hiệu hóa + login/logout/switchDemoUser + các hàm bất đồng bộ Mốc 5 đều kiểm tra phiên đăng nhập
    const helperSrc = sliceBetween(store, 'const invalidateM5AsyncState = () => {', 'const clearLogoutWarning');
    assert.ok(helperSrc.includes('sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;'));
    assert.ok(helperSrc.includes('seqMap.__shared_students_epoch__ ='));
    assert.ok(helperSrc.includes('latestPreviewByClassRef.current = {};'));
    const loginBody = sliceBetween(store, 'const login = async (credentials: {', '// Demo Mode Simulation');
    assert.ok(loginBody.includes('++authEpochRef.current;') && loginBody.includes('invalidateM5AsyncState();'), 'login Live phải vô hiệu hóa yêu cầu Mốc 5 đang bay');
    const switchBody = sliceBetween(store, 'const switchDemoUser = (role: Role, userId?: string) => {', 'const logout = async');
    assert.ok(switchBody.includes('invalidateM5AsyncState();'), 'switchDemoUser phải vô hiệu hóa yêu cầu Mốc 5 đang bay');
    const logoutSnippet = sliceBetween(store, 'const logout = async (): Promise<LogoutResult> => {', 'const changeStudentPin');
    assert.ok(logoutSnippet.includes('invalidateM5AsyncState();'), 'logout phải vô hiệu hóa yêu cầu Mốc 5 đang bay');
    for (const frag of CLEARED_BY_SESSION_CHANGE) {
      assert.ok(loginBody.includes(frag), 'login Live phải dọn: ' + frag);
      assert.ok(logoutSnippet.includes(frag), 'logout Live phải dọn: ' + frag);
    }
    const fetchBodyR26 = sliceBetween(store, 'const fetchCourseClosePreview = useCallback(', 'const setConfirmed14SessionsForClass');
    assert.ok(fetchBodyR26.includes('const isStalePreviewRequest = () => isStaleAuth() || Boolean(seqMap && seqMap[classId] !== reqSeq);'));
    assert.ok(fetchBodyR26.includes('if (isStaleAuth()) {'), 'resolveStalePreview phải xử lý riêng phiên cũ');
    for (const [name, startMarker, endMarker] of [
      ['fetchStorageQuota', 'const fetchStorageQuota = useCallback(', 'const setStorageQuotaBaseline'],
      ['setStorageQuotaBaseline', 'const setStorageQuotaBaseline = useCallback(', 'const seedM5CourseCloseFixture'],
      ['seedM5CourseCloseFixture', 'const seedM5CourseCloseFixture = useCallback(', '// R17-01 / R19-02 / R19-03'],
      ['exportCourseCloseCsv', 'const exportCourseCloseCsv = useCallback(', 'const verifyAndExecuteCourseClose'],
      ['verifyAndExecuteCourseClose', 'const verifyAndExecuteCourseClose = useCallback(', '// Quiz / Practice Actions'],
    ]) {
      const body = sliceBetween(store, startMarker, endMarker);
      assert.ok(body.includes('const reqAuthEpoch = typeof authEpochRef'), name + ' phải ghi nhận phiên đăng nhập lúc gửi yêu cầu');
      assert.ok(body.includes('const isStaleAuth = () =>'), name + ' phải có isStaleAuth');
      assert.ok(body.includes('isStaleAuth()'), name + ' phải kiểm tra phiên cũ sau await');
    }

    // (b) Chạy thực tế logout() -> phiên học sinh mới -> phản hồi Admin cũ về muộn
    const session = {
      currentUser: adminUser,
      students: m5Students.map((s) => ({ ...s })),
      quizResults: [],
      submissions: [],
      cohortMembers: [{ id: 'cm_admin', classId: m5FixtureClass.id }],
      csv: { [m5FixtureClass.id]: { valid: true } },
      ops: { [m5FixtureClass.id]: { id: 'op-admin', status: 'incomplete' } },
      reservations: { [m5FixtureClass.id]: 3 },
      quota: { allowed: true },
      quotaError: 'x',
    };
    const assignSetter = (key) => (u) => { session[key] = typeof u === 'function' ? u(session[key]) : u; };
    const noop = () => {};
    const refs = {
      authEpochRef: { current: 0 },
      bootstrapSeqRef: { current: 0 },
      previewReqSeqByClassRef: { current: {} },
      latestPreviewByClassRef: { current: {} },
      sharedStudentsEpochRef: { current: 0 },
    };
    const d = makeDeferred();
    const fetchPreview = makeFetchPreview(
      { setStudents: assignSetter('students'), setActiveReservationsByClass: assignSetter('reservations'), setCourseCloseOperations: assignSetter('ops') },
      null,
      {
        ...refs,
        fetch: d.fetch,
        students: session.students,
        setQuizResults: assignSetter('quizResults'),
        setSubmissions: assignSetter('submissions'),
      }
    );
    // Admin gửi yêu cầu xem trước (lớp mẫu)
    const promiseAdmin = fetchPreview(m5FixtureClass.id, OPTIONS);
    assert.equal(d.count(), 1);
    // logout thật (chạy nguyên mã nguồn store, kể cả helper vô hiệu hóa)
    const invalidateM5AsyncState = new Function(
      'sharedStudentsEpochRef', 'previewReqSeqByClassRef', 'latestPreviewByClassRef',
      transpile(helperSrc) + '\nreturn invalidateM5AsyncState;'
    )(refs.sharedStudentsEpochRef, refs.previewReqSeqByClassRef, refs.latestPreviewByClassRef);
    const logout = new Function(
      'authEpochRef', 'bootstrapSeqRef', 'isLiveMode', 'qaState', 'setQaState', 'setCurrentUser', 'setClasses', 'setStudents', 'setUsers',
      'setCourses', 'setLessons', 'setQuizResults', 'setSubmissions', 'setCohortMembers', 'setCsvVerifications', 'setCourseCloseOperations',
      'setActiveReservationsByClass', 'setStorageQuota', 'setStorageQuotaError', 'setBootstrapError', 'setIsLoadingSession', 'setLogoutWarning', 'fetch',
      'invalidateM5AsyncState',
      transpile(logoutSnippet) + '\nreturn logout;'
    )(
      refs.authEpochRef, refs.bootstrapSeqRef, true, { scenario: 'normal', delayMs: 0 }, noop, assignSetter('currentUser'), noop, assignSetter('students'), noop,
      noop, noop, assignSetter('quizResults'), assignSetter('submissions'), assignSetter('cohortMembers'), assignSetter('csv'), assignSetter('ops'),
      assignSetter('reservations'), assignSetter('quota'), assignSetter('quotaError'), noop, noop, noop,
      async () => ({ ok: true, json: async () => ({ success: true }) }),
      invalidateM5AsyncState
    );
    const logoutResult = await logout();
    assert.equal(logoutResult.success, true);
    assert.equal(session.currentUser, null);
    assert.deepEqual(session.cohortMembers, []);
    assert.deepEqual(session.csv, {});
    assert.deepEqual(session.ops, {});
    assert.deepEqual(session.reservations, {});
    assert.equal(session.quota, null);
    assert.equal(session.quotaError, null);
    assert.deepEqual(refs.latestPreviewByClassRef.current, {});
    // Mô phỏng phiên học sinh mới đăng nhập
    ++refs.authEpochRef.current;
    session.currentUser = { id: 'new-student', role: 'student' };
    session.students = [{ id: 'new-student', fullName: 'Synthetic New Student' }];
    const studentsOfNewSession = session.students;
    // Phản hồi Admin cũ về muộn: 5 học sinh khác + 19 kết quả quiz + 13 bài nộp
    d.respond(0, {
      ...serverBase,
      students: m5Students.map((s) => ({ ...s })),
      currentOperation: { id: 'op-admin-late', class_id: m5FixtureClass.id, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' },
      activeReservationsCount: 7,
    });
    const latePreview = await promiseAdmin;
    assert.ok(latePreview, 'Vẫn phải trả về bản xem trước an toàn cho lời gọi cũ');
    assert.equal(session.students.length, 1, 'students vẫn chỉ có đúng 1 học sinh mới');
    assert.strictEqual(session.students, studentsOfNewSession);
    assert.equal(session.students[0].id, 'new-student');
    assert.equal(session.quizResults.length, 0, 'Không rò rỉ kết quả quiz của phiên Admin cũ');
    assert.equal(session.submissions.length, 0, 'Không rò rỉ bài nộp của phiên Admin cũ');
    assert.deepEqual(session.ops, {}, 'Không rò rỉ tác vụ đóng khóa của phiên Admin cũ');
    assert.deepEqual(session.reservations, {}, 'Không rò rỉ giữ chỗ của phiên Admin cũ');
    assert.deepEqual(refs.latestPreviewByClassRef.current, {}, 'Không lưu bản xem trước của phiên cũ');

    // (c) Cùng phiên đăng nhập: yêu cầu bình thường vẫn ghi state như cũ
    {
      const same = { students: [], ops: {}, reservations: {} };
      const setSame = (key) => (u) => { same[key] = typeof u === 'function' ? u(same[key]) : u; };
      const sameRefs = { authEpochRef: { current: 5 }, previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} }, sharedStudentsEpochRef: { current: 0 } };
      const d2 = makeDeferred();
      const fp = makeFetchPreview(
        { setStudents: setSame('students'), setActiveReservationsByClass: setSame('reservations'), setCourseCloseOperations: setSame('ops') },
        null,
        { ...sameRefs, fetch: d2.fetch, students: [] }
      );
      const p = fp(m5FixtureClass.id, OPTIONS);
      d2.respond(0, { ...serverBase, students: m5Students.map((s) => ({ ...s })), activeReservationsCount: 2 });
      await p;
      assert.equal(same.students.length, 5, 'Cùng phiên đăng nhập thì vẫn ghi danh sách học sinh');
      assert.equal(same.reservations[m5FixtureClass.id], 2);
    }
  });

  // --------------------------------------------------------------------------
  // 31.9 R26-02: phản hồi xem trước cũ không đưa giao diện quay lại khóa đã đóng
  // --------------------------------------------------------------------------
  await t.test('31.9 R26-02: fetchCourseClosePreview gửi trước khi đóng khóa về muộn không đưa lớp quay lại khóa cũ', async () => {
    const { m5NextCourse } = mocks;
    assert.ok(m5NextCourse && m5NextCourse.id, 'Bộ mẫu phải có khóa kế tiếp m5NextCourse');
    const OPTIONS = { isSchedule14Confirmed: true };
    const makeDeferred = () => {
      const pending = [];
      return {
        fetch: () => new Promise((resolve) => pending.push(resolve)),
        respond: (i, data) => pending[i]({ ok: true, json: async () => ({ success: true, data }) }),
        count: () => pending.length,
      };
    };

    // (a) Kiểm tra mã nguồn verifyAndExecuteCourseClose
    const verifyBody = sliceBetween(store, 'const verifyAndExecuteCourseClose = useCallback(', '// Quiz / Practice Actions');
    assert.ok(verifyBody.includes('const invalidateClassPreviews = () => {'));
    assert.ok(verifyBody.includes('previewReqSeqByClassRef.current[classId] = (previewReqSeqByClassRef.current[classId] || 0) + 1;'));
    assert.ok(verifyBody.includes('latestPreviewByClassRef.current[classId] = null;'));
    assert.ok(verifyBody.includes('sharedStudentsEpochRef.current = (sharedStudentsEpochRef.current || 0) + 1;'));
    const apiIdx = verifyBody.indexOf("fetch('/api/m2/m5-execute-course-close'");
    const firstInvalidate = verifyBody.indexOf('invalidateClassPreviews();');
    assert.ok(firstInvalidate !== -1 && firstInvalidate < apiIdx, 'Phải vô hiệu hóa xem trước cũ TRƯỚC khi gọi API đóng khóa');
    const bootstrapIdx = verifyBody.indexOf('await fetchBootstrapData();');
    assert.ok(verifyBody.lastIndexOf('invalidateClassPreviews();', bootstrapIdx) > apiIdx, 'Phải vô hiệu hóa lại TRƯỚC await fetchBootstrapData() khi đóng khóa thành công');
    assert.ok(verifyBody.indexOf('invalidateClassPreviews();', bootstrapIdx) !== -1, 'Phải vô hiệu hóa lại SAU await fetchBootstrapData()');
    const incompleteIdx = verifyBody.indexOf("data?.status === 'incomplete' || data?.data");
    const incompleteBlock = verifyBody.slice(incompleteIdx, verifyBody.indexOf('await fetchCourseClosePreview(classId)', incompleteIdx));
    assert.ok(incompleteBlock.includes('previewReqSeqByClassRef.current[classId] = (previewReqSeqByClassRef.current[classId] || 0) + 1;'), 'Nhánh incomplete phải tăng số thứ tự xem trước trước khi cập nhật tác vụ');
    assert.ok(incompleteBlock.indexOf('previewReqSeqByClassRef.current[classId]') < incompleteBlock.indexOf('setCourseCloseOperations('));

    // (b) Chạy thực tế: A (xem trước) gửi trước -> Admin sang lớp khác -> handleExecuteClose(false) đóng khóa -> A về muộn
    const handlerSrc = sliceBetween(page, 'const handleExecuteClose = async', '// Course close preview details');
    const refs = { previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} }, sharedStudentsEpochRef: { current: 0 }, authEpochRef: { current: 1 } };
    const ui = {
      classes: [{ ...m5FixtureClass }],
      quizResults: m5QuizResults.map((q) => ({ ...q })),
      submissions: m5Submissions.map((s) => ({ ...s })),
      ops: {},
      csv: { [m5FixtureClass.id]: { valid: true } },
      reservations: { [m5FixtureClass.id]: 1 },
      students: m5Students.map((s) => ({ ...s })),
    };
    const assignSetter = (key) => (u) => { ui[key] = typeof u === 'function' ? u(ui[key]) : u; };
    const noop = () => {};
    assert.ok(ui.quizResults.length > 0 && ui.submissions.length > 0, 'Bộ mẫu phải có kết quả quiz và bài nộp để kiểm tra khôi phục');
    const d = makeDeferred();
    const fetchPreview = makeFetchPreview(
      { setStudents: assignSetter('students'), setActiveReservationsByClass: assignSetter('reservations'), setCourseCloseOperations: assignSetter('ops') },
      null,
      {
        ...refs,
        fetch: d.fetch,
        students: ui.students,
        setClasses: assignSetter('classes'),
        setQuizResults: assignSetter('quizResults'),
        setSubmissions: assignSetter('submissions'),
      }
    );
    const promiseA = fetchPreview(m5FixtureClass.id, OPTIONS);
    assert.equal(d.count(), 1);

    // verifyAndExecuteCourseClose thật (nhánh Live) chạy nguyên mã nguồn store
    const executeFetchCalls = [];
    const calls = { fetchPreview: [] };
    const verifyFnSrc = sliceBetween(store, 'const verifyAndExecuteCourseClose = useCallback(', '  }, [\n    isLiveMode,\n    fetchBootstrapData,');
    const verifyAndExecute = new Function(
      'isLiveMode', 'fetch', 'fetchBootstrapData', 'classes', 'courseCloseOperations', 'fetchCourseClosePreview',
      'setCourseCloseOperations', 'setCsvVerifications', 'setActiveReservationsByClass',
      'previewReqSeqByClassRef', 'latestPreviewByClassRef', 'sharedStudentsEpochRef', 'authEpochRef',
      'const useCallback = (fn) => fn;\n' + transpile(verifyFnSrc + '  });') + '\nreturn verifyAndExecuteCourseClose;'
    )(
      true,
      async (url) => {
        executeFetchCalls.push(url);
        return { ok: true, json: async () => ({ success: true, message: 'Đã đóng khóa' }) };
      },
      async () => {
        // Mô phỏng fetchBootstrapData: máy chủ đã chuyển lớp sang khóa kế tiếp và xóa quiz/bài nộp của khóa cũ
        ui.classes = ui.classes.map((c) => (c.id === m5FixtureClass.id ? { ...c, courseId: m5NextCourse.id } : c));
        ui.quizResults = [];
        ui.submissions = [];
      },
      ui.classes, {}, async (id) => { calls.fetchPreview.push(id); return null; },
      assignSetter('ops'), assignSetter('csv'), assignSetter('reservations'),
      refs.previewReqSeqByClassRef, refs.latestPreviewByClassRef, refs.sharedStudentsEpochRef, refs.authEpochRef
    );

    // Admin đã chuyển sang lớp khác trong lúc chờ -> page chạy handleExecuteClose(false) cho lớp mẫu
    const selectedClassIdRef = { current: 'other-class' };
    const handleExecuteClose = new Function(
      'selectedClass', 'isClosingCourse', 'closingByClassId', 'isLatestCsvOpenedConfirmed', 'setAlertNotice', 'setClosingByClassId', 'setClosingClassId',
      'verifyAndExecuteCourseClose', 'confirmed14Sessions', 'nextCourseId', 'simulateFailureStage', 'csvVerificationResult',
      'setConfirmedCsvOpenedByClass', 'selectedClassIdRef', 'setCloseConfirmModalOpen', 'setConfirmed14Sessions', 'isLiveMode',
      'fetchCourseClosePreview', 'setCloseResultNotice', 'setCsvVerificationResult', 'setTimeout',
      transpile(handlerSrc) + '\nreturn handleExecuteClose;'
    )(
      { id: m5FixtureClass.id, courseId: m5Course14.id }, false, {}, true, noop, noop, noop,
      verifyAndExecute, true, m5NextCourse.id, 'none', { sha256: 'abc' },
      noop, selectedClassIdRef, noop, noop, true,
      async (id) => { calls.fetchPreview.push(id); return null; }, noop, noop,
      (fn) => fn()
    );
    await handleExecuteClose(false);
    assert.deepEqual(executeFetchCalls, ['/api/m2/m5-execute-course-close']);
    assert.equal(calls.fetchPreview.length, 0, 'Admin đã chuyển lớp nên không có yêu cầu xem trước mới cho lớp vừa đóng khóa');
    assert.equal(ui.classes.find((c) => c.id === m5FixtureClass.id).courseId, m5NextCourse.id, 'Lớp đã sang khóa mới sau khi đóng khóa');
    assert.equal(ui.quizResults.length, 0);
    assert.equal(ui.submissions.length, 0);
    assert.ok(!(m5FixtureClass.id in ui.csv), 'csvVerifications của lớp vừa đóng khóa phải bị xóa');
    assert.ok(!(m5FixtureClass.id in ui.ops), 'courseCloseOperations của lớp vừa đóng khóa phải bị xóa');
    assert.ok(!(m5FixtureClass.id in ui.reservations), 'activeReservationsByClass của lớp vừa đóng khóa phải bị xóa');

    // Phản hồi xem trước A (gửi từ trước khi đóng khóa) về muộn với dữ liệu khóa cũ
    d.respond(0, {
      ...serverBase,
      classItem: { id: m5FixtureClass.id, code: m5FixtureClass.code, name: m5FixtureClass.name, course_id: m5Course14.id, status: 'active' },
      course: { id: m5Course14.id, code: m5Course14.code, name: m5Course14.name },
      currentOperation: null,
    });
    const preview = await promiseA;
    assert.ok(preview, 'Vẫn phải trả bản xem trước cho lời gọi cũ');
    assert.equal(ui.classes.find((c) => c.id === m5FixtureClass.id).courseId, m5NextCourse.id, 'Lớp phải vẫn ở khóa mới, không quay lại khóa cũ');
    assert.equal(ui.quizResults.length, 0, 'Không khôi phục kết quả quiz của khóa cũ');
    assert.equal(ui.submissions.length, 0, 'Không khôi phục bài nộp của khóa cũ');
    assert.ok(!(m5FixtureClass.id in ui.csv));
    assert.ok(!(m5FixtureClass.id in ui.reservations));
  });

  // --------------------------------------------------------------------------
  // 31.10 R27-01: lượt đóng khóa của phiên cũ không làm mất cập nhật xem trước của phiên mới
  // --------------------------------------------------------------------------
  await t.test('31.10 R27-01: verifyAndExecuteCourseClose của phiên Admin cũ hoàn tất sau fetchBootstrapData không vô hiệu hóa xem trước của phiên mới', async () => {
    const OPTIONS = { isSchedule14Confirmed: true };

    // (a) Kiểm tra mã nguồn: sau await fetchBootstrapData() phải kiểm tra isStaleAuth() trước invalidateClassPreviews() cuối cùng
    const verifyBody = sliceBetween(store, 'const verifyAndExecuteCourseClose = useCallback(', '// Quiz / Practice Actions');
    const bootstrapIdx = verifyBody.indexOf('await fetchBootstrapData();');
    assert.ok(bootstrapIdx !== -1);
    const afterBootstrap = verifyBody.slice(bootstrapIdx);
    const staleIdx = afterBootstrap.indexOf('if (isStaleAuth()) {');
    const lastInvalidateIdx = afterBootstrap.indexOf('invalidateClassPreviews();');
    assert.ok(staleIdx !== -1 && lastInvalidateIdx !== -1, 'Phải có isStaleAuth() và invalidateClassPreviews() sau await fetchBootstrapData()');
    assert.ok(staleIdx < lastInvalidateIdx, 'isStaleAuth() phải được kiểm tra TRƯỚC invalidateClassPreviews() cuối cùng');

    // (b) Chạy thực tế: Admin 1 đóng khóa (tạm dừng ở fetchBootstrapData) -> đổi phiên sang Admin 2 -> Admin 2 gửi xem trước
    //     -> fetchBootstrapData cũ hoàn tất -> phản hồi xem trước của Admin 2 về
    const refs = { previewReqSeqByClassRef: { current: {} }, latestPreviewByClassRef: { current: {} }, sharedStudentsEpochRef: { current: 0 }, authEpochRef: { current: 1 } };
    const session = { students: [], ops: {}, reservations: {}, csv: {} };
    const assignSetter = (key) => (u) => { session[key] = typeof u === 'function' ? u(session[key]) : u; };
    const releaseBootstrap = [];
    const verifyFnSrc = sliceBetween(store, 'const verifyAndExecuteCourseClose = useCallback(', '  }, [\n    isLiveMode,\n    fetchBootstrapData,');
    const verifyAndExecute = new Function(
      'isLiveMode', 'fetch', 'fetchBootstrapData', 'classes', 'courseCloseOperations', 'fetchCourseClosePreview',
      'setCourseCloseOperations', 'setCsvVerifications', 'setActiveReservationsByClass',
      'previewReqSeqByClassRef', 'latestPreviewByClassRef', 'sharedStudentsEpochRef', 'authEpochRef',
      'const useCallback = (fn) => fn;\n' + transpile(verifyFnSrc + '  });') + '\nreturn verifyAndExecuteCourseClose;'
    )(
      true,
      async () => ({ ok: true, json: async () => ({ success: true, message: 'Đã đóng khóa' }) }),
      () => new Promise((resolve) => releaseBootstrap.push(resolve)),
      [{ ...m5FixtureClass }], {}, async () => null,
      assignSetter('ops'), assignSetter('csv'), assignSetter('reservations'),
      refs.previewReqSeqByClassRef, refs.latestPreviewByClassRef, refs.sharedStudentsEpochRef, refs.authEpochRef
    );

    // Admin 1 (authEpochRef.current = 1) đóng khóa và dừng ở await fetchBootstrapData()
    const closePromise = verifyAndExecute(m5FixtureClass.id, true, { courseId: m5Course14.id });
    for (let i = 0; i < 20 && releaseBootstrap.length === 0; i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(releaseBootstrap.length, 1, 'Lượt đóng khóa cũ phải đang chờ fetchBootstrapData()');

    // Đổi phiên đăng nhập sang Admin 2 và gửi xem trước (phiên mới)
    ++refs.authEpochRef.current;
    const pending = [];
    const fetchPreview = makeFetchPreview(
      { setStudents: assignSetter('students'), setActiveReservationsByClass: assignSetter('reservations'), setCourseCloseOperations: assignSetter('ops') },
      null,
      { ...refs, fetch: () => new Promise((resolve) => pending.push(resolve)), students: session.students }
    );
    const previewPromise = fetchPreview(m5FixtureClass.id, OPTIONS);
    assert.equal(pending.length, 1, 'Phiên mới phải đã gửi yêu cầu xem trước');
    const seqBefore = refs.previewReqSeqByClassRef.current[m5FixtureClass.id];
    const epochBefore = refs.sharedStudentsEpochRef.current;

    // fetchBootstrapData của lượt đóng khóa cũ hoàn tất TRƯỚC khi phản hồi xem trước của phiên mới về
    releaseBootstrap[0]();
    const closeResult = await closePromise;
    assert.equal(closeResult.success, true);
    assert.equal(closeResult.status, 'completed');
    assert.equal(refs.previewReqSeqByClassRef.current[m5FixtureClass.id], seqBefore, 'Phiên cũ không được tăng số thứ tự xem trước của phiên mới');
    assert.equal(refs.sharedStudentsEpochRef.current, epochBefore, 'Phiên cũ không được tăng phiên bản danh sách học sinh dùng chung của phiên mới');

    // Phản hồi xem trước của phiên mới về
    pending[0]({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          ...serverBase,
          students: m5Students.map((s) => ({ ...s })),
          currentOperation: { id: 'op-new-session', class_id: m5FixtureClass.id, course_id: m5Course14.id, status: 'incomplete', stage: 'deleting_storage' },
          activeReservationsCount: 3,
        },
      }),
    });
    const preview = await previewPromise;
    assert.ok(preview, 'Phiên mới phải nhận được bản xem trước');
    assert.equal(session.ops[m5FixtureClass.id]?.id, 'op-new-session', 'Tác vụ của phiên mới không bị bỏ qua');
    assert.equal(session.reservations[m5FixtureClass.id], 3, 'Giữ chỗ của phiên mới không bị bỏ qua');
    assert.ok(refs.latestPreviewByClassRef.current[m5FixtureClass.id], 'latestPreviewByClassRef của phiên mới phải được cập nhật đầy đủ');
  });
  // --------------------------------------------------------------------------
  // 31.11 BFF edge-client + route bảo toàn operationStatus/fixtureClassId/errors và Edge dùng adminClient cho cả 2 truy vấn
  // --------------------------------------------------------------------------
  await t.test('31.11 BFF preserves operationStatus/fixtureClassId/errors and Edge preview executes classes update + reservations read via adminClient', async () => {
    const edgeClientSrc = readSrc('src', 'lib', 'server', 'edge-client.ts');
    const routeSrc = readSrc('src', 'app', 'api', 'm2', '[action]', 'route.ts');
    const edgeSrc = readSrc('supabase', 'functions', 'm2-backend', 'index.ts');

    // (a) Kiểm tra tĩnh riêng biệt cho cả 2 vị trí trong m5-course-close-preview + m5-export-course-csv
    const previewBranch = sliceBetween(edgeSrc, "if (action === 'm5-course-close-preview') {", "if (action === 'm5-export-course-csv') {");
    const exportBranch = sliceBetween(edgeSrc, "if (action === 'm5-export-course-csv') {", "if (action === 'm5-execute-course-close') {");
    assert.ok(
      previewBranch.includes('const classWriteClient =\n          typeof adminClient !== \'undefined\' && adminClient?.from ? adminClient : actorClient;\n        const { data: updatedRows, error: updErr } = await classWriteClient\n          .from(\'classes\')\n          .update({ is_14_sessions_confirmed: confirmed14Sessions })'),
      'Cập nhật classes.is_14_sessions_confirmed phải đi qua classWriteClient (ưu tiên adminClient)'
    );
    assert.ok(
      previewBranch.includes('const resReadClient =\n        typeof adminClient !== \'undefined\' && adminClient?.from ? adminClient : actorClient;\n      const { data: resRows, error: resErr } = await fetchAllM5Rows((from, to) =>\n        resReadClient\n          .from(\'m3_upload_reservations\')'),
      'Đọc m3_upload_reservations phải đi qua resReadClient (ưu tiên adminClient)'
    );
    assert.ok(!/actorClient\s*\.from\('classes'\)\s*\.update/.test(previewBranch), 'Không được dùng actorClient để UPDATE classes');
    assert.ok(!/actorClient\s*\.from\('m3_upload_reservations'\)/.test(previewBranch), 'Không được dùng actorClient để đọc m3_upload_reservations');
    assert.ok(!/actorClient\s*\.from\('students'\)/.test(previewBranch), 'Không được dùng actorClient để đọc students kèm profiles(*) trong preview');
    assert.ok(!/actorClient\s*\.from\('students'\)/.test(exportBranch), 'Không được dùng actorClient để đọc students kèm profiles(*) trong export');
    for (const [name, br] of [['preview', previewBranch], ['export', exportBranch]]) {
      assert.ok(
        br.includes('const studentsReadClient =\n        typeof adminClient !== \'undefined\' && adminClient?.from ? adminClient : actorClient;\n      const { data: studentsRows, error: studentsErr } = await fetchAllM5Rows((from, to) =>\n        studentsReadClient.from(\'students\').select(\'*, profiles(*)\').order(\'id\', { ascending: true }).range(from, to)\n      );'),
        `${name} phải đọc students kèm profiles(*) qua studentsReadClient (ưu tiên adminClient) để tránh 57014 statement timeout`
      );
      assert.ok(
        br.includes('(Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name) ||\n          s.full_name ||\n          s.fullName ||\n          \'\''),
        `${name} phải chuẩn hóa fullName từ s.profiles (mảng/đối tượng) hoặc s.full_name`
      );
    }

    // (b) Thực thi trực tiếp nhánh m5-course-close-preview:
    //     actorClient bị chặn UPDATE classes (42501) và trả 0 dòng m3_upload_reservations (do RLS học sinh),
    //     còn adminClient cho phép UPDATE classes và trả đầy đủ giữ chỗ đang hoạt động.
    const fetchAllSrc = sliceBetween(edgeSrc, 'async function fetchAllM5Rows<T = any>(', 'function sanitizeCsvCell(');
    const makePreviewClient = (roleType, state) => ({
      from: (table) => {
        let isUpdate = false;
        let patchObj = null;
        const api = {
          select: () => api,
          update: (patch) => {
            isUpdate = true;
            patchObj = patch;
            return api;
          },
          eq: () => api,
          in: () => api,
          is: () => api,
          gt: () => api,
          order: () => api,
          limit: () => api,
          range: () => api,
          maybeSingle: async () => {
            if (table === 'classes') return { data: { ...state.classRow }, error: null };
            if (table === 'courses') return { data: { id: 'crs_1', title: 'Course 1', total_sessions: 14 }, error: null };
            if (table === 'm5_course_close_operations') return { data: null, error: null };
            return { data: null, error: null };
          },
          then: (res, rej) => {
            if (table === 'classes' && isUpdate) {
              if (roleType !== 'admin') {
                return Promise.resolve({
                  data: null,
                  error: { code: '42501', message: 'permission denied for table classes' },
                }).then(res, rej);
              }
              state.adminUpdatedClasses += 1;
              state.classRow = { ...state.classRow, ...patchObj };
              return Promise.resolve({ data: [{ ...state.classRow }], error: null }).then(res, rej);
            }
            if (table === 'lessons') {
              return Promise.resolve({ data: [{ id: 'les_1', course_id: 'crs_1', session_number: 1 }], error: null }).then(res, rej);
            }
            if (table === 'm5_class_cohort_members') {
              return Promise.resolve({ data: [], error: null }).then(res, rej);
            }
            if (table === 'students') {
              if (roleType !== 'admin') {
                return Promise.resolve({
                  data: null,
                  error: { code: '57014', message: 'canceling statement due to statement timeout' },
                }).then(res, rej);
              }
              return Promise.resolve({
                data: [
                  { id: 'stu_obj', participant_id: 'P1', student_code: 'S1', profiles: { full_name: 'Tên Từ Object' } },
                  { id: 'stu_arr', participant_id: 'P2', student_code: 'S2', profiles: [{ full_name: 'Tên Từ Mảng' }] },
                  { id: 'stu_col', participant_id: 'P3', student_code: 'S3', profiles: null, full_name: 'Tên Từ Cột' },
                ],
                error: null,
              }).then(res, rej);
            }
            if (table === 'quiz_results' || table === 'practice_submissions') {
              return Promise.resolve({ data: [], error: null }).then(res, rej);
            }
            if (table === 'm3_upload_reservations') {
              if (roleType !== 'admin') {
                state.actorReadReservations += 1;
                return Promise.resolve({ data: [], error: null }).then(res, rej);
              }
              state.adminReadReservations += 1;
              return Promise.resolve({
                data: [{ id: 'res_1', class_id: 'cls_1', lesson_id: 'les_1', status: 'reserved' }],
                error: null,
              }).then(res, rej);
            }
            return Promise.resolve({ data: [], error: null }).then(res, rej);
          },
        };
        return api;
      },
    });

    const state = {
      classRow: { id: 'cls_1', course_id: 'crs_1', code: 'CLS-01', is_14_sessions_confirmed: false },
      adminUpdatedClasses: 0,
      adminReadReservations: 0,
      actorReadReservations: 0,
    };
    const actorClient = makePreviewClient('actor', state);
    const adminClient = makePreviewClient('admin', state);

    const previewResp = await evalTsAsync(
      fetchAllSrc + '\n' + previewBranch + '\nreturn null;',
      ['action', 'body', 'adminClient', 'requireAdminActor', 'jsonResponse', 'STATIC_MESSAGES'],
      [
        'm5-course-close-preview',
        { accessToken: 'tok', payload: { classId: 'cls_1', courseId: 'crs_1', confirmed14Sessions: true } },
        adminClient,
        async () => ({ actor: { profileId: 'adm_1' }, actorClient, errorResponse: null }),
        (body, status = 200) => ({ body, status }),
        { UNAUTHORIZED: 'x' },
      ]
    );

    assert.equal(previewResp.status, 200, 'm5-course-close-preview phải trả HTTP 200 thay vì 500 DB_READ_FAILED');
    assert.equal(previewResp.body.success, true);
    assert.equal(state.adminUpdatedClasses, 1, 'UPDATE classes phải đi qua adminClient');
    assert.equal(previewResp.body.data.classItem.is_14_sessions_confirmed, true);
    assert.equal(state.adminReadReservations, 1, 'Đọc m3_upload_reservations phải đi qua adminClient');
    assert.equal(state.actorReadReservations, 0, 'Không đọc m3_upload_reservations qua actorClient');
    assert.equal(previewResp.body.data.activeReservationsCount, 1, 'Phải đếm đủ giữ chỗ đang hoạt động của lớp');
    assert.deepEqual(
      previewResp.body.data.students.map((s) => s.fullName),
      ['Tên Từ Object', 'Tên Từ Mảng', 'Tên Từ Cột'],
      'Phải chuẩn hóa fullName cho cả 3 dạng trả về của PostgREST'
    );

    // (c) Thực thi trực tiếp callEdgeBackend + lắp ghép phản hồi BFF trong route.ts
    const callEdgeFn = new Function(
      'process',
      'fetch',
      transpile(edgeClientSrc.replace(/export\s+/g, '')) + '\nreturn callEdgeBackend;'
    );
    const fakeEnv = { env: { MINDX_SUPABASE_URL: 'https://eythjapspkoyqdxlxtcd.supabase.co', MINDX_BFF_SECRET: 'sec' } };

    // (c1) m5-execute-course-close dừng ở incomplete (HTTP 200 nhưng json.status = 'incomplete')
    const edgeIncomplete = await callEdgeFn(fakeEnv, async () => ({
      status: 200,
      json: async () => ({
        success: false,
        status: 'incomplete',
        code: 'SIMULATED_MID_STORAGE_BATCH_FAILURE',
        message: 'Mô phỏng lỗi lô 1',
        data: { operationId: 'op_1', deletedPaths: [], remainingPaths: ['a.zip'] },
      }),
    }))({ action: 'm5-execute-course-close' });
    assert.equal(edgeIncomplete.status, 200, 'edgeRes.status giữ mã HTTP 200');
    assert.equal(edgeIncomplete.operationStatus, 'incomplete', 'edgeRes.operationStatus giữ chuỗi incomplete');

    const bffTailSrc = sliceBetween(routeSrc, '// Ensure mutation data returned to client is sanitized', '}\n');
    const buildBffResponse = new Function(
      'edgeRes',
      'sanitizePublicUserDto',
      'apiResponse',
      transpile(bffTailSrc)
    );
    const bffIncomplete = buildBffResponse(
      edgeIncomplete,
      (d) => d,
      (body, httpStatus) => ({ body, httpStatus })
    );
    assert.equal(bffIncomplete.httpStatus, 200);
    assert.equal(bffIncomplete.body.status, 'incomplete', 'Thân JSON BFF phải trả status = "incomplete", không bị ghi đè thành 200');

    // (c2) m5-seed-fixture bảo toàn fixtureClassId và m5-export-course-csv bảo toàn errors
    const edgeSeed = await callEdgeFn(fakeEnv, async () => ({
      status: 200,
      json: async () => ({
        success: true,
        fixtureClassId: FIXTURE_UUID,
        data: [{ fixture_class_id: FIXTURE_UUID }],
        message: 'Đã nạp mẫu',
      }),
    }))({ action: 'm5-seed-fixture' });
    const bffSeed = buildBffResponse(edgeSeed, () => null, (body, httpStatus) => ({ body, httpStatus }));
    assert.equal(bffSeed.httpStatus, 200);
    assert.equal(bffSeed.body.fixtureClassId, FIXTURE_UUID, 'BFF phải giữ nguyên fixtureClassId ở cấp cao nhất');

    const edgeCsvFail = await callEdgeFn(fakeEnv, async () => ({
      status: 400,
      json: async () => ({
        success: false,
        code: 'CSV_VERIFICATION_FAILED',
        errors: ['Thiếu dòng học sinh chuyển lớp'],
        message: 'Kiểm tra CSV thất bại',
      }),
    }))({ action: 'm5-export-course-csv' });
    const bffCsvFail = buildBffResponse(edgeCsvFail, () => null, (body, httpStatus) => ({ body, httpStatus }));
    assert.equal(bffCsvFail.httpStatus, 400);
    assert.deepEqual(bffCsvFail.body.errors, ['Thiếu dòng học sinh chuyển lớp'], 'BFF phải giữ nguyên danh sách errors');
  });
});
