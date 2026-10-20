import ts from '@typescript/typescript6';
import type {
  RegisteredRule,
  RuleProof,
} from './rule-to-test-register-source-scan.mts';

export type ProofLane = 'unit' | 'browser' | 'integration';
export type ExecutedProof = {
  file: string;
  title: string;
  state: string;
  location?: { line: number; column: number } | undefined;
  proof?: RuleProof | undefined;
};

export const SHARED_PROOF_CONSUMERS: Readonly<
  Record<string, readonly string[]>
> = {
  'tests/shared/question-availability-contract.ts': [
    'src/application/test-helpers/fakes/fake-question-repository-contract.test.ts',
    'tests/integration/question-availability-contract.integration.test.ts',
  ],
  'tests/shared/attempt-score-contract.ts': [
    'src/application/test-helpers/fakes/fake-attempt-repository-score-contract.test.ts',
    'tests/integration/attempt-score-contract.integration.test.ts',
  ],
};

function laneFor(file: string): ProofLane {
  if (/^tests\/integration\/.*\.test\.ts$/.test(file)) return 'integration';
  if (file.endsWith('.browser.spec.tsx')) return 'browser';
  if (/\.test\.tsx?$/.test(file)) return 'unit';
  throw new Error(`No required test lane for ${file}`);
}

function property(
  node: ts.Node | undefined,
  name: string,
): ts.Expression | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
  const found = node.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name,
  );
  return found && ts.isPropertyAssignment(found)
    ? found.initializer
    : undefined;
}

function literal(node: ts.Node | undefined): string | undefined {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function testCallee(expression: ts.Expression): boolean {
  let callee = expression;
  while (ts.isCallExpression(callee) || ts.isPropertyAccessExpression(callee))
    callee = callee.expression;
  return ts.isIdentifier(callee) && ['it', 'test'].includes(callee.text);
}

// This reads identity and parameterization, not JavaScript reachability.
function declarations(source: string, proof: RuleProof) {
  const file = ts.createSourceFile(
    proof.file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: {
    parameterized: boolean;
    annotated: boolean;
    location: { line: number; column: number };
  }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      literal(node.arguments[0]) === proof.title
    ) {
      let callee = node.expression;
      let parameterized = false;
      while (
        ts.isCallExpression(callee) ||
        ts.isPropertyAccessExpression(callee)
      ) {
        if (
          ts.isPropertyAccessExpression(callee) &&
          ['each', 'for'].includes(callee.name.text)
        )
          parameterized = true;
        callee = callee.expression;
      }
      if (ts.isIdentifier(callee) && ['it', 'test'].includes(callee.text)) {
        const metadata = property(
          property(node.arguments[1], 'meta'),
          'ruleProof',
        );
        const position = file.getLineAndCharacterOfPosition(
          node.getStart(file),
        );
        found.push({
          location: { line: position.line + 1, column: position.character + 1 },
          parameterized,
          annotated:
            literal(property(metadata, 'file')) === proof.file &&
            literal(property(metadata, 'title')) === proof.title,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function annotationProblems(
  source: string,
  file: string,
  registered: ReadonlySet<string>,
): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const allowed = new Set<ts.Node>();
  const problems: string[] = [];
  const visitCalls = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const annotation = property(
        property(node.arguments[1], 'meta'),
        'ruleProof',
      );
      if (annotation && testCallee(node.expression)) {
        allowed.add(annotation);
        const title = literal(node.arguments[0]);
        if (
          literal(property(annotation, 'file')) !== file ||
          literal(property(annotation, 'title')) !== title ||
          !registered.has(JSON.stringify([file, title]))
        ) {
          problems.push(
            `Metadata does not identify its registered owning declaration in ${file}`,
          );
        }
      }
    }
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(tree);
  const visitMetadata = (node: ts.Node) => {
    if (
      (ts.isShorthandPropertyAssignment(node) &&
        node.name.text === 'ruleProof') ||
      (ts.isPropertyAssignment(node) &&
        ts.isComputedPropertyName(node.name) &&
        literal(node.name.expression) === 'ruleProof')
    ) {
      problems.push(
        `Rule proof metadata requires an ordinary literal property in ${file}`,
      );
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'ruleProof' &&
      !allowed.has(node.initializer)
    ) {
      problems.push(
        `Rule proof metadata must be literal declaration options in ${file}`,
      );
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ((ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === 'ruleProof') ||
        (ts.isElementAccessExpression(node.left) &&
          literal(node.left.argumentExpression) === 'ruleProof'))
    ) {
      problems.push(
        `Rule proof metadata cannot be reassigned at runtime in ${file}`,
      );
    }
    ts.forEachChild(node, visitMetadata);
  };
  visitMetadata(tree);
  return problems;
}

export function auditExecutedRuleProofs(
  rules: readonly RegisteredRule[],
  lane: ProofLane,
  results: readonly ExecutedProof[],
  readSource: (file: string) => string,
  annotatedSources: ReadonlyMap<string, string> = new Map(),
): string[] {
  const problems: string[] = [];
  const registered = new Set(
    rules.flatMap((rule) =>
      rule.proofs.map((proof) => JSON.stringify([proof.file, proof.title])),
    ),
  );
  const sources = new Map(annotatedSources);
  for (const proof of rules.flatMap((rule) => rule.proofs)) {
    const consumers = SHARED_PROOF_CONSUMERS[proof.file] ?? [proof.file];
    if (!consumers.some((file) => laneFor(file) === lane)) continue;
    for (const file of [
      proof.file,
      ...consumers.filter((file) => laneFor(file) === lane),
    ]) {
      if (!sources.has(file)) sources.set(file, readSource(file));
    }
  }
  for (const [file, source] of sources)
    problems.push(...annotationProblems(source, file, registered));
  for (const rule of rules) {
    for (const proof of rule.proofs) {
      const consumers = SHARED_PROOF_CONSUMERS[proof.file] ?? [proof.file];
      const assigned = consumers.filter((file) => laneFor(file) === lane);
      if (assigned.length === 0) continue;
      const declared = declarations(sources.get(proof.file) ?? '', proof);
      if (declared.length !== 1) {
        problems.push(
          `${rule.id}: ambiguous or missing declaration ${proof.file}: ${proof.title}`,
        );
        continue;
      }
      const parameterized = declared[0]?.parameterized;
      const needsIdentity =
        parameterized || Object.hasOwn(SHARED_PROOF_CONSUMERS, proof.file);
      if (needsIdentity && !declared[0]?.annotated) {
        problems.push(
          `${rule.id}: parameterized or shared proof needs literal file/title metadata: ${proof.file}: ${proof.title}`,
        );
        continue;
      }
      for (const consumer of assigned) {
        const matching = results.filter(
          (result) =>
            result.file === consumer &&
            (needsIdentity
              ? result.proof?.file === proof.file &&
                result.proof.title === proof.title
              : result.title === proof.title &&
                result.location?.line === declared[0]?.location.line &&
                result.location?.column === declared[0]?.location.column),
        );
        if (
          matching.length === 0 ||
          (!parameterized && matching.length !== 1) ||
          matching.some((result) => result.state !== 'passed')
        ) {
          problems.push(
            `${rule.id}: missing, ambiguous or nonpassing proof in ${consumer}: ${proof.title}`,
          );
        }
      }
    }
  }
  return problems;
}
