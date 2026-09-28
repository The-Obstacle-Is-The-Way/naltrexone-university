import { CANCELLATION_AND_REFUND_POLICY } from '@/src/application/shared/renewal-notice-email-format';
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

// DEBT-414 F03b: the add-card offer becomes structured consent with an opt-in.
export const TRIAL_PAYMENT_DISCLOSURE_VERSION = '2026-09-28.2';
export const ANNUAL_RENEWAL_NOTICE_VERSION = '2026-08-05';
// DEBT-414 F02: a monthly subscriber's yearly reminder.
export const MONTHLY_ANNIVERSARY_NOTICE_VERSION = '2026-09-27';
// DEBT-414 F03: a same-day revision of the 2026-09-28 text adds the opt-in.
const CHECKOUT_DISCLOSURE_VERSION = '2026-09-28.2';

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
  },
} as const;

type SubscriptionPlan = 'monthly' | 'annual';

export type CheckoutConsent = {
  rows: ReadonlyArray<{ label: string; value: string }>;
  // DEBT-414 F03: the separate, unchecked renewal opt-in's label.
  optIn: string;
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
  // DEBT-414 F15: the operative policy, quoted from Terms § 4, next to consent.
  const cancellationAndRefundsRow = {
    label: 'Cancellation and refunds',
    value: CANCELLATION_AND_REFUND_POLICY,
  };
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
        cancellationAndRefundsRow,
      ],
      optIn: `I agree that, if I add a payment method, ${pricing.name} renews automatically at ${pricing.price} per ${pricing.frequency} after my trial until I cancel.`,
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
        cancellationAndRefundsRow,
      ],
      optIn: `I agree that ${pricing.name} renews automatically at ${pricing.price} per ${pricing.frequency} until I cancel.`,
      sentence: `By selecting "Subscribe", you authorize recurring ${plan} charges. Review our Terms of Service and Privacy Policy.`,
      buttonLabel: 'Subscribe',
    },
  };
}

// DEBT-414 F03b: the trial add-card offer, shown in the same consent dialog
// as checkout, with its own separate renewal opt-in.
function createTrialPaymentConsent(
  plan: SubscriptionPlan,
  pricing: { name: string; price: string; frequency: string },
): CheckoutConsent {
  return {
    rows: [
      { label: 'Plan', value: pricing.name },
      {
        label: 'After trial',
        value: `${pricing.price} per ${pricing.frequency} when your trial ends, renewing automatically every ${pricing.frequency} until canceled.`,
      },
      {
        label: 'Without a card',
        value: 'Your trial ends and you are not charged.',
      },
      {
        label: 'Cancel',
        value:
          'Before your next billing date via the Billing page or support@addictionboards.com.',
      },
      {
        label: 'Cancellation and refunds',
        value: CANCELLATION_AND_REFUND_POLICY,
      },
    ],
    optIn: `I agree that ${pricing.name} renews automatically at ${pricing.price} per ${pricing.frequency} when my trial ends, until I cancel.`,
    sentence: `By selecting "Add a card" and completing Stripe, you authorize recurring ${plan} charges after the trial. Review our Terms of Service and Privacy Policy.`,
    buttonLabel: 'Add a card',
  };
}

function createPlanData<Plan extends SubscriptionPlan>(plan: Plan) {
  const pricing = PRICING_PLANS[plan];
  const trialPaymentConsent = createTrialPaymentConsent(plan, pricing);
  return {
    ...pricing,
    consent: createPlanConsent(plan, pricing),
    trialPaymentConsent,
    trialPaymentDisclosure: serializeCheckoutConsent(trialPaymentConsent),
  };
}

export const PRICING_DATA = {
  monthly: createPlanData('monthly'),
  annual: createPlanData('annual'),
} as const;

export function serializeCheckoutConsent(consent: CheckoutConsent): string {
  return consent.rows
    .map(({ label, value }) => `${label}: ${value}`)
    .concat(consent.optIn, consent.sentence)
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
