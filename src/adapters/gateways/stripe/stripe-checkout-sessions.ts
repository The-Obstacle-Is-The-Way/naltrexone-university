// WHY large-file: checkout creation is billing-critical and keeps idempotency, concurrent-checkout-race handling, existing-session recovery, trial params, and Stripe error mapping in one reviewed adapter seam.
import { createHash } from 'node:crypto';
import type { StripePriceIds } from '@/src/adapters/config/stripe-prices';
import { getStripePriceId } from '@/src/adapters/config/stripe-prices';
import {
  type CheckoutSessionCreateParams,
  isValidStripeSubscriptionStatus,
  type StripeCheckoutSession,
  type StripeCheckoutSessionList,
  type StripeClient,
  type StripeListedSubscription,
  type StripeSubscriptionStatus,
} from '@/src/adapters/shared/stripe-types';
import { ApplicationError } from '@/src/application/errors';
import type {
  CheckoutSessionInput,
  TrialPaymentMethodSetupSessionInput,
} from '@/src/application/ports/gateways';
import type { Logger } from '@/src/application/ports/logger';
import { MS_PER_SECOND } from '@/src/domain/services';
import { createStripeConsentStateSignature } from './stripe-consent-state';
import { callStripeWithRetry } from './stripe-retry';

export const SUBSCRIPTION_LIST_LIMIT = 10;
export const OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT = 10;
// WHY 25×4: a 2026-08-17 read-only test-mode probe measured 436.6 ms median
// for 25 rows. Under the repository third-attempt-success envelope, four pages
// plus the existing primary-and-ten-rung fallback budget 20.289 s of the
// pricing route's 30 s maxDuration. This is a planning bound, not a timeout.
export const CHECKOUT_SESSION_TAIL_SCAN_PAGE_SIZE = 25;
export const CHECKOUT_SESSION_TAIL_SCAN_PAGE_LIMIT = 4;
// WHY 10: after the bounded tail scan, this caps fallback/race recovery creates;
// each rung is cached create + live retrieve. The 2026-08-14 test-mode probe
// measured 120.5 ms and 99.2 ms medians (5 samples each). At the repository
// retry envelope, a third-attempt success for both calls is 3×120.5 + 300 +
// 3×99.2 + 300 = 1,259.1 ms/rung. Primary + 10 recoveries budgets 13.850 s;
// 11 would budget 15.109 s. This is a healthy-service planning cap, not a
// request timeout or the retained-chain capacity of the exact-match path.
export const SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT = 10;
// WHY 10: strict retrieval makes each retained setup replay rung cached create +
// live retrieve. The 2026-08-14 setup-mode probe measured 120.5 ms create and
// 99.2 ms retrieve medians (5 samples each). At third-attempt success, one rung
// budgets 3×120.5 + 300 + 3×99.2 + 300 = 1,259.1 ms; primary + 10 recoveries
// budgets 13.850 s, below half the app layout's 30 s maxDuration. This is a
// healthy-service planning cap, not a request timeout.
export const TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT = 10;

const SUBSCRIPTION_CHECKOUT_REPLAY_ERROR_LOG_DEPTH = 5;

type CheckoutSessionLiveRetrievalPolicy =
  | 'fallback-to-created'
  | 'require-verified-status';

const BLOCKING_SUBSCRIPTION_STATUSES = new Set<StripeSubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);
const ALREADY_TERMINAL_CHECKOUT_SESSION_ERROR_CODES = new Set([
  'resource_missing',
]);
const ALREADY_TERMINAL_CHECKOUT_SESSION_MESSAGE_PATTERNS = [
  'already complete',
  'already expired',
  'cannot be expired',
] as const;
const STRIPE_IDEMPOTENCY_PARAMETER_MISMATCH_ERROR_TYPES = new Set([
  'idempotency_error',
]);
const STRIPE_IDEMPOTENCY_PARAMETER_MISMATCH_MESSAGE_PATTERNS = [
  'same parameters',
  'does not match',
  "doesn't match",
  'idempotency-key is re-used',
] as const;
const CHECKOUT_SESSION_VARIANT_METADATA_KEY = 'checkout_variant';
const STANDARD_CHECKOUT_SESSION_VARIANT = 'standard';

