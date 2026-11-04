import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeRateLimiter } from '@/src/application/test-helpers/fakes';
import {
  cookieHeaderAsClerkReadsIt,
  cookieHeaderWithoutRefresh,
  countClerkBackendCalls,
  withoutRefreshCookies,
} from './clerk-backend-call-limit';

vi.mock('server-only', () => ({}));

// DEBT-503 item 4: Clerk refreshes an expired session only with its refresh
// cookie, so a GET the limiter did not count reaches Clerk without one.
describe('cookieHeaderWithoutRefresh', () => {
  it.each([
    [
      'a suffixed refresh cookie',
      '__session=t; __refresh_abc=r; __client_uat=1',
      '__session=t; __client_uat=1',
    ],
    ['the first cookie', '__refresh_abc=r; __session=t', ' __session=t'],
    ['the last cookie', '__session=t; __refresh_abc=r', '__session=t;'],
    [
      'every refresh cookie, with duplicates and other suffixes',
      '__refresh_abc=r; __session=t; __refresh_abc=s; __refresh=u; __refresh_decoy=v',
      ' __session=t;',
    ],
    [
      'a name with spaces and tabs around it',
      ' \t__refresh_abc =r;__session=t',
      '__session=t',
    ],
    ['a pair after a segment without "="', 'x; __refresh_abc=r; y=1', 'x; y=1'],
  ])('removes %s', (_case, header, expected) => {
    expect(cookieHeaderWithoutRefresh(header)).toBe(expected);
  });

  it.each([
    ['a refresh name inside a value', 'a=__refresh_abc=r; __session=t'],
    [
      'a percent-encoded pair inside a value',
      'a=x%3B%20__refresh_abc%3Dr; __session=t',
    ],
    ['a header without a refresh cookie', '__session=t; __client_uat=1'],
  ])('leaves %s byte for byte', (_case, header) => {
    expect(cookieHeaderWithoutRefresh(header)).toBe(header);
  });

  it('leaves every other cookie as Clerk reads it, across generated headers', () => {
    for (const header of generatedCookieHeaders(GENERATED_HEADERS)) {
      const kept = new Map(
        [...cookieHeaderAsClerkReadsIt(header)].filter(
          ([name]) => !name.startsWith('__refresh'),
        ),
      );

      expect(
        cookieHeaderAsClerkReadsIt(cookieHeaderWithoutRefresh(header)),
        header,
      ).toEqual(kept);
    }
  });
});

describe('withoutRefreshCookies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands Clerk a GET without its refresh cookies, at the same URL and with its other headers', () => {
    const request = new NextRequest(
      'https://example.com/app/practice?mode=tutor',
      {
        headers: {
          cookie: '__session=t; __refresh_abc=r; __client_uat=1',
          accept: 'text/html',
        },
      },
    );

    const forClerk = withoutRefreshCookies(request);

    expect(forClerk.headers.get('cookie')).toBe('__session=t; __client_uat=1');
    expect(forClerk.method).toBe('GET');
    expect(forClerk.nextUrl.pathname).toBe('/app/practice');
    expect(forClerk.nextUrl.searchParams.get('mode')).toBe('tutor');
    expect(forClerk.headers.get('accept')).toBe('text/html');
  });

  it('drops the cookie header when a refresh cookie was all it held', () => {
    const request = new NextRequest('https://example.com/app/dashboard', {
      headers: { cookie: '__refresh_abc=r' },
    });

    expect(withoutRefreshCookies(request).headers.has('cookie')).toBe(false);
  });

  // It runs on nearly every signed-in production request, so a runtime that
  // refuses the copy leaves the request as it came instead of failing it, and
  // says so: Clerk can then refresh what the limiter did not count.
  it('hands Clerk the request as it came, logs and reports, when the copy fails', () => {
    const errored = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = vi.fn();
    const request = new NextRequest('https://example.com/app/dashboard', {
      headers: { cookie: '__session=t; __refresh_abc=r' },
    });

    const forClerk = withoutRefreshCookies(request, failed, () => {
      throw new Error('copy refused');
    });

    expect(forClerk).toBe(request);
    expect(errored).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'clerk_refresh_cookie_strip_failed' }),
    );
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('reports no failure when the copy succeeds', () => {
    const failed = vi.fn();
    const request = new NextRequest('https://example.com/app/dashboard', {
      headers: { cookie: '__session=t; __refresh_abc=r' },
    });

    withoutRefreshCookies(request, failed);

    expect(failed).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a POST',
      new NextRequest('https://example.com/app/dashboard', {
        method: 'POST',
        headers: { cookie: '__session=t; __refresh_abc=r' },
      }),
    ],
    [
      'a GET without a refresh cookie',
      new NextRequest('https://example.com/app/dashboard', {
        headers: { cookie: '__session=t' },
      }),
    ],
    ['a GET without cookies', new NextRequest('https://example.com/')],
  ])('hands Clerk %s as it came', (_case, request) => {
    expect(withoutRefreshCookies(request)).toBe(request);
  });
});

