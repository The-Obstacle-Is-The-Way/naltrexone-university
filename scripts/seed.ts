import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { readSeedQuestionFiles } from './seed/file-reader';
import { archivePlaceholderQuestions } from './seed/placeholder-archiver';
import { syncQuestionsFromFiles } from './seed/question-syncer';

export async function runSeed(databaseUrl: string): Promise<void> {
  const includePlaceholders = process.env.SEED_INCLUDE_PLACEHOLDERS === 'true';
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    const files = await readSeedQuestionFiles(includePlaceholders);
    const counts = await syncQuestionsFromFiles(db, files);

    console.info(
      `Seed complete: inserted=${counts.inserted} updated=${counts.updated} skipped=${counts.skipped} (files=${files.length})`,
    );
    console.info(`Content root: ${path.resolve('content/questions')}`);

    if (!includePlaceholders) {
      const archivedCount = await archivePlaceholderQuestions(db);
      console.info(
        `Archived placeholders: ${archivedCount} (slug LIKE "placeholder-%")`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
