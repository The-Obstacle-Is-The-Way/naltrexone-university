import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzlePracticeSessionRepository } from '@/src/adapters/repositories/drizzle-practice-session-repository';
import {
  cleanup,
  createQuestion,
  createUser,
  db,
} from './bug-regression-test-helpers';

// ---------------------------------------------------------------------------
// BUG-188: legacy params_json rows remain updatable after Track A backfill.
// ---------------------------------------------------------------------------

describe('BUG-188: legacy JSON shapes migrate to relational state', () => {
  it('updates current-format params_json with relational state rows', async () => {
    const user = await createUser(db, cleanup);
    const question = await createQuestion(db, cleanup, {
      slug: `it-current-cas-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
    });

    const sessionRepo = new DrizzlePracticeSessionRepository(db);
    const session = await sessionRepo.create({
      userId: user.id,
      mode: 'tutor',
      paramsJson: {
        count: 1,
        tagSlugs: [],
        difficulties: [],
        questionIds: [question.id],
      },
    });

    await expect(
      sessionRepo.recordQuestionAnswer({
        sessionId: session.id,
        userId: user.id,
        questionId: question.id,
        selectedChoiceId: question.correctChoiceId,
        isCorrect: true,
        answeredAt: new Date(),
      }),
    ).resolves.toMatchObject({
      questionId: question.id,
      latestIsCorrect: true,
    });

    const storedSession = await db.query.practiceSessions.findFirst({
      where: eq(schema.practiceSessions.id, session.id),
    });
    expect(storedSession?.paramsJson).not.toHaveProperty('questionStates');
  });
});
