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

const QUERY_PAIR = /([?&;]|^)([^=&#?;]+)=([^&#;]*)/g;

// A name that is not valid URL encoding is matched as written: this runs in
// beforeSend, and a throw there would lose the event.
function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * A URL, path or query string with the value of each credential-bearing
 * query parameter replaced by `[Filtered]`. Sentry's `urlQueryParams`
 * filter does not reach URLs held in other fields: a request path in the
 * Next.js context, a browser event's URL, or a breadcrumb's URL.
 */
export function redactCredentialParams(value: string): string {
  return value.replace(QUERY_PAIR, (pair, separator: string, name: string) => {
    const lowerName = decodeName(name).toLowerCase();
    return CREDENTIAL_PARAM_TERMS.some((term) => lowerName.includes(term))
      ? `${separator}${name}=[Filtered]`
      : pair;
  });
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
 * `beforeSend`: keeps an operational alert to its fixed fields, and redacts
 * credentials in the URLs any other event carries.
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
 * `beforeBreadcrumb` in the browser: redacts credentials in every string of a
 * breadcrumb's data. The browser SDK writes a fetch, XHR or navigation URL to
 * `url`, `from` and `to`. No field is named, because an SDK can add one: the
 * server SDK already writes the query to `url.query` (BUG-331).
 */
export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const [field, value] of Object.entries(data)) {
      if (typeof value === 'string')
        data[field] = redactCredentialParams(value);
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

function redactStrings(value: unknown): unknown {
  if (typeof value === 'string') return redactCredentialParams(value);
  if (Array.isArray(value)) return value.map(redactStrings);
  return value;
}

/**
 * `beforeSendSpan` on the server: redacts credentials in a span's name and
 * every string attribute. Next.js opens each request's server span and keeps
 * the raw request URL in `http.target`, which Sentry's query filter does not
 * reach (BUG-331).
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = redactCredentialParams(span.name);
  const attributes: Record<string, unknown> = span.attributes;
  for (const [name, value] of Object.entries(attributes)) {
    attributes[name] = redactStrings(value);
  }
  return span;
}

type Integration = Extract<
  NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['integrations']>,
  unknown[]
>[number];

/**
 * The server's integrations: Sentry's defaults without `ProcessSession`. Once
 * Sentry has a release, as on CI and Vercel, that integration sends a
 * release-health session envelope that copies the scope's user, and
 * `beforeSend` never sees it (DEBT-505). The server does not use release
 * health.
 */
export function withoutProcessSession(
  integrations: Integration[],
): Integration[] {
  return integrations.filter(
    (integration) => integration.name !== 'ProcessSession',
  );
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
  maxBreadcrumbs: 0,
  integrations: withoutProcessSession,
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeSend: scrubServerEvent,
  beforeSendSpan: scrubSpan,
} satisfies Sentry.NodeOptions;
