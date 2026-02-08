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
  },
  annual: {
    name: 'Pro Annual',
    price: '$199',
    period: '/yr',
    savings: 'Save $149 per year',
    features: ANNUAL_PLAN_FEATURES,
  },
} as const;
