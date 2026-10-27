/**
 * Core reader logic for Teaching MindX read-only DOM spike (Milestone 1 - C2 / E2)
 * and Milestone 4 multi-page DataTables read-only aggregate preview.
 *
 * SPECIFICATION & SAFETY CONTRACT (M1-E2 & M4 Hardened):
 * 1. STRICT ORIGIN & PATH GUARD:
 *    - Only accepts exact origin 'https://teachingmindx.top' and exact pathname '/hocsinh.php'.
 *    - Rejects variations (/not-hocsinh.php, /hocsinh.php-extra, /admin/hocsinh.php).
 *    - Returns FIXED error message without echoing arbitrary origin or pathname into the panel.
 * 2. TABLE MATCHING EVIDENCE:
 *    - Matches 8 expected columns from 2026-10-14 DOM inspection:
 *      ['STT', 'Tên học sinh', 'Mã lớp', 'Trạng thái học sinh', 'GV chính', 'Trợ giảng', 'Trạng thái lớp', 'Thao tác']
 *    - Error message reports only column count, never echoes unvalidated/arbitrary header text.
 *    - Valid result exposes only static metadata columns.
 * 3. ZERO PERSONAL DATA EXTRACTION (NO TEXTCONTENT ON DATA CELLS IN M1 DOM SPIKE;
 *    AGGREGATE NUMBERS ONLY IN M4 DATATABLES PAGINATION PREVIEW):
 *    - Counts valid rows using DOM structure & attributes only in M1 DOM mode.
 *    - In M4 DataTables multi-page preview mode, reads same-origin DataTables pages
 *      sequentially until `start >= recordsFiltered`, validates `draw`, `recordsTotal`,
 *      `recordsFiltered`, row count per page, last page, and ID integrity, and outputs
 *      ONLY aggregate numbers (zero student names, codes, or payloads stored/logged/rendered).
 * 4. STRUCTURED SOURCE PAGINATION PARSING:
 *    - Parses strictly formatted pagination numbers (start, end, total).
 *    - Re-renders as static Vietnamese text + numbers.
 *    - Rejects any string with filter/search clauses or adverse names/IDs, falling back to 'Chưa xác định'.
 * 5. PURE CLIENT READ-ONLY:
 *    - Initial `runTeachingReader` performs 0 fetch / XHR / network requests.
 *    - Absolutely NO localStorage / sessionStorage / cookie / IndexedDB.
 *    - Absolutely NO console output of student data.
 *    - Absolutely NO clipboard or download payload.
 *    - Safe DOM manipulation using document.createElement and textContent ONLY.
 * 6. NO CACHE:
 *    - Fresh run on every click; removes existing panel if present.
 * 7. REQUIRED LABELS:
 *    - 'Đọc mẫu trang hiện tại'
 *    - 'Không phải toàn bộ danh sách'
 *    - 'Chỉ đọc — không ghi TEST'
 */

export const TEACHING_ORIGIN = 'https://teachingmindx.top';
export const TEACHING_PATH = '/hocsinh.php';
export const TEACHING_DATATABLES_ENDPOINT = '/hocsinh.php?datatable=students';
export const TEACHING_DEFAULT_PAGE_LENGTH = 15;
export const TEACHING_MAX_SAFE_PAGES = 500;

export const EXPECTED_COLUMNS = [
  'STT',
  'Tên học sinh',
  'Mã lớp',
  'Trạng thái học sinh',
  'GV chính',
  'Trợ giảng',
  'Trạng thái lớp',
  'Thao tác',
];

export const REQUIRED_LABELS = {
  SAMPLE: 'Đọc mẫu trang hiện tại',
  NOT_FULL: 'Không phải toàn bộ danh sách',
  READONLY: 'Chỉ đọc — không ghi TEST',
};

const M4_ACTIVE_STUDENT_STATUSES = ['đang học', 'dang hoc', 'active'];
const M4_INACTIVE_STUDENT_STATUSES = [
  'nghỉ',
  'nghi',
  'nghỉ học',
  'nghi hoc',
  'đã nghỉ',
  'da nghi',
  'đã nghỉ học',
  'da nghi hoc',
  'đã hết khóa',
  'da het khoa',
  'hết khóa',
  'het khoa',
  'bảo lưu',
  'bao luu',
  'tạm dừng',
  'tam dung',
  'inactive',
  'dropped',
  'finished',
];
const M4_ACTIVE_CLASS_STATUSES = ['running', 'đang hoạt động', 'dang hoat dong', 'đang mở', 'dang mo', 'active'];
const M4_INACTIVE_CLASS_STATUSES = [
  'closed',
  'finished',
  'đã đóng',
  'da dong',
  'đóng',
  'dong',
  'đã kết thúc',
  'da ket thuc',
  'đã hết khóa',
  'da het khoa',
  'archived',
];

/**
 * Parses source pagination notice safely.
 * Only accepts clean numeric patterns (start, end, total); rejects search/filter noise.
 * Never echoes raw text that could contain student names/IDs.
 *
 * @param {Element|null} infoEl
 * @returns {string} Safe summary string or 'Chưa xác định'
 */
