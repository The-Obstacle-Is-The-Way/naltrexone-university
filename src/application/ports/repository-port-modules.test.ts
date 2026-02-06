import { describe, expectTypeOf, it } from 'vitest';
import type { AttemptRepository } from './attempt-repository';
import type { BookmarkRepository } from './bookmark-repository';
import type { IdempotencyKeyRepository } from './idempotency-key-repository';
import type { PracticeSessionRepository } from './practice-session-repository';
import type { QuestionRepository } from './question-repository';
import type {
  AttemptRepository as AttemptRepositoryFromBarrel,
  BookmarkRepository as BookmarkRepositoryFromBarrel,
  IdempotencyKeyRepository as IdempotencyKeyRepositoryFromBarrel,
  PracticeSessionRepository as PracticeSessionRepositoryFromBarrel,
  QuestionRepository as QuestionRepositoryFromBarrel,
  StripeCustomerRepository as StripeCustomerRepositoryFromBarrel,
  StripeEventRepository as StripeEventRepositoryFromBarrel,
  SubscriptionRepository as SubscriptionRepositoryFromBarrel,
  TagRepository as TagRepositoryFromBarrel,
  UserRepository as UserRepositoryFromBarrel,
} from './repositories';
import type { StripeCustomerRepository } from './stripe-customer-repository';
import type { StripeEventRepository } from './stripe-event-repository';
import type { SubscriptionRepository } from './subscription-repository';
import type { TagRepository } from './tag-repository';
import type { UserRepository } from './user-repository';

describe('repository port modules', () => {
  it('re-exports each repository contract from the barrel', () => {
    expectTypeOf<QuestionRepositoryFromBarrel>().toEqualTypeOf<QuestionRepository>();
    expectTypeOf<AttemptRepositoryFromBarrel>().toEqualTypeOf<AttemptRepository>();
    expectTypeOf<PracticeSessionRepositoryFromBarrel>().toEqualTypeOf<PracticeSessionRepository>();
    expectTypeOf<BookmarkRepositoryFromBarrel>().toEqualTypeOf<BookmarkRepository>();
    expectTypeOf<TagRepositoryFromBarrel>().toEqualTypeOf<TagRepository>();
    expectTypeOf<SubscriptionRepositoryFromBarrel>().toEqualTypeOf<SubscriptionRepository>();
    expectTypeOf<StripeCustomerRepositoryFromBarrel>().toEqualTypeOf<StripeCustomerRepository>();
    expectTypeOf<StripeEventRepositoryFromBarrel>().toEqualTypeOf<StripeEventRepository>();
    expectTypeOf<UserRepositoryFromBarrel>().toEqualTypeOf<UserRepository>();
    expectTypeOf<IdempotencyKeyRepositoryFromBarrel>().toEqualTypeOf<IdempotencyKeyRepository>();
  });
});
