// ============================================================================
// MINDX LEARN — M2 Backend Domain & Policy Unit Tests (Canonical v2)
// Runner: Node.js native test runner (node:test, node:assert/strict)
// Run via: npm test (node --test tests/*.test.mjs)
//
// Rules enforced:
// - Imports ONLY from actual production source files (no mirrored validator or shadow copy)
// - Uses valid UUIDs and canonical 43-character base64url derived passwords
// - Tests actual production validatePinCommitRecords helper from domain.ts
// - Identifies SQL assertions as static source contract checks (never claims runtime RLS)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import production Edge domain helpers directly from actual source
import * as domain from '../supabase/functions/m2-backend/domain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_PATH = path.resolve(__dirname, '../supabase/migrations/20261014111216_m2_identity.sql');

// ----------------------------------------------------------------------------
// 1. Production Domain Helper: Canonical HMAC & Lowercase UUID Normalization
// ----------------------------------------------------------------------------
test('Production Domain: Canonical HMAC derivation and lowercase UUID equivalence', async () => {
  const pepper = 'SECURE_TEST_PEPPER_KEY_2026_M2_CANONICAL';
  const lowerAuthId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const upperAuthId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const pin = '88889999';

  const derivedLower = await domain.computeStudentAuthPassword(lowerAuthId, pin, pepper);
  const derivedUpper = await domain.computeStudentAuthPassword(upperAuthId, pin, pepper);

  assert.equal(typeof derivedLower, 'string');
  assert.equal(derivedLower.length, 43, 'HMAC-SHA256 base64url output must be exactly 43 characters');
  assert.equal(derivedLower, derivedUpper, 'Edge domain helper must normalize UUID casing to lowercase');

  // Different PIN produces different password
  const diffPin = await domain.computeStudentAuthPassword(lowerAuthId, '11223344', pepper);
  assert.notEqual(derivedLower, diffPin);

  // Different pepper produces different password
  const diffPepper = await domain.computeStudentAuthPassword(lowerAuthId, pin, 'ANOTHER_PEPPER_KEY');
  assert.notEqual(derivedLower, diffPepper);
});

