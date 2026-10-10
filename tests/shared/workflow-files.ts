import { globSync } from 'node:fs';

// GitHub Actions reads both extensions, so every workflow contract
// discovers both (#1444 review).
export function workflowFiles(directory = '.github/workflows'): string[] {
  return globSync(`${directory}/*.{yml,yaml}`).sort();
}

// A workflow's Postgres image values, plain or quoted.
export function postgresImages(text: string): string[] {
  return [...text.matchAll(/image:\s*['"]?([^'"\s]*postgres[^'"\s]*)/g)].map(
    ([, image = '']) => image,
  );
}
