// ============================================================================
// MINDX LEARN — M2 Backend Supabase Edge Function (Canonical v2)
// Pinned supabase-js version: 2.117.3
// ============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import {
  computeSha256Hex,
  decodeJwtClaims,
  EdgeRequest,
  EdgeResponse,
  Role,
  STATIC_MESSAGES,
  UserDTO,
  ClassDTO,
  StudentDTO,
  CourseDTO,
  LessonDTO,
  QuestionDTO,
  QuizResultDTO,
  PracticeSubmissionDTO,
  isValidUUID,
  isValidEmail,
  normalizeStudentCode,
  validatePinCommitRecords,
  safeAuthOperation,
  syncBumpedSessionVersions,
} from './domain.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

function isExactTestOrigin(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    const origin = parsed.origin.toLowerCase();
    // TEST Supabase cloud project origin
    if (origin === 'https://eythjapspkoyqdxlxtcd.supabase.co') {
      return true;
    }
    // Known local test CLI origin (e.g. http://127.0.0.1:54321, http://localhost:54321)
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isEdgeTestEnvironment(): boolean {
  const currentUrl = Deno.env.get('SUPABASE_URL') || SUPABASE_URL || '';
  const flagValues = [
    Deno.env.get('MINDX_ENV'),
    Deno.env.get('MINDX_APP_ENV'),
    Deno.env.get('NEXT_PUBLIC_MINDX_ENV'),
    Deno.env.get('APP_ENV'),
  ]
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter(Boolean);
  for (const val of flagValues) {
    if (val === 'production' || val === 'prod') return false;
    if (val !== 'test' && val !== 'staging' && val !== 'development' && val !== 'dev' && val !== 'local') {
      return false;
    }
  }
  return isExactTestOrigin(currentUrl);
}

function resolveEdgeCallbackRedirectUrl(trustedSiteURL?: string): { redirectUrl?: string; errorResponse?: Response } {
  const rawSite = typeof trustedSiteURL === 'string' ? trustedSiteURL.trim() : '';
  if (!isEdgeTestEnvironment()) {
    if (!rawSite) {
      return {
        errorResponse: jsonResponse(
          {
            success: false,
            message: 'Địa chỉ trang chính thức (trustedSiteURL) bắt buộc phải được cung cấp trên môi trường Production.',
            code: 'INVALID_SITE_URL',
          },
          400
        ),
      };
    }
    let parsed: URL;
    try {
      parsed = new URL(rawSite);
    } catch {
      return {
        errorResponse: jsonResponse(
          {
            success: false,
            message: 'Địa chỉ trang chính thức (trustedSiteURL) không hợp lệ.',
            code: 'INVALID_SITE_URL',
          },
          400
        ),
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host.includes('mindx-learn-test')) {
      return {
        errorResponse: jsonResponse(
          {
            success: false,
            message: 'Chốt chặn an toàn Mốc 6: Địa chỉ callback trên môi trường Production bắt buộc là HTTPS chính thức và không được trỏ vào miền TEST.',
            code: 'INVALID_SITE_URL',
          },
          400
        ),
      };
    }
    return { redirectUrl: `${rawSite.replace(/\/+$/, '')}/auth/callback` };
  }
  return {
    redirectUrl: rawSite
      ? `${rawSite.replace(/\/+$/, '')}/auth/callback`
      : 'https://mindx-learn-test.vercel.app/auth/callback',
  };
}

async function coordinatorFixtureLock(adminClient: SupabaseClient): Promise<Response | null> {
  try {
    const { data, error } = await adminClient
      .from('m5_storage_quota_config')
      .select('environment_mode')
      .eq('id', 'default')
      .maybeSingle();
    if (!error && data?.environment_mode === 'test' && isEdgeTestEnvironment()) return null;
    if (!error && data?.environment_mode === 'production') {
      return jsonResponse(
        { success: false, message: 'Thao tác fixture kiểm thử đã bị khóa trên môi trường chính thức (PROD).', code: 'PRODUCTION_ENVIRONMENT_LOCKED' },
        403
      );
    }
  } catch {
    // Fixture operations require a confirmed TEST configuration.
  }
  return jsonResponse(
    { success: false, message: 'Không xác nhận được môi trường TEST. Thao tác kiểm thử đã bị chặn.', code: 'ENVIRONMENT_CONFIG_UNAVAILABLE' },
    503
  );
}

async function withTransientQueryRetry<T = any>(
  runQuery: () => PromiseLike<{ data: T; error: any }>,
  maxAttempts = 3
): Promise<{ data: T; error: any }> {
  let lastRes: { data: T; error: any } = { data: null as any, error: null };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastRes = await runQuery();
      if (!lastRes.error) return lastRes;
    } catch (err) {
      lastRes = { data: null as any, error: err };
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }
  return lastRes;
}

async function fetchAllBootstrapRows<T = any>(
  buildBaseQuery: () => any,
  pageSize = 1000
): Promise<{ data: T[] | null; error: any }> {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || 1000);
  const allRows: T[] = [];
  let offset = 0;
  for (;;) {
    let hasRange = false;
    const { data, error } = await withTransientQueryRetry(() => {
      let q = buildBaseQuery();
      hasRange = Boolean(q && typeof q.range === 'function');
      if (hasRange) {
        q = q.range(offset, offset + safePageSize - 1);
      }
      return q;
    });
    if (error) return { data: null, error };
    if (!Array.isArray(data) || data.length === 0) break;
    allRows.push(...data);
    if (data.length < safePageSize || !hasRange) break;
    offset += safePageSize;
  }
  return { data: allRows, error: null };
}

function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createActorClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function jsonResponse(data: EdgeResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

interface AuthenticatedActor {
  authUserId: string;
  profileId: string;
  role: Role;
  email?: string;
  sessionVersion: number;
  status: string;
}

// ----------------------------------------------------------------------------
// Verify Actor Session against Native auth.sessions, Claims and DB Profile
// ----------------------------------------------------------------------------
async function verifyActorSession(
  adminClient: SupabaseClient,
  accessToken: string | undefined,
  expectedVersion?: number
): Promise<{ actor?: AuthenticatedActor; errorResponse?: Response }> {
  if (!accessToken || typeof accessToken !== 'string') {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
        401
      ),
    };
  }

  // 1. Decode token claims directly from JWT payload
  const claims = decodeJwtClaims(accessToken);
  if (
    !claims ||
    !claims.sub ||
    !claims.session_id ||
    claims.app_metadata?.m2_session_version === undefined
  ) {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
        401
      ),
    };
  }

  // Check token expiration if present
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'TOKEN_EXPIRED' },
        401
      ),
    };
  }

  const authUserId = claims.sub;
  const tokenVersion = claims.app_metadata.m2_session_version;

  // SessionVersion expectation check:
  // sessionVersion body/cookie is only an additional expected value; NEVER let it replace the verified JWT's signed m2_session_version.
  if (expectedVersion !== undefined && expectedVersion !== tokenVersion) {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.SESSION_REVOKED, code: 'SESSION_REVOKED' },
        401
      ),
    };
  }

  // 2. Validate token signature with Supabase GoTrue Auth (retry transient 5xx/network hiccups under shift burst)
  let userData: any = null;
  let userError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const getUserRes = await adminClient.auth.getUser(accessToken);
    userData = getUserRes.data;
    userError = getUserRes.error;
    if (!userError && userData?.user) break;
    const errStatus = Number(userError?.status || 0);
    if (errStatus >= 400 && errStatus < 500) break;
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }
  if (userError || !userData?.user || userData.user.id !== authUserId) {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
        401
      ),
    };
  }

  // 3. Verify actual native auth.sessions row, mapping, profile status and class status via RPC
  const { data: sessionData, error: sessionError } = await withTransientQueryRetry(() =>
    adminClient.rpc('m2_verify_actor_session', {
      p_auth_user_id: authUserId,
      p_session_id: claims.session_id,
      p_expected_version: tokenVersion,
    })
  );

  const sessionRow = sessionData?.[0];
  if (sessionError || !sessionRow || sessionRow.valid !== true) {
    if (sessionRow?.class_status === 'archived') {
      return {
        errorResponse: jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'CLASS_ARCHIVED' },
          403
        ),
      };
    }
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.SESSION_REVOKED, code: 'SESSION_REVOKED' },
        401
      ),
    };
  }

  return {
    actor: {
      authUserId,
      profileId: sessionRow.profile_id,
      role: sessionRow.role as Role,
      email: sessionRow.auth_email,
      sessionVersion: sessionRow.session_version,
      status: sessionRow.status,
    },
  };
}

/**
 * Processes the single-row result from m2_archive_student or m2_restore_student.
 * Enforces strict validation:
 * 1. Must be an array containing exactly one row with a positive integer new_session_version.
 * 2. If auth_user_id is a valid UUID, executes standard strict sync via syncBumpedSessionVersions.
 * 3. Legitimate unissued student exception:
 *    If auth_user_id === null, skips native sync ONLY after verifying:
 *    a) Target student exists in DB and has pin_issued_at === null (successful query).
 *    b) m2_get_actor_auth_by_profile_id query succeeds and returns empty array (no actor_auth mapping).
 * 4. Any other case (malformed row, null/empty/multi-row, mapping missing but PIN issued, query error)
 *    fails closed (returns false -> 500 SESSION_SYNC_FAILED).
 */
async function syncStudentBumpResult(
  adminClient: SupabaseClient,
  studentProfileId: string,
  bumpedRows: unknown
): Promise<boolean> {
  if (!Array.isArray(bumpedRows) || bumpedRows.length !== 1) {
    return false;
  }

  const row = bumpedRows[0];
  if (!row || typeof row !== 'object') {
    return false;
  }

  const newVersion = (row as { new_session_version?: unknown }).new_session_version;
  if (typeof newVersion !== 'number' || !Number.isInteger(newVersion) || newVersion <= 0) {
    return false;
  }

  const authUserId = (row as { auth_user_id?: unknown }).auth_user_id;

  if (authUserId === null) {
    const { data: studentRecord, error: stErr } = await adminClient
      .from('students')
      .select('pin_issued_at')
      .eq('id', studentProfileId)
      .maybeSingle();

    if (stErr || !studentRecord || studentRecord.pin_issued_at !== null) {
      return false;
    }

    const { data: mapData, error: mapErr } = await adminClient.rpc('m2_get_actor_auth_by_profile_id', {
      p_profile_id: studentProfileId,
    });

    if (mapErr || !Array.isArray(mapData) || mapData.length !== 0) {
      return false;
    }

    return true;
  }

  if (isValidUUID(authUserId)) {
    return syncBumpedSessionVersions(bumpedRows, (uid, ver) =>
      adminClient.auth.admin.updateUserById(uid, {
        app_metadata: { role: 'student', m2_session_version: ver },
      })
    );
  }

  return false;
}

