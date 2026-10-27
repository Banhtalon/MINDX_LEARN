/**
 * Mốc 4 — Core Teaching MindX DataTables Multi-Page Reader, Validator,
 * Identity/Status Classifier, Aggregate Previewer, and TEST Fixture Sync Engine.
 *
 * SAFETY & BUSINESS RULES (PROJECT_PLAN.md Section 5 & Mốc 4):
 * 1. Read all DataTables pages sequentially according to actual `length` and
 *    `recordsFiltered` / `recordsTotal`. Never hardcode 30 pages and never
 *    assume `start=0, length=2000` returns the full dataset.
 * 2. Keep default source filter (`recordsTotal === recordsFiltered`). Validate
 *    `draw`, `recordsTotal`, `recordsFiltered`, row count on each page, row
 *    count on the last page, row schema, missing `id`, and duplicate `id`.
 * 3. Atomic abort: If totals change between pages, session expires (401/403/login),
 *    any page fails, `draw` mismatches, or row structure is invalid, abort the
 *    entire run immediately and discard all partial data (`partialApplied: false`).
 *    Never log or echo real student names or codes in error messages.
 * 4. Identity safety: Never merge students by name alone. Use `id` (`studentCode`)
 *    only when unambiguous. If a new `id` has the same name as an existing student
 *    or another row in the snapshot (possible ID change on class transfer or two
 *    students with the same name), or if an existing `id` changes `class_code`
 *    without explicit confirmation, hold the record in `needsReview`
 *    ("Cần Admin đối chiếu thủ công") and keep the existing profile untouched.
 * 5. Filter class codes containing `ROB` case-insensitively (`robFilterMode`:
 *    default `'include_rob'`, also supports `'exclude_rob'` for comparison).
 *    Map known active statuses (`Đang học` + `Running`/`Đang hoạt động`) vs known
 *    inactive statuses (`Nghỉ`, `Đã nghỉ học`, `Đã hết khóa`, `Closed`, `Finished`).
 *    Any unrecognized `status` or `class_status` is routed to `needsReview`.
 * 6. Absent rows in a snapshot are NEVER deleted. Archived students/classes are
 *    NEVER auto-reopened. Unrelated source fields never overwrite grades,
 *    passwords, or PINs. Sync NEVER auto-issues PINs or generates PIN CSVs.
 * 7. Real Teaching data at Mốc 4 is strictly read-only aggregate preview (numbers
 *    only, zero PII persisted to TEST, files, or logs). Only synthetic fixtures
 *    may be applied to TEST.
 */

export const TEACHING_DATATABLES_DEFAULT_PAGE_LENGTH = 15;
export const TEACHING_DATATABLES_MAX_PAGES = 500;

export const ACTIVE_STUDENT_STATUS_MAP = new Map([
  ['đang học', 'Đang học'],
  ['dang hoc', 'Đang học'],
  ['active', 'Đang học'],
]);

