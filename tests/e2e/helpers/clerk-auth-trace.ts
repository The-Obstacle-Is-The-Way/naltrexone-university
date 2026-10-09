import type { Frame, Page, Response } from '@playwright/test';
import { redactSensitiveE2EText } from './e2e-log-redaction';

// BUG-333: a signed-in test can lose its session partway through and land on
// sign-in, rarely, with nothing to say why. Clerk's middleware names its
// decision on every answer (`x-clerk-auth-status` and `x-clerk-auth-reason`)
// and on a handshake redirect (`__clerk_hs_reason`, `__clerk_redirect_count`).
// This trace keeps those, Clerk's own API answers and Clerk JS's session
// changes, and prints them once when the page reaches sign-in. It never keeps
// a token: query strings are reduced to parameter names, and cookies to their
// names, times and kinds.

type Headers = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * BUG-330: one Frontend API answer, for a failed restore's error: method,
 * path, status, and for a refusal Clerk's error codes and trace ID. Never the
 * query string, which carries the development token, nor a header or message.
 */
export function describeFrontendApiAnswer(answer: {
  method: string;
  url: string;
  status: number;
  body: unknown;
}): string {
  // A Clerk ID in the path is named by its kind only.
  const path = new URL(answer.url).pathname.replace(
    /\/([a-z]+)_[A-Za-z0-9]{8,}/g,
    '/$1_…',
  );
  let text = `${answer.method} ${path} ${answer.status}`;
  if (answer.status < 400 || !isRecord(answer.body)) return text;
  const { errors, clerk_trace_id: traceId } = answer.body;
  if (Array.isArray(errors) && errors.length > 0) {
    const codes = errors.map((error) =>
      isRecord(error) && typeof error.code === 'string' ? error.code : '?',
    );
    text += ` [${codes.join(', ')}]`;
  }
  if (typeof traceId === 'string') text += ` trace ${traceId}`;
  return text;
}

function place(url: URL): string {
  return `${url.host}${url.pathname}`;
}

function describeSetCookies(header: string | undefined): string[] {
  if (!header) return [];
  return header.split('\n').flatMap((line) => {
    const [pair = '', ...attributes] = line.split(';');
    const [name = '', value = ''] = pair.trim().split('=');
    const cleared =
      value === '' ||
      attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (name === '__clerk_redirect_count') return [`${name}=${value}`];
    if (name.startsWith('__session'))
      return [`${name} ${cleared ? 'cleared' : 'set'}`];
    if (name.startsWith('__client_uat')) return [`${name}=${value}`];
    if (name.startsWith('__clerk_db_jwt')) return [`${name} set`];
    return [];
  });
}

/** One main-frame answer: where, its status, Clerk's decision and redirect. */
export function describeNavigationAnswer(answer: {
  method: string;
  url: string;
  status: number;
  headers: Headers;
}): string {
  const url = new URL(answer.url);
  let text = `${answer.method} ${place(url)} ${answer.status}`;
  const status = answer.headers['x-clerk-auth-status'];
  const reason = answer.headers['x-clerk-auth-reason'];
  if (status) text += ` auth=${status}${reason ? `/${reason}` : ''}`;
  const location = answer.headers.location;
  if (location) {
    const target = new URL(location, url);
    text += ` → ${place(target)}`;
    const hsReason = target.searchParams.get('__clerk_hs_reason');
    if (hsReason) text += ` hs_reason=${hsReason}`;
    const names = [...target.searchParams.keys()];
    if (names.length > 0) text += ` params=${names.join(',')}`;
  }
  const cookies = describeSetCookies(answer.headers['set-cookie']);
  if (cookies.length > 0) text += `; cookies: ${cookies.join(', ')}`;
  return text;
}

