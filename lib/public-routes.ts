export const PUBLIC_ROUTE_PATTERNS = [
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/cron/reconcile-stripe-subscriptions(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
] satisfies string[];
