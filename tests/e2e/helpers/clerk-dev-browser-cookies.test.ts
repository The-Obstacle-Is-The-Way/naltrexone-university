// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devBrowserCookieKeeper } from './clerk-dev-browser-cookies';

// BUG-333 and BUG-337: after every environment fetch, Clerk JS removes both
// dev-browser cookies before setting them again. A request that leaves in
// the gap reaches the server without them and is signed out. The page script
// holds those removals until the current script ends and drops each one that
// a write of the same cookie overtakes before then, so the write replaces it
// in place.
function writeCookie(value: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Clerk JS writes its cookies this way, and the keeper wraps exactly this setter.
  document.cookie = value;
}

// Playwright sends the function's source text to the page, so the test runs
// it the same way: anything it used from this module would be missing there.
function installKeeper(): void {
  new Function(`(${devBrowserCookieKeeper.toString()})()`)();
}

// The suffix is eight base64url characters of the publishable key's hash.
const SUFFIXED = '__clerk_db_jwt_Ab1-Cd_2';
const PAST = 'Thu, 01 Jan 1970 00:00:00 GMT';

// js-cookie's removals, as Clerk JS 6.39 issues them for each dev-browser
// cookie: with the current attributes, bare, then as a partitioned cookie.
function removeAsClerkDoes(name: string): void {
  writeCookie(`${name}=; path=/; expires=${PAST}; SameSite=Lax`);
  writeCookie(`${name}=; path=/; expires=${PAST}`);
  writeCookie(
    `${name}=; path=/; expires=${PAST}; SameSite=None; Secure; Partitioned`,
  );
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('devBrowserCookieKeeper', () => {
  let original: PropertyDescriptor | undefined;

  // What the cookie jar holds, and so what a request sends, read past the keeper.
  const jar = () =>
    Object.fromEntries(
      String(original?.get?.call(document) ?? '')
        .split('; ')
        .filter(Boolean)
        .map((pair) => pair.split('=') as [string, string]),
    );
  // What the page's own scripts read through document.cookie.
  const visible = () =>
    Object.fromEntries(
      document.cookie
        .split('; ')
        .filter(Boolean)
        .map((pair) => pair.split('=') as [string, string]),
    );
  const clearJar = () => {
    for (const name of Object.keys(jar())) {
      original?.set?.call(document, `${name}=; path=/; expires=${PAST}`);
    }
  };

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    clearJar();
  });

  afterEach(() => {
    if (original) Object.defineProperty(Document.prototype, 'cookie', original);
    clearJar();
  });

  // tsx's esbuild, with names kept, wraps a function bound to a name in a
  // module helper the page lacks, and the script then throws on load.
  it('declares no function bound to a name, which some compilers wrap', () => {
    const body = devBrowserCookieKeeper
      .toString()
      .replace(/^[^{]*\{/, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    expect(body).not.toMatch(/\b(?:function|class)\b/);
    expect(body).not.toMatch(/[^=!<>]=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/);
  });

  it("keeps both dev-browser cookies in the jar through Clerk JS's rewrite, then takes the new token", async () => {
    writeCookie('__clerk_db_jwt=one; path=/');
    writeCookie(`${SUFFIXED}=one; path=/`);
    installKeeper();

    removeAsClerkDoes(SUFFIXED);
    removeAsClerkDoes('__clerk_db_jwt');
    expect(jar()).toMatchObject({ __clerk_db_jwt: 'one', [SUFFIXED]: 'one' });

    writeCookie(`${SUFFIXED}=two; path=/; SameSite=Lax`);
    writeCookie('__clerk_db_jwt=two; path=/; SameSite=Lax');
    await nextTask();

    expect(jar()).toMatchObject({ __clerk_db_jwt: 'two', [SUFFIXED]: 'two' });
  });

  // Clerk JS's recovery from a stale dev browser removes both cookies and
  // then reads them at once: it must find none, so that it asks for a new one.
  it('hides a removed dev-browser cookie at once, and removes it when no write follows', async () => {
    writeCookie('__clerk_db_jwt=stale; path=/');
    writeCookie(`${SUFFIXED}=stale; path=/`);
    installKeeper();

    removeAsClerkDoes(SUFFIXED);
    removeAsClerkDoes('__clerk_db_jwt');
    expect(visible()).not.toHaveProperty('__clerk_db_jwt');
    expect(visible()).not.toHaveProperty(SUFFIXED);

    // The keeper's task was queued first, so it has run by the time this
    // await resumes: the removal lands as soon as the script ends.
    await Promise.resolve();

    expect(jar()).not.toHaveProperty('__clerk_db_jwt');
    expect(jar()).not.toHaveProperty(SUFFIXED);
  });

  it('never sends a removal that a write cancels, though an earlier batch is still queued', async () => {
    writeCookie('__clerk_db_jwt=one; path=/');
    const sent: string[] = [];
    Object.defineProperty(Document.prototype, 'cookie', {
      ...original,
      set(value: string) {
        sent.push(value);
        original?.set?.call(this, value);
      },
    });
    installKeeper();

    writeCookie(`__clerk_db_jwt=; path=/; expires=${PAST}`);
    const late = Promise.resolve().then(() =>
      writeCookie('__clerk_db_jwt=late; path=/'),
    );
    writeCookie('__clerk_db_jwt=mid; path=/');
    writeCookie(`__clerk_db_jwt=; path=/; expires=${PAST}`);
    await late;
    await nextTask();

    expect(sent).toEqual([
      '__clerk_db_jwt=mid; path=/',
      '__clerk_db_jwt=late; path=/',
    ]);
    expect(jar()).toHaveProperty('__clerk_db_jwt', 'late');
  });

  it('removes every other cookie at once', () => {
    writeCookie('__session=abc; path=/');
    writeCookie('__clerk_db_jwt_note=abc; path=/');
    installKeeper();

    writeCookie(`__session=; path=/; expires=${PAST}`);
    writeCookie(`__clerk_db_jwt_note=; path=/; expires=${PAST}`);

    expect(jar()).not.toHaveProperty('__session');
    expect(jar()).not.toHaveProperty('__clerk_db_jwt_note');
  });

  it('holds a removal by Max-Age or by a value with a past expiry, but not a future one', async () => {
    writeCookie('__clerk_db_jwt=one; path=/');
    writeCookie(`${SUFFIXED}=one; path=/`);
    installKeeper();

    writeCookie('__clerk_db_jwt=gone; path=/; Max-Age=-1');
    writeCookie(`${SUFFIXED}=gone; path=/; expires=${PAST}`);
    expect(jar()).toMatchObject({ __clerk_db_jwt: 'one', [SUFFIXED]: 'one' });

    writeCookie('__clerk_db_jwt=three; path=/; max-age=3600');
    writeCookie(
      `${SUFFIXED}=three; path=/; expires=${new Date(Date.now() + 86_400_000).toUTCString()}`,
    );
    expect(jar()).toMatchObject({
      __clerk_db_jwt: 'three',
      [SUFFIXED]: 'three',
    });
    await nextTask();
    expect(jar()).toMatchObject({
      __clerk_db_jwt: 'three',
      [SUFFIXED]: 'three',
    });
  });
});