function checkoutRenewalMetadata(
  input: CheckoutSessionInput,
): Record<string, string> {
  return {
    [CHECKOUT_SESSION_VARIANT_METADATA_KEY]:
      getRequestedCheckoutSessionVariant(input),
    renewal_user_id: input.userId,
    renewal_plan: input.plan,
    renewal_amount_cents: String(input.amountCents),
    renewal_currency: input.currency,
    renewal_frequency: input.frequency,
    renewal_disclosure_snapshot: input.disclosureSnapshot,
    renewal_disclosure_version: input.disclosureVersion,
    renewal_terms_version: input.termsVersion,
    renewal_terms_hash: input.termsHash,
    renewal_cancellation_method: input.cancellationMethod,
  };
}

function checkoutRenewalMetadataMatches(
  session: StripeCheckoutSession,
  input: CheckoutSessionInput,
): boolean {
  const expected = checkoutRenewalMetadata(input);
  return Object.entries(expected).every(
    ([key, value]) => session.metadata?.[key] === value,
  );
}

function hasCheckoutRenewalMetadata(session: StripeCheckoutSession): boolean {
  const metadata = session.metadata;
  if (!metadata) return false;
  return [
    CHECKOUT_SESSION_VARIANT_METADATA_KEY,
    'renewal_user_id',
    'renewal_plan',
    'renewal_amount_cents',
    'renewal_currency',
    'renewal_frequency',
    'renewal_disclosure_snapshot',
    'renewal_disclosure_version',
    'renewal_terms_version',
    'renewal_terms_hash',
    'renewal_cancellation_method',
  ].every((key) => Boolean(metadata[key]));
}

function hasRecognizedCheckoutSessionStatus(
  session: StripeCheckoutSession,
): boolean {
  return (
    session.status === 'open' ||
    session.status === 'complete' ||
    session.status === 'expired'
  );
}

