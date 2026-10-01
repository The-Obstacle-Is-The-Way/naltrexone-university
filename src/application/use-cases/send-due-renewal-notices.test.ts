import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { parseTransactionalEmailPayloadSnapshot } from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import { createMatchingRenewalNoticeTargets } from '@/src/application/test-helpers/renewal-notice-targets';
import { createDeferred } from '@/tests/test-helpers/create-deferred';
import { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';
import {
  type ScheduledRenewalNotice,
  SendDueRenewalNoticesUseCase,
} from './send-due-renewal-notices';

const now = new Date('2026-08-07T12:00:00.000Z');
const renewalAt = new Date('2026-09-06T12:00:00.000Z');

function scheduledNotice(
  overrides: Partial<ScheduledRenewalNotice> = {},
): ScheduledRenewalNotice {
  return {
    noticeKind: 'renewal_notice',
    externalSubscriptionId: 'sub_annual_123',
    applicableAt: renewalAt,
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    planName: 'Pro Annual',
    amountCents: 19900,
    currency: 'usd',
    frequency: 'year',
    cancellationMethod:
      'Cancel on the Billing page in the app or email support@addictionboards.com.',
    changeDescription: null,
    ...overrides,
  };
}

// Dispatch revalidates scheduled notices (DEBT-414 F07), so each case names
// the subscriptions it notifies; all still match their notices.
function matchingNoticeTargets(
  externalSubscriptionIds: readonly string[] = ['sub_annual_123'],
) {
  return createMatchingRenewalNoticeTargets({
    externalSubscriptionIds,
    renewalAt,
    destination: 'subscriber@example.com',
  });
}

async function createHarness(input?: {
  configured?: boolean;
  onSend?: () => void | Promise<void>;
  externalSubscriptionIds?: readonly string[];
}) {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  const gateway = new FakeTransactionalEmailGateway({
    configured: input?.configured ?? true,
    ...(input?.onSend ? { onSend: input.onSend } : {}),
  });
  const logger = new FakeLogger();
  let deliverySequence = 0;
  let attemptSequence = 0;
  const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
    repository,
    gateway,
    await matchingNoticeTargets(input?.externalSubscriptionIds),
    hasher,
    new FakeLogger(),
    () => now,
    () => `attempt-${++attemptSequence}`,
  );
  const useCase = new SendDueRenewalNoticesUseCase(
    repository,
    hasher,
    dispatch,
    logger,
    'https://addictionboards.com',
    () => now,
    () =>
      `11111111-1111-4111-8111-${String(++deliverySequence).padStart(12, '0')}`,
  );
  return { gateway, hasher, logger, repository, useCase };
}

