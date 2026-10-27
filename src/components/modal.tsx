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

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (container) {
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
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1c30]/50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-lg border-2 border-[#0f233a] shadow-[4px_4px_0px_#0f233a] w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] flex flex-col overflow-hidden outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[#cbd5e1] bg-[#f8f9ff] shrink-0">
          <h3 id={titleId} className="text-base font-extrabold text-[#0b1c30] tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="text-[#44474d] hover:text-[#0b1c30] p-1.5 rounded border border-transparent hover:border-[#cbd5e1] hover:bg-white transition-colors"
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0b1c30]/50">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`w-screen ${widthClasses[width]} max-h-screen bg-white border-l-2 border-[#0f233a] flex flex-col outline-none`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[#cbd5e1] bg-[#f8f9ff] shrink-0">
            <h3 id={titleId} className="text-base font-extrabold text-[#0b1c30] tracking-tight">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng thanh trượt"
              className="text-[#44474d] hover:text-[#0b1c30] p-1.5 rounded border border-transparent hover:border-[#cbd5e1] hover:bg-white transition-colors"
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1c30]/50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="bg-white rounded-lg border-2 border-[#0f233a] shadow-[4px_4px_0px_#0f233a] max-w-md w-full max-h-[90vh] overflow-y-auto p-6 outline-none"
      >
        <div className="flex items-start gap-4">
          <div
            className={`p-2.5 rounded-md border shrink-0 ${
              isDanger
                ? 'bg-[#ffdad6] text-[#ba1a1a] border-[#ba1a1a]/40'
                : 'bg-[#eff4ff] text-[#1e40af] border-[#708cfd]'
            }`}
          >
            {isDanger ? <IconAlertTriangle className="w-5 h-5" /> : <IconInfo className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <h3 id={titleId} className="text-base font-extrabold text-[#0b1c30] mb-2 tracking-tight">
              {title}
            </h3>
            <p id={descId} className="text-xs text-[#44474d] leading-relaxed mb-6">
              {message}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border-[1.5px] border-[#cbd5e1] bg-white text-[#0f233a] rounded text-xs font-bold hover:border-[#0f233a] hover:bg-[#f8fafc] transition-colors"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-5 py-2 text-white rounded text-xs font-bold transition-colors ${
                  isDanger
                    ? 'bg-[#b91c1c] hover:bg-[#93000a] disabled:opacity-50'
                    : 'bg-[#1e40af] hover:bg-[#0f233a] disabled:opacity-50'
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
