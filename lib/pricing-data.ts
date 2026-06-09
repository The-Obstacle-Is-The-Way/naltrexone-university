export const MONTHLY_PLAN_FEATURES = [
  'Access to all questions',
  'Detailed explanations',
  'Progress tracking',
] as const;

export const ANNUAL_PLAN_FEATURES = [
  'Everything in Pro Monthly',
  'Best value',
] as const;

export const PRICING_DATA = {
  monthly: {
    name: 'Pro Monthly',
    price: '$29',
    period: '/mo',
    features: MONTHLY_PLAN_FEATURES,
    // DEBT-410: CTA copy shown only while FREE_TRIAL_ENABLED is on.
    // Per spec §B.8.1 the "no card required" reassurance sits on the annual
    // (visually primary) card only; the trial-forward pricing banner carries
    // it page-wide, so the monthly note stays minimal by design.
    trialCta: 'Start 7-day free trial',
    postTrialNote: 'then $29/mo',
  },
  annual: {
    name: 'Pro Annual',
    price: '$199',
    period: '/yr',
    savings: 'Save $149 per year',
    features: ANNUAL_PLAN_FEATURES,
    trialCta: 'Start 7-day free trial',
    postTrialNote: 'then $199/yr · no card required',
  },
} as const;
