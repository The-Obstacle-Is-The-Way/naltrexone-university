import { describe, expect, it } from 'vitest';
import { loadAppContainer } from '@/lib/controller-helpers';
import { db } from '@/lib/db';
import {
  DrizzleQuestionRepository,
  DrizzleTagRepository,
} from '@/src/adapters/repositories';

describe('loadAppContainer', () => {
  it('reuses the request-cached question and tag repositories for the app database', async () => {
    const container = await loadAppContainer();

    expect(container.createQuestionRepository()).toBe(
      container.createQuestionRepository(db),
    );
    expect(container.createTagRepository()).toBe(
      container.createTagRepository(db),
    );
  });

  it('builds fresh repositories bound to a transaction database', async () => {
    const container = await loadAppContainer();

    await db.transaction(async (tx) => {
      const questions = container.createQuestionRepository(tx);
      const tags = container.createTagRepository(tx);

      expect(questions).toBeInstanceOf(DrizzleQuestionRepository);
      expect(questions).not.toBe(container.createQuestionRepository());
      expect(tags).toBeInstanceOf(DrizzleTagRepository);
      expect(tags).not.toBe(container.createTagRepository());
    });
  });
});
