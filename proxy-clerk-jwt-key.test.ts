import { generateKeyPairSync } from 'node:crypto';
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyInvocation } from '@/tests/shared/next-proxy-invocation';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

// Runs the proxy once through a stubbed Clerk middleware and returns the key
// the proxy handed it.
async function jwtKeyHandedToClerk(): Promise<string | undefined> {
  process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';
  const handed: { jwtKey?: string }[] = [];
  vi.doMock('@clerk/nextjs/server', () => ({
    clerkMiddleware: (_handler: unknown, options: { jwtKey?: string }) => {
      handed.push(options);
      return async () => NextResponse.next();
    },
    createRouteMatcher: () => () => true,
  }));
  const { default: proxy } = await import('./proxy');

  await proxy(...proxyInvocation());

  return handed[0]?.jwtKey;
}

// DEBT-503 item 5: with Clerk's signing key configured, the middleware
// verifies session tokens without fetching keys from Clerk's Backend API.
describe("the proxy's Clerk JWT key", () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('hands Clerk the configured key, with its newlines restored', async () => {
    const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString()
      .trim();
    process.env.CLERK_JWT_KEY = pem.replaceAll('\n', '\\n');

    expect(await jwtKeyHandedToClerk()).toBe(pem);
  });

  it('hands Clerk no key when none is configured', async () => {
    delete process.env.CLERK_JWT_KEY;

    expect(await jwtKeyHandedToClerk()).toBeUndefined();
  });

  it('logs an unreadable key and lets Clerk fetch its keys as before', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CLERK_JWT_KEY = 'not a key';

    expect(await jwtKeyHandedToClerk()).toBeUndefined();
    expect(logged).toHaveBeenCalledWith({
      event: 'clerk_jwt_key_unreadable',
      reason: 'CLERK_JWT_KEY is not a public key in PEM form',
    });
  });
});
