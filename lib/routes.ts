export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',
  PRICING: '/pricing',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  CHECKOUT_SUCCESS: '/checkout/success',

  APP_DASHBOARD: '/app/dashboard',
  APP_PRACTICE: '/app/practice',
  APP_PRACTICE_QUICK: '/app/practice/quick',
  APP_HISTORY: '/app/history',
  APP_BOOKMARKS: '/app/bookmarks',
  APP_BILLING: '/app/billing',
  APP_QUESTIONS: '/app/questions',
} as const;

export const AUTH_REDIRECT_QUERY_PARAM = 'redirect_url';

export const PRICING_QUERY_PARAMS = {
  checkout: 'checkout',
  plan: 'plan',
  portal: 'portal',
  reason: 'reason',
} as const;

export type PricingPlan = 'monthly' | 'annual';
export type PricingCheckoutStatus = 'cancel' | 'error' | 'rate_limited';
export type PricingPortalStatus = 'error';
export type PricingRedirectReason =
  | 'manage_billing'
  | 'payment_processing'
  | 'subscription_canceled'
  | 'subscription_required';
export type PricingBillingRecoveryReason = Extract<
  PricingRedirectReason,
  'manage_billing' | 'payment_processing'
>;

export type PricingRouteOptions = {
  checkout?: PricingCheckoutStatus | undefined;
  plan?: PricingPlan | undefined;
  portal?: PricingPortalStatus | undefined;
  reason?: PricingRedirectReason | undefined;
};

export function toPricingRoute(options: PricingRouteOptions = {}): string {
  const params = new URLSearchParams();
  if (options.checkout) {
    params.set(PRICING_QUERY_PARAMS.checkout, options.checkout);
  }
  if (options.portal) {
    params.set(PRICING_QUERY_PARAMS.portal, options.portal);
  }
  if (options.reason) {
    params.set(PRICING_QUERY_PARAMS.reason, options.reason);
  }
  if (options.plan) {
    params.set(PRICING_QUERY_PARAMS.plan, options.plan);
  }

  const qs = params.toString();
  return qs ? `${ROUTES.PRICING}?${qs}` : ROUTES.PRICING;
}

export function toSignUpRedirectRoute(returnDestination: string): string {
  const params = new URLSearchParams();
  params.set(AUTH_REDIRECT_QUERY_PARAM, returnDestination);
  return `${ROUTES.SIGN_UP}?${params.toString()}`;
}

export function toPracticeSessionRoute(sessionId: string): string {
  return `${ROUTES.APP_PRACTICE}/${sessionId}`;
}

export type QuestionOrigin =
  | 'dashboard'
  | 'bookmarks'
  | 'practice'
  | 'history'
  | 'summary';

export type QuestionMode = 'review';

export function toQuestionRoute(
  slug: string,
  options?: {
    from?: QuestionOrigin | undefined;
    mode?: QuestionMode | undefined;
    sessionId?: string | undefined;
    attemptId?: string | undefined;
    historyHref?: string | undefined;
    historySeq?: string | undefined;
    historyIndex?: number | undefined;
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
