/**
 * Unit & Integration Test Suite for MINDX LEARN Next.js BFF (Milestone 2)
 *
 * Runnable via: node --test tests/m2-app.test.mjs
 *
 * Imports directly from production helpers in src/lib/server/crypto.mjs.
 * Zero duplicate / mirrored helper logic in tests.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Import production implementation directly
import {
  normalizeKey32,
  isValidSessionKey,
  assertServerConfiguration,
  encryptSession,
  decryptSession,
  validateSessionPayload,
  createSessionEnvelope,
  extractJwtClaims,
  sanitizePublicUserDto,
  sanitizeBootstrapDto,
  isTrivialPin,
  generateSecurePin8,
  deriveStudentPassword,
  verifySameOrigin,
  isTrustedLoopbackUrl,
  isLocalDevEnvironment,
  SAFE_KNOWN_AUTH_ENUMS,
  sanitizeAuthErrorCode,
  sanitizeAuthMessage,
  resolveTrustedIp,
  validateRequestLimits,
  sanitizeCsvCell,
  validatePinPrepData,
  validateRecoveryContext,
  formatPinCsvContent,
  generatePinCsvFilename,
  resolvePinPrepOutcome,
  resolveLogoutOutcome,
  SAFE_KNOWN_PIN_PREP_ENUMS,
  SAFE_KNOWN_LOGOUT_ENUMS,
  ALLOWED_BFF_ACTIONS,
  BLOCKED_BFF_ACTIONS,
  MINDX_PIN_CONTEXT,
} from '../src/lib/server/crypto.mjs';

// Sample valid 256-bit test keys (64 hex characters)
const VALID_HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const VALID_HEX_KEY_2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const VALID_B64_KEY = crypto.randomBytes(32).toString('base64url');
const VALID_PEPPER = 'mindx_test_secret_pepper_2026_xyz_secure_pepper';

describe('1. 256-Bit Session Key Normalization & Pre-Flight Enforcement', () => {
  test('Accepts valid 64-character hex key', () => {
    const keyBuf = normalizeKey32(VALID_HEX_KEY);
    assert.equal(keyBuf.length, 32);
    assert.equal(isValidSessionKey(VALID_HEX_KEY), true);
  });

  test('Accepts valid 32-byte base64url key', () => {
    const keyBuf = normalizeKey32(VALID_B64_KEY);
    assert.equal(keyBuf.length, 32);
    assert.equal(isValidSessionKey(VALID_B64_KEY), true);
  });

  test('Accepts 32-byte raw Buffer', () => {
    const rawBuf = crypto.randomBytes(32);
    const keyBuf = normalizeKey32(rawBuf);
    assert.equal(keyBuf.length, 32);
    assert.equal(isValidSessionKey(rawBuf), true);
  });

  test('Rejects weak passphrases and invalid types without SHA-256 fallback (fails closed)', () => {
    const weakKeys = ['password123', 'admin', 'short', '12345678', ''];
    for (const weak of weakKeys) {
      assert.throws(() => normalizeKey32(weak), /MINDX_SESSION_KEY/);
      assert.equal(isValidSessionKey(weak), false);
    }
    assert.equal(isValidSessionKey(null), false);
    assert.equal(isValidSessionKey(undefined), false);
    assert.equal(isValidSessionKey(123456), false);
    assert.equal(isValidSessionKey({}), false);
  });

  test('Rejects non-32 byte buffers', () => {
    assert.throws(() => normalizeKey32(crypto.randomBytes(16)), /Độ dài khóa/);
    assert.throws(() => normalizeKey32(crypto.randomBytes(64)), /Độ dài khóa/);
  });

  test('assertServerConfiguration() validates presence and strength of secrets', () => {
    // Valid environment
    assert.doesNotThrow(() => {
      assertServerConfiguration({
        MINDX_SESSION_KEY: VALID_HEX_KEY,
        MINDX_PIN_PEPPER: VALID_PEPPER,
      });
    });

    // Missing session key
    assert.throws(() => {
      assertServerConfiguration({
        MINDX_SESSION_KEY: '',
        MINDX_PIN_PEPPER: VALID_PEPPER,
      });
    }, /MINDX_SESSION_KEY/);

    // Weak session key
    assert.throws(() => {
      assertServerConfiguration({
        MINDX_SESSION_KEY: 'weakpassphrase',
        MINDX_PIN_PEPPER: VALID_PEPPER,
      });
    }, /MINDX_SESSION_KEY/);

    // Missing pepper
    assert.throws(() => {
      assertServerConfiguration({
        MINDX_SESSION_KEY: VALID_HEX_KEY,
        MINDX_PIN_PEPPER: '',
      });
    }, /MINDX_PIN_PEPPER/);

    // Short pepper (< 16 chars)
    assert.throws(() => {
      assertServerConfiguration({
        MINDX_SESSION_KEY: VALID_HEX_KEY,
        MINDX_PIN_PEPPER: 'short',
      });
    }, /MINDX_PIN_PEPPER/);
  });
});

describe('2. AES-256-GCM Session Cookie Encryption & Decryption', () => {
  const sampleSession = {
    accessToken: 'native.mock.supabase.jwt.token',
    refreshToken: 'mock_refresh_token_xyz',
    sessionVersion: 1,
    user: {
      id: 'usr_001',
      name: 'Nguyễn Văn An',
      role: 'admin',
    },
    expiresAt: Date.now() + 3600000, // 1 hour in future
  };

  test('Roundtrip encrypt/decrypt restores identical payload', () => {
    const encrypted = encryptSession(sampleSession, VALID_HEX_KEY);
    assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const decrypted = decryptSession(encrypted, VALID_HEX_KEY);
    assert.deepEqual(decrypted, sampleSession);
  });

  test('Rejects decryption with wrong 256-bit key (returns null)', () => {
    const encrypted = encryptSession(sampleSession, VALID_HEX_KEY);
    const decryptedWithWrongKey = decryptSession(encrypted, VALID_HEX_KEY_2);
    assert.equal(decryptedWithWrongKey, null);
  });

  test('Rejects tampered IV (returns null)', () => {
    const encrypted = encryptSession(sampleSession, VALID_HEX_KEY);
    const parts = encrypted.split('.');
    // Flip first character of IV
    const tamperedIV = parts[1][0] === 'a' ? 'b' + parts[1].slice(1) : 'a' + parts[1].slice(1);
    const tamperedToken = `${parts[0]}.${tamperedIV}.${parts[2]}.${parts[3]}`;

    assert.equal(decryptSession(tamperedToken, VALID_HEX_KEY), null);
  });

  test('Rejects tampered AuthTag (returns null)', () => {
    const encrypted = encryptSession(sampleSession, VALID_HEX_KEY);
    const parts = encrypted.split('.');
    const tamperedTag = parts[2][0] === 'a' ? 'b' + parts[2].slice(1) : 'a' + parts[2].slice(1);
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedTag}.${parts[3]}`;

    assert.equal(decryptSession(tamperedToken, VALID_HEX_KEY), null);
  });

  test('Rejects tampered Ciphertext (returns null)', () => {
    const encrypted = encryptSession(sampleSession, VALID_HEX_KEY);
    const parts = encrypted.split('.');
    const tamperedCipher = parts[3][0] === 'a' ? 'b' + parts[3].slice(1) : 'a' + parts[3].slice(1);
    const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2]}.${tamperedCipher}`;

    assert.equal(decryptSession(tamperedToken, VALID_HEX_KEY), null);
  });

  test('Rejects expired session token based on expiresAt', () => {
    const expiredSession = {
      ...sampleSession,
      expiresAt: Date.now() - 5000, // 5 seconds ago
    };
    const encrypted = encryptSession(expiredSession, VALID_HEX_KEY);
    assert.equal(decryptSession(encrypted, VALID_HEX_KEY), null);
  });

  test('Rejects malformed tokens or empty inputs', () => {
    assert.equal(decryptSession('', VALID_HEX_KEY), null);
    assert.equal(decryptSession(null, VALID_HEX_KEY), null);
    assert.equal(decryptSession('invalid.format', VALID_HEX_KEY), null);
    assert.equal(decryptSession('v2.a.b.c', VALID_HEX_KEY), null);
  });
});

describe('3. PIN Generation & Trivial Sequence Rejection', () => {
  test('isTrivialPin correctly detects all-identical digits', () => {
    assert.equal(isTrivialPin('00000000'), true);
    assert.equal(isTrivialPin('11111111'), true);
    assert.equal(isTrivialPin('88888888'), true);
    assert.equal(isTrivialPin('99999999'), true);
  });

  test('isTrivialPin correctly detects sequential sequences', () => {
    assert.equal(isTrivialPin('01234567'), true);
    assert.equal(isTrivialPin('12345678'), true);
    assert.equal(isTrivialPin('23456789'), true);
    assert.equal(isTrivialPin('87654321'), true);
    assert.equal(isTrivialPin('98765432'), true);
  });

  test('isTrivialPin correctly detects repeated block patterns', () => {
    assert.equal(isTrivialPin('12341234'), true);
    assert.equal(isTrivialPin('12121212'), true);
    assert.equal(isTrivialPin('11223344'), true);
  });

  test('isTrivialPin rejects non-8 digit strings', () => {
    assert.equal(isTrivialPin('1234567'), true); // 7 digits
    assert.equal(isTrivialPin('123456789'), true); // 9 digits
    assert.equal(isTrivialPin('abcdefgh'), true);
    assert.equal(isTrivialPin(''), true);
  });

  test('generateSecurePin8 produces non-trivial 8-digit PINs across 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      const pin = generateSecurePin8();
      assert.match(pin, /^\d{8}$/);
      assert.equal(isTrivialPin(pin), false, `PIN ${pin} was unexpectedly flagged as trivial`);
      const num = Number(pin);
      assert.ok(num >= 10000000 && num <= 99999999);
    }
  });
});

describe('4. Canonical HMAC-SHA256 Student Password Derivation', () => {
  const sampleAuthUserId = '11111111-2222-3333-4444-555555555555';
  const samplePin = '83920147';

  test('Derives consistent base64url password bound to AuthUUID and PIN', () => {
    const pw1 = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);
    const pw2 = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);

    assert.ok(pw1 && typeof pw1 === 'string');
    assert.equal(pw1, pw2);
    // Base64url chars only
    assert.match(pw1, /^[A-Za-z0-9_-]+$/);
  });

  test('Enforces lowercase AuthUUID normalization in HMAC context', () => {
    const uppercaseUUID = '11111111-2222-3333-4444-555555555555'.toUpperCase();
    const pwLower = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);
    const pwUpper = deriveStudentPassword(uppercaseUUID, samplePin, VALID_PEPPER);

    assert.equal(pwLower, pwUpper);
  });

  test('Different AuthUUIDs produce distinct derived passwords for same PIN', () => {
    const otherAuthId = '99999999-8888-7777-6666-555555555555';
    const pw1 = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);
    const pw2 = deriveStudentPassword(otherAuthId, samplePin, VALID_PEPPER);

    assert.notEqual(pw1, pw2);
  });

  test('Different PINs produce distinct derived passwords for same AuthUUID', () => {
    const otherPin = '19283746';
    const pw1 = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);
    const pw2 = deriveStudentPassword(sampleAuthUserId, otherPin, VALID_PEPPER);

    assert.notEqual(pw1, pw2);
  });

  test('Changing pepper produces completely distinct derived passwords', () => {
    const otherPepper = 'another_different_pepper_value_999';
    const pw1 = deriveStudentPassword(sampleAuthUserId, samplePin, VALID_PEPPER);
    const pw2 = deriveStudentPassword(sampleAuthUserId, samplePin, otherPepper);

    assert.notEqual(pw1, pw2);
  });
});

describe('5. Trusted IP Resolution & Spoofing Defense (Node net.isIP)', () => {
  test('Local dev (isDev = true) safely resolves loopback 127.0.0.1', () => {
    const ip = resolveTrustedIp({}, false, true);
    assert.equal(ip, '127.0.0.1');
  });

  test('Vercel environment resolves valid single IPv4 from x-vercel-forwarded-for', () => {
    const headers = { 'x-vercel-forwarded-for': '203.0.113.195' };
    const ip = resolveTrustedIp(headers, true, false);
    assert.equal(ip, '203.0.113.195');
  });

  test('Vercel environment resolves valid single IPv6', () => {
    const headers = { 'x-vercel-forwarded-for': '2001:db8:85a3::8a2e:370:7334' };
    const ip = resolveTrustedIp(headers, true, false);
    assert.equal(ip, '2001:db8:85a3::8a2e:370:7334');
  });

  test('Rejects multiple IPs or comma lists (returns null)', () => {
    const headers = { 'x-vercel-forwarded-for': '203.0.113.195, 198.51.100.1' };
    const ip = resolveTrustedIp(headers, true, false);
    assert.equal(ip, null);
  });

  test('Rejects malformed or non-IP strings (returns null)', () => {
    const headers = { 'x-vercel-forwarded-for': 'not-an-ip-address' };
    const ip = resolveTrustedIp(headers, true, false);
    assert.equal(ip, null);
  });

  test('Rejects spoofed untrusted headers (x-forwarded-for, x-real-ip) in non-Vercel', () => {
    const headers = {
      'x-forwarded-for': '203.0.113.1',
      'x-real-ip': '203.0.113.1',
      'client-ip': '203.0.113.1',
    };
    const ip = resolveTrustedIp(headers, false, false);
    assert.equal(ip, null);
  });

  test('Fails closed if headers are empty or missing in production', () => {
    assert.equal(resolveTrustedIp({}, false, false), null);
    assert.equal(resolveTrustedIp(null, false, false), null);
  });
});

describe('6. Same-Origin & CSRF Enforcement for Mutations', () => {
  test('Rejects missing, empty, or whitespace Origin header on mutation (Never skipOrigin)', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: { host: 'mindx-learn.edu.vn' },
    });
    assert.equal(verifySameOrigin(req), false);

    const reqEmpty = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: { host: 'mindx-learn.edu.vn', origin: '' },
    });
    assert.equal(verifySameOrigin(reqEmpty), false);

    const reqWhitespace = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: { host: 'mindx-learn.edu.vn', origin: '   ' },
    });
    assert.equal(verifySameOrigin(reqWhitespace), false);
  });

  test('Rejects opaque Origin "null"', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn',
        origin: 'null',
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  test('Rejects Sec-Fetch-Site: cross-site', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn',
        origin: 'https://mindx-learn.edu.vn',
        'sec-fetch-site': 'cross-site',
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  test('Rejects mismatched Cross-Origin', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn',
        origin: 'https://evil-attacker.com',
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  test('Rejects cross-scheme http Origin on https Request even when sec-fetch-site is absent', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn',
        origin: 'http://mindx-learn.edu.vn',
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  test('Accepts exact matching same https Origin and request url origin', () => {
    const req = new Request('https://mindx-learn.edu.vn/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn',
        origin: 'https://mindx-learn.edu.vn',
      },
    });
    assert.equal(verifySameOrigin(req), true);
  });

  test('Rejects Origin with different port (portdiff rejected)', () => {
    const req = new Request('https://mindx-learn.edu.vn:3000/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'mindx-learn.edu.vn:3000',
        origin: 'https://mindx-learn.edu.vn:4000',
      },
    });
    assert.equal(verifySameOrigin(req), false);
  });

  test('Accepts local origin on http loopback (127.0.0.1 and localhost)', () => {
    const req127 = new Request('http://127.0.0.1:3000/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
      },
    });
    assert.equal(verifySameOrigin(req127), true);

    const reqLocalhost = new Request('http://localhost:3000/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
    });
    assert.equal(verifySameOrigin(reqLocalhost), true);
  });

  test('Accepts configured trusted site URL origin', () => {
    const req = new Request('https://internal-proxy.local/api/m2/change-password', {
      method: 'POST',
      headers: {
        host: 'internal-proxy.local',
        origin: 'https://mindx-learn-test.vercel.app',
      },
    });
    assert.equal(verifySameOrigin(req, 'https://mindx-learn-test.vercel.app'), true);
  });
});

describe('7. CSV Formula Injection Defense (DDE Sanitization)', () => {
  test('Escapes dangerous leading spreadsheet formula characters (=, +, -, @, \\t)', () => {
    assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"');
    assert.equal(sanitizeCsvCell('+12345678'), '"\'+12345678"');
    assert.equal(sanitizeCsvCell('-cmd|calc!A1'), '"\'-cmd|calc!A1"');
    assert.equal(sanitizeCsvCell('@trigger'), '"\'@trigger"');
    assert.equal(sanitizeCsvCell('\tcmd'), '"\'\tcmd"');
  });

  test('Properly escapes inner double quotes', () => {
    assert.equal(sanitizeCsvCell('Nguyễn "Văn" An'), '"Nguyễn ""Văn"" An"');
  });

  test('Safely wraps normal values without formula prefix', () => {
    assert.equal(sanitizeCsvCell('Lê Bảo Nam'), '"Lê Bảo Nam"');
    assert.equal(sanitizeCsvCell('HS_ROB_001'), '"HS_ROB_001"');
    assert.equal(sanitizeCsvCell(84920147), '"84920147"');
    assert.equal(sanitizeCsvCell(null), '""');
    assert.equal(sanitizeCsvCell(undefined), '""');
  });
});

describe('8. Action Whitelist & Boundary Validation', () => {
  test('ALLOWED_BFF_ACTIONS includes all necessary M2 business actions', () => {
    const required = [
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
      'pin-issue',
      'pin-reissue',
    ];

    for (const act of required) {
      assert.ok(ALLOWED_BFF_ACTIONS.includes(act), `Action ${act} should be in ALLOWED_BFF_ACTIONS`);
    }
  });

  test('BLOCKED_BFF_ACTIONS strictly excludes dangerous administrative & debug actions', () => {
    const dangerous = ['bootstrap-admin', 'coordinator-seed', 'coordinator-seed-fixture', 'raw-sql'];
    for (const act of dangerous) {
      assert.ok(BLOCKED_BFF_ACTIONS.includes(act), `Action ${act} must be blocked`);
      assert.ok(!ALLOWED_BFF_ACTIONS.includes(act), `Action ${act} must not be allowed`);
    }
  });
});

describe('9. Production sanitizePublicUserDto Helper Verification', () => {
  test('Strips internal Auth UUID, authEmail, pinHash, and passwords from user record', () => {
    const rawBackendStudent = {
      id: 'student-public-uuid-001',
      name: 'Lê Bảo Nam',
      studentCode: 'HS_ROB_001',
      role: 'student',
      status: 'active',
      authUserId: 'internal-auth-uuid-999',
      auth_user_id: 'internal-auth-uuid-999',
      authEmail: 'stu_internal_999@example.invalid',
      auth_email: 'stu_internal_999@example.invalid',
      pinHash: '$2b$12$secretHashValueNeverExposed',
      pin_hash: '$2b$12$secretHashValueNeverExposed',
      password: 'internal_secret_pw',
      password_hash: 'hash_xyz',
      accessToken: 'jwt.token.secret',
      refreshToken: 'refresh.token.secret',
      rawJwt: 'header.payload.signature',
      sub: 'internal-auth-uuid-999',
    };

    const sanitized = sanitizePublicUserDto(rawBackendStudent);

    // Assert strictly no private or internal fields survive
    assert.equal(sanitized.id, 'student-public-uuid-001');
    assert.equal(sanitized.name, 'Lê Bảo Nam');
    assert.equal(sanitized.studentCode, 'HS_ROB_001');
    assert.equal(sanitized.role, 'student');
    assert.equal(sanitized.status, 'active');

    assert.equal('authUserId' in sanitized, false);
    assert.equal('auth_user_id' in sanitized, false);
    assert.equal('authEmail' in sanitized, false);
    assert.equal('auth_email' in sanitized, false);
    assert.equal('pinHash' in sanitized, false);
    assert.equal('pin_hash' in sanitized, false);
    assert.equal('password' in sanitized, false);
    assert.equal('password_hash' in sanitized, false);
    assert.equal('accessToken' in sanitized, false);
    assert.equal('refreshToken' in sanitized, false);
    assert.equal('rawJwt' in sanitized, false);
    assert.equal('sub' in sanitized, false);
  });

  test('Handles null, undefined, or invalid inputs safely without throwing', () => {
    assert.equal(sanitizePublicUserDto(null), null);
    assert.equal(sanitizePublicUserDto(undefined), null);
    assert.equal(sanitizePublicUserDto('not-an-object'), null);
    assert.equal(sanitizePublicUserDto(12345), null);
  });
});

describe('10. Production sanitizeBootstrapDto Helper Verification', () => {
  test('Recursively sanitizes currentUser, users array, and students array', () => {
    const rawBootstrap = {
      currentUser: {
        id: 'usr_coordinator_01',
        name: 'Điều phối viên',
        role: 'coordinator',
        status: 'active',
        authUserId: 'auth-coord-uuid',
        pinHash: 'coord-pin-hash',
        accessToken: 'leaked-token',
      },
      users: [
        {
          id: 'usr_t1',
          name: 'Cô Lan',
          role: 'teacher',
          status: 'active',
          authUserId: 'auth-t1-uuid',
          password: 't1-password',
        },
      ],
      students: [
        {
          id: 'st_01',
          fullName: 'Nguyễn Văn An',
          studentCode: 'HS_001',
          authUserId: 'auth-st1-uuid',
          authEmail: 'st1@school.internal',
          pinHash: 'st1-pin-hash',
          rawPin: '12345678',
        },
      ],
      // Dangerous top-level leaks from edge
      accessToken: 'top-level-leak-jwt',
      refreshToken: 'top-level-leak-refresh',
      sessionSecret: 'secret-key-material',
      setupTicket: 'ticket-123',
    };

    const sanitized = sanitizeBootstrapDto(rawBootstrap);

    // Check currentUser
    assert.equal(sanitized.currentUser.id, 'usr_coordinator_01');
    assert.equal('authUserId' in sanitized.currentUser, false);
    assert.equal('pinHash' in sanitized.currentUser, false);
    assert.equal('accessToken' in sanitized.currentUser, false);

    // Check users array
    assert.equal(sanitized.users.length, 1);
    assert.equal(sanitized.users[0].name, 'Cô Lan');
    assert.equal('authUserId' in sanitized.users[0], false);
    assert.equal('password' in sanitized.users[0], false);

    // Check students array
    assert.equal(sanitized.students.length, 1);
    assert.equal(sanitized.students[0].fullName, 'Nguyễn Văn An');
    assert.equal('authUserId' in sanitized.students[0], false);
    assert.equal('authEmail' in sanitized.students[0], false);
    assert.equal('pinHash' in sanitized.students[0], false);
    assert.equal('rawPin' in sanitized.students[0], false);

    // Check top-level leaked tokens are eliminated
    assert.equal('accessToken' in sanitized, false);
    assert.equal('refreshToken' in sanitized, false);
    assert.equal('sessionSecret' in sanitized, false);
    assert.equal('setupTicket' in sanitized, false);
  });
});

describe('11. Production validateSessionPayload Schema Verification', () => {
  test('Validates complete session payload and returns canonical structured session', () => {
    const validRaw = {
      accessToken: 'valid.supabase.jwt',
      refreshToken: 'valid.refresh.token',
      sessionVersion: 1,
      user: {
        id: 'usr_staff_01',
        name: 'Thầy Hoàng Minh',
        role: 'teacher',
        status: 'active',
        email: 'hoang.minh@mindx.edu.vn',
      },
      expiresAt: Date.now() + 3600 * 1000,
      setupTicket: 'ticket_abc',
      isRecovery: false,
    };

    const validated = validateSessionPayload(validRaw);
    assert.ok(validated !== null);
    assert.equal(validated.accessToken, 'valid.supabase.jwt');
    assert.equal(validated.refreshToken, 'valid.refresh.token');
    assert.equal(validated.sessionVersion, 1);
    assert.equal(validated.user.id, 'usr_staff_01');
    assert.equal(validated.user.role, 'teacher');
    assert.equal(validated.setupTicket, 'ticket_abc');
    assert.equal(validated.isRecovery, false);
  });

  test('Rejects expired session timestamp (returns null)', () => {
    const expiredRaw = {
      accessToken: 'valid.jwt',
      sessionVersion: 1,
      user: { id: 'usr_1', role: 'admin' },
      expiresAt: Date.now() - 5000, // 5 seconds in the past
    };
    assert.equal(validateSessionPayload(expiredRaw), null);
  });

  test('Rejects missing or empty accessToken', () => {
    const noToken = {
      accessToken: '',
      sessionVersion: 1,
      user: { id: 'usr_1', role: 'admin' },
      expiresAt: Date.now() + 60000,
    };
    assert.equal(validateSessionPayload(noToken), null);
  });

  test('Rejects invalid roles outside known system roles', () => {
    const invalidRole = {
      accessToken: 'valid.jwt',
      sessionVersion: 1,
      user: { id: 'usr_1', role: 'superuser_hacker' },
      expiresAt: Date.now() + 60000,
    };
    assert.equal(validateSessionPayload(invalidRole), null);
  });

  test('Rejects missing user id or missing sessionVersion', () => {
    const missingUserId = {
      accessToken: 'valid.jwt',
      sessionVersion: 1,
      user: { role: 'teacher' },
      expiresAt: Date.now() + 60000,
    };
    assert.equal(validateSessionPayload(missingUserId), null);

    const missingVersion = {
      accessToken: 'valid.jwt',
      user: { id: 'usr_1', role: 'teacher' },
      expiresAt: Date.now() + 60000,
    };
    assert.equal(validateSessionPayload(missingVersion), null);
  });
});

describe('12. PIN Generation & Commit Construction Matching Worker A Protocol', () => {
  test('Class first-issue builds commit records with derived authPassword and zero raw PINs', () => {
    const edgePrepareRes = {
      operationId: 'op_claim_12345',
      students: [
        {
          studentId: 'st_01',
          studentCode: 'HS_001',
          fullName: 'Học sinh 1',
          authUserId: 'auth_uuid_01',
        },
        {
          studentId: 'st_02',
          studentCode: 'HS_002',
          fullName: 'Học sinh 2',
          authUserId: 'auth_uuid_02',
        },
      ],
    };

    const commitRecords = edgePrepareRes.students.map((s) => {
      const pin = generateSecurePin8();
      assert.equal(isTrivialPin(pin), false);
      const authPassword = deriveStudentPassword(s.authUserId, pin, VALID_PEPPER);
      return {
        studentId: s.studentId,
        authUserId: s.authUserId,
        authPassword,
      };
    });

    const commitPayload = {
      operationId: edgePrepareRes.operationId,
      records: commitRecords,
    };

    assert.equal(commitPayload.operationId, 'op_claim_12345');
    assert.equal(commitPayload.records.length, 2);
    assert.equal(commitPayload.records[0].studentId, 'st_01');
    assert.ok(commitPayload.records[0].authPassword.length > 20);
    // Crucial security invariant: raw PIN must never appear in commit payload to Edge
    assert.equal('pin' in commitPayload.records[0], false);
    assert.equal('rawPin' in commitPayload.records[0], false);
  });

  test('Single reissue builds exact 1-record commit with canonical HMAC password', () => {
    const student = {
      studentId: 'st_single_99',
      studentCode: 'HS_099',
      fullName: 'Học sinh Đơn',
      authUserId: 'auth_uuid_099',
    };

    const pin = generateSecurePin8();
    const authPassword = deriveStudentPassword(student.authUserId, pin, VALID_PEPPER);

    const commitPayload = {
      operationId: 'op_single_claim_777',
      records: [
        {
          studentId: student.studentId,
          authUserId: student.authUserId,
          authPassword,
        },
      ],
    };

    assert.equal(commitPayload.records.length, 1);
    assert.equal(commitPayload.records[0].studentId, 'st_single_99');
    assert.equal(commitPayload.records[0].authUserId, 'auth_uuid_099');
    assert.equal(commitPayload.records[0].authPassword, authPassword);
  });
});

describe('13. Production createSessionEnvelope & Cookie Lifecycle Integration', () => {
  test('Login response produced envelope encrypts, decrypts, and validates successfully with guaranteed expiresAt', (t) => {
    const fixedNowMs = 1770000000000;
    t.mock.timers.enable({ apis: ['Date'], now: fixedNowMs });
    try {
      const edgeSession = {
        access_token: 'header.eyJzdWIiOiJ1c3JfMDEiLCJyb2xlIjoidGVhY2hlciIsImV4cCI6MTgwMDAwMDAwMH0.signature',
        refresh_token: 'refresh_tok_123',
        expires_at: Math.floor(fixedNowMs / 1000) + 3600, // 1 hour in future
      };
      const user = {
        id: 'usr_01',
        name: 'Thầy Tuấn',
        role: 'teacher',
        status: 'active',
      };
      const sessionVersion = 1;

      // Call production helper with explicit now injection
      const { envelope, maxAgeSec } = createSessionEnvelope({
        accessToken: edgeSession.access_token,
        refreshToken: edgeSession.refresh_token,
        sessionVersion,
        user,
        expiresAtEpochSec: edgeSession.expires_at,
        nowMs: fixedNowMs,
      });

      assert.ok(envelope.expiresAt > fixedNowMs, 'Envelope must contain future expiresAt in milliseconds');
      assert.equal(maxAgeSec, 3600);
      assert.equal(envelope.user.id, 'usr_01');
      assert.equal(envelope.sessionVersion, 1);

      // Encrypt envelope with server key
      const encryptedToken = encryptSession(envelope, VALID_HEX_KEY);
      assert.ok(encryptedToken.startsWith('v1.'));

      // Decrypt on subsequent request
      const decrypted = decryptSession(encryptedToken, VALID_HEX_KEY);
      assert.ok(decrypted !== null);

      // Validate schema
      const validated = validateSessionPayload(decrypted);
      assert.ok(validated !== null);
      assert.equal(validated.user.id, 'usr_01');
      assert.equal(validated.user.role, 'teacher');
      assert.equal(validated.accessToken, edgeSession.access_token);
    } finally {
      t.mock.timers.reset();
    }
  });

  test('Derives expiration from verified JWT exp claim when expiresAtEpochSec is absent', () => {
    const fixedNowMs = 1770000000000;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const futureExpSec = Math.floor(fixedNowMs / 1000) + 7200;
    const payload = Buffer.from(JSON.stringify({ sub: 'student_99', role: 'student', exp: futureExpSec })).toString('base64url');
    const fakeJwt = `${header}.${payload}.sig`;

    const { envelope, maxAgeSec } = createSessionEnvelope({
      accessToken: fakeJwt,
      sessionVersion: 2,
      user: { id: 'student_99', name: 'Học sinh', role: 'student' },
      nowMs: fixedNowMs,
    });

    assert.ok(envelope.expiresAt > fixedNowMs);
    assert.equal(maxAgeSec, 7200);
  });

  test('Rejects when expiresAt is missing and JWT has no exp claim (fails closed without infinite default)', () => {
    const tokenNoExp = 'header.eyJzdWIiOiJ1c3JfMDEifQ.sig';
    assert.throws(
      () =>
        createSessionEnvelope({
          accessToken: tokenNoExp,
          sessionVersion: 1,
          user: { id: 'usr_01', role: 'teacher' },
        }),
      /Không thể xác định thời hạn hết hạn/
    );
  });

  test('Rejects when expiresAt is already in the past', () => {
    assert.throws(
      () =>
        createSessionEnvelope({
          accessToken: 'valid.token',
          sessionVersion: 1,
          user: { id: 'usr_01', role: 'teacher' },
          expiresAtEpochSec: Math.floor(Date.now() / 1000) - 100,
        }),
      /đã hết hạn/
    );
  });

  test('Clamps TTL to DEFAULT_SESSION_MAX_AGE_SEC when remote expiration is excessively long', () => {
    const fixedNowMs = 1770000000000;
    const excessivelyLongExpSec = Math.floor(fixedNowMs / 1000) + 365 * 24 * 3600;
    const { envelope, maxAgeSec } = createSessionEnvelope({
      accessToken: 'valid.token',
      sessionVersion: 1,
      user: { id: 'usr_01', role: 'admin' },
      expiresAtEpochSec: excessivelyLongExpSec,
      nowMs: fixedNowMs,
    });

    assert.ok(maxAgeSec <= 7 * 24 * 3600);
    assert.ok(envelope.expiresAt <= fixedNowMs + 7 * 24 * 3600 * 1000 + 1000);
  });

  test('Cookie decryption rejects wrong encryption key or tampered ciphertext', () => {
    const fixedNowMs = 1770000000000;
    const { envelope } = createSessionEnvelope({
      accessToken: 'valid.token',
      sessionVersion: 1,
      user: { id: 'usr_01', role: 'admin' },
      expiresAtEpochSec: Math.floor(fixedNowMs / 1000) + 3600,
      nowMs: fixedNowMs,
    });

    const encrypted = encryptSession(envelope, VALID_HEX_KEY);

    // Decrypt with WRONG key fails closed (returns null)
    const wrongKeyDecrypted = decryptSession(encrypted, VALID_HEX_KEY_2);
    assert.equal(wrongKeyDecrypted, null);
    assert.equal(validateSessionPayload(wrongKeyDecrypted), null);

    // Decrypt tampered token fails closed
    const tampered = encrypted.slice(0, -4) + 'abcd';
    const tamperedDecrypted = decryptSession(tampered, VALID_HEX_KEY);
    assert.equal(tamperedDecrypted, null);
    assert.equal(validateSessionPayload(tamperedDecrypted), null);
  });
});

describe('14. PIN Prepare Anti-Fallback Contract & Reserved AuthUUID Validation (M2)', () => {
  const validOpId = '11111111-2222-4333-8444-555555555555';
  const student1Id = 'aaaaaaaa-1111-4111-8111-111111111111';
  const auth1Id = 'bbbbbbbb-2222-4222-8222-222222222222';
  const student2Id = 'cccccccc-3333-4333-8333-333333333333';
  const auth2Id = 'dddddddd-4444-4444-8444-444444444444';
  const validClassCode = 'LOP_ROB_01';

  test('Validates batch first issue payload with distinct reserved authUserIds and classCode', () => {
    const payload = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
        { studentId: student2Id, studentCode: 'HS_02', fullName: 'Em Hai', authUserId: auth2Id },
      ],
    };
    const res = validatePinPrepData(payload, 'batch_first_issue');
    assert.equal(res.valid, true);
    assert.equal(res.error, undefined);
  });

  test('Validates single reissue payload with exactly one student and classCode', () => {
    const payload = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
      ],
    };
    const res = validatePinPrepData(payload, 'single_reissue');
    assert.equal(res.valid, true);
  });

  test('Rejects when classCode is missing, empty, or not a string (contract requirement)', () => {
    const noClassCode = {
      operationId: validOpId,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
      ],
    };
    const res1 = validatePinPrepData(noClassCode, 'single_reissue');
    assert.equal(res1.valid, false);
    assert.equal(res1.code, 'INVALID_CLASS_CODE');

    const emptyClassCode = {
      operationId: validOpId,
      classCode: '   ',
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
      ],
    };
    const res2 = validatePinPrepData(emptyClassCode, 'single_reissue');
    assert.equal(res2.valid, false);
    assert.equal(res2.code, 'INVALID_CLASS_CODE');
  });

  test('Rejects single mode when students count != 1 (count crosscheck)', () => {
    const payload = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
        { studentId: student2Id, studentCode: 'HS_02', fullName: 'Em Hai', authUserId: auth2Id },
      ],
    };
    const res = validatePinPrepData(payload, 'single_reissue');
    assert.equal(res.valid, false);
    assert.equal(res.code, 'SINGLE_MODE_COUNT_MISMATCH');
    assert.ok(typeof res.error === 'string');
    // Ensure no private IDs or counts leak into error string
    assert.ok(!res.error.includes(student1Id));
    assert.ok(!res.error.includes(auth1Id));
  });

  test('Strictly rejects fallback when authUserId matches public studentId (anti-fallback invariant)', () => {
    const payload = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: student1Id },
      ],
    };
    const res = validatePinPrepData(payload, 'single_reissue');
    assert.equal(res.valid, false);
    assert.equal(res.code, 'AUTH_DERIVED_FROM_STUDENT_ID');
    // Error must be static Vietnamese and NEVER leak studentId or authUserId
    assert.ok(typeof res.error === 'string');
    assert.ok(!res.error.includes(student1Id));
    assert.ok(!res.error.includes(auth1Id));
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(res.error));
  });

  test('Rejects when nativeAuthUUID is missing or invalid UUID', () => {
    const payload = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: '' },
      ],
    };
    const res = validatePinPrepData(payload, 'single_reissue');
    assert.equal(res.valid, false);
    assert.equal(res.code, 'MISSING_RESERVED_AUTH_UUID');
    assert.ok(!res.error.includes(student1Id));
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(res.error));
  });

  test('Rejects duplicate studentId or duplicate authUserId', () => {
    const payloadDupStudent = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
        { studentId: student1Id, studentCode: 'HS_01_bis', fullName: 'Em Một Trùng', authUserId: auth2Id },
      ],
    };
    const res1 = validatePinPrepData(payloadDupStudent, 'batch_first_issue');
    assert.equal(res1.valid, false);
    assert.equal(res1.code, 'DUPLICATE_STUDENT_ID');
    assert.ok(!res1.error.includes(student1Id));

    const payloadDupAuth = {
      operationId: validOpId,
      classCode: validClassCode,
      students: [
        { studentId: student1Id, studentCode: 'HS_01', fullName: 'Em Một', authUserId: auth1Id },
        { studentId: student2Id, studentCode: 'HS_02', fullName: 'Em Hai', authUserId: auth1Id },
      ],
    };
    const res2 = validatePinPrepData(payloadDupAuth, 'batch_first_issue');
    assert.equal(res2.valid, false);
    assert.equal(res2.code, 'DUPLICATE_AUTH_ID');
    assert.ok(!res2.error.includes(auth1Id));
  });
});

describe('15. PKCE Recovery Context Validation Helper (M2)', () => {
  const fixedNow = 1770000000000;
  const validVerifier = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  const validEmail = 'giaovien@mindx.edu.vn';

  test('Validates active recovery context and returns normalized fields', () => {
    const validCtx = {
      codeVerifier: validVerifier,
      email: '  GiaoVien@MindX.Edu.Vn  ',
      createdAt: fixedNow - 60000, // 1 minute ago
    };

    const res = validateRecoveryContext(validCtx, fixedNow);
    assert.equal(res.valid, true);
    assert.equal(res.codeVerifier, validVerifier);
    assert.equal(res.email, validEmail);
    assert.equal(res.error, undefined);
  });

  test('Rejects missing, null, undefined, or non-object context', () => {
    assert.equal(validateRecoveryContext(null).valid, false);
    assert.equal(validateRecoveryContext(undefined).valid, false);
    assert.equal(validateRecoveryContext('').valid, false);
    assert.equal(validateRecoveryContext('not-an-object').valid, false);
    assert.equal(validateRecoveryContext(12345).valid, false);
    assert.equal(validateRecoveryContext([]).valid, false);
    assert.equal(validateRecoveryContext({}).valid, false);
  });

  test('Rejects missing or invalid codeVerifier', () => {
    const noVerifier = { email: validEmail, createdAt: fixedNow };
    assert.equal(validateRecoveryContext(noVerifier, fixedNow).valid, false);

    const emptyVerifier = { codeVerifier: '   ', email: validEmail, createdAt: fixedNow };
    assert.equal(validateRecoveryContext(emptyVerifier, fixedNow).valid, false);

    const numericVerifier = { codeVerifier: 99999, email: validEmail, createdAt: fixedNow };
    assert.equal(validateRecoveryContext(numericVerifier, fixedNow).valid, false);
  });

  test('Rejects missing or malformed email', () => {
    const noEmail = { codeVerifier: validVerifier, createdAt: fixedNow };
    assert.equal(validateRecoveryContext(noEmail, fixedNow).valid, false);

    const emptyEmail = { codeVerifier: validVerifier, email: '', createdAt: fixedNow };
    assert.equal(validateRecoveryContext(emptyEmail, fixedNow).valid, false);

    const badEmail = { codeVerifier: validVerifier, email: 'not-an-email', createdAt: fixedNow };
    assert.equal(validateRecoveryContext(badEmail, fixedNow).valid, false);

    const nonStringEmail = { codeVerifier: validVerifier, email: 12345, createdAt: fixedNow };
    assert.equal(validateRecoveryContext(nonStringEmail, fixedNow).valid, false);
  });

  test('Rejects expired recovery context beyond 15-minute TTL', () => {
    // 901 seconds ago (TTL is 900 seconds)
    const expiredCtx = {
      codeVerifier: validVerifier,
      email: validEmail,
      createdAt: fixedNow - 901 * 1000,
    };
    const res = validateRecoveryContext(expiredCtx, fixedNow);
    assert.equal(res.valid, false);
    assert.ok(res.error.includes('hết hạn'));

    // Missing createdAt or invalid number
    const badTimestampCtx = {
      codeVerifier: validVerifier,
      email: validEmail,
      createdAt: 'invalid-date',
    };
    assert.equal(validateRecoveryContext(badTimestampCtx, fixedNow).valid, false);
  });
});

describe('16. PIN CSV Formatting & Class Code Integrity (M2)', () => {
  const fixedTimestamp = 1770000000000;
  const isoTime = new Date(fixedTimestamp).toISOString();
  const classCode = '6A1';
  const studentRecords = [
    { studentCode: 'HS_01', fullName: 'Nguyễn Văn A', rawPin: '12345678' },
    { studentCode: 'HS_02', fullName: 'Trần Thị B', rawPin: '87654321' },
  ];

  test('formatPinCsvContent includes UTF-8 BOM, standard headers, and classCode in Lớp column for batch_first_issue', () => {
    const csv = formatPinCsvContent(studentRecords, classCode, 'batch_first_issue', isoTime);

    // Enforces UTF-8 BOM for proper spreadsheet rendering
    assert.ok(csv.startsWith('\uFEFF'));

    const lines = csv.replace('\uFEFF', '').split('\r\n');
    assert.equal(lines[0], 'Mã học sinh,Họ và tên,Lớp,Mã PIN tạm thời,Thời gian cấp,Ghi chú');

    // Row 1
    assert.ok(lines[1].includes('HS_01'));
    assert.ok(lines[1].includes('Nguyễn Văn A'));
    assert.ok(lines[1].includes('6A1'));
    assert.ok(lines[1].includes('12345678'));

    // Row 2
    assert.ok(lines[2].includes('HS_02'));
    assert.ok(lines[2].includes('Trần Thị B'));
    assert.ok(lines[2].includes('6A1'));
    assert.ok(lines[2].includes('87654321'));
  });

  test('formatPinCsvContent uses classCode and single_reissue specific header/note', () => {
    const single = [{ studentCode: 'HS_09', fullName: 'Lê Văn C', rawPin: '99887766' }];
    const csv = formatPinCsvContent(single, '10A3', 'single_reissue', isoTime);

    assert.ok(csv.startsWith('\uFEFF'));
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    assert.equal(lines[0], 'Mã học sinh,Họ và tên,Lớp,Mã PIN mới,Thời gian cấp,Ghi chú');

    assert.ok(lines[1].includes('HS_09'));
    assert.ok(lines[1].includes('10A3'));
    assert.ok(lines[1].includes('99887766'));
    assert.ok(lines[1].includes('Cấp lại riêng 1 học sinh'));
  });

  test('formatPinCsvContent applies formula injection defense to untrusted fields', () => {
    const malicious = [
      { studentCode: '=CMD|', fullName: '+334455', rawPin: '12345678' },
    ];
    const csv = formatPinCsvContent(malicious, '@CLASS_6A', 'batch_first_issue', isoTime);

    // Formula triggers must be prefixed with single quote
    assert.ok(csv.includes("`=CMD|") || csv.includes("`+334455") || csv.includes("'=CMD|") || csv.includes("'+334455") || csv.includes("'@CLASS_6A"));
  });

  test('formatPinCsvContent strictly excludes internal Auth UUIDs or internal IDs', () => {
    const sample = [
      {
        studentCode: 'HS_01',
        fullName: 'Nguyễn Văn A',
        rawPin: '12345678',
        studentId: '11111111-1111-4111-8111-111111111111',
        authUserId: '22222222-2222-4222-8222-222222222222',
      },
    ];
    const csv = formatPinCsvContent(sample, '6A1', 'batch_first_issue', isoTime);
    assert.ok(!csv.includes('11111111-1111-4111-8111-111111111111'));
    assert.ok(!csv.includes('22222222-2222-4222-8222-222222222222'));
  });

  test('generatePinCsvFilename produces safe filenames for batch and single modes', () => {
    const batchName = generatePinCsvFilename('Lớp 6A/1', null, fixedTimestamp);
    assert.equal(batchName, 'DanhSachPIN_Lop_L_p_6A_1_1770000000000.csv');

    const singleName = generatePinCsvFilename('6A1', 'HS 01', fixedTimestamp);
    assert.equal(singleName, 'PIN_6A1_HS_01_1770000000000.csv');
  });
});

describe('17. Trusted Local Development Environment & Loopback Permutations (M2)', () => {
  test('isTrustedLoopbackUrl accepts HTTP loopback addresses (localhost, 127.0.0.1, ::1)', () => {
    assert.equal(isTrustedLoopbackUrl('http://localhost:3000'), true);
    assert.equal(isTrustedLoopbackUrl('http://127.0.0.1:3000'), true);
    assert.equal(isTrustedLoopbackUrl('http://[::1]:3000'), true);
    assert.equal(isTrustedLoopbackUrl('http://localhost:8080/api/test'), true);
  });

  test('isTrustedLoopbackUrl rejects HTTPS, external domains, and malformed inputs', () => {
    assert.equal(isTrustedLoopbackUrl('https://localhost:3000'), false); // HTTPS is not dev loopback
    assert.equal(isTrustedLoopbackUrl('https://mindx-learn.edu.vn'), false);
    assert.equal(isTrustedLoopbackUrl('http://attacker.com'), false);
    assert.equal(isTrustedLoopbackUrl('http://attacker.com?localhost'), false);
    assert.equal(isTrustedLoopbackUrl(''), false);
    assert.equal(isTrustedLoopbackUrl(null), false);
    assert.equal(isTrustedLoopbackUrl(undefined), false);
    assert.equal(isTrustedLoopbackUrl('not-a-url'), false);
  });

  test('isLocalDevEnvironment accepts development + loopback site + loopback request URL', () => {
    const devEnv = {
      NODE_ENV: 'development',
      VERCEL: '0',
      MINDX_SITE_URL: 'http://localhost:3000',
    };
    const reqUrl = 'http://localhost:3000/api/m2/session';

    assert.equal(isLocalDevEnvironment(devEnv, reqUrl), true);

    const devEnv127 = {
      NODE_ENV: 'development',
      MINDX_SITE_URL: 'http://127.0.0.1:3000',
    };
    assert.equal(isLocalDevEnvironment(devEnv127, 'http://127.0.0.1:3000/api/m2/session'), true);
  });

  test('isLocalDevEnvironment rejects when NODE_ENV is not development', () => {
    const prodEnv = {
      NODE_ENV: 'production',
      MINDX_SITE_URL: 'http://localhost:3000',
    };
    assert.equal(isLocalDevEnvironment(prodEnv, 'http://localhost:3000/api/m2/session'), false);

    const testEnv = {
      NODE_ENV: 'test',
      MINDX_SITE_URL: 'http://localhost:3000',
    };
    assert.equal(isLocalDevEnvironment(testEnv, 'http://localhost:3000/api/m2/session'), false);
  });

  test('isLocalDevEnvironment rejects on Vercel platform even if NODE_ENV is development', () => {
    const vercelEnv = {
      NODE_ENV: 'development',
      VERCEL: '1',
      MINDX_SITE_URL: 'http://localhost:3000',
    };
    assert.equal(isLocalDevEnvironment(vercelEnv, 'http://localhost:3000/api/m2/session'), false);
  });

  test('isLocalDevEnvironment rejects hosted site URL (HTTPS / non-loopback)', () => {
    const hostedEnv = {
      NODE_ENV: 'development',
      VERCEL: '0',
      MINDX_SITE_URL: 'https://mindx-learn-test.vercel.app',
    };
    // Hosted configured site must NOT fall back to loopback
    assert.equal(isLocalDevEnvironment(hostedEnv, 'http://localhost:3000/api/m2/session'), false);
  });

  test('isLocalDevEnvironment rejects non-loopback request URL', () => {
    const devEnv = {
      NODE_ENV: 'development',
      VERCEL: '0',
      MINDX_SITE_URL: 'http://localhost:3000',
    };
    assert.equal(isLocalDevEnvironment(devEnv, 'https://attacker.com/api/m2/session'), false);
  });

  test('Vercel branch always validates platform IP even if isDev is true', () => {
    // Vercel with missing platform header fails closed (returns null) even if isDev = true
    const ip = resolveTrustedIp({}, true, true);
    assert.equal(ip, null);

    // Vercel with valid platform header succeeds
    const validIp = resolveTrustedIp({ 'x-vercel-forwarded-for': '203.0.113.50' }, true, true);
    assert.equal(validIp, '203.0.113.50');
  });

  test('Hosted non-loopback site fails closed to null without trusted IP header', () => {
    const hostedEnv = {
      NODE_ENV: 'development',
      MINDX_SITE_URL: 'https://hosted.example.com',
    };
    const isDev = isLocalDevEnvironment(hostedEnv, 'https://hosted.example.com/api/m2/session');
    assert.equal(isDev, false);
    const ip = resolveTrustedIp({}, false, isDev);
    assert.equal(ip, null); // Unknown => 503 fail-closed
  });
});

describe('18. Truthful Auth Error DTO Sanitization & Fixed Code Preservation (M2)', () => {
  test('Requires explicit edgeCode === RATE_LIMITED and http 429 status (rejects synthetic 429)', () => {
    assert.equal(sanitizeAuthErrorCode('RATE_LIMITED', 429), 'RATE_LIMITED');
    // Does NOT synthesize RATE_LIMITED if Edge body missing, empty, or other code on 429
    assert.equal(sanitizeAuthErrorCode(undefined, 429), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('', 429), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('GENERIC_HOSTING_429', 429), 'AUTHENTICATION_FAILED');
    // Does NOT return RATE_LIMITED if status is not 429
    assert.equal(sanitizeAuthErrorCode('RATE_LIMITED', 200), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('RATE_LIMITED', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('RATE_LIMITED', 500), 'AUTHENTICATION_FAILED');
  });

  test('Preserves explicit INVALID_CREDENTIALS on 401 status and rejects synthetic 401 defaults', () => {
    assert.equal(sanitizeAuthErrorCode('INVALID_CREDENTIALS', 401), 'INVALID_CREDENTIALS');
    // Cannot be invented from status 401 alone
    assert.equal(sanitizeAuthErrorCode(undefined, 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('INVALID_CREDENTIALS', 500), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('INVALID_CREDENTIALS', 200), 'AUTHENTICATION_FAILED');
  });

  test('Enforces uniform INVALID_CREDENTIALS for nonexistent student and wrong PIN mapped only on 401', () => {
    assert.equal(sanitizeAuthErrorCode('STUDENT_NOT_FOUND', 401), 'INVALID_CREDENTIALS');
    assert.equal(sanitizeAuthErrorCode('INVALID_PIN', 401), 'INVALID_CREDENTIALS');
    // Legacy codes mapped only on 401; non-401 defaults to AUTHENTICATION_FAILED
    assert.equal(sanitizeAuthErrorCode('STUDENT_NOT_FOUND', 500), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('INVALID_PIN', 500), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('STUDENT_NOT_FOUND', 400), 'AUTHENTICATION_FAILED');
  });

  test('Preserves safe explicit known enum list and rejects arbitrary uppercase provider strings', () => {
    assert.equal(sanitizeAuthErrorCode('AUTHENTICATION_FAILED', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('ACCOUNT_LOCKED', 401), 'ACCOUNT_LOCKED');
    assert.equal(sanitizeAuthErrorCode('ACCOUNT_DISABLED', 401), 'ACCOUNT_DISABLED');
    assert.equal(sanitizeAuthErrorCode('UNAUTHORIZED', 401), 'UNAUTHORIZED');
    assert.equal(sanitizeAuthErrorCode('FORBIDDEN', 403), 'FORBIDDEN');
    assert.equal(sanitizeAuthErrorCode('EMAIL_NOT_CONFIRMED', 401), 'EMAIL_NOT_CONFIRMED');
    assert.equal(sanitizeAuthErrorCode('PASSWORD_RESET_REQUIRED', 401), 'PASSWORD_RESET_REQUIRED');

    // Safe known enums can also be directly checked via SAFE_KNOWN_AUTH_ENUMS
    assert.ok(SAFE_KNOWN_AUTH_ENUMS.has('ACCOUNT_LOCKED'));
    assert.ok(SAFE_KNOWN_AUTH_ENUMS.has('AUTHENTICATION_FAILED'));

    // Arbitrary uppercase provider strings are rejected and fall back safely
    assert.equal(sanitizeAuthErrorCode('SUPABASE_UNKNOWN_ERROR', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('RANDOM_PROVIDER_EXCEPTION', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('PGRST301', 401), 'AUTHENTICATION_FAILED');
  });

  test('Rejects raw SQL or leaked identifier error codes and defaults safely without inventing 401 code', () => {
    assert.equal(sanitizeAuthErrorCode('SELECT * FROM auth.users', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('error_with_lowercase', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('11111111-2222-3333-4444-555555555555', 401), 'AUTHENTICATION_FAILED');
    assert.equal(sanitizeAuthErrorCode('SELECT * FROM auth.users', 500), 'AUTHENTICATION_FAILED');
  });

  test('sanitizeAuthMessage preserves standard user messages and strips raw leaks', () => {
    const normalMsg = 'Thông tin đăng nhập không chính xác hoặc tài khoản tạm thời bị khóa.';
    assert.equal(sanitizeAuthMessage(normalMsg), normalMsg);

    const leakUuidMsg = 'Error occurred for user 11111111-2222-3333-4444-555555555555';
    assert.equal(sanitizeAuthMessage(leakUuidMsg), normalMsg);

    const leakSqlMsg = 'relation "auth.users" does not exist';
    assert.equal(sanitizeAuthMessage(leakSqlMsg), normalMsg);

    const leakTokenMsg = 'Invalid JWT token supplied';
    assert.equal(sanitizeAuthMessage(leakTokenMsg), normalMsg);

    assert.equal(sanitizeAuthMessage(null), normalMsg);
    assert.equal(sanitizeAuthMessage(undefined), normalMsg);
  });
});

describe('19. Batch First-PIN Depleted State & Edge Error Resolution Boundary (M2)', () => {
  test('Recognizes exact HTTP 200 depleted condition with safe NO_UNISSUED_STUDENTS code and static message without CSV', () => {
    // Exact condition from Worker A9: success === false, status === 200, code === 'NO_UNISSUED_STUDENTS'
    const depletedPrepRes = {
      success: false,
      status: 200,
      code: 'NO_UNISSUED_STUDENTS',
      message: 'Raw message from backend or edge',
    };

    const outcome = resolvePinPrepOutcome(depletedPrepRes);
    assert.equal(outcome.depleted, true);
    assert.equal(outcome.proceed, false);
    assert.equal(outcome.status, 200);
    assert.equal(outcome.body.success, false);
    assert.equal(outcome.body.code, 'NO_UNISSUED_STUDENTS');
    // Message MUST be static, never supplied raw from prepRes
    assert.equal(outcome.body.message, 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.');
    assert.equal(outcome.data, undefined);

    // Fallback static message when message is missing or empty
    const depletedWithoutMsg = {
      success: false,
      status: 200,
      code: 'NO_UNISSUED_STUDENTS',
    };
    const outcome2 = resolvePinPrepOutcome(depletedWithoutMsg);
    assert.equal(outcome2.status, 200);
    assert.equal(outcome2.body.code, 'NO_UNISSUED_STUDENTS');
    assert.equal(outcome2.body.message, 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.');
  });

  test('Rejects malformed or unknown 200 failures to 500 PREPARE_FAILED without inventing success or depleted state', () => {
    // 200 failure with a different error code -> rejected to 500 PREPARE_FAILED (never arbitrary uppercase provider enum)
    const otherCode200 = {
      success: false,
      status: 200,
      code: 'CLASS_NOT_FOUND',
      message: 'Không tìm thấy lớp học.',
    };
    const outcome1 = resolvePinPrepOutcome(otherCode200);
    assert.equal(outcome1.depleted, false);
    assert.equal(outcome1.proceed, false);
    assert.equal(outcome1.status, 500); // Does NOT preserve 200 for non-depleted failures
    assert.equal(outcome1.body.success, false);
    assert.equal(outcome1.body.code, 'PREPARE_FAILED');
    assert.notEqual(outcome1.body.code, 'CLASS_NOT_FOUND');
    assert.notEqual(outcome1.body.code, 'NO_UNISSUED_STUDENTS');

    // 200 failure with missing code -> 500 PREPARE_FAILED
    const noCode200 = {
      success: false,
      status: 200,
      message: 'Lỗi không xác định.',
    };
    const outcome2 = resolvePinPrepOutcome(noCode200);
    assert.equal(outcome2.depleted, false);
    assert.equal(outcome2.proceed, false);
    assert.equal(outcome2.status, 500);
    assert.equal(outcome2.body.code, 'PREPARE_FAILED');

    // 200 with success: true but missing data (malformed) -> 500 PREPARE_FAILED
    const malformedData200 = {
      success: true,
      status: 200,
      data: null,
    };
    const outcome3 = resolvePinPrepOutcome(malformedData200);
    assert.equal(outcome3.depleted, false);
    assert.equal(outcome3.proceed, false);
    assert.equal(outcome3.status, 500);
    assert.equal(outcome3.body.code, 'PREPARE_FAILED');

    // 200 with success: true and data with empty students list strictly rejected by validatePinPrepData
    const emptyStudentsData = {
      operationId: '11111111-2222-4333-8444-555555555555',
      classCode: 'LOP_6A',
      students: [],
    };
    const valResult = validatePinPrepData(emptyStudentsData, 'batch_first_issue');
    assert.equal(valResult.valid, false);
    assert.equal(valResult.code, 'EMPTY_STUDENTS');
  });

  test('Preserves actual lock 409 status and safe OPERATION_LOCKED enum, sanitizing raw provider SQL leaks', () => {
    // Real 409 lock conflict
    const realLock409 = {
      success: false,
      status: 409,
      code: 'OPERATION_LOCKED',
      message: 'Thao tác cấp PIN của lớp này đang được một người quản trị khác thực hiện.',
    };
    const outcome1 = resolvePinPrepOutcome(realLock409);
    assert.equal(outcome1.depleted, false);
    assert.equal(outcome1.proceed, false);
    assert.equal(outcome1.status, 409);
    assert.equal(outcome1.body.success, false);
    assert.equal(outcome1.body.code, 'OPERATION_LOCKED');
    assert.equal(outcome1.body.message, 'Thao tác cấp PIN của lớp này đang được một người quản trị khác thực hiện.');

    // 409 with raw provider SQL leak in message
    const sqlLeak409 = {
      success: false,
      status: 409,
      code: 'OPERATION_LOCKED',
      message: 'PGRST102: relation "public.students" deadlock detected for lock_key 12345',
    };
    const outcome2 = resolvePinPrepOutcome(sqlLeak409);
    assert.equal(outcome2.status, 409);
    assert.equal(outcome2.body.code, 'OPERATION_LOCKED');
    // Provider SQL leak must never reach the browser
    assert.ok(!outcome2.body.message.includes('relation'));
    assert.ok(!outcome2.body.message.includes('public.students'));
    assert.ok(!outcome2.body.message.includes('PGRST'));
    assert.equal(
      outcome2.body.message,
      'Thao tác cấp mã PIN đang bị khóa hoặc đang được xử lý bởi tiến trình khác. Vui lòng thử lại sau.'
    );

    // Genuine 409 must NOT be treated as depleted
    assert.notEqual(outcome2.body.code, 'NO_UNISSUED_STUDENTS');
    assert.equal(outcome2.depleted, false);
  });

  test('Rejects spoofed OPERATION_LOCKED with wrong status and arbitrary provider enums (no invented lock)', () => {
    // Spoofed lock code on status 200 -> rejected to 500 PREPARE_FAILED (no invented lock)
    const spoofLock200 = {
      success: false,
      status: 200,
      code: 'OPERATION_LOCKED',
      message: 'Thao tác giả lập khóa',
    };
    const outcome1 = resolvePinPrepOutcome(spoofLock200);
    assert.equal(outcome1.status, 500);
    assert.equal(outcome1.body.code, 'PREPARE_FAILED');
    assert.notEqual(outcome1.body.code, 'OPERATION_LOCKED');
    assert.equal(outcome1.depleted, false);
    assert.equal(outcome1.proceed, false);

    // Spoofed lock code on status 500 -> status 500, code PREPARE_FAILED (no invented lock)
    const spoofLock500 = {
      success: false,
      status: 500,
      code: 'OPERATION_LOCKED',
      message: 'Lỗi máy chủ với mã khóa giả mạo',
    };
    const outcome2 = resolvePinPrepOutcome(spoofLock500);
    assert.equal(outcome2.status, 500);
    assert.equal(outcome2.body.code, 'PREPARE_FAILED');
    assert.notEqual(outcome2.body.code, 'OPERATION_LOCKED');

    // Status 409 with arbitrary uppercase provider enum -> failsafe PREPARE_FAILED
    const arbitraryEnum409 = {
      success: false,
      status: 409,
      code: 'SUPABASE_STORAGE_BUCKET_CONFLICT',
      message: 'Lỗi xung đột nội bộ nhà cung cấp',
    };
    const outcome3 = resolvePinPrepOutcome(arbitraryEnum409);
    assert.equal(outcome3.status, 409);
    assert.equal(outcome3.body.code, 'PREPARE_FAILED');
    assert.notEqual(outcome3.body.code, 'SUPABASE_STORAGE_BUCKET_CONFLICT');
    assert.notEqual(outcome3.body.code, 'OPERATION_LOCKED');
  });

  test('Returns proceed true and preserves non-empty valid success preparation data', () => {
    const validSuccess200 = {
      success: true,
      status: 200,
      data: {
        operationId: '11111111-2222-3333-4444-555555555555',
        classCode: 'LOP_6A',
        students: [
          {
            studentId: '22222222-3333-4444-5555-666666666666',
            studentCode: 'HS_001',
            fullName: 'Nguyễn Văn An',
            authUserId: '33333333-4444-5555-6666-777777777777',
          },
        ],
      },
    };

    const outcome = resolvePinPrepOutcome(validSuccess200);
    assert.equal(outcome.depleted, false);
    assert.equal(outcome.proceed, true);
    assert.equal(outcome.status, 200);
    assert.equal(outcome.body.success, true);
    assert.equal(outcome.body.message, 'Chuẩn bị cấp PIN thành công.');
    assert.deepEqual(outcome.data, validSuccess200.data);

    // Strict validation passes on non-empty valid success data
    const valResult = validatePinPrepData(outcome.data, 'batch_first_issue');
    assert.equal(valResult.valid, true);
  });

  test('Rejects success true when status is not exact 200 (status 503, missing status, string 200)', () => {
    const validData = {
      operationId: '11111111-2222-3333-4444-555555555555',
      classCode: 'LOP_6A',
      students: [
        {
          studentId: '22222222-3333-4444-5555-666666666666',
          studentCode: 'HS_001',
          fullName: 'Nguyễn Văn An',
          authUserId: '33333333-4444-5555-6666-777777777777',
        },
      ],
    };

    // 1. success: true with status 503 -> fails closed (proceed: false, status: 503 preserved, code: PREPARE_FAILED, no data)
    const res503 = resolvePinPrepOutcome({ success: true, status: 503, data: validData });
    assert.equal(res503.proceed, false);
    assert.equal(res503.depleted, false);
    assert.equal(res503.status, 503);
    assert.equal(res503.body.success, false);
    assert.equal(res503.body.code, 'PREPARE_FAILED');
    assert.equal(res503.data, undefined);

    // 2. success: true with missing status -> fails closed to 500 PREPARE_FAILED
    const resNoStatus = resolvePinPrepOutcome({ success: true, data: validData });
    assert.equal(resNoStatus.proceed, false);
    assert.equal(resNoStatus.depleted, false);
    assert.equal(resNoStatus.status, 500);
    assert.equal(resNoStatus.body.success, false);
    assert.equal(resNoStatus.body.code, 'PREPARE_FAILED');
    assert.equal(resNoStatus.data, undefined);

    // 3. success: true with truthy string status '200' -> fails closed to 500 PREPARE_FAILED
    const resStringStatus = resolvePinPrepOutcome({ success: true, status: '200', data: validData });
    assert.equal(resStringStatus.proceed, false);
    assert.equal(resStringStatus.depleted, false);
    assert.equal(resStringStatus.status, 500);
    assert.equal(resStringStatus.body.success, false);
    assert.equal(resStringStatus.body.code, 'PREPARE_FAILED');
    assert.equal(resStringStatus.data, undefined);
  });
});

describe('20. Logout Outcome Evaluation Boundary & Session Revocation Safety (M2)', () => {
  test('Idempotent local 200 success when no session exists', () => {
    const outcome = resolveLogoutOutcome(null, false);
    assert.equal(outcome.success, true);
    assert.equal(outcome.status, 200);
    assert.equal(outcome.message, 'Đăng xuất thành công.');
  });

  test('Returns 200 success when Edge confirms session revocation', () => {
    const outcome = resolveLogoutOutcome({ success: true, status: 200 }, true);
    assert.equal(outcome.success, true);
    assert.equal(outcome.status, 200);
    assert.equal(outcome.message, 'Đăng xuất thành công.');
  });

  test('Rejects success true when status is not exact 200 (status 503, missing status, string 200)', () => {
    // 1. success: true with status 503 -> fails to status 503 with static warning
    const res503 = resolveLogoutOutcome({ success: true, status: 503 }, true);
    assert.equal(res503.success, false);
    assert.equal(res503.status, 503);
    assert.equal(res503.code, 'SESSION_REVOKE_FAILED');
    assert.equal(
      res503.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );

    // 2. success: true with missing status -> fails to status 500 with static warning
    const resMissingStatus = resolveLogoutOutcome({ success: true }, true);
    assert.equal(resMissingStatus.success, false);
    assert.equal(resMissingStatus.status, 500);
    assert.equal(resMissingStatus.code, 'SESSION_REVOKE_FAILED');
    assert.equal(
      resMissingStatus.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );

    // 3. success: true with truthy string status '200' -> fails to status 500 with static warning
    const resStringStatus = resolveLogoutOutcome({ success: true, status: '200' }, true);
    assert.equal(resStringStatus.success, false);
    assert.equal(resStringStatus.status, 500);
    assert.equal(resStringStatus.code, 'SESSION_REVOKE_FAILED');
    assert.equal(
      resStringStatus.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );
  });

  test('Preserves Edge 500 SESSION_REVOKE_FAILED and returns safe static Vietnamese warning', () => {
    const edgeRes = {
      success: false,
      status: 500,
      code: 'SESSION_REVOKE_FAILED',
      message: 'Cannot verify server revocation',
    };
    const outcome = resolveLogoutOutcome(edgeRes, true);
    assert.equal(outcome.success, false);
    assert.equal(outcome.status, 500);
    assert.equal(outcome.code, 'SESSION_REVOKE_FAILED');
    assert.equal(
      outcome.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );
  });

  test('Preserves Edge 500 SESSION_SYNC_FAILED and returns safe static Vietnamese warning', () => {
    const edgeRes = {
      success: false,
      status: 500,
      code: 'SESSION_SYNC_FAILED',
      message: 'DB revoked but auth provider call failed',
    };
    const outcome = resolveLogoutOutcome(edgeRes, true);
    assert.equal(outcome.success, false);
    assert.equal(outcome.status, 500);
    assert.equal(outcome.code, 'SESSION_SYNC_FAILED');
    assert.equal(
      outcome.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );
  });

  test('Sanitizes arbitrary provider error codes and raw leaks to safe SESSION_REVOKE_FAILED without leak', () => {
    const rawProviderErr = {
      success: false,
      status: 500,
      code: 'SUPABASE_POSTGRES_DEADLOCK_PGRST301',
      message: 'relation "auth.sessions" locked by backend worker',
    };
    const outcome = resolveLogoutOutcome(rawProviderErr, true);
    assert.equal(outcome.success, false);
    assert.equal(outcome.status, 500);
    // Arbitrary provider code sanitized to safe enum
    assert.equal(outcome.code, 'SESSION_REVOKE_FAILED');
    assert.notEqual(outcome.code, 'SUPABASE_POSTGRES_DEADLOCK_PGRST301');
    assert.equal(
      outcome.message,
      'Đã thoát trên thiết bị này nhưng chưa xác nhận đóng phiên trên máy chủ. Vui lòng thử lại/liên hệ quản trị.'
    );
    assert.ok(!outcome.message.includes('relation'));
    assert.ok(!outcome.message.includes('auth.sessions'));
  });
});


