import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { asc, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { previewOrApply } from '@/scripts/content-release/command-support';
import {
  activateRelease,
  bootstrapRelease,
} from '@/scripts/content-release/release-activation';
import { stageReleaseFromFiles } from '@/scripts/content-release/release-builder';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { syncQuestionsFromFiles } from '@/scripts/seed/question-syncer';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { source } from './seed-test-helpers';

// DEBT-490: every activation, rollback and bootstrap records why it was made
// and on whose authority, as the withdrawal and hold commands do, and so do
// the withdrawals an activation makes. Each guard is its own case.
let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;

beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);

afterAll(async () => {
  await disposable.drop();
});

beforeEach(async () => {
  const { db } = disposable;
  await db
    .update(schema.contentReleasePointer)
    .set({ activeReleaseId: null, activatedAt: null });
  await db.delete(schema.contentReleaseActivations);
  await db.delete(schema.contentReleases);
  await db.delete(schema.questions);
});

const BOOTSTRAP = { reason: 'Adopt the live bank', authority: 'Content lead' };
const NEXT = { reason: 'October content update', authority: 'Clinical lead' };
const BACK = { reason: 'Revert the October update', authority: 'On-call' };

async function arrange() {
  const [kept, retired] = [1, 2].map(() => `it-attribution-${randomUUID()}`);
  if (!kept || !retired) throw new Error('slugs');
  await syncQuestionsFromFiles(disposable.db, [source(kept), source(retired)]);
  const base = (await bootstrapRelease(disposable.db, { record: BOOTSTRAP }))
    .releaseId;
  const next = (
    await stageReleaseFromFiles(disposable.db, [
      source(kept, { stem: 'A corrected task.' }),
      source(retired, { status: 'archived' }),
    ])
  ).releaseId;
  return { kept, retired, base, next };
}

async function receipts() {
  return disposable.db
    .select({
      releaseId: schema.contentReleaseActivations.releaseId,
      reason: schema.contentReleaseActivations.reason,
      authority: schema.contentReleaseActivations.authority,
    })
    .from(schema.contentReleaseActivations)
    .orderBy(asc(schema.contentReleaseActivations.activatedAt));
}

async function activeRelease() {
  const [pointer] = await disposable.db
    .select({ id: schema.contentReleasePointer.activeReleaseId })
    .from(schema.contentReleasePointer);
  return pointer?.id ?? null;
}

describe('DEBT-490: release decisions are attributed', () => {
  it('records the reason and authority of the bootstrap, an activation and a rollback on each receipt', async () => {
    const { base, next } = await arrange();

    await activateRelease(disposable.db, {
      releaseId: next,
      expectedActiveReleaseId: base,
      record: NEXT,
    });
    await activateRelease(disposable.db, {
      releaseId: base,
      expectedActiveReleaseId: next,
      record: BACK,
    });

    expect(await receipts()).toEqual([
      { releaseId: base, ...BOOTSTRAP },
      { releaseId: next, ...NEXT },
      { releaseId: base, ...BACK },
    ]);
  });

  it.each([
    ['a reason', { reason: ' ', authority: 'Clinical lead' }],
    ['an authority', { reason: 'October content update', authority: '' }],
  ] as const)(
    'refuses an activation without %s, writing nothing',
    async (_field, record) => {
      const { base, next } = await arrange();

      await expect(
        activateRelease(disposable.db, {
          releaseId: next,
          expectedActiveReleaseId: base,
          record,
        }),
      ).rejects.toMatchObject({ code: 'DECISION_REQUIRED' });

      expect(await activeRelease()).toBe(base);
      expect(await receipts()).toHaveLength(1);
    },
  );

  it.each([
    ['a reason', { reason: '', authority: 'Content lead' }],
    ['an authority', { reason: 'Adopt the live bank', authority: '  ' }],
  ] as const)(
    'refuses a bootstrap without %s, writing nothing',
    async (_field, record) => {
      await syncQuestionsFromFiles(disposable.db, [
        source(`it-attribution-${randomUUID()}`),
      ]);

      await expect(
        bootstrapRelease(disposable.db, { record }),
      ).rejects.toMatchObject({ code: 'DECISION_REQUIRED' });

      expect(await activeRelease()).toBeNull();
      expect(await receipts()).toEqual([]);
    },
  );

  it("records a hold's and a lift's own reason and authority when they re-apply the release", async () => {
    const { kept } = await arrange();

    await changeHolds(disposable.db, {
      qids: [kept],
      record: { reason: 'Dose under review', authority: 'Pharmacist' },
      lift: false,
    });
    await changeHolds(disposable.db, {
      qids: [kept],
      record: { reason: 'Dose confirmed', authority: 'Clinical lead' },
      lift: true,
    });

    expect((await receipts()).slice(1)).toMatchObject([
      { reason: 'hold placed: Dose under review', authority: 'Pharmacist' },
      { reason: 'hold lifted: Dose confirmed', authority: 'Clinical lead' },
    ]);
  });

  it("withdraws an archived removal on the activation's authority, naming the release and its reason", async () => {
    const { retired, base, next } = await arrange();

    await activateRelease(disposable.db, {
      releaseId: next,
      expectedActiveReleaseId: base,
      record: NEXT,
    });

    const withdrawals = await disposable.db
      .select({
        reason: schema.questionWithdrawals.reason,
        authority: schema.questionWithdrawals.authority,
      })
      .from(schema.questionWithdrawals)
      .innerJoin(
        schema.questions,
        eq(schema.questions.id, schema.questionWithdrawals.questionId),
      )
      .where(eq(schema.questions.slug, retired));
    expect(withdrawals).toEqual([
      {
        reason: `archived in content release ${next}: ${NEXT.reason}`,
        authority: NEXT.authority,
      },
    ]);
  });

  it('gives the same transition the same plan id whatever its reason', async () => {
    const { base, next } = await arrange();
    const planFor = async (record: typeof NEXT) =>
      (
        await previewOrApply(disposable.db, false, (db) =>
          activateRelease(db, {
            releaseId: next,
            expectedActiveReleaseId: base,
            record,
          }),
        )
      ).plan.id;

    expect(await planFor(NEXT)).toBe(await planFor(BACK));
  });

  it("keeps an activation's receipt immutable", async () => {
    await arrange();

    await expect(
      disposable.db
        .update(schema.contentReleaseActivations)
        .set({ reason: 'Rewritten afterwards' }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '23001' }),
    });
  });

  it.each([
    ['reason', 'content_release_activations_reason_chk'],
    ['authority', 'content_release_activations_authority_chk'],
  ] as const)(
    'refuses a blank %s in the database itself',
    async (field, constraint) => {
      const { base } = await arrange();

      await expect(
        disposable.db.insert(schema.contentReleaseActivations).values({
          releaseId: base,
          previousReleaseId: null,
          ...BOOTSTRAP,
          [field]: ' ',
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint_name: constraint }),
      });
    },
  );
});

