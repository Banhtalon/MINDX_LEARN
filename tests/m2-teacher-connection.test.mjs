// ============================================================================
// MINDX LEARN — M2 Teacher Connection Unit Tests (Canonical E5)
// Runner: Node.js native test runner (node:test, node:assert/strict)
// Run via: npm test (node --test tests/*.test.mjs)
//
// Rules enforced:
// - Executes actual Edge request handler via dynamic transpile & in-memory mocks
// - No shadow copies: imports index.ts directly from disk
// - Accurately mocks verifyActorSession calls (auth.getUser + m2_verify_actor_session RPC)
// - Accurately mocks m2_verify_bff_secret RPC and supports configurable SUPABASE_URL
// - Verifies m2_link_existing_teacher RPC contract and zero auth schema writes
// - Verifies safe error mapping without raw SQL leaks
// - Checks SQL migration structure statically without brittle formatting assumptions
// - Regression check asserting pg_catalog.btrim is used and nonexistent pg_catalog.trim is prevented
// - Restores test globals after each suite
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.resolve(__dirname, '../supabase/functions/m2-backend/index.ts');
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../supabase/migrations/20261015111046_m2_link_existing_teacher.sql'
);

// Save initial globals for restoration
const savedDeno = globalThis.Deno;
const savedMockEdgeAdminClient = globalThis.__mockEdgeAdminClient;

