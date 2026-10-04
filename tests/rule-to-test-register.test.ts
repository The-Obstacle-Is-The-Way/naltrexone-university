import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  declaredTestTitles,
  findRuleRegisterProblems,
  parseRuleRegister,
  RULE_REGISTER_PATH,
} from '../scripts/rule-to-test-register';

// DEBT-465 Part 3 (ADR-019 amendment): each business rule names the tests
// that prove it, and a rename or deletion of one of them fails here.

const register = `# Register

- **Format.** A proof line is \`- \\\`path\\\`: \\\`title\\\`\`.

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
    expect(parseRuleRegister(register)).toEqual({
      rules: [
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
      ],
      problems: [],
    });
  });

  it('reports a malformed rule heading', () => {
    const { problems } = parseRuleRegister(`### R1. A rule.
- \`src/a.test.ts\`: \`a title\`
### R2 A heading without its period.
`);

    expect(problems).toEqual([
      'line 3: not a rule heading (### R<n>. <rule>): ### R2 A heading without its period.',
    ]);
  });

  it('reports a malformed proof line', () => {
    const { problems } = parseRuleRegister(`### R1. A rule.
- \`src/b.test.ts\` \`a title without its colon\`
`);

    expect(problems).toEqual([
      'line 2: not a proof line (- `file`: `title`): - `src/b.test.ts` `a title without its colon`',
    ]);
  });

  it('reports a repeated rule number', () => {
    const { problems } = parseRuleRegister(`### R1. A rule.
- \`src/a.test.ts\`: \`a title\`
### R1. The same rule again.
- \`src/c.test.ts\`: \`another title\`
`);

    expect(problems).toEqual(['line 3: R1 is listed twice']);
  });

  it('accepts a test declared in any quote style, escaped or not, and through each', () => {
    const { rules } = parseRuleRegister(register);

    expect(
      findRuleRegisterProblems(
        rules,
        source({
          'src/start.test.ts':
            "it('throws CONFLICT when an incomplete session exists', () => {});",
          'tests/integration/start.integration.test.ts':
            'test.each([1, 2])(`maps the constraint`, async () => {});',
          'src/apostrophe.test.ts':
            "describe('x', () => { it('keeps the question\\'s state', () => {}); });",
        }),
      ),
    ).toEqual([]);
  });

  it('reports a renamed test, a missing file and a rule with no test', () => {
    const { rules } = parseRuleRegister(register);

    expect(
      findRuleRegisterProblems(
        [...rules, { id: 'R3', rule: 'An unproven rule.', proofs: [] }],
        source({
          'src/start.test.ts':
            "it('throws CONFLICT when a session is incomplete', () => {});",
          'src/apostrophe.test.ts':
            'it("keeps the question\'s state", () => {});',
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

  it('counts only tests that run unconditionally: not a commented-out, skipped, todo or conditional test, nor one in a skipped describe', () => {
    expect(
      declaredTestTitles(
        `// it('commented out', () => {});
const note = 'a title in a string';
it.skip('skipped', () => {});
it.todo('todo');
test.skipIf(true)('skipped if', () => {});
test.runIf(false)('run if', () => {});
it('skipped by option', { skip: true }, () => {});
it('skipped by a quoted option', { 'skip': true }, () => {});
it('todo by option', { todo: true });
describe.skip('skipped group', () => {
  it('inside a skipped group', () => {});
});
describe('group skipped by option', { skip: true }, () => {
  it('inside a group skipped by option', () => {});
});
describe('group', () => {
  it('runs', () => {});
  it('runs with options', { timeout: 1000 }, () => {});
  it('runs with skip false', { skip: false }, () => {});
  for (const n of [1]) it('runs in a loop', () => {});
  it.each([1])('runs for %i', () => {});
  test.only('runs alone', () => {});
});
it(\`a template title\`, () => {});`,
        'example.test.ts',
      ),
    ).toEqual(
      new Set([
        'runs',
        'runs with options',
        'runs with skip false',
        'runs in a loop',
        'runs for %i',
        'runs alone',
        'a template title',
      ]),
    );
  });

  it('counts no test declared under a condition', () => {
    expect(
      declaredTestTitles(
        `if (process.env.RUN_PROOF) it('in an if', () => {});
if (flag) {} else { it('in an else', () => {}); }
flag ? it('in a ternary', () => {}) : undefined;
flag && it('after and', () => {});
flag || it('after or', () => {});
value ?? it('after nullish', () => {});
switch (mode) { case 'a': it('in a case', () => {}); }
try { it('in a try', () => {}); } catch { it('in a catch', () => {}); } finally { it('in a finally', () => {}); }
it('runs', () => {});
it('left of and', () => {}) && undefined;`,
        'example.test.ts',
      ),
    ).toEqual(new Set(['runs', 'left of and', 'in a try', 'in a finally']));
  });

  it('finds every test the live register names', () => {
    const root = path.resolve(__dirname, '..');
    const { rules, problems } = parseRuleRegister(
      readFileSync(path.join(root, RULE_REGISTER_PATH), 'utf8'),
    );

    expect([
      ...problems,
      ...findRuleRegisterProblems(rules, (file) => {
        const absolute = path.join(root, file);
        return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
      }),
    ]).toEqual([]);
  });
});
