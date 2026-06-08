import { execFile } from 'node:child_process';

export const TEST_DB_CONTAINER_NAME = 'naltrexone-test-db';

const HEALTH_STATUS_FORMAT =
  '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}';
const MAX_HEALTH_CHECK_ATTEMPTS = 60;
const HEALTH_CHECK_INTERVAL_MS = 1_000;

export type TestDbCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type TestDbCommandRunner = (
  command: string,
  args: string[],
) => Promise<TestDbCommandResult>;

type EnsureLocalTestDatabaseInput = {
  runCommand?: TestDbCommandRunner;
  sleep?: (ms: number) => Promise<void>;
};

type EnsureLocalTestDatabaseResult = 'created' | 'reused';

export async function ensureLocalTestDatabase({
  runCommand = runTestDbCommand,
  sleep = sleepFor,
}: EnsureLocalTestDatabaseInput = {}): Promise<EnsureLocalTestDatabaseResult> {
  const existingContainer = await runCommand('docker', [
    'inspect',
    TEST_DB_CONTAINER_NAME,
  ]);

  if (existingContainer.exitCode !== 0) {
    await runRequiredCommand(runCommand, 'pnpm', ['db:test:up']);
    return 'created';
  }

  await runRequiredCommand(runCommand, 'docker', [
    'start',
    TEST_DB_CONTAINER_NAME,
  ]);
  await waitForHealthyTestDatabase({ runCommand, sleep });
  return 'reused';
}

async function waitForHealthyTestDatabase({
  runCommand,
  sleep,
}: Required<EnsureLocalTestDatabaseInput>): Promise<void> {
  for (let attempt = 1; attempt <= MAX_HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    const status = await runRequiredCommand(runCommand, 'docker', [
      'inspect',
      '--format',
      HEALTH_STATUS_FORMAT,
      TEST_DB_CONTAINER_NAME,
    ]);

    if (status.stdout.trim() === 'healthy') return;

    if (attempt < MAX_HEALTH_CHECK_ATTEMPTS) {
      await sleep(HEALTH_CHECK_INTERVAL_MS);
    }
  }

  throw new Error(
    `Local test database container "${TEST_DB_CONTAINER_NAME}" did not become healthy.`,
  );
}

async function runRequiredCommand(
  runCommand: TestDbCommandRunner,
  command: string,
  args: string[],
): Promise<TestDbCommandResult> {
  const result = await runCommand(command, args);
  if (result.exitCode === 0) return result;

  throw new Error(
    `Command failed: ${command} ${args.join(' ')}\n${result.stderr}`.trim(),
  );
}

export async function runTestDbCommand(
  command: string,
  args: string[],
): Promise<TestDbCommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      resolve({
        exitCode: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

async function sleepFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
