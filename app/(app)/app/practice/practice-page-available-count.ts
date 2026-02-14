import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  QuestionDifficulty,
  QuestionProgressStatus,
} from '@/src/domain/value-objects';

export type AvailableQuestionsCountStatus = 'idle' | 'loading' | 'error';

export type AvailableQuestionsCountFilters = {
  tagSlugs: readonly string[];
  difficulties: readonly QuestionDifficulty[];
  statuses: readonly QuestionProgressStatus[];
};

export function createAvailableQuestionsCountEffect(input: {
  countAvailableQuestionsFn: (
    input: AvailableQuestionsCountFilters,
  ) => Promise<ActionResult<{ count: number }>>;
  filters: AvailableQuestionsCountFilters;
  setAvailableCountStatus: (status: AvailableQuestionsCountStatus) => void;
  setAvailableCount: (count: number) => void;
  logError: (message: string, context: unknown) => void;
}): () => void {
  let mounted = true;
  const logError = input.logError;

  input.setAvailableCountStatus('loading');

  void (async () => {
    let res: Awaited<ReturnType<typeof input.countAvailableQuestionsFn>>;
    try {
      res = await input.countAvailableQuestionsFn(input.filters);
    } catch (error) {
      if (!mounted) return;
      logError('Failed to count available questions', error);
      input.setAvailableCountStatus('error');
      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      logError('Failed to count available questions', res.error);
      input.setAvailableCountStatus('error');
      return;
    }

    input.setAvailableCount(res.data.count);
    input.setAvailableCountStatus('idle');
  })();

  return () => {
    mounted = false;
  };
}
