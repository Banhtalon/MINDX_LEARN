/**
 * Canonical Crypto and Security Helpers for MINDX LEARN Next.js BFF (Milestone 2)
 *
 * Isolated server-only implementation using Node.js crypto and net:
 * 1. AES-256-GCM Session Cookie Encryption / Decryption with IV and Auth Tag
 * 2. Strict 256-bit random key enforcement (fails closed, no weak passphrase derivation)
 * 3. Canonical HMAC-SHA256 Student PIN to Password derivation (pepper + authUserId binding)
 * 4. Uniform 8-digit secure PIN generation with trivial sequence rejection
 * 5. Strict CSRF / Same-Origin verification
 * 6. Trusted IP resolution (Node net.isIP, Vercel-only x-vercel-forwarded-for or dev loopback)
 * 7. CSV formula injection defense and bounded stream reader
 */

import crypto from 'node:crypto';
import net from 'node:net';

// Standard contexts
export const MINDX_PIN_CONTEXT = 'mindx_student_pin_v1';
export const SESSION_COOKIE_NAME = 'mindx_session';
export const RECOVERY_COOKIE_NAME = 'mindx_recovery';
export const DEFAULT_SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days
export const RECOVERY_MAX_AGE_SEC = 900; // 15 minutes

// Allowed actions whitelist on Next BFF
export const ALLOWED_BFF_ACTIONS = Object.freeze([
  'student-login-prepare',
  'student-login-complete',
  'staff-login',
  'session',
  'refresh',
  'logout',
  'password-reset-request',
  'staff-callback',
  'setup-password',
  'change-password',
  'change-student-pin',
  'bootstrap',
  'create-class',
  'update-class',
  'archive-class',
  'restore-class',
  'create-teacher',
  'assign-teacher',
  'archive-student',
  'restore-student',
  'update-student',
  'pin-issue',
  'pin-reissue',
]);

// Explicitly blocked/coordination actions that must never be exposed publicly
export const BLOCKED_BFF_ACTIONS = Object.freeze([
  'bootstrap-admin',
  'coordinator-seed',
  'coordinator-seed-fixture',
  'raw-sql',
  'debug-token',
]);

/**
 * Validates whether a raw key string or Buffer represents a true 256-bit (32 bytes) key.
 * Accepts:
 * - 64-char hex string
 * - 43-44 char base64 / base64url string that decodes to exactly 32 bytes
 * - Buffer of length 32
 *
 * Rejects weak passphrases, short strings, and empty keys.
 *
 * @param {string|Buffer} rawKey
 * @returns {Buffer} 32-byte Buffer
 * @throws {Error} if key is invalid or not 32 bytes
 */
export function normalizeKey32(rawKey) {
  if (!rawKey) {
    throw new Error('Khóa mã hóa phiên (MINDX_SESSION_KEY) không được để trống.');
  }

  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length === 32) return rawKey;
    throw new Error(`Độ dài khóa Buffer không hợp lệ: yêu cầu đúng 32 bytes, nhận ${rawKey.length} bytes.`);
  }

  if (typeof rawKey !== 'string') {
    throw new Error('Khóa mã hóa phiên phải là chuỗi hoặc Buffer 32 bytes.');
  }

  const trimmed = rawKey.trim();

  // 1. 64-char hex string
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 2. Base64 / Base64url string (32 bytes = 43 or 44 chars)
  if (/^[A-Za-z0-9_-]{43,44}$/.test(trimmed) || /^[A-Za-z0-9+/]{43,44}={0,2}$/.test(trimmed)) {
    try {
      const b64Buf = Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      if (b64Buf.length === 32) {
        return b64Buf;
      }
    } catch {
      // not valid base64
    }
  }

  // 3. Raw 32-byte UTF-8 string
  const rawBuf = Buffer.from(trimmed, 'utf8');
  if (rawBuf.length === 32) {
    return rawBuf;
  }

  // Strict enforcement: Do NOT hash weak passwords into 32 bytes!
  throw new Error(
    'MINDX_SESSION_KEY phải là khóa ngẫu nhiên 256-bit (32 bytes) chuẩn Hex 64 ký tự hoặc Base64/Base64url 43-44 ký tự. Không chấp nhận mật khẩu ngắn/yếu.'
  );
}

/**
 * Checks if session key is valid without throwing
 * @param {unknown} rawKey
 * @returns {boolean}
 */
