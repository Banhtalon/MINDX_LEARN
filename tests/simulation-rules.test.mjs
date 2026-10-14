import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePin,
  generate8DigitPin,
  checkPublishRule,
  calculateProgress,
  getBatchParticipants,
  generateCourseCloseCsvRows,
  buildCourseCloseCsvContent,
  TRIVIAL_PINS,
  COURSE_CLOSE_CSV_HEADER,
} from '../src/lib/simulation-rules.ts';

// Test Suite: Kiểm chứng các hàm thuần nghiệp vụ thực tế (Milestone 1 — MINDX LEARN)
// Nhập trực tiếp từ mã nguồn sản phẩm src/lib/simulation-rules.ts, không dùng helper giả lập.

test('Rule 1: Kiểm tra tính hợp lệ và tạo mã PIN 8 chữ số học sinh', () => {
  // 1. PIN hợp lệ: đúng 8 chữ số không nằm trong danh sách dễ đoán
  assert.equal(validatePin('88992211').valid, true);
  assert.equal(validatePin('10293847').valid, true);
  assert.equal(validatePin('58291043').valid, true);

  // 2. Không hợp lệ: ít hơn 8 chữ số
  const tooShort = validatePin('1234567');
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.message, /đúng 8 chữ số/);

  // 3. Không hợp lệ: nhiều hơn 8 chữ số
  const tooLong = validatePin('123456789');
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.message, /đúng 8 chữ số/);

  // 4. Không hợp lệ: chứa ký tự không phải chữ số
  const nonDigits = validatePin('1234abcd');
  assert.equal(nonDigits.valid, false);
  assert.match(nonDigits.message, /đúng 8 chữ số/);

  // 5. Không hợp lệ: các dãy số quá dễ đoán trong danh sách cấm
  for (const trivial of TRIVIAL_PINS) {
    const res = validatePin(trivial);
    assert.equal(res.valid, false, `Mã PIN ${trivial} phải bị từ chối vì quá dễ đoán`);
    assert.match(res.message, /dễ đoán/);
  }

  // 6. Hàm tạo PIN tự động generate8DigitPin() phải luôn sinh chuỗi 8 chữ số
  for (let i = 0; i < 20; i++) {
    const pin = generate8DigitPin();
    assert.match(pin, /^\d{8}$/, `PIN tạo ra "${pin}" phải gồm đúng 8 chữ số`);
    const num = Number(pin);
    assert.ok(num >= 10000000 && num <= 99999999, 'PIN phải nằm trong dải 8 chữ số');
  }
});

test('Rule 2: Chặn xuất bản bài học thiếu đánh giá (chỉ có lý thuyết)', () => {
  // 1. Xuất bản bài thiếu cả Quiz và Thực hành -> BẮT BUỘC BỊ CHẶN
  const blockedRes = checkPublishRule('published', false, false);
  assert.equal(blockedRes.allowed, false);
  assert.match(blockedRes.message, /Chặn xuất bản/);
  assert.match(blockedRes.message, /phải có Quiz, Thực hành hoặc cả hai/);

  // 2. Xuất bản bài chỉ có Quiz -> Cho phép
  const quizOnly = checkPublishRule('published', true, false);
  assert.equal(quizOnly.allowed, true);

  // 3. Xuất bản bài chỉ có Thực hành -> Cho phép
  const practiceOnly = checkPublishRule('published', false, true);
  assert.equal(practiceOnly.allowed, true);

  // 4. Xuất bản bài có cả Quiz và Thực hành -> Cho phép
  const bothAllowed = checkPublishRule('published', true, true);
  assert.equal(bothAllowed.allowed, true);

  // 5. Trạng thái Bản nháp (draft) chỉ có lý thuyết -> Cho phép lưu nháp
  const draftTheory = checkPublishRule('draft', false, false);
  assert.equal(draftTheory.allowed, true);
});

test('Rule 3: Tiến độ cố định mẫu số 14 buổi và công thức (X/14)*100%', () => {
  // 0 / 14 buổi -> 0%
  const p0 = calculateProgress(0, 14);
  assert.equal(p0.completedCount, 0);
  assert.equal(p0.total, 14);
  assert.equal(p0.percentage, 0);
  assert.equal(p0.text, 'Đã hoàn thành 0/14 buổi');

  // 7 / 14 buổi -> 50%
  const p7 = calculateProgress(7, 14);
  assert.equal(p7.completedCount, 7);
  assert.equal(p7.percentage, 50);
  assert.equal(p7.text, 'Đã hoàn thành 7/14 buổi');

  // 13 / 14 buổi -> 93% (chưa phải 100%, chỉ 14/14 mới là 100%)
  const p13 = calculateProgress(13, 14);
  assert.equal(p13.completedCount, 13);
  assert.equal(p13.percentage, 93);
  assert.notEqual(p13.percentage, 100);
  assert.equal(p13.text, 'Đã hoàn thành 13/14 buổi');

  // 14 / 14 buổi -> 100%
  const p14 = calculateProgress(14, 14);
  assert.equal(p14.completedCount, 14);
  assert.equal(p14.percentage, 100);
  assert.equal(p14.text, 'Đã hoàn thành 14/14 buổi');
});

