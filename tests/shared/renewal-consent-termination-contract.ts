import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenewalConsentRecordRepository } from '@/src/application/ports/repositories';
import type {
  NewRenewalConsentRecord,
  RenewalConsentRecord,
} from '@/src/domain/entities';
import { newRenewalConsentRecord } from '@/src/domain/entities';

type TerminationRepository = Pick<
  RenewalConsentRecordRepository,
  'findById' | 'markSubscriptionTerminated'
>;
export type TerminationSeed = { retainUntil?: Date };
export type RenewalConsentTerminationHarness = {
  seed(input?: TerminationSeed): Promise<{
    record: RenewalConsentRecord;
    repository: TerminationRepository;
    competingRepository: TerminationRepository;
  }>;
};

export function terminationConsentInput(
  userId: string,
  input: TerminationSeed = {},
): NewRenewalConsentRecord {
  const record = newRenewalConsentRecord({
    userId,
    consumerReference: 'a'.repeat(64),
    externalCustomerId: `cus_${crypto.randomUUID().replaceAll('-', '')}`,
    externalSubscriptionId: `sub_${crypto.randomUUID().replaceAll('-', '')}`,
    checkoutSessionId: `cs_${crypto.randomUUID().replaceAll('-', '')}`,
    setupSessionId: null,
    applicationSourceId: null,
    plan: 'monthly',
    amountCents: 2900,
    currency: 'usd',
    frequency: 'month',
    trialEndsAt: null,
    cancellationDeadline: new Date('2026-09-06T12:00:00Z'),
    cancellationMethod: 'Synthetic billing route',
    disclosureSnapshot: 'Synthetic renewal disclosure.',
    disclosureVersion: 'test-v1',
    termsVersion: 'test-v1',
    termsHash: 'b'.repeat(64),
    consentSource: 'stripe_checkout',
    acceptedAt: new Date('2026-08-06T12:00:00Z'),
    consentKind: 'initial_offer',
    priorAmountCents: null,
    proposedAmountCents: null,
    effectiveRenewalAt: null,
  });
  return input.retainUntil
    ? { ...record, retainUntil: input.retainUntil }
    : record;
}

export function runRenewalConsentTerminationContract(
  adapter: string,
  createHarness: () => Promise<RenewalConsentTerminationHarness>,
): void {
  describe(`${adapter} consent termination contract`, () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2030-02-02T00:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it.each([
      { name: 'equal', replay: '2030-02-01T00:00:00Z' },
      { name: 'earlier', replay: '2027-01-01T00:00:00Z' },
      { name: 'later', replay: '2032-01-01T00:00:00Z' },
    ])(
      'keeps the first observation, retention and updatedAt on $name replay',
      async ({ replay }) => {
        const { record, repository } = await (await createHarness()).seed();
        const externalSubscriptionId = record.externalSubscriptionId;
        await expect(
          repository.markSubscriptionTerminated({
            externalSubscriptionId,
            terminatedAt: new Date('2030-02-01T00:00:00Z'),
          }),
        ).resolves.toBe(1);
        const first = await repository.findById(record.id);
        expect(first).toMatchObject({
          subscriptionTerminatedAt: new Date('2030-02-01T00:00:00Z'),
          retainUntil: new Date('2031-02-01T00:00:00Z'),
          updatedAt: new Date('2030-02-02T00:00:00Z'),
        });
        vi.setSystemTime(new Date('2030-02-03T00:00:00Z'));
        expect
          .soft(
            await repository.markSubscriptionTerminated({
              externalSubscriptionId,
              terminatedAt: new Date(replay),
            }),
          )
          .toBe(0);
        expect(await repository.findById(record.id)).toEqual(first);
      },
    );

    it('keeps the consent floor when it outlasts the termination floor', async () => {
      const { record, repository } = await (await createHarness()).seed();
      await repository.markSubscriptionTerminated({
        externalSubscriptionId: record.externalSubscriptionId,
        terminatedAt: new Date('2027-01-01T00:00:00Z'),
      });
      expect(await repository.findById(record.id)).toMatchObject({
        retainUntil: new Date('2029-08-06T12:00:00Z'),
      });
    });

    it('retains a leap-day termination through March 1 of the next year', async () => {
      const { record, repository } = await (await createHarness()).seed();
      await repository.markSubscriptionTerminated({
        externalSubscriptionId: record.externalSubscriptionId,
        terminatedAt: new Date('2032-02-29T12:00:00Z'),
      });
      expect(await repository.findById(record.id)).toMatchObject({
        subscriptionTerminatedAt: new Date('2032-02-29T12:00:00Z'),
        retainUntil: new Date('2033-03-01T12:00:00Z'),
      });
    });

    it('preserves an existing retention floor longer than either calendar floor', async () => {
      const retainUntil = new Date('2035-01-01T00:00:00Z');
      const { record, repository } = await (await createHarness()).seed({
        retainUntil,
      });
      await repository.markSubscriptionTerminated({
        externalSubscriptionId: record.externalSubscriptionId,
        terminatedAt: new Date('2030-02-01T00:00:00Z'),
      });
      expect(await repository.findById(record.id)).toMatchObject({
        retainUntil,
      });
    });

    it('extends the stored date by the termination floor without recomputing the consent floor', async () => {
      const { record, repository } = await (await createHarness()).seed({
        retainUntil: new Date('2027-01-01T00:00:00Z'),
      });
      await repository.markSubscriptionTerminated({
        externalSubscriptionId: record.externalSubscriptionId,
        terminatedAt: new Date('2027-06-01T00:00:00Z'),
      });
      expect(await repository.findById(record.id)).toMatchObject({
        retainUntil: new Date('2028-06-01T00:00:00Z'),
      });
    });

    it('records exactly one of two concurrent first observations', async () => {
      const { record, repository, competingRepository } = await (
        await createHarness()
      ).seed();
      const observations = [
        {
          writer: repository,
          terminatedAt: new Date('2030-02-01T00:00:00Z'),
          retainUntil: new Date('2031-02-01T00:00:00Z'),
        },
        {
          writer: competingRepository,
          terminatedAt: new Date('2031-02-01T00:00:00Z'),
          retainUntil: new Date('2032-02-01T00:00:00Z'),
        },
      ];
      const counts = await Promise.all(
        observations.map(({ writer, terminatedAt }) =>
          writer.markSubscriptionTerminated({
            externalSubscriptionId: record.externalSubscriptionId,
            terminatedAt,
          }),
        ),
      );
      expect([...counts].sort()).toEqual([0, 1]);
      const winner = observations[counts.indexOf(1)];
      expect(winner).toBeDefined();
      const saved = await repository.findById(record.id);
      expect(saved).toMatchObject({
        subscriptionTerminatedAt: winner?.terminatedAt,
        retainUntil: winner?.retainUntil,
      });
      for (const observation of observations) {
        await expect(
          repository.markSubscriptionTerminated({
            externalSubscriptionId: record.externalSubscriptionId,
            terminatedAt: observation.terminatedAt,
          }),
        ).resolves.toBe(0);
      }
      expect(await repository.findById(record.id)).toEqual(saved);
    });
  });
}