// ----------------------------------------------------------------------------
// 2. Production Token Claims: Session ID, Version, and Expiry
// ----------------------------------------------------------------------------
test('Production Domain: decodeJwtClaims extracts and detects expiration or missing claims', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

  // 1. Valid Token
  const validPayload = Buffer.from(
    JSON.stringify({
      sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      app_metadata: { role: 'student', m2_session_version: 2 },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');

  const claims = domain.decodeJwtClaims(`${header}.${validPayload}.sig`);
  assert.ok(claims);
  assert.equal(claims.sub, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(claims.session_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(claims.app_metadata?.m2_session_version, 2);

  // 2. Expired Token
  const expiredPayload = Buffer.from(
    JSON.stringify({
      sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      app_metadata: { role: 'student', m2_session_version: 2 },
      exp: Math.floor(Date.now() / 1000) - 3600,
    })
  ).toString('base64url');

  const expiredClaims = domain.decodeJwtClaims(`${header}.${expiredPayload}.sig`);
  assert.ok(expiredClaims);
  assert.ok(expiredClaims.exp && expiredClaims.exp * 1000 < Date.now(), 'Token must be recognized as expired');

  // 3. Token Missing session_id
  const noSessionPayload = Buffer.from(
    JSON.stringify({
      sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      app_metadata: { role: 'student', m2_session_version: 1 },
    })
  ).toString('base64url');

  const noSessionClaims = domain.decodeJwtClaims(`${header}.${noSessionPayload}.sig`);
  assert.ok(noSessionClaims);
  assert.equal(noSessionClaims.session_id, undefined);
});

// ----------------------------------------------------------------------------
// 3. Production PIN Commit Seam: validatePinCommitRecords
// Uses valid UUIDs and canonical 43-character base64url derived passwords
// ----------------------------------------------------------------------------
test('Production Domain Contract: validatePinCommitRecords validates target list, rejects raw PINs, duplicates, and Auth ID substitution', async () => {
  if (typeof domain.validatePinCommitRecords !== 'function') {
    assert.fail(
      'MISSING_PRODUCTION_SEAM: Worker A must export validatePinCommitRecords(records, targets) from supabase/functions/m2-backend/domain.ts'
    );
  }

  const pepper = 'SECURE_TEST_PEPPER_KEY_2026_M2_CANONICAL';
  const studentId1 = '11111111-1111-4111-8111-000000000001';
  const authUserId1 = '22222222-2222-4222-8222-000000000001';
  const studentId2 = '11111111-1111-4111-8111-000000000002';
  const authUserId2 = '22222222-2222-4222-8222-000000000002';
  const foreignAuthUserId = '33333333-3333-4333-8333-000000000003';

  const authPwd1 = await domain.computeStudentAuthPassword(authUserId1, '88889999', pepper);
  const authPwd2 = await domain.computeStudentAuthPassword(authUserId2, '11223344', pepper);
  const foreignAuthPwd = await domain.computeStudentAuthPassword(foreignAuthUserId, '99998888', pepper);

  assert.equal(authPwd1.length, 43);
  assert.equal(authPwd2.length, 43);

  const claimedTargets = [
    { studentId: studentId1, authUserId: authUserId1 },
    { studentId: studentId2, authUserId: authUserId2 },
  ];

  // 1. Exact valid commit
  const validRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: authPwd1 },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  assert.deepEqual(domain.validatePinCommitRecords(validRecords, claimedTargets), { valid: true });

  // 2. Reject 8-digit raw PIN as authPassword
  const rawPinRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: '88889999' },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const rawPinResult = domain.validatePinCommitRecords(rawPinRecords, claimedTargets);
  assert.equal(rawPinResult.valid, false);
  assert.equal(rawPinResult.code, 'RAW_PIN_REJECTED');

  // 3. Duplicate student ID substituting missing pupil [A, A]
  const duplicateRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: authPwd1 },
    { studentId: studentId1, authUserId: authUserId1, authPassword: authPwd1 },
  ];
  const dupResult = domain.validatePinCommitRecords(duplicateRecords, claimedTargets);
  assert.equal(dupResult.valid, false);
  assert.equal(dupResult.code, 'DUPLICATE_STUDENT');

  // 4. Duplicate authUserId [A, A]
  const dupAuthRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: authPwd1 },
    { studentId: studentId2, authUserId: authUserId1, authPassword: authPwd2 },
  ];
  const dupAuthResult = domain.validatePinCommitRecords(dupAuthRecords, claimedTargets);
  assert.equal(dupAuthResult.valid, false);
  assert.equal(dupAuthResult.code, 'DUPLICATE_AUTH_ID');

  // 5. Injected foreign AuthUUID
  const foreignAuthRecords = [
    { studentId: studentId1, authUserId: foreignAuthUserId, authPassword: foreignAuthPwd },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const foreignResult = domain.validatePinCommitRecords(foreignAuthRecords, claimedTargets);
  assert.equal(foreignResult.valid, false);
  assert.equal(foreignResult.code, 'AUTH_ID_MISMATCH');

  // 6. Record count mismatch
  const mismatchRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: authPwd1 },
  ];
  const mismatchResult = domain.validatePinCommitRecords(mismatchRecords, claimedTargets);
  assert.equal(mismatchResult.valid, false);
  assert.equal(mismatchResult.code, 'RECORD_MISMATCH');

  // 7. Non-UUID studentId rejected
  const nonUuidStudentRecords = [
    { studentId: 'not-a-valid-uuid', authUserId: authUserId1, authPassword: authPwd1 },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const nonUuidStudentResult = domain.validatePinCommitRecords(nonUuidStudentRecords, claimedTargets);
  assert.equal(nonUuidStudentResult.valid, false);
  assert.equal(nonUuidStudentResult.code, 'INVALID_PAYLOAD');

  // 8. Non-UUID authUserId rejected
  const nonUuidAuthRecords = [
    { studentId: studentId1, authUserId: 'not-a-valid-uuid', authPassword: authPwd1 },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const nonUuidAuthResult = domain.validatePinCommitRecords(nonUuidAuthRecords, claimedTargets);
  assert.equal(nonUuidAuthResult.valid, false);
  assert.equal(nonUuidAuthResult.code, 'INVALID_PAYLOAD');

  // 9. Short password (not 43 characters base64url HMAC) rejected
  const shortPwdRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: 'short_pwd' },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const shortPwdResult = domain.validatePinCommitRecords(shortPwdRecords, claimedTargets);
  assert.equal(shortPwdResult.valid, false);
  assert.equal(shortPwdResult.code, 'INVALID_PAYLOAD');

  // 10. Invalid character symbols in 43-char password rejected
  const badCharRecords = [
    { studentId: studentId1, authUserId: authUserId1, authPassword: 'invalid_chars_43_chars_long_with_symbols!@#' },
    { studentId: studentId2, authUserId: authUserId2, authPassword: authPwd2 },
  ];
  const badCharResult = domain.validatePinCommitRecords(badCharRecords, claimedTargets);
  assert.equal(badCharResult.valid, false);
  assert.equal(badCharResult.code, 'INVALID_PAYLOAD');
});

