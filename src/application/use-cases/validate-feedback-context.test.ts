import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  FakeAttemptRepository,
  FakePracticeSessionRepository,
} from '@/src/application/test-helpers/fakes';
import {
  createAttempt,
  createPracticeSession,
} from '@/src/domain/test-helpers';
import { validateFeedbackContext } from './validate-feedback-context';

const userId = 'user-1';

function attemptsWith(
  ...attempts: Parameters<typeof createAttempt>[0][]
): FakeAttemptRepository {
  return new FakeAttemptRepository(attempts.map((a) => createAttempt(a)));
}

function sessionsWith(
  ...sessions: Parameters<typeof createPracticeSession>[0][]
): FakePracticeSessionRepository {
  return new FakePracticeSessionRepository(
    sessions.map((s) => createPracticeSession(s)),
  );
}

describe('validateFeedbackContext', () => {
  it('passes through null context without any lookups', async () => {
    await expect(
      validateFeedbackContext(
        { userId, questionId: 'q1', attemptId: null, practiceSessionId: null },
        { attempts: attemptsWith(), sessions: sessionsWith() },
      ),
    ).resolves.toEqual({ attemptId: null, practiceSessionId: null });
  });

  it('rejects an attempt that is not found for the user with NOT_FOUND', async () => {
    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'missing-attempt',
          practiceSessionId: null,
        },
        { attempts: attemptsWith(), sessions: sessionsWith() },
      ),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Feedback attempt not found'),
    );
  });

  it('rejects an attempt owned by another user with NOT_FOUND', async () => {
    const attempts = attemptsWith({
      id: 'attempt-1',
      userId: 'other-user',
      questionId: 'q1',
      practiceSessionId: null,
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'attempt-1',
          practiceSessionId: null,
        },
        { attempts, sessions: sessionsWith() },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an attempt for a different question with VALIDATION_ERROR', async () => {
    const attempts = attemptsWith({
      id: 'attempt-q2',
      userId,
      questionId: 'q2',
      practiceSessionId: null,
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'attempt-q2',
          practiceSessionId: null,
        },
        { attempts, sessions: sessionsWith() },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt does not match the question',
      ),
    );
  });

  it('accepts a standalone attempt that matches the question', async () => {
    const attempts = attemptsWith({
      id: 'attempt-q1',
      userId,
      questionId: 'q1',
      practiceSessionId: null,
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'attempt-q1',
          practiceSessionId: null,
        },
        { attempts, sessions: sessionsWith() },
      ),
    ).resolves.toEqual({ attemptId: 'attempt-q1', practiceSessionId: null });
  });

  it('rejects a session that is not found for the user with NOT_FOUND', async () => {
    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: null,
          practiceSessionId: 'missing-session',
        },
        { attempts: attemptsWith(), sessions: sessionsWith() },
      ),
    ).rejects.toEqual(
      new ApplicationError('NOT_FOUND', 'Feedback practice session not found'),
    );
  });

  it('rejects a session that does not contain the question with VALIDATION_ERROR', async () => {
    const sessions = sessionsWith({
      id: 'session-1',
      userId,
      questionIds: ['q2', 'q3'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: null,
          practiceSessionId: 'session-1',
        },
        { attempts: attemptsWith(), sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback practice session does not contain the question',
      ),
    );
  });

  it('accepts a session that contains the question', async () => {
    const sessions = sessionsWith({
      id: 'session-1',
      userId,
      questionIds: ['q1', 'q2'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: null,
          practiceSessionId: 'session-1',
        },
        { attempts: attemptsWith(), sessions },
      ),
    ).resolves.toEqual({ attemptId: null, practiceSessionId: 'session-1' });
  });

  it('rejects when a session-scoped attempt belongs to a different session', async () => {
    const attempts = attemptsWith({
      id: 'attempt-q1',
      userId,
      questionId: 'q1',
      practiceSessionId: 'session-other',
    });
    const sessions = sessionsWith({
      id: 'session-1',
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'attempt-q1',
          practiceSessionId: 'session-1',
        },
        { attempts, sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
  });

  it('accepts a session-scoped attempt that matches the supplied session', async () => {
    const attempts = attemptsWith({
      id: 'attempt-q1',
      userId,
      questionId: 'q1',
      practiceSessionId: 'session-1',
    });
    const sessions = sessionsWith({
      id: 'session-1',
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId: 'attempt-q1',
          practiceSessionId: 'session-1',
        },
        { attempts, sessions },
      ),
    ).resolves.toEqual({
      attemptId: 'attempt-q1',
      practiceSessionId: 'session-1',
    });
  });

  it('rejects a standalone attempt paired with an unrelated session', async () => {
    const attemptId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const attempts = attemptsWith({
      id: attemptId,
      userId,
      questionId: 'q1',
      practiceSessionId: null,
    });
    const sessions = sessionsWith({
      id: sessionId,
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId,
          practiceSessionId: sessionId,
        },
        { attempts, sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
  });

  it('rejects a standalone session-review retry paired with a different reviewed session', async () => {
    const attemptId = crypto.randomUUID();
    const reviewedSessionId = crypto.randomUUID();
    const suppliedSessionId = crypto.randomUUID();
    const attempts = attemptsWith({
      id: attemptId,
      userId,
      questionId: 'q1',
      practiceSessionId: null,
      retryOrigin: 'session_review',
      retrySessionId: reviewedSessionId,
    });
    const sessions = sessionsWith({
      id: suppliedSessionId,
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId,
          practiceSessionId: suppliedSessionId,
        },
        { attempts, sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
  });

  it('rejects a standalone session-review retry with missing reviewed-session provenance', async () => {
    const attemptId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const attempts = attemptsWith({
      id: attemptId,
      userId,
      questionId: 'q1',
      practiceSessionId: null,
      retryOrigin: 'session_review',
      retrySessionId: null,
    });
    const sessions = sessionsWith({
      id: sessionId,
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId,
          practiceSessionId: sessionId,
        },
        { attempts, sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
  });

  it('rejects a session-scoped attempt even with matching session-review retry provenance', async () => {
    // The attempt already belongs to a different session, so the session_review
    // exception must NOT apply (it is only for standalone retry attempts).
    const attemptId = crypto.randomUUID();
    const attemptSessionId = crypto.randomUUID();
    const suppliedSessionId = crypto.randomUUID();
    const attempts = attemptsWith({
      id: attemptId,
      userId,
      questionId: 'q1',
      practiceSessionId: attemptSessionId,
      retryOrigin: 'session_review',
      retrySessionId: suppliedSessionId,
    });
    const sessions = sessionsWith({
      id: suppliedSessionId,
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId,
          practiceSessionId: suppliedSessionId,
        },
        { attempts, sessions },
      ),
    ).rejects.toEqual(
      new ApplicationError(
        'VALIDATION_ERROR',
        'Feedback attempt is not part of the supplied session',
      ),
    );
  });

  it('accepts a session-review retry attempt paired with its reviewed session', async () => {
    const attemptId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const attempts = attemptsWith({
      id: attemptId,
      userId,
      questionId: 'q1',
      practiceSessionId: null,
      retryOrigin: 'session_review',
      retrySessionId: sessionId,
    });
    const sessions = sessionsWith({
      id: sessionId,
      userId,
      questionIds: ['q1'],
    });

    await expect(
      validateFeedbackContext(
        {
          userId,
          questionId: 'q1',
          attemptId,
          practiceSessionId: sessionId,
        },
        { attempts, sessions },
      ),
    ).resolves.toEqual({
      attemptId,
      practiceSessionId: sessionId,
    });
  });
});
