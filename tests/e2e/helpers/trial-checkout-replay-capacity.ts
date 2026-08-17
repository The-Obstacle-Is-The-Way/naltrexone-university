import postgres from 'postgres';
import Stripe from 'stripe';
import { SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT } from '@/src/adapters/gateways/stripe/stripe-checkout-sessions';

const STRIPE_IDEMPOTENCY_MINIMUM_RETENTION_SECONDS = 24 * 60 * 60;
const TRIAL_CHECKOUT_PLAN = 'monthly';
const TRIAL_CHECKOUT_VARIANT = 'trial:7';
const STRIPE_PAGE_SIZE = 100;

type LocalBillingState = {
  userId: string;
  stripeCustomerId: string;
};

type LocalCheckoutSessionCensusRecord = {
  created: number;
  mode: string | null;
  status: string | null;
  metadata: Record<string, string> | null;
};

export type LocalTrialCheckoutReplayCapacityServices = {
  resolveBillingState: (input: {
    databaseUrl: string;
    email: string;
  }) => Promise<LocalBillingState | null>;
  listRecentCheckoutSessions: (input: {
    stripeSecretKey: string;
    stripeCustomerId: string;
    createdGte: number;
  }) => Promise<LocalCheckoutSessionCensusRecord[]>;
};

type AssertLocalTrialCheckoutReplayCapacityInput = {
  env?: NodeJS.ProcessEnv;
  nowMs?: () => number;
  services?: Partial<LocalTrialCheckoutReplayCapacityServices>;
};

class LocalTrialCheckoutReplayCapacityError extends Error {
  constructor(
    public readonly code:
      | 'E2E_CHECKOUT_CHAIN_PROBE_FAILED'
      | 'E2E_CHECKOUT_CHAIN_SATURATED',
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LocalTrialCheckoutReplayCapacityError';
  }
}

const defaultServices: LocalTrialCheckoutReplayCapacityServices = {
  resolveBillingState: async ({ databaseUrl, email }) => {
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      const rows = await sql<LocalBillingState[]>`
        SELECT
          app_user.id AS "userId",
          customer.stripe_customer_id AS "stripeCustomerId"
        FROM users app_user
        INNER JOIN stripe_customers customer
          ON customer.user_id = app_user.id
        WHERE app_user.email = ${email}
        LIMIT 1
      `;
      return rows[0] ?? null;
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
  },
  listRecentCheckoutSessions: async ({
    stripeSecretKey,
    stripeCustomerId,
    createdGte,
  }) => {
    const stripe = new Stripe(stripeSecretKey);
    const sessions: LocalCheckoutSessionCensusRecord[] = [];

    for await (const session of stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      created: { gte: createdGte },
      limit: STRIPE_PAGE_SIZE,
    })) {
      sessions.push({
        created: session.created,
        mode: session.mode,
        status: session.status,
        metadata: session.metadata,
      });
    }

    return sessions;
  },
};

function isCi(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CI);
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (value) return value;

  throw new LocalTrialCheckoutReplayCapacityError(
    'E2E_CHECKOUT_CHAIN_PROBE_FAILED',
    `${name} is required for the read-only local checkout-chain census.`,
  );
}

function isCurrentTrialCheckoutSession(
  session: LocalCheckoutSessionCensusRecord,
  userId: string,
): boolean {
  return (
    session.mode === 'subscription' &&
    session.metadata?.renewal_user_id === userId &&
    session.metadata.renewal_plan === TRIAL_CHECKOUT_PLAN &&
    session.metadata.checkout_variant === TRIAL_CHECKOUT_VARIANT
  );
}

export async function assertLocalTrialCheckoutReplayCapacity(
  input: AssertLocalTrialCheckoutReplayCapacityInput = {},
): Promise<void> {
  const env = input.env ?? process.env;
  if (isCi(env)) return;

  const services = { ...defaultServices, ...input.services };
  const nowSeconds = Math.floor((input.nowMs?.() ?? Date.now()) / 1000);
  const guaranteedRetentionCutoff =
    nowSeconds - STRIPE_IDEMPOTENCY_MINIMUM_RETENTION_SECONDS;

  try {
    const databaseUrl = requireEnv(env, 'DATABASE_URL');
    const email = requireEnv(env, 'E2E_CLERK_USER_USERNAME');
    const stripeSecretKey = requireEnv(env, 'STRIPE_SECRET_KEY');
    const billingState = await services.resolveBillingState({
      databaseUrl,
      email,
    });
    if (!billingState) {
      throw new LocalTrialCheckoutReplayCapacityError(
        'E2E_CHECKOUT_CHAIN_PROBE_FAILED',
        'The E2E user has no Stripe customer mapping.',
      );
    }

    const sessions = await services.listRecentCheckoutSessions({
      stripeSecretKey,
      stripeCustomerId: billingState.stripeCustomerId,
      createdGte: guaranteedRetentionCutoff,
    });
    const terminalSessions = sessions.filter(
      (session) =>
        session.created > guaranteedRetentionCutoff &&
        isCurrentTrialCheckoutSession(session, billingState.userId) &&
        (session.status === 'complete' || session.status === 'expired'),
    );

    if (
      terminalSessions.length <= SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT
    ) {
      return;
    }

    const completedCount = terminalSessions.filter(
      (session) => session.status === 'complete',
    ).length;
    const expiredCount = terminalSessions.length - completedCount;
    throw new LocalTrialCheckoutReplayCapacityError(
      'E2E_CHECKOUT_CHAIN_SATURATED',
      `Read-only Stripe census: ${terminalSessions.length} terminal trial Checkout Sessions (${completedCount} complete, ${expiredCount} expired) created less than 24 hours ago exceed traversal cap ${SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT}. Stripe can prune keys only after they are at least 24 hours old; that is eligibility, not an exact recovery deadline. Do not rotate the shared E2E customer or app-user identity.`,
    );
  } catch (error) {
    if (error instanceof LocalTrialCheckoutReplayCapacityError) {
      throw error;
    }

    throw new LocalTrialCheckoutReplayCapacityError(
      'E2E_CHECKOUT_CHAIN_PROBE_FAILED',
      'The read-only local checkout-chain census failed; provider and database diagnostics were redacted.',
    );
  }
}