export function isValidSessionKey(rawKey) {
  try {
    if (!rawKey || (typeof rawKey !== 'string' && !Buffer.isBuffer(rawKey))) {
      return false;
    }
    normalizeKey32(rawKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asserts required server secrets before processing sensitive credentials or PINs.
 * Prevents issuing credentials when server cannot encrypt the session or response.
 *
 * @param {object} [env=process.env]
 * @throws {Error} if required secrets are missing
 */
export function assertServerConfiguration(env = process.env) {
  const sessionKey = env.MINDX_SESSION_KEY;
  if (!sessionKey || !isValidSessionKey(sessionKey)) {
    throw new Error('MINDX_SESSION_KEY chưa được cấu hình hoặc không đạt chuẩn 256-bit (32 bytes).');
  }

  const pinPepper = env.MINDX_PIN_PEPPER;
  if (!pinPepper || typeof pinPepper !== 'string' || pinPepper.trim().length < 16) {
    throw new Error('MINDX_PIN_PEPPER chưa được cấu hình hoặc độ dài không đủ an toàn (tối thiểu 16 ký tự).');
  }
}

/**
 * Encrypts a session payload using AES-256-GCM
 * @param {object} payload - Session object (accessToken, refreshToken, sessionVersion, user, etc.)
 * @param {string|Buffer} secretKey - 32-byte key
 * @returns {string} Encrypted session token formatted as v1.<iv>.<tag>.<ciphertext>
 */
export function encryptSession(payload, secretKey) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Session payload must be an object');
  }
  const key = normalizeKey32(secretKey);

  // 12-byte random IV for GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const jsonStr = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/**
 * Decrypts a session token using AES-256-GCM
 * Validates integrity, authentication tag, and expiration.
 * @param {string} token - Encrypted session token
 * @param {string|Buffer} secretKey - 32-byte key
 * @returns {object|null} Decrypted payload or null if invalid/tampered/expired
 */
export function decryptSession(token, secretKey) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    return null;
  }

  try {
    const key = normalizeKey32(secretKey);
    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');

    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));

    // Check expiration if expiresAt is set
    if (payload.expiresAt) {
      const now = Date.now();
      const exp = typeof payload.expiresAt === 'number' ? payload.expiresAt : new Date(payload.expiresAt).getTime();
      if (!Number.isNaN(exp) && now > exp) {
        return null; // Expired session
      }
    }

    return payload;
  } catch {
    // Tampered data, invalid tag, wrong key, or bad JSON all fail closed
    return null;
  }
}

/**
 * Checks whether an 8-digit PIN is considered trivial / easily guessable
 * @param {string} pin - 8-digit string
 * @returns {boolean}
 */
export function isTrivialPin(pin) {
  if (!pin || typeof pin !== 'string' || !/^\d{8}$/.test(pin)) {
    return true;
  }

  // All identical digits: e.g. 00000000, 11111111, 88888888
  if (/^(\d)\1{7}$/.test(pin)) {
    return true;
  }

  // Common sequential runs
  const trivialPatterns = [
    '01234567',
    '12345678',
    '23456789',
    '34567890',
    '98765432',
    '87654321',
    '76543210',
    '65432109',
    '12121212',
    '12341234',
    '88889999',
    '00001111',
    '11223344',
  ];

  return trivialPatterns.includes(pin);
}

/**
 * Generates a cryptographically uniform 8-digit PIN that rejects trivial sequences
 * Range: [10000000, 99999999]
 * @returns {string} 8-digit PIN
 */
export function generateSecurePin8() {
  for (let i = 0; i < 100; i++) {
    const num = crypto.randomInt(10000000, 100000000);
    const pinStr = num.toString();
    if (!isTrivialPin(pinStr)) {
      return pinStr;
    }
  }
  // Fallback safe uniform calculation
  const bytes = crypto.randomBytes(4);
  const n = (bytes.readUInt32BE(0) % 90000000) + 10000000;
  return n.toString();
}

/**
 * Derives a secure auth password for a student account using HMAC-SHA256
 * Bound to the student's internal Auth UUID and the dedicated PIN pepper
 *
 * Formula: HMAC-SHA256(key = MINDX_PIN_PEPPER, data = "mindx_student_pin_v1:<authUserId lowercase>:<pin>") in base64url
 *
 * @param {string} authUserId - Internal Supabase Auth UUID (never public student UUID)
 * @param {string} pin - 8-digit PIN
 * @param {string} pinPepper - Dedicated MINDX_PIN_PEPPER env secret
 * @returns {string} derived base64url password
 */
export function deriveStudentPassword(authUserId, pin, pinPepper) {
  if (!authUserId || typeof authUserId !== 'string') {
    throw new Error('authUserId is required for PIN derivation');
  }
  if (!pin || typeof pin !== 'string' || !/^\d{8}$/.test(pin)) {
    throw new Error('PIN must be exactly 8 digits');
  }
  if (!pinPepper || typeof pinPepper !== 'string') {
    throw new Error('MINDX_PIN_PEPPER must be configured');
  }

  const message = `${MINDX_PIN_CONTEXT}:${authUserId.trim().toLowerCase()}:${pin.trim()}`;
  return crypto.createHmac('sha256', pinPepper).update(message).digest('base64url');
}

/**
 * Validates Same-Origin request headers for mutations (POST)
 * Rejects missing Origin, opaque 'null', and cross-site requests.
 *
 * @param {Request} request - Web Request
 * @param {string} [trustedSiteUrl] - Optional MINDX_SITE_URL env
 * @returns {boolean} true if request originates from trusted same origin
 */
