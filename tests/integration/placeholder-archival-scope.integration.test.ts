import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { archivePlaceholderQuestions } from '@/scripts/seed/placeholder-archiver';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
beforeAll(async () => {
  disposable = await createDisposableDatabase();
});
afterAll(async () => {
  if (disposable) await disposable.drop();
});
it('archives only committed fixtures and preserves an authored placeholder-prefix question', async () => {
  const authored = source('placeholder-authored-clinical-question');
  const fixture = source('placeholder-01-naltrexone-mechanism');
  await syncQuestionsFromFiles(disposable.db, [authored, fixture]);
  expect(await archivePlaceholderQuestions(disposable.db)).toBe(1);
  const rows = await disposable.db
    .select({ slug: schema.questions.slug })
    .from(schema.questions)
    .where(eq(schema.questions.status, 'published'));
  expect(rows).toEqual([{ slug: 'placeholder-authored-clinical-question' }]);
});
