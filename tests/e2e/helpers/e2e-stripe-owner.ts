import { isUsableStripeTestKey } from '@/tests/shared/stripe-provider-gate';
import { createStripeTestClient } from './stripe-test-client';

// DEBT-508: each CI run attempt owns one Stripe test customer, tagged
// `github-ci-<run id>-<attempt>`, so concurrent runs never change each other's
// subscriptions. Teardown deletes the run's own; a cancelled run never reaches
// teardown, so global setup also sweeps the ones a day old. Only that exact
// tag is ever deleted: the shared `github-ci` and `local-dev` customers, each
// clone's `local-clone-*` and the hosted smoke's customer never match it.

const DISPOSABLE_CI_OWNER = /^github-ci-\d+-\d+$/;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_SWEEP_DELETES = 10;
// A Playwright timeout cannot be caught, so cleanup keeps inside its test's
// timeout by stopping at its own deadline: the sweep within setup's 60-second
// preparation budget, the delete within the teardown's 30 seconds after
// sign-out's 20.
const SWEEP_DEADLINE_MS = 10_000;
const TEARDOWN_DEADLINE_MS = 8_000;

export type E2EStripeCustomer = {
  id: string;
  /** Unix seconds, as Stripe reports it. */
  created: number;
  livemode: boolean;
  metadata: Record<string, string> | null;
};

/** The customer operations the sweep and teardown need. */
export type E2EStripeCustomerStore = {
  listByEmail(email: string): AsyncIterable<E2EStripeCustomer>;
  /** Deletes a customer; one already deleted counts as deleted. */
  delete(id: string): Promise<void>;
};

export function isDisposableCiOwner(owner: string): boolean {
  return DISPOSABLE_CI_OWNER.test(owner);
}

function ownerOf(customer: E2EStripeCustomer): string | undefined {
  return customer.metadata?.e2e_owner;
}

export function selectStaleCiCustomers(
  customers: readonly E2EStripeCustomer[],
  input: { currentOwner: string; nowMs: number },
): string[] {
  return customers
    .filter((customer) => {
      const owner = ownerOf(customer);
      return (
        !customer.livemode &&
        owner !== undefined &&
        owner !== input.currentOwner &&
        isDisposableCiOwner(owner) &&
        input.nowMs - customer.created * 1000 > STALE_AFTER_MS
      );
    })
    .slice(0, MAX_SWEEP_DELETES)
    .map((customer) => customer.id);
}

async function collect(
  customers: AsyncIterable<E2EStripeCustomer>,
): Promise<E2EStripeCustomer[]> {
  const all: E2EStripeCustomer[] = [];
  for await (const customer of customers) all.push(customer);
  return all;
}

export async function sweepStaleCiCustomers(input: {
  store: E2EStripeCustomerStore;
  email: string;
  currentOwner: string;
  nowMs: number;
}): Promise<{ deleted: number; failed: number }> {
  const stale = selectStaleCiCustomers(
    await collect(input.store.listByEmail(input.email)),
    input,
  );
  let deleted = 0;
  let failed = 0;
  for (const id of stale) {
    try {
      await input.store.delete(id);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}

export async function deleteRunCustomer(input: {
  store: E2EStripeCustomerStore;
  email: string;
  owner: string;
}): Promise<{ deleted: number }> {
  if (!isDisposableCiOwner(input.owner)) return { deleted: 0 };
  // Collected first: deleting while paging would leave the next page's
  // cursor on a deleted customer.
  const own = (await collect(input.store.listByEmail(input.email))).filter(
    (customer) => !customer.livemode && ownerOf(customer) === input.owner,
  );
  for (const customer of own) await input.store.delete(customer.id);
  return { deleted: own.length };
}

/** The Stripe customer calls the store makes; the SDK client satisfies it. */
type StripeCustomerApi = {
  customers: {
    list(params: { email: string; limit: number }): AsyncIterable<{
      id: string;
      created: number;
      livemode: boolean;
      metadata: Record<string, string> | null;
    }>;
    del(id: string): Promise<unknown>;
  };
};

export function createStripeCustomerStore(
  stripe: StripeCustomerApi,
): E2EStripeCustomerStore {
  return {
    async *listByEmail(email) {
      for await (const customer of stripe.customers.list({
        email,
        limit: 100,
      })) {
        yield {
          id: customer.id,
          created: customer.created,
          livemode: customer.livemode,
          metadata: customer.metadata,
        };
      }
    },
    async delete(id) {
      try {
        await stripe.customers.del(id);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'resource_missing'
        ) {
          return;
        }
        throw error;
      }
    },
  };
}

class E2EStripeOwnerDeadline extends Error {
  constructor() {
    super('Stripe cleanup ran past its deadline');
    this.name = 'E2EStripeOwnerDeadline';
  }
}

async function withinDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new E2EStripeOwnerDeadline()), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

