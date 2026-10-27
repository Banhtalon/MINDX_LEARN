import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  normalizeClassCode,
  validateCanonicalM4SyntheticDiffReport,
  readAllTeachingDataTablesPages,
  createFixturePageFetcher,
  classifyAndDiffTeachingSnapshot,
  buildTeachingAggregatePreview,
  applyTeachingSyncDiffToState,
  runTeachingSnapshotPreview,
} from '../src/lib/teaching-sync-core.mjs';

import {
  TEACHING_ORIGIN,
  TEACHING_PATH,
  inspectTeachingDataTablesAllPages,
  renderTeachingPanel,
  inspectTeachingDom,
} from '../tools/teaching-readonly/reader-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT_DIR, 'public', 'fixtures', 'teaching_mock.json');

function loadMockFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function createInitialTestState() {
  return {
    classes: [
      {
        id: 'cls_rob_01',
        code: 'ROB-K14-01',
        name: 'Lớp Robotics K14 Chiều Thứ 7 (Cơ sở Hà Nội)',
        courseId: 'crs_rob_k14',
        teacherId: 'usr_tea_1',
        status: 'active',
        is14SessionsConfirmed: true,
      },
      {
        id: 'cls_rob_02',
        code: 'ROB-K14-02',
        name: 'Lớp Robotics K14 Sáng Chủ Nhật',
        courseId: 'crs_rob_k14',
        teacherId: 'usr_tea_1',
        status: 'active',
        is14SessionsConfirmed: false,
      },
      {
        id: 'cls_rob_03',
        code: 'ROB-K14-03',
        name: 'Lớp Robotics Mới (Chưa gán khóa học)',
        courseId: null,
        teacherId: null,
        status: 'active',
        is14SessionsConfirmed: false,
      },
    ],
    students: [
      {
        id: 'usr_stu_1',
        participantId: 'PART_ROB01_001',
        studentCode: 'HS_ROB_001',
        fullName: 'Lê Bảo Nam',
        currentClassId: 'cls_rob_01',
        originalClassId: 'cls_rob_01',
        pinHash: 'MOCK_HASH_PIN_88889999',
        hasPin: true,
        pinIssuedAt: '2026-09-02T10:00:00.000Z',
        status: 'active',
        notes: 'Học sinh năng nổ',
      },
      {
        id: 'usr_stu_2',
        participantId: 'PART_ROB01_002',
        studentCode: 'HS_ROB_002',
        fullName: 'Phạm Quỳnh Chi',
        currentClassId: 'cls_rob_01',
        originalClassId: 'cls_rob_01',
        pinHash: null,
        hasPin: false,
        pinIssuedAt: null,
        status: 'active',
        notes: 'Chờ cấp PIN lần đầu',
      },
      {
        id: 'usr_stu_3',
        participantId: 'PART_ROB01_003',
        studentCode: 'HS_ROB_003',
        fullName: 'Nguyễn Tiến Đạt (Đã chuyển lớp)',
        currentClassId: 'cls_rob_02',
        originalClassId: 'cls_rob_01',
        pinHash: 'MOCK_HASH_PIN_11223344',
        hasPin: true,
        pinIssuedAt: '2026-09-02T10:00:00.000Z',
        status: 'transferred',
        notes: 'Đã chuyển lớp',
      },
      {
        id: 'usr_stu_4',
        participantId: 'PART_ROB01_004',
        studentCode: 'HS_ROB_004',
        fullName: 'Vũ Minh Khôi (Đã lưu trữ)',
        currentClassId: 'cls_rob_01',
        originalClassId: 'cls_rob_01',
        pinHash: 'MOCK_HASH_PIN_55667788',
        hasPin: true,
        pinIssuedAt: '2026-09-02T10:00:00.000Z',
        status: 'archived',
        notes: 'Đã lưu trữ',
      },
    ],
    users: [
      {
        id: 'usr_stu_1',
        name: 'Lê Bảo Nam',
        studentCode: 'HS_ROB_001',
        role: 'student',
        status: 'active',
      },
      {
        id: 'usr_stu_2',
        name: 'Phạm Quỳnh Chi',
        studentCode: 'HS_ROB_002',
        role: 'student',
        status: 'active',
      },
    ],
    quizResults: [
      {
        studentId: 'usr_stu_1',
        lessonId: 'les_rob_01',
        highestScore: 100,
        attemptsCount: 2,
        passed: true,
        lastAttemptAt: '2026-09-05T14:30:00.000Z',
      },
    ],
    submissions: [
      {
        id: 'sub_003',
        studentId: 'usr_stu_2',
        lessonId: 'les_rob_01',
        type: 'link',
        content: 'https://scratch.mit.edu/projects/mock-002',
        status: 'needs_revision',
        submittedAt: '2026-09-07T14:00:00.000Z',
        canResubmit: true,
      },
    ],
  };
}