// ----------------------------------------------------------------------------
// Main HTTP Handler
// ----------------------------------------------------------------------------
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-mindx-bff-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, message: 'Phương thức không được hỗ trợ.', code: 'METHOD_NOT_ALLOWED' },
      405
    );
  }

  try {
    const adminClient = createAdminClient();

    // 1. Verify BFF Shared Secret via public RPC wrapper
    const bffSecret = req.headers.get('x-mindx-bff-secret');
    if (!bffSecret || bffSecret.trim().length === 0) {
      return jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED_BFF, code: 'UNAUTHORIZED_BFF' },
        401
      );
    }

    const secretHash = await computeSha256Hex(bffSecret.trim());
    const { data: isValidSecret, error: secretError } = await withTransientQueryRetry(() =>
      adminClient.rpc('m2_verify_bff_secret', {
        p_secret_sha256: secretHash,
      })
    );

    if (secretError || isValidSecret !== true) {
      return jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED_BFF, code: 'UNAUTHORIZED_BFF' },
        401
      );
    }

    // 2. Enforce Content-Type & Content-Length Limits (<= 64KB)
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return jsonResponse(
        { success: false, message: 'Content-Type phải là application/json.', code: 'INVALID_CONTENT_TYPE' },
        415
      );
    }

    // Read request body using req.arrayBuffer(), enforce raw bytes <= 65536
    const rawBuffer = await req.arrayBuffer();
    if (rawBuffer.byteLength > 65536) {
      return jsonResponse(
        { success: false, message: 'Kích thước yêu cầu vượt quá giới hạn 64KB.', code: 'PAYLOAD_TOO_LARGE' },
        413
      );
    }

    // 3. Parse Body safely
    let body: EdgeRequest;
    try {
      const rawText = new TextDecoder().decode(rawBuffer);
      body = JSON.parse(rawText);
    } catch {
      return jsonResponse(
        { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
        400
      );
    }

    if (!body || typeof body !== 'object') {
      return jsonResponse(
        { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
        400
      );
    }

    const action = body.action;
    const payload = body.payload || {};

    // 4. Validate Scalar IP (reject comma-separated lists, fail-closed)
    const trustedIp = (body.trustedIp && typeof body.trustedIp === 'string') ? body.trustedIp.trim() : '';
    if (!trustedIp || trustedIp.includes(',') || trustedIp.includes(' ') || trustedIp.includes('\t')) {
      return jsonResponse(
        { success: false, message: 'Địa chỉ IP không hợp lệ hoặc thiếu.', code: 'INVALID_PAYLOAD' },
        400
      );
    }

    const isIPv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(trustedIp);
    const isIPv6 = /^[0-9a-fA-F:]+$/.test(trustedIp) && trustedIp.includes(':');
    if (!isIPv4 && !isIPv6) {
      return jsonResponse(
        { success: false, message: 'Địa chỉ IP không hợp lệ hoặc thiếu.', code: 'INVALID_PAYLOAD' },
        400
      );
    }

    const ipHash = await computeSha256Hex(`ip:${trustedIp}`);

    // --------------------------------------------------------------------------
    // ACTION: student-login-prepare
    // --------------------------------------------------------------------------
    if (action === 'student-login-prepare') {
      const rawStudentCode = payload.studentCode;
      const studentCode = normalizeStudentCode(rawStudentCode);
      if (!studentCode) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      // Rate Limiting (hashed keys)
      const studentCodeHash = await computeSha256Hex(`student:${studentCode}`);
      const accKeyHash = await computeSha256Hex(`rate:acc:${studentCodeHash}`);
      const ipKeyHash = await computeSha256Hex(`rate:ip:${ipHash}`);

      const { data: accRate, error: accErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: accKeyHash,
        p_max_attempts: 6,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      const { data: ipRate, error: ipErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: ipKeyHash,
        p_max_attempts: 240,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      if (accErr || ipErr || accRate?.[0]?.allowed !== true || ipRate?.[0]?.allowed !== true) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
          429
        );
      }

      const { data: studentList, error: stErr } = await adminClient.rpc('m2_get_student_for_prepare', {
        p_student_code: studentCode,
      });

      const student = studentList?.[0];
      if (stErr || !student || !student.pin_issued_at || !student.auth_user_id || !student.auth_email) {
        await computeSha256Hex(`dummy-${studentCode}-${Date.now()}`);
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const { data: challengeId, error: chalError } = await adminClient.rpc('m2_create_student_challenge', {
        p_auth_user_id: student.auth_user_id,
        p_student_code_hash: studentCodeHash,
        p_ip_hash: ipHash,
        p_ttl_seconds: 60,
      });

      if (chalError || !challengeId) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
          500
        );
      }

      return jsonResponse({
        success: true,
        data: {
          challengeId,
          authUserId: student.auth_user_id,
          authEmail: student.auth_email,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: student-login-complete
    // --------------------------------------------------------------------------
    if (action === 'student-login-complete') {
      const { challengeId, authPassword } = payload as { challengeId?: string; authPassword?: string };
      if (!isValidUUID(challengeId) || !authPassword || typeof authPassword !== 'string') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_CHALLENGE, code: 'INVALID_CHALLENGE' },
          401
        );
      }

      const { data: chalResult, error: chalError } = await adminClient.rpc('m2_consume_student_challenge', {
        p_challenge_id: challengeId,
        p_ip_hash: ipHash,
      });

      const isChalValid = chalResult?.[0]?.valid;
      const authUserId = chalResult?.[0]?.auth_user_id;

      if (chalError || !isChalValid || !authUserId) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_CHALLENGE, code: 'INVALID_CHALLENGE' },
          401
        );
      }

      const { data: mappingData, error: mapErr } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
        p_auth_user_id: authUserId,
      });

      const mapping = mappingData?.[0];
      if (mapErr || !mapping) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const { data: profile, error: profError } = await adminClient
        .from('profiles')
        .select('id, full_name, student_code, status, session_version')
        .eq('id', mapping.profile_id)
        .single();

      if (profError || !profile || profile.status !== 'active') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const { data: studentRecord, error: stRecError } = await adminClient
        .from('students')
        .select('current_class_id, status')
        .eq('id', mapping.profile_id)
        .single();

      // Active access allows active and transferred (only archived blocks)
      if (stRecError || !studentRecord || !['active', 'transferred'].includes(studentRecord.status)) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const { data: classRecord, error: clsError } = await adminClient
        .from('classes')
        .select('status')
        .eq('id', studentRecord.current_class_id)
        .single();

      if (clsError || !classRecord || classRecord.status !== 'active') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'CLASS_ARCHIVED' },
          403
        );
      }

      // Sync Auth app_metadata BEFORE signInWithPassword so newly minted token has fresh DB version!
      let syncOk = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        syncOk = await safeAuthOperation(() =>
          adminClient.auth.admin.updateUserById(authUserId, {
            app_metadata: {
              role: 'student',
              m2_session_version: profile.session_version,
            },
          })
        );
        if (syncOk) break;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 120 * attempt));
        }
      }

      if (!syncOk) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'AUTH_SYNC_FAILED' },
          500
        );
      }

      const anonClient = createAnonClient();
      let authData: any = null;
      let authError: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const signInRes = await anonClient.auth.signInWithPassword({
          email: mapping.auth_email,
          password: authPassword,
        });
        authData = signInRes.data;
        authError = signInRes.error;
        if (!authError && authData?.session) break;
        const errStatus = Number(authError?.status || 0);
        if (errStatus >= 400 && errStatus < 500) break;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 120 * attempt));
        }
      }

      if (authError || !authData.session) {
        if (authError?.status === 429) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
            429
          );
        }
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.STUDENT_LOGIN_INVALID, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const userDTO: UserDTO = {
        id: profile.id,
        name: profile.full_name,
        studentCode: profile.student_code,
        role: 'student',
        status: profile.status as any,
        currentClassId: studentRecord.current_class_id,
      };

      return jsonResponse({
        success: true,
        data: {
          session: authData.session,
          sessionVersion: profile.session_version,
          user: userDTO,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: staff-login
    // --------------------------------------------------------------------------
    if (action === 'staff-login') {
      const { email, password } = payload as { email?: string; password?: string };
      if (!isValidEmail(email) || !password || typeof password !== 'string') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const normEmail = email.trim().toLowerCase();
      const emailHash = await computeSha256Hex(`email:${normEmail}`);
      const accKeyHash = await computeSha256Hex(`rate:acc:${emailHash}`);
      const ipKeyHash = await computeSha256Hex(`rate:ip:${ipHash}`);

      const { data: accRate, error: rateErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: accKeyHash,
        p_max_attempts: 6,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      const { data: ipRate, error: ipErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: ipKeyHash,
        p_max_attempts: 240,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      if (rateErr || ipErr || accRate?.[0]?.allowed !== true || ipRate?.[0]?.allowed !== true) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
          429
        );
      }

      // Lookup mapping by email BEFORE signInWithPassword to sync version
      const { data: mappingData, error: mapErr } = await adminClient.rpc('m2_get_actor_auth_by_email', {
        p_email: normEmail,
      });

      const mapping = mappingData?.[0];
      if (!mapErr && mapping && mapping.profile_status === 'active' && ['admin', 'teacher'].includes(mapping.role)) {
        const syncOk = await safeAuthOperation(() =>
          adminClient.auth.admin.updateUserById(mapping.auth_user_id, {
            app_metadata: {
              role: mapping.role,
              m2_session_version: mapping.session_version,
            },
          })
        );

        if (!syncOk) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.SESSION_SYNC_FAILED, code: 'SESSION_SYNC_FAILED' },
            500
          );
        }
      }

      const anonClient = createAnonClient();
      const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
        email: normEmail,
        password,
      });

      if (authError || !authData.session || !authData.user) {
        if (authError?.status === 429) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
            429
          );
        }
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' },
          401
        );
      }

      const authUserId = authData.user.id;

      const { data: userMappingData, error: uMapErr } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
        p_auth_user_id: authUserId,
      });

      const userMapping = userMappingData?.[0];
      if (uMapErr || !userMapping || (userMapping.role !== 'admin' && userMapping.role !== 'teacher')) {
        await adminClient.auth.admin.signOut(authData.session.access_token, 'global');
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
          403
        );
      }

      const { data: profile, error: profError } = await adminClient
        .from('profiles')
        .select('id, full_name, email, role, status, session_version')
        .eq('id', userMapping.profile_id)
        .single();

      if (profError || !profile || profile.status !== 'active') {
        await adminClient.auth.admin.signOut(authData.session.access_token, 'global');
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
          403
        );
      }

      let assignedClassIds: string[] = [];
      if (profile.role === 'teacher') {
        const { data: ctData } = await adminClient
          .from('class_teachers')
          .select('class_id')
          .eq('teacher_profile_id', profile.id);
        assignedClassIds = (ctData || []).map((ct: { class_id: string }) => ct.class_id);
      }

      const userDTO: UserDTO = {
        id: profile.id,
        name: profile.full_name,
        email: profile.email,
        role: profile.role as Role,
        status: profile.status as any,
        assignedClassIds: profile.role === 'teacher' ? assignedClassIds : undefined,
      };

      return jsonResponse({
        success: true,
        data: {
          session: authData.session,
          sessionVersion: profile.session_version,
          user: userDTO,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: session
    // --------------------------------------------------------------------------
    if (action === 'session') {
      const { actor, errorResponse } = await verifyActorSession(
        adminClient,
        body.accessToken,
        body.sessionVersion
      );
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const { data: profData, error: profErr } = await adminClient
        .from('profiles')
        .select('full_name, student_code')
        .eq('id', actor.profileId)
        .single();

      if (profErr || !profData) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const userDTO: UserDTO = {
        id: actor.profileId,
        name: profData.full_name,
        email: actor.role !== 'student' ? actor.email : undefined,
        studentCode: actor.role === 'student' ? profData.student_code : undefined,
        role: actor.role,
        status: actor.status as any,
      };

      if (actor.role === 'teacher') {
        const { data: ctData } = await adminClient
          .from('class_teachers')
          .select('class_id')
          .eq('teacher_profile_id', actor.profileId);
        userDTO.assignedClassIds = (ctData || []).map((ct: { class_id: string }) => ct.class_id);
      } else if (actor.role === 'student') {
        const { data: stData } = await adminClient
          .from('students')
          .select('current_class_id')
          .eq('id', actor.profileId)
          .single();
        userDTO.currentClassId = stData?.current_class_id;
      }

      return jsonResponse({
        success: true,
        data: {
          user: userDTO,
          sessionVersion: actor.sessionVersion,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: refresh
    // --------------------------------------------------------------------------
    if (action === 'refresh') {
      const { refreshToken, sessionVersion } = payload as { refreshToken?: string; sessionVersion?: number };
      if (!refreshToken || typeof refreshToken !== 'string') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'REFRESH_FAILED' },
          401
        );
      }

      const anonClient = createAnonClient();
      const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (refreshError || !refreshData.session || !refreshData.user) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'REFRESH_FAILED' },
          401
        );
      }

      const { actor, errorResponse } = await verifyActorSession(
        adminClient,
        refreshData.session.access_token,
        sessionVersion
      );
      if (errorResponse || !actor) {
        await adminClient.auth.admin.signOut(refreshData.session.access_token, 'global');
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'REFRESH_FAILED' },
          401
        );
      }

      const { data: profData } = await adminClient
        .from('profiles')
        .select('full_name, student_code')
        .eq('id', actor.profileId)
        .single();

      const userDTO: UserDTO = {
        id: actor.profileId,
        name: profData?.full_name || '',
        email: actor.role !== 'student' ? actor.email : undefined,
        studentCode: actor.role === 'student' ? profData?.student_code : undefined,
        role: actor.role,
        status: actor.status as any,
      };

      return jsonResponse({
        success: true,
        data: {
          session: refreshData.session,
          sessionVersion: actor.sessionVersion,
          user: userDTO,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: logout
    // --------------------------------------------------------------------------
    if (action === 'logout') {
      if (!body.accessToken || typeof body.accessToken !== 'string' || !body.accessToken.trim()) {
        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.LOGOUT_SUCCESS,
        });
      }

      const { actor, errorResponse } = await verifyActorSession(
        adminClient,
        body.accessToken,
        body.sessionVersion
      );

      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const { data: newVersion, error: bumpErr } = await adminClient.rpc('m2_bump_profile_version', {
        p_profile_id: actor.profileId,
      });

      if (bumpErr || typeof newVersion !== 'number' || !Number.isInteger(newVersion) || newVersion <= 0) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.SESSION_REVOKE_FAILED, code: 'SESSION_REVOKE_FAILED' },
          500
        );
      }

      const metaOk = await safeAuthOperation(() =>
        adminClient.auth.admin.updateUserById(actor.authUserId, {
          app_metadata: {
            role: actor.role,
            m2_session_version: newVersion,
          },
        })
      );

      const signOutOk = await safeAuthOperation(() =>
        adminClient.auth.admin.signOut(body.accessToken!, 'global')
      );

      if (!metaOk || !signOutOk) {
        return jsonResponse(
          {
            success: false,
            message: STATIC_MESSAGES.LOGOUT_SYNC_FAILED,
            code: 'SESSION_SYNC_FAILED',
          },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.LOGOUT_SUCCESS,
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: password-reset-request (Canonical PKCE via /auth/v1/recover)
    // --------------------------------------------------------------------------
    if (action === 'password-reset-request') {
      const { email, codeChallenge, trustedSiteURL } = payload as {
        email?: string;
        codeChallenge?: string;
        trustedSiteURL?: string;
      };

      if (!isValidEmail(email)) {
        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.RESET_PASSWORD_SENT,
        });
      }

      const normEmail = email.trim().toLowerCase();

      // Check staff exists in DB
      const { data: staff } = await adminClient
        .from('profiles')
        .select('id, role, status')
        .eq('email', normEmail)
        .in('role', ['admin', 'teacher'])
        .eq('status', 'active')
        .maybeSingle();

      if (!staff) {
        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.RESET_PASSWORD_SENT,
        });
      }

      const { redirectUrl, errorResponse: siteUrlErr } = resolveEdgeCallbackRedirectUrl(trustedSiteURL);
      if (siteUrlErr || !redirectUrl) {
        return siteUrlErr!;
      }

      const recoverRes = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: normEmail,
          code_challenge: codeChallenge || '',
          code_challenge_method: codeChallenge ? 's256' : undefined,
          redirect_to: redirectUrl,
        }),
      });

      if (!recoverRes.ok) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.EMAIL_SEND_FAILED, code: 'EMAIL_SEND_FAILED' },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.RESET_PASSWORD_SENT,
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: staff-callback (PKCE token exchange OR invite fragment verification)
    // --------------------------------------------------------------------------
    if (action === 'staff-callback') {
      const { code, codeVerifier, expectedEmail, type, access_token } = payload as {
        code?: string;
        codeVerifier?: string;
        expectedEmail?: string;
        type?: string;
        access_token?: string;
      };

      let authUserId: string;
      let authSession: any = null;
      let ticketId: string | null = null;
      let staffProfile: any = null;

      if (code && codeVerifier) {
        if (!expectedEmail || !isValidEmail(expectedEmail)) {
          return jsonResponse(
            { success: false, message: 'Thiếu email hợp lệ từ phiên khôi phục mật khẩu.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // 1. PKCE exchange via /auth/v1/token?grant_type=pkce
        const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            auth_code: code,
            code_verifier: codeVerifier,
          }),
        });

        if (!tokenRes.ok) {
          return jsonResponse(
            { success: false, message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TOKEN' },
            400
          );
        }

        const tokenData = await tokenRes.json();
        if (!tokenData?.access_token || !tokenData?.user?.id) {
          return jsonResponse(
            { success: false, message: 'Xác thực thất bại từ máy chủ Auth.', code: 'INVALID_TOKEN' },
            400
          );
        }

        authUserId = tokenData.user.id;
        authSession = tokenData;

        if (!tokenData.user.email || tokenData.user.email.toLowerCase().trim() !== expectedEmail.toLowerCase().trim()) {
          return jsonResponse(
            { success: false, message: 'Email không khớp với yêu cầu khôi phục.', code: 'FORBIDDEN' },
            403
          );
        }

        const claims = decodeJwtClaims(tokenData.access_token);
        if (!claims?.session_id) {
          return jsonResponse(
            { success: false, message: 'Token không chứa session_id hợp lệ.', code: 'INVALID_TOKEN' },
            400
          );
        }

        // Verify staff role in DB
        const { data: mappingData, error: mapErr } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
          p_auth_user_id: authUserId,
        });

        const mapping = mappingData?.[0];
        if (mapErr || !mapping || (mapping.role !== 'admin' && mapping.role !== 'teacher')) {
          return jsonResponse(
            { success: false, message: 'Chức năng chỉ dành cho nhân viên.', code: 'FORBIDDEN' },
            403
          );
        }

        const { data: profile, error: profErr } = await adminClient
          .from('profiles')
          .select('id, full_name, email, role, status, session_version')
          .eq('id', mapping.profile_id)
          .single();

        if (profErr || !profile || profile.status !== 'active') {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
            403
          );
        }

        staffProfile = profile;

        // Generate one-use recovery ticket bound to native Auth UUID, session ID, and version
        const { data: recoveryTicketId, error: ticketErr } = await adminClient.rpc('m2_create_recovery_ticket', {
          p_auth_user_id: authUserId,
          p_session_id: claims.session_id,
          p_session_version: profile.session_version,
          p_ttl_seconds: 900,
        });

        if (ticketErr || !recoveryTicketId) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
            500
          );
        }

        ticketId = recoveryTicketId;
      } else if (type === 'invite' && access_token) {
        // 2. Default Invite fragment verification
        const { data: userData, error: userErr } = await adminClient.auth.getUser(access_token);
        if (userErr || !userData?.user?.id) {
          return jsonResponse(
            { success: false, message: 'Liên kết lời mời không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TOKEN' },
            400
          );
        }

        authUserId = userData.user.id;

        const claims = decodeJwtClaims(access_token);
        if (!claims?.session_id) {
          return jsonResponse(
            { success: false, message: 'Token không chứa session_id hợp lệ.', code: 'INVALID_TOKEN' },
            400
          );
        }

        authSession = {
          access_token,
          expires_at: claims.exp,
          refresh_token: (payload.refreshToken || payload.refresh_token) as string | undefined,
        };

        // Verify staff role in DB
        const { data: mappingData, error: mapErr } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
          p_auth_user_id: authUserId,
        });

        const mapping = mappingData?.[0];
        if (mapErr || !mapping || (mapping.role !== 'admin' && mapping.role !== 'teacher')) {
          return jsonResponse(
            { success: false, message: 'Chức năng chỉ dành cho nhân viên.', code: 'FORBIDDEN' },
            403
          );
        }

        if (mapping.invite_pending !== true) {
          return jsonResponse(
            { success: false, message: 'Lời mời này đã được sử dụng hoặc không hợp lệ.', code: 'INVITE_ALREADY_USED' },
            400
          );
        }

        const { data: profile, error: profErr } = await adminClient
          .from('profiles')
          .select('id, full_name, email, role, status, session_version')
          .eq('id', mapping.profile_id)
          .single();

        if (profErr || !profile || profile.status !== 'active') {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
            403
          );
        }

        staffProfile = profile;

        // Atomically claim invite and create bound setup ticket
        const { data: setupTicketId, error: setupErr } = await adminClient.rpc('m2_claim_staff_invite_and_create_ticket', {
          p_auth_user_id: authUserId,
          p_session_id: claims.session_id,
          p_session_version: profile.session_version,
        });

        if (setupErr || !setupTicketId) {
          return jsonResponse(
            { success: false, message: 'Không thể kích hoạt lời mời.', code: 'INVITE_CLAIM_FAILED' },
            400
          );
        }

        ticketId = setupTicketId;
      } else {
        return jsonResponse(
          { success: false, message: 'Dữ liệu xác thực không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const userDTO: UserDTO = {
        id: staffProfile.id,
        name: staffProfile.full_name,
        email: staffProfile.email,
        role: staffProfile.role as Role,
        status: staffProfile.status as any,
      };

      return jsonResponse({
        success: true,
        data: {
          session: authSession,
          sessionVersion: staffProfile.session_version,
          user: userDTO,
          recoveryTicket: ticketId,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: change-password (requires oldPassword OR recoveryTicket)
    // --------------------------------------------------------------------------
    if (action === 'change-password') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin' && actor.role !== 'teacher') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
          403
        );
      }

      const { oldPassword, newPassword, recoveryTicket } = payload as {
        oldPassword?: string;
        newPassword?: string;
        recoveryTicket?: string;
      };

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return jsonResponse(
          { success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.', code: 'INVALID_PASSWORD' },
          400
        );
      }

      if (recoveryTicket && isValidUUID(recoveryTicket)) {
        const claims = decodeJwtClaims(body.accessToken!);
        const sessionId = claims?.session_id;

        if (!sessionId) {
          return jsonResponse(
            { success: false, message: 'Phiên không hợp lệ.', code: 'UNAUTHORIZED' },
            401
          );
        }

        const { data: ticketValid, error: ticketErr } = await adminClient.rpc('m2_consume_recovery_ticket', {
          p_ticket_id: recoveryTicket,
          p_auth_user_id: actor.authUserId,
          p_session_id: sessionId,
          p_session_version: actor.sessionVersion,
        });

        if (ticketErr || ticketValid !== true) {
          return jsonResponse(
            { success: false, message: 'Vé đổi mật khẩu không hợp lệ hoặc đã hết hạn.', code: 'INVALID_TOKEN' },
            400
          );
        }
      } else {
        if (!oldPassword || typeof oldPassword !== 'string') {
          return jsonResponse(
            { success: false, message: 'Mật khẩu hiện tại không chính xác.', code: 'INVALID_PASSWORD' },
            400
          );
        }
        const anonClient = createAnonClient();
        const { error: testErr } = await anonClient.auth.signInWithPassword({
          email: actor.email || '',
          password: oldPassword,
        });
        if (testErr) {
          if (testErr.status === 429) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
              429
            );
          }
          return jsonResponse(
            { success: false, message: 'Mật khẩu hiện tại không chính xác.', code: 'INVALID_PASSWORD' },
            400
          );
        }
      }

      const { data: newVersion, error: bumpErr } = await adminClient.rpc('m2_bump_profile_version', {
        p_profile_id: actor.profileId,
      });

      if (bumpErr || !newVersion) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
          500
        );
      }

      const { error: updErr } = await adminClient.auth.admin.updateUserById(actor.authUserId, {
        password: newPassword,
        app_metadata: {
          role: actor.role,
          m2_session_version: newVersion,
        },
      });

      if (updErr) {
        return jsonResponse(
          { success: false, message: 'Không thể cập nhật mật khẩu Auth.', code: 'AUTH_UPDATE_FAILED' },
          500
        );
      }

      if (body.accessToken) {
        const signOutOk = await safeAuthOperation(() =>
          adminClient.auth.admin.signOut(body.accessToken!, 'global')
        );

        if (!signOutOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.PASSWORD_CHANGED_SYNC_FAILED,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.CHANGE_PASSWORD_SUCCESS,
      });
    }

    // --------------------------------------------------------------------------
    // ACTIONS: change-student-pin-prepare & change-student-pin-commit (Split v2)
    // --------------------------------------------------------------------------
    if (action === 'change-student-pin-prepare') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'student') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
          403
        );
      }

      return jsonResponse({
        success: true,
        data: {
          authUserId: actor.authUserId,
        },
      });
    }

    if (action === 'change-student-pin-commit') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'student') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FORBIDDEN, code: 'FORBIDDEN' },
          403
        );
      }

      const { oldAuthPassword, newAuthPassword } = payload as {
        oldAuthPassword?: string;
        newAuthPassword?: string;
      };

      if (!oldAuthPassword || !newAuthPassword || typeof oldAuthPassword !== 'string' || typeof newAuthPassword !== 'string') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
          400
        );
      }

      // Must not be 8-digit raw PIN
      if (/^\d{8}$/.test(newAuthPassword.trim())) {
        return jsonResponse(
          { success: false, message: 'Mã PIN phải được phái sinh HMAC, không phải mã PIN thô.', code: 'RAW_PIN_REJECTED' },
          400
        );
      }

      // Rate limit student PIN guesses by account and IP
      const rateKey = await computeSha256Hex(`self_pin:${actor.authUserId}`);
      const { data: pinRate, error: rateErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: rateKey,
        p_max_attempts: 6,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      const ipKeyHash = await computeSha256Hex(`rate:ip:${ipHash}`);
      const { data: ipRate, error: ipErr } = await adminClient.rpc('m2_check_rate_limit', {
        p_key_hash: ipKeyHash,
        p_max_attempts: 240,
        p_window_seconds: 60,
        p_cooldown_seconds: 60,
      });

      if (rateErr || ipErr || pinRate?.[0]?.allowed !== true || ipRate?.[0]?.allowed !== true) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
          429
        );
      }

      const anonClient = createAnonClient();
      const { error: verifyErr } = await anonClient.auth.signInWithPassword({
        email: actor.email || '',
        password: oldAuthPassword,
      });

      if (verifyErr) {
        if (verifyErr.status === 429) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.RATE_LIMITED, code: 'RATE_LIMITED' },
            429
          );
        }
        return jsonResponse(
          { success: false, message: 'Mã PIN hiện tại không chính xác.', code: 'INVALID_CREDENTIALS' },
          400
        );
      }

      const { data: newVersion, error: bumpErr } = await adminClient.rpc('m2_bump_profile_version', {
        p_profile_id: actor.profileId,
      });

      if (bumpErr || !newVersion) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
          500
        );
      }

      const { error: updErr } = await adminClient.auth.admin.updateUserById(actor.authUserId, {
        password: newAuthPassword,
        app_metadata: {
          role: 'student',
          m2_session_version: newVersion,
        },
      });

      if (updErr) {
        return jsonResponse(
          { success: false, message: 'Không thể cập nhật mã PIN Auth.', code: 'AUTH_UPDATE_FAILED' },
          500
        );
      }

      if (body.accessToken) {
        const signOutOk = await safeAuthOperation(() =>
          adminClient.auth.admin.signOut(body.accessToken!, 'global')
        );

        if (!signOutOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.PIN_CHANGED_SYNC_FAILED,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.CHANGE_PIN_SUCCESS,
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: bootstrap-admin (coordination-only)
    // --------------------------------------------------------------------------
    if (action === 'bootstrap-admin') {
      const { email, trustedSiteURL, existingConfirmed } = payload as {
        email?: string;
        trustedSiteURL?: string;
        existingConfirmed?: boolean;
      };

      if (!isValidEmail(email)) {
        return jsonResponse(
          { success: false, message: 'Email quản trị viên không hợp lệ.', code: 'INVALID_EMAIL' },
          400
        );
      }

      // Check TEST site / ref via exact origin parser (no .includes or startswith prefix spoof)
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Khởi tạo Quản trị viên chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }

      const normEmail = email.trim().toLowerCase();

      // Zero existing admin profiles check
      const { count, error: countErr } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (countErr || (count !== null && count > 0)) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ALREADY_EXISTS, code: 'ADMIN_ALREADY_EXISTS' },
          409
        );
      }

      // Existing confirmed Auth user adoption branch (Root live cloud)
      if (existingConfirmed === true) {
        const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers();
        if (listErr || !listData?.users) {
          return jsonResponse(
            { success: false, message: 'Không thể truy vấn danh sách tài khoản xác thực.', code: 'AUTH_LOOKUP_FAILED' },
            500
          );
        }

        const matchingUsers = listData.users.filter((u) => u.email?.toLowerCase() === normEmail);
        if (matchingUsers.length !== 1) {
          return jsonResponse(
            { success: false, message: 'Không tìm thấy tài khoản hoặc có nhiều tài khoản trùng email.', code: 'USER_LOOKUP_FAILED' },
            400
          );
        }

        const adoptedUser = matchingUsers[0];
        if (!adoptedUser.email_confirmed_at) {
          return jsonResponse(
            { success: false, message: 'Tài khoản chưa được xác thực email.', code: 'EMAIL_NOT_CONFIRMED' },
            400
          );
        }

        // Check if already mapped
        const { data: existingMap } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
          p_auth_user_id: adoptedUser.id,
        });

        if (existingMap && existingMap.length > 0) {
          return jsonResponse(
            { success: false, message: 'Tài khoản đã có bản đồ định danh.', code: 'ALREADY_MAPPED' },
            409
          );
        }

        // Set trusted app_metadata version 1 (do not alter password/email or grant via user_metadata)
        const { error: metaErr } = await adminClient.auth.admin.updateUserById(adoptedUser.id, {
          app_metadata: {
            role: 'admin',
            m2_session_version: 1,
          },
        });

        if (metaErr) {
          return jsonResponse(
            { success: false, message: 'Không thể cập nhật quyền quản trị viên.', code: 'AUTH_UPDATE_FAILED' },
            500
          );
        }

        // New public admin profile UUID != Auth UUID
        let newProfileId = crypto.randomUUID();
        while (newProfileId.toLowerCase() === adoptedUser.id.toLowerCase()) {
          newProfileId = crypto.randomUUID();
        }

        const { data: newProfile, error: profErr } = await adminClient
          .from('profiles')
          .insert({
            id: newProfileId,
            role: 'admin',
            full_name: 'Admin Quản Trị Hệ Thống',
            email: normEmail,
            status: 'active',
            session_version: 1,
            is_fixture: false,
          })
          .select('id')
          .single();

        if (profErr || !newProfile) {
          // Never delete adopted existing Auth user!
          return jsonResponse(
            { success: false, message: 'Không thể tạo hồ sơ quản trị viên.', code: 'DB_ERROR' },
            500
          );
        }

        const { error: mapErr } = await adminClient.rpc('m2_create_actor_auth', {
          p_auth_user_id: adoptedUser.id,
          p_profile_id: newProfile.id,
          p_role: 'admin',
          p_auth_email: normEmail,
          p_session_version: 1,
          p_invite_pending: false,
          p_invite_issued_at: null,
        });

        if (mapErr) {
          // Rollback newly created profile only, NEVER delete adopted existing Auth user!
          await adminClient.from('profiles').delete().eq('id', newProfile.id);
          return jsonResponse(
            { success: false, message: 'Không thể tạo bản đồ danh tính quản trị viên.', code: 'DB_ERROR' },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: 'Tiếp nhận và khởi tạo Quản trị viên thành công.',
        });
      }

      // Normal fresh invite path
      const { redirectUrl, errorResponse: siteUrlErr } = resolveEdgeCallbackRedirectUrl(trustedSiteURL);
      if (siteUrlErr || !redirectUrl) {
        return siteUrlErr!;
      }

      const { data: authUser, error: authCreateErr } = await adminClient.auth.admin.inviteUserByEmail(
        normEmail,
        {
          redirectTo: redirectUrl,
          data: { role: 'admin' },
        }
      );

      if (authCreateErr || !authUser?.user || !authUser.user.invited_at) {
        return jsonResponse(
          { success: false, message: 'Không thể gửi email kích hoạt cho quản trị viên.', code: 'AUTH_CREATE_FAILED' },
          500
        );
      }

      const { error: metaErr } = await adminClient.auth.admin.updateUserById(authUser.user.id, {
        app_metadata: {
          role: 'admin',
          m2_session_version: 1,
        },
      });

      if (metaErr) {
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return jsonResponse(
          { success: false, message: 'Không thể thiết lập quyền quản trị viên Auth.', code: 'AUTH_UPDATE_FAILED' },
          500
        );
      }

      let newProfileId = crypto.randomUUID();
      while (newProfileId.toLowerCase() === authUser.user.id.toLowerCase()) {
        newProfileId = crypto.randomUUID();
      }

      const { data: newProfile, error: profErr } = await adminClient
        .from('profiles')
        .insert({
          id: newProfileId,
          role: 'admin',
          full_name: 'Admin Quản Trị Hệ Thống',
          email: normEmail,
          status: 'active',
          session_version: 1,
          is_fixture: false,
        })
        .select('id')
        .single();

      if (profErr || !newProfile) {
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return jsonResponse(
          { success: false, message: 'Không thể lưu hồ sơ quản trị viên.', code: 'DB_ERROR' },
          500
        );
      }

      const { error: mapErr } = await adminClient.rpc('m2_create_actor_auth', {
        p_auth_user_id: authUser.user.id,
        p_profile_id: newProfile.id,
        p_role: 'admin',
        p_auth_email: normEmail,
        p_session_version: 1,
        p_invite_pending: true,
        p_invite_issued_at: authUser.user.invited_at,
      });

      if (mapErr) {
        await adminClient.from('profiles').delete().eq('id', newProfile.id);
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return jsonResponse(
          { success: false, message: 'Không thể tạo bản đồ danh tính quản trị viên.', code: 'DB_ERROR' },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: 'Khởi tạo tài khoản Quản trị viên thành công. Email kích hoạt đã được gửi.',
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: bootstrap (Business role-specific DTO via ACTOR-SCOPED CLIENT for RLS)
    // --------------------------------------------------------------------------
    if (action === 'bootstrap') {
      const { actor, errorResponse } = await verifyActorSession(
        adminClient,
        body.accessToken,
        body.sessionVersion
      );
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const actorClient = createActorClient(body.accessToken!);

      const { data: profile, error: profErr } = await withTransientQueryRetry(() =>
        actorClient
          .from('profiles')
          .select('id, full_name, email, student_code, role, status')
          .eq('id', actor.profileId)
          .single()
      );

      if (profErr || !profile || profile.status !== 'active') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const currentUser: UserDTO = {
        id: profile.id,
        name: profile.full_name,
        email: profile.role !== 'student' ? profile.email : undefined,
        studentCode: profile.role === 'student' ? profile.student_code : undefined,
        role: profile.role as Role,
        status: profile.status as any,
      };

      let users: UserDTO[] = [];
      let classes: ClassDTO[] = [];
      let students: StudentDTO[] = [];

      if (actor.role === 'admin') {
        const { data: allProfiles, error: profsErr } = await withTransientQueryRetry(() =>
          adminClient
            .from('profiles')
            .select('id, full_name, email, role, status')
            .in('role', ['admin', 'teacher'])
        );

        if (profsErr) {
          return jsonResponse({ success: false, message: 'Không thể tải danh sách tài khoản quản trị và giáo viên.', code: 'DB_ERROR' }, 500);
        }

        const { data: ctAll, error: ctErr } = await withTransientQueryRetry(() =>
          adminClient
            .from('class_teachers')
            .select('class_id, teacher_profile_id')
        );

        if (ctErr) {
          return jsonResponse({ success: false, message: 'Không thể tải thông tin phân công giáo viên.', code: 'DB_ERROR' }, 500);
        }

        users = (allProfiles || []).map((p: any) => ({
          id: p.id,
          name: p.full_name,
          email: p.email,
          role: p.role,
          status: p.status,
          assignedClassIds: (ctAll || [])
            .filter((ct: any) => ct.teacher_profile_id === p.id)
            .map((ct: any) => ct.class_id),
        }));

        const { data: allClasses, error: classesErr } = await fetchAllBootstrapRows(() =>
          adminClient
            .from('classes')
            .select('id, code, name, course_id, status, is_14_sessions_confirmed')
            .order('id', { ascending: true })
        );

        if (classesErr) {
          return jsonResponse({ success: false, message: 'Không thể tải danh sách lớp học.', code: 'DB_ERROR' }, 500);
        }

        classes = (allClasses || []).map((c: any) => {
          const assigned = (ctAll || []).find((ct: any) => ct.class_id === c.id);
          return {
            id: c.id,
            code: c.code,
            name: c.name,
            courseId: c.course_id,
            teacherId: assigned ? assigned.teacher_profile_id : null,
            status: c.status,
            is14SessionsConfirmed: c.is_14_sessions_confirmed,
          };
        });

        const { data: allStudents, error: studentsErr } = await fetchAllBootstrapRows(() =>
          adminClient
            .from('students')
            .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes')
            .order('id', { ascending: true })
        );

        if (studentsErr) {
          return jsonResponse({ success: false, message: 'Không thể tải danh sách học sinh.', code: 'DB_ERROR' }, 500);
        }

        students = (allStudents || []).map((s: any) => ({
          id: s.id,
          participantId: s.participant_id,
          studentCode: s.student_code,
          fullName: s.full_name,
          currentClassId: s.current_class_id,
          originalClassId: s.original_class_id,
          pinIssuedAt: s.pin_issued_at,
          hasPin: Boolean(s.pin_issued_at),
          status: s.status,
          notes: s.notes,
        }));
      } else if (actor.role === 'teacher') {
        const { data: myCt, error: myCtErr } = await withTransientQueryRetry(() =>
          actorClient
            .from('class_teachers')
            .select('class_id')
            .eq('teacher_profile_id', actor.profileId)
        );

        if (myCtErr) {
          return jsonResponse({ success: false, message: 'Không thể tải thông tin phân công lớp học của giáo viên.', code: 'DB_ERROR' }, 500);
        }

        const assignedClassIds = (myCt || []).map((ct: any) => ct.class_id);
        currentUser.assignedClassIds = assignedClassIds;
        users = [currentUser];

        const { data: myClasses, error: myClassesErr } = await fetchAllBootstrapRows(() =>
          actorClient
            .from('classes')
            .select('id, code, name, course_id, status, is_14_sessions_confirmed')
            .order('id', { ascending: true })
        );

        if (myClassesErr) {
          return jsonResponse({ success: false, message: 'Không thể tải danh sách lớp học phụ trách.', code: 'DB_ERROR' }, 500);
        }

        classes = (myClasses || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          courseId: c.course_id,
          teacherId: actor.profileId,
          status: c.status,
          is14SessionsConfirmed: c.is_14_sessions_confirmed,
        }));

        if (assignedClassIds.length > 0) {
          const { data: myStudents, error: myStudentsErr } = await fetchAllBootstrapRows(() =>
            actorClient
              .from('students')
              .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes')
              .in('current_class_id', assignedClassIds)
              .order('id', { ascending: true })
          );

          if (myStudentsErr) {
            return jsonResponse({ success: false, message: 'Không thể tải danh sách học sinh của các lớp phụ trách.', code: 'DB_ERROR' }, 500);
          }

          students = (myStudents || []).map((s: any) => ({
            id: s.id,
            participantId: s.participant_id,
            studentCode: s.student_code,
            fullName: s.full_name,
            currentClassId: s.current_class_id,
            originalClassId: s.original_class_id,
            pinIssuedAt: s.pin_issued_at,
            hasPin: Boolean(s.pin_issued_at),
            status: s.status,
            notes: s.notes,
          }));
        }
      } else if (actor.role === 'student') {
        const { data: myStudent, error: myStudentErr } = await withTransientQueryRetry(() =>
          actorClient
            .from('students')
            .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes')
            .eq('id', actor.profileId)
            .maybeSingle()
        );

        if (myStudentErr) {
          return jsonResponse({ success: false, message: 'Không thể tải hồ sơ học sinh.', code: 'DB_ERROR' }, 500);
        }

        if (myStudent) {
          currentUser.currentClassId = myStudent.current_class_id;
          students = [
            {
              id: myStudent.id,
              participantId: myStudent.participant_id,
              studentCode: myStudent.student_code,
              fullName: myStudent.full_name,
              currentClassId: myStudent.current_class_id,
              originalClassId: myStudent.original_class_id,
              pinIssuedAt: myStudent.pin_issued_at,
              hasPin: Boolean(myStudent.pin_issued_at),
              status: myStudent.status,
              notes: myStudent.notes,
            },
          ];

          const { data: myClass, error: myClassErr } = await withTransientQueryRetry(() =>
            actorClient
              .from('classes')
              .select('id, code, name, course_id, status, is_14_sessions_confirmed')
              .eq('id', myStudent.current_class_id)
              .maybeSingle()
          );

          if (myClassErr) {
            return jsonResponse({ success: false, message: 'Không thể tải thông tin lớp học của học sinh.', code: 'DB_ERROR' }, 500);
          }

          if (myClass) {
            classes = [
              {
                id: myClass.id,
                code: myClass.code,
                name: myClass.name,
                courseId: myClass.course_id,
                teacherId: null,
                status: myClass.status,
                is14SessionsConfirmed: myClass.is_14_sessions_confirmed,
              },
            ];
          }
        }
        users = [currentUser];
      }

      // ----------------------------------------------------------------------
      // M3: Load courses, lessons, quiz_results, submissions with strict security
      // ----------------------------------------------------------------------
      let courses: CourseDTO[] = [];
      let lessons: LessonDTO[] = [];
      let quizResults: QuizResultDTO[] = [];
      let submissions: PracticeSubmissionDTO[] = [];

      // 1. Courses (Students only see course assigned to their active class)
      let dbCourses: any[] = [];
      if (actor.role === 'student') {
        const studentClassCourseId = classes[0]?.courseId;
        if (studentClassCourseId) {
          const { data: cData, error: coursesErr } = await withTransientQueryRetry(() =>
            actorClient
              .from('courses')
              .select('id, title, description, total_sessions, created_at')
              .eq('id', studentClassCourseId)
              .order('created_at', { ascending: true })
          );

          if (coursesErr) {
            return jsonResponse({ success: false, message: 'Không thể truy vấn thông tin khóa học.', code: 'DB_ERROR' }, 500);
          }
          dbCourses = cData || [];
        } else {
          dbCourses = [];
        }
      } else {
        const { data: cData, error: coursesErr } = await withTransientQueryRetry(() =>
          actorClient
            .from('courses')
            .select('id, title, description, total_sessions, created_at')
            .order('created_at', { ascending: true })
        );

        if (coursesErr) {
          return jsonResponse({ success: false, message: 'Không thể truy vấn danh sách khóa học.', code: 'DB_ERROR' }, 500);
        }
        dbCourses = cData || [];
      }

      courses = dbCourses.map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        totalSessions: 14,
        createdAt: c.created_at,
      }));

      // 2. Lessons & Questions (Staff read full questions with answers via server service-role; student gets questions without correctOptionIndex)
      if (actor.role === 'admin' || actor.role === 'teacher') {
        // Staff: select all authorized lessons (draft and published) under RLS
        const { data: dbLessons, error: lessonsErr } = await withTransientQueryRetry(() =>
          actorClient
            .from('lessons')
            .select('id, course_id, session_number, title, description, materials, video_url, status, has_quiz, has_practice, practice_mode')
            .order('session_number', { ascending: true })
        );

        if (lessonsErr) {
          return jsonResponse({ success: false, message: 'Không thể truy vấn danh sách bài học.', code: 'DB_ERROR' }, 500);
        }

        const lessonIds = (dbLessons || []).map((l: any) => l.id);
        let dbQuestions: any[] = [];
        if (lessonIds.length > 0) {
          const { data: qData, error: questionsErr } = await withTransientQueryRetry(() =>
            adminClient
              .from('quiz_questions')
              .select('id, lesson_id, prompt, options, correct_option_index, order_index')
              .in('lesson_id', lessonIds)
              .order('order_index', { ascending: true })
          );

          if (questionsErr) {
            return jsonResponse({ success: false, message: 'Không thể truy vấn câu hỏi trắc nghiệm.', code: 'DB_ERROR' }, 500);
          }
          dbQuestions = qData || [];
        }

        const questionsByLesson = new Map<string, QuestionDTO[]>();
        for (const q of dbQuestions) {
          const list = questionsByLesson.get(q.lesson_id) || [];
          list.push({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            correctOptionIndex: q.correct_option_index,
          });
          questionsByLesson.set(q.lesson_id, list);
        }

        lessons = (dbLessons || []).map((l: any) => ({
          id: l.id,
          courseId: l.course_id,
          sessionNumber: l.session_number,
          title: l.title,
          description: l.description,
          materials: l.materials,
          videoUrl: l.video_url,
          status: l.status,
          hasQuiz: l.has_quiz,
          hasPractice: l.has_practice,
          practiceMode: l.practice_mode,
          questions: questionsByLesson.get(l.id) || [],
        }));
      } else if (actor.role === 'student') {
        // Student: select ONLY published lessons belonging to student's class course
        const studentClassCourseId = classes[0]?.courseId;
        const { data: dbLessons, error: lessonsErr } = await withTransientQueryRetry(() => {
          let q = actorClient
            .from('lessons')
            .select('id, course_id, session_number, title, description, materials, video_url, status, has_quiz, has_practice, practice_mode')
            .eq('status', 'published');
          if (studentClassCourseId) {
            q = q.eq('course_id', studentClassCourseId);
          }
          return q.order('session_number', { ascending: true });
        });

        if (lessonsErr) {
          return jsonResponse({ success: false, message: 'Không thể truy vấn danh sách bài học.', code: 'DB_ERROR' }, 500);
        }

        const lessonIds = (dbLessons || []).map((l: any) => l.id);
        let dbQuestions: any[] = [];
        if (lessonIds.length > 0) {
          // Student query for questions: strictly WITHOUT correct_option_index
          const { data: qData, error: questionsErr } = await withTransientQueryRetry(() =>
            adminClient
              .from('quiz_questions')
              .select('id, lesson_id, prompt, options, order_index')
              .in('lesson_id', lessonIds)
              .order('order_index', { ascending: true })
          );

          if (questionsErr) {
            return jsonResponse({ success: false, message: 'Không thể truy vấn câu hỏi trắc nghiệm.', code: 'DB_ERROR' }, 500);
          }
          dbQuestions = qData || [];
        }

        const questionsByLesson = new Map<string, QuestionDTO[]>();
        for (const q of dbQuestions) {
          const list = questionsByLesson.get(q.lesson_id) || [];
          list.push({
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            // Strictly NO correctOptionIndex field
          });
          questionsByLesson.set(q.lesson_id, list);
        }

        lessons = (dbLessons || []).map((l: any) => ({
          id: l.id,
          courseId: l.course_id,
          sessionNumber: l.session_number,
          title: l.title,
          description: l.description,
          materials: l.materials,
          videoUrl: l.video_url,
          status: l.status,
          hasQuiz: l.has_quiz,
          hasPractice: l.has_practice,
          practiceMode: l.practice_mode,
          questions: questionsByLesson.get(l.id) || [],
        }));
      }

      // 3. Quiz Results (Select and map class_id, surface database errors)
      const { data: dbQuizResults, error: quizErr } = actor.role === 'student'
        ? await withTransientQueryRetry(() =>
            actorClient
              .from('quiz_results')
              .select('student_id, lesson_id, class_id, highest_score, attempts_count, passed, last_attempt_at')
              .eq('student_id', actor.profileId)
          )
        : await fetchAllBootstrapRows(() =>
            (actor.role === 'admin' ? adminClient : actorClient)
              .from('quiz_results')
              .select('student_id, lesson_id, class_id, highest_score, attempts_count, passed, last_attempt_at')
              .order('student_id', { ascending: true })
              .order('lesson_id', { ascending: true })
          );

      if (quizErr) {
        return jsonResponse({ success: false, message: 'Không thể truy vấn kết quả trắc nghiệm.', code: 'DB_ERROR' }, 500);
      }

      quizResults = (dbQuizResults || []).map((q: any) => ({
        studentId: q.student_id,
        lessonId: q.lesson_id,
        classId: q.class_id,
        highestScore: q.highest_score,
        attemptsCount: q.attempts_count,
        passed: q.passed,
        lastAttemptAt: q.last_attempt_at,
      }));

      // 4. Submissions (Select and map class_id, surface database errors)
      const { data: dbSubmissions, error: subErr } = actor.role === 'student'
        ? await withTransientQueryRetry(() =>
            actorClient
              .from('practice_submissions')
              .select('id, student_id, lesson_id, class_id, type, content, file_size_bytes, notes, status, teacher_feedback, submitted_at, graded_at, graded_by, can_resubmit')
              .eq('student_id', actor.profileId)
          )
        : await fetchAllBootstrapRows(() =>
            (actor.role === 'admin' ? adminClient : actorClient)
              .from('practice_submissions')
              .select('id, student_id, lesson_id, class_id, type, content, file_size_bytes, notes, status, teacher_feedback, submitted_at, graded_at, graded_by, can_resubmit')
              .order('id', { ascending: true })
          );

      if (subErr) {
        return jsonResponse({ success: false, message: 'Không thể truy vấn bài nộp thực hành.', code: 'DB_ERROR' }, 500);
      }

      submissions = (dbSubmissions || []).map((s: any) => ({
        id: s.id,
        studentId: s.student_id,
        lessonId: s.lesson_id,
        classId: s.class_id,
        type: s.type,
        content: s.content,
        fileSizeBytes: s.file_size_bytes,
        notes: s.notes,
        status: s.status,
        teacherFeedback: s.teacher_feedback,
        submittedAt: s.submitted_at,
        gradedAt: s.graded_at,
        gradedBy: s.graded_by,
        canResubmit: s.can_resubmit,
      }));

      return jsonResponse({
        success: true,
        data: {
          currentUser,
          users,
          classes,
          students,
          courses,
          lessons,
          quizResults,
          submissions,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTIONS: create-class, update-class, archive-class, restore-class (Admin only)
    // --------------------------------------------------------------------------
    if (['create-class', 'update-class', 'archive-class', 'restore-class'].includes(action)) {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      if (action === 'create-class') {
        const { code, name, courseId, teacherId } = payload as {
          code?: string;
          name?: string;
          courseId?: string | null;
          teacherId?: string | null;
        };

        if (!code || typeof code !== 'string' || !code.trim() || !name || typeof name !== 'string' || !name.trim()) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const targetTeacherId = teacherId && isValidUUID(teacherId) ? teacherId : null;
        const targetCourseId = courseId && isValidUUID(courseId) ? courseId : null;

        const { data: savedClassData, error: saveErr } = await adminClient.rpc('m3_save_class', {
          p_admin_profile_id: actor.profileId,
          p_class_id: null,
          p_code: code.trim(),
          p_name: name.trim(),
          p_teacher_id: targetTeacherId,
          p_course_id: targetCourseId,
          p_update_teacher: true,
          p_update_course: true,
        });

        const savedClass = savedClassData?.[0];
        if (saveErr || !savedClass) {
          return jsonResponse(
            { success: false, message: saveErr?.message || 'Không thể tạo lớp học. Mã lớp có thể đã tồn tại.', code: 'DB_ERROR' },
            400
          );
        }

        const classDTO: ClassDTO = {
          id: savedClass.id,
          code: savedClass.code,
          name: savedClass.name,
          courseId: savedClass.course_id,
          teacherId: savedClass.teacher_id,
          status: savedClass.status,
          is14SessionsConfirmed: savedClass.is_14_sessions_confirmed,
        };

        return jsonResponse({
          success: true,
          data: classDTO,
          message: STATIC_MESSAGES.CLASS_CREATED,
        });
      }

      if (action === 'update-class') {
        const { id, data } = payload as { id?: string; data?: Partial<ClassDTO> };
        if (!isValidUUID(id) || !data || typeof data !== 'object') {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // Atomic partial update with presence flags: resolve omitted fields inside transaction under lock
        const updateTeacherFlag = data.teacherId !== undefined;
        const updateCourseFlag = data.courseId !== undefined;
        const targetTeacherId = data.teacherId && isValidUUID(data.teacherId) ? data.teacherId : null;
        const targetCourseId = data.courseId && isValidUUID(data.courseId) ? data.courseId : null;
        const codeParam = data.code && typeof data.code === 'string' && data.code.trim() ? data.code.trim() : null;
        const nameParam = data.name && typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null;

        const { data: savedClassData, error: saveErr } = await adminClient.rpc('m3_save_class', {
          p_admin_profile_id: actor.profileId,
          p_class_id: id,
          p_code: codeParam,
          p_name: nameParam,
          p_teacher_id: targetTeacherId,
          p_course_id: targetCourseId,
          p_update_teacher: updateTeacherFlag,
          p_update_course: updateCourseFlag,
        });

        const savedClass = savedClassData?.[0];
        if (saveErr || !savedClass) {
          const errMsg = saveErr?.message || '';
          const status = errMsg.includes('NOT_FOUND') ? 404 : 400;
          const code = errMsg.includes('DUPLICATE_CODE') ? 'DUPLICATE_CODE' : (errMsg.includes('NOT_FOUND') ? 'NOT_FOUND' : 'DB_ERROR');
          return jsonResponse(
            { success: false, message: errMsg || 'Không thể cập nhật lớp học.', code },
            status
          );
        }

        const classDTO: ClassDTO = {
          id: savedClass.id,
          code: savedClass.code,
          name: savedClass.name,
          courseId: savedClass.course_id,
          teacherId: savedClass.teacher_id,
          status: savedClass.status,
          is14SessionsConfirmed: savedClass.is_14_sessions_confirmed,
        };

        return jsonResponse({
          success: true,
          data: classDTO,
          message: STATIC_MESSAGES.CLASS_UPDATED,
        });
      }

      if (action === 'archive-class') {
        const { id } = payload as { id?: string };
        if (!isValidUUID(id)) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // Call atomic RPC with canonical lock and session version bump
        const { data: bumpedUsers, error: arcErr } = await adminClient.rpc('m2_archive_class', {
          p_class_id: id,
        });

        if (arcErr) {
          return jsonResponse(
            { success: false, message: 'Không thể lưu trữ lớp học.', code: 'DB_ERROR' },
            500
          );
        }

        // Sync Auth metadata for all bumped students
        const syncOk = await syncBumpedSessionVersions(bumpedUsers, (authUserId, newVersion) =>
          adminClient.auth.admin.updateUserById(authUserId, {
            app_metadata: { role: 'student', m2_session_version: newVersion },
          })
        );

        if (!syncOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.CLASS_STATUS_SYNC_PARTIAL,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.CLASS_ARCHIVED,
        });
      }

      if (action === 'restore-class') {
        const { id } = payload as { id?: string };
        if (!isValidUUID(id)) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // Call atomic RPC with canonical lock and session version bump
        const { data: bumpedUsers, error: resErr } = await adminClient.rpc('m2_restore_class', {
          p_class_id: id,
        });

        if (resErr) {
          return jsonResponse(
            { success: false, message: 'Không thể khôi phục lớp học.', code: 'DB_ERROR' },
            500
          );
        }

        // Sync Auth metadata for all bumped students
        const syncOk = await syncBumpedSessionVersions(bumpedUsers, (authUserId, newVersion) =>
          adminClient.auth.admin.updateUserById(authUserId, {
            app_metadata: { role: 'student', m2_session_version: newVersion },
          })
        );

        if (!syncOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.CLASS_STATUS_SYNC_PARTIAL,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.CLASS_RESTORED,
        });
      }
    }

    // --------------------------------------------------------------------------
    // ACTIONS: create-teacher, assign-teacher (Admin only)
    // --------------------------------------------------------------------------
    if (action === 'create-teacher' || action === 'assign-teacher') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      if (action === 'create-teacher') {
        const { name, email, assignedClassIds } = payload as {
          name?: string;
          email?: string;
          assignedClassIds?: unknown;
        };

        if (
          !name ||
          typeof name !== 'string' ||
          !name.trim() ||
          name.trim().length > 100 ||
          !isValidEmail(email)
        ) {
          return jsonResponse(
            { success: false, message: 'Họ tên và email giáo viên không hợp lệ.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const normEmail = email.trim().toLowerCase();
        if (normEmail.length > 255) {
          return jsonResponse(
            { success: false, message: 'Email giáo viên vượt quá độ dài tối đa.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // Validate assignedClassIds:
        // undefined/null defaults to []
        // bounded e.g. 100, UUIDs all; don't silently drop malformed values
        const classIds: string[] = [];
        if (assignedClassIds !== undefined && assignedClassIds !== null) {
          if (!Array.isArray(assignedClassIds) || assignedClassIds.length > 100) {
            return jsonResponse(
              { success: false, message: 'Danh sách lớp phân công không hợp lệ hoặc vượt quá giới hạn 100 lớp.', code: 'INVALID_PAYLOAD' },
              400
            );
          }
          for (const cid of assignedClassIds) {
            if (typeof cid !== 'string' || !isValidUUID(cid)) {
              return jsonResponse(
                { success: false, message: 'Mã lớp phân công không hợp lệ.', code: 'INVALID_PAYLOAD' },
                400
              );
            }
            classIds.push(cid);
          }
        }

        // Call atomic linking RPC
        const { data: linkResult, error: linkErr } = await adminClient.rpc('m2_link_existing_teacher', {
          p_admin_profile_id: actor.profileId,
          p_email: normEmail,
          p_name: name.trim(),
          p_class_ids: classIds,
        });

        if (linkErr) {
          const errMsg = linkErr.message || '';
          if (errMsg.includes('AUTH_USER_NOT_FOUND') || errMsg.includes('AUTH_USER_DELETED')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_ACCOUNT_NOT_FOUND, code: 'AUTH_USER_NOT_FOUND' },
              404
            );
          }
          if (
            errMsg.includes('AUTH_USER_UNCONFIRMED') ||
            errMsg.includes('AUTH_USER_NO_PASSWORD') ||
            errMsg.includes('AUTH_USER_BANNED') ||
            errMsg.includes('AUTH_USER_ANONYMOUS')
          ) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_ACCOUNT_UNCONFIRMED, code: 'AUTH_USER_UNCONFIRMED' },
              400
            );
          }
          if (errMsg.includes('TEACHER_ALREADY_MAPPED') || errMsg.includes('PROFILE_EMAIL_EXISTS')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_ALREADY_MAPPED, code: 'TEACHER_ALREADY_MAPPED' },
              409
            );
          }
          if (errMsg.includes('AUTH_USER_DUPLICATE_EMAIL')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_ACCOUNT_DUPLICATE_EMAIL, code: 'AUTH_USER_DUPLICATE_EMAIL' },
              409
            );
          }
          if (errMsg.includes('AUTH_USER_CONFLICTING_ROLE')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_ROLE_CONFLICT, code: 'AUTH_USER_CONFLICTING_ROLE' },
              400
            );
          }
          if (errMsg.includes('CLASS_ALREADY_ASSIGNED')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_CLASS_ALREADY_ASSIGNED, code: 'CLASS_ALREADY_ASSIGNED' },
              409
            );
          }
          if (
            errMsg.includes('Active class not found') ||
            errMsg.includes('CLASS_NOT_FOUND') ||
            errMsg.includes('INVALID_CLASS_ARRAY')
          ) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.TEACHER_CLASS_INVALID, code: 'CLASS_NOT_FOUND' },
              400
            );
          }
          if (errMsg.includes('ADMIN_NOT_ACTIVE')) {
            return jsonResponse(
              { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
              403
            );
          }
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
            500
          );
        }

        const linkedRow = Array.isArray(linkResult) ? linkResult[0] : linkResult;
        if (!linkedRow || !linkedRow.id) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
            500
          );
        }

        return jsonResponse({
          success: true,
          data: {
            id: linkedRow.id,
            name: linkedRow.full_name,
            email: linkedRow.email,
            role: 'teacher',
            status: linkedRow.status,
            assignedClassIds: linkedRow.assigned_class_ids || [],
          },
          message: STATIC_MESSAGES.TEACHER_CREATED,
        });
      }

      if (action === 'assign-teacher') {
        const { teacherId, classId } = payload as { teacherId?: string; classId?: string };
        if (!isValidUUID(classId)) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        if (teacherId !== undefined && teacherId !== null && !isValidUUID(teacherId)) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const targetTeacherId = teacherId && isValidUUID(teacherId) ? teacherId : null;

        const { data: assignOk, error: assignErr } = await adminClient.rpc('m2_assign_class_teacher', {
          p_admin_profile_id: actor.profileId,
          p_class_id: classId,
          p_teacher_id: targetTeacherId,
        });

        if (assignErr || assignOk !== true) {
          return jsonResponse(
            { success: false, message: 'Không thể phân công giáo viên.', code: 'DB_ERROR' },
            400
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.TEACHER_ASSIGNED,
        });
      }
    }

    // --------------------------------------------------------------------------
    // ACTIONS: archive-student, restore-student, update-student (Admin only)
    // --------------------------------------------------------------------------
    if (['archive-student', 'restore-student', 'update-student'].includes(action)) {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { id, data } = payload as { id?: string; data?: { fullName?: string; notes?: string } };
      if (!isValidUUID(id)) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
          400
        );
      }

      if (action === 'update-student') {
        if (!data || typeof data !== 'object') {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }
        const trimmedName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
        const shouldUpdateName = trimmedName.length > 0;
        const shouldUpdateNotes = data.notes !== undefined && typeof data.notes === 'string';
        const trimmedNotes = shouldUpdateNotes ? data.notes!.trim() : null;

        if (!shouldUpdateName && !shouldUpdateNotes) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const { error: updErr } = await adminClient.rpc('m4_update_student', {
          p_admin_profile_id: actor.profileId,
          p_student_id: id,
          p_full_name: shouldUpdateName ? trimmedName : null,
          p_notes: trimmedNotes,
          p_update_name: shouldUpdateName,
          p_update_notes: shouldUpdateNotes,
        });

        if (updErr) {
          return jsonResponse(
            { success: false, message: 'Không thể cập nhật thông tin học sinh.', code: 'DB_ERROR' },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.STUDENT_UPDATED,
        });
      }

      if (action === 'archive-student') {
        const { data: bumpedRows, error: arcErr } = await adminClient.rpc('m2_archive_student', {
          p_student_id: id,
        });

        if (arcErr) {
          return jsonResponse(
            { success: false, message: 'Không thể lưu trữ học sinh.', code: 'DB_ERROR' },
            500
          );
        }

        const syncOk = await syncStudentBumpResult(adminClient, id, bumpedRows);

        if (!syncOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.STUDENT_STATUS_SYNC_PARTIAL,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.STUDENT_ARCHIVED,
        });
      }

      if (action === 'restore-student') {
        const { data: bumpedRows, error: resErr } = await adminClient.rpc('m2_restore_student', {
          p_student_id: id,
        });

        if (resErr) {
          return jsonResponse(
            { success: false, message: 'Không thể khôi phục học sinh.', code: 'DB_ERROR' },
            500
          );
        }

        const syncOk = await syncStudentBumpResult(adminClient, id, bumpedRows);

        if (!syncOk) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.STUDENT_STATUS_SYNC_PARTIAL,
              code: 'SESSION_SYNC_FAILED',
            },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.STUDENT_RESTORED,
        });
      }
    }

    // --------------------------------------------------------------------------
    // ACTION: pin-prepare (Canonical v2: Canonical class lock & reserved AuthUUIDs)
    // --------------------------------------------------------------------------
    if (action === 'pin-prepare') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { classId, studentId, mode } = payload as {
        classId?: string;
        studentId?: string;
        mode: 'batch_first_issue' | 'single_reissue';
      };

      if (mode === 'batch_first_issue' && !isValidUUID(classId)) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
          400
        );
      }

      if (mode === 'single_reissue' && !isValidUUID(studentId)) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { data: claimData, error: claimErr } = await adminClient.rpc('m2_claim_pin_operation', {
        p_admin_profile_id: actor.profileId,
        p_class_id: classId || null,
        p_student_id: studentId || null,
        p_op_type: mode,
        p_ttl_seconds: 300,
      });

      const claim = claimData?.[0];
      if (claimErr || !claim) {
        if (
          mode === 'batch_first_issue' &&
          claimErr?.message &&
          claimErr.message.trim() === 'No unissued active students in class'
        ) {
          return jsonResponse(
            {
              success: false,
              message: STATIC_MESSAGES.NO_UNISSUED_STUDENTS,
              code: 'NO_UNISSUED_STUDENTS',
            },
            200
          );
        }

        return jsonResponse(
          {
            success: false,
            message: STATIC_MESSAGES.OPERATION_LOCKED,
            code: 'OPERATION_LOCKED',
          },
          409
        );
      }

      return jsonResponse({
        success: true,
        data: {
          operationId: claim.operation_id,
          classCode: claim.class_code,
          students: claim.target_students,
        },
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: pin-commit (Canonical v2: Strict Set match, native id createUser)
    // --------------------------------------------------------------------------
    if (action === 'pin-commit') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { operationId, records } = payload as {
        operationId?: string;
        records?: Array<{ studentId: string; authUserId: string; authPassword: string }>;
      };

      if (!isValidUUID(operationId) || !Array.isArray(records) || records.length === 0) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
          400
        );
      }

      // 1. Inspect claim state first (without changing status)
      const { data: opData, error: opErr } = await adminClient.rpc('m2_get_pin_operation', {
        p_op_id: operationId,
        p_admin_profile_id: actor.profileId,
      });

      const op = opData?.[0];
      if (opErr || !op || op.valid !== true) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.PIN_OPERATION_EXPIRED, code: 'OPERATION_EXPIRED' },
          400
        );
      }

      const claimedTargets = Array.isArray(op.target_students) ? op.target_students : [];

      // 2. Validate commit records with domain production helper before changing claim status
      const validation = validatePinCommitRecords(records, claimedTargets);
      if (!validation.valid) {
        return jsonResponse(
          { success: false, message: validation.error || STATIC_MESSAGES.INVALID_PAYLOAD, code: validation.code || 'INVALID_PAYLOAD' },
          400
        );
      }

      // 3. Begin commit: transitions status to 'committing' and locks canonical class
      const submittedStudentIds = records.map((r) => r.studentId);
      const { data: beginData, error: beginErr } = await adminClient.rpc('m2_begin_pin_commit', {
        p_op_id: operationId,
        p_admin_profile_id: actor.profileId,
        p_submitted_student_ids: submittedStudentIds,
      });

      const beginResult = beginData?.[0];
      if (beginErr || !beginResult || beginResult.valid !== true) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.PIN_OPERATION_EXPIRED, code: 'OPERATION_EXPIRED' },
          400
        );
      }

      const targetMap = new Map<string, any>();
      for (const t of claimedTargets) {
        targetMap.set(t.studentId, t);
      }

      const createdAuthUserIds: string[] = [];
      const changedExistingTargets: Array<{ studentId: string; authUserId: string }> = [];
      const dbCommitRecords: Array<{ studentId: string; authUserId: string; authEmail: string; isNew: boolean }> = [];

      try {
        for (const rec of records) {
          const target = targetMap.get(rec.studentId);
          const isFirstIssue = (op.operation_type === 'batch_first_issue');

          if (isFirstIssue) {
            // Check if native Auth user already exists for target.authUserId (e.g. placeholder mapped from fixture seed)
            let existingAuth = false;
            let existingAppMeta: Record<string, any> = {};
            try {
              const { data: usrCheck } = await adminClient.auth.admin.getUserById(target.authUserId);
              if (usrCheck?.user) {
                existingAuth = true;
                existingAppMeta = usrCheck.user.app_metadata || {};
              }
            } catch {
              existingAuth = false;
            }

            if (existingAuth) {
              const { error: updErr } = await adminClient.auth.admin.updateUserById(target.authUserId, {
                password: rec.authPassword,
                email_confirm: true,
                app_metadata: {
                  ...existingAppMeta,
                  role: 'student',
                },
              });
              if (updErr) {
                throw new Error('Failed to update existing student Auth password');
              }
              // Track changed existing target only after checked update is successful
              changedExistingTargets.push({ studentId: rec.studentId, authUserId: target.authUserId });
            } else {
              const { data: newAuth, error: authErr } = await adminClient.auth.admin.createUser({
                id: target.authUserId,
                email: target.authEmail,
                password: rec.authPassword,
                email_confirm: true,
                user_metadata: { full_name: target.fullName },
                app_metadata: {
                  role: 'student',
                  m2_session_version: 1,
                },
              });

              if (authErr || !newAuth?.user) {
                throw new Error(authErr?.message || 'Failed to create student Auth account');
              }

              if (newAuth.user.id.toLowerCase() !== target.authUserId.toLowerCase()) {
                throw new Error('Created Auth ID does not match reserved ID');
              }

              createdAuthUserIds.push(newAuth.user.id);
            }

            dbCommitRecords.push({
              studentId: rec.studentId,
              authUserId: target.authUserId,
              authEmail: target.authEmail,
              isNew: true,
            });
          } else {
            // Reissue
            const { error: updErr } = await adminClient.auth.admin.updateUserById(target.authUserId, {
              password: rec.authPassword,
            });

            if (updErr) {
              throw new Error(updErr.message || 'Failed to update student Auth password');
            }

            // Track changed existing target only after checked update is successful
            changedExistingTargets.push({ studentId: rec.studentId, authUserId: target.authUserId });

            dbCommitRecords.push({
              studentId: rec.studentId,
              authUserId: target.authUserId,
              authEmail: target.authEmail,
              isNew: false,
            });
          }
        }

        // Finalize DB updates atomically via RPC
        const { data: finalizeData, error: finErr } = await adminClient.rpc('m2_finalize_pin_commit', {
          p_op_id: operationId,
          p_admin_profile_id: actor.profileId,
          p_records: dbCommitRecords,
        });

        const finalizeResult = finalizeData?.[0];
        if (finErr || !finalizeResult || finalizeResult.success !== true) {
          throw new Error('Failed to finalize DB commit');
        }

        // Post-finalizer: sync Auth metadata for any reissued/bumped students.
        // MUST CHECK RETURNED ERROR so no CSV/success if update failed!
        let metadataSyncFailed = false;
        if (Array.isArray(finalizeResult.reissued_auth_users)) {
          for (const reissued of finalizeResult.reissued_auth_users) {
            try {
              const { data: usrData, error: getErr } = await adminClient.auth.admin.getUserById(reissued.authUserId);
              if (getErr || !usrData?.user) {
                metadataSyncFailed = true;
                break;
              }
              const { error: updErr } = await adminClient.auth.admin.updateUserById(reissued.authUserId, {
                app_metadata: {
                  ...(usrData.user.app_metadata || {}),
                  role: 'student',
                  m2_session_version: reissued.sessionVersion,
                },
              });
              if (updErr) {
                metadataSyncFailed = true;
                break;
              }
            } catch {
              metadataSyncFailed = true;
              break;
            }
          }
        }

        if (metadataSyncFailed) {
          return jsonResponse(
            {
              success: false,
              message: 'Cấp mã PIN hoàn tất trên cơ sở dữ liệu nhưng đồng bộ phiên tài khoản thất bại. Vui lòng cấp lại riêng học sinh bị ảnh hưởng.',
              code: 'PIN_METADATA_SYNC_FAILED',
            },
            500
          );
        }

        return jsonResponse({
          success: true,
          message: STATIC_MESSAGES.PIN_COMMIT_SUCCESS,
        });
      } catch {
        // Scoped cleanup: delete only newly created Auth users in this batch (never delete existing users)
        let cleanupFailed = false;
        for (const uid of createdAuthUserIds) {
          try {
            const { error: delErr } = await adminClient.auth.admin.deleteUser(uid);
            if (delErr) {
              cleanupFailed = true;
            }
          } catch {
            cleanupFailed = true;
          }
        }

        // For each changed existing target: call m2_bump_profile_version checked result positive,
        // then checked Auth metadata update matching current DB version (preserve other trusted metadata)
        let recoveryFailed = cleanupFailed;
        if (changedExistingTargets.length > 0) {
          for (const item of changedExistingTargets) {
            try {
              // Restrict target student in pin-recovery caller
              const { data: stProf, error: stErr } = await adminClient
                .from('profiles')
                .select('role')
                .eq('id', item.studentId)
                .single();
              if (stErr || !stProf || stProf.role !== 'student') {
                recoveryFailed = true;
                continue;
              }

              const { data: bumpData, error: bumpErr } = await adminClient.rpc('m2_bump_profile_version', {
                p_profile_id: item.studentId,
              });
              const newVer = typeof bumpData === 'number' ? bumpData : Number(bumpData);
              if (bumpErr || !newVer || newVer <= 0 || isNaN(newVer)) {
                recoveryFailed = true;
                continue;
              }

              const { data: usrData, error: getErr } = await adminClient.auth.admin.getUserById(item.authUserId);
              if (getErr || !usrData?.user) {
                recoveryFailed = true;
                continue;
              }

              const existingAppMeta = usrData.user.app_metadata || {};
              const { error: updErr } = await adminClient.auth.admin.updateUserById(item.authUserId, {
                app_metadata: {
                  ...existingAppMeta,
                  role: 'student',
                  m2_session_version: newVer,
                },
              });
              if (updErr) {
                recoveryFailed = true;
              }
            } catch {
              recoveryFailed = true;
            }
          }
        }

        // Check m2_fail_pin_operation result
        try {
          const { error: failErr } = await adminClient.rpc('m2_fail_pin_operation', { p_op_id: operationId });
          if (failErr) {
            recoveryFailed = true;
          }
        } catch {
          recoveryFailed = true;
        }

        // Return truthful static response
        if (recoveryFailed) {
          return jsonResponse(
            {
              success: false,
              message: 'Cấp mã PIN thất bại và phát hiện lỗi khôi phục an toàn. Admin kiểm tra trạng thái lớp và liên hệ kỹ thuật để đồng bộ lại tài khoản.',
              code: 'PIN_RECOVERY_REQUIRED',
            },
            500
          );
        }

        if (changedExistingTargets.length > 0) {
          return jsonResponse(
            {
              success: false,
              message: 'Cấp PIN chưa hoàn tất; PIN cũ có thể đã mất hiệu lực. Admin kiểm tra lớp đang hoạt động rồi cấp lại riêng học sinh bị ảnh hưởng.',
              code: 'PIN_PARTIAL_UPDATE',
            },
            500
          );
        }

        return jsonResponse(
          {
            success: false,
            message: 'Cấp mã PIN thất bại. Hệ thống đã khôi phục trạng thái an toàn.',
            code: 'PIN_COMMIT_FAILED',
          },
          500
        );
      }
    }

    // --------------------------------------------------------------------------
    // ACTION: coordinator-seed-fixture (Test Harness / Sol Live Verification Only)
    // --------------------------------------------------------------------------
    if (action === 'coordinator-seed-fixture') {
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Coordinator seed chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }
      const fixtureLock = await coordinatorFixtureLock(adminClient);
      if (fixtureLock) return fixtureLock;

      const {
        fixtureType,
        fixtureRole = 'student',
        profileId,
        authUserId,
        authEmail,
        studentCode,
        classId,
        assignedClassIds,
        fullName,
        authPassword,
        testPassword,
        pinIssued = true,
        emailConfirm,
        confirmed,
      } = payload as {
        fixtureType?: string;
        fixtureRole?: Role;
        profileId?: string;
        authUserId?: string;
        authEmail?: string;
        studentCode?: string;
        classId?: string;
        assignedClassIds?: string[];
        fullName?: string;
        authPassword?: string;
        testPassword?: string;
        pinIssued?: boolean;
        emailConfirm?: boolean;
        confirmed?: boolean;
      };

      if (fixtureType !== 'qa-actor' && fixtureType !== 'qa-unmapped-staff') {
        return jsonResponse(
          { success: false, message: 'Loại fixture không được hỗ trợ.', code: 'INVALID_FIXTURE_TYPE' },
          400
        );
      }

      if (testPassword !== undefined) {
        return jsonResponse(
          { success: false, message: 'Sử dụng authPassword thay cho testPassword.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      if (fixtureType === 'qa-unmapped-staff') {
        if (
          !isValidUUID(profileId) ||
          !isValidUUID(authUserId) ||
          profileId.toLowerCase() === authUserId.toLowerCase() ||
          !authEmail ||
          !isValidEmail(authEmail) ||
          !authEmail.toLowerCase().endsWith('@example.invalid') ||
          !authPassword ||
          typeof authPassword !== 'string' ||
          authPassword.trim().length === 0 ||
          typeof fullName !== 'string' ||
          !fullName.startsWith('TEST')
        ) {
          return jsonResponse(
            { success: false, message: 'Dữ liệu qa-unmapped-staff không hợp lệ.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        if (fixtureRole !== 'teacher') {
          return jsonResponse(
            { success: false, message: 'Vai trò qa-unmapped-staff chỉ hỗ trợ teacher.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const isConfirmed = emailConfirm !== false && confirmed !== false;

        // Collision check: reject if auth user, profile, or mapping already exists
        const { data: existingProf } = await adminClient
          .from('profiles')
          .select('id')
          .eq('id', profileId)
          .maybeSingle();

        if (existingProf) {
          return jsonResponse(
            { success: false, message: 'Hồ sơ đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
            409
          );
        }

        const { data: existingMap } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
          p_auth_user_id: authUserId,
        });

        if (existingMap && existingMap.length > 0) {
          return jsonResponse(
            { success: false, message: 'Tài khoản Auth đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
            409
          );
        }

        const { data: existingUser } = await adminClient.auth.admin.getUserById(authUserId);
        if (existingUser?.user) {
          return jsonResponse(
            { success: false, message: 'Tài khoản Auth đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
            409
          );
        }

        // Create native Auth user ONLY, without app role grants, profile, or actor_auth mapping
        const { data: newAuth, error: authErr } = await adminClient.auth.admin.createUser({
          id: authUserId,
          email: authEmail.toLowerCase().trim(),
          password: authPassword,
          email_confirm: isConfirmed,
          user_metadata: { full_name: fullName.trim() },
        });

        if (authErr || !newAuth?.user) {
          if (
            authErr?.message?.toLowerCase().includes('already') ||
            authErr?.status === 422 ||
            (authErr as any)?.code === 'email_exists'
          ) {
            return jsonResponse(
              { success: false, message: 'Tài khoản Auth đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
              409
            );
          }
          return jsonResponse(
            { success: false, message: 'Không thể khởi tạo tài khoản xác thực kiểm thử.', code: 'AUTH_CREATE_FAILED' },
            500
          );
        }

        return jsonResponse({
          success: true,
          data: {
            profileId,
            authUserId,
          },
          message: 'Khởi tạo tài khoản QA unmapped staff thành công.',
        });
      }

      if (
        !isValidUUID(profileId) ||
        !isValidUUID(authUserId) ||
        profileId.toLowerCase() === authUserId.toLowerCase() ||
        !authEmail ||
        !isValidEmail(authEmail) ||
        !authEmail.toLowerCase().endsWith('@example.invalid') ||
        !authPassword ||
        typeof authPassword !== 'string' ||
        authPassword.trim().length === 0 ||
        typeof fullName !== 'string' ||
        !fullName.startsWith('TEST')
      ) {
        return jsonResponse(
          { success: false, message: 'Dữ liệu qa-actor không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      if (!['admin', 'teacher', 'student'].includes(fixtureRole)) {
        return jsonResponse(
          { success: false, message: 'Vai trò qa-actor không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      if (fixtureRole === 'student') {
        if (!studentCode || typeof studentCode !== 'string' || !studentCode.toUpperCase().startsWith('TEST_M2QA')) {
          return jsonResponse(
            { success: false, message: 'Mã học sinh qa-actor phải có tiền tố TEST_M2QA.', code: 'INVALID_PAYLOAD' },
            400
          );
        }
      }

      if (classId) {
        if (!isValidUUID(classId)) {
          return jsonResponse(
            { success: false, message: 'classId không hợp lệ.', code: 'INVALID_PAYLOAD' },
            400
          );
        }
        const { data: cls } = await adminClient
          .from('classes')
          .select('id, code, is_fixture')
          .eq('id', classId)
          .maybeSingle();

        if (
          !cls ||
          !cls.is_fixture ||
          (!cls.code.startsWith('TEST_M2QA_') && !['ROB-K14-01', 'ROB-K14-02', 'ROB-K14-03'].includes(cls.code))
        ) {
          return jsonResponse(
            { success: false, message: 'Lớp học mục tiêu không thuộc danh sách fixture hợp lệ.', code: 'INVALID_PAYLOAD' },
            400
          );
        }
      }

      if (Array.isArray(assignedClassIds) && assignedClassIds.length > 0) {
        for (const cid of assignedClassIds) {
          if (!isValidUUID(cid)) {
            return jsonResponse(
              { success: false, message: 'assignedClassIds chứa ID không hợp lệ.', code: 'INVALID_PAYLOAD' },
              400
            );
          }
          const { data: cls } = await adminClient
            .from('classes')
            .select('id, code, is_fixture')
            .eq('id', cid)
            .maybeSingle();

          if (
            !cls ||
            !cls.is_fixture ||
            (!cls.code.startsWith('TEST_M2QA_') && !['ROB-K14-01', 'ROB-K14-02', 'ROB-K14-03'].includes(cls.code))
          ) {
            return jsonResponse(
              { success: false, message: 'Lớp học phân công không thuộc danh sách fixture hợp lệ.', code: 'INVALID_PAYLOAD' },
              400
            );
          }
        }
      }

      // Check collision before creating Auth user: NO upserts replacing Owner/existing profiles
      const { data: existingProf } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .maybeSingle();

      if (existingProf) {
        return jsonResponse(
          { success: false, message: 'Hồ sơ đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
          409
        );
      }

      const { data: existingMap } = await adminClient.rpc('m2_get_actor_auth_by_auth_id', {
        p_auth_user_id: authUserId,
      });

      if (existingMap && existingMap.length > 0) {
        return jsonResponse(
          { success: false, message: 'Tài khoản Auth đã tồn tại: từ chối xung đột.', code: 'COLLISION_REJECTED' },
          409
        );
      }

      // Create native Auth user with specified UUID
      const { data: newAuth, error: authErr } = await adminClient.auth.admin.createUser({
        id: authUserId,
        email: authEmail.toLowerCase().trim(),
        password: authPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: {
          role: fixtureRole,
          m2_session_version: 1,
        },
      });

      if (authErr || !newAuth?.user) {
        return jsonResponse(
          { success: false, message: 'Không thể khởi tạo tài khoản xác thực kiểm thử.', code: 'AUTH_CREATE_FAILED' },
          500
        );
      }

      // Call m2_seed_qa_actor RPC with forwarded pinIssued boolean
      const { data: seedSuccess, error: seedErr } = await adminClient.rpc('m2_seed_qa_actor', {
        p_auth_user_id: authUserId,
        p_profile_id: profileId,
        p_role: fixtureRole,
        p_auth_email: authEmail.toLowerCase().trim(),
        p_full_name: fullName,
        p_student_code: studentCode || null,
        p_class_id: classId || null,
        p_assigned_class_ids: assignedClassIds || null,
        p_pin_issued: pinIssued !== false,
      });

      if (seedErr || seedSuccess !== true) {
        // Rollback only Auth user created by that invocation!
        try {
          await adminClient.auth.admin.deleteUser(authUserId);
        } catch {
          // ignore
        }
        return jsonResponse(
          { success: false, message: 'Không thể khởi tạo dữ liệu hồ sơ kiểm thử.', code: 'SEED_FAILED' },
          500
        );
      }

      return jsonResponse({
        success: true,
        data: {
          profileId,
          authUserId,
        },
        message: 'Khởi tạo tài khoản QA thành công.',
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: coordinator-cleanup-m6-qa (Test Harness / M6 Load Test Cleanup Only)
    // --------------------------------------------------------------------------
    if (action === 'coordinator-cleanup-m6-qa') {
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Coordinator cleanup M6 chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }
      const fixtureLock = await coordinatorFixtureLock(adminClient);
      if (fixtureLock) return fixtureLock;

      const {
        profileIds = [],
        authUserIds = [],
        clearRateLimitHashes = [],
      } = payload as {
        profileIds?: string[];
        authUserIds?: string[];
        clearRateLimitHashes?: string[];
      };

      const m6ProfileRegex = /^00000000-0000-4000-8000-00000006(01[0-9]{2}|1[0-9]{3})$/i;
      const m6AuthRegex = /^00000000-0000-4000-8000-00000006(02[0-9]{2}|2[0-9]{3})$/i;

      const validProfileIds = Array.isArray(profileIds)
        ? profileIds.filter((id) => typeof id === 'string' && m6ProfileRegex.test(id))
        : [];
      const validAuthIds = Array.isArray(authUserIds)
        ? authUserIds.filter((id) => typeof id === 'string' && m6AuthRegex.test(id))
        : [];

      const cleanupErrors: string[] = [];
      let cleanedStoragePathsCount = 0;
      let cleanedAuthUsersCount = 0;

      if (validProfileIds.length > 0) {
        const { data: subs, error: subsReadErr } = await adminClient
          .from('practice_submissions')
          .select('id, type, content')
          .in('student_id', validProfileIds);
        if (subsReadErr) {
          cleanupErrors.push(`practice_submissions.select: ${subsReadErr.message || 'error'}`);
        }

        const { data: resvs, error: resvsReadErr } = await adminClient
          .from('m3_upload_reservations')
          .select('id, object_path')
          .in('student_id', validProfileIds);
        if (resvsReadErr) {
          cleanupErrors.push(`m3_upload_reservations.select: ${resvsReadErr.message || 'error'}`);
        }

        const storagePaths = Array.from(
          new Set([
            ...((subs || [])
              .filter((s: any) => s.type === 'file' && typeof s.content === 'string' && s.content.trim())
              .map((s: any) => s.content.trim())),
            ...((resvs || [])
              .filter((r: any) => typeof r.object_path === 'string' && r.object_path.trim())
              .map((r: any) => r.object_path.trim())),
          ])
        );
        if (storagePaths.length > 0) {
          const { error: rmErr } = await adminClient.storage.from('m3-practice-files').remove(storagePaths);
          if (rmErr) {
            cleanupErrors.push(`storage.remove: ${rmErr.message || 'error'}`);
          } else {
            cleanedStoragePathsCount = storagePaths.length;
          }
        }

        // Note: private.actor_auth has ON DELETE CASCADE from public.profiles(id) and auth.users(id).
        const deleteSteps: Array<[string, PromiseLike<{ error: any }>]> = [
          ['practice_submissions', adminClient.from('practice_submissions').delete().in('student_id', validProfileIds)],
          ['quiz_results', adminClient.from('quiz_results').delete().in('student_id', validProfileIds)],
          ['m3_upload_reservations', adminClient.from('m3_upload_reservations').delete().in('student_id', validProfileIds)],
          ['students', adminClient.from('students').delete().in('id', validProfileIds)],
          ['profiles', adminClient.from('profiles').delete().in('id', validProfileIds)],
        ];

        for (const [tableName, stepPromise] of deleteSteps) {
          try {
            const { error: delErr } = await stepPromise;
            if (delErr) {
              cleanupErrors.push(`${tableName}.delete: ${delErr.message || 'error'}`);
            }
          } catch (err: any) {
            cleanupErrors.push(`${tableName}.delete: ${err?.message || 'exception'}`);
          }
        }
      }

      if (validAuthIds.length > 0) {
        // Note: private.login_challenges has ON DELETE CASCADE from auth.users(id).
        // Delete Auth users in bounded batches of 10 to avoid overwhelming GoTrue
        for (let i = 0; i < validAuthIds.length; i += 10) {
          const batchIds = validAuthIds.slice(i, i + 10);
          await Promise.all(
            batchIds.map(async (uid) => {
              try {
                const delRes = await adminClient.auth.admin.deleteUser(uid);
                const delErr = (delRes as any)?.error;
                if (delErr) {
                  const status = Number(delErr.status || 0);
                  const msg = String(delErr.message || '').toLowerCase();
                  if (status !== 404 && !msg.includes('not found')) {
                    cleanupErrors.push(`auth.deleteUser(${uid}): ${delErr.message || 'error'}`);
                    return;
                  }
                }
                cleanedAuthUsersCount++;
              } catch (err: any) {
                const msg = String(err?.message || '').toLowerCase();
                if (!msg.includes('not found')) {
                  cleanupErrors.push(`auth.deleteUser(${uid}): ${err?.message || 'exception'}`);
                } else {
                  cleanedAuthUsersCount++;
                }
              }
            })
          );
        }
      }

      let remainingTargetRows = 0;
      if (validProfileIds.length > 0) {
        const [remProf, remStu, remSub, remResv, remQuiz] = await Promise.all([
          adminClient.from('profiles').select('id', { count: 'exact', head: true }).in('id', validProfileIds),
          adminClient.from('students').select('id', { count: 'exact', head: true }).in('id', validProfileIds),
          adminClient
            .from('practice_submissions')
            .select('id', { count: 'exact', head: true })
            .in('student_id', validProfileIds),
          adminClient
            .from('m3_upload_reservations')
            .select('id', { count: 'exact', head: true })
            .in('student_id', validProfileIds),
          adminClient.from('quiz_results').select('id', { count: 'exact', head: true }).in('student_id', validProfileIds),
        ]);
        for (const [label, r] of [
          ['profiles.verify', remProf],
          ['students.verify', remStu],
          ['practice_submissions.verify', remSub],
          ['m3_upload_reservations.verify', remResv],
          ['quiz_results.verify', remQuiz],
        ] as const) {
          if (r.error) {
            cleanupErrors.push(`${label}: ${r.error.message || 'error'}`);
          } else {
            remainingTargetRows += Number(r.count || 0);
          }
        }
      }

      const [clsRes, stuRes, profRes, subRes, resvRes] = await Promise.all([
        adminClient.from('classes').select('id', { count: 'exact', head: true }),
        adminClient.from('students').select('id', { count: 'exact', head: true }),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }),
        adminClient.from('practice_submissions').select('id', { count: 'exact', head: true }),
        adminClient.from('m3_upload_reservations').select('id', { count: 'exact', head: true }),
      ]);

      for (const [label, r] of [
        ['classes.count', clsRes],
        ['students.count', stuRes],
        ['profiles.count', profRes],
        ['practice_submissions.count', subRes],
        ['m3_upload_reservations.count', resvRes],
      ] as const) {
        if (r.error) {
          cleanupErrors.push(`${label}: ${r.error.message || 'error'}`);
        }
      }

      const postCleanupCounts = {
        classes: clsRes.count ?? 0,
        students: stuRes.count ?? 0,
        profiles: profRes.count ?? 0,
        practice_submissions: subRes.count ?? 0,
        m3_upload_reservations: resvRes.count ?? 0,
      };

      if (cleanupErrors.length > 0 || remainingTargetRows > 0) {
        return jsonResponse(
          {
            success: false,
            code: 'CLEANUP_INCOMPLETE',
            errors: cleanupErrors,
            data: {
              cleanedProfilesCount: Math.max(0, validProfileIds.length - remainingTargetRows),
              cleanedAuthUsersCount,
              cleanedStoragePathsCount,
              remainingTargetRows,
              postCleanupCounts,
            },
            message: 'Chưa dọn sạch hoàn toàn dữ liệu kiểm thử tải Mốc 6 trên TEST.',
          },
          500
        );
      }

      return jsonResponse({
        success: true,
        data: {
          cleanedProfilesCount: validProfileIds.length,
          cleanedAuthUsersCount,
          cleanedStoragePathsCount,
          remainingTargetRows: 0,
          postCleanupCounts,
        },
        message: 'Đã dọn sạch dữ liệu kiểm thử tải Mốc 6 trên TEST.',
      });
    }

    // --------------------------------------------------------------------------
    // ACTION: coordinator-storage-fixture (Test Harness / Sol Live Verification Only)
    // --------------------------------------------------------------------------
    if (action === 'coordinator-storage-fixture') {
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Coordinator storage fixture chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }
      const fixtureLock = await coordinatorFixtureLock(adminClient);
      if (fixtureLock) return fixtureLock;

      // Generate random path within m2qa prefix: m2qa/<UUID>.txt
      const fileUuid = crypto.randomUUID();
      const storagePath = `m2qa/${fileUuid}.txt`;
      const fixedContent = `M2 QA Storage Fixture Verification Object [${fileUuid}]`;
      const contentBytes = new TextEncoder().encode(fixedContent);
      const sha256 = await computeSha256Hex(fixedContent);

      // Upload to private bucket 'm2-private-fixture' with upsert: false
      const { data: uploadData, error: uploadErr } = await adminClient.storage
        .from('m2-private-fixture')
        .upload(storagePath, contentBytes, {
          contentType: 'text/plain; charset=utf-8',
          upsert: false,
        });

      if (uploadErr || !uploadData) {
        return jsonResponse(
          { success: false, message: 'Không thể tạo đối tượng lưu trữ kiểm thử.', code: 'STORAGE_UPLOAD_FAILED' },
          500
        );
      }

      return jsonResponse({
        success: true,
        data: {
          path: storagePath,
          bucket: 'm2-private-fixture',
          sha256,
        },
        message: 'Khởi tạo đối tượng lưu trữ kiểm thử thành công.',
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTIONS: create-course, update-course, update-lesson (Admin only)
    // --------------------------------------------------------------------------
    if (action === 'create-course') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { title, description } = payload as { title?: string; description?: string };
      if (!title || typeof title !== 'string' || !title.trim()) {
        return jsonResponse(
          { success: false, message: 'Tiêu đề khóa học không được để trống.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { data: newCourseData, error: courseErr } = await adminClient.rpc('m3_create_course', {
        p_admin_profile_id: actor.profileId,
        p_title: title.trim(),
        p_description: description ? String(description).trim() : '',
      });

      if (courseErr || !newCourseData || newCourseData.length === 0) {
        return jsonResponse(
          { success: false, message: courseErr?.message || 'Không thể tạo khóa học.', code: 'DB_ERROR' },
          400
        );
      }

      const created = newCourseData[0];
      return jsonResponse({
        success: true,
        data: {
          id: created.id,
          title: created.title,
          description: created.description,
          totalSessions: created.total_sessions || 14,
          createdAt: created.created_at,
        },
        message: STATIC_MESSAGES.COURSE_CREATED,
      });
    }

    if (action === 'update-course') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { id, title, description } = payload as { id?: string; title?: string; description?: string };
      if (!isValidUUID(id) || !title || typeof title !== 'string' || !title.trim()) {
        return jsonResponse(
          { success: false, message: 'Dữ liệu khóa học không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { error: updErr } = await adminClient.rpc('m3_update_course', {
        p_admin_profile_id: actor.profileId,
        p_course_id: id,
        p_title: title.trim(),
        p_description: description ? String(description).trim() : '',
      });

      if (updErr) {
        return jsonResponse(
          { success: false, message: updErr.message || 'Không thể cập nhật khóa học.', code: 'DB_ERROR' },
          400
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.COURSE_UPDATED,
      });
    }

    if (action === 'update-lesson') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { id, data: lessonData } = payload as { id?: string; data?: any };
      if (!isValidUUID(id) || !lessonData || typeof lessonData !== 'object') {
        return jsonResponse(
          { success: false, message: 'Dữ liệu bài học không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const title = lessonData.title ? String(lessonData.title).trim() : '';
      if (!title) {
        return jsonResponse(
          { success: false, message: 'Tiêu đề bài học không được để trống.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const status = lessonData.status === 'published' ? 'published' : 'draft';
      const hasQuiz = Boolean(lessonData.hasQuiz);
      const hasPractice = Boolean(lessonData.hasPractice);

      // Enforce publish rule: cannot publish theory-only lesson
      if (status === 'published' && !hasQuiz && !hasPractice) {
        return jsonResponse(
          {
            success: false,
            message: STATIC_MESSAGES.CANNOT_PUBLISH_THEORY_ONLY,
            code: 'CANNOT_PUBLISH_THEORY_ONLY',
          },
          400
        );
      }

      const practiceMode = lessonData.practiceMode === 'file_allowed' ? 'file_allowed' : 'link_only';

      const { error: updErr } = await adminClient.rpc('m3_update_lesson', {
        p_admin_profile_id: actor.profileId,
        p_lesson_id: id,
        p_title: title,
        p_description: lessonData.description ? String(lessonData.description) : '',
        p_materials: lessonData.materials ? String(lessonData.materials) : '',
        p_video_url: lessonData.videoUrl ? String(lessonData.videoUrl) : '',
        p_status: status,
        p_has_quiz: hasQuiz,
        p_has_practice: hasPractice,
        p_practice_mode: practiceMode,
        p_questions: Array.isArray(lessonData.questions) ? lessonData.questions : [],
      });

      if (updErr) {
        return jsonResponse(
          { success: false, message: updErr.message || 'Không thể cập nhật bài học.', code: 'DB_ERROR' },
          400
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.LESSON_UPDATED,
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: submit-quiz (Student only, server-side grading)
    // --------------------------------------------------------------------------
    if (action === 'submit-quiz') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'student') {
        return jsonResponse(
          { success: false, message: 'Thao tác chỉ dành cho Học sinh.', code: 'FORBIDDEN' },
          403
        );
      }

      const { lessonId, answers } = payload as { lessonId?: string; answers?: number[] };
      if (!isValidUUID(lessonId) || !Array.isArray(answers)) {
        return jsonResponse(
          { success: false, message: 'Dữ liệu nộp bài trắc nghiệm không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { data: quizRes, error: quizErr } = await adminClient.rpc('m3_submit_quiz_attempt', {
        p_student_profile_id: actor.profileId,
        p_lesson_id: lessonId,
        p_answers: answers,
      });

      if (quizErr || !quizRes || quizRes.length === 0) {
        return jsonResponse(
          { success: false, message: quizErr?.message || 'Không thể nộp bài trắc nghiệm.', code: 'QUIZ_SUBMIT_FAILED' },
          400
        );
      }

      const res = quizRes[0];
      return jsonResponse({
        success: true,
        score: res.score,
        passed: res.passed,
        highestScore: res.highest_score,
        attemptsCount: res.attempts_count,
        data: {
          score: res.score,
          passed: res.passed,
          highestScore: res.highest_score,
          attemptsCount: res.attempts_count,
        },
        message: res.passed
          ? 'Chúc mừng! Bạn đã đạt bài trắc nghiệm.'
          : 'Bạn chưa đạt ngưỡng 70%. Bạn có thể làm lại bài không giới hạn số lần.',
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: submit-practice (Student only)
    // --------------------------------------------------------------------------
    if (action === 'submit-practice') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'student') {
        return jsonResponse(
          { success: false, message: 'Thao tác chỉ dành cho Học sinh.', code: 'FORBIDDEN' },
          403
        );
      }

      const { lessonId, type, content, notes, fileSizeBytes } = payload as {
        lessonId?: string;
        type?: string;
        content?: string;
        notes?: string;
        fileSizeBytes?: number;
      };

      if (!isValidUUID(lessonId) || !content || typeof content !== 'string' || !content.trim()) {
        return jsonResponse(
          { success: false, message: 'Dữ liệu bài nộp thực hành không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const cleanType = type === 'file' ? 'file' : type === 'text' ? 'text' : 'link';

      if (cleanType === 'link') {
        const trimmed = content.trim();
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          return jsonResponse(
            { success: false, message: 'Đường dẫn bài nộp phải có scheme http:// hoặc https://.', code: 'INVALID_LINK_SCHEME' },
            400
          );
        }
      }

      if (cleanType === 'file' && typeof fileSizeBytes === 'number' && fileSizeBytes > 2097152) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.FILE_TOO_LARGE, code: 'FILE_TOO_LARGE' },
          400
        );
      }

      const { data: subData, error: subErr } = await adminClient.rpc('m3_submit_practice', {
        p_student_profile_id: actor.profileId,
        p_lesson_id: lessonId,
        p_type: cleanType,
        p_content: content.trim(),
        p_file_size_bytes: typeof fileSizeBytes === 'number' ? fileSizeBytes : null,
        p_notes: notes ? String(notes).trim() : '',
      });

      if (subErr || !subData || subData.length === 0) {
        const msg = subErr?.message || 'Không thể nộp bài thực hành.';
        let code = 'DB_ERROR';
        if (msg.includes('CANNOT_RESUBMIT_APPROVED')) code = 'CANNOT_RESUBMIT_APPROVED';
        else if (msg.includes('INVALID_RESERVATION')) code = 'INVALID_RESERVATION';
        else if (msg.includes('PENDING_UPLOAD_CAP_EXCEEDED')) code = 'PENDING_UPLOAD_CAP_EXCEEDED';
        else if (msg.includes('FILE_NOT_FOUND')) code = 'FILE_NOT_FOUND';
        else if (msg.includes('FILE_TOO_LARGE')) code = 'FILE_TOO_LARGE';
        else if (msg.includes('INVALID_FILE_PATH')) code = 'INVALID_FILE_PATH';
        else if (msg.includes('INVALID_FILE_TYPE')) code = 'INVALID_FILE_TYPE';
        else if (msg.includes('INVALID_LINK_SCHEME')) code = 'INVALID_LINK_SCHEME';
        else if (msg.includes('DUPLICATE_FILE')) code = 'DUPLICATE_FILE';
        else if (msg.includes('FORBIDDEN')) code = 'FORBIDDEN';
        return jsonResponse({ success: false, message: msg, code }, 400);
      }

      // If resubmitting with a replacement file, clean up old file via Storage API only if unreferenced
      const oldFilePath = (subData[0] as any)?.old_file_path;
      if (oldFilePath && typeof oldFilePath === 'string') {
        try {
          const { data: refRows } = await adminClient
            .from('practice_submissions')
            .select('id')
            .eq('content', oldFilePath)
            .limit(1);
          if (!refRows || refRows.length === 0) {
            await adminClient.storage.from('m3-practice-files').remove([oldFilePath]);
          }
        } catch {
          // Non-fatal background storage cleanup catch
        }
      }

      return jsonResponse({
        success: true,
        data: subData[0],
        message: STATIC_MESSAGES.PRACTICE_SUBMITTED,
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: grade-submission (Teacher or Admin)
    // --------------------------------------------------------------------------
    if (action === 'grade-submission') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'teacher' && actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: 'Chỉ Giáo viên hoặc Quản trị viên mới có quyền chấm bài.', code: 'FORBIDDEN' },
          403
        );
      }

      const { submissionId, status, feedback } = payload as {
        submissionId?: string;
        status?: string;
        feedback?: string;
      };

      if (!isValidUUID(submissionId) || !status || !['approved', 'needs_revision'].includes(status)) {
        return jsonResponse(
          { success: false, message: 'Dữ liệu chấm bài không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { data: gradeData, error: gradeErr } = await adminClient.rpc('m3_grade_submission', {
        p_actor_profile_id: actor.profileId,
        p_submission_id: submissionId,
        p_status: status,
        p_feedback: feedback ? String(feedback).trim() : '',
      });

      if (gradeErr || !gradeData || gradeData.length === 0) {
        return jsonResponse(
          { success: false, message: gradeErr?.message || 'Không thể lưu kết quả chấm bài.', code: 'GRADE_FAILED' },
          400
        );
      }

      return jsonResponse({
        success: true,
        data: gradeData[0],
        message: STATIC_MESSAGES.SUBMISSION_GRADED,
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: reopen-submission (Teacher or Admin)
    // --------------------------------------------------------------------------
    if (action === 'reopen-submission') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'teacher' && actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: 'Chỉ Giáo viên hoặc Quản trị viên mới có quyền mở lại bài nộp.', code: 'FORBIDDEN' },
          403
        );
      }

      const { submissionId } = payload as { submissionId?: string };
      if (!isValidUUID(submissionId)) {
        return jsonResponse(
          { success: false, message: 'Mã bài nộp không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { data: reopenData, error: reopenErr } = await adminClient.rpc('m3_reopen_submission', {
        p_actor_profile_id: actor.profileId,
        p_submission_id: submissionId,
      });

      if (reopenErr || !reopenData || reopenData.length === 0) {
        return jsonResponse(
          { success: false, message: reopenErr?.message || 'Không thể mở lại quyền nộp bài.', code: 'REOPEN_FAILED' },
          400
        );
      }

      return jsonResponse({
        success: true,
        data: reopenData[0],
        message: STATIC_MESSAGES.SUBMISSION_REOPENED,
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: transfer-student (Admin only)
    // --------------------------------------------------------------------------
    if (action === 'transfer-student') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { studentId, targetClassId } = payload as { studentId?: string; targetClassId?: string };
      if (!isValidUUID(studentId) || !isValidUUID(targetClassId)) {
        return jsonResponse(
          { success: false, message: 'Mã học sinh hoặc lớp đích không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { error: transferErr } = await adminClient.rpc('m3_transfer_student', {
        p_admin_profile_id: actor.profileId,
        p_student_id: studentId,
        p_target_class_id: targetClassId,
      });

      if (transferErr) {
        return jsonResponse(
          { success: false, message: transferErr.message || 'Không thể chuyển lớp học sinh.', code: 'TRANSFER_FAILED' },
          400
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.STUDENT_TRANSFERRED,
      });
    }

    // --------------------------------------------------------------------------
    // M3 ACTION: reset-student-progress (Admin only)
    // --------------------------------------------------------------------------
    if (action === 'reset-student-progress') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }

      const { studentId } = payload as { studentId?: string };
      if (!isValidUUID(studentId)) {
        return jsonResponse(
          { success: false, message: 'Mã học sinh không hợp lệ.', code: 'INVALID_PAYLOAD' },
          400
        );
      }

      const { error: resetErr } = await adminClient.rpc('m3_reset_student_progress', {
        p_admin_profile_id: actor.profileId,
        p_student_id: studentId,
      });

      if (resetErr) {
        return jsonResponse(
          { success: false, message: resetErr.message || 'Không thể đặt lại kết quả học tập.', code: 'RESET_FAILED' },
          400
        );
      }

      return jsonResponse({
        success: true,
        message: STATIC_MESSAGES.PROGRESS_RESET,
      });
    }

    // --------------------------------------------------------------------------
    // M4 ACTIONS: apply-teaching-sync & reset-teaching-sync (Admin only, TEST only)
    // --------------------------------------------------------------------------
    if (action === 'apply-teaching-sync') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }
      const rawReport = (payload as any)?.diffReport && typeof (payload as any).diffReport === 'object'
        ? (payload as any).diffReport
        : payload;

      if (!rawReport || typeof rawReport !== 'object') {
        return jsonResponse(
          { success: false, message: 'Báo cáo xem trước đồng bộ không hợp lệ.', code: 'INVALID_DIFF_REPORT' },
          400
        );
      }

      const isRealTeachingSync = rawReport.sourceMode === 'real_teaching_sync';
      if (rawReport.sourceMode !== 'synthetic_fixture' && !isRealTeachingSync) {
        return jsonResponse(
          {
            success: false,
            message: 'Chốt chặn an toàn Mốc 4: Chỉ chấp nhận báo cáo xem trước có sourceMode="synthetic_fixture" hoặc "real_teaching_sync". Tuyệt đối không áp dụng danh sách học sinh Teaching thật vào TEST.',
            code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
          },
          403
        );
      }

      if (!isRealTeachingSync && !isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Thao tác đồng bộ fixture Mốc 4 chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }

      const normClassCode = (val: unknown) =>
        String(val || '').trim().replace(/\s+/g, ' ').toUpperCase();
      const normText = (val: unknown) =>
        String(val || '').trim().replace(/\s+/g, ' ');

      if (isRealTeachingSync) {
        const newClassesList = Array.isArray(rawReport.newClassesToCreate) ? rawReport.newClassesToCreate : [];
        for (const cls of newClassesList) {
          const cCode = normClassCode(cls?.code);
          const rawName = typeof cls?.name === 'string' ? normText(cls.name) : '';
          const expectedClassName = `Lớp Robotics ${cCode} (Mới đồng bộ — Chờ Admin gán khóa học)`;
          if (!cCode || !/rob/i.test(cCode) || (rawName && rawName !== expectedClassName)) {
            return jsonResponse(
              {
                success: false,
                message: `Mã lớp hoặc tên lớp "${cCode || ''}" không hợp lệ (chỉ chấp nhận lớp có mã ROB).`,
                code: 'INVALID_DIFF_REPORT',
              },
              400
            );
          }
        }

        const updatedList = Array.isArray(rawReport.updated) ? rawReport.updated : [];
        for (const upd of updatedList) {
          const code = normText(upd?.id).toUpperCase();
          const nextName = normText(upd?.name);
          const prevName = typeof upd?.previousName === 'string' ? normText(upd.previousName) : '';
          const classCode = normClassCode(upd?.classCode);
          const prevClassCode = normClassCode(upd?.previousClassCode);
          if (!code || !nextName || !prevName || !classCode || !prevClassCode || classCode !== prevClassCode || !/rob/i.test(classCode)) {
            return jsonResponse(
              {
                success: false,
                message:
                  'Báo cáo xem trước thiếu thông tin đối chiếu bắt buộc (id, name, previousName, classCode, previousClassCode) hoặc lớp không thuộc diện ROB.',
                code: 'INVALID_DIFF_REPORT',
              },
              400
            );
          }
        }

        const addedList = Array.isArray(rawReport.added) ? rawReport.added : [];
        for (const add of addedList) {
          const code = normText(add?.id).toUpperCase();
          const name = normText(add?.name);
          const classCode = normClassCode(add?.classCode);
          if (!code || !name || !classCode || !/rob/i.test(classCode)) {
            return jsonResponse(
              {
                success: false,
                message: 'Báo cáo xem trước thiếu thông tin bắt buộc ở mục thêm mới (id, name, classCode ROB).',
                code: 'INVALID_DIFF_REPORT',
              },
              400
            );
          }
        }
      } else {
        const canonicalClasses = new Set([
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
        const canonicalStudents = new Map<string, { name: string; classCode: string; previousName?: string }>([
          ['HS_ROB_002', { name: 'Phạm Quỳnh Chi (Đồng bộ M4)', previousName: 'Phạm Quỳnh Chi', classCode: 'ROB-K14-01' }],
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

        const newClassesList = Array.isArray(rawReport.newClassesToCreate) ? rawReport.newClassesToCreate : [];
        for (const cls of newClassesList) {
          const cCode = normClassCode(cls?.code);
          const rawName = typeof cls?.name === 'string' ? normText(cls.name) : '';
          const expectedClassName = `Lớp Robotics ${cCode} (Mới đồng bộ — Chờ Admin gán khóa học)`;
          if (!cCode || !canonicalClasses.has(cCode) || (rawName && rawName !== expectedClassName)) {
            return jsonResponse(
              {
                success: false,
                message: `Chốt chặn an toàn Mốc 4: Mã lớp hoặc tên lớp "${cCode || ''}" không nằm trong bộ fixture mẫu Mốc 4 đã phê duyệt. Từ chối ghi vào TEST.`,
                code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
              },
              403
            );
          }
        }

        const updatedList = Array.isArray(rawReport.updated) ? rawReport.updated : [];
        for (const upd of updatedList) {
          const code = normText(upd?.id).toUpperCase();
          const nextName = normText(upd?.name);
          const prevName = typeof upd?.previousName === 'string' ? normText(upd.previousName) : '';
          const classCode = normClassCode(upd?.classCode);
          const prevClassCode = normClassCode(upd?.previousClassCode);
          if (!code || !nextName || !prevName || !classCode || !prevClassCode) {
            return jsonResponse(
              {
                success: false,
                message:
                  'Báo cáo xem trước thiếu thông tin đối chiếu bắt buộc (id, name, previousName, classCode, previousClassCode).',
                code: 'INVALID_DIFF_REPORT',
              },
              400
            );
          }
          const canonical = canonicalStudents.get(code);
          if (
            !canonical ||
            !canonical.previousName ||
            canonical.name !== nextName ||
            canonical.previousName !== prevName ||
            canonical.classCode !== classCode ||
            canonical.classCode !== prevClassCode
          ) {
            return jsonResponse(
              {
                success: false,
                message: `Chốt chặn an toàn Mốc 4: Bản ghi cập nhật "${code}" không khớp bộ fixture mẫu Mốc 4 đã phê duyệt. Tuyệt đối không ghi dữ liệu ngoài mẫu vào TEST.`,
                code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
              },
              403
            );
          }
        }

        const addedList = Array.isArray(rawReport.added) ? rawReport.added : [];
        for (const add of addedList) {
          const code = normText(add?.id).toUpperCase();
          const name = normText(add?.name);
          const classCode = normClassCode(add?.classCode);
          if (!code || !name || !classCode) {
            return jsonResponse(
              {
                success: false,
                message: 'Báo cáo xem trước thiếu thông tin bắt buộc ở mục thêm mới (id, name, classCode).',
                code: 'INVALID_DIFF_REPORT',
              },
              400
            );
          }
          const canonical = canonicalStudents.get(code);
          if (!canonical || canonical.previousName || canonical.name !== name || canonical.classCode !== classCode) {
            return jsonResponse(
              {
                success: false,
                message: `Chốt chặn an toàn Mốc 4: Bản ghi thêm mới "${code}" không nằm trong bộ fixture mẫu Mốc 4 đã phê duyệt. Tuyệt đối không ghi danh sách học sinh thật hoặc dữ liệu tùy ý vào TEST.`,
                code: 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4',
              },
              403
            );
          }
        }
      }

      const { data: syncData, error: syncErr } = await adminClient.rpc('m4_apply_teaching_sync', {
        p_admin_profile_id: actor.profileId,
        p_diff_report: rawReport,
      });

      const syncRow = Array.isArray(syncData) ? syncData[0] : syncData;
      if (syncErr || !syncRow) {
        const errMsg = syncErr?.message || 'Không thể lưu kết quả đồng bộ vào hệ thống.';
        let code = 'DB_ERROR';
        let status = 500;
        if (errMsg.includes('REAL_ROSTER_APPLY_FORBIDDEN_IN_M4')) {
          code = 'REAL_ROSTER_APPLY_FORBIDDEN_IN_M4';
          status = 403;
        } else if (errMsg.includes('SYNTHETIC_FIXTURE_FORBIDDEN_IN_PROD') || errMsg.includes('PRODUCTION_ENVIRONMENT_LOCKED')) {
          code = 'PRODUCTION_ENVIRONMENT_LOCKED';
          status = 403;
        } else if (errMsg.includes('FORBIDDEN')) {
          code = 'FORBIDDEN';
          status = 403;
        } else if (errMsg.includes('INVALID_DIFF_REPORT')) {
          code = 'INVALID_DIFF_REPORT';
          status = 400;
        } else if (errMsg.includes('STALE_PREVIEW_CONFLICT')) {
          code = 'STALE_PREVIEW_CONFLICT';
          status = 409;
        } else if (errMsg.includes('INTERNAL_ID_COLLISION')) {
          code = 'INTERNAL_ID_COLLISION';
          status = 409;
        }
        return jsonResponse({ success: false, message: errMsg, code }, status);
      }

      const addedStudentsCount = Number(syncRow.added_students_count ?? 0);
      const updatedStudentsCount = Number(syncRow.updated_students_count ?? 0);
      const createdClassesCount = Number(syncRow.created_classes_count ?? 0);

      return jsonResponse({
        success: true,
        data: {
          addedStudentsCount,
          updatedStudentsCount,
          createdClassesCount,
        },
        message:
          addedStudentsCount === 0 && updatedStudentsCount === 0 && createdClassesCount === 0
            ? 'Snapshot không có thay đổi mới (0 thêm mới, 0 cập nhật). Dữ liệu đã đồng bộ nhất quán, không tạo bản ghi trùng.'
            : isRealTeachingSync
              ? `Đã đồng bộ thành công danh sách Teaching thật: +${addedStudentsCount} học sinh mới, cập nhật ${updatedStudentsCount} hồ sơ, +${createdClassesCount} lớp ROB mới chờ gán khóa.`
              : `Đã lưu kết quả đồng bộ fixture vào TEST: +${addedStudentsCount} học sinh mới, cập nhật ${updatedStudentsCount} hồ sơ, +${createdClassesCount} lớp mới chờ gán khóa.`,
      });
    }

    if (action === 'reset-teaching-sync') {
      const { actor, errorResponse } = await verifyActorSession(adminClient, body.accessToken);
      if (errorResponse || !actor) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }
      if (actor.role !== 'admin') {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
          403
        );
      }
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Khôi phục dữ liệu mẫu Mốc 4 chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }

      const { data: resetData, error: resetErr } = await adminClient.rpc('m4_reset_teaching_sync', {
        p_admin_profile_id: actor.profileId,
      });

      const resetRow = Array.isArray(resetData) ? resetData[0] : resetData;
      const isResetOk =
        resetRow === true ||
        (resetRow && typeof resetRow === 'object' && (resetRow as any).reset_ok === true);

      if (resetErr || !isResetOk) {
        const errMsg = resetErr?.message || 'Không thể khôi phục dữ liệu mẫu Mốc 4 trên máy chủ.';
        const isProdLocked = errMsg.includes('PRODUCTION_ENVIRONMENT_LOCKED');
        const isForbidden = isProdLocked || errMsg.includes('FORBIDDEN');
        return jsonResponse(
          {
            success: false,
            message: errMsg,
            code: isProdLocked ? 'PRODUCTION_ENVIRONMENT_LOCKED' : isForbidden ? 'FORBIDDEN' : 'DB_ERROR',
          },
          isForbidden ? 403 : 500
        );
      }

      const rawCleanupPaths =
        resetRow && typeof resetRow === 'object' && Array.isArray((resetRow as any).cleanup_paths)
          ? (resetRow as any).cleanup_paths
          : [];
      const cleanupPaths = Array.from(
        new Set(
          rawCleanupPaths
            .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
            .map((p: string) => p.trim())
        )
      );

      if (cleanupPaths.length > 0) {
        let storageCleanupFailed = false;
        let ackedCount = 0;
        try {
          const { error: removeErr } = await adminClient.storage
            .from('m3-practice-files')
            .remove(cleanupPaths);
          if (removeErr) {
            storageCleanupFailed = true;
          } else {
            const { data: ackData, error: ackErr } = await adminClient.rpc('m4_ack_storage_cleanup', {
              p_admin_profile_id: actor.profileId,
              p_paths: cleanupPaths,
            });
            ackedCount = typeof ackData === 'number' ? ackData : Number(ackData ?? 0);
            if (ackErr || Number.isNaN(ackedCount) || ackedCount < cleanupPaths.length) {
              storageCleanupFailed = true;
            }
          }
        } catch {
          storageCleanupFailed = true;
        }

        if (storageCleanupFailed) {
          const remainingCount = Math.max(1, cleanupPaths.length - Math.max(0, ackedCount));
          return jsonResponse(
            {
              success: false,
              code: 'STORAGE_CLEANUP_FAILED',
              message:
                'Đã khôi phục dữ liệu hồ sơ Mốc 4 nhưng chưa xóa hết tệp bài nộp trong kho m3-practice-files. Danh sách tệp cần dọn đã được giữ lại để thử lại khi bấm khôi phục lần tiếp theo.',
              data: {
                pendingCleanupCount: remainingCount,
                pendingCleanupPaths: cleanupPaths,
              },
            },
            500
          );
        }
      }

      return jsonResponse({
        success: true,
        data: {
          removedStorageFilesCount: cleanupPaths.length,
        },
        message: 'Đã khôi phục dữ liệu lớp và học sinh TEST về trạng thái chuẩn trên máy chủ.',
      });
    }

    // ========================================================================
    // M5 HELPER FUNCTIONS (Pure Deno/TS: Chunking, CSV RFC 4180, Digest, Verification)
    // ========================================================================

    async function requireAdminActor(
      adminClient: SupabaseClient,
      accessToken: string | undefined
    ): Promise<{
      actor?: {
        authUserId: string;
        profileId: string;
        role: Role;
        email: string;
        sessionVersion: number;
        status: string;
      };
      actorClient?: SupabaseClient;
      errorResponse?: Response;
    }> {
      const { actor, errorResponse } = await verifyActorSession(adminClient, accessToken);
      if (errorResponse || !actor) {
        return {
          errorResponse: errorResponse ?? jsonResponse(
            { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
            401
          ),
        };
      }
      if (actor.role !== 'admin') {
        return {
          errorResponse: jsonResponse(
            { success: false, message: STATIC_MESSAGES.ADMIN_ONLY, code: 'FORBIDDEN' },
            403
          ),
        };
      }
      return {
        actor,
        actorClient: createActorClient(accessToken!),
      };
    }

    function chunkStoragePaths(paths: string[] = [], chunkSize: number = 1000): string[][] {
      if (!Array.isArray(paths) || paths.length === 0) return [];
      const safeChunkSize = Math.max(1, Math.min(chunkSize, 1000));
      const chunks: string[][] = [];
      for (let i = 0; i < paths.length; i += safeChunkSize) {
        chunks.push(paths.slice(i, i + safeChunkSize));
      }
      return chunks;
    }

    // R10-01: Đọc toàn bộ dòng theo từng trang (mặc định 1.000 dòng/trang theo giới hạn PostgREST). Fail-Closed khi có lỗi.
    async function fetchAllM5Rows<T = any>(
      buildPageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
      pageSize = 1000
    ): Promise<{ data: T[] | null; error: any }> {
      const safePageSize = Math.max(1, Math.floor(Number(pageSize)) || 1000);
      const allRows: T[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await buildPageQuery(offset, offset + safePageSize - 1);
        if (error) return { data: null, error };
        if (!Array.isArray(data) || data.length === 0) break;
        allRows.push(...data);
        if (data.length < safePageSize) break;
        offset += safePageSize;
      }
      return { data: allRows, error: null };
    }

    function sanitizeCsvCell(val: unknown): string {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    }

    function parseCsvRfc4180(text: string): string[][] {
      if (typeof text !== 'string') return [];
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentCell = '';
      let inQuotes = false;
      let i = 0;
      const len = text.length;

      while (i < len) {
        const char = text[i];
        const nextChar = i + 1 < len ? text[i + 1] : '';

        if (inQuotes) {
          if (char === '"') {
            if (nextChar === '"') {
              currentCell += '"';
              i += 2;
              continue;
            } else {
              inQuotes = false;
              i++;
              continue;
            }
          } else {
            currentCell += char;
            i++;
            continue;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
            i++;
            continue;
          } else if (char === ',') {
            currentRow.push(currentCell);
            currentCell = '';
            i++;
            continue;
          } else if (char === '\r') {
            if (nextChar === '\n') {
              currentRow.push(currentCell);
              rows.push(currentRow);
              currentRow = [];
              currentCell = '';
              i += 2;
              continue;
            } else {
              currentRow.push(currentCell);
              rows.push(currentRow);
              currentRow = [];
              currentCell = '';
              i++;
              continue;
            }
          } else if (char === '\n') {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
            i++;
            continue;
          } else {
            currentCell += char;
            i++;
            continue;
          }
        }
      }

      if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
      }

      if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
        rows.pop();
      }

      return rows;
    }

    function resolveM5Participants(options: {
      students?: any[];
      classId: string;
      courseId?: string;
      cohortMembers?: any[];
      quizResults?: any[];
      submissions?: any[];
      lessons?: any[];
      closedOperations?: any[];
    }) {
      const {
        students = [],
        classId,
        courseId,
        cohortMembers = [],
        quizResults = [],
        submissions = [],
        lessons = [],
        closedOperations = [],
      } = options;
      const candidateMap = new Map<string, any>();

      const courseLessonIds = new Set(
        (lessons || [])
          .filter((l: any) => !courseId || (!l.course_id && !l.courseId) || l.course_id === courseId || l.courseId === courseId)
          .map((l: any) => l.id)
      );

      const enforceLessonFilter = Boolean(courseId && Array.isArray(lessons) && lessons.length > 0) || courseLessonIds.size > 0;

      const hasPriorClosedOtherCourse = (closedOperations || []).some(
        (op: any) =>
          op &&
          (op.class_id === classId || op.classId === classId) &&
          op.status === 'completed' &&
          (courseId ? (op.course_id !== courseId && op.courseId !== courseId) : false)
      );

      // 1. Học sinh có trong m5_class_cohort_members của đúng cặp (class_id, course_id) (R4-03, R5-03)
      for (const cm of cohortMembers) {
        if (!cm) continue;
        const cmClassId = cm.class_id || cm.classId;
        const cmCourseId = cm.course_id || cm.courseId;
        if (cmClassId === classId && (courseId ? cmCourseId === courseId : true)) {
          const stId = cm.student_id || cm.studentId || cm.id;
          if (!candidateMap.has(stId)) {
            const found = students.find((s) => s.id === stId);
            candidateMap.set(stId, {
              id: stId,
              // R12-01: ưu tiên dữ liệu hiện hành của học sinh (khớp m5_compute_db_snapshot_digest)
              participantId: (cm.participant_id || cm.participantId || found?.participantId || '').trim(),
              studentCode: (found?.studentCode || cm.student_code || cm.studentCode || '').trim(),
              fullName: (found?.fullName || found?.name || cm.full_name || cm.fullName || cm.name || '').trim(),
              originalClassId: found?.originalClassId || cm.original_class_id || cm.originalClassId || classId,
              currentClassId: found?.currentClassId || cm.current_class_id || cm.currentClassId || classId,
              status: found
                ? (found.status === 'archived'
                    ? 'archived'
                    : (found.currentClassId && found.currentClassId !== classId) ||
                      found.status === 'transferred' ||
                      cm.membership_status === 'transferred' ||
                      cm.membershipStatus === 'transferred' ||
                      cm.status === 'transferred'
                    ? 'transferred'
                    : (found.status || cm.membership_status || cm.status || cm.membershipStatus || 'active'))
                : (cm.membership_status || cm.status || cm.membershipStatus || 'active'),
              notes: found && found.notes !== undefined && found.notes !== null
                ? String(found.notes)
                : (cm.notes_snapshot || cm.notes || ''),
            });
          }
        }
      }

      // 2. Học sinh đang thuộc lớp hiện tại HOẶC original_class_id chưa bị loại bởi khóa cũ đã đóng (R5-03)
      for (const st of students) {
        if (!st) continue;
        const isCurrent = st.currentClassId === classId;
        const hasOtherCourseCohortInClass = (cohortMembers || []).some((cm: any) => {
          if (!cm) return false;
          const cmStudentId = cm.student_id || cm.studentId || cm.id;
          const cmClassId = cm.class_id || cm.classId;
          const cmCourseId = cm.course_id || cm.courseId;
          return cmStudentId === st.id && cmClassId === classId && Boolean(cmCourseId) && (courseId ? cmCourseId !== courseId : false);
        });

        const isOriginalWithoutPriorClose =
          st.originalClassId === classId &&
          !hasPriorClosedOtherCourse &&
          !hasOtherCourseCohortInClass;

        if (isCurrent || isOriginalWithoutPriorClose) {
          if (!candidateMap.has(st.id)) {
            candidateMap.set(st.id, {
              id: st.id,
              participantId: (st.participantId || '').trim(),
              studentCode: (st.studentCode || '').trim(),
              fullName: (st.fullName || '').trim(),
              originalClassId: st.originalClassId || classId,
              currentClassId: st.currentClassId || classId,
              status: st.status || 'active',
              notes: st.notes || '',
            });
          }
        }
      }

      // 3. Học sinh có quizResults tại classId thuộc lessons của courseId
      for (const qr of quizResults) {
        if (!qr || !qr.studentId) continue;
        const qrClassId = qr.class_id || qr.classId;
        const qrLessonId = qr.lesson_id || qr.lessonId;
        if ((!qrClassId || qrClassId === classId) && (!enforceLessonFilter || courseLessonIds.has(qrLessonId))) {
          if (!candidateMap.has(qr.studentId)) {
            const found = students.find((s) => s.id === qr.studentId);
            if (found) {
              candidateMap.set(qr.studentId, {
                id: found.id,
                participantId: (found.participantId || '').trim(),
                studentCode: (found.studentCode || '').trim(),
                fullName: (found.fullName || '').trim(),
                originalClassId: found.originalClassId || classId,
                currentClassId: found.currentClassId || classId,
                status: found.status || 'active',
                notes: found.notes || '',
              });
            }
          }
        }
      }

      // 4. Học sinh có submissions tại classId thuộc lessons của courseId
      for (const sub of submissions) {
        if (!sub || !sub.studentId) continue;
        const subClassId = sub.class_id || sub.classId;
        const subLessonId = sub.lesson_id || sub.lessonId;
        if ((!subClassId || subClassId === classId) && (!enforceLessonFilter || courseLessonIds.has(subLessonId))) {
          if (!candidateMap.has(sub.studentId)) {
            const found = students.find((s) => s.id === sub.studentId);
            if (found) {
              candidateMap.set(sub.studentId, {
                id: found.id,
                participantId: (found.participantId || '').trim(),
                studentCode: (found.studentCode || '').trim(),
                fullName: (found.fullName || '').trim(),
                originalClassId: found.originalClassId || classId,
                currentClassId: found.currentClassId || classId,
                status: found.status || 'active',
                notes: found.notes || '',
              });
            }
          }
        }
      }

      return Array.from(candidateMap.values()).sort((a, b) =>
        a.participantId.localeCompare(b.participantId)
      );
    }

    function generateM5CsvRows(
      batchStudents: any[],
      lessons: any[],
      classCode: string,
      quizResults: any[] = [],
      submissions: any[] = [],
      options: { classId?: string; courseId?: string } = {}
    ) {
      const classId = options.classId || '';
      const courseId = options.courseId || '';

      let courseLessons = [...lessons];
      if (courseId) {
        const matched = courseLessons.filter((l) => l.courseId === courseId);
        if (matched.length > 0) courseLessons = matched;
      }
      courseLessons = courseLessons
        .filter((l) => Number(l.sessionNumber) >= 1 && Number(l.sessionNumber) <= 14)
        .sort((a, b) => Number(a.sessionNumber) - Number(b.sessionNumber));

      const studentProgressMap = new Map<string, number>();
      for (const st of batchStudents) {
        let completedCount = 0;
        for (const les of courseLessons) {
          const quiz = quizResults.find(
            (q) => q.studentId === st.id && q.lessonId === les.id && (!classId || !q.classId || q.classId === classId)
          );
          const sub = submissions.find(
            (s) => s.studentId === st.id && s.lessonId === les.id && (!classId || !s.classId || s.classId === classId)
          );

          const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
          const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
          if (quizPass && practicePass) {
            completedCount++;
          }
        }
        studentProgressMap.set(st.id, completedCount);
      }

      const rows: string[] = [];

      for (const st of batchStudents) {
        const studentCompleted = studentProgressMap.get(st.id) || 0;
        const progressLabel = `${studentCompleted}/14`;

        for (const les of courseLessons) {
          const quiz = quizResults.find(
            (q) => q.studentId === st.id && q.lessonId === les.id && (!classId || !q.classId || q.classId === classId)
          );
          const sub = submissions.find(
            (s) => s.studentId === st.id && s.lessonId === les.id && (!classId || !s.classId || s.classId === classId)
          );

          const quizScoreStr = quiz ? `${quiz.highestScore}%` : 'Chưa làm';
          let quizStatusStr = 'Không có Quiz';
          if (les.hasQuiz) {
            quizStatusStr = quiz ? (quiz.passed ? 'Đạt' : 'Chưa đạt') : 'Chưa làm';
          }

          let practiceStatusStr = 'Không có TH';
          if (les.hasPractice) {
            if (!sub) practiceStatusStr = 'Chưa nộp';
            else if (sub.status === 'approved') practiceStatusStr = 'Đạt';
            else if (sub.status === 'needs_revision') practiceStatusStr = 'Cần làm lại';
            else practiceStatusStr = 'Chờ chấm';
          }

          const teacherFeedback = sub?.teacherFeedback || '';
          const quizPass = les.hasQuiz ? (quiz?.passed ?? false) : true;
          const practicePass = les.hasPractice ? sub?.status === 'approved' : true;
          const sessionCompletedStr =
            quizPass && practicePass ? `Hoàn thành (${progressLabel})` : `Chưa hoàn thành (${progressLabel})`;

          const studentStatusStr = st.notes ? `${st.status} (${st.notes})` : st.status;

          const cells = [
            sanitizeCsvCell(st.participantId),
            sanitizeCsvCell(st.studentCode),
            sanitizeCsvCell(st.fullName),
            sanitizeCsvCell(studentStatusStr),
            sanitizeCsvCell(classCode),
            sanitizeCsvCell(`Buổi ${les.sessionNumber}`),
            sanitizeCsvCell(les.title),
            sanitizeCsvCell(quizScoreStr),
            sanitizeCsvCell(quizStatusStr),
            sanitizeCsvCell(practiceStatusStr),
            sanitizeCsvCell(teacherFeedback),
            sanitizeCsvCell(sessionCompletedStr),
          ];

          rows.push(cells.join(','));
        }
      }

      return rows;
    }

    const M5_CSV_HEADER =
      'Mã tham gia nội bộ,Mã học sinh,Họ và tên,Trạng thái học sinh,Lớp học,Buổi học,Tiêu đề buổi,Điểm Quiz cao nhất,Trạng thái Quiz,Trạng thái Thực hành,Nhận xét của GV,Trạng thái hoàn thành buổi\r\n';

    function buildM5CsvContent(
      batchStudents: any[],
      lessons: any[],
      classCode: string,
      quizResults: any[] = [],
      submissions: any[] = [],
      options: { classId?: string; courseId?: string } = {}
    ) {
      const rows = generateM5CsvRows(batchStudents, lessons, classCode, quizResults, submissions, options);
      const csvContent = M5_CSV_HEADER + rows.join('\r\n');
      return {
        csvContent,
        rowCount: rows.length,
        participantCount: batchStudents.length,
      };
    }

    async function computeM5SnapshotDigest(options: {
      classItem?: any;
      classId?: string;
      courseId?: string;
      classCode?: string;
      className?: string;
      is14SessionsConfirmed?: boolean;
      participants?: any[];
      lessons?: any[];
      quizResults?: any[];
      submissions?: any[];
    }): Promise<string> {
      const {
        classItem,
        classId: rawClassId,
        courseId: rawCourseId,
        classCode: rawClassCode,
        className: rawClassName,
        is14SessionsConfirmed: rawIs14,
        participants = [],
        lessons = [],
        quizResults = [],
        submissions = [],
      } = options || {};

      const classId = classItem?.id || rawClassId || '';
      const courseId = classItem?.courseId || rawCourseId || '';
      const classCode = classItem?.code || rawClassCode || '';

      const enc = (val: unknown): string => {
        const str = String(val ?? '');
        const len = Array.from(str).length;
        return `${len}#${str}`;
      };

      // P1-03 / R3-02: Băm các trường thuộc nội dung đợt học & CSV bằng length-prefixed encoding
      const classPart = `${enc(classId)}:${enc(courseId)}:${enc(classCode)}`;

      const sortedLessons = [...lessons]
        .filter((l) => !courseId || !l.courseId || l.courseId === courseId)
        .sort((a, b) => Number(a.sessionNumber) - Number(b.sessionNumber));
      const lessonsPart = sortedLessons
        .map(
          (l) =>
            `${enc(l.sessionNumber)}:${enc(l.id)}:${enc(l.title)}:${enc(l.status)}:${enc(Boolean(l.hasQuiz))}:${enc(Boolean(l.hasPractice))}`
        )
        .join('|');

      const sortedParticipants = [...participants].sort((a, b) =>
        String(a.participantId || '').localeCompare(String(b.participantId || ''))
      );
      // P1-04 / R3-02: Đồng nhất 100% quy tắc effective_status giữa Edge Function và SQL
      const participantsPart = sortedParticipants
        .map((p) => {
          const effStatus =
            p.status === 'archived'
              ? 'archived'
              : (p.currentClassId && p.currentClassId !== classId) || p.status === 'transferred'
              ? 'transferred'
              : (p.status || 'active');
          return `${enc(p.id)}:${enc(p.participantId)}:${enc(p.studentCode)}:${enc(p.fullName)}:${enc(effStatus)}:${enc(p.notes || '')}:${enc(p.currentClassId || '')}:${enc(p.originalClassId || '')}`;
        })
        .join('|');

      const participantIds = new Set(sortedParticipants.map((p) => p.id));
      // R13-02: chỉ băm kết quả/bài nộp thuộc các bài học của khóa (khớp JOIN public.lessons l ... l.course_id = p_course_id trong SQL)
      const lessonIdSet = new Set(sortedLessons.map((l) => l.id));

      const filteredQuizzes = quizResults
        .filter(
      (q) =>
        (!q.classId || q.classId === classId) &&
        participantIds.has(q.studentId) &&
        (lessonIdSet.size === 0 || lessonIdSet.has(q.lessonId))
    )
        .sort((a, b) => {
          const cmp = String(a.studentId).localeCompare(String(b.studentId));
          if (cmp !== 0) return cmp;
          return String(a.lessonId).localeCompare(String(b.lessonId));
        });
      const quizzesPart = filteredQuizzes
        .map(
          (q) =>
            `${enc(q.studentId)}:${enc(q.lessonId)}:${enc(q.highestScore)}:${enc(Boolean(q.passed))}:${enc(Number(q.attemptsCount || 0))}`
        )
        .join('|');

      const filteredSubs = submissions
        .filter(
      (s) =>
        (!s.classId || s.classId === classId) &&
        participantIds.has(s.studentId) &&
        (lessonIdSet.size === 0 || lessonIdSet.has(s.lessonId))
    )
        .sort((a, b) => {
          const cmp = String(a.studentId).localeCompare(String(b.studentId));
          if (cmp !== 0) return cmp;
          return String(a.lessonId).localeCompare(String(b.lessonId));
        });
      const subsPart = filteredSubs
        .map(
          (s) =>
            `${enc(s.studentId)}:${enc(s.lessonId)}:${enc(s.type)}:${enc(s.status)}:${enc(s.teacherFeedback || '')}:${enc(s.content || '')}:${enc(Number(s.fileSizeBytes || 0))}`
        )
        .join('|');

      const raw = `${classPart}##${lessonsPart}##${participantsPart}##${quizzesPart}##${subsPart}`;
      return await computeSha256Hex(raw);
    }

    async function verifyM5Csv(csvContent: string, expectedData: any) {
      const {
        participants = [],
        lessons = [],
        classCode = '',
        classId = '',
        courseId = '',
        quizResults = [],
        submissions = [],
        classItem = null,
      } = expectedData || {};

      const errors: string[] = [];

      if (typeof csvContent !== 'string' || csvContent.trim().length === 0) {
        return {
          valid: false,
          errors: ['Nội dung CSV rỗng hoặc không hợp lệ.'],
          rowCount: 0,
          participantCount: 0,
          sha256: null,
          snapshotDigest: null,
        };
      }

      const parsedGrid = parseCsvRfc4180(csvContent);
      if (parsedGrid.length === 0) {
        return {
          valid: false,
          errors: ['Không thể phân tích cú pháp tệp CSV theo chuẩn RFC 4180.'],
          rowCount: 0,
          participantCount: 0,
          sha256: null,
          snapshotDigest: null,
        };
      }

      // R14-01 / R15-01: Kiểm tra cả nội dung các ô đã giải mã RFC 4180 (dấu " nhân đôi thành "" trong CSV thô)
      const decodedCellsText = parsedGrid.map((row) => row.join('\n')).join('\n');

      const SENSITIVE_PATTERNS = [
        /pinHash/i,
        /pin_hash/i,
        /MOCK_HASH_PIN/i,
        /MOCK_HASH_\d+/i,
        /session_token/i,
        /service_role/i,
        /jwt\./i,
        /password_hash/i,
        /authPassword/i,
        /["']+password["']+\s*:/i,
        /\bpassword\s*=\s*\S+/i,
        /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,
        /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
        /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
      ];
      for (const pat of SENSITIVE_PATTERNS) {
        if (pat.test(csvContent) || pat.test(decodedCellsText)) {
          errors.push(`Phát hiện chuỗi nhạy cảm tiềm ẩn trong tệp CSV khớp mẫu: ${pat.source}`);
        }
      }
      for (const p of participants as any[]) {
        if (!p || typeof p !== 'object') continue;
        const secrets = [p.pinHash, p.pin_hash, p.password, p.password_hash];
        if (secrets.some((s) => typeof s === 'string' && s.length >= 4 && (csvContent.includes(s) || decodedCellsText.includes(s)))) {
          errors.push('Phát hiện chuỗi nhạy cảm tiềm ẩn trong tệp CSV khớp mẫu: participant_secret_leak');
          break;
        }
      }

      const headerRow = parsedGrid[0];
      const expectedHeaderCols = M5_CSV_HEADER.trim().split(',');
      if (headerRow.length !== expectedHeaderCols.length) {
        errors.push(`Số lượng cột tiêu đề không khớp: mong đợi ${expectedHeaderCols.length}, thực tế ${headerRow.length}.`);
      } else {
        for (let c = 0; c < expectedHeaderCols.length; c++) {
          if (headerRow[c].trim() !== expectedHeaderCols[c].trim()) {
            errors.push(`Tiêu đề cột ${c + 1} không khớp: mong đợi "${expectedHeaderCols[c]}", thực tế "${headerRow[c]}".`);
          }
        }
      }

      const dataRows = parsedGrid.slice(1);
      const expectedRowCount = participants.length * 14;

      if (dataRows.length !== expectedRowCount) {
        errors.push(
          `Tổng số dòng dữ liệu (${dataRows.length}) không khớp với công thức ${participants.length} học sinh x 14 buổi (${expectedRowCount} dòng).`
        );
      }

      const expectedParticipantMap = new Map<string, any>();
      for (const p of participants) {
        expectedParticipantMap.set(p.participantId, p);
      }

      const parsedByParticipant = new Map<string, any[]>();

      for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
        const row = dataRows[rIdx];
        if (row.length !== expectedHeaderCols.length) {
          errors.push(`Dòng ${rIdx + 2} có số lượng cột (${row.length}) không đúng (${expectedHeaderCols.length}).`);
          continue;
        }

        const participantId = row[0].replace(/^'/, '');
        if (!expectedParticipantMap.has(participantId)) {
          errors.push(`Dòng ${rIdx + 2}: Mã tham gia "${participantId}" không nằm trong danh sách đợt học đã xác minh.`);
          continue;
        }

        if (!parsedByParticipant.has(participantId)) {
          parsedByParticipant.set(participantId, []);
        }
        parsedByParticipant.get(participantId)!.push({ rowIdx: rIdx + 2, cells: row });
      }

      for (const expectedP of participants) {
        const pRows = parsedByParticipant.get(expectedP.participantId);
        if (!pRows || pRows.length === 0) {
          errors.push(`Học sinh "${expectedP.fullName}" (${expectedP.participantId}) bị thiếu hoàn toàn trong CSV.`);
          continue;
        }

        if (pRows.length !== 14) {
          errors.push(
            `Học sinh "${expectedP.fullName}" (${expectedP.participantId}) có ${pRows.length} dòng trong CSV thay vì đủ 14 buổi.`
          );
        }

        const sessionSeen = new Set<string>();
        for (let sIdx = 0; sIdx < pRows.length; sIdx++) {
          const sessionCell = pRows[sIdx].cells[5].replace(/^'/, '');
          const expectedSession = `Buổi ${sIdx + 1}`;
          if (sessionCell !== expectedSession) {
            errors.push(
              `Dòng ${pRows[sIdx].rowIdx}: Sai thứ tự buổi học cho học sinh ${expectedP.participantId} (mong đợi "${expectedSession}", thực tế "${sessionCell}").`
            );
          }
          sessionSeen.add(sessionCell);
        }

        if (sessionSeen.size !== 14) {
          errors.push(`Học sinh ${expectedP.participantId} bị trùng lặp hoặc thiếu buổi học (chỉ có ${sessionSeen.size}/14 buổi duy nhất).`);
        }
      }

      const CSV_COLUMN_KEYS = [
        'participantId',
        'studentCode',
        'fullName',
        'studentStatus',
        'classCode',
        'sessionLabel',
        'lessonTitle',
        'highestScore',
        'quizStatus',
        'practiceStatus',
        'teacherFeedback',
        'completionStatus',
      ];

      function normalizeCell(val: any): string {
        if (val === null || val === undefined) return '';
        // R13-03: khoảng trắng đầu/cuối là dữ liệu có nghĩa theo RFC 4180, không trim
        let str = String(val);
        if (str.startsWith("'") && /^[=+\-@\t\r]/.test(str.slice(1))) {
          str = str.slice(1);
        }
        return str;
      }

      const expectedCsvRows = generateM5CsvRows(
        participants,
        lessons,
        classCode,
        quizResults,
        submissions,
        { classId, courseId }
      );
      const expectedGrid = parseCsvRfc4180(expectedCsvRows.join('\r\n'));

      if (dataRows.length === expectedGrid.length) {
        for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
          const actualRow = dataRows[rIdx];
          const expectedRow = expectedGrid[rIdx];
          for (let c = 0; c < CSV_COLUMN_KEYS.length; c++) {
            const actualVal = normalizeCell(actualRow[c]);
            const expectedVal = normalizeCell(expectedRow[c]);
            if (actualVal !== expectedVal) {
              errors.push(
                `CSV_CELL_VALUE_MISMATCH: Dòng ${rIdx + 2}, Cột ${c + 1} (${CSV_COLUMN_KEYS[c]}): mong đợi "${expectedVal}", thực tế "${actualVal}".`
              );
            }
          }
        }
      }

      const sha256 = await computeSha256Hex(csvContent);
      const snapshotDigest = await computeM5SnapshotDigest({
        classItem,
        classId,
        courseId,
        classCode,
        participants,
        lessons,
        quizResults,
        submissions,
      });

      return {
        valid: errors.length === 0,
        errors,
        rowCount: dataRows.length,
        participantCount: parsedByParticipant.size,
        sha256,
        snapshotDigest,
      };
    }

    // ========================================================================
    // M5 ACTIONS: Quota, Fixture Seed, Preview, CSV Export, Close Execution
    // ========================================================================

    // R3-04 / R5-04: Kiểm tra môi trường TEST dương tính (Fail-Closed)
    function isExactTestOrigin(urlStr: string): boolean {
      try {
        const parsed = new URL(urlStr);
        return parsed.hostname === 'eythjapspkoyqdxlxtcd.supabase.co';
      } catch {
        return false;
      }
    }

    function isVerifiedTestEnvironment(): boolean {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      if (!supabaseUrl.includes('eythjapspkoyqdxlxtcd') || !isExactTestOrigin(supabaseUrl)) {
        return false;
      }
      const mindxEnv = Deno.env.get('MINDX_ENV');
      const appEnv = Deno.env.get('APP_ENV');
      const nodeEnv = Deno.env.get('NODE_ENV');
      const denoEnv = Deno.env.get('DENO_ENV');
      if (mindxEnv === 'production' || appEnv === 'production' || nodeEnv === 'production' || denoEnv === 'production') {
        return false;
      }
      const allowedEnvs = new Set(['test', 'development', 'local', 'staging_test']);
      const envKeys = [mindxEnv, appEnv, nodeEnv, denoEnv];
      for (const val of envKeys) {
        const trimmed = val?.trim();
        if (trimmed && !allowedEnvs.has(trimmed)) {
          return false;
        }
      }
      return true;
    }

    if (action === 'm5-seed-fixture') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      // P1-06 / R3-04: Chặn thao tác nạp dữ liệu mẫu ngoài môi trường TEST được duyệt (Fail-Closed)
      if (!isVerifiedTestEnvironment()) {
        return jsonResponse(
          { success: false, message: 'Thao tác nạp dữ liệu mẫu bị vô hiệu hóa trên môi trường Production.', code: 'SEED_FIXTURE_DISABLED_IN_PROD' },
          403
        );
      }

      const resetOnly = Boolean(body.payload?.resetOnly);

      // R10-03: Xóa tệp Storage thật của lớp/học sinh fixture TRƯỚC khi đặt lại dữ liệu để không sinh tệp mồ côi.
      // ID khớp với hằng số trong m5_seed_course_close_fixture (SQL).
      const fixtureClassId = '00000000-0000-0000-0000-000000050001';
      const fixtureCourseId = '00000000-0000-0000-0000-000000050014';
      const fixtureNextCourseId = '00000000-0000-0000-0000-000000050015';
      const fixtureStudentIds = [
        '00000000-0000-0000-0000-000000050101',
        '00000000-0000-0000-0000-000000050102',
        '00000000-0000-0000-0000-000000050103',
        '00000000-0000-0000-0000-000000050104',
        '00000000-0000-0000-0000-000000050105',
      ];
      const fixtureStudentList = fixtureStudentIds.join(',');
      // R20-01: Sau khi m5_prepare_seed_course_close_fixture chốt trạng thái đặt lại trong DB, mọi đường thoát
      // sớm (lỗi đọc, xung đột, lỗi xóa Storage, lỗi seed) phải gỡ khóa tạm để lớp mẫu không bị kẹt.
      let fixtureLockHeld = false;
      // R21-01 / R21-02: Mỗi lượt đặt lại mẫu có operation_id + execution_run_id riêng; theo dõi tiến độ xóa Storage
      // để khi lỗi xảy ra sau khi đã bắt đầu xóa tệp thì giữ trạng thái 'incomplete' thay vì xóa bản ghi bảo vệ.
      let seedOperationId: string | null = null;
      let seedExecutionRunId: string | null = null;
      let storageDeleteStarted = false;
      let seedDeletedPaths: string[] = [];
      let seedRemainingPaths: string[] = [];
      const releaseFixtureLock = async (
        storageStarted: boolean = storageDeleteStarted,
        deletedPaths: string[] = seedDeletedPaths,
        remainingPaths: string[] = seedRemainingPaths,
        errorMessage?: string
      ) => {
        if (!fixtureLockHeld) return;
        fixtureLockHeld = false;
        await Promise.resolve(
          adminClient.rpc('m5_release_seed_course_close_fixture_lock', {
            p_actor_id: actor.profileId,
            p_execution_run_id: seedExecutionRunId,
            p_storage_started: Boolean(storageStarted),
            p_deleted_paths: deletedPaths,
            p_remaining_paths: remainingPaths,
            p_error_message: errorMessage || null,
          })
        ).catch(() => null);
      };
      const fixtureReadFailed = async () => {
        await releaseFixtureLock();
        return jsonResponse(
          { success: false, message: 'Lỗi đọc dữ liệu tệp của lớp mẫu Mốc 5 từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' },
          500
        );
      };

      // R17-01 / R3-06: Chặn NGAY (trước khi xóa bất kỳ tệp Storage nào) nếu có học sinh/lớp ngoài bộ mẫu Mốc 5
      // đang tham chiếu lớp/khóa mẫu. Nếu không chặn, tệp Storage của dữ liệu ngoài bộ mẫu sẽ bị mất vĩnh viễn.
      const nonFixtureStudentFilter = `(${fixtureStudentList})`;
      const nonFixtureChecks = [
        adminClient.from('students').select('id')
          .or(`current_class_id.eq.${fixtureClassId},original_class_id.eq.${fixtureClassId}`)
          .not('id', 'in', nonFixtureStudentFilter).limit(1),
        adminClient.from('m5_class_cohort_members').select('id')
          .or(`class_id.eq.${fixtureClassId},course_id.in.(${fixtureCourseId},${fixtureNextCourseId})`)
          .not('student_id', 'in', nonFixtureStudentFilter).limit(1),
        adminClient.from('m3_upload_reservations').select('id')
          .eq('class_id', fixtureClassId)
          .not('student_id', 'in', nonFixtureStudentFilter).limit(1),
        adminClient.from('practice_submissions').select('id')
          .eq('class_id', fixtureClassId)
          .not('student_id', 'in', nonFixtureStudentFilter).limit(1),
        adminClient.from('quiz_results').select('student_id')
          .eq('class_id', fixtureClassId)
          .not('student_id', 'in', nonFixtureStudentFilter).limit(1),
        adminClient.from('classes').select('id')
          .neq('id', fixtureClassId)
          .in('course_id', [fixtureCourseId, fixtureNextCourseId]).limit(1),
        // R19-02 (chiều 3): học sinh mẫu Mốc 5 đang gắn với lớp khác ngoài lớp mẫu
        adminClient.from('students').select('id')
          .in('id', fixtureStudentIds)
          .or(`and(current_class_id.not.is.null,current_class_id.neq.${fixtureClassId}),and(original_class_id.not.is.null,original_class_id.neq.${fixtureClassId})`)
          .limit(1),
        adminClient.from('m5_class_cohort_members').select('id')
          .in('student_id', fixtureStudentIds)
          .not('class_id', 'is', null)
          .neq('class_id', fixtureClassId).limit(1),
        adminClient.from('m3_upload_reservations').select('id')
          .in('student_id', fixtureStudentIds)
          .not('class_id', 'is', null)
          .neq('class_id', fixtureClassId).limit(1),
        adminClient.from('practice_submissions').select('id')
          .in('student_id', fixtureStudentIds)
          .not('class_id', 'is', null)
          .neq('class_id', fixtureClassId).limit(1),
        adminClient.from('quiz_results').select('student_id')
          .in('student_id', fixtureStudentIds)
          .not('class_id', 'is', null)
          .neq('class_id', fixtureClassId).limit(1),
      ];
      for (const checkResult of await Promise.all(nonFixtureChecks)) {
        if (checkResult.error) return fixtureReadFailed();
        if (Array.isArray(checkResult.data) && checkResult.data.length > 0) {
          return jsonResponse(
            {
              success: false,
              message: 'Lớp hoặc khóa mẫu Mốc 5 đang có học sinh hoặc lớp học ngoài bộ mẫu Mốc 5 tham chiếu. Vui lòng chuyển học sinh/lớp đó ra ngoài trước khi đặt lại bộ mẫu.',
              code: 'NON_FIXTURE_DATA_ATTACHED',
            },
            409
          );
        }
      }

      // R20-01: Chốt trạng thái đang đặt lại bộ mẫu trong DB (m5_course_close_operations.status = 'deleting_storage')
      // TRƯỚC khi gom/xóa tệp Storage. Từ lúc này mọi thao tác đồng thời (chuyển lớp, giữ chỗ tải tệp, nộp bài,
      // làm quiz, sửa học sinh/lớp) bị chặn bởi các trigger/RPC kiểm tra đóng khóa dở dang.
      const { data: prepData, error: prepErr } = await adminClient.rpc('m5_prepare_seed_course_close_fixture', {
        p_actor_id: actor.profileId,
        p_test_project_ref: 'eythjapspkoyqdxlxtcd',
      });
      if (prepErr) {
        const prepMessage = String(prepErr.message || '');
        if (prepMessage.includes('NON_FIXTURE_DATA_ATTACHED')) {
          return jsonResponse(
            {
              success: false,
              message: 'Lớp hoặc khóa mẫu Mốc 5 đang có học sinh hoặc lớp học ngoài bộ mẫu Mốc 5 tham chiếu. Vui lòng chuyển học sinh/lớp đó ra ngoài trước khi đặt lại bộ mẫu.',
              code: 'NON_FIXTURE_DATA_ATTACHED',
            },
            409
          );
        }
        if (prepMessage.includes('CLASS_CLOSE_IN_PROGRESS')) {
          return jsonResponse(
            {
              success: false,
              message: 'Lớp mẫu hoặc học sinh mẫu Mốc 5 đang thuộc một đợt học đóng khóa dở dang. Vui lòng hoàn tất hoặc chờ tác vụ đó xong rồi thử lại.',
              code: 'CLASS_CLOSE_IN_PROGRESS',
            },
            409
          );
        }
        return jsonResponse(
          { success: false, message: prepMessage || 'Lỗi chuẩn bị đặt lại bộ mẫu Mốc 5.', code: 'DB_ERROR' },
          500
        );
      }
      fixtureLockHeld = true;
      const prepRow = Array.isArray(prepData) ? prepData[0] : prepData;
      seedOperationId = (prepRow as any)?.operation_id ? String((prepRow as any).operation_id) : null;
      seedExecutionRunId = (prepRow as any)?.execution_run_id ? String((prepRow as any).execution_run_id) : null;

      const { data: fixtureSubRows, error: fixtureSubErr } = await fetchAllM5Rows((from, to) =>
        adminClient.from('practice_submissions').select('id, content, type, class_id')
          .or(`student_id.in.(${fixtureStudentList})`)
          .order('id', { ascending: true }).range(from, to)
      );
      if (fixtureSubErr) return fixtureReadFailed();
      const { data: fixtureResRows, error: fixtureResErr } = await fetchAllM5Rows((from, to) =>
        adminClient.from('m3_upload_reservations').select('id, object_path, class_id')
          .or(`student_id.in.(${fixtureStudentList})`)
          .order('id', { ascending: true }).range(from, to)
      );
      if (fixtureResErr) return fixtureReadFailed();

      // R20-01: Chốt chặn thứ hai TRƯỚC khi gọi Storage remove — nếu có tệp thuộc lớp khác lớp mẫu thì dừng ngay.
      const isForeignClassRow = (row: unknown) => {
        const rowClassId = (row as any)?.class_id;
        return Boolean(rowClassId) && String(rowClassId) !== fixtureClassId;
      };
      if ((fixtureSubRows || []).some(isForeignClassRow) || (fixtureResRows || []).some(isForeignClassRow)) {
        await releaseFixtureLock();
        return jsonResponse(
          {
            success: false,
            message: 'Lớp hoặc khóa mẫu Mốc 5 đang có học sinh hoặc lớp học ngoài bộ mẫu Mốc 5 tham chiếu. Vui lòng chuyển học sinh/lớp đó ra ngoài trước khi đặt lại bộ mẫu.',
            code: 'NON_FIXTURE_DATA_ATTACHED',
          },
          409
        );
      }
      const { data: fixtureOpRows, error: fixtureOpErr } = await fetchAllM5Rows((from, to) =>
        adminClient.from('m5_course_close_operations').select('id, target_storage_paths, remaining_storage_paths, deleted_storage_paths, last_error_code, last_error_message')
          .or(`class_id.eq.${fixtureClassId},course_id.in.(${fixtureCourseId},${fixtureNextCourseId})`)
          .order('id', { ascending: true }).range(from, to)
      );
      if (fixtureOpErr) return fixtureReadFailed();

      const fixturePathSet = new Set<string>();
      const addFixturePath = (p: unknown) => {
        if (typeof p === 'string' && p.trim() !== '') fixturePathSet.add(p);
      };
      for (const p of Array.isArray((prepRow as any)?.target_storage_paths) ? (prepRow as any).target_storage_paths : []) addFixturePath(p);
      // R20-01: Chỉ đưa vào danh sách xóa các tệp không có class_id hoặc thuộc đúng lớp mẫu; tuyệt đối không xóa tệp của lớp khác.
      for (const s of fixtureSubRows || []) {
        if ((s as any).type === 'file' && (!(s as any).class_id || String((s as any).class_id) === fixtureClassId)) {
          addFixturePath((s as any).content);
        }
      }
      for (const r of fixtureResRows || []) {
        if (!(r as any).class_id || String((r as any).class_id) === fixtureClassId) addFixturePath((r as any).object_path);
      }
      for (const o of fixtureOpRows || []) {
        for (const p of Array.isArray((o as any).target_storage_paths) ? (o as any).target_storage_paths : []) addFixturePath(p);
        for (const p of Array.isArray((o as any).remaining_storage_paths) ? (o as any).remaining_storage_paths : []) addFixturePath(p);
      }
      const fixtureStoragePaths = Array.from(fixturePathSet);
      // R22-02: Khi tiếp quản bản ghi dở dang của lượt trước, giữ nguyên tiến độ đã xóa (deleted_storage_paths)
      // và chỉ xóa tiếp các tệp chưa nằm trong tập đã xóa; không xóa lại từ đầu và không làm mất seedDeletedPaths.
      const alreadyDeletedSet = new Set<string>();
      for (const o of fixtureOpRows || []) {
        if (!seedOperationId || String((o as any).id) !== seedOperationId) continue;
        const stillRemaining = new Set<string>(
          Array.isArray((o as any).remaining_storage_paths) ? (o as any).remaining_storage_paths : []
        );
        for (const p of Array.isArray((o as any).deleted_storage_paths) ? (o as any).deleted_storage_paths : []) {
          if (typeof p === 'string' && p.trim() !== '' && !stillRemaining.has(p)) alreadyDeletedSet.add(p);
        }
      }
      seedDeletedPaths = Array.from(alreadyDeletedSet);
      seedRemainingPaths = fixtureStoragePaths.filter((p) => !alreadyDeletedSet.has(p));

      // R21-01: Lượt chạy bị lượt mới hơn tiếp quản -> dừng ngay, tuyệt đối không gọi releaseFixtureLock để không chạm vào lượt mới
      const staleSeedResponse = () => {
        fixtureLockHeld = false;
        return jsonResponse(
          {
            success: false,
            message: 'Phiên đặt lại bộ mẫu Mốc 5 đã hết hiệu lực do một lượt thực thi mới hơn đã tiếp quản.',
            code: 'STALE_WORKER_EXECUTION',
          },
          409
        );
      };

      // R21-01: Ghi danh sách tệp đầy đủ vào bản ghi khóa nếu có thêm đường dẫn ngoài prepRow.target_storage_paths
      if (seedOperationId && seedExecutionRunId && fixtureStoragePaths.length > 0) {
        const prepPathSet = new Set<string>(
          Array.isArray((prepRow as any)?.target_storage_paths) ? (prepRow as any).target_storage_paths : []
        );
        if (fixtureStoragePaths.some((p) => !prepPathSet.has(p))) {
          // Giữ nguyên dấu hiệu khóa tạm (last_error_code/last_error_message) để gỡ khóa trước khi xóa Storage vẫn nhận ra bản ghi
          const lockRow = (fixtureOpRows || []).find((o: any) => String(o.id) === seedOperationId) as any;
          const { error: initProgressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
            p_operation_id: seedOperationId,
            p_deleted_paths: null,
            p_remaining_paths: seedRemainingPaths,
            p_status: 'deleting_storage',
            p_error_code: lockRow?.last_error_code ?? null,
            p_error_message: lockRow?.last_error_message ?? null,
            p_actor_id: actor.profileId,
            p_execution_run_id: seedExecutionRunId,
          });
          if (initProgressErr) {
            // R22-01: lượt mới đã hoàn tất và xóa bản ghi khóa (NOT_FOUND) hoặc đã tiếp quản -> dừng, không gỡ khóa
            const initProgressMsg = String(initProgressErr.message || '');
            if (initProgressMsg.includes('STALE_WORKER_EXECUTION') || initProgressMsg.includes('NOT_FOUND')) return staleSeedResponse();
            await releaseFixtureLock(false, seedDeletedPaths, seedRemainingPaths, String(initProgressErr.message || initProgressErr));
            return jsonResponse(
              { success: false, message: initProgressErr.message || 'Lỗi ghi tiến độ đặt lại bộ mẫu Mốc 5.', code: 'DB_ERROR' },
              500
            );
          }
        }
      }

      // R22-02: Chỉ xóa các tệp còn lại (chưa nằm trong seedDeletedPaths của lượt trước)
      const pathsToDelete = [...seedRemainingPaths];
      if (pathsToDelete.length > 0) {
        for (const batch of chunkStoragePaths(pathsToDelete, 1000)) {
          // R21-02: Từ lúc này tệp Storage có thể đã bị xóa một phần -> không được gỡ bản ghi bảo vệ khi lỗi
          storageDeleteStarted = true;
          // R21-01: Gia hạn lease mỗi 15 giây trong lúc chờ Storage remove để lượt khác không tiếp quản giữa chừng
          const seedLeaseHeartbeat =
            seedOperationId && seedExecutionRunId
              ? setInterval(() => {
                  Promise.resolve(
                    adminClient.rpc('m5_heartbeat_course_close_lease', {
                      p_operation_id: seedOperationId,
                      p_execution_run_id: seedExecutionRunId,
                      p_actor_id: actor.profileId,
                    })
                  ).catch(() => {});
                }, 15000)
              : null;
          let fixtureRemoveErr: { message?: string } | null = null;
          try {
            const removeRes = await adminClient.storage.from('m3-practice-files').remove(batch);
            fixtureRemoveErr = removeRes.error;
          } finally {
            if (seedLeaseHeartbeat !== null) clearInterval(seedLeaseHeartbeat);
          }
          if (fixtureRemoveErr) {
            // Không gọi m5_seed_course_close_fixture: giữ nguyên liên kết DB để lần sau còn dọn được
            // R21-02: giữ bản ghi bảo vệ ở trạng thái 'incomplete' kèm tiến độ xóa thay vì xóa bản ghi khóa
            await releaseFixtureLock(true, seedDeletedPaths, seedRemainingPaths, fixtureRemoveErr.message);
            return jsonResponse(
              {
                success: false,
                message: 'Không thể xóa tệp lưu trữ của lớp mẫu Mốc 5; đã giữ nguyên thông tin liên kết trong cơ sở dữ liệu để tránh sót tệp mồ côi.',
                code: 'STORAGE_CLEANUP_FAILED',
                data: { operationId: seedOperationId, deletedPaths: seedDeletedPaths, remainingPaths: seedRemainingPaths },
              },
              500
            );
          }
          seedDeletedPaths = [...seedDeletedPaths, ...batch];
          seedRemainingPaths = seedRemainingPaths.filter((p) => !batch.includes(p));
          if (seedOperationId && seedExecutionRunId) {
            const { error: progressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
              p_operation_id: seedOperationId,
              p_deleted_paths: seedDeletedPaths,
              p_remaining_paths: seedRemainingPaths,
              p_status: seedRemainingPaths.length === 0 ? 'deleting_db' : 'deleting_storage',
              p_actor_id: actor.profileId,
              p_execution_run_id: seedExecutionRunId,
            });
            if (progressErr) {
              // R22-01: lượt mới đã hoàn tất và xóa bản ghi khóa (NOT_FOUND) hoặc đã tiếp quản -> dừng, không gỡ khóa
              const progressMsg = String(progressErr.message || '');
              if (progressMsg.includes('STALE_WORKER_EXECUTION') || progressMsg.includes('NOT_FOUND')) return staleSeedResponse();
              await releaseFixtureLock(true, seedDeletedPaths, seedRemainingPaths, String(progressErr.message || progressErr));
              return jsonResponse(
                {
                  success: false,
                  message: 'Không thể ghi tiến độ xóa tệp lưu trữ của lớp mẫu Mốc 5; đã giữ trạng thái bảo vệ để dọn tiếp ở lần sau.',
                  code: 'STORAGE_CLEANUP_FAILED',
                  data: { operationId: seedOperationId, deletedPaths: seedDeletedPaths, remainingPaths: seedRemainingPaths },
                },
                500
              );
            }
          }
        }
      }

      // R3-01 / R3-04 / R5-01: Gọi qua adminClient với p_actor_id và p_test_project_ref
      const { data: seedData, error: seedErr } = await adminClient.rpc('m5_seed_course_close_fixture', {
        p_reset_only: resetOnly,
        p_actor_id: actor.profileId,
        p_test_project_ref: 'eythjapspkoyqdxlxtcd',
        p_execution_run_id: seedExecutionRunId,
      });

      if (seedErr) {
        // R21-01: lượt mới hơn đã tiếp quản -> không chạm vào bản ghi khóa của lượt mới
        if (String(seedErr.message || '').includes('STALE_WORKER_EXECUTION')) return staleSeedResponse();
        // R20-01 / R21-02: giao dịch seed đã hoàn tác; nếu đã xóa Storage thì giữ 'incomplete', ngược lại gỡ khóa tạm
        await releaseFixtureLock(storageDeleteStarted, seedDeletedPaths, seedRemainingPaths, seedErr.message);
        return jsonResponse(
          { success: false, message: seedErr.message || 'Lỗi khởi tạo fixture Mốc 5.', code: 'DB_ERROR' },
          500
        );
      }

      // R17-04: Trả đúng mã lớp mẫu thật (UUID) trên máy chủ để giao diện chọn đúng lớp thay vì mã Demo
      const seedRow = Array.isArray(seedData) ? seedData[0] : seedData;

      return jsonResponse({
        success: true,
        data: seedData,
        fixtureClassId: resetOnly ? null : (seedRow?.fixture_class_id || fixtureClassId),
        message: resetOnly
          ? 'Đã dọn sạch lớp fixture Mốc 5 (ROB-K14-M5-01) thành công.'
          : 'Đã khởi tạo thành công lớp mẫu 14 buổi Mốc 5 (ROB-K14-M5-01) kèm 5 học sinh thử nghiệm.',
      });
    }

    if (action === 'm5-storage-quota-status') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const incomingBytes = Number(body.payload?.incomingBytes) || 0;
      const { data: quotaData, error: quotaErr } = await adminClient.rpc('m5_get_storage_quota_status', {
        p_incoming_bytes: incomingBytes,
      });

      if (quotaErr) {
        return jsonResponse(
          { success: false, message: quotaErr.message || 'Không thể lấy thông tin dung lượng Storage.', code: 'DB_ERROR' },
          500
        );
      }

      const row = Array.isArray(quotaData) ? quotaData[0] : quotaData;
      return jsonResponse({
        success: true,
        data: {
          allowed: row?.allowed ?? true,
          isWarning: row?.is_warning ?? false,
          isExceeded: row?.is_exceeded ?? false,
          code: row?.code || 'OK',
          message: row?.message || 'Dung lượng trong giới hạn.',
          currentTotalBytes: Number(row?.current_total_bytes || 0),
          anticipatedTotalBytes: Number(row?.anticipated_total_bytes || 0),
          usedStorageBytes: Number(row?.used_storage_bytes || 0),
          activeReservedBytes: Number(row?.active_reserved_bytes || 0),
          orgBaselineBytes: Number(row?.org_baseline_bytes || 0),
          incomingBytes: Number(row?.incoming_bytes || incomingBytes),
          warningThresholdBytes: Number(row?.warning_threshold_bytes || 734003200),
          hardLimitBytes: Number(row?.hard_limit_bytes || 838860800),
          remainingBytes: Number(row?.remaining_bytes || 0),
        },
      });
    }

    if (action === 'm5-set-storage-quota-baseline') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      // P1-06 / R3-04: Chặn thao tác điều chỉnh baseline thử nghiệm ngoài môi trường TEST (Fail-Closed)
      if (!isVerifiedTestEnvironment()) {
        return jsonResponse(
          { success: false, message: 'Thao tác điều chỉnh baseline thử nghiệm bị chặn trên môi trường Production.', code: 'TEST_OPERATION_DISABLED_IN_PROD' },
          403
        );
      }

      const baseline = Number(body.payload?.orgBaselineBytes) || 0;
      const warningThreshold = Number(body.payload?.warningThresholdBytes) || 734003200;
      const hardLimit = Number(body.payload?.hardLimitBytes) || 838860800;

      // R3-01 / R3-04 / R5-01: Gọi qua adminClient với p_actor_id và p_test_project_ref
      const { data: setRes, error: setErr } = await adminClient.rpc('m5_set_storage_quota_baseline', {
        p_org_baseline_bytes: baseline,
        p_warning_bytes: warningThreshold,
        p_hard_limit_bytes: hardLimit,
        p_actor_id: actor.profileId,
        p_test_project_ref: 'eythjapspkoyqdxlxtcd',
      });

      if (setErr) {
        return jsonResponse(
          { success: false, message: setErr.message || 'Không thể cập nhật cấu hình hạn mức Storage.', code: 'DB_ERROR' },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: 'Đã cập nhật thành công hạn mức dung lượng Storage tổ chức.',
      });
    }

    if (action === 'm5-course-close-preview') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const classId = String(body.payload?.classId || '').trim();
      if (!classId) {
        return jsonResponse(
          { success: false, message: 'Mã lớp học không được để trống.', code: 'INVALID_INPUT' },
          400
        );
      }

      // Đọc thông tin lớp, khóa, học sinh, kết quả qua actorClient (R3-08: kiểm tra lỗi DB toàn diện)
      const { data: classRow, error: classErr } = await actorClient.from('classes').select('*').eq('id', classId).maybeSingle();
      if (classErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      if (!classRow) {
        return jsonResponse(
          { success: false, message: 'Lớp học không tồn tại.', code: 'NOT_FOUND' },
          404
        );
      }

      // P1-05: Cập nhật is_14_sessions_confirmed nếu Admin truyền lên trong preview
      // R17-03: Chỉ ghi khi khóa học Admin đang xem khớp khóa hiện tại của lớp; nếu lớp đã chuyển sang khóa khác
      // (sau khi đóng khóa) thì KHÔNG ghi đè xác nhận 14 buổi của khóa mới bằng xác nhận của khóa cũ.
      // R19-04: Bắt buộc có courseId và khớp khóa hiện tại của lớp mới được ghi; điều kiện UPDATE lọc đồng thời
      // id + course_id để nếu lớp vừa được chuyển sang khóa khác giữa bước đọc và bước ghi thì không ghi đè xác nhận cũ sang khóa mới.
      const confirmed14Sessions = body.payload?.confirmed14Sessions;
      const payloadCourseId = String(body.payload?.courseId || '').trim();
      const isMatchingCurrentCourse =
        payloadCourseId !== '' &&
        Boolean(classRow.course_id) &&
        payloadCourseId === String(classRow.course_id);
      if (typeof confirmed14Sessions === 'boolean' && isMatchingCurrentCourse) {
        const classWriteClient =
          typeof adminClient !== 'undefined' && adminClient?.from ? adminClient : actorClient;
        const { data: updatedRows, error: updErr } = await classWriteClient
          .from('classes')
          .update({ is_14_sessions_confirmed: confirmed14Sessions })
          .eq('id', classId)
          .eq('course_id', payloadCourseId)
          .select('*');
        if (updErr) {
          return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
        }
        const updatedClass = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
        if (updatedClass && String(updatedClass.course_id || '') === payloadCourseId) {
          classRow.is_14_sessions_confirmed = Boolean(updatedClass.is_14_sessions_confirmed);
        } else {
          // Khóa học của lớp đã thay đổi đồng thời giữa bước đọc và bước ghi -> đọc lại dòng lớp mới nhất, tuyệt đối không ghi đè xác nhận cũ sang khóa mới
          const { data: latestClassRow, error: latestClassErr } = await actorClient.from('classes').select('*').eq('id', classId).maybeSingle();
          if (latestClassErr || !latestClassRow) {
            return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
          }
          Object.assign(classRow, latestClassRow);
        }
      }

      const { data: courseRow, error: courseErr } = await actorClient.from('courses').select('*').eq('id', classRow.course_id).maybeSingle();
      if (courseErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      // R10-01: Phân trang đầy đủ (> 1.000 dòng) với thứ tự ổn định; lỗi ở bất kỳ trang nào thì dừng ngay (Fail-Closed)
      const { data: lessonsRows, error: lessonsErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('lessons').select('*').eq('course_id', classRow.course_id)
          .order('session_number', { ascending: true }).order('id', { ascending: true }).range(from, to)
      );
      if (lessonsErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: cohortRows, error: cohortErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('m5_class_cohort_members').select('*').eq('class_id', classId).eq('course_id', classRow.course_id)
          .order('student_id', { ascending: true }).range(from, to)
      );
      if (cohortErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      // R12-01: Đọc hồ sơ học sinh hiện hành để xem trước dùng đúng ghi chú/lớp hiện tại như SQL digest
      // R31-01: Dùng adminClient (sau khi requireAdminActor đã xác thực Admin active) để tránh RLS lồng nhau O(N^2) trên profiles(*) gây 57014 statement timeout khi bảng students > 1.000 dòng
      const studentsReadClient =
        typeof adminClient !== 'undefined' && adminClient?.from ? adminClient : actorClient;
      const { data: studentsRows, error: studentsErr } = await fetchAllM5Rows((from, to) =>
        studentsReadClient.from('students').select('*, profiles(*)').order('id', { ascending: true }).range(from, to)
      );
      if (studentsErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: quizRows, error: quizErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('quiz_results').select('*').eq('class_id', classId)
          .order('student_id', { ascending: true }).order('lesson_id', { ascending: true }).range(from, to)
      );
      if (quizErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: subRows, error: subErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('practice_submissions').select('*').eq('class_id', classId)
          .order('student_id', { ascending: true }).order('lesson_id', { ascending: true }).order('id', { ascending: true }).range(from, to)
      );
      if (subErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const nowIso = new Date().toISOString();
      const resReadClient =
        typeof adminClient !== 'undefined' && adminClient?.from ? adminClient : actorClient;
      const { data: resRows, error: resErr } = await fetchAllM5Rows((from, to) =>
        resReadClient
          .from('m3_upload_reservations')
          .select('*')
          .eq('class_id', classId)
          .in('status', ['reserved', 'claimed'])
          .is('consumed_at', null)
          .is('released_at', null)
          .gt('expires_at', nowIso)
          .order('id', { ascending: true })
          .range(from, to)
      );
      if (resErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: opRow, error: opErr } = await actorClient.from('m5_course_close_operations').select('*').eq('class_id', classId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (opErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }

      // R5-02 / R6-04: Lọc chặt quizRows, subRows, resRows theo courseLessonIds và chuẩn hóa camelCase
      const courseLessonIds = new Set((lessonsRows || []).map((l: any) => l.id));
      const relevantQuiz = (quizRows || []).filter((q: any) => courseLessonIds.has(q.lesson_id));
      const relevantSubs = (subRows || []).filter((s: any) => courseLessonIds.has(s.lesson_id));
      const relevantRes = (resRows || []).filter((r: any) => courseLessonIds.has(r.lesson_id));

      const mappedQuizzes = relevantQuiz.map((q: any) => ({
        studentId: q.student_id ?? q.studentId,
        lessonId: q.lesson_id ?? q.lessonId,
        classId: q.class_id ?? q.classId ?? classId,
        highestScore: Number(q.highest_score ?? q.highestScore ?? 0),
        passed: Boolean(q.passed),
        attemptsCount: Number(q.attempts_count ?? q.attemptsCount ?? 0),
        lastAttemptAt: q.last_attempt_at ?? q.lastAttemptAt,
      }));

      const mappedSubs = relevantSubs.map((s: any) => ({
        id: s.id,
        studentId: s.student_id ?? s.studentId,
        lessonId: s.lesson_id ?? s.lessonId,
        classId: s.class_id ?? s.classId ?? classId,
        type: s.type,
        content: s.content,
        fileSizeBytes: s.file_size_bytes ?? s.fileSizeBytes,
        status: s.status,
        teacherFeedback: s.teacher_feedback ?? s.teacherFeedback ?? '',
        notes: s.notes ?? '',
        canResubmit: Boolean(s.can_resubmit ?? s.canResubmit ?? true),
        submittedAt: s.submitted_at ?? s.submittedAt,
        gradedAt: s.graded_at ?? s.gradedAt,
        gradedBy: s.graded_by ?? s.gradedBy,
      }));

      const mappedStudents = (studentsRows || []).map((s: any) => ({
        id: s.id,
        participantId: s.participant_id || '',
        studentCode: s.student_code || '',
        fullName:
          (Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name) ||
          s.full_name ||
          s.fullName ||
          '',
        originalClassId: s.original_class_id || '',
        currentClassId: s.current_class_id || '',
        status: s.status || 'active',
        notes: s.notes || '',
        // Không bao giờ trả mã PIN băm ra ngoài; chỉ báo đã cấp hay chưa
        pinHash: null,
        hasPin: Boolean(s.pin_hash),
        pinIssuedAt: s.pin_issued_at ?? null,
      }));

      return jsonResponse({
        success: true,
        data: {
          classItem: classRow,
          course: courseRow,
          lessons: lessonsRows || [],
          cohortMembers: cohortRows || [],
          students: mappedStudents,
          quizResults: mappedQuizzes,
          submissions: mappedSubs,
          activeReservationsCount: relevantRes.length,
          currentOperation: opRow || null,
        },
      });
    }

    if (action === 'm5-export-course-csv') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const classId = String(body.payload?.classId || '').trim();
      // R20-02: Bắt buộc courseId Admin đang xác nhận để xác nhận 14 buổi của khóa cũ không ghi sang khóa mới
      const payloadCourseId = String(body.payload?.courseId || '').trim();
      const confirmed14Sessions = Boolean(body.payload?.confirmed14Sessions);
      if (!payloadCourseId) {
        return jsonResponse(
          { success: false, message: 'Phải cung cấp mã khóa học (courseId) khi xuất CSV.', code: 'INVALID_INPUT' },
          400
        );
      }
      const { data: classRow, error: classErr } = await actorClient.from('classes').select('*').eq('id', classId).maybeSingle();
      if (classErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      if (!classRow) {
        return jsonResponse({ success: false, message: 'Lớp học không tồn tại.', code: 'NOT_FOUND' }, 404);
      }
      if (!classRow.course_id || String(classRow.course_id) !== payloadCourseId) {
        return jsonResponse(
          { success: false, message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.', code: 'CLASS_COURSE_MISMATCH' },
          409
        );
      }

      // P1-05 / R20-02: Xác nhận 14 buổi chỉ được ghi nguyên tử trong m5_save_csv_verification (giữ khóa và lọc đúng course_id).
      // Ở đây chỉ gán trong bộ nhớ để verifyM5Csv kiểm tra dữ liệu xuất, tuyệt đối không ghi riêng vào bảng classes.
      if (confirmed14Sessions) {
        classRow.is_14_sessions_confirmed = true;
      }

      const { data: courseRow, error: courseErr } = await actorClient.from('courses').select('*').eq('id', classRow.course_id).maybeSingle();
      if (courseErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      // R10-01: Phân trang đầy đủ (> 1.000 dòng) với thứ tự ổn định; lỗi ở bất kỳ trang nào thì dừng ngay (Fail-Closed)
      const { data: lessonsRows, error: lessonsErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('lessons').select('*').eq('course_id', classRow.course_id)
          .order('session_number', { ascending: true }).order('id', { ascending: true }).range(from, to)
      );
      if (lessonsErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: cohortRows, error: cohortErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('m5_class_cohort_members').select('*').eq('class_id', classId).eq('course_id', classRow.course_id)
          .order('student_id', { ascending: true }).range(from, to)
      );
      if (cohortErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      // R31-01: Dùng adminClient (sau khi requireAdminActor đã xác thực Admin active) để tránh RLS lồng nhau O(N^2) trên profiles(*) gây 57014 statement timeout
      const studentsReadClient =
        typeof adminClient !== 'undefined' && adminClient?.from ? adminClient : actorClient;
      const { data: studentsRows, error: studentsErr } = await fetchAllM5Rows((from, to) =>
        studentsReadClient.from('students').select('*, profiles(*)').order('id', { ascending: true }).range(from, to)
      );
      if (studentsErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: quizRows, error: quizErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('quiz_results').select('*').eq('class_id', classId)
          .order('student_id', { ascending: true }).order('lesson_id', { ascending: true }).range(from, to)
      );
      if (quizErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      const { data: subRows, error: subErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('practice_submissions').select('*').eq('class_id', classId)
          .order('student_id', { ascending: true }).order('lesson_id', { ascending: true }).order('id', { ascending: true }).range(from, to)
      );
      if (subErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      // R5-03: Đọc các thao tác đóng khóa cũ của lớp để xác định lịch sử
      const { data: opRows, error: opErr } = await fetchAllM5Rows((from, to) =>
        actorClient.from('m5_course_close_operations').select('*').eq('class_id', classId)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
      );
      if (opErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }

      // R5-02: Lọc chặt quizRows và subRows theo các bài học của khóa hiện tại
      const courseLessonIds = new Set((lessonsRows || []).map((l: any) => l.id));
      const relevantQuizRows = (quizRows || []).filter((q: any) => courseLessonIds.has(q.lesson_id));
      const relevantSubRows = (subRows || []).filter((s: any) => courseLessonIds.has(s.lesson_id));

      const flattenedStudents = (studentsRows || []).map((s: any) => ({
        id: s.id,
        participantId: s.participant_id || '',
        studentCode: s.student_code || '',
        fullName:
          (Array.isArray(s.profiles) ? s.profiles[0]?.full_name : s.profiles?.full_name) ||
          s.full_name ||
          s.fullName ||
          '',
        originalClassId: s.original_class_id || '',
        currentClassId: s.current_class_id || '',
        status: s.status || 'active',
        notes: s.notes || '',
      }));

      const flattenedCohort = (cohortRows || []).map((cm: any) => ({
        id: cm.student_id,
        studentId: cm.student_id,
        classId: cm.class_id,
        courseId: cm.course_id,
        participantId: cm.participant_id,
        membershipStatus: cm.membership_status,
        status: cm.membership_status,
        notes: cm.notes_snapshot,
      }));

      const flattenedLessons = (lessonsRows || []).map((l: any) => ({
        id: l.id,
        courseId: l.course_id,
        sessionNumber: l.session_number,
        title: l.title,
        status: l.status,
        hasQuiz: l.has_quiz,
        hasPractice: l.has_practice,
      }));

      const flattenedQuizzes = relevantQuizRows.map((q: any) => ({
        studentId: q.student_id,
        lessonId: q.lesson_id,
        classId: q.class_id,
        highestScore: q.highest_score,
        passed: q.passed,
        attemptsCount: q.attempts_count,
      }));

      const flattenedSubs = relevantSubRows.map((s: any) => ({
        id: s.id,
        studentId: s.student_id,
        lessonId: s.lesson_id,
        classId: s.class_id,
        type: s.type,
        content: s.content,
        fileSizeBytes: s.file_size_bytes,
        status: s.status,
        teacherFeedback: s.teacher_feedback,
      }));

      const batchStudents = resolveM5Participants({
        students: flattenedStudents,
        classId,
        courseId: classRow.course_id,
        cohortMembers: flattenedCohort,
        quizResults: flattenedQuizzes,
        submissions: flattenedSubs,
        lessons: flattenedLessons,
        closedOperations: opRows || [],
      });

      const { csvContent, rowCount, participantCount } = buildM5CsvContent(
        batchStudents,
        flattenedLessons,
        classRow.code,
        flattenedQuizzes,
        flattenedSubs,
        { classId, courseId: classRow.course_id }
      );

      const verification = await verifyM5Csv(csvContent, {
        participants: batchStudents,
        lessons: flattenedLessons,
        classCode: classRow.code,
        classId,
        courseId: classRow.course_id,
        quizResults: flattenedQuizzes,
        submissions: flattenedSubs,
        classItem: classRow,
      });

      if (!verification.valid) {
        return jsonResponse(
          {
            success: false,
            code: 'CSV_VERIFICATION_FAILED',
            message: `Kiểm tra CSV thất bại: ${verification.errors.join('; ')}`,
            errors: verification.errors,
          },
          400
        );
      }

      // Lưu biên nhận xác minh qua adminClient.rpc('m5_save_csv_verification') (R3-01 / P1-05 / R5-01)
      const { data: opId, error: saveErr } = await adminClient.rpc('m5_save_csv_verification', {
        p_class_id: classId,
        p_course_id: payloadCourseId,
        p_csv_sha256: verification.sha256,
        p_snapshot_digest: verification.snapshotDigest,
        p_confirmed_14_sessions: confirmed14Sessions,
        p_actor_id: actor.profileId,
      });

      if (saveErr) {
        if (String(saveErr.message || '').includes('CLASS_COURSE_MISMATCH')) {
          return jsonResponse(
            { success: false, message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.', code: 'CLASS_COURSE_MISMATCH' },
            409
          );
        }
        return jsonResponse(
          { success: false, message: saveErr.message || 'Lỗi lưu biên nhận xác minh CSV.', code: 'DB_ERROR' },
          500
        );
      }

      // P1-02: Trả về csvContent, verification, snapshotDigest, và cohortMembers chuẩn
      return jsonResponse({
        success: true,
        message: 'Đã xuất và xác minh tệp CSV tổng kết 14 buổi thành công.',
        data: {
          classId,
          operationId: opId,
          csvContent,
          sha256: verification.sha256,
          snapshotDigest: verification.snapshotDigest,
          verification,
          cohortMembers: flattenedCohort,
          rowCount,
          participantCount,
        },
      });
    }

    if (action === 'm5-execute-course-close') {
      const { actor, actorClient, errorResponse } = await requireAdminActor(adminClient, body.accessToken);
      if (errorResponse || !actor || !actorClient) {
        return errorResponse ?? jsonResponse(
          { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
          401
        );
      }

      const classId = String(body.payload?.classId || '').trim();
      const payloadCourseId = String(body.payload?.courseId || '').trim();
      const nextCourseId = body.payload?.nextCourseId || null;
      const simulateFailureStage = body.payload?.simulateFailureStage || null;
      const confirmed14Sessions = Boolean(body.payload?.confirmed14Sessions);
      const isResume = Boolean(body.payload?.isResume);
      const confirmedCsvOpened = body.payload?.confirmedCsvOpened;
      const confirmedCsvSha256 = body.payload?.confirmedCsvSha256
        ? String(body.payload.confirmedCsvSha256).trim()
        : null;

      // R8-03: Bắt buộc Admin phải xác nhận đã tải, mở và kiểm tra tệp CSV mới nhất đúng lớp/khóa trước khi xóa
      if (!isResume) {
        if (body.payload?.confirmedCsvOpened !== true) {
          return jsonResponse(
            {
              success: false,
              status: 'blocked',
              code: 'CSV_OPEN_NOT_CONFIRMED',
              message: 'Admin phải mở tệp CSV, kiểm tra đúng lớp/khóa và đánh dấu xác nhận trước khi thực thi xóa dữ liệu.',
            },
            400
          );
        }
        // R10-02: Bắt buộc có mã SHA-256 không rỗng khi bắt đầu đóng khóa mới
        if (!confirmedCsvSha256) {
          return jsonResponse(
            {
              success: false,
              status: 'blocked',
              code: 'CSV_OPEN_NOT_CONFIRMED',
              message: 'Phải cung cấp mã kiểm tra SHA-256 của tệp CSV đã mở và xác nhận trước khi thực thi xóa dữ liệu.',
            },
            400
          );
        }
        // R13-06: Đóng khóa mới bắt buộc request hiện hành phải xác nhận đủ 14 buổi (không dựa vào giá trị đã lưu trước đó)
        if (!confirmed14Sessions) {
          return jsonResponse(
            {
              success: false,
              status: 'blocked',
              code: 'SCHEDULE_14_NOT_CONFIRMED',
              message: 'Chưa có xác nhận hoàn thành đủ 14 buổi học của lớp.',
            },
            400
          );
        }
      }

      const { data: classRow, error: classErr } = await actorClient.from('classes').select('*').eq('id', classId).maybeSingle();
      if (classErr) {
        return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
      }
      if (!classRow) {
        return jsonResponse({ success: false, message: 'Lớp học không tồn tại.', code: 'NOT_FOUND' }, 404);
      }

      // R20-02: Bắt buộc courseId của đợt học Admin đang xác nhận; khóa của lớp đã đổi thì từ chối, không ghi sang khóa mới
      if (!payloadCourseId) {
        return jsonResponse(
          {
            success: false,
            status: 'blocked',
            code: 'INVALID_INPUT',
            message: 'Phải cung cấp mã khóa học (courseId) của đợt học cần đóng.',
          },
          400
        );
      }
      if (!classRow.course_id || String(classRow.course_id) !== payloadCourseId) {
        return jsonResponse(
          {
            success: false,
            status: 'blocked',
            code: 'CLASS_COURSE_MISMATCH',
            message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.',
          },
          409
        );
      }

      // R8-03: Đối chiếu SHA-256 của bản CSV được Admin mở xác nhận với bản CSV mới nhất trong database
      if (!isResume) {
        const { data: latestOp, error: latestOpErr } = await adminClient
          .from('m5_course_close_operations')
          .select('csv_sha256')
          .eq('class_id', classId)
          .eq('course_id', classRow.course_id)
          .in('status', ['csv_verified', 'incomplete', 'deleting_storage', 'deleting_db'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestOpErr) {
          return jsonResponse({ success: false, message: 'Lỗi đọc dữ liệu đợt học từ máy chủ; đã dừng để đảm bảo toàn vẹn.', code: 'DB_READ_FAILED' }, 500);
        }

        // R10-02: Fail-Closed — thiếu mã băm đã lưu hoặc lệch mã băm đều bị chặn
        if (!latestOp?.csv_sha256 || latestOp.csv_sha256 !== confirmedCsvSha256) {
          return jsonResponse(
            {
              success: false,
              status: 'blocked',
              code: 'CSV_SHA256_MISMATCH',
              message: 'Bản CSV được xác nhận không khớp với bản CSV mới nhất đã đối chiếu của đợt học.',
            },
            400
          );
        }
      }

      // P1-05 / R20-02: Xác nhận 14 buổi được ghi nguyên tử duy nhất bên trong m5_begin_course_close
      // (sau khi giữ khóa m4_teaching_sync -> m5_storage_quota -> m5_close:<class_id> và kiểm tra đúng course_id);
      // ở đây chỉ gán trong bộ nhớ, tuyệt đối không ghi riêng vào bảng classes.
      if (confirmed14Sessions) {
        classRow.is_14_sessions_confirmed = true;
      }

      // P1-06 / R3-04: Chặn mô phỏng lỗi TEST ngoài môi trường TEST hoặc trên lớp không phải fixture (Fail-Closed)
      if (simulateFailureStage && simulateFailureStage !== 'none') {
        if (!isVerifiedTestEnvironment() || !classRow.is_fixture) {
          return jsonResponse(
            {
              success: false,
              message: 'Mô phỏng lỗi kỹ thuật chỉ được phép thực hiện trên lớp học thử nghiệm (fixture) và ngoài môi trường Production.',
              code: !isVerifiedTestEnvironment() ? 'TEST_OPERATION_DISABLED_IN_PROD' : 'SIMULATION_ONLY_ALLOWED_ON_FIXTURE_CLASS',
            },
            400
          );
        }
      }

      // Bước 1: Khởi chạy đóng khóa qua adminClient.rpc('m5_begin_course_close') (R3-01 / R5-01 / R7-01 / R8-03)
      const { data: beginData, error: beginErr } = await adminClient.rpc('m5_begin_course_close', {
        p_class_id: classId,
        p_course_id: payloadCourseId,
        p_next_course_id: nextCourseId,
        p_confirmed_14_sessions: confirmed14Sessions,
        p_actor_id: actor.profileId,
        p_is_resume: isResume,
        p_confirmed_csv_sha256: confirmedCsvSha256,
      });

      if (beginErr) {
        // R20-02: Lớp đã chuyển sang khóa khác ngay trước/trong lúc RPC giữ khóa -> từ chối, không ghi gì sang khóa mới
        if (beginErr.message?.includes('CLASS_COURSE_MISMATCH')) {
          return jsonResponse(
            {
              success: false,
              status: 'blocked',
              code: 'CLASS_COURSE_MISMATCH',
              message: 'Khóa học của lớp đã thay đổi. Vui lòng tải lại dữ liệu mới nhất.',
            },
            409
          );
        }
        const isShaMismatch = beginErr.message?.includes('CSV_SHA256_MISMATCH');
        // R18-01: Đợt học có chung học sinh với tác vụ đóng khóa dở dang của lớp khác
        const isSharedCohort = beginErr.message?.includes('SHARED_COHORT_CLOSE_IN_PROGRESS');
        return jsonResponse(
          {
            success: false,
            message: beginErr.message || 'Lỗi khi bắt đầu quy trình đóng khóa.',
            code: isShaMismatch ? 'CSV_SHA256_MISMATCH' : isSharedCohort ? 'SHARED_COHORT_CLOSE_IN_PROGRESS' : 'BEGIN_ERROR',
          },
          400
        );
      }

      const beginRow = Array.isArray(beginData) ? beginData[0] : beginData;
      const operationId = beginRow.operation_id;
      // R13-06: mã phiên thực thi để chặn tiến trình cũ ghi đè khi một tiến trình Resume mới hơn đã tiếp quản
      const executionRunId = beginRow.execution_run_id || null;
      let remainingPaths: string[] = Array.isArray(beginRow.remaining_storage_paths)
        ? beginRow.remaining_storage_paths
        : [];
      let deletedPaths: string[] = Array.isArray(beginRow.deleted_storage_paths)
        ? beginRow.deleted_storage_paths
        : [];

      // Bước 2: Chia lô Storage tối đa 1.000 tệp
      const batches = chunkStoragePaths(remainingPaths, 1000);

      // Bước 3: Duyệt từng lô
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        const shouldSimulateMidFail =
          simulateFailureStage === 'mid_storage_batch' && (batches.length === 1 || i >= 1);

        if (shouldSimulateMidFail) {
          const { error: simProgressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
            p_operation_id: operationId,
            p_deleted_paths: deletedPaths,
            p_remaining_paths: remainingPaths,
            p_status: 'incomplete',
            p_error_code: 'SIMULATED_MID_STORAGE_BATCH_FAILURE',
            p_error_message: `Mô phỏng lỗi kỹ thuật ở lô Storage thứ ${i + 1}.`,
            p_actor_id: actor.profileId,
            p_execution_run_id: executionRunId,
          });

          if (simProgressErr) {
            return jsonResponse(
              {
                success: false,
                status: 'incomplete',
                code: 'STORAGE_PROGRESS_UPDATE_FAILED',
                message: `Lỗi cập nhật tiến độ xóa tệp vào cơ sở dữ liệu: ${simProgressErr.message || simProgressErr}. Vui lòng bấm Tiếp tục (Resume) để thử lại.`,
                data: { operationId, deletedPaths, remainingPaths },
              },
              500
            );
          }

          return jsonResponse({
            success: false,
            status: 'incomplete',
            code: 'SIMULATED_MID_STORAGE_BATCH_FAILURE',
            message: `Mô phỏng sự cố tại lô Storage thứ ${i + 1}. Tác vụ dừng ở trạng thái Chưa hoàn tất (incomplete).`,
            data: { operationId, deletedPaths, remainingPaths },
          });
        }

        // R13-06: gia hạn lease mỗi 15 giây trong lúc chờ xóa lô Storage để Resume khác không chạy song song
        const leaseHeartbeat = setInterval(() => {
          Promise.resolve(
            adminClient.rpc('m5_heartbeat_course_close_lease', {
              p_operation_id: operationId,
              p_execution_run_id: executionRunId,
              p_actor_id: actor.profileId,
            })
          ).catch(() => {});
        }, 15000);
        let removeError: { message?: string } | null = null;
        try {
          const removeResult = await adminClient.storage
            .from('m3-practice-files')
            .remove(batch);
          removeError = removeResult.error;
        } finally {
          clearInterval(leaseHeartbeat);
        }

        if (removeError) {
          const { error: removeProgressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
            p_operation_id: operationId,
            p_deleted_paths: deletedPaths,
            p_remaining_paths: remainingPaths,
            p_status: 'incomplete',
            p_error_code: 'STORAGE_REMOVE_ERROR',
            p_error_message: removeError.message,
            p_actor_id: actor.profileId,
            p_execution_run_id: executionRunId,
          });

          if (removeProgressErr) {
            return jsonResponse(
              {
                success: false,
                status: 'incomplete',
                code: 'STORAGE_PROGRESS_UPDATE_FAILED',
                message: `Lỗi cập nhật tiến độ xóa tệp vào cơ sở dữ liệu: ${removeProgressErr.message || removeProgressErr}. Vui lòng bấm Tiếp tục (Resume) để thử lại.`,
                data: { operationId, deletedPaths, remainingPaths },
              },
              500
            );
          }

          return jsonResponse(
            {
              success: false,
              status: 'incomplete',
              code: 'STORAGE_REMOVE_ERROR',
              message: `Lỗi khi xóa tệp trên hệ thống lưu trữ: ${removeError.message}`,
              data: { operationId, deletedPaths, remainingPaths },
            },
            500
          );
        }

        deletedPaths = [...deletedPaths, ...batch];
        remainingPaths = remainingPaths.filter((p) => !batch.includes(p));

        const { error: progressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
          p_operation_id: operationId,
          p_deleted_paths: deletedPaths,
          p_remaining_paths: remainingPaths,
          p_status: remainingPaths.length === 0 ? 'deleting_db' : 'deleting_storage',
          p_actor_id: actor.profileId,
          p_execution_run_id: executionRunId,
        });

        if (progressErr) {
          return jsonResponse(
            {
              success: false,
              status: 'incomplete',
              code: 'STORAGE_PROGRESS_UPDATE_FAILED',
              message: `Lỗi cập nhật tiến độ xóa tệp vào cơ sở dữ liệu: ${progressErr.message || progressErr}. Vui lòng bấm Tiếp tục (Resume) để hoàn tất.`,
              data: { operationId, deletedPaths, remainingPaths },
            },
            500
          );
        }
      }

      // Bước 4: Kiểm tra mô phỏng lỗi giữa Storage và DB
      if (simulateFailureStage === 'between_storage_and_db') {
        const { error: midProgressErr } = await adminClient.rpc('m5_update_course_close_storage_progress', {
          p_operation_id: operationId,
          p_deleted_paths: deletedPaths,
          p_remaining_paths: [],
          p_status: 'incomplete',
          p_error_code: 'DB_CLEANUP_INTERRUPTED_AFTER_STORAGE',
          p_error_message: 'Mô phỏng sự cố mạng/máy chủ giữa công đoạn Storage và DB.',
          p_actor_id: actor.profileId,
          p_execution_run_id: executionRunId,
        });

        if (midProgressErr) {
          return jsonResponse(
            {
              success: false,
              status: 'incomplete',
              code: 'STORAGE_PROGRESS_UPDATE_FAILED',
              message: `Lỗi cập nhật tiến độ xóa tệp vào cơ sở dữ liệu: ${midProgressErr.message || midProgressErr}. Vui lòng bấm Tiếp tục (Resume) để thử lại.`,
              data: { operationId, deletedPaths, remainingPaths: [] },
            },
            500
          );
        }

        return jsonResponse({
          success: false,
          status: 'incomplete',
          code: 'DB_CLEANUP_INTERRUPTED_AFTER_STORAGE',
          message: 'Mô phỏng sự cố trước khi xóa cơ sở dữ liệu. Tác vụ dừng ở trạng thái Chưa hoàn tất (incomplete).',
          data: { operationId, deletedPaths, remainingPaths: [] },
        });
      }

      // Bước 5: Hoàn tất xóa DB qua adminClient.rpc('m5_finalize_course_close_db') (R3-01 / R5-01)
      const { data: finalizeData, error: finErr } = await adminClient.rpc('m5_finalize_course_close_db', {
        p_operation_id: operationId,
        p_class_id: classId,
        p_course_id: payloadCourseId,
        p_next_course_id: nextCourseId,
        p_actor_id: actor.profileId,
        p_execution_run_id: executionRunId,
      });

      if (finErr) {
        return jsonResponse(
          { success: false, message: finErr.message || 'Lỗi khi hoàn tất đóng khóa trên cơ sở dữ liệu.', code: 'DB_ERROR' },
          500
        );
      }

      return jsonResponse({
        success: true,
        status: 'completed',
        data: finalizeData,
        message: nextCourseId
          ? 'Đã đóng khóa học cũ và gán thành công khóa học mới cho lớp (tiến độ 0/14).'
          : 'Đã đóng khóa học cũ và chuyển lớp học sang trạng thái Hoàn thành (completed).',
      });
    }

    return jsonResponse(
      { success: false, message: STATIC_MESSAGES.UNKNOWN_ACTION, code: 'UNKNOWN_ACTION' },
      400
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
      500
    );
  }
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handleRequest);
}