describe('countClerkBackendCalls', () => {
  const NOW_SECONDS = Math.floor(Date.now() / 1000);
  const token = (exp: number) => {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'RS256' })}.${part({ exp, sid: 'sess_a' })}.signature`;
  };
  const refreshing = (exp: number) =>
    new NextRequest('https://example.com/app/dashboard', {
      headers: {
        cookie: `__session=${token(exp)}; __refresh_abc=r`,
        'x-vercel-forwarded-for': '203.0.113.7',
      },
    });
  const count = (request: NextRequest, limiter: FakeRateLimiter) => {
    const report = vi.fn();
    return {
      report,
      verdict: countClerkBackendCalls(request, async () => limiter, report),
    };
  };

  it('is uncounted when nothing in the request makes Clerk call its Backend API, and loads no limiter', async () => {
    const limiter = new FakeRateLimiter();

    await expect(
      count(refreshing(NOW_SECONDS + 60), limiter).verdict,
    ).resolves.toBe('uncounted');
    expect(limiter.inputs).toEqual([]);
  });

  it('is counted when every limit lets a refresh through', async () => {
    const limiter = new FakeRateLimiter();

    await expect(
      count(refreshing(NOW_SECONDS - 60), limiter).verdict,
    ).resolves.toBe('counted');
    expect(limiter.inputs.length).toBeGreaterThan(0);
  });

  it('is the 429 when a limit refuses a refresh', async () => {
    const verdict = await count(
      refreshing(NOW_SECONDS - 60),
      new FakeRateLimiter([
        { success: false, limit: 30, remaining: 0, retryAfterSeconds: 42 },
      ]),
    ).verdict;

    expect(verdict).toBeInstanceOf(Response);
    expect((verdict as Response).status).toBe(429);
  });

  it('fails open when the limiter fails, and reports it', async () => {
    const { verdict, report } = count(
      refreshing(NOW_SECONDS - 60),
      new FakeRateLimiter([new Error('database down')]),
    );

    await expect(verdict).resolves.toBe('failed-open');
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'clerk_backend_call_limiter_failed' }),
    );
  });
});

const GENERATED_HEADERS = 2_000;
const PAIRS_PER_HEADER = 6;
const SEGMENT_WITHOUT_EQUALS_SHARE = 0.2;

// Cookie headers built from the shapes Clerk's parser treats specially:
// names with spaces and tabs around them, duplicates, values holding "=",
// percent-encoding or a whole refresh pair, and segments without "=". A
// seeded generator keeps the run the same every time.
function generatedCookieHeaders(count: number): string[] {
  let seed = 1;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;
  const names = [
    '__session',
    '__session_abc',
    '__refresh_abc',
    '__refresh',
    ' __refresh_abc',
    '\t__client_uat',
    'a',
  ];
  const values = [
    '',
    'v',
    '=',
    '%3B',
    'x%3B%20__refresh_abc%3Dr',
    '__refresh_abc=r',
    ' v ',
  ];
  const separators = [';', '; ', ';\t', ' ; '];
  const segmentsWithoutEquals = ['x', ' ', ''];
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + Math.floor(random() * PAIRS_PER_HEADER) }, () =>
      random() < SEGMENT_WITHOUT_EQUALS_SHARE
        ? pick(segmentsWithoutEquals)
        : `${pick(names)}=${pick(values)}`,
    ).join(pick(separators)),
  );
}