// -----------------------------------------------------------------------------
// 1. Reference HTML Integrity & Multi-Page Synthetic Fixture Verification
// -----------------------------------------------------------------------------
test('M4-1: Reference HTML is untouched and teaching_mock.json is a valid multi-page synthetic fixture without real PII', () => {
  const refHtmlPath = path.join(ROOT_DIR, 'teachingmindx-sync-trial.html');
  const refBuf = fs.readFileSync(refHtmlPath);
  const refSha256 = crypto.createHash('sha256').update(refBuf).digest('hex').toUpperCase();
  assert.equal(
    refSha256,
    'A2E61907BE0DEFD79D44AE56C2C854FDFA8DD4F26FB0B24DC18E64FE3EAACAA5',
    'teachingmindx-sync-trial.html must remain 100% unmodified'
  );

  const fixture = loadMockFixture();
  assert.equal(Array.isArray(fixture.pages), true, 'Fixture must contain pages array');
  assert.equal(fixture.pages.length, 3, 'Default fixture must span 3 pages (15 + 15 + 5)');
  assert.equal(fixture.pages[0].data.length, 15);
  assert.equal(fixture.pages[1].data.length, 15);
  assert.equal(fixture.pages[2].data.length, 5, 'Last page must test partial page count (5 rows)');

  // Verify all student IDs use synthetic prefixes HS_ROB_ / HS_WEB_ / HS_GAM_ / HS_PYT_ / HS_UIX_ / HS_DAT_
  for (const page of fixture.pages) {
    for (const row of page.data) {
      assert.match(
        row.id,
        /^HS_(ROB|WEB|GAM|PYT|UIX|DAT)_/,
        `Every fixture ID must be synthetic, got: ${row.id}`
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 2. Full Multi-Page Pagination & Dynamic Total Verification
// -----------------------------------------------------------------------------
test('M4-2: readAllTeachingDataTablesPages reads all pages sequentially until recordsFiltered and verifies last page', async () => {
  const fixture = loadMockFixture();
  const requests = [];
  const baseFetcher = createFixturePageFetcher(fixture);

  const res = await readAllTeachingDataTablesPages({
    pageLength: 15,
    fetchPage: async (params) => {
      requests.push(params);
      return baseFetcher(params);
    },
  });

  assert.equal(res.success, true);
  assert.equal(res.aborted, false);
  assert.equal(res.pagesRead, 3);
  assert.equal(res.recordsTotal, 35);
  assert.equal(res.recordsFiltered, 35);
  assert.equal(res.lastPageRowCount, 5);
  assert.equal(res.rows.length, 35);

  // Verify sequential start/length/draw parameters (never length=2000 or hardcoded 30 pages)
  assert.deepEqual(
    requests.map((r) => ({ draw: r.draw, start: r.start, length: r.length })),
    [
      { draw: 1, start: 0, length: 15 },
      { draw: 2, start: 15, length: 15 },
      { draw: 3, start: 30, length: 15 },
    ]
  );

  // Also test dynamic 5-page dataset (recordsFiltered = 64 -> 15 + 15 + 15 + 15 + 4)
  const totalDynamic = 64;
  const dynamicPages = [];
  for (let p = 0; p < 5; p++) {
    const start = p * 15;
    const count = Math.min(15, totalDynamic - start);
    const data = Array.from({ length: count }, (_, idx) => ({
      id: `HS_ROB_DYN_${start + idx + 1}`,
      student_name: `Học Sinh Động ${start + idx + 1}`,
      class_code: 'ROB-K14-01',
      status: 'Đang học',
      class_status: 'Running',
    }));
    dynamicPages.push({
      draw: p + 1,
      recordsTotal: totalDynamic,
      recordsFiltered: totalDynamic,
      data,
    });
  }

  const dynRes = await readAllTeachingDataTablesPages({
    pageLength: 15,
    fetchPage: createFixturePageFetcher({ pages: dynamicPages }),
  });
  assert.equal(dynRes.success, true);
  assert.equal(dynRes.pagesRead, 5);
  assert.equal(dynRes.lastPageRowCount, 4);
  assert.equal(dynRes.rows.length, 64);
});

// -----------------------------------------------------------------------------
// 3. Atomic Abort on Pagination, Session, Draw, Total, Duplicate/Missing ID & Structure Errors
// -----------------------------------------------------------------------------
test('M4-3: Atomic abort discards all partial rows on session expiry, total change, draw mismatch, last page mismatch, duplicate/missing ID, or malformed structure', async () => {
  const fixture = loadMockFixture();
  const scenarios = fixture.scenarios;

  const expectedAbortCases = [
    ['session_expired_mid_pagination', 'SESSION_EXPIRED', 2],
    ['total_changed_between_pages', 'TOTAL_CHANGED_BETWEEN_PAGES', 2],
    ['draw_mismatch', 'DRAW_MISMATCH', 1],
    ['last_page_mismatch', 'LAST_PAGE_ROW_COUNT_MISMATCH', 2],
    ['duplicate_id_across_pages', 'DUPLICATE_STUDENT_ID', 1],
    ['missing_id_on_page', 'MISSING_STUDENT_ID', 1],
    ['malformed_structure', 'MALFORMED_ROW_STRUCTURE', 1],
  ];

  for (const [scenarioName, expectedCode, expectedFailedPage] of expectedAbortCases) {
    const scenarioFixture = scenarios[scenarioName];
    assert.ok(scenarioFixture, `Scenario ${scenarioName} must exist in teaching_mock.json`);

    const res = await runTeachingSnapshotPreview(scenarioFixture, createInitialTestState());
    assert.equal(res.success, false, `${scenarioName} must fail`);
    assert.equal(res.aborted, true, `${scenarioName} must set aborted=true`);
    assert.equal(res.partialApplied, false, `${scenarioName} must set partialApplied=false`);
    assert.equal(res.code, expectedCode, `${scenarioName} must return code ${expectedCode}`);
    assert.equal(res.failedAtPage, expectedFailedPage, `${scenarioName} must fail at page ${expectedFailedPage}`);
    assert.equal(res.report, null, `${scenarioName} must not produce a partial diff report`);

    // Ensure error message never leaks student names or IDs
    assert.equal(res.message.includes('Học Sinh Giả T01'), false, 'Error message must not leak student names');
    assert.equal(res.message.includes('HS_ROB_T01'), false, 'Error message must not leak student IDs');
  }

  // Also test unexpected source filter (recordsTotal !== recordsFiltered)
  const filteredRes = await readAllTeachingDataTablesPages({
    fetchPage: createFixturePageFetcher({
      pages: [
        {
          draw: 1,
          recordsTotal: 50,
          recordsFiltered: 10,
          data: [],
        },
      ],
    }),
  });
  assert.equal(filteredRes.success, false);
  assert.equal(filteredRes.code, 'UNEXPECTED_SOURCE_FILTER');
  assert.equal(filteredRes.rows.length, 0);

  // Also test CORS / SOP blocked error
  const corsRes = await readAllTeachingDataTablesPages({
    fetchPage: createFixturePageFetcher({
      pages: [{ __simulateCorsBlocked: true }],
    }),
  });
  assert.equal(corsRes.success, false);
  assert.equal(corsRes.code, 'CORS_OR_SOP_BLOCKED');
  assert.equal(corsRes.partialApplied, false);
});

// -----------------------------------------------------------------------------
// 4. Identity Verification: Class Change & Same-Name-Different-ID Never Auto-Merge
// -----------------------------------------------------------------------------
test('M4-4: Identity conflicts (same ID changing class, same name with different/changed ID) are held in needsReview without merging by name', async () => {
  const fixture = loadMockFixture();
  const state = createInitialTestState();

  const res = await runTeachingSnapshotPreview(
    fixture.scenarios.class_transfer_id_check,
    state,
    { allowConfirmedClassChange: false }
  );

  assert.equal(res.success, true);
  assert.ok(res.report);

  // 1. HS_ROB_001 changed class from ROB-K14-01 to ROB-K14-02 -> held in needsReview
  const classChangeItem = res.report.needsReview.find((i) => i.id === 'HS_ROB_001');
  assert.ok(classChangeItem, 'HS_ROB_001 class change must be held in needsReview');
  assert.equal(classChangeItem.reasonCode, 'CLASS_CHANGE_NEEDS_REVIEW');

  // 2. HS_ROB_NEW_002 has same name "Phạm Quỳnh Chi" as existing HS_ROB_002 -> held in needsReview, NOT merged or added
  const sameNameItem = res.report.needsReview.find((i) => i.id === 'HS_ROB_NEW_002');
  assert.ok(sameNameItem, 'HS_ROB_NEW_002 with same name as HS_ROB_002 must be held in needsReview');
  assert.equal(sameNameItem.reasonCode, 'SAME_NAME_DIFFERENT_ID_OR_ID_CHANGED');
  assert.equal(
    res.report.added.some((i) => i.id === 'HS_ROB_NEW_002'),
    false,
    'Must NOT add same-name-different-ID student without Admin review'
  );
  assert.equal(
    res.report.updated.some((i) => i.name.includes('Phạm Quỳnh Chi')),
    false,
    'Must NEVER merge by student name'
  );

  // 3. Only the unambiguous new student HS_ROB_M4_101 is in added
  assert.equal(res.report.added.length, 1);
  assert.equal(res.report.added[0].id, 'HS_ROB_M4_101');
});

// -----------------------------------------------------------------------------
// 5. ROB Filter, Status Mapping, Apply, Idempotency & Data Safety Invariants
// -----------------------------------------------------------------------------
test('M4-5: Full 3-page fixture diff, apply, idempotency on re-run, and preservation of PINs/grades/archived/absent rows', async () => {
  const fixture = loadMockFixture();
  const initialState = createInitialTestState();

  // Step 1: Preview 3-page fixture against initial TEST state
  const preview1 = await runTeachingSnapshotPreview(fixture, initialState);
  assert.equal(preview1.success, true);
  const report1 = preview1.report;
  assert.ok(report1);

  assert.equal(report1.pagination.pagesRead, 3);
  assert.equal(report1.pagination.recordsTotal, 35);
  assert.equal(report1.pagination.recordsFiltered, 35);
  assert.equal(report1.pagination.lastPageRowCount, 5);

  // Check exact category counts on 1st run:
  // - 8 added (HS_ROB_M4_101..108, including lowercase 'rob-k14-01' and new class 'ROB-K14-M4-04')
  // - 1 updated (HS_ROB_002 name updated)
  // - 1 unchanged (HS_ROB_001)
  // - 6 needsReview (HS_ROB_004 archived, HS_ROB_M4_901 same name as Lê Bảo Nam, HS_ROB_M4_902 & 903 same name in snapshot, HS_ROB_M4_904 & 905 unknown status)
  // - 19 ignored (12 non-ROB + 4 inactive student status + 3 inactive class status)
  // - 1 absentPreserved (HS_ROB_003 is absent from the 35 rows and must be preserved)
  assert.equal(report1.counts.addedCount, 8);
  assert.equal(report1.counts.updatedCount, 1);
  assert.equal(report1.counts.unchangedCount, 1);
  assert.equal(report1.counts.needsReviewCount, 6);
  assert.equal(report1.counts.ignoredCount, 19);
  assert.equal(report1.counts.absentPreservedCount, 1);
  assert.equal(report1.counts.newClassesCount, 1);
  assert.equal(report1.newClassesToCreate[0].code, 'ROB-K14-M4-04');
  assert.equal(report1.newClassesToCreate[0].courseId, null, 'New class must wait for Admin to assign course');

  // Step 2: Apply diffReport to TEST state
  const apply1 = applyTeachingSyncDiffToState(initialState, report1);
  assert.equal(apply1.success, true);
  assert.equal(apply1.addedStudentsCount, 8);
  assert.equal(apply1.updatedStudentsCount, 1);
  assert.equal(apply1.createdClassesCount, 1);
  assert.equal(apply1.pinsAutoIssued, 0, 'Sync must NEVER auto-issue PINs');
  assert.equal(apply1.csvGenerated, false, 'Sync must NEVER generate PIN CSVs');
  assert.equal(apply1.deletedAbsentCount, 0, 'Sync must NEVER delete absent students');

  const nextState = apply1.state;
  assert.equal(nextState.classes.length, 4); // 3 initial + 1 new class ROB-K14-M4-04
  assert.equal(nextState.students.length, 12); // 4 initial + 8 added

  // Verify unrelated source fields did NOT overwrite HS_ROB_001's PIN or quiz score
  const stu001 = nextState.students.find((s) => s.studentCode === 'HS_ROB_001');
  assert.equal(stu001.pinHash, 'MOCK_HASH_PIN_88889999');
  assert.equal(nextState.quizResults[0].highestScore, 100);

  // Verify HS_ROB_002's name was updated while preserving submission and participantId
  const stu002 = nextState.students.find((s) => s.studentCode === 'HS_ROB_002');
  assert.equal(stu002.fullName, 'Phạm Quỳnh Chi (Đồng bộ M4)');
  assert.equal(stu002.participantId, 'PART_ROB01_002');
  assert.equal(stu002.hasPin, false);
  assert.equal(nextState.submissions[0].id, 'sub_003');

  // Verify absent student HS_ROB_003 is still present and untouched
  const stu003 = nextState.students.find((s) => s.studentCode === 'HS_ROB_003');
  assert.ok(stu003, 'Absent student HS_ROB_003 must not be deleted');
  assert.equal(stu003.status, 'transferred');

  // Verify archived student HS_ROB_004 was NOT auto-reopened
  const stu004 = nextState.students.find((s) => s.studentCode === 'HS_ROB_004');
  assert.equal(stu004.status, 'archived', 'Archived student must never be auto-reopened by sync');

  // Verify newly added students have pinHash: null and hasPin: false
  const stu101 = nextState.students.find((s) => s.studentCode === 'HS_ROB_M4_101');
  assert.ok(stu101);
  assert.equal(stu101.pinHash, null);
  assert.equal(stu101.hasPin, false);
  assert.equal(stu101.pinIssuedAt, null);

  // Step 3: IDEMPOTENCY CHECK — Re-run preview and apply on the exact same snapshot
  const preview2 = await runTeachingSnapshotPreview(fixture, nextState);
  assert.equal(preview2.success, true);
  const report2 = preview2.report;
  assert.ok(report2);

  assert.equal(report2.counts.addedCount, 0, '2nd run must have 0 added');
  assert.equal(report2.counts.updatedCount, 0, '2nd run must have 0 updated');
  assert.equal(report2.counts.newClassesCount, 0, '2nd run must have 0 new classes');
  assert.equal(report2.counts.unchangedCount, 10, 'All 10 valid active ROB students must now be unchanged');

  const apply2 = applyTeachingSyncDiffToState(nextState, report2);
  assert.equal(apply2.success, true);
  assert.equal(apply2.addedStudentsCount, 0);
  assert.equal(apply2.updatedStudentsCount, 0);
  assert.equal(apply2.createdClassesCount, 0);
  assert.equal(apply2.state.students.length, 12, 'Re-applying must not create duplicate students');
  assert.equal(apply2.state.classes.length, 4, 'Re-applying must not create duplicate classes');
});

// -----------------------------------------------------------------------------
// 6. Real Teaching Roster Protection & Aggregate-Only Preview (Zero PII Leakage)
// -----------------------------------------------------------------------------
test('M4-6: Real Teaching preview returns aggregate numbers ONLY (zero PII) and blocks applying real roster in Mốc 4', async () => {
  const fixture = loadMockFixture();
  const state = createInitialTestState();

  // 1. Real Teaching preview mode must return report=null and aggregatePreview with numbers only
  const realPreview = await runTeachingSnapshotPreview(fixture, state, {
    sourceMode: 'real_teaching_preview',
  });
  assert.equal(realPreview.success, true);
  assert.equal(realPreview.report, null, 'Real preview mode must NEVER return individual student diff report');
  assert.ok(realPreview.aggregatePreview);
  assert.equal(realPreview.aggregatePreview.pagesRead, 3);
  assert.equal(realPreview.aggregatePreview.recordsTotal, 35);
  assert.equal(realPreview.aggregatePreview.recordsFiltered, 35);
  assert.equal(realPreview.aggregatePreview.lastPageRowCount, 5);
  assert.equal(realPreview.aggregatePreview.uniqueIdCount, 35);
  assert.equal(realPreview.aggregatePreview.robClassRowCount, 23);
  assert.equal(realPreview.aggregatePreview.nonRobClassRowCount, 12);
  assert.equal(realPreview.aggregatePreview.piiStoredOrSent, false);
  assert.equal(realPreview.aggregatePreview.realApplyAllowedInM4, false);

  const serializedAgg = JSON.stringify(realPreview.aggregatePreview);
  assert.equal(serializedAgg.includes('Lê Bảo Nam'), false, 'Aggregate preview must not contain student names');
  assert.equal(serializedAgg.includes('HS_ROB_001'), false, 'Aggregate preview must not contain student IDs');
  assert.equal(serializedAgg.includes('ROB-K14-01'), false, 'Aggregate preview must not contain class codes');

  // 2. Attempting to apply a report marked with sourceMode='real_teaching_preview' must be blocked
  const blockedApply = applyTeachingSyncDiffToState(state, {
    sourceMode: 'real_teaching_preview',
    added: [{ id: 'REAL_001', name: 'Real Student', classCode: 'ROB-K14-01' }],
  });
  assert.equal(blockedApply.success, false);
  assert.equal(blockedApply.code, 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4');
  assert.equal(blockedApply.state.students.length, state.students.length);

  // 3. Test Bookmarklet M4 `inspectTeachingDataTablesAllPages` in JSDOM
  const dom = new JSDOM('<!DOCTYPE html><html><body><table><thead><tr><th>STT</th><th>Tên học sinh</th><th>Mã lớp</th><th>Trạng thái học sinh</th><th>GV chính</th><th>Trợ giảng</th><th>Trạng thái lớp</th><th>Thao tác</th></tr></thead><tbody><tr><td>1</td><td>A</td><td>ROB-01</td><td>Đang học</td><td>GV</td><td>TG</td><td>Running</td><td>Xem</td></tr></tbody></table></body></html>');
  const loc = { origin: TEACHING_ORIGIN, pathname: TEACHING_PATH };

  const bookmarkletM4Res = await inspectTeachingDataTablesAllPages(dom.window.document, loc, {
    pageLength: 15,
    fetchPage: createFixturePageFetcher(fixture),
  });
  assert.equal(bookmarkletM4Res.success, true);
  assert.equal(bookmarkletM4Res.pagesRead, 3);
  assert.equal(bookmarkletM4Res.recordsFiltered, 35);
  assert.equal(bookmarkletM4Res.uniqueIdCount, 35);
  assert.equal(JSON.stringify(bookmarkletM4Res).includes('Lê Bảo Nam'), false);
  assert.equal(JSON.stringify(bookmarkletM4Res).includes('HS_ROB_001'), false);

  // Verify panel renders M4 button without breaking M1 close button
  const m1Res = inspectTeachingDom(dom.window.document, loc);
  const panel = renderTeachingPanel(dom.window.document, m1Res, loc);
  const firstBtn = panel.querySelector('button');
  assert.ok(firstBtn.textContent.includes('Đóng'), 'First button in panel must remain the Close button');
  const m4Btn = panel.querySelector('#teaching-m4-run-pagination-btn');
  assert.ok(m4Btn, 'Panel must include the Mốc 4 pagination preview button');
  dom.window.close();
});

// -----------------------------------------------------------------------------
// 7. Regression Tests for Reviewer Findings (Max Pages Cap, Malformed ID Type, Lossless IDs)
// -----------------------------------------------------------------------------
test('M4-7: Bookmarklet aborts on MAX_PAGES_EXCEEDED (7501 rows) and both readers reject non-primitive row.id', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const loc = { origin: TEACHING_ORIGIN, pathname: TEACHING_PATH };

  // 1. 7501 rows with default 500-page cap (15 * 500 = 7500 < 7501) must abort with MAX_PAGES_EXCEEDED
  const total = 7501;
  const cappedRes = await inspectTeachingDataTablesAllPages(dom.window.document, loc, {
    fetchPage: async ({ draw, start, length }) => ({
      ok: true,
      payload: {
        draw,
        recordsTotal: total,
        recordsFiltered: total,
        data: Array.from({ length: Math.min(length, total - start) }, (_, i) => ({
          id: `HS_ROB_FAKE_${start + i}`,
          student_name: `Fake Student ${start + i}`,
          class_code: 'ROB-FAKE',
          status: 'Đang học',
          class_status: 'Running',
        })),
      },
    }),
  });
  assert.equal(cappedRes.success, false, 'Must abort when hitting maxPages before reading all recordsFiltered');
  assert.equal(cappedRes.aborted, true);
  assert.equal(cappedRes.partialApplied, false);
  assert.equal(cappedRes.code, 'MAX_PAGES_EXCEEDED');
  assert.equal(cappedRes.totalRowsVerified, 0);

  // 2. Non-primitive row.id ({ unexpected: 'schema' }, ['arr'], true) must abort with MALFORMED_ROW_STRUCTURE
  for (const badId of [{ unexpected: 'schema' }, ['HS_1'], true, NaN]) {
    const badPage = {
      pages: [
        {
          draw: 1,
          recordsTotal: 1,
          recordsFiltered: 1,
          data: [
            {
              id: badId,
              student_name: 'Học Sinh Giả',
              class_code: 'ROB-K14-01',
              status: 'Đang học',
              class_status: 'Running',
            },
          ],
        },
      ],
    };
    const r1 = await readAllTeachingDataTablesPages({
      fetchPage: createFixturePageFetcher(badPage),
    });
    assert.equal(r1.success, false);
    assert.equal(r1.code, 'MALFORMED_ROW_STRUCTURE');

    const r2 = await inspectTeachingDataTablesAllPages(dom.window.document, loc, {
      fetchPage: createFixturePageFetcher(badPage),
    });
    assert.equal(r2.success, false);
    assert.equal(r2.code, 'MALFORMED_ROW_STRUCTURE');
  }

  dom.window.close();
});

test('M4-8: Lossless deterministic IDs prevent punctuation collisions and abort on internal ID collision', async () => {
  const state = createInitialTestState();
  const punctuationFixture = {
    pages: [
      {
        draw: 1,
        recordsTotal: 2,
        recordsFiltered: 2,
        data: [
          {
            id: 'HS-ROB-PUNC-01',
            student_name: 'Học Sinh Dấu Gạch Ngang',
            class_code: 'ROB-K14-01',
            status: 'Đang học',
            class_status: 'Running',
          },
          {
            id: 'HS_ROB_PUNC_01',
            student_name: 'Học Sinh Dấu Gạch Dưới',
            class_code: 'ROB-K14-01',
            status: 'Đang học',
            class_status: 'Running',
          },
        ],
      },
    ],
  };

  const preview = await runTeachingSnapshotPreview(punctuationFixture, state);
  assert.equal(preview.success, true);
  assert.equal(preview.report.added.length, 2);

  const applied = applyTeachingSyncDiffToState(state, preview.report);
  assert.equal(applied.success, true);
  assert.equal(applied.addedStudentsCount, 2);

  const sDash = applied.state.students.find((s) => s.studentCode === 'HS-ROB-PUNC-01');
  const sUnder = applied.state.students.find((s) => s.studentCode === 'HS_ROB_PUNC_01');
  assert.ok(sDash && sUnder);
  assert.notEqual(sDash.id, sUnder.id, 'Distinct student codes must never collide on internal student.id');
  assert.notEqual(
    sDash.participantId,
    sUnder.participantId,
    'Distinct student codes must never collide on participantId'
  );
});

test('M4-9: Live StoreProvider applyTeachingSync writes to server, fails closed on server error, and survives remount', async () => {
  const ts = await import('typescript');
  const ReactMod = await import('react');
  const React = ReactMod.default || ReactMod;
  const { act } = ReactMod;
  const { createRoot } = await import('react-dom/client');

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const uri = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  const transpile = (f) =>
    ts.default.transpileModule(fs.readFileSync(path.join(ROOT_DIR, f), 'utf8'), {
      compilerOptions: {
        module: ts.default.ModuleKind.ESNext,
        target: ts.default.ScriptTarget.ES2022,
        jsx: ts.default.JsxEmit.ReactJSX,
      },
    }).outputText;

  const mockUri = uri(transpile('src/lib/mock-data.ts'));
  const mocks = await import(mockUri);
  let storeCode = transpile('src/lib/store.tsx');
  for (const spec of ['react', 'react/jsx-runtime']) {
    storeCode = storeCode
      .replaceAll(`from '${spec}'`, `from '${import.meta.resolve(spec)}'`)
      .replaceAll(`from "${spec}"`, `from "${import.meta.resolve(spec)}"`);
  }
  const simRulesHref = new URL('../src/lib/simulation-rules.ts', import.meta.url).href;
  storeCode = storeCode
    .replace("from './mock-data'", `from '${mockUri}'`)
    .replace("from './simulation-rules'", `from '${simRulesHref}'`);

  const store = await import(uri(storeCode));
  const fixture = loadMockFixture();
  const admin = mocks.initialUsers[0];
  const snapshot = {
    currentUser: admin,
    classes: structuredClone(mocks.initialClasses),
    students: structuredClone(mocks.initialStudents),
    users: structuredClone(mocks.initialUsers),
    courses: structuredClone(mocks.initialCourses),
    lessons: structuredClone(mocks.initialLessons),
    quizResults: structuredClone(mocks.initialQuizResults),
    submissions: structuredClone(mocks.initialSubmissions),
  };

  let shouldFailServerWrite = false;
  let activeActorMode = 'admin';
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET' });
    if (url === '/api/m2/apply-teaching-sync') {
      if (shouldFailServerWrite) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, code: 'DB_ERROR', message: 'Máy chủ từ chối lưu.' }),
        };
      }
      const reqBody = opts.body ? JSON.parse(opts.body) : {};
      const applied = applyTeachingSyncDiffToState(snapshot, reqBody.diffReport);
      snapshot.classes = applied.state.classes;
      snapshot.students = applied.state.students;
      snapshot.users = applied.state.users;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            addedStudentsCount: applied.addedStudentsCount,
            updatedStudentsCount: applied.updatedStudentsCount,
            createdClassesCount: applied.createdClassesCount,
          },
          message: applied.message,
        }),
      };
    }
    if (url === '/api/m2/session') {
      return {
        ok: true,
        json: async () => ({
          success: true,
          user: activeActorMode === 'teacher' ? mocks.initialUsers[2] : admin,
        }),
      };
    }
    if (activeActorMode === 'teacher') {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            currentUser: mocks.initialUsers[2],
            users: [mocks.initialUsers[2]],
            classes: [],
            students: [],
            courses: [],
            lessons: [],
            quizResults: [],
            submissions: [],
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ success: true, data: structuredClone(snapshot) }),
    };
  };
  process.env.NEXT_PUBLIC_MINDX_DEMO = '0';

  let api;
  function Capture() {
    api = store.useStore();
    return null;
  }

  let root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(store.StoreProvider, null, React.createElement(Capture)));
  });

  let preview;
  await act(async () => {
    preview = await api.previewTeachingSync(fixture);
  });

  // 1. Test server failure -> fails closed, 0 students added
  shouldFailServerWrite = true;
  let failedApply;
  await act(async () => {
    failedApply = await api.applyTeachingSync(preview.report);
  });
  assert.equal(failedApply.success, false, 'Must fail when server write fails');
  assert.equal(api.students.length, 5, 'Students count must remain 5 when server write fails');

  // 2. Test server success -> writes to server and persists across remount on a fresh browser window
  shouldFailServerWrite = false;
  const writesBefore = calls.filter((c) => c.method !== 'GET').length;
  let applied;
  await act(async () => {
    applied = await api.applyTeachingSync(preview.report);
  });
  const writesAfter = calls.filter((c) => c.method !== 'GET').length;
  assert.equal(applied.success, true);
  assert.ok(writesAfter - writesBefore >= 1, 'Must send POST write request to server');
  assert.equal(api.students.length, 13, '8 added students must be present (5 + 8 = 13)');

  // 3. Subsequent server edit must NOT be overwritten by stale client sync diff on refreshData()
  const hs002OnServer = snapshot.students.find((s) => s.studentCode === 'HS_ROB_002');
  hs002OnServer.fullName = 'Phạm Quỳnh Chi (Sửa sau đồng bộ)';
  await act(async () => {
    await api.refreshData();
  });
  assert.equal(
    api.students.find((s) => s.studentCode === 'HS_ROB_002')?.fullName,
    'Phạm Quỳnh Chi (Sửa sau đồng bộ)',
    'refreshData must reflect latest server state without re-applying stale browser sync diffs'
  );

  // 4. Role isolation: Teacher with 0 authorized classes on server must see 0 classes and 0 students
  activeActorMode = 'teacher';
  await act(async () => {
    await api.refreshData();
  });
  assert.equal(api.classes.length, 0, 'Unassigned teacher must see 0 classes');
  assert.equal(api.students.length, 0, 'Unassigned teacher must see 0 students');

  // 5. Remount as Admin in a brand-new JSDOM window (zero localStorage) -> still sees 13 students from server
  activeActorMode = 'admin';
  await act(async () => {
    root.unmount();
  });
  dom.window.close();

  const freshDom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  globalThis.window = freshDom.window;
  globalThis.document = freshDom.window.document;
  root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(store.StoreProvider, null, React.createElement(Capture)));
  });
  assert.equal(api.students.length, 13, 'All 13 students must survive StoreProvider remount in fresh window');

  await act(async () => {
    root.unmount();
  });
  freshDom.window.close();
});

