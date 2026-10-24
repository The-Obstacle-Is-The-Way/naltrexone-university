import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { restoreProcessEnv, snapshotProcessEnv } from './process-env';

// Shape-only executable stub for default adapter wiring. Policy/state scenarios
// use their maintained interface fakes; real process transport is tested separately.
export async function withRecordedCli<T>(
  name: string,
  stdout: string,
  check: (calls: () => string[][]) => Promise<T>,
  failure?: { stderr: string; status: number },
): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'nu-cli-wiring-'));
  const env = snapshotProcessEnv();
  const record = join(directory, 'calls.jsonl');
  writeFileSync(record, '');
  const executable = join(directory, name);
  writeFileSync(
    executable,
    `#!${process.execPath}\n` +
      `require('node:fs').appendFileSync(${JSON.stringify(record)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n` +
      `process.stdout.write(${JSON.stringify(stdout)});\n` +
      (failure
        ? `process.stderr.write(${JSON.stringify(failure.stderr)}); process.exit(${failure.status});\n`
        : ''),
  );
  chmodSync(executable, 0o700);
  process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ''}`;
  try {
    return await check(() =>
      readFileSync(record, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
  } finally {
    restoreProcessEnv(env);
    rmSync(directory, { recursive: true, force: true });
  }
}