async function findUniqueNewestMatchingCheckoutSession({
  stripe,
  input,
  logger,
}: {
  stripe: StripeClient;
  input: CheckoutSessionInput;
  logger: Logger;
}): Promise<StripeCheckoutSession | null> {
  function logFallback(reason: string, errorName?: string): null {
    logger.warn(
      {
        userId: input.userId,
        externalCustomerId: input.externalCustomerId,
        reason,
        ...(errorName ? { errorName } : {}),
      },
      'Falling back to bounded checkout replay traversal after tail scan was inconclusive',
    );
    return null;
  }

  function selectUnique(
    matchesAtNewestSecond: StripeCheckoutSession[],
  ): StripeCheckoutSession | null {
    if (matchesAtNewestSecond.length === 1) {
      return matchesAtNewestSecond[0] ?? null;
    }
    return logFallback('newest-matching-second-is-ambiguous');
  }

  let startingAfter: string | undefined;
  let previousCreated: number | null = null;
  let newestMatchingCreated: number | null = null;
  const matchesAtNewestSecond: StripeCheckoutSession[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= CHECKOUT_SESSION_TAIL_SCAN_PAGE_LIMIT;
    pageNumber += 1
  ) {
    let page: StripeCheckoutSessionList;
    try {
      page = await callStripeWithRetry({
        operation: 'checkout.sessions.list_replay_tail',
        fn: () =>
          stripe.checkout.sessions.list({
            customer: input.externalCustomerId,
            limit: CHECKOUT_SESSION_TAIL_SCAN_PAGE_SIZE,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          }),
        logger,
      });
    } catch (error) {
      return logFallback(
        'provider-list-failed',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
    if (typeof page.has_more !== 'boolean') {
      return logFallback('provider-list-has-more-is-missing');
    }

    for (const session of page.data) {
      if (typeof session.created !== 'number') {
        return logFallback('listed-session-created-is-missing');
      }
      if (previousCreated !== null && session.created > previousCreated) {
        return logFallback('provider-list-order-is-invalid');
      }
      previousCreated = session.created;

      if (
        newestMatchingCreated !== null &&
        session.created < newestMatchingCreated
      ) {
        return selectUnique(matchesAtNewestSecond);
      }

      const metadataMatches =
        session.mode === 'subscription' &&
        checkoutRenewalMetadataMatches(session, input);
      if (!metadataMatches) continue;
      if (!hasRecognizedCheckoutSessionStatus(session)) {
        return logFallback('newest-matching-session-status-is-missing');
      }

      if (newestMatchingCreated === null) {
        newestMatchingCreated = session.created;
      }
      if (session.created === newestMatchingCreated) {
        matchesAtNewestSecond.push(session);
      }
    }

    if (page.has_more !== true) {
      return newestMatchingCreated === null
        ? null
        : selectUnique(matchesAtNewestSecond);
    }

    const cursor = page.data.at(-1)?.id;
    if (!cursor) return logFallback('provider-list-cursor-is-missing');
    startingAfter = cursor;
  }

  return logFallback('tail-scan-page-limit-reached');
}

export async function createStripeTrialPaymentMethodSetupSession({
  stripe,
  input,
  logger,
  stateSecret,
}: {
  stripe: StripeClient;
  input: TrialPaymentMethodSetupSessionInput;
  logger: Logger;
  stateSecret: string;
}): Promise<{ sessionId: string; url: string }> {
  const metadata = {
    consent_user_id: input.userId,
    consent_customer_id: input.externalCustomerId,
    consent_subscription_id: input.externalSubscriptionId,
    consent_plan: input.plan,
    consent_amount_cents: String(input.amountCents),
    consent_currency: input.currency,
    consent_frequency: input.frequency,
    consent_trial_ends_at: input.trialEndsAt.toISOString(),
    consent_disclosure_version: input.disclosureVersion,
    consent_terms_version: input.termsVersion,
    consent_terms_hash: input.termsHash,
  };
  const params = {
    mode: 'setup',
    currency: input.currency,
    consent_collection: { terms_of_service: 'required' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    metadata: {
      ...metadata,
      consent_state_signature: createStripeConsentStateSignature(
        metadata,
        stateSecret,
      ),
    },
  } satisfies CheckoutSessionCreateParams;
  const requestFingerprint = checkoutSessionRequestFingerprint(params);
  const primaryIdempotencyKey = `trial_setup_session:${input.userId}:${input.externalSubscriptionId}:${input.disclosureVersion}`;
  const requestRecoveryIdempotencyKey = `trial_setup_session_recovery:${input.userId}:${input.externalSubscriptionId}:request:${requestFingerprint}`;

  async function createSession(idempotencyKey: string) {
    return callStripeWithRetry({
      operation: 'checkout.sessions.create_trial_payment_method_setup',
      fn: () =>
        stripe.checkout.sessions.create(params, {
          idempotencyKey,
        }),
      logger,
    });
  }

  async function createWithParameterRecovery(idempotencyKey: string) {
    try {
      return await createSession(idempotencyKey);
    } catch (error) {
      if (
        idempotencyKey === requestRecoveryIdempotencyKey ||
        !isIdempotencyParameterMismatchError(error)
      ) {
        throw error;
      }
      logger.warn(
        {
          userId: input.userId,
          externalSubscriptionId: input.externalSubscriptionId,
          recoveryIdempotencyKey: requestRecoveryIdempotencyKey,
        },
        'Retrying trial setup Session after Stripe idempotency parameter mismatch',
      );
      return createSession(requestRecoveryIdempotencyKey);
    }
  }

  let session = await retrieveLiveCheckoutSessionAfterCreate({
    stripe,
    session: await createWithParameterRecovery(primaryIdempotencyKey),
    logger,
    policy: 'require-verified-status',
  });
  for (
    let attempt = 1;
    !session.url || isSessionInactive(session, Date.now);
    attempt += 1
  ) {
    if (attempt > TRIAL_SETUP_SESSION_REPLAY_TRAVERSAL_LIMIT) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Checkout Session is expired or inactive',
      );
    }
    const recoveryIdempotencyKey = `trial_setup_session_recovery:${input.userId}:${input.externalSubscriptionId}:${session.id}:attempt:${attempt}:${requestFingerprint}`;
    logger.warn(
      {
        userId: input.userId,
        externalSubscriptionId: input.externalSubscriptionId,
        sessionId: session.id,
        recoveryAttempt: attempt,
      },
      'Replacing an inactive trial setup Checkout Session',
    );
    session = await retrieveLiveCheckoutSessionAfterCreate({
      stripe,
      session: await createSession(recoveryIdempotencyKey),
      logger,
      policy: 'require-verified-status',
    });
  }

  return { sessionId: session.id, url: session.url };
}

function getBlockingSubscriptionStatus(
  subscription: StripeListedSubscription | undefined,
): StripeSubscriptionStatus | null {
  if (!subscription) return null;
  if (!subscription.status) return null;
  if (!isValidStripeSubscriptionStatus(subscription.status)) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe subscription status is invalid',
    );
  }
  if (!BLOCKING_SUBSCRIPTION_STATUSES.has(subscription.status)) return null;
  return subscription.status;
}

