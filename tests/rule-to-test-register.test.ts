import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findRuleRegisterProblems,
  parseRuleRegister,
  RULE_REGISTER_PATH,
} from '../scripts/rule-to-test-register';

// DEBT-465 Part 3 (ADR-019 amendment): each business rule names the tests
// that prove it, and a rename or deletion of one of them fails here.

const register = `# Register

### R1. An unfinished session blocks a new one.
- \`src/start.test.ts\`: \`throws CONFLICT when an incomplete session exists\`
- \`tests/integration/start.integration.test.ts\`: \`maps the constraint\`

### R2. A rule with an apostrophe's title.
- \`src/apostrophe.test.ts\`: \`keeps the question's state\`
`;

function source(files: Record<string, string>) {
  return (file: string) => files[file] ?? null;
}

describe('the rule-to-test register check', () => {
  it('parses each rule and the tests that prove it', () => {
    expect(parseRuleRegister(register)).toEqual([
      {
        id: 'R1',
        rule: 'An unfinished session blocks a new one.',
        proofs: [
          {
            file: 'src/start.test.ts',
            title: 'throws CONFLICT when an incomplete session exists',
          },
          {
            file: 'tests/integration/start.integration.test.ts',
            title: 'maps the constraint',
          },
        ],
      },
      {
        id: 'R2',
        rule: "A rule with an apostrophe's title.",
        proofs: [
          {
            file: 'src/apostrophe.test.ts',
            title: "keeps the question's state",
          },
        ],
      },
    ]);
  });

  it('accepts titles written in any quote style, escaped or not', () => {
    const rules = parseRuleRegister(register);

    expect(
      findRuleRegisterProblems(
        rules,
        source({
          'src/start.test.ts':
            "it('throws CONFLICT when an incomplete session exists', () => {});",
          'tests/integration/start.integration.test.ts':
            'it(`maps the constraint`, async () => {});',
          'src/apostrophe.test.ts':
            "it('keeps the question\\'s state', () => {});",
        }),
      ),
    ).toEqual([]);
    expect(
      findRuleRegisterProblems(
        parseRuleRegister(register).slice(1),
        source({
          'src/apostrophe.test.ts':
            'it("keeps the question\'s state", () => {});',
        }),
      ),
    ).toEqual([]);
  });

  it('reports a renamed test, a missing file and a rule with no test', () => {
    const rules = [
      ...parseRuleRegister(register),
      { id: 'R3', rule: 'An unproven rule.', proofs: [] },
    ];

    expect(
      findRuleRegisterProblems(
        rules,
        source({
          'src/start.test.ts':
            "it('throws CONFLICT when a session is incomplete', () => {});",
          'src/apostrophe.test.ts':
            "it('keeps the question\\'s state', () => {});",
        }),
      ),
    ).toEqual([
      'R1: src/start.test.ts has no test titled "throws CONFLICT when an incomplete session exists"',
      'R1: tests/integration/start.integration.test.ts does not exist',
      'R3: names no test',
    ]);
  });

  it('reports a register with no rules', () => {
    expect(findRuleRegisterProblems([], source({}))).toEqual([
      'the register lists no rules',
    ]);
  });

  it('finds every test the live register names', () => {
    const root = path.resolve(__dirname, '..');
    const rules = parseRuleRegister(
      readFileSync(path.join(root, RULE_REGISTER_PATH), 'utf8'),
    );

    expect(
      findRuleRegisterProblems(rules, (file) => {
        const absolute = path.join(root, file);
        return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
      }),
    ).toEqual([]);
  });
});
