import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vitest';

function needsClerkAuthFixture(source: string): boolean {
  const file = ts.createSourceFile(
    'spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let signsIn = false;
  let importsBaseTest = false;
  let importsFixtureTest = false;

  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      ['signInWithClerkPassword', 'E2E_CLERK_AUTH_STATE_PATH'].includes(
        node.text,
      )
    ) {
      signsIn = true;
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const bindings = node.importClause?.namedBindings;
      const importsTest =
        bindings &&
        (ts.isNamespaceImport(bindings) ||
          bindings.elements.some(
            (entry) => (entry.propertyName ?? entry.name).text === 'test',
          ));
      if (importsTest) {
        if (node.moduleSpecifier.text === '@playwright/test')
          importsBaseTest = true;
        if (node.moduleSpecifier.text === './helpers/clerk-auth-test')
          importsFixtureTest = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return signsIn && (importsBaseTest || !importsFixtureTest);
}

function untracedSignedInSpecs(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.spec.ts'))
    .filter((file) =>
      needsClerkAuthFixture(readFileSync(join(directory, file), 'utf8')),
    );
}

describe('signed-in E2E diagnostic fixture policy', () => {
  it.each(['signInWithClerkPassword(page)', 'E2E_CLERK_AUTH_STATE_PATH'])(
    'rejects the base test when a spec uses %s',
    (authentication) => {
      expect(
        needsClerkAuthFixture(`
          import { test, expect } from '@playwright/test';
          ${authentication};
        `),
      ).toBe(true);
    },
  );

  it('rejects an aliased base test even beside the fixture', () => {
    expect(
      needsClerkAuthFixture(`
        import { test as untracedTest } from '@playwright/test';
        import { test } from './helpers/clerk-auth-test';
        signInWithClerkPassword(page);
      `),
    ).toBe(true);
  });

  it('accepts the fixture and a separate Playwright expect import', () => {
    expect(
      needsClerkAuthFixture(`
        import { expect } from '@playwright/test';
        import { test as tracedTest } from './helpers/clerk-auth-test';
        tracedTest.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });
      `),
    ).toBe(false);
  });

  it('allows an unsigned diagnostic contract and ignores comments and text', () => {
    expect(
      needsClerkAuthFixture(`
        import { test } from '@playwright/test';
        // signInWithClerkPassword(page)
        test('E2E_CLERK_AUTH_STATE_PATH', async () => {});
      `),
    ).toBe(false);
  });

  it('names a signed-in spec in a nested directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'clerk-fixture-policy-'));
    try {
      mkdirSync(join(directory, 'nested'));
      writeFileSync(
        join(directory, 'nested/session.spec.ts'),
        `import { test } from '@playwright/test';
         test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH });`,
      );
      expect(untracedSignedInSpecs(directory)).toEqual([
        'nested/session.spec.ts',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps every signed-in repository spec on the diagnostic fixture', () => {
    const directory = join(process.cwd(), 'tests/e2e');
    expect(readdirSync(directory).length).toBeGreaterThan(0);
    expect(untracedSignedInSpecs(directory)).toEqual([]);
  });
});
