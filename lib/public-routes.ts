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

export const PUBLIC_ROUTE_PATTERNS = [
  ...Object.entries(PUBLIC_PAGE_POLICY).map(([path, policy]) =>
    policy.matchScope === 'exact' ? path : `${path}(.*)`,
  ),
  '/api/cron/reconcile-stripe-subscriptions(.*)',
  '/api/cron/send-renewal-notices(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
] satisfies string[];
