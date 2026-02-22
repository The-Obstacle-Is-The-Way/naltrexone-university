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
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
  APP_QUESTIONS: '/app/questions',
} as const;

export function toPracticeSessionRoute(sessionId: string): string {
  return `${ROUTES.APP_PRACTICE}/${sessionId}`;
}

export type QuestionOrigin = 'dashboard' | 'bookmarks' | 'practice' | 'history';

export type QuestionMode = 'review';

export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin;
    mode?: QuestionMode;
    sessionId?: string;
    attemptId?: string;
    historyHref?: string;
    historySeq?: string;
    historyIndex?: number;
  },
): string {
  const base = `${ROUTES.APP_QUESTIONS}/${slug}`;
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  if (options?.mode) params.set('mode', options.mode);
  if (options?.sessionId) params.set('sessionId', options.sessionId);
  if (options?.attemptId) params.set('attemptId', options.attemptId);
  if (options?.historyHref) params.set('historyHref', options.historyHref);
  if (options?.historySeq) params.set('historySeq', options.historySeq);
  if (options?.historyIndex !== undefined) {
    params.set('historyIndex', String(options.historyIndex));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
