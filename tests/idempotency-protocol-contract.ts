import path from 'node:path';
import ts from '@typescript/typescript6';
import { declaredTestTitles } from '../scripts/rule-to-test-register';

export const PROTOCOL_CONTRACT_PATH =
  'app/(app)/app/practice/shared/idempotency-protocol-contract.md';

function declaredNames(source: string, fileName: string): Set<string> {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (node: ts.Node, owners: readonly string[]): void => {
    const name =
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
        ? node.name.text
        : null;
    if (name) {
      names.add(name);
      names.add([...owners, name].join('.'));
    }
    ts.forEachChild(node, (child) =>
      visit(child, name ? [...owners, name] : owners),
    );
  };
  visit(file, []);
  return names;
}

// Each source link names one declaration or running test. Check the document
// itself, so there is no second inventory that can drift away from it.
export function findProtocolReferenceProblems(
  markdown: string,
  readSource: (file: string) => string | null,
): string[] {
  const problems: string[] = [];
  const namesByFile = new Map<string, Set<string> | null>();
  let referenceCount = 0;
  markdown.split('\n').forEach((line, index) => {
    const links = line.matchAll(/\[([^\n]*?)\]\((?:<([^>]+)>|([^\s)]+))\)/g);
    for (const link of links) {
      const label = link[1] ?? '';
      const target = link[2] ?? link[3] ?? '';
      if (!/\.tsx?(?:#.*)?$/.test(target)) continue;
      referenceCount += 1;
      const at = `line ${index + 1}`;
      if (target.includes('#')) {
        problems.push(
          `${at}: source references must name a declaration or test without a line anchor`,
        );
        continue;
      }
      const name = /^`([^`]+)`$/.exec(label)?.[1];
      if (!name) {
        problems.push(
          `${at}: a source link must label one declaration or test title in backticks`,
        );
        continue;
      }
      const file = path.posix.normalize(
        path.posix.join(path.posix.dirname(PROTOCOL_CONTRACT_PATH), target),
      );
      const isTest = /\.(?:test|spec)\.tsx?$/.test(file);
      if (!namesByFile.has(file)) {
        const source = readSource(file);
        namesByFile.set(
          file,
          source === null
            ? null
            : isTest
              ? declaredTestTitles(source, file)
              : declaredNames(source, file),
        );
      }
      const names = namesByFile.get(file);
      if (!names) {
        problems.push(`${at}: ${file} does not exist`);
      } else if (!names.has(name)) {
        problems.push(
          `${at}: ${file} has no ${isTest ? 'running test titled' : 'declaration named'} "${name}"`,
        );
      }
    }
  });
  if (referenceCount === 0)
    problems.push('the contract names no source references');
  return problems;
}