test.afterEach(() => {
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

/**
 * Loads the actual production Edge request handler from index.ts
 * by transpiling TS -> JS in memory and injecting the mock Supabase client.
 * Supports configurable env overrides (e.g. SUPABASE_URL).
 */
async function loadEdgeHandler(mockAdminClient, envOverrides = {}) {
  const indexSource = await fs.readFile(INDEX_PATH, 'utf-8');

  // Transpile TypeScript to JS ESNext
  const transpiled = ts.transpileModule(indexSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  let jsCode = transpiled.outputText;

  // Replace URL import for @supabase/supabase-js with mock client factory
  globalThis.__mockEdgeAdminClient = mockAdminClient;
  jsCode = jsCode.replace(
    /import\s*\{\s*createClient[^\}]*\}\s*from\s*['"]https:\/\/[^'"]+['"];/,
    `const createClient = () => globalThis.__mockEdgeAdminClient;`
  );

  // Replace relative import for domain.ts with absolute file URL
  const domainUrl = new URL('../supabase/functions/m2-backend/domain.ts', import.meta.url).href;
  jsCode = jsCode.replace(
    /from\s*['"]\.\/domain\.ts['"];/,
    `from '${domainUrl}';`
  );

  // Provide mock Deno environment with configurable env overrides
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

  // Add unique cache-busting nonce so each test gets an isolated module execution
  const nonce = Date.now() + '_' + Math.random();
  jsCode += `\n// test-nonce: ${nonce}\n`;

  const dataUri = 'data:text/javascript;base64,' + Buffer.from(jsCode, 'utf-8').toString('base64');
  const mod = await import(dataUri);
  return mod.handleRequest;
}

/**
 * Creates a mock Supabase admin client tracking all invocations.
 */
function createMockAdminClient(options = {}) {
  const calls = {
    rpc: [],
    auth: {
      getUser: [],
      getUserById: [],
      createUser: [],
      updateUserById: [],
      deleteUser: [],
      inviteUserByEmail: [],
    },
    from: [],
  };

  const client = {
    calls,
    rpc: async (fnName, params) => {
      calls.rpc.push({ fnName, params });
      if (options.onRpc) {
        const custom = await options.onRpc(fnName, params);
        if (custom !== undefined) return custom;
      }
      if (fnName === 'm2_verify_bff_secret') {
        if (options.bffSecretError) {
          return { data: null, error: options.bffSecretError };
        }
        if (options.bffSecretValid !== undefined) {
          return { data: options.bffSecretValid, error: null };
        }
        return { data: true, error: null };
      }
      if (fnName === 'm2_verify_actor_session') {
        return {
          data: [
            {
              valid: options.sessionValid !== false,
              profile_id: options.actorProfileId || '11111111-1111-4111-8111-000000000001',
              role: options.actorRole || 'admin',
              auth_email: 'admin@example.invalid',
              session_version: 1,
              status: 'active',
            },
          ],
          error: null,
        };
      }
      if (fnName === 'm2_link_existing_teacher') {
        if (options.linkError) {
          return { data: null, error: options.linkError };
        }
        return {
          data: [
            {
              id: options.linkedProfileId || '22222222-2222-4222-8222-000000000002',
              full_name: params.p_name,
              email: params.p_email,
              role: 'teacher',
              status: 'active',
              assigned_class_ids: params.p_class_ids || [],
            },
          ],
          error: null,
        };
      }
      if (fnName === 'm2_get_actor_auth_by_auth_id') {
        return { data: options.existingActorAuth || [], error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        getUserById: async (uid) => {
          calls.auth.getUserById.push(uid);
          if (options.existingAuthUser) {
            return { data: { user: options.existingAuthUser }, error: null };
          }
          return { data: { user: null }, error: null };
        },
        createUser: async (payload) => {
          calls.auth.createUser.push(payload);
          if (options.createUserError) {
            return { data: null, error: options.createUserError };
          }
          return {
            data: {
              user: {
                id: payload.id,
                email: payload.email,
                confirmed_at: payload.email_confirm ? new Date().toISOString() : null,
              },
            },
            error: null,
          };
        },
        updateUserById: async (uid, payload) => {
          calls.auth.updateUserById.push({ uid, payload });
          return { data: { user: { id: uid } }, error: null };
        },
        deleteUser: async (uid) => {
          calls.auth.deleteUser.push(uid);
          return { data: {}, error: null };
        },
        inviteUserByEmail: async (email, opts) => {
          calls.auth.inviteUserByEmail.push({ email, opts });
          return { data: null, error: new Error('Invites removed') };
        },
      },
      getUser: async (token) => {
        calls.auth.getUser.push(token);
        if (options.invalidToken) {
          return { data: { user: null }, error: new Error('Invalid token') };
        }
        return {
          data: {
            user: {
              id: options.authUserId || '99999999-9999-4999-8999-000000000001',
              email: 'admin@example.invalid',
            },
          },
          error: null,
        };
      },
    },
    from: (table) => {
      calls.from.push(table);
      const queryBuilder = {
        select: () => queryBuilder,
        eq: () => queryBuilder,
        maybeSingle: async () => {
          if (table === 'm5_storage_quota_config') {
            return { data: { environment_mode: 'test' }, error: null };
          }
          if (table === 'profiles' && options.existingProfile) {
            return { data: options.existingProfile, error: null };
          }
          return { data: null, error: null };
        },
      };
      return queryBuilder;
    },
  };

  return client;
}

/**
 * Creates a valid JWT string with provided payload overrides.
 */
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

/**
 * Helper to dispatch a POST request to handleRequest with BFF secret and required trustedIp.
 * Supports passing customHeaders to test missing or invalid headers.
 */
async function sendEdgeRequest(
  handleRequest,
  action,
  payload,
  token = createMockJwt(),
  trustedIp = '127.0.0.1',
  customHeaders = {}
) {
  const bodyObj = {
    action,
    payload,
    sessionVersion: 1,
    trustedIp,
  };
  if (token !== undefined) {
    bodyObj.accessToken = token;
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-mindx-bff-secret': 'valid-bff-secret',
    ...customHeaders,
  };

  if (customHeaders && 'x-mindx-bff-secret' in customHeaders && customHeaders['x-mindx-bff-secret'] === undefined) {
    delete headers['x-mindx-bff-secret'];
  }

  const req = new Request('http://localhost/m2-backend', {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  });
  const res = await handleRequest(req);
  const data = await res.json();
  return { status: res.status, data };
}

// ----------------------------------------------------------------------------
// 1. Static SQL Migration Contract
// ----------------------------------------------------------------------------
test('Static SQL Migration Contract: m2_link_existing_teacher structural definitions and security constraints', async () => {
  const sql = await fs.readFile(MIGRATION_PATH, 'utf-8');

  // Verify function name and security definer
  assert.ok(sql.includes('public.m2_link_existing_teacher'), 'Must define public.m2_link_existing_teacher');
  assert.ok(sql.includes('SECURITY DEFINER'), 'm2_link_existing_teacher must be SECURITY DEFINER');

  // Safe fixed search_path starting with pg_catalog
  assert.ok(
    /SET\s+search_path\s*=\s*pg_catalog/i.test(sql),
    'Pinned search_path must have pg_catalog first'
  );
  assert.ok(
    /search_path.*public/i.test(sql) && /search_path.*private/i.test(sql) && /search_path.*auth/i.test(sql),
    'Pinned search_path must include public, private, auth'
  );

  // Explicit #variable_conflict error
  assert.ok(
    /#variable_conflict\s+error/i.test(sql),
    'Must declare explicit #variable_conflict error'
  );

  // Regression check: must use pg_catalog.btrim and NOT nonexistent pg_catalog.trim
  assert.ok(
    !/pg_catalog\.trim\s*\(/i.test(sql),
    'Must NOT call nonexistent pg_catalog.trim; use pg_catalog.btrim'
  );
  assert.ok(
    /pg_catalog\.btrim\s*\(/i.test(sql),
    'Must use valid pg_catalog.btrim for trimming'
  );

  // Privileges: revoke PUBLIC and grant service_role
  assert.ok(
    sql.includes('REVOKE ALL ON FUNCTION public.m2_link_existing_teacher'),
    'Must revoke privileges from PUBLIC/anon/authenticated'
  );
  assert.ok(
    sql.includes('GRANT EXECUTE ON FUNCTION public.m2_link_existing_teacher'),
    'Must grant EXECUTE to service_role'
  );

  // Row lock on admin and auth users
  assert.ok(sql.includes('FOR UPDATE'), 'Must acquire row lock FOR UPDATE');
  assert.ok(
    /FROM\s+public\.profiles\s+AS\s+pr\s+WHERE\s+pr\.id\s*=\s*p_admin_profile_id\s+FOR\s+UPDATE/i.test(sql) ||
    /FROM\s+public\.profiles\s+.*FOR\s+UPDATE/i.test(sql),
    'Must check active admin under row lock'
  );
  assert.ok(
    /FROM\s+auth\.users\s+AS\s+au\s+WHERE\s+pg_catalog\.lower\(au\.email\)\s*=\s*v_norm_email\s+FOR\s+UPDATE/i.test(sql) ||
    /FROM\s+auth\.users\s+.*FOR\s+UPDATE/i.test(sql),
    'Must lock matched Auth row for update'
  );

  // Exact-one Auth locked lookup: scoped SELECT INTO STRICT handling NO_DATA_FOUND and TOO_MANY_ROWS
  assert.ok(/INTO\s+STRICT/i.test(sql), 'Must use SELECT INTO STRICT for locked Auth lookup');
  assert.ok(/WHEN\s+NO_DATA_FOUND\s+THEN/i.test(sql), 'Must handle NO_DATA_FOUND in scoped block');
  assert.ok(/WHEN\s+TOO_MANY_ROWS\s+THEN/i.test(sql), 'Must handle TOO_MANY_ROWS in scoped block');
  assert.ok(sql.includes('AUTH_USER_DUPLICATE_EMAIL'), 'Must raise AUTH_USER_DUPLICATE_EMAIL on duplicate rows');

  // Explicit scalar column alias in unnest loop
  assert.ok(
    /FROM\s+pg_catalog\.unnest\(p_class_ids\)\s+AS\s+u\(class_id\)\s+ORDER\s+BY\s+u\.class_id/i.test(sql),
    'Must use explicit scalar column alias on unnest loop'
  );

  // Strict account state validation with password-presence boolean without raw credentials
  assert.ok(sql.includes('v_auth_confirmed_at IS NULL'), 'Must verify email is confirmed');
  assert.ok(
    /has_password/i.test(sql) && /au\.encrypted_password\s+IS\s+NOT\s+NULL/i.test(sql),
    'Must select password-presence boolean rather than copying raw encrypted_password'
  );
  assert.ok(
    !/SELECT\s+\*\s+INTO\s+v_auth_user/i.test(sql),
    'Must not copy all auth columns into a general record'
  );
  assert.ok(sql.includes("v_auth_app_metadata->>'role' <> 'teacher'"), 'Must reject non-teacher app_metadata role');

  // Duplicate mapping checks
  assert.ok(sql.includes('private.actor_auth'), 'Must check existing actor_auth mapping');
  assert.ok(sql.includes('public.profiles'), 'Must check existing profile with email');

  // Random distinct profile ID
  assert.ok(sql.includes('gen_random_uuid()'), 'Must generate random profile UUID');
  assert.ok(sql.includes('v_profile_id = v_auth_id'), 'Must ensure profile ID != auth user ID');

  // Fixture flag strictly on email domain
  assert.ok(sql.includes("LIKE '%@example.invalid'"), 'Must set is_fixture based strictly on @example.invalid');

  // Occupied class check & class assignment atomic integration
  assert.ok(sql.includes('CLASS_ALREADY_ASSIGNED'), 'Must verify class is not already assigned');
  assert.ok(sql.includes('public.class_teachers'), 'Must check class_teachers table');
  assert.ok(
    sql.includes('public.m2_assign_class_teacher(p_admin_profile_id, v_cid, v_profile_id)'),
    'Must reuse m2_assign_class_teacher within same transaction'
  );

  // Return safe fields only (no password, no native auth UUID)
  assert.ok(
    /RETURNS\s+TABLE\s*\(\s*id\s+UUID,\s*full_name\s+TEXT,\s*email\s+TEXT,\s*role\s+TEXT,\s*status\s+TEXT,\s*assigned_class_ids\s+UUID\[\]\s*\)/i.test(sql),
    'Return table must only contain public safe fields'
  );
  assert.ok(!sql.includes('auth_user_id UUID'), 'Must not return native auth_user_id in table');
});

// ----------------------------------------------------------------------------
// 2. Edge Handler: Admin positive teacher linking
// ----------------------------------------------------------------------------
test('Edge Handler: Admin positive linking calls m2_link_existing_teacher RPC and does NOT mutate Auth schema', async () => {
  const client = createMockAdminClient();
  const handleRequest = await loadEdgeHandler(client);

  const classId1 = '33333333-3333-4333-8333-000000000001';
  const classId2 = '33333333-3333-4333-8333-000000000002';

  const { status, data } = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: '  Cô Nguyễn Thị Mai  ',
    email: '  MAI.NGUYEN@SCHOOL.EDU.VN  ',
    assignedClassIds: [classId1, classId2],
  });

  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.message, 'Kết nối tài khoản giáo viên thành công.');
  assert.equal(data.data.name, 'Cô Nguyễn Thị Mai');
  assert.equal(data.data.email, 'mai.nguyen@school.edu.vn');
  assert.equal(data.data.role, 'teacher');
  assert.equal(data.data.status, 'active');
  assert.deepEqual(data.data.assignedClassIds, [classId1, classId2]);
  assert.equal(data.data.id, '22222222-2222-4222-8222-000000000002');

  // Verify actor session verification was executed
  assert.ok(client.calls.auth.getUser.length > 0, 'Must verify token with auth.getUser');
  assert.ok(
    client.calls.rpc.some((c) => c.fnName === 'm2_verify_actor_session'),
    'Must call m2_verify_actor_session RPC'
  );

  // Verify RPC parameters
  const linkCall = client.calls.rpc.find((c) => c.fnName === 'm2_link_existing_teacher');
  assert.ok(linkCall, 'Must call m2_link_existing_teacher RPC');
  assert.equal(linkCall.params.p_email, 'mai.nguyen@school.edu.vn');
  assert.equal(linkCall.params.p_name, 'Cô Nguyễn Thị Mai');
  assert.deepEqual(linkCall.params.p_class_ids, [classId1, classId2]);

  // CRITICAL SECURITY ASSERTION: Zero Auth mutation calls
  assert.equal(client.calls.auth.inviteUserByEmail.length, 0, 'Must NEVER call inviteUserByEmail');
  assert.equal(client.calls.auth.createUser.length, 0, 'Must NEVER call createUser in create-teacher');
  assert.equal(client.calls.auth.updateUserById.length, 0, 'Must NEVER call updateUserById in create-teacher');
  assert.equal(client.calls.auth.deleteUser.length, 0, 'Must NEVER call deleteUser in create-teacher');
});

// ----------------------------------------------------------------------------
// 3. Edge Handler: Permitted existing @example.invalid accounts
// ----------------------------------------------------------------------------
test('Edge Handler: Allows connecting existing @example.invalid test accounts', async () => {
  const client = createMockAdminClient();
  const handleRequest = await loadEdgeHandler(client);

  const { status, data } = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'TEST Teacher QA',
    email: 'test.teacher.existing@example.invalid',
  });

  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.message, 'Kết nối tài khoản giáo viên thành công.');
  assert.equal(data.data.email, 'test.teacher.existing@example.invalid');

  const linkCall = client.calls.rpc.find((c) => c.fnName === 'm2_link_existing_teacher');
  assert.ok(linkCall);
  assert.equal(linkCall.params.p_email, 'test.teacher.existing@example.invalid');
  assert.deepEqual(linkCall.params.p_class_ids, []);
});

