import { describe, expect, it } from 'vitest';
import {
  createStripeCustomerStore,
  deleteE2ERunStripeCustomer,
  deleteRunCustomer,
  type E2EStripeCustomer,
  type E2EStripeCustomerStore,
  isDisposableCiOwner,
  selectStaleCiCustomers,
  sweepE2EStripeCustomers,
  sweepStaleCiCustomers,
} from './e2e-stripe-owner';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const HOUR_S = 3600;
const nowS = NOW / 1000;

function customer(
  id: string,
  owner: string | undefined,
  ageHours: number,
  livemode = false,
): E2EStripeCustomer {
  return {
    id,
    created: nowS - ageHours * HOUR_S,
    livemode,
    metadata: owner ? { e2e_owner: owner } : {},
  };
}

class InMemoryCustomerStore implements E2EStripeCustomerStore {
  readonly deleted: string[] = [];

  constructor(
    private readonly customers: E2EStripeCustomer[],
    private readonly failDelete = new Set<string>(),
  ) {}

  async *listByEmail(email: string) {
    expect(email).toBe('e2e@example.com');
    for (const c of this.customers) yield c;
  }

  async delete(id: string) {
    if (this.failDelete.has(id)) throw new Error(`cannot delete ${id}`);
    this.deleted.push(id);
  }
}

describe('isDisposableCiOwner', () => {
  it.each([
    ['github-ci-37613122068-1', true],
    ['github-ci-1-12', true],
    ['github-ci', false],
    ['github-ci-', false],
    ['github-ci-abc-1', false],
    ['github-ci-1-1-extra', false],
    ['local-dev', false],
    ['local-clone-naltrexone-university-2-5c28b718', false],
    ['github-stripe-hosted-smoke', false],
  ])('%s: %s', (owner, disposable) => {
    expect(isDisposableCiOwner(owner)).toBe(disposable);
  });
});

describe('selectStaleCiCustomers', () => {
  it('selects only test-mode per-run CI customers older than a day, never the current run', () => {
    const customers = [
      customer('old-run', 'github-ci-100-1', 25),
      customer('fresh-run', 'github-ci-101-1', 23),
      customer('current-old', 'github-ci-200-2', 30),
      customer('shared-ci', 'github-ci', 500),
      customer('local', 'local-dev', 500),
      customer('clone', 'local-clone-abc-12345678', 500),
      customer('hosted', 'github-stripe-hosted-smoke', 500),
      customer('untagged', undefined, 500),
      customer('live', 'github-ci-300-1', 500, true),
    ];

    expect(
      selectStaleCiCustomers(customers, {
        currentOwner: 'github-ci-200-2',
        nowMs: NOW,
      }),
    ).toEqual(['old-run']);
  });

  it('selects at most ten per run', () => {
    const customers = Array.from({ length: 14 }, (_, i) =>
      customer(`run-${i}`, `github-ci-${i}-1`, 48),
    );

    expect(
      selectStaleCiCustomers(customers, { currentOwner: 'x', nowMs: NOW }),
    ).toHaveLength(10);
  });
});

describe('sweepStaleCiCustomers', () => {
  it('deletes the stale per-run customers and reports how many', async () => {
    const store = new InMemoryCustomerStore([
      customer('old-a', 'github-ci-1-1', 26),
      customer('old-b', 'github-ci-2-1', 26),
      customer('shared', 'github-ci', 900),
    ]);

    await expect(
      sweepStaleCiCustomers({
        store,
        email: 'e2e@example.com',
        currentOwner: 'github-ci-9-1',
        nowMs: NOW,
      }),
    ).resolves.toEqual({ deleted: 2, failed: 0 });
    expect(store.deleted).toEqual(['old-a', 'old-b']);
  });

  it('keeps sweeping past a customer it cannot delete', async () => {
    const store = new InMemoryCustomerStore(
      [
        customer('stuck', 'github-ci-1-1', 26),
        customer('old', 'github-ci-2-1', 26),
      ],
      new Set(['stuck']),
    );

    await expect(
      sweepStaleCiCustomers({
        store,
        email: 'e2e@example.com',
        currentOwner: 'github-ci-9-1',
        nowMs: NOW,
      }),
    ).resolves.toEqual({ deleted: 1, failed: 1 });
    expect(store.deleted).toEqual(['old']);
  });
});

describe('deleteRunCustomer', () => {
  it("deletes the run's own per-run customer and nothing else", async () => {
    const store = new InMemoryCustomerStore([
      customer('mine', 'github-ci-9-1', 0),
      customer('other-run', 'github-ci-8-1', 0),
      customer('shared', 'github-ci', 900),
    ]);

    await expect(
      deleteRunCustomer({
        store,
        email: 'e2e@example.com',
        owner: 'github-ci-9-1',
      }),
    ).resolves.toEqual({ deleted: 1 });
    expect(store.deleted).toEqual(['mine']);
  });

  it.each([
    'github-ci',
    'local-dev',
    'local-clone-abc-12345678',
    'github-stripe-hosted-smoke',
  ])('never deletes a customer of the kept owner %s', async (owner) => {
    const store = new InMemoryCustomerStore([customer('kept', owner, 0)]);

    await expect(
      deleteRunCustomer({ store, email: 'e2e@example.com', owner }),
    ).resolves.toEqual({ deleted: 0 });
    expect(store.deleted).toEqual([]);
  });
});

