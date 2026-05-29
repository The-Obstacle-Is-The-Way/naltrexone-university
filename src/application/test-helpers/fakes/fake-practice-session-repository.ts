import { ApplicationError } from '@/src/application/errors';
import type { PracticeSessionRepository } from '@/src/application/ports/repositories';
import type { PracticeSession } from '@/src/domain/entities';
import type {
  AnswerOutcome,
  PracticeMode,
  QuestionDifficulty,
} from '@/src/domain/value-objects';
import { selectedChoiceIdOrNull } from '@/src/domain/value-objects';

export class FakePracticeSessionRepository
  implements PracticeSessionRepository
{
  private sessions: readonly PracticeSession[];
  readonly createInputs: Array<{
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }> = [];

  constructor(seed: readonly PracticeSession[] = []) {
    this.sessions = seed.map((session) =>
      this.withNormalizedQuestionStates(session),
    );
  }

  private normalizeQuestionState(
    state: Pick<
      PracticeSession['questionStates'][number],
      | 'questionId'
      | 'markedForReview'
      | 'latestSelectedChoiceId'
      | 'latestIsCorrect'
      | 'latestAnsweredAt'
    > &
      Partial<
        Pick<
          PracticeSession['questionStates'][number],
          'draftSelectedChoiceId' | 'draftSavedAt' | 'draftCumulativeMs'
        >
      >,
  ): PracticeSession['questionStates'][number] {
    return {
      questionId: state.questionId,
      markedForReview: state.markedForReview,
      latestSelectedChoiceId: state.latestSelectedChoiceId,
      latestIsCorrect: state.latestIsCorrect,
      latestAnsweredAt: state.latestAnsweredAt,
      draftSelectedChoiceId: state.draftSelectedChoiceId ?? null,
      draftSavedAt: state.draftSavedAt ?? null,
      draftCumulativeMs: state.draftCumulativeMs ?? 0,
    };
  }

  private withNormalizedQuestionStates(
    session: PracticeSession,
  ): PracticeSession {
    const existingByQuestionId = new Map(
      session.questionStates.map((state) => [state.questionId, state]),
    );
    return {
      ...session,
      questionStates: session.questionIds.map((questionId) => {
        const existing = existingByQuestionId.get(questionId);
        if (existing) return this.normalizeQuestionState(existing);
        return this.normalizeQuestionState({
          questionId,
          markedForReview: false,
          latestSelectedChoiceId: null,
          latestIsCorrect: null,
          latestAnsweredAt: null,
        });
      }),
    };
  }

  private updateSession(
    id: string,
    mapFn: (session: PracticeSession) => PracticeSession,
  ): void {
    this.sessions = this.sessions.map((session) =>
      session.id === id ? mapFn(session) : session,
    );
  }

  private async getActiveSession(
    sessionId: string,
    userId: string,
  ): Promise<PracticeSession> {
    const session = await this.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }
    if (session.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }
    return session;
  }

  private requireQuestionState(
    session: PracticeSession,
    questionId: string,
  ): PracticeSession['questionStates'][number] {
    const state = session.questionStates.find(
      (s) => s.questionId === questionId,
    );
    if (!state) {
      throw new ApplicationError(
        'NOT_FOUND',
        'Question is not part of this practice session',
      );
    }
    return state;
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PracticeSession | null> {
    const found = this.sessions.find((s) => s.id === id && s.userId === userId);
    if (!found) return null;
    return this.withNormalizedQuestionStates(found);
  }

  async findLatestIncompleteByUserId(
    userId: string,
  ): Promise<PracticeSession | null> {
    const incomplete = this.sessions
      .filter((s) => s.userId === userId && s.endedAt === null)
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return incomplete[0] ?? null;
  }

  async findCompletedByUserId(
    userId: string,
    limit: number,
    offset: number,
    mode?: PracticeMode | null,
  ): Promise<{ rows: readonly PracticeSession[]; total: number }> {
    const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 0;
    const normalizedOffset = Number.isFinite(offset) ? Math.floor(offset) : 0;
    const safeLimit = Math.max(0, normalizedLimit);
    const safeOffset = Math.max(0, normalizedOffset);

    const completed = this.sessions
      .filter((s) => s.userId === userId && s.endedAt !== null)
      .filter((s) => (mode ? s.mode === mode : true))
      .slice()
      .sort((a, b) => {
        const endedDelta =
          (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0);
        if (endedDelta !== 0) return endedDelta;
        return b.startedAt.getTime() - a.startedAt.getTime();
      });

    return {
      rows:
        safeLimit === 0
          ? []
          : completed.slice(safeOffset, safeOffset + safeLimit),
      total: completed.length,
    };
  }

  async create(input: {
    userId: string;
    mode: 'tutor' | 'exam';
    paramsJson: unknown;
  }): Promise<PracticeSession> {
    this.createInputs.push(input);
    const params = input.paramsJson as {
      questionIds: string[];
      tagSlugs: string[];
      difficulties: QuestionDifficulty[];
      questionStates?: Array<{
        questionId: string;
        markedForReview: boolean;
        latestSelectedChoiceId: string | null;
        latestIsCorrect: boolean | null;
        latestAnsweredAt: string | null;
        draftSelectedChoiceId?: string | null;
        draftSavedAt?: string | null;
        draftCumulativeMs?: number;
      }>;
    };
    const statesByQuestionId = new Map(
      (params.questionStates ?? []).map((state) => [state.questionId, state]),
    );
    const session: PracticeSession = {
      id: crypto.randomUUID(),
      userId: input.userId,
      mode: input.mode,
      questionIds: params.questionIds,
      questionStates: params.questionIds.map((questionId) => {
        const state = statesByQuestionId.get(questionId);
        return this.normalizeQuestionState({
          questionId,
          markedForReview: state?.markedForReview ?? false,
          latestSelectedChoiceId: state?.latestSelectedChoiceId ?? null,
          latestIsCorrect: state?.latestIsCorrect ?? null,
          latestAnsweredAt: state?.latestAnsweredAt
            ? new Date(state.latestAnsweredAt)
            : null,
          draftSelectedChoiceId: state?.draftSelectedChoiceId ?? null,
          draftSavedAt: state?.draftSavedAt
            ? new Date(state.draftSavedAt)
            : null,
          draftCumulativeMs: state?.draftCumulativeMs ?? 0,
        });
      }),
      tagFilters: params.tagSlugs,
      difficultyFilters: params.difficulties,
      startedAt: new Date(),
      endedAt: null,
    };

    this.sessions = [...this.sessions, session];
    return session;
  }

  async saveDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    cumulativeMs: number;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    const savedAt = new Date();
    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;

        if (
          (state.draftSavedAt && state.draftSavedAt > savedAt) ||
          input.cumulativeMs < state.draftCumulativeMs
        ) {
          updatedState = state;
          return state;
        }

        updatedState = {
          ...state,
          draftSelectedChoiceId: input.selectedChoiceId,
          draftSavedAt: savedAt,
          draftCumulativeMs: input.cumulativeMs,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session draft answer state',
      );
    }
    return updatedState;
  }

  async finalizeDraftAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    outcome: AnswerOutcome;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;
        updatedState = {
          ...state,
          latestSelectedChoiceId: selectedChoiceIdOrNull(input.outcome),
          latestIsCorrect: input.isCorrect,
          latestAnsweredAt: input.answeredAt,
          draftSelectedChoiceId: null,
          draftSavedAt: null,
          draftCumulativeMs: 0,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to finalize practice session draft answer state',
      );
    }
    return updatedState;
  }

  async recordQuestionAnswer(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    selectedChoiceId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;
        updatedState = {
          ...state,
          latestSelectedChoiceId: input.selectedChoiceId,
          latestIsCorrect: input.isCorrect,
          latestAnsweredAt: input.answeredAt,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session answer state',
      );
    }
    return updatedState;
  }

  async setQuestionMarkedForReview(input: {
    sessionId: string;
    userId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeSession['questionStates'][number]> {
    const session = await this.getActiveSession(input.sessionId, input.userId);
    this.requireQuestionState(session, input.questionId);

    let updatedState: PracticeSession['questionStates'][number] | null = null;
    this.updateSession(input.sessionId, (existing) => {
      const next = this.withNormalizedQuestionStates(existing);
      const questionStates = next.questionStates.map((state) => {
        if (state.questionId !== input.questionId) return state;
        updatedState = {
          ...state,
          markedForReview: input.markedForReview,
        };
        return updatedState;
      });
      return { ...next, questionStates };
    });

    if (!updatedState) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Failed to persist practice session review mark',
      );
    }
    return updatedState;
  }

  async end(id: string, userId: string): Promise<PracticeSession> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) {
      throw new ApplicationError('NOT_FOUND', 'Practice session not found');
    }

    if (existing.endedAt) {
      throw new ApplicationError('CONFLICT', 'Practice session already ended');
    }

    const ended: PracticeSession = { ...existing, endedAt: new Date() };
    this.updateSession(id, () => ended);
    return ended;
  }
}
