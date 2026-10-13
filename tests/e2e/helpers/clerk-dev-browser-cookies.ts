import type { BrowserContext } from '@playwright/test';

/**
 * BUG-333 and BUG-337: after every environment fetch, Clerk JS rewrites both
 * dev-browser cookies by removing them and then setting them again, in one
 * script run. A request that leaves in between reaches the server without them
 * and is signed out. This page script holds each removal of the two cookies
 * until the current script has finished, and drops it if a write of the same
 * cookie arrives first, so a rewrite replaces each cookie in place.
 *
 * A removal that no write follows, as when Clerk JS discards a stale dev
 * browser, still happens once the script finishes. Until then, reads through
 * `document.cookie` leave the held cookie out, so Clerk JS sees it gone at once
 * and asks for a new dev browser.
 *
 * Partitioned and unpartitioned copies of a name are treated as one cookie;
 * E2E pages on http://localhost never set a partitioned one.
 *
 * Playwright sends this function's source text to the page, so it must not use
 * anything from this module. It also declares no functions of its own: some
 * compilers (tsx's esbuild, with names kept) wrap those in a module helper
 * that the page does not have.
 */
export function devBrowserCookieKeeper(): void {
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (!cookie?.get || !cookie.set) return;
  const { get, set } = cookie;
  // Clerk's suffix is eight base64url characters of the publishable key's hash.
  const devBrowserCookie = /^__clerk_db_jwt(?:_[A-Za-z0-9_-]{8})?$/;
  const held = new Map<string, string[]>();
  Object.defineProperty(Document.prototype, 'cookie', {
    ...cookie,
    get() {
      const value = String(get.call(this));
      if (held.size === 0) return value;
      return value
        .split('; ')
        .filter((pair) => !held.has(pair.split('=')[0] ?? ''))
        .join('; ');
    },
    set(value: string) {
      const text = String(value);
      const [pair = '', ...attributes] = text.split(';');
      const name = pair.split('=')[0]?.trim() ?? '';
      if (!devBrowserCookie.test(name)) {
        set.call(this, text);
        return;
      }
      const removal = attributes.some((attribute) => {
        const [key = '', ...parts] = attribute.trim().split('=');
        const setting = parts.join('=');
        if (/^max-age$/i.test(key)) return Number(setting) <= 0;
        if (/^expires$/i.test(key)) return Date.parse(setting) <= Date.now();
        return false;
      });
      if (!removal) {
        held.delete(name);
        set.call(this, text);
        return;
      }
      const removals = held.get(name);
      if (removals) {
        removals.push(text);
        return;
      }
      held.set(name, [text]);
      queueMicrotask(() => {
        const pending = held.get(name) ?? [];
        held.delete(name);
        for (const write of pending) set.call(this, write);
      });
    },
  });
}

/** Installs {@link devBrowserCookieKeeper} in every page of this context. */
export async function keepDevBrowserCookiesInPlace(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(devBrowserCookieKeeper);
}
