import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { workflowFiles } from '@/tests/shared/workflow-files';

type Workflow = {
  jobs?: Record<string, { steps?: { run?: string }[] }>;
};

// The scripts each workflow step hands to plain `node`, which a job runs
// without installing dependencies.
function nodeScripts(): string[] {
  return workflowFiles().flatMap((file) =>
    Object.values(
      (parse(readFileSync(file, 'utf8')) as Workflow | null)?.jobs ?? {},
    ).flatMap((job) =>
      (job.steps ?? []).flatMap((step) =>
        [...(step.run ?? '').matchAll(/^\s*node\s+(\S+)/gm)].flatMap(
          ([, script]) => (script ? [script] : []),
        ),
      ),
    ),
  );
}

describe('scripts that workflows run with plain node', () => {
  // This package sets no "type", so Node first parses a .ts file as
  // CommonJS, fails, reparses it as an ES module and warns
  // (MODULE_TYPELESS_PACKAGE_JSON). A .mts file declares its type.
  it('declare themselves ES modules', () => {
    const scripts = nodeScripts();

    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((script) => !script.endsWith('.mts'))).toEqual([]);
  });
});
