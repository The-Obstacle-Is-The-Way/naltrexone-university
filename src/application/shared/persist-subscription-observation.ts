import { ApplicationError } from '@/src/application/errors';
import type { SubscriptionUpsertResult } from '@/src/application/ports/repositories';

export const SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS = 3;

type CompletedSubscriptionWrite = Exclude<
  SubscriptionUpsertResult,
  { persisted: false; reason: 'version_conflict' }
>;

export type PersistSubscriptionObservationInput<TObservation> = {
  userId: string | null;
  initialExpectedVersion?: number | null;
  readVersion(userId: string): Promise<number | null>;
  retrieve(): Promise<TObservation>;
  getUserId(observation: TObservation): string;
  persist(
    observation: TObservation,
    expectedVersion: number | null,
  ): Promise<SubscriptionUpsertResult>;
};

export type PersistSubscriptionObservationResult<TObservation> = {
  observation: TObservation;
  write: CompletedSubscriptionWrite;
};

function isVersionConflict(
  result: SubscriptionUpsertResult,
): result is { persisted: false; reason: 'version_conflict' } {
  return !result.persisted && result.reason === 'version_conflict';
}

export async function persistSubscriptionObservation<TObservation>(
  input: PersistSubscriptionObservationInput<TObservation>,
): Promise<PersistSubscriptionObservationResult<TObservation>> {
  let expectedUserId = input.userId;

  if (expectedUserId === null) {
    // This retrieve is discovery-only. The observation written below must be
    // re-retrieved after the local version is known, so do not reuse it.
    const discovery = await input.retrieve();
    expectedUserId = input.getUserId(discovery);
  }

  let expectedVersion =
    input.initialExpectedVersion === undefined
      ? await input.readVersion(expectedUserId)
      : input.initialExpectedVersion;

  for (
    let attempt = 1;
    attempt <= SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS;
    attempt += 1
  ) {
    const observation = await input.retrieve();
    if (input.getUserId(observation) !== expectedUserId) {
      throw new ApplicationError(
        'CONFLICT',
        'Subscription observation user changed during refresh',
      );
    }

    const write = await input.persist(observation, expectedVersion);
    if (!isVersionConflict(write)) {
      return { observation, write };
    }

    if (attempt === SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS) {
      throw new ApplicationError(
        'CONFLICT',
        `Subscription observation version conflicted after ${SUBSCRIPTION_OBSERVATION_MAX_ATTEMPTS} attempts`,
      );
    }

    expectedVersion = await input.readVersion(expectedUserId);
  }

  throw new ApplicationError(
    'INTERNAL_ERROR',
    'Subscription observation retry loop exited unexpectedly',
  );
}
