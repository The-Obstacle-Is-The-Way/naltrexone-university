import { pathToFileURL } from 'node:url';
import { asc, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { lockReleasePointer } from '../content-release/release-activation';
import { runHumanDatabaseCommand } from '../database-command';
import { parseQidCommandArgs } from './qid-command-args';
import {
  findUnrecordedWithdrawals,
  recordWithdrawals,
} from './question-withdrawal-writer';

type CommandIo = {
  env?: Readonly<Record<string, string | undefined>>;
  log?: (message: string) => void;
};

export async function runContentWithdrawal(
  argv: readonly string[] = process.argv.slice(2),
  { env = process.env, log = console.info }: CommandIo = {},
): Promise<void> {
  const { qids, apply, record } = parseQidCommandArgs(argv, {
    decision: 'withdrawal',
  });
  await runHumanDatabaseCommand({
    env,
    log,
    execute: async (databaseUrl) => {
      const sql = postgres(databaseUrl, { max: 1 });
      const db = drizzle(sql, { schema });
      try {
        const counts = await db.transaction(async (tx) => {
          await lockReleasePointer(tx);
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
            .for('no key update');
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
        log(`Withdrawal QIDs: ${qids.join(', ')}`);
        log(
          `Withdrawal reason: ${record.reason} (authority: ${record.authority})`,
        );
        log(
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
