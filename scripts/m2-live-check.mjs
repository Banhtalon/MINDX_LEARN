// ============================================================================
// MINDX LEARN — M2 Live Verification Check Script (Canonical v2 Repair)
// Target: Sol Runtime (against deployed Supabase TEST instance & Next.js BFF)
//
// STRICT VERIFICATION & SAFETY RULES:
// 1. Process environment variables loaded by Root out-of-band via CLI (--env-file)
// 2. Exact Supabase TEST origin guard: https://eythjapspkoyqdxlxtcd.supabase.co (root only)
// 3. Exact Next.js app host guard: http://127.0.0.1:3000, http://localhost:3000, or https://mindx-learn-test.vercel.app (root only)
// 4. NEVER logs secrets, native JWTs, refresh tokens, PINs, passwords, emails, names, or raw errors
// 5. All credentials generated dynamically in RAM (crypto.randomBytes); NO disk CSV/temp files
// 6. Imports canonical production HMAC helper from src/lib/server/crypto.mjs (no duplicate formula)
// 7. Seeds Admin qa-actor first, logs in via Edge (JWT) and BFF (cookie), creates classes A/B/LOAD
// 8. Seeds Student qa-actors with distinct 8-digit PINs and per-AuthUUID derived passwords
// 9. Every fixture and login requires HTTP 200 AND data.success === true
// 10. Validates Set-Cookie attributes (HttpOnly, SameSite=Lax, Secure, ciphertext v1) and roundtrip GET session
// 11. Native PostgREST RLS matrix: assigned class read 1, foreign class/students/profiles denied 0 rows
// 12. Student cross-tenant isolation: foreign student read 0 rows, foreign PATCH denied & verified unchanged
// 13. Never fabricates 403 when session is missing; fails closed
// 14. Authenticated Admin negative pin-commit expects domain validator 400/409 (not 401/500)
// 15. RPC internal wrappers and private storage bucket denied to teacher, student, and anon
// 16. Lifecycle: Class archive, Student archive, and Logout revoke sessions (REST own row 0, BFF cookie 401)
// 17. Account limiter exact threshold (1 correct + 5 incorrect 401 -> 7th 429) & cooldown correct PIN success 200
// 18. Separate IP gate with distinct nonexistent codes; forged XFF cannot reset trusted IP
// 19. Bounded 200 BFF logins with distinct native actors HMAC and verified GET session roundtrip (count 200)
// 20. Outputs aggregate receipt with counts, timings, and honest pass/fail/skip statuses (no ticks, no leaks)
// ============================================================================

import crypto from 'node:crypto';
import {
  deriveStudentPassword,
  generateSecurePin8,
  normalizeKey32,
  SESSION_COOKIE_NAME,
} from '../src/lib/server/crypto.mjs';

// ----------------------------------------------------------------------------
// 1. ENVIRONMENT CONFIGURATION & STRICT GUARDS
// ----------------------------------------------------------------------------
const RAW_SUPABASE_URL = process.env.MINDX_SUPABASE_URL || 'https://eythjapspkoyqdxlxtcd.supabase.co';
const RAW_APP_URL = process.env.MINDX_APP_URL || 'http://localhost:3000';
const BFF_SECRET = process.env.MINDX_BFF_SECRET || '';
const PIN_PEPPER = process.env.MINDX_PIN_PEPPER || '';
const SESSION_KEY = process.env.MINDX_SESSION_KEY || '';
const SUPABASE_PUBLIC_KEY = process.env.MINDX_SUPABASE_PUBLIC_KEY || '';

const RUN_LOAD_TEST = process.argv.includes('--load-test') || process.env.MINDX_RUN_LOAD_TEST === '1';
const TEST_COOLDOWN = process.argv.includes('--test-cooldown') || process.env.MINDX_TEST_COOLDOWN === '1';

// Guard 1: Strict Supabase TEST origin guard (root only, no userinfo, query, fragment, or path)
let parsedSupabaseUrl;
try {
  parsedSupabaseUrl = new URL(RAW_SUPABASE_URL);
} catch {
  console.error('[FATAL GUARD] Invalid MINDX_SUPABASE_URL format. Aborting.');
  process.exit(1);
}

const hasSupabaseUrlExtra =
  parsedSupabaseUrl.username !== '' ||
  parsedSupabaseUrl.password !== '' ||
  parsedSupabaseUrl.search !== '' ||
  parsedSupabaseUrl.hash !== '' ||
  (parsedSupabaseUrl.pathname !== '' && parsedSupabaseUrl.pathname !== '/');

if (parsedSupabaseUrl.origin !== 'https://eythjapspkoyqdxlxtcd.supabase.co' || hasSupabaseUrlExtra) {
  console.error(
    `[FATAL GUARD] MINDX_SUPABASE_URL origin must strictly equal https://eythjapspkoyqdxlxtcd.supabase.co (root only, no userinfo/query/fragment/path). Refusing to execute against unknown or production ref.`
  );
  process.exit(1);
}

// Guard 2: Required BFF secret
if (!BFF_SECRET || BFF_SECRET.trim().length === 0) {
  console.error('[FATAL GUARD] Missing required MINDX_BFF_SECRET environment variable. Aborting.');
  process.exit(1);
}

// Guard 3: Required PIN pepper (min 16 chars)
if (!PIN_PEPPER || PIN_PEPPER.trim().length < 16) {
  console.error('[FATAL GUARD] Missing or insecure MINDX_PIN_PEPPER (min 16 chars). Aborting.');
  process.exit(1);
}

// Guard 4: Required 256-bit session key
try {
  normalizeKey32(SESSION_KEY);
} catch {
  console.error('[FATAL GUARD] Invalid MINDX_SESSION_KEY configuration. Aborting.');
  process.exit(1);
}

// Guard 5: Exact Next.js app host guard (root only, no userinfo, query, fragment, or path)
let parsedAppUrl;
try {
  parsedAppUrl = new URL(RAW_APP_URL);
} catch {
  console.error(`[FATAL GUARD] Invalid MINDX_APP_URL format. Aborting.`);
  process.exit(1);
}

const hasAppUrlExtra =
  parsedAppUrl.username !== '' ||
  parsedAppUrl.password !== '' ||
  parsedAppUrl.search !== '' ||
  parsedAppUrl.hash !== '' ||
  (parsedAppUrl.pathname !== '' && parsedAppUrl.pathname !== '/');

const ALLOWED_APP_ORIGINS = new Set([
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'https://mindx-learn-test.vercel.app',
]);

if (hasAppUrlExtra || !ALLOWED_APP_ORIGINS.has(parsedAppUrl.origin)) {
  console.error(
    `[FATAL GUARD] MINDX_APP_URL must strictly match exact root URL http://127.0.0.1:3000, http://localhost:3000, or https://mindx-learn-test.vercel.app (URL root only, no userinfo/query/fragment/path). Refusing to transmit test credentials to unverified or arbitrary hosts.`
  );
  process.exit(1);
}

const SUPABASE_URL = parsedSupabaseUrl.origin;
const APP_URL = parsedAppUrl.origin;
const EDGE_ENDPOINT = `${SUPABASE_URL}/functions/v1/m2-backend`;
const VERIFIED_CLIENT_IP = '127.0.0.1';
const RUN_ID = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

// In-memory volatile store for credentials and fixtures (never written to disk or logs)
const memoryStore = {
  admin: null,
  teacher: null,
  classes: {},
  students: new Map(),
};

