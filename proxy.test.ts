import type { NextFetchEvent, NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

describe('proxy middleware', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('can be imported when NEXT_PUBLIC_SKIP_CLERK=true even if Clerk server import would fail', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    await expect(import('./proxy')).resolves.toBeDefined();
  });

  it('returns NextResponse.next() when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    vi.doMock('@clerk/nextjs/server', () => {
      throw new Error('Publishable key not valid.');
    });

    const { default: middleware } = await import('./proxy');

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );
    expect(res).toBeDefined();
  });

  it('ignores NEXT_PUBLIC_SKIP_CLERK=true in production and still protects routes', async () => {
    vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'true');
    vi.stubEnv('NODE_ENV', 'production');

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(clerkMiddleware).toHaveBeenCalledTimes(1);
    expect(protect).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('ok');
  });

  it('initializes and caches clerkMiddleware when NEXT_PUBLIC_SKIP_CLERK is not true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const first = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );
    const second = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!first || !second) {
      throw new Error('Expected middleware to return a response');
    }

    expect(clerkMiddleware).toHaveBeenCalledTimes(1);
    expect(createRouteMatcher).toHaveBeenCalledTimes(1);
    expect(protect).toHaveBeenCalledTimes(2);
    expect(await first.text()).toBe('ok');
    expect(await second.text()).toBe('ok');
  });

  it('returns configured Clerk CSP directives when NEXT_PUBLIC_SKIP_CLERK is false', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    let capturedOptions: unknown;
    const clerkMiddleware = vi.fn(
      (cb: ClerkMiddlewareCallback, options?: unknown) => {
        capturedOptions = options;
        return vi.fn(async (req: unknown) => {
          await cb({ protect }, req);
          return new Response('ok');
        });
      },
    );
    const createRouteMatcher = vi.fn(() => () => false);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    // Act
    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    // Assert
    expect(capturedOptions).toMatchObject({
      contentSecurityPolicy: {
        directives: expect.objectContaining({
          'base-uri': expect.arrayContaining(['self']),
          'connect-src': expect.arrayContaining(['ws:', 'wss:']),
          'frame-ancestors': expect.arrayContaining(['none']),
          'object-src': expect.arrayContaining(['none']),
        }),
      },
    });
  });

  it('does not call auth.protect for public routes', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    type ClerkMiddlewareCallback = (
      auth: { protect: () => Promise<void> },
      request: unknown,
    ) => Promise<void> | void;

    const protect = vi.fn(async () => undefined);
    const clerkMiddleware = vi.fn((cb: ClerkMiddlewareCallback) =>
      vi.fn(async (req: unknown) => {
        await cb({ protect }, req);
        return new Response('ok');
      }),
    );
    const createRouteMatcher = vi.fn(() => () => true);

    vi.doMock('@clerk/nextjs/server', () => ({
      clerkMiddleware,
      createRouteMatcher,
    }));

    const { default: middleware } = await import('./proxy');

    const res = await middleware(
      {} as unknown as NextRequest,
      {} as unknown as NextFetchEvent,
    );

    if (!res) {
      throw new Error('Expected middleware to return a response');
    }

    expect(protect).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ok');
  });
});
