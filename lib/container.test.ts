import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const currentUserMock = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  currentUser: () => currentUserMock(),
}));

let dbMock: unknown;
vi.mock('./db', () => ({
  get db() {
    return dbMock;
  },
}));

const stripeCheckoutCreateMock = vi.fn(async () => ({
  url: 'https://stripe/checkout',
}));
const stripePortalCreateMock = vi.fn(async () => ({
  url: 'https://stripe/portal',
}));
const stripeConstructEventMock = vi.fn(() => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1' } },
}));

vi.mock('./stripe', () => ({
  stripe: {
    checkout: { sessions: { create: stripeCheckoutCreateMock } },
    billingPortal: { sessions: { create: stripePortalCreateMock } },
    webhooks: { constructEvent: stripeConstructEventMock },
  },
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./env', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_1',
    NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY: 'price_m',
    NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: 'price_a',
  },
}));

afterEach(() => {
  currentUserMock.mockReset();
  stripeCheckoutCreateMock.mockClear();
  stripePortalCreateMock.mockClear();
  stripeConstructEventMock.mockClear();
  vi.restoreAllMocks();
});

function createDbMock() {
  const queryFindFirst = vi.fn();

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const insertReturning = vi.fn();
  const insertOnConflictDoNothing = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothing,
  }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    query: {
      users: {
        findFirst: queryFindFirst,
      },
    },
    update,
    insert,
    _mocks: {
      queryFindFirst,
      updateReturning,
      insertReturning,
    },
  } as const;
}

describe('lib/container', () => {
  it('wires AuthGateway + PaymentGateway with validated primitives', async () => {
    const db = createDbMock();
    const inserted = {
      id: 'db_user_1',
      clerkUserId: 'clerk_1',
      email: 'a@example.com',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    };

    currentUserMock.mockResolvedValue({
      id: 'clerk_1',
      emailAddresses: [{ emailAddress: 'a@example.com' }],
    });
    db._mocks.queryFindFirst.mockResolvedValue(null);
    db._mocks.insertReturning.mockResolvedValue([inserted]);

    dbMock = db as unknown;

    const { createContainer } = await import('./container');
    const container = createContainer();

    await expect(container.authGateway.requireUser()).resolves.toEqual({
      id: 'db_user_1',
      email: 'a@example.com',
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    });

    await expect(
      container.paymentGateway.createCheckoutSession({
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://stripe/checkout' });

    expect(stripeCheckoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_m', quantity: 1 }],
      }),
    );

    await expect(
      container.paymentGateway.processWebhookEvent('raw', 'sig'),
    ).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });

    expect(stripeConstructEventMock).toHaveBeenCalledWith(
      'raw',
      'sig',
      'whsec_1',
    );
  });
});
