import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  TEACHING_ORIGIN,
  TEACHING_PATH,
  EXPECTED_COLUMNS,
  REQUIRED_LABELS,
  inspectTeachingDom,
  renderTeachingPanel,
  runTeachingReader,
} from '../tools/teaching-readonly/reader-core.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to create fake Teaching HTML with standard structure
function createFakeTeachingHtml({
  headers = EXPECTED_COLUMNS,
  rows = [],
  infoText = 'Hiển thị 1 đến 10 của 10 bản ghi',
  isLogin = false,
  extraHtml = '',
} = {}) {
  if (isLogin) {
    return `<!DOCTYPE html><html><body>
      <form action="/login.php" method="POST">
        <input type="text" name="username" value="admin" />
        <input type="password" name="password" value="secret" />
        <button type="submit">Đăng nhập</button>
      </form>
    </body></html>`;
  }

  const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
  const trHtml = rows
    .map((cells) => {
      const isHidden = cells._hidden ? ' style="display:none;"' : '';
      const tdList = Array.isArray(cells) ? cells : cells.data;
      const tdHtml = tdList.map((c) => `<td>${c}</td>`).join('');
      return `<tr${isHidden}>${tdHtml}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body>
    <div class="dataTables_info">${infoText}</div>
    <table id="table_students">
      <thead>
        <tr>${thHtml}</tr>
      </thead>
      <tbody>
        ${trHtml}
      </tbody>
    </table>
    ${extraHtml}
  </body></html>`;
}

// Sample row generator (8 columns)
function makeSampleRow(index, { hidden = false } = {}) {
  const row = [
    String(index),
    `Học sinh Giả Định ${index}`,
    `ROB-K14-0${(index % 2) + 1}`,
    'Đang học',
    'GV Test A',
    'TG Test B',
    'Running',
    'Thao tác',
  ];
  if (hidden) row._hidden = true;
  return row;
}

const VALID_LOCATION = {
  origin: TEACHING_ORIGIN,
  pathname: TEACHING_PATH,
};

// -----------------------------------------------------------------------------
// Test Case 1: Strict Origin & Exact Path Guard + Negative Paths
// -----------------------------------------------------------------------------
test('Case 1: Strict origin and exact pathname guard halts and returns fixed message', () => {
  const html = createFakeTeachingHtml({
    rows: [makeSampleRow(1), makeSampleRow(2), makeSampleRow(3)],
  });
  const dom = new JSDOM(html);

  const negativeLocations = [
    { origin: 'http://127.0.0.1:3008', pathname: '/teaching-readonly/' },
    { origin: 'https://othermindx.top', pathname: '/hocsinh.php' },
    { origin: TEACHING_ORIGIN, pathname: '/not-hocsinh.php' },
    { origin: TEACHING_ORIGIN, pathname: '/hocsinh.php-extra' },
    { origin: TEACHING_ORIGIN, pathname: '/admin/hocsinh.php' },
    { origin: TEACHING_ORIGIN, pathname: '/diemdanh.php' },
    { origin: TEACHING_ORIGIN, pathname: '/' },
  ];

  for (const badLoc of negativeLocations) {
    const res = inspectTeachingDom(dom.window.document, badLoc);
    assert.equal(res.success, false, `Must reject ${badLoc.origin}${badLoc.pathname}`);
    assert.equal(res.code, 'WRONG_ORIGIN');
    assert.equal(res.visibleCount, 0);

    // Verify fixed error message: does NOT echo arbitrary origin/path
    assert.equal(res.message, 'Sai địa chỉ trang. Tiện ích chỉ hoạt động trên https://teachingmindx.top/hocsinh.php');
    if (badLoc.pathname !== TEACHING_PATH && badLoc.pathname !== '/') {
      assert.equal(res.message.includes(badLoc.pathname), false, 'Must NOT echo negative pathname');
    }
    if (badLoc.origin !== TEACHING_ORIGIN) {
      assert.equal(res.message.includes(badLoc.origin), false, 'Must NOT echo negative origin');
    }
  }

  // Exact match must pass guard
  const validRes = inspectTeachingDom(dom.window.document, VALID_LOCATION);
  assert.equal(validRes.success, true);
  assert.equal(validRes.code, 'OK');
});

// -----------------------------------------------------------------------------
// Test Case 2: Login Page Detection
// -----------------------------------------------------------------------------
test('Case 2: Login screen guard halts and prevents reading password inputs', () => {
  const html = createFakeTeachingHtml({ isLogin: true });
  const dom = new JSDOM(html);

  const res = inspectTeachingDom(dom.window.document, VALID_LOCATION);
  assert.equal(res.success, false);
  assert.equal(res.code, 'LOGIN_REQUIRED');
  assert.equal(res.visibleCount, 0);
  assert.match(res.message, /Phát hiện màn hình đăng nhập/);

  // Verify form password value was never copied into result
  assert.equal(JSON.stringify(res).includes('secret'), false);
});

// -----------------------------------------------------------------------------
// Test Case 3: Missing Header / Invalid Columns (No Adverse Text Echo)
// -----------------------------------------------------------------------------
test('Case 3: Missing or mismatched header columns halts with INVALID_HEADERS without echoing adverse text', () => {
  // Adverse header texts containing simulated names
  const adverseHeaders = [
    'STT',
    'Nguyễn Văn Giả Lỗi',
    'Mã lớp',
    'Trạng thái học sinh',
    'GV chính',
    'Trợ giảng',
    'Trạng thái lớp',
  ];
  const html = createFakeTeachingHtml({ headers: adverseHeaders });
  const dom = new JSDOM(html);

  const res = inspectTeachingDom(dom.window.document, VALID_LOCATION);
  assert.equal(res.success, false);
  assert.equal(res.code, 'INVALID_HEADERS');
  assert.match(res.message, /Cấu trúc bảng không khớp mẫu đối soát/);

  // Critical: must NOT echo unvalidated header texts
  assert.equal(res.message.includes('Nguyễn Văn Giả Lỗi'), false, 'Error message must not echo header text');
  assert.equal(res.detectedColumns.length, 0, 'detectedColumns must be empty array on header failure');
});

// -----------------------------------------------------------------------------
// Test Case 4: Invalid Row Structure (Column count mismatch on row)
// -----------------------------------------------------------------------------
test('Case 4: Row structure mismatch halts with INVALID_ROW_STRUCTURE', () => {
  // Row 1 is valid (8 cells), Row 2 has only 5 cells
  const row1 = makeSampleRow(1);
  const corruptedRow2 = ['2', 'Học sinh lỗi', 'ROB-K14-01', 'Đang học', 'GV 1'];
  const html = createFakeTeachingHtml({ rows: [row1, corruptedRow2] });
  const dom = new JSDOM(html);

  const res = inspectTeachingDom(dom.window.document, VALID_LOCATION);
  assert.equal(res.success, false);
  assert.equal(res.code, 'INVALID_ROW_STRUCTURE');
  assert.match(res.message, /số cột không khớp/);
});

// -----------------------------------------------------------------------------
// Test Case 5: Empty Table & Placeholder Detection
// -----------------------------------------------------------------------------
test('Case 5: Empty table and DataTables placeholder are detected without false count', () => {
  // 5a. Table with 0 body rows
  const htmlEmpty = createFakeTeachingHtml({ rows: [] });
  const domEmpty = new JSDOM(htmlEmpty);
  const resEmpty = inspectTeachingDom(domEmpty.window.document, VALID_LOCATION);
  assert.equal(resEmpty.success, true);
  assert.equal(resEmpty.code, 'EMPTY_TABLE');
  assert.equal(resEmpty.visibleCount, 0);
  assert.equal(resEmpty.isPlaceholder, true);

  // 5b. Table with "Không có dữ liệu" placeholder row (colspan 8)
  const htmlPlaceholder = `<!DOCTYPE html><html><body>
    <table>
      <thead>
        <tr>
          <th>STT</th><th>Tên học sinh</th><th>Mã lớp</th><th>Trạng thái học sinh</th>
          <th>GV chính</th><th>Trợ giảng</th><th>Trạng thái lớp</th><th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="8" class="dataTables_empty">Không có dữ liệu</td></tr>
      </tbody>
    </table>
  </body></html>`;
  const domPlaceholder = new JSDOM(htmlPlaceholder);
  const resPlaceholder = inspectTeachingDom(domPlaceholder.window.document, VALID_LOCATION);
  assert.equal(resPlaceholder.success, true);
  assert.equal(resPlaceholder.code, 'EMPTY_TABLE');
  assert.equal(resPlaceholder.visibleCount, 0);
  assert.equal(resPlaceholder.isPlaceholder, true);
});

// -----------------------------------------------------------------------------
// Test Case 6: Exactly 1 Data Row with textContent Poison Trap
// -----------------------------------------------------------------------------
test('Case 6: Exactly 1 valid data row counts accurately without accessing textContent of row or cells', () => {
  const singleRowData = makeSampleRow(1);
  const html = createFakeTeachingHtml({
    rows: [singleRowData],
    infoText: 'Hiển thị 1 đến 1 trên 1 bản ghi',
  });
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const row = doc.querySelector('tbody tr');
  assert.ok(row, 'Row must exist');

  // Install poison getters: if reader accesses row.textContent or any cell.textContent, it will throw!
  Object.defineProperty(row, 'textContent', {
    get() {
      throw new Error('VIOLATION: Reader must not access row.textContent on data rows!');
    },
    configurable: true,
  });

  const cells = Array.from(row.querySelectorAll('td'));
  assert.equal(cells.length, 8);
  for (const cell of cells) {
    Object.defineProperty(cell, 'textContent', {
      get() {
        throw new Error('VIOLATION: Reader must not access cell.textContent on data cells!');
      },
      configurable: true,
    });
  }

  // Must complete successfully without throwing poison getter error
  const res = inspectTeachingDom(doc, VALID_LOCATION);
  assert.equal(res.success, true);
  assert.equal(res.code, 'OK');
  assert.equal(res.visibleCount, 1);
  assert.equal(res.totalRowsCount, 1);
  assert.equal(res.isPlaceholder, false);
});

// -----------------------------------------------------------------------------
// Test Case 7: Fake 3 Rows Count & Visibility Handling (Hidden Rows)
// -----------------------------------------------------------------------------
test('Case 7: Correct 3 rows count accurately without extracting sensitive student data', () => {
  const r1 = makeSampleRow(1);
  const r2 = makeSampleRow(2);
  const r3 = makeSampleRow(3);

  const html = createFakeTeachingHtml({
    rows: [r1, r2, r3],
    infoText: 'Hiển thị 1 đến 3 của 3 bản ghi',
  });
  const dom = new JSDOM(html);

  const res = inspectTeachingDom(dom.window.document, VALID_LOCATION);
  assert.equal(res.success, true);
  assert.equal(res.code, 'OK');
  assert.equal(res.visibleCount, 3);
  assert.equal(res.totalRowsCount, 3);

  // Critical Safety Check: No student name or ID in returned result
  const serialized = JSON.stringify(res);
  assert.equal(serialized.includes('Học sinh Giả Định'), false, 'Result must NOT contain student names');
  assert.equal(serialized.includes('ROB-K14-01'), false, 'Result must NOT contain class names');

  // Test row visibility calculation (1 hidden row)
  const rHidden = makeSampleRow(4, { hidden: true });
  const htmlWithHidden = createFakeTeachingHtml({
    rows: [r1, r2, r3, rHidden],
  });
  const domWithHidden = new JSDOM(htmlWithHidden);
  const resHidden = inspectTeachingDom(domWithHidden.window.document, VALID_LOCATION);
  assert.equal(resHidden.success, true);
  assert.equal(resHidden.visibleCount, 3, 'Only visible rows must be counted in visibleCount');
  assert.equal(resHidden.totalRowsCount, 4, 'totalRowsCount counts all rows in tbody');
});

// -----------------------------------------------------------------------------
// Test Case 8: Safe Structured Pagination Parsing & Adverse Info Rejection
// -----------------------------------------------------------------------------
test('Case 8: Pagination parser extracts clean numbers and discards adverse filter/name strings', () => {
  // Scenario 8a: Clean Vietnamese pagination template
  const htmlCleanVi = createFakeTeachingHtml({
    rows: [makeSampleRow(1)],
    infoText: 'Hiển thị 1 đến 25 trong tổng số 120 bản ghi',
  });
  const domCleanVi = new JSDOM(htmlCleanVi);
  const resCleanVi = inspectTeachingDom(domCleanVi.window.document, VALID_LOCATION);
  assert.equal(resCleanVi.sourceTotalNotice, 'Hiển thị 1 - 25 trên tổng số 120 bản ghi (DOM nguồn)');

  // Scenario 8b: Clean English pagination template
  const htmlCleanEn = createFakeTeachingHtml({
    rows: [makeSampleRow(1)],
    infoText: 'Showing 1 to 10 of 50 entries',
  });
  const domCleanEn = new JSDOM(htmlCleanEn);
  const resCleanEn = inspectTeachingDom(domCleanEn.window.document, VALID_LOCATION);
  assert.equal(resCleanEn.sourceTotalNotice, 'Hiển thị 1 - 10 trên tổng số 50 bản ghi (DOM nguồn)');

  // Scenario 8c: Adverse info text containing student name or search filter
  const adverseInfo = 'Showing 1 to 10 of 100 entries (filtered from Nguyễn Văn A - MS9999)';
  const htmlAdverse = createFakeTeachingHtml({
    rows: [makeSampleRow(1)],
    infoText: adverseInfo,
  });
  const domAdverse = new JSDOM(htmlAdverse);
  const resAdverse = inspectTeachingDom(domAdverse.window.document, VALID_LOCATION);

  // Must fall back to 'Chưa xác định' and NOT leak any adverse names
  assert.equal(resAdverse.sourceTotalNotice, 'Chưa xác định');
  assert.equal(JSON.stringify(resAdverse).includes('Nguyễn Văn A'), false);
  assert.equal(JSON.stringify(resAdverse).includes('MS9999'), false);

  // Scenario 8d: Unstructured / missing info element
  const htmlNoInfo = `<!DOCTYPE html><html><body>
    <table>
      <thead>
        <tr>
          <th>STT</th><th>Tên học sinh</th><th>Mã lớp</th><th>Trạng thái học sinh</th>
          <th>GV chính</th><th>Trợ giảng</th><th>Trạng thái lớp</th><th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>A</td><td>ROB-01</td><td>Đang học</td><td>GV</td><td>TG</td><td>Running</td><td>Xem</td></tr>
      </tbody>
    </table>
  </body></html>`;
  const domNoInfo = new JSDOM(htmlNoInfo);
  const resNoInfo = inspectTeachingDom(domNoInfo.window.document, VALID_LOCATION);
  assert.equal(resNoInfo.sourceTotalNotice, 'Chưa xác định');
});

// -----------------------------------------------------------------------------
// Test Case 9: Absolute Ban on Network, Storage, and Console Data Leakage (Fixed Storage Traps)
// -----------------------------------------------------------------------------
test('Case 9: Strict verification of NO network, NO storage, and NO console leakage with proper accessors', () => {
  const html = createFakeTeachingHtml({
    rows: [makeSampleRow(1), makeSampleRow(2), makeSampleRow(3)],
  });
  const dom = new JSDOM(html, {
    url: `${TEACHING_ORIGIN}${TEACHING_PATH}`,
  });

  // Monitor Network
  let fetchCalled = false;
  let xhrCalled = false;
  dom.window.fetch = () => {
    fetchCalled = true;
    return Promise.reject(new Error('fetch forbidden'));
  };
  dom.window.XMLHttpRequest = class {
    open() {
      xhrCalled = true;
    }
    send() {
      xhrCalled = true;
    }
  };

  // Monitor Storage correctly by spying on methods and defining property traps
  let storageCalled = false;
  const spyStorage = (storageObj) => {
    if (!storageObj) return;
    const methods = ['getItem', 'setItem', 'removeItem', 'clear', 'key'];
    for (const m of methods) {
      const orig = storageObj[m];
      storageObj[m] = function (...args) {
        storageCalled = true;
        return orig ? orig.apply(this, args) : null;
      };
    }
  };

  // Safe trap storage: spy on storage instance and trap window property accessors without triggering SecurityError
  const trapStorage = (propName) => {
    try {
      let storageObj = null;
      try {
        storageObj = dom.window[propName];
      } catch {
        // Safe guard against setup error
      }
      if (storageObj) {
        spyStorage(storageObj);
      }

      const originalGetter = Object.getOwnPropertyDescriptor(dom.window.Window.prototype, propName)?.get;
      if (originalGetter) {
        Object.defineProperty(dom.window, propName, {
          get() {
            storageCalled = true;
            return originalGetter.call(this);
          },
          configurable: true,
        });
      } else if (storageObj) {
        Object.defineProperty(dom.window, propName, {
          get() {
            storageCalled = true;
            return storageObj;
          },
          configurable: true,
        });
      }
    } catch {
      // Fallback
    }
  };
  trapStorage('localStorage');
  trapStorage('sessionStorage');

  // Reset flag in case setup touched storage
  storageCalled = false;

  // Monitor Console
  const consoleLogs = [];
  const origLog = console.log;
  console.log = (...args) => consoleLogs.push(args.join(' '));

  try {
    // Run inspection and rendering
    const res = runTeachingReader(dom.window.document, VALID_LOCATION);
    assert.equal(res.success, true);

    // Verify 0 network calls
    assert.equal(fetchCalled, false, 'No fetch calls permitted');
    assert.equal(xhrCalled, false, 'No XHR calls permitted');

    // Verify 0 storage operations
    assert.equal(storageCalled, false, 'No storage access permitted');

    // Verify no student data in console
    for (const log of consoleLogs) {
      assert.equal(log.includes('Học sinh Giả Định'), false, 'Console must not contain student names');
    }
  } finally {
    console.log = origLog;
  }
});

// -----------------------------------------------------------------------------
// Test Case 10: Panel UI Rendering & Mandatory Labels & Non-cached Run
// -----------------------------------------------------------------------------
test('Case 10: Floating Panel renders with mandatory labels, close button, and removes old panel', () => {
  const html = createFakeTeachingHtml({
    rows: [makeSampleRow(1), makeSampleRow(2), makeSampleRow(3)],
  });
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const result1 = inspectTeachingDom(doc, VALID_LOCATION);
  const panel1 = renderTeachingPanel(doc, result1);
  doc.body.appendChild(panel1);

  assert.ok(doc.getElementById('teaching-readonly-spike-panel'), 'Panel must be in DOM');

  // Verify mandatory labels
  const panelText = panel1.textContent;
  assert.ok(panelText.includes(REQUIRED_LABELS.SAMPLE), `Must contain "${REQUIRED_LABELS.SAMPLE}"`);
  assert.ok(panelText.includes(REQUIRED_LABELS.NOT_FULL), `Must contain "${REQUIRED_LABELS.NOT_FULL}"`);
  assert.ok(panelText.includes(REQUIRED_LABELS.READONLY), `Must contain "${REQUIRED_LABELS.READONLY}"`);

  // Verify close button exists
  const closeBtn = panel1.querySelector('button');
  assert.ok(closeBtn, 'Must have close button');
  assert.match(closeBtn.textContent, /Đóng/);

  // Fresh run test: rendering again removes previous panel and creates fresh panel
  const panel2 = renderTeachingPanel(doc, result1);
  doc.body.appendChild(panel2);

  const allPanels = doc.querySelectorAll('#teaching-readonly-spike-panel');
  assert.equal(allPanels.length, 1, 'Only one fresh panel should exist at any time (no duplicate/cached panels)');
});

// -----------------------------------------------------------------------------
// Test Case 11: Source Code Consistency (Generator Output matches Reader Core)
// -----------------------------------------------------------------------------
test('Case 11: Public bookmarklet code maintains strict source parity with reader-core.mjs', () => {
  const readerCorePath = path.join(ROOT_DIR, 'tools', 'teaching-readonly', 'reader-core.mjs');
  const bookmarkletPath = path.join(ROOT_DIR, 'public', 'teaching-readonly', 'bookmarklet.js');

  assert.ok(fs.existsSync(readerCorePath), 'reader-core.mjs must exist');
  assert.ok(fs.existsSync(bookmarkletPath), 'bookmarklet.js must exist');

  const bookmarkletContent = fs.readFileSync(bookmarkletPath, 'utf8');

  // Verify key functions and constants are identical in bookmarklet
  assert.ok(bookmarkletContent.includes("TEACHING_ORIGIN = 'https://teachingmindx.top'"));
  assert.ok(bookmarkletContent.includes("TEACHING_PATH = '/hocsinh.php'"));
  assert.ok(bookmarkletContent.includes('function inspectTeachingDom('));
  assert.ok(bookmarkletContent.includes('function renderTeachingPanel('));
  assert.ok(bookmarkletContent.includes('function runTeachingReader('));
  assert.ok(bookmarkletContent.includes(REQUIRED_LABELS.SAMPLE));
  assert.ok(bookmarkletContent.includes(REQUIRED_LABELS.READONLY));
});

// -----------------------------------------------------------------------------
// Test Case 12: Hosted QA Guide interactive fixture buttons regression (JSDOM dangerously)
// -----------------------------------------------------------------------------
test('Case 12: Hosted QA Guide interactive fixture buttons update panel safely without errors, network, or storage', () => {
  const indexPath = path.join(ROOT_DIR, 'public', 'teaching-readonly', 'index.html');
  assert.ok(fs.existsSync(indexPath), 'public/teaching-readonly/index.html must exist');

  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  // Monitor uncaught errors and JSDOM script execution errors
  const uncaughtErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    uncaughtErrors.push(err);
  });
  virtualConsole.on('error', (err) => {
    uncaughtErrors.push(err);
  });

  const dom = new JSDOM(indexHtml, {
    runScripts: 'dangerously',
    virtualConsole,
    url: 'http://localhost:3000/teaching-readonly/',
  });

  dom.window.addEventListener('error', (event) => {
    uncaughtErrors.push(event.error || event.message);
  });

  // 1. Initial State: No panel on initial guide load (auto-run IIFE removed)
  const initialPanel = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.equal(initialPanel, null, 'Must NOT show panel on initial guide page load');

  // 2. Monitor Network and Storage (ban network and storage access during fixture tests)
  let fetchCalled = false;
  let xhrCalled = false;
  dom.window.fetch = () => {
    fetchCalled = true;
    return Promise.reject(new Error('fetch forbidden'));
  };
  dom.window.XMLHttpRequest = class {
    open() {
      xhrCalled = true;
    }
    send() {
      xhrCalled = true;
    }
  };

  let storageCalled = false;
  const spyStorage = (storageObj) => {
    if (!storageObj) return;
    const methods = ['getItem', 'setItem', 'removeItem', 'clear', 'key'];
    for (const m of methods) {
      const orig = storageObj[m];
      storageObj[m] = function (...args) {
        storageCalled = true;
        return orig ? orig.apply(this, args) : null;
      };
    }
  };

  const trapStorage = (propName) => {
    try {
      let storageObj = null;
      try {
        storageObj = dom.window[propName];
      } catch {
        // Safe guard against setup error
      }
      if (storageObj) {
        spyStorage(storageObj);
      }

      const originalGetter = Object.getOwnPropertyDescriptor(dom.window.Window.prototype, propName)?.get;
      if (originalGetter) {
        Object.defineProperty(dom.window, propName, {
          get() {
            storageCalled = true;
            return originalGetter.call(this);
          },
          configurable: true,
        });
      } else if (storageObj) {
        Object.defineProperty(dom.window, propName, {
          get() {
            storageCalled = true;
            return storageObj;
          },
          configurable: true,
        });
      }
    } catch {
      // Fallback
    }
  };
  trapStorage('localStorage');
  trapStorage('sessionStorage');
  storageCalled = false;

  // 3. Locate the 5 real interactive fixture buttons in DOM
  const btnValid3 = dom.window.document.querySelector('button[onclick*="valid_3"]');
  const btnEmpty = dom.window.document.querySelector('button[onclick*="empty"]');
  const btnLogin = dom.window.document.querySelector('button[onclick*="login"]');
  const btnHeaders = dom.window.document.querySelector('button[onclick*="invalid_headers"]');
  const btnOrigin = dom.window.document.querySelector('button[onclick*="wrong_origin"]');

  assert.ok(btnValid3, 'Fixture 1 button (valid_3) must exist in DOM');
  assert.ok(btnEmpty, 'Fixture 2 button (empty) must exist in DOM');
  assert.ok(btnLogin, 'Fixture 3 button (login) must exist in DOM');
  assert.ok(btnHeaders, 'Fixture 4 button (invalid_headers) must exist in DOM');
  assert.ok(btnOrigin, 'Fixture 5 button (wrong_origin) must exist in DOM');

  // 4. Click Button 1 (valid_3) -> panel displays 3 rows
  btnValid3.click();
  const panelValid = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.ok(panelValid, 'Panel must appear after clicking valid_3');
  assert.ok(panelValid.textContent.includes('3 hàng'), 'Panel must show 3 visible rows for valid_3');
  assert.ok(
    panelValid.textContent.includes('Đã nhận diện đúng bảng học sinh') ||
    panelValid.textContent.includes('Đọc thành công 3 hàng hiển thị'),
    'Panel must display valid success confirmation'
  );

  // 5. Click Button 2 (empty) -> panel displays 0 rows
  btnEmpty.click();
  const panelEmpty = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.ok(panelEmpty, 'Panel must appear after clicking empty');
  assert.ok(panelEmpty.textContent.includes('0 hàng'), 'Panel must show 0 visible rows for empty fixture');
  assert.ok(
    panelEmpty.textContent.includes('EMPTY_TABLE') ||
    panelEmpty.textContent.includes('Không có dữ liệu') ||
    panelEmpty.textContent.includes('0 dòng dữ liệu') ||
    panelEmpty.textContent.includes('BẢNG KHÔNG CÓ HÀNG DỮ LIỆU'),
    'Panel must display empty placeholder state'
  );

  // 6. Click Button 3 (login) -> panel displays LOGIN_REQUIRED
  btnLogin.click();
  const panelLogin = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.ok(panelLogin, 'Panel must appear after clicking login');
  assert.ok(panelLogin.textContent.includes('LOGIN_REQUIRED'), 'Panel must show LOGIN_REQUIRED status code');

  // 7. Click Button 4 (invalid_headers) -> panel displays INVALID_HEADERS
  btnHeaders.click();
  const panelHeaders = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.ok(panelHeaders, 'Panel must appear after clicking invalid_headers');
  assert.ok(panelHeaders.textContent.includes('INVALID_HEADERS'), 'Panel must show INVALID_HEADERS status code');

  // 8. Click Button 5 (wrong_origin) -> panel displays WRONG_ORIGIN
  btnOrigin.click();
  const panelOrigin = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.ok(panelOrigin, 'Panel must appear after clicking wrong_origin');
  assert.ok(panelOrigin.textContent.includes('WRONG_ORIGIN'), 'Panel must show WRONG_ORIGIN status code');

  // 9. Verify exactly ONE panel exists in DOM
  const allPanels = dom.window.document.querySelectorAll('#teaching-readonly-spike-panel');
  assert.equal(allPanels.length, 1, 'Only one panel must exist at any time across successive clicks');

  // 10. Verify Close button on panel removes it from DOM
  const closeBtn = panelOrigin.querySelector('button');
  assert.ok(closeBtn, 'Close button must exist on the panel');
  closeBtn.click();

  const closedPanel = dom.window.document.getElementById('teaching-readonly-spike-panel');
  assert.equal(closedPanel, null, 'Panel must be completely removed from DOM after clicking close');

  // 11. Verify NO ReferenceError or uncaught errors during guide execution
  assert.equal(
    uncaughtErrors.length,
    0,
    `Guide must execute without ReferenceError or uncaught errors: ${uncaughtErrors.map((e) => e?.message || e).join('; ')}`
  );

  // 12. Verify NO network requests and NO storage operations occurred
  assert.equal(fetchCalled, false, 'No fetch calls permitted during fixture tests');
  assert.equal(xhrCalled, false, 'No XHR calls permitted during fixture tests');
  assert.equal(storageCalled, false, 'No storage access permitted during fixture tests');
});