function parseSafePaginationNotice(infoEl) {
  if (!infoEl) return 'Chưa xác định';

  const raw = (infoEl.textContent || '').trim().replace(/\s+/g, ' ');
  if (!raw) return 'Chưa xác định';

  // Reject noise that might contain student names, search keywords, or filter fragments
  if (/filtered|lọc|search|tìm/i.test(raw)) {
    return 'Chưa xác định';
  }

  // Strict regex: matches only standard pagination statements
  // English: Showing 1 to 25 of 120 entries
  // Vietnamese: Hiển thị 1 đến 25 trong [tổng số] 120 bản ghi/học sinh
  const pattern = /^(?:Showing|Hiển thị)\s+(\d+)\s+(?:to|đến)\s+(\d+)\s+(?:of|trong|trên|trong tổng số)\s+(\d+)\s*(?:entries|bản ghi|học sinh|mục)?\.?$/i;
  const match = raw.match(pattern);

  if (!match) {
    return 'Chưa xác định';
  }

  const startNum = Number(match[1]);
  const endNum = Number(match[2]);
  const totalNum = Number(match[3]);

  if (Number.isNaN(startNum) || Number.isNaN(endNum) || Number.isNaN(totalNum)) {
    return 'Chưa xác định';
  }

  return `Hiển thị ${startNum} - ${endNum} trên tổng số ${totalNum} bản ghi (DOM nguồn)`;
}

/**
 * Inspects a Document and Location for Teaching MindX student roster structure.
 * Pure inspection function: safe for unit testing with JSDOM and live browser execution.
 *
 * @param {Document} doc - DOM Document object
 * @param {Location|Object} loc - Location object ({ origin, pathname })
 * @returns {Object} Inspection result summary (numbers and status ONLY)
 */
export function inspectTeachingDom(doc, loc) {
  const timestamp = new Date().toISOString();

  // Guard 1: Strict Origin & Exact Pathname Verification
  const origin = loc?.origin || '';
  const pathname = loc?.pathname || '';
  const isExactOrigin = origin === TEACHING_ORIGIN;
  const isExactPath = pathname === TEACHING_PATH;

  if (!isExactOrigin || !isExactPath) {
    return {
      success: false,
      code: 'WRONG_ORIGIN',
      // FIXED message: never echoes arbitrary origin or pathname into the panel
      message: `Sai địa chỉ trang. Tiện ích chỉ hoạt động trên ${TEACHING_ORIGIN}${TEACHING_PATH}`,
      visibleCount: 0,
      totalRowsCount: 0,
      sourceTotalNotice: 'Chưa xác định',
      isPlaceholder: false,
      detectedColumns: [],
      timestamp,
    };
  }

  // Guard 2: Login Screen Detection (Checks input type without reading passwords)
  const passwordInput = doc?.querySelector ? doc.querySelector('input[type="password"]') : null;
  const loginForm = doc?.querySelector ? doc.querySelector('form[action*="login"], form.login-form, #login-form') : null;
  if (passwordInput || loginForm) {
    return {
      success: false,
      code: 'LOGIN_REQUIRED',
      message: 'Phát hiện màn hình đăng nhập. Vui lòng đăng nhập Teaching MindX trước khi bấm tiện ích.',
      visibleCount: 0,
      totalRowsCount: 0,
      sourceTotalNotice: 'Chưa xác định',
      isPlaceholder: false,
      detectedColumns: [],
      timestamp,
    };
  }

  // Guard 3: Locate Table and Validate Column Structure
  const tables = doc?.querySelectorAll ? Array.from(doc.querySelectorAll('table')) : [];
  if (tables.length === 0) {
    return {
      success: false,
      code: 'TABLE_NOT_FOUND',
      message: 'Không tìm thấy bảng dữ liệu học sinh nào trên trang.',
      visibleCount: 0,
      totalRowsCount: 0,
      sourceTotalNotice: 'Chưa xác định',
      isPlaceholder: false,
      detectedColumns: [],
      timestamp,
    };
  }

  let targetTable = null;
  let detectedHeaderCount = 0;
  let headerMatch = false;

  for (const table of tables) {
    const headerCells = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th'));
    const headers = headerCells.map((th) => (th.textContent || '').trim().replace(/\s+/g, ' '));
    detectedHeaderCount = headers.length;

    if (headers.length === EXPECTED_COLUMNS.length) {
      const matchesAll = EXPECTED_COLUMNS.every((expectedCol, idx) => {
        const detected = (headers[idx] || '').toLowerCase();
        return detected === expectedCol.toLowerCase();
      });

      if (matchesAll) {
        targetTable = table;
        headerMatch = true;
        break;
      }
    }
  }

  if (!headerMatch || !targetTable) {
    return {
      success: false,
      code: 'INVALID_HEADERS',
      // Fixed error message: does NOT echo arbitrary header text, reports only column count
      message: `Cấu trúc bảng không khớp mẫu đối soát ngày 14/10/2026 (yêu cầu đúng 8 cột: STT, Tên học sinh, Mã lớp, Trạng thái học sinh, GV chính, Trợ giảng, Trạng thái lớp, Thao tác). Phát hiện bảng có ${detectedHeaderCount} cột không hợp lệ.`,
      visibleCount: 0,
      totalRowsCount: 0,
      sourceTotalNotice: 'Chưa xác định',
      isPlaceholder: false,
      detectedColumns: [], // Do NOT return unvalidated header text
      timestamp,
    };
  }

  // Guard 4: Inspect Rows & Count Visible Rows Safely
  // Get body rows, excluding header row
  let rowElements = [];
  const tbody = targetTable.querySelector('tbody');
  if (tbody) {
    rowElements = Array.from(tbody.querySelectorAll('tr'));
  } else {
    const allTrs = Array.from(targetTable.querySelectorAll('tr'));
    rowElements = allTrs.slice(1);
  }

  // Check empty table condition (0 rows)
  if (rowElements.length === 0) {
    return {
      success: true,
      code: 'EMPTY_TABLE',
      message: 'Bảng học sinh hiện tại rỗng (0 dòng dữ liệu).',
      visibleCount: 0,
      totalRowsCount: 0,
      sourceTotalNotice: 'Chưa xác định',
      isPlaceholder: true,
      detectedColumns: EXPECTED_COLUMNS,
      timestamp,
    };
  }

  // Check single row placeholder ONLY via structural classes and attributes
  // CRITICAL: NEVER read singleRow.textContent or cell.textContent (prevents reading personal data of a single student)
  if (rowElements.length === 1) {
    const singleRow = rowElements[0];
    const isEmptyClass = singleRow.querySelector('.dataTables_empty') !== null;
    const singleRowCells = Array.from(singleRow.querySelectorAll('td, th'));

    const isColspanPlaceholder = singleRowCells.length === 1 && (
      (singleRowCells[0].colSpan && singleRowCells[0].colSpan >= 8) ||
      singleRowCells[0].getAttribute('colspan') === '8'
    );

    if (isEmptyClass || isColspanPlaceholder) {
      return {
        success: true,
        code: 'EMPTY_TABLE',
        message: 'Bảng hiển thị trạng thái placeholder: Không có dữ liệu.',
        visibleCount: 0,
        totalRowsCount: 0,
        sourceTotalNotice: 'Chưa xác định',
        isPlaceholder: true,
        detectedColumns: EXPECTED_COLUMNS,
        timestamp,
      };
    }
  }

  // Validate each row structure and count visible rows
  // NEVER read textContent of data rows or individual cells!
  let totalRowsCount = 0;
  let visibleCount = 0;

  for (const row of rowElements) {
    const cells = Array.from(row.querySelectorAll('td, th'));

    // Structure integrity check: each row MUST have exactly 8 cells
    if (cells.length !== EXPECTED_COLUMNS.length) {
      return {
        success: false,
        code: 'INVALID_ROW_STRUCTURE',
        message: `Hàng dữ liệu thứ ${totalRowsCount + 1} có số cột không khớp (${cells.length} thay vì 8 cột). Cấu trúc bảng nguồn đã thay đổi.`,
        visibleCount: 0,
        totalRowsCount,
        sourceTotalNotice: 'Chưa xác định',
        isPlaceholder: false,
        detectedColumns: EXPECTED_COLUMNS,
        timestamp,
      };
    }

    // Determine visibility safely without reading textContent or personal data
    let isRowVisible = true;
    if (row.style && row.style.display === 'none') {
      isRowVisible = false;
    } else if (row.hidden || (typeof row.hasAttribute === 'function' && row.hasAttribute('hidden'))) {
      isRowVisible = false;
    } else if (typeof doc.defaultView?.getComputedStyle === 'function') {
      try {
        const computed = doc.defaultView.getComputedStyle(row);
        if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) {
          isRowVisible = false;
        }
      } catch {
        // Fallback to inline display
      }
    }

    totalRowsCount++;
    if (isRowVisible) {
      visibleCount++;
    }
  }

  // Guard 5: Safe Pagination Notice Parsing (Strict template with numbers only)
  const infoEl = doc.querySelector('.dataTables_info, [role="status"].table-info, .pagination-info');
  const sourceTotalNotice = parseSafePaginationNotice(infoEl);

  return {
    success: true,
    code: 'OK',
    message: `Đã đối soát đúng cấu trúc 8 cột. Đọc thành công ${visibleCount} hàng hiển thị trên trang hiện tại.`,
    visibleCount,
    totalRowsCount,
    sourceTotalNotice,
    isPlaceholder: false,
    detectedColumns: EXPECTED_COLUMNS,
    timestamp,
  };
}

