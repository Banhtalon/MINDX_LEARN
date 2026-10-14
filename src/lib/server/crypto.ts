/**
 * TypeScript Type Definitions & Facade for Crypto and Security Helpers (Milestone 2)
 *
 * Delegates all runtime logic to ./crypto.mjs (Single Source of Truth)
 * Eliminates code duplication and guarantees tested runtime behavior matches production BFF.
 */

import * as impl from './crypto.mjs';
import type { Role } from '../types';

export interface ValidatedSessionUser {
  id: string;
  name: string;
  role: Role | 'coordinator';
  status?: string;
  email?: string;
  studentCode?: string;
  classId?: string;
}

export interface ValidatedSessionPayload {
  accessToken: string;
  refreshToken?: string;
  sessionVersion: number | string;
  user: ValidatedSessionUser;
  expiresAt: number;
  setupTicket?: string;
  recoveryTicket?: string;
  isRecovery: boolean;
}

// Re-export constants directly from single source
export const MINDX_PIN_CONTEXT: string = impl.MINDX_PIN_CONTEXT;
export const SESSION_COOKIE_NAME: string = impl.SESSION_COOKIE_NAME;
export const RECOVERY_COOKIE_NAME: string = impl.RECOVERY_COOKIE_NAME;
export const DEFAULT_SESSION_MAX_AGE_SEC: number = impl.DEFAULT_SESSION_MAX_AGE_SEC;
export const RECOVERY_MAX_AGE_SEC: number = impl.RECOVERY_MAX_AGE_SEC;
export const ALLOWED_BFF_ACTIONS: readonly string[] = impl.ALLOWED_BFF_ACTIONS;
export const BLOCKED_BFF_ACTIONS: readonly string[] = impl.BLOCKED_BFF_ACTIONS;

// Typed delegates to implementation in crypto.mjs
export const normalizeKey32: (rawKey: string | Buffer) => Buffer = impl.normalizeKey32;
export const isValidSessionKey: (rawKey: unknown) => boolean = (rawKey: unknown): boolean => impl.isValidSessionKey(rawKey);
export const assertServerConfiguration: (env?: NodeJS.ProcessEnv) => void = impl.assertServerConfiguration;
export const encryptSession: (payload: Record<string, unknown>, secretKey: string | Buffer) => string = impl.encryptSession;
export const decryptSession: <T = Record<string, unknown>>(token: string, secretKey: string | Buffer) => T | null = impl.decryptSession as any;
export const validateSessionPayload: (data: unknown) => ValidatedSessionPayload | null = impl.validateSessionPayload as any;
export const sanitizePublicUserDto: <T extends Record<string, unknown> | null | undefined>(user: T) => T = impl.sanitizePublicUserDto as any;
export const sanitizeBootstrapDto: <T extends Record<string, unknown>>(dto: T) => T = impl.sanitizeBootstrapDto as any;
export const isTrivialPin: (pin: string) => boolean = impl.isTrivialPin;
export const generateSecurePin8: () => string = impl.generateSecurePin8;
export const deriveStudentPassword: (authUserId: string, pin: string, pinPepper: string) => string = impl.deriveStudentPassword;
export const verifySameOrigin: (request: Request, trustedSiteUrl?: string) => boolean = impl.verifySameOrigin;
export const isTrustedLoopbackUrl: (urlStr: string) => boolean = impl.isTrustedLoopbackUrl;
export const isLocalDevEnvironment: (env?: NodeJS.ProcessEnv | Record<string, string | undefined>, requestOrUrl?: Request | string | URL) => boolean = impl.isLocalDevEnvironment;
export const SAFE_KNOWN_AUTH_ENUMS: ReadonlySet<string> = impl.SAFE_KNOWN_AUTH_ENUMS;
export const sanitizeAuthErrorCode: (edgeCode?: string, status?: number) => string = impl.sanitizeAuthErrorCode;
export const sanitizeAuthMessage: (msg?: string, fallback?: string) => string = impl.sanitizeAuthMessage;
export const resolveTrustedIp: (headers: Headers | Record<string, string | null | undefined>, isVercel?: boolean | { isVercel?: boolean; isDev?: boolean }, isDev?: boolean) => string | null = impl.resolveTrustedIp;
export const sanitizeCsvCell: (val: unknown) => string = impl.sanitizeCsvCell;
export const validateRequestLimits: (request: Request, maxBytes?: number) => { valid: boolean; error?: string } = impl.validateRequestLimits;
export const validatePinPrepData: (
  data: unknown,
  mode: 'batch_first_issue' | 'single_reissue'
) => { valid: boolean; code?: string; error?: string } = impl.validatePinPrepData as any;
export interface SessionEnvelopeParams {
  accessToken: string;
  refreshToken?: string;
  sessionVersion: number | string;
  user: {
    id: string;
    name?: string;
    role: Role | 'coordinator';
    status?: string;
    email?: string;
    studentCode?: string;
    classId?: string;
  };
  expiresAtEpochSec?: number;
  nowMs?: number;
  setupTicket?: string;
  recoveryTicket?: string;
  isRecovery?: boolean;
}

export interface SessionEnvelopeResult {
  envelope: ValidatedSessionPayload;
  maxAgeSec: number;
}

export const extractJwtClaims: (jwt: string) => Record<string, unknown> | null = impl.extractJwtClaims as any;
export const createSessionEnvelope: (params: SessionEnvelopeParams, maxTtlSec?: number, explicitNowMs?: number) => SessionEnvelopeResult = impl.createSessionEnvelope as any;
export const validateRecoveryContext: (
  ctx: unknown,
  nowMs?: number,
  maxAgeSec?: number
) => { valid: boolean; error?: string; codeVerifier?: string; email?: string } = impl.validateRecoveryContext as any;
export const formatPinCsvContent: (
  records: Array<{ studentCode: string; fullName: string; rawPin: string }>,
  classCode: string,
  mode: 'batch_first_issue' | 'single_reissue',
  issuedAt?: string
) => string = impl.formatPinCsvContent as any;
export const generatePinCsvFilename: (
  classCode: string,
  studentCode?: string,
  timestampMs?: number
) => string = impl.generatePinCsvFilename as any;

export const SAFE_KNOWN_PIN_PREP_ENUMS: ReadonlySet<string> = impl.SAFE_KNOWN_PIN_PREP_ENUMS;
export const SAFE_KNOWN_LOGOUT_ENUMS: ReadonlySet<string> = impl.SAFE_KNOWN_LOGOUT_ENUMS;

export interface PinPrepOutcome<T = any> {
  depleted: boolean;
  proceed: boolean;
  status: number;
  body: { success: boolean; code?: string; message: string };
  data?: T;
}

export const resolvePinPrepOutcome: <T = any>(prepRes: {
  success: boolean;
  status?: number;
  code?: string;
  message?: string;
  data?: T;
}) => PinPrepOutcome<T> = impl.resolvePinPrepOutcome as any;

export interface LogoutOutcome {
  success: boolean;
  status: number;
  code?: string;
  message: string;
}

export const resolveLogoutOutcome: (
  edgeRes: { success?: boolean; status?: number; code?: string; message?: string } | null | undefined,
  hasSession?: boolean
) => LogoutOutcome = impl.resolveLogoutOutcome as any;


