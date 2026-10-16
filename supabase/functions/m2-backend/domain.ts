// ============================================================================
// MINDX LEARN — M2 Backend Domain Contracts & Helper Definitions (Canonical v2)
// ============================================================================

export type Role = 'admin' | 'teacher' | 'student';
export type UserStatus = 'active' | 'archived';
export type ClassStatus = 'active' | 'archived' | 'completed';
export type StudentStatus = 'active' | 'transferred' | 'archived';

export interface UserDTO {
  id: string; // Public profile UUID (deliberately different from auth.users.id)
  name: string;
  email?: string;
  studentCode?: string;
  role: Role;
  status: UserStatus;
  assignedClassIds?: string[];
  currentClassId?: string;
}

export interface ClassDTO {
  id: string;
  code: string;
  name: string;
  courseId: string | null;
  teacherId: string | null;
  status: ClassStatus;
  is14SessionsConfirmed?: boolean;
}

export interface StudentDTO {
  id: string;
  participantId: string;
  studentCode: string;
  fullName: string;
  currentClassId: string;
  originalClassId: string;
  pinIssuedAt: string | null;
  hasPin: boolean;
  status: StudentStatus;
  notes?: string;
}

export interface EdgeRequest {
  action: string;
  payload?: Record<string, unknown>;
  accessToken?: string;
  sessionVersion?: number;
  trustedIp?: string;
}

export interface EdgeSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export interface EdgeErrorResponse {
  success: false;
  message: string;
  code: string;
}

export type EdgeResponse<T = unknown> = EdgeSuccessResponse<T> | EdgeErrorResponse;

export const STATIC_MESSAGES = {
  UNAUTHORIZED_BFF: 'Yêu cầu không được xác thực từ máy chủ BFF.',
  UNKNOWN_ACTION: 'Tác vụ yêu cầu không tồn tại hoặc không được hỗ trợ.',
  INVALID_PAYLOAD: 'Dữ liệu yêu cầu không hợp lệ.',
  INVALID_CREDENTIALS: 'Thông tin đăng nhập không chính xác.',
  STUDENT_LOGIN_INVALID: 'Mã học sinh hoặc mã PIN không chính xác.',
  RATE_LIMITED: 'Bạn đã thử quá số lần quy định. Vui lòng chờ 60 giây.',
  INVALID_CHALLENGE: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
  UNAUTHORIZED: 'Phiên làm việc không hợp lệ hoặc đã hết hạn.',
  SESSION_REVOKED: 'Phiên làm việc đã bị thu hồi. Vui lòng đăng nhập lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  ADMIN_ONLY: 'Thao tác chỉ dành cho Quản trị viên.',
  ADMIN_ALREADY_EXISTS: 'Hệ thống đã có Quản trị viên. Không thể khởi tạo lại.',
  EMAIL_SEND_FAILED: 'Không thể gửi email lúc này. Vui lòng thử lại sau.',
  RESET_PASSWORD_SENT: 'Hướng dẫn đặt lại mật khẩu đã được gửi đến email nếu tài khoản tồn tại.',
  CHANGE_PASSWORD_SUCCESS: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
  CHANGE_PIN_SUCCESS: 'Đổi mã PIN thành công. Vui lòng đăng nhập lại với mã PIN mới.',
  PIN_OPERATION_EXPIRED: 'Phiên cấp mã PIN không hợp lệ hoặc đã hết hạn.',
  PIN_COMMIT_SUCCESS: 'Cấp mã PIN thành công.',
  NO_UNISSUED_STUDENTS: 'Tất cả học sinh hoạt động trong lớp này đều đã được cấp mã PIN.',
  OPERATION_LOCKED: 'Thao tác cấp mã PIN đang được thực hiện bởi một phiên khác. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại sau.',
  SESSION_SYNC_FAILED: 'Đã xảy ra lỗi đồng bộ phiên làm việc. Vui lòng thử lại sau.',
  SESSION_REVOKE_FAILED: 'Không thể thu hồi phiên làm việc. Vui lòng thử lại sau.',
  LOGOUT_SYNC_FAILED: 'Phiên ứng dụng đã bị chặn, nhưng chưa đồng bộ đầy đủ tài khoản đăng nhập. Vui lòng đăng nhập lại/liên hệ Admin.',
  CLASS_STATUS_SYNC_PARTIAL: 'Đã thay đổi trạng thái lớp học nhưng chưa đồng bộ xong đăng nhập. Vui lòng tải lại trang và liên hệ Admin.',
  STUDENT_STATUS_SYNC_PARTIAL: 'Đã thay đổi trạng thái học sinh nhưng chưa đồng bộ xong đăng nhập. Vui lòng tải lại trang và liên hệ Admin.',
  PASSWORD_CHANGED_SYNC_FAILED: 'Đổi mật khẩu thành công và phiên cũ đã bị chặn, nhưng chưa đồng bộ đăng xuất hoàn toàn. Vui lòng đăng nhập lại bằng mật khẩu mới.',
  PIN_CHANGED_SYNC_FAILED: 'Đổi mã PIN thành công và phiên cũ đã bị chặn, nhưng chưa đồng bộ đăng xuất hoàn toàn. Vui lòng đăng nhập lại với mã PIN mới.',
  LOGOUT_SUCCESS: 'Đăng xuất thành công.',
  CLASS_CREATED: 'Tạo lớp học thành công.',
  CLASS_UPDATED: 'Cập nhật lớp học thành công.',
  CLASS_ARCHIVED: 'Lưu trữ lớp học thành công. Phiên truy cập của học sinh đã được thu hồi.',
  CLASS_RESTORED: 'Khôi phục lớp học thành công.',
  TEACHER_CREATED: 'Kết nối tài khoản giáo viên thành công.',
  TEACHER_ASSIGNED: 'Phân công giáo viên thành công.',
  TEACHER_ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản người dùng trong hệ thống xác thực. Vui lòng tạo tài khoản trước.',
  TEACHER_ACCOUNT_UNCONFIRMED: 'Tài khoản người dùng chưa được xác nhận email hoặc chưa thiết lập mật khẩu.',
  TEACHER_ALREADY_MAPPED: 'Tài khoản người dùng đã được liên kết với hồ sơ trong hệ thống.',
  TEACHER_ROLE_CONFLICT: 'Tài khoản người dùng đã có vai trò khác không tương thích.',
  TEACHER_ACCOUNT_DUPLICATE_EMAIL: 'Phát hiện nhiều tài khoản trùng email trong hệ thống xác thực. Vui lòng liên hệ kỹ thuật để xử lý.',
  TEACHER_CLASS_INVALID: 'Một hoặc nhiều lớp học được chọn không hợp lệ hoặc không còn hoạt động.',
  TEACHER_CLASS_ALREADY_ASSIGNED: 'Một hoặc nhiều lớp học đã có giáo viên phụ trách. Vui lòng tải lại trang và kiểm tra Quản lý lớp.',
  STUDENT_ARCHIVED: 'Lưu trữ học sinh thành công. Phiên làm việc đã bị thu hồi.',
  STUDENT_RESTORED: 'Khôi phục học sinh thành công.',
  STUDENT_UPDATED: 'Cập nhật thông tin học sinh thành công.',
} as const;

