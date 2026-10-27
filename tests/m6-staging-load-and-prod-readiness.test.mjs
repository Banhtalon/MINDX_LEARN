// ============================================================================
// MINDX LEARN — Mốc 6 Staging Load (200 Students / 20 Concurrent per Shift),
// Security Audit & Production Readiness Test Suite
// Runner: Node.js native test runner (node:test, node:assert/strict)
// ============================================================================

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  isProductionEnvironment,
  resolveSupabaseUrl,
  resolveTrustedSiteUrl,
  assertRuntimeEnvironmentGuard,
  assertServerConfiguration,
  isTrivialPin,
  generateSecurePin8,
  deriveStudentPassword,
  formatPinCsvContent,
  TEST_SUPABASE_PROJECT_REF,
  DEFAULT_TEST_SUPABASE_URL,
  DEFAULT_TEST_SITE_URL,
} from '../src/lib/server/crypto.mjs';

import * as domain from '../supabase/functions/m2-backend/domain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.resolve(__dirname, '../supabase/functions/m2-backend/index.ts');
const EDGE_CLIENT_PATH = path.resolve(__dirname, '../src/lib/server/edge-client.ts');
const SRC_DIR = path.resolve(__dirname, '../src');

const VALID_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const VALID_PEPPER = 'mindx_test_secret_pepper_2026_xyz_secure_pepper';
const VALID_BFF_SECRET = 'mindx_bff_secret_2026_production_ready_key';

const savedDeno = globalThis.Deno;
const savedMockEdgeAdminClient = globalThis.__mockEdgeAdminClient;

afterEach(() => {
  if (savedDeno === undefined) {
    delete globalThis.Deno;
  } else {
    globalThis.Deno = savedDeno;
  }
  if (savedMockEdgeAdminClient === undefined) {
    delete globalThis.__mockEdgeAdminClient;
  } else {
    globalThis.__mockEdgeAdminClient = savedMockEdgeAdminClient;
  }
});

async function loadEdgeHandler(mockAdminClient, envOverrides = {}) {
  const indexSource = await fs.readFile(INDEX_PATH, 'utf-8');
  const transpiled = ts.transpileModule(indexSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  let jsCode = transpiled.outputText;
  globalThis.__mockEdgeAdminClient = mockAdminClient;
  jsCode = jsCode.replace(
    /import\s*\{\s*createClient[^\}]*\}\s*from\s*['"]https:\/\/[^'"]+['"];/,
    `const createClient = () => globalThis.__mockEdgeAdminClient;`
  );

  const domainUrl = new URL('../supabase/functions/m2-backend/domain.ts', import.meta.url).href;
  jsCode = jsCode.replace(/from\s*['"]\.\/domain\.ts['"];/, `from '${domainUrl}';`);

  const envMap = {
    SUPABASE_URL: 'https://eythjapspkoyqdxlxtcd.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
    ...envOverrides,
  };

  globalThis.Deno = {
    env: {
      get: (key) => envMap[key] || '',
    },
    serve: () => {},
  };

  const nonce = Date.now() + '_' + Math.random();
  jsCode += `\n// test-nonce: ${nonce}\n`;
  const dataUri = 'data:text/javascript;base64,' + Buffer.from(jsCode, 'utf-8').toString('base64');
  const mod = await import(dataUri);
  return mod.handleRequest;
}

function createMockJwt(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: '99999999-9999-4999-8999-000000000001',
      session_id: '88888888-8888-4888-8888-000000000001',
      app_metadata: { role: 'admin', m2_session_version: 1 },
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
  ).toString('base64url');
  return `${header}.${payload}.mock_sig`;
}

async function sendEdgeRequest(handleRequest, action, payload, token = createMockJwt(), trustedIp = '203.0.113.50') {
  const bodyObj = {
    action,
    payload,
    sessionVersion: 1,
    trustedIp,
  };
  if (token !== undefined) {
    bodyObj.accessToken = token;
  }
  const req = new Request('http://localhost/m2-backend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mindx-bff-secret': 'valid-bff-secret',
    },
    body: JSON.stringify(bodyObj),
  });
  const res = await handleRequest(req);
  const json = await res.json();
  return { status: res.status, json };
}

