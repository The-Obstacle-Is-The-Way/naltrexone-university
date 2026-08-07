import { describe, expect, it } from 'vitest';
import { parseTransactionalEmailPayloadSnapshot } from '@/src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
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

function createHarness(input?: {
  configured?: boolean;
  onSend?: () => void | Promise<void>;
}) {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  const gateway = new FakeTransactionalEmailGateway({
    configured: input?.configured ?? true,
    ...(input?.onSend ? { onSend: input.onSend } : {}),
  });
  let deliverySequence = 0;
  let attemptSequence = 0;
  const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
    repository,
    gateway,
    hasher,
    () => now,
    () => `attempt-${++attemptSequence}`,
  );
  const useCase = new SendDueRenewalNoticesUseCase(
    repository,
    hasher,
    dispatch,
    'https://addictionboards.com',
    () => now,
    () =>
      `11111111-1111-4111-8111-${String(++deliverySequence).padStart(12, '0')}`,
  );
  return { gateway, hasher, repository, useCase };
}

describe('SendDueRenewalNoticesUseCase', () => {
  it('queues and dispatches the annual renewal notice with statutory content', async () => {
    const { gateway, hasher, repository, useCase } = createHarness();

    const result = await useCase.execute({
      notices: [scheduledNotice()],
      limit: 100,
    });

    expect(result).toEqual({ queued: 1, selected: 1, staleUnknown: 0 });
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]).toMatchObject({
      noticeKind: 'renewal_notice',
      consentRecordId: null,
      externalSubscriptionId: 'sub_annual_123',
      applicableAt: renewalAt,
      disclosureVersion: '2026-08-05',
      destination: 'subscriber@example.com',
      status: 'delivered',
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
    const { gateway, repository, useCase } = createHarness();
    const notices = [
      scheduledNotice({ noticeKind: 'annual_reminder' }),
      scheduledNotice({ noticeKind: 'renewal_notice' }),
    ];

    await useCase.execute({ notices, limit: 100 });
    const replay = await useCase.execute({ notices, limit: 100 });

    expect(replay).toEqual({ queued: 0, selected: 0, staleUnknown: 0 });
    expect(repository.records.map((row) => row.noticeKind).sort()).toEqual([
      'annual_reminder',
      'renewal_notice',
    ]);
    expect(gateway.sendInputs).toHaveLength(2);
  });

  it('renders the pinned material-change and fee-change instructions', async () => {
    const { hasher, repository, useCase } = createHarness({
      configured: false,
    });

    await useCase.execute({
      notices: [
        scheduledNotice({
          noticeKind: 'material_change',
          changeDescription:
            'The annual renewal terms will change on the date shown.',
        }),
        scheduledNotice({
          noticeKind: 'fee_change',
          changeDescription: 'The annual price will change to $219.',
        }),
      ],
      limit: 100,
    });

    expect(repository.records).toHaveLength(2);
    for (const row of repository.records) {
      const payload = parseTransactionalEmailPayloadSnapshot(
        {
          snapshot: row.payloadSnapshot,
          hash: row.payloadHash,
          destination: row.destination,
        },
        hasher,
      );
      expect(payload.text).toContain('Material change effective');
      expect(payload.text).toContain('Billing page in the app');
      expect(payload.text).toContain('support@addictionboards.com');
    }
    expect(repository.records[1]?.payloadSnapshot).toContain('$219');
  });

  it('leaves selected rows queued and makes no provider call when Resend is unconfigured', async () => {
    const { gateway, repository, useCase } = createHarness({
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
    const { gateway, repository, useCase } = createHarness();
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

    expect(result).toEqual({ queued: 0, selected: 0, staleUnknown: 1 });
    expect(row).toMatchObject({
      status: 'outcome_unknown',
      failureClass: 'stale_processing_claim',
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('allows only one provider call across two concurrent workers', async () => {
    const sendStarted = createDeferred<void>();
    const allowSend = createDeferred<void>();
    const { gateway, repository, useCase } = createHarness({
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
    expect(repository.records[0]?.status).toBe('delivered');
  });
});