export async function computeSha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Canonical production HMAC-SHA256 formula: mindx_student_pin_v1:<nativeAuthUUID lowercase>:<8digitPIN>
export async function computeStudentAuthPassword(
  authUserId: string,
  pin: string,
  pepper: string
): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(pepper);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const context = `mindx_student_pin_v1:${authUserId.toLowerCase().trim()}:${pin.trim()}`;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(context));
  
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface DecodedJwtClaims {
  sub?: string;
  session_id?: string;
  app_metadata?: {
    role?: string;
    m2_session_version?: number;
  };
  exp?: number;
}

export function decodeJwtClaims(token: string): DecodedJwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const jsonStr = atob(b64);
    return JSON.parse(jsonStr) as DecodedJwtClaims;
  } catch {
    return null;
  }
}

export function isValidUUID(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function normalizeStudentCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  return code.toUpperCase().trim();
}

export interface PinCommitRecord {
  studentId: string;
  authUserId: string;
  authPassword: string;
}

export interface TargetStudentClaim {
  studentId: string;
  studentCode?: string;
  fullName?: string;
  authUserId: string;
  authEmail?: string;
}

export interface PinCommitValidationResult {
  valid: boolean;
  code?: string;
  error?: string;
}

export function validatePinCommitRecords(
  records: unknown,
  targets: unknown
): PinCommitValidationResult {
  if (!Array.isArray(records) || records.length === 0) {
    return { valid: false, code: 'INVALID_PAYLOAD', error: 'Records must be a non-empty array' };
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    return { valid: false, code: 'INVALID_PAYLOAD', error: 'Targets must be a non-empty array' };
  }
  if (records.length !== targets.length) {
    return { valid: false, code: 'RECORD_MISMATCH', error: 'Records count must match targets count' };
  }

  const targetMap = new Map<string, string>();
  for (const t of targets) {
    if (!t || typeof t !== 'object') {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'Invalid target item' };
    }
    const sId = (t as TargetStudentClaim).studentId;
    const aId = (t as TargetStudentClaim).authUserId;
    if (!sId || !aId || !isValidUUID(sId) || !isValidUUID(aId)) {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'Missing or invalid target identifiers' };
    }
    targetMap.set(sId, aId.toLowerCase());
  }

  const seenStudentIds = new Set<string>();
  const seenAuthUserIds = new Set<string>();

  for (const r of records) {
    if (!r || typeof r !== 'object') {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'Record must be an object' };
    }
    const rec = r as PinCommitRecord;
    const sId = rec.studentId;
    const aId = rec.authUserId;
    const pwd = rec.authPassword;

    if (!sId || !aId || typeof pwd !== 'string' || pwd.trim().length === 0) {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'Record missing required fields' };
    }

    if (!isValidUUID(sId) || !isValidUUID(aId)) {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'Record studentId and authUserId must be valid UUIDs' };
    }

    if (/^\d{8}$/.test(pwd.trim())) {
      return { valid: false, code: 'RAW_PIN_REJECTED', error: 'authPassword must be derived HMAC, not 8-digit raw PIN' };
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(pwd.trim())) {
      return { valid: false, code: 'INVALID_PAYLOAD', error: 'authPassword must be a 43-character base64url HMAC string' };
    }

    if (seenStudentIds.has(sId)) {
      return { valid: false, code: 'DUPLICATE_STUDENT', error: `Duplicate studentId: ${sId}` };
    }
    seenStudentIds.add(sId);

    const lowerAuthId = aId.toLowerCase();
    if (seenAuthUserIds.has(lowerAuthId)) {
      return { valid: false, code: 'DUPLICATE_AUTH_ID', error: `Duplicate authUserId: ${aId}` };
    }
    seenAuthUserIds.add(lowerAuthId);

    const expectedAuthId = targetMap.get(sId);
    if (!expectedAuthId) {
      return { valid: false, code: 'RECORD_MISMATCH', error: `StudentId ${sId} not in claimed targets` };
    }
    if (expectedAuthId !== lowerAuthId) {
      return { valid: false, code: 'AUTH_ID_MISMATCH', error: `authUserId ${aId} does not match claimed target` };
    }
  }

  return { valid: true };
}

