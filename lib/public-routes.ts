import { ROUTES } from '@/lib/routes';

// Public discovery metadata always names the production apex, not a preview host.
export const PUBLIC_SITE_ORIGIN = 'https://addictionboards.com';

export const SECURITY_CONTACT_PATH = '/.well-known/security.txt';
export const PUBLIC_SOCIAL_IMAGE_PATH = '/opengraph-image';

export const PUBLIC_RESOURCE_PATHS: readonly string[] = [
  SECURITY_CONTACT_PATH,
  '/robots.txt',
  '/sitemap.xml',
  PUBLIC_SOCIAL_IMAGE_PATH,
];

// Preserve Clerk's existing prefix matchers; sitemap entries use only the keys.
export const PUBLIC_PAGE_POLICY = {
  [ROUTES.HOME]: { matchScope: 'exact', indexable: true },
  [ROUTES.PRICING]: { matchScope: 'prefix', indexable: true },
  [ROUTES.PRIVACY]: { matchScope: 'prefix', indexable: true },
  [ROUTES.TERMS]: { matchScope: 'prefix', indexable: true },
  [ROUTES.SIGN_IN]: { matchScope: 'prefix', indexable: false },
  [ROUTES.SIGN_UP]: { matchScope: 'prefix', indexable: false },
} satisfies Record<
  string,
  { matchScope: 'exact' | 'prefix'; indexable: boolean }
>;

// The only routes that take an Authorization header: Vercel Cron sends
// CRON_SECRET in it, and each route checks it itself, with no Clerk session.
export const CRON_ROUTE_PATHS: readonly string[] = [
  '/api/cron/reconcile-stripe-subscriptions',
  '/api/cron/send-renewal-notices',
];

// /checkout/success stays protected, so Clerk's middleware restores the session
// after Stripe's redirect before the page syncs the subscription. Its
// session_id must survive Clerk's sign-in and handshake redirects, which
// proxy.test.ts pins; leave Clerk's force-redirect environment variables unset,
// since they would override redirect_url (DEBT-249).
export const PUBLIC_ROUTE_PATTERNS = [
  ...Object.entries(PUBLIC_PAGE_POLICY).map(([path, policy]) =>
    policy.matchScope === 'exact' ? path : `${path}(.*)`,
  ),
  ...CRON_ROUTE_PATHS.map((path) => `${path}(.*)`),
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
  '/api/webhooks/resend(.*)',
] satisfies string[];
