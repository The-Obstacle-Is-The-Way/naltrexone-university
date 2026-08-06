import { ApplicationError } from '@/src/application/errors';
import type {
  AttachTrialPaymentMethodInput,
  AuthGateway,
  CheckoutSessionInput,
  CheckoutSessionOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  PaymentGateway,
  PaymentGatewayRequestOptions,
  PortalSessionInput,
  PortalSessionOutput,
  RateLimiter,
  RateLimitInput,
  RateLimitResult,
  SetTrialSubscriptionDefaultPaymentMethodInput,
  TrialPaymentMethodSetupSessionInput,
  TrialPaymentMethodSetupSessionOutput,
  WebhookEventResult,
} from '@/src/application/ports/gateways';
import type { User } from '@/src/domain/entities';

export class FakeAuthGateway implements AuthGateway {
  constructor(private user: User | null) {}

  async getCurrentUser(): Promise<User | null> {
    return this.user;
  }

  async requireUser(): Promise<User> {
    if (!this.user) {
      throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
    }
    return this.user;
  }
}

export class FakeRateLimiter implements RateLimiter {
  readonly inputs: RateLimitInput[] = [];
  private readonly results: Array<RateLimitResult | Error>;
  readonly windows: Map<string, Date> = new Map();
  pruneCallCount = 0;

  constructor(
    result?: RateLimitResult | Error | readonly (RateLimitResult | Error)[],
  ) {
    this.results = result
      ? Array.isArray(result)
        ? [...result]
        : [result]
      : [];
  }

  async limit(input: RateLimitInput): Promise<RateLimitResult> {
    this.inputs.push(input);
    const next = this.results.shift();
    if (next instanceof Error) throw next;
    if (next) return next;

    const windowStart = new Date();
    this.windows.set(`${input.key}:${windowStart.getTime()}`, windowStart);

    return {
      success: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - 1),
      retryAfterSeconds: 0,
    };
  }

  async pruneExpiredWindows(before: Date, limit: number): Promise<number> {
    this.pruneCallCount++;
    if (!Number.isInteger(limit) || limit <= 0) return 0;

    const expired = Array.from(this.windows.entries())
      .filter(([, windowStart]) => windowStart.getTime() < before.getTime())
      .sort(([, a], [, b]) => a.getTime() - b.getTime())
      .slice(0, limit);

    for (const [key] of expired) {
      this.windows.delete(key);
    }

    return expired.length;
  }
}

export class FakePaymentGateway implements PaymentGateway {
  readonly customerInputs: CreateCustomerInput[] = [];
  readonly customerOptions: Array<PaymentGatewayRequestOptions | undefined> =
    [];
  readonly checkoutInputs: CheckoutSessionInput[] = [];
  readonly checkoutOptions: Array<PaymentGatewayRequestOptions | undefined> =
    [];
  readonly trialSetupInputs: TrialPaymentMethodSetupSessionInput[] = [];
  readonly trialPaymentMethodAttachInputs: AttachTrialPaymentMethodInput[] = [];
  readonly trialSubscriptionDefaultInputs: SetTrialSubscriptionDefaultPaymentMethodInput[] =
    [];
  readonly portalInputs: PortalSessionInput[] = [];
  readonly portalOptions: Array<PaymentGatewayRequestOptions | undefined> = [];
  readonly webhookInputs: Array<{ rawBody: string; signature: string }> = [];

  private readonly externalCustomerId: string;
  private readonly checkoutUrl: string;
  private readonly trialSetupSessionId: string;
  private readonly trialSetupUrl: string;
  private readonly portalUrl: string;
  private readonly webhookResult: WebhookEventResult;

  constructor(input: {
    externalCustomerId: string;
    checkoutUrl: string;
    trialSetupSessionId?: string;
    trialSetupUrl?: string;
    portalUrl: string;
    webhookResult: WebhookEventResult;
  }) {
    this.externalCustomerId = input.externalCustomerId;
    this.checkoutUrl = input.checkoutUrl;
    this.trialSetupSessionId = input.trialSetupSessionId ?? 'cs_setup';
    this.trialSetupUrl = input.trialSetupUrl ?? input.checkoutUrl;
    this.portalUrl = input.portalUrl;
    this.webhookResult = input.webhookResult;
  }

  async createCustomer(
    input: CreateCustomerInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CreateCustomerOutput> {
    this.customerInputs.push(input);
    this.customerOptions.push(options);
    return { externalCustomerId: this.externalCustomerId };
  }

  async createCheckoutSession(
    input: CheckoutSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<CheckoutSessionOutput> {
    this.checkoutInputs.push(input);
    this.checkoutOptions.push(options);
    return { url: this.checkoutUrl };
  }

  async createTrialPaymentMethodSetupSession(
    input: TrialPaymentMethodSetupSessionInput,
  ): Promise<TrialPaymentMethodSetupSessionOutput> {
    this.trialSetupInputs.push(input);
    return {
      sessionId: this.trialSetupSessionId,
      url: this.trialSetupUrl,
    };
  }

  async attachTrialPaymentMethod(
    input: AttachTrialPaymentMethodInput,
  ): Promise<void> {
    this.trialPaymentMethodAttachInputs.push(input);
  }

  async setTrialSubscriptionDefaultPaymentMethod(
    input: SetTrialSubscriptionDefaultPaymentMethodInput,
  ): Promise<void> {
    this.trialSubscriptionDefaultInputs.push(input);
  }

  async createPortalSession(
    input: PortalSessionInput,
    options?: PaymentGatewayRequestOptions,
  ): Promise<PortalSessionOutput> {
    this.portalInputs.push(input);
    this.portalOptions.push(options);
    return { url: this.portalUrl };
  }

  async processWebhookEvent(
    rawBody: string,
    signature: string,
  ): Promise<WebhookEventResult> {
    this.webhookInputs.push({ rawBody, signature });
    return this.webhookResult;
  }
}