function tokenClaims(token: string): Record<string, unknown> | undefined {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    return payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Clerk's cookies by name, times and kind, never their values' secrets. */
export function describeClerkCookies(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): string {
  const parts: string[] = [];
  const sessions = cookies.filter(({ name }) => name.startsWith('__session'));
  if (sessions.length === 0) parts.push('no __session');
  for (const { name, value } of sessions) {
    const claims = tokenClaims(value);
    const sid =
      typeof claims?.sid === 'string'
        ? ` sid=${claims.sid.split('_')[0]}_…`
        : '';
    parts.push(
      claims
        ? `${name} iat=${String(claims.iat)} exp=${String(claims.exp)}${sid}`
        : `${name} unreadable`,
    );
  }
  for (const { name, value } of cookies) {
    if (name.startsWith('__client_uat')) parts.push(`${name}=${value}`);
    if (name.startsWith('__clerk_db_jwt')) parts.push(`${name} present`);
  }
  return parts.join('; ');
}

/**
 * Clerk's Frontend API host, from the publishable key as Clerk encodes it:
 * `pk_test_` or `pk_live_`, then the host and a closing `$` in base64.
 * clerkSetup() sets CLERK_FAPI only in the setup project's worker, but every
 * worker loads the publishable key with Playwright's config.
 */
export function clerkFrontendApiHost(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const encoded = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(
    /^pk_(?:test|live)_(.+)$/,
  )?.[1];
  if (!encoded) return undefined;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  return decoded.endsWith('$') ? decoded.slice(0, -1) : undefined;
}

export function isSignInUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith('/sign-in');
  } catch {
    return false;
  }
}

/** A bounded, timed record that reports once. */
export class ClerkAuthTrace {
  private readonly entries: Array<{ at: number; text: string }> = [];
  private readonly startedAt: number;
  private reported = false;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = 40,
  ) {
    this.startedAt = now();
  }

  noteAnswer(text: string): void {
    this.entries.push({ at: this.now(), text });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  noteClerkEvent(event: { session: boolean; status: string }): void {
    this.noteAnswer(
      `Clerk JS: ${event.session ? 'signed in' : 'signed out'} (status ${event.status})`,
    );
  }

  report(cookies: string): string[] | null {
    if (this.reported) return null;
    this.reported = true;
    return [
      ...this.entries.map(
        ({ at, text }) => `+${at - this.startedAt}ms ${text}`,
      ),
      `cookies: ${cookies}`,
    ];
  }
}

declare global {
  interface Window {
    __e2eClerkAuthEvent?: (session: boolean, status: string) => void;
  }
}

/**
 * Starts the trace on a signed-in test's page, before its first navigation,
 * and keeps it for the whole test.
 */
export async function startClerkAuthTrace(page: Page): Promise<void> {
  const trace = new ClerkAuthTrace();
  const frontendApi = clerkFrontendApiHost();
  await page.exposeFunction(
    '__e2eClerkAuthEvent',
    (session: boolean, status: string) =>
      trace.noteClerkEvent({ session, status }),
  );
  await page.addInitScript(() => {
    type ClerkLike = {
      addListener?: (listener: (state: { session?: unknown }) => void) => void;
      status?: unknown;
      version?: unknown;
    };
    const started = Date.now();
    const timer = setInterval(() => {
      const clerk = (window as { Clerk?: ClerkLike }).Clerk;
      if (typeof clerk?.addListener !== 'function') {
        if (Date.now() - started > 30_000) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      clerk.addListener(({ session }) =>
        window.__e2eClerkAuthEvent?.(
          Boolean(session),
          `${String(clerk.status ?? 'unknown')}, v${String(clerk.version ?? '?')}`,
        ),
      );
    }, 25);
  });
  const pending: Promise<void>[] = [];
  page.on('response', (response: Response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.host === frontendApi && url.pathname.startsWith('/v1/')) {
      pending.push(
        response
          .json()
          .catch(() => undefined)
          .then((body) =>
            trace.noteAnswer(
              `Clerk API: ${describeFrontendApiAnswer({
                method: request.method(),
                url: response.url(),
                status: response.status(),
                body,
              })}`,
            ),
          ),
      );
      return;
    }
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame())
      return;
    pending.push(
      response
        .allHeaders()
        .catch(() => ({}))
        .then((headers) =>
          trace.noteAnswer(
            describeNavigationAnswer({
              method: request.method(),
              url: response.url(),
              status: response.status(),
              headers,
            }),
          ),
        ),
    );
  });
  page.on('framenavigated', (frame: Frame) => {
    if (frame !== page.mainFrame() || !isSignInUrl(frame.url())) return;
    void Promise.allSettled(pending).then(async () => {
      const cookies = await page
        .context()
        .cookies()
        .catch(() => []);
      const lines = trace.report(describeClerkCookies(cookies));
      if (!lines) return;
      console.error(
        redactSensitiveE2EText(
          [
            '[E2E_CLERK_AUTH_TRACE] a signed-in test reached sign-in:',
            ...lines,
          ].join('\n  '),
        ),
      );
    });
  });
}
