import { describe, expect, it } from 'vitest';
import {
  ClerkAuthTrace,
  clerkFrontendApiHost,
  describeClerkCookies,
  describeNavigationAnswer,
  isSignInUrl,
} from './clerk-auth-trace';

// BUG-333: a signed-in test that lands on sign-in prints how it got there,
// from Clerk's own reasons, without a token, so the next mid-run loss names
// its cause.
const jwt = (payload: object) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'c2lnbmF0dXJlLXZhbHVl',
  ].join('.');

describe('describeNavigationAnswer', () => {
  it("names Clerk's decision and redirect without cookie values", () => {
    expect(
      describeNavigationAnswer({
        method: 'GET',
        url: 'http://127.0.0.1:3000/app/practice?mode=tutor',
        status: 307,
        headers: {
          'x-clerk-auth-status': 'handshake',
          'x-clerk-auth-reason':
            'session-token-expired-refresh-non-eligible-no-refresh-cookie',
          location:
            'https://example-12.clerk.accounts.dev/v1/client/handshake?redirect_url=x&__clerk_hs_reason=session-token-expired&__clerk_db_jwt=dvb_secretvalue123',
          'set-cookie':
            '__clerk_redirect_count=1; Max-Age=2\n__session=; Max-Age=0\n__client_uat=1791560000; Path=/',
        },
      }),
    ).toBe(
      'GET 127.0.0.1:3000/app/practice 307 auth=handshake/session-token-expired-refresh-non-eligible-no-refresh-cookie → example-12.clerk.accounts.dev/v1/client/handshake hs_reason=session-token-expired params=redirect_url,__clerk_hs_reason,__clerk_db_jwt; cookies: __clerk_redirect_count=1, __session cleared, __client_uat=1791560000',
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

  it('reduces a decision Clerk does not define to its length', () => {
    const description = describeNavigationAnswer({
      method: 'GET',
      url: 'http://127.0.0.1:3000/app/practice',
      status: 307,
      headers: {
        'x-clerk-auth-status': 'private-looking-value',
        'x-clerk-auth-reason': 'another-private-value',
        location:
          'https://example.accounts.dev/sign-in?__clerk_hs_reason=shaped-like-a-reason',
      },
    });
    expect(description).toContain('auth length=21');
    expect(description).toContain('reason length=21');
    expect(description).toContain('hs_reason length=20');
    expect(description).not.toContain('private-looking-value');
    expect(description).not.toContain('another-private-value');
    expect(description).not.toContain('shaped-like-a-reason');
  });

  it('keeps query secrets and malformed handshake reasons out of the trace', () => {
    const description = describeNavigationAnswer({
      method: 'GET',
      url: 'http://localhost/app',
      status: 307,
      headers: {
        location:
          'https://example.accounts.dev/sign-in?__clerk_hs_reason=private%20value&token=another-value',
      },
    });
    expect(description).toContain('params=__clerk_hs_reason,token');
    expect(description).not.toContain('private value');
    expect(description).not.toContain('another-value');
  });
});

describe('describeNavigationAnswer for another site', () => {
  // A third-party path can carry an ID, such as Stripe Checkout's Session, so
  // only the app's and Clerk's paths are kept.
  it('names only the host of a page outside the app and Clerk', () => {
    expect(
      describeNavigationAnswer({
        method: 'GET',
        url: 'https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4e5#fidkdW',
        status: 200,
        headers: {},
      }),
    ).toBe('GET checkout.stripe.com 200');
  });

  it("keeps the path of Clerk's hosted pages", () => {
    expect(
      describeNavigationAnswer({
        method: 'GET',
        url: 'https://example-12.accounts.dev/sign-in?redirect_url=x',
        status: 200,
        headers: {},
      }),
    ).toBe('GET example-12.accounts.dev/sign-in 200');
  });
});

describe('describeClerkCookies', () => {
  it('never prints cookie values even when they are not recognizable tokens', () => {
    const description = describeClerkCookies([
      { name: '__client_uat', value: 'arbitrary-secret' },
      { name: '__session', value: 'session-secret' },
    ]);
    expect(description).not.toContain('arbitrary-secret');
    expect(description).toContain('__client_uat length=16');
    const navigation = describeNavigationAnswer({
      method: 'GET',
      url: 'http://localhost/app',
      status: 200,
      headers: {
        'set-cookie':
          '__client_uat=arbitrary-secret; Path=/\n__clerk_redirect_count=another-secret; Path=/',
      },
    });
    expect(navigation).not.toContain('arbitrary-secret');
    expect(navigation).not.toContain('another-secret');
  });
  it('names credential cookies and lengths while preserving allowed times', () => {
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
      `__session length=${jwt({ iat: 1791560000, exp: 1791560060, sid: 'sess_2abcDEF345' }).length} iat=1791560000 exp=1791560060; __client_uat=1791559990; __clerk_db_jwt length=18`,
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

describe('clerkFrontendApiHost', () => {
  const publishableKey = (decoded: string) =>
    `pk_test_${Buffer.from(decoded).toString('base64')}`;

  // clerkSetup() sets CLERK_FAPI only in the setup project's worker; test
  // workers load the publishable key with Playwright's config.
  it("reads Clerk's Frontend API host from the publishable key alone", () => {
    expect(
      clerkFrontendApiHost({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
          'clerk.example.test$',
        ),
      }),
    ).toBe('clerk.example.test');
  });

  it.each([
    ['no key', {}],
    [
      'a key without the closing $',
      {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey('clerk.example.test'),
      },
    ],
    [
      'a secret key',
      {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          'sk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA==',
      },
    ],
  ])('names no host for %s', (_case, env) => {
    expect(clerkFrontendApiHost(env)).toBeUndefined();
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
  it('reports a later sign-in after an alert, without repeating either at teardown', () => {
    const trace = new ClerkAuthTrace(() => 0);
    trace.noteAnswer('requestfailed POST localhost/app/questions/q');
    const outputs = [trace.report('none', 'failed-fetch alert')];
    trace.noteAnswer('GET example.accounts.dev/sign-in 200');
    outputs.push(trace.report('none', 'sign-in'));

    expect(outputs.filter(Boolean)).toHaveLength(2);
    expect(outputs[1]?.join('\n')).toContain(
      'GET example.accounts.dev/sign-in 200',
    );
    expect(trace.report('none', 'failed-fetch alert')).toBeNull();
    expect(trace.report('none', 'sign-in')).toBeNull();
    expect(trace.report('none', 'test failure')).toBeNull();
  });

  it('keeps event times when asynchronous header reads finish out of order', () => {
    let now = 100;
    const trace = new ClerkAuthTrace(() => now);
    now = 300;
    trace.noteAnswer('requestfailed', 250);
    trace.noteAnswer('Clerk API: GET /v1/client 200', 150);

    expect(trace.report('none')).toEqual([
      '+50ms Clerk API: GET /v1/client 200',
      '+150ms requestfailed',
      'cookies: none',
    ]);
  });

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
