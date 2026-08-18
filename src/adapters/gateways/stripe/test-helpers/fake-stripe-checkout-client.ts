import { isDeepStrictEqual } from 'node:util';
import type {
  CheckoutSessionCreateParams,
  StripeCheckoutSession,
  StripeCheckoutSessionRetrieved,
  StripeClient,
  StripeRequestOptions,
} from '@/src/adapters/shared/stripe-types';

const CHECKOUT_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

type TrackedCheckoutSession = StripeCheckoutSessionRetrieved & {
  customer?: string | undefined;
};

type CreateCall = {
  params: CheckoutSessionCreateParams;
  options?: StripeRequestOptions | undefined;
};

type ListCall = Parameters<StripeClient['checkout']['sessions']['list']>[0];

type RetrieveOverride = (
  session: StripeCheckoutSessionRetrieved,
) => StripeCheckoutSessionRetrieved | Promise<StripeCheckoutSessionRetrieved>;

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

        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          const saved = this.savedResponsesByIdempotencyKey.get(idempotencyKey);
          if (saved) {
            const savedParams =
              this.savedParamsByIdempotencyKey.get(idempotencyKey);
            if (!savedParams || !isDeepStrictEqual(savedParams, params)) {
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
            return cloneSession(saved);
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
        return cloneSession(session);
      },
      list: async (params) => {
        this.listCalls.push({ ...params });
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
      retrieve: async (sessionId) => {
        this.retrieveCalls.push(sessionId);
        const session = this.liveSessionsById.get(sessionId);
        if (!session) {
          throw new Error(`Missing fake Checkout Session: ${sessionId}`);
        }
        const snapshot = cloneSession(session);
        return this.retrieveOverride
          ? cloneSession(await this.retrieveOverride(snapshot))
          : snapshot;
      },
      expire: async (sessionId) => {
        this.markExpired(sessionId);
        return this.getLiveSession(sessionId);
      },
    },
  };

  readonly subscriptions: NonNullable<StripeClient['subscriptions']> = {
    list: async () => ({ data: [] }),
    retrieve: async () => ({}),
  };

  readonly billingPortal: StripeClient['billingPortal'] = {
    sessions: {
      create: async () => ({ url: 'https://billing.stripe.test/session' }),
    },
  };

  readonly webhooks: StripeClient['webhooks'] = {
    constructEvent: () => {
      throw new Error('FakeStripeCheckoutClient does not process webhooks');
    },
  };

  markComplete(sessionId: string): void {
    this.setTerminalState(sessionId, 'complete');
  }

  markExpired(sessionId: string): void {
    this.setTerminalState(sessionId, 'expired');
  }

  setRetrieveOverride(override: RetrieveOverride | null): void {
    this.retrieveOverride = override;
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
