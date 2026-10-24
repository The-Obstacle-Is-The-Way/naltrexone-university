import { readFileSync } from 'node:fs';
import ts from '@typescript/typescript6';
import { beforeAll, describe, expect, it } from 'vitest';
import { configDefaults } from 'vitest/config';
import { parse } from 'yaml';
import { auditExecutedRuleProofs } from './rule-proof-contract.mts';
import { RuleProofReporter } from './rule-proof-reporter.mts';
import {
  parseRuleRegister,
  RULE_REGISTER_PATH,
} from './rule-to-test-register-source-scan.mts';

const configurations = [
  ['unit', 'vitest.config.mts'],
  ['browser', 'vitest.browser.config.mts'],
  ['integration', 'vitest.integration.config.mts'],
] as const;

function hasRequiredReporter(source: string, lane: string): boolean {
  const tree = ts.createSourceFile(
    'vitest.config.mts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const importsReporter = tree.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === './tests/rule-proof-reporter.mts' &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (binding) =>
          binding.name.text === 'RuleProofReporter' && !binding.propertyName,
      ),
  );
  const exported = tree.statements.find(ts.isExportAssignment);
  if (
    !importsReporter ||
    !exported ||
    !ts.isCallExpression(exported.expression) ||
    exported.expression.expression.getText(tree) !== 'defineConfig'
  )
    return false;
  const get = (
    object: ts.Node | undefined,
    name: string,
  ): ts.Expression | undefined => {
    if (
      !object ||
      !ts.isObjectLiteralExpression(object) ||
      object.properties.some(ts.isSpreadAssignment)
    )
      return undefined;
    const properties = object.properties.filter(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(tree) === name,
    );
    return properties.length === 1 &&
      properties[0] &&
      ts.isPropertyAssignment(properties[0])
      ? properties[0].initializer
      : undefined;
  };
  const test = get(exported.expression.arguments[0], 'test');
  if (get(test, 'allowOnly')?.kind !== ts.SyntaxKind.FalseKeyword) return false;
  if (get(test, 'includeTaskLocation')?.kind !== ts.SyntaxKind.TrueKeyword)
    return false;
  const reporters = get(test, 'reporters');
  return Boolean(
    reporters &&
      ts.isArrayLiteralExpression(reporters) &&
      reporters.elements.some(
        (element) =>
          ts.isNewExpression(element) &&
          element.expression.getText(tree) === 'RuleProofReporter' &&
          element.arguments?.length === 1 &&
          element.arguments[0] &&
          ts.isStringLiteral(element.arguments[0]) &&
          element.arguments[0].text === lane,
      ),
  );
}

describe('required rule proof wiring', () => {
  it('does not accept comments or a separate config as reporter wiring', () => {
    expect(
      hasRequiredReporter(
        "// reporters: ['default', new RuleProofReporter('unit')]\n export default defineConfig({ test: { reporters: ['dot'], allowOnly: false } });",
        'unit',
      ),
    ).toBe(false);
    expect(
      hasRequiredReporter(
        "const unused = { reporters: ['default', new RuleProofReporter('unit')], allowOnly: false }; export default defineConfig({ test: { reporters: ['dot'] } });",
        'unit',
      ),
    ).toBe(false);
  });
  describe('the mutation run', () => {
    type Config = { test: Record<string, unknown> & { reporters: unknown[] } };
    let unit: Config;
    let mutation: Config;
    beforeAll(async () => {
      const { vitest } = JSON.parse(
        readFileSync('stryker.config.json', 'utf8'),
      );
      unit = (await import('../vitest.config.mts')).default as Config;
      mutation = (await import(`../${vitest.configFile}`)).default as Config;
    });
    it('runs Stryker on the unit settings without the full-lane receipt, because its runs are partial', () => {
      const { reporters, ...settings } = mutation.test;
      const { reporters: unitReporters, ...unitSettings } = unit.test;
      expect(settings).toEqual(unitSettings);
      expect(unitReporters.some((r) => r instanceof RuleProofReporter)).toBe(
        true,
      );
      expect(reporters.some((r) => r instanceof RuleProofReporter)).toBe(false);
    });
  });
  it.each(configurations)(
    "keeps Vitest's default reporters, with CI's GitHub annotations, in the %s configuration",
    async (_lane, file) => {
      const { default: config } = await import(`../${file}`);
      expect(config.test.reporters).toEqual(
        expect.arrayContaining([...configDefaults.reporters]),
      );
    },
  );
  it.each(configurations)(
    'makes the reporter mandatory in the %s configuration',
    (lane, file) => {
      const source = readFileSync(file, 'utf8');
      expect(hasRequiredReporter(source, lane)).toBe(true);
    },
  );
  it.each(configurations)(
    'gives every parameterized %s proof an explicit original file/title identity',
    (lane) => {
      const { rules } = parseRuleRegister(
        readFileSync(RULE_REGISTER_PATH, 'utf8'),
      );
      const problems = auditExecutedRuleProofs(rules, lane, [], (file) =>
        readFileSync(file, 'utf8'),
      );
      expect(
        problems.filter(
          (problem) =>
            !problem.includes('missing, ambiguous or nonpassing proof in'),
        ),
      ).toEqual([]);
    },
  );
  it('keeps all three required CI lanes on the unfiltered coverage commands', () => {
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
    const runs = Object.values(workflow.jobs).flatMap((job) => {
      if (
        !job ||
        typeof job !== 'object' ||
        !('steps' in job) ||
        !Array.isArray(job.steps)
      )
        return [];
      return job.steps.flatMap((step) =>
        typeof step.run === 'string' &&
        /pnpm test:(?:coverage|integration:coverage|browser:coverage)\b/.test(
          step.run,
        )
          ? [step.run]
          : [],
      );
    });
    expect(runs.sort()).toEqual([
      'pnpm test:browser:coverage',
      'pnpm test:coverage',
      'pnpm test:integration:coverage',
    ]);
  });
  it('keeps full unit and browser gate commands unfiltered and free of reporter overrides', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts.test).toBe('vitest');
    expect(scripts['test:coverage']).toBe('vitest run --coverage');
    expect(scripts['test:browser']).toBe(
      'vitest run --config vitest.browser.config.mts',
    );
    expect(scripts['test:browser:coverage']).toBe(
      'vitest run --config vitest.browser.config.mts --coverage',
    );
    expect(scripts['test:integration']).toBe(
      'tsx scripts/test-lanes/run-local-integration.ts',
    );
    expect(scripts['test:integration:coverage']).toBe(
      'tsx scripts/test-lanes/run-local-integration.ts --coverage',
    );
  });
});