function isSessionInactive(
  session: StripeCheckoutSession,
  nowMs: () => number,
): boolean {
  if (session.status && session.status !== 'open') {
    return true;
  }

  if (
    typeof session.expires_at === 'number' &&
    session.expires_at * MS_PER_SECOND <= nowMs()
  ) {
    return true;
  }

  return false;
}

function getStringProp(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : null;
}

function isAlreadyTerminalSessionError(error: unknown): boolean {
  if (getStringProp(error, 'rawType') !== 'invalid_request_error') {
    return false;
  }

  const code = getStringProp(error, 'code');
  if (code && ALREADY_TERMINAL_CHECKOUT_SESSION_ERROR_CODES.has(code)) {
    return true;
  }

  const message = getStringProp(error, 'message')?.toLowerCase();
  if (!message) {
    return false;
  }

  return ALREADY_TERMINAL_CHECKOUT_SESSION_MESSAGE_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

function isIdempotencyParameterMismatchError(error: unknown): boolean {
  const errorTypes = [
    getStringProp(error, 'type'),
    getStringProp(error, 'rawType'),
  ];
  if (
    !errorTypes.some(
      (type) =>
        type && STRIPE_IDEMPOTENCY_PARAMETER_MISMATCH_ERROR_TYPES.has(type),
    )
  ) {
    return false;
  }

  const message = getStringProp(error, 'message')?.toLowerCase();
  if (!message) return true;

  return STRIPE_IDEMPOTENCY_PARAMETER_MISMATCH_MESSAGE_PATTERNS.some(
    (pattern) => message.includes(pattern),
  );
}

function getRequestedCheckoutSessionVariant(
  input: CheckoutSessionInput,
): string {
  return input.trialPeriodDays === undefined
    ? STANDARD_CHECKOUT_SESSION_VARIANT
    : `trial:${input.trialPeriodDays}`;
}

function getRetrievedCheckoutSessionVariant(
  session: StripeCheckoutSession,
): string {
  const persistedVariant =
    session.metadata?.[CHECKOUT_SESSION_VARIANT_METADATA_KEY];
  if (persistedVariant) return persistedVariant;

  if (session.payment_method_collection === 'if_required') {
    return 'trial:unknown';
  }

  return STANDARD_CHECKOUT_SESSION_VARIANT;
}

function trialIdempotencyKeySuffix(input: CheckoutSessionInput): string {
  const variant = getRequestedCheckoutSessionVariant(input);
  return variant === STANDARD_CHECKOUT_SESSION_VARIANT ? '' : `:${variant}`;
}

function fallbackCheckoutSessionIdempotencyKey(
  input: CheckoutSessionInput,
): string {
  return `checkout_session:${input.userId}:${input.plan}${trialIdempotencyKeySuffix(input)}`;
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function checkoutSessionRequestFingerprint(
  params: CheckoutSessionCreateParams,
): string {
  return createHash('sha256')
    .update(stableJsonStringify(params))
    .digest('hex')
    .slice(0, 16);
}

function requestRecoveryCheckoutSessionIdempotencyKey(
  input: CheckoutSessionInput,
  params: CheckoutSessionCreateParams,
): string {
  return `checkout_session_recovery:${input.userId}:${input.plan}:request:${checkoutSessionRequestFingerprint(params)}${trialIdempotencyKeySuffix(input)}`;
}

function recoveryCheckoutSessionIdempotencyKey(
  input: CheckoutSessionInput,
  sessionId: string,
): string {
  return `checkout_session_recovery:${input.userId}:${input.plan}:${sessionId}${trialIdempotencyKeySuffix(input)}`;
}

function withoutDuplicateCheckoutSessions(
  sessions: StripeCheckoutSession[],
): StripeCheckoutSession[] {
  const byId = new Map<string, StripeCheckoutSession>();
  for (const session of sessions) {
    if (!byId.has(session.id)) {
      byId.set(session.id, session);
    }
  }

  return Array.from(byId.values());
}

function getCanonicalOpenCheckoutSession(
  sessions: StripeCheckoutSession[],
): StripeCheckoutSession | null {
  const [firstSession, ...remainingSessions] = sessions;
  if (!firstSession) return null;

  return remainingSessions.reduce((canonical, session) => {
    const canonicalCreated = canonical.created;
    const sessionCreated = session.created;

    if (
      typeof sessionCreated === 'number' &&
      typeof canonicalCreated === 'number'
    ) {
      if (sessionCreated > canonicalCreated) return session;
      if (sessionCreated < canonicalCreated) return canonical;
      return session.id > canonical.id ? session : canonical;
    }

    if (
      typeof sessionCreated === 'number' &&
      typeof canonicalCreated !== 'number'
    ) {
      return session;
    }

    return canonical;
  }, firstSession);
}

async function expireSupersededCheckoutSession({
  stripe,
  sessionId,
  logger,
}: {
  stripe: StripeClient;
  sessionId: string;
  logger: Logger;
}): Promise<void> {
  try {
    await callStripeWithRetry({
      operation: 'checkout.sessions.expire',
      fn: () =>
        stripe.checkout.sessions.expire(sessionId, undefined, {
          idempotencyKey: `expire_checkout_session:${sessionId}`,
        }),
      logger,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (isAlreadyTerminalSessionError(error)) {
      logger.info(
        {
          sessionId,
          error: errorMessage,
        },
        'Treating already-terminal checkout session expire error as success',
      );
      return;
    }

    logger.error(
      {
        sessionId,
        error: errorMessage,
      },
      'Failed to expire superseded checkout session',
    );
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Failed to reconcile open checkout sessions',
    );
  }
}

async function reconcileOpenCheckoutSessionsAfterCreate({
  stripe,
  input,
  createdSession,
  logger,
  nowMs,
  ignoredSessionIds,
}: {
  stripe: StripeClient;
  input: CheckoutSessionInput;
  createdSession: StripeCheckoutSession;
  logger: Logger;
  nowMs: () => number;
  ignoredSessionIds: ReadonlySet<string>;
}): Promise<StripeCheckoutSession> {
  const listed = await callStripeWithRetry({
    operation: 'checkout.sessions.list',
    fn: () =>
      stripe.checkout.sessions.list({
        customer: input.externalCustomerId,
        status: 'open',
        limit: OPEN_CHECKOUT_SESSION_RECONCILE_LIMIT,
      }),
    logger,
  });

  const reconciliationNowMs = nowMs();
  const isInactiveAtReconciliation = (session: StripeCheckoutSession) =>
    isSessionInactive(session, () => reconciliationNowMs);
  const listedActiveCandidates = listed.data.filter(
    (session) =>
      !ignoredSessionIds.has(session.id) &&
      session.id !== createdSession.id &&
      hasCheckoutRenewalMetadata(session) &&
      !isInactiveAtReconciliation(session),
  );
  const incompatibleListedActiveCandidates = listed.data.filter(
    (session) =>
      !ignoredSessionIds.has(session.id) &&
      session.id !== createdSession.id &&
      !hasCheckoutRenewalMetadata(session) &&
      !isInactiveAtReconciliation(session),
  );
  const candidates = withoutDuplicateCheckoutSessions(
    isInactiveAtReconciliation(createdSession)
      ? listedActiveCandidates
      : [createdSession, ...listedActiveCandidates],
  );
  const canonicalSession = getCanonicalOpenCheckoutSession(candidates);
  if (!canonicalSession) return createdSession;

  const supersededSessions = withoutDuplicateCheckoutSessions([
    ...candidates.filter((session) => session.id !== canonicalSession.id),
    ...incompatibleListedActiveCandidates,
  ]);

  await Promise.all(
    supersededSessions.map((session) =>
      expireSupersededCheckoutSession({
        stripe,
        sessionId: session.id,
        logger,
      }),
    ),
  );

  return canonicalSession;
}

function mergeCheckoutSessionSnapshot({
  createdSession,
  retrievedSession,
}: {
  createdSession: StripeCheckoutSession;
  retrievedSession: StripeCheckoutSession;
}): StripeCheckoutSession {
  return {
    ...createdSession,
    ...retrievedSession,
    id: retrievedSession.id ?? createdSession.id,
    url: retrievedSession.url ?? createdSession.url,
    created: retrievedSession.created ?? createdSession.created,
    status: retrievedSession.status ?? createdSession.status,
    expires_at: retrievedSession.expires_at ?? createdSession.expires_at,
  };
}

async function retrieveLiveCheckoutSessionAfterCreate({
  stripe,
  session,
  logger,
  policy,
}: {
  stripe: StripeClient;
  session: StripeCheckoutSession;
  logger: Logger;
  policy: CheckoutSessionLiveRetrievalPolicy;
}): Promise<StripeCheckoutSession> {
  let retrievedSession: StripeCheckoutSession;
  try {
    retrievedSession = await callStripeWithRetry({
      operation: 'checkout.sessions.retrieve',
      fn: () => stripe.checkout.sessions.retrieve(session.id),
      logger,
    });
  } catch (error) {
    if (policy === 'require-verified-status') {
      throw error;
    }
    logger.warn(
      {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Falling back to created checkout session snapshot after live retrieval failed',
    );
    return session;
  }

  if (retrievedSession.id !== session.id) {
    if (policy === 'require-verified-status') {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Checkout Session live retrieval returned a mismatched id',
      );
    }
    logger.warn(
      {
        createdSessionId: session.id,
        retrievedSessionId: retrievedSession.id,
      },
      'Ignoring checkout session retrieval result with mismatched id',
    );
    return session;
  }

  if (
    policy === 'require-verified-status' &&
    (retrievedSession.status === undefined || retrievedSession.status === null)
  ) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe Checkout Session live status is missing',
    );
  }

  return mergeCheckoutSessionSnapshot({
    createdSession: session,
    retrievedSession,
  });
}

export async function createStripeCheckoutSession({
  stripe,
  input,
  priceIds,
  logger,
  nowMs = Date.now,
}: {
  stripe: StripeClient;
  input: CheckoutSessionInput;
  priceIds: StripePriceIds;
  logger: Logger;
  nowMs?: (() => number) | undefined;
}): Promise<{ url: string }> {
  const priceId = getStripePriceId(input.plan, priceIds);
  const trialRequested = input.trialPeriodDays !== undefined;
  const requestedCheckoutVariant = getRequestedCheckoutSessionVariant(input);
  const subscriptionsList = stripe.subscriptions?.list?.bind(
    stripe.subscriptions,
  );
  if (subscriptionsList) {
    const subscriptions = await callStripeWithRetry({
      operation: 'subscriptions.list',
      fn: () =>
        subscriptionsList({
          customer: input.externalCustomerId,
          status: 'all',
          limit: SUBSCRIPTION_LIST_LIMIT,
        }),
      logger,
    });

    let blockingSubscription: StripeListedSubscription | null = null;
    let blockingStatus: StripeSubscriptionStatus | null = null;
    for (const subscription of subscriptions.data) {
      const status = getBlockingSubscriptionStatus(subscription);
      if (!status) continue;
      blockingSubscription = subscription;
      blockingStatus = status;
      break;
    }

    if (blockingSubscription && blockingStatus) {
      logger.warn(
        {
          userId: input.userId,
          externalCustomerId: input.externalCustomerId,
          externalSubscriptionId: blockingSubscription.id ?? null,
          subscriptionStatus: blockingStatus,
        },
        'Stripe already has a blocking subscription for customer',
      );
      throw new ApplicationError(
        'ALREADY_SUBSCRIBED',
        'Subscription already exists for this customer',
      );
    }
  }

  const existing = await callStripeWithRetry({
    operation: 'checkout.sessions.list',
    fn: () =>
      stripe.checkout.sessions.list({
        customer: input.externalCustomerId,
        status: 'open',
        limit: 1,
      }),
    logger,
  });

  const existingSession = existing.data[0];
  const existingUrl = existingSession?.url;
  let replacementIdempotencyKey: string | null = null;
  const ignoredOpenSessionIdsAfterCreate = new Set<string>();
  if (existingSession && existingUrl) {
    let existingPriceId: string | undefined;
    let existingCheckoutVariant: string | null = null;
    let retrievedSession: StripeCheckoutSession | null = null;
    let shouldExpireExistingSession = false;
    let expireFailureIsFatal = false;
    try {
      const session = await callStripeWithRetry({
        operation: 'checkout.sessions.retrieve',
        fn: () =>
          stripe.checkout.sessions.retrieve(existingSession.id, {
            expand: ['line_items'],
          }),
        logger,
      });
      retrievedSession = session;
      existingPriceId = session.line_items?.data?.[0]?.price?.id;
      existingCheckoutVariant = getRetrievedCheckoutSessionVariant(session);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      if (trialRequested) {
        replacementIdempotencyKey = recoveryCheckoutSessionIdempotencyKey(
          input,
          existingSession.id,
        );
      }
      logger.warn(
        {
          sessionId: existingSession.id,
          error: errorMessage,
          cause: error,
        },
        'Failed to inspect existing checkout session',
      );
    }

    if (existingPriceId === priceId) {
      const checkoutVariantMatches =
        existingCheckoutVariant === requestedCheckoutVariant;
      const consentEvidenceMatches =
        retrievedSession !== null &&
        checkoutRenewalMetadataMatches(retrievedSession, input);

      if (
        checkoutVariantMatches &&
        consentEvidenceMatches &&
        (!retrievedSession || !isSessionInactive(retrievedSession, nowMs))
      ) {
        return { url: existingUrl };
      }

      if (retrievedSession && !isSessionInactive(retrievedSession, nowMs)) {
        if (trialRequested) {
          replacementIdempotencyKey = recoveryCheckoutSessionIdempotencyKey(
            input,
            existingSession.id,
          );
        }
        shouldExpireExistingSession = true;
        expireFailureIsFatal = true;
        logger.warn(
          {
            sessionId: existingSession.id,
            existingPriceId,
            requestedPriceId: priceId,
            existingCheckoutVariant,
            requestedCheckoutVariant,
            consentEvidenceMatches,
            trialRequested,
          },
          'Expiring existing checkout session to enforce requested checkout terms',
        );
      } else {
        ignoredOpenSessionIdsAfterCreate.add(existingSession.id);
        logger.info(
          {
            sessionId: existingSession.id,
            existingPriceId,
            requestedPriceId: priceId,
            existingCheckoutVariant,
            requestedCheckoutVariant,
            status: retrievedSession?.status ?? null,
            expiresAt: retrievedSession?.expires_at ?? null,
          },
          'Existing checkout session matched price but was already inactive; creating a fresh checkout session',
        );
      }
    } else if (existingPriceId) {
      if (trialRequested) {
        replacementIdempotencyKey = recoveryCheckoutSessionIdempotencyKey(
          input,
          existingSession.id,
        );
      }
      shouldExpireExistingSession = true;
      expireFailureIsFatal = true;
      // Avoid reusing a checkout session for a different plan. If the user
      // changes plans, we expire the old session and create a new one so the
      // Stripe UI matches their selection.
      logger.warn(
        {
          sessionId: existingSession.id,
          existingPriceId,
          requestedPriceId: priceId,
          trialRequested,
        },
        'Expiring mismatched checkout session',
      );
    } else {
      if (trialRequested) {
        replacementIdempotencyKey = recoveryCheckoutSessionIdempotencyKey(
          input,
          existingSession.id,
        );
      }
      shouldExpireExistingSession = true;
      expireFailureIsFatal = false;
      logger.warn(
        {
          sessionId: existingSession.id,
        },
        'Expiring existing checkout session after failed inspection',
      );
    }

    if (shouldExpireExistingSession) {
      try {
        await callStripeWithRetry({
          operation: 'checkout.sessions.expire',
          fn: () =>
            stripe.checkout.sessions.expire(existingSession.id, undefined, {
              idempotencyKey: `expire_checkout_session:${existingSession.id}`,
            }),
          logger,
        });
        ignoredOpenSessionIdsAfterCreate.add(existingSession.id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        if (isAlreadyTerminalSessionError(error)) {
          ignoredOpenSessionIdsAfterCreate.add(existingSession.id);
          logger.info(
            {
              sessionId: existingSession.id,
              existingPriceId,
              requestedPriceId: priceId,
              error: errorMessage,
            },
            'Treating already-terminal checkout session expire error as success',
          );
          // Stripe already considers the session terminal, so the adapter can
          // safely continue with fresh checkout creation.
        } else if (expireFailureIsFatal) {
          logger.error(
            {
              sessionId: existingSession.id,
              existingPriceId,
              requestedPriceId: priceId,
              error: errorMessage,
            },
            'Failed to expire mismatched checkout session',
          );
          throw new ApplicationError(
            'STRIPE_ERROR',
            'Failed to expire existing checkout session',
          );
        } else {
          logger.warn(
            {
              sessionId: existingSession.id,
              existingPriceId,
              requestedPriceId: priceId,
              error: errorMessage,
            },
            'Failed to expire existing checkout session after failed inspection; continuing with checkout creation',
          );
        }
      }
    }
    if (replacementIdempotencyKey) {
      logger.info(
        {
          sessionId: existingSession.id,
          replacementIdempotencyKey,
          trialRequested,
        },
        'Using replacement idempotency key for fresh checkout session',
      );
    }
  }

  const baseParams = {
    mode: 'subscription',
    customer: input.externalCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: false,
    billing_address_collection: 'auto',
    consent_collection: { terms_of_service: 'required' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    metadata: checkoutRenewalMetadata(input),
    subscription_data: {
      metadata: {
        user_id: input.userId,
      },
    },
  } satisfies CheckoutSessionCreateParams;
  const params =
    input.trialPeriodDays === undefined
      ? baseParams
      : ({
          ...baseParams,
          payment_method_collection: 'if_required',
          subscription_data: {
            ...baseParams.subscription_data,
            trial_period_days: input.trialPeriodDays,
            trial_settings: {
              end_behavior: {
                missing_payment_method: 'cancel',
              },
            },
          },
        } satisfies CheckoutSessionCreateParams);

  async function createSession(
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession> {
    return callStripeWithRetry({
      operation: 'checkout.sessions.create',
      fn: () =>
        stripe.checkout.sessions.create(params, {
          idempotencyKey,
        }),
      logger,
    });
  }

  const requestRecoveryIdempotencyKey =
    requestRecoveryCheckoutSessionIdempotencyKey(input, params);
  async function createSessionWithIdempotencyParameterRecovery(
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession> {
    try {
      return await createSession(idempotencyKey);
    } catch (error) {
      if (
        idempotencyKey === requestRecoveryIdempotencyKey ||
        !isIdempotencyParameterMismatchError(error)
      ) {
        throw error;
      }

      logger.warn(
        {
          userId: input.userId,
          plan: input.plan,
          idempotencyKey,
          recoveryIdempotencyKey: requestRecoveryIdempotencyKey,
        },
        'Retrying checkout session creation after Stripe idempotency parameter mismatch',
      );

      return createSession(requestRecoveryIdempotencyKey);
    }
  }

  const primaryIdempotencyKey =
    replacementIdempotencyKey ?? fallbackCheckoutSessionIdempotencyKey(input);
  let session = await retrieveLiveCheckoutSessionAfterCreate({
    stripe,
    session: await createSessionWithIdempotencyParameterRecovery(
      primaryIdempotencyKey,
    ),
    logger,
    policy: 'fallback-to-created',
  });

  let sessionIsInactive = isSessionInactive(session, nowMs);
  if (sessionIsInactive) {
    const newestMatchingSession = await findUniqueNewestMatchingCheckoutSession(
      { stripe, input, logger },
    );
    if (newestMatchingSession) {
      session =
        newestMatchingSession.status === 'open'
          ? await retrieveLiveCheckoutSessionAfterCreate({
              stripe,
              session: newestMatchingSession,
              logger,
              policy: 'fallback-to-created',
            })
          : newestMatchingSession;
      sessionIsInactive = isSessionInactive(session, nowMs);
    }
  }

  for (let attempt = 1; sessionIsInactive; attempt += 1) {
    if (attempt > SUBSCRIPTION_CHECKOUT_REPLAY_TRAVERSAL_LIMIT) {
      throw new ApplicationError(
        'STRIPE_ERROR',
        'Stripe Checkout Session is expired or inactive',
      );
    }

    const recoveryIdempotencyKey = recoveryCheckoutSessionIdempotencyKey(
      input,
      session.id,
    );
    const recoveryLogContext = {
      userId: input.userId,
      externalCustomerId: input.externalCustomerId,
      plan: input.plan,
      primaryIdempotencyKey,
      recoveryIdempotencyKey,
      recoveryAttempt: attempt,
      sessionId: session.id,
      status: session.status ?? null,
      expiresAt: session.expires_at ?? null,
    };
    const recoveryLogMessage =
      'Retrying checkout session creation with recovery idempotency key';
    if (attempt >= SUBSCRIPTION_CHECKOUT_REPLAY_ERROR_LOG_DEPTH) {
      logger.error(recoveryLogContext, recoveryLogMessage);
    } else {
      logger.warn(recoveryLogContext, recoveryLogMessage);
    }

    session = await retrieveLiveCheckoutSessionAfterCreate({
      stripe,
      session: await createSessionWithIdempotencyParameterRecovery(
        recoveryIdempotencyKey,
      ),
      logger,
      policy: 'fallback-to-created',
    });
    sessionIsInactive = isSessionInactive(session, nowMs);
  }

  const canonicalRecoveredSession =
    await reconcileOpenCheckoutSessionsAfterCreate({
      stripe,
      input,
      createdSession: session,
      logger,
      nowMs,
      ignoredSessionIds: ignoredOpenSessionIdsAfterCreate,
    });

  if (!canonicalRecoveredSession.url) {
    throw new ApplicationError(
      'STRIPE_ERROR',
      'Stripe Checkout Session URL is missing',
    );
  }

  return { url: canonicalRecoveredSession.url };
}
