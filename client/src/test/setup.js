import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/**
 * jsdom implements neither of these, and both are used by the app on mount:
 * the theme provider asks for the system colour scheme, and the board watches
 * a sentinel to page in more notes. Without stubs every render throws before
 * the component under test has done anything.
 */
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver = window.IntersectionObserver || IntersectionObserverStub;

if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, 'crypto', {
    value: { ...window.crypto, randomUUID: () => Math.random().toString(36).slice(2) },
  });
}