// ----------------------------------------------------------------------------
// 2. HTTP CLIENT HELPERS & CONTRACT VALIDATORS
// ----------------------------------------------------------------------------
async function callEdge(action, payload = {}, headers = {}, accessToken = undefined, sessionVersion = undefined, trustedIp = VERIFIED_CLIENT_IP) {
  const finalHeaders = {
    'Content-Type': 'application/json',
    'x-mindx-bff-secret': headers['x-mindx-bff-secret'] !== undefined ? headers['x-mindx-bff-secret'] : BFF_SECRET,
    ...headers,
  };

  try {
    const res = await fetch(EDGE_ENDPOINT, {
      method: 'POST',
      headers: finalHeaders,
      body: JSON.stringify({
        action,
        payload,
        accessToken,
        sessionVersion,
        trustedIp,
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = { success: false, code: 'INVALID_JSON', message: 'Invalid JSON response from Edge' };
    }

    return { status: res.status, headers: res.headers, data };
  } catch {
    return { status: 0, headers: new Headers(), data: { success: false, code: 'NETWORK_ERROR' } };
  }
}

async function callBff(path, method = 'POST', body = null, customHeaders = {}, cookie = null) {
  const url = `${APP_URL}/api/m2/${path.replace(/^\/+/, '')}`;
  const headers = {
    'Origin': APP_URL,
    ...customHeaders,
  };

  if (body !== null && typeof body === 'object' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (cookie) {
    headers['Cookie'] = `${SESSION_COOKIE_NAME}=${cookie}`;
  }

  try {
    const reqInit = {
      method,
      headers,
    };
    if (body !== null && method !== 'GET') {
      reqInit.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, reqInit);
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    let rawText = '';

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      rawText = await res.text();
    }

    const setCookie = res.headers.get('set-cookie') || '';
    let sessionCookieValue = null;
    if (setCookie) {
      const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match) {
        sessionCookieValue = match[1];
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      data,
      rawText,
      setCookie,
      sessionCookieValue,
    };
  } catch {
    return {
      status: 0,
      headers: new Headers(),
      data: null,
      rawText: '',
      setCookie: '',
      sessionCookieValue: null,
    };
  }
}

async function callPostgrest(restPath, method = 'GET', body = null, token = null, preferReturn = false) {
  if (!SUPABASE_PUBLIC_KEY) return null;
  const url = `${SUPABASE_URL}/rest/v1/${restPath.replace(/^\/+/, '')}`;
  const headers = {
    'apikey': SUPABASE_PUBLIC_KEY,
    'Authorization': `Bearer ${token || SUPABASE_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
  };
  if (preferReturn) {
    headers['Prefer'] = 'return=representation';
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  } catch {
    return null;
  }
}

async function callGotrue(path, body = {}) {
  if (!SUPABASE_PUBLIC_KEY) return null;
  const url = `${SUPABASE_URL}/auth/v1/${path.replace(/^\/+/, '')}`;
  const headers = {
    'apikey': SUPABASE_PUBLIC_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  } catch {
    return null;
  }
}

async function callStorageList(bucket = 'm2-private-fixture', token = null) {
  if (!SUPABASE_PUBLIC_KEY) return null;
  const url = `${SUPABASE_URL}/storage/v1/object/list/${bucket}`;
  const headers = {
    'apikey': SUPABASE_PUBLIC_KEY,
    'Authorization': `Bearer ${token || SUPABASE_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: '', limit: 10, offset: 0 }),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, headers: res.headers, data };
  } catch {
    return null;
  }
}

async function callStorageDownload(bucket = 'm2-private-fixture', objectPath = '', token = null) {
  if (!SUPABASE_PUBLIC_KEY) return null;
  const cleanPath = objectPath.replace(/^\/+/, '');
  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${cleanPath}`;
  const headers = {
    'apikey': SUPABASE_PUBLIC_KEY,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    let providerStatusCode = null;
    let errorEnum = null;

    if (res.status !== 200) {
      try {
        const json = await res.json();
        if (json && typeof json === 'object') {
          if (typeof json.statusCode === 'string' || typeof json.statusCode === 'number') {
            const sc = String(json.statusCode);
            if (/^[0-9]{3}$/.test(sc)) {
              providerStatusCode = sc;
            }
          }
          if (typeof json.error === 'string' && /^[a-z0-9_]{2,32}$/i.test(json.error)) {
            errorEnum = json.error.toLowerCase();
          }
        }
      } catch {
        // Non-JSON or parse failure, leave provider fields null
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      providerStatusCode,
      error: errorEnum,
    };
  } catch {
    return { status: 0, headers: new Headers(), providerStatusCode: null, error: null };
  }
}

function assertCookieAttributes(setCookie, cookieValue, appUrl) {
  if (!setCookie || typeof setCookie !== 'string') return false;
  const isHttpOnly = /HttpOnly/i.test(setCookie);
  const isSameSiteLax = /SameSite=Lax/i.test(setCookie);
  const isSecureExpected = appUrl.startsWith('https://');
  const isSecure = /Secure/i.test(setCookie);
  const secureOk = isSecureExpected ? isSecure : true;
  const isCiphertextV1 = typeof cookieValue === 'string' && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookieValue);
  return isHttpOnly && isSameSiteLax && secureOk && isCiphertextV1;
}

function assertSanitizedDto(dto) {
  if (!dto || typeof dto !== 'object') return false;
  const forbiddenKeys = [
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'session',
    'password',
    'authPassword',
    'rawPin',
    'authUserId',
    'authEmail',
  ];
  for (const k of forbiddenKeys) {
    if (k in dto) return false;
    if (dto.data && typeof dto.data === 'object' && k in dto.data) return false;
    if (dto.data?.user && typeof dto.data.user === 'object' && k in dto.data.user) return false;
    if (dto.user && typeof dto.user === 'object' && k in dto.user) return false;
  }
  return true;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  const trimmed = line.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      if (inQuotes && trimmed[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      let val = current.trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.slice(1, -1);
      }
      cells.push(val);
      current = '';
    } else {
      current += ch;
    }
  }
  let lastVal = current.trim();
  if (lastVal.startsWith('"') && lastVal.endsWith('"') && lastVal.length >= 2) {
    lastVal = lastVal.slice(1, -1);
  }
  cells.push(lastVal);
  return cells;
}

// ----------------------------------------------------------------------------
// 3. RECEIPT RECORDER (STRICT SANITIZATION, ZERO SECRETS/PII/RAWERR)
// ----------------------------------------------------------------------------
const receipt = {
  timestamp: new Date().toISOString(),
  targetSupabaseUrl: SUPABASE_URL,
  targetAppUrl: APP_URL,
  runId: RUN_ID,
  flags: {
    runLoadTest: RUN_LOAD_TEST,
    testCooldown: TEST_COOLDOWN,
    hasPublicKey: Boolean(SUPABASE_PUBLIC_KEY),
  },
  checks: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    manualPending: 0,
  },
  verdict: 'INCOMPLETE',
};

function sanitizeDetail(detail) {
  const safe = {};
  for (const [k, v] of Object.entries(detail)) {
    if (
      k === 'rawPin' ||
      k === 'authPassword' ||
      k === 'password' ||
      k === 'testPassword' ||
      k === 'token' ||
      k === 'accessToken' ||
      k === 'user' ||
      k === 'csv' ||
      k === 'rawerr' ||
      k === 'rawError' ||
      k === 'error' ||
      k === 'rawText' ||
      k === 'email' ||
      k === 'authEmail' ||
      k === 'authUserId' ||
      k === 'studentCode' ||
      k === 'profileId' ||
      k === 'fullName' ||
      k === 'classId' ||
      k === 'cookie' ||
      k === 'sessionCookie' ||
      k === 'sessionCookieValue' ||
      k === 'setCookie'
    ) {
      continue;
    }
    if (typeof v === 'string') {
      safe[k] = v
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[REDACTED_UUID]')
        .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[REDACTED_EMAIL]')
        .replace(/[\u2713\u2714\u221A]/g, '');
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    } else if (Array.isArray(v)) {
      safe[k] = v.length;
    } else if (v && typeof v === 'object') {
      safe[k] = Object.keys(v).length;
    }
  }
  return safe;
}

function recordCheck(checkId, name, passed, detail = {}) {
  receipt.summary.total += 1;
  const safeDetail = sanitizeDetail(detail);

  if (passed === null) {
    const status = detail.status || 'SKIPPED';
    if (status === 'MANUAL_PENDING') {
      receipt.summary.manualPending += 1;
    } else {
      receipt.summary.skipped += 1;
    }
    console.log(`[${status}] [${checkId}] ${name}${safeDetail.reason ? ` - Reason: ${safeDetail.reason}` : ''}`);
    receipt.checks.push({ id: checkId, name, ...safeDetail, status });
  } else if (passed) {
    receipt.summary.passed += 1;
    console.log(`[PASS] [${checkId}] ${name}`);
    receipt.checks.push({ id: checkId, name, ...safeDetail, status: 'PASSED' });
  } else {
    receipt.summary.failed += 1;
    console.error(`[FAIL] [${checkId}] ${name}${safeDetail.reason ? ` - Reason: ${safeDetail.reason}` : ''}`);
    receipt.checks.push({ id: checkId, name, ...safeDetail, status: 'FAILED' });
  }
}

// ----------------------------------------------------------------------------
// 4. MAIN VERIFICATION SUITE
// ----------------------------------------------------------------------------
async function runLiveChecks() {
  console.log('================================================================');
  console.log('MINDX LEARN — M2 Live Verification Harness (Run: ' + RUN_ID + ')');
  console.log('Supabase Target : ' + SUPABASE_URL);
  console.log('Next.js BFF Target: ' + APP_URL);
  console.log('Security Policy : Zero logging of tokens, PINs, PII, raw errors or identifiers.');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // PHASE 1: CORE QA-ACTOR SETUP & CLASS PROVISIONING
  // --------------------------------------------------------------------------
  console.log('--- Phase 1: QA-Actor Seeding & Class Provisioning ---');

  // 1.1 Seed Admin QA Actor with canonical schema
  const adminProfileId = crypto.randomUUID();
  const adminAuthUserId = crypto.randomUUID();
  const adminEmail = `m2qa_admin_${RUN_ID}@example.invalid`;
  const adminPassword = crypto.randomBytes(16).toString('base64url') + 'Aa1!';

  const seedAdminRes = await callEdge('coordinator-seed-fixture', {
    fixtureType: 'qa-actor',
    fixtureRole: 'admin',
    profileId: adminProfileId,
    authUserId: adminAuthUserId,
    authEmail: adminEmail,
    authPassword: adminPassword,
    fullName: 'TEST M2QA Admin',
  });

  const adminSeeded = seedAdminRes.status === 200 && seedAdminRes.data?.success === true;
  recordCheck('1.1', 'Seed Admin QA-Actor via coordinator-seed-fixture bridge', adminSeeded, {
    httpStatus: seedAdminRes.status,
    code: seedAdminRes.data?.code,
    reason: adminSeeded ? undefined : 'Worker A coordinator-seed-fixture must support canonical authPassword fixture',
  });

  if (adminSeeded) {
    memoryStore.admin = {
      profileId: adminProfileId,
      authUserId: adminAuthUserId,
      email: adminEmail,
      password: adminPassword,
    };
  }

  // 1.2 Admin Edge Native Login, BFF Login with valid cookie attributes & roundtrip GET session
  let adminNativeToken = null;
  let adminBffCookie = null;
  if (memoryStore.admin) {
    const edgeLoginRes = await callEdge('staff-login', {
      email: adminEmail,
      password: adminPassword,
    });
    if (edgeLoginRes.status === 200 && edgeLoginRes.data?.success === true && edgeLoginRes.data?.data?.session?.access_token) {
      adminNativeToken = edgeLoginRes.data.data.session.access_token;
      memoryStore.admin.nativeToken = adminNativeToken;
    }

    const bffLoginRes = await callBff('staff-login', 'POST', {
      email: adminEmail,
      password: adminPassword,
    });
    const bffLoginOk = bffLoginRes.status === 200 && bffLoginRes.data?.success === true && Boolean(bffLoginRes.sessionCookieValue);
    if (bffLoginOk) {
      adminBffCookie = bffLoginRes.sessionCookieValue;
      memoryStore.admin.bffCookie = adminBffCookie;
    }

    const cookieAttrOk = assertCookieAttributes(bffLoginRes.setCookie, adminBffCookie, APP_URL);

    const sessRes = adminBffCookie ? await callBff('session', 'GET', null, {}, adminBffCookie) : null;
    const sessionRoundtripOk =
      sessRes?.status === 200 &&
      sessRes.data?.success === true &&
      sessRes.data?.user?.id === adminProfileId;

    const sanitized =
      assertSanitizedDto(bffLoginRes.data) &&
      assertSanitizedDto(sessRes?.data) &&
      bffLoginRes.headers.get('cache-control')?.includes('no-store');

    const adminLoginPassed = Boolean(bffLoginOk && cookieAttrOk && sessionRoundtripOk && sanitized);
    recordCheck('1.2', 'Admin staff-login on Next BFF returns encrypted cookie with valid attributes, verified roundtrip GET session, and sanitized DTO', adminLoginPassed, {
      httpStatus: bffLoginRes.status,
      hasCookie: Boolean(adminBffCookie),
      cookieAttrOk,
      sessionRoundtripOk,
      sanitized,
    });
  } else {
    recordCheck('1.2', 'Admin staff-login on Next BFF', false, { reason: 'Admin QA-Actor seeding failed' });
  }

  // 1.3 Admin Creates Classes via Next BFF (A, B, LOAD)
  let classA_id = null;
  let classB_id = null;
  let classLoad_id = null;
  let classBCode = null;

  if (adminBffCookie) {
    const classACode = `TEST_M2QA_${RUN_ID}_A`;
    classBCode = `TEST_M2QA_${RUN_ID}_B`;
    const classLoadCode = `TEST_M2QA_${RUN_ID}_LOAD`;

    const resA = await callBff('create-class', 'POST', { code: classACode, name: 'Lop Kiem Thu M2QA A' }, {}, adminBffCookie);
    const resB = await callBff('create-class', 'POST', { code: classBCode, name: 'Lop Kiem Thu M2QA B' }, {}, adminBffCookie);
    const resLoad = await callBff('create-class', 'POST', { code: classLoadCode, name: 'Lop Tai M2QA 200' }, {}, adminBffCookie);

    if (resA.status === 200 && resA.data?.success === true && resA.data?.data?.id) classA_id = resA.data.data.id;
    if (resB.status === 200 && resB.data?.success === true && resB.data?.data?.id) classB_id = resB.data.data.id;
    if (resLoad.status === 200 && resLoad.data?.success === true && resLoad.data?.data?.id) classLoad_id = resLoad.data.data.id;

    memoryStore.classes = { classA: classA_id, classB: classB_id, classLoad: classLoad_id, classBCode };

    const classesCreated = Boolean(classA_id && classB_id && classLoad_id);
    recordCheck('1.3', 'Admin creates controlled fixture classes (A, B, LOAD) via Next BFF', classesCreated, {
      hasA: Boolean(classA_id),
      hasB: Boolean(classB_id),
      hasLoad: Boolean(classLoad_id),
    });
  } else {
    recordCheck('1.3', 'Admin creates controlled fixture classes via Next BFF', false, {
      reason: 'Admin BFF session unavailable',
    });
  }

  // 1.4 Seed Teacher QA Actor with Assigned Class A
  let teacherBffCookie = null;
  let teacherNativeToken = null;
  if (classA_id) {
    const teacherProfileId = crypto.randomUUID();
    const teacherAuthUserId = crypto.randomUUID();
    const teacherEmail = `m2qa_teacher_${RUN_ID}@example.invalid`;
    const teacherPassword = crypto.randomBytes(16).toString('base64url') + 'Aa1!';

    const seedTeacherRes = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'teacher',
      profileId: teacherProfileId,
      authUserId: teacherAuthUserId,
      authEmail: teacherEmail,
      authPassword: teacherPassword,
      fullName: 'TEST M2QA Teacher',
      assignedClassIds: [classA_id],
    });

    const teacherSeeded = seedTeacherRes.status === 200 && seedTeacherRes.data?.success === true;
    recordCheck('1.4', 'Seed Teacher QA-Actor with assigned Class A and obtain native JWT', teacherSeeded, {
      httpStatus: seedTeacherRes.status,
    });

    if (teacherSeeded) {
      memoryStore.teacher = {
        profileId: teacherProfileId,
        authUserId: teacherAuthUserId,
        email: teacherEmail,
        password: teacherPassword,
        assignedClassId: classA_id,
      };

      const tEdgeLogin = await callEdge('staff-login', { email: teacherEmail, password: teacherPassword });
      if (tEdgeLogin.status === 200 && tEdgeLogin.data?.success === true && tEdgeLogin.data?.data?.session?.access_token) {
        teacherNativeToken = tEdgeLogin.data.data.session.access_token;
        memoryStore.teacher.nativeToken = teacherNativeToken;
      }

      const tBffLogin = await callBff('staff-login', 'POST', { email: teacherEmail, password: teacherPassword });
      if (tBffLogin.status === 200 && tBffLogin.data?.success === true && tBffLogin.sessionCookieValue) {
        teacherBffCookie = tBffLogin.sessionCookieValue;
        memoryStore.teacher.bffCookie = teacherBffCookie;
      }
    }
  } else {
    recordCheck('1.4', 'Seed Teacher QA-Actor with assigned Class A', false, { reason: 'Class A was not created' });
  }

  // --------------------------------------------------------------------------
  // PHASE 2: STUDENT QA-ACTORS & PIN SEEDING (ISSUED VS DRAFT & ISOLATED FIXTURES)
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 2: Student Seeding & Distinct Credentials ---');

  // 2.1 Seed Student S1 (Student A, Issued in Class A)
  let s1Data = null;
  let studentANativeToken = null;
  if (classA_id) {
    const s1Pin = generateSecurePin8();
    const s1ProfileId = crypto.randomUUID();
    const s1AuthUserId = crypto.randomUUID();
    const s1Code = `TEST_M2QA_${RUN_ID}_S1`;
    const s1Email = `m2qa_s1_${RUN_ID}@example.invalid`;
    const s1DerivedPassword = deriveStudentPassword(s1AuthUserId, s1Pin, PIN_PEPPER);

    const seedS1Res = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: s1ProfileId,
      authUserId: s1AuthUserId,
      authEmail: s1Email,
      authPassword: s1DerivedPassword,
      studentCode: s1Code,
      classId: classA_id,
      pinIssued: true,
      fullName: 'TEST Student S1 Issued',
    });

    const s1Ok = seedS1Res.status === 200 && seedS1Res.data?.success === true;
    recordCheck('2.1', 'Seed Student S1 (Student A in Class A) with distinct PIN and derived HMAC', s1Ok, {
      httpStatus: seedS1Res.status,
    });

    if (s1Ok) {
      s1Data = {
        profileId: s1ProfileId,
        authUserId: s1AuthUserId,
        email: s1Email,
        pin: s1Pin,
        derivedPassword: s1DerivedPassword,
        studentCode: s1Code,
        classId: classA_id,
        pinIssued: true,
      };
      memoryStore.students.set(s1Code, s1Data);

      const prepRes = await callEdge('student-login-prepare', { studentCode: s1Code });
      if (prepRes.status === 200 && prepRes.data?.data?.challengeId) {
        const completeRes = await callEdge('student-login-complete', {
          challengeId: prepRes.data.data.challengeId,
          authPassword: s1DerivedPassword,
        });
        if (completeRes.status === 200 && completeRes.data?.success === true && completeRes.data?.data?.session?.access_token) {
          studentANativeToken = completeRes.data.data.session.access_token;
          s1Data.nativeToken = studentANativeToken;
        }
      }
      if (!studentANativeToken && SUPABASE_PUBLIC_KEY) {
        const gotrueRes = await callGotrue('token?grant_type=password', {
          email: s1Email,
          password: s1DerivedPassword,
        });
        if (gotrueRes?.status === 200 && gotrueRes.data?.access_token) {
          studentANativeToken = gotrueRes.data.access_token;
          s1Data.nativeToken = studentANativeToken;
        }
      }
    }
  } else {
    recordCheck('2.1', 'Seed Student S1 (Issued)', false, { reason: 'Class A unavailable' });
  }

  // 2.2 Seed Student B (Foreign Student in Class B, pinIssued: true) for strict tenant isolation
  let sBData = null;
  if (classB_id) {
    const sBPin = generateSecurePin8();
    const sBProfileId = crypto.randomUUID();
    const sBAuthUserId = crypto.randomUUID();
    const sBCode = `TEST_M2QA_${RUN_ID}_SB`;
    const sBEmail = `m2qa_sb_${RUN_ID}@example.invalid`;
    const sBDerivedPassword = deriveStudentPassword(sBAuthUserId, sBPin, PIN_PEPPER);

    const seedSBRes = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: sBProfileId,
      authUserId: sBAuthUserId,
      authEmail: sBEmail,
      authPassword: sBDerivedPassword,
      studentCode: sBCode,
      classId: classB_id,
      pinIssued: true,
      fullName: 'TEST Student B Foreign',
    });

    const sBOk = seedSBRes.status === 200 && seedSBRes.data?.success === true;
    recordCheck('2.2', 'Seed Student B (Foreign Student in Class B) for strict cross-tenant RLS isolation', sBOk, {
      httpStatus: seedSBRes.status,
    });

    if (sBOk) {
      sBData = {
        profileId: sBProfileId,
        authUserId: sBAuthUserId,
        email: sBEmail,
        pin: sBPin,
        derivedPassword: sBDerivedPassword,
        studentCode: sBCode,
        classId: classB_id,
        pinIssued: true,
      };
      memoryStore.students.set(sBCode, sBData);
    }
  } else {
    recordCheck('2.2', 'Seed Student B in Class B', false, { reason: 'Class B unavailable' });
  }

  // 2.3 Seed 2 Draft Students in Class B (pinIssued: false) for Batch PIN Issue Test
  let d1Data = null;
  let d2Data = null;
  if (classB_id) {
    const d1Pin = generateSecurePin8();
    const d1ProfileId = crypto.randomUUID();
    const d1AuthUserId = crypto.randomUUID();
    const d1Code = `TEST_M2QA_${RUN_ID}_D1`;
    const d1Email = `m2qa_d1_${RUN_ID}@example.invalid`;
    const d1Derived = deriveStudentPassword(d1AuthUserId, d1Pin, PIN_PEPPER);

    const d2Pin = generateSecurePin8();
    const d2ProfileId = crypto.randomUUID();
    const d2AuthUserId = crypto.randomUUID();
    const d2Code = `TEST_M2QA_${RUN_ID}_D2`;
    const d2Email = `m2qa_d2_${RUN_ID}@example.invalid`;
    const d2Derived = deriveStudentPassword(d2AuthUserId, d2Pin, PIN_PEPPER);

    const seedD1 = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: d1ProfileId,
      authUserId: d1AuthUserId,
      authEmail: d1Email,
      authPassword: d1Derived,
      studentCode: d1Code,
      classId: classB_id,
      pinIssued: false,
      fullName: 'TEST Student D1 Draft',
    });

    const seedD2 = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: d2ProfileId,
      authUserId: d2AuthUserId,
      authEmail: d2Email,
      authPassword: d2Derived,
      studentCode: d2Code,
      classId: classB_id,
      pinIssued: false,
      fullName: 'TEST Student D2 Draft',
    });

    const draftSeeded =
      seedD1.status === 200 &&
      seedD1.data?.success === true &&
      seedD2.status === 200 &&
      seedD2.data?.success === true;

    recordCheck('2.3', 'Seed 2 Draft Students in Class B (pinIssued: false contract, data.success: true)', draftSeeded, {
      seedD1Status: seedD1.status,
      seedD2Status: seedD2.status,
    });

    if (draftSeeded) {
      d1Data = {
        profileId: d1ProfileId,
        authUserId: d1AuthUserId,
        email: d1Email,
        pin: d1Pin,
        derivedPassword: d1Derived,
        studentCode: d1Code,
        classId: classB_id,
        pinIssued: false,
      };
      d2Data = {
        profileId: d2ProfileId,
        authUserId: d2AuthUserId,
        email: d2Email,
        pin: d2Pin,
        derivedPassword: d2Derived,
        studentCode: d2Code,
        classId: classB_id,
        pinIssued: false,
      };
      memoryStore.students.set(d1Code, d1Data);
      memoryStore.students.set(d2Code, d2Data);
    }
  } else {
    recordCheck('2.3', 'Seed 2 Draft Students in Class B', false, { reason: 'Class B unavailable' });
  }

  // --------------------------------------------------------------------------
  // PHASE 1.5: POSTGREST RLS MATRIX & ROLE MUTATION ISOLATION PROBES
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 1.5: Native PostgREST RLS Matrix & Role Isolation ---');

  // 1.5a Teacher Role Mutation Escalation Denial (403 on create-class & create-teacher)
  if (teacherNativeToken) {
    const createClassAttempt = await callEdge('create-class', { code: 'ILLEGAL_CLASS', name: 'Illegal' }, {}, teacherNativeToken);
    const createTeacherAttempt = await callEdge('create-teacher', { email: 't2@example.invalid', name: 'T2' }, {}, teacherNativeToken);

    const mutationBlocked = createClassAttempt.status === 403 && createTeacherAttempt.status === 403;
    recordCheck('1.5a', 'Teacher role mutation escalation denied (403 on create-class & create-teacher)', mutationBlocked, {
      createClassStatus: createClassAttempt.status,
      createTeacherStatus: createTeacherAttempt.status,
    });
  } else {
    recordCheck('1.5a', 'Teacher role mutation escalation denied (403)', false, {
      reason: 'Teacher native token unavailable',
    });
  }

  // 1.5b Teacher Native PostgREST RLS Matrix (Assigned Read = 1, Foreign = 0 rows)
  if (teacherNativeToken && classA_id && classB_id && sBData) {
    const resClassA = await callPostgrest(`classes?select=id&id=eq.${classA_id}`, 'GET', null, teacherNativeToken);
    const hasClassA = resClassA?.status === 200 && Array.isArray(resClassA.data) && resClassA.data.length === 1 && resClassA.data[0]?.id === classA_id;

    const resClassB = await callPostgrest(`classes?select=id&id=eq.${classB_id}`, 'GET', null, teacherNativeToken);
    const deniesClassB = (resClassB?.status === 200 && Array.isArray(resClassB.data) && resClassB.data.length === 0) || resClassB?.status === 403;

    const resStudentsB = await callPostgrest(`students?select=id&current_class_id=eq.${classB_id}`, 'GET', null, teacherNativeToken);
    const deniesStudentsB = (resStudentsB?.status === 200 && Array.isArray(resStudentsB.data) && resStudentsB.data.length === 0) || resStudentsB?.status === 403;

    const resProfileForeign = await callPostgrest(`profiles?select=id&id=eq.${sBData.profileId}`, 'GET', null, teacherNativeToken);
    const deniesForeignProfile = (resProfileForeign?.status === 200 && Array.isArray(resProfileForeign.data) && resProfileForeign.data.length === 0) || resProfileForeign?.status === 403;

    const teacherMatrixPassed = Boolean(hasClassA && deniesClassB && deniesStudentsB && deniesForeignProfile);
    recordCheck('1.5b', 'Teacher native PostgREST RLS: exact 1 assigned class read, foreign class, students, profiles denied (0 rows)', teacherMatrixPassed, {
      hasClassA,
      deniesClassB,
      deniesStudentsB,
      deniesForeignProfile,
    });
  } else {
    recordCheck('1.5b', 'Teacher native PostgREST RLS matrix', false, {
      reason: 'Teacher token, classes, or Student B unavailable',
    });
  }

  // 1.5c Student Cross-Tenant PostgREST RLS & Tamper Denial
  if (studentANativeToken && s1Data && sBData && adminNativeToken) {
    const resReadForeign = await callPostgrest(`students?select=id&id=eq.${sBData.profileId}`, 'GET', null, studentANativeToken);
    const foreignReadZero = resReadForeign?.status === 200 && Array.isArray(resReadForeign.data) && resReadForeign.data.length === 0;

    const patchRes = await callPostgrest(
      `students?id=eq.${sBData.profileId}`,
      'PATCH',
      { notes: 'tampered_malicious_note', status: 'archived' },
      studentANativeToken,
      true
    );
    const patchDenied =
      patchRes?.status === 401 ||
      patchRes?.status === 403 ||
      patchRes?.status === 404 ||
      (Array.isArray(patchRes?.data) && patchRes.data.length === 0);

    const adminVerifyRes = await callPostgrest(`students?select=id,status,notes&id=eq.${sBData.profileId}`, 'GET', null, adminNativeToken);
    const studentBUnchanged =
      adminVerifyRes?.status === 200 &&
      Array.isArray(adminVerifyRes.data) &&
      adminVerifyRes.data[0]?.status === 'active' &&
      adminVerifyRes.data[0]?.notes !== 'tampered_malicious_note';

    const ownStudentRes = await callPostgrest(`students?select=id&id=eq.${s1Data.profileId}`, 'GET', null, studentANativeToken);
    const ownProfileRes = await callPostgrest(`profiles?select=id&id=eq.${s1Data.profileId}`, 'GET', null, studentANativeToken);
    const ownRowReadable =
      ownStudentRes?.status === 200 &&
      Array.isArray(ownStudentRes.data) &&
      ownStudentRes.data.length === 1 &&
      ownProfileRes?.status === 200 &&
      Array.isArray(ownProfileRes.data) &&
      ownProfileRes.data.length === 1;

    const studentIsolationPassed = Boolean(foreignReadZero && patchDenied && studentBUnchanged && ownRowReadable);
    recordCheck(
      '1.5c',
      'Student cross-tenant PostgREST RLS: foreign student read 0 rows, foreign PATCH denied & verified unchanged, own row readable 1',
      studentIsolationPassed,
      {
        foreignReadZero,
        patchDenied,
        studentBUnchanged,
        ownRowReadable,
      }
    );
  } else {
    recordCheck('1.5c', 'Student cross-tenant PostgREST RLS', false, {
      reason: 'Student A token, Student B, or Admin token unavailable',
    });
  }

  // 1.5d PostgREST RPC Internal Wrappers Denied to anon and authenticated (No Fabricated 403)
  if (SUPABASE_PUBLIC_KEY) {
    if (!teacherNativeToken) {
      recordCheck('1.5d', 'PostgREST RPC internal wrappers denied to anon and authenticated (401/403/404)', false, {
        reason: 'Teacher native token absent; refusing to fabricate denial',
      });
    } else {
      const anonBffSecretRpc = await callPostgrest(
        'rpc/m2_verify_bff_secret',
        'POST',
        { p_secret_sha256: '0000000000000000000000000000000000000000000000000000000000000000' },
        null
      );
      const authBffSecretRpc = await callPostgrest(
        'rpc/m2_verify_bff_secret',
        'POST',
        { p_secret_sha256: '0000000000000000000000000000000000000000000000000000000000000000' },
        teacherNativeToken
      );
      const anonActorSessionRpc = await callPostgrest(
        'rpc/m2_verify_actor_session',
        'POST',
        { p_auth_user_id: crypto.randomUUID(), p_session_id: crypto.randomUUID() },
        null
      );

      const rpcDenied =
        [401, 403, 404].includes(anonBffSecretRpc?.status) &&
        [401, 403, 404].includes(authBffSecretRpc?.status) &&
        [401, 403, 404].includes(anonActorSessionRpc?.status);

      recordCheck('1.5d', 'PostgREST RPC internal wrappers denied to anon and authenticated (401/403/404)', rpcDenied, {
        anonSecretStatus: anonBffSecretRpc?.status,
        authSecretStatus: authBffSecretRpc?.status,
        anonSessionStatus: anonActorSessionRpc?.status,
      });
    }
  } else {
    recordCheck('1.5d', 'PostgREST RPC internal wrappers denied', false, { reason: 'Supabase public key unavailable' });
  }

  // 1.5e Supabase Storage Private Bucket and Object Isolation
  if (SUPABASE_PUBLIC_KEY) {
    if (!adminNativeToken || !teacherNativeToken || !studentANativeToken) {
      recordCheck('1.5e', 'Supabase Storage private bucket and object isolation', false, {
        reason: 'Admin, Teacher, or Student native token absent; refusing to fabricate denial',
      });
    } else {
      const adminBucketList = await callStorageList('m2-private-fixture', adminNativeToken);
      const bucketMissingOrError = !adminBucketList || adminBucketList.status === 400 || adminBucketList.status === 404;

      if (bucketMissingOrError) {
        recordCheck('1.5e', 'Supabase Storage private bucket and object isolation', false, {
          reason: 'Storage bucket m2-private-fixture is missing or returned 400/404',
          httpStatus: adminBucketList?.status,
        });
      } else {
        const probePath = process.env.MINDX_STORAGE_PROBE_PATH?.trim();

        if (!probePath) {
          // Until Root provides actual positive Admin existing object fixture, record required Storage proof NOT_TESTED/blocked (not PASS from empty 200/404)
          recordCheck('1.5e', 'Supabase Storage private bucket and object isolation', null, {
            status: 'NOT_TESTED',
            reason: 'NOT_TESTED: Positive Admin existing object fixture not provided via MINDX_STORAGE_PROBE_PATH; empty bucket or list 200/404 cannot prove private object isolation',
            bucketStatus: adminBucketList.status,
          });
        } else {
          // Probe path is provided by Root: verify positive Admin 200 object, then GV/HS/anon download 403/404
          const adminDownload = await callStorageDownload('m2-private-fixture', probePath, adminNativeToken);
          const adminObjectExists = adminDownload?.status === 200;

          if (!adminObjectExists) {
            recordCheck('1.5e', 'Supabase Storage private bucket and object isolation', false, {
              reason: 'Admin failed to read existing storage fixture object (expected HTTP 200)',
              adminStatus: adminDownload?.status,
            });
          } else {
            const teacherDownload = await callStorageDownload('m2-private-fixture', probePath, teacherNativeToken);
            const studentDownload = await callStorageDownload('m2-private-fixture', probePath, studentANativeToken);
            const anonDownload = await callStorageDownload('m2-private-fixture', probePath, null);

            const isStorageActorDenied = (d) => {
              if (!d) return false;
              if (d.status === 403 || d.status === 404) return true;
              return d.status === 400 && String(d.providerStatusCode) === '404' && d.error === 'not_found';
            };

            const isStorageAnonDenied = (d) => {
              if (!d) return false;
              if (d.status === 401) return true;
              return isStorageActorDenied(d);
            };

            const teacherDenied = isStorageActorDenied(teacherDownload);
            const studentDenied = isStorageActorDenied(studentDownload);
            const anonDenied = isStorageAnonDenied(anonDownload);

            const storageIsolationPassed = teacherDenied && studentDenied && anonDenied;
            recordCheck('1.5e', 'Supabase Storage private bucket and object isolation: Admin 200, Teacher/Student/Anon denied (401/403/404 or 400 not_found)', storageIsolationPassed, {
              adminStatus: adminDownload?.status,
              teacherStatus: teacherDownload?.status,
              teacherProviderStatus: teacherDownload?.providerStatusCode || null,
              teacherError: teacherDownload?.error || null,
              studentStatus: studentDownload?.status,
              studentProviderStatus: studentDownload?.providerStatusCode || null,
              studentError: studentDownload?.error || null,
              anonStatus: anonDownload?.status,
              anonProviderStatus: anonDownload?.providerStatusCode || null,
              anonError: anonDownload?.error || null,
              storageIsolationPassed,
            });
          }
        }
      }
    }
  } else {
    recordCheck('1.5e', 'Supabase Storage private bucket and object isolation', false, { reason: 'Supabase public key unavailable' });
  }

  // --------------------------------------------------------------------------
  // PHASE 3: NATIVE GOTRUE RAW PIN PROBE & NEXT BFF AUTH BRIDGE
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 3: Native GoTrue Raw PIN vs Derived HMAC Probes ---');

  // 3.1 Native GoTrue Raw PIN Probe (Must Fail 400) vs Derived HMAC (Must Succeed 200)
  if (s1Data && SUPABASE_PUBLIC_KEY) {
    const rawGoTrueRes = await callGotrue('token?grant_type=password', {
      email: s1Data.email,
      password: s1Data.pin,
    });
    const rawGoTrueFailed = rawGoTrueRes && rawGoTrueRes.status === 400;

    const derivedGoTrueRes = await callGotrue('token?grant_type=password', {
      email: s1Data.email,
      password: s1Data.derivedPassword,
    });
    const derivedGoTrueOk = derivedGoTrueRes && derivedGoTrueRes.status === 200 && Boolean(derivedGoTrueRes.data?.access_token);

    recordCheck('3.1', 'Native GoTrue rejects raw 8-digit PIN (400) and accepts derived HMAC password (200)', rawGoTrueFailed && derivedGoTrueOk, {
      rawStatus: rawGoTrueRes?.status,
      derivedStatus: derivedGoTrueRes?.status,
    });
  } else {
    recordCheck('3.1', 'Native GoTrue rejects raw PIN and accepts derived HMAC', false, {
      reason: SUPABASE_PUBLIC_KEY ? 'Student S1 data unavailable' : 'MINDX_SUPABASE_PUBLIC_KEY not set',
    });
  }

  // 3.2 Next BFF Student Login: validates Set-Cookie attributes, roundtrip GET session, and sanitized DTO
  let s1BffCookie = null;
  if (s1Data) {
    const bffStudentLogin = await callBff('student-login-prepare', 'POST', {
      studentCode: s1Data.studentCode,
      pin: s1Data.pin,
    });

    const bffLoginOk = bffStudentLogin.status === 200 && bffStudentLogin.data?.success === true && Boolean(bffStudentLogin.sessionCookieValue);
    if (bffLoginOk) {
      s1BffCookie = bffStudentLogin.sessionCookieValue;
      s1Data.bffCookie = s1BffCookie;
    }

    const cookieAttrOk = assertCookieAttributes(bffStudentLogin.setCookie, s1BffCookie, APP_URL);

    const sessRes = s1BffCookie ? await callBff('session', 'GET', null, {}, s1BffCookie) : null;
    const sessionRoundtripOk =
      sessRes?.status === 200 &&
      sessRes.data?.success === true &&
      sessRes.data?.user?.id === s1Data.profileId;

    const sanitized =
      assertSanitizedDto(bffStudentLogin.data) &&
      assertSanitizedDto(sessRes?.data);

    const studentLoginPassed = Boolean(bffLoginOk && cookieAttrOk && sessionRoundtripOk && sanitized);
    recordCheck('3.2', 'Next BFF student login derives HMAC, returns encrypted cookie with valid attributes, verified roundtrip GET session, and sanitized DTO', studentLoginPassed, {
      httpStatus: bffStudentLogin.status,
      hasCookie: Boolean(s1BffCookie),
      cookieAttrOk,
      sessionRoundtripOk,
      sanitized,
    });
  } else {
    recordCheck('3.2', 'Next BFF student login exercises HMAC derivation', false, { reason: 'Student S1 unavailable' });
  }

  // 3.3 Atomic Challenge Replay Rejection
  if (s1Data) {
    const prepRes = await callEdge('student-login-prepare', { studentCode: s1Data.studentCode });
    if (prepRes.status === 200 && prepRes.data?.data?.challengeId) {
      const chId = prepRes.data.data.challengeId;

      const firstConsume = await callEdge('student-login-complete', {
        challengeId: chId,
        authPassword: s1Data.derivedPassword,
      });
      const firstOk = firstConsume.status === 200 && firstConsume.data?.success === true;

      const replayRes = await callEdge('student-login-complete', {
        challengeId: chId,
        authPassword: s1Data.derivedPassword,
      });
      const replayBlocked = replayRes.status === 401 && replayRes.data?.success === false;

      recordCheck('3.3', 'Student login challenge consumed successfully and replay atomically rejected (401)', firstOk && replayBlocked, {
        firstConsumeStatus: firstConsume.status,
        replayStatus: replayRes.status,
      });
    } else {
      recordCheck('3.3', 'Student login challenge replay rejection', false, { reason: 'Could not obtain fresh challengeId' });
    }
  } else {
    recordCheck('3.3', 'Student login challenge replay rejection', false, { reason: 'Student S1 unavailable' });
  }

  // --------------------------------------------------------------------------
  // PHASE 4: CSV FIRST-ISSUE & SINGLE REISSUE FLOW (CLASS B)
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 4: PIN Management, CSV First-Issue & Reissue ---');

  // 4.1 Admin Calls BFF pin-issue for Class B with Draft Students
  let newD1PinFromCsv = null;
  let newD2PinFromCsv = null;

  if (adminBffCookie && classB_id) {
    const issueRes = await callBff('pin-issue', 'POST', { classId: classB_id }, {}, adminBffCookie);
    const contentType = issueRes.headers.get('content-type') || '';
    const cacheControl = issueRes.headers.get('cache-control') || '';
    const isCsv = contentType.includes('text/csv');
    const isNoStore = cacheControl.includes('no-store');

    let exactTwoRows = false;
    let pupilsExactOnce = false;
    let pinsDistinct = false;
    let classColMatched = true;

    if (issueRes.status === 200 && isCsv && issueRes.rawText) {
      const cleanText = issueRes.rawText.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const dataLines = lines.slice(1);
      exactTwoRows = dataLines.length === 2;

      const normD1Code = d1Data ? d1Data.studentCode.trim().toUpperCase() : null;
      const normD2Code = d2Data ? d2Data.studentCode.trim().toUpperCase() : null;
      const knownClassCode = (classBCode || (memoryStore.classes && memoryStore.classes.classBCode) || '').trim().toUpperCase();

      let d1MatchCount = 0;
      let d2MatchCount = 0;

      for (const line of dataLines) {
        const parts = parseCsvLine(line);
        if (parts.length >= 4) {
          const code = (parts[0] || '').trim().toUpperCase();
          const classCol = (parts[2] || '').trim().toUpperCase();
          const pin = parts[3]; // Never normalize PIN digits

          if (knownClassCode && classCol !== knownClassCode) {
            classColMatched = false;
          }

          if (normD1Code && code === normD1Code) {
            d1MatchCount++;
            if (/^\d{8}$/.test(pin)) {
              newD1PinFromCsv = pin;
            }
          } else if (normD2Code && code === normD2Code) {
            d2MatchCount++;
            if (/^\d{8}$/.test(pin)) {
              newD2PinFromCsv = pin;
            }
          }
        }
      }

      pupilsExactOnce = d1MatchCount === 1 && d2MatchCount === 1;
      const validD1 = Boolean(newD1PinFromCsv && /^\d{8}$/.test(newD1PinFromCsv));
      const validD2 = Boolean(newD2PinFromCsv && /^\d{8}$/.test(newD2PinFromCsv));
      pinsDistinct = validD1 && validD2 && newD1PinFromCsv !== newD2PinFromCsv;
    }

    const csvOk =
      issueRes.status === 200 &&
      isCsv &&
      isNoStore &&
      exactTwoRows &&
      pupilsExactOnce &&
      pinsDistinct &&
      classColMatched;

    recordCheck('4.1', 'Admin calls BFF pin-issue: returns no-store CSV with distinct 8-digit PINs', csvOk, {
      httpStatus: issueRes.status,
      isCsv,
      isNoStore,
      exactTwoRows,
      pupilsExactOnce,
      pinsDistinct,
      classColMatched,
      foundD1Pin: Boolean(newD1PinFromCsv),
      foundD2Pin: Boolean(newD2PinFromCsv),
      reason: csvOk ? undefined : 'First-issue PIN CSV generation or student verification failed',
    });
  } else {
    recordCheck('4.1', 'Admin calls BFF pin-issue for Class B', false, { reason: 'Admin cookie or Class B unavailable' });
  }

  // 4.2 Verify Student D1 logs in with new CSV PIN
  if (d1Data && newD1PinFromCsv) {
    const d1LoginRes = await callBff('student-login-prepare', 'POST', {
      studentCode: d1Data.studentCode,
      pin: newD1PinFromCsv,
    });

    const d1Ok = d1LoginRes.status === 200 && d1LoginRes.data?.success === true;
    recordCheck('4.2', 'Student D1 logs in via Next BFF using actual new CSV PIN', d1Ok, {
      httpStatus: d1LoginRes.status,
    });
  } else {
    recordCheck('4.2', 'Student D1 logs in with new CSV PIN', false, {
      reason: newD1PinFromCsv ? 'Student D1 unavailable' : 'CSV PIN was not obtained from Check 4.1',
    });
  }

  // 4.3 Repeat First-Issue is Honest (Zero Eligible)
  if (adminBffCookie && classB_id) {
    const repeatRes = await callBff('pin-issue', 'POST', { classId: classB_id }, {}, adminBffCookie);
    const repeatHonest =
      repeatRes.status === 200 &&
      repeatRes.data?.success === false &&
      (repeatRes.data?.message?.includes('đã được cấp') || repeatRes.data?.code === 'NO_UNISSUED_STUDENTS');

    recordCheck('4.3', 'Repeat pin-issue on same class honestly returns zero eligible students (no CSV re-read)', repeatHonest, {
      httpStatus: repeatRes.status,
      code: repeatRes.data?.code,
    });
  } else {
    recordCheck('4.3', 'Repeat pin-issue honestly returns zero eligible', false, { reason: 'Admin cookie unavailable' });
  }

  // 4.4 Role Denial for PIN operations with VALID payloads (No Fabricated 403)
  if (classA_id) {
    if (!teacherBffCookie || !s1BffCookie) {
      recordCheck('4.4', 'Role authorization: Teacher/Student denied (403) and Anonymous denied (401) on valid pin-issue', false, {
        reason: 'Teacher or Student BFF session cookie absent; refusing to fabricate 403',
      });
    } else {
      const tPinRes = await callBff('pin-issue', 'POST', { classId: classA_id }, {}, teacherBffCookie);
      const tBlocked = tPinRes.status === 403;

      const sPinRes = await callBff('pin-issue', 'POST', { classId: classA_id }, {}, s1BffCookie);
      const sBlocked = sPinRes.status === 403;

      const aPinRes = await callBff('pin-issue', 'POST', { classId: classA_id });
      const aBlocked = aPinRes.status === 401;

      recordCheck('4.4', 'Role authorization: Teacher/Student denied (403) and Anonymous denied (401) on valid pin-issue', tBlocked && sBlocked && aBlocked, {
        teacherStatus: tPinRes.status,
        studentStatus: sPinRes.status,
        anonStatus: aPinRes.status,
      });
    }
  } else {
    recordCheck('4.4', 'Role authorization for pin-issue', false, { reason: 'Class A unavailable' });
  }

  // 4.5 Single Reissue: Admin Reissues PIN for exact ONE Student (D1)
  let reissuedD1Pin = null;

  if (adminBffCookie && d1Data && d2Data) {
    const hasInitialPins =
      Boolean(newD1PinFromCsv && /^\d{8}$/.test(newD1PinFromCsv)) &&
      Boolean(newD2PinFromCsv && /^\d{8}$/.test(newD2PinFromCsv));

    if (!hasInitialPins) {
      recordCheck('4.5', 'Single student reissue resets exact one pupil PIN, revokes old credentials, other pupils unchanged', false, {
        reason: 'Actual initial PINs for D1 and D2 from Check 4.1 are required before reissue comparison',
      });
    } else {
      const reissueRes = await callBff('pin-reissue', 'POST', { studentId: d1Data.profileId }, {}, adminBffCookie);
      const contentType = reissueRes.headers.get('content-type') || '';
      const cacheControl = reissueRes.headers.get('cache-control') || '';
      const isCsv = contentType.includes('text/csv');
      const isNoStore = cacheControl.includes('no-store');

      let exactOneRow = false;
      let reissuedClassMatched = true;

      if (reissueRes.status === 200 && isCsv && reissueRes.rawText) {
        const cleanText = reissueRes.rawText.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        const dataLines = lines.slice(1);
        exactOneRow = dataLines.length === 1;

        const normD1Code = d1Data.studentCode.trim().toUpperCase();
        const knownClassCode = (classBCode || (memoryStore.classes && memoryStore.classes.classBCode) || '').trim().toUpperCase();

        for (const line of dataLines) {
          const parts = parseCsvLine(line);
          if (parts.length >= 4) {
            const code = (parts[0] || '').trim().toUpperCase();
            const classCol = (parts[2] || '').trim().toUpperCase();
            const pin = parts[3]; // Never normalize PIN digits

            if (knownClassCode && classCol !== knownClassCode) {
              reissuedClassMatched = false;
            }

            if (code === normD1Code && /^\d{8}$/.test(pin)) {
              reissuedD1Pin = pin;
            }
          }
        }
      }

      let reissuedPinWorks = false;
      let oldPinFails = false;
      let d2Unchanged = false; // default false when missing or unverified

      const validReissuedPin = Boolean(
        reissuedD1Pin &&
        /^\d{8}$/.test(reissuedD1Pin) &&
        reissuedD1Pin !== newD1PinFromCsv
      );

      if (validReissuedPin && reissueRes.status === 200 && isCsv && isNoStore && exactOneRow && reissuedClassMatched) {
        // 1. Verify student D1 logs in with fresh reissued PIN
        const loginNew = await callBff('student-login-prepare', 'POST', {
          studentCode: d1Data.studentCode,
          pin: reissuedD1Pin,
        });
        reissuedPinWorks = loginNew.status === 200 && loginNew.data?.success === true;

        // 2. Verify student D1 CANNOT log in with ACTUAL OLD PIN (newD1PinFromCsv) - NO fallback
        const loginOld = await callBff('student-login-prepare', 'POST', {
          studentCode: d1Data.studentCode,
          pin: newD1PinFromCsv,
        });
        oldPinFails = loginOld.status === 401;

        // 3. Verify student D2 STILL logs in with their ACTUAL OLD PIN (newD2PinFromCsv)
        const loginD2 = await callBff('student-login-prepare', 'POST', {
          studentCode: d2Data.studentCode,
          pin: newD2PinFromCsv,
        });
        d2Unchanged = loginD2.status === 200 && loginD2.data?.success === true;
      }

      const reissuePassed =
        validReissuedPin &&
        reissueRes.status === 200 &&
        isCsv &&
        isNoStore &&
        exactOneRow &&
        reissuedClassMatched &&
        reissuedPinWorks &&
        oldPinFails &&
        d2Unchanged;

      recordCheck('4.5', 'Single student reissue resets exact one pupil PIN, revokes old credentials, other pupils unchanged', reissuePassed, {
        httpStatus: reissueRes.status,
        isCsv,
        isNoStore,
        exactOneRow,
        reissuedClassMatched,
        hasReissuedPin: Boolean(reissuedD1Pin),
        reissuedPinWorks,
        oldPinFails,
        d2Unchanged,
        reason: reissuePassed ? undefined : 'Single student reissue verification failed',
      });
    }
  } else {
    recordCheck('4.5', 'Single student reissue', false, { reason: 'Admin cookie or Student D1/D2 unavailable' });
  }

  // 4.6a Negative PIN commit with Authenticated Admin: expected domain validator 400 or 409 (not 401 or 500)
  if (adminNativeToken && adminBffCookie) {
    const negClassCode = `TEST_M2QA_${RUN_ID}_NEG`;
    const resNegClass = await callBff('create-class', 'POST', { code: negClassCode, name: 'Lop Kiem Thu Negative Commit' }, {}, adminBffCookie);
    const negClassId = resNegClass.data?.data?.id;

    if (!negClassId) {
      recordCheck('4.6a', 'Authenticated Admin negative pin-commit rejected by validator (HTTP 400/409, not 401/500)', false, {
        reason: 'Failed to create dedicated fixture class for negative commit',
      });
    } else {
      const negP1ProfileId = crypto.randomUUID();
      const negP1AuthUserId = crypto.randomUUID();
      const negP1Pin = generateSecurePin8();
      const negP1Derived = deriveStudentPassword(negP1AuthUserId, negP1Pin, PIN_PEPPER);
      const negP1Code = `TEST_M2QA_${RUN_ID}_NP1`;
      const negP1Email = `m2qa_np1_${RUN_ID}@example.invalid`;

      const negP2ProfileId = crypto.randomUUID();
      const negP2AuthUserId = crypto.randomUUID();
      const negP2Pin = generateSecurePin8();
      const negP2Derived = deriveStudentPassword(negP2AuthUserId, negP2Pin, PIN_PEPPER);
      const negP2Code = `TEST_M2QA_${RUN_ID}_NP2`;
      const negP2Email = `m2qa_np2_${RUN_ID}@example.invalid`;

      const seedNP1 = await callEdge('coordinator-seed-fixture', {
        fixtureType: 'qa-actor',
        fixtureRole: 'student',
        profileId: negP1ProfileId,
        authUserId: negP1AuthUserId,
        authEmail: negP1Email,
        authPassword: negP1Derived,
        studentCode: negP1Code,
        classId: negClassId,
        pinIssued: false,
        fullName: 'TEST Pupil Neg1 Draft',
      });

      const seedNP2 = await callEdge('coordinator-seed-fixture', {
        fixtureType: 'qa-actor',
        fixtureRole: 'student',
        profileId: negP2ProfileId,
        authUserId: negP2AuthUserId,
        authEmail: negP2Email,
        authPassword: negP2Derived,
        studentCode: negP2Code,
        classId: negClassId,
        pinIssued: false,
        fullName: 'TEST Pupil Neg2 Draft',
      });

      const pupilsSeeded =
        seedNP1.status === 200 && seedNP1.data?.success === true &&
        seedNP2.status === 200 && seedNP2.data?.success === true;

      if (!pupilsSeeded) {
        recordCheck('4.6a', 'Authenticated Admin negative pin-commit rejected by validator (HTTP 400/409, not 401/500)', false, {
          reason: 'Failed to seed draft pupils for negative commit claim',
        });
      } else {
        const prepClaimRes = await callEdge(
          'pin-prepare',
          { classId: negClassId, mode: 'batch_first_issue' },
          {},
          adminNativeToken
        );

        const opId = prepClaimRes.data?.data?.operationId;
        const targetStudents = prepClaimRes.data?.data?.students;

        if (prepClaimRes.status !== 200 || !prepClaimRes.data?.success || !opId || !Array.isArray(targetStudents) || targetStudents.length !== 2) {
          recordCheck('4.6a', 'Authenticated Admin negative pin-commit rejected by validator (HTTP 400/409, not 401/500)', false, {
            reason: 'pin-prepare failed to return genuine claim operation with 2 reserved targets',
          });
        } else {
          const target0 = targetStudents[0];
          const pwd0 = deriveStudentPassword(target0.authUserId, generateSecurePin8(), PIN_PEPPER);

          const invalidDuplicateRecords = [
            { studentId: target0.studentId, authUserId: target0.authUserId, authPassword: pwd0 },
            { studentId: target0.studentId, authUserId: target0.authUserId, authPassword: pwd0 },
          ];

          const badCommitRes = await callEdge(
            'pin-commit',
            {
              operationId: opId,
              records: invalidDuplicateRecords,
            },
            {},
            adminNativeToken
          );

          const isExpectedValidatorCode = ['DUPLICATE_STUDENT', 'DUPLICATE_AUTH_ID', 'AUTH_ID_MISMATCH', 'RECORD_MISMATCH', 'INVALID_PAYLOAD'].includes(badCommitRes.data?.code);
          const notExpiredOrInternal = badCommitRes.data?.code !== 'OPERATION_EXPIRED' && badCommitRes.status !== 401 && badCommitRes.status !== 500;
          const commitRejectedByValidator =
            (badCommitRes.status === 400 || badCommitRes.status === 409) &&
            badCommitRes.data?.success === false &&
            isExpectedValidatorCode &&
            notExpiredOrInternal;

          recordCheck('4.6a', 'Authenticated Admin negative pin-commit rejected by validator (HTTP 400/409, not 401/500)', commitRejectedByValidator, {
            httpStatus: badCommitRes.status,
            code: badCommitRes.data?.code,
            rejectedByValidator: isExpectedValidatorCode,
            notExpiredOrInternal,
          });
        }
      }
    }
  } else {
    recordCheck('4.6a', 'Authenticated Admin negative pin-commit rejected by validator', false, {
      reason: 'Admin native token or BFF cookie unavailable',
    });
  }

  // 4.6b Concurrent PIN claim race contention and atomic lock overlap
  recordCheck('4.6b', 'Concurrent PIN claim race contention and atomic lock overlap', null, {
    status: 'NOT_TESTED',
    reason: 'NOT_TESTED: Full concurrent contention requires external multi-actor timing synchronization; recorded explicit NOT_TESTED rather than synthetic PASS',
  });

  // --------------------------------------------------------------------------
  // PHASE 5: LIFECYCLE CASES (CLASS ARCHIVE, STUDENT ARCHIVE, LOGOUT, RATE LIMITER)
  // Dedicated fresh accounts to prevent limiter poisoning
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 5: Student Lifecycle, Archival & Rate Limiter ---');

  // 5.1 Class Archival & Restore Lifecycle (Dedicated Fresh Class & Pupil)
  if (adminBffCookie) {
    const classLifeCode = `TEST_M2QA_${RUN_ID}_CLIFE`;
    const resClassLife = await callBff('create-class', 'POST', { code: classLifeCode, name: 'Lop Vong Doi M2QA' }, {}, adminBffCookie);
    const classLifeId = resClassLife.data?.data?.id;

    if (classLifeId) {
      const clProfileId = crypto.randomUUID();
      const clAuthUserId = crypto.randomUUID();
      const clPin = generateSecurePin8();
      const clDerived = deriveStudentPassword(clAuthUserId, clPin, PIN_PEPPER);
      const clCode = `TEST_M2QA_${RUN_ID}_CLP`;
      const clEmail = `m2qa_clp_${RUN_ID}@example.invalid`;

      const seedCl = await callEdge('coordinator-seed-fixture', {
        fixtureType: 'qa-actor',
        fixtureRole: 'student',
        profileId: clProfileId,
        authUserId: clAuthUserId,
        authEmail: clEmail,
        authPassword: clDerived,
        studentCode: clCode,
        classId: classLifeId,
        pinIssued: true,
        fullName: 'TEST Pupil ClassLife',
      });

      if (seedCl.status === 200 && seedCl.data?.success === true) {
        const clGotrue = await callGotrue('token?grant_type=password', { email: clEmail, password: clDerived });
        const clOldJwt = clGotrue?.data?.access_token;

        const clBff = await callBff('student-login-prepare', 'POST', { studentCode: clCode, pin: clPin });
        const clOldCookie = clBff.sessionCookieValue;
        const initialLoginOk = clBff.status === 200 && clBff.data?.success === true && Boolean(clOldCookie) && Boolean(clOldJwt);

        if (!initialLoginOk) {
          recordCheck('5.1', 'Class archive blocks old JWT (native REST own row 0) and BFF cookie (401); restore requires new login and yields own row 1', false, {
            reason: 'Initial pupil login failed or session cookie absent; refusing to fabricate denial',
          });
        } else {
          const ownBefore = await callPostgrest(`students?select=id&id=eq.${clProfileId}`, 'GET', null, clOldJwt);
          const ownBeforeOk = ownBefore?.status === 200 && Array.isArray(ownBefore.data) && ownBefore.data.length === 1;

          // 1. Admin archives class
          const archRes = await callBff('archive-class', 'POST', { id: classLifeId }, {}, adminBffCookie);
          const archOk = archRes.status === 200 && archRes.data?.success === true;

          // 2. Under archive: old JWT yields REST own row 0; old BFF cookie yields 401 on bootstrap and session top-user null; login blocked (403)
          const ownArch = await callPostgrest(`students?select=id&id=eq.${clProfileId}`, 'GET', null, clOldJwt);
          const ownArchZero = ownArch?.status === 200 && Array.isArray(ownArch.data) && ownArch.data.length === 0;

          const bootArch = await callBff('bootstrap', 'GET', null, {}, clOldCookie);
          const sessArch = await callBff('session', 'GET', null, {}, clOldCookie);
          const bffCookieBlocked =
            bootArch.status === 401 &&
            sessArch.status === 200 &&
            sessArch.data?.success === false &&
            sessArch.data?.user === null;

          const loginArch = await callBff('student-login-prepare', 'POST', { studentCode: clCode, pin: clPin });
          const loginArchBlocked = loginArch.status === 403 || loginArch.status === 401;

          // 3. Admin restores class
          const restRes = await callBff('restore-class', 'POST', { id: classLifeId }, {}, adminBffCookie);
          const restOk = restRes.status === 200 && restRes.data?.success === true;

          // 4. Old JWT STILL blocked (version bumped)
          const ownOldAfter = await callPostgrest(`students?select=id&id=eq.${clProfileId}`, 'GET', null, clOldJwt);
          const oldJwtStillDead = ownOldAfter?.status === 200 && Array.isArray(ownOldAfter.data) && ownOldAfter.data.length === 0;

          // 5. Fresh login succeeds and yields own row 1
          const newLoginRes = await callBff('student-login-prepare', 'POST', { studentCode: clCode, pin: clPin });
          const newLoginOk = newLoginRes.status === 200 && newLoginRes.data?.success === true && Boolean(newLoginRes.sessionCookieValue);

          const newGotrue = await callGotrue('token?grant_type=password', { email: clEmail, password: clDerived });
          const clNewJwt = newGotrue?.data?.access_token;

          const ownNewAfter = clNewJwt ? await callPostgrest(`students?select=id&id=eq.${clProfileId}`, 'GET', null, clNewJwt) : null;
          const ownNewOk = ownNewAfter?.status === 200 && Array.isArray(ownNewAfter.data) && ownNewAfter.data.length === 1;

          const classLifecyclePassed = Boolean(
            ownBeforeOk && archOk && ownArchZero && bffCookieBlocked && loginArchBlocked && restOk && oldJwtStillDead && newLoginOk && ownNewOk
          );

          recordCheck(
            '5.1',
            'Class archive blocks old JWT (native REST own row 0) and BFF cookie (401); restore requires new login and yields own row 1',
            classLifecyclePassed,
            {
              ownBeforeOk,
              archOk,
              ownArchZero,
              bffCookieBlocked,
              bootArchStatus: bootArch.status,
              sessArchStatus: sessArch.status,
              loginArchBlocked,
              restOk,
              oldJwtStillDead,
              newLoginOk,
              ownNewOk,
            }
          );
        }
      } else {
        recordCheck('5.1', 'Class archival and restore lifecycle', false, { reason: 'Seeding pupil in test class failed' });
      }
    } else {
      recordCheck('5.1', 'Class archival and restore lifecycle', false, { reason: 'Creating dedicated class failed' });
    }
  } else {
    recordCheck('5.1', 'Class archival and restore lifecycle', false, { reason: 'Admin cookie unavailable' });
  }

  // 5.2 Student Archival & Restore Lifecycle (Dedicated Fresh Pupil)
  if (adminBffCookie && classA_id) {
    const stProfileId = crypto.randomUUID();
    const stAuthUserId = crypto.randomUUID();
    const stPin = generateSecurePin8();
    const stDerived = deriveStudentPassword(stAuthUserId, stPin, PIN_PEPPER);
    const stCode = `TEST_M2QA_${RUN_ID}_STP`;
    const stEmail = `m2qa_stp_${RUN_ID}@example.invalid`;

    const seedSt = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: stProfileId,
      authUserId: stAuthUserId,
      authEmail: stEmail,
      authPassword: stDerived,
      studentCode: stCode,
      classId: classA_id,
      pinIssued: true,
      fullName: 'TEST Pupil StudentLife',
    });

    if (seedSt.status === 200 && seedSt.data?.success === true) {
      const stGotrue = await callGotrue('token?grant_type=password', { email: stEmail, password: stDerived });
      const stOldJwt = stGotrue?.data?.access_token;

      const stBff = await callBff('student-login-prepare', 'POST', { studentCode: stCode, pin: stPin });
      const stOldCookie = stBff.sessionCookieValue;
      const initialLoginOk = stBff.status === 200 && stBff.data?.success === true && Boolean(stOldCookie) && Boolean(stOldJwt);

      if (!initialLoginOk) {
        recordCheck('5.2', 'Student archive blocks old JWT (native REST own row 0) and BFF cookie (401); restore requires new login and yields own row 1', false, {
          reason: 'Initial pupil login failed or session cookie absent; refusing to fabricate denial',
        });
      } else {
        const ownBefore = await callPostgrest(`students?select=id&id=eq.${stProfileId}`, 'GET', null, stOldJwt);
        const ownBeforeOk = ownBefore?.status === 200 && Array.isArray(ownBefore.data) && ownBefore.data.length === 1;

        // 1. Admin archives student
        const archRes = await callBff('archive-student', 'POST', { id: stProfileId }, {}, adminBffCookie);
        const archOk = archRes.status === 200 && archRes.data?.success === true;

        // 2. Under archive: old JWT yields REST own row 0; old BFF cookie yields 401 on bootstrap and session top-user null; login blocked (401)
        const ownArch = await callPostgrest(`students?select=id&id=eq.${stProfileId}`, 'GET', null, stOldJwt);
        const ownArchZero = ownArch?.status === 200 && Array.isArray(ownArch.data) && ownArch.data.length === 0;

        const bootArch = await callBff('bootstrap', 'GET', null, {}, stOldCookie);
        const sessArch = await callBff('session', 'GET', null, {}, stOldCookie);
        const bffCookieBlocked =
          bootArch.status === 401 &&
          sessArch.status === 200 &&
          sessArch.data?.success === false &&
          sessArch.data?.user === null;

        const loginArch = await callBff('student-login-prepare', 'POST', { studentCode: stCode, pin: stPin });
        const loginArchBlocked = loginArch.status === 401;

        // 3. Admin restores student
        const restRes = await callBff('restore-student', 'POST', { id: stProfileId }, {}, adminBffCookie);
        const restOk = restRes.status === 200 && restRes.data?.success === true;

        // 4. Old JWT STILL blocked (version bumped)
        const ownOldAfter = await callPostgrest(`students?select=id&id=eq.${stProfileId}`, 'GET', null, stOldJwt);
        const oldJwtStillDead = ownOldAfter?.status === 200 && Array.isArray(ownOldAfter.data) && ownOldAfter.data.length === 0;

        // 5. Fresh login succeeds and yields own row 1
        const newLoginRes = await callBff('student-login-prepare', 'POST', { studentCode: stCode, pin: stPin });
        const newLoginOk = newLoginRes.status === 200 && newLoginRes.data?.success === true && Boolean(newLoginRes.sessionCookieValue);

        const newGotrue = await callGotrue('token?grant_type=password', { email: stEmail, password: stDerived });
        const stNewJwt = newGotrue?.data?.access_token;

        const ownNewAfter = stNewJwt ? await callPostgrest(`students?select=id&id=eq.${stProfileId}`, 'GET', null, stNewJwt) : null;
        const ownNewOk = ownNewAfter?.status === 200 && Array.isArray(ownNewAfter.data) && ownNewAfter.data.length === 1;

        const studentLifecyclePassed = Boolean(
          ownBeforeOk && archOk && ownArchZero && bffCookieBlocked && loginArchBlocked && restOk && oldJwtStillDead && newLoginOk && ownNewOk
        );

        recordCheck(
          '5.2',
          'Student archive blocks old JWT (native REST own row 0) and BFF cookie (401); restore requires new login and yields own row 1',
          studentLifecyclePassed,
          {
            ownBeforeOk,
            archOk,
            ownArchZero,
            bffCookieBlocked,
            bootArchStatus: bootArch.status,
            sessArchStatus: sessArch.status,
            loginArchBlocked,
            restOk,
            oldJwtStillDead,
            newLoginOk,
            ownNewOk,
          }
        );
      }
    } else {
      recordCheck('5.2', 'Student archival and restore lifecycle', false, { reason: 'Seeding student lifecycle pupil failed' });
    }
  } else {
    recordCheck('5.2', 'Student archival and restore lifecycle', false, { reason: 'Admin cookie or Class A unavailable' });
  }

  // 5.3 Logout Lifecycle: Old JWT yields REST own row 0, old cookie yields 401, fresh login succeeds
  if (classA_id) {
    const lgProfileId = crypto.randomUUID();
    const lgAuthUserId = crypto.randomUUID();
    const lgPin = generateSecurePin8();
    const lgDerived = deriveStudentPassword(lgAuthUserId, lgPin, PIN_PEPPER);
    const lgCode = `TEST_M2QA_${RUN_ID}_LGP`;
    const lgEmail = `m2qa_lgp_${RUN_ID}@example.invalid`;

    const seedLg = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: lgProfileId,
      authUserId: lgAuthUserId,
      authEmail: lgEmail,
      authPassword: lgDerived,
      studentCode: lgCode,
      classId: classA_id,
      pinIssued: true,
      fullName: 'TEST Pupil Logout',
    });

    if (seedLg.status === 200 && seedLg.data?.success === true) {
      const lgGotrue = await callGotrue('token?grant_type=password', { email: lgEmail, password: lgDerived });
      const lgOldJwt = lgGotrue?.data?.access_token;

      const lgBff = await callBff('student-login-prepare', 'POST', { studentCode: lgCode, pin: lgPin });
      const lgOldCookie = lgBff.sessionCookieValue;
      const initialLoginOk = lgBff.status === 200 && lgBff.data?.success === true && Boolean(lgOldCookie) && Boolean(lgOldJwt);

      if (!initialLoginOk) {
        recordCheck('5.3', 'Logout revokes session: old JWT yields native REST own row 0, old cookie yields 401, subsequent fresh login succeeds', false, {
          reason: 'Initial pupil login failed or session cookie absent; refusing to fabricate denial',
        });
      } else {
        const ownBefore = await callPostgrest(`students?select=id&id=eq.${lgProfileId}`, 'GET', null, lgOldJwt);
        const ownBeforeOk = ownBefore?.status === 200 && Array.isArray(ownBefore.data) && ownBefore.data.length === 1;

        const logoutBff = await callBff('logout', 'POST', {}, {}, lgOldCookie);
        const logoutEdge = await callEdge('logout', {}, {}, lgOldJwt);

        const ownAfter = await callPostgrest(`students?select=id&id=eq.${lgProfileId}`, 'GET', null, lgOldJwt);
        const ownAfterZero = ownAfter?.status === 200 && Array.isArray(ownAfter.data) && ownAfter.data.length === 0;

        const bootAfter = await callBff('bootstrap', 'GET', null, {}, lgOldCookie);
        const sessAfter = await callBff('session', 'GET', null, {}, lgOldCookie);
        const oldCookieDead =
          bootAfter.status === 401 &&
          sessAfter.status === 200 &&
          sessAfter.data?.success === false &&
          sessAfter.data?.user === null;

        const newLoginRes = await callBff('student-login-prepare', 'POST', { studentCode: lgCode, pin: lgPin });
        const newLoginOk = newLoginRes.status === 200 && newLoginRes.data?.success === true;

        const newGotrue = await callGotrue('token?grant_type=password', { email: lgEmail, password: lgDerived });
        const lgNewJwt = newGotrue?.data?.access_token;
        const ownNew = lgNewJwt ? await callPostgrest(`students?select=id&id=eq.${lgProfileId}`, 'GET', null, lgNewJwt) : null;
        const ownNewOk = ownNew?.status === 200 && Array.isArray(ownNew.data) && ownNew.data.length === 1;

        const logoutPassed = Boolean(ownBeforeOk && ownAfterZero && oldCookieDead && newLoginOk && ownNewOk);
        recordCheck(
          '5.3',
          'Logout revokes session: old JWT yields native REST own row 0, old cookie yields 401, subsequent fresh login succeeds',
          logoutPassed,
          {
            ownBeforeOk,
            logoutBffStatus: logoutBff.status,
            logoutEdgeStatus: logoutEdge.status,
            ownAfterZero,
            oldCookieDead,
            bootAfterStatus: bootAfter.status,
            sessAfterStatus: sessAfter.status,
            newLoginOk,
            ownNewOk,
          }
        );
      }
    } else {
      recordCheck('5.3', 'Logout lifecycle', false, { reason: 'Seeding logout pupil failed' });
    }
  } else {
    recordCheck('5.3', 'Logout lifecycle', false, { reason: 'Class A unavailable' });
  }

  // 5.4 Dedicated Account Rate Limiter Probe: 6 attempts allowed (1 correct + 5 incorrect), 7th triggers HTTP 429
  let rlCode = null;
  let rlPin = null;
  let rlPupilSeeded = false;

  if (classA_id) {
    const rlProfileId = crypto.randomUUID();
    const rlAuthUserId = crypto.randomUUID();
    rlCode = `TEST_M2QA_${RUN_ID}_RL`;
    const rlEmail = `m2qa_rl_${RUN_ID}@example.invalid`;
    rlPin = generateSecurePin8();
    const rlDerived = deriveStudentPassword(rlAuthUserId, rlPin, PIN_PEPPER);

    const seedRlRes = await callEdge('coordinator-seed-fixture', {
      fixtureType: 'qa-actor',
      fixtureRole: 'student',
      profileId: rlProfileId,
      authUserId: rlAuthUserId,
      authEmail: rlEmail,
      authPassword: rlDerived,
      studentCode: rlCode,
      classId: classA_id,
      pinIssued: true,
      fullName: 'TEST M2QA RateLimit Probe',
    });

    rlPupilSeeded = seedRlRes.status === 200 && seedRlRes.data?.success === true;
  }

  let hit429 = false;
  let initialLoginSuccess = false;
  let attempts2to6Failed401 = true;
  let attempt7Status = 0;

  if (rlPupilSeeded && rlCode && rlPin) {
    // Attempt 1: Correct PIN -> HTTP 200, success true (counts as attempt 1 in 60s window)
    const firstLogin = await callBff('student-login-prepare', 'POST', {
      studentCode: rlCode,
      pin: rlPin,
    });
    initialLoginSuccess = firstLogin.status === 200 && firstLogin.data?.success === true;

    // Attempts 2..6: Incorrect PIN -> HTTP 401
    for (let i = 2; i <= 6; i++) {
      const res = await callBff('student-login-prepare', 'POST', {
        studentCode: rlCode,
        pin: '00000000',
      });
      if (res.status !== 401) {
        attempts2to6Failed401 = false;
      }
    }

    // Attempt 7: 7th attempt triggers HTTP 429 cooldown
    const seventhRes = await callBff('student-login-prepare', 'POST', {
      studentCode: rlCode,
      pin: '00000000',
    });
    attempt7Status = seventhRes.status;
    hit429 = seventhRes.status === 429;

    const exactThresholdPassed = initialLoginSuccess && attempts2to6Failed401 && hit429;
    recordCheck('5.4', 'Account limiter exact threshold: 6 allowed attempts (1 correct + 5 incorrect 401) -> 7th triggers HTTP 429', exactThresholdPassed, {
      initialLoginSuccess,
      attempts2to6Failed401,
      attempt7Status,
    });
  } else {
    recordCheck('5.4', 'Account limiter exact threshold', false, {
      reason: 'Rate limit pupil seeding failed or Class A unavailable',
    });
  }

  // Pre-wait 62s cooldown to guarantee clean 60s rate limit window for IP gate limiter test
  console.log('\n[WAIT] Waiting 62s cooldown before IP gate limiter test to ensure clean shared window (waiting 62 seconds)...');
  for (let remaining = 62; remaining > 0; remaining -= 15) {
    console.log(`[WAIT] Pre-IP gate cooldown timer: ${remaining}s remaining...`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 15) * 1000));
  }

  // 5.5 Separate IP Gate: bounded up to 241 distinct unknown student codes on same Next IP with forged changing XFF
  let hitIp429 = false;
  let followUpStill429 = false;
  let followUpValid = false;
  let ipProbe500 = false;
  let unexpectedProbeFailure = false;
  let unexpectedFailureReason = null;
  let count401 = 0;
  let count429 = 0;
  let probesSent = 0;
  let probesCompleted = 0;
  let first429At = null;
  let first429ElapsedMs = null;
  const maxIpProbes = 241;
  const ipConcurrency = 8;
  const ipStartTime = Date.now();

  console.log(`\nExecuting IP gate limiter probes (up to ${maxIpProbes} distinct unknown codes, concurrency ${ipConcurrency}, forged changing XFF)...`);

  let nextProbeIndex = 1;
  let stopEarly = false;

  async function ipProbeWorker() {
    while (!stopEarly && nextProbeIndex <= maxIpProbes) {
      const idx = nextProbeIndex++;
      if (idx > maxIpProbes) break;

      probesSent++;
      const nonexistentCode = `TEST_M2QA_${RUN_ID}_IP_${idx}`;
      const fakeClientIp = `203.0.113.${(idx % 240) + 1}`;

      try {
        const res = await callBff(
          'student-login-prepare',
          'POST',
          { studentCode: nonexistentCode, pin: '00000000' },
          { 'x-forwarded-for': fakeClientIp }
        );

        probesCompleted++;

        const is401Valid =
          res.status === 401 &&
          res.data !== null &&
          typeof res.data === 'object' &&
          res.data.success === false &&
          res.data.code === 'INVALID_CREDENTIALS';

        const is429Valid =
          res.status === 429 &&
          res.data !== null &&
          typeof res.data === 'object' &&
          res.data.success === false &&
          res.data.code === 'RATE_LIMITED';

        if (res.status === 500) {
          ipProbe500 = true;
          unexpectedProbeFailure = true;
          unexpectedFailureReason = 'Probe returned HTTP 500';
          stopEarly = true;
          break;
        } else if (is429Valid) {
          count429++;
          if (first429At === null) {
            first429At = idx;
            first429ElapsedMs = Date.now() - ipStartTime;
          }
          hitIp429 = true;
          // allow all 241 to finish, do not stopEarly on 429
        } else if (is401Valid) {
          count401++;
        } else {
          unexpectedProbeFailure = true;
          const rawCode = res.data && typeof res.data.code === 'string' ? res.data.code : '';
          const safeAllowlistedCodes = new Set([
            'INVALID_CREDENTIALS',
            'RATE_LIMITED',
            'UNAUTHORIZED',
            'FORBIDDEN',
            'NOT_FOUND',
            'METHOD_NOT_ALLOWED',
            'INVALID_PAYLOAD',
            'PAYLOAD_TOO_LARGE',
            'INVALID_CONTENT_TYPE',
            'INTERNAL_ERROR',
            'UNTRUSTED_IP',
            'CONFIG_ERROR',
            'BFF_SECRET_MISSING',
            'EDGE_INVALID_RESPONSE',
            'SESSION_REVOKED',
            'CLASS_ARCHIVED',
          ]);
          const safeCode = safeAllowlistedCodes.has(rawCode) ? rawCode : 'UNKNOWN_OR_ABSENT';
          unexpectedFailureReason = `Probe returned unexpected response (status: ${Number(res.status) || 0}, code: ${safeCode})`;
          stopEarly = true;
          break;
        }

        if (idx % 30 === 0 || idx === maxIpProbes) {
          console.log(`[IP Limiter Probe] Sent ${idx}/${maxIpProbes} probes (401: ${count401}, 429: ${count429})...`);
        }
      } catch {
        probesCompleted++;
        unexpectedProbeFailure = true;
        unexpectedFailureReason = 'Probe failed with network or timeout exception';
        stopEarly = true;
        break;
      }
    }
  }

  const workers = Array.from({ length: ipConcurrency }, () => ipProbeWorker());
  await Promise.all(workers);

  const totalProbesSent = probesSent;
  const ipDurationMs = Date.now() - ipStartTime;

  if (hitIp429) {
    // MUST verify: new unknown code + different XFF is still 429 RATE_LIMITED within the window
    const followUpCode = `TEST_M2QA_${RUN_ID}_IP_POST_429`;
    const followUpXff = '198.51.100.254';
    try {
      const followUpRes = await callBff(
        'student-login-prepare',
        'POST',
        { studentCode: followUpCode, pin: '00000000' },
        { 'x-forwarded-for': followUpXff }
      );
      followUpStill429 = followUpRes.status === 429;
      followUpValid =
        followUpRes.status === 429 &&
        followUpRes.data !== null &&
        typeof followUpRes.data === 'object' &&
        followUpRes.data.success === false &&
        followUpRes.data.code === 'RATE_LIMITED';
    } catch {
      followUpStill429 = false;
      followUpValid = false;
    }
  }

  const hasInitialHealthySample = count401 > 0;
  const exactCountsMatch =
    count401 === 240 &&
    count429 === 1 &&
    probesCompleted === 241 &&
    probesSent === 241;
  const withinWindow = first429ElapsedMs !== null && first429ElapsedMs < 60000;

  const ipGatePassed =
    hitIp429 &&
    followUpValid &&
    !ipProbe500 &&
    !unexpectedProbeFailure &&
    hasInitialHealthySample &&
    exactCountsMatch &&
    withinWindow;

  recordCheck(
    '5.5',
    'Separate IP gate: bounded up to 241 distinct unknown codes on same IP with forged XFF triggers HTTP 429 and remains limited',
    ipGatePassed,
    {
      totalProbesSent,
      probesCompleted,
      count401,
      count429,
      first429At,
      first429ElapsedMs,
      followUpStill429,
      followUpValid,
      ipProbe500,
      durationMs: ipDurationMs,
      reason: ipGatePassed
        ? undefined
        : unexpectedProbeFailure
        ? (unexpectedFailureReason || 'Encountered unexpected response or network error during IP limiter probe')
        : !hasInitialHealthySample
        ? 'No healthy 401 INVALID_CREDENTIALS sample before 429 (window already rate-limited, needs fresh cooldown)'
        : !hitIp429
        ? `IP limiter did not trigger HTTP 429 within bounded ${maxIpProbes} probes`
        : !withinWindow
        ? `First HTTP 429 took too long (${first429ElapsedMs}ms >= 60000ms window)`
        : !exactCountsMatch
        ? `Exact threshold mismatch: expected 240x 401 and 1x 429 over 241 probes (actual: sent=${probesSent}, completed=${probesCompleted}, 401=${count401}, 429=${count429})`
        : !followUpValid
        ? 'Follow-up probe with different XFF did not remain 429 RATE_LIMITED with success:false'
        : 'Separate IP gate check failed',
    }
  );

  // 5.6 Cooldown unblock check (requires --test-cooldown flag)
  let cooldownWaited = false;
  if (TEST_COOLDOWN) {
    console.log('\n[WAIT] Testing 60s rate limit cooldown recovery after network tests (waiting 62 seconds)...');
    for (let remaining = 62; remaining > 0; remaining -= 15) {
      console.log(`[WAIT] Cooldown recovery timer: ${remaining}s remaining...`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 15) * 1000));
    }
    cooldownWaited = true;

    // Use known correct student credentials to verify unblock
    const knownStudent = s1Data || (rlPupilSeeded && rlCode && rlPin ? { studentCode: rlCode, pin: rlPin } : null);
    if (knownStudent) {
      const recoveryRes = await callBff('student-login-prepare', 'POST', {
        studentCode: knownStudent.studentCode,
        pin: knownStudent.pin,
      });
      const recovered = recoveryRes.status === 200 && recoveryRes.data?.success === true;
      recordCheck('5.6', 'Rate limit cooldown expires after 62s and allows correct PIN login (HTTP 200, success true)', recovered, {
        recoveryStatus: recoveryRes.status,
        clearedAccountAndIpPoison: recovered,
      });
    } else {
      recordCheck('5.6', 'Rate limit cooldown recovery (62s)', false, {
        reason: 'No known student credentials available to test recovery login',
      });
    }
  } else {
    recordCheck('5.6', 'Rate limit cooldown recovery (62s)', null, {
      status: 'SKIPPED',
      reason: 'Cooldown wait skipped. Run with --test-cooldown to verify 62s unblock.',
    });
  }

  // --------------------------------------------------------------------------
  // PHASE 6: BOUNDED 200 DISTINCT STUDENT LOAD PROBES (--load-test)
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 6: Bounded 200 Distinct Student Load Probes ---');

  if (RUN_LOAD_TEST) {
    if (hitIp429 && !cooldownWaited) {
      console.log('\n[WAIT] Waiting 62s cooldown before load test to clear IP rate limit poison...');
      for (let remaining = 62; remaining > 0; remaining -= 15) {
        console.log(`[WAIT] Pre-load cooldown timer: ${remaining}s remaining...`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 15) * 1000));
      }
      cooldownWaited = true;
    }

    if (classLoad_id) {
      console.log('Executing 200 distinct student seeding and login probes (concurrency 4)...');
      const totalLoadStudents = 200;
      const concurrency = 4;
      const loadPupils = [];

      for (let i = 1; i <= totalLoadStudents; i++) {
        const numStr = i.toString().padStart(3, '0');
        const pId = crypto.randomUUID();
        const aId = crypto.randomUUID();
        const code = `TEST_M2QA_${RUN_ID}_L${numStr}`;
        const email = `m2qa_l${numStr}_${RUN_ID}@example.invalid`;
        const pin = generateSecurePin8();
        const derived = deriveStudentPassword(aId, pin, PIN_PEPPER);

        loadPupils.push({
          index: i,
          profileId: pId,
          authUserId: aId,
          studentCode: code,
          email,
          pin,
          derivedPassword: derived,
        });
      }

      console.log('Seeding 200 distinct pupils (concurrency 4)...');
      let seedSuccessCount = 0;

      async function seedWorker(items) {
        for (const item of items) {
          const res = await callEdge('coordinator-seed-fixture', {
            fixtureType: 'qa-actor',
            fixtureRole: 'student',
            profileId: item.profileId,
            authUserId: item.authUserId,
            authEmail: item.email,
            authPassword: item.derivedPassword,
            studentCode: item.studentCode,
            classId: classLoad_id,
            pinIssued: true,
            fullName: `TEST Load Pupil ${item.index}`,
          });
          if (res.status === 200 && res.data?.success === true) {
            seedSuccessCount++;
          }
        }
      }

      const seedChunks = Array.from({ length: concurrency }, () => []);
      for (let i = 0; i < loadPupils.length; i++) {
        seedChunks[i % concurrency].push(loadPupils[i]);
      }
      await Promise.all(seedChunks.map((chunk) => seedWorker(chunk)));

      console.log(`Seeded ${seedSuccessCount}/${totalLoadStudents} load test pupils.`);

      console.log('Measuring 200 Next BFF student logins with session GET roundtrip (concurrency 4, same client IP)...');
      let loginSuccessCount = 0;
      let sessionVerifiedCount = 0;
      let login429Count = 0;
      let loginFailCount = 0;
      const startTime = Date.now();

      async function loginWorker(items) {
        for (const item of items) {
          try {
            const res = await callBff('student-login-prepare', 'POST', {
              studentCode: item.studentCode,
              pin: item.pin,
            });

            if (res.status === 200 && res.data?.success === true && res.sessionCookieValue) {
              loginSuccessCount++;
              const sess = await callBff('session', 'GET', null, {}, res.sessionCookieValue);
              if (sess.status === 200 && sess.data?.success === true && sess.data?.user?.id === item.profileId) {
                sessionVerifiedCount++;
              }
            } else if (res.status === 429) {
              login429Count++;
            } else {
              loginFailCount++;
            }
          } catch {
            loginFailCount++;
          }
        }
      }

      const loginChunks = Array.from({ length: concurrency }, () => []);
      for (let i = 0; i < loadPupils.length; i++) {
        loginChunks[i % concurrency].push(loadPupils[i]);
      }
      await Promise.all(loginChunks.map((chunk) => loginWorker(chunk)));

      const durationMs = Date.now() - startTime;
      const passed =
        seedSuccessCount === totalLoadStudents &&
        loginSuccessCount === totalLoadStudents &&
        sessionVerifiedCount === totalLoadStudents;

      recordCheck('6.1', 'Bounded 200 distinct student logins via Next BFF with roundtrip GET session verification (count 200)', passed, {
        totalProbes: totalLoadStudents,
        seedSuccessCount,
        loginSuccessCount,
        sessionVerifiedCount,
        login429Count,
        loginFailCount,
        durationMs,
        avgMsPerLogin: durationMs / totalLoadStudents,
      });
    } else {
      recordCheck('6.1', 'Bounded 200 distinct student logins', false, { reason: 'Class LOAD unavailable' });
    }
  } else {
    recordCheck('6.1', 'Bounded 200 distinct student logins', null, {
      reason: 'Load test skipped. Run with --load-test to measure 200 distinct student sign-ins and session roundtrips.',
    });
  }

  // --------------------------------------------------------------------------
  // PHASE 7: MANUAL ACCEPTANCE & NEGATIVE CALLBACK CHECKS
  // --------------------------------------------------------------------------
  console.log('\n--- Phase 7: Manual Acceptance & Negative Callbacks ---');

  // 7.1 Real Email Owner Direct Password Setup / Reset Acceptance (Manual)
  recordCheck('7.1', 'Real Email Owner direct password setup & forgot password acceptance', null, {
    status: 'MANUAL_PENDING',
    reason: 'Manual acceptance required by Owner; automated test rejects fake SMTP',
  });

  // 7.2 Negative Recovery Callback Probe
  const badCallback = await callBff('staff-callback', 'POST', { code: 'INVALID_BOGUS_CALLBACK_CODE' });
  const callbackBlocked = (badCallback.status === 400 || badCallback.status === 401) && badCallback.data?.success === false;
  recordCheck('7.2', 'Negative recovery callback with invalid code rejected fail-closed (400/401)', callbackBlocked, {
    httpStatus: badCallback.status,
  });

  // --------------------------------------------------------------------------
  // 5. SUMMARY RECEIPT
  // --------------------------------------------------------------------------
  const hasIncompleteGates = receipt.checks.some(
    (c) => c.status === 'SKIPPED' || c.status === 'NOT_TESTED' || c.status === 'MANUAL_PENDING'
  );

  if (receipt.summary.failed > 0) {
    receipt.verdict = 'FAILED';
  } else if (hasIncompleteGates) {
    receipt.verdict = 'INCOMPLETE';
  } else {
    receipt.verdict = 'COMPLETE';
  }

  console.log('\n================================================================');
  console.log(`M2 LIVE VERIFICATION RECEIPT — VERDICT: ${receipt.verdict}`);
  console.log(JSON.stringify(receipt, null, 2));
  console.log('================================================================');

  if (receipt.summary.failed > 0) {
    console.error(`\n[FATAL] Verification suite completed with ${receipt.summary.failed} failure(s).`);
    process.exit(1);
  }

  if (hasIncompleteGates) {
    console.log(`\n[INCOMPLETE] Verification suite INCOMPLETE: required gates NOT_TESTED / SKIPPED / MANUAL_PENDING.`);
    process.exit(2);
  }

  console.log('\n[COMPLETE] Verification suite COMPLETE: all gates PASSED.');
  process.exit(0);
}

runLiveChecks().catch(() => {
  console.error('[FATAL ERROR IN TEST SUITE] Test suite execution encountered a fatal error.');
  process.exit(1);
});
