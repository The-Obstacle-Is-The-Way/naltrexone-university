import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const biome = resolve('node_modules/.bin/biome');
let fixtureRoot: string;

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'react-component-policy-'));
  const config = JSON.parse(readFileSync('biome.json', 'utf8'));
  // Only Git discovery differs from the repository's actual lint policy.
  config.vcs.enabled = false;
  writeFileSync(join(fixtureRoot, 'biome.json'), JSON.stringify(config));
  // Biome enables its React rules only when it detects React, as it does in
  // the repository; without this manifest every case below would pass vacuously.
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  writeFileSync(
    join(fixtureRoot, 'package.json'),
    JSON.stringify({
      name: 'react-component-policy-fixture',
      dependencies: { react: manifest.dependencies.react },
    }),
  );
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function lint(filePath: string, contents: string) {
  const fixture = join(fixtureRoot, filePath);
  mkdirSync(dirname(fixture), { recursive: true });
  writeFileSync(fixture, contents);
  return spawnSync(biome, ['lint', filePath], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

const COMPONENT_INSIDE_COMPONENT = `export function Parent() {
  function Child() {
    return <p>child</p>;
  }
  return <Child />;
}
`;

const COMPONENT_FACTORY = `export function createPanel(label: string) {
  return function Panel() {
    return <p>{label}</p>;
  };
}
`;

const HOOK_FACTORY = `import { useState } from 'react';

export function createCounterHook(initial: number) {
  return function useCounter() {
    return useState(initial);
  };
}
`;

const HARNESS_INSIDE_TEST = `import { expect, it } from 'vitest';

it('renders the harness', () => {
  function Harness() {
    return <p>harness</p>;
  }
  expect(<Harness />).toBeTruthy();
});
`;

const CONSTRUCTOR_STUB_INSIDE_TEST = `import { expect, it, vi } from 'vitest';

it('constructs the client', () => {
  const Client = vi.fn(function ClientConstructor() {
    return {};
  });
  expect(new Client()).toEqual({});
});
`;

const CREATE_ELEMENT_FACTORY = `import { createElement } from 'react';

export function createPanel(label: string) {
  return function Panel() {
    return createElement('p', null, label);
  };
}
`;

const ROUTE_HANDLER_FACTORY = `export function createExampleHandler(run: () => Promise<void>) {
  return async function POST(_request: Request) {
    await run();
    return new Response(null, { status: 204 });
  };
}
`;

describe('React component definition lint policy', () => {
  it.each([
    'app/example/example-panel.tsx',
    'components/example-panel.tsx',
    'app/example/example.test.tsx',
    'app/example/example.browser.spec.tsx',
    'components/example-test-helpers.tsx',
  ])(
    'rejects a component defined inside another component in %s',
    (filePath) => {
      const result = lint(filePath, COMPONENT_INSIDE_COMPONENT);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'lint/correctness/noNestedComponentDefinitions',
      );
    },
  );

  it.each([
    'app/example/example-panel.tsx',
    'components/example-panel.tsx',
    'lib/example-panel.tsx',
    'app/api/example/example-panel.tsx',
  ])('rejects a component factory in production code at %s', (filePath) => {
    const result = lint(filePath, COMPONENT_FACTORY);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'lint/correctness/noComponentHookFactories',
    );
  });

  it('rejects a hook factory in production code', () => {
    const result = lint('app/example/use-example-counter.ts', HOOK_FACTORY);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'lint/correctness/noComponentHookFactories',
    );
  });

  it.each([
    'app/example/example.test.tsx',
    'app/example/example.browser.spec.tsx',
    'components/example.test.tsx',
    'tests/e2e/helpers/example.test.tsx',
  ])('allows a harness component defined inside a test in %s', (filePath) => {
    expect(lint(filePath, HARNESS_INSIDE_TEST).status).toBe(0);
  });

  it.each([
    'lib/example.test.ts',
    'tests/e2e/helpers/example.test.ts',
    'tests/e2e/example.spec.ts',
  ])('allows a PascalCase constructor stub inside a test in %s', (filePath) => {
    expect(lint(filePath, CONSTRUCTOR_STUB_INSIDE_TEST).status).toBe(0);
  });

  // Production code can import test support, so only files a test runner
  // collects are exempt.
  // Probe, fixture and setup paths are ones the filename rule already allows.
  it.each([
    ['components/example-test-helpers.tsx', COMPONENT_FACTORY],
    ['src/application/test-helpers/example-harness.tsx', COMPONENT_FACTORY],
    [
      'app/(app)/app/practice/[sessionId]/hooks/practice-session-page-model.browser.probes.tsx',
      COMPONENT_FACTORY,
    ],
    ['app/example/example-test-helpers.ts', HOOK_FACTORY],
    [
      'app/(app)/app/practice/[sessionId]/components/post-exam-review-view.fixtures.ts',
      HOOK_FACTORY,
    ],
    ['tests/e2e/global.setup.ts', HOOK_FACTORY],
  ])('rejects a factory in the test support file %s', (filePath, contents) => {
    const result = lint(filePath, contents);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'lint/correctness/noComponentHookFactories',
    );
  });

  // Exemption follows the runners' patterns, not the spec suffix alone.
  it.each([
    ['components/example-panel.spec.tsx', COMPONENT_FACTORY],
    ['lib/example-panel.spec.ts', CREATE_ELEMENT_FACTORY],
  ])(
    'rejects a factory in %s, which no test runner collects',
    (filePath, contents) => {
      const result = lint(filePath, contents);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'lint/correctness/noComponentHookFactories',
      );
    },
  );

  // A .ts file can still build components without JSX.
  it('rejects a createElement component factory in a .ts file under app/api', () => {
    const result = lint('app/api/example/panel.ts', CREATE_ELEMENT_FACTORY);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'lint/correctness/noComponentHookFactories',
    );
  });

  // Each route handler factory carries its own line suppression and reason.
  it.each([
    'app/api/example/handler.ts',
    'app/api/webhooks/example/handler.ts',
  ])('rejects an unsuppressed route handler factory at %s', (filePath) => {
    const result = lint(filePath, ROUTE_HANDLER_FACTORY);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'lint/correctness/noComponentHookFactories',
    );
  });
});
