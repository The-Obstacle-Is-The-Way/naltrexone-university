import 'server-only';
import { cache } from 'react';
import type {
  QuestionRepository,
  QuestionRevisionBinding,
  TagRepository,
} from '@/src/application/ports/repositories';
import type { Question } from '@/src/domain/entities';

// React's cache compares arguments by identity, so a session item is keyed by
// its serialized binding.
function serializeBinding(item: QuestionRevisionBinding): string {
  return JSON.stringify([item.questionId, item.questionRevisionId]);
}

function deserializeBinding(serialized: string): QuestionRevisionBinding {
  const [questionId, questionRevisionId] = JSON.parse(serialized) as [
    string,
    string,
  ];
  return { questionId, questionRevisionId };
}

function serializeSortedUniqueBindings(
  items: readonly QuestionRevisionBinding[],
): string {
  return JSON.stringify([...new Set(items.map(serializeBinding))].sort());
}

function deserializeBindings(serialized: string): QuestionRevisionBinding[] {
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
  const findIdBySlug = cache(async (slug: string) =>
    questionRepository.findIdBySlug(slug),
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
    findIdBySlug,
    findByIdForSession(item: QuestionRevisionBinding) {
      return findBySerializedBindingForSession(serializeBinding(item));
    },
    async findByIdsForSession(
      items: readonly QuestionRevisionBinding[],
    ): Promise<readonly Question[]> {
      if (items.length === 0) return [];

      const serialized = serializeSortedUniqueBindings(items);
      const questions = await findByNormalizedBindingsForSession(serialized);
      // Two attempts can bind one question at different revisions, so each
      // result pairs with its binding. The port answers in the bindings' order
      // and omits a missing question for every binding of it.
      const questionByBinding = new Map<string, Question>();
      let next = 0;
      for (const binding of JSON.parse(serialized) as string[]) {
        const question = questions[next];
        if (question?.id === deserializeBinding(binding).questionId) {
          questionByBinding.set(binding, question);
          next += 1;
        }
      }

      return items
        .map((item) => questionByBinding.get(serializeBinding(item)))
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
