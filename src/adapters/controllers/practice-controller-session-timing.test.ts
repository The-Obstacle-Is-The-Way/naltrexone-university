import { describe, expect, it } from 'vitest';
import { FakePracticeSessionRepository } from '@/src/application/test-helpers/fakes';
import { GetPracticeSessionTimingUseCase } from '@/src/application/use-cases/get-practice-session-timing';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { getPracticeSessionTiming } from './practice-controller';
import { createDeps } from './test-helpers/practice-controller-test-helpers';

function setup(
  overrides?: Parameters<typeof createDeps>[0],
  ownerUserId?: string,
) {
  const deps = createDeps(overrides);
  const session = createPracticeSession({
    userId: ownerUserId ?? deps._fixtures.userId,
    mode: 'exam',
    questionIds: ['q1'],
    startedAt: new Date('2026-05-22T12:00:00.000Z'),
  });
  return {
    session,
    deps: {
      ...deps,
      getPracticeSessionTimingUseCase: new GetPracticeSessionTimingUseCase(
        new FakePracticeSessionRepository([session]),
        () => new Date('2026-05-22T12:00:46.877Z'),
      ),
    },
  };
}

describe('practice-controller getPracticeSessionTiming', () => {
  it('returns only the owned session deadline and server remaining milliseconds', async () => {
    const { session, deps } = setup();

    await expect(
      getPracticeSessionTiming({ sessionId: session.id }, deps),
    ).resolves.toEqual({
      ok: true,
      data: {
        deadlineAt: '2026-05-22T12:01:12.000Z',
        remainingMs: 25_123,
      },
    });
  });

  it('rejects an invalid session identifier', async () => {
    const { deps } = setup();

    await expect(
      getPracticeSessionTiming({ sessionId: 'invalid' }, deps),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it.each([
    { overrides: { user: null }, code: 'UNAUTHENTICATED' },
    { overrides: { isEntitled: false }, code: 'UNSUBSCRIBED' },
  ])('requires access: $code', async ({ overrides, code }) => {
    const { session, deps } = setup(overrides);

    await expect(
      getPracticeSessionTiming({ sessionId: session.id }, deps),
    ).resolves.toMatchObject({ ok: false, error: { code } });
  });

  it("refuses another user's timing", async () => {
    const { session, deps } = setup(undefined, crypto.randomUUID());

    await expect(
      getPracticeSessionTiming({ sessionId: session.id }, deps),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
