import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const START_SCRIPT = 'scripts/ci/start-postgres.sh';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const DOCKER_HUB = `docker.io/library/postgres@${DIGEST}`;
const ECR_PUBLIC = `public.ecr.aws/docker/library/postgres@${DIGEST}`;
const GOOGLE_MIRROR = `mirror.gcr.io/library/postgres@${DIGEST}`;

// Stands in for the runner's docker CLI. It logs every call, refuses pulls
// from the registries listed in FAKE_DOCKER_REFUSE the way Docker Hub did on
// 2026-10-09, and reports health statuses in the order FAKE_DOCKER_HEALTH
// lists them, repeating the last.
const FAKE_DOCKER = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
eval "last=\\\${$#}"
case "$1" in
  pull)
    for refused in $FAKE_DOCKER_REFUSE; do
      case "$last" in
        "$refused"/*)
          echo 'toomanyrequests: You have reached your unauthenticated pull rate limit.' >&2
          exit 1
          ;;
      esac
    done
    ;;
  run) echo 'fake-container-id' ;;
  inspect)
    count=$(( $(cat "$FAKE_DOCKER_HEALTH_COUNT" 2>/dev/null || echo 0) + 1 ))
    echo "$count" > "$FAKE_DOCKER_HEALTH_COUNT"
    echo "$FAKE_DOCKER_HEALTH" | awk -v n="$count" '{ print (n <= NF) ? $n : $NF }'
    ;;
  logs) echo 'FATAL:  fake postgres failed to start' ;;
esac
`;

async function runStartScript({
  digest = DIGEST,
  refuse = '',
  health = 'healthy',
}: {
  digest?: string;
  refuse?: string;
  health?: string;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'start-postgres-'));
  const binDir = join(root, 'bin');
  const logPath = join(root, 'docker.log');
  await mkdir(binDir);
  await writeFile(join(binDir, 'docker'), FAKE_DOCKER);
  await chmod(join(binDir, 'docker'), 0o755);
  await writeFile(logPath, '');

  const result = spawnSync('bash', [START_SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      POSTGRES_IMAGE_DIGEST: digest,
      POSTGRES_PULL_RETRY_DELAY_SECONDS: '0',
      POSTGRES_HEALTH_INTERVAL_SECONDS: '0',
      POSTGRES_HEALTH_CHECKS: '3',
      FAKE_DOCKER_LOG: logPath,
      FAKE_DOCKER_REFUSE: refuse,
      FAKE_DOCKER_HEALTH: health,
      FAKE_DOCKER_HEALTH_COUNT: join(root, 'health-count'),
    },
  });
  const calls = (await readFile(logPath, 'utf8')).split('\n').filter(Boolean);
  return { ...result, calls };
}

function pulls(calls: string[]): string[] {
  return calls
    .filter((call) => call.startsWith('pull '))
    .map((call) => call.split(' ').at(-1) ?? '');
}

describe('start-postgres.sh', () => {
  it('pulls the pinned digest from Docker Hub first and starts CI database from it', async () => {
    const { status, stdout, calls } = await runStartScript();

    expect(status).toBe(0);
    expect(pulls(calls)).toEqual([DOCKER_HUB]);
    expect(stdout).toContain('::notice::Postgres image pulled from docker.io');
    const run = calls.find((call) => call.startsWith('run '));
    expect(run).toContain('--publish 5432:5432');
    expect(run).toContain('--env POSTGRES_USER=postgres');
    expect(run).toContain('--env POSTGRES_PASSWORD=postgres');
    expect(run).toContain('--env POSTGRES_DB=addiction_boards_test');
    expect(run).toContain(
      '--health-cmd pg_isready -U postgres -d addiction_boards_test',
    );
    expect(run?.endsWith(` ${DOCKER_HUB}`)).toBe(true);
  });

  it('retries a refusing registry once, then fails over to ECR Public', async () => {
    const { status, stdout, calls } = await runStartScript({
      refuse: 'docker.io',
    });

    expect(status).toBe(0);
    expect(pulls(calls)).toEqual([DOCKER_HUB, DOCKER_HUB, ECR_PUBLIC]);
    expect(stdout).toContain(
      '::warning::Could not pull Postgres from docker.io',
    );
    expect(stdout).toContain(
      '::notice::Postgres image pulled from public.ecr.aws',
    );
    expect(
      calls.find((call) => call.startsWith('run '))?.endsWith(` ${ECR_PUBLIC}`),
    ).toBe(true);
  });

  it("falls back to Google's mirror when Docker Hub and ECR Public both refuse", async () => {
    const { status, calls } = await runStartScript({
      refuse: 'docker.io public.ecr.aws',
    });

    expect(status).toBe(0);
    expect(pulls(calls)).toEqual([
      DOCKER_HUB,
      DOCKER_HUB,
      ECR_PUBLIC,
      ECR_PUBLIC,
      GOOGLE_MIRROR,
    ]);
    expect(
      calls
        .find((call) => call.startsWith('run '))
        ?.endsWith(` ${GOOGLE_MIRROR}`),
    ).toBe(true);
  });

  it('fails, naming the digest, and starts nothing when no registry serves it', async () => {
    const { status, stderr, calls } = await runStartScript({
      refuse: 'docker.io public.ecr.aws mirror.gcr.io',
    });

    expect(status).toBe(1);
    expect(pulls(calls)).toHaveLength(6);
    expect(stderr).toContain(`::error::No registry served postgres@${DIGEST}`);
    expect(calls.some((call) => call.startsWith('run '))).toBe(false);
  });

  it.each([
    ['a tag', 'postgres:16'],
    ['a short digest', 'sha256:abc'],
    ['nothing', ''],
  ])(
    'refuses %s in place of a sha256 digest, before any docker call',
    async (_label, digest) => {
      const { status, stderr, calls } = await runStartScript({ digest });

      expect(status).toBe(2);
      expect(stderr).toContain('::error::POSTGRES_IMAGE_DIGEST');
      expect(calls).toEqual([]);
    },
  );

  it('waits while Postgres is starting and succeeds once it is healthy', async () => {
    const { status, calls } = await runStartScript({
      health: 'starting starting healthy',
    });

    expect(status).toBe(0);
    expect(calls.filter((call) => call.startsWith('inspect '))).toHaveLength(3);
  });

  it.each([
    ['turns unhealthy', 'unhealthy'],
    ['is still starting after the last check', 'starting'],
  ])(
    'fails with the container log when Postgres %s',
    async (_label, health) => {
      const { status, stderr, calls } = await runStartScript({ health });

      expect(status).toBe(1);
      expect(stderr).toContain('::error::Postgres did not become healthy');
      expect(stderr).toContain('fake postgres failed to start');
      expect(calls).toContain('logs postgres');
    },
  );
});
