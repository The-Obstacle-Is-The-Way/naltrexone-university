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

  it('redacts the whole value, even one holding a percent sign', () => {
    expect(
      redactClerkCredentials('__clerk_testing_token=abc%2Bdef&next=1'),
    ).toBe('__clerk_testing_token=[redacted]&next=1');
  });

  it('redacts a JSON Web Token that follows a percent-encoded separator', () => {
    expect(redactClerkCredentials(`next%3Dtoken%3D${jwt}%26a`)).toBe(
      'next%3Dtoken%3D[redacted]%26a',
    );
  });

  it.each([
    ['a JSON newline escape', '\\n'],
    ['a hyphen', 'x-'],
    ['an underscore', 'token_'],
    ['a dotted prefix', 'v1.'],
  ])('redacts a JSON Web Token after %s', (_label, prefix) => {
    expect(redactClerkCredentials(`a ${prefix}${jwt} b`)).toBe(
      `a ${prefix}[redacted] b`,
    );
  });

  // A segment holding `eyJ` just before a token must not hide part of it.
  it('redacts a token preceded by token-like segments, as one span', () => {
    const lookalike = 'xeyJabcdefgh';

    expect(redactClerkCredentials(`a ${lookalike}.${lookalike}.${jwt} b`)).toBe(
      `a ${lookalike}.x[redacted] b`,
    );
    expect(countClerkCredentials(`a ${lookalike}.${jwt} b`).jsonWebToken).toBe(
      1,
    );
  });

  // Runs of token-like text must not make the match quadratic.
  it.each([
    ['eyJ', 'eyJ'.repeat(80_000)],
    ['.eyJ', '.eyJ'.repeat(80_000)],
    ['%41eyJ', '%41eyJ'.repeat(50_000)],
    ['eyJ segments', `${'eyJ'.repeat(20)}.`.repeat(5_000)],
  ])('handles a long run of %s in linear time', (_label, text) => {
    const started = performance.now();

    redactClerkCredentials(text);
    countClerkCredentials(text);

    expect(performance.now() - started).toBeLessThan(1_000);
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