test('Rule 4: Danh sách học sinh đợt học (CSV Roster) giữ học sinh đã chuyển lớp và đủ 14 buổi', () => {
  // Danh sách học sinh tổng thể
  const allStudents = [
    {
      id: 'stu_1',
      participantId: 'PART_001',
      studentCode: 'HS_001',
      fullName: 'Học sinh đang học',
      originalClassId: 'cls_rob_01',
      currentClassId: 'cls_rob_01',
      status: 'active',
    },
    {
      id: 'stu_2',
      participantId: 'PART_002',
      studentCode: 'HS_002',
      fullName: 'Học sinh đã chuyển sang lớp khác',
      originalClassId: 'cls_rob_01',
      currentClassId: 'cls_rob_02', // Đã chuyển lớp
      status: 'transferred',
    },
    {
      id: 'stu_3',
      participantId: 'PART_003',
      studentCode: 'HS_003',
      fullName: 'Học sinh chuyển từ lớp khác đến',
      originalClassId: 'cls_rob_03',
      currentClassId: 'cls_rob_01', // Chuyển đến lớp này
      status: 'active',
    },
    {
      id: 'stu_4',
      participantId: 'PART_004',
      studentCode: 'HS_004',
      fullName: 'Học sinh bị lưu trữ tài khoản',
      originalClassId: 'cls_rob_01',
      currentClassId: 'cls_rob_01',
      status: 'archived',
    },
    {
      id: 'stu_5',
      participantId: 'PART_005',
      studentCode: 'HS_005',
      fullName: 'Học sinh lớp khác hoàn toàn',
      originalClassId: 'cls_unrelated',
      currentClassId: 'cls_unrelated',
      status: 'active',
    },
  ];

  // 1. Kiểm tra getBatchParticipants phải lấy đủ cả học sinh đã chuyển lớp và lưu trữ
  const batchStudents = getBatchParticipants(allStudents, 'cls_rob_01');
  assert.equal(batchStudents.length, 4, 'Đợt học lớp cls_rob_01 phải có đúng 4 học sinh từng tham gia');
  assert.ok(batchStudents.some((s) => s.id === 'stu_2'), 'Phải bao gồm học sinh đã chuyển lớp (stu_2)');
  assert.ok(batchStudents.some((s) => s.id === 'stu_3'), 'Phải bao gồm học sinh chuyển từ nơi khác đến (stu_3)');
  assert.ok(batchStudents.some((s) => s.id === 'stu_4'), 'Phải bao gồm học sinh bị lưu trữ (stu_4)');
  assert.ok(!batchStudents.some((s) => s.id === 'stu_5'), 'Không được lấy học sinh không liên quan (stu_5)');

  // 2. Tạo 14 bài học cố định
  const lessons14 = Array.from({ length: 14 }, (_, idx) => ({
    id: `les_test_${idx + 1}`,
    sessionNumber: idx + 1,
    title: `Bài học Buổi ${idx + 1}`,
    hasQuiz: true,
    hasPractice: true,
  }));

  // 3. Kiểm tra tạo các dòng CSV
  const csvRows = generateCourseCloseCsvRows(batchStudents, lessons14, 'ROB-K14-01', [], []);

  // Tổng số dòng bắt buộc bằng: Số học sinh trong đợt x 14 buổi = 4 x 14 = 56 dòng
  const expectedRowCount = batchStudents.length * 14;
  assert.equal(csvRows.length, expectedRowCount);
  assert.equal(csvRows.length, 56);

  // Mỗi học sinh phải có chính xác 14 dòng
  batchStudents.forEach((student) => {
    const studentRows = csvRows.filter((r) => r.startsWith(`"${student.participantId}"`));
    assert.equal(studentRows.length, 14, `Học sinh ${student.participantId} phải có đúng 14 dòng`);
  });

  // Tệp CSV không được chứa mã PIN hay mật khẩu
  for (const row of csvRows) {
    assert.ok(!row.includes('pinHash'), 'CSV không được chứa trường pinHash');
    assert.ok(!row.includes('password'), 'CSV không được chứa mật khẩu');
  }

  // 4. Kiểm tra buildCourseCloseCsvContent
  const exportResult = buildCourseCloseCsvContent(batchStudents, lessons14, 'ROB-K14-01', [], []);
  assert.equal(exportResult.success, true);
  assert.equal(exportResult.rowCount, 56);
  assert.equal(exportResult.participantCount, 4);
  assert.ok(exportResult.csvContent.startsWith(COURSE_CLOSE_CSV_HEADER));
});
