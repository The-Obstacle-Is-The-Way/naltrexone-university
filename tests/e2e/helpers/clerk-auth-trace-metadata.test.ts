import { describe, expect, it } from 'vitest';
import {
  describeClerkCookies,
  describeNavigationAnswer,
} from './clerk-auth-trace';

const jwt = (payload: object) =>
  [
    'eyJhbGciOiJSUzI1NiJ9',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');

describe('allowlisted Clerk trace metadata', () => {
  it('keeps the handshake reason and numeric cookie times without their credentials', () => {
    const navigation = describeNavigationAnswer({
      method: 'GET',
      url: 'http://localhost/app',
      status: 307,
      headers: {
        location:
          'https://example.accounts.dev/sign-in?__clerk_hs_reason=dev-browser-missing&__clerk_db_jwt=private-token',
        'set-cookie':
          '__client_uat=1791560000; Path=/\n__clerk_redirect_count=1; Path=/',
      },
    });
    expect(navigation).toContain('hs_reason=dev-browser-missing');
    expect(navigation).toContain('__client_uat=1791560000');
    expect(navigation).toContain('__clerk_redirect_count=1');
    expect(navigation).not.toContain('private-token');
    const token = jwt({
      iat: 1791560000,
      exp: 1791560060,
      sub: 'private-user',
    });
    const cookies = describeClerkCookies([
      { name: '__session', value: token },
      { name: '__client_uat', value: '1791560000' },
    ]);
    expect(cookies).toContain('iat=1791560000 exp=1791560060');
    expect(cookies).toContain('__client_uat=1791560000');
    expect(cookies).not.toContain(token);
    expect(cookies).not.toContain('private-user');
  });

  it('reduces malformed reasons and nonnumeric times to lengths', () => {
    const navigation = describeNavigationAnswer({
      method: 'GET',
      url: 'http://localhost/app',
      status: 307,
      headers: {
        location:
          'https://example.accounts.dev/sign-in?__clerk_hs_reason=not%20a%20reason&__session=private-value',
      },
    });
    expect(navigation).toContain('hs_reason length=12');
    expect(navigation).not.toContain('not a reason');
    expect(navigation).not.toContain('private-value');
    const cookies = describeClerkCookies([
      {
        name: '__session',
        value: jwt({ iat: 'private-issued', exp: 'private-expiry' }),
      },
      { name: '__client_uat', value: 'private-time' },
    ]);
    expect(cookies).toContain('iat length=14 exp length=14');
    expect(cookies).toContain('__client_uat length=12');
    expect(cookies).not.toContain('private-');
  });
});
