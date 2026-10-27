import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const READER_CORE_PATH = path.join(ROOT_DIR, 'tools', 'teaching-readonly', 'reader-core.mjs');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'teaching-readonly');
const BOOKMARKLET_JS_PATH = path.join(OUTPUT_DIR, 'bookmarklet.js');
const INDEX_HTML_PATH = path.join(OUTPUT_DIR, 'index.html');
const MANIFEST_JSON_PATH = path.join(OUTPUT_DIR, 'manifest.json');

console.log('[generator] Reading reader core from:', READER_CORE_PATH);
const readerCoreRaw = fs.readFileSync(READER_CORE_PATH, 'utf8');

// Compute SHA-256 hash of reader-core.mjs
const readerHash = crypto.createHash('sha256').update(readerCoreRaw).digest('hex');
console.log(`[generator] Reader core SHA-256: ${readerHash}`);

// Transform ESM exports into clean script body (without export and without execution call)
// 1. Remove "export const " -> "const "
// 2. Remove "export async function " -> "async function "
// 3. Remove "export function " -> "function "
const readerCoreBody = readerCoreRaw
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+async\s+function\s+/g, 'async function ')
  .replace(/export\s+function\s+/g, 'function ')
  .trim();

// Bookmarklet wraps the core reader body in an IIFE and triggers reader on active page
const rawBookmarkletScript = `(function(){\n${readerCoreBody}\n\n// Trigger reader on active page\nrunTeachingReader(document, window.location);\n})();`;

// Encode as valid javascript: URL
// For readability and safety in Chrome bookmarks bar
const bookmarkletHref = `javascript:${encodeURIComponent(rawBookmarkletScript)}`;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Write bookmarklet.js
fs.writeFileSync(BOOKMARKLET_JS_PATH, rawBookmarkletScript, 'utf8');
console.log('[generator] Wrote:', BOOKMARKLET_JS_PATH);

// 2. Write manifest.json
const manifest = {
  generator: 'scripts/generate-teaching-bookmark.mjs',
  generatedAt: new Date().toISOString(),
  readerCoreHashSha256: readerHash,
  expectedColumns: [
    'STT',
    'Tên học sinh',
    'Mã lớp',
    'Trạng thái học sinh',
    'GV chính',
    'Trợ giảng',
    'Trạng thái lớp',
    'Thao tác',
  ],
  originGuard: 'https://teachingmindx.top/hocsinh.php',
  labels: [
    'Đọc mẫu trang hiện tại',
    'Không phải toàn bộ danh sách',
    'Chỉ đọc — không ghi TEST',
  ],
};
fs.writeFileSync(MANIFEST_JSON_PATH, JSON.stringify(manifest, null, 2), 'utf8');
console.log('[generator] Wrote:', MANIFEST_JSON_PATH);