// ----------------------------------------------------------------------------
// 4. Edge Handler: Access control denials
// ----------------------------------------------------------------------------
test('Edge Handler: Rejects unauthenticated and non-admin requests', async () => {
  const client = createMockAdminClient();
  const handleRequest = await loadEdgeHandler(client);

  // 1. Explicit null access token (proves unauthenticated rejects without accidental default token)
  const nullTokenRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Thầy Bình',
    email: 'binh@school.edu.vn',
  }, null);
  assert.equal(nullTokenRes.status, 401);
  assert.equal(nullTokenRes.data.code, 'UNAUTHORIZED');

  // 2. Malformed / invalid access token string
  const unauthRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Thầy Bình',
    email: 'binh@school.edu.vn',
  }, 'invalid-jwt-token');
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.data.code, 'UNAUTHORIZED');

  // 3. Non-admin actor (role: teacher)
  const teacherToken = createMockJwt({ app_metadata: { role: 'teacher', m2_session_version: 1 } });
  const nonAdminClient = createMockAdminClient({ actorRole: 'teacher' });
  const nonAdminHandler = await loadEdgeHandler(nonAdminClient);

  const forbiddenRes = await sendEdgeRequest(nonAdminHandler, 'create-teacher', {
    name: 'Thầy Bình',
    email: 'binh@school.edu.vn',
  }, teacherToken);
  assert.equal(forbiddenRes.status, 403);
  assert.equal(forbiddenRes.data.code, 'FORBIDDEN');

  // 4. Non-admin actor (role: student)
  const studentToken = createMockJwt({ app_metadata: { role: 'student', m2_session_version: 1 } });
  const studentClient = createMockAdminClient({ actorRole: 'student' });
  const studentHandler = await loadEdgeHandler(studentClient);

  const studentRes = await sendEdgeRequest(studentHandler, 'create-teacher', {
    name: 'Thầy Bình',
    email: 'binh@school.edu.vn',
  }, studentToken);
  assert.equal(studentRes.status, 403);
  assert.equal(studentRes.data.code, 'FORBIDDEN');

  // RPC must not have been invoked for unauthorized/forbidden actors
  assert.equal(client.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length, 0);
  assert.equal(nonAdminClient.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length, 0);
  assert.equal(studentClient.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length, 0);
});

