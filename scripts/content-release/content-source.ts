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

let localGitVariables: Promise<readonly string[]> | undefined;

/**
 * The environment for git commands on a named repository. Git prefers
 * GIT_DIR and its siblings over `-C`, and a hook run from a linked worktree
 * exports them; inherited, they point a command at the wrong repository
 * (BUG-351 review). Git lists its own repository-local variables.
 */
export async function gitEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  localGitVariables ??= exec('git', ['rev-parse', '--local-env-vars']).then(
    ({ stdout }) => stdout.split('\n').filter(Boolean),
  );
  const names = await localGitVariables;
  const scrubbed: NodeJS.ProcessEnv = { ...env };
  for (const name of names) delete scrubbed[name];
  return scrubbed;
}

async function git(repository: string, args: string[]): Promise<string> {
  return (
    await exec('git', ['-C', repository, ...args], {
      env: await gitEnvironment(),
      maxBuffer: GIT_OUTPUT_LIMIT,
    })
  ).stdout;
}

/** main's first-parent history, newest first. Read it before database work. */
export async function readMainFirstParents(
  repository: string,
): Promise<readonly string[]> {
  return (
    await git(repository, ['rev-list', '--first-parent', 'refs/heads/main'])
  )
    .trim()
    .split('\n');
}

/**
 * Admits a source commit for a release: a full ID on main's first-parent
 * history, at or after the watermark. The first release after the bootstrap
 * has no watermark yet. It names the commit the owner verified against live
 * content, and the source must be that commit or a later one, so an older
 * snapshot cannot become the starting point (BUG-351).
 */
export function assertAdmissibleCommit(
  chain: readonly string[],
  commit: string,
  watermark: string | null,
  baseline?: string,
): void {
  if (!CORPUS_COMMIT_PATTERN.test(commit))
    throw new Error('Source needs a full lowercase commit ID');
  const candidate = chain.indexOf(commit);
  if (candidate < 0)
    throw new Error('Source commit is not on main first-parent history');
  if (watermark === null) {
    if (baseline === undefined)
      throw new Error(
        'The first release after the bootstrap needs --baseline: the commit verified against live content',
      );
    const verified = chain.indexOf(baseline);
    if (verified < 0)
      throw new Error('The baseline is not on main first-parent history');
    if (candidate > verified)
      throw new Error(
        'Source commit precedes the verified baseline on main first-parent history',
      );
    return;
  }
  if (baseline !== undefined)
    throw new Error(
      'A source watermark is recorded; --baseline applies only to the first release after the bootstrap',
    );
  const admitted = chain.indexOf(watermark);
  if (admitted < 0 || candidate > admitted)
    throw new Error(
      'Source commit does not advance the watermark on main first-parent history',
    );
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
  if (!CORPUS_COMMIT_PATTERN.test(source.commit))
    throw new Error('Source needs a full lowercase commit ID');
  if (!(await readMainFirstParents(source.repository)).includes(source.commit))
    throw new Error('Source commit is not on main first-parent history');
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
