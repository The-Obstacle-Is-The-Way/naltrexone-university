import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeAuthGateway,
  FakeBookmarkRepository,
  FakePaymentGateway,
  FakePracticeSessionRepository,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
  FakeTagRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import type { Tag } from '@/src/domain/entities';
import { createPracticeSession } from '@/src/domain/test-helpers';

describe('FakePracticeSessionRepository', () => {
  it('throws NOT_FOUND when ending a missing session', async () => {
    const repo = new FakePracticeSessionRepository();

    await expect(repo.end('missing', 'user-1')).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Practice session not found'),
    );
  });

  it('throws CONFLICT when ending an already-ended session', async () => {
    const session = createPracticeSession({
      id: 'session-1',
      userId: 'user-1',
      mode: 'tutor',
      endedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const repo = new FakePracticeSessionRepository([session]);

    await expect(repo.end('session-1', 'user-1')).rejects.toEqual(
      new ApplicationError('CONFLICT', 'Practice session already ended'),
    );
  });
});

describe('FakeSubscriptionRepository', () => {
  it('upserts subscriptions and supports lookup by stripeSubscriptionId', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(repo.findByUserId('user_1')).resolves.toMatchObject({
      userId: 'user_1',
      plan: 'monthly',
      status: 'active',
    });

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_456',
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByStripeSubscriptionId('sub_123'),
    ).resolves.toBeNull();
    await expect(
      repo.findByStripeSubscriptionId('sub_456'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
  });

  it('throws CONFLICT when a stripeSubscriptionId is reused for a different user', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      stripeSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: 'user_2',
        stripeSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'Stripe subscription id is already mapped to a different user',
      ),
    );
  });
});

describe('FakeAuthGateway', () => {
  it('returns null from getCurrentUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.getCurrentUser()).resolves.toBeNull();
  });

  it('throws UNAUTHENTICATED from requireUser when unauthenticated', async () => {
    const gateway = new FakeAuthGateway(null);
    await expect(gateway.requireUser()).rejects.toEqual(
      new ApplicationError('UNAUTHENTICATED', 'User not authenticated'),
    );
  });
});

