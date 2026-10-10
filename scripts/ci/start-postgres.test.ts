import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const START_SCRIPT = 'scripts/ci/start-postgres.sh';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const DOCKER_HUB = `docker.io/library/postgres@${DIGEST}`;
const ECR_PUBLIC = `public.ecr.aws/docker/library/postgres@${DIGEST}`;
const GOOGLE_MIRROR = `mirror.gcr.io/library/postgres@${DIGEST}`;
const PULL_DOCKER_HUB = ['docker', 'pull', '--quiet', DOCKER_HUB];
const PULL_ECR_PUBLIC = ['docker', 'pull', '--quiet', ECR_PUBLIC];
const PULL_GOOGLE_MIRROR = ['docker', 'pull', '--quiet', GOOGLE_MIRROR];
const RETRY_DELAY = ['sleep', '10'];
const HEALTH_INTERVAL = ['sleep', '2'];
const INSPECT = [
  'docker',
  'inspect',
  '--format',
  '{{.State.Health.Status}}',
  'postgres',
];
const runCommand = (image: string) => [
  'docker',
  'run',
  '--detach',
  '--name',
  'postgres',
  '--env',
  'POSTGRES_USER=postgres',
  '--env',
  'POSTGRES_PASSWORD=postgres',
  '--env',
  'POSTGRES_DB=addiction_boards_test',
  '--publish',
  '5432:5432',
  '--health-cmd',
  'pg_isready -U postgres -d addiction_boards_test',
  '--health-interval',
  '5s',
  '--health-timeout',
  '5s',
  '--health-retries',
  '10',
  image,
];

// Stand-ins for the runner's docker CLI and sleep. Each call is logged with
// its arguments kept apart, so a test sees exactly what docker would. Docker
// refuses pulls from the registries in FAKE_DOCKER_REFUSE the way Docker Hub
// did on 2026-10-09, hangs on those in FAKE_DOCKER_HANG, fails `run` when
// FAKE_DOCKER_RUN_FAILS is set, and reports health statuses in the order
// FAKE_DOCKER_HEALTH lists them, repeating the last. Sleep returns at once.
const LOG_CALL = `printf '%s\\037' "$(basename "$0")" "$@" >> "$FAKE_LOG"; printf '\\n' >> "$FAKE_LOG"`;
const FAKE_DOCKER = `#!/bin/sh
${LOG_CALL}
eval "last=\\\${$#}"
case "$1" in
  pull)
    for hung in $FAKE_DOCKER_HANG; do
      case "$last" in "$hung"/*) exec /bin/sleep 30 ;; esac
    done
    for refused in $FAKE_DOCKER_REFUSE; do
      case "$last" in
        "$refused"/*)
          echo 'toomanyrequests: You have reached your unauthenticated pull rate limit.' >&2
          exit 1
          ;;
      esac
    done
    ;;
  run)
    if [ -n "$FAKE_DOCKER_RUN_FAILS" ]; then
      echo 'Bind for 0.0.0.0:5432 failed: port is already allocated' >&2
      exit 125
    fi
    echo 'fake-container-id'
    ;;
  inspect)
    count=$(( $(cat "$FAKE_DOCKER_HEALTH_COUNT" 2>/dev/null || echo 0) + 1 ))
    echo "$count" > "$FAKE_DOCKER_HEALTH_COUNT"
    echo "$FAKE_DOCKER_HEALTH" | awk -v n="$count" '{ print (n <= NF) ? $n : $NF }'
    ;;
  logs) echo 'FATAL:  fake postgres failed to start' ;;
esac
`;
const FAKE_SLEEP = `#!/bin/sh
${LOG_CALL}
`;

const roots: string[] = [];
afterAll(() =>
  Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))),
);

