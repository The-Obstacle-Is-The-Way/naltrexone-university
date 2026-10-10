import type * as Sentry from '@sentry/nextjs';
import { OPERATIONAL_ALERT_FINGERPRINT } from '@/src/adapters/shared/operational-alert-fingerprint';

type DataCollection = NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection']
>;

/**
 * The Sentry environment for a deployment: Vercel's own name for it, or
 * `local` off Vercel. A build mode cannot stand in: `next start` is a
 * production build, and an event labelled production pages the owner.
 */
export function sentryEnvironmentFor(vercelEnv: string | undefined): string {
  return vercelEnv?.trim() || 'local';
}

// Sentry's v10-equivalent deny terms for forwarding and IP headers, matched as
// case-insensitive substrings (Sentry MIGRATION.md, v10 to v11).
const FORWARDING_AND_IP_TERMS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

// Carriers Sentry's built-in sensitive-key list does not match: Clerk's
// handshake and development-session parameters and its `x-clerk-*` headers
// (one holds the full request URL), webhook signature headers (Stripe, Svix),
// the referring URL, Next.js's prerender bypass header, and Vercel's
// proxied-for address.
const CREDENTIAL_TERMS = [
  '__clerk',
  'x-clerk',
  'signature',
  'referer',
  'prerender',
  'proxied',
];

const DENIED = { deny: [...FORWARDING_AND_IP_TERMS, ...CREDENTIAL_TERMS] };

/**
 * DEBT-499: what every Sentry runtime may collect, set explicitly. Sentry v11
 * collects cookies, user info, request and response bodies, unscrubbed
 * headers and database query data when `dataCollection` is unset. This is at
 * least as strict as v10's default, and within the privacy policy's Sentry
 * row. Stack frame variables and context lines keep Sentry's defaults, as in
 * v10.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: DENIED, response: DENIED },
  httpBodies: [],
  urlQueryParams: DENIED,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
} satisfies DataCollection;

// A category Sentry adds later, at the top level or inside one of the
// nested settings, must be set here explicitly: its default may collect.
// Only the two stack-frame settings are left at Sentry's defaults.
type Unset<Ours, Sentrys> = Exclude<keyof NonNullable<Sentrys>, keyof Ours>;
type HttpHeadersByDirection = Exclude<
  NonNullable<DataCollection['httpHeaders']>,
  boolean | { allow: string[] } | { deny: string[] }
>;
type UnsetCategory =
  | Exclude<
      Unset<typeof SENTRY_DATA_COLLECTION, DataCollection>,
      'stackFrameVariables' | 'frameContextLines'
    >
  | Unset<typeof SENTRY_DATA_COLLECTION.genAI, DataCollection['genAI']>
  | Unset<typeof SENTRY_DATA_COLLECTION.graphQL, DataCollection['graphQL']>
  | Unset<typeof SENTRY_DATA_COLLECTION.httpHeaders, HttpHeadersByDirection>;
export const EVERY_CATEGORY_IS_SET: [UnsetCategory] extends [never]
  ? true
  : UnsetCategory = true;

// Query parameters that carry credentials, matched as case-insensitive
// substrings of the name: Clerk's handshake and development-session
// parameters, Clerk's handshake nonce (BUG-331), and the names Sentry treats
// as sensitive keys.
const CREDENTIAL_PARAM_TERMS = [
  '__clerk',
  '__dev_session',
  'token',
  'jwt',
  'session',
  'auth',
  'signature',
  'secret',
  'password',
  'key',
  'code',
  'nonce',
];

// A pair starts the text, or follows a query or fragment separator or
// whitespace, and its value ends at the next of these. So in free text an
// earlier harmless pair cannot run on and hide a later credential (BUG-331).
const QUERY_PAIR = /([?&;#\s]|^)([^=&#?;\s]+)=([^&#?;\s]*)/g;

// A component that is not valid URL encoding is matched as written: this
// runs in beforeSend, and a throw there would lose the event.
function decodeComponent(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    return component;
  }
}

function isCredentialName(name: string): boolean {
  const lowerName = decodeComponent(name).toLowerCase();
  return CREDENTIAL_PARAM_TERMS.some((term) => lowerName.includes(term));
}

/**
 * A URL, path or query string with the value of each credential-bearing
 * query or fragment parameter replaced by `[Filtered]`. A value holding an
 * encoded URL with such a parameter is filtered whole. Sentry's
 * `urlQueryParams` filter does not reach URLs held in other fields: a request
 * path in the Next.js context, a browser event's URL, or a breadcrumb's URL.
 */
