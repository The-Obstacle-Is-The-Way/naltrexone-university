import { describe, expect, it } from 'vitest';
import type { Tag } from '@/src/domain/entities';
import { FakeTagRepository } from './fake-tag-repository';

describe('FakeTagRepository', () => {
  describe('listAll', () => {
    it('returns all seeded tags', async () => {
      const tags: Tag[] = [
        {
          id: 'tag-1',
          slug: 'pharmacology',
          name: 'Pharmacology',
          kind: 'topic',
        },
        { id: 'tag-2', slug: 'diagnosis', name: 'Diagnosis', kind: 'topic' },
      ];
      const repo = new FakeTagRepository(tags);

      const result = await repo.listAll();

      expect(result.map((tag) => tag.slug)).toEqual([
        'pharmacology',
        'diagnosis',
      ]);
    });

    it('returns empty array when no tags', async () => {
      const repo = new FakeTagRepository([]);
      const result = await repo.listAll();
      expect(result).toEqual([]);
    });
  });
});