// 3. Generate HTML Guide Page with drag-and-drop bookmarklet & QA Fixture area
const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tiện Ích Cục Bộ Đếm Teaching — MINDX LEARN [Mốc 1]</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-100: #f1f5f9;
      --slate-50: #f8fafc;
      --border: #e2e8f0;
      --rose: #e11d48;
      --emerald: #15803d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f8fafc;
      color: var(--slate-800);
      line-height: 1.6;
      padding: 32px 16px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a, #2563eb);
      color: #ffffff;
      padding: 28px 32px;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .header p {
      font-size: 13px;
      opacity: 0.9;
    }
    .content {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--slate-900);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bookmark-cta {
      background: #eff6ff;
      border: 2px dashed #93c5fd;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .bookmarklet-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: var(--primary);
      color: #ffffff;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
      cursor: grab;
      user-select: none;
      transition: all 0.15s ease;
    }
    .bookmarklet-btn:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }
    .steps-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .step-item {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .step-number {
      width: 28px;
      height: 28px;
      background: #e0e7ff;
      color: #3730a3;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .step-text {
      font-size: 13px;
      color: var(--slate-700);
    }
    .step-text strong {
      color: var(--slate-900);
    }
    .notice-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 12px;
      color: #92400e;
    }
    .notice-box strong {
      color: #78350f;
    }
    .rules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .rule-card {
      background: var(--slate-50);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 12px;
    }
    .rule-card strong {
      display: block;
      margin-bottom: 4px;
      color: var(--slate-900);
    }
    .qa-box {
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #ffffff;
      padding: 20px;
    }
    .qa-btn {
      padding: 8px 14px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: var(--slate-700);
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 6px;
      margin-bottom: 6px;
      transition: all 0.15s ease;
    }
    .qa-btn:hover {
      background: #f1f5f9;
      color: var(--slate-900);
    }
    .source-link {
      color: var(--primary);
      text-decoration: underline;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">MỐC 1 — SPIKE KỸ THUẬT CỤC BỘ</div>
      <h1>Tiện Ích Đếm Số Học Sinh Teaching (Read-Only)</h1>
      <p>Tiện ích cục bộ tự chứa mã nguồn, chạy trực tiếp trên trình duyệt của Owner. Tuyệt đối không gửi dữ liệu ra ngoài.</p>
    </div>

    <div class="content">
      <!-- Drag & Drop CTA -->
      <div class="bookmark-cta">
        <p style="font-size: 13px; color: #1e40af; font-weight: 600;">
          Kéo nút bên dưới thả vào Thanh Dấu Trang (Bookmarks Bar) trên trình duyệt Chrome:
        </p>
        <a href="${bookmarkletHref}" class="bookmarklet-btn" title="Kéo nút này vào thanh dấu trang Chrome">
          📑 Thử đọc Teaching
        </a>
        <p style="font-size: 11px; color: #64748b;">
          (Mẹo: Nhấn phím <code>Ctrl + Shift + B</code> nếu thanh dấu trang Chrome chưa hiển thị)
        </p>
      </div>

      <!-- 3-Step Instructions -->
      <div>
        <h2 class="section-title">
          <span>📋 Hướng dẫn Owner 3 bước thực hiện</span>
        </h2>
        <ul class="steps-list">
          <li class="step-item">
            <div class="step-number">1</div>
            <div class="step-text">
              <strong>Kéo nút dấu trang:</strong> Kéo nút <strong>"Thử đọc Teaching"</strong> ở trên thả vào thanh dấu trang trình duyệt Chrome của bạn. Không cần mở F12, không copy mã code, không cần Terminal.
            </div>
          </li>
          <li class="step-item">
            <div class="step-number">2</div>
            <div class="step-text">
              <strong>Mở trang Teaching MindX:</strong> Truy cập địa chỉ nguồn:
              <a href="https://teachingmindx.top/hocsinh.php" target="_blank" rel="noopener noreferrer" class="source-link">
                https://teachingmindx.top/hocsinh.php
              </a>. Nếu phiên làm việc chưa mở, hãy tự đăng nhập tài khoản Teaching bình thường.
            </div>
          </li>
          <li class="step-item">
            <div class="step-number">3</div>
            <div class="step-text">
              <strong>Bấm dấu trang để đọc:</strong> Khi đang ở đúng trang danh sách học sinh, nhấp chuột vào dấu trang <strong>"Thử đọc Teaching"</strong> trên thanh dấu trang. Bảng thông tin nhỏ sẽ xuất hiện ngay tại góc màn hình hiển thị số hàng đếm được trên trang hiện tại.
            </div>
          </li>
        </ul>
      </div>

      <!-- Boundaries & Safety Notices -->
      <div>
        <h2 class="section-title">
          <span>🛡️ Cam kết an toàn & Giới hạn Mốc 1</span>
        </h2>
        <div class="rules-grid">
          <div class="rule-card">
            <strong>✓ Đọc mẫu trang hiện tại</strong>
            Tiện ích chỉ đếm số hàng đang hiển thị trong DOM của trang hiện tại, không tự động click sang trang khác.
          </div>
          <div class="rule-card">
            <strong>✓ Không phải toàn bộ danh sách</strong>
            Không nhân mẫu ra tổng, không tự giả định số lượng chưa hiển thị. Báo cáo phân trang chỉ dùng khi có thông báo DOM rõ ràng.
          </div>
          <div class="rule-card">
            <strong>✓ Chỉ đọc — không ghi TEST</strong>
            Không tạo, sửa hay xóa bất kỳ dữ liệu nào trên Teaching hay trên hệ thống webapp MINDX LEARN.
          </div>
          <div class="rule-card">
            <strong>✓ Không trích xuất dữ liệu nhạy cảm</strong>
            Không đọc họ tên, không đọc mã số học sinh, không đọc mật khẩu form. Tuyệt đối không gửi dữ liệu ra mạng.
          </div>
        </div>
      </div>

      <!-- CSP Warning Notice -->
      <div class="notice-box">
        <strong>⚠️ Lưu ý về chính sách CSP (Content Security Policy):</strong>
        Nếu trình duyệt hoặc cấu hình bảo mật máy tính chặn bookmarklet thực thi mã <code>javascript:</code>, vui lòng <strong>dừng lại và thông báo cho kỹ thuật viên</strong>. Tuyệt đối không sử dụng các giải pháp vượt rào bảo mật.
      </div>

      <!-- QA Interactive Fixture Testing Area -->
      <div class="qa-box">
        <h2 class="section-title" style="margin-bottom: 8px;">
          <span>🧪 Khu vực Thử nghiệm Cục bộ (QA Fixture)</span>
        </h2>
        <p style="font-size: 12px; color: var(--slate-600); margin-bottom: 14px;">
          Kiểm chứng hành vi của Reader trên các cấu trúc giả lập khác nhau ngay tại trang này mà không cần kết nối tới Teaching thật:
        </p>

        <div>
          <button type="button" class="qa-btn" onclick="runFixtureTest('valid_3')">▶ Thử Fixture 1: Đúng 3 hàng</button>
          <button type="button" class="qa-btn" onclick="runFixtureTest('empty')">▶ Thử Fixture 2: Bảng rỗng</button>
          <button type="button" class="qa-btn" onclick="runFixtureTest('login')">▶ Thử Fixture 3: Trang đăng nhập</button>
          <button type="button" class="qa-btn" onclick="runFixtureTest('invalid_headers')">▶ Thử Fixture 4: Sai tiêu đề cột</button>
          <button type="button" class="qa-btn" onclick="runFixtureTest('wrong_origin')">▶ Thử Fixture 5: Sai Origin</button>
        </div>

        <!-- Hidden DOM Containers for QA Fixtures -->
        <div id="qa-fixture-container" style="margin-top: 14px; padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; display: none;">
          <div id="qa-fixture-dom"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Embed Core Reader Logic for QA Testing -->
  <script>
${readerCoreBody}

    // QA Helper function to test reader in pure mode
    function runFixtureTest(type) {
      const container = document.getElementById('qa-fixture-container');
      const domMount = document.getElementById('qa-fixture-dom');
      container.style.display = 'block';
      domMount.innerHTML = '';

      // Default mock location for QA: simulates exact matching origin
      let mockLoc = {
        origin: 'https://teachingmindx.top',
        pathname: '/hocsinh.php'
      };

      if (type === 'wrong_origin') {
        mockLoc = { origin: 'http://127.0.0.1:3008', pathname: '/teaching-readonly/' };
      } else if (type === 'login') {
        domMount.innerHTML = '<form id="login-form"><input type="password" name="pw" value="fake" /></form>';
      } else if (type === 'empty') {
        domMount.innerHTML = \`
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
        \`;
      } else if (type === 'invalid_headers') {
        domMount.innerHTML = \`
          <table>
            <thead>
              <tr><th>Mã</th><th>Họ tên</th><th>Điểm</th></tr>
            </thead>
            <tbody><tr><td>1</td><td>Test</td><td>10</td></tr></tbody>
          </table>
        \`;
      } else if (type === 'valid_3') {
        domMount.innerHTML = \`
          <div class="dataTables_info">Hiển thị 1 đến 3 trong 3 bản ghi</div>
          <table>
            <thead>
              <tr>
                <th>STT</th><th>Tên học sinh</th><th>Mã lớp</th><th>Trạng thái học sinh</th>
                <th>GV chính</th><th>Trợ giảng</th><th>Trạng thái lớp</th><th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Học sinh Giả 1</td><td>ROB-K14-01</td><td>Đang học</td><td>GV 1</td><td>TG 1</td><td>Running</td><td>Xem</td></tr>
              <tr><td>2</td><td>Học sinh Giả 2</td><td>ROB-K14-01</td><td>Đang học</td><td>GV 1</td><td>TG 1</td><td>Running</td><td>Xem</td></tr>
              <tr><td>3</td><td>Học sinh Giả 3</td><td>ROB-K14-02</td><td>Đang học</td><td>GV 2</td><td>TG 2</td><td>Running</td><td>Xem</td></tr>
            </tbody>
          </table>
        \`;
      }

      // Execute reader with target document & mock location
      const result = inspectTeachingDom(domMount, mockLoc);
      const panel = renderTeachingPanel(document, result);
      document.body.appendChild(panel);
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(INDEX_HTML_PATH, htmlContent, 'utf8');
console.log('[generator] Wrote:', INDEX_HTML_PATH);
console.log('[generator] Bookmarklet generation complete!');