export function verifySameOrigin(request, trustedSiteUrl) {
  if (!request) {
    return false;
  }

  const getHeader = (name) => {
    if (!request.headers) return null;
    if (typeof request.headers.get === 'function') {
      return request.headers.get(name);
    }
    return request.headers[name.toLowerCase()] || request.headers[name] || null;
  };

  const origin = getHeader('origin');
  const secFetchSite = getHeader('sec-fetch-site');

  // If browser sent sec-fetch-site and it's cross-site, reject
  if (secFetchSite && secFetchSite === 'cross-site') {
    return false;
  }

  // On mutations, Origin header is MANDATORY. Opaque 'null' or empty is rejected. Never skipOrigin.
  if (!origin || typeof origin !== 'string' || origin.trim() === '' || origin.trim() === 'null') {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.origin === 'null' || !originUrl.protocol || !originUrl.host) {
      return false;
    }

    // Require FULL origin protocol+host equality to request.url(origin)
    if (request.url) {
      const requestUrl = new URL(request.url);
      if (originUrl.origin === requestUrl.origin) {
        return true;
      }
    }

    // Match against configured trustedSiteUrl when hosted single origin
    if (trustedSiteUrl) {
      const trusted = new URL(trustedSiteUrl);
      if (originUrl.origin === trusted.origin) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if a given URL string has http: protocol and a trusted loopback host
 * (127.0.0.1, localhost, ::1, [::1]).
 * Rejects https, external domains, invalid URLs, and spoofed hosts.
 *
 * @param {string} urlStr
 * @returns {boolean}
 */
export function isTrustedLoopbackUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Determines whether the current execution context represents a trusted local development environment.
 * Strict security rules:
 * 1. NODE_ENV must be explicitly 'development'
 * 2. VERCEL must NOT be '1' (platform IP must always be validated on Vercel)
 * 3. MINDX_SITE_URL must be configured as a trusted loopback (http://127.0.0.1 or http://localhost)
 * 4. Request URL (when provided) must also be a trusted loopback (http://127.0.0.1 or http://localhost)
 *
 * Hosted sites (https:), non-loopback URLs, and Vercel environments fail closed (return false).
 * Never uses client/browser Origin headers to determine the execution environment.
 *
 * @param {object} [env=process.env]
 * @param {Request|string|URL} [requestOrUrl]
 * @returns {boolean}
 */
export function isLocalDevEnvironment(env = process.env, requestOrUrl) {
  if (!env || typeof env !== 'object') {
    return false;
  }

  // 1. Must be NODE_ENV === 'development'
  if (env.NODE_ENV !== 'development') {
    return false;
  }

  // 2. Must NOT be Vercel
  if (env.VERCEL === '1') {
    return false;
  }

  // 3. Configured MINDX_SITE_URL must exist and be trusted loopback
  const siteUrl = env.MINDX_SITE_URL;
  if (!siteUrl || !isTrustedLoopbackUrl(siteUrl)) {
    return false;
  }

  // 4. Request URL (if provided or present) must also be a trusted loopback
  if (requestOrUrl) {
    let urlStr = null;
    if (typeof requestOrUrl === 'string') {
      urlStr = requestOrUrl;
    } else if (requestOrUrl instanceof URL) {
      urlStr = requestOrUrl.toString();
    } else if (typeof requestOrUrl === 'object') {
      if (typeof requestOrUrl.url === 'string') {
        urlStr = requestOrUrl.url;
      } else if (typeof requestOrUrl.href === 'string') {
        urlStr = requestOrUrl.href;
      }
    }

    if (urlStr && !isTrustedLoopbackUrl(urlStr)) {
      return false;
    }
  }

  return true;
}

export const SAFE_KNOWN_AUTH_ENUMS = Object.freeze(new Set([
  'ACCOUNT_LOCKED',
  'ACCOUNT_DISABLED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'EMAIL_NOT_CONFIRMED',
  'PASSWORD_RESET_REQUIRED',
  'AUTHENTICATION_FAILED',
]));

/**
 * Sanitizes and preserves safe authentication error codes from Edge or backend responses.
 * Enforces strict, un-invented status-to-code rules:
 * - RATE_LIMITED requires BOTH explicit edgeCode === 'RATE_LIMITED' AND HTTP status 429.
 *   Does NOT synthesize RATE_LIMITED if Edge body is missing, empty, or other code,
 *   preventing generic hosting/proxy 429 from masking application rate limiting.
 * - For status 401: requires explicit edgeCode === 'INVALID_CREDENTIALS' (or legacy
 *   'INVALID_PIN' / 'STUDENT_NOT_FOUND' mapped only on status 401).
 *   Cannot be invented from status 401 alone (missing/empty/invalid defaults to 'AUTHENTICATION_FAILED').
 * - Preserves only safe explicit known uppercase enum list; rejects arbitrary provider strings or raw errors.
 *
 * @param {string} [edgeCode]
 * @param {number} [status=401]
 * @returns {string}
 */
export function sanitizeAuthErrorCode(edgeCode, status = 401) {
  if (typeof edgeCode !== 'string') {
    return 'AUTHENTICATION_FAILED';
  }

  const trimmed = edgeCode.trim();

  // 1. RATE_LIMITED requires BOTH explicit edgeCode === 'RATE_LIMITED' AND http 429
  if (trimmed === 'RATE_LIMITED') {
    return status === 429 ? 'RATE_LIMITED' : 'AUTHENTICATION_FAILED';
  }

  // 2. INVALID_CREDENTIALS requires http 401 AND explicit INVALID_CREDENTIALS (or legacy mapped codes)
  if (status === 401) {
    if (trimmed === 'INVALID_CREDENTIALS' || trimmed === 'STUDENT_NOT_FOUND' || trimmed === 'INVALID_PIN') {
      return 'INVALID_CREDENTIALS';
    }
  }

  // 3. Safe explicit known other enum list allowed (not arbitrary uppercase provider string)
  if (SAFE_KNOWN_AUTH_ENUMS.has(trimmed)) {
    return trimmed;
  }

  return 'AUTHENTICATION_FAILED';
}

/**
 * Sanitizes authentication error messages to prevent leakage of internal IDs, Auth UUIDs, or SQL errors.
 *
 * @param {string} [msg]
 * @param {string} [fallback='Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.']
 * @returns {string}
 */
export function sanitizeAuthMessage(msg, fallback = 'Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.') {
  if (!msg || typeof msg !== 'string') return fallback;
  if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(msg) || /jwt|token|secret|pepper|key|sql|table|relation|column/i.test(msg)) {
    return fallback;
  }
  return msg;
}


/**
 * Resolves a trusted client IP address strictly according to deployment rules:
 * - Uses Node net.isIP to ensure valid single IP address.
 * - Rejects lists, commas, or multiple IPs (e.g. "1.1.1.1, 2.2.2.2").
 * - Rejects spoofed custom headers (x-forwarded-for, x-real-ip, client-ip).
 * - Vercel: only trust x-vercel-forwarded-for if process.env.VERCEL === '1'.
 * - Local dev: accept loopback 127.0.0.1 or ::1.
 * - Other/Unknown: fail closed (returns null).
 *
 * @param {Headers|object} headers - Request headers
 * @param {boolean|object} [isVercel=false] - Whether running on Vercel, or options object { isVercel, isDev }
 * @param {boolean} [isDev=false] - Whether running in local dev
 * @returns {string|null} Validated scalar IP address or null
 */
export function resolveTrustedIp(headers, isVercel = false, isDev = false) {
  let vercelMode = isVercel;
  let devMode = isDev;

  if (typeof isVercel === 'object' && isVercel !== null) {
    vercelMode = Boolean(isVercel.isVercel);
    devMode = Boolean(isVercel.isDev);
  }

  const getHeader = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') {
      return headers.get(name);
    }
    return headers[name.toLowerCase()] || headers[name] || null;
  };

  if (vercelMode) {
    const vercelForwarded = getHeader('x-vercel-forwarded-for');
    if (!vercelForwarded || typeof vercelForwarded !== 'string') {
      return null;
    }

    // Reject lists / commas: strictly expect single IP
    if (vercelForwarded.includes(',')) {
      return null;
    }

    const trimmed = vercelForwarded.trim();
    if (net.isIP(trimmed) !== 0) {
      return trimmed;
    }
    return null;
  }

  if (devMode) {
    // Local dev: accept loopback
    return '127.0.0.1';
  }

  // Hosted non-Vercel or untrusted proxy: fail closed
  return null;
}


/**
 * Sanitizes a cell for CSV export to defend against CSV Formula Injection (DDE).
 * If a cell begins with '=', '+', '-', '@', '\t', '\r', prefix with single quote.
 *
 * @param {unknown} val
 * @returns {string}
 */
export function sanitizeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // If starts with dangerous spreadsheet formula triggers
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape inner double quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Validates request size and content type
 * @param {Request} request
 * @param {number} [maxBytes=1048576] 1MB default
 */
export function validateRequestLimits(request, maxBytes = 1048576) {
  const contentType = request.headers.get('content-type') || '';
  const contentLength = Number(request.headers.get('content-length') || '0');

  if (contentLength > maxBytes) {
    return { valid: false, error: 'Kích thước yêu cầu vượt quá giới hạn cho phép (1MB).' };
  }

  // Reject form-urlencoded for mutation APIs
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return { valid: false, error: 'Định dạng yêu cầu không được hỗ trợ (yêu cầu application/json).' };
  }

  return { valid: true };
}

