import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeOperationalAlerts,
  FakeRenewalNoticeDeliveryRepository,
} from '@/src/application/test-helpers/fakes';
import { FakeSha256Hasher } from '@/src/application/test-helpers/fakes/fake-sha256-hasher';
import { RecordRenewalNoticeProviderOutcomeUseCase } from './record-renewal-notice-provider-outcome';

const now = new Date('2026-09-30T12:00:00.000Z');
const observedAt = new Date('2026-09-30T12:05:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';

async function acceptedNotice() {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  const payload = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: 'subscriber@example.com',
      replyTo: 'support@addictionboards.com',
      subject: 'Annual subscription reminder',
      html: '<p>Annual subscription reminder</p>',
      text: 'Annual subscription reminder',
    },
    hasher,
  );
  await repository.saveQueued({
    id: deliveryId,
    noticeKind: 'annual_reminder',
    consentRecordId: null,
    externalSubscriptionId: 'sub_notice',
    applicableAt: new Date('2026-11-04T12:00:00.000Z'),
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: payload.snapshot,
    payloadHash: payload.hash,
  });
  await repository.claim({ id: deliveryId, attemptId: 'a1', startedAt: now });
  await repository.markAccepted({
    id: deliveryId,
    attemptId: 'a1',
    providerEventId: 'email_123',
    completedAt: now,
  });
  return repository;
}

// DEBT-414 F07: the provider's report on an accepted renewal notice.
describe('RecordRenewalNoticeProviderOutcomeUseCase', () => {
  afterEach(() => vi.restoreAllMocks());
  it('records a delivery and logs it', async () => {
    const repository = await acceptedNotice();
    const logger = new FakeLogger();

    await expect(
      new RecordRenewalNoticeProviderOutcomeUseCase(
        repository,
        logger,
        new FakeOperationalAlerts(),
      ).execute({
        providerEventId: 'email_123',
        outcome: { kind: 'delivered' },
        observedAt,
      }),
    ).resolves.toBe('recorded');
    await expect(repository.findById(deliveryId)).resolves.toMatchObject({
      status: 'delivered',
    });
    expect(logger.infoCalls).toContainEqual({
      context: { providerEventId: 'email_123', outcome: 'delivered' },
      msg: 'Renewal notice delivery evidence recorded',
    });
  });

  it('logs a failed notice at error level, since a required notice did not arrive', async () => {
    const repository = await acceptedNotice();
    const logger = new FakeLogger();

    await new RecordRenewalNoticeProviderOutcomeUseCase(
      repository,
      logger,
      new FakeOperationalAlerts(),
    ).execute({
      providerEventId: 'email_123',
      outcome: {
        kind: 'failed',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
      },
      observedAt,
    });

    expect(logger.errorCalls).toContainEqual({
      context: {
        providerEventId: 'email_123',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
      },
      msg: 'Renewal notice was not delivered',
    });
  });

  it('logs a redelivered report once', async () => {
    const repository = await acceptedNotice();
    const logger = new FakeLogger();
    const useCase = new RecordRenewalNoticeProviderOutcomeUseCase(
      repository,
      logger,
      new FakeOperationalAlerts(),
    );
    const bounce = {
      providerEventId: 'email_123',
      outcome: {
        kind: 'failed',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
      },
      observedAt,
    } as const;

    await useCase.execute(bounce);
    await expect(useCase.execute(bounce)).resolves.toBe('unchanged');

    expect(logger.errorCalls).toHaveLength(1);
  });

  it('alerts once when a provider failure quarantines an accepted notice', async () => {
    const repository = await acceptedNotice();
    const alerts = new FakeOperationalAlerts();
    const useCase = new RecordRenewalNoticeProviderOutcomeUseCase(
      repository,
      new FakeLogger(),
      alerts,
    );
    const report = {
      providerEventId: 'email_123',
      outcome: {
        kind: 'failed',
        failureClass: 'provider_bounced',
        failureCode: 'Permanent',
      },
      observedAt,
    } as const;

    await useCase.execute(report);
    await useCase.execute(report);

    expect(alerts.raised).toEqual([
      { kind: 'renewal_notice_terminal_failure', count: 1 },
    ]);
  });

  it('still alerts on a failed report when logging throws', async () => {
    const repository = await acceptedNotice();
    const logger = new FakeLogger();
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('log unavailable');
    });
    const alerts = new FakeOperationalAlerts();
    const useCase = new RecordRenewalNoticeProviderOutcomeUseCase(
      repository,
      logger,
      alerts,
    );

    await expect(
      useCase.execute({
        providerEventId: 'email_123',
        outcome: {
          kind: 'failed',
          failureClass: 'provider_suppressed',
          failureCode: 'suppressed',
        },
        observedAt,
      }),
    ).resolves.toBe('recorded');

    expect(alerts.raised).toEqual([
      { kind: 'renewal_notice_terminal_failure', count: 1 },
    ]);
  });

  it('ignores a report on an email that is not a notice, without logging an error', async () => {
    const repository = await acceptedNotice();
    const logger = new FakeLogger();

    await expect(
      new RecordRenewalNoticeProviderOutcomeUseCase(
        repository,
        logger,
        new FakeOperationalAlerts(),
      ).execute({
        providerEventId: 'email_other',
        outcome: { kind: 'delivered' },
        observedAt,
      }),
    ).resolves.toBe('unknown');
    expect(logger.errorCalls).toEqual([]);
  });
});
