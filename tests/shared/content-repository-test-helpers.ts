import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import matter from '@11ty/gray-matter';
import { runStageRelease } from '@/scripts/content-release/stage-release';
import type { SeedSourceFile } from '@/scripts/seed/file-reader';

const exec = promisify(execFile);

// A real repository of synthetic authoring files. Never opens the corpus repository.
export async function createContentRepository() {
  const directory = await mkdtemp(join(tmpdir(), 'content-source-fixture-'));
  const git = async (...args: string[]) =>
    (
      await exec('git', [
        '-C',
        directory,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ])
    ).stdout.trim();
  await git('init', '-b', 'main');
  let sequence = 0;
  return {
    directory,
    git,
    async commit(files: readonly SeedSourceFile[]) {
      const blocks = files.map(({ raw }) => {
        const { data, content } = matter(raw);
        return [
          '---',
          `qid: ${data.slug}`,
          'type: recall',
          `difficulty: ${data.difficulty}`,
          'substances: [alcohol]',
          'topics: [general]',
          'treatments: []',
          'diagnoses: []',
          'source: synthetic-fixture',
          `choices: ${JSON.stringify(data.choices)}`,
          '---',
          content.replace('## Stem', '## Question'),
          '---',
        ].join('\n');
      });
      await writeFile(join(directory, 'recall.md'), blocks.join('\n\n'));
      await git('add', 'recall.md');
      await git(
        'commit',
        '--allow-empty',
        '-m',
        `Record synthetic content ${++sequence}`,
      );
      return git('rev-parse', 'HEAD');
    },
    async dispose() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

// Existing command scenarios now supply their synthetic MDX through a real
// authoring repository. The production command has no arbitrary-file seam.
export async function runFixtureStage(
  repo: Awaited<ReturnType<typeof createContentRepository>>,
  argv: string[],
  io: {
    env: Readonly<Record<string, string | undefined>>;
    log: (line: string) => void;
    readFiles: () => Promise<SeedSourceFile[]>;
  },
): Promise<void> {
  const files = await io.readFiles();
  const commit = await repo.commit(files);
  const dispositions = files.flatMap(({ raw }) => {
    const { data } = matter(raw);
    return data.status === 'draft'
      ? ['--draft', data.slug]
      : data.status === 'archived'
        ? ['--archive', data.slug]
        : [];
  });
  await runStageRelease(
    ['--repo', repo.directory, '--commit', commit, ...dispositions, ...argv],
    { env: io.env, log: io.log },
  );
}