// ----------------------------------------------------------------------------
// 5. Edge Handler: Payload and Class Validation
// ----------------------------------------------------------------------------
test('Edge Handler: Malformed class input or invalid name/email rejected before RPC call', async () => {
  const client = createMockAdminClient();
  const handleRequest = await loadEdgeHandler(client);

  // 1. Empty name
  const emptyNameRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: '   ',
    email: 'teacher@school.edu.vn',
  });
  assert.equal(emptyNameRes.status, 400);
  assert.equal(emptyNameRes.data.code, 'INVALID_PAYLOAD');

  // 2. Name too long (> 100)
  const longNameRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'A'.repeat(101),
    email: 'teacher@school.edu.vn',
  });
  assert.equal(longNameRes.status, 400);
  assert.equal(longNameRes.data.code, 'INVALID_PAYLOAD');

  // 3. Invalid email format
  const badEmailRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Teacher Name',
    email: 'not-an-email',
  });
  assert.equal(badEmailRes.status, 400);
  assert.equal(badEmailRes.data.code, 'INVALID_PAYLOAD');

  // 4. Malformed UUID in assignedClassIds array
  const badClassUuidRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Teacher Name',
    email: 'teacher@school.edu.vn',
    assignedClassIds: ['not-a-valid-uuid'],
  });
  assert.equal(badClassUuidRes.status, 400);
  assert.equal(badClassUuidRes.data.code, 'INVALID_PAYLOAD');

  // 5. Non-array assignedClassIds (e.g. string or object)
  const nonArrayClassRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Teacher Name',
    email: 'teacher@school.edu.vn',
    assignedClassIds: '33333333-3333-4333-8333-000000000001',
  });
  assert.equal(nonArrayClassRes.status, 400);
  assert.equal(nonArrayClassRes.data.code, 'INVALID_PAYLOAD');

  // 6. Exceeding class array limit (> 100)
  const hugeClassList = Array.from({ length: 101 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  );
  const tooManyClassRes = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Teacher Name',
    email: 'teacher@school.edu.vn',
    assignedClassIds: hugeClassList,
  });
  assert.equal(tooManyClassRes.status, 400);
  assert.equal(tooManyClassRes.data.code, 'INVALID_PAYLOAD');

  // Zero RPC calls for invalid payloads
  assert.equal(client.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length, 0);
});

