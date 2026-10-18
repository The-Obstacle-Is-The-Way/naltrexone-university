import type { Frame, Page, Request, Response } from '@playwright/test';
import { observeFailedFetchAlerts } from './clerk-fetch-alert';
import {
  describeFailedRequest,
  describeFetchAnswer,
} from './clerk-fetch-trace';
import { redactSensitiveE2EText } from './e2e-log-redaction';

// BUG-333: a signed-in test can lose its session partway through and land on
// sign-in, rarely, with nothing to say why. Clerk's middleware names its
// decision on every answer (`x-clerk-auth-status` and `x-clerk-auth-reason`)
// and on a handshake redirect (`__clerk_hs_reason`, `__clerk_redirect_count`).
// This trace keeps those, Clerk's own API answers and Clerk JS's session
// changes, and prints once on sign-in, a failed-fetch alert or test failure. It never keeps
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

// The app's and Clerk's paths name the step; another site's path can carry an
// ID, such as Stripe Checkout's Session, so it is reduced to its host.
function place(url: URL): string {
  const known =
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.hostname.endsWith('.accounts.dev');
  return known ? `${url.host}${url.pathname}` : url.host;
}

function describeSetCookies(header: string | undefined): string[] {
  if (!header) return [];
  return header.split('\n').flatMap((line) => {
    const [pair = '', ...attributes] = line.split(';');
    const [name = '', value = ''] = pair.trim().split('=');
    const cleared =
      value === '' ||
      attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (name === '__clerk_redirect_count')
      return [`${name} length=${value.length}`];
    if (name.startsWith('__session'))
      return [`${name} ${cleared ? 'cleared' : 'set'}`];
    if (name.startsWith('__client_uat'))
      return [`${name} length=${value.length}`];
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
    const names = [...target.searchParams.keys()];
    if (names.length > 0) text += ` params=${names.join(',')}`;
  }
  const cookies = describeSetCookies(answer.headers['set-cookie']);
  if (cookies.length > 0) text += `; cookies: ${cookies.join(', ')}`;
  return text;
}

/** The context jar at report time, not proof of what a request sent. */
export function describeClerkCookies(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): string {
  const parts: string[] = [];
  if (!cookies.some(({ name }) => name.startsWith('__session')))
    parts.push('no __session');
  for (const { name, value } of cookies) {
    if (
      /^__(?:session|client_uat|clerk_db_jwt)(?:_[A-Za-z0-9_-]{8})?$/.test(name)
    ) {
      parts.push(`${name} length=${value.length}`);
    }
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

  noteAnswer(text: string, at = this.now()): void {
    this.entries.push({ at, text });
    this.entries.sort((a, b) => a.at - b.at);
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

type TraceReason = 'sign-in' | 'failed-fetch alert' | 'test failure';
const reporters = new WeakMap<Page, (reason: TraceReason) => Promise<void>>();

/** Called by the authenticated-test fixture before Playwright closes the page. */
export async function reportFailedClerkAuthTrace(page: Page): Promise<void> {
  await reporters.get(page)?.('test failure');
}

function requestDetails(request: Request, headers: Headers) {
  // A CORS failure can be reported on the redirected request. Retain the
  // originating request kind, but never the Next-Action value.
  let origin = request;
  while (origin.redirectedFrom()) origin = origin.redirectedFrom() ?? origin;
  const originalHeaders = origin.headers();
  return {
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
    headers: {
      ...headers,
      ...('next-action' in originalHeaders ? { 'next-action': '' } : {}),
      ...('rsc' in originalHeaders ? { rsc: '' } : {}),
    },
  };
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
export async function startClerkAuthTrace(
  page: Page,
  write: (text: string) => void = console.error,
): Promise<void> {
  if (reporters.has(page)) return;
  const trace = new ClerkAuthTrace();
  const frontendApi = clerkFrontendApiHost();
  const pending = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    const settled = work.catch(() => {
      // Diagnostic collection must preserve the test's original failure.
      trace.noteAnswer('Network metadata unavailable');
    });
    pending.add(settled);
    void settled.finally(() => pending.delete(settled));
  };
  const report = async (reason: TraceReason) => {
    await Promise.allSettled([...pending]);
    const cookies = await page
      .context()
      .cookies()
      .catch(() => []);
    const lines = trace.report(describeClerkCookies(cookies));
    if (lines)
      write(
        redactSensitiveE2EText(
          [`[E2E_CLERK_AUTH_TRACE] ${reason}:`, ...lines].join('\n  '),
        ),
      );
  };
  reporters.set(page, report);
  await page.exposeFunction('__e2eFailedFetchAlert', () =>
    report('failed-fetch alert'),
  );
  await page.addInitScript(observeFailedFetchAlerts);
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
  page.on('requestfailed', (request: Request) => {
    const at = Date.now();
    track(
      request
        .allHeaders()
        .catch(() => request.headers())
        .then((headers) => {
          trace.noteAnswer(
            describeFailedRequest({
              ...requestDetails(request, headers),
              failure: request.failure()?.errorText ?? 'unknown',
            }),
            at,
          );
        }),
    );
  });
  page.on('response', (response: Response) => {
    const at = Date.now();
    const request = response.request();
    const url = new URL(response.url());
    if (url.host === frontendApi && url.pathname.startsWith('/v1/')) {
      // Timestamp receipt of headers, not completion of a possibly hung body.
      trace.noteAnswer(
        `Clerk API: ${describeFrontendApiAnswer({
          method: request.method(),
          url: response.url(),
          status: response.status(),
          body: undefined,
        })}`,
        at,
      );
      return;
    }
    const observed = requestDetails(request, request.headers());
    if (
      !request.isNavigationRequest() &&
      !('next-action' in observed.headers) &&
      !('rsc' in observed.headers)
    )
      return;
    track(
      Promise.all([
        response.allHeaders().catch(() => ({})),
        request.allHeaders().catch(() => request.headers()),
      ]).then(([headers, requestHeaders]) => {
        const fetchAnswer = describeFetchAnswer({
          ...requestDetails(request, requestHeaders),
          status: response.status(),
          responseHeaders: headers,
        });
        if (fetchAnswer) trace.noteAnswer(fetchAnswer, at);
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          trace.noteAnswer(
            describeNavigationAnswer({
              method: request.method(),
              url: response.url(),
              status: response.status(),
              headers,
            }),
            at,
          );
        }
      }),
    );
  });
  page.on('framenavigated', (frame: Frame) => {
    if (frame !== page.mainFrame() || !isSignInUrl(frame.url())) return;
    void report('sign-in');
  });
}
