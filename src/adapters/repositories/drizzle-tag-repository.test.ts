import { describe, expect, it, vi } from 'vitest';
import { DrizzleTagRepository } from './drizzle-tag-repository';

function createMockDb(rows: readonly Record<string, unknown>[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };

  const db = {
    selectDistinct: vi.fn().mockReturnValue(chain),
  };

  type RepoDb = ConstructorParameters<typeof DrizzleTagRepository>[0];
  return { db: db as unknown as RepoDb, chain };
}

describe('DrizzleTagRepository', () => {
  describe('listAll', () => {
    it('returns tags mapped to domain entities', async () => {
      const rows = [
        {
          id: 'tag_1',
          slug: 'pharmacology-neuroscience',
          name: 'Pharmacology & Neuroscience',
          kind: 'domain',
        },
        {
          id: 'tag_2',
          slug: 'alcohol',
          name: 'Alcohol',
          kind: 'substance',
        },
      ];

      const { db } = createMockDb(rows);
      const repo = new DrizzleTagRepository(db);
      const result = await repo.listAll();

      expect(result).toEqual([
        {
          id: 'tag_1',
          slug: 'pharmacology-neuroscience',
          name: 'Pharmacology & Neuroscience',
          kind: 'domain',
        },
        {
          id: 'tag_2',
          slug: 'alcohol',
          name: 'Alcohol',
          kind: 'substance',
        },
      ]);
    });

    it('returns empty array when no tags have published questions', async () => {
      const { db } = createMockDb([]);
      const repo = new DrizzleTagRepository(db);
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
          extraField: 'should not be included',
        },
      ];

      const { db } = createMockDb(rows);
      const repo = new DrizzleTagRepository(db);
      const result = await repo.listAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'tag_1',
        slug: 'opioid-use-disorder',
        name: 'Opioid Use Disorder',
        kind: 'topic',
      });
      expect(result[0]).not.toHaveProperty('extraField');
    });

    it('uses selectDistinct with inner joins to filter by published questions', async () => {
      const { db, chain } = createMockDb([]);
      const repo = new DrizzleTagRepository(db);
      await repo.listAll();

      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      expect(chain.from).toHaveBeenCalledTimes(1);
      expect(chain.innerJoin).toHaveBeenCalledTimes(2);
      expect(chain.where).toHaveBeenCalledTimes(1);
      expect(chain.orderBy).toHaveBeenCalledTimes(1);
    });
  });
});
