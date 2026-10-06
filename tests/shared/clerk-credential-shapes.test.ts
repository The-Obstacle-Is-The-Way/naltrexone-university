import { describe, expect, it } from 'vitest';
import {
  countClerkCredentials,
  redactClerkCredentials,
} from './clerk-credential-shapes';

const none = { parameter: 0, devBrowserToken: 0, jsonWebToken: 0 };
const jwt = ['eyJhbGciOiJSUzI1NiJ9', 'eyJzdWIiOiJ1c2VyXzEifQ', 'c2ln'].join(
  '.',
);

describe('redactClerkCredentials', () => {
  it.each([
    ['__clerk_db_jwt=value1', '__clerk_db_jwt=[redacted]'],
    ['__clerk_handshake=value1', '__clerk_handshake=[redacted]'],
    ['__clerk_testing_token=value1', '__clerk_testing_token=[redacted]'],
    ['__session=value1', '__session=[redacted]'],
  ])('redacts the value of %s', (text, redacted) => {
    expect(redactClerkCredentials(`?${text}&next=1`)).toBe(
      `?${redacted}&next=1`,
    );
  });

  // A redirect URL nested in another URL is percent-encoded once.
  it('redacts a parameter inside a percent-encoded URL', () => {
    expect(
      redactClerkCredentials(
        'redirect_url=http%3A%2F%2Flocalhost%2Fapp%3F__clerk_testing_token%3Dvalue1%26next%3D1',
      ),
    ).toBe(
      'redirect_url=http%3A%2F%2Flocalhost%2Fapp%3F__clerk_testing_token%3D[redacted]%26next%3D1',
    );
  });

  it('redacts a dev-browser token and a JSON Web Token on their own', () => {
    expect(redactClerkCredentials(`a dvb_2abcDEF345ghi b ${jwt} c`)).toBe(
      'a [redacted] b [redacted] c',
    );
  });

  it('leaves text without a credential unchanged', () => {
    expect(redactClerkCredentials('GET /app?plan=monthly 200')).toBe(
      'GET /app?plan=monthly 200',
    );
  });
});

describe('countClerkCredentials', () => {
  it('counts nothing in clean or already-redacted text', () => {
    expect(
      countClerkCredentials('GET /app?__clerk_db_jwt=[redacted] 200'),
    ).toEqual(none);
  });

  it.each([
    ['a parameter', '?__clerk_db_jwt=value1', 'parameter'],
    ['a dev-browser token', 'cookie dvb_2abcDEF345ghi', 'devBrowserToken'],
    ['a JSON Web Token', `bearer ${jwt}`, 'jsonWebToken'],
    [
      'a percent-encoded parameter',
      '%3F__clerk_testing_token%3Dvalue1',
      'parameter',
    ],
    [
      'a doubly percent-encoded parameter',
      '%253F__clerk_testing_token%253Dvalue1',
      'parameter',
    ],
    [
      'a percent-encoded name',
      '%5F%5Fclerk_testing_token%3Dvalue1',
      'parameter',
    ],
    ['a JSON-escaped name', '"\\u005f\\u005fclerk_db_jwt=value1"', 'parameter'],
    ['an upper-case name', '__CLERK_DB_JWT=value1', 'parameter'],
  ])('counts %s', (_label, text, shape) => {
    expect(countClerkCredentials(text)).toEqual({ ...none, [shape]: 1 });
  });
});