export const INACTIVE_STUDENT_STATUS_MAP = new Map([
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

export const ACTIVE_CLASS_STATUS_MAP = new Map([
  ['running', 'Running'],
  ['đang hoạt động', 'Đang hoạt động'],
  ['dang hoat dong', 'Đang hoạt động'],
  ['đang mở', 'Đang mở'],
  ['dang mo', 'Đang mở'],
  ['active', 'Active'],
]);

export const INACTIVE_CLASS_STATUS_MAP = new Map([
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

/**
 * Normalizes whitespace and case for comparison without mutating display strings.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes a person name for collision detection (never used to auto-merge!).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePersonName(value) {
  if (typeof value !== 'string') return '';
  // Strip parenthetical annotations like "(Đã chuyển lớp)" or "(Đồng bộ M4)" only when checking base name?
  // Keep exact normalized full name AND base name without trailing status tags for thorough collision check.
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extracts base person name without parenthetical suffixes like "(Đã chuyển lớp)"
 * so we also catch collisions against annotated TEST seed names.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeBasePersonName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Normalizes class code to trimmed uppercase while preserving single internal spaces.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeClassCode(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function compactClassCodeKey(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Classifies source `status` (student status) and `class_status` (class status)
 * into `'active'`, `'inactive'`, or `'unknown'`.
 *
 * @param {string} rawStudentStatus
 * @param {string} rawClassStatus
 */
export function evaluateTeachingRowStatuses(rawStudentStatus, rawClassStatus) {
  const normStudent = normalizeToken(rawStudentStatus);
  const normClass = normalizeToken(rawClassStatus);

  let studentState = 'unknown';
  if (ACTIVE_STUDENT_STATUS_MAP.has(normStudent)) {
    studentState = 'active';
  } else if (INACTIVE_STUDENT_STATUS_MAP.has(normStudent)) {
    studentState = 'inactive';
  }

  let classState = 'unknown';
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

/**
 * Checks whether a class code matches the ROB filter rule.
 * @param {string} classCode
 * @param {'include_rob' | 'exclude_rob'} [robFilterMode='include_rob']
 */
export function evaluateRobClassFilter(classCode, robFilterMode = 'include_rob') {
  const hasRob = /rob/i.test(String(classCode || ''));
  const passesFilter = robFilterMode === 'exclude_rob' ? !hasRob : hasRob;
  return {
    hasRob,
    passesFilter,
    robFilterMode,
  };
}

/**
 * Creates a page fetcher from a multi-page or single-page fixture payload.
 * Supports:
 * - `{ pages: [page1, page2, ...], pageLength?: number }`
 * - Single DataTables response `{ draw, recordsTotal, recordsFiltered, data }`
 *
 * @param {any} fixtureInput
 */
export function createFixturePageFetcher(fixtureInput) {
  if (!fixtureInput || typeof fixtureInput !== 'object') {
    return async () => ({
      ok: false,
      status: 500,
      errorCode: 'MALFORMED_DATATABLES_PAYLOAD',
    });
  }

  const pages = Array.isArray(fixtureInput.pages)
    ? fixtureInput.pages
    : [fixtureInput];

  return async ({ pageIndex }) => {
    const pageSpec = pages[pageIndex];
    if (!pageSpec) {
      return {
        ok: false,
        status: 404,
        errorCode: 'MISSING_PAGE_IN_FIXTURE',
      };
    }

    if (pageSpec.__simulateSessionExpired || pageSpec.status === 401 || pageSpec.status === 403 || pageSpec.redirectedToLogin) {
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

/**
 * Reads all DataTables pages until `start >= recordsFiltered` and validates
 * protocol consistency across the entire run.
 *
 * If ANY error occurs on ANY page, aborts atomically (`aborted: true`,
 * `partialApplied: false`, `rows: []`). Never leaks student names or IDs in
 * error messages.
 *
 * @param {Object} options
 * @param {Function} options.fetchPage - Async function `({ draw, start, length, pageIndex }) => Promise<{ ok, status?, redirectedToLogin?, errorCode?, payload? }>`
 * @param {number} [options.pageLength=15] - Page size (`length` parameter)
 * @param {number} [options.maxPages=500] - Safety upper bound against infinite loops
 * @param {boolean} [options.requireUnfilteredSource=true] - Require `recordsTotal === recordsFiltered`
 */
export async function readAllTeachingDataTablesPages(options = {}) {
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

  const makeAbort = (code, message, pageNumber, pagesReadSoFar) => ({
    success: false,
    aborted: true,
    partialApplied: false,
    code,
    message,
    failedAtPage: pageNumber,
    pagesRead: pagesReadSoFar,
    pageLength,
    recordsTotal: 0,
    recordsFiltered: 0,
    lastPageRowCount: 0,
    consistencyVerified: false,
    snapshotConsistent: false,
    snapshotVersion: null,
    rows: [],
  });

  const extractPageSnapshotVersion = (resp, body) => {
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

  const collectedRows = [];
  const seenIds = new Set();

  let expectedRecordsTotal = null;
  let expectedRecordsFiltered = null;
  let expectedSnapshotVersion = null;
  let pageIndex = 0;
  let start = 0;

  while (pageIndex < maxPages) {
    const pageNumber = pageIndex + 1;
    const requestedDraw = pageNumber;

    let response;
    try {
      response = await fetchPage({
        draw: requestedDraw,
        start,
        length: pageLength,
        pageIndex,
      });
    } catch (err) {
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

    if (
      response.errorCode === 'CORS_OR_SOP_BLOCKED'
    ) {
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

    // Detect if HTML login page was returned instead of JSON
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
    } else if (recordsTotal !== expectedRecordsTotal || recordsFiltered !== expectedRecordsFiltered) {
      return makeAbort(
        'TOTAL_CHANGED_BETWEEN_PAGES',
        `Tổng số bản ghi nguồn thay đổi giữa các trang (trang 1: ${expectedRecordsFiltered}, trang ${pageNumber}: ${recordsFiltered}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    } else if (
      (expectedSnapshotVersion !== null || pageSnapshotVersion !== null) &&
      pageSnapshotVersion !== expectedSnapshotVersion
    ) {
      return makeAbort(
        'SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES',
        `Phiên bản dữ liệu nguồn thay đổi giữa các trang (trang 1 khác trang ${pageNumber}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    // Validate row count on this page and last page
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

    // Validate each row schema and ID uniqueness without echoing PII into error messages
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
      : `Đã đọc ${pageIndex} trang DataTables (${collectedRows.length}/${expectedRecordsFiltered ?? 0} bản ghi), nhưng nguồn không cung cấp mã phiên bản dữ liệu nên chưa xác minh tính nhất quán giữa các trang.`,
    failedAtPage: undefined,
    pagesRead: pageIndex,
    pageLength,
    recordsTotal: expectedRecordsTotal ?? 0,
    recordsFiltered: expectedRecordsFiltered ?? 0,
    lastPageRowCount:
      pageIndex === 0 || (expectedRecordsFiltered ?? 0) === 0
        ? 0
        : (expectedRecordsFiltered ?? 0) - (pageIndex - 1) * pageLength,
    consistencyVerified,
    snapshotConsistent: consistencyVerified,
    snapshotVersion: expectedSnapshotVersion,
    rows: collectedRows,
  };
}

/**
 * Classifies validated DataTables rows and diffs them against the current TEST
 * roster (`students`, `classes`).
 *
 * Strictly enforces:
 * - Never merges by student name alone.
 * - Holds same-name-different-ID (or changed ID on class transfer) in `needsReview`.
 * - Holds same-ID class changes in `needsReview` unless explicitly confirmed.
 * - Holds unknown `status` or `class_status` values in `needsReview`.
 * - Holds archived students or archived target classes in `needsReview` (never auto-reopens).
 * - Filters `ROB` class codes case-insensitively and routes inactive/non-ROB rows to `ignored`.
 * - Preserves all existing students absent from the snapshot (`absentPreserved`).
 *
 * @param {Array} validatedRows - Normalized rows from `readAllTeachingDataTablesPages`
 * @param {Object} currentState - `{ students: StudentProfile[], classes: ClassItem[] }`
 * @param {Object} [options] - `{ robFilterMode?: 'include_rob' | 'exclude_rob', paginationSummary?: Object }`
 */
export function classifyAndDiffTeachingSnapshot(validatedRows, currentState = {}, options = {}) {
  const existingStudents = Array.isArray(currentState.students) ? currentState.students : [];
  const existingClasses = Array.isArray(currentState.classes) ? currentState.classes : [];
  const robFilterMode = options.robFilterMode === 'exclude_rob' ? 'exclude_rob' : 'include_rob';

  // Build lookups for existing classes and students
  const classByCode = new Map();
  const classById = new Map();
  const classCodesByCompactKey = new Map();
  for (const cls of existingClasses) {
    if (!cls) continue;
    const normCode = normalizeClassCode(cls.code);
    const compactKey = compactClassCodeKey(cls.code);
    if (normCode) classByCode.set(normCode, cls);
    if (cls.id) classById.set(cls.id, cls);
    if (normCode && compactKey) {
      if (!classCodesByCompactKey.has(compactKey)) {
        classCodesByCompactKey.set(compactKey, new Set());
      }
      classCodesByCompactKey.get(compactKey).add(normCode);
    }
  }

  const studentByCode = new Map();
  const existingCodeSetByNormName = new Map();
  const existingCodeSetByBaseName = new Map();

  for (const stu of existingStudents) {
    if (!stu || !stu.studentCode) continue;
    const normCode = String(stu.studentCode).trim().toUpperCase();
    studentByCode.set(normCode, stu);

    const normFull = normalizePersonName(stu.fullName);
    if (normFull) {
      if (!existingCodeSetByNormName.has(normFull)) {
        existingCodeSetByNormName.set(normFull, new Set());
      }
      existingCodeSetByNormName.get(normFull).add(normCode);
    }

    const normBase = normalizeBasePersonName(stu.fullName);
    if (normBase) {
      if (!existingCodeSetByBaseName.has(normBase)) {
        existingCodeSetByBaseName.set(normBase, new Set());
      }
      existingCodeSetByBaseName.get(normBase).add(normCode);
    }
  }

  // First pass over ALL snapshot rows (before status or ROB filtering!):
  // count ROB vs non-ROB, index all class codes for spacing-collision detection,
  // and index all snapshot IDs by normalized name so an inactive old ID + active new ID
  // with the same name is always held in `needsReview` for Admin verification.
  const snapshotIdsByBaseName = new Map();
  const snapshotIdsByExactName = new Map();
  let robClassRowCount = 0;
  let nonRobClassRowCount = 0;

  for (const row of validatedRows) {
    const normRowClassCode = normalizeClassCode(row.classCode);
    const compactRowClassKey = compactClassCodeKey(row.classCode);
    if (normRowClassCode && compactRowClassKey) {
      if (!classCodesByCompactKey.has(compactRowClassKey)) {
        classCodesByCompactKey.set(compactRowClassKey, new Set());
      }
      classCodesByCompactKey.get(compactRowClassKey).add(normRowClassCode);
    }

    const robEval = evaluateRobClassFilter(normRowClassCode, robFilterMode);
    if (robEval.hasRob) {
      robClassRowCount++;
    } else {
      nonRobClassRowCount++;
    }

    const normRowId = String(row.id).trim().toUpperCase();
    const baseName = normalizeBasePersonName(row.studentName);
    if (baseName) {
      if (!snapshotIdsByBaseName.has(baseName)) {
        snapshotIdsByBaseName.set(baseName, new Set());
      }
      snapshotIdsByBaseName.get(baseName).add(normRowId);
    }
    const exactName = normalizePersonName(row.studentName);
    if (exactName) {
      if (!snapshotIdsByExactName.has(exactName)) {
        snapshotIdsByExactName.set(exactName, new Set());
      }
      snapshotIdsByExactName.get(exactName).add(normRowId);
    }
  }

  const added = [];
  const updated = [];
  const unchanged = [];
  const needsReview = [];
  const ignored = [];
  const newClassesMap = new Map();
  const seenSnapshotStudentCodes = new Set();

  for (const row of validatedRows) {
    const sourceId = String(row.id).trim().toUpperCase();
    seenSnapshotStudentCodes.add(sourceId);

    const robEval = evaluateRobClassFilter(row.classCode, robFilterMode);
    const statusEval = evaluateTeachingRowStatuses(row.status, row.classStatus);
    const existingStudent = studentByCode.get(sourceId) || null;

    // 1. Check ROB class filter first
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

    // 2. Check unknown status values -> must go to needsReview before mapping is finalized
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

    // 3. Check clearly inactive student or class status -> goes to ignored (never deletes existing accounts/grades)
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

    // At this point: row passes ROB filter AND has active student status ('Đang học') + active class status ('Running'/'Đang hoạt động')
    const normRowClassCode = normalizeClassCode(row.classCode);
    const compactRowClassKey = compactClassCodeKey(row.classCode);
    const collidingClassCodes = classCodesByCompactKey.get(compactRowClassKey);
    if (collidingClassCodes && collidingClassCodes.size > 1) {
      needsReview.push({
        id: sourceId,
        name: row.studentName,
        classCode: normRowClassCode,
        status: row.status,
        classStatus: row.classStatus,
        reasonCode: 'AMBIGUOUS_CLASS_CODE_SPACING',
        reason: `Mã lớp "${normRowClassCode}" va chạm khoảng trắng với mã lớp khác (${Array.from(collidingClassCodes).join(' / ')}) — giữ chờ Admin đối chiếu thủ công để tránh gán nhầm lớp`,
      });
      continue;
    }

    const targetClass = classByCode.get(normRowClassCode) || null;

    // 4. Target class exists in system but is archived or completed -> hold in needsReview
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

    // 5. Existing student with same `studentCode === sourceId`
    if (existingStudent) {
      // 5a. Never auto-reopen an archived student account
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

      // 5b. Check if existing student changed class in source
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

      // 5c. Check if fullName changed completely to a different person's name vs normal update
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

    // 6. New `sourceId` not in existing roster: check for name collisions!
    // Never merge by name. If the same name exists under a different ID in existing roster
    // OR appears multiple times with different IDs in the snapshot, hold in `needsReview`.
    const baseName = normalizeBasePersonName(row.studentName);
    const exactNormName = normalizePersonName(row.studentName);

    const existingCodesWithSameName = new Set([
      ...(existingCodeSetByNormName.get(exactNormName) || []),
      ...(existingCodeSetByBaseName.get(baseName) || []),
    ]);
    existingCodesWithSameName.delete(sourceId);

    const snapshotCodesWithSameName = new Set([
      ...(snapshotIdsByExactName.get(exactNormName) || []),
      ...(snapshotIdsByBaseName.get(baseName) || []),
    ]);
    snapshotCodesWithSameName.delete(sourceId);

    if (existingCodesWithSameName.size > 0 || snapshotCodesWithSameName.size > 0) {
      const conflictIds = [
        ...Array.from(existingCodesWithSameName),
        ...Array.from(snapshotCodesWithSameName),
      ];
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
            : `Trùng họ tên "${row.studentName}" giữa nhiều mã ID khác nhau ngay trong nguồn đọc (${conflictIds.join(', ')}) — không tự gộp theo tên, chờ Admin đối chiếu`,
      });
      continue;
    }

    // 7. Valid new active ROB student!
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

  // 8. Compute existing roster students absent from this snapshot -> preserved, never deleted
  const absentPreserved = [];
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
      consistencyVerified: pagination.consistencyVerified ?? true,
      snapshotVersion: pagination.snapshotVersion ?? null,
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

/**
 * Builds a strict aggregate-only preview summary (numbers & static status labels ONLY,
 * zero student names, zero student IDs, zero class codes) for live Teaching sessions at Mốc 4.
 *
 * @param {Object} pageReadResult - Result from `readAllTeachingDataTablesPages`
 * @param {Object} [options] - `{ robFilterMode?: 'include_rob' | 'exclude_rob' }`
 */
export function buildTeachingAggregatePreview(pageReadResult, options = {}) {
  const timestamp = new Date().toISOString();
  const robFilterMode = options.robFilterMode === 'exclude_rob' ? 'exclude_rob' : 'include_rob';

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
      snapshotConsistent: false,
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

  const idsByBaseName = new Map();

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
      idsByBaseName.get(baseName).add(row.id);
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
      : (pageReadResult.pagesRead ?? 0) <= 1 || Boolean(pageReadResult.snapshotVersion);

  return {
    success: true,
    aborted: false,
    partialApplied: false,
    mode: 'READONLY_AGGREGATE_M4',
    code: 'OK',
    message: consistencyVerified
      ? `Đã đọc kiểm tra hết ${pageReadResult.pagesRead} trang DataTables (${rows.length} bản ghi). Báo cáo chỉ hiển thị số lượng tổng hợp, không lưu tên hoặc mã học sinh thật.`
      : `Đã đọc ${pageReadResult.pagesRead} trang DataTables (${rows.length} bản ghi), nhưng nguồn không cung cấp mã phiên bản dữ liệu nên chưa xác minh tính nhất quán giữa các trang.`,
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
    snapshotConsistent: consistencyVerified,
    snapshotVersion: pageReadResult.snapshotVersion ?? null,
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

export const CANONICAL_M4_SYNTHETIC_STUDENTS = new Map([
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

export function buildCanonicalM4SyncedClassName(classCode) {
  const code = normalizeClassCode(classCode);
  return `Lớp Robotics ${code} (Mới đồng bộ — Chờ Admin gán khóa học)`;
}

export function validateCanonicalM4SyntheticDiffReport(diffReport) {
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

export function validateRealTeachingSyncDiffReport(diffReport) {
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

/**
 * Pure state transition function that applies a confirmed Teaching sync diff
 * to state (`classes`, `students`, `users`).
 *
 * Guarantees:
 * - Accepts `diffReport.sourceMode === 'synthetic_fixture'` (TEST) or `'real_teaching_sync'` (Mốc 6 PROD).
 *   Rejects `'real_teaching_preview'` or unknown modes.
 * - Idempotent: running the same snapshot again produces 0 duplicate classes
 *   and 0 duplicate students.
 * - Preserves `pinHash`, `hasPin`, `pinIssuedAt`, `participantId`, `originalClassId`,
 *   passwords, quizResults, and submissions.
 * - Never auto-issues PINs (`pinHash: null, hasPin: false, pinIssuedAt: null` on new students)
 *   and never generates PIN CSVs.
 * - Never deletes absent students or classes.
 * - Never reopens archived students or classes.
 *
 * @param {Object} currentState - `{ classes, students, users, quizResults?, submissions? }`
 * @param {Object} diffReport - Report returned by `classifyAndDiffTeachingSnapshot`
 */
export function buildLosslessDeterministicId(prefix, rawCode) {
  const encoded = Array.from(String(rawCode || '')).map((ch) =>
    /^[A-Za-z0-9]$/.test(ch)
      ? ch.toLowerCase()
      : `_x${ch.codePointAt(0).toString(16).padStart(4, '0')}_`
  );
  return `${prefix}${encoded.join('')}`;
}

export function applyTeachingSyncDiffToState(currentState, diffReport) {
  if (!diffReport || typeof diffReport !== 'object') {
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
        'Chốt chặn an toàn Mốc 4: Tuyệt đối không áp dụng danh sách học sinh Teaching thật vào TEST. Việc áp dụng dữ liệu thật chỉ được phép ở Mốc 6 sau khi Owner phê duyệt riêng.',
      state: currentState,
    };
  }

  if (isRealTeachingSync) {
    const realValidation = validateRealTeachingSyncDiffReport(diffReport);
    if (!realValidation.valid) {
      return {
        success: false,
        code: realValidation.code || 'INVALID_DIFF_REPORT',
        message: realValidation.message,
        state: currentState,
      };
    }
  }

  const prevClasses = Array.isArray(currentState.classes) ? [...currentState.classes] : [];
  const prevStudents = Array.isArray(currentState.students) ? [...currentState.students] : [];
  const prevUsers = Array.isArray(currentState.users) ? [...currentState.users] : [];

  const classByCode = new Map();
  const usedClassIds = new Set();
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
      status: 'active',
      is14SessionsConfirmed: false,
    };
    prevClasses.push(createdClass);
    classByCode.set(code, createdClass);
    usedClassIds.add(deterministicClassId);
    createdClassesCount++;
  }

  const studentIndexByCode = new Map();
  const usedStudentIds = new Set();
  const usedParticipantIds = new Set();
  for (let idx = 0; idx < prevStudents.length; idx++) {
    const code = String(prevStudents[idx].studentCode || '').trim().toUpperCase();
    if (code) studentIndexByCode.set(code, idx);
    if (prevStudents[idx].id) usedStudentIds.add(String(prevStudents[idx].id));
    if (prevStudents[idx].participantId) usedParticipantIds.add(String(prevStudents[idx].participantId));
  }

  const userIndexByCode = new Map();
  const usedUserIds = new Set();
  for (let idx = 0; idx < prevUsers.length; idx++) {
    const code = String(prevUsers[idx].studentCode || '').trim().toUpperCase();
    if (code) userIndexByCode.set(code, idx);
    if (prevUsers[idx].id) usedUserIds.add(String(prevUsers[idx].id));
  }

  let addedStudentsCount = 0;
  let updatedStudentsCount = 0;

  // Apply updates to existing active students (name only, preserving PIN/Auth/Grades)
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
      // Explicitly preserve all security/grade/batch fields
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

  // Apply added valid students (never auto-issuing PINs)
  const addedList = Array.isArray(diffReport.added) ? diffReport.added : [];
  for (const item of addedList) {
    const code = String(item.id || '').trim().toUpperCase();
    if (!code || studentIndexByCode.has(code)) continue; // Idempotent guard against duplicates

    const classCode = normalizeClassCode(item.classCode);
    const targetClass = classByCode.get(classCode);
    if (!targetClass || targetClass.status !== 'active') continue;

    const deterministicId = buildLosslessDeterministicId('usr_stu_sync_', code);
    const deterministicParticipantId = buildLosslessDeterministicId('part_sync_', code);

    if (
      usedStudentIds.has(deterministicId) ||
      usedParticipantIds.has(deterministicParticipantId) ||
      (!userIndexByCode.has(code) && usedUserIds.has(deterministicId))
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
      status: 'active',
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
        role: 'student',
        status: 'active',
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

/**
 * High-level helper that executes full multi-page DataTables validation AND
 * diffs against the current TEST roster in one step.
 *
 * @param {any} fixtureInput - Multi-page fixture (`{ pages: [...] }`) or single page payload
 * @param {Object} currentState - `{ students, classes }`
 * @param {Object} [options] - `{ robFilterMode?: 'include_rob' | 'exclude_rob', allowConfirmedClassChange?: boolean, sourceMode?: string }`
 */
export async function runTeachingSnapshotPreview(fixtureInput, currentState = {}, options = {}) {
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

  // If running in real_source mode, NEVER return individual rows/names/IDs in `report`!
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
      consistencyVerified: pageReadResult.consistencyVerified,
      snapshotVersion: pageReadResult.snapshotVersion,
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
