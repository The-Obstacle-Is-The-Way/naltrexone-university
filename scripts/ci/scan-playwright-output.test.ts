import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  runFromCommandLine,
  scanPlaywrightReport,
} from './scan-playwright-output';

type Entry = { name: string; text: string; store?: boolean; flags?: number };

// A zip of the shape Playwright writes: local file headers, deflated or stored.
function zipOf(entries: Entry[]) {
  return Buffer.concat(
    entries.flatMap(({ name, text, store, flags = 0x0800 }) => {
      const raw = Buffer.from(text, 'utf8');
      const data = store ? raw : deflateRawSync(raw);
      const nameBytes = Buffer.from(name, 'utf8');
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(flags, 6);
      header.writeUInt16LE(store ? 0 : 8, 8);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(raw.length, 22);
      header.writeUInt16LE(nameBytes.length, 26);
      return [header, nameBytes, data];
    }),
  );
}

function reportOf(entries: Entry[], outside = '', zip = zipOf(entries)) {
  return `<!doctype html><html><body>${outside}<template id="playwrightReportBase64">data:application/zip;base64,${zip.toString('base64')}</template></body></html>`;
}

const clean = [{ name: 'report.json', text: '{"steps":["GET /app"]}' }];

// BUG-328: Clerk development tokens hid inside the zip Playwright embeds in
// its HTML report, where a plain-text scan could not see them.
describe('scanPlaywrightReport', () => {
  it('finds nothing in a clean report, and reads its embedded data', () => {
    expect(scanPlaywrightReport(reportOf(clean))).toEqual({
      entries: 1,
      found: { clerkDbJwt: 0, devBrowserToken: 0, clerkTestingToken: 0 },
    });
  });

  it.each([
    ['clerkDbJwt', 'GET https://x.clerk.test/v1/client?__clerk_db_jwt=abc123'],
    ['devBrowserToken', 'cookie dvb_2abcDEF345'],
    ['clerkTestingToken', 'GET /v1/me?__clerk_testing_token=xyz789'],
  ])('counts %s inside the embedded data', (shape, text) => {
    const scan = scanPlaywrightReport(
      reportOf([...clean, { name: 'steps.json', text }]),
    );

    expect(scan.found[shape as keyof typeof scan.found]).toBe(1);
  });

  it('reads stored entries too', () => {
    const scan = scanPlaywrightReport(
      reportOf([{ name: 'a.json', text: 'dvb_2abc', store: true }]),
    );

    expect(scan.found.devBrowserToken).toBe(1);
  });

  it('counts a shape outside the embedded data as well', () => {
    const scan = scanPlaywrightReport(
      reportOf(clean, '<p>__clerk_db_jwt=leaked</p>'),
    );

    expect(scan.found.clerkDbJwt).toBe(1);
  });

  // A scan that cannot see the embedded data would pass blindly, as BUG-307's
  // closure scan did.
  it('fails closed when it cannot find the embedded data', () => {
    expect(() =>
      scanPlaywrightReport('<html><body>no data</body></html>'),
    ).toThrow('embedded report data not found');
  });

  it('fails closed on an entry whose sizes follow its data', () => {
    expect(() =>
      scanPlaywrightReport(
        reportOf([], '', zipOf([{ name: 'a', text: 'x', flags: 0x0808 }])),
      ),
    ).toThrow('cannot be read');
  });

  it('fails closed when the zip stops before its end', () => {
    expect(() =>
      scanPlaywrightReport(
        reportOf([], '', Buffer.concat([zipOf(clean), Buffer.from('junk')])),
      ),
    ).toThrow('cannot be read');
  });
});

describe('runFromCommandLine', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  const output = () => {
    const lines: string[] = [];
    return {
      lines,
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
  };

  const withFiles = (files: Record<string, string | Buffer>) => {
    root = mkdtempSync(path.join(tmpdir(), 'pw-output-'));
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), content);
    }
    return root;
  };

  it('refuses to run without a directory to scan', () => {
    const out = output();

    expect(runFromCommandLine([], withFiles({}), out)).toBe(2);
    expect(out.lines).toEqual([
      'usage: scan-playwright-output.ts <directory>...',
    ]);
  });

  it('passes when there is no output to upload', () => {
    const out = output();

    expect(runFromCommandLine(['test-results'], withFiles({}), out)).toBe(0);
    expect(out.lines).toEqual(['no Playwright output to scan']);
  });

  it('passes clean output, printing counts', () => {
    const out = output();
    const dir = withFiles({
      'test-results/run/error-context.md': '# Page snapshot',
      'test-results/.last-run.json': '{"status":"failed"}',
    });

    expect(runFromCommandLine(['test-results'], dir, out)).toBe(0);
    expect(out.lines).toEqual([
      'Playwright output: 2 files, 0 zip entries; clerkDbJwt=0 devBrowserToken=0 clerkTestingToken=0',
    ]);
  });

  // Clerk development instances put the dev-browser token in redirect URLs,
  // which an error message can quote.
  it('fails on a token in the output, printing counts and never the value', () => {
    const out = output();
    const dir = withFiles({
      'test-results/run/error-context.md':
        'navigating to "http://localhost:3000/app?__clerk_db_jwt=secretvalue123"',
    });

    expect(runFromCommandLine(['test-results'], dir, out)).toBe(1);
    expect(out.lines.join('\n')).toContain('clerkDbJwt=1');
    expect(out.lines.join('\n')).not.toContain('secretvalue123');
  });

  it('decodes an HTML report it finds', () => {
    const dir = withFiles({
      'test-results/copy/index.html': reportOf([
        { name: 's.json', text: 'cookie dvb_2abc' },
      ]),
    });

    expect(runFromCommandLine(['test-results'], dir, output())).toBe(1);
  });

  it('opens zip files', () => {
    const dir = withFiles({
      'test-results/data/0a1b.zip': zipOf([
        { name: 'trace.network', text: '__clerk_testing_token=abc' },
      ]),
    });

    expect(runFromCommandLine(['test-results'], dir, output())).toBe(1);
  });

  // The upload excludes these, so they never leave the runner.
  it('skips the stored auth state and trace.zip files', () => {
    const dir = withFiles({
      'test-results/.auth/e2e-user.json': '{"value":"dvb_2abc"}',
      'test-results/run/trace.zip': zipOf([
        { name: 'trace.network', text: '__clerk_db_jwt=abc' },
      ]),
    });

    expect(runFromCommandLine(['test-results'], dir, output())).toBe(0);
  });

  it('scans only the directories it is given', () => {
    const dir = withFiles({
      'playwright-report/index.html': reportOf([
        { name: 's.json', text: '__clerk_db_jwt=abc' },
      ]),
      'test-results/run/error-context.md': '# Page snapshot',
    });

    expect(runFromCommandLine(['test-results'], dir, output())).toBe(0);
  });
});