const VALID_ROLES = new Set(['student', 'teacher', 'coordinator', 'admin']);

/**
 * Validates a decrypted session payload against strict session schema.
 * Separates generic AES decryption from session authentication schema.
 * Rejects unknown or missing auth fields, bad roles, and expired sessions.
 *
 * @param {unknown} data - Decrypted payload
 * @returns {object|null} Validated session object or null if invalid
 */
export function validateSessionPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  // 1. accessToken is required and must be non-empty string
  if (typeof data.accessToken !== 'string' || !data.accessToken.trim()) {
    return null;
  }

  // 2. user object is required
  if (!data.user || typeof data.user !== 'object' || Array.isArray(data.user)) {
    return null;
  }

  const { user } = data;
  if (typeof user.id !== 'string' || !user.id.trim()) {
    return null;
  }

  if (typeof user.role !== 'string' || !VALID_ROLES.has(user.role)) {
    return null;
  }

  // 3. sessionVersion must be present
  if (data.sessionVersion === undefined || data.sessionVersion === null) {
    return null;
  }

  // 4. expiresAt must be valid timestamp
  let expiresAt = data.expiresAt;
  if (typeof expiresAt === 'string') {
    expiresAt = new Date(expiresAt).getTime();
  }
  if (typeof expiresAt !== 'number' || Number.isNaN(expiresAt) || expiresAt <= 0) {
    return null;
  }

  // 5. Expiration check
  if (Date.now() > expiresAt) {
    return null;
  }

  return {
    accessToken: data.accessToken,
    refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : undefined,
    sessionVersion: data.sessionVersion,
    user: {
      id: user.id,
      name: typeof user.name === 'string' ? user.name : '',
      role: user.role,
      status: typeof user.status === 'string' ? user.status : 'active',
      email: typeof user.email === 'string' ? user.email : undefined,
      studentCode: typeof user.studentCode === 'string' ? user.studentCode : undefined,
      classId: typeof user.classId === 'string' ? user.classId : undefined,
    },
    expiresAt,
    setupTicket: typeof data.setupTicket === 'string' ? data.setupTicket : undefined,
    recoveryTicket: typeof data.recoveryTicket === 'string' ? data.recoveryTicket : undefined,
    isRecovery: Boolean(data.isRecovery),
  };
}

