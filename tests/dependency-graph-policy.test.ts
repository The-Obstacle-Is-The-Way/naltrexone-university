import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// DEBT-506: before Clerk UI 1.38, Clerk's Solana wallet adapters declared
// `react-native` as a peer that only their React Native entry points
// (`index.native.js`) imported; the browser and Node entry points this web app
// resolves never do. pnpm installs a missing non-optional peer by itself, which
// put react-native and its Metro/Jest tooling, shell-quote (alert #82) among
// them, into the install graph until packageExtensions marked the peer
// optional. Clerk UI 1.38 dropped those adapters, and the extensions went with
// them. If an update declares the peer again, this fails first; the remedy is
// in docs/dev/supply-chain-overrides.md, "Required peers a web build never
// imports".
const NEVER_INSTALLED = ['react-native'];

function installedPackageNames(lockfileText: string): string[] {
  const lockfile = parse(lockfileText) as {
    packages?: Record<string, unknown>;
  };
  return Object.keys(lockfile.packages ?? {}).map((key) =>
    key.slice(0, key.lastIndexOf('@')),
  );
}

function neverInstalledPackagesIn(lockfileText: string): string[] {
  return installedPackageNames(lockfileText).filter((name) =>
    NEVER_INSTALLED.includes(name),
  );
}

describe('dependency graph policy', () => {
  it('names react-native when a lockfile installs it', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      'packages:',
      "  '@solana-mobile/wallet-adapter-mobile@2.3.0':",
      '    resolution: {integrity: sha512-a}',
      '  react-native@0.84.1:',
      '    resolution: {integrity: sha512-b}',
      '  shell-quote@1.10.0:',
      '    resolution: {integrity: sha512-c}',
    ].join('\n');

    expect(neverInstalledPackagesIn(lockfile)).toEqual(['react-native']);
  });

  it('keeps react-native out of the installed graph', () => {
    const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');

    expect(installedPackageNames(lockfile)).toContain('@clerk/ui');
    expect(neverInstalledPackagesIn(lockfile)).toEqual([]);
  });
});
