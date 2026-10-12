import type { BrowserContext } from '@playwright/test';
import { clerkFrontendApiHost } from './clerk-auth-trace';

// BUG-333: Clerk's Frontend API echoes the dev-browser token each request
// sends, in a `Clerk-Db-Jwt` header. Clerk JS stores the token from every
// echo, and its setter removes both cookie copies before setting them again.
// A navigation that starts during that rewrite reaches the server without the
// token, the handshake answers signed out, and the test lands on sign-in. An
// echo carries nothing new, so tests drop it; a different token still passes.

const DEV_BROWSER_QUERY = '__clerk_db_jwt';

/**
 * BUG-333 and BUG-337: Clerk JS also rewrites both dev-browser cookies after
 * every environment fetch, removing them before setting them again, and the
 * echo drop below cannot stop that. A request that leaves in the gap reaches
 * the server without them and is signed out. This page script skips removals
 * of the two cookies, so the write that follows replaces each in place. It
 * runs in the page before the page's own scripts, so it imports nothing.
 */
export function devBrowserCookieKeeper(): void {
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!cookie?.get || !cookie.set) return;
  const { get, set } = cookie;
  Object.defineProperty(Document.prototype, 'cookie', {
    configurable: true,
    get() {
      return get.call(this);
    },
    set(value: string) {
      const [pair = '', ...attributes] = String(value).split(';');
      const [name = '', ...rest] = pair.split('=');
      if (/^__clerk_db_jwt(?:_[A-Za-z0-9_-]+)?$/.test(name.trim())) {
        const empty = rest.join('=').trim() === '';
        const expired = attributes.some((attribute) => {
          const [key = '', ...parts] = attribute.trim().split('=');
          const text = parts.join('=');
          if (/^max-age$/i.test(key)) return Number(text) <= 0;
          if (/^expires$/i.test(key)) return Date.parse(text) <= Date.now();
          return false;
        });
        if (empty || expired) return;
      }
      set.call(this, value);
    },
  });
}

/** Installs {@link devBrowserCookieKeeper} in every page of this context. */
export async function keepDevBrowserCookiesInPlace(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(devBrowserCookieKeeper);
}
const DEV_BROWSER_HEADER = 'clerk-db-jwt';

/** The response's headers without an echo of the token the request sent. */
export function withoutDevBrowserEcho(
  requestUrl: string,
  headers: Record<string, string>,
): Record<string, string> {
  const sent = new URL(requestUrl).searchParams.get(DEV_BROWSER_QUERY);
  if (!sent || headers[DEV_BROWSER_HEADER] !== sent) return headers;
  const { [DEV_BROWSER_HEADER]: _echo, ...rest } = headers;
  return rest;
}

/**
 * Drops the echo from Clerk JS's own Frontend API calls in this context.
 * Navigations, such as the handshake, pass untouched.
 */
export async function dropDevBrowserEchoes(
  context: BrowserContext,
): Promise<void> {
  const host = clerkFrontendApiHost();
  if (!host) return;
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await context.route(new RegExp(`^https://${escaped}/v1/`), async (route) => {
    const request = route.request();
    if (request.isNavigationRequest()) {
      await route.continue();
      return;
    }
    try {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: withoutDevBrowserEcho(request.url(), response.headers()),
      });
    } catch {
      // The test ended, or the request failed as it would have without us.
      await route.abort().catch(() => undefined);
    }
  });
}
