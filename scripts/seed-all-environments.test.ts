import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

function createTempRepo(): {
  repoDir: string;
  logFile: string;
  scriptPath: string;
} {
  const repoDir = mkdtempSync(path.join(os.tmpdir(), 'seed-all-envs-'));
  mkdirSync(path.join(repoDir, 'scripts'), { recursive: true });
  mkdirSync(path.join(repoDir, 'content/questions/imported'), {
    recursive: true,
  });
  mkdirSync(path.join(repoDir, 'bin'), { recursive: true });

  const sourceScript = path.join(
    process.cwd(),
    'scripts/seed-all-environments.sh',
  );
  const scriptPath = path.join(repoDir, 'scripts/seed-all-environments.sh');
  copyFileSync(sourceScript, scriptPath);
  chmodSync(scriptPath, 0o755);

  writeFileSync(
    path.join(repoDir, '.env.local'),
    [
      'DATABASE_URL="postgresql://local-user:pw@dev-host/shared_nonprod"',
      'NEXT_PUBLIC_APP_URL="http://localhost:3000"',
      '',
    ].join('\n'),
  );

  writeFileSync(
    path.join(repoDir, 'content/questions/imported/stale.mdx'),
    'stale-content',
  );

  const logFile = path.join(repoDir, 'command.log');
  writeFileSync(logFile, '');

  writeFileSync(
    path.join(repoDir, 'bin/pnpm'),
    [
      '#!/bin/sh',
      'set -eu',
      'printf "pnpm:%s|DATABASE_URL=%s\\n" "$*" "${DATABASE_URL-}" >> "$LOG_FILE"',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(path.join(repoDir, 'bin/pnpm'), 0o755);

  writeFileSync(
    path.join(repoDir, 'bin/npx'),
    [
      '#!/bin/sh',
      'set -eu',
      'if [ "$1" != "vercel" ] || [ "$2" != "env" ] || [ "$3" != "pull" ]; then',
      '  echo "unexpected npx invocation: $*" >&2',
      '  exit 1',
      'fi',
      'out_file="$4"',
      'environment=""',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    --environment=*) environment="${arg#--environment=}" ;;',
      '  esac',
      'done',
      'case "$environment" in',
      '  development)',
      '    db_url="postgresql://dev-user:pw@dev-host/shared_nonprod"',
      '    app_url="http://localhost:3000"',
      '    ;;',
      '  preview)',
      '    db_url="postgresql://preview-user:pw@dev-host/shared_nonprod"',
      '    app_url="https://preview.example.vercel.app"',
      '    ;;',
      '  production)',
      '    db_url="${FAKE_PRODUCTION_DATABASE_URL:-postgresql://prod-user:pw@prod-host/proddb}"',
      '    app_url="https://addictionboards.com"',
      '    ;;',
      '  *)',
      '    echo "unexpected environment: $environment" >&2',
      '    exit 1',
      '    ;;',
      'esac',
      'cat > "$out_file" <<EOF',
      'DATABASE_URL="$db_url"',
      'NEXT_PUBLIC_APP_URL="$app_url"',
      'EOF',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(path.join(repoDir, 'bin/npx'), 0o755);

  return { repoDir, logFile, scriptPath };
}

/**
 * Build a hermetic env for the subprocess. We spread process.env for
 * basics (HOME, TMPDIR, SHELL, etc.) but explicitly strip DATABASE_URL
 * so the test is isolated from CI runners or local .env that set it.
 */
function hermeticEnv(
  repoDir: string,
  logFile: string,
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const { DATABASE_URL: _, ...cleanEnv } = process.env;
  return {
    ...cleanEnv,
    LOG_FILE: logFile,
    PATH: `${path.join(repoDir, 'bin')}:${cleanEnv.PATH ?? ''}`,
    ...overrides,
  };
}

describe('seed-all-environments.sh', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      spawnSync('rm', ['-rf', dir]);
    }
  });

  it('deduplicates shared non-production targets and seeds production separately', () => {
    const { repoDir, logFile, scriptPath } = createTempRepo();
    tempDirs.push(repoDir);

    const output = execFileSync('bash', [scriptPath], {
      cwd: repoDir,
      env: hermeticEnv(repoDir, logFile),
      encoding: 'utf8',
    });

    const commandLog = readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);

    expect(output).toContain(
      'local (.env.local), Vercel development, Vercel preview -> dev-host/shared_nonprod',
    );
    expect(output).toContain('Vercel production -> prod-host/proddb');
    expect(commandLog).toEqual([
      'pnpm:content:import:drafts -- --status published --dry-run|DATABASE_URL=',
      'pnpm:content:import:drafts -- --status published|DATABASE_URL=',
      'pnpm:db:seed|DATABASE_URL=postgresql://local-user:pw@dev-host/shared_nonprod',
      'pnpm:db:seed|DATABASE_URL=postgresql://prod-user:pw@prod-host/proddb',
    ]);
  });

  it('fails fast when production matches a non-production database target', () => {
    const { repoDir, logFile, scriptPath } = createTempRepo();
    tempDirs.push(repoDir);

    const result = spawnSync('bash', [scriptPath], {
      cwd: repoDir,
      env: hermeticEnv(repoDir, logFile, {
        FAKE_PRODUCTION_DATABASE_URL:
          'postgresql://prod-user:pw@dev-host/shared_nonprod',
      }),
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Production DATABASE_URL matches a non-production target',
    );
    expect(readFileSync(logFile, 'utf8')).toBe('');
  });
});
