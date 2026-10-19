import { symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { source } from '@/tests/integration/seed-test-helpers';
import { createContentRepository } from '@/tests/shared/content-repository-test-helpers';
import { parseSeedQuestionFile } from '../seed/question-parser';
import { assertForwardMainCommit, readContentCommit } from './content-source';

let repo: Awaited<ReturnType<typeof createContentRepository>>;
beforeEach(async () => {
  repo = await createContentRepository();
});
afterEach(async () => {
  await repo.dispose();
});

describe('immutable content source', () => {
  it('archives the selected main commit and ignores dirty working files', async () => {
    const commit = await repo.commit([source('synthetic-source')]);
    await writeFile(join(repo.directory, 'recall.md'), 'invalid dirty content');
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
    await expect(
      assertForwardMainCommit(repo.directory, first, null),
    ).resolves.toBeUndefined();
    await expect(
      assertForwardMainCommit(repo.directory, first, first),
    ).resolves.toBeUndefined();
    await expect(
      assertForwardMainCommit(repo.directory, second, first),
    ).resolves.toBeUndefined();
    await expect(
      assertForwardMainCommit(repo.directory, first, second),
    ).rejects.toThrow(/watermark/);
  });
  it('refuses a merged side-branch commit and a rewritten main watermark', async () => {
    const root = await repo.commit([source('synthetic-source')]);
    await repo.git('checkout', '-b', 'side');
    const side = await repo.commit([source('synthetic-source')]);
    await repo.git('checkout', 'main');
    await repo.commit([source('synthetic-source')]);
    await repo.git('merge', '--no-ff', 'side', '-m', 'Merge fixture');
    const main = await repo.git('rev-parse', 'HEAD');
    await expect(
      assertForwardMainCommit(repo.directory, side, root),
    ).rejects.toThrow(/first-parent/);
    await repo.git('reset', '--hard', root);
    await expect(
      assertForwardMainCommit(repo.directory, root, main),
    ).rejects.toThrow(/watermark/);
  });
  it('refuses symlinked authoring files in the committed tree', async () => {
    await repo.commit([source('synthetic-source')]);
    await unlink(join(repo.directory, 'recall.md'));
    await writeFile(join(repo.directory, 'other.md'), 'Synthetic target');
    await symlink('other.md', join(repo.directory, 'recall.md'));
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
