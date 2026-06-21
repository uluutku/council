// Safe text rendering helpers. Message content is always rendered as plain text;
// the only enrichment is turning bare http(s) URLs into links. We never use raw
// HTML, dangerouslySetInnerHTML, or a markdown renderer, and links always carry
// rel="noopener noreferrer" and open in a new tab.

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

// Trailing punctuation that is almost always sentence punctuation rather than
// part of the URL. Stripped from the link target and rendered as plain text.
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Splits message text into ordered tokens for rendering. Each token is either
 * `{ type: 'text', value }` or `{ type: 'link', href, value }`. Callers render
 * text tokens inside elements that preserve whitespace and links as anchors.
 */
export function tokenizeMessageContent(content) {
  if (typeof content !== 'string' || content === '') {
    return [];
  }

  const tokens = [];
  let lastIndex = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const candidate = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      tokens.push({ type: 'text', value: content.slice(lastIndex, start) });
    }

    const trailing = TRAILING_PUNCTUATION.exec(candidate);
    const href = trailing ? candidate.slice(0, candidate.length - trailing[0].length) : candidate;

    if (href !== '' && isSafeHttpUrl(href)) {
      tokens.push({ type: 'link', href, value: href });
      if (trailing) {
        tokens.push({ type: 'text', value: trailing[0] });
      }
    } else {
      tokens.push({ type: 'text', value: candidate });
    }

    lastIndex = start + candidate.length;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return tokens;
}

// Inbox/preview excerpt for an active message: collapse whitespace and clamp.
export function previewExcerpt(content, limit = 120) {
  if (typeof content !== 'string') return '';
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}
