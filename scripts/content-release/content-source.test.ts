import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { source } from '@/tests/integration/seed-test-helpers';
import {
  createContentRepository,
  FIXTURE_QUESTION_FILE,
} from '@/tests/shared/content-repository-test-helpers';
import { parseSeedQuestionFile } from '../seed/question-parser';
import {
  assertAdmissibleCommit,
  readContentCommit,
  readMainFirstParents,
} from './content-source';

let repo: Awaited<ReturnType<typeof createContentRepository>>;
beforeEach(async () => {
  repo = await createContentRepository();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await repo.dispose();
});

describe('immutable content source', () => {
  it('archives the selected main commit and ignores dirty working files', async () => {
    const commit = await repo.commit([source('synthetic-source')]);
    await writeFile(
      join(repo.directory, FIXTURE_QUESTION_FILE),
      'invalid dirty content',
    );
    const files = await readContentCommit({
      repository: repo.directory,
      commit,
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.raw).toContain('Original clinical task.');
  });
  it('preserves named publication dispositions and refuses names absent from the commit', async () => {
    const commit = await repo.commit([
      source('synthetic-draft'),
      source('synthetic-archive'),
    ]);
    const files = await readContentCommit(
      { repository: repo.directory, commit },
      { draft: ['synthetic-draft'], archive: ['synthetic-archive'] },
    );
    expect(
      files
        .map(
          (file) => parseSeedQuestionFile(file.raw, file.absolutePath).status,
        )
        .sort(),
    ).toEqual(['archived', 'draft']);
    await expect(
      readContentCommit(
        { repository: repo.directory, commit },
        { draft: ['synthetic-missing'] },
      ),
    ).rejects.toThrow(/absent/);
  });
  it('admits equal and forward first-parent commits, but rejects an ancestor', async () => {
    const first = await repo.commit([source('synthetic-source')]);
    const second = await repo.commit([source('synthetic-source')]);
    const chain = await readMainFirstParents(repo.directory);
    expect(() => assertAdmissibleCommit(chain, first, first)).not.toThrow();
    expect(() => assertAdmissibleCommit(chain, second, first)).not.toThrow();
    expect(() => assertAdmissibleCommit(chain, first, second)).toThrow(
      /watermark/,
    );
  });
  it('refuses a merged side-branch commit and a rewritten main watermark', async () => {
    const root = await repo.commit([source('synthetic-source')]);
    await repo.git('checkout', '-b', 'side');
    const side = await repo.commit([source('synthetic-source')]);
    await repo.git('checkout', 'main');
    await repo.commit([source('synthetic-source')]);
    await repo.git('merge', '--no-ff', 'side', '-m', 'Merge fixture');
    const main = await repo.git('rev-parse', 'HEAD');
    // A side-branch commit is not on main's first-parent history.
    const merged = await readMainFirstParents(repo.directory);
    expect(() => assertAdmissibleCommit(merged, side, root)).toThrow(
      /first-parent/,
    );
    await repo.git('reset', '--hard', root);
    const rewritten = await readMainFirstParents(repo.directory);
    expect(() => assertAdmissibleCommit(rewritten, root, main)).toThrow(
      /watermark/,
    );
  });
  // The first release after the bootstrap has no watermark. It must start
  // from the commit the owner verified against live content, or later, so an
  // older snapshot cannot become the baseline (BUG-351).
  describe('the first release after the bootstrap', () => {
    it('needs the verified baseline', async () => {
      const commit = await repo.commit([source('synthetic-source')]);
      const chain = await readMainFirstParents(repo.directory);
      expect(() => assertAdmissibleCommit(chain, commit, null)).toThrow(
        /--baseline/,
      );
    });
    it('admits the baseline itself and a later main commit', async () => {
      const verified = await repo.commit([source('synthetic-source')]);
      const later = await repo.commit([source('synthetic-source')]);
      const chain = await readMainFirstParents(repo.directory);
      expect(() =>
        assertAdmissibleCommit(chain, verified, null, verified),
      ).not.toThrow();
      expect(() =>
        assertAdmissibleCommit(chain, later, null, verified),
      ).not.toThrow();
    });
    it('refuses a snapshot older than the verified baseline', async () => {
      const older = await repo.commit([source('synthetic-source')]);
      const verified = await repo.commit([source('synthetic-source')]);
      const chain = await readMainFirstParents(repo.directory);
      expect(() =>
        assertAdmissibleCommit(chain, older, null, verified),
      ).toThrow(/precedes the verified baseline/);
    });
    it('refuses a baseline that is not on main', async () => {
      const commit = await repo.commit([source('synthetic-source')]);
      await repo.git('checkout', '-b', 'side');
      const side = await repo.commit([source('synthetic-source')]);
      await repo.git('checkout', 'main');
      const chain = await readMainFirstParents(repo.directory);
      expect(() => assertAdmissibleCommit(chain, commit, null, side)).toThrow(
        /baseline is not on main/,
      );
    });
    it('refuses a baseline once a watermark is recorded', async () => {
      const first = await repo.commit([source('synthetic-source')]);
      const second = await repo.commit([source('synthetic-source')]);
      const chain = await readMainFirstParents(repo.directory);
      expect(() => assertAdmissibleCommit(chain, second, first, first)).toThrow(
        /applies only to the first release/,
      );
    });
  });
  // A pre-push hook run from a linked worktree exports GIT_DIR. Inherited,
  // it points the fixture's and the reader's git at the outer repository,
  // and a `git init` there marks it bare (BUG-351 review).
  it("leaves the repository a hook's GIT_DIR names untouched", async () => {
    const exec = promisify(execFile);
    const root = await mkdtemp(join(tmpdir(), 'content-source-outer-'));
    try {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const name of Object.keys(env))
        if (name.startsWith('GIT_')) delete env[name];
      Object.assign(env, {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      });
      const outer = join(root, 'outer');
      const run = (cwd: string, args: string[]) =>
        exec(
          'git',
          [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.test',
            ...args,
          ],
          { cwd, env },
        );
      await exec('git', ['init', '--quiet', '-b', 'main', outer], { env });
      await run(outer, ['commit', '--allow-empty', '--quiet', '-m', 'base']);
      await run(outer, ['worktree', 'add', '--quiet', join(root, 'linked')]);
      const outerHead = (await run(outer, ['rev-parse', 'HEAD'])).stdout;
      vi.stubEnv('GIT_DIR', join(outer, '.git', 'worktrees', 'linked'));

      const fixture = await createContentRepository();
      try {
        const commit = await fixture.commit([source('synthetic-source')]);
        await expect(
          readContentCommit({ repository: fixture.directory, commit }),
        ).resolves.toHaveLength(1);
      } finally {
        await fixture.dispose();
      }

      vi.unstubAllEnvs();
      expect(
        (await run(outer, ['config', '--get', 'core.bare'])).stdout.trim(),
      ).toBe('false');
      expect((await run(outer, ['rev-parse', 'HEAD'])).stdout).toBe(outerHead);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  // The content repository's authoring contract lives under questions/
  // (its README links questions/SCHEMA.md). A copy elsewhere, such as a
  // backup or an artifact, is not a question source (BUG-351 review).
  it('reads question files only under questions/', async () => {
    await repo.commit([source('kept-source')]);
    const commit = await repo.commit([source('stray-source')], {
      path: 'artifacts/backup/recall.md',
    });

    const files = await readContentCommit({
      repository: repo.directory,
      commit,
    });

    expect(files.map(({ raw }) => parseSeedQuestionFile(raw).slug)).toEqual([
      'kept-source',
    ]);
  });
  it('refuses a commit with no question files under questions/', async () => {
    const commit = await repo.commit([source('stray-source')], {
      path: 'artifacts/recall.md',
    });

    await expect(
      readContentCommit({ repository: repo.directory, commit }),
    ).rejects.toThrow(/no recall\.md or vignettes\.md files under questions\//);
  });
  it('refuses one question named for two dispositions', async () => {
    const commit = await repo.commit([source('named-source')]);

    await expect(
      readContentCommit(
        { repository: repo.directory, commit },
        { draft: ['named-source'], archive: ['named-source'] },
      ),
    ).rejects.toThrow(/only one disposition/);
  });
  it('refuses a source that is not a full commit ID', async () => {
    await repo.commit([source('named-source')]);
    const chain = await readMainFirstParents(repo.directory);

    expect(() => assertAdmissibleCommit(chain, 'main', null)).toThrow(
      /full lowercase commit ID/,
    );
  });
  it('refuses a question ID that appears in two source files', async () => {
    await repo.commit([source('twice-source')]);
    const commit = await repo.commit([source('twice-source')], {
      path: 'questions/other-group/recall.md',
    });

    await expect(
      readContentCommit({ repository: repo.directory, commit }),
    ).rejects.toThrow(/more than once/);
  });
  it('refuses symlinked authoring files in the committed tree', async () => {
    await repo.commit([source('synthetic-source')]);
    await unlink(join(repo.directory, FIXTURE_QUESTION_FILE));
    await writeFile(
      join(repo.directory, 'questions/fixture/other.md'),
      'Synthetic target',
    );
    await symlink('other.md', join(repo.directory, FIXTURE_QUESTION_FILE));
    await repo.git('add', '.');
    await repo.git('commit', '-m', 'Record synthetic symlink');
    const commit = await repo.git('rev-parse', 'HEAD');
    await expect(
      readContentCommit({ repository: repo.directory, commit }),
    ).rejects.toThrow(/regular files/);
  });
  it('requires a full commit ID and refuses an off-main source', async () => {
    await repo.commit([source('synthetic-source')]);
    await expect(
      readContentCommit({ repository: repo.directory, commit: 'main' }),
    ).rejects.toThrow(/full/);
    await repo.git('checkout', '-b', 'draft');
    const commit = await repo.commit([source('synthetic-source')]);
    await expect(
      readContentCommit({ repository: repo.directory, commit }),
    ).rejects.toThrow(/first-parent/);
  });
});
