export const ROUTES = {
  HOME: '/',
  PRICING: '/pricing',
  CHECKOUT_SUCCESS: '/checkout/success',

  APP_DASHBOARD: '/app/dashboard',
  APP_PRACTICE: '/app/practice',
  APP_REVIEW: '/app/review',
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
} as const;

export function toPracticeSessionRoute(sessionId: string): string {
  return `${ROUTES.APP_PRACTICE}/${sessionId}`;
}
