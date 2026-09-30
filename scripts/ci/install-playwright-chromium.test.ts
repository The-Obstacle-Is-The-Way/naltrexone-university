import { execFile, spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const INSTALL_SCRIPT = 'scripts/ci/install-playwright-chromium.sh';
// The command-line pattern the script stops leftover apt-get by (BUG-311).
const APT_GET_PATTERN = '(^|/)apt-get( |$)';

async function createHarness(
  firstDependencyInstallHangs: boolean,
  { firstPhaseLeavesAptRunning = false, leftoverAptIgnoresTerm = false } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'playwright-install-'));
  const aptRoot = join(root, 'etc', 'apt');
  const sourcesDir = join(aptRoot, 'sources.list.d');
  const binDir = join(root, 'bin');
  const logPath = join(root, 'pnpm.log');
  const counterPath = join(root, 'counter');
  const aptLockPath = join(root, 'apt-lock');
  const processLogPath = join(root, 'process.log');
  const ubuntuSource = join(sourcesDir, 'ubuntu.sources');
  const microsoftSource = join(sourcesDir, 'microsoft-prod.list');
  const aptConfigDir = join(aptRoot, 'apt.conf.d');
  const unrelatedAptConfig = join(aptConfigDir, '99microsoft-proxy');
  await mkdir(sourcesDir, { recursive: true });
  await mkdir(aptConfigDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(
    ubuntuSource,
    'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\n',
  );
  await writeFile(
    microsoftSource,
    'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n',
  );
  await writeFile(
    unrelatedAptConfig,
    'Acquire::https::Proxy::packages.microsoft.com "DIRECT";\n',
  );
  const pnpmScript = `#!/bin/sh
printf '%s\\n' "$*" >> "$PLAYWRIGHT_TEST_LOG"
if [ "$3" = "install-deps" ]; then
  count=0
  if [ -f "$PLAYWRIGHT_TEST_COUNTER" ]; then count=$(cat "$PLAYWRIGHT_TEST_COUNTER"); fi
  count=$((count + 1))
  printf '%s' "$count" > "$PLAYWRIGHT_TEST_COUNTER"
  if [ -f "$PLAYWRIGHT_TEST_APT_LOCK" ] && kill -0 "$(cat "$PLAYWRIGHT_TEST_APT_LOCK")" 2>/dev/null; then
    echo "E: Could not get lock /var/lib/apt/lists/lock. It is held by process $(cat "$PLAYWRIGHT_TEST_APT_LOCK") (apt-get)" >&2
    exit 100
  fi
  if [ "$PLAYWRIGHT_TEST_LEAVE_APT" = "true" ] && [ "$count" -eq 1 ]; then
    node -e "require('node:child_process').spawn(process.argv[1], [], { detached: true, stdio: 'ignore' }).unref()" "$PLAYWRIGHT_TEST_APT_GET"
    while [ ! -s "$PLAYWRIGHT_TEST_APT_LOCK" ]; do sleep 0.1; done
  fi
  if [ "$PLAYWRIGHT_TEST_HANG_FIRST" = "true" ] && [ "$count" -eq 1 ]; then sleep 20; fi
  if [ "$PLAYWRIGHT_TEST_FAIL_DEPS" = "true" ]; then exit 23; fi
fi
exit 0
`;
  const sudoScript = '#!/bin/sh\nexec "$@"\n';
  // Stands in for the root apt-get a timed-out phase leaves behind: detached,
  // so the script's `timeout` cannot reach it, and holding apt's lists lock.
  const aptGetScript = `#!/bin/sh
${leftoverAptIgnoresTerm ? "trap '' TERM\n" : ''}echo $$ > "$PLAYWRIGHT_TEST_APT_LOCK"
sleep 30
`;
  // The script finds leftover apt-get by command line. These stand-ins act only
  // on this harness's fake, so a test never matches or signals a host process,
  // and they log the pattern the script asked for.
  const pgrepScript = `#!/bin/sh
printf 'pgrep %s\\n' "$*" >> "$PLAYWRIGHT_TEST_PROCESS_LOG"
pid=$(cat "$PLAYWRIGHT_TEST_APT_LOCK" 2>/dev/null) || exit 1
kill -0 "$pid" 2>/dev/null || exit 1
echo "$pid"
`;
  const pkillScript = `#!/bin/sh
printf 'pkill %s\\n' "$*" >> "$PLAYWRIGHT_TEST_PROCESS_LOG"
pid=$(cat "$PLAYWRIGHT_TEST_APT_LOCK" 2>/dev/null) || exit 1
kill "$1" "$pid" 2>/dev/null
`;
  await writeFile(join(binDir, 'apt-get'), aptGetScript);
  await writeFile(join(binDir, 'pgrep'), pgrepScript);
  await writeFile(join(binDir, 'pkill'), pkillScript);
  await chmod(join(binDir, 'apt-get'), 0o755);
  await chmod(join(binDir, 'pgrep'), 0o755);
  await chmod(join(binDir, 'pkill'), 0o755);
  await writeFile(join(binDir, 'pnpm'), pnpmScript);
  await writeFile(join(binDir, 'sudo'), sudoScript);
  await chmod(join(binDir, 'pnpm'), 0o755);
  await chmod(join(binDir, 'sudo'), 0o755);

  return {
    root,
    ubuntuSource,
    microsoftSource,
    unrelatedAptConfig,
    logPath,
    aptLockPath,
    processLogPath,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      PLAYWRIGHT_APT_ROOT: aptRoot,
      PLAYWRIGHT_PRIMARY_DEPS_TIMEOUT_SECONDS: '1',
      PLAYWRIGHT_FALLBACK_DEPS_TIMEOUT_SECONDS: '3',
      PLAYWRIGHT_BROWSER_TIMEOUT_SECONDS: '3',
      PLAYWRIGHT_KILL_AFTER_SECONDS: '1',
      PLAYWRIGHT_TEST_LOG: logPath,
      PLAYWRIGHT_TEST_COUNTER: counterPath,
      PLAYWRIGHT_TEST_HANG_FIRST: String(firstDependencyInstallHangs),
      PLAYWRIGHT_TEST_FAIL_DEPS: 'false',
      PLAYWRIGHT_TEST_APT_LOCK: aptLockPath,
      PLAYWRIGHT_TEST_PROCESS_LOG: processLogPath,
      PLAYWRIGHT_TEST_APT_GET: join(binDir, 'apt-get'),
      PLAYWRIGHT_TEST_LEAVE_APT: String(firstPhaseLeavesAptRunning),
    },
  };
}

