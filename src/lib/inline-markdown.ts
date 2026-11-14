export type InlineMarkdownToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'bold'; children: InlineMarkdownToken[] };

export interface FencedContentBlock {
  type: 'text' | 'code';
  lang?: string;
  content: string;
}

const SAFE_LINK_HREF_RE = /^(?:https?:\/\/|\/(?!\/))/i;

function isAsciiWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

function isFenceLangChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || // _
    code === 45 // -
  );
}

/**
 * Strips leading newline pairs (\r\n or \n) while preserving first-line horizontal indentation,
 * and strips trailing whitespace in strict O(N) time without regex backtracking.
 */
export function trimCodeBlockContent(raw: string): string {
  let start = 0;
  while (start < raw.length) {
    if (raw[start] === '\n') {
      start += 1;
    } else if (raw[start] === '\r' && raw[start + 1] === '\n') {
      start += 2;
    } else {
      break;
    }
  }

  let end = raw.length;
  while (end > start && isAsciiWhitespace(raw[end - 1])) {
    end -= 1;
  }

  return raw.slice(start, end);
}

/**
 * Splits markdown content into alternating text and fenced code blocks in strict O(N) time.
 */
export function parseFencedCodeBlocks(
  raw: string,
  options?: { trimTextBlocks?: boolean }
): FencedContentBlock[] {
  if (!raw) return [];
  const trimText = Boolean(options?.trimTextBlocks);
  const blocks: FencedContentBlock[] = [];

  let lastIndex = 0;
  let searchFrom = 0;

  while (searchFrom < raw.length) {
    const openIdx = raw.indexOf('```', searchFrom);
    if (openIdx === -1) break;

    let langEnd = openIdx + 3;
    while (langEnd < raw.length && isFenceLangChar(raw[langEnd])) {
      langEnd += 1;
    }

    let bodyStart = -1;
    if (raw[langEnd] === '\n') {
      bodyStart = langEnd + 1;
    } else if (raw[langEnd] === '\r' && raw[langEnd + 1] === '\n') {
      bodyStart = langEnd + 2;
    }

    if (bodyStart === -1) {
      searchFrom = openIdx + 1;
      continue;
    }

    const closeIdx = raw.indexOf('```', bodyStart);
    if (closeIdx === -1) {
      // No closing fence anywhere in the remainder of raw — terminate in O(1)
      break;
    }

    if (openIdx > lastIndex) {
      const slice = raw.slice(lastIndex, openIdx);
      const textContent = trimText ? slice.trim() : slice;
      if (!trimText || textContent.length > 0) {
        blocks.push({ type: 'text', content: textContent });
      }
    }

    const langTag = raw.slice(openIdx + 3, langEnd).toLowerCase() || 'text';
    blocks.push({
      type: 'code',
      lang: langTag,
      content: trimCodeBlockContent(raw.slice(bodyStart, closeIdx)),
    });

    lastIndex = closeIdx + 3;
    searchFrom = lastIndex;
  }

  if (lastIndex < raw.length) {
    const tail = raw.slice(lastIndex);
    const tailContent = trimText ? tail.trim() : tail;
    if (!trimText || tailContent.length > 0) {
      blocks.push({ type: 'text', content: tailContent });
    }
  }

  return blocks;
}

/**
 * Tokenizes inline markdown (`code`, `` `code` ``, **bold**, and safe [label](url))
 * in strict O(N) linear time using monotonic lookahead caches.
 */
export function tokenizeInlineMarkdown(
  text: string,
  options?: { allowBold?: boolean; allowLinks?: boolean }
): InlineMarkdownToken[] {
  const allowBoldInitial = Boolean(options?.allowBold);
  const allowLinksInitial = Boolean(options?.allowLinks);

  return scanInlineSegment(text, allowBoldInitial, allowLinksInitial);
}

