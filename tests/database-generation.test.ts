import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
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

it.each([{ separator: [] }, { separator: ['--'] }])(
  'generates migrations offline with separator $separator',
  ({ separator }) => {
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
      const result = spawnSync(
        'pnpm',
        ['db:generate', ...separator, '--name=offline_proof'],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
          timeout: 8_000,
        },
      );
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(
        readdirSync(join(directory, 'db/migrations')).some((file) =>
          file.endsWith('.sql'),
        ),
      ).toBe(true);
      const metadata = readdirSync(join(directory, 'db/migrations/meta'));
      expect(metadata).toContain('_journal.json');
      expect(metadata.some((file) => file.endsWith('_snapshot.json'))).toBe(
        true,
      );
      expect(result.stdout).not.toContain('Database target:');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