describe('the setup and teardown entry points', () => {
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    E2E_CLERK_USER_USERNAME: 'e2e@example.com',
    E2E_STRIPE_OWNER: 'github-ci-9-1',
  };

  it("sweeps stale customers and deletes the run's own through the store", async () => {
    const store = new InMemoryCustomerStore([
      customer('old', 'github-ci-1-1', 30),
      customer('mine', 'github-ci-9-1', 0),
    ]);
    const warnings: string[] = [];
    const infos: string[] = [];

    await sweepE2EStripeCustomers({
      env,
      store,
      nowMs: NOW,
      warn: (m) => warnings.push(m),
      info: (m) => infos.push(m),
    });
    await deleteE2ERunStripeCustomer({
      env,
      store,
      warn: (m) => warnings.push(m),
      info: (m) => infos.push(m),
    });

    expect(store.deleted).toEqual(['old', 'mine']);
    expect(warnings).toEqual([]);
    expect(infos).toEqual([
      '[E2E_STRIPE_OWNER] Swept 1 stale per-run CI customer(s).',
      '[E2E_STRIPE_OWNER] Deleted 1 customer(s) of this run attempt.',
    ]);
  });

  it('warns instead of failing the run when Stripe refuses', async () => {
    const store: E2EStripeCustomerStore = {
      listByEmail: () => {
        throw Object.assign(new Error('No such customer: cus_secretish'), {
          code: 'api_connection_error',
        });
      },
      delete: async () => {},
    };
    const warnings: string[] = [];

    await expect(
      sweepE2EStripeCustomers({
        env,
        store,
        nowMs: NOW,
        warn: (m) => warnings.push(m),
      }),
    ).resolves.toBeUndefined();
    await expect(
      deleteE2ERunStripeCustomer({ env, store, warn: (m) => warnings.push(m) }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([
      '[E2E_STRIPE_OWNER] Sweep skipped: api_connection_error',
      '[E2E_STRIPE_OWNER] Run customer kept for the next sweep: api_connection_error',
    ]);
  });

  it('warns about customers it could not delete', async () => {
    const store = new InMemoryCustomerStore(
      [customer('stuck', 'github-ci-1-1', 30)],
      new Set(['stuck']),
    );
    const warnings: string[] = [];

    await sweepE2EStripeCustomers({
      env,
      store,
      nowMs: NOW,
      warn: (m) => warnings.push(m),
    });

    expect(warnings).toEqual([expect.stringContaining('1 could not')]);
  });

  it.each([
    ['a placeholder Stripe key', { STRIPE_SECRET_KEY: 'sk_test_dummy' }],
    ['no owner', { E2E_STRIPE_OWNER: '' }],
    ['no E2E user', { E2E_CLERK_USER_USERNAME: '' }],
  ])('does nothing with %s', async (_case, override) => {
    const store = new InMemoryCustomerStore([
      customer('old', 'github-ci-1-1', 30),
    ]);

    await sweepE2EStripeCustomers({
      env: { ...env, ...override },
      store,
      nowMs: NOW,
      warn: () => {},
    });

    expect(store.deleted).toEqual([]);
  });
});

// DEBT-508 review: a Playwright timeout cannot be caught, so cleanup stops at
// its own deadline and warns, leaving the rest to the next run's sweep.
describe('cleanup deadlines', () => {
  const env = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    E2E_CLERK_USER_USERNAME: 'e2e@example.com',
    E2E_STRIPE_OWNER: 'github-ci-9-1',
  };
  const stalled: E2EStripeCustomerStore = {
    listByEmail: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<E2EStripeCustomer>>(() => {}),
      }),
    }),
    delete: async () => {},
  };

  it('stops the sweep at its deadline and warns', async () => {
    const warnings: string[] = [];

    await sweepE2EStripeCustomers({
      env,
      store: stalled,
      nowMs: NOW,
      deadlineMs: 5,
      warn: (m) => warnings.push(m),
    });

    expect(warnings).toEqual([
      '[E2E_STRIPE_OWNER] Sweep skipped: E2EStripeOwnerDeadline',
    ]);
  });

  it('stops the teardown delete at its deadline and warns', async () => {
    const warnings: string[] = [];

    await deleteE2ERunStripeCustomer({
      env,
      store: stalled,
      deadlineMs: 5,
      warn: (m) => warnings.push(m),
    });

    expect(warnings).toEqual([
      '[E2E_STRIPE_OWNER] Run customer kept for the next sweep: E2EStripeOwnerDeadline',
    ]);
  });
});

describe('createStripeCustomerStore', () => {
  type CustomerApi = Parameters<typeof createStripeCustomerStore>[0];

  function api(del: (id: string) => Promise<unknown>): CustomerApi {
    return {
      customers: {
        async *list() {
          yield {
            id: 'c1',
            created: 1,
            livemode: false,
            metadata: { e2e_owner: 'github-ci-1-1' },
          };
        },
        del,
      },
    };
  }

  it('lists customers by email with only the fields the sweep reads', async () => {
    const store = createStripeCustomerStore(api(async () => ({})));
    const listed: E2EStripeCustomer[] = [];
    for await (const c of store.listByEmail('e2e@example.com')) listed.push(c);

    expect(listed).toEqual([
      {
        id: 'c1',
        created: 1,
        livemode: false,
        metadata: { e2e_owner: 'github-ci-1-1' },
      },
    ]);
  });

  it('counts a customer already deleted as deleted', async () => {
    const store = createStripeCustomerStore(
      api(async () => {
        throw Object.assign(new Error('No such customer'), {
          code: 'resource_missing',
        });
      }),
    );

    await expect(store.delete('c1')).resolves.toBeUndefined();
  });

  it('passes any other deletion error on', async () => {
    const store = createStripeCustomerStore(
      api(async () => {
        throw Object.assign(new Error('rate limited'), {
          code: 'rate_limit',
        });
      }),
    );

    await expect(store.delete('c1')).rejects.toMatchObject({
      code: 'rate_limit',
    });
  });
});