// The migration itself, on a database that already has a receipt: it is
// migrated to 0048, given a receipt in 0048's shape, then migrated with the
// real 0049 file.
describe('migration 0049 on a database with existing receipts', () => {
  async function migrationsThrough(lastIndex: number) {
    const source = path.resolve(process.cwd(), 'db/migrations');
    const folder = await mkdtemp(path.join(tmpdir(), 'debt490-migrations-'));
    await mkdir(path.join(folder, 'meta'));
    const journal = JSON.parse(
      await readFile(path.join(source, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
    await writeFile(
      path.join(folder, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries }),
    );
    for (const entry of entries) {
      await copyFile(
        path.join(source, `${entry.tag}.sql`),
        path.join(folder, `${entry.tag}.sql`),
      );
    }
    return folder;
  }

  it('marks each existing receipt as not recorded, then requires a decision and keeps receipts immutable', async () => {
    const folder = await migrationsThrough(48);
    const early = await createDisposableDatabase({ migrationsFolder: folder });
    try {
      const [release] = await early.db.execute<{ id: string }>(sql`
        INSERT INTO content_releases (manifest, manifest_hash)
        VALUES ('{}'::jsonb, ${'e'.repeat(64)}) RETURNING id
      `);
      if (!release) throw new Error('release');
      await early.db.execute(sql`
        INSERT INTO content_release_activations (release_id) VALUES (${release.id})
      `);

      await migrate(early.db, {
        migrationsFolder: path.resolve(process.cwd(), 'db/migrations'),
      });

      expect(
        await early.db
          .select({
            reason: schema.contentReleaseActivations.reason,
            authority: schema.contentReleaseActivations.authority,
          })
          .from(schema.contentReleaseActivations),
      ).toEqual([
        {
          reason: 'not recorded: activated before DEBT-490',
          authority: 'not recorded',
        },
      ]);
      // Each default exists only for the existing rows: a new receipt that
      // omits either field is refused.
      await expect(
        early.db.execute(sql`
          INSERT INTO content_release_activations (release_id, authority)
          VALUES (${release.id}, 'Content lead')
        `),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          code: '23502',
          column_name: 'reason',
        }),
      });
      await expect(
        early.db.execute(sql`
          INSERT INTO content_release_activations (release_id, reason)
          VALUES (${release.id}, 'October update')
        `),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          code: '23502',
          column_name: 'authority',
        }),
      });
      await expect(
        early.db.execute(sql`
          UPDATE content_release_activations SET reason = 'Rewritten'
        `),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ code: '23001' }),
      });
    } finally {
      await early.drop();
      await rm(folder, { recursive: true, force: true });
    }
  }, 60_000);
});
