import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findProtocolReferenceProblems,
  PROTOCOL_CONTRACT_PATH,
} from './idempotency-protocol-contract';

const sourcePath = 'app/(app)/app/practice/shared/flow.ts';
const testPath = 'app/(app)/app/practice/shared/flow.test.ts';
const symbolLink = '[`runFlow`](<./flow.ts>)';
const testLink = '[`rejects a stale response`](<./flow.test.ts>)';

function check(markdown: string, files: Record<string, string> = {}) {
  return findProtocolReferenceProblems(markdown, (file) => files[file] ?? null);
}

describe('idempotency protocol references', () => {
  it('keeps a declaration reference valid when unrelated lines move', () => {
    expect(
      check(symbolLink, {
        [sourcePath]: '\n// unrelated edit\nexport function runFlow() {}',
      }),
    ).toEqual([]);
  });

  it.each([
    ['deleted', 'export function otherFlow() {}'],
    ['only mentioned', '// runFlow\nconst text = "runFlow";'],
    ['only called', 'runFlow();'],
    ['only imported', 'import { runFlow } from "./other";'],
  ])('rejects a symbol that is %s', (_reason, source) => {
    expect(check(symbolLink, { [sourcePath]: source })).toEqual([
      `line 1: ${sourcePath} has no declaration named "runFlow"`,
    ]);
  });

  it('checks a nested declaration against its named owner', () => {
    const source = 'function useFlow() { const onSubmit = () => {}; }';
    expect(
      check('[`useFlow.onSubmit`](<./flow.ts>)', { [sourcePath]: source }),
    ).toEqual([]);
    expect(
      check('[`useOtherFlow.onSubmit`](<./flow.ts>)', { [sourcePath]: source }),
    ).toEqual([
      `line 1: ${sourcePath} has no declaration named "useOtherFlow.onSubmit"`,
    ]);
  });

  it('recognizes types, variables and function declarations', () => {
    expect(
      check(
        '[`RequestToken`](<./flow.ts>) [`currentKey`](<./flow.ts>) ' +
          symbolLink,
        {
          [sourcePath]:
            'type RequestToken = string; const currentKey = "key"; function runFlow() {}',
        },
      ),
    ).toEqual([]);
  });

  it('rejects a missing file and a test moved out of its named file', () => {
    expect(check(symbolLink)).toEqual([`line 1: ${sourcePath} does not exist`]);
    expect(
      check(testLink, { [testPath]: 'it("other test", () => {});' }),
    ).toEqual([
      `line 1: ${testPath} has no running test titled "rejects a stale response"`,
    ]);
  });

  it('checks the exact title of a running test', () => {
    expect(
      check(testLink, {
        [testPath]: 'it("rejects a stale response", () => {});',
      }),
    ).toEqual([]);
  });

  it.each([
    '// it("rejects a stale response", () => {});',
    'it.skip("rejects a stale response", () => {});',
    'describe.skip("group", () => { it("rejects a stale response", () => {}); });',
    'if (enabled) it("rejects a stale response", () => {});',
  ])('rejects a proof that does not run: %s', (source) => {
    expect(check(testLink, { [testPath]: source })).toEqual([
      `line 1: ${testPath} has no running test titled "rejects a stale response"`,
    ]);
  });

  it('rejects line anchors and unnamed source links instead of ignoring them', () => {
    expect(check('[`runFlow`](<./flow.ts#L42>)')).toEqual([
      'line 1: source references must name a declaration or test without a line anchor',
    ]);
    expect(check('[the implementation](<./flow.ts>)')).toEqual([
      'line 1: a source link must label one declaration or test title in backticks',
    ]);
  });

  it('ignores document links but refuses a contract with no source references', () => {
    expect(check('[an ADR](<./decision.md#amendment>)')).toEqual([
      'the contract names no source references',
    ]);
  });

  it('keeps every named declaration and test in the repository contract valid', () => {
    const markdown = readFileSync(PROTOCOL_CONTRACT_PATH, 'utf8');
    expect(
      findProtocolReferenceProblems(markdown, (file) =>
        existsSync(file) ? readFileSync(file, 'utf8') : null,
      ),
    ).toEqual([]);
  });
});
