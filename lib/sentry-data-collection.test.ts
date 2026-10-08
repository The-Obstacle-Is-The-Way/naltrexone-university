import { describe, expect, it } from 'vitest';
import {
  redactCredentialParams,
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
  scrubServerEvent,
  scrubSpan,
} from './sentry-data-collection';

// DEBT-499: Sentry v11 collects cookies, user info, request and response
// bodies, unscrubbed headers and database query data when `dataCollection` is
// unset. Every category is set here, at least as strictly as v10's default.
describe('SENTRY_DATA_COLLECTION', () => {
  it('collects no user info, cookies, bodies, database query data, queue arguments, GenAI or GraphQL content', () => {
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    });
  });

  it.each([
    ['request headers', SENTRY_DATA_COLLECTION.httpHeaders],
    ['URL query parameters', SENTRY_DATA_COLLECTION.urlQueryParams],
  ])(
    'denies forwarding and IP terms, as v10 did, and credential carriers in %s',
    (_, behavior) => {
      const deny =
        behavior && typeof behavior === 'object' && 'request' in behavior
          ? behavior.request
          : behavior;

      expect(deny).toEqual({
        deny: expect.arrayContaining([
          'forwarded',
          '-ip',
          'remote-',
          'via',
          '-user',
          '__clerk',
          'x-clerk',
          'signature',
          'referer',
          'prerender',
          'proxied',
        ]),
      });
    },
  );

  it('applies the same header deny list to responses', () => {
    const headers = SENTRY_DATA_COLLECTION.httpHeaders;

    expect(headers).toMatchObject({
      response:
        headers && typeof headers === 'object' && 'request' in headers
          ? headers.request
          : undefined,
    });
  });
});

// BUG-318: URLs held outside the query-string field are not filtered by the
// SDK, so credential parameters are redacted in them before sending.
describe('redactCredentialParams', () => {
  it.each([
    [
      '/app?__clerk_handshake=eyJx&tab=questions',
      '/app?__clerk_handshake=[Filtered]&tab=questions',
    ],
    [
      'https://clerk.example/v1/client?__clerk_db_jwt=eyJx',
      'https://clerk.example/v1/client?__clerk_db_jwt=[Filtered]',
    ],
    [
      'https://x.test/cb?code=abc&state=s&session_id=cs_1',
      'https://x.test/cb?code=[Filtered]&state=s&session_id=[Filtered]',
    ],
    ['__dev_session=abc&plan=annual', '__dev_session=[Filtered]&plan=annual'],
    // BUG-331: Clerk's handshake exchange carries the nonce in clear.
    [
      'https://api.clerk.com/v1/clients/handshake_payload?nonce=n1',
      'https://api.clerk.com/v1/clients/handshake_payload?nonce=[Filtered]',
    ],
    ['/app/history?tab=questions', '/app/history?tab=questions'],
    ['https://x.test/path#token=abc', 'https://x.test/path#token=abc'],
  ])('redacts %s as %s', (input, expected) => {
    expect(redactCredentialParams(input)).toBe(expected);
  });

  // A beforeSend that throws loses the error event: a malformed parameter
  // name must not stop the redaction.
  it('redacts around a parameter name that is not valid URL encoding', () => {
    expect(
      redactCredentialParams('/app?bad%=1&token=secret&ok%zz_token=x'),
    ).toBe('/app?bad%=1&token=[Filtered]&ok%zz_token=[Filtered]');
  });
});

