import ts from 'typescript';

// DEBT-465 Part 3 (ADR-019 amendment): the rule-to-test register states each
// business rule in plain language and names the tests that prove it. This
// check fails when a named file is gone or no longer declares a running test
// with the named title, so a rename, deletion, skip or commented-out test
// cannot silently orphan a rule. A malformed register line is reported too,
// so a rule cannot drop out of the check unseen.

export const RULE_REGISTER_PATH = 'docs/dev/acceptance-testing.md';

export type RuleProof = { readonly file: string; readonly title: string };

export type RegisteredRule = {
  readonly id: string;
  readonly rule: string;
  readonly proofs: readonly RuleProof[];
};

const RULE_HEADING = /^### (R\d+)\. (.+)$/;
const PROOF_LINE = /^- `([^`]+)`: `(.+)`$/;

/**
 * Each `### R<n>. <rule>` heading and the ``- `file`: `title` `` lines under
 * it, and a problem for each `###` line that is not a rule heading, each
 * `` - ` `` line under a rule that is not a proof line, and each repeated
 * rule.
 */
export function parseRuleRegister(markdown: string): {
  rules: RegisteredRule[];
  problems: string[];
} {
  const rules: { id: string; rule: string; proofs: RuleProof[] }[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  markdown.split('\n').forEach((line, index) => {
    const at = `line ${index + 1}`;
    if (line.startsWith('### ')) {
      const heading = RULE_HEADING.exec(line);
      if (!heading?.[1] || !heading[2]) {
        problems.push(`${at}: not a rule heading (### R<n>. <rule>): ${line}`);
        return;
      }
      if (seen.has(heading[1])) {
        problems.push(`${at}: ${heading[1]} is listed twice`);
        return;
      }
      seen.add(heading[1]);
      rules.push({ id: heading[1], rule: heading[2], proofs: [] });
      return;
    }
    const current = rules.at(-1);
    if (!current || !line.startsWith('- `')) return;
    const proof = PROOF_LINE.exec(line);
    if (!proof?.[1] || !proof[2]) {
      problems.push(`${at}: not a proof line (- \`file\`: \`title\`): ${line}`);
      return;
    }
    current.proofs.push({ file: proof[1], title: proof[2] });
  });
  return { rules, problems };
}

const TEST_FUNCTIONS = new Set(['it', 'test']);
// A proof must run unconditionally: a conditional test may not run.
const SKIPPING_MODIFIERS = new Set(['skip', 'todo', 'skipIf', 'runIf']);
const SKIPPING_OPTIONS = new Set(['skip', 'todo']);

type TestCall = { readonly declaresTest: boolean; readonly skipped: boolean };

// What a call's callee declares: `it`/`test` (a test) or `describe` (a
// group), and whether a modifier on the way skips it. `.each` and `.for` are
// tables applied to a test; `.only` and `.concurrent` run it.
function classifyCallee(callee: ts.Expression): TestCall | null {
  if (ts.isIdentifier(callee)) {
    if (TEST_FUNCTIONS.has(callee.text))
      return { declaresTest: true, skipped: false };
    if (callee.text === 'describe')
      return { declaresTest: false, skipped: false };
    return null;
  }
  if (ts.isCallExpression(callee)) return classifyCallee(callee.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    const base = classifyCallee(callee.expression);
    if (!base) return null;
    return {
      declaresTest: base.declaresTest,
      skipped: base.skipped || SKIPPING_MODIFIERS.has(callee.name.text),
    };
  }
  return null;
}

// Whether a call's options object (`{ skip: true }`, `{ todo: true }`)
// skips it.
function skippedByOptions(options: ts.Expression | undefined): boolean {
  return (
    options !== undefined &&
    ts.isObjectLiteralExpression(options) &&
    options.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        SKIPPING_OPTIONS.has(property.name.text) &&
        property.initializer.kind === ts.SyntaxKind.TrueKeyword,
    )
  );
}

// Whether a child runs only under a condition: an `if` or ternary branch, the
// right side of `&&`, `||` or `??`, or a `switch` case. A loop body or a
// `try` block runs, so a test declared there counts.
function isConditionalChild(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isIfStatement(parent)) {
    return child === parent.thenStatement || child === parent.elseStatement;
  }
  if (ts.isConditionalExpression(parent)) {
    return child === parent.whenTrue || child === parent.whenFalse;
  }
  if (ts.isBinaryExpression(parent)) {
    return (
      child === parent.right &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(parent.operatorToken.kind)
    );
  }
  return ts.isCaseClause(parent) || ts.isDefaultClause(parent);
}

/** The titles of the tests a file declares and would run unconditionally. */
export function declaredTestTitles(
  source: string,
  fileName: string,
): Set<string> {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const titles = new Set<string>();
  // `inactive`: skipped, or declared under a condition.
  const visit = (node: ts.Node, inactive: boolean): void => {
    if (ts.isCallExpression(node)) {
      const call = classifyCallee(node.expression);
      if (call) {
        const [first, options] = node.arguments;
        const skipped = inactive || call.skipped || skippedByOptions(options);
        if (
          call.declaresTest &&
          !skipped &&
          first &&
          (ts.isStringLiteral(first) ||
            ts.isNoSubstitutionTemplateLiteral(first))
        ) {
          titles.add(first.text);
        }
        for (const argument of node.arguments) visit(argument, skipped);
        return;
      }
    }
    ts.forEachChild(node, (child) =>
      visit(child, inactive || isConditionalChild(node, child)),
    );
  };
  visit(file, false);
  return titles;
}

/**
 * Each problem as one line; none when every rule names at least one test and
 * every named file still declares a running test with its named title.
 */
export function findRuleRegisterProblems(
  rules: readonly RegisteredRule[],
  readSource: (file: string) => string | null,
): string[] {
  if (rules.length === 0) return ['the register lists no rules'];
  const problems: string[] = [];
  const titlesByFile = new Map<string, Set<string> | null>();
  for (const { id, proofs } of rules) {
    if (proofs.length === 0) problems.push(`${id}: names no test`);
    for (const { file, title } of proofs) {
      if (!titlesByFile.has(file)) {
        const source = readSource(file);
        titlesByFile.set(
          file,
          source === null ? null : declaredTestTitles(source, file),
        );
      }
      const titles = titlesByFile.get(file);
      if (!titles) {
        problems.push(`${id}: ${file} does not exist`);
      } else if (!titles.has(title)) {
        problems.push(`${id}: ${file} has no test titled "${title}"`);
      }
    }
  }
  return problems;
}
