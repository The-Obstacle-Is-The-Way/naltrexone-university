import type { Frame, Page, Request, Response } from '@playwright/test';
import { TimeoutError, withTimeout } from '../../../lib/with-timeout';
import { observeFailedFetchAlerts } from './clerk-fetch-alert';
import {
  decision,
  describeFailedRequest,
  describeFetchAnswer,
  tracePath,
  tracePlace,
  undecided,
} from './clerk-fetch-trace';
import { DIAGNOSIS_TIMEOUT_MS } from './clerk-session-deadlines';
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
  const path = tracePath(new URL(answer.url).pathname);
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

function numericMetadata(name: string, value: unknown): string {
  const text =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : (JSON.stringify(value) ?? '');
  return `${name}${/^\d+$/.test(text) ? `=${text}` : ` length=${text.length}`}`;
}

function sessionTimes(token: string): string {
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    if (!isRecord(claims)) return '';
    return ['iat', 'exp']
      .flatMap((name) =>
        name in claims ? [numericMetadata(name, claims[name])] : [],
      )
      .join(' ');
  } catch {
    // An unreadable token still reports its length, never its value.
    return '';
  }
}

function describeSetCookies(header: string | undefined): string[] {
  if (!header) return [];
  return header.split('\n').flatMap((line) => {
    const [pair = '', ...attributes] = line.split(';');
    const [name = '', ...parts] = pair.trim().split('=');
    const value = parts.join('=');
    const cleared =
      value === '' ||
      attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (name === '__clerk_redirect_count')
      return [numericMetadata(name, value)];
    if (name.startsWith('__session'))
      return [`${name} ${cleared ? 'cleared' : 'set'}`];
    if (name.startsWith('__client_uat')) return [numericMetadata(name, value)];
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
  let text = `${answer.method} ${tracePlace(url)} ${answer.status}`;
  const rawStatus = answer.headers['x-clerk-auth-status'];
  const rawReason = answer.headers['x-clerk-auth-reason'];
  const status = decision(rawStatus);
  const reason = decision(rawReason);
  if (status) text += ` auth=${status}${reason ? `/${reason}` : ''}`;
  text += undecided('auth', rawStatus) + undecided('reason', rawReason);
  const location = answer.headers.location;
  if (location) {
    const target = new URL(location, url);
    text += ` → ${tracePlace(target)}`;
    const hsReason = target.searchParams.get('__clerk_hs_reason');
    if (hsReason !== null)
      text += decision(hsReason)
        ? ` hs_reason=${hsReason}`
        : undecided('hs_reason', hsReason);
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
      if (name.startsWith('__client_uat')) {
        parts.push(numericMetadata(name, value));
      } else {
        const times = name.startsWith('__session') ? sessionTimes(value) : '';
        parts.push(`${name} length=${value.length}${times ? ` ${times}` : ''}`);
      }
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

type TraceReason = 'sign-in' | 'failed-fetch alert' | 'test failure';
// A navigation burst can add about 60 action/RSC answers. Keep the preceding
// Clerk environment answer and failure as well, without an unbounded log.
const TRACE_ENTRY_LIMIT = 100;

/** A bounded, timed record that preserves each distinct failure signal. */
export class ClerkAuthTrace {
  private readonly entries: Array<{ at: number; text: string }> = [];
  private readonly startedAt: number;
  private readonly reported = new Set<TraceReason>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = TRACE_ENTRY_LIMIT,
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

  report(
    cookies: string,
    reason: TraceReason = 'test failure',
  ): string[] | null {
    if (
      this.reported.has(reason) ||
      (reason === 'test failure' && this.reported.size > 0)
    )
      return null;
    this.reported.add(reason);
    return [
      ...this.entries.map(
        ({ at, text }) => `+${at - this.startedAt}ms ${text}`,
      ),
      `cookies: ${cookies}`,
    ];
  }
}

const reporters = new WeakMap<Page, (reason: TraceReason) => Promise<void>>();

/** Called by the authenticated-test fixture before Playwright closes the page. */
export async function reportFailedClerkAuthTrace(page: Page): Promise<void> {
  await reporters.get(page)?.('test failure');
}

/** The same reporting path serves page signals and fixture teardown. */
export async function reportClerkAuthTrace(input: {
  trace: ClerkAuthTrace;
  pending: Iterable<Promise<void>>;
  reason: TraceReason;
  readCookies: () => Promise<Array<{ name: string; value: string }>>;
  write: (text: string) => void;
}): Promise<void> {
  const cookies = await withTimeout(
    (async () => {
      await Promise.allSettled([...input.pending]);
      return input.readCookies();
    })(),
    DIAGNOSIS_TIMEOUT_MS,
  ).catch((error: unknown) => {
    input.trace.noteAnswer(
      error instanceof TimeoutError
        ? `Some diagnostic reads timed out after ${DIAGNOSIS_TIMEOUT_MS}ms`
        : 'Context cookies could not be read',
    );
    return undefined;
  });
  const lines = input.trace.report(
    cookies ? describeClerkCookies(cookies) : 'unavailable',
    input.reason,
  );
  if (lines)
    input.write(
      redactSensitiveE2EText(
        [`[E2E_CLERK_AUTH_TRACE] ${input.reason}:`, ...lines].join('\n  '),
      ),
    );
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
  const report = (reason: TraceReason) =>
    reportClerkAuthTrace({
      trace,
      pending,
      reason,
      write,
      readCookies: () => page.context().cookies(),
    });
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
    // Chromium's loadingFailed can resolve allHeaders() to provisional
    // headers. Do not turn their missing Cookie field into wire evidence.
    trace.noteAnswer(
      describeFailedRequest({
        ...requestDetails(request, request.headers()),
        failure: request.failure()?.errorText ?? 'unknown',
      }),
      at,
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