/**
 * Mốc 4 — Reads all DataTables pages sequentially (`start = 0, length, 2*length...`)
 * until `start >= recordsFiltered` and returns ONLY aggregate counts (zero PII).
 *
 * Atomic abort: If any page fails, session expires, `draw` mismatches, `recordsFiltered`
 * changes between pages, last page row count mismatches, or duplicate/missing ID is
 * detected, aborts immediately and discards all partial counts.
 *
 * @param {Document} doc - DOM Document object
 * @param {Location|Object} loc - Location object ({ origin, pathname })
 * @param {Object} [options] - `{ fetchPage?: Function, pageLength?: number, maxPages?: number }`
 * @returns {Promise<Object>} Aggregate-only preview report (numbers and static status ONLY)
 */
export async function inspectTeachingDataTablesAllPages(doc, loc, options = {}) {
  const timestamp = new Date().toISOString();
  const pageLength =
    typeof options.pageLength === 'number' && Number.isInteger(options.pageLength) && options.pageLength > 0
      ? options.pageLength
      : TEACHING_DEFAULT_PAGE_LENGTH;
  const maxPages =
    typeof options.maxPages === 'number' && Number.isInteger(options.maxPages) && options.maxPages > 0
      ? options.maxPages
      : TEACHING_MAX_SAFE_PAGES;

  const makeAbort = (code, message, failedAtPage, pagesRead) => ({
    success: false,
    aborted: true,
    partialApplied: false,
    mode: 'M4_DATATABLES_AGGREGATE_PREVIEW',
    code,
    message,
    failedAtPage,
    pagesRead,
    pageLength,
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
    timestamp,
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

  // 1. Strict Origin & Path Guard
  const origin = loc?.origin || '';
  const pathname = loc?.pathname || '';
  if (origin !== TEACHING_ORIGIN || pathname !== TEACHING_PATH) {
    return makeAbort(
      'WRONG_ORIGIN',
      `Sai địa chỉ trang. Tiện ích chỉ hoạt động trên ${TEACHING_ORIGIN}${TEACHING_PATH}`,
      1,
      0
    );
  }

  // 2. Login Form Guard
  const passwordInput = doc?.querySelector ? doc.querySelector('input[type="password"]') : null;
  const loginForm = doc?.querySelector ? doc.querySelector('form[action*="login"], form.login-form, #login-form') : null;
  if (passwordInput || loginForm) {
    return makeAbort(
      'LOGIN_REQUIRED',
      'Phát hiện màn hình đăng nhập. Phiên làm việc chưa mở hoặc đã hết hạn; hủy toàn bộ lượt đọc.',
      1,
      0
    );
  }

  // Default same-origin page fetcher when running inside https://teachingmindx.top/hocsinh.php
  const defaultSameOriginFetcher = async ({ draw, start, length }) => {
    const winFetch = doc?.defaultView?.fetch || (typeof fetch === 'function' ? fetch : null);
    if (typeof winFetch !== 'function') {
      return { ok: false, status: 0, errorCode: 'FETCH_UNAVAILABLE' };
    }
    const url = `${TEACHING_ORIGIN}${TEACHING_DATATABLES_ENDPOINT}&draw=${draw}&start=${start}&length=${length}`;
    const res = await winFetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (res.redirected && /login/i.test(String(res.url || ''))) {
      return { ok: false, status: 401, redirectedToLogin: true, errorCode: 'SESSION_EXPIRED' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, redirectedToLogin: true, errorCode: 'SESSION_EXPIRED' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, errorCode: 'PAGE_FETCH_ERROR' };
    }
    const headerVersion =
      res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('x-snapshot-version') || res.headers.get('etag') || res.headers.get('last-modified') || null
        : null;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      return { ok: true, status: 200, etag: headerVersion, payload: parsed };
    } catch {
      return { ok: true, status: 200, etag: headerVersion, payload: text };
    }
  };

  const fetchPage = typeof options.fetchPage === 'function' ? options.fetchPage : defaultSameOriginFetcher;

  const seenIds = new Set();
  const idsByNormalizedName = new Map();

  let expectedRecordsTotal = null;
  let expectedRecordsFiltered = null;
  let expectedSnapshotVersion = null;
  let pageIndex = 0;
  let start = 0;

  let totalRowsVerified = 0;
  let robClassRowCount = 0;
  let nonRobClassRowCount = 0;
  let eligibleActiveRobCount = 0;
  let inactiveStatusRowCount = 0;
  let unknownStatusRowCount = 0;

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
    } catch {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'PAGE_FETCH_ERROR',
        `Lỗi kết nối hoặc trình duyệt chặn yêu cầu ở trang ${pageNumber}. Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    if (!response || typeof response !== 'object') {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Phản hồi trang ${pageNumber} không hợp lệ. Đã hủy toàn bộ lượt đọc.`,
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
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'SESSION_EXPIRED',
        `Phiên đăng nhập Teaching đã hết hạn ở trang ${pageNumber} (401/Redirect Login). Đã hủy toàn bộ lượt đọc, không áp dụng một phần dữ liệu.`,
        pageNumber,
        pageIndex
      );
    }

    if (!response.ok || (typeof response.status === 'number' && response.status >= 400)) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        response.errorCode || 'PAGE_FETCH_ERROR',
        `Trang ${pageNumber} trả về lỗi mạng/HTTP (${response.status || 'lỗi'}). Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    const payload = response.payload !== undefined ? response.payload : response;

    if (typeof payload === 'string') {
      seenIds.clear();
      idsByNormalizedName.clear();
      if (/login|password|đăng nhập/i.test(payload)) {
        return makeAbort(
          'SESSION_EXPIRED',
          `Trang ${pageNumber} trả về HTML đăng nhập thay vì JSON DataTables. Phiên đã hết hạn; hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Trang ${pageNumber} không phải JSON DataTables hợp lệ. Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Cấu trúc phản hồi DataTables ở trang ${pageNumber} bị sai lệch. Đã hủy toàn bộ lượt đọc.`,
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
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'MALFORMED_DATATABLES_PAYLOAD',
        `Trang ${pageNumber} thiếu các trường bắt buộc draw, recordsTotal, recordsFiltered hoặc data. Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (draw !== requestedDraw) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'DRAW_MISMATCH',
        `Tham số draw ở trang ${pageNumber} không khớp (yêu cầu ${requestedDraw}, nhận ${draw}). Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    if (recordsTotal !== recordsFiltered) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'UNEXPECTED_SOURCE_FILTER',
        `Nguồn DataTables ở trang ${pageNumber} đang có bộ lọc (recordsTotal=${recordsTotal} khác recordsFiltered=${recordsFiltered}). Đã hủy toàn bộ lượt đọc.`,
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
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'TOTAL_CHANGED_BETWEEN_PAGES',
        `Tổng số bản ghi thay đổi giữa các trang (trang 1: ${expectedRecordsFiltered}, trang ${pageNumber}: ${recordsFiltered}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
        pageNumber,
        pageIndex
      );
    } else if (
      (expectedSnapshotVersion !== null || pageSnapshotVersion !== null) &&
      pageSnapshotVersion !== expectedSnapshotVersion
    ) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        'SNAPSHOT_VERSION_CHANGED_BETWEEN_PAGES',
        `Phiên bản dữ liệu nguồn thay đổi giữa các trang (trang 1 khác trang ${pageNumber}). Đã hủy toàn bộ lượt đọc, không áp dụng một phần.`,
        pageNumber,
        pageIndex
      );
    }

    if (expectedRecordsFiltered === 0) {
      if (data.length !== 0) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'PAGE_ROW_COUNT_MISMATCH',
          `Trang 1 báo 0 bản ghi nhưng trả về ${data.length} dòng. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }
      pageIndex++;
      break;
    }

    const remainingRows = expectedRecordsFiltered - start;
    const expectedPageRows = Math.min(pageLength, remainingRows);
    const isLastPage = start + expectedPageRows >= expectedRecordsFiltered;

    if (data.length !== expectedPageRows) {
      seenIds.clear();
      idsByNormalizedName.clear();
      return makeAbort(
        isLastPage ? 'LAST_PAGE_ROW_COUNT_MISMATCH' : 'PAGE_ROW_COUNT_MISMATCH',
        isLastPage
          ? `Số dòng ở trang cuối (trang ${pageNumber}) không khớp (kỳ vọng ${expectedPageRows} dòng, nhận ${data.length} dòng). Đã hủy toàn bộ lượt đọc.`
          : `Số dòng ở trang ${pageNumber} không khớp (kỳ vọng ${expectedPageRows} dòng, nhận ${data.length} dòng). Đã hủy toàn bộ lượt đọc.`,
        pageNumber,
        pageIndex
      );
    }

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      const globalRowNumber = start + rowIdx + 1;

      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) sai cấu trúc đối tượng. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      if (row.id === undefined || row.id === null) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'MISSING_STUDENT_ID',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) thiếu trường định danh id. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      if (
        (typeof row.id !== 'string' && typeof row.id !== 'number') ||
        (typeof row.id === 'number' && !Number.isFinite(row.id))
      ) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) có trường định danh id sai kiểu dữ liệu. Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      const rawId = String(row.id).trim();
      if (!rawId) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'MISSING_STUDENT_ID',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) thiếu trường định danh id. Đã hủy toàn bộ lượt đọc.`,
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
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'MALFORMED_ROW_STRUCTURE',
          `Bản ghi thứ ${globalRowNumber} (trang ${pageNumber}) thiếu trường bắt buộc (student_name, class_code, status, class_status). Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }

      const normId = rawId.toUpperCase();
      if (seenIds.has(normId)) {
        seenIds.clear();
        idsByNormalizedName.clear();
        return makeAbort(
          'DUPLICATE_STUDENT_ID',
          `Phát hiện mã id trùng lặp tại bản ghi thứ ${globalRowNumber} (trang ${pageNumber}). Đã hủy toàn bộ lượt đọc.`,
          pageNumber,
          pageIndex
        );
      }
      seenIds.add(normId);
      totalRowsVerified++;

      const hasRob = /rob/i.test(row.class_code);
      if (hasRob) {
        robClassRowCount++;
      } else {
        nonRobClassRowCount++;
      }

      const normStuStatus = row.status.trim().replace(/\s+/g, ' ').toLowerCase();
      const normClsStatus = row.class_status.trim().replace(/\s+/g, ' ').toLowerCase();

      const stuActive = M4_ACTIVE_STUDENT_STATUSES.includes(normStuStatus);
      const stuInactive = M4_INACTIVE_STUDENT_STATUSES.includes(normStuStatus);
      const clsActive = M4_ACTIVE_CLASS_STATUSES.includes(normClsStatus);
      const clsInactive = M4_INACTIVE_CLASS_STATUSES.includes(normClsStatus);

      if ((!stuActive && !stuInactive) || !clsActive && !clsInactive) {
        unknownStatusRowCount++;
      } else if (stuInactive || clsInactive) {
        inactiveStatusRowCount++;
      } else if (hasRob && stuActive && clsActive) {
        eligibleActiveRobCount++;
      }

      const normName = row.student_name
        .replace(/\([^)]*\)/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (normName) {
        if (!idsByNormalizedName.has(normName)) {
          idsByNormalizedName.set(normName, new Set());
        }
        idsByNormalizedName.get(normName).add(normId);
      }
    }

    pageIndex++;
    start += data.length;
    if (start >= expectedRecordsFiltered) {
      break;
    }
  }

  if (expectedRecordsFiltered !== null && start < expectedRecordsFiltered) {
    seenIds.clear();
    idsByNormalizedName.clear();
    return makeAbort(
      'MAX_PAGES_EXCEEDED',
      `Vượt ngưỡng an toàn số trang tối đa (${maxPages} trang) trước khi đọc đủ ${expectedRecordsFiltered} bản ghi. Đã hủy toàn bộ lượt đọc.`,
      pageIndex,
      pageIndex
    );
  }

  if (totalRowsVerified !== (expectedRecordsFiltered ?? 0)) {
    seenIds.clear();
    idsByNormalizedName.clear();
    return makeAbort(
      'TOTAL_ROW_COUNT_MISMATCH',
      `Tổng số dòng thu thập (${totalRowsVerified}) không khớp recordsFiltered (${expectedRecordsFiltered}). Đã hủy toàn bộ lượt đọc.`,
      pageIndex,
      pageIndex
    );
  }

  let sameNameDifferentIdCount = 0;
  for (const idSet of idsByNormalizedName.values()) {
    if (idSet.size > 1) {
      sameNameDifferentIdCount += idSet.size;
    }
  }

  const uniqueIdCount = seenIds.size;
  const consistencyVerified = pageIndex <= 1 || expectedSnapshotVersion !== null;
  // Explicitly clear temporary sets so no student names or IDs remain referenced
  seenIds.clear();
  idsByNormalizedName.clear();

  return {
    success: true,
    aborted: false,
    partialApplied: false,
    mode: 'M4_DATATABLES_AGGREGATE_PREVIEW',
    code: 'OK',
    message: consistencyVerified
      ? `Đã đọc và đối chiếu nhất quán toàn bộ ${pageIndex} trang DataTables (${totalRowsVerified}/${expectedRecordsFiltered ?? 0} bản ghi). Chỉ hiển thị số lượng tổng hợp, không lưu tên hay mã học sinh thật.`
      : `Đã đọc ${pageIndex} trang DataTables (${totalRowsVerified}/${expectedRecordsFiltered ?? 0} bản ghi), nhưng nguồn không cung cấp mã phiên bản dữ liệu nên chưa xác minh tính nhất quán giữa các trang.`,
    pagesRead: pageIndex,
    pageLength,
    recordsTotal: expectedRecordsTotal ?? 0,
    recordsFiltered: expectedRecordsFiltered ?? 0,
    lastPageRowCount:
      pageIndex === 0 || (expectedRecordsFiltered ?? 0) === 0
        ? 0
        : (expectedRecordsFiltered ?? 0) - (pageIndex - 1) * pageLength,
    totalRowsVerified,
    uniqueIdCount,
    robClassRowCount,
    nonRobClassRowCount,
    eligibleActiveRobCount,
    inactiveStatusRowCount,
    unknownStatusRowCount,
    sameNameDifferentIdCount,
    consistencyVerified,
    snapshotConsistent: consistencyVerified,
    snapshotVersion: expectedSnapshotVersion,
    piiStoredOrSent: false,
    timestamp,
  };
}

/**
 * Renders the Mốc 4 aggregate pagination preview results inside the floating panel
 * using `document.createElement` and `textContent` ONLY.
 *
 * @param {Document} doc
 * @param {HTMLElement} containerEl
 * @param {Object} m4Result - Result from `inspectTeachingDataTablesAllPages`
 */
export function renderTeachingM4AggregateSection(doc, containerEl, m4Result) {
  while (containerEl.firstChild) {
    containerEl.removeChild(containerEl.firstChild);
  }

  const box = doc.createElement('div');
  box.style.marginTop = '8px';
  box.style.padding = '10px 12px';
  box.style.borderRadius = '8px';
  box.style.fontSize = '11.5px';
  box.style.border = m4Result.success ? '1px solid #86efac' : '1px solid #fecdd3';
  box.style.backgroundColor = m4Result.success ? '#f0fdf4' : '#fff1f2';
  box.style.color = m4Result.success ? '#166534' : '#9f1239';

  const header = doc.createElement('div');
  header.style.fontWeight = '800';
  header.style.marginBottom = '4px';
  header.textContent = m4Result.success
    ? m4Result.consistencyVerified
      ? `✓ KẾT QUẢ XEM TRƯỚC TỔNG HỢP MỐC 4 (${m4Result.pagesRead} TRANG — ĐÃ XÁC MINH NHẤT QUÁN)`
      : `⚠ KẾT QUẢ XEM TRƯỚC TỔNG HỢP MỐC 4 (${m4Result.pagesRead} TRANG — CHƯA XÁC MINH PHIÊN BẢN NGUỒN)`
    : `✕ HỦY TOÀN LƯỢT ĐỌC MỐC 4 (${m4Result.code}) — KHÔNG ÁP DỤNG MỘT PHẦN`;
  box.appendChild(header);

  const msg = doc.createElement('div');
  msg.style.marginBottom = '8px';
  msg.textContent = m4Result.message;
  box.appendChild(msg);

  if (m4Result.success) {
    const grid = doc.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '6px';

    const items = [
      ['Số trang đã đọc hết:', `${m4Result.pagesRead} trang (cỡ ${m4Result.pageLength})`],
      ['Tổng khớp (Total/Filtered):', `${m4Result.recordsTotal} / ${m4Result.recordsFiltered}`],
      ['Số dòng trang cuối:', `${m4Result.lastPageRowCount} dòng`],
      ['Mã ID duy nhất hợp lệ:', `${m4Result.uniqueIdCount} mã`],
      ['Dòng lớp ROB / Ngoài ROB:', `${m4Result.robClassRowCount} / ${m4Result.nonRobClassRowCount}`],
      ['Hợp lệ (ROB + Đang học):', `${m4Result.eligibleActiveRobCount} học sinh`],
      ['Bỏ qua (Nghỉ / Đóng lớp):', `${m4Result.inactiveStatusRowCount} dòng`],
      ['Cần xem xét (TT lạ / Trùng tên):', `${m4Result.unknownStatusRowCount + m4Result.sameNameDifferentIdCount} dòng`],
    ];

    for (const [label, val] of items) {
      const cell = doc.createElement('div');
      cell.style.padding = '5px 7px';
      cell.style.backgroundColor = '#ffffff';
      cell.style.border = '1px solid #bbf7d0';
      cell.style.borderRadius = '6px';

      const lEl = doc.createElement('div');
      lEl.style.fontSize = '10px';
      lEl.style.color = '#475569';
      lEl.textContent = label;

      const vEl = doc.createElement('div');
      vEl.style.fontSize = '12px';
      vEl.style.fontWeight = '800';
      vEl.style.color = '#0f172a';
      vEl.textContent = val;

      cell.appendChild(lEl);
      cell.appendChild(vEl);
      grid.appendChild(cell);
    }

    box.appendChild(grid);
  }

  containerEl.appendChild(box);
}

/**
 * Creates and renders the in-place floating panel on the DOM using textContent & createElement ONLY.
 * Removes any previous panel to prevent stale caching.
 *
 * @param {Document} doc - DOM Document object
 * @param {Object} result - Result from inspectTeachingDom
 * @param {Location|Object} [loc] - Optional location object for M4 action button
 * @returns {HTMLElement} The created panel element
 */
export function renderTeachingPanel(doc, result, loc = null) {
  const PANEL_ID = 'teaching-readonly-spike-panel';

  // Fresh run: remove old panel if present
  const existing = doc.getElementById(PANEL_ID);
  if (existing && typeof existing.remove === 'function') {
    existing.remove();
  }

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Bảng thông báo tiện ích đọc Teaching cục bộ');

  // Strict inline styling for clean floating overlay
  panel.style.position = 'fixed';
  panel.style.top = '16px';
  panel.style.right = '16px';
  panel.style.width = '410px';
  panel.style.maxWidth = 'calc(100vw - 32px)';
  panel.style.maxHeight = 'calc(100vh - 32px)';
  panel.style.overflowY = 'auto';
  panel.style.backgroundColor = '#ffffff';
  panel.style.color = '#0f172a';
  panel.style.border = result.success ? '2px solid #2563eb' : '2px solid #e11d48';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)';
  panel.style.zIndex = '2147483647';
  panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  panel.style.fontSize = '13px';
  panel.style.lineHeight = '1.45';
  panel.style.padding = '16px';
  panel.style.boxSizing = 'border-box';

  // 1. Header Container
  const header = doc.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.paddingBottom = '10px';
  header.style.borderBottom = '1px solid #e2e8f0';

  const titleGroup = doc.createElement('div');

  const badge = doc.createElement('div');
  badge.textContent = 'MỐC 1 & MỐC 4 — TIỆN ÍCH CỤC BỘ CHỈ ĐỌC';
  badge.style.fontSize = '10px';
  badge.style.fontWeight = '700';
  badge.style.letterSpacing = '0.5px';
  badge.style.color = result.success ? '#1d4ed8' : '#be123c';
  badge.style.marginBottom = '2px';

  const title = doc.createElement('div');
  title.textContent = 'Tiện ích Đếm & Xem trước Teaching';
  title.style.fontSize = '15px';
  title.style.fontWeight = '800';
  title.style.color = '#0f172a';

  titleGroup.appendChild(badge);
  titleGroup.appendChild(title);

  // Close button MUST remain the first <button> inside the panel for M1 tests
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕ Đóng';
  closeBtn.style.background = '#f1f5f9';
  closeBtn.style.color = '#475569';
  closeBtn.style.border = '1px solid #cbd5e1';
  closeBtn.style.borderRadius = '6px';
  closeBtn.style.padding = '4px 8px';
  closeBtn.style.fontSize = '11px';
  closeBtn.style.fontWeight = '600';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => {
    panel.remove();
  };

  header.appendChild(titleGroup);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // 2. Mandatory Warning Badges
  const badgesRow = doc.createElement('div');
  badgesRow.style.display = 'flex';
  badgesRow.style.flexWrap = 'wrap';
  badgesRow.style.gap = '6px';
  badgesRow.style.marginTop = '10px';

  const labels = [REQUIRED_LABELS.SAMPLE, REQUIRED_LABELS.NOT_FULL, REQUIRED_LABELS.READONLY];
  for (const labelText of labels) {
    const lbl = doc.createElement('span');
    lbl.textContent = labelText;
    lbl.style.display = 'inline-block';
    lbl.style.padding = '2px 6px';
    lbl.style.fontSize = '10.5px';
    lbl.style.fontWeight = '700';
    lbl.style.borderRadius = '4px';
    lbl.style.backgroundColor = '#eff6ff';
    lbl.style.color = '#1e40af';
    lbl.style.border = '1px solid #bfdbfe';
    badgesRow.appendChild(lbl);
  }
  panel.appendChild(badgesRow);

  // 3. Status Alert Box
  const statusBox = doc.createElement('div');
  statusBox.style.marginTop = '12px';
  statusBox.style.padding = '10px 12px';
  statusBox.style.borderRadius = '8px';
  statusBox.style.fontSize = '12px';
  statusBox.style.fontWeight = '500';

  if (result.success) {
    statusBox.style.backgroundColor = '#f0fdf4';
    statusBox.style.border = '1px solid #86efac';
    statusBox.style.color = '#166534';

    const statusTitle = doc.createElement('div');
    statusTitle.textContent = result.isPlaceholder
      ? 'ℹ THÔNG BÁO: BẢNG KHÔNG CÓ HÀNG DỮ LIỆU'
      : '✓ ĐÃ NHẬN DIỆN ĐÚNG BẢNG HỌC SINH (8 CỘT)';
    statusTitle.style.fontWeight = '700';
    statusTitle.style.marginBottom = '2px';

    const statusDesc = doc.createElement('div');
    statusDesc.textContent = result.message;

    statusBox.appendChild(statusTitle);
    statusBox.appendChild(statusDesc);
  } else {
    statusBox.style.backgroundColor = '#fff1f2';
    statusBox.style.border = '1px solid #fecdd3';
    statusBox.style.color = '#9f1239';

    const statusTitle = doc.createElement('div');
    statusTitle.textContent = `✕ DỪNG LƯỢT ĐỌC (${result.code})`;
    statusTitle.style.fontWeight = '700';
    statusTitle.style.marginBottom = '2px';

    const statusDesc = doc.createElement('div');
    statusDesc.textContent = result.message;

    statusBox.appendChild(statusTitle);
    statusBox.appendChild(statusDesc);
  }
  panel.appendChild(statusBox);

  // 4. Metrics Grid (Visible Count, DOM Rows)
  const metricsGrid = doc.createElement('div');
  metricsGrid.style.marginTop = '12px';
  metricsGrid.style.display = 'grid';
  metricsGrid.style.gridTemplateColumns = '1fr 1fr';
  metricsGrid.style.gap = '8px';

  // Visible Count Card
  const visibleCard = doc.createElement('div');
  visibleCard.style.padding = '8px 10px';
  visibleCard.style.backgroundColor = '#f8fafc';
  visibleCard.style.border = '1px solid #e2e8f0';
  visibleCard.style.borderRadius = '8px';

  const visibleTitle = doc.createElement('div');
  visibleTitle.textContent = 'Số hàng nhìn thấy:';
  visibleTitle.style.fontSize = '11px';
  visibleTitle.style.color = '#64748b';

  const visibleValue = doc.createElement('div');
  visibleValue.textContent = `${result.visibleCount} hàng`;
  visibleValue.style.fontSize = '18px';
  visibleValue.style.fontWeight = '800';
  visibleValue.style.color = result.success ? '#15803d' : '#94a3b8';

  visibleCard.appendChild(visibleTitle);
  visibleCard.appendChild(visibleValue);

  // Total DOM Rows Card
  const totalCard = doc.createElement('div');
  totalCard.style.padding = '8px 10px';
  totalCard.style.backgroundColor = '#f8fafc';
  totalCard.style.border = '1px solid #e2e8f0';
  totalCard.style.borderRadius = '8px';

  const totalTitle = doc.createElement('div');
  totalTitle.textContent = 'Tổng hàng trong DOM:';
  totalTitle.style.fontSize = '11px';
  totalTitle.style.color = '#64748b';

  const totalValue = doc.createElement('div');
  totalValue.textContent = `${result.totalRowsCount} hàng`;
  totalValue.style.fontSize = '18px';
  totalValue.style.fontWeight = '800';
  totalValue.style.color = '#334155';

  totalCard.appendChild(totalTitle);
  totalCard.appendChild(totalValue);

  metricsGrid.appendChild(visibleCard);
  metricsGrid.appendChild(totalCard);
  panel.appendChild(metricsGrid);

  // 5. Source Pagination / Total Notice Card
  const paginationCard = doc.createElement('div');
  paginationCard.style.marginTop = '8px';
  paginationCard.style.padding = '8px 10px';
  paginationCard.style.backgroundColor = '#f8fafc';
  paginationCard.style.border = '1px solid #e2e8f0';
  paginationCard.style.borderRadius = '8px';

  const paginationTitle = doc.createElement('div');
  paginationTitle.textContent = 'Thông báo phân trang nguồn (DOM):';
  paginationTitle.style.fontSize = '11px';
  paginationTitle.style.color = '#64748b';

  const paginationVal = doc.createElement('div');
  paginationVal.textContent = result.sourceTotalNotice;
  paginationVal.style.fontSize = '12px';
  paginationVal.style.fontWeight = '600';
  paginationVal.style.color = '#1e293b';
  paginationVal.style.marginTop = '2px';

  paginationCard.appendChild(paginationTitle);
  paginationCard.appendChild(paginationVal);
  panel.appendChild(paginationCard);

  // 5b. Mốc 4 Multi-Page DataTables Aggregate Preview Action (only runs on explicit click)
  const m4Section = doc.createElement('div');
  m4Section.id = 'teaching-m4-preview-section';
  m4Section.style.marginTop = '10px';
  m4Section.style.paddingTop = '10px';
  m4Section.style.borderTop = '1px dashed #cbd5e1';

  const m4Btn = doc.createElement('button');
  m4Btn.type = 'button';
  m4Btn.id = 'teaching-m4-run-pagination-btn';
  m4Btn.textContent = '📊 Xem trước toàn bộ phân trang DataTables (Mốc 4 — Tổng hợp)';
  m4Btn.style.width = '100%';
  m4Btn.style.padding = '8px 10px';
  m4Btn.style.backgroundColor = '#1d4ed8';
  m4Btn.style.color = '#ffffff';
  m4Btn.style.border = 'none';
  m4Btn.style.borderRadius = '8px';
  m4Btn.style.fontSize = '11.5px';
  m4Btn.style.fontWeight = '700';
  m4Btn.style.cursor = 'pointer';

  const m4Output = doc.createElement('div');
  m4Output.id = 'teaching-m4-preview-output';

  m4Btn.onclick = async () => {
    m4Btn.disabled = true;
    m4Btn.textContent = '⏳ Đang đọc và kiểm tra từng trang DataTables...';
    const targetLoc = loc || (typeof window !== 'undefined' ? window.location : { origin: TEACHING_ORIGIN, pathname: TEACHING_PATH });
    const m4Res = await inspectTeachingDataTablesAllPages(doc, targetLoc);
    m4Btn.disabled = false;
    m4Btn.textContent = '↻ Chạy lại Xem trước toàn bộ phân trang (Mốc 4)';
    renderTeachingM4AggregateSection(doc, m4Output, m4Res);
  };

  m4Section.appendChild(m4Btn);
  m4Section.appendChild(m4Output);
  panel.appendChild(m4Section);

  // 6. Safety Commitments Notice
  const safetyNote = doc.createElement('div');
  safetyNote.style.marginTop = '12px';
  safetyNote.style.padding = '8px 10px';
  safetyNote.style.backgroundColor = '#f8fafc';
  safetyNote.style.borderRadius = '6px';
  safetyNote.style.borderLeft = '3px solid #3b82f6';
  safetyNote.style.fontSize = '11px';
  safetyNote.style.color = '#475569';
  safetyNote.textContent =
    'Cam kết an toàn: Tiện ích hoạt động thuần túy trong trình duyệt. Không đọc mật khẩu/cookie, không lưu hoặc gửi họ tên/ID học sinh thật vào TEST, tệp hay log.';
  panel.appendChild(safetyNote);

  // 7. Footer timestamp
  const footer = doc.createElement('div');
  footer.style.marginTop = '10px';
  footer.style.fontSize = '10px';
  footer.style.color = '#94a3b8';
  footer.style.textAlign = 'right';
  footer.textContent = `Thời điểm kiểm tra: ${result.timestamp}`;
  panel.appendChild(footer);

  return panel;
}

/**
 * Top-level reader execution function.
 * Called directly in the browser bookmarklet context or in QA fixture pages.
 *
 * @param {Document} [doc=document] - Target Document
 * @param {Location} [loc=window.location] - Target Location
 * @returns {Object} Inspection result
 */
export function runTeachingReader(doc = (typeof document !== 'undefined' ? document : null), loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (!doc) {
    return { success: false, code: 'NO_DOCUMENT', message: 'Không tìm thấy đối tượng Document.' };
  }
  const result = inspectTeachingDom(doc, loc);
  const panel = renderTeachingPanel(doc, result, loc);
  if (doc.body) {
    doc.body.appendChild(panel);
  }
  return result;
}
