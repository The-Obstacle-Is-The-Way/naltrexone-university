import { ROUTES } from '@/lib/routes';

export const SECURITY_CONTACT_PATH = '/.well-known/security.txt';

export const PUBLIC_ROUTE_PATTERNS = [
  '/',
  '/pricing(.*)',
  `${ROUTES.PRIVACY}(.*)`,
  `${ROUTES.TERMS}(.*)`,
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/cron/reconcile-stripe-subscriptions(.*)',
  '/api/cron/send-renewal-notices(.*)',
  '/api/health(.*)',
  '/api/stripe/webhook(.*)',
  '/api/webhooks/clerk(.*)',
] satisfies string[];