// ----------------------------------------------------------------------------
// 4. Static SQL Migration Contract: Native auth.sessions, Locking & RPCs
// Static source contract inspection ONLY — never claims runtime RLS proof.
// ----------------------------------------------------------------------------
test('Static SQL Migration Contract: Verify m2_verify_actor_session and canonical locking (static source contract check, not runtime RLS proof)', async () => {
  const sql = await fs.readFile(MIGRATION_PATH, 'utf-8');

  // Verify m2_verify_actor_session exists and inspects auth.sessions
  assert.ok(sql.includes('public.m2_verify_actor_session'), 'Must define m2_verify_actor_session RPC');
  assert.ok(sql.includes('FROM auth.sessions s'), 'm2_verify_actor_session must query auth.sessions table');
  assert.ok(sql.includes('s.id = p_session_id'), 'm2_verify_actor_session must verify session_id');
  assert.ok(sql.includes('s.user_id = p_auth_user_id'), 'm2_verify_actor_session must verify auth_user_id');

  // Verify claim locking locks target class for both modes
  assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('class:' || v_target_class_id::text))"), 'Must lock canonical class key');

  // Verify atomic commit finalization RPC
  assert.ok(sql.includes('public.m2_finalize_pin_commit'), 'Must define m2_finalize_pin_commit');

  // Verify teacher RLS filters active classes and students
  assert.ok(sql.includes("AND s.status = 'active'"), 'Teacher profile RLS must filter active students');
  assert.ok(sql.includes("AND c.status = 'active'"), 'Teacher profile RLS must filter active classes');

  // Verify storage upload denial and admin-only select
  assert.ok(sql.includes('m2_storage_deny_uploads'), 'Must define deny_uploads policy');
  assert.ok(sql.includes('public.is_active_admin()'), 'Storage select policy must be restricted to active admin');

  // Verify teacher fixtures use @example.invalid
  assert.ok(sql.includes('hoang.minh@example.invalid'), 'Teacher fixture email must be @example.invalid');
  assert.ok(sql.includes('thu.trang@example.invalid'), 'Teacher fixture email must be @example.invalid');
});