// BUG-318: the browser SDK puts the page URL on the event, and breadcrumbs
// carry fetch, XHR and navigation URLs; the SDK's query filter reaches none.
describe('scrubEvent', () => {
  type ErrorEvent = Parameters<typeof scrubEvent>[0];

  it("redacts credentials in the event's URL, query string and Next.js request path", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://addictionboards.com/app?__clerk_db_jwt=eyJx&tab=questions',
        query_string: '__clerk_db_jwt=eyJx&tab=questions',
      },
      contexts: { nextjs: { request_path: '/app?__clerk_handshake=eyJy' } },
    };

    expect(scrubEvent(event)).toMatchObject({
      request: {
        url: 'https://addictionboards.com/app?__clerk_db_jwt=[Filtered]&tab=questions',
        query_string: '__clerk_db_jwt=[Filtered]&tab=questions',
      },
      contexts: {
        nextjs: { request_path: '/app?__clerk_handshake=[Filtered]' },
      },
    });
  });

  it('leaves an event without a request or Next.js context unchanged', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };

    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('leaves a breadcrumb without data unchanged', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'hi' })).toEqual({
      category: 'console',
      message: 'hi',
    });
  });

  it('redacts credentials in a breadcrumb URL, origin and destination', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: {
          url: '/x?token=a',
          from: '/sign-in?__clerk_handshake=b',
          to: '/app?__dev_session=c&tab=1',
          status_code: 200,
        },
      }),
    ).toEqual({
      category: 'navigation',
      data: {
        url: '/x?token=[Filtered]',
        from: '/sign-in?__clerk_handshake=[Filtered]',
        to: '/app?__dev_session=[Filtered]&tab=1',
        status_code: 200,
      },
    });
  });

  // BUG-331: the server SDK also keeps the query in `url.query`. Every string
  // is redacted, so a field the SDK adds later is covered too.
  // A console breadcrumb holds the line twice: its arguments, and joined as
  // its message. In free text a value runs to the end, so more than the
  // value can be filtered; that errs toward sending less.
  it("redacts credentials in a console line's message and its arguments alike", () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        message: 'redirect to /cb?code=abc 3',
        data: { arguments: ['redirect to /cb?code=abc', 3], logger: 'console' },
      }),
    ).toEqual({
      category: 'console',
      message: 'redirect to /cb?code=[Filtered]',
      data: {
        arguments: ['redirect to /cb?code=[Filtered]', 3],
        logger: 'console',
      },
    });
  });

  // A console line can log an object; its breadcrumb keeps that object. The
  // copy is redacted, never the app's own object.
  it("redacts credentials nested in a logged object's copy, leaving the object itself unchanged", () => {
    const logged: Record<string, unknown> = {
      url: '/cb?code=abc',
      nested: { next: '/x?token=t', plain: 'kept' },
    };
    logged.self = logged;

    const scrubbed = scrubBreadcrumb({
      category: 'console',
      data: { arguments: [logged, 'plain'], logger: 'console' },
    });

    expect(scrubbed.data?.arguments).toEqual([
      {
        url: '/cb?code=[Filtered]',
        nested: { next: '/x?token=[Filtered]', plain: 'kept' },
        self: '[Circular]',
      },
      'plain',
    ]);
    expect(logged.url).toBe('/cb?code=abc');
    expect((logged.nested as { next: string }).next).toBe('/x?token=t');
  });

  it('redacts an object logged twice in both places, not as a cycle', () => {
    const shared = { url: '/a?token=t' };

    expect(
      scrubBreadcrumb({
        category: 'console',
        data: { arguments: [shared, shared] },
      }).data?.arguments,
    ).toEqual([{ url: '/a?token=[Filtered]' }, { url: '/a?token=[Filtered]' }]);
  });

  it("redacts credentials in every string of a breadcrumb's data", () => {
    expect(
      scrubBreadcrumb({
        category: 'http',
        data: {
          url: 'https://api.clerk.com/v1/clients/handshake_payload?nonce=a',
          'url.query': 'nonce=a&tab=1',
          'http.request.method': 'GET',
          status_code: 200,
        },
      }),
    ).toEqual({
      category: 'http',
      data: {
        url: 'https://api.clerk.com/v1/clients/handshake_payload?nonce=[Filtered]',
        'url.query': 'nonce=[Filtered]&tab=1',
        'http.request.method': 'GET',
        status_code: 200,
      },
    });
  });
});

// BUG-331: the server records no breadcrumbs, and drops any a scope added
// directly, before its usual scrubbing.
describe('scrubServerEvent', () => {
  type ErrorEvent = Parameters<typeof scrubServerEvent>[0];

  it('drops breadcrumbs and redacts the URL as scrubEvent does', () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [{ category: 'checkout', message: 'user_1' }],
      request: { url: 'https://addictionboards.com/app?nonce=n1' },
    };

    expect(scrubServerEvent(event)).toEqual({
      type: undefined,
      request: { url: 'https://addictionboards.com/app?nonce=[Filtered]' },
    });
  });
});

// BUG-331: Next.js's request span keeps the raw URL in `http.target`, which
// Sentry's query filter does not reach.
describe('scrubSpan', () => {
  type Span = Parameters<typeof scrubSpan>[0];

  it("redacts credentials in a span's name and every string attribute", () => {
    const span: Span = {
      trace_id: 't',
      span_id: 's',
      name: 'GET /pricing?nonce=n1',
      start_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {
        'http.target': '/pricing?__clerk_handshake=h&code=c&plan=annual',
        'http.request.header.x-test': ['/a?token=t'],
        'http.status_code': 200,
      },
      links: [
        {
          trace_id: 't',
          span_id: 'l',
          attributes: { 'link.url': '/cb?code=c' },
        },
      ],
    };

    expect(scrubSpan(span)).toMatchObject({
      name: 'GET /pricing?nonce=[Filtered]',
      attributes: {
        'http.target':
          '/pricing?__clerk_handshake=[Filtered]&code=[Filtered]&plan=annual',
        'http.request.header.x-test': ['/a?token=[Filtered]'],
        'http.status_code': 200,
      },
      links: [{ attributes: { 'link.url': '/cb?code=[Filtered]' } }],
    });
  });
});
