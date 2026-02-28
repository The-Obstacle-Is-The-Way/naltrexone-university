// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('app/sign-in/[[...sign-in]]', () => {
  let SignInPage: typeof import('@/app/sign-in/[[...sign-in]]/page')['default'];

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });
    SignInPage = (await import('@/app/sign-in/[[...sign-in]]/page')).default;
  });

  afterAll(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a fallback UI when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk import would fail', () => {
    const html = renderToStaticMarkup(<SignInPage />);

    expect(html).toContain('Sign In');
    expect(html).toContain('Authentication unavailable in this environment.');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain(
      'class="text-xl font-semibold font-heading tracking-tight text-foreground"',
    );
  });
});
