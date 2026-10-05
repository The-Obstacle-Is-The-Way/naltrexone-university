import type * as Sentry from '@sentry/nextjs';

type DataCollection = NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection']
>;

// Sentry's v10-equivalent deny terms for forwarding and IP headers, matched as
// case-insensitive substrings (Sentry MIGRATION.md, v10 to v11).
const FORWARDING_AND_IP_TERMS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

// Credential carriers Sentry's built-in sensitive-key list does not match:
// Clerk's handshake and development-session parameters, and webhook
// signature headers (Stripe, Svix).
const CREDENTIAL_TERMS = ['__clerk', 'signature'];

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

// A category Sentry adds later must be set here explicitly: its default may
// collect. Only the two stack-frame settings are left at Sentry's defaults.
type UnsetCategory = Exclude<
  keyof DataCollection,
  | keyof typeof SENTRY_DATA_COLLECTION
  | 'stackFrameVariables'
  | 'frameContextLines'
>;
export const EVERY_CATEGORY_IS_SET: [UnsetCategory] extends [never]
  ? true
  : UnsetCategory = true;
