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

const DEFAULT_DEBOUNCE_MS = 200;

export function createAvailableQuestionsCountEffect(input: {
  countAvailableQuestionsFn: (
    input: AvailableQuestionsCountFilters,
  ) => Promise<ActionResult<{ count: number }>>;
  debounceMs?: number;
  filters: AvailableQuestionsCountFilters;
  setAvailableCountStatus: (status: AvailableQuestionsCountStatus) => void;
  setAvailableCount: (count: number) => void;
  logError: (message: string, context: unknown) => void;
}): () => void {
  let mounted = true;
  const logError = input.logError;
  const debounceMs = input.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  input.setAvailableCountStatus('loading');

  const run = () => {
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
  };

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (debounceMs > 0) {
    timeoutId = setTimeout(run, debounceMs);
  } else {
    run();
  }

  return () => {
    mounted = false;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
