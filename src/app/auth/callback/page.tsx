'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconShield, IconRefreshCw, IconAlertCircle, IconCheckCircle } from '@/components/icons';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState<string>('Đang xác thực liên kết bảo mật...');

  // Ref to hold single in-flight operation across React StrictMode double mounts
  const operationRef = useRef<Promise<{ ok: boolean; success: boolean; message?: string }> | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!operationRef.current) {
      if (typeof window === 'undefined') return;

      // 1. Check URL query parameters (code, token_hash, type)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const tokenHash = urlParams.get('token_hash');
      const paramType = urlParams.get('type'); // DO NOT default here so fragment type is not overwritten!

      // 2. Check URL hash fragment (#access_token=...&refresh_token=...&type=...)
      let fragmentAccessToken: string | null = null;
      let fragmentRefreshToken: string | null = null;
      let fragmentType: string | null = null;

      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        fragmentAccessToken = hashParams.get('access_token');
        fragmentRefreshToken = hashParams.get('refresh_token');
        fragmentType = hashParams.get('type');
      }

      // Security: Scrub sensitive tokens, code, and fragments from URL address bar and browser history immediately
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        // Ignore in restricted environments
      }

      // Determine resolved type faithfully without pre-emptive overwriting
      const resolvedType = paramType || fragmentType || (code ? 'recovery' : 'recovery');

      if (!code && !tokenHash && !fragmentAccessToken) {
        setStatus('error');
        setMessage('Liên kết xác thực không chứa mã chứng thực hợp lệ hoặc đã được sử dụng.');
        return;
      }

      operationRef.current = (async () => {
        try {
          const res = await fetch('/api/m2/staff-callback', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code: code || undefined,
              token_hash: tokenHash || undefined,
              access_token: fragmentAccessToken || undefined,
              refresh_token: fragmentRefreshToken || undefined,
              type: resolvedType,
            }),
          });

          const data = await res.json().catch(() => ({}));
          return {
            ok: res.ok,
            success: Boolean(data?.success),
            message: data?.message,
          };
        } catch {
          return {
            ok: false,
            success: false,
            message: 'Không thể kết nối tới máy chủ xác thực. Vui lòng thử lại sau.',
          };
        }
      })();
    }

    operationRef.current.then((res) => {
      if (!isMounted) return;

      if (res.ok && res.success) {
        setStatus('success');
        setMessage('Xác thực tài khoản Giáo viên / Admin thành công. Đang chuyển hướng...');

        setTimeout(() => {
          router.push('/auth/setup-password');
        }, 800);
      } else {
        setStatus('error');
        setMessage(res.message || 'Xác thực liên kết không thành công hoặc phiên đã hết hạn.');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl shadow-xl border border-slate-200 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-4">
        <IconShield className="w-6 h-6" />
      </div>

      <h1 className="text-lg font-extrabold text-slate-900 mb-2">Xác thực Tài khoản Giáo viên / Admin</h1>

      {status === 'processing' && (
        <div className="py-6 space-y-3">
          <IconRefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-slate-600 font-medium">{message}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="py-6 space-y-3">
          <IconCheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-sm text-emerald-800 font-bold">{message}</p>
        </div>
      )}

      {status === 'error' && (
        <div className="py-6 space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm leading-relaxed flex items-start gap-2 text-left">
            <IconAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Quay lại trang Đăng nhập
          </Link>
        </div>
      )}
    </div>
  );
}
