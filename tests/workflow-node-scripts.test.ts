import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { workflowFiles } from '@/tests/shared/workflow-files';

type Workflow = {
  jobs?: Record<string, { steps?: { run?: string }[] }>;
};

// The scripts one step's `run` hands to plain `node`, at the start of a
// line or after a shell separator.
function scriptsRunByNode(run: string): string[] {
  return [...run.matchAll(/(?:^|&&|\|\||[;|])\s*node\s+(\S+)/gm)].flatMap(
    ([, script]) => (script ? [script] : []),
  );
}

// The scripts each workflow step hands to plain `node`, which a job runs
// without installing dependencies.
function nodeScripts(): string[] {
  return workflowFiles().flatMap((file) =>
    Object.values(
      (parse(readFileSync(file, 'utf8')) as Workflow | null)?.jobs ?? {},
    ).flatMap((job) =>
      (job.steps ?? []).flatMap((step) => scriptsRunByNode(step.run ?? '')),
    ),
  );
}

describe('scripts that workflows run with plain node', () => {
  it.each([
    'node scripts/check.ts',
    'echo ready && node scripts/check.ts',
    'test -f x || node scripts/check.ts',
    'echo ready; node scripts/check.ts',
    'cat input | node scripts/check.ts',
  ])('finds the script in `%s`', (run) => {
    expect(scriptsRunByNode(run)).toEqual(['scripts/check.ts']);
  });

  // This package sets no "type", so Node first parses a .ts file as
  // CommonJS, fails, reparses it as an ES module and warns
  // (MODULE_TYPELESS_PACKAGE_JSON). A .mts file declares its type.
  it('declare themselves ES modules', () => {
    const scripts = nodeScripts();

    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((script) => !script.endsWith('.mts'))).toEqual([]);
  });
});
