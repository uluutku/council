import { Children, isValidElement, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function safeUrl(url) {
  if (typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

function MarkdownLink({ href, children }) {
  const safeHref = safeUrl(href);
  if (!safeHref) return <span>{children}</span>;
  return (
    <a href={safeHref} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function SuppressedImage({ alt, src }) {
  const safeHref = safeUrl(src);
  const label = alt?.trim() || 'Image';
  return safeHref ? (
    <a href={safeHref} target="_blank" rel="noopener noreferrer" className="ai-markdown-image-link">
      {label}
    </a>
  ) : (
    <span className="ai-markdown-image-alt">{label}</span>
  );
}

function CodeBlock({ children }) {
  const [copyState, setCopyState] = useState('');
  const child = Children.only(children);
  const className = isValidElement(child) ? (child.props.className ?? '') : '';
  const language = /language-([A-Za-z0-9_+-]+)/.exec(className)?.[1] ?? '';
  const code = isValidElement(child) ? String(child.props.children ?? '').replace(/\n$/, '') : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('Code copied.');
    } catch {
      setCopyState('Could not copy code.');
    }
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-toolbar">
        <span>{language || 'Code'}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          Copy
        </button>
      </div>
      <pre>
        <code className={className}>{code}</code>
      </pre>
      <span className="sr-only" role="status" aria-live="polite">
        {copyState}
      </span>
    </div>
  );
}

export function SafeMarkdown({ content, streaming = false }) {
  return (
    <div className="ai-markdown" data-streaming={streaming ? 'true' : undefined}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: MarkdownLink,
          img: SuppressedImage,
          pre: CodeBlock,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