export function redactCredentialParams(value: string): string {
  return value.replace(
    QUERY_PAIR,
    (pair, separator: string, name: string, paramValue: string) => {
      if (isCredentialName(name)) return `${separator}${name}=[Filtered]`;
      const decoded = decodeComponent(paramValue);
      return decoded !== paramValue &&
        redactCredentialParams(decoded) !== decoded
        ? `${separator}${name}=[Filtered]`
        : pair;
    },
  );
}

// DEBT-505: an operational alert carries fixed fields only. Sentry fills an
// event from the scope it is raised in, so an alert raised inside a request
// would also carry that request, its user, extra data and breadcrumbs. Only
// these fields, the alert's own tags and its own context are kept.
const ALERT_EVENT_FIELDS = [
  'event_id',
  'timestamp',
  'platform',
  'level',
  'message',
  'fingerprint',
  'environment',
  'release',
  'dist',
  'sdk',
] as const;

// The alert's own fingerprint is the marker, the kind and the window; a
// fingerprint set on the scope goes ahead of it and is dropped.
const ALERT_FINGERPRINT_LENGTH = 3;

function keepAlertFields(
  event: Sentry.ErrorEvent,
  at: number,
): Sentry.ErrorEvent {
  const kept: Sentry.ErrorEvent = { type: undefined };
  for (const field of ALERT_EVENT_FIELDS) {
    if (event[field] !== undefined)
      Object.assign(kept, { [field]: event[field] });
  }
  kept.tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([tag]) =>
      tag.startsWith('alert.'),
    ),
  );
  if (event.contexts?.alert) kept.contexts = { alert: event.contexts.alert };
  const fingerprint = event.fingerprint?.slice(
    at,
    at + ALERT_FINGERPRINT_LENGTH,
  );
  if (fingerprint) kept.fingerprint = fingerprint;
  return kept;
}

/**
 * `beforeSend`: keeps an operational alert to its fixed fields. In any other
 * event it redacts credentials in the URLs it carries and in its own text:
 * each exception's message, linked causes included, a captured message, and
 * every string of its extra data.
 */
export function scrubEvent(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint,
): Sentry.ErrorEvent {
  const at = event.fingerprint?.indexOf(OPERATIONAL_ALERT_FINGERPRINT) ?? -1;
  if (at >= 0) {
    // Sentry builds the envelope's attachments from this hint.
    if (hint) hint.attachments = [];
    return keepAlertFields(event, at);
  }
  // DEBT-513: an error's text is written by our code or a library's, and can
  // quote a URL with its query.
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === 'string') {
      exception.value = redactCredentialParams(exception.value);
    }
  }
  if (typeof event.message === 'string') {
    event.message = redactCredentialParams(event.message);
  }
  // A value captured as an error that is not one, such as a failed server
  // action's result, reaches Sentry as extra data, its message included.
  const extra = event.extra;
  if (extra) {
    for (const [field, value] of Object.entries(extra)) {
      extra[field] = redactStrings(value);
    }
  }
  const request = event.request;
  if (request && typeof request.url === 'string') {
    request.url = redactCredentialParams(request.url);
  }
  if (request && typeof request.query_string === 'string') {
    request.query_string = redactCredentialParams(request.query_string);
  }
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextjs.request_path = redactCredentialParams(nextjs.request_path);
  }
  return event;
}

/**
 * `beforeBreadcrumb` in the browser: redacts credentials in a breadcrumb's
 * message and every string of its data. The browser SDK writes a fetch, XHR or navigation URL to
 * `url`, `from` and `to`. No field is named, because an SDK can add one: the
 * server SDK already writes the query to `url.query` (BUG-331).
 *
 * A console breadcrumb is dropped, as the server sends no breadcrumbs at all.
 * Its line is free text from any script on the page, and its logged values
 * are serialised by the SDK after this hook (an error by its message and
 * stack, a URL by its address, any object by its fields), so no scrubber
 * could find every secret in it.
 */
export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactCredentialParams(breadcrumb.message);
  }
  const data = breadcrumb.data;
  if (data) {
    for (const [field, value] of Object.entries(data)) {
      data[field] = redactStrings(value);
    }
  }
  return breadcrumb;
}

/**
 * `beforeSend` on the server: `scrubEvent`, after dropping any breadcrumbs.
 * `maxBreadcrumbs: 0` stops the SDK recording them, but a scope's own
 * `addBreadcrumb` ignores that limit (BUG-331).
 */
export function scrubServerEvent(
  event: Sentry.ErrorEvent,
  hint?: Sentry.EventHint,
): Sentry.ErrorEvent {
  delete event.breadcrumbs;
  return scrubEvent(event, hint);
}

type StreamedSpan = Parameters<
  NonNullable<Sentry.NodeOptions['beforeSendSpan']>
