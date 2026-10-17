import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FAKE_DOCKER,
  FAKE_SLEEP,
  FAKE_TIMEOUT,
  HOST_HAS_TIMEOUT,
} from '@/tests/shared/fake-docker-cli';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const DOCKER_HUB = 'docker.io/edoburu/pgbouncer';
const REPOSITORIES = [DOCKER_HUB, 'mirror.gcr.io/edoburu/pgbouncer'];
const roots: string[] = [];
afterAll(() =>
  Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))),
);
async function run({
  refuse = '',
  hang = '',
  digest = DIGEST,
  repositories = REPOSITORIES,
  sourced = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pull-image-'));
  roots.push(root);
  const commands: [string, string][] = [
    ['docker', FAKE_DOCKER],
    ['sleep', FAKE_SLEEP],
  ];
  if (!HOST_HAS_TIMEOUT) commands.push(['timeout', FAKE_TIMEOUT]);
  for (const [name, source] of commands) {
    await writeFile(join(root, name), source);
    await chmod(join(root, name), 0o755);
  }
  const log = join(root, 'calls');
  const githubEnv = join(root, 'github-env');
  await writeFile(log, '');
  await writeFile(githubEnv, 'EXISTING=kept\n');
  const args = ['PgBouncer', digest, ...repositories];
  const started = Date.now();
  const result = spawnSync(
    'bash',
    sourced
      ? [
          '-c',
          `
    before=$(set +o)
    before_flags=$-
    source scripts/ci/pull-image.sh
    test "$before" = "$(set +o)" && test "$before_flags" = "$-" || exit 98
    PULLED_IMAGE=stale
    pull_image "$@"
    result=$?
    printf 'RESULT=%s\\n' "$PULLED_IMAGE"
    exit "$result"
  `,
          'test',
          ...args,
        ]
      : [
          'scripts/ci/pull-image.sh',
          '--env',
          'PGBOUNCER_IMAGE_REPOSITORY',
          ...args,
        ],
    {
      encoding: 'utf8',
      timeout: 8_000,
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ''}`,
        IMAGE_PULL_TIMEOUT_SECONDS: '1',
        GITHUB_ENV: githubEnv,
        FAKE_LOG: log,
        FAKE_DOCKER_REFUSE: refuse,
        FAKE_DOCKER_HANG: hang,
      },
    },
  );
  return {
    ...result,
    elapsed: Date.now() - started,
    envFile: await readFile(githubEnv, 'utf8'),
    calls: (await readFile(log, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\u001f').slice(0, -1)),
  };
}

describe('pull-image.sh', () => {
  it('uses the first serving registry and appends its repository to GITHUB_ENV', async () => {
    const result = await run();
    expect(result.status).toBe(0);
    expect(result.calls).toEqual([
      ['docker', 'pull', '--quiet', `${REPOSITORIES[0]}@${DIGEST}`],
    ]);
    expect(result.stdout).toContain(
      '::notice::PgBouncer image pulled from docker.io',
    );
    expect(result.envFile).toBe(
      `EXISTING=kept\nPGBOUNCER_IMAGE_REPOSITORY=${REPOSITORIES[0]}\n`,
    );
  });
  it.each(['refuse', 'hang'] as const)(
    'retries a Docker Hub %s then uses the mirror',
    async (failure) => {
      const result = await run({ [failure]: 'docker.io' });
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        ['docker', 'pull', '--quiet', `${REPOSITORIES[0]}@${DIGEST}`],
        ['sleep', '10'],
        ['docker', 'pull', '--quiet', `${REPOSITORIES[0]}@${DIGEST}`],
        ['docker', 'pull', '--quiet', `${REPOSITORIES[1]}@${DIGEST}`],
      ]);
      expect(result.stdout).toContain(
        '::warning::Could not pull PgBouncer from docker.io; trying the next registry.',
      );
      expect(result.stdout).toContain(
        '::notice::PgBouncer image pulled from mirror.gcr.io',
      );
      expect(result.envFile).toContain(
        `PGBOUNCER_IMAGE_REPOSITORY=${REPOSITORIES[1]}\n`,
      );
      expect(result.elapsed).toBeLessThan(8_000);
    },
  );
  it('fails with the image and digest and writes no environment when all refuse', async () => {
    const result = await run({ refuse: 'docker.io mirror.gcr.io' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `::error::No registry served pgbouncer@${DIGEST}.`,
    );
    expect(result.calls.filter((call) => call[1] === 'pull')).toHaveLength(4);
    expect(result.envFile).toBe('EXISTING=kept\n');
  });
  it.each(['tag:latest', 'sha256:abc', ''])(
    'refuses malformed digest %s before Docker',
    async (digest) => {
      const result = await run({ digest });
      expect(result.status).toBe(2);
      expect(result.calls).toEqual([]);
      expect(result.envFile).toBe('EXISTING=kept\n');
    },
  );
  it('refuses one repository before Docker', async () => {
    const result = await run({ repositories: [DOCKER_HUB] });
    expect(result.status).toBe(2);
    expect(result.calls).toEqual([]);
  });
  it('sets PULLED_IMAGE when sourced without changing shell options or hiding notices', async () => {
    const result = await run({ sourced: true });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`RESULT=${REPOSITORIES[0]}@${DIGEST}`);
    expect(result.stdout).toContain(
      '::notice::PgBouncer image pulled from docker.io',
    );
    expect(result.envFile).toBe('EXISTING=kept\n');
  });
  it('clears a stale result on failure when sourced', async () => {
    const result = await run({
      sourced: true,
      refuse: 'docker.io mirror.gcr.io',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('RESULT=\n');
  });
});
