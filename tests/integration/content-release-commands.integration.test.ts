import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { runActivateRelease } from '@/scripts/content-release/activate-release';
import { runBootstrapRelease } from '@/scripts/content-release/bootstrap-release';
import { runHoldQuestions } from '@/scripts/content-release/hold-questions';
import {
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import {
  addCurrentRevision,
  createCleanupState,
  createQuestion,
} from './helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';

// These commands commit activations, and an activation archives every
// published question a release leaves out. So they run against a database of
// their own, created with every migration and dropped afterwards.
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

function commandIo() {
  const lines: string[] = [];
  return {
    output: () => lines.join('\n'),
    io: {
      env: { DATABASE_URL: disposable.url },
      log: (line: string) => lines.push(line),
    },
  };
}

async function arrange(status: schema.QuestionStatus) {
  return createQuestion(disposable.db, createCleanupState(), {
    slug: `it-command-${randomUUID()}`,
    status,
    difficulty: 'easy',
  });
}

async function statusOf(questionId: string) {
  const [row] = await disposable.db
    .select({ status: schema.questions.status })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId));
  return row?.status;
}

async function activeRelease() {
  const [pointer] = await disposable.db
    .select({ id: schema.contentReleasePointer.activeReleaseId })
    .from(schema.contentReleasePointer);
  return pointer?.id ?? null;
}

const RECORD = ['--reason', 'Under review', '--authority', 'Clinical lead'];
// DEBT-490: the release commands name their decision too.
const DECISION = [
  '--reason',
  "Clinician's request",
  '--authority',
  'Content lead',
];
const DECISION_ARGS = `--reason 'Clinician'\\''s request' --authority 'Content lead'`;

// The plan id a preview printed, as an operator would copy it.
function planIdIn(output: string): string {
  const match = /^Plan: ([0-9a-f]{64})$/m.exec(output);
  if (!match?.[1]) throw new Error(`No plan in:\n${output}`);
  return match[1];
}

describe('bootstrap-release', () => {
  it('previews the bootstrap without changing anything', async () => {
    await arrange('published');
    await arrange('published');
    await arrange('draft');
    const { io, output } = commandIo();

    await runBootstrapRelease(DECISION, io);

    expect(output()).toContain('Release bootstrap (dry-run): ');
    expect(output()).toContain(
      "Decision: Clinician's request (authority: Content lead)",
    );
    expect(output()).toContain('items=2 published=0 archived=0');
    expect(await activeRelease()).toBeNull();
    expect(await disposable.db.select().from(schema.contentReleases)).toEqual(
      [],
    );
  });

  it('adopts what is live with the plan its preview printed, and only once', async () => {
    const published = await arrange('published');
    const preview = commandIo();
    await runBootstrapRelease(DECISION, preview.io);
    const plan = planIdIn(preview.output());
    expect(preview.output()).toContain(
      `Apply exactly this plan: pnpm exec tsx scripts/content-release/bootstrap-release.ts ${DECISION_ARGS} --plan ${plan} --apply`,
    );
    const { io, output } = commandIo();

    await runBootstrapRelease([...DECISION, '--plan', plan, '--apply'], io);

    expect(output()).toMatch(
      /Release bootstrap: release=\S+ previous=none items=1 published=0 archived=0/,
    );
    expect(await activeRelease()).not.toBeNull();
    expect(await statusOf(published.id)).toBe('published');
    await expect(
      runBootstrapRelease([...DECISION, '--plan', plan, '--apply'], io),
    ).rejects.toThrow(/is active; only the first release adopts what is live/);
  });
});

describe('activate-release', () => {
  it('previews an activation, applies it, and rolls back to the earlier release', async () => {
    const kept = await arrange('published');
    const dropped = await arrange('published');
    const first = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;
    const next = await stageRelease(disposable.db, {
      items: [{ questionId: kept.id, questionRevisionId: kept.revisionId }],
      removals: [{ questionId: dropped.id, kind: 'draft' }],
      parentReleaseId: first,
    });
    const args = ['--release', next, '--expect-active', first, ...DECISION];

    const preview = commandIo();
    await runActivateRelease(args, preview.io);
    expect(preview.output()).toContain(
      `Release activation (dry-run): release=${next} previous=${first} items=1 published=0 archived=1`,
    );
    expect(preview.output()).toContain(`Archive (1): ${dropped.slug}`);
    expect(preview.output()).toContain(
      "Decision: Clinician's request (authority: Content lead)",
    );
    expect(preview.output()).toContain(
      `Apply exactly this plan: pnpm exec tsx scripts/content-release/activate-release.ts --release ${next} --expect-active ${first} ${DECISION_ARGS} --plan ${planIdIn(preview.output())} --apply`,
    );
    expect(await statusOf(dropped.id)).toBe('published');
    expect(await activeRelease()).toBe(first);

    await runActivateRelease(
      [...args, '--plan', planIdIn(preview.output()), '--apply'],
      commandIo().io,
    );
    expect(await statusOf(dropped.id)).toBe('archived');
    expect(await activeRelease()).toBe(next);

    const back = ['--release', first, '--expect-active', next, ...DECISION];
    const rollbackPreview = commandIo();
    await runActivateRelease(back, rollbackPreview.io);
    const rollback = commandIo();
    await runActivateRelease(
      [...back, '--plan', planIdIn(rollbackPreview.output()), '--apply'],
      rollback.io,
    );
    expect(rollback.output()).toContain(
      `Release activation: release=${first} previous=${next} items=2 published=1 archived=0`,
    );
    expect(await statusOf(dropped.id)).toBe('published');
  });

  it('changes nothing when the expected release is not the active one', async () => {
    await arrange('published');
    const first = (
      await bootstrapRelease(disposable.db, {
        record: RELEASE_DECISION,
      })
    ).releaseId;

    await expect(
      runActivateRelease(
        [
          '--release',
          first,
          '--expect-active',
          'none',
          ...DECISION,
          '--plan',
          'c'.repeat(64),
          '--apply',
        ],
        commandIo().io,
      ),
    ).rejects.toThrow(`Release ${first} is active, not none as expected.`);
  });
});