>[0];

// Matched by tag, as Sentry does, so an error from another frame counts.
function isErrorValue(value: unknown): value is Error {
  return Object.prototype.toString.call(value) === '[object Error]';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * A copy of `value` with credentials redacted in every string, through arrays,
 * plain objects and errors; any other object becomes its type, such as
 * `[object URL]`. An error is copied by its name, message, stack and own
 * enumerable properties. The values found are copied, never changed, and a
 * reference back to an enclosing value becomes `[Circular]`.
 */
function redactStrings(
  value: unknown,
  enclosing: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === 'string') return redactCredentialParams(value);
  const isError = isErrorValue(value);
  if (!isError && !Array.isArray(value) && !isPlainObject(value)) {
    // Sentry would serialise any other object after this hook, by its fields
    // or its toJSON, past any redaction here; only its type is kept.
    return value !== null && typeof value === 'object'
      ? Object.prototype.toString.call(value)
      : value;
  }
  if (enclosing.has(value)) return '[Circular]';
  enclosing.add(value);
  const redactEntries = (entries: Array<[string, unknown]>) =>
    Object.fromEntries(
      entries.map(([name, item]) => [name, redactStrings(item, enclosing)]),
    );
  const copy = Array.isArray(value)
    ? value.map((item) => redactStrings(item, enclosing))
    : isError
      ? redactEntries([
          ['name', value.name],
          ['message', value.message],
          ['stack', value.stack],
          ...Object.entries(value),
        ])
      : redactEntries(Object.entries(value));
  enclosing.delete(value);
  return copy;
}

/**
 * `beforeSendSpan` on the server: redacts credentials in a span's name and
 * every string attribute. Next.js opens each request's server span and keeps
 * the raw request URL in `http.target`, which Sentry's query filter does not
 * reach (BUG-331).
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = redactCredentialParams(span.name);
  redactAttributes(span.attributes);
  for (const link of span.links ?? []) {
    if (link.attributes) redactAttributes(link.attributes);
  }
  return span;
}

function redactAttributes(attributes: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(attributes)) {
    attributes[name] = redactStrings(value);
  }
}

type Integration = Extract<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['integrations']>,
  unknown[]
>[number];

function scrubTraceHeader(header: Record<string, unknown>): void {
  const trace = header.trace;
  if (
    trace &&
    typeof trace === 'object' &&
    'transaction' in trace &&
    typeof trace.transaction === 'string'
  ) {
    trace.transaction = redactCredentialParams(trace.transaction);
  }
}

// BUG-331: an envelope's trace header carries the request span's name. When
// Next.js falls back to its error page, @sentry/nextjs names that span after
// the raw request URL, and no beforeSend hook sees envelope headers.
const SCRUB_ENVELOPE_TRACE: Integration = {
  name: 'ScrubEnvelopeTrace',
  setup(client) {
    client.on('beforeEnvelope', (envelope) => scrubTraceHeader(envelope[0]));
  },
};

/**
 * The server's integrations: Sentry's defaults without `ProcessSession`, plus
 * the envelope trace scrubber. Once Sentry has a release, as on CI and Vercel,
 * `ProcessSession` sends a release-health session envelope that copies the
 * scope's user, and `beforeSend` never sees it (DEBT-505). The server does not
 * use release health.
 */
export function serverIntegrations(integrations: Integration[]): Integration[] {
  return [
    ...integrations.filter(
      (integration) => integration.name !== 'ProcessSession',
    ),
    SCRUB_ENVELOPE_TRACE,
  ];
}

/**
 * The server SDK's settings apart from its key and environment, kept here so
 * the real-SDK tests initialise Sentry with what `instrumentation.ts` uses.
 *
 * BUG-331: the server sends no breadcrumbs. Its outgoing calls and console
 * lines held Clerk's handshake nonce and logged values, and a breadcrumb
 * recorded outside a request's scope reaches later visitors' events. Server
 * errors are diagnosed from stack traces and our own logs.
 */
export const SENTRY_SERVER_SETTINGS = {
  tracesSampleRate: 0.05,
  // The SDK would otherwise read SENTRY_TRACE_LIFECYCLE, and in 'static' mode
  // it ignores beforeSendSpan.
  traceLifecycle: 'stream',
  // Stripe, Clerk and every other outgoing call get no trace headers: they
  // would carry this project's key and the request's name. The server calls
  // no service of ours to continue a trace in.
  tracePropagationTargets: [],
  maxBreadcrumbs: 0,
  integrations: serverIntegrations,
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: scrubServerEvent,
  beforeSendSpan: scrubSpan,
} satisfies Sentry.NodeOptions;
