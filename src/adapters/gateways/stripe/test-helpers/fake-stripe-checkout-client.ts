import { isDeepStrictEqual } from 'node:util';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
  StripeCheckoutSessionRetrieved,
  StripeClient,
  StripeRequestOptions,
  StripeSetupIntent,
  StripeSubscriptionListParams,
} from '@/src/adapters/shared/stripe-types';

const CHECKOUT_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

// The fields the adapters read from a Subscription: the checkout preflight
// reads `id`/`status` from a listing; the webhook normalizer reads the rest
// from a retrieval.
type WebhookEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

type WebhookCall = { rawBody: string; signature: string; secret: string };

export type SeededSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: {
    data: Array<{ current_period_end?: number; price: { id: string } }>;
  };
};

type TrackedCheckoutSession = StripeCheckoutSessionRetrieved & {
  customer?: string | undefined;
};

type CreateCall = {
  params: CheckoutSessionCreateParams;
  options?: StripeRequestOptions | undefined;
};

type ListCall = Parameters<StripeClient['checkout']['sessions']['list']>[0];

// A list hook runs after a listing is recorded and before it is answered; a
// test awaits inside it to sequence concurrent callers. It models no Stripe
// behavior and is not contract-tested.
type ListHook = (params: ListCall) => void | Promise<void>;

// A Subscription retrieve override runs after the retrieval is recorded and
// bends what it returns: a test awaits inside it to hold a retrieval open, or
// throws or returns a Subscription Stripe could not send. It models no Stripe
// behavior and is not contract-tested.
type SubscriptionRetrieveOverride = (
  subscription: SeededSubscription,
) => SeededSubscription | Promise<SeededSubscription>;

// A cancel hook runs after the cancel is recorded and before it is applied:
// it injects a caller-supplied error by throwing, or stages a Subscription
// canceled elsewhere (markSubscriptionCanceled), which the contracted 404 then
// answers. It models no Stripe behavior and is not contract-tested.
type SubscriptionCancelHook = (
  subscriptionId: string,
  options?: StripeRequestOptions,
) => void | Promise<void>;

type SubscriptionCancelCall = {
  subscriptionId: string;
  options?: StripeRequestOptions | undefined;
};

type RetrieveRequest = {
  sessionId: string;
  params?: { expand?: string[] } | undefined;
};

type ExpireCall = {
  sessionId: string;
  options?: StripeRequestOptions | undefined;
};

// An expire fault runs after the call is recorded and before the Session is
// marked expired; it injects a caller-supplied error by throwing. Like the
// create fault it models no Stripe fault shape and is not contract-tested.
type ExpireFault = (
  sessionId: string,
  options?: StripeRequestOptions,
) => void | Promise<void>;

type RetrieveOverride = (
  session: StripeCheckoutSessionRetrieved,
) => StripeCheckoutSessionRetrieved | Promise<StripeCheckoutSessionRetrieved>;

// A create-response override bends only what `create` returns (fresh or
// replayed); the stored Session and the saved idempotent response stay as
// created. It models no Stripe behavior and is not contract-tested.
type CreateResponseOverride = (
  session: StripeCheckoutSession,
) => StripeCheckoutSession | Promise<StripeCheckoutSession>;

// A create fault runs after the call is recorded and before any idempotent
// replay or session creation; it injects a caller-supplied error by throwing.
// It models no Stripe fault shape and is not contract-tested: the parameter
// mismatch error below remains the only contracted create failure.
type CreateFault = (
  params: CheckoutSessionCreateParams,
  options?: StripeRequestOptions,
) => void | Promise<void>;

function cloneSession(session: TrackedCheckoutSession): TrackedCheckoutSession {
  const lineItems = session.line_items
    ? session.line_items.data
      ? {
          data: session.line_items.data.map((item) =>
            item.price ? { price: { ...item.price } } : {},
          ),
        }
      : {}
    : undefined;
  return {
    ...session,
    ...(session.metadata === undefined
      ? {}
      : {
          metadata: session.metadata
            ? { ...session.metadata }
            : session.metadata,
        }),
    ...(lineItems ? { line_items: lineItems } : {}),
  };
}

