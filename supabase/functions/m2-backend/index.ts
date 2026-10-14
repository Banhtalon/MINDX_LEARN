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

  // 2. Validate token signature with Supabase GoTrue Auth
  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  if (userError || !userData?.user || userData.user.id !== authUserId) {
    return {
      errorResponse: jsonResponse(
        { success: false, message: STATIC_MESSAGES.UNAUTHORIZED, code: 'UNAUTHORIZED' },
        401
      ),
    };
  }

  // 3. Verify actual native auth.sessions row, mapping, profile status and class status via RPC
  const { data: sessionData, error: sessionError } = await adminClient.rpc('m2_verify_actor_session', {
    p_auth_user_id: authUserId,
    p_session_id: claims.session_id,
    p_expected_version: tokenVersion,
  });

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
Deno.serve(async (req: Request) => {
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
    const { data: isValidSecret, error: secretError } = await adminClient.rpc('m2_verify_bff_secret', {
      p_secret_sha256: secretHash,
    });

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
      const { error: syncErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        app_metadata: {
          role: 'student',
          m2_session_version: profile.session_version,
        },
      });

      if (syncErr) {
        return jsonResponse(
          { success: false, message: STATIC_MESSAGES.INTERNAL_ERROR, code: 'AUTH_SYNC_FAILED' },
          500
        );
      }

      const anonClient = createAnonClient();
      const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
        email: mapping.auth_email,
        password: authPassword,
      });

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

      const redirectUrl = trustedSiteURL
        ? `${trustedSiteURL.replace(/\/$/, '')}/auth/callback`
        : 'https://mindx-learn-test.vercel.app/auth/callback';

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
      const redirectUrl = trustedSiteURL
        ? `${trustedSiteURL.replace(/\/$/, '')}/auth/callback`
        : 'https://mindx-learn-test.vercel.app/auth/callback';

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

      const { data: profile, error: profErr } = await actorClient
        .from('profiles')
        .select('id, full_name, email, student_code, role, status')
        .eq('id', actor.profileId)
        .single();

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
        const { data: allProfiles } = await actorClient
          .from('profiles')
          .select('id, full_name, email, role, status')
          .in('role', ['admin', 'teacher']);

        const { data: ctAll } = await actorClient
          .from('class_teachers')
          .select('class_id, teacher_profile_id');

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

        const { data: allClasses } = await actorClient
          .from('classes')
          .select('id, code, name, course_id, status, is_14_sessions_confirmed');

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

        const { data: allStudents } = await actorClient
          .from('students')
          .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes');

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
        const { data: myCt } = await actorClient
          .from('class_teachers')
          .select('class_id')
          .eq('teacher_profile_id', actor.profileId);

        const assignedClassIds = (myCt || []).map((ct: any) => ct.class_id);
        currentUser.assignedClassIds = assignedClassIds;
        users = [currentUser];

        const { data: myClasses } = await actorClient
          .from('classes')
          .select('id, code, name, course_id, status, is_14_sessions_confirmed');

        classes = (myClasses || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          courseId: c.course_id,
          teacherId: actor.profileId,
          status: c.status,
          is14SessionsConfirmed: c.is_14_sessions_confirmed,
        }));

        const { data: myStudents } = await actorClient
          .from('students')
          .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes');

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
      } else if (actor.role === 'student') {
        const { data: myStudent } = await actorClient
          .from('students')
          .select('id, participant_id, student_code, full_name, current_class_id, original_class_id, pin_issued_at, status, notes')
          .maybeSingle();

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

          const { data: myClass } = await actorClient
            .from('classes')
            .select('id, code, name, course_id, status, is_14_sessions_confirmed')
            .maybeSingle();

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

      return jsonResponse({
        success: true,
        data: {
          currentUser,
          users,
          classes,
          students,
          courses: [],
          lessons: [],
          quizResults: [],
          submissions: [],
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

        if (courseId !== undefined && courseId !== null) {
          return jsonResponse(
            { success: false, message: 'Khóa học chưa được hỗ trợ trong M2.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        if (!code || typeof code !== 'string' || !code.trim() || !name || typeof name !== 'string' || !name.trim()) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const targetTeacherId = teacherId && isValidUUID(teacherId) ? teacherId : null;

        const { data: savedClassData, error: saveErr } = await adminClient.rpc('m2_save_class', {
          p_admin_profile_id: actor.profileId,
          p_class_id: null,
          p_code: code.trim(),
          p_name: name.trim(),
          p_teacher_id: targetTeacherId,
        });

        const savedClass = savedClassData?.[0];
        if (saveErr || !savedClass) {
          return jsonResponse(
            { success: false, message: 'Không thể tạo lớp học. Mã lớp có thể đã tồn tại.', code: 'DB_ERROR' },
            400
          );
        }

        const classDTO: ClassDTO = {
          id: savedClass.id,
          code: savedClass.code,
          name: savedClass.name,
          courseId: null,
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

        if (data.courseId !== undefined && data.courseId !== null) {
          return jsonResponse(
            { success: false, message: 'Khóa học chưa được hỗ trợ trong M2.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        // Fetch current class to preserve unsupplied fields
        const { data: curClass, error: curErr } = await adminClient
          .from('classes')
          .select('code, name')
          .eq('id', id)
          .single();

        if (curErr || !curClass) {
          return jsonResponse(
            { success: false, message: 'Lớp học không tồn tại.', code: 'NOT_FOUND' },
            404
          );
        }

        const finalCode = data.code ? data.code.trim() : curClass.code;
        const finalName = data.name ? data.name.trim() : curClass.name;

        let finalTeacherId: string | null = null;
        if (data.teacherId !== undefined) {
          finalTeacherId = data.teacherId && isValidUUID(data.teacherId) ? data.teacherId : null;
        } else {
          const { data: ctRow } = await adminClient
            .from('class_teachers')
            .select('teacher_profile_id')
            .eq('class_id', id)
            .maybeSingle();
          finalTeacherId = ctRow ? ctRow.teacher_profile_id : null;
        }

        const { data: savedClassData, error: saveErr } = await adminClient.rpc('m2_save_class', {
          p_admin_profile_id: actor.profileId,
          p_class_id: id,
          p_code: finalCode,
          p_name: finalName,
          p_teacher_id: finalTeacherId,
        });

        const savedClass = savedClassData?.[0];
        if (saveErr || !savedClass) {
          return jsonResponse(
            { success: false, message: 'Không thể cập nhật lớp học.', code: 'DB_ERROR' },
            400
          );
        }

        const classDTO: ClassDTO = {
          id: savedClass.id,
          code: savedClass.code,
          name: savedClass.name,
          courseId: null,
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
          assignedClassIds?: string[];
        };

        if (!name || typeof name !== 'string' || !name.trim() || !isValidEmail(email)) {
          return jsonResponse(
            { success: false, message: 'Họ tên và email giáo viên không hợp lệ.', code: 'INVALID_PAYLOAD' },
            400
          );
        }

        const normEmail = email.trim().toLowerCase();

        // Reject @example.invalid in normal UI (QA bridge handles fake accounts)
        if (normEmail.endsWith('@example.invalid')) {
          return jsonResponse(
            { success: false, message: 'Không thể tạo giáo viên với địa chỉ email thử nghiệm.', code: 'INVALID_EMAIL' },
            400
          );
        }

        const redirectUrl = 'https://mindx-learn-test.vercel.app/auth/callback';

        const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(normEmail, {
          redirectTo: redirectUrl,
          data: { role: 'teacher' },
        });

        if (inviteErr || !inviteData?.user || !inviteData.user.invited_at) {
          return jsonResponse(
            { success: false, message: 'Không thể gửi email kích hoạt cho giáo viên.', code: 'EMAIL_SEND_FAILED' },
            500
          );
        }

        const authUserId = inviteData.user.id;
        const inviteIssuedAt = inviteData.user.invited_at;

        const { error: metaErr } = await adminClient.auth.admin.updateUserById(authUserId, {
          app_metadata: {
            role: 'teacher',
            m2_session_version: 1,
          },
        });

        if (metaErr) {
          await adminClient.auth.admin.deleteUser(authUserId);
          return jsonResponse(
            { success: false, message: 'Không thể thiết lập quyền giáo viên.', code: 'AUTH_UPDATE_FAILED' },
            500
          );
        }

        let newProfileId = crypto.randomUUID();
        while (newProfileId.toLowerCase() === authUserId.toLowerCase()) {
          newProfileId = crypto.randomUUID();
        }

        const { data: newProfile, error: profErr } = await adminClient
          .from('profiles')
          .insert({
            id: newProfileId,
            role: 'teacher',
            full_name: name.trim(),
            email: normEmail,
            status: 'active',
            session_version: 1,
            is_fixture: false,
          })
          .select()
          .single();

        if (profErr || !newProfile) {
          await adminClient.auth.admin.deleteUser(authUserId);
          return jsonResponse(
            { success: false, message: 'Không thể lưu hồ sơ giáo viên.', code: 'DB_ERROR' },
            500
          );
        }

        const { error: mapErr } = await adminClient.rpc('m2_create_actor_auth', {
          p_auth_user_id: authUserId,
          p_profile_id: newProfile.id,
          p_role: 'teacher',
          p_auth_email: normEmail,
          p_session_version: 1,
          p_invite_pending: true,
          p_invite_issued_at: inviteIssuedAt,
        });

        if (mapErr) {
          await adminClient.from('profiles').delete().eq('id', newProfile.id);
          await adminClient.auth.admin.deleteUser(authUserId);
          return jsonResponse(
            { success: false, message: 'Không thể tạo bản đồ danh tính giáo viên.', code: 'DB_ERROR' },
            500
          );
        }

        const createdAssignments: string[] = [];
        if (Array.isArray(assignedClassIds) && assignedClassIds.length > 0) {
          for (const cid of assignedClassIds) {
            if (!isValidUUID(cid)) {
              await adminClient.from('class_teachers').delete().eq('teacher_profile_id', newProfile.id);
              await adminClient.from('profiles').delete().eq('id', newProfile.id);
              await adminClient.auth.admin.deleteUser(authUserId);
              return jsonResponse(
                { success: false, message: 'Mã lớp phân công không hợp lệ.', code: 'INVALID_PAYLOAD' },
                400
              );
            }

            const { data: assignOk, error: assignErr } = await adminClient.rpc('m2_assign_class_teacher', {
              p_admin_profile_id: actor.profileId,
              p_class_id: cid,
              p_teacher_id: newProfile.id,
            });

            if (assignErr || assignOk !== true) {
              await adminClient.from('class_teachers').delete().eq('teacher_profile_id', newProfile.id);
              await adminClient.from('profiles').delete().eq('id', newProfile.id);
              await adminClient.auth.admin.deleteUser(authUserId);
              return jsonResponse(
                { success: false, message: 'Không thể phân công lớp cho giáo viên.', code: 'DB_ERROR' },
                500
              );
            }
            createdAssignments.push(cid);
          }
        }

        return jsonResponse({
          success: true,
          data: {
            id: newProfile.id,
            name: newProfile.full_name,
            email: newProfile.email,
            role: 'teacher',
            status: newProfile.status,
            assignedClassIds: createdAssignments,
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
        if (!data) {
          return jsonResponse(
            { success: false, message: STATIC_MESSAGES.INVALID_PAYLOAD, code: 'INVALID_PAYLOAD' },
            400
          );
        }
        const studentUpd: Record<string, unknown> = {};
        const profileUpd: Record<string, unknown> = {};
        if (data.fullName) {
          studentUpd.full_name = data.fullName.trim();
          profileUpd.full_name = data.fullName.trim();
        }
        if (data.notes !== undefined) {
          studentUpd.notes = data.notes.trim();
        }

        const { error: stErr } = await adminClient.from('students').update(studentUpd).eq('id', id);
        if (stErr) {
          return jsonResponse(
            { success: false, message: 'Không thể cập nhật thông tin học sinh.', code: 'DB_ERROR' },
            500
          );
        }

        if (Object.keys(profileUpd).length > 0) {
          await adminClient.from('profiles').update(profileUpd).eq('id', id);
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
      };

      if (fixtureType !== 'qa-actor') {
        return jsonResponse(
          { success: false, message: 'Loại fixture không được hỗ trợ. Chỉ hỗ trợ qa-actor.', code: 'INVALID_FIXTURE_TYPE' },
          400
        );
      }

      if (testPassword !== undefined) {
        return jsonResponse(
          { success: false, message: 'Sử dụng authPassword thay cho testPassword.', code: 'INVALID_PAYLOAD' },
          400
        );
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
    // ACTION: coordinator-storage-fixture (Test Harness / Sol Live Verification Only)
    // --------------------------------------------------------------------------
    if (action === 'coordinator-storage-fixture') {
      if (!isExactTestOrigin(SUPABASE_URL)) {
        return jsonResponse(
          { success: false, message: 'Coordinator storage fixture chỉ khả dụng trên môi trường TEST.', code: 'FORBIDDEN' },
          403
        );
      }

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
});
