import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAppContainer } from '@/lib/controller-helpers';
import { db } from '@/lib/db';
import {
  DrizzleQuestionRepository,
  DrizzleTagRepository,
} from '@/src/adapters/repositories';
import { cleanup, createQuestion } from './bug-regression-test-helpers';
import { createTag } from './helpers';

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
    const slug = `it-load-app-container-${randomUUID()}`;

    await db.transaction(async (tx) => {
      const questions = container.createQuestionRepository(tx);
      const tags = container.createTagRepository(tx);
      const tag = await createTag(tx, cleanup, {
        slug: `${slug}-tag`,
        kind: 'topic',
      });
      const question = await createQuestion(tx, cleanup, {
        slug,
        status: 'published',
        difficulty: 'easy',
        tagIds: [tag.id],
      });

      expect(questions).toBeInstanceOf(DrizzleQuestionRepository);
      expect(questions).not.toBe(container.createQuestionRepository());
      expect(tags).toBeInstanceOf(DrizzleTagRepository);
      expect(tags).not.toBe(container.createTagRepository());
      // These rows are uncommitted, so only repositories bound to tx see them.
      await expect(
        questions.findPublishedById(question.id),
      ).resolves.toMatchObject({ id: question.id });
      expect((await tags.listAll()).map((listed) => listed.slug)).toContain(
        tag.slug,
      );
    });
  });
});