export class FakeStripeCheckoutClient implements StripeClient {
  readonly createCalls: CreateCall[] = [];
  readonly listCalls: ListCall[] = [];
  readonly retrieveCalls: string[] = [];
  readonly retrieveRequests: RetrieveRequest[] = [];
  readonly expireCalls: ExpireCall[] = [];

  private readonly savedResponsesByIdempotencyKey = new Map<
    string,
    TrackedCheckoutSession
  >();
  private readonly savedParamsByIdempotencyKey = new Map<
    string,
    CheckoutSessionCreateParams
  >();
  private readonly liveSessionsById = new Map<string, TrackedCheckoutSession>();
  private retrieveOverride: RetrieveOverride | null = null;
  private listHook: ListHook | null = null;
  private createResponseOverride: CreateResponseOverride | null = null;
  private createFault: CreateFault | null = null;
  private expireFault: ExpireFault | null = null;
  private sessionSequence = 0;

  constructor(private readonly nowMs: () => number = Date.now) {}

  readonly customers: StripeClient['customers'] = {
    create: async () => ({ id: 'cus_fake_checkout' }),
  };

  readonly checkout: StripeClient['checkout'] = {
    sessions: {
      create: async (params, options) => {
        this.createCalls.push({
          params: structuredClone(params),
          ...(options ? { options: { ...options } } : {}),
        });
        if (this.createFault) {
          await this.createFault(params, options);
        }

        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          const saved = this.savedResponsesByIdempotencyKey.get(idempotencyKey);
          if (saved) {
            const savedParams =
              this.savedParamsByIdempotencyKey.get(idempotencyKey);
            if (!savedParams || !isDeepStrictEqual(savedParams, params)) {
              // The fields and adapter-matched "same parameters" phrase are
              // verified against Stripe TEST mode by the DEBT-472 contract.
              throw Object.assign(
                new Error(
                  'Keys for idempotent requests can only be used with the same parameters they were first used with.',
                ),
                {
                  type: 'StripeIdempotencyError',
                  rawType: 'idempotency_error',
                  statusCode: 400,
                },
              );
            }
            return this.respondToCreate(cloneSession(saved));
          }
        }

        const session = this.createOpenSession(params);
        this.liveSessionsById.set(session.id, cloneSession(session));
        if (idempotencyKey) {
          this.savedResponsesByIdempotencyKey.set(
            idempotencyKey,
            cloneSession(session),
          );
          this.savedParamsByIdempotencyKey.set(
            idempotencyKey,
            structuredClone(params),
          );
        }
        return this.respondToCreate(cloneSession(session));
      },
      list: async (params) => {
        this.listCalls.push({ ...params });
        if (this.listHook) {
          await this.listHook(params);
        }
        const sorted = Array.from(this.liveSessionsById.values())
          .filter(
            (session) =>
              session.customer === params.customer &&
              (params.status === undefined || session.status === params.status),
          )
          .sort((left, right) => {
            const createdDifference =
              (right.created ?? 0) - (left.created ?? 0);
            return createdDifference || right.id.localeCompare(left.id);
          });
        const cursorIndex = params.starting_after
          ? sorted.findIndex((session) => session.id === params.starting_after)
          : -1;
        if (params.starting_after && cursorIndex < 0) {
          throw new Error('Missing fake Checkout Session pagination cursor');
        }
        const startIndex = cursorIndex + 1;
        const data = sorted
          .slice(startIndex, startIndex + params.limit)
          .map(cloneSession);
        return {
          data,
          has_more: startIndex + data.length < sorted.length,
        };
      },
      retrieve: async (sessionId, params) => {
        this.retrieveCalls.push(sessionId);
        this.retrieveRequests.push({
          sessionId,
          ...(params ? { params: structuredClone(params) } : {}),
        });
        const session = this.liveSessionsById.get(sessionId);
        if (!session) {
          throw new Error(`Missing fake Checkout Session: ${sessionId}`);
        }
        const snapshot = cloneSession(session);
        return this.retrieveOverride
          ? cloneSession(await this.retrieveOverride(snapshot))
          : snapshot;
      },
      expire: async (sessionId, _params, options) => {
        this.expireCalls.push({
          sessionId,
          ...(options ? { options: { ...options } } : {}),
        });
        if (this.expireFault) {
          await this.expireFault(sessionId, options);
        }
        this.markExpired(sessionId);
        return this.getLiveSession(sessionId);
      },
    },
  };

  // Seeded Subscriptions are listed by exact customer (and status), retrieved
  // by id and canceled once; the list, retrieve and cancel shapes are proven
  // against Stripe TEST mode by the shared contract. A second cancel, like an
  // unknown id, gets Stripe's 404 resource_missing although the canceled
  // Subscription stays retrievable. Cancel ignores idempotency keys, as Stripe
  // does for DELETE requests: a repeat under the same key is still a 404.
  // `list` and `cancel` read `this`, as the SDK methods do, so a detached
  // call fails the way an unbound SDK method would.
  readonly subscriptions: NonNullable<StripeClient['subscriptions']> &
    Required<
      Pick<NonNullable<StripeClient['subscriptions']>, 'list' | 'cancel'>
    > & {
      readonly seeded: SeededSubscription[];
      readonly listCalls: StripeSubscriptionListParams[];
      readonly retrieveCalls: string[];
      readonly cancelCalls: SubscriptionCancelCall[];
      retrieveOverride: SubscriptionRetrieveOverride | null;
      cancelHook: SubscriptionCancelHook | null;
    } = {
    seeded: [],
    listCalls: [],
    retrieveCalls: [],
    cancelCalls: [],
    retrieveOverride: null,
    cancelHook: null,
    async cancel(subscriptionId, _params, options) {
      this.cancelCalls.push({
        subscriptionId,
        ...(options ? { options: { ...options } } : {}),
      });
      if (this.cancelHook) {
        await this.cancelHook(subscriptionId, options);
      }
      const subscription = this.seeded.find(
        (candidate) => candidate.id === subscriptionId,
      );
      if (!subscription || subscription.status === 'canceled') {
        throw Object.assign(
          new Error(`No such subscription: '${subscriptionId}'`),
          {
            type: 'StripeInvalidRequestError',
            rawType: 'invalid_request_error',
            code: 'resource_missing',
            statusCode: 404,
            param: 'id',
          },
        );
      }
      subscription.status = 'canceled';
      return structuredClone(subscription);
    },
    async list(params) {
      this.listCalls.push({ ...params });
      const data = this.seeded
        .filter(
          (subscription) =>
            subscription.customer === params.customer &&
            (params.status === 'all' ||
              (params.status === undefined
                ? subscription.status !== 'canceled'
                : subscription.status === params.status)),
        )
        .slice(0, params.limit ?? 10)
        .map((subscription) => structuredClone(subscription));
      return { data };
    },
    async retrieve(subscriptionId) {
      this.retrieveCalls.push(subscriptionId);
      const subscription = this.seeded.find(
        (candidate) => candidate.id === subscriptionId,
      );
      if (!subscription) {
        throw new Error(`Missing fake Subscription: ${subscriptionId}`);
      }
      const retrieved = structuredClone(subscription);
      return this.retrieveOverride
        ? this.retrieveOverride(retrieved)
        : retrieved;
    },
  };

  seedSubscription(subscription: SeededSubscription): void {
    this.subscriptions.seeded.push(structuredClone(subscription));
  }

  // Cancels a seeded Subscription outside the API, as another actor would.
  markSubscriptionCanceled(subscriptionId: string): void {
    const subscription = this.subscriptions.seeded.find(
      (candidate) => candidate.id === subscriptionId,
    );
    if (!subscription) {
      throw new Error(`Missing fake Subscription: ${subscriptionId}`);
    }
    subscription.status = 'canceled';
  }

  setSubscriptionRetrieveOverride(
    override: SubscriptionRetrieveOverride | null,
  ): void {
    this.subscriptions.retrieveOverride = override;
  }

  setSubscriptionCancelHook(hook: SubscriptionCancelHook | null): void {
    this.subscriptions.cancelHook = hook;
  }

  readonly billingPortal: StripeClient['billingPortal'] = {
    sessions: {
      create: async () => ({ url: 'https://billing.stripe.test/session' }),
    },
  };

  // Webhook verification is Stripe's; the fake never verifies. With an event
  // injected it records the call and hands the event back, otherwise it
  // throws as before. The recorded call proves the adapter's plumbing of
  // body, signature and secret; the event shapes stay hand-built test data.
  readonly webhookCalls: WebhookCall[] = [];
  private webhookEvent: WebhookEvent | null = null;

  readonly webhooks: StripeClient['webhooks'] = {
    constructEvent: (rawBody, signature, secret) => {
      this.webhookCalls.push({ rawBody, signature, secret });
      if (!this.webhookEvent) {
        throw new Error('FakeStripeCheckoutClient does not process webhooks');
      }
      return structuredClone(this.webhookEvent);
    },
  };

  setWebhookEvent(event: WebhookEvent | null): void {
    this.webhookEvent = event ? structuredClone(event) : null;
  }

  // Seeded SetupIntents are retrieved by id; the processor reads only the id
  // and the payment method reference.
  readonly setupIntents: NonNullable<StripeClient['setupIntents']> & {
    readonly seeded: StripeSetupIntent[];
    readonly retrieveCalls: string[];
  } = {
    seeded: [],
    retrieveCalls: [],
    async retrieve(setupIntentId) {
      this.retrieveCalls.push(setupIntentId);
      const intent = this.seeded.find(
        (candidate) => candidate.id === setupIntentId,
      );
      if (!intent) {
        throw new Error(`Missing fake SetupIntent: ${setupIntentId}`);
      }
      return structuredClone(intent);
    },
  };

  seedSetupIntent(intent: StripeSetupIntent): void {
    this.setupIntents.seeded.push(structuredClone(intent));
  }

  markComplete(sessionId: string): void {
    this.setTerminalState(sessionId, 'complete');
  }

  markExpired(sessionId: string): void {
    this.setTerminalState(sessionId, 'expired');
  }

  setRetrieveOverride(override: RetrieveOverride | null): void {
    this.retrieveOverride = override;
  }

  setListHook(hook: ListHook | null): void {
    this.listHook = hook;
  }

  setCreateResponseOverride(override: CreateResponseOverride | null): void {
    this.createResponseOverride = override;
  }

  private async respondToCreate(
    session: StripeCheckoutSession,
  ): Promise<StripeCheckoutSession> {
    return this.createResponseOverride
      ? await this.createResponseOverride(session)
      : session;
  }

  setCreateFault(fault: CreateFault | null): void {
    this.createFault = fault;
  }

  setExpireFault(fault: ExpireFault | null): void {
    this.expireFault = fault;
  }

  private createOpenSession(
    params: CheckoutSessionCreateParams,
  ): TrackedCheckoutSession {
    this.sessionSequence += 1;
    const created = Math.floor(this.nowMs() / 1000);
    const id = `cs_fake_${this.sessionSequence}`;
    const session: TrackedCheckoutSession = {
      id,
      url: `https://checkout.stripe.test/${id}`,
      created,
      status: 'open',
      expires_at: Math.floor(
        (this.nowMs() + CHECKOUT_SESSION_LIFETIME_MS) / 1000,
      ),
      mode: params.mode,
      metadata: params.metadata ? { ...params.metadata } : null,
      ...(params.mode === 'setup'
        ? {}
        : {
            customer: params.customer,
            ...(params.payment_method_collection === undefined
              ? {}
              : {
                  payment_method_collection: params.payment_method_collection,
                }),
            line_items: {
              data: params.line_items.map((item) => ({
                price: { id: item.price },
              })),
            },
          }),
    };
    return session;
  }

  private setTerminalState(
    sessionId: string,
    status: 'complete' | 'expired',
  ): void {
    const session = this.liveSessionsById.get(sessionId);
    if (!session) {
      throw new Error(`Missing fake Checkout Session: ${sessionId}`);
    }
    this.liveSessionsById.set(sessionId, {
      ...session,
      status,
      url: null,
    });
  }

  private getLiveSession(sessionId: string): StripeCheckoutSession {
    const session = this.liveSessionsById.get(sessionId);
    if (!session) {
      throw new Error(`Missing fake Checkout Session: ${sessionId}`);
    }
    return cloneSession(session);
  }
}
