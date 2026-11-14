export type TokenKind =
  | 'plain'
  | 'comment'
  | 'keyword'
  | 'self'
  | 'class'
  | 'func'
  | 'string'
  | 'number'
  | 'prop'
  | 'tag'
  | 'op'
  | 'punct';

export interface CodeToken {
  kind: TokenKind;
  value: string;
  swatch?: string;
}

export type NormalizedCodeLang = 'python' | 'css' | 'html' | 'js' | 'json' | 'sql' | 'plain';

const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const PYTHON_CONSTANTS = new Set(['True', 'False', 'None', 'NotImplemented', 'Ellipsis']);

const PYTHON_BUILTINS = new Set([
  'abs',
  'all',
  'any',
  'bool',
  'chr',
  'dict',
  'dir',
  'enumerate',
  'filter',
  'float',
  'getattr',
  'hasattr',
  'input',
  'int',
  'isinstance',
  'issubclass',
  'len',
  'list',
  'map',
  'max',
  'min',
  'next',
  'object',
  'open',
  'ord',
  'pow',
  'print',
  'property',
  'range',
  'repr',
  'reversed',
  'round',
  'set',
  'setattr',
  'slice',
  'sorted',
  'staticmethod',
  'str',
  'sum',
  'tuple',
  'type',
  'zip',
]);

const JS_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'of',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'static',
  'switch',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

const JS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

const JS_GLOBALS = new Set([
  'console',
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'globalThis',
]);

const SQL_KEYWORDS = new Set([
  'ADD',
  'ALL',
  'ALTER',
  'AND',
  'AS',
  'ASC',
  'BEGIN',
  'BETWEEN',
  'BY',
  'CASE',
  'CHECK',
  'COLUMN',
  'COMMIT',
  'CONSTRAINT',
  'COUNT',
  'CREATE',
  'DEFAULT',
  'DELETE',
  'DESC',
  'DISTINCT',
  'DO',
  'DROP',
  'ELSE',
  'END',
  'EXISTS',
  'FOREIGN',
  'FROM',
  'FUNCTION',
  'GRANT',
  'GROUP',
  'HAVING',
  'IF',
  'IN',
  'INDEX',
  'INNER',
  'INSERT',
  'INTO',
  'IS',
  'JOIN',
  'KEY',
  'LEFT',
  'LIKE',
  'LIMIT',
  'NOT',
  'OFFSET',
  'ON',
  'OR',
  'ORDER',
  'OUTER',
  'PRIMARY',
  'REFERENCES',
  'RETURN',
  'RETURNS',
  'REVOKE',
  'RIGHT',
  'ROLLBACK',
  'SELECT',
  'SET',
  'TABLE',
  'THEN',
  'TO',
  'TRIGGER',
  'UNION',
  'UNIQUE',
  'UPDATE',
  'VALUES',
  'VIEW',
  'WHEN',
  'WHERE',
  'WITH',
]);

const CSS_VALUE_KEYWORDS = new Set([
  'absolute',
  'auto',
  'black',
  'block',
  'bold',
  'border-box',
  'both',
  'bottom',
  'center',
  'collapse',
  'column',
  'contain',
  'content-box',
  'cover',
  'CurrentColor',
  'currentColor',
  'dashed',
  'dotted',
  'ease',
  'ease-in',
  'ease-in-out',
  'ease-out',
  'fixed',
  'flex',
  'grid',
  'hidden',
  'Important',
  'important',
  'inherit',
  'initial',
  'inline',
  'inline-block',
  'inline-flex',
  'italic',
  'justify',
  'left',
  'linear',
  'middle',
  'monospace',
  'none',
  'normal',
  'nowrap',
  'pointer',
  'relative',
  'repeat',
  'right',
  'row',
  'sans-serif',
  'scroll',
  'serif',
  'solid',
  'space-around',
  'space-between',
  'static',
  'sticky',
  'stretch',
  'top',
  'transparent',
  'underline',
  'unset',
  'uppercase',
  'visible',
  'white',
  'wrap',
]);

