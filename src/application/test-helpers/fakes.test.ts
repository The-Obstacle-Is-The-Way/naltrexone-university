import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakeAuthGateway,
  FakeBookmarkRepository,
  FakeLogger,
  FakePaymentGateway,
  FakePracticeSessionRepository,
  FakeQuestionRepository,
  FakeStripeCustomerRepository,
  FakeStripeEventRepository,
  FakeSubscriptionRepository,
  FakeTagRepository,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import type { Tag } from '@/src/domain/entities';
import {
  createPracticeSession,
  createQuestion,
  createTag,
} from '@/src/domain/test-helpers';

describe('FakeLogger', () => {
  it('records calls for each log level', () => {
    const logger = new FakeLogger();

    logger.debug({ debug: true }, 'debug');
    logger.info({ info: true }, 'info');
    logger.warn({ warn: true }, 'warn');
    logger.error({ error: true }, 'error');

    expect(logger.debugCalls).toEqual([
      { context: { debug: true }, msg: 'debug' },
    ]);
    expect(logger.infoCalls).toEqual([
      { context: { info: true }, msg: 'info' },
    ]);
    expect(logger.warnCalls).toEqual([
      { context: { warn: true }, msg: 'warn' },
    ]);
    expect(logger.errorCalls).toEqual([
      { context: { error: true }, msg: 'error' },
    ]);
  });
});

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

describe('FakeQuestionRepository', () => {
  it('throws VALIDATION_ERROR when status filters are provided without userId', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    const promise = repo.listPublishedCandidateIds({
      tagSlugs: [],
      difficulties: [],
      statuses: ['incorrect'],
    });

    await expect(promise).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'userId is required when filtering by status',
      ),
    );
  });

  it('throws VALIDATION_ERROR from count when status filters are provided without userId', async () => {
    const repo = new FakeQuestionRepository([createQuestion({ id: 'q1' })]);

    const promise = repo.countPublishedCandidateIds({
      tagSlugs: [],
      difficulties: [],
      statuses: ['incorrect'],
    });

    await expect(promise).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'userId is required when filtering by status',
      ),
    );
  });
});

