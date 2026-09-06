import { describe, test, expect } from 'vitest';
import { renderMarkdown, plainPreview } from '../lib/markdown.js';

/**
 * The sanitiser is the security boundary between "a note someone typed" and
 * "HTML this app puts on the page". These are the tests that would fail if
 * somebody ever removed DOMPurify to fix a rendering quirk.
 */
describe('markdown rendering', () => {
  test('renders the ordinary things', () => {
    const html = renderMarkdown('# Title\n\n**bold** and `code`\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
  });

  test('keeps links, and their text', () => {
    const html = renderMarkdown('[MDN](https://developer.mozilla.org)');
    expect(html).toContain('href="https://developer.mozilla.org"');
    expect(html).toContain('>MDN<');
  });
});

describe('sanitising', () => {
  test('a script tag in a note is not a script tag on the page', () => {
    const html = renderMarkdown('Hello <script>alert("xss")</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(');
  });

  test('an event handler attribute is stripped', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  test('a javascript: link is not a link', () => {
    // A link that runs code is exactly the thing the URI allow-list exists for.
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  test('an iframe is removed entirely', () => {
    const html = renderMarkdown('<iframe src="https://example.com"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  test('a style attribute cannot be used to cover the page', () => {
    const html = renderMarkdown('<p style="position:fixed;inset:0">gotcha</p>');
    expect(html).not.toContain('position:fixed');
  });

  test('harmless text that merely looks like markup survives', () => {
    const html = renderMarkdown('use `<script>` tags carefully');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('plain previews', () => {
  test('strips the markup', () => {
    expect(plainPreview('# Heading\n\n**bold** text')).toBe('Heading\n\nbold text');
  });

  test('keeps a link’s words and drops its target', () => {
    expect(plainPreview('see [the docs](https://example.com)')).toBe('see the docs');
  });

  test('truncates past the limit', () => {
    const preview = plainPreview('a'.repeat(500), 100);
    expect(preview).toHaveLength(101);
    expect(preview.endsWith('…')).toBe(true);
  });
});
