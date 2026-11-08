// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signedInClientUatKeeper } from './clerk-client-uat-cookie';

// BUG-337: on Clerk's development instance, Clerk JS rewrites both
// `__client_uat` cookies after every environment fetch. When its client has no
// signed-in session it writes the signed-out "0", which in CI has gone out
// beside a live session token, and Clerk's middleware answers that request with
// a handshake that a fetch cannot follow. The page script keeps the signed-in
// value in place while a session cookie is present.
function writeCookie(value: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: Clerk JS writes its cookies this way, and the keeper wraps exactly this setter.
  document.cookie = value;
}

// Playwright sends the function's source text to the page, so the test runs
// it the same way: anything it used from this module would be missing there.
function installKeeper(): void {
  new Function(`(${signedInClientUatKeeper.toString()})()`)();
}

// The suffix is eight base64url characters of the publishable key's hash.
const SUFFIXED = '__client_uat_Ab1-Cd_2';
const SIGNED_IN_AT = '1792719862';
const PAST = 'Thu, 01 Jan 1970 00:00:00 GMT';
const NEXT_YEAR = () => new Date(Date.now() + 365 * 86_400_000).toUTCString();

// Clerk JS 6.41's clientUat.set: it removes both cookies through js-cookie,
// then sets both to the same value, in one script run.
function rewriteAsClerkDoes(value: string): void {
  writeCookie(`${SUFFIXED}=; path=/; expires=${PAST}`);
  writeCookie(`__client_uat=; path=/; expires=${PAST}`);
  writeCookie(
    `${SUFFIXED}=${value}; path=/; expires=${NEXT_YEAR()}; SameSite=Strict`,
  );
  writeCookie(
    `__client_uat=${value}; path=/; expires=${NEXT_YEAR()}; SameSite=Strict`,
  );
}

describe('signedInClientUatKeeper', () => {
  let original: PropertyDescriptor | undefined;

  // What the cookie jar holds, and so what a request sends.
  const jar = () =>
    Object.fromEntries(
      String(original?.get?.call(document) ?? '')
        .split('; ')
        .filter(Boolean)
        .map((pair) => pair.split('=') as [string, string]),
    );
  const clearJar = () => {
    for (const name of Object.keys(jar())) {
      original?.set?.call(document, `${name}=; path=/; expires=${PAST}`);
    }
  };
  const signIn = () => {
    writeCookie('__session=token; path=/');
    writeCookie(`__client_uat=${SIGNED_IN_AT}; path=/`);
    writeCookie(`${SUFFIXED}=${SIGNED_IN_AT}; path=/`);
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
    const body = signedInClientUatKeeper
      .toString()
      .replace(/^[^{]*\{/, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    expect(body).not.toMatch(/\b(?:function|class)\b/);
    expect(body).not.toMatch(/[^=!<>]=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/);
  });

  it("keeps a signed-in client_uat through Clerk JS's signed-out rewrite", () => {
    signIn();
    installKeeper();

    rewriteAsClerkDoes('0');

    expect(jar()).toMatchObject({
      __client_uat: SIGNED_IN_AT,
      [SUFFIXED]: SIGNED_IN_AT,
    });
  });

  it('takes a new signed-in value in place', () => {
    signIn();
    installKeeper();

    rewriteAsClerkDoes('1792720000');

    expect(jar()).toMatchObject({
      __client_uat: '1792720000',
      [SUFFIXED]: '1792720000',
    });
  });

  // Clerk JS's signOut() removes the session cookie before it writes "0".
  it('lets a sign-out through once the session cookie is gone', () => {
    signIn();
    writeCookie('__session_Ab1-Cd_2=token; path=/');
    installKeeper();

    writeCookie(`__session=; path=/; expires=${PAST}`);
    writeCookie(`__session_Ab1-Cd_2=; path=/; expires=${PAST}`);
    rewriteAsClerkDoes('0');

    expect(jar()).toMatchObject({ __client_uat: '0', [SUFFIXED]: '0' });
  });

  it('keeps the value while only the suffixed session cookie is present', () => {
    writeCookie('__session_Ab1-Cd_2=token; path=/');
    writeCookie(`__client_uat=${SIGNED_IN_AT}; path=/`);
    installKeeper();

    writeCookie(`__client_uat=; path=/; expires=${PAST}`);
    writeCookie(`__client_uat=0; path=/; expires=${NEXT_YEAR()}`);

    expect(jar()).toHaveProperty('__client_uat', SIGNED_IN_AT);
  });

  it('writes every other cookie at once', () => {
    signIn();
    writeCookie('__client_uat_note=abc; path=/');
    installKeeper();

    writeCookie('__client_uat_note=0; path=/');
    writeCookie(`__session=; path=/; expires=${PAST}`);

    expect(jar()).toHaveProperty('__client_uat_note', '0');
    expect(jar()).not.toHaveProperty('__session');
  });
});