describe('FakePaymentGateway', () => {
  it('returns configured checkout/portal URLs and records inputs', async () => {
    const gateway = new FakePaymentGateway({
      stripeCustomerId: 'cus_test',
      checkoutUrl: 'https://fake/checkout',
      portalUrl: 'https://fake/portal',
      webhookResult: { eventId: 'evt_1', type: 'checkout.session.completed' },
    });

    await expect(
      gateway.createCustomer({
        userId: 'user_1',
        clerkUserId: 'clerk_1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({ stripeCustomerId: 'cus_test' });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        stripeCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://fake/checkout' });

    await expect(
      gateway.createPortalSession({
        stripeCustomerId: 'cus_123',
        returnUrl: 'https://app/return',
      }),
    ).resolves.toEqual({ url: 'https://fake/portal' });

    await expect(gateway.processWebhookEvent('raw', 'sig')).resolves.toEqual({
      eventId: 'evt_1',
      type: 'checkout.session.completed',
    });

    expect(gateway.customerInputs).toHaveLength(1);
    expect(gateway.checkoutInputs).toHaveLength(1);
    expect(gateway.portalInputs).toHaveLength(1);
    expect(gateway.webhookInputs).toEqual([
      { rawBody: 'raw', signature: 'sig' },
    ]);
  });
});

describe('FakeUserRepository', () => {
  describe('findByClerkId', () => {
    it('returns null when user not found', async () => {
      const repo = new FakeUserRepository();
      const result = await repo.findByClerkId('clerk-123');
      expect(result).toBeNull();
    });

    it('returns user when found', async () => {
      const repo = new FakeUserRepository();
      await repo.upsertByClerkId('clerk-123', 'test@example.com');

      const result = await repo.findByClerkId('clerk-123');

      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('upsertByClerkId', () => {
    it('creates new user when not exists', async () => {
      const repo = new FakeUserRepository();
      const user = await repo.upsertByClerkId('clerk-123', 'test@example.com');

      expect(user.id).toMatch(/^user-\d+$/);
      expect(user.email).toBe('test@example.com');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('returns existing user when email matches', async () => {
      const repo = new FakeUserRepository();
      const first = await repo.upsertByClerkId('clerk-123', 'test@example.com');
      const second = await repo.upsertByClerkId(
        'clerk-123',
        'test@example.com',
      );

      expect(second.id).toBe(first.id);
      expect(second.email).toBe(first.email);
    });

    it('updates email when different', async () => {
      const repo = new FakeUserRepository();
      const first = await repo.upsertByClerkId('clerk-123', 'old@example.com');
      const second = await repo.upsertByClerkId('clerk-123', 'new@example.com');

      expect(second.id).toBe(first.id);
      expect(second.email).toBe('new@example.com');
    });
  });

  describe('deleteByClerkId', () => {
    it('returns true when a user existed and was deleted', async () => {
      const repo = new FakeUserRepository();
      await repo.upsertByClerkId('clerk-1', 'user@example.com');

      await expect(repo.deleteByClerkId('clerk-1')).resolves.toBe(true);
      await expect(repo.findByClerkId('clerk-1')).resolves.toBeNull();
    });

    it('returns false when the user did not exist', async () => {
      const repo = new FakeUserRepository();

      await expect(repo.deleteByClerkId('missing')).resolves.toBe(false);
    });
  });
});

describe('FakeBookmarkRepository', () => {
  describe('exists', () => {
    it('returns false when bookmark not found', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.exists('user-1', 'question-1');
      expect(result).toBe(false);
    });

    it('returns true when bookmark exists', async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');

      const result = await repo.exists('user-1', 'question-1');

      expect(result).toBe(true);
    });
  });

  describe('add', () => {
    it('creates bookmark', async () => {
      const repo = new FakeBookmarkRepository();
      const bookmark = await repo.add('user-1', 'question-1');

      expect(bookmark.userId).toBe('user-1');
      expect(bookmark.questionId).toBe('question-1');
      expect(bookmark.createdAt).toBeInstanceOf(Date);
    });

    it('is idempotent - returns existing bookmark', async () => {
      const repo = new FakeBookmarkRepository();
      const first = await repo.add('user-1', 'question-1');
      const second = await repo.add('user-1', 'question-1');

      expect(second.createdAt).toEqual(first.createdAt);
    });
  });

  describe('remove', () => {
    it('returns true when bookmark existed', async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');

      const result = await repo.remove('user-1', 'question-1');

      expect(result).toBe(true);
    });

    it('returns false when bookmark was absent', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.remove('user-1', 'question-1');
      expect(result).toBe(false);
    });
  });

  describe('listByUserId', () => {
    it("returns user's bookmarks", async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');
      await repo.add('user-1', 'question-2');
      await repo.add('user-2', 'question-3');

      const result = await repo.listByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.questionId)).toEqual(
        expect.arrayContaining(['question-1', 'question-2']),
      );
    });

    it('returns empty array when user has no bookmarks', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.listByUserId('user-1');
      expect(result).toEqual([]);
    });
  });
});

describe('FakeTagRepository', () => {
  describe('listAll', () => {
    it('returns all seeded tags', async () => {
      const tags: Tag[] = [
        {
          id: 'tag-1',
          slug: 'pharmacology',
          name: 'Pharmacology',
          kind: 'topic',
        },
        { id: 'tag-2', slug: 'diagnosis', name: 'Diagnosis', kind: 'topic' },
      ];
      const repo = new FakeTagRepository(tags);

      const result = await repo.listAll();

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('pharmacology');
      expect(result[1].slug).toBe('diagnosis');
    });

    it('returns empty array when no tags', async () => {
      const repo = new FakeTagRepository([]);
      const result = await repo.listAll();
      expect(result).toEqual([]);
    });
  });
});

