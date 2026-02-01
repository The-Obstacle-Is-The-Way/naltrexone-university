import { describe, expect, it, vi } from 'vitest';
import { DrizzleTagRepository } from './drizzle-tag-repository';

describe('DrizzleTagRepository', () => {
  describe('listAll', () => {
    it('returns all tags mapped to domain entities', async () => {
      const rows = [
        {
          id: 'tag_1',
          slug: 'addiction-medicine',
          name: 'Addiction Medicine',
          kind: 'topic',
        },
        {
          id: 'tag_2',
          slug: 'pharmacology',
          name: 'Pharmacology',
          kind: 'topic',
        },
      ] as const;

      const findMany = vi.fn(async (_opts?: { orderBy?: unknown[] }) => rows);
      const db = {
        query: {
          tags: {
            findMany,
          },
        },
      } as const;

      type RepoDb = ConstructorParameters<typeof DrizzleTagRepository>[0];
      const repo = new DrizzleTagRepository(db as unknown as RepoDb);

      const result = await repo.listAll();

      expect(findMany).toHaveBeenCalledTimes(1);
      const queryArgs = findMany.mock.calls[0]?.[0];
      expect(queryArgs?.orderBy).toHaveLength(2);

      expect(result).toEqual([
        {
          id: 'tag_1',
          slug: 'addiction-medicine',
          name: 'Addiction Medicine',
          kind: 'topic',
        },
        {
          id: 'tag_2',
          slug: 'pharmacology',
          name: 'Pharmacology',
          kind: 'topic',
        },
      ]);
    });

    it('returns empty array when no tags exist', async () => {
      const db = {
        query: {
          tags: {
            findMany: async () => [],
          },
        },
      } as const;

      type RepoDb = ConstructorParameters<typeof DrizzleTagRepository>[0];
      const repo = new DrizzleTagRepository(db as unknown as RepoDb);

      const result = await repo.listAll();

      expect(result).toEqual([]);
    });

    it('only includes id, slug, name, and kind in returned objects', async () => {
      const rows = [
        {
          id: 'tag_1',
          slug: 'opioid-use-disorder',
          name: 'Opioid Use Disorder',
          kind: 'topic',
          createdAt: new Date(),
          updatedAt: new Date(),
          extraField: 'should not be included',
        },
      ];

      const db = {
        query: {
          tags: {
            findMany: async () => rows,
          },
        },
      } as const;

      type RepoDb = ConstructorParameters<typeof DrizzleTagRepository>[0];
      const repo = new DrizzleTagRepository(db as unknown as RepoDb);

      const result = await repo.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'tag_1',
        slug: 'opioid-use-disorder',
        name: 'Opioid Use Disorder',
        kind: 'topic',
      });
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('extraField');
    });
  });
});