// ----------------------------------------------------------------------------
// 6. Edge Handler: Safe Error Mapping from RPC
// ----------------------------------------------------------------------------
test('Edge Handler: Maps specific RPC error codes to friendly messages without leaking raw SQL', async () => {
  const errorCases = [
    {
      rpcErr: 'AUTH_USER_NOT_FOUND',
      expectedStatus: 404,
      expectedCode: 'AUTH_USER_NOT_FOUND',
      expectedMsg: 'Không tìm thấy tài khoản người dùng trong hệ thống xác thực. Vui lòng tạo tài khoản trước.',
    },
    {
      rpcErr: 'AUTH_USER_DELETED',
      expectedStatus: 404,
      expectedCode: 'AUTH_USER_NOT_FOUND',
      expectedMsg: 'Không tìm thấy tài khoản người dùng trong hệ thống xác thực. Vui lòng tạo tài khoản trước.',
    },
    {
      rpcErr: 'AUTH_USER_UNCONFIRMED',
      expectedStatus: 400,
      expectedCode: 'AUTH_USER_UNCONFIRMED',
      expectedMsg: 'Tài khoản người dùng chưa được xác nhận email hoặc chưa thiết lập mật khẩu.',
    },
    {
      rpcErr: 'AUTH_USER_NO_PASSWORD',
      expectedStatus: 400,
      expectedCode: 'AUTH_USER_UNCONFIRMED',
      expectedMsg: 'Tài khoản người dùng chưa được xác nhận email hoặc chưa thiết lập mật khẩu.',
    },
    {
      rpcErr: 'TEACHER_ALREADY_MAPPED',
      expectedStatus: 409,
      expectedCode: 'TEACHER_ALREADY_MAPPED',
      expectedMsg: 'Tài khoản người dùng đã được liên kết với hồ sơ trong hệ thống.',
    },
    {
      rpcErr: 'PROFILE_EMAIL_EXISTS',
      expectedStatus: 409,
      expectedCode: 'TEACHER_ALREADY_MAPPED',
      expectedMsg: 'Tài khoản người dùng đã được liên kết với hồ sơ trong hệ thống.',
    },
    {
      rpcErr: 'AUTH_USER_DUPLICATE_EMAIL',
      expectedStatus: 409,
      expectedCode: 'AUTH_USER_DUPLICATE_EMAIL',
      expectedMsg: 'Phát hiện nhiều tài khoản trùng email trong hệ thống xác thực. Vui lòng liên hệ kỹ thuật để xử lý.',
    },
    {
      rpcErr: 'AUTH_USER_CONFLICTING_ROLE',
      expectedStatus: 400,
      expectedCode: 'AUTH_USER_CONFLICTING_ROLE',
      expectedMsg: 'Tài khoản người dùng đã có vai trò khác không tương thích.',
    },
    {
      rpcErr: 'CLASS_ALREADY_ASSIGNED',
      expectedStatus: 409,
      expectedCode: 'CLASS_ALREADY_ASSIGNED',
      expectedMsg: 'Một hoặc nhiều lớp học đã có giáo viên phụ trách. Vui lòng tải lại trang và kiểm tra Quản lý lớp.',
    },
    {
      rpcErr: 'Active class not found: 44444444-4444-4444-8444-000000000001',
      expectedStatus: 400,
      expectedCode: 'CLASS_NOT_FOUND',
      expectedMsg: 'Một hoặc nhiều lớp học được chọn không hợp lệ hoặc không còn hoạt động.',
    },
    {
      rpcErr: 'INVALID_CLASS_ARRAY',
      expectedStatus: 400,
      expectedCode: 'CLASS_NOT_FOUND',
      expectedMsg: 'Một hoặc nhiều lớp học được chọn không hợp lệ hoặc không còn hoạt động.',
    },
    {
      rpcErr: 'ADMIN_NOT_ACTIVE',
      expectedStatus: 403,
      expectedCode: 'FORBIDDEN',
      expectedMsg: 'Thao tác chỉ dành cho Quản trị viên.',
    },
    {
      rpcErr: 'syntax error at or near "SELECT" / secret connection failed',
      expectedStatus: 500,
      expectedCode: 'INTERNAL_ERROR',
      expectedMsg: 'Đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại sau.',
    },
  ];

  for (const c of errorCases) {
    const client = createMockAdminClient({ linkError: { message: c.rpcErr } });
    const handleRequest = await loadEdgeHandler(client);

    const { status, data } = await sendEdgeRequest(handleRequest, 'create-teacher', {
      name: 'Teacher Name',
      email: 'teacher@school.edu.vn',
    });

    assert.equal(status, c.expectedStatus, `Status mismatch for error ${c.rpcErr}`);
    assert.equal(data.success, false);
    assert.equal(data.code, c.expectedCode, `Code mismatch for error ${c.rpcErr}`);
    assert.equal(data.message, c.expectedMsg, `Message mismatch for error ${c.rpcErr}`);

    // Verify raw error string is NEVER exposed
    if (c.rpcErr.includes('secret') || c.rpcErr.includes('syntax')) {
      assert.ok(!JSON.stringify(data).includes('secret'));
      assert.ok(!JSON.stringify(data).includes('syntax'));
    }
  }
});

