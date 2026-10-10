import { describe, expect, it } from 'vitest';
import { withoutDevBrowserEcho } from './clerk-dev-browser-echo';

// BUG-333: Clerk's Frontend API echoes the dev-browser token it was sent in a
// `Clerk-Db-Jwt` header. Clerk JS rewrites its cookies on every echo, removing
// both copies before setting them, and a navigation during that rewrite is
// signed out. An echo carries nothing new, so tests drop it.
describe('withoutDevBrowserEcho', () => {
  const url =
    'https://example-12.clerk.accounts.dev/v1/client?__clerk_api_version=2025-11-10&__clerk_db_jwt=dvb_sentToken123';

  it('drops a header that echoes the token the request sent', () => {
    expect(
      withoutDevBrowserEcho(url, {
        'content-type': 'application/json',
        'clerk-db-jwt': 'dvb_sentToken123',
      }),
    ).toEqual({ 'content-type': 'application/json' });
  });

  it('keeps a header that carries a different token', () => {
    const headers = {
      'content-type': 'application/json',
      'clerk-db-jwt': 'dvb_rotatedToken456',
    };

    expect(withoutDevBrowserEcho(url, headers)).toEqual(headers);
  });

  it('keeps the headers of a request that sent no token', () => {
    const headers = { 'clerk-db-jwt': 'dvb_sentToken123' };

    expect(
      withoutDevBrowserEcho(
        'https://example-12.clerk.accounts.dev/v1/environment',
        headers,
      ),
    ).toEqual(headers);
  });
});