/**
 * Sanitizes a user object to strip all internal auth secrets, credentials,
 * internal Auth UUIDs, tokens, and hashes before exposing to the client.
 *
 * @param {object|null|undefined} user
 * @returns {object|null}
 */
export function sanitizePublicUserDto(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    return null;
  }

  const clean = { ...user };

  // Strip internal Auth UUIDs and auth emails
  delete clean.authUserId;
  delete clean.auth_user_id;
  delete clean.authEmail;
  delete clean.auth_email;

  // Strip passwords and hashes
  delete clean.password;
  delete clean.password_hash;
  delete clean.pinHash;
  delete clean.pin_hash;
  delete clean.rawPin;
  delete clean.pin;

  // Strip tokens and tickets
  delete clean.accessToken;
  delete clean.access_token;
  delete clean.refreshToken;
  delete clean.refresh_token;
  delete clean.token;
  delete clean.setupTicket;
  delete clean.recoveryTicket;
  delete clean.ticket;
  delete clean.rawJwt;
  delete clean.sub;

  return clean;
}

/**
 * Sanitizes a bootstrap response payload to guarantee that neither currentUser,
 * users list, nor students list contain sensitive credentials or internal auth fields.
 *
 * @param {object|null|undefined} dto
 * @returns {object|null}
 */
export function sanitizeBootstrapDto(dto) {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
    return dto;
  }

  const result = { ...dto };

  if (result.currentUser) {
    result.currentUser = sanitizePublicUserDto(result.currentUser);
  }

  if (Array.isArray(result.users)) {
    result.users = result.users.map((u) => sanitizePublicUserDto(u)).filter(Boolean);
  }

  if (Array.isArray(result.students)) {
    result.students = result.students.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const clean = { ...s };
      delete clean.authUserId;
      delete clean.auth_user_id;
      delete clean.authEmail;
      delete clean.auth_email;
      delete clean.pinHash;
      delete clean.pin_hash;
      delete clean.rawPin;
      delete clean.pin;
      return clean;
    });
  }

  // Remove top-level tokens or sensitive fields if any were attached
  delete result.accessToken;
  delete result.access_token;
  delete result.refreshToken;
  delete result.refresh_token;
  delete result.sessionSecret;
  delete result.setupTicket;
  delete result.recoveryTicket;

  return result;
}

/**
 * Validates PIN prepare response from Edge to ensure strict security contract:
 * - Must have valid operationId (UUID)
 * - Must have non-empty students array
 * - Single reissue must have exact 1 student
 * - Every student must have valid studentId and native authUserId (UUID)
 * - authUserId MUST NOT equal studentId (anti-fallback contract)
 * - All studentId and authUserId values must be unique
 *
 * @param {unknown} data - Response data from Edge pin-prepare
 * @param {'batch_first_issue'|'single_reissue'} mode
 * @returns {{ valid: boolean, code?: string, error?: string }}
 */
export function validatePinPrepData(data, mode) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, code: 'INVALID_PREP_DATA', error: 'Dữ liệu chuẩn bị cấp PIN phải là đối tượng hợp lệ.' };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!data.operationId || typeof data.operationId !== 'string' || !uuidRegex.test(data.operationId)) {
    return { valid: false, code: 'INVALID_OPERATION_ID', error: 'operationId không hợp lệ hoặc thiếu UUID.' };
  }

  if (!data.classCode || typeof data.classCode !== 'string' || !data.classCode.trim()) {
    return {
      valid: false,
      code: 'INVALID_CLASS_CODE',
      error: 'Mã lớp (classCode) không hợp lệ hoặc thiếu trong phản hồi chuẩn bị PIN.',
    };
  }

  if (!Array.isArray(data.students) || data.students.length === 0) {
    return { valid: false, code: 'EMPTY_STUDENTS', error: 'Danh sách học sinh chuẩn bị cấp PIN không được rỗng.' };
  }

  if (mode === 'single_reissue' && data.students.length !== 1) {
    return {
      valid: false,
      code: 'SINGLE_MODE_COUNT_MISMATCH',
      error: 'Chế độ cấp lại riêng yêu cầu danh sách có chính xác một học sinh.',
    };
  }

  const seenStudentIds = new Set();
  const seenAuthUserIds = new Set();

  for (const st of data.students) {
    if (!st || typeof st !== 'object') {
      return { valid: false, code: 'INVALID_STUDENT_ROW', error: 'Bản ghi thông tin học sinh không hợp lệ.' };
    }

    const { studentId, authUserId } = st;

    if (!studentId || typeof studentId !== 'string' || !uuidRegex.test(studentId)) {
      return { valid: false, code: 'INVALID_STUDENT_ID', error: 'Mã định danh học sinh (studentId) không hợp lệ.' };
    }

    // STRICT REQUIREMENT: native authUserId must be returned by Edge, never undefined or empty
    if (!authUserId || typeof authUserId !== 'string' || !uuidRegex.test(authUserId)) {
      return {
        valid: false,
        code: 'MISSING_RESERVED_AUTH_UUID',
        error: 'Thiếu định danh tài khoản xác thực bảo mật (nativeAuthUUID) từ máy chủ.',
      };
    }

    // STRICT REQUIREMENT: authUserId MUST NOT be derived from public studentUUID
    if (authUserId.toLowerCase() === studentId.toLowerCase()) {
      return {
        valid: false,
        code: 'AUTH_DERIVED_FROM_STUDENT_ID',
        error: 'Lỗi bảo mật: Định danh xác thực không được phép trùng với mã học sinh công khai.',
      };
    }

    const lowerStudentId = studentId.toLowerCase();
    if (seenStudentIds.has(lowerStudentId)) {
      return { valid: false, code: 'DUPLICATE_STUDENT_ID', error: 'Phát hiện mã học sinh bị trùng lặp trong danh sách.' };
    }
    seenStudentIds.add(lowerStudentId);

    const lowerAuthId = authUserId.toLowerCase();
    if (seenAuthUserIds.has(lowerAuthId)) {
      return { valid: false, code: 'DUPLICATE_AUTH_ID', error: 'Phát hiện định danh tài khoản xác thực bị trùng lặp trong danh sách.' };
    }
    seenAuthUserIds.add(lowerAuthId);
  }

  return { valid: true };
}

