import { describe, expect, it } from 'vitest';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import type { NewRenewalNoticeDelivery } from '@/src/domain/entities';
import { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';

const now = new Date('2026-08-06T18:00:00.000Z');
const deliveryId = '11111111-1111-4111-8111-111111111111';
const payload = {
  from: 'Addiction Boards <notices@addictionboards.com>',
  to: 'subscriber@example.com',
  replyTo: 'support@addictionboards.com',
  subject: 'Your renewal terms',
  html: '<p>Renewal terms</p>',
  text: 'Renewal terms',
};
const hasher = new FakeSha256Hasher();

function createDelivery(
  overrides: Partial<NewRenewalNoticeDelivery> = {},
): NewRenewalNoticeDelivery {
  const { snapshot, hash } = createTransactionalEmailPayloadSnapshot(
    payload,
    hasher,
  );
  return {
    id: deliveryId,
    noticeKind: 'acknowledgment',
    consentRecordId: '22222222-2222-4222-8222-222222222222',
    externalSubscriptionId: null,
    applicableAt: null,
    disclosureVersion: '2026-08-05',
    destination: payload.to,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: snapshot,
    payloadHash: hash,
    ...overrides,
  };
}

function createUseCase(input: {
  repository: FakeRenewalNoticeDeliveryRepository;
  gateway: FakeTransactionalEmailGateway;
  currentTime?: () => Date;
}) {
  return new DispatchRenewalNoticeDeliveryUseCase(
    input.repository,
    input.gateway,
    hasher,
    input.currentTime ?? (() => now),
    () => 'attempt-1',
  );
}

describe('DispatchRenewalNoticeDeliveryUseCase', () => {
  it('leaves a queued row untouched when the gateway is unconfigured', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    const gateway = new FakeTransactionalEmailGateway({ configured: false });
    const useCase = createUseCase({ repository, gateway });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'skipped_unconfigured',
      delivery: { status: 'queued', attemptCount: 0 },
    });
    expect(gateway.sendInputs).toEqual([]);
    expect(repository.records[0]).toMatchObject({
      status: 'queued',
      attemptCount: 0,
      attemptId: null,
    });
  });

  it.each([
    {
      label: 'provider idempotency key',
      corrupt: (delivery: NewRenewalNoticeDelivery) => ({
        ...delivery,
        providerIdempotencyKey: 'wrong-key',
      }),
      failureCode: 'provider_idempotency_key_mismatch',
    },
    {
      label: 'payload snapshot hash',
      corrupt: (delivery: NewRenewalNoticeDelivery) => ({
        ...delivery,
        payloadHash: '0'.repeat(64),
      }),
      failureCode: 'payload_snapshot_integrity_failure',
    },
  ])('quarantines a corrupted $label without calling the provider', async ({
    corrupt,
    failureCode,
  }) => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const saved = await repository.saveQueued(createDelivery());
    repository.records[0] = {
      ...saved,
      ...corrupt(saved),
    };
    const gateway = new FakeTransactionalEmailGateway({ configured: true });
    const useCase = createUseCase({ repository, gateway });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'terminal_failure',
        attemptCount: 1,
        failureClass: 'payload_integrity_failure',
        failureCode,
      },
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('persists the claim before the provider call and records delivery', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    let stateObservedDuringSend: unknown;
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [{ status: 'delivered', providerEventId: 'email_123' }],
      onSend: () => {
        stateObservedDuringSend = structuredClone(repository.records[0]);
      },
    });
    const useCase = createUseCase({ repository, gateway });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'delivered',
        providerEventId: 'email_123',
        attemptCount: 1,
        attemptId: 'attempt-1',
        attemptStartedAt: now,
      },
    });
    expect(stateObservedDuringSend).toMatchObject({
      status: 'processing',
      attemptCount: 1,
      attemptId: 'attempt-1',
      attemptStartedAt: now,
    });
    expect(gateway.sendInputs).toEqual([
      {
        idempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
        payload,
      },
    ]);
  });

  it.each([
    {
      result: {
        status: 'transient_failure' as const,
        failureCode: 'rate_limit_exceeded',
      },
      expectedStatus: 'transient_failure',
      expectedNextAttemptAt: '2026-08-06T18:15:00.000Z',
    },
    {
      result: {
        status: 'terminal_failure' as const,
        failureCode: 'invalid_idempotent_request',
      },
      expectedStatus: 'terminal_failure',
      expectedNextAttemptAt: null,
    },
    {
      result: {
        status: 'outcome_unknown' as const,
        failureCode: 'ETIMEDOUT',
      },
      expectedStatus: 'outcome_unknown',
      expectedNextAttemptAt: null,
    },
  ])('persists $expectedStatus and returns successfully', async ({
    result: gatewayResult,
    expectedStatus,
    expectedNextAttemptAt,
  }) => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [gatewayResult],
    });
    const useCase = createUseCase({ repository, gateway });

    const result = await useCase.execute({ deliveryId });

    expect(result).toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: expectedStatus,
        failureCode: gatewayResult.failureCode,
      },
    });
    expect(result.delivery?.nextAttemptAt?.toISOString() ?? null).toBe(
      expectedNextAttemptAt,
    );
  });

  it('uses one provider call when two workers dispatch the same row', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [{ status: 'delivered', providerEventId: 'email_123' }],
    });
    const useCase = createUseCase({ repository, gateway });

    const results = await Promise.all([
      useCase.execute({ deliveryId }),
      useCase.execute({ deliveryId }),
    ]);

    expect(gateway.sendInputs).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.outcome === 'attempted' &&
          result.delivery.status === 'delivered',
      ),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.outcome === 'claim_lost'),
    ).toHaveLength(1);
  });

  it('reuses the stable key and immutable payload after a due transient failure', async () => {
    let currentTime = now;
    let attempt = 0;
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      results: [
        { status: 'transient_failure', failureCode: 'rate_limit_exceeded' },
        { status: 'delivered', providerEventId: 'email_123' },
      ],
    });
    const useCase = new DispatchRenewalNoticeDeliveryUseCase(
      repository,
      gateway,
      hasher,
      () => currentTime,
      () => `attempt-${++attempt}`,
    );

    await useCase.execute({ deliveryId });
    currentTime = new Date('2026-08-06T18:15:00.000Z');
    await useCase.execute({ deliveryId });

    expect(gateway.sendInputs).toHaveLength(2);
    expect(gateway.sendInputs[1]).toEqual(gateway.sendInputs[0]);
    expect(repository.records[0]).toMatchObject({
      status: 'delivered',
      attemptCount: 2,
    });
  });

  it('returns not found before attempting a provider call', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    const gateway = new FakeTransactionalEmailGateway({ configured: true });
    const useCase = createUseCase({ repository, gateway });

    await expect(useCase.execute({ deliveryId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('quarantines an unexpected gateway exception as outcome unknown', async () => {
    const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
    await repository.saveQueued(createDelivery());
    const gateway = new FakeTransactionalEmailGateway({
      configured: true,
      onSend: () => {
        throw new Error('unexpected adapter failure');
      },
    });
    const useCase = createUseCase({ repository, gateway });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'outcome_unknown',
        failureCode: 'unexpected_gateway_exception',
      },
    });
  });
});
