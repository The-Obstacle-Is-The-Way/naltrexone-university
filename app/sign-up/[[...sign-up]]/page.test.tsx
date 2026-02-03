// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('app/sign-up/[[...sign-up]]', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders a fallback UI when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk import would fail', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Publishable key not valid.');
    });

    const SignUpPage = (await import('@/app/sign-up/[[...sign-up]]/page'))
      .default;
    const html = renderToStaticMarkup(<SignUpPage />);

    expect(html).toContain('Sign Up');
    expect(html).toContain('Authentication unavailable in this environment.');
  });
});
