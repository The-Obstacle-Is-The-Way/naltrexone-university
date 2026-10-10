import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { STRIPE_API_VERSION } from '@/lib/stripe-api-version';
import { limitStripeSubscriptionRequests } from './stripe-request-limits';

// DEBT-501 item 1: proven through the real SDK, over an HTTP client that
// records each request's time limit and never reaches the network.
class RecordingHttpClient extends Stripe.HttpClient {
  readonly timeouts: number[] = [];
  readonly idempotencyKeys: Array<string | undefined> = [];

  constructor(private readonly fail: boolean) {
    super();
  }

  override getClientName(): string {
    return 'debt501-request-limits';
  }

  override async makeRequest(
    _host: string,
    _port: string,
    _path: string,
    _method: string,
    headers: Parameters<Stripe.HttpClient['makeRequest']>[4],
    _requestData: string | null,
    _protocol: string,
    timeout: number,
  ): Promise<Stripe.HttpClientResponse> {
    const idempotencyKey = headers['Idempotency-Key'];
    this.timeouts.push(timeout);
    this.idempotencyKeys.push(
      typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    );
    if (this.fail) {
      throw Object.assign(new Error('socket hang up'), {
        code: 'ECONNRESET',
      });
    }
    return new JsonResponse({ object: 'list', data: [], has_more: false });
  }
}

class JsonResponse extends Stripe.HttpClientResponse {
  constructor(private readonly body: object) {
    super(200, {});
  }

  override getRawResponse(): Record<string, unknown> {
    return {};
  }

  override toStream(): never {
    throw new Error('Unexpected streaming Stripe response');
  }

  override async toJSON(): Promise<object> {
    return this.body;
  }
}

function stripeOver(httpClient: RecordingHttpClient) {
  // The SDK's defaults: an 80-second timeout and two network retries.
  return new Stripe('sk_test_debt501_request_limits', {
    apiVersion: STRIPE_API_VERSION,
    httpClient,
  });
}

const limits = { timeoutMs: 5_000, maxNetworkRetries: 1 };

describe('limitStripeSubscriptionRequests', () => {
  it('sends each subscriptions request with its time limit', async () => {
    const httpClient = new RecordingHttpClient(false);
    const stripe = limitStripeSubscriptionRequests(
      stripeOver(httpClient),
      limits,
    );

    await stripe.subscriptions.list({ customer: 'cus_test', limit: 1 });

    expect(httpClient.timeouts).toEqual([5_000]);
  });

  it('tries a failed connection once more, not twice', async () => {
    const httpClient = new RecordingHttpClient(true);
    const stripe = limitStripeSubscriptionRequests(
      stripeOver(httpClient),
      limits,
    );

    await expect(
      stripe.subscriptions.retrieve('sub_test'),
    ).rejects.toMatchObject({ type: 'StripeConnectionError' });

    expect(httpClient.timeouts).toEqual([5_000, 5_000]);
  });

  it('keeps the options a caller passes', async () => {
    const httpClient = new RecordingHttpClient(false);
    const stripe = limitStripeSubscriptionRequests(
      stripeOver(httpClient),
      limits,
    );

    await stripe.subscriptions.cancel('sub_test', undefined, {
      idempotencyKey: 'cancel-once',
    });
    await stripe.subscriptions.update(
      'sub_test',
      { default_payment_method: 'pm_test' },
      { idempotencyKey: 'update-once' },
    );

    expect(httpClient.timeouts).toEqual([5_000, 5_000]);
    expect(httpClient.idempotencyKeys).toEqual(['cancel-once', 'update-once']);
  });
});
