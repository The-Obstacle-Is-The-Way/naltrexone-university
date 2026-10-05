import { describe, expect, it } from 'vitest';
import {
  redactCredentialParams,
  SENTRY_DATA_COLLECTION,
  scrubBreadcrumb,
  scrubEvent,
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
});
