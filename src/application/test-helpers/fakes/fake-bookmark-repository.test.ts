import { describe, expect, it } from 'vitest';
import { FakeBookmarkRepository } from './fake-bookmark-repository';

describe('FakeBookmarkRepository', () => {
  describe('exists', () => {
    it('returns false when bookmark not found', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.exists('user-1', 'question-1');
      expect(result).toBe(false);
    });

    it('returns true when bookmark exists', async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');

      const result = await repo.exists('user-1', 'question-1');

      expect(result).toBe(true);
    });
  });

  describe('add', () => {
    it('creates bookmark', async () => {
      const repo = new FakeBookmarkRepository();
      const bookmark = await repo.add('user-1', 'question-1');

      expect(bookmark.userId).toBe('user-1');
      expect(bookmark.questionId).toBe('question-1');
      expect(bookmark.createdAt).toBeInstanceOf(Date);
    });

    it('is idempotent - returns existing bookmark', async () => {
      const repo = new FakeBookmarkRepository();
      const first = await repo.add('user-1', 'question-1');
      const second = await repo.add('user-1', 'question-1');

      expect(second.createdAt).toEqual(first.createdAt);
    });
  });

  describe('remove', () => {
    it('returns true when bookmark existed', async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');

      const result = await repo.remove('user-1', 'question-1');

      expect(result).toBe(true);
    });

    it('returns false when bookmark was absent', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.remove('user-1', 'question-1');
      expect(result).toBe(false);
    });
  });

  describe('listByUserId', () => {
    it("returns user's bookmarks", async () => {
      const repo = new FakeBookmarkRepository();
      await repo.add('user-1', 'question-1');
      await repo.add('user-1', 'question-2');
      await repo.add('user-2', 'question-3');

      const result = await repo.listByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.questionId)).toEqual(
        expect.arrayContaining(['question-1', 'question-2']),
      );
    });

    it('returns empty array when user has no bookmarks', async () => {
      const repo = new FakeBookmarkRepository();
      const result = await repo.listByUserId('user-1');
      expect(result).toEqual([]);
    });
  });
});