function scanInlineSegment(
  text: string,
  allowBold: boolean,
  allowLinks: boolean
): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  if (!text) return tokens;

  const pushText = (val: string) => {
    if (!val) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === 'text') {
      prev.value += val;
    } else {
      tokens.push({ kind: 'text', value: val });
    }
  };

  let noMoreSingleTick = false;
  let noMoreDoubleTick = false;
  let cachedNextStar = -1;
  let canMatchBold = allowBold;
  let canMatchLinks = allowLinks;
  let cachedNextOpenBracket = -1;
  let cachedCloseBracket = -1;
  let cachedCloseParen = -1;
  let cachedNextOpenParen = -1;

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // 1. Inline code spans (`...` and ``...``) — highest precedence
    if (ch === '`') {
      let runEnd = i + 1;
      while (runEnd < text.length && text[runEnd] === '`') {
        runEnd += 1;
      }
      const tickLen = runEnd - i;

      if (tickLen === 1 && !noMoreSingleTick) {
        const closeTick = text.indexOf('`', runEnd);
        if (closeTick === -1) {
          noMoreSingleTick = true;
          pushText('`');
          i = runEnd;
          continue;
        }
        tokens.push({ kind: 'code', value: text.slice(runEnd, closeTick) });
        i = closeTick + 1;
        continue;
      }

      if (tickLen === 2 && !noMoreDoubleTick) {
        let closeStart = -1;
        let k = runEnd;
        while (k < text.length) {
          const nextTick = text.indexOf('`', k);
          if (nextTick === -1) break;
          let nextRunEnd = nextTick + 1;
          while (nextRunEnd < text.length && text[nextRunEnd] === '`') {
            nextRunEnd += 1;
          }
          if (nextRunEnd - nextTick === 2) {
            closeStart = nextTick;
            break;
          }
          k = nextRunEnd;
        }

        if (closeStart === -1) {
          noMoreDoubleTick = true;
          pushText('``');
          i = runEnd;
          continue;
        }

        let inner = text.slice(runEnd, closeStart);
        if (
          inner.length >= 2 &&
          inner.startsWith(' ') &&
          inner.endsWith(' ') &&
          inner.trim().length > 0
        ) {
          inner = inner.slice(1, -1);
        }
        tokens.push({ kind: 'code', value: inner });
        i = closeStart + 2;
        continue;
      }

      pushText(text.slice(i, runEnd));
      i = runEnd;
      continue;
    }

    // 2. Bold (**...**) with nested inline code/links
    if (canMatchBold && ch === '*') {
      let starEnd = i + 1;
      while (starEnd < text.length && text[starEnd] === '*') {
        starEnd += 1;
      }
      const starLen = starEnd - i;

      if (starLen === 2) {
        if (cachedNextStar < starEnd) {
          cachedNextStar = text.indexOf('*', starEnd);
        }
        if (cachedNextStar === -1) {
          canMatchBold = false;
          pushText('**');
          i = starEnd;
          continue;
        }
        if (text[cachedNextStar + 1] === '*') {
          const inner = text.slice(starEnd, cachedNextStar);
          tokens.push({
            kind: 'bold',
            children: scanInlineSegment(inner, false, canMatchLinks),
          });
          i = cachedNextStar + 2;
          continue;
        }
      }

      pushText(text.slice(i, starEnd));
      i = starEnd;
      continue;
    }

    // 3. Safe Markdown link [label](url)
    if (canMatchLinks && ch === '[') {
      if (cachedCloseBracket <= i) {
        cachedCloseBracket = text.indexOf(']', i + 1);
      }
      if (cachedCloseBracket === -1) {
        canMatchLinks = false;
        pushText('[');
        i += 1;
        continue;
      }

      if (cachedNextOpenBracket <= i) {
        cachedNextOpenBracket = text.indexOf('[', i + 1);
      }

      const hasNestedOpenBracket =
        cachedNextOpenBracket !== -1 && cachedNextOpenBracket < cachedCloseBracket;

      if (
        !hasNestedOpenBracket &&
        cachedCloseBracket > i + 1 &&
        text[cachedCloseBracket + 1] === '('
      ) {
        const parenStart = cachedCloseBracket + 2;
        if (cachedCloseParen < parenStart) {
          cachedCloseParen = text.indexOf(')', parenStart);
        }
        if (cachedCloseParen === -1) {
          canMatchLinks = false;
          pushText('[');
          i += 1;
          continue;
        }

        if (cachedNextOpenParen < parenStart) {
          cachedNextOpenParen = text.indexOf('(', parenStart);
        }
        const hasUnclosedParenBeforeClose =
          cachedNextOpenParen !== -1 && cachedNextOpenParen < cachedCloseParen;

        if (!hasUnclosedParenBeforeClose && cachedCloseParen > parenStart) {
          const href = text.slice(parenStart, cachedCloseParen).trim();
          if (SAFE_LINK_HREF_RE.test(href)) {
            tokens.push({
              kind: 'link',
              label: text.slice(i + 1, cachedCloseBracket),
              href,
            });
            i = cachedCloseParen + 1;
            continue;
          }
        }
      }

      pushText('[');
      i += 1;
      continue;
    }

    // 4. Plain text run up to next special delimiter
    let plainEnd = i + 1;
    while (plainEnd < text.length) {
      const c = text[plainEnd];
      if (c === '`' || (canMatchBold && c === '*') || (canMatchLinks && c === '[')) {
        break;
      }
      plainEnd += 1;
    }
    pushText(text.slice(i, plainEnd));
    i = plainEnd;
  }

  return tokens;
}
