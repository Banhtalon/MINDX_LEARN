/**
 * Next.js 16.4 Backend-For-Frontend (BFF) Route Handler for MINDX LEARN
 * Route: /api/m2/[action]
 *
 * Implements M2 security boundaries:
 * - Action whitelist (strictly excludes bootstrap-admin and unknown actions)
 * - Strict CSRF / Same-Origin checks on mutations (rejects missing/opaque/cross-site)
 * - Stream bounded request body reader (prevents unbounded memory consumption)
 * - Trusted IP resolution (Node net.isIP, Vercel-only x-vercel-forwarded-for or dev loopback)
 * - Immediate 503 fail-closed if trustedIp is null before reaching Edge
 * - True 256-bit session key enforcement & pre-flight configuration assertions
 * - AES-256-GCM encrypted mindx_session cookie (HttpOnly, Secure, SameSite=Lax, clamped TTL)
 * - Never returns native Supabase JWT, refresh tokens, or internal Auth UUIDs to browser
 * - Uniform 8-digit PIN generation & canonical HMAC-SHA256 password derivation
 * - Direct one-time CSV download with no-store and formula injection defense
 * - Cache-Control: no-store on ALL responses (success and error)
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import {
  ALLOWED_BFF_ACTIONS,
  BLOCKED_BFF_ACTIONS,
  SESSION_COOKIE_NAME,
  RECOVERY_COOKIE_NAME,
  DEFAULT_SESSION_MAX_AGE_SEC,
  RECOVERY_MAX_AGE_SEC,
  encryptSession,
  decryptSession,
  validateSessionPayload,
  createSessionEnvelope,
  extractJwtClaims,
  sanitizePublicUserDto,
  sanitizeBootstrapDto,
  generateSecurePin8,
  deriveStudentPassword,
  verifySameOrigin,
  isLocalDevEnvironment,
  sanitizeAuthErrorCode,
  sanitizeAuthMessage,
  resolveTrustedIp,
  validateRequestLimits,
  sanitizeCsvCell,
  assertServerConfiguration,
  validatePinPrepData,
  validateRecoveryContext,
  isTrivialPin,
  formatPinCsvContent,
  generatePinCsvFilename,
  resolvePinPrepOutcome,
  resolveLogoutOutcome,
  ValidatedSessionPayload,
} from '@/lib/server/crypto';
import { callEdgeBackend } from '@/lib/server/edge-client';

interface RouteContext {
  params: Promise<{ action: string }>;
}

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * Standard JSON response helper ensuring Cache-Control: no-store on all responses
 */
function apiResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...(extraHeaders || {}),
    },
  });
}

/**
 * Common helper to get decrypted session from HttpOnly cookie
 */
async function getDecryptedSession(): Promise<ValidatedSessionPayload | null> {
  const sessionKey = process.env.MINDX_SESSION_KEY;
  if (!sessionKey) return null;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const raw = decryptSession(token, sessionKey);
    return validateSessionPayload(raw);
  } catch {
    return null;
  }
}

/**
 * Common helper to set encrypted session into HttpOnly cookie with clamped TTL.
 * Uses createSessionEnvelope to construct canonical envelope with guaranteed valid expiresAt (ms).
 */
async function setEncryptedSession(
  params: {
    accessToken: string;
    refreshToken?: string;
    sessionVersion: number | string;
    user: any;
    setupTicket?: string;
    recoveryTicket?: string;
    isRecovery?: boolean;
    expiresAtEpochSec?: number;
  },
  expiresAtEpochSec?: number
) {
  const sessionKey = process.env.MINDX_SESSION_KEY;
  if (!sessionKey) {
    throw new Error('MINDX_SESSION_KEY is not configured');
  }

  const expSec = params.expiresAtEpochSec !== undefined ? params.expiresAtEpochSec : expiresAtEpochSec;
  const { envelope, maxAgeSec } = createSessionEnvelope({
    ...params,
    expiresAtEpochSec: expSec,
  });

  const encrypted = encryptSession(envelope as any, sessionKey);
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  cookieStore.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  });
}

/**
 * Common helper to clear session cookie
 */
async function clearSessionCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  } catch {
    // ignore
  }
}

/**
 * Common helper to get decrypted recovery context from HttpOnly cookie
 */
async function getDecryptedRecoveryContext() {
  const sessionKey = process.env.MINDX_SESSION_KEY;
  if (!sessionKey) return null;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;
    if (!token) return null;

    return decryptSession<{ codeVerifier: string; email: string; createdAt: number }>(token, sessionKey);
  } catch {
    return null;
  }
}

/**
 * Common helper to set encrypted recovery context into HttpOnly cookie
 */
async function setEncryptedRecoveryContext(payload: { codeVerifier: string; email: string; createdAt: number }) {
  const sessionKey = process.env.MINDX_SESSION_KEY;
  if (!sessionKey) {
    throw new Error('MINDX_SESSION_KEY is not configured');
  }

  const encrypted = encryptSession(payload, sessionKey);
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  cookieStore.set(RECOVERY_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: RECOVERY_MAX_AGE_SEC,
  });
}

/**
 * Common helper to clear recovery cookie
 */
async function clearRecoveryCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.set(RECOVERY_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  } catch {
    // ignore
  }
}

/**
 * Reads request body stream safely with bounded byte limit
 */
