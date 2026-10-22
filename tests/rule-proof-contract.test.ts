import { describe, expect, it } from 'vitest';
import {
  auditExecutedRuleProofs,
  type ExecutedProof,
  type ProofLane,
} from './rule-proof-contract.mts';

const shared = 'tests/shared/question-availability-contract.ts';
const consumers = {
  unit: 'src/application/test-helpers/fakes/fake-question-repository-contract.test.ts',
  integration:
    'tests/integration/question-availability-contract.integration.test.ts',
};
const proof = { file: shared, title: 'proof' };
const rules = [{ id: 'R1', rule: 'A rule.', proofs: [proof] }];
const annotated = `export function contract() { it('proof', { meta: { ruleProof: ${JSON.stringify(proof)} } }, () => {}); }`;
function audit(
  lane: ProofLane,
  results: ExecutedProof[],
  sharedSource = annotated,
  consumerSource = 'contract();',
) {
  const sources = new Map([
    [shared, sharedSource],
    [consumers.unit, consumerSource],
    [consumers.integration, consumerSource],
  ]);
  return auditExecutedRuleProofs(rules, lane, results, (file) => {
    const source = sources.get(file);
    if (source === undefined) throw new Error(`Missing source: ${file}`);
    return source;
  });
}

describe('shared proof consumer identity', () => {
  it.each(['unit', 'integration'] as const)(
    'requires the %s consumer independently',
    (lane) => {
      const other = lane === 'unit' ? 'integration' : 'unit';
      expect(
        audit(lane, [
          { file: consumers[other], title: 'proof', state: 'passed', proof },
        ]),
      ).not.toEqual([]);
      expect(
        audit(lane, [
          { file: consumers[lane], title: 'proof', state: 'passed', proof },
        ]),
      ).toEqual([]);
    },
  );
  it('refuses an unannotated plain shared declaration, even when a consumer has a matching title', () => {
    expect(
      audit(
        'unit',
        [{ file: consumers.unit, title: 'proof', state: 'passed' }],
        "export function contract() { it('proof', () => {}); }",
        "it('proof', () => {});",
      ),
    ).not.toEqual([]);
  });
  it('does not let a local same-title test stand in for an annotated shared declaration', () => {
    expect(
      audit(
        'unit',
        [{ file: consumers.unit, title: 'proof', state: 'passed' }],
        annotated,
        "it('proof', () => {});",
      ),
    ).not.toEqual([]);
  });
  it.each(['pending', 'skipped', 'failed'])(
    'rejects a %s shared result',
    (state) => {
      expect(
        audit('unit', [{ file: consumers.unit, title: 'proof', state, proof }]),
      ).not.toEqual([]);
    },
  );
  it('rejects ambiguous plain shared results', () => {
    const result = {
      file: consumers.unit,
      title: 'proof',
      state: 'passed',
      proof,
    };
    expect(audit('unit', [result, result])).not.toEqual([]);
  });
});

describe('end-to-end proofs', () => {
  it.each(['unit', 'browser', 'integration'] as const)(
    'leaves an end-to-end proof to the register check in the %s lane, since no Vitest lane runs it',
    (lane) => {
      const e2e = { file: 'tests/e2e/checkout.spec.ts', title: 'cancels' };
      expect(
        auditExecutedRuleProofs(
          [{ id: 'R1', rule: 'A rule.', proofs: [e2e] }],
          lane,
          [],
          () => "test('cancels', async () => {});",
        ),
      ).toEqual([]);
    },
  );
});

describe('plain proofs and their metadata', () => {
  const file = 'tests/plain.test.ts';
  function auditPlain(
    source: string,
    results: ExecutedProof[] = [],
    title = 'proof',
  ) {
    return auditExecutedRuleProofs(
      [{ id: 'R1', rule: 'A rule.', proofs: [{ file, title }] }],
      'unit',
      results,
      () => source,
    ).join('\n');
  }
  const passed = (line: number, column: number): ExecutedProof => ({
    file,
    title: 'proof',
    state: 'passed',
    location: { line, column },
  });

  it('accepts a plain proof that ran at its declared location', () => {
    expect(auditPlain("it('proof', () => {});", [passed(1, 1)])).toBe('');
  });
  it('rejects a same-title result reported at another location', () => {
    expect(auditPlain("it('proof', () => {});", [passed(2, 1)])).toContain(
      'R1: missing, ambiguous or nonpassing proof in tests/plain.test.ts: proof',
    );
  });
  it('requires literal metadata on a parameterized proof', () => {
    expect(
      auditPlain("it.each([1])('proof %i', () => {});", [], 'proof %i'),
    ).toContain(
      'parameterized or shared proof needs literal file/title metadata',
    );
  });
  it.each([
    [
      'metadata naming another declaration',
      `it('proof', { meta: { ruleProof: { file: '${file}', title: 'other' } } }, () => {});`,
      'Metadata does not identify its registered owning declaration',
    ],
    [
      'shorthand metadata',
      `const ruleProof = { file: '${file}', title: 'proof' }; it('proof', { meta: { ruleProof } }, () => {});`,
      'Rule proof metadata requires an ordinary literal property',
    ],
    [
      'metadata outside the declaration options',
      `const options = { meta: { ruleProof: { file: '${file}', title: 'proof' } } }; it('proof', options, () => {});`,
      'Rule proof metadata must be literal declaration options',
    ],
    [
      'metadata assigned at runtime',
      `const options = { meta: {} }; options.meta.ruleProof = { file: '${file}', title: 'proof' }; it('proof', () => {});`,
      'Rule proof metadata cannot be reassigned at runtime',
    ],
  ])('rejects %s', (_name, source, problem) => {
    expect(auditPlain(source, [passed(1, 1)])).toContain(problem);
  });
  it.each([
    ['missing', "it('other', () => {});"],
    ['repeated', "it('proof', () => {}); it('proof', () => {});"],
  ])('rejects a %s declaration', (_name, source) => {
    expect(auditPlain(source, [passed(1, 1)])).toContain(
      'R1: ambiguous or missing declaration tests/plain.test.ts: proof',
    );
  });
  it('refuses a proof file that no test lane runs', () => {
    expect(() =>
      auditExecutedRuleProofs(
        [
          {
            id: 'R1',
            rule: 'A rule.',
            proofs: [{ file: 'docs/plain.md', title: 'proof' }],
          },
        ],
        'unit',
        [],
        () => '',
      ),
    ).toThrow('No required test lane for docs/plain.md');
  });
});
