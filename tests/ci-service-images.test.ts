import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  helperRepositoryErrors,
  workflowImageErrors,
} from '@/tests/shared/ci-image-policy';
import { workflowFiles, workflowImages } from '@/tests/shared/workflow-files';

const START_POSTGRES =
  'bash scripts/ci/pull-image.sh --env POSTGRES_IMAGE_REPOSITORY Postgres "$POSTGRES_IMAGE_DIGEST" docker.io/library/postgres public.ecr.aws/docker/library/postgres mirror.gcr.io/library/postgres';
const PRINT_POSTGRES_LOG = 'docker compose logs --no-color db || true';
const LOCAL_DATABASE_URL = /@(localhost|127\.0\.0\.1):/;

type Env = Record<string, string>;

type Step = {
  name?: string;
  run?: string;
  if?: string;
  env?: Env;
  'timeout-minutes'?: number;
};

type Job = {
  env?: Env;
  services?: Record<string, { image?: string }>;
  steps?: Step[];
};

function workflowJobs() {
  return workflowFiles().flatMap((file) => {
    const workflow = parse(readFileSync(file, 'utf8')) as {
      env?: Env;
      jobs?: Record<string, Job>;
    };
    return Object.values(workflow.jobs ?? {}).map((job) => ({
      file,
      job,
      workflowEnv: workflow.env,
    }));
  });
}

// A job uses a database on the runner when DATABASE_URL points at localhost,
// whether the workflow, the job or one of its steps sets it.
function localDatabaseJobs() {
  return workflowJobs().filter(({ job, workflowEnv }) =>
    [workflowEnv, job.env, ...(job.steps ?? []).map((step) => step.env)].some(
      (env) => LOCAL_DATABASE_URL.test(env?.DATABASE_URL ?? ''),
    ),
  );
}

function startSteps() {
  return localDatabaseJobs().flatMap(({ job }) =>
    (job.steps ?? []).filter((step) => step.run === START_POSTGRES),
  );
}

