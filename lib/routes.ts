export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',
  PRICING: '/pricing',
  CHECKOUT_SUCCESS: '/checkout/success',

  APP_DASHBOARD: '/app/dashboard',
  APP_PRACTICE: '/app/practice',
  APP_REVIEW: '/app/review',
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
  APP_QUESTIONS: '/app/questions/',
} as const;

export function toPracticeSessionRoute(sessionId: string): string {
  return `${ROUTES.APP_PRACTICE}/${sessionId}`;
}

export function toQuestionRoute(slug: string): string {
  return `${ROUTES.APP_QUESTIONS}${slug}`;
}