describe('hold-questions', () => {
  it('refuses while no release is active, in a dry run too', async () => {
    const question = await arrange('published');

    for (const apply of [[], ['--apply']]) {
      await expect(
        runHoldQuestions(
          ['--qid', question.slug, ...RECORD, ...apply],
          commandIo().io,
        ),
      ).rejects.toThrow(/No release is active, so a hold would change nothing/);
    }
  });

  it('holds the live revision, takes the question out at once, and lifts the hold', async () => {
    const question = await arrange('published');
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const hold = ['--qid', question.slug, ...RECORD];

    const preview = commandIo();
    await runHoldQuestions(hold, preview.io);
    expect(preview.output()).toContain('Hold (dry-run): holds=1 ');
    expect(await statusOf(question.id)).toBe('published');

    const placed = commandIo();
    await runHoldQuestions([...hold, '--apply'], placed.io);
    expect(placed.output()).toMatch(
      /Hold: holds=1 .* archived=1 excludedWithdrawn=0 excludedHeld=1/,
    );
    expect(await statusOf(question.id)).toBe('archived');
    expect(
      await disposable.db
        .select()
        .from(schema.questionHolds)
        .where(eq(schema.questionHolds.questionId, question.id)),
    ).toEqual([
      expect.objectContaining({
        questionRevisionId: question.revisionId,
        reason: 'Under review',
        authority: 'Clinical lead',
        liftedAt: null,
      }),
    ]);

    const again = commandIo();
    await runHoldQuestions([...hold, '--apply'], again.io);
    expect(again.output()).toContain('Hold: holds=0 ');

    const lifted = commandIo();
    await runHoldQuestions(
      [
        '--qid',
        question.slug,
        '--reason',
        'Reviewed; no error found',
        '--authority',
        'Clinical lead',
        '--lift',
        '--apply',
      ],
      lifted.io,
    );
    expect(lifted.output()).toMatch(/Hold lift: holds=1 .* published=1/);
    expect(await statusOf(question.id)).toBe('published');
    expect(
      await disposable.db
        .select()
        .from(schema.questionHolds)
        .where(eq(schema.questionHolds.questionId, question.id)),
    ).toEqual([
      expect.objectContaining({
        liftedAt: expect.any(Date),
        liftReason: 'Reviewed; no error found',
        liftAuthority: 'Clinical lead',
      }),
    ]);
  });

  // A lift targets the live revision, as a hold does (#1296 review).
  it('lifts only the hold on the live revision', async () => {
    const question = await arrange('published');
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const other = await addCurrentRevision(disposable.db, question.id);
    await disposable.db.insert(schema.questionHolds).values({
      questionId: question.id,
      questionRevisionId: other.revisionId,
      reason: 'A separate review',
      authority: 'Clinical lead',
    });
    await runHoldQuestions(
      ['--qid', question.slug, ...RECORD, '--apply'],
      commandIo().io,
    );

    await runHoldQuestions(
      ['--qid', question.slug, ...RECORD, '--lift', '--apply'],
      commandIo().io,
    );

    const holds = await disposable.db
      .select({
        questionRevisionId: schema.questionHolds.questionRevisionId,
        liftedAt: schema.questionHolds.liftedAt,
      })
      .from(schema.questionHolds)
      .where(eq(schema.questionHolds.questionId, question.id));
    expect(holds).toEqual(
      expect.arrayContaining([
        { questionRevisionId: question.revisionId, liftedAt: expect.any(Date) },
        { questionRevisionId: other.revisionId, liftedAt: null },
      ]),
    );
    expect(holds).toHaveLength(2);
  });

  it('refuses a question the active release does not name', async () => {
    const draft = await arrange('draft');
    await arrange('published');
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });

    await expect(
      runHoldQuestions(
        ['--qid', draft.slug, ...RECORD, '--apply'],
        commandIo().io,
      ),
    ).rejects.toThrow(
      `Not in the active release, so it has no live revision: ${draft.slug}`,
    );
  });

  it('refuses an unknown QID without holding the known one', async () => {
    const question = await arrange('published');
    await bootstrapRelease(disposable.db, {
      record: RELEASE_DECISION,
    });
    const unknown = `it-missing-${randomUUID()}`;

    await expect(
      runHoldQuestions(
        ['--qid', question.slug, '--qid', unknown, ...RECORD, '--apply'],
        commandIo().io,
      ),
    ).rejects.toThrow(`Unknown question QID: ${unknown}`);
    expect(
      await disposable.db
        .select()
        .from(schema.questionHolds)
        .where(inArray(schema.questionHolds.questionId, [question.id])),
    ).toEqual([]);
  });
});

// The scripts run as commands too; their entry points report a failure
// through the exit code.
it.each([
  ['bootstrap-release', ['--all']],
  ['activate-release', ['--all']],
  ['hold-questions', ['--all']],
])('%s exits 1 on an unknown argument', (script, args) => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', `scripts/content-release/${script}.ts`, ...args],
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: disposable.url } },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Unknown argument: --all');
});
