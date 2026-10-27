'use client';

import React, { useEffect, useRef, useId } from 'react';
import { IconX, IconAlertTriangle, IconInfo } from './icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * Hook hỗ trợ Accessibility:
 * 1. Phím Escape để đóng an toàn (luôn gọi callback onClose mới nhất)
 * 2. Giữ tiêu điểm (Focus Trap) bằng phím Tab / Shift+Tab
 * 3. Tự động focus vào phần tử đầu tiên khi mở (chỉ theo dõi vòng đời isOpen, không bị kích hoạt lại khi caller re-render)
 * 4. Khôi phục tiêu điểm về phần tử trước đó khi đóng
 */
function useDialogA11y({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Lưu lại phần tử đang focus trước khi modal mở
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
      // Tìm các phần tử có thể nhận focus
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Phím Escape đóng dialog
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      // Giữ tiêu điểm (Focus trap)
      if (e.key === 'Tab' && container) {
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === container) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Khôi phục tiêu điểm khi đóng
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  const dialogRef = useDialogA11y({ isOpen, onClose });
  const titleId = useId();

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] border border-slate-100 w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 outline-none`}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 id={titleId} className="text-base font-bold text-slate-900 tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

export function Drawer({ isOpen, onClose, title, children, width = 'lg' }: DrawerProps) {
  const dialogRef = useDialogA11y({ isOpen, onClose });
  const titleId = useId();

  if (!isOpen) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`w-screen ${widthClasses[width]} max-h-screen bg-white shadow-[0_20px_60px_rgba(15,23,42,0.2)] border-l border-slate-100 flex flex-col animate-in slide-in-from-right duration-200 outline-none`}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng thanh trượt"
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  isDanger = false,
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useDialogA11y({ isOpen, onClose });
  const titleId = useId();
  const descId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] border border-slate-100 max-w-md w-full max-h-[90vh] overflow-y-auto p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-150 outline-none"
      >
        <div className="flex items-start gap-4">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              isDanger ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-blue-50 text-[#1d63ed] border border-blue-100'
            }`}
          >
            {isDanger ? <IconAlertTriangle className="w-6 h-6" /> : <IconInfo className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h3 id={titleId} className="text-base font-bold text-slate-900 mb-2 tracking-tight">
              {title}
            </h3>
            <p id={descId} className="text-sm text-slate-600 leading-relaxed mb-6">
              {message}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-5 py-2.5 text-white rounded-xl text-xs font-semibold shadow-sm transition-all ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 disabled:opacity-50'
                    : 'bg-[#1d63ed] hover:bg-blue-700 shadow-blue-500/20 disabled:opacity-50'
                }`}
              >
                {isLoading ? 'Đang xử lý...' : confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
