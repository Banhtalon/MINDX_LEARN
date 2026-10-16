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
}

const DEFAULT_SUPABASE_URL = 'https://eythjapspkoyqdxlxtcd.supabase.co';

export async function callEdgeBackend<T = unknown>(
  options: EdgeRequestOptions
): Promise<EdgeResponse<T>> {
  const supabaseUrl = process.env.MINDX_SUPABASE_URL || DEFAULT_SUPABASE_URL;
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
      return {
        success: false,
        message: 'Lỗi phản hồi từ máy chủ xử lý trung gian (Invalid JSON).',
        code: 'EDGE_INVALID_RESPONSE',
        status,
      };
    }

    return {
      success: Boolean(json?.success),
      data: json?.data,
      message: json?.message || (json?.success ? 'Thao tác thành công.' : 'Thao tác không thành công.'),
      code: json?.code,
      status,
    };
  } catch {
    // Security: never log raw network errors or details
    return {
      success: false,
      message: 'Không thể kết nối tới dịch vụ máy chủ bảo mật. Vui lòng thử lại sau.',
      code: 'EDGE_NETWORK_ERROR',
      status: 502,
    };
  }
}
