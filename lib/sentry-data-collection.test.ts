import { describe, expect, it } from 'vitest';
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection';

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
          'signature',
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
