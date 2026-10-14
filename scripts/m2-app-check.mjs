/**
 * Runtime HTTP Health & Security Verification Script for Next.js BFF (Milestone 2)
 *
 * Runs via: node scripts/m2-app-check.mjs [baseUrl]
 *
 * HTTP only — zero browser automation.
 * Verifies live BFF endpoint security boundaries, no-store headers, CSRF, and action filtering.
 */

const BASE_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:3000';

console.log(`[M2-B Check] Bắt đầu kiểm tra HTTP BFF tại: ${BASE_URL}\n`);

let passedCount = 0;
let failedCount = 0;

async function runCheck(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedCount++;
  }
}

async function main() {
  // Check 1: Action whitelist - Blocked action returns 404
  await runCheck('Chặn tác vụ quản trị bị cấm (/api/m2/bootstrap-admin trả về 404)', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/bootstrap-admin`, { method: 'POST' });
    if (res.status !== 404) {
      throw new Error(`Kỳ vọng HTTP 404 nhưng nhận HTTP ${res.status}`);
    }
  });

  // Check 2: Action whitelist - Unknown action returns 404
  await runCheck('Chặn tác vụ không xác định (/api/m2/unknown-action trả về 404)', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/unknown-action`, { method: 'POST' });
    if (res.status !== 404) {
      throw new Error(`Kỳ vọng HTTP 404 nhưng nhận HTTP ${res.status}`);
    }
  });

  // Check 3: Cache-Control: no-store on API responses
  await runCheck('Kiểm tra tiêu đề Cache-Control: no-store trên endpoint phiên', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/session`, { method: 'GET' });
    const cacheControl = res.headers.get('cache-control') || '';
    if (!cacheControl.includes('no-store')) {
      throw new Error(`Tiêu đề Cache-Control không chứa 'no-store': nhận "${cacheControl}"`);
    }
  });

  // Check 4: Unauthenticated session returns user: null without tokens
  await runCheck('Kiểm tra phiên chưa đăng nhập trả về user: null an toàn', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/session`, { method: 'GET' });
    const data = await res.json();
    if (data.user !== null && data.user !== undefined) {
      throw new Error(`Kỳ vọng user là null nhưng nhận: ${JSON.stringify(data.user)}`);
    }
    if (data.accessToken || data.refreshToken || data.token) {
      throw new Error('Endpoint session làm lộ token bảo mật trong phản hồi!');
    }
  });

  // Check 5: Input validation on student login
  await runCheck('Từ chối đăng nhập học sinh khi thiếu mã học sinh hoặc PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/student-login-prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
      },
      body: JSON.stringify({}),
    });
    if (res.status !== 400) {
      throw new Error(`Kỳ vọng HTTP 400 nhưng nhận HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.success !== false) {
      throw new Error('Phản hồi không báo lỗi khi thiếu thông tin đăng nhập');
    }
  });

  // Check 6: Rejection of application/x-www-form-urlencoded
  await runCheck('Từ chối định dạng application/x-www-form-urlencoded trên mutation', async () => {
    const res = await fetch(`${BASE_URL}/api/m2/staff-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: BASE_URL,
      },
      body: 'email=admin%40mindx.edu.vn&password=test',
    });
    if (res.status !== 400) {
      throw new Error(`Kỳ vọng HTTP 400 nhưng nhận HTTP ${res.status}`);
    }
  });

  console.log(`\n[M2-B Check Hoàn tất] Thành công: ${passedCount} | Thất bại: ${failedCount}`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[M2-B Check Lỗi]', err);
  process.exit(1);
});
