import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import { createStripeTestClient } from './stripe-test-client';

const execFileAsync = promisify(execFile);
const STRIPE_IDENTIFIER_PATTERN =
  /\b(cus|sub|clock|acct|req|seti|si|pm|in|price|cs|evt|sk_test)_[A-Za-z0-9]+\b/g;

export const STRIPE_CLI_TRIGGER_TIMEOUT_MS = 30_000;

type StripeCompletedCheckoutInput = {
  plan: 'annual' | 'monthly-trial';
  userId: string;
  marker: string;
  email: string;
  e2eOwner: string;
  priceId: string;
  amountCents: number;
};

type TriggerStripeCompletedCheckoutInput = StripeCompletedCheckoutInput & {
  stripeSecretKey: string;
};

type StripeCliInvocation = {
  command: string;
  args: string[];
  env: { STRIPE_API_KEY: string };
  timeoutMs: number;
};

export type StripeCliRunner = (
  invocation: StripeCliInvocation,
) => Promise<void>;

function add(args: string[], value: string): void {
  args.push('--add', value);
}

function override(args: string[], value: string): void {
  args.push('--override', value);
}

function remove(args: string[], value: string): void {
  args.push('--remove', value);
}

export function buildStripeCompletedCheckoutTriggerArgs(
  input: StripeCompletedCheckoutInput,
): string[] {
  const args = [
    'exec',
    'stripe',
    'trigger',
    'checkout.session.completed',
    '--api-version',
    STRIPE_API_VERSION,
  ];

  override(args, 'checkout_session:mode=subscription');
  // Stripe CLI's dotted rewrite parser treats `line_items[0]` as a literal
  // form key. Keeping the fixture's original `line_items` array would send two
  // index-zero prices in nondeterministic map order. Remove it before adding
  // the configured recurring Price so Stripe always receives one line item.
  remove(args, 'checkout_session:line_items');
  add(args, `checkout_session:line_items[0].price=${input.priceId}`);
  add(args, 'checkout_session:line_items[0].quantity=1');
  remove(args, 'checkout_session:payment_intent_data');
  add(args, `checkout_session:client_reference_id=${input.marker}`);
  add(args, `checkout_session:metadata.e2e_owner=${input.e2eOwner}`);
  add(args, `checkout_session:metadata.e2e_marker=${input.marker}`);
  add(
    args,
    `checkout_session:subscription_data.metadata.user_id=${input.userId}`,
  );
  add(
    args,
    `checkout_session:subscription_data.metadata.e2e_owner=${input.e2eOwner}`,
  );
  add(
    args,
    `checkout_session:subscription_data.metadata.e2e_marker=${input.marker}`,
  );
  add(args, `product:metadata.e2e_owner=${input.e2eOwner}`);
  add(args, `product:metadata.e2e_marker=${input.marker}`);

  if (input.plan === 'annual') {
    override(args, `payment_page_confirm:expected_amount=${input.amountCents}`);
    return args;
  }

  add(args, 'checkout_session:payment_method_collection=if_required');
  add(args, 'checkout_session:subscription_data.trial_period_days=7');
  add(
    args,
    'checkout_session:subscription_data.trial_settings.end_behavior.missing_payment_method=cancel',
  );
  remove(args, 'payment_page_confirm:payment_method');
  add(args, `payment_page_confirm:customer_data.email=${input.email}`);
  override(args, 'payment_page_confirm:expected_amount=0');
  return args;
}

const defaultRunner: StripeCliRunner = async (invocation) => {
  await execFileAsync(invocation.command, invocation.args, {
    env: {
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      PATH: process.env.PATH,
      STRIPE_API_KEY: invocation.env.STRIPE_API_KEY,
    },
    maxBuffer: 1024 * 1024,
    timeout: invocation.timeoutMs,
  });
};

export async function triggerStripeCompletedCheckout(
  input: TriggerStripeCompletedCheckoutInput,
  run: StripeCliRunner = defaultRunner,
): Promise<void> {
  if (input.stripeSecretKey.includes('dummy')) {
    throw new Error(
      '[E2E_STRIPE_CLI:TEST_MODE_REQUIRED] A real Stripe test-mode key is required.',
    );
  }
  createStripeTestClient(input.stripeSecretKey);

  try {
    await run({
      command: 'pnpm',
      args: buildStripeCompletedCheckoutTriggerArgs(input),
      env: { STRIPE_API_KEY: input.stripeSecretKey },
      timeoutMs: STRIPE_CLI_TRIGGER_TIMEOUT_MS,
    });
  } catch (error) {
    const redacted = String(error).replace(
      STRIPE_IDENTIFIER_PATTERN,
      '$1_[REDACTED]',
    );
    throw new Error(`[E2E_STRIPE_CLI:TRIGGER_FAILED] ${redacted}`);
  }
}
