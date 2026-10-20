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
