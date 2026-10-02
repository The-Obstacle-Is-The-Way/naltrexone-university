import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { readSeedQuestionFiles } from './seed/file-reader';
import { archivePlaceholderQuestions } from './seed/placeholder-archiver';
import { syncQuestionsFromFiles } from './seed/question-syncer';
import {
  summarizePlaceholderArchival,
  summarizeSeedSync,
} from './seed/seed-summary';

export async function runSeed(databaseUrl: string): Promise<void> {
  const includePlaceholders = process.env.SEED_INCLUDE_PLACEHOLDERS === 'true';
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    const files = await readSeedQuestionFiles(includePlaceholders);
    const counts = await syncQuestionsFromFiles(db, files);
    console.info(summarizeSeedSync(counts, files.length));
    console.info(`Content root: ${path.resolve('content/questions')}`);

    if (!includePlaceholders) {
      const archivedCount = await archivePlaceholderQuestions(db);
      console.info(summarizePlaceholderArchival(archivedCount));
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
