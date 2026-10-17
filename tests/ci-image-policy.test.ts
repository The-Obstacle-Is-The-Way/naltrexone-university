import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  helperRepositoryErrors,
  workflowImageErrors,
} from './shared/ci-image-policy';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;
const PULL =
  'bash scripts/ci/pull-image.sh --env POOL_IMAGE_REPOSITORY Pool "$POOL_IMAGE_DIGEST" docker.io/example/pool mirror.gcr.io/example/pool';
const START = 'docker compose up --no-deps --pull never pool';
const COMPOSE = stringify({
  services: {
    pool: { image: `\${POOL_IMAGE_REPOSITORY:-example/pool}@${DIGEST}` },
  },
});
function workflow(run = START, pull = PULL, digest = DIGEST) {
  return stringify({
    jobs: {
      test: {
        steps: [
          {
            run: pull,
            env: { POOL_IMAGE_DIGEST: digest },
            'timeout-minutes': 7,
          },
          { run },
        ],
      },
    },
  });
}

describe('CI image policy negative controls', () => {
  it('accepts explicit bounded pulls and Compose with pulls disabled', () => {
    expect(workflowImageErrors(workflow(), COMPOSE)).toEqual({
      direct: [],
      pullPolicy: [],
      compose: [],
      repositories: [],
    });
  });
  it.each([
    'docker pull example/pool',
    'docker run example/pool',
    'docker create example/pool',
    'docker compose pull pool',
    'true && docker pull example/pool',
  ])('rejects direct pull path: %s', (run) => {
    expect(workflowImageErrors(workflow(run), COMPOSE).direct).not.toEqual([]);
  });
  it.each([
    'docker --context runner pull example/pool',
    'docker compose -f other.yml up pool',
  ])('fails closed on unsupported Docker command form: %s', (run) => {
    expect(workflowImageErrors(workflow(run), COMPOSE).direct).not.toEqual([]);
  });
  it.each(['up', 'create', 'run'])(
    'rejects Compose %s without --pull never',
    (action) => {
      expect(
        workflowImageErrors(
          workflow(`docker compose ${action} --no-deps pool`),
          COMPOSE,
        ).pullPolicy,
      ).not.toEqual([]);
    },
  );
  it('does not let another command supply the pull policy', () => {
    expect(
      workflowImageErrors(
        workflow('echo --pull never; docker compose up --no-deps pool'),
        COMPOSE,
      ).pullPolicy,
    ).not.toEqual([]);
  });
  it('rejects a declarative image even when pinned, because it bypasses helper steps', () => {
    expect(
      workflowImageErrors(
        stringify({
          jobs: { test: { services: { cache: { image: `redis@${DIGEST}` } } } },
        }),
        COMPOSE,
      ).direct,
    ).not.toEqual([]);
  });
  it.each([
    ['different digest', PULL, OTHER_DIGEST],
    [
      'different repository variable',
      PULL.replace('POOL_IMAGE_REPOSITORY', 'OTHER_IMAGE_REPOSITORY'),
      DIGEST,
    ],
    ['missing pull', 'echo no pull', DIGEST],
  ])('rejects Compose with %s', (_label, pull, digest) => {
    expect(
      workflowImageErrors(workflow(START, pull, digest), COMPOSE).compose,
    ).not.toEqual([]);
  });
  it('rejects an unbounded producer and a producer after the start', () => {
    const steps = [
      { run: START },
      { run: PULL, env: { POOL_IMAGE_DIGEST: DIGEST } },
    ];
    expect(
      workflowImageErrors(stringify({ jobs: { test: { steps } } }), COMPOSE)
        .compose,
    ).not.toEqual([]);
    expect(
      workflowImageErrors(
        stringify({ jobs: { test: { steps: [...steps].reverse() } } }),
        COMPOSE,
      ).compose,
    ).not.toEqual([]);
  });
  it('checks dependencies unless --no-deps is explicit', () => {
    const compose = stringify({
      services: {
        pool: {
          image: `\${POOL_IMAGE_REPOSITORY:-example/pool}@${DIGEST}`,
          depends_on: ['db'],
        },
        db: { image: `postgres@${DIGEST}` },
      },
    });
    expect(
      workflowImageErrors(workflow(START.replace('--no-deps ', '')), compose)
        .compose,
    ).toHaveLength(1);
  });
  it.each([
    'pull_image Pool "$digest" docker.io/example/pool',
    `pull_image Pool "$digest" "\${repositories[@]}"`,
    PULL.replace('mirror.gcr.io', 'docker.io'),
  ])('rejects a single or implicit registry list: %s', (call) => {
    expect(helperRepositoryErrors(call)).not.toEqual([]);
  });
  it('accepts a sourced helper call with a continued explicit repository list', () => {
    expect(
      helperRepositoryErrors(
        'pull_image Pool "$digest" \\\n docker.io/example/pool mirror.gcr.io/example/pool',
      ),
    ).toEqual([]);
  });
});