async function readBoundedJson(request: NextRequest, maxBytes = 1048576): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return { success: true, data: {} };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          return {
            success: false,
            error: 'Kích thước nội dung vượt quá giới hạn 1MB.',
            status: 413,
          };
        }
        chunks.push(value);
      }
    }

    if (chunks.length === 0) {
      return { success: true, data: {} };
    }

    const merged = Buffer.concat(chunks);
    const text = merged.toString('utf8');
    if (!text.trim()) {
      return { success: true, data: {} };
    }

    const parsed = JSON.parse(text);
    return { success: true, data: parsed };
  } catch {
    return {
      success: false,
      error: 'Dữ liệu JSON không hợp lệ.',
      status: 400,
    };
  }
}

/**
 * Decodes native JWT payload to extract claims.sub (Auth UUID)
 */
function extractAuthUserIdFromJwt(jwt: string): string | null {
  const claims = extractJwtClaims(jwt);
  return (claims?.sub as string) || null;
}


// ============================================================================
// GET Handler for /api/m2/[action]
// ============================================================================
export async function GET(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  // 1. Enforce whitelist
  if (!ALLOWED_BFF_ACTIONS.includes(action) || BLOCKED_BFF_ACTIONS.includes(action)) {
    return apiResponse(
      { success: false, message: 'Đường dẫn hoặc tác vụ không hợp lệ.', code: 'NOT_FOUND' },
      404
    );
  }

  // 2. Resolve trusted IP strictly
  const isVercel = process.env.VERCEL === '1';
  const isDev = isLocalDevEnvironment(process.env, request.url);
  const trustedIp = resolveTrustedIp(request.headers, isVercel, isDev);

  // If IP cannot be verified, reject 503 before calling Edge
  if (!trustedIp) {
    return apiResponse(
      { success: false, message: 'Dịch vụ tạm thời không khả dụng: Không thể xác thực địa chỉ IP tin cậy.', code: 'UNTRUSTED_IP' },
      503
    );
  }

  const session = await getDecryptedSession();

  // 3. Action: session
  if (action === 'session') {
    if (!session || !session.accessToken) {
      return apiResponse({ success: false, user: null });
    }

    const edgeRes = await callEdgeBackend<{ user: unknown; sessionVersion: number }>({
      action: 'session',
      accessToken: session.accessToken as string,
      sessionVersion: session.sessionVersion as number,
      trustedIp,
    });

    if (!edgeRes.success) {
      await clearSessionCookie();
      return apiResponse({ success: false, user: null, message: edgeRes.message });
    }

    const rawUser = edgeRes.data?.user || session.user;
    const sanitizedUser = sanitizePublicUserDto(rawUser as any);

    return apiResponse({
      success: true,
      user: sanitizedUser,
      sessionVersion: edgeRes.data?.sessionVersion || session.sessionVersion,
    });
  }

  // 4. Action: bootstrap
  if (action === 'bootstrap') {
    if (!session || !session.accessToken) {
      return apiResponse(
        { success: false, message: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.', code: 'UNAUTHORIZED' },
        401
      );
    }

    const edgeRes = await callEdgeBackend({
      action: 'bootstrap',
      accessToken: session.accessToken as string,
      sessionVersion: session.sessionVersion as number,
      trustedIp,
    });

    const sanitizedData = edgeRes.data ? sanitizeBootstrapDto(edgeRes.data as any) : null;

    return apiResponse(
      {
        ...edgeRes,
        data: sanitizedData,
      },
      edgeRes.status || (edgeRes.success ? 200 : 401)
    );
  }

  return apiResponse(
    { success: false, message: 'Phương thức GET không được hỗ trợ cho tác vụ này.' },
    405
  );
}

// ============================================================================
// POST Handler for /api/m2/[action]
// ============================================================================
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { action } = await ctx.params;

  // 1. Whitelist validation
  if (!ALLOWED_BFF_ACTIONS.includes(action) || BLOCKED_BFF_ACTIONS.includes(action)) {
    return apiResponse(
      { success: false, message: 'Đường dẫn hoặc tác vụ không hợp lệ.', code: 'FORBIDDEN' },
      404
    );
  }

  // 2. Request limits check (reject form-urlencoded)
  const limitsCheck = validateRequestLimits(request);
  if (!limitsCheck.valid) {
    return apiResponse({ success: false, message: limitsCheck.error }, 400);
  }

  // 3. Same-Origin CSRF validation (Mandatory on all mutations - always enforced even in local dev)
  const isSameOrigin = verifySameOrigin(request, process.env.MINDX_SITE_URL);
  if (!isSameOrigin) {
    return apiResponse(
      { success: false, message: 'Yêu cầu bị từ chối do không cùng nguồn (CSRF/Origin check).' },
      403
    );
  }

  // 4. Resolve trusted IP strictly
  const isVercel = process.env.VERCEL === '1';
  const isDev = isLocalDevEnvironment(process.env, request.url);
  const trustedIp = resolveTrustedIp(request.headers, isVercel, isDev);
  if (!trustedIp) {
    return apiResponse(
      { success: false, message: 'Dịch vụ tạm thời không khả dụng: Không thể xác thực địa chỉ IP tin cậy.', code: 'UNTRUSTED_IP' },
      503
    );
  }

  // 5. Read stream bounded JSON body (1MB max)
  const bodyResult = await readBoundedJson(request, 1048576);
  if (!bodyResult.success) {
    return apiResponse({ success: false, message: bodyResult.error }, bodyResult.status || 400);
  }
  const body = bodyResult.data || {};

  // 6. Get current session from cookie (if any)
  const session = await getDecryptedSession();
  const accessToken = session?.accessToken as string | undefined;
  const sessionVersion = session?.sessionVersion as number | undefined;

  // ==========================================================================
  // ACTION: student-login-prepare / student-login-complete
  // ==========================================================================
  if (action === 'student-login-prepare' || action === 'student-login-complete') {
    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const rawStudentCode = body.studentCode;
    const rawPin = body.pin;

    if (!rawStudentCode || !rawPin) {
      return apiResponse({ success: false, message: 'Mã học sinh và mã PIN không được để trống.' }, 400);
    }

    const cleanCode = String(rawStudentCode).trim().toUpperCase().slice(0, 50);
    const cleanPin = String(rawPin).trim();

    if (!/^\d{8}$/.test(cleanPin)) {
      return apiResponse({ success: false, message: 'Mã PIN học sinh phải gồm đúng 8 chữ số.' }, 400);
    }

    const pinPepper = process.env.MINDX_PIN_PEPPER!;

    // Step A: Call Edge student-login-prepare
    const prepRes = await callEdgeBackend<{ challengeId: string; authUserId: string; authEmail: string }>({
      action: 'student-login-prepare',
      payload: { studentCode: cleanCode },
      trustedIp,
    });

    if (!prepRes.success || !prepRes.data?.challengeId || !prepRes.data?.authUserId) {
      const status = prepRes.status || 401;
      const code = sanitizeAuthErrorCode(prepRes.code, status);
      const message = sanitizeAuthMessage(prepRes.message, 'Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.');
      return apiResponse(
        {
          success: false,
          message,
          code,
        },
        status
      );
    }

    const { challengeId, authUserId } = prepRes.data;

    // Step B: Canonical HMAC derivation
    const authPassword = deriveStudentPassword(authUserId, cleanPin, pinPepper);

    // Step C: Call Edge student-login-complete
    const compRes = await callEdgeBackend<{
      session: { access_token: string; refresh_token: string; expires_at?: number };
      user: { id: string; name: string; role: 'student'; studentCode: string };
      sessionVersion: number;
    }>({
      action: 'student-login-complete',
      payload: { challengeId, authPassword },
      trustedIp,
    });

    if (!compRes.success || !compRes.data?.session?.access_token) {
      const status = compRes.status || 401;
      const code = sanitizeAuthErrorCode(compRes.code, status);
      const message = sanitizeAuthMessage(compRes.message, 'Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.');
      return apiResponse(
        {
          success: false,
          message,
          code,
        },
        status
      );
    }

    const { session: edgeSession, user, sessionVersion: sVer } = compRes.data;

    // Step D: Encrypt session into HttpOnly cookie with clamped TTL
    await setEncryptedSession(
      {
        accessToken: edgeSession.access_token,
        refreshToken: edgeSession.refresh_token,
        sessionVersion: sVer,
        user,
      },
      edgeSession.expires_at
    );

    // Step E: Return ONLY public user DTO outward (zero token, zero Auth UUID)
    const publicUser = sanitizePublicUserDto(user as any);
    return apiResponse({
      success: true,
      message: 'Đăng nhập học sinh thành công.',
      user: publicUser,
    });
  }

  // ==========================================================================
  // ACTION: staff-login
  // ==========================================================================
  if (action === 'staff-login') {
    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const email = body.email;
    const password = body.password;

    if (!email || !password) {
      return apiResponse({ success: false, message: 'Email và mật khẩu không được để trống.' }, 400);
    }

    const normEmail = String(email).trim().toLowerCase().slice(0, 255);
    const cleanPassword = String(password);

    const edgeRes = await callEdgeBackend<{
      session: { access_token: string; refresh_token: string; expires_at?: number };
      user: { id: string; name: string; role: 'admin' | 'teacher'; email: string };
      sessionVersion: number;
    }>({
      action: 'staff-login',
      payload: { email: normEmail, password: cleanPassword },
      trustedIp,
    });

    if (!edgeRes.success || !edgeRes.data?.session?.access_token) {
      const status = edgeRes.status || 401;
      const code = sanitizeAuthErrorCode(edgeRes.code, status);
      const message = sanitizeAuthMessage(edgeRes.message, 'Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa kích hoạt.');
      return apiResponse(
        {
          success: false,
          message,
          code,
        },
        status
      );
    }

    const { session: edgeSession, user, sessionVersion: sVer } = edgeRes.data;

    await setEncryptedSession(
      {
        accessToken: edgeSession.access_token,
        refreshToken: edgeSession.refresh_token,
        sessionVersion: sVer,
        user,
      },
      edgeSession.expires_at
    );

    const publicUser = sanitizePublicUserDto(user as any);
    return apiResponse({
      success: true,
      message: `Đăng nhập thành công với vai trò ${user.role}.`,
      user: publicUser,
    });
  }

  // ==========================================================================
  // ACTION: password-reset-request (PKCE with short HttpOnly recovery cookie)
  // ==========================================================================
  if (action === 'password-reset-request') {
    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const rawEmail = body.email;
    if (!rawEmail) {
      return apiResponse({ success: false, message: 'Email không được để trống.' }, 400);
    }

    const normEmail = String(rawEmail).trim().toLowerCase().slice(0, 255);

    // Generate random PKCE verifier & S256 challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store verifier ONLY in encrypted HttpOnly recovery cookie
    await setEncryptedRecoveryContext({
      codeVerifier,
      email: normEmail,
      createdAt: Date.now(),
    });

    const trustedSiteURL = process.env.MINDX_SITE_URL || (isDev ? 'http://localhost:3000' : 'https://mindx-learn-test.vercel.app');

    const edgeRes = await callEdgeBackend({
      action: 'password-reset-request',
      payload: {
        email: normEmail,
        trustedSiteURL,
        codeChallenge,
      },
      trustedIp,
    });

    return apiResponse(edgeRes, edgeRes.status || 200);
  }

  // ==========================================================================
  // ACTION: staff-callback (PKCE code verify or token_hash/fragment invite)
  // ==========================================================================
  if (action === 'staff-callback') {
    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const { code, token_hash, type, access_token, refresh_token } = body;

    let payloadToSend: Record<string, unknown> = {};
    let isRecoveryFlow = false;

    if (code && typeof code === 'string') {
      isRecoveryFlow = true;
      // Recovery PKCE flow: retrieve and validate verifier + email from encrypted HttpOnly recovery cookie
      const recoveryCtx = await getDecryptedRecoveryContext();
      const validation = validateRecoveryContext(recoveryCtx);

      if (!validation.valid || !validation.codeVerifier || !validation.email) {
        // Clear stale/corrupted recovery context and reject before calling Edge
        await clearRecoveryCookie();
        return apiResponse(
          {
            success: false,
            code: 'INVALID_RECOVERY_CONTEXT',
            message: 'Phiên đặt lại mật khẩu đã hết hạn hoặc không hợp lệ trên thiết bị này. Vui lòng yêu cầu liên kết mới từ trang Đăng nhập.',
          },
          400
        );
      }

      // Fix server-only payload expectedEmail from valid encrypted cookie email
      // Never trust browser expectedEmail or verifier. Preserve fixed recovery PKCE type.
      payloadToSend = {
        code: String(code).trim(),
        codeVerifier: validation.codeVerifier,
        expectedEmail: validation.email,
        type: 'recovery',
      };
    } else if (token_hash && typeof token_hash === 'string') {
      if (type === 'invite') {
        payloadToSend = {
          token_hash: String(token_hash).trim(),
          type: 'invite',
        };
      } else {
        // Do not accept arbitrary token_hash recovery without required PKCE server context
        isRecoveryFlow = true;
        const recoveryCtx = await getDecryptedRecoveryContext();
        const validation = validateRecoveryContext(recoveryCtx);

        if (!validation.valid || !validation.codeVerifier || !validation.email) {
          await clearRecoveryCookie();
          return apiResponse(
            {
              success: false,
              code: 'PKCE_CONTEXT_REQUIRED',
              message: 'Khôi phục mật khẩu yêu cầu phiên xác thực PKCE hợp lệ. Vui lòng yêu cầu liên kết mới.',
            },
            400
          );
        }

        payloadToSend = {
          token_hash: String(token_hash).trim(),
          expectedEmail: validation.email,
          codeVerifier: validation.codeVerifier,
          type: 'recovery',
        };
      }
    } else if (access_token && typeof access_token === 'string') {
      // Invite flow with fragment tokens
      payloadToSend = {
        access_token: String(access_token).trim(),
        refresh_token: refresh_token ? String(refresh_token).trim() : undefined,
        type: 'invite',
      };
    } else {
      return apiResponse({ success: false, message: 'Dữ liệu xác thực liên kết không hợp lệ.' }, 400);
    }

    const edgeRes = await callEdgeBackend<{
      session: { access_token: string; refresh_token: string; expires_at?: number };
      user: { id: string; name: string; role: 'admin' | 'teacher'; email: string };
      sessionVersion: number;
      recoveryTicket?: string;
      isInvite?: boolean;
    }>({
      action: 'staff-callback',
      payload: payloadToSend,
      trustedIp,
    });

    // Handle recovery cookie lifecycle:
    // Clear after provider exchange success or definite invalid/reused code (4xx)
    // Keep verifier retryable for short TTL on transient network/server fail (5xx)
    if (isRecoveryFlow) {
      if (edgeRes.success) {
        await clearRecoveryCookie();
      } else {
        const isTransient = typeof edgeRes.status === 'number' && edgeRes.status >= 500;
        if (!isTransient) {
          await clearRecoveryCookie();
        }
      }
    }

    if (!edgeRes.success || !edgeRes.data?.session?.access_token) {
      return apiResponse(
        { success: false, message: edgeRes.message || 'Xác thực liên kết không thành công hoặc đã hết hạn.' },
        edgeRes.status || 400
      );
    }

    const { session: edgeSession, user, sessionVersion: sVer, recoveryTicket, isInvite } = edgeRes.data;

    // Encrypt into mindx_session cookie with recoveryTicket
    await setEncryptedSession(
      {
        accessToken: edgeSession.access_token,
        refreshToken: edgeSession.refresh_token,
        sessionVersion: sVer,
        user,
        recoveryTicket,
      },
      edgeSession.expires_at
    );

    const publicUser = sanitizePublicUserDto(user as any);
    return apiResponse({
      success: true,
      message: 'Xác thực tài khoản Giáo viên / Admin thành công.',
      user: publicUser,
      isInvite: Boolean(isInvite),
      redirect: '/auth/setup-password',
    });
  }

  // ==========================================================================
  // ACTION: change-password / setup-password
  // ==========================================================================
  if (action === 'change-password' || action === 'setup-password') {
    if (!accessToken) {
      return apiResponse(
        { success: false, message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' },
        401
      );
    }

    const { oldPassword, newPassword } = body;
    if (!newPassword || String(newPassword).length < 8) {
      return apiResponse(
        { success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' },
        400
      );
    }

    // Determine if this is a verified recovery/setup or normal password change
    const recoveryTicket = session?.recoveryTicket as string | undefined;

    let payload: Record<string, unknown>;
    if (recoveryTicket) {
      // Setup/recovery: attach verified one-use ticket from session cookie
      payload = {
        newPassword: String(newPassword),
        recoveryTicket,
      };
    } else {
      // Normal logged-in change: require oldPassword
      if (!oldPassword) {
        return apiResponse(
          { success: false, message: 'Mật khẩu hiện tại không được để trống.' },
          400
        );
      }
      payload = {
        oldPassword: String(oldPassword),
        newPassword: String(newPassword),
      };
    }

    const edgeRes = await callEdgeBackend({
      action: 'change-password',
      payload,
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (edgeRes.success) {
      // Successful password change revokes old sessions; clear cookie
      await clearSessionCookie();
    }

    return apiResponse(edgeRes, edgeRes.status || 200);
  }

  // ==========================================================================
  // ACTION: change-student-pin
  // Split 2-Phase Private Edge Execution:
  // Phase 1: change-student-pin-prepare (authenticated, returns native authUserId)
  // Derive: oldAuthPassword, newAuthPassword from ONLY native authUserId
  // Phase 2: change-student-pin-commit (with derived HMACs, revokes old session)
  // ==========================================================================
  if (action === 'change-student-pin') {
    if (!accessToken) {
      return apiResponse(
        { success: false, message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' },
        401
      );
    }

    // Role enforcement: strictly students only; prevent GV / admin (403)
    if (session?.user?.role !== 'student') {
      return apiResponse(
        {
          success: false,
          message: 'Chức năng đổi mã PIN cá nhân chỉ dành cho tài khoản Học sinh.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const pinPepper = process.env.MINDX_PIN_PEPPER!;

    // Ignore body authId, sessionRole, token. Read ONLY oldPin and newPin.
    const rawOldPin = body.oldPin;
    if (!rawOldPin || typeof rawOldPin !== 'string' || !/^\d{8}$/.test(rawOldPin.trim())) {
      return apiResponse(
        { success: false, message: 'Mã PIN hiện tại phải gồm đúng 8 chữ số.', code: 'INVALID_OLD_PIN' },
        400
      );
    }

    const rawNewPin = body.newPin;
    if (!rawNewPin || typeof rawNewPin !== 'string' || !/^\d{8}$/.test(rawNewPin.trim())) {
      return apiResponse(
        { success: false, message: 'Mã PIN mới phải gồm đúng 8 chữ số.', code: 'INVALID_NEW_PIN' },
        400
      );
    }

    const oldPin = rawOldPin.trim();
    const newPin = rawNewPin.trim();

    if (isTrivialPin(newPin)) {
      return apiResponse(
        {
          success: false,
          message: 'Mã PIN mới quá đơn giản hoặc dễ đoán (ví dụ: dãy số liên tiếp, các số trùng nhau). Vui lòng chọn mã PIN khác.',
          code: 'TRIVIAL_PIN',
        },
        400
      );
    }

    if (oldPin === newPin) {
      return apiResponse(
        {
          success: false,
          message: 'Mã PIN mới không được trùng với mã PIN hiện tại.',
          code: 'SAME_PIN',
        },
        400
      );
    }

    // Phase 1: Call private Edge action change-student-pin-prepare
    const prepRes = await callEdgeBackend<{ authUserId: string }>({
      action: 'change-student-pin-prepare',
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (!prepRes.success || !prepRes.data) {
      return apiResponse(
        {
          success: false,
          message: prepRes.message || 'Không thể chuẩn bị đổi mã PIN.',
          code: prepRes.code || 'PREPARE_FAILED',
        },
        prepRes.status || 400
      );
    }

    const authUserId = prepRes.data.authUserId;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Validate exact valid native UUID
    if (!authUserId || typeof authUserId !== 'string' || !uuidRegex.test(authUserId)) {
      return apiResponse(
        {
          success: false,
          message: 'Định danh xác thực từ máy chủ không hợp lệ.',
          code: 'INVALID_AUTH_UUID',
        },
        500
      );
    }

    // Validate distinct public student ID (anti-fallback contract)
    const publicStudentId = session?.user?.id;
    if (publicStudentId && authUserId.toLowerCase() === String(publicStudentId).toLowerCase()) {
      return apiResponse(
        {
          success: false,
          message: 'Lỗi tính toàn vẹn: Định danh xác thực không được phép trùng với mã học sinh công khai.',
          code: 'AUTH_DERIVED_FROM_STUDENT_ID',
        },
        500
      );
    }

    // Match verified cookie JWT claims sub internal
    const claims = extractJwtClaims(accessToken);
    if (!claims?.sub || typeof claims.sub !== 'string' || claims.sub.toLowerCase() !== authUserId.toLowerCase()) {
      return apiResponse(
        {
          success: false,
          message: 'Định danh xác thực không khớp với phiên làm việc.',
          code: 'AUTH_MISMATCH',
        },
        403
      );
    }

    // Derive old/new HMAC from ONLY that nativeAuthUUID
    const oldAuthPassword = deriveStudentPassword(authUserId, oldPin, pinPepper);
    const newAuthPassword = deriveStudentPassword(authUserId, newPin, pinPepper);

    // Phase 2: Call private Edge action change-student-pin-commit
    const commitRes = await callEdgeBackend({
      action: 'change-student-pin-commit',
      payload: { oldAuthPassword, newAuthPassword },
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (!commitRes.success) {
      return apiResponse(
        {
          success: false,
          message: commitRes.message || 'Đổi mã PIN không thành công.',
          code: commitRes.code,
        },
        commitRes.status || 400
      );
    }

    // Successful commit clears session cookie and requires fresh login
    await clearSessionCookie();

    return apiResponse({
      success: true,
      message: commitRes.message || 'Đổi mã PIN thành công. Vui lòng đăng nhập lại bằng mã PIN mới.',
    });
  }

  // ==========================================================================
  // ACTION: refresh
  // ==========================================================================
  if (action === 'refresh') {
    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const refreshToken = session?.refreshToken as string | undefined;
    if (!refreshToken) {
      return apiResponse(
        { success: false, message: 'Không tìm thấy phiên làm việc để làm mới.' },
        401
      );
    }

    const edgeRes = await callEdgeBackend<{
      session: { access_token: string; refresh_token: string; expires_at?: number };
      user: unknown;
      sessionVersion: number;
    }>({
      action: 'refresh',
      payload: { refreshToken, sessionVersion },
      trustedIp,
    });

    if (!edgeRes.success || !edgeRes.data?.session?.access_token) {
      await clearSessionCookie();
      return apiResponse(
        { success: false, message: edgeRes.message || 'Phiên làm việc đã hết hạn.' },
        edgeRes.status || 401
      );
    }

    const { session: edgeSession, user, sessionVersion: sVer } = edgeRes.data;

    await setEncryptedSession(
      {
        accessToken: edgeSession.access_token,
        refreshToken: edgeSession.refresh_token,
        sessionVersion: sVer,
        user,
      },
      edgeSession.expires_at
    );

    const publicUser = sanitizePublicUserDto(user as any);
    return apiResponse({
      success: true,
      user: publicUser,
      sessionVersion: sVer,
    });
  }

  // ==========================================================================
  // ACTION: logout
  // ==========================================================================
  if (action === 'logout') {
    let edgeRes: any = null;
    if (accessToken) {
      try {
        edgeRes = await callEdgeBackend({
          action: 'logout',
          accessToken,
          sessionVersion,
          trustedIp,
        });
      } catch {
        edgeRes = { success: false, status: 500, code: 'SESSION_REVOKE_FAILED' };
      }
    }
    await clearSessionCookie();
    const outcome = resolveLogoutOutcome(edgeRes, Boolean(accessToken));
    return apiResponse(
      {
        success: outcome.success,
        ...(outcome.code ? { code: outcome.code } : {}),
        message: outcome.message,
      },
      outcome.status
    );
  }

  // ==========================================================================
  // ==========================================================================
  // PIN MANAGEMENT: Mode 1 - Class First-Issue (Admin Only)
  // Direct CSV response with no-store
  // ==========================================================================
  if (action === 'pin-issue') {
    if (!accessToken) {
      return apiResponse({ success: false, message: 'Phiên làm việc đã hết hạn.' }, 401);
    }

    if (session?.user?.role !== 'admin') {
      return apiResponse(
        { success: false, message: 'Thao tác chỉ dành cho Quản trị viên.', code: 'FORBIDDEN' },
        403
      );
    }

    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const rawClassId = body.classId;
    if (!rawClassId) {
      return apiResponse({ success: false, message: 'Mã lớp không được để trống.' }, 400);
    }

    const classId = String(rawClassId).trim();
    const pinPepper = process.env.MINDX_PIN_PEPPER!;

    // Step A: Call Edge pin-prepare with mode 'batch_first_issue'
    const prepRes = await callEdgeBackend<{
      operationId: string;
      classCode?: string;
      students: Array<{ studentId: string; studentCode: string; fullName: string; authUserId: string; authEmail?: string }>;
    }>({
      action: 'pin-prepare',
      payload: { classId, mode: 'batch_first_issue' },
      accessToken,
      sessionVersion,
      trustedIp,
    });

    const prepOutcome = resolvePinPrepOutcome(prepRes);
    if (!prepOutcome.proceed || !prepOutcome.data) {
      return apiResponse(prepOutcome.body, prepOutcome.status);
    }

    // Step A.1: Validate server prep schema strictly (Anti-fallback & reserved AuthUUID contract)
    const valResult = validatePinPrepData(prepOutcome.data, 'batch_first_issue');
    if (!valResult.valid) {
      return apiResponse(
        {
          success: false,
          message: valResult.error || 'Lỗi kiểm tra tính toàn vẹn dữ liệu chuẩn bị PIN.',
          code: valResult.code || 'CONTRACT_ERROR',
        },
        500
      );
    }

    const { operationId, students: targetStudents } = prepOutcome.data;

    // Step B: Generate uniform 8-digit PINs & derive passwords using ONLY reserved native authUserId
    const generatedPairs: Array<{
      studentId: string;
      studentCode: string;
      fullName: string;
      authUserId: string;
      rawPin: string;
      authPassword: string;
    }> = [];

    for (const st of targetStudents) {
      const pin = generateSecurePin8();
      // Strict contract: targetAuthId MUST be native reserved AuthUUID, NEVER derived from public studentId!
      const targetAuthId = st.authUserId;
      const authPassword = deriveStudentPassword(targetAuthId, pin, pinPepper);

      generatedPairs.push({
        studentId: st.studentId,
        studentCode: st.studentCode,
        fullName: st.fullName,
        authUserId: targetAuthId,
        rawPin: pin,
        authPassword,
      });
    }

    // Step C: Call Edge pin-commit
    const commitRes = await callEdgeBackend({
      action: 'pin-commit',
      payload: {
        operationId,
        records: generatedPairs.map((p) => ({
          studentId: p.studentId,
          authUserId: p.authUserId,
          authPassword: p.authPassword,
        })),
      },
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (!commitRes.success) {
      const isLock = commitRes.status === 409 || commitRes.code === 'OPERATION_LOCKED';
      const status = isLock ? 409 : (commitRes.status || 500);
      const safeCode = isLock ? 'OPERATION_LOCKED' : commitRes.code;
      const fallbackMsg = isLock
        ? 'Thao tác ghi nhận PIN đang bị khóa hoặc đang được xử lý bởi tiến trình khác. Vui lòng thử lại sau.'
        : 'Ghi nhận PIN trên cơ sở dữ liệu thất bại.';
      return apiResponse(
        {
          success: false,
          message: sanitizeAuthMessage(commitRes.message, fallbackMsg),
          ...(safeCode ? { code: safeCode } : {}),
        },
        status
      );
    }

    // Step D: Construct CSV in memory with Formula Injection defense (no browser private identifiers)
    const csvContent = formatPinCsvContent(
      generatedPairs.map((p) => ({
        studentCode: p.studentCode,
        fullName: p.fullName,
        rawPin: p.rawPin,
      })),
      prepOutcome.data.classCode!,
      'batch_first_issue'
    );

    const safeFilename = generatePinCsvFilename(prepOutcome.data.classCode!);

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        ...NO_STORE_HEADERS,
      },
    });
  }

  // ==========================================================================
  // PIN MANAGEMENT: Mode 2 - Single Student Reissue (Admin Only)
  // Direct CSV response with no-store
  // ==========================================================================
  if (action === 'pin-reissue') {
    if (!accessToken) {
      return apiResponse({ success: false, message: 'Phiên làm việc đã hết hạn.' }, 401);
    }

    if (session?.user?.role !== 'admin') {
      return apiResponse(
        { success: false, message: 'Thao tác chỉ dành cho Quản trị viên.', code: 'FORBIDDEN' },
        403
      );
    }

    try {
      assertServerConfiguration();
    } catch (err: any) {
      return apiResponse({ success: false, message: err.message, code: 'CONFIG_ERROR' }, 500);
    }

    const rawStudentId = body.studentId;
    if (!rawStudentId) {
      return apiResponse({ success: false, message: 'Mã học sinh không được để trống.' }, 400);
    }

    const studentId = String(rawStudentId).trim();
    const pinPepper = process.env.MINDX_PIN_PEPPER!;

    // Step A: Call Edge pin-prepare with mode 'single_reissue'
    const prepRes = await callEdgeBackend<{
      operationId: string;
      classCode?: string;
      students: Array<{ studentId: string; studentCode: string; fullName: string; authUserId: string; authEmail?: string }>;
    }>({
      action: 'pin-prepare',
      payload: { studentId, mode: 'single_reissue' },
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (!prepRes.success || !prepRes.data) {
      const isLock = prepRes.status === 409 || prepRes.code === 'OPERATION_LOCKED';
      const status = isLock ? 409 : (prepRes.status || 400);
      const safeCode = isLock ? 'OPERATION_LOCKED' : prepRes.code;
      const fallbackMsg = isLock
        ? 'Thao tác cấp lại mã PIN đang bị khóa hoặc đang được xử lý bởi tiến trình khác. Vui lòng thử lại sau.'
        : 'Không thể chuẩn bị cấp lại PIN.';
      return apiResponse(
        {
          success: false,
          message: sanitizeAuthMessage(prepRes.message, fallbackMsg),
          ...(safeCode ? { code: safeCode } : {}),
        },
        status
      );
    }

    // Step A.1: Validate server prep schema strictly (Single mode exact one, Anti-fallback)
    const valResult = validatePinPrepData(prepRes.data, 'single_reissue');
    if (!valResult.valid) {
      return apiResponse(
        {
          success: false,
          message: valResult.error || 'Lỗi kiểm tra tính toàn vẹn dữ liệu chuẩn bị PIN.',
          code: valResult.code || 'CONTRACT_ERROR',
        },
        500
      );
    }

    const { operationId, students } = prepRes.data;
    const targetStudent = students[0];

    // Step B: Generate single uniform 8-digit PIN using ONLY reserved native authUserId
    const newPin = generateSecurePin8();
    const targetAuthId = targetStudent.authUserId;
    const authPassword = deriveStudentPassword(targetAuthId, newPin, pinPepper);

    // Step C: Commit to Edge
    const commitRes = await callEdgeBackend({
      action: 'pin-commit',
      payload: {
        operationId,
        records: [
          {
            studentId: targetStudent.studentId,
            authUserId: targetAuthId,
            authPassword,
          },
        ],
      },
      accessToken,
      sessionVersion,
      trustedIp,
    });

    if (!commitRes.success) {
      const isLock = commitRes.status === 409 || commitRes.code === 'OPERATION_LOCKED';
      const status = isLock ? 409 : (commitRes.status || 500);
      const safeCode = isLock ? 'OPERATION_LOCKED' : commitRes.code;
      const fallbackMsg = isLock
        ? 'Thao tác ghi nhận PIN đang bị khóa hoặc đang được xử lý bởi tiến trình khác. Vui lòng thử lại sau.'
        : 'Cấp lại PIN thất bại.';
      return apiResponse(
        {
          success: false,
          message: sanitizeAuthMessage(commitRes.message, fallbackMsg),
          ...(safeCode ? { code: safeCode } : {}),
        },
        status
      );
    }

    // Step D: Construct single-student CSV with Formula Injection defense (no browser private identifiers)
    const csvContent = formatPinCsvContent(
      [
        {
          studentCode: targetStudent.studentCode,
          fullName: targetStudent.fullName,
          rawPin: newPin,
        },
      ],
      prepRes.data.classCode!,
      'single_reissue'
    );

    const safeFilename = generatePinCsvFilename(prepRes.data.classCode!, targetStudent.studentCode);

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        ...NO_STORE_HEADERS,
      },
    });
  }

  // ==========================================================================
  // BUSINESS ACTIONS: Per-Action Payload Allowlist
  // (create-class, update-class, archive-class, restore-class, create-teacher,
  // assign-teacher, archive-student, restore-student, update-student)
  // ==========================================================================
  if (!accessToken) {
    return apiResponse(
      { success: false, message: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.', code: 'UNAUTHORIZED' },
      401
    );
  }

  const ADMIN_ACTIONS = [
    'create-class',
    'update-class',
    'archive-class',
    'restore-class',
    'create-teacher',
    'assign-teacher',
    'archive-student',
    'restore-student',
    'update-student',
  ];

  if (ADMIN_ACTIONS.includes(action) && session?.user?.role !== 'admin') {
    return apiResponse(
      { success: false, message: 'Thao tác chỉ dành cho Quản trị viên.', code: 'FORBIDDEN' },
      403
    );
  }

  let cleanPayload: Record<string, unknown> = {};

  if (action === 'create-class') {
    const rawTeacherId = body.teacherId;
    cleanPayload = {
      code: String(body.code || '').trim().slice(0, 50),
      name: String(body.name || '').trim().slice(0, 100),
      courseId: body.courseId || null,
      teacherId: (rawTeacherId === null || rawTeacherId === '' || rawTeacherId === undefined)
        ? null
        : String(rawTeacherId).trim(),
    };
  } else if (action === 'update-class') {
    const rawData = (body.data && typeof body.data === 'object') ? body.data : body;
    cleanPayload = {
      id: body.id,
      data: {
        name: rawData.name !== undefined ? String(rawData.name).trim().slice(0, 100) : undefined,
        code: rawData.code !== undefined ? String(rawData.code).trim().slice(0, 50) : undefined,
        teacherId: rawData.teacherId !== undefined
          ? (rawData.teacherId === null || rawData.teacherId === '' ? null : String(rawData.teacherId).trim())
          : undefined,
      },
    };
  } else if (['archive-class', 'restore-class', 'archive-student', 'restore-student'].includes(action)) {
    cleanPayload = {
      id: body.id || body.studentId,
    };
  } else if (action === 'create-teacher') {
    cleanPayload = {
      name: String(body.name || '').trim().slice(0, 100),
      email: String(body.email || '').trim().toLowerCase().slice(0, 255),
      assignedClassIds: Array.isArray(body.assignedClassIds) ? body.assignedClassIds : [],
    };
  } else if (action === 'assign-teacher') {
    cleanPayload = {
      teacherId: body.teacherId,
      classId: body.classId,
    };
  } else if (action === 'update-student') {
    const rawData = (body.data && typeof body.data === 'object') ? body.data : body;
    cleanPayload = {
      id: body.id,
      data: {
        fullName: rawData.fullName !== undefined ? String(rawData.fullName).trim().slice(0, 100) : undefined,
        notes: rawData.notes !== undefined
          ? (rawData.notes === null ? '' : String(rawData.notes).trim().slice(0, 255))
          : undefined,
      },
    };
  } else {
    cleanPayload = {};
  }

  const edgeRes = await callEdgeBackend({
    action,
    payload: cleanPayload,
    accessToken,
    sessionVersion,
    trustedIp,
  });

  // Ensure mutation data returned to client is sanitized (no nativeAuthUUID/tokens leak)
  const sanitizedData = edgeRes.data ? sanitizePublicUserDto(edgeRes.data as any) : undefined;

  return apiResponse(
    {
      ...edgeRes,
      ...(sanitizedData ? { data: sanitizedData } : {}),
    },
    edgeRes.status || 200
  );
}
