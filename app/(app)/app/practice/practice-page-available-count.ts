import type { ActionResult } from '@/src/adapters/controllers/action-result';

export type AvailableQuestionsCountStatus = 'idle' | 'loading' | 'error';

export function createAvailableQuestionsCountEffect(input: {
  countAvailableQuestionsFn: (
    input: unknown,
  ) => Promise<ActionResult<{ count: number }>>;
  filters: {
    tagSlugs: readonly string[];
    difficulties: readonly string[];
    statuses: readonly string[];
  };
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
      res = await input.countAvailableQuestionsFn({
        tagSlugs: input.filters.tagSlugs,
        difficulties: input.filters.difficulties,
        statuses: input.filters.statuses,
      });
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