// ----------------------------------------------------------------------------
// 5. Production Domain Helper: safeAuthOperation
// ----------------------------------------------------------------------------
test('Production Domain Contract: safeAuthOperation succeeds on { error: null }, fails on error object, thrown/rejected, and malformed responses', async () => {
  if (typeof domain.safeAuthOperation !== 'function') {
    assert.fail(
      'MISSING_PRODUCTION_SEAM: Worker A must export safeAuthOperation from supabase/functions/m2-backend/domain.ts'
    );
  }

  // 1. SDK { error: null } succeeds
  const successCallback = await domain.safeAuthOperation(async () => ({ error: null }));
  assert.equal(successCallback, true, 'safeAuthOperation must return true when SDK returns { error: null }');

  const successPromise = await domain.safeAuthOperation(Promise.resolve({ error: null }));
  assert.equal(successPromise, true, 'safeAuthOperation must return true on resolved Promise<{ error: null }>');

  const successSync = await domain.safeAuthOperation({ error: null });
  assert.equal(successSync, true, 'safeAuthOperation must return true on sync object { error: null }');

  // 2. Returned error object fails
  const errorObjCallback = await domain.safeAuthOperation(async () => ({
    error: { message: 'Simulated auth error', status: 400 },
  }));
  assert.equal(errorObjCallback, false, 'safeAuthOperation must return false when SDK returns error object');

  const errorObjPromise = await domain.safeAuthOperation(
    Promise.resolve({ error: new Error('Simulated exception object') })
  );
  assert.equal(errorObjPromise, false, 'safeAuthOperation must return false on Promise with error object');

  // 3. Thrown / rejected fails
  const thrownCallback = await domain.safeAuthOperation(async () => {
    throw new Error('Simulated synchronous/async throw');
  });
  assert.equal(thrownCallback, false, 'safeAuthOperation must return false when callback throws');

  const rejectedPromise = await domain.safeAuthOperation(
    Promise.reject(new Error('Simulated rejected promise'))
  );
  assert.equal(rejectedPromise, false, 'safeAuthOperation must return false on rejected Promise');

  // 4. Malformed missing/null/undefined/{} response MUST fail closed (contract spec)
  // Note: Contract requires fail-closed; if current domain.ts returns true for null/undefined/{},
  // this test strictly maintains expected behavior without weakening assertions.
  const nullResponse = await domain.safeAuthOperation(async () => null);
  assert.equal(nullResponse, false, 'safeAuthOperation must fail closed on null response');

  const undefinedResponse = await domain.safeAuthOperation(async () => undefined);
  assert.equal(undefinedResponse, false, 'safeAuthOperation must fail closed on undefined response');

  const emptyObjResponse = await domain.safeAuthOperation(async () => ({}));
  assert.equal(emptyObjResponse, false, 'safeAuthOperation must fail closed on empty object {} missing error property');
});

