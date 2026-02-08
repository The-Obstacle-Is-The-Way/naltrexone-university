import type { ActionResult } from '@/src/adapters/controllers/action-result';

export function createTagsEffect<T>(input: {
  getTagsFn: (input: unknown) => Promise<ActionResult<{ rows: T[] }>>;
  setTagLoadStatus: (status: 'idle' | 'loading' | 'error') => void;
  setAvailableTags: (tags: T[]) => void;
}): () => void {
  let mounted = true;

  input.setTagLoadStatus('loading');

  void (async () => {
    let res: Awaited<ReturnType<typeof input.getTagsFn>>;
    try {
      res = await input.getTagsFn({});
    } catch {
      if (!mounted) return;
      input.setTagLoadStatus('error');
      return;
    }
    if (!mounted) return;

    if (!res.ok) {
      input.setTagLoadStatus('error');
      return;
    }

    input.setAvailableTags(res.data.rows);
    input.setTagLoadStatus('idle');
  })();

  return () => {
    mounted = false;
  };
}