// ----------------------------------------------------------------------------
// 7. Edge Handler: coordinator-seed-fixture with qa-unmapped-staff
// ----------------------------------------------------------------------------
test('Edge Handler: coordinator-seed-fixture creates unmapped staff native Auth account and rejects collisions', async () => {
  const profileId = '55555555-5555-4555-8555-000000000001';
  const authUserId = '66666666-6666-4666-8666-000000000001';

  // 1. Positive creation of qa-unmapped-staff
  const client = createMockAdminClient();
  const handleRequest = await loadEdgeHandler(client);

  const posRes = await sendEdgeRequest(
    handleRequest,
    'coordinator-seed-fixture',
    {
      fixtureType: 'qa-unmapped-staff',
      fixtureRole: 'teacher',
      profileId,
      authUserId,
      authEmail: 'test.unmapped.staff@example.invalid',
      authPassword: 'TestPassword123!',
      fullName: 'TEST Teacher Staff',
      emailConfirm: true,
    },
    createMockJwt()
  );

  assert.equal(posRes.status, 200);
  assert.equal(posRes.data.success, true);
  assert.equal(posRes.data.data.profileId, profileId);
  assert.equal(posRes.data.data.authUserId, authUserId);

  // Assert native Auth user was created
  assert.equal(client.calls.auth.createUser.length, 1);
  const createdAuth = client.calls.auth.createUser[0];
  assert.equal(createdAuth.id, authUserId);
  assert.equal(createdAuth.email, 'test.unmapped.staff@example.invalid');
  assert.equal(createdAuth.email_confirm, true);
  // CRITICAL: Must NOT set app_metadata role or m2_session_version
  assert.equal(createdAuth.app_metadata, undefined);

  // 2. Negative unconfirmed case (emailConfirm: false)
  const clientUnconf = createMockAdminClient();
  const handleReqUnconf = await loadEdgeHandler(clientUnconf);
  const unconfRes = await sendEdgeRequest(
    handleReqUnconf,
    'coordinator-seed-fixture',
    {
      fixtureType: 'qa-unmapped-staff',
      fixtureRole: 'teacher',
      profileId,
      authUserId,
      authEmail: 'test.unconf@example.invalid',
      authPassword: 'TestPassword123!',
      fullName: 'TEST Unconf Teacher',
      emailConfirm: false,
    },
    createMockJwt()
  );
  assert.equal(unconfRes.status, 200);
  assert.equal(clientUnconf.calls.auth.createUser[0].email_confirm, false);

  // 3. Rejects non-teacher role
  const nonTeacherRes = await sendEdgeRequest(
    handleRequest,
    'coordinator-seed-fixture',
    {
      fixtureType: 'qa-unmapped-staff',
      fixtureRole: 'student',
      profileId,
      authUserId,
      authEmail: 'test.student@example.invalid',
      authPassword: 'TestPassword123!',
      fullName: 'TEST Student',
    },
    createMockJwt()
  );
  assert.equal(nonTeacherRes.status, 400);
  assert.equal(nonTeacherRes.data.code, 'INVALID_PAYLOAD');

  // 4. Rejects non-@example.invalid domain
  const realDomainRes = await sendEdgeRequest(
    handleRequest,
    'coordinator-seed-fixture',
    {
      fixtureType: 'qa-unmapped-staff',
      fixtureRole: 'teacher',
      profileId,
      authUserId,
      authEmail: 'teacher@realcompany.com',
      authPassword: 'TestPassword123!',
      fullName: 'TEST Real Teacher',
    },
    createMockJwt()
  );
  assert.equal(realDomainRes.status, 400);
  assert.equal(realDomainRes.data.code, 'INVALID_PAYLOAD');

  // 5. Rejects collision if Auth user already exists
  const clientCollision = createMockAdminClient({
    existingAuthUser: { id: authUserId, email: 'test.unmapped.staff@example.invalid' },
  });
  const handleCollision = await loadEdgeHandler(clientCollision);

  const collisionRes = await sendEdgeRequest(
    handleCollision,
    'coordinator-seed-fixture',
    {
      fixtureType: 'qa-unmapped-staff',
      fixtureRole: 'teacher',
      profileId,
      authUserId,
      authEmail: 'test.unmapped.staff@example.invalid',
      authPassword: 'TestPassword123!',
      fullName: 'TEST Teacher Staff',
    },
    createMockJwt()
  );
  assert.equal(collisionRes.status, 409);
  assert.equal(collisionRes.data.code, 'COLLISION_REJECTED');
});