async function runStartScript({
  digest = DIGEST,
  refuse = '',
  hang = '',
  runFails = false,
  health = 'healthy',
}: {
  digest?: string;
  refuse?: string;
  hang?: string;
  runFails?: boolean;
  health?: string;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'start-postgres-'));
  roots.push(root);
  const binDir = join(root, 'bin');
  const logPath = join(root, 'calls.log');
  await mkdir(binDir);
  await writeFile(join(binDir, 'docker'), FAKE_DOCKER);
  await writeFile(join(binDir, 'sleep'), FAKE_SLEEP);
  await chmod(join(binDir, 'docker'), 0o755);
  await chmod(join(binDir, 'sleep'), 0o755);
  await writeFile(logPath, '');

  const startedAt = Date.now();
  const result = spawnSync('bash', [START_SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      POSTGRES_IMAGE_DIGEST: digest,
      POSTGRES_PULL_TIMEOUT_SECONDS: '1',
      FAKE_LOG: logPath,
      FAKE_DOCKER_REFUSE: refuse,
      FAKE_DOCKER_HANG: hang,
      FAKE_DOCKER_RUN_FAILS: runFails ? 'true' : '',
      FAKE_DOCKER_HEALTH: health,
      FAKE_DOCKER_HEALTH_COUNT: join(root, 'health-count'),
    },
  });
  const calls = (await readFile(logPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\u001f').slice(0, -1));
  return { ...result, calls, elapsed: Date.now() - startedAt };
}

function pullsAndDelays(calls: string[][]): string[][] {
  return calls.filter(
    ([command, subcommand]) =>
      (command === 'docker' && subcommand === 'pull') || command === 'sleep',
  );
}

describe('start-postgres.sh', () => {
  it('pulls the pinned digest from Docker Hub and starts CI database from it', async () => {
    const { status, stdout, calls } = await runStartScript();

    expect(status).toBe(0);
    expect(calls).toEqual([PULL_DOCKER_HUB, runCommand(DOCKER_HUB), INSPECT]);
    expect(stdout).toContain('::notice::Postgres image pulled from docker.io');
  });

  it('retries a refusing registry once, ten seconds later, then fails over to ECR Public', async () => {
    const { status, stdout, calls } = await runStartScript({
      refuse: 'docker.io',
    });

    expect(status).toBe(0);
    expect(pullsAndDelays(calls)).toEqual([
      PULL_DOCKER_HUB,
      RETRY_DELAY,
      PULL_DOCKER_HUB,
      PULL_ECR_PUBLIC,
    ]);
    expect(stdout).toContain(
      '::warning::Could not pull Postgres from docker.io',
    );
    expect(stdout).toContain(
      '::notice::Postgres image pulled from public.ecr.aws',
    );
    expect(calls).toContainEqual(runCommand(ECR_PUBLIC));
  });

  it("falls back to Google's mirror when Docker Hub and ECR Public both refuse", async () => {
    const { status, calls } = await runStartScript({
      refuse: 'docker.io public.ecr.aws',
    });

    expect(status).toBe(0);
    expect(pullsAndDelays(calls)).toEqual([
      PULL_DOCKER_HUB,
      RETRY_DELAY,
      PULL_DOCKER_HUB,
      PULL_ECR_PUBLIC,
      RETRY_DELAY,
      PULL_ECR_PUBLIC,
      PULL_GOOGLE_MIRROR,
    ]);
    expect(calls).toContainEqual(runCommand(GOOGLE_MIRROR));
  });

  it('stops a stalled pull at its time limit and moves on to the next registry', async () => {
    const { status, calls, elapsed } = await runStartScript({
      hang: 'docker.io',
    });

    expect(status).toBe(0);
    expect(pullsAndDelays(calls)).toEqual([
      PULL_DOCKER_HUB,
      RETRY_DELAY,
      PULL_DOCKER_HUB,
      PULL_ECR_PUBLIC,
    ]);
    expect(elapsed).toBeLessThan(10_000);
  });

  it('fails, naming the digest, and starts nothing when no registry serves it', async () => {
    const { status, stderr, calls } = await runStartScript({
      refuse: 'docker.io public.ecr.aws mirror.gcr.io',
    });

    expect(status).toBe(1);
    expect(
      calls.filter(([, subcommand]) => subcommand === 'pull'),
    ).toHaveLength(6);
    expect(stderr).toContain(`::error::No registry served postgres@${DIGEST}`);
    expect(calls.some(([, subcommand]) => subcommand === 'run')).toBe(false);
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

  it('fails with an annotation and waits for nothing when docker cannot start the container', async () => {
    const { status, stderr, calls } = await runStartScript({ runFails: true });

    expect(status).toBe(1);
    expect(stderr).toContain(
      `::error::Could not start Postgres from ${DOCKER_HUB}`,
    );
    expect(calls).not.toContainEqual(INSPECT);
  });

  it('checks health every two seconds while Postgres starts, and succeeds once it is healthy', async () => {
    const { status, calls } = await runStartScript({
      health: 'starting starting healthy',
    });

    expect(status).toBe(0);
    expect(calls.slice(2)).toEqual([
      INSPECT,
      HEALTH_INTERVAL,
      INSPECT,
      HEALTH_INTERVAL,
      INSPECT,
    ]);
  });

  it('stops waiting as soon as Postgres turns unhealthy, and prints its log', async () => {
    const { status, stderr, calls } = await runStartScript({
      health: 'unhealthy',
    });

    expect(status).toBe(1);
    expect(calls.slice(2)).toEqual([INSPECT, ['docker', 'logs', 'postgres']]);
    expect(stderr).toContain('::error::Postgres did not become healthy');
    expect(stderr).toContain('fake postgres failed to start');
  });

  it('gives up after 60 health checks and prints the log', async () => {
    const { status, stderr, calls } = await runStartScript({
      health: 'starting',
    });

    expect(status).toBe(1);
    expect(calls.filter((call) => call[1] === 'inspect')).toHaveLength(60);
    expect(calls.at(-1)).toEqual(['docker', 'logs', 'postgres']);
    expect(stderr).toContain('fake postgres failed to start');
  });
});
