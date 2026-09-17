export const MONTHLY_PLAN_FEATURES = [
  'Access to all questions',
  'Detailed explanations',
  'Progress tracking',
] as const;

export const ANNUAL_PLAN_FEATURES = [
  'Everything in Pro Monthly',
  'Best value',
] as const;

export const TERMS_VERSION = '2026-08-09';
export const TERMS_CONTENT_SHA256 =
  'b3359b6ae63ba92bd24c7a099deaa366ba6f2a0fa5562611a30672cdb87e450f';
export const CANCELLATION_METHOD =
  'Billing page in the app or support@addictionboards.com';

export const TRIAL_PAYMENT_DISCLOSURE_VERSION = '2026-08-05';
export const ANNUAL_RENEWAL_NOTICE_VERSION = '2026-08-05';
const CHECKOUT_DISCLOSURE_VERSION = '2026-09-16';

const PRICING_PLANS = {
  monthly: {
    name: 'Pro Monthly',
    price: '$29',
    period: '/mo',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    disclosureVersion: CHECKOUT_DISCLOSURE_VERSION,
    features: MONTHLY_PLAN_FEATURES,
    trialCta: 'Start 7-day free trial',
    trialPaymentDisclosure:
      'Pro Monthly starts at $29 per month when your trial ends and renews automatically every month until canceled. If you do not add a payment method, your trial ends and you are not charged. Cancel before the next billing date from the Billing page in the app, or contact support@addictionboards.com. By selecting Add a card to keep access and completing Stripe, you authorize recurring monthly charges after the trial.',
  },
  annual: {
    name: 'Pro Annual',
    price: '$199',
    period: '/yr',
    amountCents: 19900,
    currency: 'usd',
    frequency: 'year',
    disclosureVersion: CHECKOUT_DISCLOSURE_VERSION,
    savings: 'Save $149 per year',
    features: ANNUAL_PLAN_FEATURES,
    trialCta: 'Start 7-day free trial',
    trialPaymentDisclosure:
      'Pro Annual starts at $199 per year when your trial ends and renews automatically every year until canceled. If you do not add a payment method, your trial ends and you are not charged. Cancel before the next billing date from the Billing page in the app, or contact support@addictionboards.com. By selecting Add a card to keep access and completing Stripe, you authorize recurring annual charges after the trial.',
  },
} as const;

type SubscriptionPlan = 'monthly' | 'annual';

export type CheckoutConsent = {
  rows: ReadonlyArray<{ label: string; value: string }>;
  sentence: string;
  buttonLabel: string;
};

function createPlanConsent(
  plan: SubscriptionPlan,
  pricing: { name: string; price: string; frequency: string },
): { trial: CheckoutConsent; standard: CheckoutConsent } {
  const planRow = { label: 'Plan', value: pricing.name };
  const cancellationPath =
    'via the Billing page or support@addictionboards.com.';
  return {
    trial: {
      rows: [
        planRow,
        {
          label: 'Trial',
          value:
            '7 days free; no payment method required. Without one, trial ends with no charge.',
        },
        {
          label: 'After trial',
          value: `If you add a payment method before trial end: ${pricing.price} per ${pricing.frequency}, renewing automatically every ${pricing.frequency} until canceled.`,
        },
        {
          label: 'Cancel',
          value: `Before trial ends or your next billing date ${cancellationPath}`,
        },
      ],
      sentence:
        'By selecting "Start free trial", you agree to these renewal terms. Review our Terms of Service and Privacy Policy.',
      buttonLabel: 'Start free trial',
    },
    standard: {
      rows: [
        planRow,
        {
          label: 'Billing',
          value: `${pricing.price} per ${pricing.frequency}, charged today and renewing automatically every ${pricing.frequency} until canceled.`,
        },
        {
          label: 'Cancel',
          value: `Before your next billing date ${cancellationPath}`,
        },
      ],
      sentence: `By selecting "Subscribe", you authorize recurring ${plan} charges. Review our Terms of Service and Privacy Policy.`,
      buttonLabel: 'Subscribe',
    },
  };
}

export const PRICING_DATA = {
  monthly: {
    ...PRICING_PLANS.monthly,
    consent: createPlanConsent('monthly', PRICING_PLANS.monthly),
  },
  annual: {
    ...PRICING_PLANS.annual,
    consent: createPlanConsent('annual', PRICING_PLANS.annual),
  },
} as const;

export function serializeCheckoutConsent(consent: CheckoutConsent): string {
  return consent.rows
    .map(({ label, value }) => `${label}: ${value}`)
    .concat(consent.sentence)
    .join('\n');
}

function createRenewalTerms(
  plan: SubscriptionPlan,
  disclosureSnapshot: string,
  disclosureVersion: string,
) {
  const pricing = PRICING_DATA[plan];
  return {
    plan,
    amountCents: pricing.amountCents,
    currency: pricing.currency,
    frequency: pricing.frequency,
    disclosureSnapshot,
    disclosureVersion,
    termsVersion: TERMS_VERSION,
    termsHash: TERMS_CONTENT_SHA256,
    cancellationMethod: CANCELLATION_METHOD,
  };
}

export function createCheckoutRenewalTerms(
  plan: SubscriptionPlan,
  hasTrial: boolean,
) {
  const pricing = PRICING_DATA[plan];
  return createRenewalTerms(
    plan,
    serializeCheckoutConsent(pricing.consent[hasTrial ? 'trial' : 'standard']),
    pricing.disclosureVersion,
  );
}

export function createTrialPaymentRenewalTerms(plan: SubscriptionPlan) {
  return createRenewalTerms(
    plan,
    PRICING_DATA[plan].trialPaymentDisclosure,
    TRIAL_PAYMENT_DISCLOSURE_VERSION,
  );
}
