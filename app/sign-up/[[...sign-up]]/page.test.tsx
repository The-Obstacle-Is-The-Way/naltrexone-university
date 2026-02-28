// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('app/sign-up/[[...sign-up]]', () => {
  let SignUpPage: typeof import('@/app/sign-up/[[...sign-up]]/page')['default'];

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });
    SignUpPage = (await import('@/app/sign-up/[[...sign-up]]/page')).default;
  });

  afterAll(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a fallback UI when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk import would fail', () => {
    const html = renderToStaticMarkup(<SignUpPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headingClass = doc.querySelector('h1')?.getAttribute('class') ?? '';

    expect(html).toContain('Sign Up');
    expect(html).toContain('Authentication unavailable in this environment.');
    expect(html).toContain('<main id="main-content"');
    expect(headingClass).toContain('text-xl');
    expect(headingClass).toContain('font-semibold');
    expect(headingClass).toContain('font-heading');
    expect(headingClass).toContain('tracking-tight');
    expect(headingClass).toContain('text-foreground');
  });
});
