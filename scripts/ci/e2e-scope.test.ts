import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { decideE2eScope, type Git, isOutsideTheApp } from './e2e-scope.mts';

// Inherited GIT_* variables (set inside git hooks, such as the pre-push hook
// that runs these tests) would point the fixture's commands at the clone, so
// the child environment drops them. The operator's and the system's Git
// configuration (signing, hooks, default branch) are left out too.
function isolatedGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith('GIT_')) delete env[name];
  }
  return Object.assign(env, {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  });
}

const GIT_ENV = isolatedGitEnv();

const repositories: string[] = [];

afterEach(() => {
  for (const dir of repositories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function repository() {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-scope-'));
  repositories.push(dir);
  const git: Git = (args) =>
    execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' });
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  const commit = (message: string) => {
    git(['add', '--all']);
    git(['commit', '--quiet', '--allow-empty', '-m', message]);
  };
  git(['init', '--quiet', '--initial-branch=dev']);
  write('app/page.tsx', 'export default function Page() {}\n');
  write('docs/guide.md', '# Guide\n');
  write('README.md', '# Repository\n');
  commit('base');
  return { git, write, commit };
}

// Builds the commit a pull_request run checks out: the pull request's head
// merged into its base, with the base as the first parent.
function pullRequestMerge(
  change: (repo: ReturnType<typeof repository>) => void,
) {
  const repo = repository();
  repo.git(['switch', '--quiet', '-c', 'feature']);
  change(repo);
  repo.commit('change');
  repo.git(['switch', '--quiet', 'dev']);
  repo.git(['merge', '--quiet', '--no-ff', '-m', 'merge', 'feature']);
  return repo;
}

describe('isOutsideTheApp', () => {
  it.each([
    'docs/records/README.md',
    'docs/policies/legal/consent-rulings/f03-consent-ruling-data.json',
    'AGENTS.md',
    'CLAUDE.md',
  ])('treats %s as outside the app', (file) => {
    expect(isOutsideTheApp(file)).toBe(true);
  });

  it.each([
    'README.md',
    'SECURITY.md',
    'docs',
    'docsite/index.md',
    'app/docs/page.tsx',
    'nested/AGENTS.md',
    '.claude/rules/testing.md',
    'app/globals.css',
  ])('treats %s as part of the app', (file) => {
    expect(isOutsideTheApp(file)).toBe(false);
  });
});

describe('decideE2eScope', () => {
  it('skips E2E for a pull request that changes only documentation', () => {
    const { git } = pullRequestMerge(({ write }) => {
      write('docs/guide.md', '# Guide, revised\n');
      write('AGENTS.md', '# Agents\n');
    });

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(true);
  });

  it('runs E2E for a pull request that also changes the app', () => {
    const { git } = pullRequestMerge(({ write }) => {
      write('docs/guide.md', '# Guide, revised\n');
      write(
        'app/page.tsx',
        'export default function Page() { return null; }\n',
      );
    });

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(false);
  });

  it('runs E2E when a file moves from the app into docs', () => {
    const { git } = pullRequestMerge(({ git: run }) => {
      run(['mv', 'app/page.tsx', 'docs/page.tsx']);
    });

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(false);
  });

  it('runs E2E for a Markdown file at the root that Tailwind scans', () => {
    const { git } = pullRequestMerge(({ write }) => {
      write('README.md', '# Repository, revised\n');
    });

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(false);
  });

  it('runs E2E for a pull request that changes no file', () => {
    const { git } = pullRequestMerge(() => {});

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(false);
  });

  it('runs E2E for a pull_request checkout that is not a merge commit', () => {
    const { git, write, commit } = repository();
    write('docs/guide.md', '# Guide, revised\n');
    commit('docs');

    expect(decideE2eScope('pull_request', git).docsOnly).toBe(false);
  });

  it('runs E2E for a push to main, the release gate, even when it changes only documentation', () => {
    const { git } = pullRequestMerge(({ write }) => {
      write('docs/guide.md', '# Guide, revised\n');
    });

    expect(decideE2eScope('push', git).docsOnly).toBe(false);
  });

  it('runs E2E for a manual run', () => {
    const { git } = pullRequestMerge(({ write }) => {
      write('docs/guide.md', '# Guide, revised\n');
    });

    expect(decideE2eScope('workflow_dispatch', git).docsOnly).toBe(false);
  });

  it('runs E2E when the diff cannot be read', () => {
    const git: Git = () => {
      throw new Error('not a git repository');
    };

    const scope = decideE2eScope('pull_request', git);

    expect(scope.docsOnly).toBe(false);
    expect(scope.reason).toContain('not a git repository');
  });
});

describe('what the app never reads', () => {
  it('keeps docs/, AGENTS.md and CLAUDE.md out of Tailwind sources', () => {
    const css = readFileSync('app/globals.css', 'utf8');

    expect(css).toContain('@source not "../docs";');
    expect(css).toContain('@source not "../AGENTS.md";');
    expect(css).toContain('@source not "../CLAUDE.md";');
  });

  it('has no runtime source that names a path outside the app', () => {
    const sources = execFileSync(
      'git',
      [
        'ls-files',
        '-z',
        '--',
        'app',
        'components',
        'lib',
        'src',
        'db',
        'proxy.ts',
        'next.config.ts',
      ],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(
        (file) =>
          /\.(?:ts|tsx|mts|js|mjs)$/.test(file) &&
          !/\.(?:test|spec)\.|test-helpers|\.fixtures\.|\.browser\.probes\./.test(
            file,
          ),
      );

    const naming = sources.filter((file) =>
      /['"`](?:@\/|(?:\.\.?\/)+)?(?:docs\/|AGENTS\.md|CLAUDE\.md)/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(naming).toEqual([]);
  });
});

type Step = {
  name?: string;
  id?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
};

describe('the CI step that runs this script', () => {
  const steps = Object.values(
    (
      parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
        jobs?: Record<string, { steps?: Step[] }>;
      }
    ).jobs ?? {},
  ).flatMap((job) => job.steps ?? []);
  const named = (name: string) => steps.find((step) => step.name === name);

  it('decides just before E2E, and a failed decision leaves E2E running', () => {
    const scope = named('Decide whether E2E runs');
    const names = steps.map((step) => step.name);

    expect(scope?.id).toBe('e2e_scope');
    expect(scope?.run).toBe('node scripts/ci/e2e-scope.mts');
    // No secret and no input: the step reads only the event name and Git.
    expect(scope?.env).toBeUndefined();
    // A failed decision writes no output, and E2E runs.
    expect(scope?.['continue-on-error']).toBe(true);
    expect(names.indexOf('Decide whether E2E runs')).toBe(
      names.indexOf('E2E smoke') - 1,
    );
  });

  it('checks out the merge commit with its base, the first parent', () => {
    expect(named('Checkout')?.with?.['fetch-depth']).toBe(2);
  });
});