describe('CI container images', () => {
  // BUG-352: a second image bypassed Postgres-only failover protection.
  const composeSource = readFileSync('docker-compose.yml', 'utf8');
  const policy = () =>
    workflowFiles().map((file) => ({
      file,
      ...workflowImageErrors(readFileSync(file, 'utf8'), composeSource),
    }));

  it('allows no workflow to pull or directly start an image outside failover', () => {
    expect(
      policy().flatMap(({ file, direct }) =>
        direct.map((error) => ({ file, error })),
      ),
    ).toEqual([]);
  });

  it('requires --pull never on every workflow Compose up, create or run', () => {
    expect(
      policy().flatMap(({ file, pullPolicy }) =>
        pullPolicy.map((error) => ({ file, error })),
      ),
    ).toEqual([]);
  });

  it('ties every workflow Compose service to its preceding bounded helper pull', () => {
    expect(
      policy().flatMap(({ file, compose }) =>
        compose.map((error) => ({ file, error })),
      ),
    ).toEqual([]);
  });

  it('names at least two registry repositories in every workflow and CI script helper call', () => {
    const scripts = globSync('scripts/ci/**/*.sh').flatMap((file) =>
      helperRepositoryErrors(
        // The helper's CLI forwards already supplied arguments; its tests
        // prove the same minimum-repository validation. All callers are literal.
        file === 'scripts/ci/pull-image.sh'
          ? readFileSync(file, 'utf8').replace(
              /^ {2}pull_image "\$@" \|\| exit \$\?$/m,
              '',
            )
          : readFileSync(file, 'utf8'),
      ).map((error) => ({
        file,
        error,
      })),
    );
    expect([
      ...policy().flatMap(({ file, repositories }) =>
        repositories.map((error) => ({ file, error })),
      ),
      ...scripts,
    ]).toEqual([]);
  });

  it('pins one PgBouncer digest across its workflow pull and Compose', () => {
    const pull = workflowJobs()
      .find(({ file }) => file === '.github/workflows/ci.yml')
      ?.job.steps?.find((step) => step.name === 'Pull PgBouncer');
    const digest = pull?.env?.PGBOUNCER_IMAGE_DIGEST;
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const compose = parse(composeSource) as {
      services: { pgbouncer: { image: string } };
    };
    expect(compose.services.pgbouncer.image.split('@')[1]).toBe(digest);
  });

  it('starts the pinned transaction pooler on a resolver port before integration tests', () => {
    const ci = workflowJobs().find(
      ({ file }) => file === '.github/workflows/ci.yml',
    );
    const steps = ci?.job.steps ?? [];
    const pooler = steps.findIndex((step) =>
      step.run?.includes('docker compose up -d --wait'),
    );
    const integration = steps.findIndex(
      (step) => step.run === 'pnpm test:integration:coverage',
    );
    expect(pooler).toBeGreaterThanOrEqual(0);
    expect(pooler).toBeLessThan(integration);
    // One resolver call, and no `export X="$(…)"`: export's own status masks
    // a failed command substitution, so the step would run on empty values.
    expect(
      steps[pooler]?.run?.match(/resolve-local-test-target\.ts/g),
    ).toHaveLength(1);
    expect(steps[pooler]?.run).not.toMatch(/export \w+="\$\(/);
    expect(steps[pooler]?.run).toContain('${COMPOSE_PROJECT_NAME:?');
    expect(steps[pooler]?.run).toContain('${DB_TEST_POOLER_PORT:?');
    expect(steps[pooler]?.run).toContain('GITHUB_ENV');
    expect(steps[pooler]?.run).toContain(
      'docker compose up -d --wait --wait-timeout 60 --pull never db pgbouncer',
    );
    expect(steps[pooler]?.run).not.toContain('docker network connect');
    expect(ci?.job.env?.DB_TEST_PORT).toBe('5432');
    expect(steps[pooler]?.['timeout-minutes']).toBeGreaterThan(0);
    const compose = parse(readFileSync('docker-compose.yml', 'utf8')) as {
      services: {
        pgbouncer: { image: string; environment: Env; ports: string[] };
      };
    };
    expect(compose.services.pgbouncer.image).toMatch(
      /^\$\{PGBOUNCER_IMAGE_REPOSITORY:-edoburu\/pgbouncer\}@sha256:[0-9a-f]{64}$/,
    );
    expect(compose.services.pgbouncer.environment.POOL_MODE).toBe(
      'transaction',
    );
    expect(
      compose.services.pgbouncer.environment.IGNORE_STARTUP_PARAMETERS?.split(
        ',',
      ),
    ).toEqual(
      expect.arrayContaining([
        'statement_timeout',
        'lock_timeout',
        'idle_in_transaction_session_timeout',
      ]),
    );
    expect(compose.services.pgbouncer.ports[0]).toContain(
      'DB_TEST_POOLER_PORT',
    );
  });
  // BUG-327: a mutable tag can change what runs between two runs of the same
  // commit, so every image a workflow declares is pinned by digest.
  it('pins every service, job-container and docker:// step image by digest', () => {
    const unpinned = workflowFiles().flatMap((file) =>
      workflowImages(readFileSync(file, 'utf8'))
        .filter((image) => !/^[^@\s]+@sha256:[0-9a-f]{64}$/.test(image))
        .map((image) => ({ file, image })),
    );

    expect(unpinned).toEqual([]);
  });

  // DEBT-516: on 2026-10-09 Docker Hub refused the Postgres service image,
  // and a service container pulls from one registry only.
  it('runs no Postgres service container', () => {
    const services = workflowJobs().flatMap(({ file, job }) =>
      Object.values(job.services ?? {})
        .filter((service) => service.image?.includes('postgres'))
        .map((service) => ({ file, image: service.image })),
    );

    expect(services).toEqual([]);
  });

  it('pulls Postgres with registry failover before installation, then starts Compose before migration in every database job', () => {
    const jobs = localDatabaseJobs();

    expect(jobs.map(({ file }) => file)).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/stripe-hosted-checkout-smoke.yml',
    ]);
    for (const { job } of jobs) {
      const steps = job.steps ?? [];
      const start = steps.findIndex((step) => step.run === START_POSTGRES);
      const firstPnpm = steps.findIndex((step) => step.run?.includes('pnpm'));

      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(firstPnpm);
      expect(steps[start]?.['timeout-minutes']).toBeGreaterThan(0);
      const compose = steps.findIndex(
        (step) => step.name === 'Start test database',
      );
      const migrate = steps.findIndex((step) => step.name === 'Migrate DB');
      expect(compose).toBeGreaterThan(firstPnpm);
      expect(compose).toBeLessThan(migrate);
      expect(job.env?.DB_TEST_PORT).toBe('5432');
      expect(steps[compose]?.run).toContain('--pull never db');
      expect(steps[compose]?.run).toContain('COMPOSE_PROJECT_NAME=%s');
      expect(steps[compose]?.run).toContain('DB_TEST_POOLER_PORT=%s');
      expect(steps[compose]?.['timeout-minutes']).toBeGreaterThan(0);
    }
  });

  // The runner printed a service container's log after the job; the
  // database's log is evidence for a deadlock or crash in any later step.
  it('prints the Postgres log as the last step of every job that starts it, unless cancelled', () => {
    for (const { job } of localDatabaseJobs()) {
      expect(job.steps?.at(-1)).toMatchObject({
        if: `\${{ !cancelled() }}`,
        run: PRINT_POSTGRES_LOG,
      });
    }
  });

  it('pins one Postgres digest across the workflows and docker-compose.yml', () => {
    const digests = startSteps().map((step) => step.env?.POSTGRES_IMAGE_DIGEST);
    const compose = parse(readFileSync('docker-compose.yml', 'utf8')) as {
      services: { db: { image: string } };
    };

    expect(digests).toHaveLength(2);
    expect(new Set(digests).size).toBe(1);
    expect(digests[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(compose.services.db.image).toBe(
      `\${POSTGRES_IMAGE_REPOSITORY:-postgres}@${digests[0]}`,
    );
  });
});

it('publishes the local database only on loopback', () => {
  const compose = parse(readFileSync('docker-compose.yml', 'utf8'));
  expect(compose.services.db.ports).toEqual([
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose resolves this literal; JavaScript must not.
    '127.0.0.1:${DB_TEST_PORT:-5434}:5432',
  ]);
});

it('keeps bounded healthchecks and a healthy database prerequisite in the shared Compose services', () => {
  const compose = parse(readFileSync('docker-compose.yml', 'utf8'));
  expect(compose.services.db.healthcheck).toEqual({
    test: ['CMD-SHELL', 'pg_isready -U postgres -d addiction_boards_test'],
    interval: '5s',
    timeout: '5s',
    retries: 10,
  });
  expect(compose.services.pgbouncer.healthcheck).toEqual({
    test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U postgres -d postgres'],
    interval: '5s',
    timeout: '5s',
    retries: 10,
  });
  expect(compose.services.pgbouncer.depends_on.db.condition).toBe(
    'service_healthy',
  );
  for (const { job } of localDatabaseJobs()) {
    const startup = job.steps?.find(
      (step) => step.name === 'Start test database',
    );
    expect(startup?.run).toContain('--wait --wait-timeout 60 --pull never');
    expect(startup?.['timeout-minutes']).toBeGreaterThan(0);
  }
});
