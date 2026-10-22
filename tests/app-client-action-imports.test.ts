import { readFileSync } from 'node:fs';
import ts from '@typescript/typescript6';
import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';
import { findServerActionModules } from '@/tests/server-action-source-scan';

// BUG-365: app code calls server actions through the entitlement-aware client
// module, which sends a learner who lost their subscription to Pricing. A
// direct import would skip that redirect.
const CLIENT_ACTIONS_MODULE = 'app/(app)/app/shared/client-actions.ts';
const CONTROLLER_ACTIONS_DIRECTORY = 'src/adapters/controllers/';
// Static or dynamic, through the alias or a relative path.
const DIRECT_ACTION_IMPORT =
  /(?:from\s+|import\s*\(\s*)['"][^'"]*adapters\/controllers\/[a-z-]+-actions(?:\.ts)?['"]/;
const TEST_SUPPORT = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.browser.spec.tsx',
  '**/*.browser.setup.ts',
  '**/*-test-helpers.ts',
  '**/*-test-helpers.tsx',
];

function directActionImports(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(
      ([file, source]) =>
        file !== CLIENT_ACTIONS_MODULE && DIRECT_ACTION_IMPORT.test(source),
    )
    .map(([file]) => file)
    .sort();
}

// The parentheses in a route group are glob syntax, so each root is a base path.
function sourceFiles(root: string): string[] {
  return globSync('**/*.{ts,tsx}', { cwd: root, ignore: TEST_SUPPORT }).map(
    (file) => `${root}/${file}`,
  );
}

// Each export must be redirectOnUnsubscribed((input) => <module>.<name>(input)):
// the redirect, around the controller action of the same name.
function wrapsItsAction(name: string, value: ts.Expression | undefined) {
  if (
    !value ||
    !ts.isCallExpression(value) ||
    value.expression.getText() !== 'redirectOnUnsubscribed' ||
    value.arguments.length !== 1
  )
    return false;
  const [action] = value.arguments;
  if (!action || !ts.isArrowFunction(action)) return false;
  const [parameter, ...extraParameters] = action.parameters;
  const call = action.body;
  if (
    !parameter ||
    extraParameters.length > 0 ||
    !ts.isCallExpression(call) ||
    !ts.isPropertyAccessExpression(call.expression)
  )
    return false;
  const [argument, ...extraArguments] = call.arguments;
  return (
    call.expression.name.text === name &&
    extraArguments.length === 0 &&
    argument?.getText() === parameter.name.getText()
  );
}

function clientActionExports(source: string): {
  names: string[];
  issues: string[];
} {
  const ast = ts.createSourceFile(
    CLIENT_ACTIONS_MODULE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names: string[] = [];
  const issues: string[] = [];
  for (const statement of ast.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement))
      issues.push(`exports another way: ${statement.getText()}`);
    else if (exported && !ts.isVariableStatement(statement))
      issues.push(`exports another way: ${statement.getText()}`);
    else if (exported && ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText();
        if (wrapsItsAction(name, declaration.initializer)) names.push(name);
        else issues.push(`${name} does not redirect around its own action`);
      }
  }
  return { names, issues };
}

describe('app client action imports', () => {
  it('reports a page module that imports a server action directly', () => {
    expect(
      directActionImports({
        'app/(app)/app/x/hooks/use-x.ts':
          "import { getTags } from '@/src/adapters/controllers/tag-actions';",
        'app/(app)/app/x/hooks/use-relative.ts':
          "import { getTags } from '../../../../../src/adapters/controllers/tag-actions';",
        'components/x/lazy.tsx':
          "const actions = await import('@/src/adapters/controllers/tag-actions.ts');",
        [CLIENT_ACTIONS_MODULE]:
          "import * as tagActions from '@/src/adapters/controllers/tag-actions';",
        'app/(app)/app/x/hooks/use-y.ts':
          "import { getTags } from '@/app/(app)/app/shared/client-actions';",
      }),
    ).toEqual([
      'app/(app)/app/x/hooks/use-relative.ts',
      'app/(app)/app/x/hooks/use-x.ts',
      'components/x/lazy.tsx',
    ]);
  });

  it('routes every app page and component action through the client actions module', () => {
    const files = [
      ...sourceFiles('app/(app)/app'),
      ...sourceFiles('components'),
    ];
    expect(files).toContain('app/(app)/app/layout.tsx');
    expect(files).toContain('components/mobile-nav.tsx');
    expect(
      directActionImports(
        Object.fromEntries(
          files.map((file) => [file, readFileSync(file, 'utf8')]),
        ),
      ),
    ).toEqual([]);
  });

  it('reports a client action that skips the redirect or calls another action', () => {
    expect(
      clientActionExports(
        [
          'export const getTags = redirectOnUnsubscribed((input) => tagActions.getTags(input));',
          'export const submitAnswer = (input: unknown) => questionActions.submitAnswer(input);',
          'export const setBookmark = redirectOnUnsubscribed((input) => bookmarkActions.getBookmarkStatus(input));',
          "export { rateQuestion } from './elsewhere';",
        ].join('\n'),
      ),
    ).toEqual({
      names: ['getTags'],
      issues: [
        'submitAnswer does not redirect around its own action',
        'setBookmark does not redirect around its own action',
        "exports another way: export { rateQuestion } from './elsewhere';",
      ],
    });
  });

  it('wraps every controller action in the Pricing redirect', () => {
    const { names, issues } = clientActionExports(
      readFileSync(CLIENT_ACTIONS_MODULE, 'utf8'),
    );
    const controllerActions = findServerActionModules()
      .filter(({ file }) => file.startsWith(CONTROLLER_ACTIONS_DIRECTORY))
      .flatMap(({ exportedActions }) => exportedActions);

    expect(issues).toEqual([]);
    expect(controllerActions.length).toBeGreaterThan(0);
    expect([...names].sort()).toEqual([...controllerActions].sort());
  });
});
