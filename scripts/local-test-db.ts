import { execFile } from 'node:child_process';
import {
  type LocalTestTarget,
  resolveLocalTestTarget,
} from './resolve-local-test-target';

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
  target?: LocalTestTarget;
};

type EnsureLocalTestDatabaseResult = 'created' | 'reused';

export async function ensureLocalTestDatabase({
  runCommand = runTestDbCommand,
  sleep = sleepFor,
  target = resolveLocalTestTarget(),
}: EnsureLocalTestDatabaseInput = {}): Promise<EnsureLocalTestDatabaseResult> {
  const existingContainerId = await findTestDbContainerId({
    runCommand,
    target,
    all: true,
  });

  if (!existingContainerId) {
    await runRequiredCommand(runCommand, 'pnpm', ['db:test:up']);
    await waitForHealthyTestDatabase({ runCommand, sleep, target });
    return 'created';
  }

  await runRequiredCommand(runCommand, 'docker', [
    'compose',
    '-p',
    target.composeProjectName,
    'up',
    '-d',
    '--wait',
    'db',
  ]);
  await waitForHealthyTestDatabase({
    runCommand,
    sleep,
    target,
    containerId: existingContainerId,
  });
  return 'reused';
}

async function waitForHealthyTestDatabase({
  runCommand,
  sleep,
  target,
  containerId,
}: Required<
  Pick<EnsureLocalTestDatabaseInput, 'runCommand' | 'sleep' | 'target'>
> & {
  containerId?: string;
}): Promise<void> {
  for (let attempt = 1; attempt <= MAX_HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    const activeContainerId =
      containerId ??
      (await findTestDbContainerId({ runCommand, target, all: false }));

    if (!activeContainerId) {
      if (attempt < MAX_HEALTH_CHECK_ATTEMPTS) {
        await sleep(HEALTH_CHECK_INTERVAL_MS);
      }
      continue;
    }

    const status = await runRequiredCommand(runCommand, 'docker', [
      'inspect',
      '--format',
      HEALTH_STATUS_FORMAT,
      activeContainerId,
    ]);

    if (status.stdout.trim() === 'healthy') return;

    if (attempt < MAX_HEALTH_CHECK_ATTEMPTS) {
      await sleep(HEALTH_CHECK_INTERVAL_MS);
    }
  }

  throw new Error(
    `Local test database service "db" in Compose project "${target.composeProjectName}" did not become healthy.`,
  );
}

async function findTestDbContainerId({
  runCommand,
  target,
  all,
}: {
  runCommand: TestDbCommandRunner;
  target: LocalTestTarget;
  all: boolean;
}): Promise<string | null> {
  const result = await runCommand('docker', [
    'compose',
    '-p',
    target.composeProjectName,
    'ps',
    all ? '-aq' : '-q',
    'db',
  ]);

  if (result.exitCode !== 0) return null;

  const [containerId] = result.stdout.trim().split(/\s+/);
  return containerId || null;
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
