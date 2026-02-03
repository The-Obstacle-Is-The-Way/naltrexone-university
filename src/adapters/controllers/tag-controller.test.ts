import { describe, expect, it } from 'vitest';
import {
  getTags,
  type TagControllerDeps,
} from '@/src/adapters/controllers/tag-controller';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
  FakeTagRepository,
} from '@/src/application/test-helpers/fakes';
import { CheckEntitlementUseCase } from '@/src/application/use-cases/check-entitlement';
import {
  createSubscription,
  createTag,
  createUser,
} from '@/src/domain/test-helpers';

function createDeps(overrides?: {
  user?: ReturnType<typeof createUser> | null;
  isEntitled?: boolean;
  tags?: Array<ReturnType<typeof createTag>>;
}): TagControllerDeps {
  const user =
    overrides?.user === undefined
      ? createUser({
          id: 'user_1',
          email: 'user@example.com',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        })
      : overrides.user;

  const authGateway = new FakeAuthGateway(user);

  const subscriptionRepository = new FakeSubscriptionRepository(
    overrides?.isEntitled === false
      ? []
      : [
          createSubscription({
            userId: user?.id ?? 'user_1',
            status: 'active',
            currentPeriodEnd: new Date('2026-12-31T00:00:00Z'),
          }),
        ],
  );

  const now = new Date('2026-02-01T00:00:00Z');
  const checkEntitlementUseCase = new CheckEntitlementUseCase(
    subscriptionRepository,
    () => now,
  );

  const tagRepository = new FakeTagRepository(overrides?.tags ?? []);

  return {
    authGateway,
    checkEntitlementUseCase,
    tagRepository,
  };
}

describe('tag-controller', () => {
  describe('getTags', () => {
    it('returns VALIDATION_ERROR when input is invalid', async () => {
      const deps = createDeps();

      const result = await getTags({ extra: 'nope' }, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('returns UNAUTHENTICATED when unauthenticated', async () => {
      const deps = createDeps({ user: null });

      const result = await getTags({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('returns UNSUBSCRIBED when not entitled', async () => {
      const deps = createDeps({ isEntitled: false });

      const result = await getTags({}, deps);

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'UNSUBSCRIBED' },
      });
    });

    it('returns tags when entitled', async () => {
      const deps = createDeps({
        tags: [
          createTag({
            id: 'tag_1',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          }),
          createTag({
            id: 'tag_2',
            slug: 'alcohol',
            name: 'Alcohol',
            kind: 'substance',
          }),
        ],
      });

      const result = await getTags({}, deps);

      expect(result).toMatchObject({
        ok: true,
        data: {
          rows: [
            {
              id: 'tag_1',
              slug: 'opioids',
              name: 'Opioids',
              kind: 'substance',
            },
            {
              id: 'tag_2',
              slug: 'alcohol',
              name: 'Alcohol',
              kind: 'substance',
            },
          ],
        },
      });
    });
  });
});