test('M4-10: UI-08 separates fixture vs real tab state and discards out-of-order overlapping preview responses', async () => {
  const ts = await import('typescript');
  const ReactMod = await import('react');
  const React = ReactMod.default || ReactMod;
  const { act } = ReactMod;
  const { createRoot } = await import('react-dom/client');
  const engine = await import('../src/lib/simulation-rules.ts');

  const uri = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  const tr = (f) =>
    ts.default.transpileModule(fs.readFileSync(path.join(ROOT_DIR, f), 'utf8'), {
      compilerOptions: {
        module: ts.default.ModuleKind.ESNext,
        target: ts.default.ScriptTarget.ES2022,
        jsx: ts.default.JsxEmit.ReactJSX,
      },
    }).outputText;

  const mocks = await import(uri(tr('src/lib/mock-data.ts')));
  let code = tr('src/app/admin/sync/page.tsx');
  for (const spec of ['react', 'react/jsx-runtime']) {
    code = code
      .replaceAll(`from '${spec}'`, `from '${import.meta.resolve(spec)}'`)
      .replaceAll(`from "${spec}"`, `from "${import.meta.resolve(spec)}"`);
  }
  code = code.replace(
    /import\s*\{\s*useRouter\s*\}\s*from\s*['"]next\/navigation['"];?/,
    'const useRouter=()=>({push(){}});'
  );
  code = code.replace(
    /import\s*\{\s*useStore\s*\}\s*from\s*['"]@\/lib\/store['"];?/,
    'const useStore=()=>globalThis.__m4Store;'
  );
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/icons['"];?/,
    (_, names) =>
      names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => 'const ' + n + '=()=>null;')
        .join('\n')
  );

  const { default: Page } = await import(uri(code));
  const fixture = loadMockFixture();
  const state = { classes: mocks.initialClasses, students: mocks.initialStudents };
  globalThis.__m4Store = {
    currentUser: mocks.initialUsers[0],
    ...state,
    previewTeachingSync: (data, opts) => engine.runTeachingSnapshotPreview(data, state, opts),
    applyTeachingSync: async () => ({ success: true, message: 'applied' }),
    resetTeachingFixtureSync: async () => ({ success: true, message: 'reset' }),
  };

  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const pending = [];
  globalThis.fetch = () =>
    new Promise((resolve) =>
      pending.push(() => resolve({ ok: true, json: async () => fixture }))
    );

  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(Page));
  });

  const btn = (pattern) =>
    Array.from(document.querySelectorAll('button')).find((b) => pattern.test(b.textContent));

  // 1. Read fixture on Tab 1, then switch to Tab 2 -> Tab 2 must NOT auto-display 35/35 report
  await act(async () => {
    btn(/^Đọc toàn bộ/).click();
  });
  await act(async () => {
    pending[0]();
  });
  await act(async () => {
    btn(/^2\. Nguồn/).click();
  });
  assert.equal(
    document.body.textContent.includes('35 / 35'),
    false,
    'Tab 2 must not display fixture 35/35 aggregate report before user clicks sample button on Tab 2'
  );

  // 1b. Clicking origin check button on Tab 2 must make 0 network calls and report "Khác nguồn — chưa thử kết nối trực tiếp" (never falsely claiming CORS_OR_SOP_BLOCKED without a probe)
  const fetchesBeforeOriginCheck = pending.length;
  await act(async () => {
    btn(/Kiểm tra nguồn hiện tại/).click();
  });
  assert.equal(pending.length, fetchesBeforeOriginCheck, 'Origin check button must make 0 network calls');
  assert.equal(
    document.body.textContent.includes('Khác nguồn — chưa thử kết nối trực tiếp'),
    true,
    'Must clearly report different origin without claiming CORS blocked a connection that was never attempted'
  );
  assert.equal(
    document.body.textContent.includes('CORS_OR_SOP_BLOCKED'),
    false,
    'Must not claim CORS_OR_SOP_BLOCKED when 0 network requests were made'
  );

  // 2. Switch back to Tab 1 and trigger two overlapping previews that resolve out of order
  await act(async () => {
    btn(/^1\. Nguồn/).click();
  });
  await act(async () => {
    btn(/^Đọc toàn bộ/).click();
  });
  await act(async () => {
    btn(/Mất phiên/).click();
  });
  // Resolve 2nd request (abort) first, then 1st request (valid) second
  await act(async () => {
    pending[2]();
  });
  await act(async () => {
    pending[1]();
  });

  assert.equal(
    document.body.textContent.includes('HỦY TOÀN BỘ LƯỢT ĐỌC'),
    true,
    'Latest request abort banner must remain visible'
  );
  assert.equal(
    Boolean(btn(/Xác nhận Áp dụng Fixture/)),
    false,
    'Stale response from superseded request must not restore Apply button'
  );

  // 3. R11-F1 regression: Selecting "Loại trừ ROB" on Tab 1 and then opening Sample Aggregate Preview on Tab 2
  // must still count 14 ROB students under "Hợp lệ (ROB + Đang học + Running)" (never 12 non-ROB students)
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  const excludeRadio = radios[1];
  assert.ok(excludeRadio, 'Must find exclude_rob radio on Tab 1');
  await act(async () => {
    excludeRadio.click();
  });
  // Resolve the re-triggered Tab 1 preview if queued
  while (pending.length > 3) {
    const fn = pending.pop();
    await act(async () => {
      fn();
    });
  }
  await act(async () => {
    btn(/^2\. Nguồn/).click();
  });
  await act(async () => {
    btn(/Xem mẫu Báo cáo Tổng hợp/).click();
  });
  await act(async () => {
    pending[pending.length - 1]();
  });
  assert.equal(
    document.body.textContent.includes('Hợp lệ (ROB + Đang học + Running)'),
    true,
    'Tab 2 sample aggregate report must show ROB eligible label'
  );
  assert.equal(
    document.body.textContent.includes('14 học sinh'),
    true,
    'Tab 2 sample aggregate report must always report 14 eligible ROB students even when Tab 1 is set to exclude_rob'
  );
  assert.equal(
    document.body.textContent.includes('12 học sinh'),
    false,
    'Tab 2 sample aggregate report must never mislabel 12 non-ROB students as ROB'
  );

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});

