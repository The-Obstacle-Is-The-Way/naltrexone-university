import { describe, expect, it } from 'vitest';
import { createPracticeSession } from '@/src/domain/test-helpers';
import { ApplicationError } from '../errors';
import { FakePracticeSessionRepository } from './fakes';

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
