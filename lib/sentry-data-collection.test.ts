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
    // A browser event's URL keeps its fragment, where an OAuth redirect can
    // put a token.
    [
      'https://x.test/path#access_token=abc',
      'https://x.test/path#access_token=[Filtered]',
    ],
    // BUG-331: in free text, a value ends at whitespace, so an earlier
    // harmless pair cannot hide a later credential.
    [
      'retry=2 handshake at /v1/client?__clerk_handshake=n',
      'retry=2 handshake at /v1/client?__clerk_handshake=[Filtered]',
    ],
    [
      'Error: Request failed status=401 at https://x.test/cb?nonce=s',
      'Error: Request failed status=401 at https://x.test/cb?nonce=[Filtered]',
    ],
    ['/cb?code=abc then more', '/cb?code=[Filtered] then more'],
    // A URL nested in a value, raw or encoded, is checked too.
    [
      'https://x.test/cb?redirect=/y?code=s',
      'https://x.test/cb?redirect=/y?code=[Filtered]',
    ],
    [
      'https://x.test/cb?redirect_url=https%3A%2F%2Fa.test%2Fb%3Fcode%3Ds&tab=1',
      'https://x.test/cb?redirect_url=[Filtered]&tab=1',
    ],
    [
      'https://x.test/cb?redirect_url=https%3A%2F%2Fa.test%2Fb%3Ftab%3D1',
      'https://x.test/cb?redirect_url=https%3A%2F%2Fa.test%2Fb%3Ftab%3D1',
    ],
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

  it("redacts credentials in each exception's text and the event's message, keeping the rest", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'Retry https://example.test/hook?token=abc&attempt=2',
      exception: {
        values: [
          { type: 'Error', value: 'Refused at /callback?code=abc' },
          { type: 'Error', value: 'Redirect to /app?__clerk_handshake=xyz' },
          { type: 'Error' },
        ],
      },
    };

    expect(scrubEvent(event)).toMatchObject({
      message: 'Retry https://example.test/hook?token=[Filtered]&attempt=2',
      exception: {
        values: [
          { type: 'Error', value: 'Refused at /callback?code=[Filtered]' },
          {
            type: 'Error',
            value: 'Redirect to /app?__clerk_handshake=[Filtered]',
          },
          { type: 'Error' },
        ],
      },
    });
  });

  it("redacts credentials in every string of the event's extra data", () => {
    const event: ErrorEvent = {
      type: undefined,
      extra: {
        __serialized__: {
          code: 'STRIPE_ERROR',
          message: 'Refused at /callback?code=abc&step=2',
        },
        note: 'Retry /hook?token=xyz',
      },
    };

    expect(scrubEvent(event).extra).toEqual({
      __serialized__: {
        code: 'STRIPE_ERROR',
        message: 'Refused at /callback?code=[Filtered]&step=2',
      },
      note: 'Retry /hook?token=[Filtered]',
    });
  });

  it('leaves an event without a request or Next.js context unchanged', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };

    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('leaves a breadcrumb without data unchanged', () => {
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'hi' })).toEqual({
      category: 'ui.click',
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

  // BUG-331: a console line is free text from any script on the page, and
  // its logged values are serialised by the SDK after this hook, so no
  // scrubber can find every secret in it. The browser sends none, as the
  // server sends no breadcrumbs at all.
  it('drops a console line, whatever it holds', () => {
    expect(
      scrubBreadcrumb({
        category: 'console',
        level: 'error',
        message: 'retry=2 at /v1/client?__clerk_handshake=n',
        data: {
          arguments: [new Error('x'), { token: 'abc' }],
          logger: 'console',
        },
      }),
    ).toBeNull();
  });

  // Other data is copied with every string redacted, through arrays, plain
  // objects and errors; the app's own values are never changed.
  it("redacts credentials nested in a data object's copy, leaving the object itself unchanged", () => {
    const value: Record<string, unknown> = {
      url: '/cb?code=abc',
      nested: { next: '/x?token=t', plain: 'kept' },
    };
    value.self = value;

    const scrubbed = scrubBreadcrumb({
      category: 'app',
      data: { value, list: [value, 'plain'] },
    });

    const copy = {
      url: '/cb?code=[Filtered]',
      nested: { next: '/x?token=[Filtered]', plain: 'kept' },
      self: '[Circular]',
    };
    expect(scrubbed?.data).toEqual({ value: copy, list: [copy, 'plain'] });
    expect(value.url).toBe('/cb?code=abc');
    expect((value.nested as { next: string }).next).toBe('/x?token=t');
  });

  // Any other object Sentry would serialise after this hook, by its fields or
  // its toJSON, so only its type is kept: the hook fails closed.
  it('keeps only the type of an object it cannot redact', () => {
    class Checkout {
      returnUrl = '/cb?code=abc';
    }

    expect(
      scrubBreadcrumb({
        category: 'app',
        data: {
          link: new URL('https://x.test/cb?code=abc'),
          checkout: new Checkout(),
          when: new Date(0),
          count: 3,
          ok: true,
          none: null,
        },
      })?.data,
    ).toEqual({
      link: '[object URL]',
      checkout: '[object Object]',
      when: '[object Date]',
      count: 3,
      ok: true,
      none: null,
    });
  });

  // An error is copied by its name, message, stack and own properties.
  it("redacts credentials in an error's copy, leaving the error unchanged", () => {
    const error: Error & { url?: string; self?: unknown } = new Error(
      'redirect to /cb?code=abc',
    );
    error.url = '/x?token=t';
    error.self = error;

    const scrubbed = scrubBreadcrumb({ category: 'app', data: { error } });
    const copy = scrubbed?.data?.error as Record<string, unknown> | undefined;

    expect(copy).toMatchObject({
      name: 'Error',
      message: 'redirect to /cb?code=[Filtered]',
      url: '/x?token=[Filtered]',
      self: '[Circular]',
    });
    expect(copy?.stack).toEqual(expect.stringContaining('code=[Filtered]'));
    expect(JSON.stringify(copy)).not.toMatch(/code=abc|token=t\b/);
    expect(error.message).toBe('redirect to /cb?code=abc');
    expect(error.url).toBe('/x?token=t');
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
