import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { DrizzleTagRepository } from '@/src/adapters/repositories/drizzle-tag-repository';
import {
  cleanupAfterEach,
  closeConnection,
  createCleanupState,
  createIntegrationDb,
  createQuestion,
  createTag,
} from './helpers';

const { db, sql } = createIntegrationDb();
const cleanup = createCleanupState();

afterEach(async () => {
  await cleanupAfterEach(db, cleanup);
});

afterAll(async () => {
  await closeConnection(sql);
});

describe('DrizzleTagRepository', () => {
  it('lists tags ordered by kind then slug, excluding orphaned tags', async () => {
    const substanceSlug = `0-substance-${randomUUID()}`;
    const topicSlugA = `a-topic-${randomUUID()}`;
    const topicSlugB = `b-topic-${randomUUID()}`;
    const orphanSlug = `orphan-${randomUUID()}`;

    const substance = await createTag(db, cleanup, {
      slug: substanceSlug,
      kind: 'substance',
    });
    const topicB = await createTag(db, cleanup, {
      slug: topicSlugB,
      kind: 'topic',
    });
    const topicA = await createTag(db, cleanup, {
      slug: topicSlugA,
      kind: 'topic',
    });
    await createTag(db, cleanup, { slug: orphanSlug, kind: 'topic' });

    await createQuestion(db, cleanup, {
      slug: `q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [substance.id, topicA.id, topicB.id],
    });

    const repo = new DrizzleTagRepository(db);
    const all = await repo.listAll();

    const slugs = all.map((t) => t.slug);
    const substanceIndex = slugs.indexOf(substanceSlug);
    const topicIndexA = slugs.indexOf(topicSlugA);
    const topicIndexB = slugs.indexOf(topicSlugB);

    expect(substanceIndex).toBeGreaterThanOrEqual(0);
    expect(topicIndexA).toBeGreaterThanOrEqual(0);
    expect(topicIndexB).toBeGreaterThanOrEqual(0);

    expect(topicIndexA).toBeLessThan(topicIndexB);
    expect(topicIndexB).toBeLessThan(substanceIndex);

    expect(slugs).not.toContain(orphanSlug);
  });

  it('returns each tag as exactly its id, slug, name and kind', async () => {
    const tag = await createTag(db, cleanup, {
      slug: `exact-${randomUUID()}`,
      kind: 'topic',
      name: 'Exact projection',
    });
    await createQuestion(db, cleanup, {
      slug: `q-${randomUUID()}`,
      status: 'published',
      difficulty: 'easy',
      tagIds: [tag.id],
    });
    const [stored] = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.id, tag.id));
    if (!stored) throw new Error('Expected the stored tag');

    const listed = (await new DrizzleTagRepository(db).listAll()).find(
      (entry) => entry.id === tag.id,
    );

    expect(listed).toEqual({
      id: stored.id,
      slug: stored.slug,
      name: stored.name,
      kind: stored.kind,
    });
  });

  it('excludes tags linked only to unpublished questions', async () => {
    const draftOnly = await createTag(db, cleanup, {
      slug: `draft-only-${randomUUID()}`,
      kind: 'topic',
    });
    await createQuestion(db, cleanup, {
      slug: `q-draft-${randomUUID()}`,
      status: 'draft',
      difficulty: 'easy',
      tagIds: [draftOnly.id],
    });

    const slugs = (await new DrizzleTagRepository(db).listAll()).map(
      (entry) => entry.slug,
    );

    expect(slugs).not.toContain(draftOnly.slug);
  });
});