describe('FakeStripeCustomerRepository', () => {
  describe('findByUserId', () => {
    it('returns null when no mapping exists', async () => {
      const repo = new FakeStripeCustomerRepository();
      const result = await repo.findByUserId('user-1');
      expect(result).toBeNull();
    });

    it('returns stripeCustomerId when mapping exists', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });
  });

  describe('insert', () => {
    it('creates new mapping', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });

    it('is idempotent for same mapping', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');
      await repo.insert('user-1', 'cus_123');

      const result = await repo.findByUserId('user-1');

      expect(result).toEqual({ stripeCustomerId: 'cus_123' });
    });

    it('throws CONFLICT when userId mapped to different customerId', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      await expect(repo.insert('user-1', 'cus_456')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('throws CONFLICT when customerId mapped to different userId', async () => {
      const repo = new FakeStripeCustomerRepository();
      await repo.insert('user-1', 'cus_123');

      await expect(repo.insert('user-2', 'cus_123')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });
});

describe('FakeStripeEventRepository', () => {
  describe('claim', () => {
    it('returns true for new event', async () => {
      const repo = new FakeStripeEventRepository();
      const result = await repo.claim('evt_123', 'checkout.session.completed');
      expect(result).toBe(true);
    });

    it('returns false for existing event', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');

      const result = await repo.claim('evt_123', 'checkout.session.completed');

      expect(result).toBe(false);
    });
  });

  describe('lock', () => {
    it('returns state for existing event', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');

      const result = await repo.lock('evt_123');

      expect(result).toEqual({ processedAt: null, error: null });
    });

    it('throws NOT_FOUND when event missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(repo.lock('evt_123')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('markProcessed', () => {
    it('updates processedAt and clears error', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');
      await repo.markFailed('evt_123', 'Something went wrong');

      await repo.markProcessed('evt_123');

      const state = await repo.lock('evt_123');
      expect(state.processedAt).toBeInstanceOf(Date);
      expect(state.error).toBeNull();
    });
  });

  describe('markFailed', () => {
    it('sets error and clears processedAt', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_123', 'checkout.session.completed');
      await repo.markProcessed('evt_123');

      await repo.markFailed('evt_123', 'Something went wrong');

      const state = await repo.lock('evt_123');
      expect(state.processedAt).toBeNull();
      expect(state.error).toBe('Something went wrong');
    });
  });

  describe('pruneProcessedBefore', () => {
    it('deletes processed events older than cutoff (oldest-first, limited)', async () => {
      vi.useFakeTimers();
      try {
        const repo = new FakeStripeEventRepository();

        await repo.claim('evt_oldest', 'checkout.session.completed');
        await repo.claim('evt_older', 'checkout.session.completed');
        await repo.claim('evt_newer', 'checkout.session.completed');
        await repo.claim('evt_recent', 'checkout.session.completed');
        await repo.claim('evt_unprocessed', 'checkout.session.completed');

        vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
        await repo.markProcessed('evt_oldest');

        vi.setSystemTime(new Date('2026-02-02T00:00:00Z'));
        await repo.markProcessed('evt_older');

        vi.setSystemTime(new Date('2026-02-03T00:00:00Z'));
        await repo.markProcessed('evt_newer');

        vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
        await repo.markProcessed('evt_recent');

        const cutoff = new Date('2026-02-04T00:00:00Z');

        await expect(repo.pruneProcessedBefore(cutoff, 2)).resolves.toBe(2);

        await expect(repo.lock('evt_oldest')).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
        await expect(repo.lock('evt_older')).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });

        await expect(repo.lock('evt_newer')).resolves.toMatchObject({
          processedAt: expect.any(Date),
        });
        await expect(repo.lock('evt_recent')).resolves.toMatchObject({
          processedAt: expect.any(Date),
        });
        await expect(repo.lock('evt_unprocessed')).resolves.toMatchObject({
          processedAt: null,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns 0 when limit is not a positive integer', async () => {
      const repo = new FakeStripeEventRepository();
      await repo.claim('evt_1', 'checkout.session.completed');
      await repo.markProcessed('evt_1');

      await expect(
        repo.pruneProcessedBefore(new Date('2026-02-10T00:00:00Z'), 0),
      ).resolves.toBe(0);
    });
  });
});