/**
 * Safely executes a scoped Supabase Auth operation callback or promise.
 * Returns true ONLY when the result is a non-null object with its own 'error' property
 * strictly equal to null (the canonical Supabase SDK successful response signature: { error: null }).
 * Any error object, undefined, null, empty object {}, missing property, inherited property,
 * or thrown exception returns false.
 * Guarantees no sensitive data, credentials, or raw error logs are leaked.
 */
export async function safeAuthOperation(
  op: (() => Promise<unknown> | unknown) | Promise<unknown> | unknown
): Promise<boolean> {
  try {
    const res = typeof op === 'function' ? await (op as () => Promise<unknown> | unknown)() : await op;
    if (
      typeof res === 'object' &&
      res !== null &&
      !Array.isArray(res) &&
      Object.prototype.hasOwnProperty.call(res, 'error') &&
      (res as { error: unknown }).error === null
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates bumped session version rows and executes metadata sync for each actor.
 * Enforces contract validation: auth_user_id must be valid UUID and new_session_version must be positive integer.
 * Attempts sync for all actors even if earlier ones fail.
 * Returns boolean (true if all succeeded, false if any failed or rows malformed).
 * Guarantees no sensitive data, credentials, or raw error logs are leaked.
 */
export async function syncBumpedSessionVersions(
  bumpedRows: unknown,
  syncFn: (authUserId: string, newVersion: number) => Promise<{ error?: unknown } | null | void>
): Promise<boolean> {
  if (!Array.isArray(bumpedRows)) {
    return false;
  }

  for (const row of bumpedRows) {
    if (!row || typeof row !== 'object') {
      return false;
    }
    const authUserId = (row as { auth_user_id?: unknown }).auth_user_id;
    const newVersion = (row as { new_session_version?: unknown }).new_session_version;

    if (!isValidUUID(authUserId)) {
      return false;
    }
    if (typeof newVersion !== 'number' || !Number.isInteger(newVersion) || newVersion <= 0) {
      return false;
    }
  }

  let allSuccess = true;
  for (const row of bumpedRows) {
    const authUserId = (row as { auth_user_id: string }).auth_user_id;
    const newVersion = (row as { new_session_version: number }).new_session_version;

    const ok = await safeAuthOperation(() => syncFn(authUserId, newVersion));
    if (!ok) {
      allSuccess = false;
    }
  }

  return allSuccess;
}