/**
 * Decodes native JWT claims without external library
 * @param {string} jwt
 * @returns {object|null}
 */
export function extractJwtClaims(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(payloadStr);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Creates a canonical validated session envelope.
 * Computes and guarantees valid `expiresAt` in milliseconds.
 * Clamps TTL between 1 second and maxTtlSec (defaults to DEFAULT_SESSION_MAX_AGE_SEC).
 * Rejects expired, non-positive, or missing expirations without weak infinite defaults.
 * Supports explicit now injection (params.nowMs or explicitNowMs) for deterministic testing.
 * Expiration is guaranteed to never exceed verified JWT exp.
 *
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} [params.refreshToken]
 * @param {number|string} params.sessionVersion
 * @param {object} params.user
 * @param {number} [params.expiresAtEpochSec] - Expiration in epoch seconds or ms
 * @param {number} [params.nowMs] - Optional explicit now timestamp (ms)
 * @param {string} [params.setupTicket]
 * @param {string} [params.recoveryTicket]
 * @param {boolean} [params.isRecovery]
 * @param {number} [maxTtlSec=DEFAULT_SESSION_MAX_AGE_SEC]
 * @param {number} [explicitNowMs] - Optional explicit now timestamp (ms)
 * @returns {{ envelope: object, maxAgeSec: number }}
 */
export function createSessionEnvelope(params, maxTtlSec = DEFAULT_SESSION_MAX_AGE_SEC, explicitNowMs) {
  if (!params || typeof params !== 'object') {
    throw new Error('Tham số khởi tạo phiên không hợp lệ.');
  }

  const {
    accessToken,
    refreshToken,
    sessionVersion,
    user,
    setupTicket,
    recoveryTicket,
    isRecovery,
  } = params;

  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Phiên làm việc yêu cầu accessToken hợp lệ.');
  }

  if (!user || typeof user !== 'object' || !user.id || !user.role) {
    throw new Error('Thông tin người dùng (user DTO) không hợp lệ.');
  }

  if (sessionVersion === undefined || sessionVersion === null) {
    throw new Error('Số hiệu phiên (sessionVersion) không được để trống.');
  }

  // Derive expiration in epoch seconds / milliseconds
  let expSec = params.expiresAtEpochSec;
  if (!expSec || typeof expSec !== 'number') {
    // Attempt to extract exp claim from verified server-side accessToken
    const claims = extractJwtClaims(accessToken);
    if (claims && typeof claims.exp === 'number') {
      expSec = claims.exp;
    }
  }

  if (!expSec || typeof expSec !== 'number' || Number.isNaN(expSec) || expSec <= 0) {
    throw new Error('Không thể xác định thời hạn hết hạn hợp lệ cho phiên làm việc.');
  }

  // Convert to milliseconds if given in seconds
  const expMs = expSec < 10000000000 ? Math.floor(expSec * 1000) : Math.floor(expSec);
  const nowMs = typeof params.nowMs === 'number' && params.nowMs > 0
    ? params.nowMs
    : (typeof explicitNowMs === 'number' && explicitNowMs > 0 ? explicitNowMs : Date.now());

  const remainingSec = Math.floor((expMs - nowMs) / 1000);
  if (remainingSec <= 0) {
    throw new Error('Thời hạn phiên làm việc đã hết hạn.');
  }

  // Clamp TTL between 1 and maxTtlSec
  const clampedMaxAgeSec = Math.max(1, Math.min(maxTtlSec, remainingSec));
  const canonicalExpiresAtMs = Math.min(expMs, nowMs + (clampedMaxAgeSec * 1000));

  const envelope = {
    accessToken: accessToken.trim(),
    refreshToken: typeof refreshToken === 'string' && refreshToken.trim() ? refreshToken.trim() : undefined,
    sessionVersion,
    user: {
      id: String(user.id),
      name: String(user.name || ''),
      role: user.role,
      status: user.status || 'active',
      email: user.email ? String(user.email) : undefined,
      studentCode: user.studentCode ? String(user.studentCode) : undefined,
      classId: user.classId ? String(user.classId) : undefined,
    },
    expiresAt: canonicalExpiresAtMs,
    setupTicket: typeof setupTicket === 'string' && setupTicket.trim() ? setupTicket.trim() : undefined,
    recoveryTicket: typeof recoveryTicket === 'string' && recoveryTicket.trim() ? recoveryTicket.trim() : undefined,
    isRecovery: Boolean(isRecovery),
  };

  return {
    envelope,
    maxAgeSec: clampedMaxAgeSec,
  };
}

