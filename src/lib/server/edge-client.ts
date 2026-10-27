/**
 * Edge Function Client for MINDX LEARN Next.js BFF (Milestone 2)
 *
 * Calls Supabase Edge function `m2-backend` with:
 * - Header: x-mindx-bff-secret
 * - Body: { action, payload, accessToken, sessionVersion, trustedIp }
 * - Never logs tokens, PINs, request body, or raw errors.
 * - Fails closed if configuration is missing.
 */

export interface EdgeRequestOptions {
  action: string;
  payload?: Record<string, unknown>;
  accessToken?: string;
  sessionVersion?: number;
  trustedIp?: string | null;
}

export interface EdgeResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  status?: number;
  operationStatus?: string;
  fixtureClassId?: string | null;
  errors?: string[];
}

const KNOWN_TEST_SUPABASE_PROJECT_REF = 'eythjapspkoyqdxlxtcd';
const DEFAULT_TEST_SUPABASE_URL = `https://${KNOWN_TEST_SUPABASE_PROJECT_REF}.supabase.co`;
const ALLOWED_PROD_ENV_VALUES = new Set(['production', 'prod']);
const ALLOWED_NON_PROD_ENV_VALUES = new Set(['test', 'staging', 'development', 'dev', 'local']);

function isEdgeProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env || typeof env !== 'object') return false;
  const flagKeys = ['MINDX_ENV', 'MINDX_APP_ENV', 'NEXT_PUBLIC_MINDX_ENV'] as const;
  let hasProdFlag = false;
  let hasNonProdFlag = false;

  for (const key of flagKeys) {
    const rawVal = typeof env[key] === 'string' ? env[key]!.trim() : '';
    if (!rawVal) continue;
    const normalized = rawVal.toLowerCase();
    if (ALLOWED_PROD_ENV_VALUES.has(normalized)) {
      hasProdFlag = true;
    } else if (ALLOWED_NON_PROD_ENV_VALUES.has(normalized)) {
      hasNonProdFlag = true;
    } else {
      throw new Error(
        `Chốt chặn an toàn Mốc 6: Giá trị biến môi trường ${key}="${rawVal}" không hợp lệ (chỉ chấp nhận test/staging/development hoặc production/prod).`
      );
    }
  }

  if (hasProdFlag && hasNonProdFlag) {
    throw new Error(
      'Chốt chặn an toàn Mốc 6: Xung đột biến môi trường TEST và PROD giữa MINDX_ENV, MINDX_APP_ENV và NEXT_PUBLIC_MINDX_ENV.'
    );
  }

  let hasNonTestSupabase = false;
  const supabaseKeys = ['MINDX_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const;
  for (const key of supabaseKeys) {
    const rawUrl = typeof env[key] === 'string' ? env[key]!.trim() : '';
    if (!rawUrl) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`${key} không phải là URL hợp lệ.`);
    }
    const host = parsed.hostname.toLowerCase();
    const isTestOrLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === `${KNOWN_TEST_SUPABASE_PROJECT_REF}.supabase.co`;
    if (!isTestOrLocal) {
      hasNonTestSupabase = true;
    }
  }

  let hasNonTestSite = false;
  const siteKeys = ['MINDX_SITE_URL', 'NEXT_PUBLIC_SITE_URL'] as const;
  for (const key of siteKeys) {
    const rawSite = typeof env[key] === 'string' ? env[key]!.trim() : '';
    if (!rawSite) continue;
    let parsed: URL;
    try {
      parsed = new URL(rawSite);
    } catch {
      throw new Error(`${key} không phải là URL hợp lệ.`);
    }
    const host = parsed.hostname.toLowerCase();
    const isTestOrLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.includes('mindx-learn-test');
    if (!isTestOrLocal) {
      hasNonTestSite = true;
    }
  }

  if (hasNonProdFlag && (hasNonTestSupabase || hasNonTestSite)) {
    throw new Error(
      `Chốt chặn an toàn Mốc 6: Cờ môi trường đang đặt là TEST nhưng địa chỉ Supabase hoặc Site URL lại trỏ ra ngoài dự án TEST (${KNOWN_TEST_SUPABASE_PROJECT_REF}).`
    );
  }

  return hasProdFlag || hasNonTestSupabase || hasNonTestSite;
}

function resolveEdgeSupabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const isProd = isEdgeProductionEnvironment(env);
  const rawUrl = typeof env?.MINDX_SUPABASE_URL === 'string' ? env.MINDX_SUPABASE_URL.trim() : '';
  const publicUrl = typeof env?.NEXT_PUBLIC_SUPABASE_URL === 'string' ? env.NEXT_PUBLIC_SUPABASE_URL.trim() : '';
  if (isProd) {
    if (String(env?.NEXT_PUBLIC_MINDX_DEMO || '').trim() === '1') {
      throw new Error(
        'Chốt chặn an toàn Mốc 6: Chế độ dữ liệu giả (NEXT_PUBLIC_MINDX_DEMO=1) bị cấm hoàn toàn trên môi trường Production.'
      );
    }
    if (!rawUrl) {
      throw new Error('MINDX_SUPABASE_URL bắt buộc phải được cấu hình tường minh trên môi trường Production.');
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('MINDX_SUPABASE_URL không phải là URL hợp lệ.');
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1') {
      throw new Error('MINDX_SUPABASE_URL trên môi trường Production bắt buộc phải dùng giao thức HTTPS chính thức.');
    }
    if (host.includes(KNOWN_TEST_SUPABASE_PROJECT_REF)) {
      throw new Error(
        `Chốt chặn an toàn Mốc 6: MINDX_SUPABASE_URL trên môi trường Production tuyệt đối không được trỏ vào dự án TEST (${KNOWN_TEST_SUPABASE_PROJECT_REF}).`
      );
    }
    if (publicUrl && publicUrl.toLowerCase().includes(KNOWN_TEST_SUPABASE_PROJECT_REF)) {
      throw new Error(
        `Chốt chặn an toàn Mốc 6: NEXT_PUBLIC_SUPABASE_URL trên môi trường Production tuyệt đối không được trỏ vào dự án TEST (${KNOWN_TEST_SUPABASE_PROJECT_REF}).`
      );
    }
    return rawUrl.replace(/\/+$/, '');
  }
  return (rawUrl || DEFAULT_TEST_SUPABASE_URL).replace(/\/+$/, '');
}

export async function callEdgeBackend<T = unknown>(
  options: EdgeRequestOptions
): Promise<EdgeResponse<T>> {
  let supabaseUrl: string;
  try {
    supabaseUrl = resolveEdgeSupabaseUrl(process.env);
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Cấu hình địa chỉ máy chủ Supabase không hợp lệ.',
      code: 'CONFIG_ERROR',
      status: 500,
    };
  }
  const bffSecret = process.env.MINDX_BFF_SECRET;

  if (!bffSecret) {
    // Fail closed: without shared BFF secret, requests cannot proceed
    return {
      success: false,
      message: 'Hệ thống máy chủ chưa được cấu hình khóa bảo mật nội bộ (MINDX_BFF_SECRET).',
      code: 'BFF_SECRET_MISSING',
      status: 500,
    };
  }

  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/m2-backend`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-mindx-bff-secret': bffSecret,
  };

  const bodyData: Record<string, unknown> = {
    action: options.action,
  };

  if (options.payload !== undefined) {
    bodyData.payload = options.payload;
  }
  if (options.accessToken) {
    bodyData.accessToken = options.accessToken;
  }
  if (options.sessionVersion !== undefined) {
    bodyData.sessionVersion = options.sessionVersion;
  }
  if (options.trustedIp) {
    bodyData.trustedIp = options.trustedIp;
  }

  const isIdempotentRead =
    options.action === 'bootstrap' ||
    options.action === 'session' ||
    options.action === 'm5-storage-quota-status';
  const maxAttempts = isIdempotentRead ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyData),
        cache: 'no-store',
      });

      const status = res.status;
      let json: any = null;

      try {
        json = await res.json();
      } catch {
        if (attempt < maxAttempts && status >= 500) {
          await new Promise((r) => setTimeout(r, 150 * attempt));
          continue;
        }
        return {
          success: false,
          message: 'Lỗi phản hồi từ máy chủ xử lý trung gian (Invalid JSON).',
          code: 'EDGE_INVALID_RESPONSE',
          status,
        };
      }

      if (attempt < maxAttempts && status >= 500 && !json?.operationStatus) {
        await new Promise((r) => setTimeout(r, 150 * attempt));
        continue;
      }

      return {
        success: Boolean(json?.success),
        data: json?.data,
        message: json?.message || (json?.success ? 'Thao tác thành công.' : 'Thao tác không thành công.'),
        code: json?.code,
        status,
        ...(typeof json?.status === 'string' ? { operationStatus: json.status } : {}),
        ...(json?.fixtureClassId !== undefined ? { fixtureClassId: json.fixtureClassId } : {}),
        ...(Array.isArray(json?.errors) ? { errors: json.errors } : {}),
        ...(typeof json?.score === 'number' ? { score: json.score } : {}),
        ...(typeof json?.passed === 'boolean' ? { passed: json.passed } : {}),
        ...(typeof json?.highestScore === 'number' ? { highestScore: json.highestScore } : {}),
        ...(typeof json?.attemptsCount === 'number' ? { attemptsCount: json.attemptsCount } : {}),
      };
    } catch {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 150 * attempt));
        continue;
      }
      // Security: never log raw network errors or details
      return {
        success: false,
        message: 'Không thể kết nối tới dịch vụ máy chủ bảo mật. Vui lòng thử lại sau.',
        code: 'EDGE_NETWORK_ERROR',
        status: 502,
      };
    }
  }

  return {
    success: false,
    message: 'Không thể kết nối tới dịch vụ máy chủ bảo mật. Vui lòng thử lại sau.',
    code: 'EDGE_NETWORK_ERROR',
    status: 502,
  };
}
