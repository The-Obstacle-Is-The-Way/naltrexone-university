import { useEffect, useState } from 'react';
import {
  getTags,
  type TagRow,
} from '@/src/adapters/controllers/tag-controller';
import { getThrownErrorMessage } from '../practice-logic';

export type UsePracticeSessionTagsOutput = {
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
};

export function usePracticeSessionTags(): UsePracticeSessionTagsOutput {
  const [tagLoadStatus, setTagLoadStatus] = useState<
    'idle' | 'loading' | 'error'
  >('loading');
  const [availableTags, setAvailableTags] = useState<TagRow[]>([]);

  useEffect(() => {
    let mounted = true;
    setTagLoadStatus('loading');

    void (async () => {
      let res: Awaited<ReturnType<typeof getTags>>;
      try {
        res = await getTags({});
      } catch (error) {
        if (!mounted) return;
        console.error(
          '[PracticeSessionControls] Tag load failed:',
          getThrownErrorMessage(error),
        );
        setTagLoadStatus('error');
        return;
      }
      if (!mounted) return;

      if (!res.ok) {
        setTagLoadStatus('error');
        return;
      }

      setAvailableTags(res.data.rows);
      setTagLoadStatus('idle');
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    tagLoadStatus,
    availableTags,
  };
}