/**
 * Validates PKCE recovery context stored in encrypted HttpOnly cookie.
 * Ensures codeVerifier and normalized email exist and are non-empty strings.
 * Enforces TTL expiration against nowMs (defaults to Date.now()).
 * Rejects missing, expired, non-object, or malformed contexts.
 *
 * @param {unknown} ctx - Decrypted recovery context object
 * @param {number} [nowMs] - Current timestamp (epoch ms), defaults to Date.now()
 * @param {number} [maxAgeSec=RECOVERY_MAX_AGE_SEC] - Max allowed age in seconds (default 900)
 * @returns {{ valid: boolean, error?: string, codeVerifier?: string, email?: string }}
 */
export function validateRecoveryContext(ctx, nowMs, maxAgeSec = RECOVERY_MAX_AGE_SEC) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    return { valid: false, error: 'Ngữ cảnh khôi phục không tồn tại hoặc không hợp lệ.' };
  }

  const { codeVerifier, email, createdAt } = ctx;

  if (typeof codeVerifier !== 'string' || !codeVerifier.trim()) {
    return { valid: false, error: 'Mã xác thực PKCE (codeVerifier) bị thiếu hoặc không hợp lệ.' };
  }

  if (typeof email !== 'string' || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { valid: false, error: 'Email trong ngữ cảnh khôi phục không hợp lệ.' };
  }

  const now = typeof nowMs === 'number' && !Number.isNaN(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const created = typeof createdAt === 'number' && !Number.isNaN(createdAt) ? createdAt : 0;

  if (created <= 0 || (now - created) > maxAgeSec * 1000 || created > (now + 60000)) {
    return { valid: false, error: 'Phiên khôi phục đã hết hạn. Vui lòng yêu cầu liên kết mới.' };
  }

  return {
    valid: true,
    codeVerifier: codeVerifier.trim(),
    email: email.trim().toLowerCase(),
  };
}

/**
 * Formats CSV content in memory for PIN issue or reissue.
 * Guarantees Formula Injection defense via sanitizeCsvCell.
 * Uses trusted classCode for the class column (never UUID or SID).
 * Never includes internal Auth UUIDs or credentials.
 * Includes UTF-8 BOM (\uFEFF) for spreadsheet compatibility.
 *
 * @param {Array<{ studentCode: string, fullName: string, rawPin: string }>} records
 * @param {string} classCode - Validated human-readable class code
 * @param {'batch_first_issue'|'single_reissue'} mode
 * @param {string} [issuedAt] - ISO timestamp string
 * @returns {string} CSV formatted content string
 */
export function formatPinCsvContent(records, classCode, mode, issuedAt = new Date().toISOString()) {
  const normClassCode = typeof classCode === 'string' ? classCode.trim() : '';
  const isSingle = mode === 'single_reissue';
  const pinColHeader = isSingle ? 'Mã PIN mới' : 'Mã PIN tạm thời';
  const defaultNote = isSingle
    ? 'Cấp lại riêng 1 học sinh - PIN cũ đã bị vô hiệu hóa'
    : 'Cấp PIN lần đầu - Người nhận tự bảo quản';

  const header = `Mã học sinh,Họ và tên,Lớp,${pinColHeader},Thời gian cấp,Ghi chú\r\n`;
  const rows = (Array.isArray(records) ? records : []).map((r) =>
    [
      sanitizeCsvCell(r.studentCode),
      sanitizeCsvCell(r.fullName),
      sanitizeCsvCell(normClassCode),
      sanitizeCsvCell(r.rawPin),
      sanitizeCsvCell(issuedAt),
      sanitizeCsvCell(defaultNote),
    ].join(',')
  ).join('\r\n');

  return '\uFEFF' + header + rows;
}

/**
 * Generates a filename-safe CSV file name using trusted classCode.
 *
 * @param {string} classCode
 * @param {string} [studentCode] - Optional studentCode for single reissue
 * @param {number} [timestampMs]
 * @returns {string} Safe filename
 */
