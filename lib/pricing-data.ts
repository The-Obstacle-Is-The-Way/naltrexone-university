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
    trialCta: 'Start 7-day free trial',
    trialDisclosure:
      '7-day free trial; no payment method required to start. If you add a payment method before the trial ends, Pro Monthly starts at $29 per month and renews automatically every month until canceled. If you do not add a payment method, the trial ends and you are not charged. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Start 7-day free trial, you agree to these renewal terms if you later add a payment method.',
    standardDisclosure:
      '$29 is charged when Pro Monthly starts and it renews automatically every month until canceled. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Subscribe Monthly, you authorize recurring monthly charges.',
    trialPaymentDisclosure:
      'Pro Monthly starts at $29 per month when your trial ends and renews automatically every month until canceled. If you do not add a payment method, your trial ends and you are not charged. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Add a card to keep access and completing Stripe, you authorize recurring monthly charges after the trial.',
  },
  annual: {
    name: 'Pro Annual',
    price: '$199',
    period: '/yr',
    savings: 'Save $149 per year',
    features: ANNUAL_PLAN_FEATURES,
    trialCta: 'Start 7-day free trial',
    trialDisclosure:
      '7-day free trial; no payment method required to start. If you add a payment method before the trial ends, Pro Annual starts at $199 per year and renews automatically every year until canceled. If you do not add a payment method, the trial ends and you are not charged. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Start 7-day free trial, you agree to these renewal terms if you later add a payment method.',
    standardDisclosure:
      '$199 is charged when Pro Annual starts and it renews automatically every year until canceled. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Subscribe Annual, you authorize recurring annual charges.',
    trialPaymentDisclosure:
      'Pro Annual starts at $199 per year when your trial ends and renews automatically every year until canceled. If you do not add a payment method, your trial ends and you are not charged. Cancel before the next billing date in Account Settings → Billing, or contact support@addictionboards.com. By selecting Add a card to keep access and completing Stripe, you authorize recurring annual charges after the trial.',
  },
} as const;