test('M4-11: Atomic m4_apply_teaching_sync & m4_reset_teaching_sync block stale preview overwrites, roll back 100% on mid-transaction faults, and preserve Admin-created classes', async () => {
  const ts = await import('typescript');

  // 1. Verify BFF route preserves previousName and previousClassCode in updated payload
  const bffRouteSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/app/api/m2/[action]/route.ts'),
    'utf8'
  );
  assert.match(
    bffRouteSrc,
    /previousName:\s*typeof\s+u\?\.previousName\s*===\s*'string'/,
    'BFF route must forward previousName on updated items'
  );
  assert.match(
    bffRouteSrc,
    /previousClassCode:\s*typeof\s+u\?\.previousClassCode\s*===\s*'string'/,
    'BFF route must forward previousClassCode on updated items'
  );

  // 2. Verify SQL migration defines m4_synced markers and atomic SECURITY DEFINER RPCs
  const sql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase/migrations/20261020140000_m4_teaching_sync.sql'),
    'utf8'
  );
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS m4_synced BOOLEAN NOT NULL DEFAULT false'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m4_apply_teaching_sync'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m4_reset_teaching_sync'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m4_ack_storage_cleanup'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m4_update_student'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m3_check_storage_insert_permission'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m3_reserve_practice_upload'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m3_release_upload_reservation'));
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.m3_cleanup_stale_reservations'));
  assert.ok(sql.includes("IF public.current_role() IS DISTINCT FROM 'student'"));
  assert.ok(sql.includes('IF v_student_id IS DISTINCT FROM public.current_profile_id()'));
  assert.ok(sql.includes('OR public.current_profile_id() IS DISTINCT FROM p_student_id'));
  assert.equal(
    sql.includes('public.current_role() <>') ||
      sql.includes('public.current_profile_id() <>') ||
      sql.includes('<> public.current_profile_id()'),
    false,
    'R12-F1: M4 SQL must never compare current_role() or current_profile_id() with non-null-safe <>'
  );
  assert.ok(sql.includes('FOR KEY SHARE OF s'));
  assert.ok(sql.includes("PERFORM pg_advisory_xact_lock(hashtext('m4_teaching_sync'))"));
  assert.ok(sql.includes('STALE_PREVIEW_CONFLICT'));
  assert.ok(sql.includes('WHERE c.m4_synced = true'));

  // 3. Verify applyTeachingSyncDiffToState rejects stale preview when name changed after preview
  const baseState = createInitialTestState();
  const fixture = loadMockFixture();
  const preview = await runTeachingSnapshotPreview(fixture, baseState);
  assert.equal(preview.success, true);
  assert.equal(preview.report.updated[0].id, 'HS_ROB_002');
  assert.equal(preview.report.updated[0].previousName, 'Phạm Quỳnh Chi');

  const concurrentlyEditedState = structuredClone(baseState);
  concurrentlyEditedState.students.find((s) => s.studentCode === 'HS_ROB_002').fullName =
    'Phạm Quỳnh Chi (Admin vừa sửa mới)';
  concurrentlyEditedState.users.find((u) => u.studentCode === 'HS_ROB_002').name =
    'Phạm Quỳnh Chi (Admin vừa sửa mới)';

  const staleEngineRes = applyTeachingSyncDiffToState(concurrentlyEditedState, preview.report);
  assert.equal(staleEngineRes.success, false, 'Must reject stale preview when student name changed');
  assert.equal(staleEngineRes.code, 'STALE_PREVIEW_CONFLICT');
  assert.equal(
    staleEngineRes.state.students.find((s) => s.studentCode === 'HS_ROB_002').fullName,
    'Phạm Quỳnh Chi (Admin vừa sửa mới)',
    'Newer name on state must never be overwritten by stale preview'
  );

  // 4. Transpile and test Edge handler + transactional RPC execution
  let handler = null;
  globalThis.Deno = {
    env: {
      get: (k) =>
        ({
          SUPABASE_URL: 'https://eythjapspkoyqdxlxtcd.supabase.co',
          SUPABASE_ANON_KEY: 'anon',
          SUPABASE_SERVICE_ROLE_KEY: 'srv',
        })[k] || '',
    },
    serve: (fn) => {
      handler = fn;
    },
  };

  const domainHref = new URL('../supabase/functions/m2-backend/domain.ts', import.meta.url).href;
  let src = fs.readFileSync(path.join(ROOT_DIR, 'supabase/functions/m2-backend/index.ts'), 'utf8');
  src = src
    .replace(
      /import\s*\{\s*createClient[\s\S]*?from\s*['"]https:\/\/esm\.sh\/@supabase\/supabase-js@[^'"]+['"];?/,
      'const createClient = (...args) => globalThis.__createClient(...args);'
    )
    .replace("from './domain.ts'", `from '${domainHref}'`);

  const js = ts.default.transpileModule(src, {
    compilerOptions: {
      module: ts.default.ModuleKind.ESNext,
      target: ts.default.ScriptTarget.ES2022,
    },
  }).outputText;
  await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

  let state;
  let mode;
  let seq = 1;

  // Transactional simulator mirroring public.m4_apply_teaching_sync & public.m4_reset_teaching_sync
  async function execM4ApplyRpc(params) {
    if (mode.failAll) return { data: null, error: { message: 'DB_ERROR: injected db failure' } };
    const tx = structuredClone(state);
    const report = params.p_diff_report || {};
    if ((report.sourceMode || 'synthetic_fixture') !== 'synthetic_fixture') {
      return { data: null, error: { message: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4' } };
    }

    let createdClassesCount = 0;
    for (const nc of report.newClassesToCreate || []) {
      const code = String(nc?.code || '').trim().toUpperCase();
      if (!code) continue;
      if (!tx.classes.some((c) => String(c.code || '').trim().toUpperCase() === code)) {
        tx.classes.push({
          id: `cls_${seq++}`,
          code,
          name: String(nc?.name || `Lớp Robotics ${code}`).trim(),
          status: 'active',
          is_fixture: true,
          m4_synced: true,
        });
        createdClassesCount++;
      }
    }

    let updatedStudentsCount = 0;
    for (const upd of report.updated || []) {
      const code = String(upd?.id || '').trim().toUpperCase();
      const nextName = String(upd?.name || '').trim().replace(/\s+/g, ' ');
      const prevName = String(upd?.previousName || '').trim().replace(/\s+/g, ' ');
      const itemClassCode = String(upd?.classCode || '').trim().toUpperCase();
      const prevClassCode = String(upd?.previousClassCode || itemClassCode).trim().toUpperCase();
      if (!code || !nextName || !prevName) {
        return { data: null, error: { message: 'INVALID_DIFF_REPORT: missing fields' } };
      }
      const stu = tx.students.find((s) => String(s.student_code || '').trim().toUpperCase() === code);
      if (!stu || stu.status === 'archived') {
        return { data: null, error: { message: `STALE_PREVIEW_CONFLICT: student ${code}` } };
      }
      const prof = tx.profiles.find((p) => p.id === stu.id);
      if (!prof) {
        return { data: null, error: { message: `STALE_PREVIEW_CONFLICT: profile ${code}` } };
      }
      const cls = tx.classes.find((c) => c.id === stu.current_class_id);
      const currClassCode = String(cls?.code || '').trim().toUpperCase();
      if (
        (itemClassCode && currClassCode !== itemClassCode) ||
        (prevClassCode && currClassCode !== prevClassCode)
      ) {
        return { data: null, error: { message: `STALE_PREVIEW_CONFLICT: class changed for ${code}` } };
      }
      const currStuName = String(stu.full_name || '').trim().replace(/\s+/g, ' ');
      const currProfName = String(prof.full_name || '').trim().replace(/\s+/g, ' ');
      if (currStuName === nextName && currProfName === nextName) continue;
      if (currStuName !== prevName || currProfName !== prevName) {
        return { data: null, error: { message: `STALE_PREVIEW_CONFLICT: name changed for ${code}` } };
      }
      stu.m4_previous_full_name = stu.m4_previous_full_name || currStuName;
      stu.full_name = nextName;
      if (mode.failProfileUpdate) {
        return { data: null, error: { message: 'DB_ERROR: profile update failed' } };
      }
      prof.full_name = nextName;
      updatedStudentsCount++;
    }

    let addedStudentsCount = 0;
    let studentInsertCalls = 0;
    for (const add of report.added || []) {
      const code = String(add?.id || '').trim().toUpperCase();
      const nextName = String(add?.name || '').trim().replace(/\s+/g, ' ');
      const classCode = String(add?.classCode || '').trim().toUpperCase();
      if (tx.students.some((s) => String(s.student_code || '').trim().toUpperCase() === code)) {
        continue;
      }
      const cls = tx.classes.find((c) => String(c.code || '').trim().toUpperCase() === classCode);
      if (!cls || cls.status !== 'active') {
        return { data: null, error: { message: `STALE_PREVIEW_CONFLICT: class ${classCode}` } };
      }
      const newId = `stu_m4_${seq++}`;
      tx.profiles.push({
        id: newId,
        role: 'student',
        student_code: code,
        full_name: nextName,
        status: 'active',
        is_fixture: true,
        m4_synced: true,
      });
      if (mode.failSecondStudent && ++studentInsertCalls === 2) {
        return { data: null, error: { message: 'DB_ERROR: second student insert failed' } };
      }
      tx.students.push({
        id: newId,
        student_code: code,
        full_name: nextName,
        current_class_id: cls.id,
        original_class_id: cls.id,
        status: 'active',
        notes: 'Đồng bộ từ fixture DataTables Mốc 4 (Chờ Admin cấp mã PIN riêng)',
        is_fixture: true,
        m4_synced: true,
      });
      addedStudentsCount++;
    }

    // Commit transaction
    state = tx;
    return {
      data: [
        {
          added_students_count: addedStudentsCount,
          updated_students_count: updatedStudentsCount,
          created_classes_count: createdClassesCount,
        },
      ],
      error: null,
    };
  }

  async function execM4ResetRpc() {
    if (mode.failAll) return { data: null, error: { message: 'DB_ERROR: injected db failure' } };
    const tx = structuredClone(state);
    tx.practice_submissions = tx.practice_submissions || [];
    tx.m3_upload_reservations = tx.m3_upload_reservations || [];
    tx.storage_objects = tx.storage_objects || [];
    tx.m4_storage_cleanup_queue = tx.m4_storage_cleanup_queue || [];

    const m4StudentIds = new Set(
      tx.profiles.filter((p) => p.role === 'student' && p.m4_synced).map((p) => p.id)
    );
    for (const s of tx.students) {
      if (s.m4_synced) m4StudentIds.add(s.id);
    }

    const nonM4FileSet = new Set(
      tx.practice_submissions
        .filter((sub) => sub.type === 'file' && !m4StudentIds.has(sub.student_id))
        .map((sub) => sub.content)
    );

    const candidatePaths = new Set();
    for (const sub of tx.practice_submissions) {
      if (sub.type === 'file' && sub.content && m4StudentIds.has(sub.student_id)) {
        if (!nonM4FileSet.has(sub.content)) candidatePaths.add(sub.content);
      }
    }
    for (const res of tx.m3_upload_reservations) {
      if (res.object_path && m4StudentIds.has(res.student_id)) {
        if (!nonM4FileSet.has(res.object_path)) candidatePaths.add(res.object_path);
      }
    }
    for (const obj of tx.storage_objects) {
      if (obj.bucket_id === 'm3-practice-files' && obj.name) {
        const prefixId = String(obj.name).split('/')[0];
        if (m4StudentIds.has(prefixId) && !nonM4FileSet.has(obj.name)) {
          candidatePaths.add(obj.name);
        }
      }
    }

    for (const p of candidatePaths) {
      if (!tx.m4_storage_cleanup_queue.some((q) => q.object_path === p)) {
        tx.m4_storage_cleanup_queue.push({
          object_path: p,
          bucket_id: 'm3-practice-files',
        });
      }
    }

    tx.students = tx.students.filter((s) => !s.m4_synced);

    if (mode.failProfileDelete) {
      return { data: null, error: { message: 'DB_ERROR: profile delete failed inside reset tx' } };
    }

    tx.profiles = tx.profiles.filter((p) => !(p.role === 'student' && p.m4_synced));
    tx.practice_submissions = tx.practice_submissions.filter((sub) => !m4StudentIds.has(sub.student_id));
    tx.m3_upload_reservations = tx.m3_upload_reservations.filter((res) => !m4StudentIds.has(res.student_id));

    for (const stu of tx.students) {
      if (stu.m4_previous_full_name) {
        const prof = tx.profiles.find((p) => p.id === stu.id);
        if (prof) prof.full_name = stu.m4_previous_full_name;
        stu.full_name = stu.m4_previous_full_name;
        stu.m4_previous_full_name = null;
      }
    }

    tx.classes = tx.classes.filter((c) => {
      if (!c.m4_synced) return true;
      return tx.students.some(
        (s) => s.current_class_id === c.id || s.original_class_id === c.id
      );
    });

    const cleanupPaths = tx.m4_storage_cleanup_queue
      .filter((q) => q.bucket_id === 'm3-practice-files')
      .map((q) => q.object_path);

    // Commit transaction
    state = tx;
    return {
      data: [{ reset_ok: true, cleanup_paths: cleanupPaths }],
      error: null,
    };
  }

  async function execM4AckStorageCleanupRpc(params) {
    if (mode.failAckCleanup) {
      return { data: null, error: { message: 'DB_ERROR: failed to ack storage cleanup' } };
    }
    const paths = Array.isArray(params?.p_paths) ? params.p_paths : [];
    const targetSet = new Set(paths);
    state.m4_storage_cleanup_queue = state.m4_storage_cleanup_queue || [];
    state.storage_objects = state.storage_objects || [];
    state.m4_storage_cleanup_queue = state.m4_storage_cleanup_queue.filter((q) => {
      if (q.bucket_id !== 'm3-practice-files' || !targetSet.has(q.object_path)) {
        return true;
      }
      const stillInStorage = state.storage_objects.some(
        (o) => o.bucket_id === 'm3-practice-files' && o.name === q.object_path
      );
      return stillInStorage;
    });

    const distinctPaths = Array.from(targetSet);
    let remainingCount = 0;
    for (const p of distinctPaths) {
      const inQueue = state.m4_storage_cleanup_queue.some(
        (q) => q.bucket_id === 'm3-practice-files' && q.object_path === p
      );
      const inStorage = state.storage_objects.some(
        (o) => o.bucket_id === 'm3-practice-files' && o.name === p
      );
      if (inQueue || inStorage) {
        remainingCount++;
      }
    }
    const satisfiedCount = Math.max(0, paths.length - remainingCount);
    return { data: satisfiedCount, error: null };
  }

  async function execM4UpdateStudentRpc(params) {
    if (mode.failUpdateStudentProfile) {
      // Simulate mid-RPC error after students update attempt: because it is a single DB transaction, state is untouched
      return { data: null, error: { message: 'DB_ERROR: profile update failed inside m4_update_student tx' } };
    }
    const tx = structuredClone(state);
    const stu = tx.students.find((s) => s.id === params.p_student_id);
    const prof = tx.profiles.find((p) => p.id === params.p_student_id);
    if (!stu || !prof) {
      return { data: null, error: { message: 'NOT_FOUND: Không tìm thấy học sinh.' } };
    }
    if (params.p_update_name) {
      const cleanName = String(params.p_full_name || '').trim().replace(/\s+/g, ' ');
      if (!cleanName) {
        return { data: null, error: { message: 'INVALID_PAYLOAD: Họ tên học sinh không được để trống.' } };
      }
      const prevCurrName = String(stu.full_name || '').trim().replace(/\s+/g, ' ');
      stu.full_name = cleanName;
      if (prevCurrName !== cleanName) {
        stu.m4_previous_full_name = null;
      }
      prof.full_name = cleanName;
    }
    if (params.p_update_notes) {
      stu.notes = String(params.p_notes || '').trim();
    }
    state = tx;
    return { data: null, error: null };
  }

  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const mockJwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'auth_admin',
    session_id: 'sess_admin_1',
    app_metadata: { role: 'admin', m2_session_version: 1 },
  })}.sig`;

  let storageRemoveCalls = [];
  globalThis.__createClient = () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: 'auth_admin', email: 'a@b.c', app_metadata: { m2_session_version: 1 } },
        },
        error: null,
      }),
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          storageRemoveCalls.push({ bucket, paths: [...paths] });
          if (mode.failStorageRemove) {
            return { data: null, error: { message: 'STORAGE_ERROR: simulated storage remove failure' } };
          }
          state.storage_objects = (state.storage_objects || []).filter(
            (o) => !(o.bucket_id === bucket && paths.includes(o.name))
          );
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
    rpc: async (name, params) => {
      if (name === 'm2_verify_bff_secret') {
        return { data: true, error: null };
      }
      if (name === 'm2_verify_actor_session') {
        return {
          data: [
            {
              valid: true,
              profile_id: 'prof_admin',
              role: 'admin',
              auth_email: 'a@b.c',
              session_version: 1,
              status: 'active',
            },
          ],
          error: null,
        };
      }
      if (name === 'm4_apply_teaching_sync') {
        return execM4ApplyRpc(params);
      }
      if (name === 'm4_reset_teaching_sync') {
        return execM4ResetRpc();
      }
      if (name === 'm4_ack_storage_cleanup') {
        return execM4AckStorageCleanupRpc(params);
      }
      if (name === 'm4_update_student') {
        return execM4UpdateStudentRpc(params);
      }
      return { data: null, error: null };
    },
  });

  async function callEdge(action, payload) {
    const raw = JSON.stringify({
      action,
      accessToken: mockJwt,
      trustedIp: '127.0.0.1',
      payload,
    });
    const res = await handler(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mindx-bff-secret': 'bff-secret',
        },
        body: raw,
      })
    );
    return { status: res.status, body: await res.json() };
  }

  // Case 1: Stale preview (previousName no longer matches current server name) is rejected with 409 STALE_PREVIEW_CONFLICT
  state = {
    classes: [{ id: 'cls1', code: 'ROB-K14-01', name: 'L1', status: 'active', is_fixture: true, m4_synced: false }],
    students: [
      {
        id: 'stu_exist',
        student_code: 'HS_ROB_002',
        full_name: 'Phạm Quỳnh Chi (Tên mới trên máy chủ)',
        current_class_id: 'cls1',
        status: 'active',
        is_fixture: true,
        m4_synced: false,
      },
    ],
    profiles: [
      {
        id: 'stu_exist',
        role: 'student',
        student_code: 'HS_ROB_002',
        full_name: 'Phạm Quỳnh Chi (Tên mới trên máy chủ)',
        status: 'active',
        is_fixture: true,
        m4_synced: false,
      },
    ],
  };
  mode = {};
  const resStale = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      newClassesToCreate: [
        {
          code: 'ROB-K14-M4-04',
          name: 'Lớp Robotics ROB-K14-M4-04 (Mới đồng bộ — Chờ Admin gán khóa học)',
        },
      ],
      updated: [
        {
          id: 'HS_ROB_002',
          name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
          previousName: 'Phạm Quỳnh Chi',
          classCode: 'ROB-K14-01',
          previousClassCode: 'ROB-K14-01',
        },
      ],
      added: [{ id: 'HS_ROB_M4_101', name: 'Học Sinh Giả Lập M4-01', classCode: 'ROB-K14-01' }],
    },
  });
  assert.equal(resStale.status, 409);
  assert.equal(resStale.body.code, 'STALE_PREVIEW_CONFLICT');
  assert.equal(
    state.students[0].full_name,
    'Phạm Quỳnh Chi (Tên mới trên máy chủ)',
    'Stale preview must not overwrite newer server name'
  );
  assert.equal(
    state.classes.some((c) => c.code === 'ROB-K14-M4-04'),
    false,
    'Stale preview rejection must roll back entire transaction including new classes'
  );

  // Case 1b: Forged or missing sourceMode / non-canonical student / non-canonical class / custom class name / missing classCode on update
  const resMissingSourceMode = await callEdge('apply-teaching-sync', {
    diffReport: {
      added: [{ id: 'HS_ROB_M4_101', name: 'Học Sinh Giả Lập M4-01', classCode: 'ROB-K14-01' }],
    },
  });
  assert.equal(resMissingSourceMode.status, 403);
  assert.equal(resMissingSourceMode.body.code, 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4');

  const resNonCanonicalStudent = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      added: [{ id: 'REAL_STU_999', name: 'Học Sinh Thật Ngoài Mẫu', classCode: 'ROB-K14-01' }],
    },
  });
  assert.equal(resNonCanonicalStudent.status, 403);
  assert.equal(resNonCanonicalStudent.body.code, 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4');

  const resNonCanonicalClass = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      newClassesToCreate: [{ code: 'ROB-REAL-99', name: 'Lớp Thật Ngoài Mẫu' }],
      added: [],
    },
  });
  assert.equal(resNonCanonicalClass.status, 403);
  assert.equal(resNonCanonicalClass.body.code, 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4');

  const resForgedClassName = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      newClassesToCreate: [{ code: 'ROB-K14-M4-04', name: 'Tên Lớp Tùy Ý Ngoài Mẫu' }],
      added: [],
    },
  });
  assert.equal(resForgedClassName.status, 403);
  assert.equal(resForgedClassName.body.code, 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4');

  const resMissingUpdateClassFields = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      updated: [
        {
          id: 'HS_ROB_002',
          name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
          previousName: 'Phạm Quỳnh Chi',
        },
      ],
      added: [],
    },
  });
  assert.equal(resMissingUpdateClassFields.status, 400);
  assert.equal(resMissingUpdateClassFields.body.code, 'INVALID_DIFF_REPORT');

  // Case 2: Mid-transaction failure on 2nd added student rolls back 1st student, profiles, classes, and updated students
  state.students[0].full_name = 'Phạm Quỳnh Chi';
  state.profiles[0].full_name = 'Phạm Quỳnh Chi';
  mode = { failSecondStudent: true };
  const res1 = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      newClassesToCreate: [
        {
          code: 'ROB-K14-M4-04',
          name: 'Lớp Robotics ROB-K14-M4-04 (Mới đồng bộ — Chờ Admin gán khóa học)',
        },
      ],
      updated: [
        {
          id: 'HS_ROB_002',
          name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
          previousName: 'Phạm Quỳnh Chi',
          classCode: 'ROB-K14-01',
          previousClassCode: 'ROB-K14-01',
        },
      ],
      added: [
        { id: 'HS_ROB_M4_101', name: 'Học Sinh Giả Lập M4-01', classCode: 'ROB-K14-01' },
        { id: 'HS_ROB_M4_107', name: 'Học Sinh Giả Lập M4-07', classCode: 'ROB-K14-M4-04' },
      ],
    },
  });
  assert.equal(res1.status, 500);
  assert.equal(res1.body.success, false);
  assert.deepEqual(
    state.students.filter((s) => s.student_code.startsWith('HS_ROB_M4_')).map((s) => s.student_code),
    [],
    'Must leave 0 partial students when 2nd student fails'
  );
  assert.deepEqual(
    state.profiles.filter((p) => p.student_code.startsWith('HS_ROB_M4_')).map((p) => p.student_code),
    [],
    'Must leave 0 orphan profiles when 2nd student fails'
  );
  assert.equal(state.classes.some((c) => c.code === 'ROB-K14-M4-04'), false);
  assert.equal(state.students[0].full_name, 'Phạm Quỳnh Chi');
  assert.equal(state.profiles[0].full_name, 'Phạm Quỳnh Chi');

  // Case 3: Profile update error rolls back student update and returns 500
  mode = { failProfileUpdate: true };
  const res2 = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      updated: [
        {
          id: 'HS_ROB_002',
          name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
          previousName: 'Phạm Quỳnh Chi',
          classCode: 'ROB-K14-01',
          previousClassCode: 'ROB-K14-01',
        },
      ],
      added: [],
    },
  });
  assert.equal(res2.status, 500);
  assert.equal(res2.body.success, false);
  assert.equal(state.students[0].full_name, 'Phạm Quỳnh Chi');
  assert.equal(state.profiles[0].full_name, 'Phạm Quỳnh Chi');

  // Case 4: Apply succeeds; Admin also has a normal empty class ROB-K14-04 (is_fixture=true, m4_synced=false);
  // Reset fails mid-transaction on profile delete -> rolls back so retry succeeds cleanly without orphan profiles,
  // and Reset deletes ONLY M4-synced class ROB-K14-M4-04 while preserving Admin class ROB-K14-04 and seed ROB-K14-03!
  state = {
    classes: [
      { id: 'cls1', code: 'ROB-K14-01', name: 'L1', status: 'active', is_fixture: true, m4_synced: false },
      { id: 'cls3', code: 'ROB-K14-03', name: 'L3 Seed', status: 'active', is_fixture: true, m4_synced: false },
      {
        id: 'cls_admin_4',
        code: 'ROB-K14-04',
        name: 'Lớp Do Admin Tạo',
        status: 'active',
        is_fixture: true,
        m4_synced: false,
      },
    ],
    students: [
      {
        id: 'stu2',
        student_code: 'HS_ROB_002',
        full_name: 'Phạm Quỳnh Chi',
        current_class_id: 'cls1',
        status: 'active',
        is_fixture: true,
        m4_synced: false,
      },
    ],
    profiles: [
      {
        id: 'stu2',
        role: 'student',
        student_code: 'HS_ROB_002',
        full_name: 'Phạm Quỳnh Chi',
        status: 'active',
        is_fixture: true,
        m4_synced: false,
      },
    ],
  };
  mode = {};
  const resApplyOk = await callEdge('apply-teaching-sync', {
    diffReport: {
      sourceMode: 'synthetic_fixture',
      newClassesToCreate: [
        {
          code: 'ROB-K14-M4-04',
          name: 'Lớp Robotics ROB-K14-M4-04 (Mới đồng bộ — Chờ Admin gán khóa học)',
        },
      ],
      updated: [
        {
          id: 'HS_ROB_002',
          name: 'Phạm Quỳnh Chi (Đồng bộ M4)',
          previousName: 'Phạm Quỳnh Chi',
          classCode: 'ROB-K14-01',
          previousClassCode: 'ROB-K14-01',
        },
      ],
      added: [{ id: 'HS_ROB_M4_107', name: 'Học Sinh Giả Lập M4-07', classCode: 'ROB-K14-M4-04' }],
    },
  });
  assert.equal(resApplyOk.status, 200);
  assert.equal(resApplyOk.body.success, true);

  // Simulate M4-synced student (HS_ROB_M4_107) and baseline student (HS_ROB_002) both submitting files in m3-practice-files
  const syncedStu = state.students.find((s) => s.student_code === 'HS_ROB_M4_107');
  assert.ok(syncedStu && syncedStu.m4_synced === true);
  const m4SubmittedFilePath = `${syncedStu.id}/les_01/1700000000_m4_submitted.pdf`;
  const m4ReservedFilePath = `${syncedStu.id}/les_02/1700000001_m4_reserved.pdf`;
  const baseSubmittedFilePath = `stu2/les_01/1700000000_baseline_keep.pdf`;

  state.practice_submissions = [
    {
      id: 'sub_m4_1',
      student_id: syncedStu.id,
      lesson_id: 'les_01',
      type: 'file',
      content: m4SubmittedFilePath,
    },
    {
      id: 'sub_base_1',
      student_id: 'stu2',
      lesson_id: 'les_01',
      type: 'file',
      content: baseSubmittedFilePath,
    },
  ];
  state.m3_upload_reservations = [
    {
      id: 'res_m4_1',
      student_id: syncedStu.id,
      lesson_id: 'les_02',
      object_path: m4ReservedFilePath,
      status: 'reserved',
    },
  ];
  state.storage_objects = [
    { bucket_id: 'm3-practice-files', name: m4SubmittedFilePath },
    { bucket_id: 'm3-practice-files', name: m4ReservedFilePath },
    { bucket_id: 'm3-practice-files', name: baseSubmittedFilePath },
  ];
  state.m4_storage_cleanup_queue = [];
  storageRemoveCalls = [];

  // 4a. Inject mid-reset DB failure (profile delete fails) -> transaction rolls back completely AND 0 storage files are deleted
  mode = { failProfileDelete: true };
  const resResetFail = await callEdge('reset-teaching-sync', {});
  assert.equal(resResetFail.status, 500);
  assert.equal(resResetFail.body.success, false);
  assert.equal(
    state.students.some((s) => s.student_code === 'HS_ROB_M4_107'),
    true,
    'Failed reset transaction must roll back student deletion so student and profile remain paired'
  );
  assert.equal(
    storageRemoveCalls.length,
    0,
    'Failed DB reset must never call storage.remove or delete submitted files'
  );
  assert.equal(
    state.storage_objects.some((o) => o.name === m4SubmittedFilePath),
    true,
    'M4 student submitted file must remain intact when DB reset fails'
  );

  // 4b. Inject Storage remove failure -> DB reset commits and enqueues M4 file paths in private.m4_storage_cleanup_queue,
  //     returns 500 STORAGE_CLEANUP_FAILED, and retains the cleanup queue for retry
  mode = { failStorageRemove: true };
  const resStorageFail = await callEdge('reset-teaching-sync', {});
  assert.equal(resStorageFail.status, 500);
  assert.equal(resStorageFail.body.success, false);
  assert.equal(resStorageFail.body.code, 'STORAGE_CLEANUP_FAILED');
  assert.equal(storageRemoveCalls.length, 1);
  assert.deepEqual(
    storageRemoveCalls[0].paths.sort(),
    [m4ReservedFilePath, m4SubmittedFilePath].sort(),
    'Must attempt to remove ONLY M4 student files, never baseline student files'
  );
  assert.equal(
    state.profiles.some((p) => p.student_code === 'HS_ROB_M4_107'),
    false,
    'M4 student profile was deleted in DB reset transaction'
  );
  assert.deepEqual(
    state.m4_storage_cleanup_queue.map((q) => q.object_path).sort(),
    [m4ReservedFilePath, m4SubmittedFilePath].sort(),
    'Durable cleanup queue must retain M4 file paths when storage remove fails so retry can clean them'
  );
  assert.equal(
    state.storage_objects.some((o) => o.name === baseSubmittedFilePath),
    true,
    'Baseline student file must remain untouched'
  );

  // 4c. Retry reset when Storage recovers -> cleans up retained M4 storage files from queue and clears queue
  mode = {};
  const resResetOk = await callEdge('reset-teaching-sync', {});
  assert.equal(resResetOk.status, 200);
  assert.equal(resResetOk.body.success, true);
  assert.equal(resResetOk.body.data.removedStorageFilesCount, 2);
  assert.equal(
    state.m4_storage_cleanup_queue.length,
    0,
    'Durable cleanup queue must be empty after successful storage cleanup and ack'
  );
  assert.deepEqual(
    state.storage_objects.map((o) => o.name),
    [baseSubmittedFilePath],
    'M4 student files must be removed from m3-practice-files while baseline student file is preserved'
  );
  assert.equal(
    state.profiles.some((p) => p.student_code === 'HS_ROB_M4_107'),
    false,
    'Retry reset must leave 0 orphan profiles'
  );
  assert.equal(
    state.students.find((s) => s.student_code === 'HS_ROB_002')?.full_name,
    'Phạm Quỳnh Chi'
  );
  assert.equal(
    state.profiles.find((p) => p.student_code === 'HS_ROB_002')?.full_name,
    'Phạm Quỳnh Chi'
  );
  assert.equal(
    state.classes.some((c) => c.code === 'ROB-K14-03'),
    true,
    'Canonical seed class ROB-K14-03 must never be deleted on reset'
  );
  assert.equal(
    state.classes.some((c) => c.code === 'ROB-K14-04'),
    true,
    'Admin-created class ROB-K14-04 (is_fixture=true, m4_synced=false) must never be deleted on reset'
  );
  assert.equal(
    state.classes.some((c) => c.code === 'ROB-K14-M4-04'),
    false,
    'M4-created class ROB-K14-M4-04 (m4_synced=true) must be cleaned up on reset'
  );

  // 4d. Concurrent Reset calls that both receive the same queued cleanup path must both succeed (200 OK)
  const sharedPath = 'stu_m4_conc/les_01/1700000099_conc.pdf';
  state.m4_storage_cleanup_queue = [{ object_path: sharedPath, bucket_id: 'm3-practice-files' }];
  state.storage_objects = [{ bucket_id: 'm3-practice-files', name: sharedPath }];
  // Simulate Admin A cleaning and acknowledging sharedPath right before Admin B calls m4_ack_storage_cleanup
  const ackResA = await execM4AckStorageCleanupRpc({ p_paths: ['non_existent_yet'] });
  assert.equal(ackResA.data, 1);
  // First reset removes sharedPath from storage and acknowledges it
  const concRes1 = await callEdge('reset-teaching-sync', {});
  assert.equal(concRes1.status, 200);
  assert.equal(concRes1.body.success, true);
  // Second concurrent caller that had already received [sharedPath] from m4_reset_teaching_sync before concRes1 acked:
  const concAckAfterFirst = await execM4AckStorageCleanupRpc({ p_paths: [sharedPath] });
  assert.equal(
    concAckAfterFirst.data,
    1,
    'm4_ack_storage_cleanup must return satisfied count (1) even when a concurrent reset already pruned the queue row'
  );

  // 4e. R9-F1 regression: update-student uses atomic RPC m4_update_student under m4_teaching_sync lock
  // so students.full_name and profiles.full_name never diverge on failure or when followed by reset-teaching-sync
  const targetStuUuid = '00000000-0000-4000-8000-000000000002';
  state.students.push({
    id: targetStuUuid,
    student_code: 'HS_ROB_005',
    full_name: 'Tên Đã Đồng Bộ M4',
    m4_previous_full_name: 'Tên Gốc Trước M4',
    current_class_id: 'cls1',
    status: 'active',
    is_fixture: true,
    m4_synced: false,
  });
  state.profiles.push({
    id: targetStuUuid,
    role: 'student',
    student_code: 'HS_ROB_005',
    full_name: 'Tên Đã Đồng Bộ M4',
    status: 'active',
    is_fixture: true,
    m4_synced: false,
  });

  // Mid-update failure rolls back so students.full_name and profiles.full_name remain identical
  mode = { failUpdateStudentProfile: true };
  const updFailRes = await callEdge('update-student', {
    id: targetStuUuid,
    data: { fullName: 'Tên Admin Sửa Thủ Công Lỗi' },
  });
  assert.equal(updFailRes.status, 500);
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.full_name,
    'Tên Đã Đồng Bộ M4'
  );
  assert.equal(
    state.profiles.find((p) => p.id === targetStuUuid)?.full_name,
    'Tên Đã Đồng Bộ M4'
  );

  // R10-F2 regression: Saving the SAME fullName (e.g., Admin only edits notes in the modal)
  // MUST preserve m4_previous_full_name so subsequent reset restores the original pre-M4 name!
  mode = {};
  const updSameNameRes = await callEdge('update-student', {
    id: targetStuUuid,
    data: { fullName: 'Tên Đã Đồng Bộ M4', notes: 'Chỉ sửa ghi chú, giữ nguyên tên' },
  });
  assert.equal(updSameNameRes.status, 200);
  assert.equal(updSameNameRes.body.success, true);
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.m4_previous_full_name,
    'Tên Gốc Trước M4',
    'Saving unchanged fullName must preserve m4_previous_full_name'
  );
  const resetAfterSameNameSave = await callEdge('reset-teaching-sync', {});
  assert.equal(resetAfterSameNameSave.status, 200);
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.full_name,
    'Tên Gốc Trước M4',
    'Reset after saving unchanged fullName must restore original pre-M4 name'
  );
  assert.equal(
    state.profiles.find((p) => p.id === targetStuUuid)?.full_name,
    'Tên Gốc Trước M4'
  );

  // Now simulate M4 sync rename again, followed by a genuinely DIFFERENT manual name edit by Admin
  state.students.find((s) => s.id === targetStuUuid).full_name = 'Tên Đã Đồng Bộ M4';
  state.students.find((s) => s.id === targetStuUuid).m4_previous_full_name = 'Tên Gốc Trước M4';
  state.profiles.find((p) => p.id === targetStuUuid).full_name = 'Tên Đã Đồng Bộ M4';

  const updOkRes = await callEdge('update-student', {
    id: targetStuUuid,
    data: { fullName: 'Tên Admin Sửa Thủ Công Chuẩn', notes: 'Ghi chú mới' },
  });
  assert.equal(updOkRes.status, 200);
  assert.equal(updOkRes.body.success, true);
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.full_name,
    'Tên Admin Sửa Thủ Công Chuẩn'
  );
  assert.equal(
    state.profiles.find((p) => p.id === targetStuUuid)?.full_name,
    'Tên Admin Sửa Thủ Công Chuẩn'
  );
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.m4_previous_full_name,
    null
  );

  const resetAfterManualEdit = await callEdge('reset-teaching-sync', {});
  assert.equal(resetAfterManualEdit.status, 200);
  assert.equal(
    state.students.find((s) => s.id === targetStuUuid)?.full_name,
    'Tên Admin Sửa Thủ Công Chuẩn',
    'Reset must not overwrite manual admin name edit or cause students/profiles divergence'
  );
  assert.equal(
    state.profiles.find((p) => p.id === targetStuUuid)?.full_name,
    'Tên Admin Sửa Thủ Công Chuẩn'
  );

  // 4f. R10-F1 regression: Concurrent Storage upload (m3_check_storage_insert_permission) + reset-teaching-sync
  // serialized via shared m4_teaching_sync advisory lock so no in-flight upload can become an orphaned object.
  let m4LockChain = Promise.resolve();
  function withM4TeachingSyncLock(fn) {
    const next = m4LockChain.then(fn, fn);
    m4LockChain = next.then(() => {}, () => {});
    return next;
  }

  function simulateStorageInsertUnderM4Lock(studentId, objectPath) {
    return withM4TeachingSyncLock(async () => {
      // Under m4_teaching_sync lock, FOR KEY SHARE OF s and FOR UPDATE of m3_upload_reservations
      // re-evaluate latest committed state:
      const stu = state.students.find(
        (s) => s.id === studentId && (s.status === 'active' || s.status === 'transferred')
      );
      const resv = (state.m3_upload_reservations || []).find(
        (r) => r.student_id === studentId && r.object_path === objectPath && r.status === 'reserved'
      );
      if (!stu || !resv) {
        return { inserted: false, code: 'RLS_DENIED' };
      }
      state.storage_objects = state.storage_objects || [];
      state.storage_objects.push({ bucket_id: 'm3-practice-files', name: objectPath });
      return { inserted: true };
    });
  }

  // Subcase A: Upload acquires m4_teaching_sync lock first, then Reset runs -> upload is queued and cleaned
  const raceStuA = '00000000-0000-4000-8000-0000000000a1';
  const racePathA = `${raceStuA}/les_01/1700000101_raceA.pdf`;
  state.students.push({
    id: raceStuA,
    student_code: 'HS_ROB_M4_101',
    full_name: 'Học Sinh Giả Lập M4-01',
    current_class_id: 'cls1',
    status: 'active',
    is_fixture: true,
    m4_synced: true,
  });
  state.profiles.push({
    id: raceStuA,
    role: 'student',
    student_code: 'HS_ROB_M4_101',
    full_name: 'Học Sinh Giả Lập M4-01',
    status: 'active',
    is_fixture: true,
    m4_synced: true,
  });
  state.m3_upload_reservations = [
    { id: 'res_race_a', student_id: raceStuA, lesson_id: 'les_01', object_path: racePathA, status: 'reserved' },
  ];
  state.storage_objects = [];
  state.m4_storage_cleanup_queue = [];

  const [uploadFirstOutcome, resetSecondOutcome] = await Promise.all([
    simulateStorageInsertUnderM4Lock(raceStuA, racePathA),
    withM4TeachingSyncLock(() => callEdge('reset-teaching-sync', {})),
  ]);
  assert.equal(uploadFirstOutcome.inserted, true);
  assert.equal(resetSecondOutcome.status, 200);
  assert.equal(
    state.storage_objects.some((o) => o.name === racePathA),
    false,
    'When upload commits before reset under m4_teaching_sync lock, reset must clean the uploaded file'
  );
  assert.equal(state.m4_storage_cleanup_queue.length, 0);

  // Subcase B: Reset acquires m4_teaching_sync lock first, then in-flight Upload acquires lock -> upload is denied by RLS
  const raceStuB = '00000000-0000-4000-8000-0000000000b2';
  const racePathB = `${raceStuB}/les_01/1700000102_raceB.pdf`;
  state.students.push({
    id: raceStuB,
    student_code: 'HS_ROB_M4_102',
    full_name: 'Học Sinh Giả Lập M4-02',
    current_class_id: 'cls1',
    status: 'active',
    is_fixture: true,
    m4_synced: true,
  });
  state.profiles.push({
    id: raceStuB,
    role: 'student',
    student_code: 'HS_ROB_M4_102',
    full_name: 'Học Sinh Giả Lập M4-02',
    status: 'active',
    is_fixture: true,
    m4_synced: true,
  });
  state.m3_upload_reservations = [
    { id: 'res_race_b', student_id: raceStuB, lesson_id: 'les_01', object_path: racePathB, status: 'reserved' },
  ];

  const [resetFirstOutcome, uploadSecondOutcome] = await Promise.all([
    withM4TeachingSyncLock(() => callEdge('reset-teaching-sync', {})),
    simulateStorageInsertUnderM4Lock(raceStuB, racePathB),
  ]);
  assert.equal(resetFirstOutcome.status, 200);
  assert.equal(
    uploadSecondOutcome.inserted,
    false,
    'When reset commits before upload acquires m4_teaching_sync lock, FOR KEY SHARE / FOR UPDATE must reject the storage insert'
  );
  assert.equal(
    state.storage_objects.some((o) => o.name === racePathB),
    false,
    'Rejected late upload must leave 0 orphan objects in storage'
  );
});

test('M4-12: Round 4 regressions — class spacing preservation, inactive-to-active name collision, cross-page snapshotVersion, and UI-08 mutation/filter locks', async () => {
  const ts = await import('typescript');
  const ReactMod = await import('react');
  const React = ReactMod.default || ReactMod;
  const { act } = ReactMod;
  const { createRoot } = await import('react-dom/client');
  const engine = await import('../src/lib/simulation-rules.ts');

  // 1. normalizeClassCode preserves single internal spaces and routes spacing collisions to needsReview
  assert.equal(normalizeClassCode('  rob   x  '), 'ROB X');
  assert.equal(engine.normalizeClassCode('  rob   x  '), 'ROB X');

  const spacingState = createInitialTestState();
  spacingState.classes.push({
    id: 'cls_robx',
    code: 'ROBX',
    name: 'Lớp ROBX',
    courseId: 'crs_1',
    teacherId: 'usr_tch_1',
    status: 'active',
  });
  const spacingDiff = classifyAndDiffTeachingSnapshot(
    [
      {
        id: 'HS_SPACE_01',
        studentName: 'Học Sinh Khoảng Trắng Lớp',
        classCode: normalizeClassCode('ROB X'),
        status: 'Đang học',
        classStatus: 'Running',
      },
    ],
    spacingState
  );
  assert.equal(spacingDiff.added.length, 0, 'Must not silently merge ROB X into ROBX');
  assert.equal(spacingDiff.needsReview.length, 1);
  assert.equal(spacingDiff.needsReview[0].reasonCode, 'AMBIGUOUS_CLASS_CODE_SPACING');

  // 2. Inactive old ID + Active new ID with same name in source snapshot routes new ID to needsReview
  const transferSameNameDiff = classifyAndDiffTeachingSnapshot(
    [
      {
        id: 'HS_OLD_INACTIVE_01',
        studentName: 'Nguyễn Minh Quân',
        classCode: 'ROB-K14-01',
        status: 'Đã nghỉ học',
        classStatus: 'Closed',
      },
      {
        id: 'HS_NEW_ACTIVE_02',
        studentName: 'Nguyễn Minh Quân',
        classCode: 'ROB-K14-02',
        status: 'Đang học',
        classStatus: 'Running',
      },
    ],
    createInitialTestState()
  );
  assert.equal(
    transferSameNameDiff.added.length,
    0,
    'Active new ID with same name as inactive old ID in snapshot must NOT be auto-added'
  );
  assert.equal(transferSameNameDiff.needsReview.length, 1);
  assert.equal(transferSameNameDiff.needsReview[0].id, 'HS_NEW_ACTIVE_02');
  assert.equal(
    transferSameNameDiff.needsReview[0].reasonCode,
    'SAME_NAME_DIFFERENT_ID_OR_ID_CHANGED'
  );
  assert.deepEqual(transferSameNameDiff.needsReview[0].conflictingIds, ['HS_OLD_INACTIVE_01']);

  // 3. Multi-page reader aborts on SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES and marks unversioned multi-page reads consistencyVerified=false
  const versionDriftFixture = {
    pageLength: 2,
    pages: [
      {
        draw: 1,
        snapshotVersion: 'v1',
        recordsTotal: 3,
        recordsFiltered: 3,
        data: [
          { id: 'S1', student_name: 'A1', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
          { id: 'S2', student_name: 'A2', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
        ],
      },
      {
        draw: 2,
        snapshotVersion: 'v2_changed',
        recordsTotal: 3,
        recordsFiltered: 3,
        data: [
          { id: 'S3', student_name: 'A3', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
        ],
      },
    ],
  };
  const driftRes = await readAllTeachingDataTablesPages({
    pageLength: 2,
    fetchPage: createFixturePageFetcher(versionDriftFixture),
  });
  assert.equal(driftRes.success, false);
  assert.equal(driftRes.aborted, true);
  assert.equal(driftRes.code, 'SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES');
  assert.equal(driftRes.rows.length, 0);

  const unversionedMultiPage = {
    pageLength: 2,
    pages: [
      {
        draw: 1,
        recordsTotal: 3,
        recordsFiltered: 3,
        data: [
          { id: 'S1', student_name: 'A1', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
          { id: 'S2', student_name: 'A2', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
        ],
      },
      {
        draw: 2,
        recordsTotal: 3,
        recordsFiltered: 3,
        data: [
          { id: 'S3', student_name: 'A3', class_code: 'ROB-K14-01', status: 'Đang học', class_status: 'Running' },
        ],
      },
    ],
  };
  const unversionedRes = await readAllTeachingDataTablesPages({
    pageLength: 2,
    fetchPage: createFixturePageFetcher(unversionedMultiPage),
  });
  assert.equal(unversionedRes.success, true);
  assert.equal(unversionedRes.consistencyVerified, false);

  // 4. UI-08 locks Cancel/Reset while Apply is in flight and re-runs preview when robFilterMode changes during loading
  const uri = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  const tr = (f) =>
    ts.default.transpileModule(fs.readFileSync(path.join(ROOT_DIR, f), 'utf8'), {
      compilerOptions: {
        module: ts.default.ModuleKind.ESNext,
        target: ts.default.ScriptTarget.ES2022,
        jsx: ts.default.JsxEmit.ReactJSX,
      },
    }).outputText;

  const mocks = await import(uri(tr('src/lib/mock-data.ts')));
  let code = tr('src/app/admin/sync/page.tsx');
  for (const spec of ['react', 'react/jsx-runtime']) {
    code = code
      .replaceAll(`from '${spec}'`, `from '${import.meta.resolve(spec)}'`)
      .replaceAll(`from "${spec}"`, `from "${import.meta.resolve(spec)}"`);
  }
  code = code.replace(
    /import\s*\{\s*useRouter\s*\}\s*from\s*['"]next\/navigation['"];?/,
    'const useRouter=()=>({push(){}});'
  );
  code = code.replace(
    /import\s*\{\s*useStore\s*\}\s*from\s*['"]@\/lib\/store['"];?/,
    'const useStore=()=>globalThis.__m4StoreR4;'
  );
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/icons['"];?/,
    (_, names) =>
      names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => 'const ' + n + '=()=>null;')
        .join('\n')
  );

  const { default: Page } = await import(uri(code));
  const fixture = loadMockFixture();
  const state = { classes: mocks.initialClasses, students: mocks.initialStudents };

  let resolveApply;
  let applyCallCount = 0;
  let resetCallCount = 0;
  const previewModesCalled = [];
  globalThis.__m4StoreR4 = {
    currentUser: mocks.initialUsers[0],
    ...state,
    previewTeachingSync: (data, opts) => {
      previewModesCalled.push(opts?.robFilterMode);
      return engine.runTeachingSnapshotPreview(data, state, opts);
    },
    applyTeachingSync: () => {
      applyCallCount++;
      return new Promise((res) => {
        resolveApply = () => res({ success: true, message: 'Đã áp dụng thành công' });
      });
    },
    resetTeachingFixtureSync: async () => {
      resetCallCount++;
      state.classes = [];
      state.students = [];
      return { success: true, message: 'reset' };
    },
  };

  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const pendingFetches = [];
  globalThis.fetch = () =>
    new Promise((resolve) =>
      pendingFetches.push(() => resolve({ ok: true, json: async () => fixture }))
    );

  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(Page));
  });

  const btn = (pattern) =>
    Array.from(document.querySelectorAll('button')).find((b) => pattern.test(b.textContent));

  // 4a. Start loading preview (include_rob), then switch radio to exclude_rob while still loading
  await act(async () => {
    btn(/^Đọc toàn bộ/).click();
  });
  assert.equal(pendingFetches.length, 1);

  const radios = Array.from(document.querySelectorAll('input[name="robFilterMode"]'));
  await act(async () => {
    radios[1].click(); // switch to exclude_rob while 1st fetch is still pending
  });
  assert.equal(pendingFetches.length, 2, 'Changing robFilterMode while loading must trigger a fresh preview fetch');

  // Resolve 1st (stale include_rob) then 2nd (exclude_rob)
  await act(async () => {
    pendingFetches[0]();
  });
  await act(async () => {
    pendingFetches[1]();
  });

  assert.equal(previewModesCalled[previewModesCalled.length - 1], 'exclude_rob');
  assert.equal(
    document.body.textContent.includes('+12 mới, 0 cập nhật'),
    true,
    'Preview report must reflect exclude_rob (12 non-ROB added, 0 updated), never stale include_rob'
  );

  // 4b. Start Apply -> Cancel and Reset buttons must be disabled while Apply is in-flight
  await act(async () => {
    btn(/Xác nhận Áp dụng Fixture/).click();
  });
  const cancelBtnDuringApply = btn(/Hủy bỏ/);
  const resetBtnDuringApply = btn(/Khôi phục dữ liệu mẫu ban đầu/);
  assert.equal(cancelBtnDuringApply.disabled, true, 'Cancel button must be disabled while Apply is in flight');
  assert.equal(resetBtnDuringApply.disabled, true, 'Reset button must be disabled while Apply is in flight');

  await act(async () => {
    cancelBtnDuringApply.click();
  });
  assert.equal(
    document.body.textContent.includes('Đã hủy xem trước đồng bộ'),
    false,
    'Clicking Cancel while Apply is in flight must not show false cancellation message'
  );

  await act(async () => {
    resolveApply();
  });
  assert.equal(document.body.textContent.includes('Đã áp dụng thành công'), true);
  assert.equal(applyCallCount, 1);

  // 4c. Clicking Cancel ("Hủy bỏ") on a normal active preview clears preview without calling applyTeachingSync or mutating state
  const classesSnapshotBeforeCancel = structuredClone(state.classes);
  const studentsSnapshotBeforeCancel = structuredClone(state.students);
  await act(async () => {
    btn(/^Đọc toàn bộ/).click();
  });
  await act(async () => {
    pendingFetches[pendingFetches.length - 1]();
  });
  assert.equal(Boolean(btn(/Xác nhận Áp dụng Fixture/)), true, 'Preview Apply button must be visible before Cancel');

  await act(async () => {
    btn(/Hủy bỏ/).click();
  });
  assert.equal(
    document.body.textContent.includes('Đã hủy xem trước đồng bộ. Không có bất kỳ thay đổi nào được áp dụng vào TEST.'),
    true,
    'Cancel preview must display confirmation that no data was modified'
  );
  assert.equal(
    Boolean(btn(/Xác nhận Áp dụng Fixture/)),
    false,
    'Cancel preview must clear active preview and hide Apply button'
  );
  assert.equal(applyCallCount, 1, 'Cancel preview must never call applyTeachingSync');
  assert.equal(resetCallCount, 0, 'Cancel preview must never call resetTeachingFixtureSync');
  assert.deepEqual(state.classes, classesSnapshotBeforeCancel, 'Cancel preview must not mutate classes');
  assert.deepEqual(state.students, studentsSnapshotBeforeCancel, 'Cancel preview must not mutate students');

  // 4d. R12-F2 regression: Clicking "Khôi phục dữ liệu mẫu ban đầu" opens a confirmation dialog first
  // (never immediately deleting TEST data in 1 click); clicking "Hủy khôi phục" aborts without calling resetTeachingFixtureSync,
  // while clicking "Xác nhận Khôi phục TEST" executes resetTeachingFixtureSync.
  await act(async () => {
    btn(/Khôi phục dữ liệu mẫu ban đầu/).click();
  });
  assert.equal(
    resetCallCount,
    0,
    'Clicking Reset button once must only open confirmation dialog, never immediately run resetTeachingFixtureSync'
  );
  assert.equal(
    document.body.textContent.includes('Xác nhận khôi phục dữ liệu mẫu ban đầu trên TEST'),
    true,
    'Confirmation dialog must be displayed with clear warning about deleting M4 synced data/submissions/files'
  );

  await act(async () => {
    btn(/Hủy khôi phục/).click();
  });
  assert.equal(resetCallCount, 0, 'Cancelling reset confirmation must not call resetTeachingFixtureSync');
  assert.equal(
    document.body.textContent.includes('Xác nhận khôi phục dữ liệu mẫu ban đầu trên TEST'),
    false,
    'Cancelling reset confirmation must close confirmation dialog'
  );
  assert.deepEqual(state.classes, classesSnapshotBeforeCancel, 'Cancelled reset must not mutate classes');

  await act(async () => {
    btn(/Khôi phục dữ liệu mẫu ban đầu/).click();
  });
  await act(async () => {
    btn(/Xác nhận Khôi phục TEST/).click();
  });
  assert.equal(resetCallCount, 1, 'Confirming reset must execute resetTeachingFixtureSync');

  await act(async () => {
    root.unmount();
  });
  dom.window.close();
});



