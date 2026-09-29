import 'server-only';
import { cache } from 'react';
import type {
  QuestionRepository,
  SessionItemBinding,
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

// React's cache compares arguments by identity, so a session item is keyed by
// its serialized binding.
function serializeBinding(item: SessionItemBinding): string {
  return JSON.stringify([item.questionId, item.questionRevisionId]);
}

function deserializeBinding(serialized: string): SessionItemBinding {
  const [questionId, questionRevisionId] = JSON.parse(serialized) as [
    string,
    string | null,
  ];
  return { questionId, questionRevisionId };
}

function serializeSortedUniqueBindings(
  items: readonly SessionItemBinding[],
): string {
  return JSON.stringify([...new Set(items.map(serializeBinding))].sort());
}

function deserializeBindings(serialized: string): SessionItemBinding[] {
  return (JSON.parse(serialized) as string[]).map(deserializeBinding);
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
  const findBySerializedBindingForSession = cache(async (serialized: string) =>
    questionRepository.findByIdForSession(deserializeBinding(serialized)),
  );
  const findByNormalizedBindingsForSession = cache(async (serialized: string) =>
    questionRepository.findByIdsForSession(deserializeBindings(serialized)),
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
    findByIdForSession(item: SessionItemBinding) {
      return findBySerializedBindingForSession(serializeBinding(item));
    },
    async findByIdsForSession(
      items: readonly SessionItemBinding[],
    ): Promise<readonly Question[]> {
      if (items.length === 0) return [];

      const questions = await findByNormalizedBindingsForSession(
        serializeSortedUniqueBindings(items),
      );
      // A session holds each question once, so its id identifies the item.
      const questionById = new Map(
        questions.map((question) => [question.id, question]),
      );

      return items
        .map((item) => questionById.get(item.questionId))
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