type E2EStripeOwnerEnv = Readonly<Record<string, string | undefined>>;

type EntryPointInput = {
  env?: E2EStripeOwnerEnv;
  store?: E2EStripeCustomerStore;
  warn?: (message: string) => void;
  /** Count-only evidence for the run log; never an ID. */
  info?: (message: string) => void;
  deadlineMs?: number;
};

function resolveEntryPoint({
  env = process.env,
  store,
}: EntryPointInput):
  | { email: string; owner: string; store: E2EStripeCustomerStore }
  | undefined {
  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim();
  const email = env.E2E_CLERK_USER_USERNAME?.trim();
  const owner = env.E2E_STRIPE_OWNER?.trim();
  if (!isUsableStripeTestKey(stripeSecretKey) || !email || !owner) {
    return undefined;
  }
  return {
    email,
    owner,
    store:
      store ??
      createStripeCustomerStore(createStripeTestClient(stripeSecretKey)),
  };
}

// CI logs are public, and a Stripe message can carry request and customer
// IDs, so a warning names only the error's code or class.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  return 'code' in error && typeof error.code === 'string'
    ? error.code
    : error.name;
}

/**
 * Global setup: deletes per-run CI customers a day old that no teardown
 * removed. Cleanup never fails the run; a miss is retried by the next run.
 */
export async function sweepE2EStripeCustomers(
  input: EntryPointInput & { nowMs?: number } = {},
): Promise<void> {
  const warn = input.warn ?? console.warn;
  const target = resolveEntryPoint(input);
  if (!target) return;
  try {
    const { deleted, failed } = await withinDeadline(
      sweepStaleCiCustomers({
        store: target.store,
        email: target.email,
        currentOwner: target.owner,
        nowMs: input.nowMs ?? Date.now(),
      }),
      input.deadlineMs ?? SWEEP_DEADLINE_MS,
    );
    if (deleted > 0) {
      (input.info ?? console.log)(
        `[E2E_STRIPE_OWNER] Swept ${deleted} stale per-run CI customer(s).`,
      );
    }
    if (failed > 0) {
      warn(
        `[E2E_STRIPE_OWNER] ${failed} could not be deleted; the next run's sweep retries them.`,
      );
    }
  } catch (error) {
    warn(`[E2E_STRIPE_OWNER] Sweep skipped: ${describeError(error)}`);
  }
}

/**
 * Global teardown: deletes this CI run attempt's own customer. Cleanup never
 * fails the run; the next runs' sweeps remove what this one leaves.
 */
export async function deleteE2ERunStripeCustomer(
  input: EntryPointInput = {},
): Promise<void> {
  const warn = input.warn ?? console.warn;
  const target = resolveEntryPoint(input);
  if (!target) return;
  if (!isDisposableCiOwner(target.owner)) return;
  try {
    const { deleted } = await withinDeadline(
      deleteRunCustomer(target),
      input.deadlineMs ?? TEARDOWN_DEADLINE_MS,
    );
    (input.info ?? console.log)(
      `[E2E_STRIPE_OWNER] Deleted ${deleted} customer(s) of this run attempt.`,
    );
  } catch (error) {
    warn(
      `[E2E_STRIPE_OWNER] Run customer kept for the next sweep: ${describeError(error)}`,
    );
  }
}
