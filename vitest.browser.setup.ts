import type { ReactNode } from 'react';
import { createElement } from 'react';
import { vi } from 'vitest';
import 'vitest-browser-react';

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
