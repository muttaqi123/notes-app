import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Markdown to HTML, then sanitised.
 *
 * The sanitiser is not optional. Notes are user input rendered back as HTML,
 * so without it a note containing an <img onerror> is stored XSS against the
 * person who wrote it — and against anyone the note is ever shared with.
 */
export function renderMarkdown(source = '') {
  const html = marked.parse(source || '');
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'input',
    ],
    ALLOWED_ATTR: ['href', 'title', 'type', 'checked', 'disabled'],
    // A link that runs javascript: is a link that is not a link.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });
}

/** A short plain-text preview, for places where a card would rather not
 *  render a heading three times the size of everything around it. */
export function plainPreview(source = '', limit = 400) {
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~-]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
