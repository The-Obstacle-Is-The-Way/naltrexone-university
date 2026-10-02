import { asc, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../db/schema';
import { assertNoActiveRelease } from '../content-release/release-activation';

// Only these committed fixtures are synthetic; an authored QID may share
// their prefix (BUG-315). The unit contract checks this list against the files.
export const SYNTHETIC_PLACEHOLDER_SLUGS = [
  'placeholder-01-naltrexone-mechanism',
  'placeholder-02-buprenorphine-induction-timing',
  'placeholder-03-alcohol-withdrawal-firstline',
  'placeholder-04-opioid-overdose-antidote',
  'placeholder-05-naltrexone-opioid-free-interval',
  'placeholder-06-tobacco-cessation-firstline',
  'placeholder-07-stimulant-intoxication-management',
  'placeholder-08-psychosocial-tx-motivational-interviewing',
  'placeholder-09-udt-interpretation',
  'placeholder-10-opioid-use-disorder-dsm5-criteria',
] as const;

export async function archivePlaceholderQuestions(
  db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
  return db.transaction(async (tx) => {
    await assertNoActiveRelease(tx);
    const placeholders = inArray(schema.questions.slug, [
      ...SYNTHETIC_PLACEHOLDER_SLUGS,
    ]);
    await tx
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(placeholders)
      .orderBy(asc(schema.questions.id))
      .for('no key update');
    const archived = await tx
      .update(schema.questions)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(placeholders)
      .returning({ id: schema.questions.id });

    return archived.length;
  });
}
