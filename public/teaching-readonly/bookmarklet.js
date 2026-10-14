(function(){
/**
 * Core reader logic for Teaching MindX read-only DOM spike (Milestone 1 - C2 / E2)
 *
 * SPECIFICATION & SAFETY CONTRACT (M1-E2 Hardened):
 * 1. STRICT ORIGIN & PATH GUARD:
 *    - Only accepts exact origin 'https://teachingmindx.top' and exact pathname '/hocsinh.php'.
 *    - Rejects variations (/not-hocsinh.php, /hocsinh.php-extra, /admin/hocsinh.php).
 *    - Returns FIXED error message without echoing arbitrary origin or pathname into the panel.
 * 2. TABLE MATCHING EVIDENCE:
 *    - Matches 8 expected columns from 2026-10-14 DOM inspection:
 *      ['STT', 'Tên học sinh', 'Mã lớp', 'Trạng thái học sinh', 'GV chính', 'Trợ giảng', 'Trạng thái lớp', 'Thao tác']
 *    - Error message reports only column count, never echoes unvalidated/arbitrary header text.
 *    - Valid result exposes only static metadata columns.
 * 3. ZERO PERSONAL DATA EXTRACTION (NO TEXTCONTENT ON DATA CELLS):
 *    - Counts valid rows using DOM structure & attributes only.
 *    - Never accesses row.textContent or cell.textContent for data rows.
 *    - Empty placeholder detected strictly via .dataTables_empty or single cell colspan >= 8.
 *    - Single data row with 8 cells is counted as 1 student row without reading any text.
 * 4. STRUCTURED SOURCE PAGINATION PARSING:
 *    - Parses strictly formatted pagination numbers (start, end, total).
 *    - Re-renders as static Vietnamese text + numbers.
 *    - Rejects any string with filter/search clauses or adverse names/IDs, falling back to 'Chưa xác định'.
 * 5. PURE CLIENT DOM:
 *    - Absolutely NO fetch / XHR / network requests.
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

const TEACHING_ORIGIN = 'https://teachingmindx.top';
const TEACHING_PATH = '/hocsinh.php';

const EXPECTED_COLUMNS = [
  'STT',
  'Tên học sinh',
  'Mã lớp',
  'Trạng thái học sinh',
  'GV chính',
  'Trợ giảng',
  'Trạng thái lớp',
  'Thao tác',
];

const REQUIRED_LABELS = {
  SAMPLE: 'Đọc mẫu trang hiện tại',
  NOT_FULL: 'Không phải toàn bộ danh sách',
  READONLY: 'Chỉ đọc — không ghi TEST',
};

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
function inspectTeachingDom(doc, loc) {
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
 * Creates and renders the in-place floating panel on the DOM using textContent & createElement ONLY.
 * Removes any previous panel to prevent stale caching.
 *
 * @param {Document} doc - DOM Document object
 * @param {Object} result - Result from inspectTeachingDom
 * @returns {HTMLElement} The created panel element
 */
function renderTeachingPanel(doc, result) {
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
  panel.style.width = '390px';
  panel.style.maxWidth = 'calc(100vw - 32px)';
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
  badge.textContent = 'MỐC 1 — SPIKE CỤC BỘ CHỈ ĐỌC';
  badge.style.fontSize = '10px';
  badge.style.fontWeight = '700';
  badge.style.letterSpacing = '0.5px';
  badge.style.color = result.success ? '#1d4ed8' : '#be123c';
  badge.style.marginBottom = '2px';

  const title = doc.createElement('div');
  title.textContent = 'Tiện ích Đếm Học Sinh Teaching';
  title.style.fontSize = '15px';
  title.style.fontWeight = '800';
  title.style.color = '#0f172a';

  titleGroup.appendChild(badge);
  titleGroup.appendChild(title);

  // Close button
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
    'Cam kết an toàn: Tiện ích hoạt động thuần túy trong trình duyệt. Không đọc mật khẩu/cookie, không trích xuất họ tên/ID học sinh, không gửi dữ liệu ra mạng.';
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
function runTeachingReader(doc = (typeof document !== 'undefined' ? document : null), loc = (typeof window !== 'undefined' ? window.location : null)) {
  if (!doc) {
    return { success: false, code: 'NO_DOCUMENT', message: 'Không tìm thấy đối tượng Document.' };
  }
  const result = inspectTeachingDom(doc, loc);
  const panel = renderTeachingPanel(doc, result);
  if (doc.body) {
    doc.body.appendChild(panel);
  }
  return result;
}

// Trigger reader on active page
runTeachingReader(document, window.location);

})();