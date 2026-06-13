import { type ExecFileException, execFile } from 'node:child_process';
import {
  createLocalTestTargetEnv,
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

export type TestDbCommandOptions = {
  env?: NodeJS.ProcessEnv;
};

export type TestDbCommandRunner = (
  command: string,
  args: string[],
  options?: TestDbCommandOptions,
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
  const commandOptions = createCommandOptions(target);
  const existingContainerId = await findTestDbContainerId({
    runCommand,
    target,
    all: true,
    options: commandOptions,
  });

  if (!existingContainerId) {
    await runRequiredCommand(
      runCommand,
      'docker',
      ['compose', '-p', target.composeProjectName, 'up', '-d', '--wait', 'db'],
      commandOptions,
    );
    await waitForHealthyTestDatabase({
      runCommand,
      sleep,
      target,
      options: commandOptions,
    });
    return 'created';
  }

  await runRequiredCommand(
    runCommand,
    'docker',
    ['compose', '-p', target.composeProjectName, 'up', '-d', '--wait', 'db'],
    commandOptions,
  );
  await waitForHealthyTestDatabase({
    runCommand,
    sleep,
    target,
    options: commandOptions,
  });
  return 'reused';
}

function createCommandOptions(target: LocalTestTarget): TestDbCommandOptions {
  return {
    env: {
      ...process.env,
      ...createLocalTestTargetEnv(target),
    },
  };
}

async function waitForHealthyTestDatabase({
  runCommand,
  sleep,
  target,
  options,
}: Required<
  Pick<EnsureLocalTestDatabaseInput, 'runCommand' | 'sleep' | 'target'>
> & {
  options: TestDbCommandOptions;
}): Promise<void> {
  for (let attempt = 1; attempt <= MAX_HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    const activeContainerId = await findTestDbContainerId({
      runCommand,
      target,
      all: false,
      options,
    });

    if (!activeContainerId) {
      if (attempt < MAX_HEALTH_CHECK_ATTEMPTS) {
        await sleep(HEALTH_CHECK_INTERVAL_MS);
      }
      continue;
    }

    const status = await runRequiredCommand(
      runCommand,
      'docker',
      ['inspect', '--format', HEALTH_STATUS_FORMAT, activeContainerId],
      options,
    );

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
  options,
}: {
  runCommand: TestDbCommandRunner;
  target: LocalTestTarget;
  all: boolean;
  options: TestDbCommandOptions;
}): Promise<string | null> {
  const result = await runCommand(
    'docker',
    [
      'compose',
      '-p',
      target.composeProjectName,
      'ps',
      all ? '-aq' : '-q',
      'db',
    ],
    options,
  );

  if (result.exitCode !== 0) return null;

  const [containerId] = result.stdout.trim().split(/\s+/);
  return containerId || null;
}

async function runRequiredCommand(
  runCommand: TestDbCommandRunner,
  command: string,
  args: string[],
  options: TestDbCommandOptions,
): Promise<TestDbCommandResult> {
  const result = await runCommand(command, args, options);
  if (result.exitCode === 0) return result;

  throw new Error(
    `Command failed: ${command} ${args.join(' ')}\n${result.stderr}`.trim(),
  );
}

export async function runTestDbCommand(
  command: string,
  args: string[],
  options: TestDbCommandOptions = {},
): Promise<TestDbCommandResult> {
  return new Promise((resolve) => {
    const handleResult = (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
    ) => {
      resolve({
        exitCode: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
        stdout,
        stderr,
      });
    };

    if (options.env) {
      execFile(
        command,
        args,
        { encoding: 'utf8', env: options.env },
        handleResult,
      );
      return;
    }

    execFile(command, args, handleResult);
  });
}

async function sleepFor(ms: number): Promise<void> {
  /* v8 ignore next -- real timer wrapper; callers inject sleep in tests. */
  await new Promise((resolve) => setTimeout(resolve, ms));
}
