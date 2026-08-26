import ts from 'typescript';
import type { SkipPolicySourceFile } from './skip-policy-source-scan-files';

const CONTROL_TOKEN_PATTERN = /\b(?:fixme|only|runIf|skip|skipIf|todo)\b/;

export function mayContainFrameworkControl(
  source: SkipPolicySourceFile,
): boolean {
  // Candidate pruning only: the scanner's AST classifier remains authoritative.
  // Escaped identifiers and static strings must still be parsed.
  return (
    CONTROL_TOKEN_PATTERN.test(source.contents) ||
    source.contents.includes('\\u') ||
    source.contents.includes('\\x')
  );
}

export function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (
    filePath.endsWith('.js') ||
    filePath.endsWith('.mjs') ||
    filePath.endsWith('.cjs')
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
