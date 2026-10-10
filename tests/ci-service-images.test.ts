import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { workflowFiles, workflowImages } from '@/tests/shared/workflow-files';

const START_POSTGRES = 'bash scripts/ci/start-postgres.sh';
const PRINT_POSTGRES_LOG = 'docker logs postgres || true';
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

  it('starts Postgres with registry failover, bounded, before any pnpm step, in every job that uses a local database', () => {
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
    expect(compose.services.db.image).toBe(`postgres@${digests[0]}`);
  });
});
