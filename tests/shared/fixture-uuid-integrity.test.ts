import { describe, expect, it } from 'vitest';
import { zUuid } from '@/src/adapters/shared/zod-schemas';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
  FakeSubscriptionRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createBookmark,
  createChoice,
  createPracticeSession,
  createQuestion,
  createSubscription,
  createTag,
  createUser,
} from '@/src/domain/test-helpers';
import {
  answeredOutcome,
  selectedChoiceIdOrNull,
} from '@/src/domain/value-objects';

function expectZUuid(value: string, label: string): void {
  expect(zUuid.safeParse(value).success, `${label} should pass zUuid`).toBe(
    true,
  );
}

describe('fixture UUID integrity', () => {
  it('factory defaults generate boundary-valid UUID ids', () => {
    const user = createUser();
    const attempt = createAttempt();
    const bookmark = createBookmark();
    const tag = createTag();
    const choice = createChoice();
    const question = createQuestion();
    const subscription = createSubscription();
    const session = createPracticeSession();

    expectZUuid(user.id, 'createUser().id');
    expectZUuid(attempt.id, 'createAttempt().id');
    expectZUuid(attempt.userId, 'createAttempt().userId');
    expectZUuid(attempt.questionId, 'createAttempt().questionId');
    expectZUuid(
      selectedChoiceIdOrNull(attempt.outcome) ?? '',
      'createAttempt().outcome.selectedChoiceId',
    );
    expectZUuid(bookmark.userId, 'createBookmark().userId');
    expectZUuid(bookmark.questionId, 'createBookmark().questionId');
    expectZUuid(tag.id, 'createTag().id');
    expectZUuid(choice.id, 'createChoice().id');
    expectZUuid(choice.questionId, 'createChoice().questionId');
    expectZUuid(question.id, 'createQuestion().id');
    expectZUuid(subscription.id, 'createSubscription().id');
    expectZUuid(subscription.userId, 'createSubscription().userId');
    expectZUuid(session.id, 'createPracticeSession().id');
    expectZUuid(session.userId, 'createPracticeSession().userId');
    for (const questionId of session.questionIds) {
      expectZUuid(questionId, 'createPracticeSession().questionIds[]');
    }
    for (const state of session.questionStates) {
      expectZUuid(
        state.questionId,
        'createPracticeSession().questionStates[].questionId',
      );
    }
  });

  it('internally generated fake repository ids pass the zUuid boundary', async () => {
    const userRepository = new FakeUserRepository();
    const user = await userRepository.upsertByClerkId(
      'clerk_user_1',
      'user@example.com',
    );

    const attemptRepository = new FakeAttemptRepository();
    const attempt = await attemptRepository.insert({
      userId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      practiceSessionId: null,
      outcome: answeredOutcome(crypto.randomUUID()),
      isCorrect: true,
      timeSpentSeconds: 10,
    });

    const practiceSessionRepository = new FakePracticeSessionRepository();
    const questionId = crypto.randomUUID();
    const session = await practiceSessionRepository.create({
      userId: crypto.randomUUID(),
      mode: 'tutor',
      paramsJson: {
        questionIds: [questionId],
        tagSlugs: [],
        difficulties: [],
      },
    });

    const subscriptionRepository = new FakeSubscriptionRepository();
    const subscriptionUserId = crypto.randomUUID();
    await subscriptionRepository.upsert({
      userId: subscriptionUserId,
      externalSubscriptionId: 'sub_test_1',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });
    const subscription =
      await subscriptionRepository.findByUserId(subscriptionUserId);

    expectZUuid(user.id, 'FakeUserRepository.upsertByClerkId().id');
    expectZUuid(attempt.id, 'FakeAttemptRepository.insert().id');
    expectZUuid(session.id, 'FakePracticeSessionRepository.create().id');
    expect(subscription).not.toBeNull();
    expectZUuid(
      subscription?.id ?? '',
      'FakeSubscriptionRepository.upsert().id',
    );
  });
});