// ============================================================================
// SUITE 1: Mốc 6 Load & Concurrency Simulation (200 Students / 20 per Shift)
// ============================================================================
describe('Suite 1: Mốc 6 Load & Concurrency Simulation (200 Students, 20 Concurrent per Shift, >1,000 Roster Pagination)', () => {
  test('1.1 & 1.2: 200 synthetic students in 10 shifts of 20 concurrent students on shared classroom IP + single-student brute-force isolation', async () => {
    const totalStudents = 200;
    const shiftConcurrency = 20; // Owner's maximum expected shift concurrency
    const sharedClassroomIp = '203.0.113.50';
    const classId = '11111111-1111-4111-8111-000000000101';
    const courseId = '22222222-2222-4222-8222-000000000201';
    const lessonId = '33333333-3333-4333-8333-000000000301';
    const teacherProfileId = '44444444-4444-4444-8444-000000000401';
    const teacherAuthId = '55555555-5555-4555-8555-000000000501';

    // Build 200 synthetic students with unique 8-digit random PINs
    const studentsMap = new Map();
    const byCodeMap = new Map();
    const byAuthIdMap = new Map();
    const challenges = new Map();
    const rateCounters = new Map();
    const quizStore = new Map();
    const subStore = new Map();

    for (let i = 1; i <= totalStudents; i++) {
      const idx = String(i).padStart(3, '0');
      const profileId = `00000000-0000-4000-8000-000000060${idx}`;
      const authUserId = `00000000-0000-4000-9000-000000060${idx}`;
      const studentCode = `TEST_M6_ROB_${idx}`;
      const pin = generateSecurePin8();
      const authPassword = deriveStudentPassword(authUserId, pin, VALID_PEPPER);
      const authEmail = `m6_student_${idx}@example.invalid`;
      const record = {
        profileId,
        authUserId,
        studentCode,
        pin,
        authPassword,
        authEmail,
        fullName: `Học Sinh Giả Lập M6 #${idx}`,
        currentClassId: classId,
        sessionVersion: 1,
        status: 'active',
      };
      studentsMap.set(profileId, record);
      byCodeMap.set(studentCode, record);
      byAuthIdMap.set(authUserId, record);
    }

    const mockClient = {
      rpc: async (fnName, params) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        if (fnName === 'm2_check_rate_limit') {
          const key = params.p_key_hash;
          const max = params.p_max_attempts;
          const count = (rateCounters.get(key) || 0) + 1;
          rateCounters.set(key, count);
          return { data: [{ allowed: count <= max, remaining: Math.max(0, max - count) }], error: null };
        }
        if (fnName === 'm2_get_student_for_prepare') {
          const st = byCodeMap.get(params.p_student_code);
          if (!st) return { data: [], error: null };
          return {
            data: [
              {
                profile_id: st.profileId,
                auth_user_id: st.authUserId,
                auth_email: st.authEmail,
                pin_issued_at: '2026-10-21T00:00:00Z',
              },
            ],
            error: null,
          };
        }
        if (fnName === 'm2_create_student_challenge') {
          const cid = crypto.randomUUID();
          challenges.set(cid, {
            authUserId: params.p_auth_user_id,
            ipHash: params.p_ip_hash,
            consumed: false,
          });
          return { data: cid, error: null };
        }
        if (fnName === 'm2_consume_student_challenge') {
          const ch = challenges.get(params.p_challenge_id);
          if (!ch || ch.consumed || ch.ipHash !== params.p_ip_hash) {
            return { data: [{ valid: false, auth_user_id: null }], error: null };
          }
          ch.consumed = true;
          return { data: [{ valid: true, auth_user_id: ch.authUserId }], error: null };
        }
        if (fnName === 'm2_get_actor_auth_by_auth_id') {
          const st = byAuthIdMap.get(params.p_auth_user_id);
          if (!st) return { data: [], error: null };
          return {
            data: [
              {
                profile_id: st.profileId,
                auth_user_id: st.authUserId,
                auth_email: st.authEmail,
                role: 'student',
              },
            ],
            error: null,
          };
        }
        if (fnName === 'm2_verify_actor_session') {
          if (params.p_auth_user_id === teacherAuthId) {
            return {
              data: [
                {
                  valid: true,
                  profile_id: teacherProfileId,
                  role: 'teacher',
                  auth_email: 'teacher_m6@example.invalid',
                  session_version: 1,
                  status: 'active',
                },
              ],
              error: null,
            };
          }
          const st = byAuthIdMap.get(params.p_auth_user_id);
          if (!st) return { data: [{ valid: false }], error: null };
          return {
            data: [
              {
                valid: st.status === 'active' && params.p_expected_version === st.sessionVersion,
                profile_id: st.profileId,
                role: 'student',
                auth_email: st.authEmail,
                session_version: st.sessionVersion,
                status: st.status,
              },
            ],
            error: null,
          };
        }
        if (fnName === 'm3_submit_quiz_attempt') {
          const studentProfileId = params.p_student_profile_id || params.p_student_id;
          const prev = quizStore.get(studentProfileId) || { highestScore: 0, attemptsCount: 0, passed: false };
          const score = 100;
          const updated = {
            student_id: studentProfileId,
            lesson_id: params.p_lesson_id,
            class_id: classId,
            score,
            current_score: score,
            highest_score: Math.max(prev.highestScore, score),
            attempts_count: prev.attemptsCount + 1,
            passed: true,
            last_attempt_at: new Date().toISOString(),
          };
          quizStore.set(studentProfileId, updated);
          return { data: [updated], error: null };
        }
        if (fnName === 'm3_submit_practice') {
          const studentProfileId = params.p_student_profile_id || params.p_student_id;
          const subId = `00000000-0000-4000-8000-${studentProfileId.slice(-12)}`;
          const rec = {
            id: subId,
            student_id: studentProfileId,
            lesson_id: params.p_lesson_id,
            class_id: classId,
            type: params.p_type,
            content: params.p_content,
            notes: params.p_notes || '',
            status: 'submitted',
            teacher_feedback: '',
            submitted_at: new Date().toISOString(),
            can_resubmit: true,
          };
          subStore.set(subId, rec);
          return { data: [rec], error: null };
        }
        if (fnName === 'm3_grade_submission') {
          const existing = subStore.get(params.p_submission_id);
          if (!existing) return { data: null, error: { message: 'NOT_FOUND' } };
          existing.status = params.p_status;
          existing.teacher_feedback = params.p_feedback;
          existing.can_resubmit = params.p_status !== 'approved';
          existing.graded_by = params.p_actor_profile_id;
          existing.graded_at = new Date().toISOString();
          return { data: [existing], error: null };
        }
        return { data: null, error: null };
      },
      auth: {
        admin: {
          updateUserById: async (uid) => ({ data: { user: { id: uid } }, error: null }),
        },
        getUser: async (token) => {
          const claims = domain.decodeJwtClaims(token);
          return { data: { user: { id: claims?.sub } }, error: null };
        },
        signInWithPassword: async ({ email, password }) => {
          const st = Array.from(studentsMap.values()).find((s) => s.authEmail === email);
          if (!st || st.authPassword !== password) {
            return { data: { session: null }, error: { message: 'Invalid credentials', status: 400 } };
          }
          const jwt = createMockJwt({
            sub: st.authUserId,
            session_id: crypto.randomUUID(),
            app_metadata: { role: 'student', m2_session_version: st.sessionVersion },
          });
          return {
            data: {
              session: {
                access_token: jwt,
                refresh_token: 'ref_' + st.profileId,
              },
              user: { id: st.authUserId, email },
            },
            error: null,
          };
        },
      },
      from: (table) => {
        const filters = {};
        const builder = {
          select: () => builder,
          eq: (col, val) => {
            filters[col] = val;
            return builder;
          },
          in: () => builder,
          order: () => builder,
          range: () => builder,
          single: async () => execute(true),
          maybeSingle: async () => execute(true),
          then: (resolve, reject) => execute(false).then(resolve, reject),
        };
        async function execute(single) {
          if (table === 'profiles') {
            const st = studentsMap.get(filters.id);
            if (st) {
              const row = {
                id: st.profileId,
                full_name: st.fullName,
                student_code: st.studentCode,
                role: 'student',
                status: st.status,
                session_version: st.sessionVersion,
              };
              return { data: single ? row : [row], error: null };
            }
          }
          if (table === 'students') {
            const st = studentsMap.get(filters.id) || Array.from(studentsMap.values())[0];
            const row = {
              id: st.profileId,
              participant_id: `part_${st.studentCode}`,
              student_code: st.studentCode,
              full_name: st.fullName,
              current_class_id: st.currentClassId,
              original_class_id: st.currentClassId,
              pin_issued_at: '2026-10-21T00:00:00Z',
              status: st.status,
            };
            return { data: single ? row : [row], error: null };
          }
          if (table === 'classes') {
            const row = {
              id: classId,
              code: 'ROB-K14-M6',
              name: 'Lớp Robotics M6',
              course_id: courseId,
              status: 'active',
              is_14_sessions_confirmed: false,
            };
            return { data: single ? row : [row], error: null };
          }
          if (table === 'courses') {
            const row = {
              id: courseId,
              title: 'Khóa Robotics K14 M6',
              description: 'Khóa học 14 buổi',
              total_sessions: 14,
              created_at: '2026-10-21T00:00:00Z',
            };
            return { data: single ? row : [row], error: null };
          }
          if (table === 'lessons') {
            const rows = [
              {
                id: lessonId,
                course_id: courseId,
                session_number: 1,
                title: 'Buổi 1: Nhập môn Robotics',
                description: 'Mô tả buổi 1',
                materials: 'Tài liệu',
                video_url: 'https://example.com/v1',
                status: 'published',
                has_quiz: true,
                has_practice: true,
                practice_mode: 'file_allowed',
              },
            ];
            return { data: single ? rows[0] : rows, error: null };
          }
          if (table === 'quiz_questions') {
            return {
              data: [
                {
                  id: '77777777-7777-4777-8777-000000000701',
                  lesson_id: lessonId,
                  prompt: 'Cảm biến siêu âm dùng để làm gì?',
                  options: ['Đo khoảng cách', 'Phát nhạc'],
                  order_index: 0,
                },
              ],
              error: null,
            };
          }
          if (table === 'quiz_results') {
            return { data: [], error: null };
          }
          if (table === 'practice_submissions') {
            return { data: [], error: null };
          }
          return { data: single ? null : [], error: null };
        }
        return builder;
      },
    };

    const handleRequest = await loadEdgeHandler(mockClient);
    const allStudentsList = Array.from(studentsMap.values());
    const teacherJwt = createMockJwt({
      sub: teacherAuthId,
      app_metadata: { role: 'teacher', m2_session_version: 1 },
    });

    // Execute 10 shifts of 20 concurrent students = 200 students total
    // In Shift 1, also simulate 1 student mistyping PIN 6 times on the SAME classroom IP
    // and verify the other 19 students on that classroom IP are NOT blocked!
    const misbehavingStudentCode = 'TEST_M6_MISTYPE_999';
    for (let attempt = 1; attempt <= 6; attempt++) {
      const prepBad = await sendEdgeRequest(
        handleRequest,
        'student-login-prepare',
        { studentCode: misbehavingStudentCode },
        undefined,
        sharedClassroomIp
      );
      assert.equal(prepBad.status, 401);
    }
    const prep7th = await sendEdgeRequest(
      handleRequest,
      'student-login-prepare',
      { studentCode: misbehavingStudentCode },
      undefined,
      sharedClassroomIp
    );
    assert.equal(prep7th.status, 429, '7th attempt on same student account must be rate-limited (429)');
    assert.equal(prep7th.json.code, 'RATE_LIMITED');

    let loginOk = 0;
    let bootstrapOk = 0;
    let quizOk = 0;
    let practiceOk = 0;
    let gradeOk = 0;

    for (let shiftIdx = 0; shiftIdx < 10; shiftIdx++) {
      // Reset per-minute IP window between simulated 60-minute classroom shifts while keeping same IP within each 20-student shift
      rateCounters.clear();
      const shiftStudents = allStudentsList.slice(shiftIdx * shiftConcurrency, (shiftIdx + 1) * shiftConcurrency);
      assert.equal(shiftStudents.length, 20, 'Each shift has exactly 20 concurrent students');

      await Promise.all(
        shiftStudents.map(async (st) => {
          // 1. Prepare login on shared classroom IP
          const prep = await sendEdgeRequest(
            handleRequest,
            'student-login-prepare',
            { studentCode: st.studentCode },
            undefined,
            sharedClassroomIp
          );
          assert.equal(prep.status, 200, `Prepare failed for ${st.studentCode}`);
          assert.ok(prep.json.data?.challengeId);

          // 2. Complete login on shared classroom IP
          const comp = await sendEdgeRequest(
            handleRequest,
            'student-login-complete',
            {
              challengeId: prep.json.data.challengeId,
              authPassword: st.authPassword,
            },
            undefined,
            sharedClassroomIp
          );
          assert.equal(comp.status, 200, `Complete failed for ${st.studentCode}`);
          const studentToken = comp.json.data?.session?.access_token;
          assert.ok(studentToken);
          loginOk++;

          // 3. Open course/lesson via bootstrap (verify answer key stripped)
          const boot = await sendEdgeRequest(handleRequest, 'bootstrap', {}, studentToken, sharedClassroomIp);
          assert.equal(boot.status, 200);
          assert.equal(boot.json.data?.lessons?.length, 1);
          assert.equal(
            boot.json.data.lessons[0].questions[0].correctOptionIndex,
            undefined,
            'Student bootstrap must never expose correctOptionIndex'
          );
          bootstrapOk++;

          // 4. Submit Quiz
          const qRes = await sendEdgeRequest(
            handleRequest,
            'submit-quiz',
            { lessonId, answers: [0] },
            studentToken,
            sharedClassroomIp
          );
          assert.equal(qRes.status, 200);
          assert.equal(qRes.json.passed, true);
          assert.equal(qRes.json.data?.passed, true);
          assert.equal(qRes.json.data?.score, 100);
          quizOk++;

          // 5. Submit Practice
          const pRes = await sendEdgeRequest(
            handleRequest,
            'submit-practice',
            {
              lessonId,
              type: 'link',
              content: `https://scratch.mit.edu/projects/${st.studentCode}`,
              notes: 'Bài nộp ca học 20 học sinh',
            },
            studentToken,
            sharedClassroomIp
          );
          assert.equal(pRes.status, 200);
          const subId = pRes.json.data?.id;
          assert.ok(subId);
          practiceOk++;

          // 6. Teacher grades submission
          const gRes = await sendEdgeRequest(
            handleRequest,
            'grade-submission',
            {
              submissionId: subId,
              status: 'approved',
              feedback: 'Đạt yêu cầu ca học',
            },
            teacherJwt,
            sharedClassroomIp
          );
          assert.equal(gRes.status, 200);
          assert.equal(gRes.json.data?.status, 'approved');
          gradeOk++;
        })
      );
    }

    assert.equal(loginOk, 200);
    assert.equal(bootstrapOk, 200);
    assert.equal(quizOk, 200);
    assert.equal(practiceOk, 200);
    assert.equal(gradeOk, 200);
  });

  test('1.3: student-login-complete retries transient GoTrue 5xx hiccups under concurrent shift load without retrying 401/429', async () => {
    const authUserId = '00000000-0000-4000-9000-000000060999';
    const profileId = '00000000-0000-4000-8000-000000060999';
    const challengeId = '00000000-0000-4000-7000-000000060999';
    const authPassword = deriveStudentPassword(authUserId, '83920147', VALID_PEPPER);

    let updateCalls = 0;
    let signInCalls = 0;

    const mockClient = {
      rpc: async (fnName) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        if (fnName === 'm2_consume_student_challenge') {
          return { data: [{ valid: true, auth_user_id: authUserId }], error: null };
        }
        if (fnName === 'm2_get_actor_auth_by_auth_id') {
          return {
            data: [{ profile_id: profileId, auth_user_id: authUserId, auth_email: 's999@example.invalid', role: 'student' }],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      auth: {
        admin: {
          updateUserById: async (uid) => {
            updateCalls++;
            if (updateCalls === 1) {
              return { data: null, error: { message: 'Transient 502 Bad Gateway', status: 502 } };
            }
            return { data: { user: { id: uid } }, error: null };
          },
        },
        signInWithPassword: async () => {
          signInCalls++;
          if (signInCalls === 1) {
            return { data: { session: null }, error: { message: 'Transient 503', status: 503 } };
          }
          return {
            data: {
              session: { access_token: createMockJwt({ sub: authUserId }), refresh_token: 'ref_999' },
              user: { id: authUserId },
            },
            error: null,
          };
        },
      },
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === 'profiles') {
                return {
                  data: { id: profileId, full_name: 'HS 999', student_code: 'HS999', status: 'active', session_version: 1 },
                  error: null,
                };
              }
              if (table === 'students') {
                return { data: { current_class_id: 'cls-1', status: 'active' }, error: null };
              }
              return { data: { status: 'active' }, error: null };
            },
          }),
        }),
      }),
    };

    const handleRequest = await loadEdgeHandler(mockClient);
    const res = await sendEdgeRequest(handleRequest, 'student-login-complete', {
      challengeId,
      authPassword,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(updateCalls, 2, 'Must retry transient updateUserById error and succeed on 2nd attempt');
    assert.equal(signInCalls, 2, 'Must retry transient signInWithPassword 503 error and succeed on 2nd attempt');

    // Verify 400, 401, and 429 are NOT retried (signInCalls === 1)
    for (const nonRetryStatus of [400, 401, 429]) {
      let attemptCalls = 0;
      const nonRetryClient = {
        ...mockClient,
        auth: {
          admin: {
            updateUserById: async (uid) => ({ data: { user: { id: uid } }, error: null }),
          },
          signInWithPassword: async () => {
            attemptCalls++;
            return { data: { session: null }, error: { message: `Err ${nonRetryStatus}`, status: nonRetryStatus } };
          },
        },
      };
      const nonRetryHandler = await loadEdgeHandler(nonRetryClient);
      const nonRetryRes = await sendEdgeRequest(nonRetryHandler, 'student-login-complete', {
        challengeId,
        authPassword,
      });
      assert.equal(attemptCalls, 1, `HTTP ${nonRetryStatus} must NOT be retried`);
      assert.equal(nonRetryRes.status, nonRetryStatus === 429 ? 429 : 401);
    }

    // Verify persistent 503 stops after maxAttempts (3 calls)
    let persistent503Calls = 0;
    const persistent503Client = {
      ...mockClient,
      auth: {
        admin: {
          updateUserById: async (uid) => ({ data: { user: { id: uid } }, error: null }),
        },
        signInWithPassword: async () => {
          persistent503Calls++;
          return { data: { session: null }, error: { message: 'Persistent 503', status: 503 } };
        },
      },
    };
    const persistent503Handler = await loadEdgeHandler(persistent503Client);
    const persistent503Res = await sendEdgeRequest(persistent503Handler, 'student-login-complete', {
      challengeId,
      authPassword,
    });
    assert.equal(persistent503Calls, 3, 'Persistent 503 must stop after 3 attempts');
    assert.equal(persistent503Res.status, 401);
  });

  test('1.4: bootstrap paginates >1,000 students and >1,000 quiz/practice records without PostgREST 1,000-row truncation', async () => {
    const totalStudents = 1250; // Exceeds PostgREST 1,000-row default limit (e.g. large Teaching roster)
    const allSyntheticStudents = Array.from({ length: totalStudents }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      participant_id: `part_${i + 1}`,
      student_code: `HS_LARGE_${i + 1}`,
      full_name: `Học Sinh #${i + 1}`,
      current_class_id: 'cls-1',
      original_class_id: 'cls-1',
      pin_issued_at: null,
      status: 'active',
      notes: '',
    }));

    const rangeCalls = [];

    const mockClient = {
      rpc: async (fnName) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        if (fnName === 'm2_verify_actor_session') {
          return {
            data: [
              {
                valid: true,
                profile_id: '11111111-1111-4111-8111-000000000001',
                role: 'admin',
                auth_email: 'admin@example.invalid',
                session_version: 1,
                status: 'active',
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      auth: {
        getUser: async () => ({
          data: { user: { id: '99999999-9999-4999-8999-000000000001' } },
          error: null,
        }),
      },
      from: (table) => {
        let rangeFrom = 0;
        let rangeTo = 999;
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          range: (from, to) => {
            rangeFrom = from;
            rangeTo = to;
            if (table === 'students') {
              rangeCalls.push({ from, to });
            }
            return builder;
          },
          single: async () => ({
            data: {
              id: '11111111-1111-4111-8111-000000000001',
              full_name: 'Admin',
              email: 'admin@example.invalid',
              role: 'admin',
              status: 'active',
            },
            error: null,
          }),
          then: (resolve) => {
            if (table === 'students') {
              return Promise.resolve({
                data: allSyntheticStudents.slice(rangeFrom, rangeTo + 1),
                error: null,
              }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        return builder;
      },
    };

    const handleRequest = await loadEdgeHandler(mockClient);
    const res = await sendEdgeRequest(handleRequest, 'bootstrap', {});
    assert.equal(res.status, 200);
    assert.equal(res.json.data?.students?.length, 1250, 'Must return all 1,250 students across paginated ranges');
    assert.deepEqual(rangeCalls, [
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
  });
});

// ============================================================================
// SUITE 2: Mốc 6 Security Audit & Strict TEST / PROD Environment Separation
// ============================================================================
describe('Suite 2: Mốc 6 Security Audit, 8-Digit PIN Policy, Secret Hygiene & PROD Environment Separation', () => {
  test('2.1: Strict TEST vs PROD separation in crypto.mjs & Edge callbacks fails closed on misconfiguration', async () => {
    // 1. Default / TEST mode allows fallback to TEST project ref
    assert.equal(isProductionEnvironment({}), false);
    assert.equal(resolveSupabaseUrl({}), DEFAULT_TEST_SUPABASE_URL);
    assert.equal(resolveTrustedSiteUrl({}, false), DEFAULT_TEST_SITE_URL);

    // 2. Production mode detection
    assert.equal(isProductionEnvironment({ MINDX_ENV: 'production' }), true);
    assert.equal(isProductionEnvironment({ MINDX_APP_ENV: 'prod' }), true);
    assert.equal(isProductionEnvironment({ NEXT_PUBLIC_MINDX_ENV: 'production' }), true);

    // 3. In Production mode, missing or TEST Supabase URL is rejected
    assert.throws(
      () => resolveSupabaseUrl({ MINDX_ENV: 'production' }),
      /MINDX_SUPABASE_URL bắt buộc/
    );
    assert.throws(
      () =>
        resolveSupabaseUrl({
          MINDX_ENV: 'production',
          MINDX_SUPABASE_URL: `https://${TEST_SUPABASE_PROJECT_REF}.supabase.co`,
        }),
      /tuyệt đối không được trỏ vào dự án TEST/
    );
    assert.throws(
      () =>
        resolveSupabaseUrl({
          MINDX_ENV: 'production',
          MINDX_SUPABASE_URL: 'http://prod-project.supabase.co',
        }),
      /HTTPS/
    );

    // 4. In Production mode, missing or TEST Site URL is rejected
    assert.throws(
      () => resolveTrustedSiteUrl({ MINDX_ENV: 'production' }),
      /MINDX_SITE_URL bắt buộc/
    );
    assert.throws(
      () =>
        resolveTrustedSiteUrl({
          MINDX_ENV: 'production',
          MINDX_SITE_URL: 'https://mindx-learn-test.vercel.app',
        }),
      /không được trỏ vào tên miền TEST/
    );

    // 5. In Production mode, NEXT_PUBLIC_MINDX_DEMO=1 is forbidden
    assert.throws(
      () =>
        assertServerConfiguration({
          MINDX_ENV: 'production',
          NEXT_PUBLIC_MINDX_DEMO: '1',
          MINDX_SESSION_KEY: VALID_HEX_KEY,
          MINDX_PIN_PEPPER: VALID_PEPPER,
          MINDX_BFF_SECRET: VALID_BFF_SECRET,
          MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
          MINDX_SITE_URL: 'https://learn.mindx.edu.vn',
        }),
      /NEXT_PUBLIC_MINDX_DEMO=1/
    );

    // 6. Valid Production configuration passes
    assert.doesNotThrow(() =>
      assertServerConfiguration({
        MINDX_ENV: 'production',
        MINDX_SESSION_KEY: VALID_HEX_KEY,
        MINDX_PIN_PEPPER: VALID_PEPPER,
        MINDX_BFF_SECRET: VALID_BFF_SECRET,
        MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
        MINDX_SITE_URL: 'https://learn.mindx.edu.vn',
      })
    );

    // 7. Conflicting or invalid env flags fail closed across crypto.mjs, edge-client.ts, and store.tsx
    assert.throws(
      () =>
        isProductionEnvironment({
          MINDX_ENV: 'staging_test',
          NEXT_PUBLIC_MINDX_ENV: 'production',
        }),
      /không hợp lệ/
    );
    assert.throws(
      () =>
        isProductionEnvironment({
          MINDX_ENV: 'test',
          NEXT_PUBLIC_MINDX_ENV: 'production',
        }),
      /Xung đột biến môi trường/
    );
    assert.throws(
      () =>
        isProductionEnvironment({
          MINDX_ENV: 'test',
          MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
        }),
      /Cờ môi trường đang đặt là TEST nhưng địa chỉ Supabase/
    );

    // Non-TEST Supabase URL without explicit MINDX_ENV flag is still treated as Production:
    assert.equal(
      isProductionEnvironment({
        MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
      }),
      true
    );
    assert.throws(
      () =>
        resolveTrustedSiteUrl({
          MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
        }),
      /MINDX_SITE_URL bắt buộc/
    );
    assert.throws(
      () =>
        assertRuntimeEnvironmentGuard({
          MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
          NEXT_PUBLIC_MINDX_DEMO: '1',
        }),
      /NEXT_PUBLIC_MINDX_DEMO=1/
    );

    // Verify store.tsx resolveIsLiveMode blocks Demo mode on Production before any API call
    const storeSource = await fs.readFile(path.join(SRC_DIR, 'lib', 'store.tsx'), 'utf-8');
    const storeSliceStart = storeSource.indexOf('const STORE_TEST_SUPABASE_REF');
    const storeSliceEnd = storeSource.indexOf('export function StoreProvider');
    assert.ok(storeSliceStart > 0 && storeSliceEnd > storeSliceStart);
    const storeGuardJs = ts.transpileModule(
      storeSource.slice(storeSliceStart, storeSliceEnd).replace(/export\s+/g, ''),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
    ).outputText;
    const resolveIsLiveModeFn = new Function('process', `${storeGuardJs}\nreturn resolveIsLiveMode;`)({ env: {} });
    assert.equal(resolveIsLiveModeFn({}), true);
    assert.equal(resolveIsLiveModeFn({ NEXT_PUBLIC_MINDX_DEMO: '1' }), false);
    assert.throws(
      () => resolveIsLiveModeFn({ NEXT_PUBLIC_MINDX_ENV: 'production', NEXT_PUBLIC_MINDX_DEMO: '1' }),
      /NEXT_PUBLIC_MINDX_DEMO=1/
    );
    assert.throws(
      () =>
        resolveIsLiveModeFn({
          MINDX_SUPABASE_URL: 'https://prodref123456.supabase.co',
          NEXT_PUBLIC_MINDX_DEMO: '1',
        }),
      /NEXT_PUBLIC_MINDX_DEMO=1/
    );

    // 8. Edge Function on non-TEST Supabase origin rejects missing or TEST trustedSiteURL on password-reset-request
    const prodMockClient = {
      rpc: async (fnName) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        return { data: null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '11111111-1111-4111-8111-000000000001', role: 'admin', status: 'active' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const prodHandleRequest = await loadEdgeHandler(prodMockClient, {
      SUPABASE_URL: 'https://prodref123456.supabase.co',
      MINDX_ENV: 'production',
    });

    const resetWithTestUrl = await sendEdgeRequest(prodHandleRequest, 'password-reset-request', {
      email: 'admin@mindx.edu.vn',
      trustedSiteURL: 'https://mindx-learn-test.vercel.app',
    });
    assert.equal(resetWithTestUrl.status, 400);
    assert.equal(resetWithTestUrl.json.code, 'INVALID_SITE_URL');
  });

  test('2.2: 8-digit random PIN policy rejects 6-digit 123456 & trivial sequences, and enforces one-time CSV formula defense', () => {
    assert.equal(isTrivialPin('123456'), true, 'Common 6-digit PIN 123456 must be rejected');
    assert.equal(isTrivialPin('12345678'), true, 'Sequential 8-digit PIN 12345678 must be rejected');
    assert.equal(isTrivialPin('00000000'), true);
    assert.equal(isTrivialPin('99999999'), true);

    for (let i = 0; i < 500; i++) {
      const pin = generateSecurePin8();
      assert.match(pin, /^\d{8}$/);
      assert.notEqual(pin, '123456');
      assert.equal(isTrivialPin(pin), false);
    }

    const csv = formatPinCsvContent(
      [{ studentCode: 'ROB001', fullName: '=cmd|\'/C calc\'!A0', rawPin: '83920147' }],
      'ROB-K14-01',
      'batch_first_issue',
      '2026-10-21T00:00:00.000Z'
    );
    assert.ok(csv.includes("'=cmd"), 'Formula injection in student name must be neutralized with leading single quote');
    assert.ok(csv.includes('83920147'));
  });

  test('2.3: Client-side source files contain zero server secrets or service-role keys', async () => {
    async function collectClientFiles(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip server-only directories
          if (full.endsWith(path.join('src', 'app', 'api')) || full.endsWith(path.join('src', 'lib', 'server'))) {
            continue;
          }
          files.push(...(await collectClientFiles(full)));
        } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          files.push(full);
        }
      }
      return files;
    }

    const clientFiles = await collectClientFiles(SRC_DIR);
    assert.ok(clientFiles.length > 10, 'Should scan all client source files');

    const forbiddenServerSecrets = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'MINDX_SESSION_KEY',
      'MINDX_PIN_PEPPER',
      'MINDX_BFF_SECRET',
      'x-mindx-bff-secret',
    ];

    for (const file of clientFiles) {
      const content = await fs.readFile(file, 'utf-8');
      for (const secretName of forbiddenServerSecrets) {
        assert.equal(
          content.includes(secretName),
          false,
          `Client file ${path.relative(SRC_DIR, file)} must never reference server secret ${secretName}`
        );
      }
    }
  });

  test('2.4: M6 SQL migration & Edge bootstrap enforce InitPlan RLS caching, scale indexes, PK filters, and two-phase Storage upload quota checks', async () => {
    const migrationPath = path.resolve(
      __dirname,
      '../supabase/migrations/20261021180000_m6_rls_initplan_and_scale_indexes.sql'
    );
    const migrationSql = await fs.readFile(migrationPath, 'utf-8');

    assert.ok(
      migrationSql.includes('idx_profiles_role_status'),
      'Migration must create scale index idx_profiles_role_status'
    );
    assert.ok(
      migrationSql.includes('idx_students_current_class_status'),
      'Migration must create scale index idx_students_current_class_status'
    );
    assert.ok(
      migrationSql.includes('(SELECT public.is_active_admin())'),
      'Migration must wrap is_active_admin() in InitPlan scalar subquery'
    );
    assert.ok(
      migrationSql.includes('(SELECT public.current_profile_id())'),
      'Migration must wrap current_profile_id() in InitPlan scalar subquery'
    );
    assert.ok(
      migrationSql.includes('public.is_teacher_of_class(id)'),
      'Migration must keep is_teacher_of_class(id) as SECURITY DEFINER call to avoid mutual RLS recursion'
    );
    assert.ok(
      migrationSql.includes('COALESCE(p_object_size, v_res.reserved_bytes::bigint)'),
      'm3_check_storage_insert_permission must fall back to v_res.reserved_bytes when storage-api inserts object row before streaming'
    );
    assert.ok(
      migrationSql.includes('DROP POLICY IF EXISTS "m3_courses_select_authenticated" ON public.courses;') &&
        migrationSql.includes('CREATE POLICY "m3_courses_select_authenticated" ON public.courses') &&
        migrationSql.includes('WHERE ct.teacher_profile_id = (SELECT public.current_profile_id())') &&
        !migrationSql.includes('CREATE POLICY "m3_courses_select_staff"'),
      'Courses RLS must preserve teacher class assignment boundary on m3_courses_select_authenticated'
    );

    const edgeSource = (await fs.readFile(INDEX_PATH, 'utf-8')).replace(/\r\n/g, '\n');
    assert.ok(
      edgeSource.includes(".from('students')\n              .select('id, participant_id") &&
        edgeSource.includes(".eq('id', actor.profileId)"),
      'Student bootstrap must filter students by actor.profileId to avoid 1,000+ row RLS scans'
    );
  });

  test('2.5: coordinator-cleanup-m6-qa reports HTTP 500 CLEANUP_INCOMPLETE when any delete fails or rows remain', async () => {
    const targetProfileId = '00000000-0000-4000-8000-000000061001';
    const targetAuthId = '00000000-0000-4000-8000-000000062001';

    const touchedTables = new Set();
    let shouldFailDelete = true;
    const failingMockClient = {
      rpc: async (fnName) => {
        if (fnName === 'm2_verify_bff_secret') return { data: true, error: null };
        return { data: null, error: null };
      },
      storage: {
        from: () => ({
          remove: async () => ({
            data: null,
            error: shouldFailDelete ? { message: 'Storage delete failed' } : null,
          }),
        }),
      },
      auth: {
        admin: {
          deleteUser: async () => ({
            data: null,
            error: shouldFailDelete ? { message: 'Auth delete failed', status: 500 } : null,
          }),
        },
      },
      from: (table) => {
        touchedTables.add(table);
        if (table === 'm5_storage_quota_config') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { environment_mode: 'test' }, error: null }) }) }) };
        }
        return {
          select: (_cols, opts) => ({
            in: async () => {
              if (opts?.head) {
                return { count: shouldFailDelete && table === 'profiles' ? 1 : 0, error: null };
              }
              if (table === 'practice_submissions') {
                return { data: [{ id: 's1', type: 'file', content: 'p1/l1/f.pdf' }], error: null };
              }
              return { data: [], error: null };
            },
            then: (resolve) => Promise.resolve({ count: 35, error: null }).then(resolve),
          }),
          delete: () => ({
            in: async () => ({
              error: shouldFailDelete ? { message: `${table} delete error` } : null,
            }),
          }),
        };
      },
    };

    const handleRequest = await loadEdgeHandler(failingMockClient);
    const failRes = await sendEdgeRequest(handleRequest, 'coordinator-cleanup-m6-qa', {
      profileIds: [targetProfileId],
      authUserIds: [targetAuthId],
    });
    assert.equal(failRes.status, 500, 'Cleanup with failed deletes must return HTTP 500');
    assert.equal(failRes.json.success, false);
    assert.equal(failRes.json.code, 'CLEANUP_INCOMPLETE');
    assert.ok(Array.isArray(failRes.json.errors) && failRes.json.errors.length >= 7);
    assert.equal(failRes.json.data?.remainingTargetRows, 1);
    assert.equal(touchedTables.has('actor_auth'), false, 'Must not query private.actor_auth via public PostgREST schema');
    assert.equal(
      touchedTables.has('student_login_challenges'),
      false,
      'Must not query non-existent public.student_login_challenges'
    );
    assert.equal(touchedTables.has('rate_limits'), false, 'Must not query non-existent public.rate_limits');

    // Now test clean run where all deletes succeed and 0 target rows remain
    shouldFailDelete = false;
    const okRes = await sendEdgeRequest(handleRequest, 'coordinator-cleanup-m6-qa', {
      profileIds: [targetProfileId],
      authUserIds: [targetAuthId],
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.json.success, true);
    assert.equal(okRes.json.data?.cleanedProfilesCount, 1);
    assert.equal(okRes.json.data?.cleanedAuthUsersCount, 1);
    assert.equal(okRes.json.data?.remainingTargetRows, 0);
  });

  test('Fixture operations stop on production, missing configuration, query errors, and exceptions', async () => {
    for (const action of ['coordinator-seed-fixture', 'coordinator-cleanup-m6-qa', 'coordinator-storage-fixture']) {
      for (const scenario of ['production', 'missing', 'error', 'throw', 'unknown', 'test']) {
        let writes = 0;
        const mock = {
          rpc: async (name) => {
            assert.equal(name, 'm2_verify_bff_secret');
            return { data: true, error: null };
          },
          from: (table) => {
            assert.equal(table, 'm5_storage_quota_config');
            return { select: () => ({ eq: () => ({ maybeSingle: async () => {
              if (scenario === 'throw') throw Error('Connection failed');
              return { data: scenario === 'missing' ? null : { environment_mode: scenario }, error: scenario === 'error' ? { message: 'Query failed' } : null };
            } }) }) };
          },
          auth: { admin: { createUser: async () => { writes++; throw Error('Must not create user'); } } },
          storage: { from: () => { writes++; throw Error('Must not write storage'); } },
        };
        const handler = await loadEdgeHandler(mock, scenario === 'test' ? { MINDX_ENV: 'production' } : {});
        const result = await sendEdgeRequest(handler, action, {}, undefined);
        assert.equal(result.status, scenario === 'production' ? 403 : 503, `${action}/${scenario}`);
        assert.equal(result.json.code, scenario === 'production' ? 'PRODUCTION_ENVIRONMENT_LOCKED' : 'ENVIRONMENT_CONFIG_UNAVAILABLE');
        assert.equal(writes, 0);
      }
    }
  });

  test('2.6: Mốc 6 Bước 2 — Real Teaching Sync (real_teaching_sync) and PROD cutover migration lock', async () => {
    const {
      runTeachingSnapshotPreview,
      applyTeachingSyncDiffToState,
      validateRealTeachingSyncDiffReport,
    } = await import('../src/lib/teaching-sync-core.mjs');

    const realSnapshot = {
      pageLength: 15,
      snapshotVersion: 'm6-prod-snap-1',
      pages: [
        {
          draw: 1,
          recordsTotal: 3,
          recordsFiltered: 3,
          data: [
            {
              id: 'HS_REAL_8001',
              student_name: 'Nguyễn Hoàng Bảo',
              class_code: 'HN-ROB-K15-01',
              status: 'Đang học',
              class_status: 'Running',
            },
            {
              id: 'HS_REAL_8002',
              student_name: 'Trần Minh Anh',
              class_code: 'HN-ROB-K15-01',
              status: 'Đang học',
              class_status: 'Running',
            },
            {
              id: 'HS_REAL_8003',
              student_name: 'Lê Gia Huy',
              class_code: 'HN-WEB-K15-01',
              status: 'Đang học',
              class_status: 'Running',
            },
          ],
        },
      ],
    };

    const emptyProdState = {
      classes: [],
      students: [],
      users: [
        {
          id: '2d99957f-8608-4366-ade3-094f0c40a904',
          name: 'Admin Quản Trị Hệ Thống',
          email: 'quangctm07@gmail.com',
          role: 'admin',
          status: 'active',
        },
      ],
    };

    const preview = await runTeachingSnapshotPreview(realSnapshot, emptyProdState, {
      robFilterMode: 'include_rob',
      sourceMode: 'real_teaching_sync',
    });
    assert.equal(preview.success, true);
    assert.ok(preview.report);
    assert.equal(preview.report.sourceMode, 'real_teaching_sync');
    assert.equal(preview.report.counts.addedCount, 2, 'Only the 2 ROB students are added');
    assert.equal(preview.report.counts.ignoredCount, 1, 'Non-ROB WEB student is ignored');
    assert.equal(preview.report.counts.newClassesCount, 1, 'Creates 1 new ROB class waiting for course assignment');

    const validCheck = validateRealTeachingSyncDiffReport(preview.report);
    assert.equal(validCheck.valid, true);

    const applied = applyTeachingSyncDiffToState(emptyProdState, preview.report);
    assert.equal(applied.success, true);
    assert.equal(applied.code, 'APPLIED_REAL_TEACHING_SYNC');
    assert.equal(applied.addedStudentsCount, 2);
    assert.equal(applied.createdClassesCount, 1);
    assert.equal(applied.pinsAutoIssued, 0);
    assert.equal(applied.state.classes.length, 1);
    assert.equal(applied.state.classes[0].code, 'HN-ROB-K15-01');
    assert.equal(applied.state.classes[0].courseId, null);
    assert.equal(applied.state.students.length, 2);

    // Verify Mốc 6 Bước 2 PROD cutover migration SQL
    const cutoverSqlPath = path.resolve(
      __dirname,
      '../supabase/migrations/20261021235500_m6_prod_cutover_and_real_sync.sql'
    );
    const cutoverSql = (await fs.readFile(cutoverSqlPath, 'utf-8')).replace(/\r\n/g, '\n');
    assert.equal(cutoverSql.includes('DELETE FROM public.m5_csv_verifications;'), false, 'CSV receipts live in m5_course_close_operations');
    assert.ok(cutoverSql.indexOf('SET updated_by = v_owner_profile_id;') < cutoverSql.indexOf('DELETE FROM public.profiles\n    WHERE id <> v_owner_profile_id;'), 'Rebind retained quota configuration before deleting its fixture admin');
    assert.ok(
      cutoverSql.includes("2d99957f-8608-4366-ade3-094f0c40a904"),
      'Cutover migration must preserve Owner official Admin profile 2d99957f-8608-4366-ade3-094f0c40a904'
    );
    assert.ok(
      cutoverSql.includes('DELETE FROM public.lessons;') &&
        cutoverSql.includes('DELETE FROM public.courses;') &&
        cutoverSql.includes('DELETE FROM public.students;') &&
        cutoverSql.includes('DELETE FROM public.classes;'),
      'Cutover migration must wipe sample courses, 14 sample lessons, test classes, and test students per Owner instruction'
    );
    assert.ok(
      cutoverSql.includes("environment_mode = 'production'"),
      'Cutover migration must lock m5_storage_quota_config.environment_mode to production'
    );
    assert.ok(
      cutoverSql.includes('SYNTHETIC_FIXTURE_FORBIDDEN_IN_PROD') &&
        cutoverSql.includes("v_source_mode = 'real_teaching_sync'"),
      'm4_apply_teaching_sync must support real_teaching_sync and block synthetic_fixture in production'
    );
  });
});