// ----------------------------------------------------------------------------
// 6. Production Domain Helper: syncBumpedSessionVersions
// ----------------------------------------------------------------------------
test('Production Domain Contract: syncBumpedSessionVersions validates rows, executes all syncs even if earlier fail, and fails closed on malformed input', async () => {
  if (typeof domain.syncBumpedSessionVersions !== 'function') {
    assert.fail(
      'MISSING_PRODUCTION_SEAM: Worker A must export syncBumpedSessionVersions from supabase/functions/m2-backend/domain.ts'
    );
  }

  const fakeAuthId1 = '11111111-1111-4111-8111-000000000001';
  const fakeAuthId2 = '22222222-2222-4222-8222-000000000002';
  const fakeAuthId3 = '33333333-3333-4333-8333-000000000003';

  // 1. Valid UUID and positive integer rows with callback { error: null } succeeds and exact one call per row
  const validRows = [
    { auth_user_id: fakeAuthId1, new_session_version: 2 },
    { auth_user_id: fakeAuthId2, new_session_version: 5 },
  ];
  const validCalls = [];
  const validResult = await domain.syncBumpedSessionVersions(validRows, async (authUserId, newVersion) => {
    validCalls.push({ authUserId, newVersion });
    return { error: null };
  });

  assert.equal(validResult, true, 'syncBumpedSessionVersions must return true when all callbacks succeed');
  assert.equal(validCalls.length, 2, 'Must invoke callback exactly once per row');
  assert.equal(validCalls[0].authUserId, fakeAuthId1);
  assert.equal(validCalls[0].newVersion, 2);
  assert.equal(validCalls[1].authUserId, fakeAuthId2);
  assert.equal(validCalls[1].newVersion, 5);

  // 2. Returned error first + throw second still attempts third, aggregate result is false
  const threeRows = [
    { auth_user_id: fakeAuthId1, new_session_version: 1 },
    { auth_user_id: fakeAuthId2, new_session_version: 2 },
    { auth_user_id: fakeAuthId3, new_session_version: 3 },
  ];
  const multiCalls = [];
  const multiResult = await domain.syncBumpedSessionVersions(threeRows, async (authUserId, newVersion) => {
    multiCalls.push({ authUserId, newVersion });
    if (multiCalls.length === 1) {
      return { error: { message: 'first actor error' } };
    }
    if (multiCalls.length === 2) {
      throw new Error('second actor network throw');
    }
    return { error: null };
  });

  assert.equal(multiResult, false, 'Aggregate result must be false when any actor sync fails');
  assert.equal(multiCalls.length, 3, 'Must attempt third actor even if first and second fail');
  assert.equal(multiCalls[0].authUserId, fakeAuthId1);
  assert.equal(multiCalls[1].authUserId, fakeAuthId2);
  assert.equal(multiCalls[2].authUserId, fakeAuthId3);

  // 3. Malformed UUID, zero/fraction/non-number version, non-array/null input: returns false without callback invocation
  let unreachedCalls = 0;
  const dummySync = async () => {
    unreachedCalls++;
    return { error: null };
  };

  // Malformed UUID
  const badUuidRes = await domain.syncBumpedSessionVersions(
    [{ auth_user_id: 'not-a-valid-uuid', new_session_version: 1 }],
    dummySync
  );
  assert.equal(badUuidRes, false, 'Must reject malformed UUID');
  assert.equal(unreachedCalls, 0, 'Callback must not be invoked on malformed UUID');

  // Zero session version
  const zeroVerRes = await domain.syncBumpedSessionVersions(
    [{ auth_user_id: fakeAuthId1, new_session_version: 0 }],
    dummySync
  );
  assert.equal(zeroVerRes, false, 'Must reject zero session version');
  assert.equal(unreachedCalls, 0);

  // Negative session version
  const negVerRes = await domain.syncBumpedSessionVersions(
    [{ auth_user_id: fakeAuthId1, new_session_version: -1 }],
    dummySync
  );
  assert.equal(negVerRes, false, 'Must reject negative session version');
  assert.equal(unreachedCalls, 0);

  // Fraction session version
  const fracVerRes = await domain.syncBumpedSessionVersions(
    [{ auth_user_id: fakeAuthId1, new_session_version: 1.5 }],
    dummySync
  );
  assert.equal(fracVerRes, false, 'Must reject fraction session version');
  assert.equal(unreachedCalls, 0);

  // Non-number session version (string)
  const strVerRes = await domain.syncBumpedSessionVersions(
    [{ auth_user_id: fakeAuthId1, new_session_version: '2' }],
    dummySync
  );
  assert.equal(strVerRes, false, 'Must reject string session version');
  assert.equal(unreachedCalls, 0);

  // Null row in array
  const nullRowRes = await domain.syncBumpedSessionVersions([null], dummySync);
  assert.equal(nullRowRes, false, 'Must reject null row in array');
  assert.equal(unreachedCalls, 0);

  // Non-object row in array
  const strRowRes = await domain.syncBumpedSessionVersions(['malformed_row'], dummySync);
  assert.equal(strRowRes, false, 'Must reject non-object row in array');
  assert.equal(unreachedCalls, 0);

  // Non-array inputs (null, undefined, non-array object)
  assert.equal(await domain.syncBumpedSessionVersions(null, dummySync), false);
  assert.equal(await domain.syncBumpedSessionVersions(undefined, dummySync), false);
  assert.equal(await domain.syncBumpedSessionVersions({}, dummySync), false);
  assert.equal(unreachedCalls, 0, 'Callback must never be invoked on invalid inputs');

  // 4. Empty [] class with no actors: returns valid true without SDK calls
  const emptyRes = await domain.syncBumpedSessionVersions([], dummySync);
  assert.equal(emptyRes, true, 'Empty bumped rows array must return true');
  assert.equal(unreachedCalls, 0, 'No callback should be made for empty array');
});