function isRunning(pid: string): boolean {
  try {
    process.kill(Number(pid.trim()), 0);
    return true;
  } catch {
    return false;
  }
}

function stopIfRunning(pid: string): void {
  if (isRunning(pid)) process.kill(Number(pid.trim()), 'SIGKILL');
}

describe('install-playwright-chromium.sh', () => {
  it('kills a hung apt phase, preserves Ubuntu sources, and retries through the archive failover', async () => {
    const harness = await createHarness(true);
    await chmod(harness.ubuntuSource, 0o640);
    const sourceBefore = await stat(harness.ubuntuSource);
    const startedAt = Date.now();

    await execFileAsync('bash', [INSTALL_SCRIPT], { env: harness.env });

    expect(Date.now() - startedAt).toBeLessThan(7_000);
    expect(await readFile(harness.logPath, 'utf8')).toBe(
      'exec playwright install-deps chromium\n' +
        'exec playwright install-deps chromium\n' +
        'exec playwright install chromium\n',
    );
    expect(await readFile(harness.ubuntuSource, 'utf8')).toContain(
      'http://archive.ubuntu.com/ubuntu',
    );
    const sourceAfter = await stat(harness.ubuntuSource);
    expect(sourceAfter.ino).toBe(sourceBefore.ino);
    expect(sourceAfter.mode & 0o777).toBe(0o640);
    await expect(stat(harness.microsoftSource)).rejects.toThrow();
    await expect(stat(harness.unrelatedAptConfig)).resolves.toBeDefined();
  });

  // BUG-311: `timeout` runs as the runner user and cannot stop the root
  // apt-get that `install-deps` started through sudo; the orphan kept apt's
  // lists lock and the retry failed at once.
  it.each([
    ['stops', false],
    ['kills, when it ignores TERM,', true],
  ])(
    '%s an apt-get the timed-out phase left holding the lock, then retries',
    async (_how, leftoverAptIgnoresTerm) => {
      const harness = await createHarness(true, {
        firstPhaseLeavesAptRunning: true,
        leftoverAptIgnoresTerm,
      });
      try {
        await execFileAsync('bash', [INSTALL_SCRIPT], { env: harness.env });

        expect(await readFile(harness.logPath, 'utf8')).toBe(
          'exec playwright install-deps chromium\n' +
            'exec playwright install-deps chromium\n' +
            'exec playwright install chromium\n',
        );
        expect(isRunning(await readFile(harness.aptLockPath, 'utf8'))).toBe(
          false,
        );
        const signals = (await readFile(harness.processLogPath, 'utf8'))
          .split('\n')
          .filter((line) => line.startsWith('pkill '));
        expect(signals).toEqual(
          leftoverAptIgnoresTerm
            ? [
                `pkill -TERM -f ${APT_GET_PATTERN}`,
                `pkill -KILL -f ${APT_GET_PATTERN}`,
              ]
            : [`pkill -TERM -f ${APT_GET_PATTERN}`],
        );
      } finally {
        stopIfRunning(await readFile(harness.aptLockPath, 'utf8'));
      }
    },
  );

  it('matches apt-get command lines, and not its methods or wrappers', () => {
    const matches = (commandLine: string) =>
      spawnSync('grep', ['-Eq', APT_GET_PATTERN], { input: commandLine })
        .status === 0;

    expect(matches('apt-get update')).toBe(true);
    expect(
      matches('/usr/bin/apt-get install -y --no-install-recommends libnss3'),
    ).toBe(true);
    expect(matches('/usr/lib/apt/methods/http')).toBe(false);
    expect(matches('sh -c apt-get update && apt-get install -y libnss3')).toBe(
      false,
    );
  });

  it('does not rewrite a healthy Ubuntu archive path', async () => {
    const harness = await createHarness(false);

    await execFileAsync('bash', [INSTALL_SCRIPT], { env: harness.env });

    expect(await readFile(harness.logPath, 'utf8')).toBe(
      'exec playwright install-deps chromium\n' +
        'exec playwright install chromium\n',
    );
    expect(await readFile(harness.ubuntuSource, 'utf8')).toContain(
      'http://azure.archive.ubuntu.com/ubuntu',
    );
  });

  it('never deletes a source file that also contains an Ubuntu archive', async () => {
    const harness = await createHarness(false);
    await writeFile(
      harness.ubuntuSource,
      'deb http://azure.archive.ubuntu.com/ubuntu noble main\n' +
        'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n',
    );

    await execFileAsync('bash', [INSTALL_SCRIPT], { env: harness.env });

    const preserved = await readFile(harness.ubuntuSource, 'utf8');
    expect(preserved).toContain('azure.archive.ubuntu.com');
    expect(preserved).toContain('packages.microsoft.com');
  });

  it('fails after the bounded dependency retries and never installs Chromium', async () => {
    const harness = await createHarness(false);
    harness.env.PLAYWRIGHT_TEST_FAIL_DEPS = 'true';

    await expect(
      execFileAsync('bash', [INSTALL_SCRIPT], { env: harness.env }),
    ).rejects.toMatchObject({ code: 23 });
    expect(await readFile(harness.logPath, 'utf8')).toBe(
      'exec playwright install-deps chromium\n' +
        'exec playwright install-deps chromium\n',
    );
  });
});
