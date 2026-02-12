export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',
  PRICING: '/pricing',
  CHECKOUT_SUCCESS: '/checkout/success',

  APP_DASHBOARD: '/app/dashboard',
  APP_PRACTICE: '/app/practice',
  APP_PRACTICE_QUICK: '/app/practice/quick',
  APP_HISTORY: '/app/history',
  APP_REVIEW: '/app/review',
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
  APP_QUESTIONS: '/app/questions',
} as const;

export function toPracticeSessionRoute(sessionId: string): string {
  return `${ROUTES.APP_PRACTICE}/${sessionId}`;
}

export type QuestionOrigin =
  | 'dashboard'
  | 'review'
  | 'bookmarks'
  | 'practice'
  | 'history';

export type QuestionMode = 'review';

export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
  },
): string {
  const base = `${ROUTES.APP_QUESTIONS}/${slug}`;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  if (options?.mode) params.set('mode', options.mode);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
