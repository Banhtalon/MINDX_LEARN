/**
 * Next.js 16.4 Route Handler for Milestone 3 Practice File Uploads and Downloads
 * Route: /api/m3/file
 *
 * Implements M3 secure file boundary:
 * - Dedicated route avoiding /api/m2 1MB generic JSON limit
 * - Strict 2MB file limit (2,097,152 bytes) measured at server
 * - Canonical MIME inferred from extension + allowlist validation (rejects application/octet-stream and mismatch)
 * - Uses verified M2 actor/session from Edge backend; does NOT trust unverified cookie or client role
 * - Upload: checks student role, active current class, published lesson, practice_mode=file_allowed, and resubmit status
 * - Download: verifies submission ownership or active assigned teacher relationship, binds to exact submission object
 * - Bounded private storage m3-practice-files with RLS enforcement (no service-role secret required on Next)
 * - Safe response headers: attachment Content-Disposition, CSP sandbox, nosniff, private no-store
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE_NAME,
  decryptSession,
  validateSessionPayload,
  verifySameOrigin,
  resolveTrustedIp,
  isLocalDevEnvironment,
  isProductionEnvironment,
  resolveSupabaseUrl,
  ValidatedSessionUser,
} from '@/lib/server/crypto';
import { callEdgeBackend } from '@/lib/server/edge-client';
import {
  validatePracticeFile,
  getCanonicalMimeForExtension,
  MAX_PRACTICE_FILE_SIZE,
  MAX_MULTIPART_REQUEST_BYTES,
  readBoundedMultipartStream,
} from '@/lib/simulation-rules';

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

function toBlob(buf: Buffer | Uint8Array): Blob {
  const u8 = new Uint8Array(buf.byteLength);
  u8.set(buf);
  return new Blob([u8]);
}

function errorResponse(message: string, status = 400, code?: string) {
  return NextResponse.json(
    { success: false, message, ...(code ? { code } : {}) },
    { status, headers: NO_STORE_HEADERS }
  );
}

async function getVerifiedActorSession(request: NextRequest): Promise<{
  accessToken: string;
  sessionVersion: number;
  user: ValidatedSessionUser;
} | null> {
  const sessionKey = process.env.MINDX_SESSION_KEY;
  if (!sessionKey) return null;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const raw = decryptSession(token, sessionKey);
    const session = validateSessionPayload(raw);
    if (!session || !session.accessToken) return null;

    const isVercel = process.env.VERCEL === '1';
    const isDev = isLocalDevEnvironment(process.env, request.url);
    const trustedIp = resolveTrustedIp(request.headers, isVercel, isDev);
    if (!trustedIp) return null;

    const edgeRes = await callEdgeBackend<{ user: ValidatedSessionUser; sessionVersion: number }>({
      action: 'session',
      accessToken: session.accessToken,
      sessionVersion: typeof session.sessionVersion === 'number' ? session.sessionVersion : Number(session.sessionVersion),
      trustedIp,
    });

    if (!edgeRes.success || !edgeRes.data?.user) {
      return null;
    }

    return {
      accessToken: session.accessToken,
      sessionVersion: edgeRes.data.sessionVersion,
      user: edgeRes.data.user,
    };
  } catch {
    return null;
  }
}

function getUserClient(accessToken: string) {
  const supabaseUrl = resolveSupabaseUrl(process.env);
  const configuredAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.MINDX_SUPABASE_ANON_KEY ||
    '';
  if (isProductionEnvironment(process.env) && !configuredAnonKey.trim()) {
    throw new Error('SUPABASE_ANON_KEY bắt buộc phải được cấu hình tường minh trên môi trường Production.');
  }
  const anonKey = configuredAnonKey || accessToken;

  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const commonHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
  };

  return {
    from(table: string) {
      return {
        select(columns: string) {
          const filters: Array<{ col: string; val: unknown }> = [];

          function createFilterBuilder() {
            const builder = {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return builder;
              },
              async maybeSingle() {
                return execute(false);
              },
              async single() {
                return execute(true);
              },
            };
            return builder;
          }

          async function execute(requireSingle: boolean) {
            try {
              const queryParts: string[] = [`select=${encodeURIComponent(columns)}`];
              for (const f of filters) {
                queryParts.push(`${encodeURIComponent(f.col)}=eq.${encodeURIComponent(String(f.val))}`);
              }
              const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?${queryParts.join('&')}`;
              const res = await fetch(url, {
                method: 'GET',
                headers: {
                  ...commonHeaders,
                  Accept: 'application/json',
                },
              });

              if (!res.ok) {
                const errJson = await res.json().catch(() => null);
                return {
                  data: null,
                  error: { message: errJson?.message || res.statusText, status: res.status },
                };
              }

              const rows = await res.json();
              if (Array.isArray(rows)) {
                if (requireSingle && rows.length === 0) {
                  return { data: null, error: { message: 'Row not found', status: 404 } };
                }
                return { data: rows[0] ?? null, error: null };
              }
              return { data: rows, error: null };
            } catch (err: any) {
              return { data: null, error: { message: err?.message || 'Network error' } };
            }
          }

          return createFilterBuilder();
        },
      };
    },

    async rpc(fnName: string, params?: Record<string, unknown>) {
      try {
        const url = `${baseUrl}/rest/v1/rpc/${encodeURIComponent(fnName)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            ...commonHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params || {}),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          return {
            data: null,
            error: { message: errJson?.message || res.statusText, status: res.status },
          };
        }

        const data = await res.json();
        return { data, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err?.message || 'Network error' } };
      }
    },

    storage: {
      from(bucket: string) {
        return {
          async upload(
            objectPath: string,
            buffer: Buffer | Uint8Array,
            options?: { contentType?: string; upsert?: boolean }
          ) {
            try {
              const cleanPath = objectPath.replace(/^\/+/, '');
              const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${cleanPath}`;
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  ...commonHeaders,
                  'Content-Type': options?.contentType || 'application/octet-stream',
                  'x-upsert': options?.upsert ? 'true' : 'false',
                },
                body: toBlob(buffer),
              });

              if (!res.ok) {
                const errJson = await res.json().catch(() => null);
                return {
                  data: null,
                  error: { message: errJson?.message || res.statusText, status: res.status },
                };
              }

              const data = await res.json().catch(() => ({ Key: `${bucket}/${cleanPath}` }));
              return { data, error: null };
            } catch (err: any) {
              return { data: null, error: { message: err?.message || 'Upload failed' } };
            }
          },

          async remove(paths: string[]) {
            try {
              const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`;
              const res = await fetch(url, {
                method: 'DELETE',
                headers: {
                  ...commonHeaders,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prefixes: paths }),
              });

              if (!res.ok) {
                const errJson = await res.json().catch(() => null);
                return {
                  data: null,
                  error: { message: errJson?.message || res.statusText, status: res.status },
                };
              }

              const data = await res.json().catch(() => ({}));
              return { data, error: null };
            } catch (err: any) {
              return { data: null, error: { message: err?.message || 'Delete failed' } };
            }
          },

          async download(objectPath: string) {
            try {
              const cleanPath = objectPath.replace(/^\/+/, '');
              const url = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${cleanPath}`;
              const res = await fetch(url, {
                method: 'GET',
                headers: {
                  ...commonHeaders,
                },
              });

              if (!res.ok) {
                return {
                  data: null,
                  error: { message: res.statusText, status: res.status },
                };
              }

              const blob = await res.blob();
              return { data: blob, error: null };
            } catch (err: any) {
              return { data: null, error: { message: err?.message || 'Download failed' } };
            }
          },
        };
      },
    },
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ============================================================================
// POST: Practice File Upload (Max 2MB, Verified Student Only)
// ============================================================================
export async function POST(request: NextRequest) {
  // 1. Verify CSRF Same-Origin
  if (!verifySameOrigin(request)) {
    return errorResponse('Yêu cầu bị từ chối do vi phạm bảo mật CSRF / Same-Origin.', 403, 'CSRF_REJECTED');
  }

  // 2. Verify Session via Edge Backend (Zero Trust: freshly verified actor)
  const actorSession = await getVerifiedActorSession(request);
  if (!actorSession) {
    return errorResponse('Chưa đăng nhập hoặc phiên làm việc đã hết hạn.', 401, 'UNAUTHORIZED');
  }

  const { user: verifiedUser, accessToken } = actorSession;

  if (verifiedUser.role !== 'student') {
    return errorResponse('Chỉ học sinh mới có quyền tải tệp bài thực hành.', 403, 'FORBIDDEN');
  }

  if (!verifiedUser.currentClassId) {
    return errorResponse('Học sinh chưa được gán vào lớp học đang hoạt động.', 403, 'NO_ACTIVE_CLASS');
  }

  // 3. Read request.body as a stream and count total multipart bytes BEFORE parsing formData
  const bodyStream = request.body;
  if (!bodyStream) {
    return errorResponse('Thiếu nội dung yêu cầu tải tệp.', 400, 'BODY_MISSING');
  }

  const streamResult = await readBoundedMultipartStream(bodyStream, MAX_MULTIPART_REQUEST_BYTES);
  if (!streamResult.success) {
    if (streamResult.code === 'PAYLOAD_TOO_LARGE') {
      return errorResponse(
        'Tổng kích thước yêu cầu multipart vượt quá giới hạn 2 MiB + 64 KiB overhead.',
        400,
        'PAYLOAD_TOO_LARGE'
      );
    }
    return errorResponse('Lỗi khi đọc luồng dữ liệu tải tệp.', 400, 'STREAM_READ_ERROR');
  }

  const fullBody = streamResult.buffer;

  // Parse FormData safely from the bounded buffered body
  let formData: FormData;
  try {
    const contentTypeHeader = request.headers.get('content-type') || '';
    formData = await new Response(toBlob(fullBody), {
      headers: { 'content-type': contentTypeHeader },
    }).formData();
  } catch {
    return errorResponse('Dữ liệu biểu mẫu không hợp lệ hoặc kích thước vượt quá giới hạn.', 400, 'INVALID_FORM');
  }

  const file = formData.get('file');
  const rawLessonId = formData.get('lessonId');

  if (!file || !(file instanceof File)) {
    return errorResponse('Vui lòng chọn tệp bài làm thực tế cần tải lên.', 400, 'FILE_MISSING');
  }

  if (!rawLessonId || typeof rawLessonId !== 'string' || !isValidUUID(rawLessonId)) {
    return errorResponse('Mã bài học không hợp lệ.', 400, 'LESSON_ID_INVALID');
  }
  const lessonId = rawLessonId.trim();

  // 4. Measure Actual File Size at Server (strictly <= 2 MiB)
  let fileBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch {
    return errorResponse('Không thể đọc dữ liệu tệp bài nộp.', 400, 'FILE_READ_ERROR');
  }

  const actualSizeBytes = fileBuffer.byteLength;
  if (actualSizeBytes <= 0 || actualSizeBytes > MAX_PRACTICE_FILE_SIZE) {
    return errorResponse('Kích thước tệp không hợp lệ hoặc vượt quá giới hạn 2 MB.', 400, 'FILE_TOO_LARGE');
  }

  // 5. Strict Allowlist & Canonical MIME determined solely from extension (not browser file.type)
  const validation = validatePracticeFile(file.name, actualSizeBytes);
  if (!validation.valid || !validation.canonicalMime) {
    return errorResponse(validation.error || 'Tệp không hợp lệ.', 400, 'FILE_VALIDATION_FAILED');
  }
  const canonicalMime = validation.canonicalMime;

  // 6. Verify Student, Active Class, and Lesson Accessibility & Mode under RLS
  let userClient: ReturnType<typeof getUserClient>;
  try {
    userClient = getUserClient(accessToken);
  } catch (err: any) {
    return errorResponse(err?.message || 'Cấu hình máy chủ lưu trữ không hợp lệ.', 500, 'CONFIG_ERROR');
  }

  try {
    const { data: studentRow, error: stErr } = await userClient
      .from('students')
      .select('id, current_class_id, status')
      .eq('id', verifiedUser.id)
      .maybeSingle();

    if (stErr || !studentRow || !studentRow.current_class_id || studentRow.status === 'archived') {
      return errorResponse('Tài khoản học sinh chưa được phân vào lớp học đang hoạt động.', 403, 'NO_ACTIVE_CLASS');
    }

    const { data: classRow, error: clsErr } = await userClient
      .from('classes')
      .select('id, course_id, status')
      .eq('id', studentRow.current_class_id)
      .maybeSingle();

    if (clsErr || !classRow || classRow.status !== 'active' || !classRow.course_id) {
      return errorResponse('Lớp học chưa được kích hoạt hoặc chưa được gán khóa học.', 403, 'CLASS_NOT_ACTIVE');
    }

    const { data: lessonRow, error: lessonErr } = await userClient
      .from('lessons')
      .select('id, course_id, status, has_practice, practice_mode')
      .eq('id', lessonId)
      .maybeSingle();

    if (lessonErr || !lessonRow || lessonRow.course_id !== classRow.course_id || lessonRow.status !== 'published') {
      return errorResponse(
        'Bài học không tồn tại, chưa xuất bản hoặc không thuộc khóa học của lớp bạn.',
        403,
        'LESSON_NOT_ACCESSIBLE'
      );
    }

    if (!lessonRow.has_practice) {
      return errorResponse('Bài học này không có phần bài tập thực hành.', 400, 'NO_PRACTICE_REQUIRED');
    }

    if (lessonRow.practice_mode !== 'file_allowed') {
      return errorResponse(
        'Bài học này chỉ chấp nhận nộp qua đường dẫn liên kết, không cho phép tải tệp.',
        400,
        'FILE_NOT_ALLOWED'
      );
    }

    // Verify submission resubmission lifecycle (fail closed if lookup returns database error)
    const { data: existingSub, error: subErr } = await userClient
      .from('practice_submissions')
      .select('id, status, can_resubmit')
      .eq('student_id', verifiedUser.id)
      .eq('lesson_id', lessonId)
      .eq('class_id', studentRow.current_class_id)
      .maybeSingle();

    if (subErr) {
      return errorResponse('Không thể kiểm tra trạng thái bài nộp trên cơ sở dữ liệu.', 500, 'DB_CHECK_FAILED');
    }

    if (existingSub && existingSub.status === 'approved' && !existingSub.can_resubmit) {
      return errorResponse(
        'Bài nộp đã được duyệt Đạt. Giáo viên phải mở lại quyền nộp bài trước khi nộp bản thay thế.',
        403,
        'CANNOT_RESUBMIT_APPROVED'
      );
    }
  } catch {
    return errorResponse('Không thể kiểm tra điều kiện bài học trên cơ sở dữ liệu.', 500, 'DB_CHECK_FAILED');
  }

  // 6b. Cleanup of Stale Reservations for this student & lesson (Fail closed on database RPC errors)
  try {
    const { data: staleList, error: cleanErr } = await userClient.rpc('m3_cleanup_stale_reservations', {
      p_student_id: verifiedUser.id,
      p_lesson_id: lessonId,
    });

    if (cleanErr) {
      return errorResponse(
        cleanErr?.message || 'Không thể kiểm tra và dọn dẹp lượt đặt trước trên cơ sở dữ liệu.',
        500,
        'CLEANUP_FAILED'
      );
    }

    if (Array.isArray(staleList) && staleList.length > 0) {
      for (const stale of staleList) {
        const sResId = (stale as any)?.reservation_id || (stale as any)?.id;
        const sPath = (stale as any)?.object_path;
        if (sResId && sPath) {
          // Attempt storage delete via Storage API (may return error/not found if object already lost after crash)
          try {
            await userClient.storage.from('m3-practice-files').remove([sPath]);
          } catch {}

          // Finalize/release ONLY when RPC authoritative DB check confirms storage.objects is absent
          // If object still exists or DB check fails, reservation remains claimed (retains quota) and fail closed
          try {
            const { error: relErr } = await userClient.rpc('m3_release_upload_reservation', {
              p_reservation_id: sResId,
              p_object_path: sPath,
            });

            if (relErr) {
              return errorResponse(
                relErr.message || 'Không thể giải phóng lượt đặt trước mồ côi trên cơ sở dữ liệu.',
                500,
                'CLEANUP_FAILED'
              );
            }
          } catch (relEx: any) {
            return errorResponse(
              relEx?.message || 'Lỗi khi giải phóng lượt đặt trước mồ côi trên cơ sở dữ liệu.',
              500,
              'CLEANUP_FAILED'
            );
          }
        }
      }
    }
  } catch (err: any) {
    return errorResponse(
      err?.message || 'Lỗi khi xử lý dọn dẹp lượt đặt trước trên cơ sở dữ liệu.',
      500,
      'CLEANUP_FAILED'
    );
  }

  // 7. Atomic Upload Reservation (DB-derived verified scope, advisory lock, finite pending cap & storage quota)
  let reservationId: string | undefined;
  let reservedPath: string | undefined;

  try {
    const { data: resData, error: resErr } = await userClient.rpc('m3_reserve_practice_upload', {
      p_student_id: verifiedUser.id,
      p_lesson_id: lessonId,
      p_file_extension: validation.extension,
      p_file_size_bytes: actualSizeBytes,
    });

    if (resErr || !resData || resData.length === 0) {
      const msg = resErr?.message || 'Không thể đặt trước vị trí tải tệp.';
      let status = 400;
      let code = 'RESERVATION_FAILED';

      if (msg.includes('STORAGE_QUOTA_EXCEEDED')) {
        status = 507; // Insufficient Storage
        code = 'STORAGE_QUOTA_EXCEEDED';
      } else if (msg.includes('STORAGE_BASELINE_UNVERIFIED')) {
        status = 507;
        code = 'STORAGE_BASELINE_UNVERIFIED';
      } else if (msg.includes('CLASS_CLOSE_IN_PROGRESS')) {
        status = 409; // Conflict
        code = 'CLASS_CLOSE_IN_PROGRESS';
      } else if (msg.includes('PENDING_UPLOAD_CAP_EXCEEDED')) {
        status = 429;
        code = 'PENDING_UPLOAD_CAP_EXCEEDED';
      } else if (msg.includes('FORBIDDEN')) {
        status = 403;
        code = 'FORBIDDEN';
      } else if (msg.includes('CANNOT_RESUBMIT_APPROVED')) {
        status = 403;
        code = 'CANNOT_RESUBMIT_APPROVED';
      }

      return errorResponse(msg, status, code);
    }

    reservationId = resData[0].reservation_id;
    reservedPath = resData[0].object_path;
  } catch {
    return errorResponse('Lỗi khi thiết lập bảo vệ tải tệp trên cơ sở dữ liệu.', 500, 'RESERVATION_ERROR');
  }

  if (!reservedPath || !reservationId) {
    return errorResponse('Không nhận được đường dẫn đặt trước hợp lệ.', 500, 'RESERVATION_ERROR');
  }

  // 8. Upload to Private Storage Bucket m3-practice-files under RLS
  try {
    const { data: uploadData, error: uploadErr } = await userClient.storage
      .from('m3-practice-files')
      .upload(reservedPath, fileBuffer, {
        contentType: canonicalMime,
        upsert: false,
      });

    if (uploadErr || !uploadData) {
      // Idempotent retry cleanup: attempt Storage remove first, then release via authoritative DB check
      try {
        await userClient.storage.from('m3-practice-files').remove([reservedPath]);
      } catch {}
      try {
        await userClient.rpc('m3_release_upload_reservation', {
          p_reservation_id: reservationId,
          p_object_path: reservedPath,
        });
      } catch {}

      return errorResponse(
        uploadErr?.message || 'Không thể lưu tệp vào hệ thống lưu trữ.',
        500,
        'STORAGE_ERROR'
      );
    }

    let quotaWarning: string | undefined;
    try {
      // R9-02: Học sinh chỉ nhận cờ cảnh báo, không gọi trực tiếp m5_get_storage_quota_status (chỉ Admin/service_role)
      const { data: qData } = await userClient.rpc('m5_get_storage_upload_warning', {});
      if (Array.isArray(qData) && qData[0]?.is_warning && qData[0]?.message) {
        quotaWarning = qData[0].message;
      }
    } catch {}

    return NextResponse.json(
      {
        success: true,
        filePath: reservedPath,
        fileName: file.name,
        fileSize: actualSizeBytes,
        mimeType: canonicalMime,
        message: 'Tải tệp bài thực hành lên thành công.',
        ...(quotaWarning ? { quotaWarning } : {}),
      },
      {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          ...(quotaWarning ? { 'X-Storage-Quota-Warning': '1' } : {}),
        },
      }
    );
  } catch (err: any) {
    // Idempotent retry cleanup on unexpected exception: attempt Storage remove, then release via authoritative DB check
    try {
      await userClient.storage.from('m3-practice-files').remove([reservedPath]);
    } catch {}
    try {
      await userClient.rpc('m3_release_upload_reservation', {
        p_reservation_id: reservationId,
        p_object_path: reservedPath,
      });
    } catch {}

    return errorResponse(err?.message || 'Lỗi hệ thống khi xử lý tệp.', 500, 'INTERNAL_ERROR');
  }
}

// ============================================================================
// GET: Secure File Download (Owner Student, Assigned Active Teacher, Admin)
// ============================================================================
export async function GET(request: NextRequest) {
  // 1. Verify Session via Edge Backend
  const actorSession = await getVerifiedActorSession(request);
  if (!actorSession) {
    return errorResponse('Chưa đăng nhập hoặc phiên làm việc đã hết hạn.', 401, 'UNAUTHORIZED');
  }

  const { user: verifiedUser, accessToken } = actorSession;

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
    return errorResponse('Đường dẫn tệp không được để trống.', 400, 'PATH_MISSING');
  }

  // Path format: <studentProfileId>/<lessonId>/<timestamp_filename>
  const parts = filePath.trim().split('/');
  if (parts.length < 3 || !isValidUUID(parts[0]) || !isValidUUID(parts[1])) {
    return errorResponse('Đường dẫn tệp không hợp lệ.', 400, 'INVALID_PATH');
  }

  const studentOwnerId = parts[0];
  const lessonId = parts[1];

  const rawFileName = parts[parts.length - 1];
  const safeDisplayFileName = rawFileName.replace(/^\d+_/, '') || rawFileName;
  const ext = safeDisplayFileName.split('.').pop() || '';
  const downloadMime = getCanonicalMimeForExtension(ext);
  if (!downloadMime) {
    return errorResponse('Định dạng tệp không được hỗ trợ hoặc không nằm trong danh sách cho phép.', 400, 'UNSUPPORTED_MEDIA_TYPE');
  }

  // 2. Authorization & Exact Current Submission Object Verification under RLS
  let userClient: ReturnType<typeof getUserClient>;
  try {
    userClient = getUserClient(accessToken);
  } catch (err: any) {
    return errorResponse(err?.message || 'Cấu hình máy chủ lưu trữ không hợp lệ.', 500, 'CONFIG_ERROR');
  }

  try {
    const { data: subRow, error: subErr } = await userClient
      .from('practice_submissions')
      .select('id, student_id, lesson_id, class_id, content, status')
      .eq('content', filePath)
      .maybeSingle();

    if (subErr || !subRow) {
      return errorResponse(
        'Tệp không thuộc bài nộp hiện tại nào hoặc bạn không có quyền truy cập.',
        403,
        'FORBIDDEN'
      );
    }

    // Role-specific verification
    if (verifiedUser.role === 'student') {
      if (verifiedUser.id !== studentOwnerId || subRow.student_id !== verifiedUser.id) {
        return errorResponse('Bạn chỉ có quyền tải tệp bài làm của chính mình.', 403, 'FORBIDDEN');
      }

      // Verify student still belongs to the class of this submission
      const { data: studentSelf } = await userClient
        .from('students')
        .select('id, current_class_id, status')
        .eq('id', verifiedUser.id)
        .maybeSingle();

      if (!studentSelf || studentSelf.status === 'archived' || studentSelf.current_class_id !== subRow.class_id) {
        return errorResponse('Bạn không còn thuộc lớp học của bài nộp này.', 403, 'FORBIDDEN');
      }
    } else if (verifiedUser.role === 'teacher') {
      const assignedIds = Array.isArray(verifiedUser.assignedClassIds) ? verifiedUser.assignedClassIds : [];
      if (!assignedIds.includes(subRow.class_id)) {
        return errorResponse('Bạn không được phân công phụ trách lớp học của bài nộp này.', 403, 'FORBIDDEN');
      }

      // Verify student still belongs to the assigned class
      const { data: studentOwner } = await userClient
        .from('students')
        .select('id, current_class_id, status')
        .eq('id', subRow.student_id)
        .maybeSingle();

      if (!studentOwner || studentOwner.status === 'archived' || studentOwner.current_class_id !== subRow.class_id || !assignedIds.includes(studentOwner.current_class_id)) {
        return errorResponse('Học sinh không còn thuộc lớp học được phân công hoặc bài nộp thuộc lớp cũ.', 403, 'FORBIDDEN');
      }
    } else if (verifiedUser.role !== 'admin') {
      return errorResponse('Bạn không có quyền truy cập tệp bài nộp.', 403, 'FORBIDDEN');
    }
  } catch {
    return errorResponse('Lỗi xác thực quyền truy cập tệp bài nộp.', 500, 'AUTH_CHECK_FAILED');
  }

  // 3. Download from Private Storage Bucket under RLS
  try {
    const { data: fileBlob, error: downloadErr } = await userClient.storage
      .from('m3-practice-files')
      .download(filePath);

    if (downloadErr || !fileBlob) {
      return errorResponse('Tệp không tồn tại hoặc đã bị xóa.', 404, 'NOT_FOUND');
    }

    const arrayBuffer = await fileBlob.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': downloadMime,
        'Content-Disposition': `attachment; filename="${sanitizeFileName(safeDisplayFileName)}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err: any) {
    return errorResponse(err?.message || 'Lỗi khi tải tệp.', 500, 'DOWNLOAD_ERROR');
  }
}
