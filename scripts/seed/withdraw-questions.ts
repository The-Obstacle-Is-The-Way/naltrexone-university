import { pathToFileURL } from 'node:url';
import { asc, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { QuestionFrontmatterSchema } from '../../lib/content/schemas';
import { runHumanDatabaseCommand } from '../database-command';
import {
  findUnrecordedWithdrawals,
  recordWithdrawals,
  type WithdrawalRecord,
} from './question-withdrawal-writer';

function parseArgs(argv: string[]) {
  const qids: string[] = [];
  const record: Partial<WithdrawalRecord> = {};
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--qid') {
      const qid = argv[index + 1];
      if (!qid || qid.startsWith('--')) {
        throw new Error('Missing value for --qid');
      }
      if (!QuestionFrontmatterSchema.shape.slug.safeParse(qid).success) {
        throw new Error(`Invalid question QID: ${qid}`);
      }
      if (qids.includes(qid)) {
        throw new Error(`Duplicate question QID: ${qid}`);
      }
      qids.push(qid);
      index += 1;
    } else if (arg === '--reason' || arg === '--authority') {
      const field = arg === '--reason' ? 'reason' : 'authority';
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (record[field] !== undefined) {
        throw new Error(`Duplicate ${arg}`);
      }
      record[field] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (qids.length === 0) throw new Error('At least one --qid is required');
  const { reason, authority } = record;
  if (reason === undefined) {
    throw new Error('--reason is required: why the content is withdrawn');
  }
  if (authority === undefined) {
    throw new Error('--authority is required: who ordered the withdrawal');
  }
  return { qids, apply, record: { reason, authority } };
}

export async function runContentWithdrawal(
  argv = process.argv.slice(2),
): Promise<void> {
  const { qids, apply, record } = parseArgs(argv);
  await runHumanDatabaseCommand({
    execute: async (databaseUrl) => {
      const sql = postgres(databaseUrl, { max: 1 });
      const db = drizzle(sql, { schema });
      try {
        const counts = await db.transaction(async (tx) => {
          // The seed writer takes the same row lock. Consistent ordering also
          // prevents overlapping withdrawal batches from locking in reverse.
          const questions = await tx
            .select({
              id: schema.questions.id,
              slug: schema.questions.slug,
              status: schema.questions.status,
            })
            .from(schema.questions)
            .where(inArray(schema.questions.slug, qids))
            .orderBy(asc(schema.questions.id))
            .for('update');
          const found = new Set(questions.map((question) => question.slug));
          const missing = qids.filter((qid) => !found.has(qid));
          if (missing.length > 0) {
            throw new Error(`Unknown question QID: ${missing.join(', ')}`);
          }
          const activeIds = questions
            .filter((question) => question.status !== 'archived')
            .map((question) => question.id);
          // DEBT-483: the record is what keeps a withdrawn revision out of
          // every release, so an already archived question still gets one.
          const unrecorded = await findUnrecordedWithdrawals(
            tx,
            questions.map((question) => question.id),
          );
          if (apply) {
            if (activeIds.length > 0) {
              await tx
                .update(schema.questions)
                .set({ status: 'archived', updatedAt: new Date() })
                .where(inArray(schema.questions.id, activeIds));
            }
            await recordWithdrawals(tx, unrecorded, record);
          }
          return {
            archive: activeIds.length,
            alreadyArchived: questions.length - activeIds.length,
            revisions: unrecorded.length,
          };
        });
        console.info(`Withdrawal QIDs: ${qids.join(', ')}`);
        console.info(
          `Withdrawal reason: ${record.reason} (authority: ${record.authority})`,
        );
        console.info(
          apply
            ? `Content withdrawal: archived=${counts.archive} alreadyArchived=${counts.alreadyArchived} revisionsWithdrawn=${counts.revisions}`
            : `Content withdrawal (dry-run): archive=${counts.archive} alreadyArchived=${counts.alreadyArchived} revisionsToWithdraw=${counts.revisions}`,
        );
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  });
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

if (import.meta.url === executedPath) {
  runContentWithdrawal().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
