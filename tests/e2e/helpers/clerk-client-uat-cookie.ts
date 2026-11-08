import type { BrowserContext } from '@playwright/test';

/**
 * BUG-337: on a development instance, Clerk JS writes both `__client_uat`
 * cookies from the browser after every environment fetch and token update
 * (`setClientUatCookieForDevelopmentInstances` in 6.41). It removes them, then
 * writes the client's update time, or the signed-out "0" when its client has
 * no signed-in session. Before the client has loaded that is "0", even though
 * the session token is live. Clerk's middleware then answers the next request
 * `session-token-but-no-client-uat` with a handshake redirect that a server
 * action or RSC fetch cannot follow, and the page reports "Failed to fetch".
 * Production instances skip that writer, so this page script is for E2E only.
 *
 * While a session cookie is present, the script ignores each removal and each
 * "0" written to a `__client_uat` cookie, so the signed-in value stays in place
 * until a new one replaces it. Every sign-out path in Clerk JS removes the
 * session cookie before it writes "0", so a sign-out still goes through.
 *
 * Playwright sends this function's source text to the page, so it must not use
 * anything from this module. It also binds no function to a name (no function
 * declaration, no `const f = () => …`): some compilers (tsx's esbuild, with
 * names kept) wrap those in a module helper that the page does not have.
 */
export function signedInClientUatKeeper(): void {
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!cookie?.get || !cookie.set) return;
  const { get, set } = cookie;
  // Clerk's suffix is eight base64url characters of the publishable key's hash.
  const clientUatCookie = /^__client_uat(?:_[A-Za-z0-9_-]{8})?$/;
  const sessionCookie = /^__session(?:_[A-Za-z0-9_-]{8})?$/;
  Object.defineProperty(Document.prototype, 'cookie', {
    ...cookie,
    set(value: string) {
      const text = String(value);
      const [pair = '', ...attributes] = text.split(';');
      const [name = '', ...valueParts] = pair.split('=');
      if (!clientUatCookie.test(name.trim())) {
        set.call(this, text);
        return;
      }
      const signedIn = String(get.call(this))
        .split('; ')
        .some((entry) => {
          const [entryName = '', ...entryValue] = entry.split('=');
          return sessionCookie.test(entryName) && entryValue.join('=') !== '';
        });
      const removal = attributes.some((attribute) => {
        const [key = '', ...parts] = attribute.trim().split('=');
        const setting = parts.join('=');
        if (/^max-age$/i.test(key)) return Number(setting) <= 0;
        if (/^expires$/i.test(key)) return Date.parse(setting) <= Date.now();
        return false;
      });
      if (signedIn && (removal || valueParts.join('=').trim() === '0')) return;
      set.call(this, text);
    },
  });
}

/** Installs {@link signedInClientUatKeeper} in every page of this context. */
export async function keepSignedInClientUat(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(signedInClientUatKeeper);
}