describe('FakeAttemptRepository', () => {
  describe('count*', () => {
    it('counts attempts with correctness and since filters', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: null,
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-2',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        },
        {
          id: 'attempt-3',
          userId: 'other',
          questionId: 'q-3',
          practiceSessionId: null,
          selectedChoiceId: 'c-3',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-04T00:00:00Z'),
        },
      ]);

      await expect(repo.countByUserId('user-1')).resolves.toBe(2);
      await expect(repo.countCorrectByUserId('user-1')).resolves.toBe(1);

      const since = new Date('2026-02-02T00:00:00Z');
      await expect(repo.countByUserIdSince('user-1', since)).resolves.toBe(1);
      await expect(
        repo.countCorrectByUserIdSince('user-1', since),
      ).resolves.toBe(0);
    });
  });

  describe('listRecentByUserId', () => {
    it('returns attempts in descending answeredAt order (limited)', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: null,
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-2',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        },
        {
          id: 'attempt-3',
          userId: 'user-1',
          questionId: 'q-3',
          practiceSessionId: null,
          selectedChoiceId: 'c-3',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        },
      ]);

      const result = await repo.listRecentByUserId('user-1', 2);

      expect(result.map((a) => a.id)).toEqual(['attempt-2', 'attempt-3']);
    });
  });

  describe('listMissedQuestionsByUserId', () => {
    it('returns the latest incorrect attempt per question ordered by answeredAt desc', async () => {
      const repo = new FakeAttemptRepository([
        // q-1: most recent correct => NOT missed
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: null,
          selectedChoiceId: 'c-1',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: null,
          selectedChoiceId: 'c-2',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        },
        // q-2: most recent incorrect => missed
        {
          id: 'attempt-3',
          userId: 'user-1',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-3',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'attempt-4',
          userId: 'user-1',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-4',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-04T00:00:00Z'),
        },
        // q-3: only incorrect => missed
        {
          id: 'attempt-5',
          userId: 'user-1',
          questionId: 'q-3',
          practiceSessionId: null,
          selectedChoiceId: 'c-5',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        },
        // other user ignored
        {
          id: 'attempt-6',
          userId: 'other',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-6',
          isCorrect: false,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-10T00:00:00Z'),
        },
      ]);

      await expect(
        repo.listMissedQuestionsByUserId('user-1', 10, 0),
      ).resolves.toEqual([
        { questionId: 'q-2', answeredAt: new Date('2026-02-04T00:00:00Z') },
        { questionId: 'q-3', answeredAt: new Date('2026-02-02T00:00:00Z') },
      ]);

      await expect(
        repo.listMissedQuestionsByUserId('user-1', 1, 1),
      ).resolves.toEqual([
        { questionId: 'q-3', answeredAt: new Date('2026-02-02T00:00:00Z') },
      ]);
    });
  });

  describe('listAnsweredAtByUserIdSince', () => {
    it('returns answeredAt values in descending order', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: null,
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
        {
          id: 'attempt-2',
          userId: 'user-1',
          questionId: 'q-2',
          practiceSessionId: null,
          selectedChoiceId: 'c-2',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-03T00:00:00Z'),
        },
        {
          id: 'attempt-3',
          userId: 'user-1',
          questionId: 'q-3',
          practiceSessionId: null,
          selectedChoiceId: 'c-3',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'attempt-4',
          userId: 'other',
          questionId: 'q-4',
          practiceSessionId: null,
          selectedChoiceId: 'c-4',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-02T00:00:00Z'),
        },
      ]);

      await expect(
        repo.listAnsweredAtByUserIdSince(
          'user-1',
          new Date('2026-02-01T00:00:00Z'),
        ),
      ).resolves.toEqual([
        new Date('2026-02-03T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      ]);
    });
  });
});