// ----------------------------------------------------------------------------
// 8. Edge Handler: Occupied class error mapping
// ----------------------------------------------------------------------------
test('Edge Handler: Occupied class returns 409 CLASS_ALREADY_ASSIGNED with friendly reload message', async () => {
  const client = createMockAdminClient({
    linkError: { message: 'CLASS_ALREADY_ASSIGNED' },
  });
  const handleRequest = await loadEdgeHandler(client);

  const { status, data } = await sendEdgeRequest(handleRequest, 'create-teacher', {
    name: 'Cô Nguyễn Thị Mai',
    email: 'mai.nguyen@school.edu.vn',
    assignedClassIds: ['33333333-3333-4333-8333-000000000001'],
  });

  assert.equal(status, 409);
  assert.equal(data.success, false);
  assert.equal(data.code, 'CLASS_ALREADY_ASSIGNED');
  assert.equal(
    data.message,
    'Một hoặc nhiều lớp học đã có giáo viên phụ trách. Vui lòng tải lại trang và kiểm tra Quản lý lớp.'
  );
});

// ----------------------------------------------------------------------------
// 9. Edge Handler: coordinator-seed-fixture privileged test hook negative tests
// ----------------------------------------------------------------------------
test('Edge Handler: coordinator-seed-fixture denies disallowed origin, missing BFF secret, and invalid BFF secret', async () => {
  const profileId = '77777777-7777-4777-8777-000000000001';
  const authUserId = '88888888-8888-4888-8888-000000000001';
  const fixturePayload = {
    fixtureType: 'qa-unmapped-staff',
    fixtureRole: 'teacher',
    profileId,
    authUserId,
    authEmail: 'test.denied.staff@example.invalid',
    authPassword: 'TestPassword123!',
    fullName: 'TEST Denied Teacher',
    emailConfirm: true,
  };

  // 1. Disallowed SUPABASE_URL (e.g. https://unrelated-project.supabase.co) -> 403 FORBIDDEN
  const clientWrongUrl = createMockAdminClient();
  const handleWrongUrl = await loadEdgeHandler(clientWrongUrl, {
    SUPABASE_URL: 'https://unrelated-project.supabase.co',
  });

  const wrongUrlRes = await sendEdgeRequest(
    handleWrongUrl,
    'coordinator-seed-fixture',
    fixturePayload,
    createMockJwt()
  );
  assert.equal(wrongUrlRes.status, 403);
  assert.equal(wrongUrlRes.data.code, 'FORBIDDEN');
  assert.equal(clientWrongUrl.calls.auth.createUser.length, 0, 'Must NOT call createUser when origin is disallowed');
  assert.equal(
    clientWrongUrl.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length,
    0
  );

  // 2. Missing BFF secret header -> 401 UNAUTHORIZED_BFF
  const clientMissingBff = createMockAdminClient();
  const handleMissingBff = await loadEdgeHandler(clientMissingBff);

  const missingBffRes = await sendEdgeRequest(
    handleMissingBff,
    'coordinator-seed-fixture',
    fixturePayload,
    createMockJwt(),
    '127.0.0.1',
    { 'x-mindx-bff-secret': undefined }
  );
  assert.equal(missingBffRes.status, 401);
  assert.equal(missingBffRes.data.code, 'UNAUTHORIZED_BFF');
  assert.equal(clientMissingBff.calls.auth.createUser.length, 0, 'Must NOT call createUser when BFF secret header is missing');
  assert.equal(
    clientMissingBff.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length,
    0
  );

  // 3. Incorrect BFF secret (RPC returns false) -> 401 UNAUTHORIZED_BFF
  const clientInvalidBff = createMockAdminClient({ bffSecretValid: false });
  const handleInvalidBff = await loadEdgeHandler(clientInvalidBff);

  const invalidBffRes = await sendEdgeRequest(
    handleInvalidBff,
    'coordinator-seed-fixture',
    fixturePayload,
    createMockJwt(),
    '127.0.0.1',
    { 'x-mindx-bff-secret': 'wrong-secret' }
  );
  assert.equal(invalidBffRes.status, 401);
  assert.equal(invalidBffRes.data.code, 'UNAUTHORIZED_BFF');
  assert.equal(clientInvalidBff.calls.auth.createUser.length, 0, 'Must NOT call createUser when BFF secret is invalid');
  assert.equal(
    clientInvalidBff.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length,
    0
  );

  // 4. Incorrect BFF secret (RPC returns error) -> 401 UNAUTHORIZED_BFF
  const clientErrorBff = createMockAdminClient({ bffSecretError: new Error('BFF verification RPC failure') });
  const handleErrorBff = await loadEdgeHandler(clientErrorBff);

  const errorBffRes = await sendEdgeRequest(
    handleErrorBff,
    'coordinator-seed-fixture',
    fixturePayload,
    createMockJwt(),
    '127.0.0.1',
    { 'x-mindx-bff-secret': 'some-secret' }
  );
  assert.equal(errorBffRes.status, 401);
  assert.equal(errorBffRes.data.code, 'UNAUTHORIZED_BFF');
  assert.equal(clientErrorBff.calls.auth.createUser.length, 0, 'Must NOT call createUser when BFF RPC errors');
  assert.equal(
    clientErrorBff.calls.rpc.filter((c) => c.fnName === 'm2_link_existing_teacher').length,
    0
  );
});
