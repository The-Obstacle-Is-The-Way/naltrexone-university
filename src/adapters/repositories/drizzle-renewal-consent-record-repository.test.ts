import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { newRenewalConsentRecord } from '@/src/domain/entities';
import { DrizzleRenewalConsentRecordRepository } from './drizzle-renewal-consent-record-repository';

type RepoDb = ConstructorParameters<
  typeof DrizzleRenewalConsentRecordRepository
>[0];

const input = newRenewalConsentRecord({
  userId: crypto.randomUUID(),
  consumerReference:
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  externalCustomerId: 'cus_123',
  externalSubscriptionId: 'sub_123',
  checkoutSessionId: 'cs_123',
  setupSessionId: null,
  applicationSourceId: null,
  plan: 'monthly',
  amountCents: 2900,
  currency: 'usd',
  frequency: 'month',
  trialEndsAt: new Date('2026-08-13T12:00:00Z'),
  cancellationDeadline: new Date('2026-08-13T12:00:00Z'),
  cancellationMethod: 'Billing page in the app or support@addictionboards.com',
  disclosureSnapshot: 'Exact disclosure.',
  disclosureVersion: '2026-08-05',
  termsVersion: '2026-08-05',
  termsHash: 'e6914e723d963b5342dee652c342fb1f748fa5fcfa8067c8d5cf79248c732eb8',
  consentSource: 'stripe_checkout',
  acceptedAt: new Date('2026-08-06T12:00:00Z'),
  consentKind: 'initial_offer',
  priorAmountCents: null,
  proposedAmountCents: null,
  effectiveRenewalAt: null,
});

function persistedRow(overrides: Record<string, unknown> = {}) {
  const { externalCustomerId, externalSubscriptionId, ...vendorNeutralInput } =
    input;
  return {
    ...vendorNeutralInput,
    stripeCustomerId: externalCustomerId,
    stripeSubscriptionId: externalSubscriptionId,
    id: crypto.randomUUID(),
    createdAt: new Date('2026-08-06T12:00:01Z'),
    updatedAt: new Date('2026-08-06T12:00:01Z'),
    ...overrides,
  };
}

function expectedRecord(row: ReturnType<typeof persistedRow>) {
  const { stripeCustomerId, stripeSubscriptionId, ...vendorNeutralRow } = row;
  return {
    ...vendorNeutralRow,
    externalCustomerId: stripeCustomerId,
    externalSubscriptionId: stripeSubscriptionId,
  };
}

describe('DrizzleRenewalConsentRecordRepository', () => {
  it('inserts and returns the exact consent evidence', async () => {
    const row = persistedRow();
    const returning = vi.fn(async () => [row]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const db = { insert: vi.fn(() => ({ values })) } as unknown as RepoDb;
    const repository = new DrizzleRenewalConsentRecordRepository(db);

    await expect(repository.save(input)).resolves.toEqual(expectedRecord(row));
    const {
      externalCustomerId,
      externalSubscriptionId,
      ...vendorNeutralInput
    } = input;
    expect(values).toHaveBeenCalledWith({
      ...vendorNeutralInput,
      stripeCustomerId: externalCustomerId,
      stripeSubscriptionId: externalSubscriptionId,
    });
  });

  it('replays matching evidence after a source uniqueness conflict', async () => {
    const row = persistedRow();
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      }),
      query: {
        renewalConsentRecords: { findFirst: async () => row },
      },
    } as unknown as RepoDb;
    const repository = new DrizzleRenewalConsentRecordRepository(db);

    await expect(repository.save(input)).resolves.toEqual(expectedRecord(row));
  });

  it('rejects cross-user evidence after a source uniqueness conflict', async () => {
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      }),
      query: {
        renewalConsentRecords: {
          findFirst: async () => persistedRow({ userId: crypto.randomUUID() }),
        },
      },
    } as unknown as RepoDb;
    const repository = new DrizzleRenewalConsentRecordRepository(db);

    await expect(repository.save(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('updates termination and retention for every consent on a subscription', async () => {
    const returnedConsentId = crypto.randomUUID();
    const updateSet = vi.fn((_values: Record<string, unknown>) => ({
      where: () => ({ returning: async () => [{ id: returnedConsentId }] }),
    }));
    const db = { update: () => ({ set: updateSet }) } as unknown as RepoDb;
    const repository = new DrizzleRenewalConsentRecordRepository(
      db,
      () => new Date('2030-02-01T00:00:01Z'),
    );

    await expect(
      repository.markSubscriptionTerminated({
        externalSubscriptionId: 'sub_123',
        terminatedAt: new Date('2030-02-01T00:00:00Z'),
      }),
    ).resolves.toBe(1);
    const setValues = updateSet.mock.calls[0]?.[0];
    if (!setValues) throw new Error('Update values were not captured');
    const dialect = new PgDialect();
    const terminationSql = dialect.sqlToQuery(
      setValues.subscriptionTerminatedAt as SQL,
    ).sql;
    const retentionSql = dialect.sqlToQuery(setValues.retainUntil as SQL).sql;

    expect(terminationSql).toContain('GREATEST(COALESCE(');
    expect(retentionSql).toContain(
      'GREATEST("renewal_consent_records"."retain_until"',
    );
    expect(setValues.updatedAt).toEqual(new Date('2030-02-01T00:00:01Z'));
  });

  it('does not query when a prune limit is invalid', async () => {
    const transaction = vi.fn();
    const repository = new DrizzleRenewalConsentRecordRepository({
      transaction,
    } as unknown as RepoDb);

    await expect(
      repository.pruneExpired({ before: new Date(), limit: 0 }),
    ).resolves.toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });
});
