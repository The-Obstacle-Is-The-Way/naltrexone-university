// DEBT-465 Part 3 (ADR-019 amendment): the rule-to-test register states each
// business rule in plain language and names the tests that prove it. This
// check fails when a named test file is gone or no longer holds a test with
// the named title, so a rename or deletion cannot silently orphan a rule.

export const RULE_REGISTER_PATH = 'docs/dev/acceptance-testing.md';

export type RuleProof = { readonly file: string; readonly title: string };

export type RegisteredRule = {
  readonly id: string;
  readonly rule: string;
  readonly proofs: readonly RuleProof[];
};

const RULE_HEADING = /^### (R\d+)\. (.+)$/;
const PROOF_LINE = /^- `([^`]+)`: `(.+)`$/;

/** Each `### R<n>. <rule>` heading and the `- \`file\`: \`title\`` lines under it. */
export function parseRuleRegister(markdown: string): RegisteredRule[] {
  const rules: { id: string; rule: string; proofs: RuleProof[] }[] = [];
  for (const line of markdown.split('\n')) {
    const heading = RULE_HEADING.exec(line);
    if (heading?.[1] && heading[2]) {
      rules.push({ id: heading[1], rule: heading[2], proofs: [] });
      continue;
    }
    const proof = PROOF_LINE.exec(line);
    const current = rules.at(-1);
    if (proof?.[1] && proof[2] && current) {
      current.proofs.push({ file: proof[1], title: proof[2] });
    }
  }
  return rules;
}

// A test title as source code may write it: in single quotes, double quotes
// or backticks, escaping its own quote character.
function titleLiterals(title: string): string[] {
  return [
    `'${title.replaceAll("'", "\\'")}'`,
    `"${title.replaceAll('"', '\\"')}"`,
    `\`${title}\``,
  ];
}

/**
 * Each problem as one line; none when every rule names at least one test and
 * every named file still holds a test with its named title.
 */
export function findRuleRegisterProblems(
  rules: readonly RegisteredRule[],
  readSource: (file: string) => string | null,
): string[] {
  if (rules.length === 0) return ['the register lists no rules'];
  const problems: string[] = [];
  for (const { id, proofs } of rules) {
    if (proofs.length === 0) problems.push(`${id}: names no test`);
    for (const { file, title } of proofs) {
      const source = readSource(file);
      if (source === null) {
        problems.push(`${id}: ${file} does not exist`);
      } else if (
        !titleLiterals(title).some((literal) => source.includes(literal))
      ) {
        problems.push(`${id}: ${file} has no test titled "${title}"`);
      }
    }
  }
  return problems;
}
