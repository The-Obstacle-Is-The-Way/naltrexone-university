import type { ReactNode } from 'react';
import { createElement } from 'react';
import { vi } from 'vitest';
import 'vitest-browser-react';

type BrowserProcess = {
  env?: Record<string, string | undefined>;
} & Record<string, unknown>;

const browserGlobal = globalThis as typeof globalThis & {
  process?: BrowserProcess;
};

browserGlobal.process = {
  ...browserGlobal.process,
  env: {
    ...browserGlobal.process?.env,
    NODE_ENV: 'test',
  },
};

// Mock the external Sentry SDK so client-safe wrappers can import without
// pulling Next router internals into the browser test runtime.
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

const VITEST_MOTION_STYLE_ID = 'vitest-motion-style';

const existingMotionStyle = document.getElementById(VITEST_MOTION_STYLE_ID);
if (existingMotionStyle && !(existingMotionStyle instanceof HTMLStyleElement)) {
  existingMotionStyle.remove();
}

const motionStyle =
  existingMotionStyle instanceof HTMLStyleElement
    ? existingMotionStyle
    : document.createElement('style');

motionStyle.id = VITEST_MOTION_STYLE_ID;
motionStyle.textContent = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

if (!motionStyle.isConnected) {
  document.head.appendChild(motionStyle);
}
