import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runFromCommandLine } from './scan-playwright-output';

// BUG-328: the failure-output upload publishes only what this scan has read
// in full and found free of Clerk credentials. Anything it cannot read as
// text, it refuses instead of trying to decode.
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

  const scan = (files: Record<string, string | Buffer>) => {
    const out = output();
    const code = runFromCommandLine(['test-results'], withFiles(files), out);
    return { code, lines: out.lines };
  };

  it('refuses to run without a directory to scan', () => {
    const out = output();

    expect(runFromCommandLine([], withFiles({}), out)).toBe(2);
    expect(out.lines).toEqual([
      'usage: scan-playwright-output.ts <directory>...',
    ]);
  });

  it('passes when there is no output to upload', () => {
    expect(scan({})).toEqual({
      code: 0,
      lines: ['no Playwright output to scan'],
    });
  });

  it('passes clean text output, printing counts', () => {
    expect(
      scan({
        'test-results/run/error-context.md': '# Page snapshot',
        'test-results/run/notes.json': '{"status":"failed"}',
      }),
    ).toEqual({
      code: 0,
      lines: [
        'Playwright output: 2 files; parameter=0 devBrowserToken=0 jsonWebToken=0',
      ],
    });
  });

  // Clerk development instances put the dev-browser token in redirect URLs,
  // which an error message can quote.
  it('fails on a credential, printing counts and never the value', () => {
    const { code, lines } = scan({
      'test-results/run/error-context.md':
        'navigated to "http://localhost:3000/app?__clerk_db_jwt=secretvalue123"',
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('parameter=1');
    expect(lines.join('\n')).not.toContain('secretvalue123');
  });

  it('finds a credential in an encoded form', () => {
    expect(
      scan({
        'test-results/run/error-context.md':
          'redirect_url=%2Fapp%3F__clerk_testing_token%3Dvalue1',
      }).code,
    ).toBe(1);
  });

  it.each([
    ['a zip', 'test-results/data/0a1b.zip', Buffer.from('PK\u0003\u0004')],
    ['an HTML report', 'test-results/report/index.html', '<html></html>'],
    ['an image', 'test-results/run/test-failed-1.png', Buffer.from([0x89])],
    ['a file without an extension', 'test-results/run/blob', 'text'],
  ])('refuses %s, whose type it does not read', (_label, name, content) => {
    expect(scan({ [name]: content })).toEqual({
      code: 1,
      lines: [
        `refused ${name}: not a text type the scan reads`,
        'Playwright output: 1 files; parameter=0 devBrowserToken=0 jsonWebToken=0',
      ],
    });
  });

  it.each([
    ['invalid UTF-8', Buffer.from([0x23, 0xff, 0xfe])],
    ['UTF-16 text', Buffer.from('# page\n', 'utf16le')],
  ])('refuses a text file holding %s', (_label, content) => {
    expect(
      scan({ 'test-results/run/error-context.md': content }).lines[0],
    ).toBe('refused test-results/run/error-context.md: not UTF-8 text');
  });

  it('refuses a symbolic link, which the upload would follow', () => {
    const dir = withFiles({ 'outside/secret.md': 'dvb_2abcDEF345ghi' });
    mkdirSync(path.join(dir, 'test-results'));
    symlinkSync(
      path.join(dir, 'outside/secret.md'),
      path.join(dir, 'test-results/link.md'),
    );
    const out = output();

    expect(runFromCommandLine(['test-results'], dir, out)).toBe(1);
    expect(out.lines[0]).toBe(
      'refused test-results/link.md: not a regular file',
    );
  });

  // The upload excludes hidden files and trace.zip, so they never leave the
  // runner; the stored auth state lives in the hidden `.auth` directory.
  it('skips what the upload never publishes', () => {
    expect(
      scan({
        'test-results/.auth/e2e-user.json': '{"value":"dvb_2abcDEF345ghi"}',
        'test-results/.last-run.json': '{"status":"failed"}',
        'test-results/run/trace.zip': Buffer.from('PK\u0003\u0004'),
      }),
    ).toEqual({ code: 0, lines: ['no Playwright output to scan'] });
  });

  // Only a missing directory means there is nothing to upload.
  it('fails closed when it cannot read a directory', () => {
    const dir = withFiles({ 'test-results': 'a file, not a directory' });

    expect(() => runFromCommandLine(['test-results'], dir, output())).toThrow(
      'ENOTDIR',
    );
  });

  it('scans only the directories it is given', () => {
    const dir = withFiles({
      'playwright-report/index.html': '__clerk_db_jwt=value1',
      'test-results/run/error-context.md': '# Page snapshot',
    });

    expect(runFromCommandLine(['test-results'], dir, output())).toBe(0);
  });
});
