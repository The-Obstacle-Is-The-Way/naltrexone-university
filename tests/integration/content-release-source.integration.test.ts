import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import * as schema from '@/db/schema';
import { runActivateRelease } from '@/scripts/content-release/activate-release';
import {
  bootstrapRelease,
  stageRelease,
} from '@/scripts/content-release/release-activation';
import { changeHolds } from '@/scripts/content-release/release-holds';
import { runStageRelease } from '@/scripts/content-release/stage-release';
import { createContentRepository } from '@/tests/shared/content-repository-test-helpers';
import { createDisposableDatabase } from './disposable-database-test-helpers';
import { RELEASE_DECISION } from './release-decision-test-helpers';
import { source } from './seed-test-helpers';

let disposable: Awaited<ReturnType<typeof createDisposableDatabase>>;
let repo: Awaited<ReturnType<typeof createContentRepository>>;
let base: string;
beforeAll(async () => {
  disposable = await createDisposableDatabase();
}, 60_000);
afterAll(async () => {
  await disposable.drop();
});
beforeEach(async () => {
  await disposable.db
    .update(schema.contentReleasePointer)
    .set({ activeReleaseId: null, activatedAt: null, sourceCommit: null });
  await disposable.db.delete(schema.contentReleaseActivations);
  await disposable.db.delete(schema.contentReleases);
  await disposable.db.delete(schema.questions);
  base = (await bootstrapRelease(disposable.db, { record: RELEASE_DECISION }))
    .releaseId;
  repo = await createContentRepository();
});
afterEach(async () => {
  await repo.dispose();
});
const io = (lines: string[] = []) => ({
  env: { DATABASE_URL: disposable.url },
  log: (line: string) => lines.push(line),
});
// The first stage after the bootstrap names its own commit as the verified
// baseline unless a test passes one, or null for none (BUG-351).
async function stage(commit: string, apply = true, baseline?: string | null) {
  const verified =
    baseline === undefined
      ? (await watermark()) === null
        ? commit
        : null
      : baseline;
  const lines: string[] = [];
  await runStageRelease(
    [
      '--repo',
      repo.directory,
      '--commit',
      commit,
      ...(verified ? ['--baseline', verified] : []),
      ...(apply ? ['--apply'] : []),
    ],
    io(lines),
  );
  return lines.join('\n').match(/release=([0-9a-f-]+)/)?.[1] ?? '';
}
async function activate(
  releaseId: string,
  active: string,
  repository: string | null = repo.directory,
) {
  const args = [
    '--release',
    releaseId,
    '--expect-active',
    active,
    '--reason',
    'Synthetic verification',
    '--authority',
    'Fixture',
    ...(repository === null ? [] : ['--repo', repository]),
  ];
  const lines: string[] = [];
  await runActivateRelease(args, io(lines));
  const plan = lines.join('\n').match(/Plan: ([0-9a-f]{64})/)?.[1] ?? '';
  await runActivateRelease([...args, '--plan', plan, '--apply'], io());
}
async function watermark() {
  const rows = await disposable.db.execute<{ source_commit: string | null }>(
    sql`SELECT source_commit FROM content_release_pointer`,
  );
  return rows[0]?.source_commit;
}

