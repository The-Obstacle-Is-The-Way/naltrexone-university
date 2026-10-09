import { describe, expect, it } from 'vitest';
import {
  ClerkAuthTrace,
  describeClerkCookies,
  describeNavigationAnswer,
  isSignInUrl,
} from './clerk-auth-trace';

// BUG-330: a signed-in test that lands on sign-in prints how it got there,
// from Clerk's own reasons, without a token, so the next mid-run loss names
// its cause.
const jwt = (payload: object) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'c2lnbmF0dXJlLXZhbHVl',
  ].join('.');

describe('describeNavigationAnswer', () => {
  it("names Clerk's auth status and reason, and a handshake redirect's reason and loop count", () => {
    expect(
      describeNavigationAnswer({
        method: 'GET',
        url: 'http://127.0.0.1:3000/app/practice?mode=tutor',
        status: 307,
        headers: {
          'x-clerk-auth-status': 'handshake',
          'x-clerk-auth-reason': 'session-token-expired-refresh-non-eligible',
          location:
            'https://clerk.example.test/v1/client/handshake?redirect_url=x&__clerk_hs_reason=session-token-expired&__clerk_db_jwt=dvb_secretvalue123',
          'set-cookie':
            '__clerk_redirect_count=1; Max-Age=2\n__session=; Max-Age=0\n__client_uat=1791560000; Path=/',
        },
      }),
    ).toBe(
      'GET 127.0.0.1:3000/app/practice 307 auth=handshake/session-token-expired-refresh-non-eligible → clerk.example.test/v1/client/handshake hs_reason=session-token-expired params=redirect_url,__clerk_hs_reason,__clerk_db_jwt; cookies: __clerk_redirect_count=1, __session cleared, __client_uat=1791560000',
    );
  });

  it('keeps an ordinary answer to its method, place and status', () => {
    expect(
      describeNavigationAnswer({
        method: 'GET',
        url: 'http://127.0.0.1:3000/app/dashboard?__clerk_db_jwt=dvb_secretvalue123',
        status: 200,
        headers: { 'x-clerk-auth-status': 'signed-in' },
      }),
    ).toBe('GET 127.0.0.1:3000/app/dashboard 200 auth=signed-in');
  });
});

describe('describeClerkCookies', () => {
  it("names the session token's times and kind of session, never the token", () => {
    const description = describeClerkCookies([
      {
        name: '__session',
        value: jwt({
          iat: 1791560000,
          exp: 1791560060,
          sid: 'sess_2abcDEF345',
        }),
      },
      { name: '__client_uat', value: '1791559990' },
      { name: '__clerk_db_jwt', value: 'dvb_secretvalue123' },
      { name: 'theme', value: 'dark' },
    ]);

    expect(description).toBe(
      '__session iat=1791560000 exp=1791560060 sid=sess_…; __client_uat=1791559990; __clerk_db_jwt present',
    );
    expect(description).not.toContain('dvb_');
    expect(description).not.toContain('eyJ');
  });

  it('says when there is no session token at all', () => {
    expect(describeClerkCookies([{ name: '__client_uat', value: '0' }])).toBe(
      'no __session; __client_uat=0',
    );
  });
});

describe('isSignInUrl', () => {
  it.each([
    ['http://127.0.0.1:3000/sign-in?redirect_url=%2Fapp', true],
    ['https://example.accounts.dev/sign-in?redirect_url=x', true],
    ['http://127.0.0.1:3000/app/dashboard', false],
    ['about:blank', false],
  ])('%s is %s', (url, expected) => {
    expect(isSignInUrl(url)).toBe(expected);
  });
});

describe('ClerkAuthTrace', () => {
  it('reports its answers and Clerk session changes in order, with the cookies, once', () => {
    let now = 1_000;
    const trace = new ClerkAuthTrace(() => now);
    trace.noteAnswer('GET 127.0.0.1:3000/app/practice 200 auth=signed-in');
    now = 1_250;
    trace.noteClerkEvent({ session: false, status: 'ready' });
    now = 1_300;
    trace.noteAnswer(
      'GET 127.0.0.1:3000/app/practice 307 auth=signed-out/session-token-and-uat-missing',
    );

    const report = trace.report('__session absent');

    expect(report).toEqual([
      '+0ms GET 127.0.0.1:3000/app/practice 200 auth=signed-in',
      '+250ms Clerk JS: signed out (status ready)',
      '+300ms GET 127.0.0.1:3000/app/practice 307 auth=signed-out/session-token-and-uat-missing',
      'cookies: __session absent',
    ]);
    expect(trace.report('again')).toBeNull();
  });

  it('keeps only its most recent entries', () => {
    const trace = new ClerkAuthTrace(() => 0, 2);
    trace.noteAnswer('first');
    trace.noteAnswer('second');
    trace.noteAnswer('third');

    expect(trace.report('c')).toEqual([
      '+0ms second',
      '+0ms third',
      'cookies: c',
    ]);
  });
});
