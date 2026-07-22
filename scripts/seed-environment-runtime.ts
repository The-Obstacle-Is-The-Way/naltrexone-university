import { type ChildProcess, spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import type {
  SeedEnvironmentDependencies,
  VercelSeedEnvironment,
} from './seed-environment-targets';

type SeedEnvironmentRuntime = {
  dependencies: SeedEnvironmentDependencies;
  cleanup: () => Promise<void>;
};

export function createSeedEnvironmentRuntime(
  tempDirectory: string,
): SeedEnvironmentRuntime {
  return {
    dependencies: {
      readLocalDatabaseUrl: () => readDatabaseUrlFromFile('.env.local'),
      pullDatabaseUrl: (environment) =>
        pullVercelDatabaseUrl(tempDirectory, environment),
      prepareCorpus,
      seedDatabase,
      log: console.info,
    },
    cleanup: () => rm(tempDirectory, { recursive: true, force: true }),
  };
}

async function pullVercelDatabaseUrl(
  tempDirectory: string,
  environment: VercelSeedEnvironment,
): Promise<string> {
  const outputPath = path.join(tempDirectory, `${environment}.env`);
  await runProcess(
    'npx',
    ['vercel', 'env', 'pull', outputPath, `--environment=${environment}`],
    process.env,
    true,
  );
  return readDatabaseUrlFromFile(outputPath);
}

async function readDatabaseUrlFromFile(filePath: string): Promise<string> {
  let parsed: Record<string, string>;
  try {
    parsed = dotenv.parse(await readFile(filePath));
  } catch {
    throw new Error(
      `Unable to read the required environment file ${filePath}.`,
    );
  }

  const databaseUrl = parsed.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is missing from ${filePath}.`);
  }
  return databaseUrl;
}

async function prepareCorpus(): Promise<void> {
  await runProcess(
    'pnpm',
    ['content:import:drafts', '--', '--status', 'published', '--dry-run'],
    process.env,
  );
  await rm(path.join('content', 'questions', 'imported'), {
    recursive: true,
    force: true,
  });
  await runProcess(
    'pnpm',
    ['content:import:drafts', '--', '--status', 'published'],
    process.env,
  );
}

async function seedDatabase(databaseUrl: string): Promise<void> {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };
  delete childEnv.DB_TARGET_ACK;
  await runProcess(
    'pnpm',
    ['exec', 'tsx', 'scripts/internal/run-managed-db-seed.ts'],
    childEnv,
  );
}

async function runProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  quiet = false,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, [...args], {
      env,
      stdio: quiet ? ['inherit', 'ignore', 'inherit'] : 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`Seed environment command failed (${reason}).`));
    });
  });
}