const WS_RE = /[\s]+/y;
const PY_STR_PREFIX_RE = /(?:[fFrRbB]{2}|[fFrRbBuU])(?=['"])/y;
const DECORATOR_RE = /@[A-Za-z_][A-Za-z0-9_.]*/y;
const NUMBER_RE = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/y;
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const OP_RE = /(?:===|!==|==|!=|<=|>=|\+=|-=|\*=|\/=|\/\/=|\*\*=|->|=>|&&|\|\||\/\/|\*\*|[+\-*/%=<>!&|^~])/y;
const PUNCT_RE = /[()[\]{}:,;.]/y;

const CSS_AT_RE = /@[A-Za-z_-]+/y;
const CSS_HEX_RE = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/y;
const CSS_NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|ch|ex|%|s|ms|deg|rad|turn|fr|dpi)?/y;
const CSS_IDENT_RE = /-?[A-Za-z_][A-Za-z0-9_-]*/y;

const HTML_DOCTYPE_START_RE = /<!doctype(?=[\s>]|$)/iy;
const HTML_OPEN_STYLE_RE = /<style(?=[\s>/])/iy;
const HTML_OPEN_SCRIPT_RE = /<script(?=[\s>/])/iy;
const HTML_TAG_START_RE = /<\/?[A-Za-z][A-Za-z0-9:-]*/y;
const HTML_ATTR_NAME_RE = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const HTML_UNQUOTED_VAL_RE = /[^\s>"'=<>`]+/y;

function matchSticky(re: RegExp, text: string, index: number): string | null {
  re.lastIndex = index;
  const m = re.exec(text);
  return m ? m[0] : null;
}

function pushToken(tokens: CodeToken[], kind: TokenKind, value: string, swatch?: string): void {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (!swatch && last && last.kind === kind && !last.swatch) {
    last.value += value;
    return;
  }
  tokens.push(swatch ? { kind, value, swatch } : { kind, value });
}

export function normalizeCodeLang(rawLang?: string, code = ''): NormalizedCodeLang {
  const clean = (rawLang || '').trim().toLowerCase();
  if (clean === 'py' || clean === 'python' || clean === 'python3') return 'python';
  if (clean === 'css' || clean === 'scss' || clean === 'less' || clean === 'qss') return 'css';
  if (clean === 'html' || clean === 'htm' || clean === 'xml' || clean === 'svg') return 'html';
  if (
    clean === 'js' ||
    clean === 'javascript' ||
    clean === 'ts' ||
    clean === 'typescript' ||
    clean === 'jsx' ||
    clean === 'tsx' ||
    clean === 'mjs'
  ) {
    return 'js';
  }
  if (clean === 'json') return 'json';
  if (clean === 'sql' || clean === 'pgsql' || clean === 'postgres' || clean === 'postgresql') return 'sql';

  if (!clean || clean === 'text' || clean === 'plaintext' || clean === 'txt') {
    const sample = code.length > 4096 ? code.slice(0, 4096) : code;
    if (sample.includes('<!DOCTYPE html>') || /<\/?(?:html|head|body|div|h1|p|button|style|script)\b/i.test(sample)) {
      return 'html';
    }
    if (/^[ \t]*(?:from[ \t]+[A-Za-z_]|import[ \t]+[A-Za-z_]|class[ \t]+[A-Za-z_]\w*[ \t]*[:(]|def[ \t]+[A-Za-z_]\w*[ \t]*\()/m.test(sample)) {
      return 'python';
    }
    if (
      /^[ \t]*(?:const|let|var|function|export)[ \t]+[A-Za-z_$]/m.test(sample) ||
      /\bconsole\.log[ \t]*\(/.test(sample)
    ) {
      return 'js';
    }
    if (/^[ \t]*[a-z-]+:[ \t]*[^\s;\r\n{}][^;\r\n{}]*;[ \t]*$/m.test(sample)) {
      return 'css';
    }
  }

  return 'plain';
}

export function getCodeLangLabel(rawLang?: string, code = ''): string {
  const normalized = normalizeCodeLang(rawLang, code);
  switch (normalized) {
    case 'python':
      return 'PYTHON';
    case 'css':
      return 'CSS';
    case 'html':
      return 'HTML5';
    case 'js': {
      const clean = (rawLang || '').trim().toLowerCase();
      return clean === 'ts' || clean === 'typescript' || clean === 'tsx' ? 'TYPESCRIPT' : 'JAVASCRIPT';
    }
    case 'json':
      return 'JSON';
    case 'sql':
      return 'SQL';
    default: {
      const raw = (rawLang || '').trim().toUpperCase();
      return raw && raw !== 'TEXT' ? raw : 'CODE';
    }
  }
}

function scanQuotedString(
  code: string,
  quoteStart: number,
  opts: { allowTripleQuotes?: boolean; allowUnescapedNewline?: boolean }
): number {
  const quote = code[quoteStart];
  const isTriple =
    Boolean(opts.allowTripleQuotes) &&
    (quote === '"' || quote === "'") &&
    code[quoteStart + 1] === quote &&
    code[quoteStart + 2] === quote;

  if (isTriple) {
    const delim = quote.repeat(3);
    let j = quoteStart + 3;
    while (j < code.length) {
      if (code[j] === '\\') {
        j += 2;
        continue;
      }
      if (code.startsWith(delim, j)) {
        return j + 3;
      }
      j += 1;
    }
    return code.length;
  }

  const allowNewline = Boolean(opts.allowUnescapedNewline);
  let j = quoteStart + 1;
  while (j < code.length) {
    const ch = code[j];
    if (ch === '\\') {
      if (code[j + 1] === '\r' && code[j + 2] === '\n') {
        j += 3;
      } else {
        j += 2;
      }
      continue;
    }
    if (ch === quote) {
      return j + 1;
    }
    if (!allowNewline && (ch === '\n' || ch === '\r')) {
      return j;
    }
    j += 1;
  }
  return code.length;
}

function nextNonHorizontalSpaceChar(code: string, fromIndex: number): string {
  let k = fromIndex;
  while (k < code.length && (code[k] === ' ' || code[k] === '\t')) {
    k += 1;
  }
  return k < code.length ? code[k] : '';
}

function findLineCommentEnd(code: string, fromIndex: number): number {
  const nl = code.indexOf('\n', fromIndex);
  if (nl === -1) return code.length;
  return nl > fromIndex && code[nl - 1] === '\r' ? nl - 1 : nl;
}

function tokenizeScript(code: string, mode: 'python' | 'js' | 'json' | 'sql'): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;
  let prevNonWsValue = '';
  let prevNonWsChar = '';

  const recordNonWs = (val: string) => {
    prevNonWsValue = val;
    prevNonWsChar = val[val.length - 1] || '';
  };

  while (i < code.length) {
    const startI = i;

    const ws = matchSticky(WS_RE, code, i);
    if (ws) {
      pushToken(tokens, 'plain', ws);
      i += ws.length;
      continue;
    }

    // Comments
    if (mode === 'python' && code[i] === '#') {
      const end = findLineCommentEnd(code, i);
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    if (mode === 'js' && code.startsWith('//', i)) {
      const end = findLineCommentEnd(code, i);
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    if (mode === 'sql' && code.startsWith('--', i)) {
      const end = findLineCommentEnd(code, i);
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    if ((mode === 'js' || mode === 'sql') && code.startsWith('/*', i)) {
      const closeIdx = code.indexOf('*/', i + 2);
      const end = closeIdx === -1 ? code.length : closeIdx + 2;
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    // Python prefixed strings (f"...", r'...', etc.)
    if (mode === 'python' && (i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1]))) {
      const prefix = matchSticky(PY_STR_PREFIX_RE, code, i);
      if (prefix) {
        const quoteStart = i + prefix.length;
        const end = scanQuotedString(code, quoteStart, {
          allowTripleQuotes: true,
          allowUnescapedNewline: false,
        });
        const val = code.slice(i, end);
        pushToken(tokens, 'string', val);
        recordNonWs(val);
        i = end;
        continue;
      }
    }

    // Strings
    const ch = code[i];
    if (
      ch === '"' ||
      (mode !== 'json' && ch === "'") ||
      (mode === 'js' && ch === '`')
    ) {
      const end = scanQuotedString(code, i, {
        allowTripleQuotes: mode === 'python',
        allowUnescapedNewline: (mode === 'js' && ch === '`') || (mode === 'sql' && ch === "'"),
      });
      const val = code.slice(i, end);
      if (mode === 'json' && ch === '"' && nextNonHorizontalSpaceChar(code, end) === ':') {
        pushToken(tokens, 'prop', val);
      } else {
        pushToken(tokens, 'string', val);
      }
      recordNonWs(val);
      i = end;
      continue;
    }

    // Decorators
    if ((mode === 'python' || mode === 'js') && ch === '@') {
      const dec = matchSticky(DECORATOR_RE, code, i);
      if (dec) {
        pushToken(tokens, 'op', dec);
        recordNonWs(dec);
        i += dec.length;
        continue;
      }
    }

    // Numbers
    if (i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1])) {
      const num = matchSticky(NUMBER_RE, code, i);
      if (num) {
        pushToken(tokens, 'number', num);
        recordNonWs(num);
        i += num.length;
        continue;
      }
    }

    // Identifiers & Keywords
    const ident = matchSticky(IDENT_RE, code, i);
    if (ident) {
      const end = i + ident.length;
      const nextChar = nextNonHorizontalSpaceChar(code, end);
      let kind: TokenKind = 'plain';

      if (mode === 'json') {
        if (JS_CONSTANTS.has(ident)) kind = 'number';
      } else if (mode === 'sql') {
        const upper = ident.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE' || upper === 'NULL') {
          kind = 'number';
        } else if (SQL_KEYWORDS.has(upper)) {
          kind = 'keyword';
        } else if (nextChar === '(') {
          kind = 'func';
        }
      } else if (mode === 'python') {
        if (prevNonWsValue === 'class' && prevNonWsChar !== '.') {
          kind = 'class';
        } else if (prevNonWsValue === 'def' && prevNonWsChar !== '.') {
          kind = 'func';
        } else if (prevNonWsChar === '.') {
          if (nextChar === '(') kind = 'func';
          else if (/^[A-Z]/.test(ident)) kind = 'class';
          else kind = 'prop';
        } else if (ident === 'self' || ident === 'cls' || ident === 'super') {
          kind = 'self';
        } else if (PYTHON_CONSTANTS.has(ident)) {
          kind = 'number';
        } else if (PYTHON_KEYWORDS.has(ident)) {
          kind = 'keyword';
        } else if (ident.startsWith('__') && ident.endsWith('__') && ident.length > 4) {
          kind = nextChar === '(' ? 'func' : 'prop';
        } else if (nextChar === '(') {
          kind = /^[A-Z]/.test(ident) ? 'class' : 'func';
        } else if (/^[A-Z][A-Za-z0-9_]*$/.test(ident)) {
          kind = 'class';
        } else if (PYTHON_BUILTINS.has(ident)) {
          kind = 'func';
        }
      } else {
        // JavaScript / TypeScript
        if ((prevNonWsValue === 'class' || prevNonWsValue === 'interface' || prevNonWsValue === 'type') && prevNonWsChar !== '.') {
          kind = 'class';
        } else if (prevNonWsValue === 'function' && prevNonWsChar !== '.') {
          kind = 'func';
        } else if (prevNonWsChar === '.') {
          if (nextChar === '(') kind = 'func';
          else if (/^[A-Z]/.test(ident)) kind = 'class';
          else kind = 'prop';
        } else if (ident === 'this' || ident === 'super') {
          kind = 'self';
        } else if (JS_CONSTANTS.has(ident)) {
          kind = 'number';
        } else if (JS_KEYWORDS.has(ident)) {
          kind = 'keyword';
        } else if (JS_GLOBALS.has(ident)) {
          kind = 'prop';
        } else if (nextChar === '(') {
          kind = /^[A-Z]/.test(ident) ? 'class' : 'func';
        } else if (/^[A-Z][A-Za-z0-9_$]*$/.test(ident)) {
          kind = 'class';
        }
      }

      pushToken(tokens, kind, ident);
      recordNonWs(ident);
      i = end;
      continue;
    }

    // Operators
    const op = matchSticky(OP_RE, code, i);
    if (op) {
      pushToken(tokens, 'op', op);
      recordNonWs(op);
      i += op.length;
      continue;
    }

    // Punctuation
    const punct = matchSticky(PUNCT_RE, code, i);
    if (punct) {
      pushToken(tokens, 'punct', punct);
      recordNonWs(punct);
      i += punct.length;
      continue;
    }

    // Fallback single character (guarantees strict forward progress)
    pushToken(tokens, 'plain', code[i]);
    recordNonWs(code[i]);
    i = startI + 1;
  }

  return tokens;
}

function isValidHexSwatch(hex: string): boolean {
  const len = hex.length - 1;
  return len === 3 || len === 4 || len === 6 || len === 8;
}

function tokenizeCss(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let i = 0;
  let inValue = false;
  let cachedDelimiterIdx = -1;
  let cachedIsDeclaration = true;

  const checkDeclarationColonAt = (colonIndex: number): boolean => {
    if (colonIndex < cachedDelimiterIdx) {
      return cachedIsDeclaration;
    }
    for (let k = colonIndex + 1; k < code.length; k++) {
      const ch = code[k];
      if (ch === ';' || ch === '}') {
        cachedDelimiterIdx = k;
        cachedIsDeclaration = true;
        return true;
      }
      if (ch === '{') {
        cachedDelimiterIdx = k;
        cachedIsDeclaration = false;
        return false;
      }
    }
    cachedDelimiterIdx = code.length;
    cachedIsDeclaration = true;
    return true;
  };

  while (i < code.length) {
    const startI = i;

    const ws = matchSticky(WS_RE, code, i);
    if (ws) {
      pushToken(tokens, 'plain', ws);
      i += ws.length;
      continue;
    }

    if (code.startsWith('/*', i)) {
      const closeIdx = code.indexOf('*/', i + 2);
      const end = closeIdx === -1 ? code.length : closeIdx + 2;
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    const atRule = matchSticky(CSS_AT_RE, code, i);
    if (atRule) {
      pushToken(tokens, 'keyword', atRule);
      i += atRule.length;
      continue;
    }

    if (code[i] === '"' || code[i] === "'") {
      const end = scanQuotedString(code, i, { allowTripleQuotes: false, allowUnescapedNewline: false });
      pushToken(tokens, 'string', code.slice(i, end));
      i = end;
      continue;
    }

    if (inValue && code[i] === '#') {
      const hex = matchSticky(CSS_HEX_RE, code, i);
      if (hex) {
        pushToken(tokens, 'number', hex, isValidHexSwatch(hex) ? hex : undefined);
        i += hex.length;
        continue;
      }
    }

    if (inValue && (/[0-9.]/.test(code[i]) || ((code[i] === '+' || code[i] === '-') && /[0-9.]/.test(code[i + 1] || '')))) {
      const num = matchSticky(CSS_NUM_RE, code, i);
      if (num) {
        pushToken(tokens, 'number', num);
        i += num.length;
        continue;
      }
    }

    if (code.startsWith('!important', i)) {
      pushToken(tokens, 'keyword', '!important');
      i += 10;
      continue;
    }

    const ident = matchSticky(CSS_IDENT_RE, code, i);
    if (ident) {
      const end = i + ident.length;
      const nextChar = nextNonHorizontalSpaceChar(code, end);
      if (!inValue && nextChar === ':' && checkDeclarationColonAt(code.indexOf(':', end))) {
        pushToken(tokens, 'prop', ident);
      } else if (inValue) {
        if (nextChar === '(') {
          pushToken(tokens, 'func', ident);
        } else if (CSS_VALUE_KEYWORDS.has(ident)) {
          pushToken(tokens, 'class', ident);
        } else {
          pushToken(tokens, 'plain', ident);
        }
      } else {
        pushToken(tokens, 'class', ident);
      }
      i = end;
      continue;
    }

    const ch = code[i];
    if (ch === ':') {
      if (!inValue && checkDeclarationColonAt(i)) {
        inValue = true;
        pushToken(tokens, 'punct', ':');
      } else {
        pushToken(tokens, 'op', ':');
      }
      i += 1;
      continue;
    }

    if (ch === ';') {
      inValue = false;
      pushToken(tokens, 'punct', ';');
      i += 1;
      continue;
    }

    if (ch === '{' || ch === '}') {
      inValue = false;
      pushToken(tokens, 'punct', ch);
      i += 1;
      continue;
    }

    if (ch === '(' || ch === ')' || ch === ',') {
      pushToken(tokens, 'punct', ch);
      i += 1;
      continue;
    }

    if (!inValue && (ch === '.' || ch === '#' || ch === '*' || ch === '>')) {
      pushToken(tokens, 'class', ch);
      i += 1;
      continue;
    }

    pushToken(tokens, 'plain', ch);
    i = startI + 1;
  }

  return tokens;
}

function scanHtmlOpeningOrClosingTag(code: string, start: number, tokens: CodeToken[]): { end: number; selfClosing: boolean } {
  const tagStart = matchSticky(HTML_TAG_START_RE, code, start);
  if (!tagStart) {
    pushToken(tokens, 'plain', code[start]);
    return { end: start + 1, selfClosing: false };
  }

  const bracket = tagStart.startsWith('</') ? '</' : '<';
  const tagName = tagStart.slice(bracket.length);
  pushToken(tokens, 'punct', bracket);
  pushToken(tokens, 'tag', tagName);

  let i = start + tagStart.length;
  let selfClosing = false;

  while (i < code.length) {
    const loopStart = i;

    if (code.startsWith('/>', i)) {
      pushToken(tokens, 'punct', '/>');
      i += 2;
      selfClosing = true;
      break;
    }

    if (code[i] === '>') {
      pushToken(tokens, 'punct', '>');
      i += 1;
      break;
    }

    const ws = matchSticky(WS_RE, code, i);
    if (ws) {
      pushToken(tokens, 'plain', ws);
      i += ws.length;
      continue;
    }

    if (code[i] === '=') {
      pushToken(tokens, 'op', '=');
      i += 1;
      continue;
    }

    if (code[i] === '"' || code[i] === "'") {
      const end = scanQuotedString(code, i, { allowTripleQuotes: false, allowUnescapedNewline: true });
      pushToken(tokens, 'string', code.slice(i, end));
      i = end;
      continue;
    }

    const attrName = matchSticky(HTML_ATTR_NAME_RE, code, i);
    if (attrName) {
      pushToken(tokens, 'class', attrName);
      i += attrName.length;
      continue;
    }

    const unquoted = matchSticky(HTML_UNQUOTED_VAL_RE, code, i);
    if (unquoted) {
      pushToken(tokens, 'string', unquoted);
      i += unquoted.length;
      continue;
    }

    pushToken(tokens, 'plain', code[i]);
    i = loopStart + 1;
  }

  return { end: i, selfClosing };
}

function findCaseInsensitiveCloseTag(lowerCode: string, fromIndex: number, tagLower: 'style' | 'script'): number {
  const needle = `</${tagLower}`;
  let searchPos = fromIndex;
  while (searchPos < lowerCode.length) {
    const idx = lowerCode.indexOf(needle, searchPos);
    if (idx === -1) return lowerCode.length;
    const afterChar = lowerCode[idx + needle.length] || '';
    if (afterChar === '>' || afterChar === ' ' || afterChar === '\t' || afterChar === '\r' || afterChar === '\n') {
      return idx;
    }
    searchPos = idx + needle.length;
  }
  return lowerCode.length;
}

function toAsciiLowerPreservingLength(text: string): string {
  return text.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));
}

function tokenizeHtml(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let lowerCache: string | null = null;
  const getLowerCode = () => {
    if (lowerCache === null) lowerCache = toAsciiLowerPreservingLength(code);
    return lowerCache;
  };
  let i = 0;

  while (i < code.length) {
    const startI = i;

    if (code.startsWith('<!--', i)) {
      const closeIdx = code.indexOf('-->', i + 4);
      const end = closeIdx === -1 ? code.length : closeIdx + 3;
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    if (matchSticky(HTML_DOCTYPE_START_RE, code, i)) {
      let j = i + 9;
      while (j < code.length && code[j] !== '>' && code[j] !== '<') {
        j += 1;
      }
      const end = j < code.length && code[j] === '>' ? j + 1 : j;
      pushToken(tokens, 'comment', code.slice(i, end));
      i = end;
      continue;
    }

    if (matchSticky(HTML_OPEN_STYLE_RE, code, i)) {
      const { end: bodyStart, selfClosing } = scanHtmlOpeningOrClosingTag(code, i, tokens);
      if (selfClosing) {
        i = bodyStart;
        continue;
      }
      const bodyEnd = Math.min(code.length, findCaseInsensitiveCloseTag(getLowerCode(), bodyStart, 'style'));
      if (bodyEnd > bodyStart) {
        for (const sub of tokenizeCss(code.slice(bodyStart, bodyEnd))) {
          pushToken(tokens, sub.kind, sub.value, sub.swatch);
        }
      }
      i = bodyEnd;
      continue;
    }

    if (matchSticky(HTML_OPEN_SCRIPT_RE, code, i)) {
      const { end: bodyStart, selfClosing } = scanHtmlOpeningOrClosingTag(code, i, tokens);
      if (selfClosing) {
        i = bodyStart;
        continue;
      }
      const bodyEnd = Math.min(code.length, findCaseInsensitiveCloseTag(getLowerCode(), bodyStart, 'script'));
      if (bodyEnd > bodyStart) {
        for (const sub of tokenizeScript(code.slice(bodyStart, bodyEnd), 'js')) {
          pushToken(tokens, sub.kind, sub.value, sub.swatch);
        }
      }
      i = bodyEnd;
      continue;
    }

    if (code[i] === '<' && matchSticky(HTML_TAG_START_RE, code, i)) {
      const { end } = scanHtmlOpeningOrClosingTag(code, i, tokens);
      i = end;
      continue;
    }

    const nextLt = code.indexOf('<', i + 1);
    const end = nextLt === -1 ? code.length : nextLt;
    pushToken(tokens, 'plain', code.slice(i, end));
    i = end > startI ? end : startI + 1;
  }

  return tokens;
}

export function tokenizeCode(code: string, rawLang?: string): CodeToken[] {
  if (!code) return [];
  const lang = normalizeCodeLang(rawLang, code);
  switch (lang) {
    case 'python':
      return tokenizeScript(code, 'python');
    case 'css':
      return tokenizeCss(code);
    case 'html':
      return tokenizeHtml(code);
    case 'js':
      return tokenizeScript(code, 'js');
    case 'json':
      return tokenizeScript(code, 'json');
    case 'sql':
      return tokenizeScript(code, 'sql');
    default:
      return [{ kind: 'plain', value: code }];
  }
}
