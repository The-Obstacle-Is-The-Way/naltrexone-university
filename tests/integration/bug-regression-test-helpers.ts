import { afterAll, afterEach } from 'vitest';
import * as schema from '@/db/schema';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createUser,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

export { cleanup, createQuestion, createUser, db };

// Exactly one of selectedChoiceId or outcome names the answered choice; the
// type enforces it, so no call can pass both or neither.
type AnsweredChoice =
  | { selectedChoiceId: string; outcome?: never }
  | {
      outcome: { kind: 'answered'; selectedChoiceId: string };
      selectedChoiceId?: never;
    };

export async function insertAttemptAt(
  input: {
    userId: string;
    questionId: string;
    practiceSessionId: string | null;
    isCorrect?: boolean;
    answeredAt: Date;
  } & AnsweredChoice,
) {
  await db.insert(schema.attempts).values({
    userId: input.userId,
    questionId: input.questionId,
    practiceSessionId: input.practiceSessionId,
    selectedChoiceId: input.selectedChoiceId ?? input.outcome?.selectedChoiceId,
    isCorrect: input.isCorrect ?? true,
    timeSpentSeconds: 5,
    answeredAt: input.answeredAt,
  });
}
