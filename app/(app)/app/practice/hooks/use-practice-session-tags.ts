import { useEffect, useState } from 'react';
import {
  getTags,
  type TagRow,
} from '@/src/adapters/controllers/tag-controller';
import { createTagsEffect } from '../practice-page-tags';

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
    return createTagsEffect({
      getTagsFn: getTags,
      setTagLoadStatus,
      setAvailableTags,
      logError: () => undefined,
    });
  }, []);

  return {
    tagLoadStatus,
    availableTags,
  };
}
