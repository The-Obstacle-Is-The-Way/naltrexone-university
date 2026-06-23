import 'server-only';
import { cache } from 'react';
import type {
  QuestionRepository,
  TagRepository,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

function getSortedUniqueQuestionIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function serializeQuestionIds(ids: readonly string[]): string {
  return JSON.stringify(ids);
}

function deserializeQuestionIds(serializedIds: string): string[] {
  return JSON.parse(serializedIds) as string[];
}

export function createRequestCachedQuestionRepository(
  questionRepository: QuestionRepository,
): QuestionRepository {
  const findPublishedById = cache(async (id: string) =>
    questionRepository.findPublishedById(id),
  );
  const findPublishedBySlug = cache(async (slug: string) =>
    questionRepository.findPublishedBySlug(slug),
  );
  const findPublishedByNormalizedIds = cache(async (serializedIds: string) =>
    questionRepository.findPublishedByIds(
      deserializeQuestionIds(serializedIds),
    ),
  );
  const findByIdForSession = cache(async (id: string) =>
    questionRepository.findByIdForSession(id),
  );
  const findByNormalizedIdsForSession = cache(async (serializedIds: string) =>
    questionRepository.findByIdsForSession(
      deserializeQuestionIds(serializedIds),
    ),
  );

  return {
    findPublishedById,
    findPublishedBySlug,
    async findPublishedByIds(
      ids: readonly string[],
    ): Promise<readonly Question[]> {
      const normalizedIds = getSortedUniqueQuestionIds(ids);
      if (normalizedIds.length === 0) return [];

      const questions = await findPublishedByNormalizedIds(
        serializeQuestionIds(normalizedIds),
      );
      const questionById = new Map(
        questions.map((question) => [question.id, question]),
      );

      return ids
        .map((id) => questionById.get(id))
        .filter((question): question is Question => question !== undefined);
    },
    findByIdForSession,
    async findByIdsForSession(
      ids: readonly string[],
    ): Promise<readonly Question[]> {
      const normalizedIds = getSortedUniqueQuestionIds(ids);
      if (normalizedIds.length === 0) return [];

      const questions = await findByNormalizedIdsForSession(
        serializeQuestionIds(normalizedIds),
      );
      const questionById = new Map(
        questions.map((question) => [question.id, question]),
      );

      return ids
        .map((id) => questionById.get(id))
        .filter((question): question is Question => question !== undefined);
    },
    listPublishedCandidateIds(filters) {
      return questionRepository.listPublishedCandidateIds(filters);
    },
    countPublishedCandidateIds(filters) {
      return questionRepository.countPublishedCandidateIds(filters);
    },
  };
}

export function createRequestCachedTagRepository(
  tagRepository: TagRepository,
): TagRepository {
  const listAll = cache(async () => tagRepository.listAll());

  return {
    listAll,
  };
}