describe('SendDueRenewalNoticesUseCase', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues and dispatches the annual renewal notice with statutory content', async () => {
    const { gateway, hasher, repository, useCase } = await createHarness();

    const result = await useCase.execute({
      notices: [scheduledNotice()],
      limit: 100,
    });

    expect(result).toEqual({
      queued: 1,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 1,
      staleUnknown: 0,
      dispatchFailures: 0,
    });
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]).toMatchObject({
      noticeKind: 'renewal_notice',
      consentRecordId: null,
      externalSubscriptionId: 'sub_annual_123',
      applicableAt: renewalAt,
      disclosureVersion: '2026-08-05',
      destination: 'subscriber@example.com',
      status: 'accepted',
    });
    const payload = parseTransactionalEmailPayloadSnapshot(
      {
        snapshot: repository.records[0]?.payloadSnapshot ?? '',
        hash: repository.records[0]?.payloadHash ?? '',
        destination: repository.records[0]?.destination ?? '',
      },
      hasher,
    );
    expect(payload.text).toContain('September 6, 2026');
    expect(payload.text).toContain('$199.00 USD every year');
    expect(payload.text).toContain('Billing page in the app');
    expect(payload.text).toContain('support@addictionboards.com');
    expect(payload.text).toContain('https://addictionboards.com/terms');
    expect(payload.text).toContain('https://addictionboards.com/privacy');
    expect(gateway.sendInputs).toHaveLength(1);
  });

  it('creates separate annual-reminder and renewal-notice identities and deduplicates cron replay', async () => {
    const { gateway, repository, useCase } = await createHarness();
    const notices = [
      scheduledNotice({ noticeKind: 'annual_reminder' }),
      scheduledNotice({ noticeKind: 'renewal_notice' }),
    ];

    await useCase.execute({ notices, limit: 100 });
    const replay = await useCase.execute({ notices, limit: 100 });

    expect(replay).toEqual({
      queued: 0,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 0,
      staleUnknown: 0,
      dispatchFailures: 0,
    });
    expect(repository.records.map((row) => row.noticeKind).sort()).toEqual([
      'annual_reminder',
      'renewal_notice',
    ]);
    expect(gateway.sendInputs).toHaveLength(2);
  });

  it('leaves selected rows queued and makes no provider call when Resend is unconfigured', async () => {
    const { gateway, repository, useCase } = await createHarness({
      configured: false,
    });

    const result = await useCase.execute({
      notices: [scheduledNotice()],
      limit: 100,
    });

    expect(result.selected).toBe(1);
    expect(repository.records[0]?.status).toBe('queued');
    expect(gateway.sendInputs).toEqual([]);
  });

  it('moves stale processing claims to outcome_unknown without resending them', async () => {
    const { gateway, repository, useCase } = await createHarness();
    await useCase.execute({
      notices: [scheduledNotice()],
      limit: 100,
    });
    const row = repository.records[0];
    if (!row) throw new Error('expected queued notice');
    Object.assign(row, {
      status: 'processing' as const,
      attemptId: 'lost-worker',
      attemptStartedAt: new Date('2026-08-07T11:40:00.000Z'),
      providerEventId: null,
    });
    gateway.sendInputs.length = 0;

    const result = await useCase.execute({ notices: [], limit: 100 });

    expect(result).toEqual({
      queued: 0,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 0,
      staleUnknown: 1,
      dispatchFailures: 0,
    });
    expect(row).toMatchObject({
      status: 'outcome_unknown',
      failureClass: 'stale_processing_claim',
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('allows only one provider call across two concurrent workers', async () => {
    const sendStarted = createDeferred<void>();
    const allowSend = createDeferred<void>();
    const { gateway, repository, useCase } = await createHarness({
      onSend: async () => {
        sendStarted.resolve(undefined);
        await allowSend.promise;
      },
    });
    const notice = scheduledNotice();

    const firstWorker = useCase.execute({ notices: [notice], limit: 100 });
    await sendStarted.promise;
    const secondWorker = useCase.execute({ notices: [notice], limit: 100 });
    await secondWorker;
    allowSend.resolve(undefined);
    await firstWorker;

    expect(gateway.sendInputs).toHaveLength(1);
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]?.status).toBe('accepted');
  });

  it('bounds provider dispatch concurrency', async () => {
    const release = createDeferred<void>();
    const allWorkersStarted = createDeferred<void>();
    let active = 0;
    let maxActive = 0;
    const { useCase } = await createHarness({
      externalSubscriptionIds: Array.from(
        { length: 12 },
        (_, index) => `sub_annual_${index}`,
      ),
      onSend: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (maxActive === 4) allWorkersStarted.resolve(undefined);
        await release.promise;
        active -= 1;
      },
    });
    const notices = Array.from({ length: 12 }, (_, index) =>
      scheduledNotice({
        externalSubscriptionId: `sub_annual_${index}`,
      }),
    );

    const execution = useCase.execute({ notices, limit: 100 });
    await allWorkersStarted.promise;

    expect(maxActive).toBe(4);
    release.resolve(undefined);
    await execution;
  });

  it('awaits the full batch without rejecting when one selected row is poisoned', async () => {
    const hasher = new FakeSha256Hasher();
    const repository = new FakeRenewalNoticeDeliveryRepository(
      () => now,
      hasher,
    );
    const gateway = new FakeTransactionalEmailGateway({ configured: true });
    let attemptSequence = 0;
    const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      gateway,
      await matchingNoticeTargets(['sub_poisoned', 'sub_healthy']),
      hasher,
      new FakeLogger(),
      () => now,
      () => `attempt-${++attemptSequence}`,
    );
    let deliverySequence = 0;
    const useCase = new SendDueRenewalNoticesUseCase(
      repository,
      hasher,
      {
        execute: async ({ deliveryId }) => {
          if (deliveryId.endsWith('000000000001')) {
            throw new Error('poisoned delivery');
          }
          return dispatch.execute({ deliveryId });
        },
      },
      new FakeLogger(),
      'https://addictionboards.com',
      () => now,
      () =>
        `11111111-1111-4111-8111-${String(++deliverySequence).padStart(12, '0')}`,
    );

    await expect(
      useCase.execute({
        notices: [
          scheduledNotice({ externalSubscriptionId: 'sub_poisoned' }),
          scheduledNotice({ externalSubscriptionId: 'sub_healthy' }),
        ],
        limit: 100,
      }),
    ).resolves.toEqual({
      queued: 2,
      queueFailures: 0,
      rejectedNotices: 0,
      selected: 2,
      staleUnknown: 0,
      dispatchFailures: 1,
    });
    expect(gateway.sendInputs).toHaveLength(1);
    expect(repository.records).toEqual([
      expect.objectContaining({ status: 'queued' }),
      expect.objectContaining({ status: 'accepted' }),
    ]);
  });

  it('rejects malformed source notices without blocking healthy queueing or due dispatch', async () => {
    const { gateway, repository, useCase } = await createHarness({
      externalSubscriptionIds: ['sub_healthy'],
    });

    const result = await useCase.execute({
      notices: [
        scheduledNotice({ destination: '   ' }),
        scheduledNotice({ applicableAt: new Date('invalid') }),
        scheduledNotice({ amountCents: 19.5 }),
        scheduledNotice({ amountCents: -1 }),
        scheduledNotice({ externalSubscriptionId: '   ' }),
        scheduledNotice({ disclosureVersion: '   ' }),
        scheduledNotice({ noticeKind: 'material_change' }),
        scheduledNotice({ noticeKind: 'fee_change', changeDescription: '  ' }),
        scheduledNotice({ externalSubscriptionId: 'sub_healthy' }),
      ],
      limit: 100,
    });

    expect(result).toEqual({
      queued: 1,
      queueFailures: 0,
      rejectedNotices: 8,
      selected: 1,
      staleUnknown: 0,
      dispatchFailures: 0,
    });
    expect(repository.records).toEqual([
      expect.objectContaining({
        externalSubscriptionId: 'sub_healthy',
        status: 'accepted',
      }),
    ]);
    expect(gateway.sendInputs).toHaveLength(1);
  });

  it('isolates a queue conflict so later notices still queue and dispatch', async () => {
    const hasher = new FakeSha256Hasher();
    class ThrowingLogger extends FakeLogger {
      override error(
        context: Parameters<FakeLogger['error']>[0],
        msg: string,
      ): void {
        super.error(context, msg);
        throw new Error('logger unavailable');
      }
    }
    const logger = new ThrowingLogger();
    class ConflictOnceRepository extends FakeRenewalNoticeDeliveryRepository {
      private conflicted = false;

      override async saveQueued(
        input: Parameters<FakeRenewalNoticeDeliveryRepository['saveQueued']>[0],
      ) {
        if (!this.conflicted) {
          this.conflicted = true;
          throw new ApplicationError(
            'CONFLICT',
            'Renewal notice delivery identity is bound to another payload',
          );
        }
        return super.saveQueued(input);
      }
    }
    const repository = new ConflictOnceRepository(() => now, hasher);
    const gateway = new FakeTransactionalEmailGateway({ configured: true });
    const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      gateway,
      await matchingNoticeTargets(['sub_conflict', 'sub_healthy']),
      hasher,
      new FakeLogger(),
      () => now,
      () => 'attempt-healthy',
    );
    let deliverySequence = 0;
    const useCase = new SendDueRenewalNoticesUseCase(
      repository,
      hasher,
      dispatch,
      logger,
      'https://addictionboards.com',
      () => now,
      () =>
        `11111111-1111-4111-8111-${String(++deliverySequence).padStart(12, '0')}`,
    );

    await expect(
      useCase.execute({
        notices: [
          scheduledNotice({ externalSubscriptionId: 'sub_conflict' }),
          scheduledNotice({ externalSubscriptionId: 'sub_healthy' }),
        ],
        limit: 100,
      }),
    ).resolves.toEqual({
      queued: 1,
      queueFailures: 1,
      rejectedNotices: 0,
      selected: 1,
      staleUnknown: 0,
      dispatchFailures: 0,
    });
    expect(repository.records).toEqual([
      expect.objectContaining({
        externalSubscriptionId: 'sub_healthy',
        status: 'accepted',
      }),
    ]);
    expect(gateway.sendInputs).toHaveLength(1);
    expect(logger.errorCalls).toEqual([
      {
        context: {
          noticeKind: 'renewal_notice',
          stripeSubscriptionId: 'sub_conflict',
          errorCode: 'CONFLICT',
          errorName: 'ApplicationError',
        },
        msg: 'Renewal notice queueing failed',
      },
    ]);
  });

  // A processing claim older than 15 minutes is a lost worker's; a younger
  // one may still be sending.
  it('leaves a processing claim younger than 15 minutes alone', async () => {
    const { repository, useCase } = await createHarness({ configured: false });
    await useCase.execute({ notices: [scheduledNotice()], limit: 100 });
    const row = repository.records[0];
    if (!row) throw new Error('expected queued notice');
    Object.assign(row, {
      status: 'processing' as const,
      attemptId: 'live-worker',
      attemptStartedAt: new Date('2026-08-07T11:46:00.000Z'),
    });

    const result = await useCase.execute({ notices: [], limit: 100 });

    expect(result.staleUnknown).toBe(0);
    expect(row.status).toBe('processing');
  });

  it('queues a notice for a zero amount and trims its destination', async () => {
    const { repository, useCase } = await createHarness({ configured: false });

    const result = await useCase.execute({
      notices: [
        scheduledNotice({
          amountCents: 0,
          destination: '  subscriber@example.com  ',
        }),
      ],
      limit: 100,
    });

    expect(result.queued).toBe(1);
    expect(repository.records[0]?.destination).toBe('subscriber@example.com');
  });

  it('dispatches no more due notices than the limit', async () => {
    const { useCase } = await createHarness({
      configured: false,
      externalSubscriptionIds: ['sub_first', 'sub_second'],
    });

    const result = await useCase.execute({
      notices: [
        scheduledNotice({ externalSubscriptionId: 'sub_first' }),
        scheduledNotice({ externalSubscriptionId: 'sub_second' }),
      ],
      limit: 1,
    });

    expect(result).toMatchObject({ queued: 2, selected: 1 });
  });

  it('logs a queueing failure that is not an Error by its kind alone', async () => {
    class ThrowingRepository extends FakeRenewalNoticeDeliveryRepository {
      override async saveQueued(): Promise<never> {
        throw 'storage unavailable';
      }
    }
    const hasher = new FakeSha256Hasher();
    const repository = new ThrowingRepository(() => now, hasher);
    const logger = new FakeLogger();
    const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      new FakeTransactionalEmailGateway({ configured: false }),
      await matchingNoticeTargets(),
      hasher,
      new FakeLogger(),
      () => now,
      () => 'attempt-1',
    );
    const useCase = new SendDueRenewalNoticesUseCase(
      repository,
      hasher,
      dispatch,
      logger,
      'https://addictionboards.com',
      () => now,
      () => '11111111-1111-4111-8111-000000000001',
    );

    await expect(
      useCase.execute({ notices: [scheduledNotice()], limit: 100 }),
    ).resolves.toMatchObject({ queueFailures: 1 });
    expect(logger.errorCalls).toEqual([
      {
        context: {
          noticeKind: 'renewal_notice',
          stripeSubscriptionId: 'sub_annual_123',
          errorCode: null,
          errorName: 'unknown',
        },
        msg: 'Renewal notice queueing failed',
      },
    ]);
  });

  // Frozen ten minutes after a claim began, the system clock finds it not yet
  // stale; the real clock would.
  it('reads the system clock and makes its own ids when none are injected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const hasher = new FakeSha256Hasher();
    const repository = new FakeRenewalNoticeDeliveryRepository(
      () => now,
      hasher,
    );
    const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      new FakeTransactionalEmailGateway({ configured: false }),
      await matchingNoticeTargets(),
      hasher,
      new FakeLogger(),
      () => now,
      () => 'attempt-1',
    );
    const useCase = new SendDueRenewalNoticesUseCase(
      repository,
      hasher,
      dispatch,
      new FakeLogger(),
      'https://addictionboards.com',
    );
    await useCase.execute({ notices: [scheduledNotice()], limit: 100 });
    const row = repository.records[0];
    if (!row) throw new Error('expected queued notice');
    Object.assign(row, {
      status: 'processing' as const,
      attemptId: 'live-worker',
      attemptStartedAt: new Date('2026-08-07T11:50:00.000Z'),
    });

    const result = await useCase.execute({ notices: [], limit: 100 });

    expect(result.staleUnknown).toBe(0);
    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