describe('FakeSubscriptionRepository', () => {
  it('upserts subscriptions and supports lookup by externalSubscriptionId', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_123',
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
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_456',
      plan: 'annual',
      status: 'canceled',
      currentPeriodEnd: new Date('2027-01-31T00:00:00.000Z'),
      cancelAtPeriodEnd: true,
    });

    await expect(
      repo.findByExternalSubscriptionId('sub_123'),
    ).resolves.toBeNull();
    await expect(
      repo.findByExternalSubscriptionId('sub_456'),
    ).resolves.toMatchObject({
      userId: 'user_1',
    });
  });

  it('throws CONFLICT when an externalSubscriptionId is reused for a different user', async () => {
    const repo = new FakeSubscriptionRepository();

    await repo.upsert({
      userId: 'user_1',
      externalSubscriptionId: 'sub_123',
      plan: 'monthly',
      status: 'active',
      currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await expect(
      repo.upsert({
        userId: 'user_2',
        externalSubscriptionId: 'sub_123',
        plan: 'monthly',
        status: 'active',
        currentPeriodEnd: new Date('2026-12-31T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
      }),
    ).rejects.toEqual(
      new ApplicationError(
        'CONFLICT',
        'External subscription id is already mapped to a different user',
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
      externalCustomerId: 'cus_test',
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
    ).resolves.toEqual({ externalCustomerId: 'cus_test' });

    await expect(
      gateway.createCheckoutSession({
        userId: 'user_1',
        externalCustomerId: 'cus_123',
        plan: 'monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
      }),
    ).resolves.toEqual({ url: 'https://fake/checkout' });

    await expect(
      gateway.createPortalSession({
        externalCustomerId: 'cus_123',
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

    it('migrates clerkUserId when different clerkId arrives for existing email', async () => {
      const repo = new FakeUserRepository();

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com');
      const second = await repo.upsertByClerkId('clerk-2', 'user@example.com');

      expect(second.id).toBe(first.id);
      expect(second.email).toBe('user@example.com');
      await expect(repo.findByClerkId('clerk-2')).resolves.toMatchObject({
        id: first.id,
      });
      await expect(repo.findByClerkId('clerk-1')).resolves.toBeNull();
    });

    it('preserves clerkUserId when stale observedAt arrives for email conflict', async () => {
      const repo = new FakeUserRepository();
      const t2 = new Date('2026-02-01T02:00:00.000Z');
      const t1 = new Date('2026-02-01T01:00:00.000Z');

      const first = await repo.upsertByClerkId('clerk-1', 'user@example.com', {
        observedAt: t2,
      });
      const stale = await repo.upsertByClerkId('clerk-2', 'user@example.com', {
        observedAt: t1,
      });

      expect(stale.id).toBe(first.id);
      await expect(repo.findByClerkId('clerk-1')).resolves.toMatchObject({
        id: first.id,
      });
      await expect(repo.findByClerkId('clerk-2')).resolves.toBeNull();
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

    it('throws NOT_FOUND when event is missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(repo.markProcessed('evt_missing')).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Stripe event not found'),
      );
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

    it('throws NOT_FOUND when event is missing', async () => {
      const repo = new FakeStripeEventRepository();

      await expect(
        repo.markFailed('evt_missing', 'Something went wrong'),
      ).rejects.toEqual(
        new ApplicationError('NOT_FOUND', 'Stripe event not found'),
      );
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

  describe('findByUserId', () => {
    it('returns attempts in descending answeredAt order (paginated)', async () => {
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

      const result = await repo.findByUserId('user-1', { limit: 2, offset: 1 });

      expect(result.map((a) => a.id)).toEqual(['attempt-3', 'attempt-1']);
    });

    it('clamps negative offsets to 0', async () => {
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

      const result = await repo.findByUserId('user-1', {
        limit: 2,
        offset: -1,
      });

      expect(result.map((a) => a.id)).toEqual(['attempt-2', 'attempt-3']);
    });

    it('returns empty array when limit is <= 0', async () => {
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

      await expect(
        repo.findByUserId('user-1', { limit: -1, offset: 0 }),
      ).resolves.toEqual([]);
    });
  });

  describe('findByIdAndUserId', () => {
    it('returns attempt when id and userId match', async () => {
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
      ]);

      await expect(repo.findByIdAndUserId('attempt-1', 'user-1')).resolves.toBe(
        repo.getAll()[0],
      );
    });

    it('returns null when attempt exists but belongs to a different user', async () => {
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
      ]);

      await expect(
        repo.findByIdAndUserId('attempt-1', 'user-2'),
      ).resolves.toBeNull();
    });

    it('returns null when attempt does not exist', async () => {
      const repo = new FakeAttemptRepository([]);

      await expect(
        repo.findByIdAndUserId('attempt-missing', 'user-1'),
      ).resolves.toBeNull();
    });
  });

  describe('findBySessionIdAndQuestionId', () => {
    it('returns attempt when sessionId, userId, and questionId match', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: 'session-1',
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-1', 'q-1'),
      ).resolves.toBe(repo.getAll()[0]);
    });

    it('returns null when sessionId matches but questionId differs', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: 'session-1',
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-1', 'q-2'),
      ).resolves.toBeNull();
    });

    it('returns null when sessionId matches but userId differs', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: 'session-1',
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-1', 'user-2', 'q-1'),
      ).resolves.toBeNull();
    });

    it('returns null when sessionId does not exist', async () => {
      const repo = new FakeAttemptRepository([
        {
          id: 'attempt-1',
          userId: 'user-1',
          questionId: 'q-1',
          practiceSessionId: 'session-1',
          selectedChoiceId: 'c-1',
          isCorrect: true,
          timeSpentSeconds: 0,
          answeredAt: new Date('2026-02-01T00:00:00Z'),
        },
      ]);

      await expect(
        repo.findBySessionIdAndQuestionId('session-missing', 'user-1', 'q-1'),
      ).resolves.toBeNull();
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

  describe('listAttemptedQuestionsByUserId (attempted-question filters)', () => {
    it('filters by difficulty and tagSlug using question metadata', async () => {
      const qEasy = createQuestion({
        id: 'q_easy',
        difficulty: 'easy',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });
      const qHardAlcohol = createQuestion({
        id: 'q_hard_alcohol',
        difficulty: 'hard',
        tags: [createTag({ slug: 'alcohol', name: 'Alcohol' })],
      });
      const qHardOpioids = createQuestion({
        id: 'q_hard_opioids',
        difficulty: 'hard',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });
      const qHardDraft = createQuestion({
        id: 'q_hard_draft',
        difficulty: 'hard',
        status: 'draft',
        tags: [createTag({ slug: 'opioids', name: 'Opioids' })],
      });

      const repo = new FakeAttemptRepository(
        [
          {
            id: 'attempt-1',
            userId: 'user-1',
            questionId: qEasy.id,
            practiceSessionId: null,
            selectedChoiceId: 'choice-1',
            isCorrect: true,
            timeSpentSeconds: 0,
            answeredAt: new Date('2026-02-01T00:00:00Z'),
          },
          {
            id: 'attempt-2',
            userId: 'user-1',
            questionId: qHardAlcohol.id,
            practiceSessionId: null,
            selectedChoiceId: 'choice-2',
            isCorrect: true,
            timeSpentSeconds: 0,
            answeredAt: new Date('2026-02-02T00:00:00Z'),
          },
          {
            id: 'attempt-3',
            userId: 'user-1',
            questionId: qHardOpioids.id,
            practiceSessionId: null,
            selectedChoiceId: 'choice-3',
            isCorrect: true,
            timeSpentSeconds: 0,
            answeredAt: new Date('2026-02-03T00:00:00Z'),
          },
          {
            id: 'attempt-4',
            userId: 'user-1',
            questionId: qHardDraft.id,
            practiceSessionId: null,
            selectedChoiceId: 'choice-4',
            isCorrect: true,
            timeSpentSeconds: 0,
            answeredAt: new Date('2026-02-04T00:00:00Z'),
          },
        ],
        { questions: [qEasy, qHardAlcohol, qHardOpioids, qHardDraft] },
      );

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardOpioids.id },
        { questionId: qHardAlcohol.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([
        { questionId: qHardOpioids.id },
        { questionId: qEasy.id },
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toMatchObject([{ questionId: qHardOpioids.id }]);

      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
        }),
      ).resolves.toBe(2);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(2);
      await expect(
        repo.countAttemptedQuestionsByUserId('user-1', {
          difficulty: 'hard',
          tagSlug: 'opioids',
        }),
      ).resolves.toBe(1);
    });

    it('throws when difficulty/tagSlug filters are used without questions metadata', async () => {
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
      ]);

      await expect(
        repo.listAttemptedQuestionsByUserId('user-1', 10, 0, {
          difficulty: 'hard',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
