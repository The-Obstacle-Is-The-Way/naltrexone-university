import { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from './tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

type AuthBoundary = (
  auth: { protect: () => Promise<void> },
  request: NextRequest,
) => Promise<void>;

describe('security contact proxy boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    restoreProcessEnv(ORIGINAL_ENV);
    vi.doUnmock('@clerk/nextjs/server');
    vi.resetModules();
  });

  it.each([
    '/.well-known/security.txt',
    '/robots.txt',
    '/sitemap.xml',
    '/opengraph-image',
  ])(
    'serves %s without initializing Clerk or its dev-browser handshake',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
      vi.doMock('@clerk/nextjs/server', () => {
        throw new Error(
          'Clerk must not initialize for this static public resource',
        );
      });
      const { default: proxy } = await import('./proxy');
      const request = new NextRequest(`https://example.com${path}`);
      const event = new NextFetchEvent({
        request,
        page: '/proxy',
        context: undefined,
      });

      const response = await proxy(request, event);

      expect(response?.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it.each([
    ['/.well-known/security.txt', false],
    ['/.well-known/security.txt?source=disclosure', false],
    ['/robots.txt', false],
    ['/sitemap.xml', false],
    ['/sitemap.xml?source=crawler', false],
    ['/opengraph-image', false],
    ['/opengraph-image/extra', true],
    ['/opengraph-image-private', true],
    ['/app/dashboard', true],
    ['/sitemap.xml.backup', true],
    ['/sitemap.xml/extra', true],
    ['/other.xml', true],
    ['/robots.txt.backup', true],
    ['/.well-known/other.txt', true],
    ['/.well-known/security.txt.backup', true],
    ['/.well-known/security.txt/extra', true],
    ['/xwell-known/securityXtxt', true],
  ])('protects %s: %s', async (path, protectedRoute) => {
    vi.stubEnv('NEXT_PUBLIC_SKIP_CLERK', 'false');
    const protect = vi.fn(async () => undefined);
    // Only the external auth transport is stubbed. Route classification uses
    // the installed Clerk matcher and the production proxy/public-route list.
    vi.doMock('@clerk/nextjs/server', async () => {
      const actual = await vi.importActual<
        typeof import('@clerk/nextjs/server')
      >('@clerk/nextjs/server');
      return {
        ...actual,
        clerkMiddleware:
          (callback: AuthBoundary) => async (request: NextRequest) => {
            await callback({ protect }, request);
            return NextResponse.next();
          },
      };
    });
    const { default: proxy } = await import('./proxy');
    const request = new NextRequest(`https://example.com${path}`);
    const event = new NextFetchEvent({
      request,
      page: '/proxy',
      context: undefined,
    });

    await proxy(request, event);

    expect(protect).toHaveBeenCalledTimes(protectedRoute ? 1 : 0);
  });
});
