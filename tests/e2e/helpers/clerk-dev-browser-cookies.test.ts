// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devBrowserCookieKeeper } from './clerk-dev-browser-echo';

// BUG-333 and BUG-337: after every environment fetch, Clerk JS removes both
// dev-browser cookies before setting them again. A request that leaves in
// the gap reaches the server without them and is signed out. The page script
// skips those removals, so the write that follows replaces each in place.
// The test writes cookies exactly as Clerk JS does, through document.cookie.
function writeCookie(value: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Clerk JS writes its cookies this way, and the keeper wraps exactly this setter.
  document.cookie = value;
}

describe('devBrowserCookieKeeper', () => {
  const PAST = 'Thu, 01 Jan 1970 00:00:00 GMT';
  let original: PropertyDescriptor | undefined;

  const cookies = () =>
    Object.fromEntries(
      document.cookie
        .split('; ')
        .filter(Boolean)
        .map((pair) => pair.split('=') as [string, string]),
    );

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    for (const name of Object.keys(cookies())) {
      writeCookie(`${name}=; path=/; expires=${PAST}`);
    }
  });

  afterEach(() => {
    if (original) Object.defineProperty(Document.prototype, 'cookie', original);
    for (const name of Object.keys(cookies())) {
      writeCookie(`${name}=; path=/; expires=${PAST}`);
    }
  });

  it("keeps both dev-browser cookies through Clerk JS's removals, then takes the new token", () => {
    writeCookie('__clerk_db_jwt=one; path=/');
    writeCookie('__clerk_db_jwt_Ab12Cd=one; path=/');
    devBrowserCookieKeeper();

    for (const name of ['__clerk_db_jwt_Ab12Cd', '__clerk_db_jwt']) {
      writeCookie(`${name}=; path=/; expires=${PAST}; SameSite=Lax`);
      writeCookie(`${name}=; path=/; expires=${PAST}`);
      writeCookie(`${name}=; path=/; max-age=0`);
    }
    expect(cookies()).toMatchObject({
      __clerk_db_jwt: 'one',
      __clerk_db_jwt_Ab12Cd: 'one',
    });

    writeCookie('__clerk_db_jwt_Ab12Cd=two; path=/');
    writeCookie('__clerk_db_jwt=two; path=/');
    expect(cookies()).toMatchObject({
      __clerk_db_jwt: 'two',
      __clerk_db_jwt_Ab12Cd: 'two',
    });
  });

  it('removes every other cookie as before', () => {
    devBrowserCookieKeeper();
    writeCookie('__session=abc; path=/');
    writeCookie('__clerk_db_jwt_note=keep; path=/');
    writeCookie(`__session=; path=/; expires=${PAST}`);

    expect(cookies()).not.toHaveProperty('__session');
    expect(cookies()).toHaveProperty('__clerk_db_jwt_note', 'keep');
  });

  it('skips a removal that keeps a value but expires the cookie', () => {
    writeCookie('__clerk_db_jwt=one; path=/');
    writeCookie('__clerk_db_jwt_Ab12Cd=one; path=/');
    devBrowserCookieKeeper();
    writeCookie('__clerk_db_jwt=gone; path=/; max-age=0');
    writeCookie(`__clerk_db_jwt_Ab12Cd=gone; path=/; expires=${PAST}`);

    expect(cookies()).toMatchObject({
      __clerk_db_jwt: 'one',
      __clerk_db_jwt_Ab12Cd: 'one',
    });
  });

  it('still lets a cookie with a future expiry through', () => {
    devBrowserCookieKeeper();
    writeCookie(
      `__clerk_db_jwt=three; path=/; expires=${new Date(Date.now() + 86_400_000).toUTCString()}`,
    );

    expect(cookies()).toHaveProperty('__clerk_db_jwt', 'three');
  });
});
