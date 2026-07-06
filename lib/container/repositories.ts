import {
  DrizzleAttemptRepository,
  DrizzleBookmarkRepository,
  DrizzleClerkEventRepository,
  DrizzleDeletedClerkUserRepository,
  DrizzleIdempotencyKeyRepository,
  DrizzlePendingStripeCancellationRepository,
  DrizzlePracticeSessionRepository,
  DrizzleQuestionFeedbackRepository,
  DrizzleQuestionRepository,
  DrizzleStripeCustomerRepository,
  DrizzleStripeEventRepository,
  DrizzleSubscriptionRepository,
  DrizzleTagRepository,
  DrizzleUserRepository,
} from '@/src/adapters/repositories';
import type {
  ContainerPrimitives,
  RepositoryFactories,
  StripePriceIds,
} from './types';

export function createRepositoryFactories(
  primitives: ContainerPrimitives,
  stripePriceIds: StripePriceIds,
): RepositoryFactories {
  return {
    createAttemptRepository: (dbOverride = primitives.db) =>
      new DrizzleAttemptRepository(dbOverride),
    createBookmarkRepository: (dbOverride = primitives.db) =>
      new DrizzleBookmarkRepository(dbOverride),
    createClerkEventRepository: (dbOverride = primitives.db) =>
      new DrizzleClerkEventRepository(dbOverride, primitives.now),
    createDeletedClerkUserRepository: (dbOverride = primitives.db) =>
      new DrizzleDeletedClerkUserRepository(dbOverride),
    createIdempotencyKeyRepository: (dbOverride = primitives.db) =>
      new DrizzleIdempotencyKeyRepository(dbOverride, primitives.now),
    createPendingStripeCancellationRepository: (dbOverride = primitives.db) =>
      new DrizzlePendingStripeCancellationRepository(dbOverride),
    createPracticeSessionRepository: (dbOverride = primitives.db) =>
      new DrizzlePracticeSessionRepository(
        dbOverride,
        primitives.now,
        primitives.logger,
      ),
    createQuestionFeedbackRepository: (dbOverride = primitives.db) =>
      new DrizzleQuestionFeedbackRepository(dbOverride),
    createQuestionRepository: (dbOverride = primitives.db) =>
      new DrizzleQuestionRepository(dbOverride),
    createTagRepository: (dbOverride = primitives.db) =>
      new DrizzleTagRepository(dbOverride),
    createSubscriptionRepository: (dbOverride = primitives.db) =>
      new DrizzleSubscriptionRepository(
        dbOverride,
        stripePriceIds,
        primitives.now,
      ),
    createStripeCustomerRepository: (dbOverride = primitives.db) =>
      new DrizzleStripeCustomerRepository(dbOverride),
    createStripeEventRepository: (dbOverride = primitives.db) =>
      new DrizzleStripeEventRepository(dbOverride, primitives.now),
    createUserRepository: (dbOverride = primitives.db) =>
      new DrizzleUserRepository(dbOverride, primitives.now),
  };
}
