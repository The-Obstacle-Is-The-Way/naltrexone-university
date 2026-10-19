import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import {
  convertDraftQuestionToMdx,
  parseDraftQuestionBlock,
  splitDraftQuestionsFile,
} from '../draft-question-import';
import type { SeedSourceFile } from '../seed/file-reader';
import { CORPUS_COMMIT_PATTERN } from './release-manifest';

const exec = promisify(execFile);
export type ContentSource = { repository: string; commit: string };
export type ReleaseDispositions = {
  draft?: readonly string[];
  archive?: readonly string[];
};
const GIT_OUTPUT_LIMIT = 16 * 1024 * 1024;

async function git(repository: string, args: string[]): Promise<string> {
  return (
    await exec('git', ['-C', repository, ...args], {
      maxBuffer: GIT_OUTPUT_LIMIT,
    })
  ).stdout;
}

export async function assertForwardMainCommit(
  repository: string,
  commit: string,
  watermark: string | null,
): Promise<void> {
  if (!CORPUS_COMMIT_PATTERN.test(commit))
    throw new Error('Source needs a full lowercase commit ID');
  // A side-branch ancestor is not an admitted publication on main. Read this
  // chain again under the database pointer lock, not just when archiving.
  const chain = (
    await git(repository, ['rev-list', '--first-parent', 'refs/heads/main'])
  )
    .trim()
    .split('\n');
  const candidate = chain.indexOf(commit);
  if (candidate < 0)
    throw new Error('Source commit is not on main first-parent history');
  if (watermark !== null) {
    const admitted = chain.indexOf(watermark);
    if (admitted < 0 || candidate > admitted)
      throw new Error(
        'Source commit does not advance the watermark on main first-parent history',
      );
  }
}

// Only the archive is converted. Neither the checkout nor the app's mutable
// draft/import folders supplies bytes. No content-repository code is executed.
export async function readContentCommit(
  source: ContentSource,
  dispositions: ReleaseDispositions = {},
): Promise<SeedSourceFile[]> {
  const draft = new Set(dispositions.draft ?? []);
  const archive = new Set(dispositions.archive ?? []);
  const named = [
    ...(dispositions.draft ?? []),
    ...(dispositions.archive ?? []),
  ];
  if (new Set(named).size !== named.length)
    throw new Error('Each source question may have only one disposition');
  const found = new Set<string>();
  await assertForwardMainCommit(source.repository, source.commit, null);
  const entries = (
    await git(source.repository, ['ls-tree', '-r', '-z', source.commit])
  )
    .split('\0')
    .filter(Boolean);
  const paths: string[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf('\t');
    const metadata = entry.slice(0, separator);
    const path = entry.slice(separator + 1);
    if (!['recall.md', 'vignettes.md'].includes(basename(path))) continue;
    if (!/^100(?:644|755) blob /.test(metadata))
      throw new Error('Content source files must be regular files');
    paths.push(path);
  }
  if (paths.length === 0)
    throw new Error(
      'Source commit contains no recall.md or vignettes.md files',
    );
  const scratch = await mkdtemp(join(tmpdir(), 'content-release-archive-'));
  try {
    const archivePath = join(scratch, 'source.tar');
    await git(source.repository, [
      'archive',
      '--format=tar',
      `--output=${archivePath}`,
      source.commit,
      '--',
      ...paths,
    ]);
    await exec('tar', ['-xf', archivePath, '-C', scratch]);
    const files: SeedSourceFile[] = [];
    for (const path of paths.sort()) {
      const blocks = splitDraftQuestionsFile(
        await readFile(join(scratch, path), 'utf8'),
      );
      for (const [index, block] of blocks.entries()) {
        const parsed = parseDraftQuestionBlock(block);
        const qid = parsed.frontmatter.qid;
        found.add(qid);
        files.push({
          absolutePath: join(scratch, path, `${index}.mdx`),
          raw: convertDraftQuestionToMdx({
            draft: parsed,
            status: archive.has(qid)
              ? 'archived'
              : draft.has(qid)
                ? 'draft'
                : 'published',
          }),
        });
      }
    }
    if (named.some((qid) => !found.has(qid)))
      throw new Error('A named disposition is absent from the source commit');
    return files;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
