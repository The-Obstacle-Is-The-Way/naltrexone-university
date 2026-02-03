import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

describe('proxy middleware', () => {
  afterEach(() => {
    restoreEnv();
    vi.unmock('@clerk/nextjs/server');
    vi.unmock('next/server');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not initialize Clerk middleware when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware: () => {
        throw new Error(
          'clerkMiddleware must not be called when skipClerk=true',
        );
      },
      createRouteMatcher: () => () => true,
    }));

    vi.doMock('next/server', () => ({
      NextResponse: { next: () => ({ ok: true }) },
    }));

    const proxyModule = await import('./proxy');
    expect(typeof proxyModule.default).toBe('function');

    const result = await proxyModule.default({} as never, {} as never);
    expect(result).toEqual({ ok: true });
  });
});
