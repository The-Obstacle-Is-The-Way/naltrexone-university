import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import matter from '@11ty/gray-matter';
import postgres from 'postgres';
import { gitEnvironment } from '@/scripts/content-release/content-source';
import { runStageRelease } from '@/scripts/content-release/stage-release';
import type { SeedSourceFile } from '@/scripts/seed/file-reader';

const exec = promisify(execFile);

// A real repository of synthetic authoring files. Never opens the corpus repository.
export async function createContentRepository() {
  const directory = await mkdtemp(join(tmpdir(), 'content-source-fixture-'));
  // Hermetic: no hook-exported repository variables and no user or system
  // configuration reach the fixture's git (BUG-351 review).
  const env = {
    ...(await gitEnvironment()),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = async (...args: string[]) =>
    (
      await exec(
        'git',
        [
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
        ],
        { env },
      )
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

/** The recorded source watermark, read as the stage command will see it. */
export async function readSourceWatermark(
  databaseUrl: string,
): Promise<string | null> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [row] = await sql<{ source_commit: string | null }[]>`
      SELECT source_commit FROM content_release_pointer`;
    return row?.source_commit ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Existing command scenarios now supply their synthetic MDX through a real
// authoring repository. The production command has no arbitrary-file seam.
// Their first stage after the bootstrap names its own commit as the verified
// baseline (BUG-351).
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
  const databaseUrl = io.env.DATABASE_URL;
  const firstRelease =
    databaseUrl !== undefined &&
    (await readSourceWatermark(databaseUrl)) === null;
  await runStageRelease(
    [
      '--repo',
      repo.directory,
      '--commit',
      commit,
      ...(firstRelease ? ['--baseline', commit] : []),
      ...dispositions,
      ...argv,
    ],
    { env: io.env, log: io.log },
  );
}