describe('BUG-351: commit-bound release commands', () => {
  it('starts the first release after the bootstrap only from the verified baseline or later', async () => {
    const older = await repo.commit([source('synthetic-source')]);
    const verified = await repo.commit([
      source('synthetic-source', { stem: 'Verified synthetic task.' }),
    ]);
    const later = await repo.commit([
      source('synthetic-source', { stem: 'Later synthetic task.' }),
    ]);

    await expect(stage(later, true, null)).rejects.toThrow(/--baseline/);
    await expect(stage(older, true, verified)).rejects.toThrow(
      /precedes the verified baseline/,
    );
    expect(await watermark()).toBeNull();

    await stage(later, true, verified);
    expect(await watermark()).toBe(later);
    await expect(stage(later, true, verified)).rejects.toThrow(
      /applies only to the first release/,
    );
  });
  it('previews without a watermark write, then binds source identity and the activation plan', async () => {
    const first = await repo.commit([source('synthetic-source')]);
    await stage(first, false);
    expect(await watermark()).toBeNull();
    const release = await stage(first);
    expect(await watermark()).toBe(first);
    expect(await stage(first)).toBe(release);
    const second = await repo.commit([source('synthetic-source')]);
    const newer = await stage(second);
    expect(newer).not.toBe(release);
    const rows = await disposable.db.select().from(schema.contentReleases);
    expect(rows.find((row) => row.id === newer)?.manifest).toMatchObject({
      corpusCommit: second,
    });
    await expect(activate(release, base)).rejects.toThrow(/watermark/);
    await activate(newer, base);
    expect(await watermark()).toBe(second);
  });
  it('refuses stale staging and leaves the pointer unchanged on a failed stage', async () => {
    const first = await repo.commit([source('synthetic-source')]);
    const second = await repo.commit([
      source('synthetic-source', { stem: 'Changed synthetic task.' }),
    ]);
    await stage(second);
    await expect(stage(first)).rejects.toThrow(/watermark/);
    const incomplete = await repo.commit([
      source('synthetic-source'),
      source('synthetic-source'),
    ]);
    await expect(stage(incomplete)).rejects.toThrow();
    expect(await watermark()).toBe(second);
  });
  it('refuses a legacy unactivated release but rolls back a previously activated legacy release without lowering the watermark', async () => {
    const legacy = await stageRelease(disposable.db, {
      parentReleaseId: base,
      items: [],
    });
    await expect(activate(legacy, base)).rejects.toThrow(/source commit/);
    const commit = await repo.commit([source('synthetic-source')]);
    const release = await stage(commit);
    await activate(release, base);
    await activate(base, release, null);
    expect(await watermark()).toBe(commit);
    expect(
      (await disposable.db.select().from(schema.contentReleases)).find(
        (row) => row.id === base,
      )?.manifest,
    ).toMatchObject({ format: 'app-release-manifest-v4' });
  });
  it('allows a hold to reapply the active release after newer source is staged', async () => {
    const first = await repo.commit([source('synthetic-source')]);
    const release = await stage(first);
    await activate(release, base);
    const second = await repo.commit([source('synthetic-source')]);
    await stage(second);
    await changeHolds(disposable.db, {
      qids: ['synthetic-source'],
      lift: false,
      record: RELEASE_DECISION,
    });
    expect(await watermark()).toBe(second);
    expect(
      (await disposable.db.select().from(schema.questions))[0]?.status,
    ).toBe('archived');
  });
  it('binds different dispositions of one commit to distinct manifests and activation plans', async () => {
    const commit = await repo.commit([
      source('synthetic-kept'),
      source('synthetic-retired'),
    ]);
    const live = await stage(commit);
    await activate(live, base);
    const previews: { release: string; plan: string }[] = [];
    for (const disposition of ['--draft', '--archive']) {
      const lines: string[] = [];
      await runStageRelease(
        [
          '--repo',
          repo.directory,
          '--commit',
          commit,
          disposition,
          'synthetic-retired',
          '--apply',
        ],
        io(lines),
      );
      const release = lines.join('\n').match(/release=([0-9a-f-]+)/)?.[1] ?? '';
      await runActivateRelease(
        [
          '--repo',
          repo.directory,
          '--release',
          release,
          '--expect-active',
          live,
          '--reason',
          'Synthetic retirement',
          '--authority',
          'Fixture',
        ],
        io(lines),
      );
      previews.push({
        release,
        plan: lines.join('\n').match(/Plan: ([0-9a-f]{64})/)?.[1] ?? '',
      });
    }
    const [draft, archive] = previews;
    if (!draft || !archive) throw new Error('Missing fixture plans');
    expect(draft.release).not.toBe(archive.release);
    expect(draft.plan).not.toBe(archive.plan);
    await expect(
      runActivateRelease(
        [
          '--repo',
          repo.directory,
          '--release',
          archive.release,
          '--expect-active',
          live,
          '--reason',
          'Synthetic retirement',
          '--authority',
          'Fixture',
          '--plan',
          draft.plan,
          '--apply',
        ],
        io(),
      ),
    ).rejects.toThrow(/as reviewed/);
    expect(
      await disposable.db.select().from(schema.questionWithdrawals),
    ).toHaveLength(0);
    expect(await watermark()).toBe(commit);
    await activate(archive.release, live);
    expect(
      await disposable.db.select().from(schema.questionWithdrawals),
    ).toHaveLength(1);
  });
  it('requires a repository for first activation and refuses a source removed from main after staging', async () => {
    const root = await repo.commit([source('synthetic-source')]);
    const commit = await repo.commit([source('synthetic-source')]);
    const release = await stage(commit);
    await expect(activate(release, base, null)).rejects.toThrow(/--repo/);
    await repo.git('reset', '--hard', root);
    await expect(activate(release, base)).rejects.toThrow(/first-parent/);
    expect(await watermark()).toBe(commit);
    expect(
      (await disposable.db.select().from(schema.contentReleasePointer))[0]
        ?.activeReleaseId,
    ).toBe(base);
  });
  it('re-reads the watermark after waiting for the release-pointer lock', async () => {
    const first = await repo.commit([source('synthetic-source')]);
    const second = await repo.commit([source('synthetic-source')]);
    const holder = postgres(disposable.url, { max: 1 });
    const monitor = postgres(disposable.url, { max: 1 });
    let waiting: Promise<unknown> | undefined;
    try {
      await holder`BEGIN`;
      await holder`SELECT id FROM content_release_pointer FOR UPDATE`;
      const [backend] = await holder`SELECT pg_backend_pid() AS pid`;
      waiting = stage(first).then(
        () => 'unexpected success',
        (error: unknown) => error,
      );
      await expect
        .poll(async () => {
          const [row] =
            await monitor`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${backend?.pid}=ANY(pg_blocking_pids(pid))) AS waiting`;
          return row?.waiting;
        })
        .toBe(true);
      await holder`UPDATE content_release_pointer SET source_commit=${second}`;
      await holder`COMMIT`;
      expect(await waiting).toMatchObject({
        message: expect.stringMatching(/watermark/),
      });
      expect(await watermark()).toBe(second);
    } finally {
      await holder`ROLLBACK`;
      await Promise.allSettled([waiting]);
      await holder.end({ timeout: 5 });
      await monitor.end({ timeout: 5 });
    }
  });
});
