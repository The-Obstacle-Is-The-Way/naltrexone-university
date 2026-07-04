import { expect, vi } from 'vitest';
import type { practiceSessionQuestionStates } from '@/db/schema';
import {
  collectColumnNames,
  collectPrimitiveValues,
} from './repository-test-helpers';

export {
  collectColumnNames,
  collectPrimitiveValues,
} from './repository-test-helpers';

export type StateRow = typeof practiceSessionQuestionStates.$inferSelect;

export function restoreDrizzlePracticeSessionRepositoryTestMocks() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export function createStateRow(
  input: {
    practiceSessionId: string;
    questionId: string;
    position: number;
  } & Partial<StateRow>,
): StateRow {
  const now = new Date('2026-02-01T00:00:00.000Z');
  return {
    id: input.id ?? crypto.randomUUID(),
    practiceSessionId: input.practiceSessionId,
    questionId: input.questionId,
    position: input.position,
    markedForReview: input.markedForReview ?? false,
    latestSelectedChoiceId: input.latestSelectedChoiceId ?? null,
    latestIsCorrect: input.latestIsCorrect ?? null,
    latestAnsweredAt: input.latestAnsweredAt ?? null,
    draftSelectedChoiceId: input.draftSelectedChoiceId ?? null,
    draftSavedAt: input.draftSavedAt ?? null,
    draftCumulativeMs: input.draftCumulativeMs ?? 0,
    version: input.version ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function expectStateSelectPredicate(
  predicate: unknown,
  expectedSessionIds: readonly string[],
) {
  expect([...new Set(collectColumnNames(predicate))]).toEqual(
    expect.arrayContaining(['practice_session_id']),
  );
  const uuidValues = collectPrimitiveValues(predicate).filter(
    (value): value is string =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
  expect(uniqueSorted(uuidValues)).toEqual(uniqueSorted(expectedSessionIds));
}