export function generatePinCsvFilename(classCode, studentCode, timestampMs = Date.now()) {
  const safeClass = String(classCode || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (studentCode) {
    const safeStudent = String(studentCode || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `PIN_${safeClass}_${safeStudent}_${timestampMs}.csv`;
  }
  return `DanhSachPIN_Lop_${safeClass}_${timestampMs}.csv`;
}

export const SAFE_KNOWN_PIN_PREP_ENUMS = Object.freeze(new Set([
  'OPERATION_LOCKED',
  'NO_UNISSUED_STUDENTS',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'PREPARE_FAILED',
]));

export const SAFE_KNOWN_LOGOUT_ENUMS = Object.freeze(new Set([
  'SESSION_REVOKE_FAILED',
  'SESSION_SYNC_FAILED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
]));

/**
 * Evaluates Edge pin-prepare response for batch first-issue according to M2 security contracts:
 * - Recognizes ONLY exact depleted condition: prepRes.success === false && prepRes.status === 200 && prepRes.code === 'NO_UNISSUED_STUDENTS'
 * - Depleted message is STATIC, not supplied raw from prepRes, and no CSV/data
 * - Lock ONLY actual status 409 AND explicit OPERATION_LOCKED (never invent status 409 or lock from arbitrary code)
 * - Rejects malformed success, missing data, or unknown 200 failures -> status 500, PREPARE_FAILED
 * - Failsafe fixed whitelist response for other error codes, never arbitrary uppercase provider enum
 *
 * @param {object} prepRes
 * @returns {{ depleted: boolean, proceed: boolean, status: number, body: { success: boolean, code?: string, message: string }, data?: any }}
 */
export function resolvePinPrepOutcome(prepRes) {
  // 1. Recognize ONLY exact depleted condition from Worker A9
  if (prepRes?.success === false && prepRes?.status === 200 && prepRes?.code === 'NO_UNISSUED_STUDENTS') {
    return {
      depleted: true,
      proceed: false,
      status: 200,
      body: {
        success: false,
        code: 'NO_UNISSUED_STUDENTS',
        message: 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.',
      },
    };
  }

  // 2. Success ONLY when prepRes.success === true AND status === 200 AND nonempty valid object data
  const hasValidData = prepRes?.data && typeof prepRes.data === 'object' && !Array.isArray(prepRes.data) && Object.keys(prepRes.data).length > 0;
  if (prepRes?.success === true && prepRes?.status === 200 && hasValidData) {
    return {
      depleted: false,
      proceed: true,
      status: 200,
      body: {
        success: true,
        message: 'Chuẩn bị cấp PIN thành công.',
      },
      data: prepRes.data,
    };
  }

  // 3. All other outcomes are failures (proceed: false, no data / no CSV)
  const isLock = prepRes?.status === 409 && prepRes?.code === 'OPERATION_LOCKED';
  let status = 500;
  if (isLock) {
    status = 409;
  } else if (typeof prepRes?.status === 'number' && prepRes.status >= 400 && prepRes.status <= 599) {
    // Preserve valid 4xx/5xx error status
    status = prepRes.status;
  } else {
    // Missing status, status 200 failure, truthy string or out-of-range defaults safely to 500
    status = 500;
  }

  let safeCode = 'PREPARE_FAILED';
  if (isLock) {
    safeCode = 'OPERATION_LOCKED';
  } else if (
    prepRes?.code &&
    SAFE_KNOWN_PIN_PREP_ENUMS.has(prepRes.code) &&
    prepRes.code !== 'OPERATION_LOCKED' &&
    prepRes.code !== 'NO_UNISSUED_STUDENTS'
  ) {
    safeCode = prepRes.code;
  }

  const fallbackMsg = isLock
    ? 'Thao tác cấp mã PIN đang bị khóa hoặc đang được xử lý bởi tiến trình khác. Vui lòng thử lại sau.'
    : 'Không thể chuẩn bị cấp PIN.';
  const safeMessage = sanitizeAuthMessage(prepRes?.message, fallbackMsg);

  return {
    depleted: false,
    proceed: false,
    status,
    body: {
      success: false,
      code: safeCode,
      message: safeMessage,
    },
  };
}

/**
 * Evaluates Edge backend logout response according to M2 security contracts:
 * - No session/token is an idempotent local 200 success
 * - Successful Edge call returns 200 success ONLY when edgeRes.success === true AND status === 200
 * - Edge error returns safe 500 (or Edge >= 400) failure with static message and preserved safe enum
 * - Never returns raw provider errors or arbitrary uppercase provider strings
 *
 * @param {object|null|undefined} edgeRes
 * @param {boolean} [hasSession=true]
 * @returns {{ success: boolean, status: number, code?: string, message: string }}
 */
export function resolveLogoutOutcome(edgeRes, hasSession = true) {
  if (!hasSession) {
    return {
      success: true,
      status: 200,
      message: 'Đăng xuất thành công.',
    };
  }

  // Success ONLY when edgeRes.success === true AND status === 200
  if (edgeRes?.success === true && edgeRes?.status === 200) {
    return {
      success: true,
      status: 200,
      message: 'Đăng xuất thành công.',
    };
  }

  const isSafeEnum = edgeRes?.code && SAFE_KNOWN_LOGOUT_ENUMS.has(edgeRes.code);
  const safeCode = isSafeEnum ? edgeRes.code : 'SESSION_REVOKE_FAILED';
  const status = typeof edgeRes?.status === 'number' && edgeRes.status >= 400 && edgeRes.status <= 599
    ? edgeRes.status
    : 500;

  return {
    success: false,
    status,
    code: safeCode,
    message: 'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.',
  };
}


