import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function generateOffline(
  args: string[],
  inspect: (result: ReturnType<typeof spawnSync>, directory: string) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), 'nu-offline-generate-'));
  const root = process.cwd();
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DB_TARGET_ACK;
  try {
    for (const file of [
      'package.json',
      'tsconfig.json',
      'drizzle.generate.config.ts',
    ]) {
      copyFileSync(join(root, file), join(directory, file));
    }
    for (const folder of ['node_modules', 'scripts', 'src'])
      symlinkSync(join(root, folder), join(directory, folder));
    mkdirSync(join(directory, 'db'));
    symlinkSync(join(root, 'db/schema.ts'), join(directory, 'db/schema.ts'));
    writeFileSync(
      join(directory, '.env.local'),
      'DATABASE_URL=not-a-database-url\n',
    );
    inspect(
      spawnSync('pnpm', ['db:generate', ...args], {
        cwd: directory,
        env,
        encoding: 'utf8',
        timeout: 8_000,
      }),
      directory,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it('generates migrations offline', () => {
  generateOffline(['--name=offline_proof'], (result, directory) => {
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(
      readdirSync(join(directory, 'db/migrations')).some((file) =>
        file.endsWith('.sql'),
      ),
    ).toBe(true);
    const metadata = readdirSync(join(directory, 'db/migrations/meta'));
    expect(metadata).toContain('_journal.json');
    expect(metadata.some((file) => file.endsWith('_snapshot.json'))).toBe(true);
    expect(String(result.stdout)).not.toContain('Database target:');
  });
});

// #1567: documentation passes arguments directly. A forwarded separator
// reaches drizzle-kit as given, and nothing is generated.
it('generates nothing when pnpm forwards a separator', () => {
  generateOffline(['--', '--name=offline_proof'], (result, directory) => {
    expect(result.status).not.toBe(0);
    expect(existsSync(join(directory, 'db/migrations'))).toBe(false);
  });
});
