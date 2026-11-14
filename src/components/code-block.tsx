'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCodeLangLabel, tokenizeCode } from '@/lib/code-highlight';

export interface CodeBlockProps {
  code: string;
  lang?: string;
  title?: string;
  showCopyButton?: boolean;
  showLineNumbers?: boolean;
  compact?: boolean;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function CodeBlock({
  code,
  lang,
  title,
  showCopyButton = false,
  showLineNumbers = true,
  compact = false,
  headerActions,
  footer,
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const tokens = useMemo(() => tokenizeCode(code, lang), [code, lang]);
  const langLabel = useMemo(() => getCodeLangLabel(lang, code), [lang, code]);
  const lineCount = useMemo(() => (code ? code.split(/\r\n|\n/).length : 1), [code]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      Promise.resolve(navigator.clipboard.writeText(code))
        .then(() => {
          if (!isMountedRef.current) return;
          setCopied(true);
          if (copyTimerRef.current !== null) {
            clearTimeout(copyTimerRef.current);
          }
          copyTimerRef.current = setTimeout(() => {
            copyTimerRef.current = null;
            if (isMountedRef.current) {
              setCopied(false);
            }
          }, 2000);
        })
        .catch(() => {});
    }
  };

  return (
    <div className={`agy-code-card ${className}`}>
      <div
        className={`agy-code-header flex flex-wrap items-center justify-between gap-2 text-xs ${
          compact ? 'px-3.5 py-2' : 'px-4 py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#ff5f56' }} />
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#ffbd2e' }} />
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: '#27c93f' }} />
          </div>
          <span
            className="ml-1.5 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider text-[10px] shrink-0"
            style={{
              backgroundColor: '#1d2738',
              color: '#82aaff',
              border: '1px solid #2e3d56',
            }}
          >
            {langLabel}
          </span>
          {title && (
            <span className="font-mono font-semibold text-[11px] truncate" style={{ color: '#cbd5e1' }}>
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!showCopyButton && !headerActions && lineCount > 1 && (
            <span className="font-mono text-[10px]" style={{ color: '#64748b' }}>
              {lineCount} dòng
            </span>
          )}
          {headerActions}
          {showCopyButton && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
              style={{
                backgroundColor: copied ? 'rgba(16, 185, 129, 0.18)' : '#21293a',
                color: copied ? '#6ee7b7' : '#e2e8f0',
                border: copied ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid #334155',
              }}
            >
              {copied ? '✓ Đã sao chép' : 'Sao chép code'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-stretch">
        {showLineNumbers && lineCount >= 2 && (
          <div
            aria-hidden="true"
            className={`agy-code-gutter shrink-0 text-right text-[11px] leading-6 ${
              compact ? 'py-3.5 pl-3 pr-2.5' : 'py-4 sm:py-5 pl-3.5 pr-3'
            }`}
          >
            {Array.from({ length: lineCount }, (_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
        )}

        <pre
          className={`agy-code-pre agy-code-scroll flex-1 min-w-0 m-0 text-xs leading-6 overflow-x-auto whitespace-pre ${
            compact ? 'p-3.5' : 'p-4 sm:p-5'
          }`}
        >
          <code>
            {tokens.map((tok, idx) => {
              if (tok.kind === 'plain') {
                return <React.Fragment key={idx}>{tok.value}</React.Fragment>;
              }
              return (
                <span key={idx} className={`agy-tok-${tok.kind}`}>
                  {tok.swatch && (
                    <span
                      aria-hidden="true"
                      className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1 align-[-1px] border border-white/30"
                      style={{ backgroundColor: tok.swatch }}
                    />
                  )}
                  {tok.value}
                </span>
              );
            })}
          </code>
        </pre>
      </div>

      {footer}
    </div>
  );
}
