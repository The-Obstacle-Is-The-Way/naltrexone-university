import type { ReactNode } from 'react';
import { createElement } from 'react';
import { vi } from 'vitest';
import 'vitest-browser-react';

// Browser-mode tests do not expose Node's `process` global. Mock the external
// Sentry SDK so client-safe wrappers can import without pulling Next router
// internals into the browser test runtime.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => createElement('a', { href, ...props }, children),
}));

const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;
document.head.appendChild(style);
