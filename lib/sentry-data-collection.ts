import type * as Sentry from '@sentry/nextjs';

type DataCollection = NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection']
>;

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
// parameters, and the names Sentry treats as sensitive keys.
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

/** `beforeSend`: redacts credentials in the URLs an event carries. */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
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

const BREADCRUMB_URL_FIELDS = ['url', 'from', 'to'] as const;

/** `beforeBreadcrumb`: redacts credentials in a fetch, XHR or navigation URL. */
export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const field of BREADCRUMB_URL_FIELDS) {
      const value = data[field];
      if (typeof value === 'string')
        data[field] = redactCredentialParams(value);
    }
  }
  return breadcrumb;
}
