import { execFile, spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
  {
    firstPhaseLeavesAptRunning = false,
    leftoverAptIgnoresTerm = false,
    // GitHub's Ubuntu runners name their mirrors in a list that the source
    // reaches through `mirror+file:` (BUG-366); a source can also name one.
    layout = 'mirror-list' as 'mirror-list' | 'direct',
  } = {},
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
  const mirrorList = join(aptRoot, 'apt-mirrors.txt');
  const microsoftSource = join(sourcesDir, 'microsoft-prod.list');
  const aptConfigDir = join(aptRoot, 'apt.conf.d');
  const unrelatedAptConfig = join(aptConfigDir, '99microsoft-proxy');
  await mkdir(sourcesDir, { recursive: true });
  await mkdir(aptConfigDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  if (layout === 'mirror-list') {
    // Both of the runner's stanzas name one list, here in both URI forms.
    await writeFile(
      ubuntuSource,
      `Types: deb\nURIs: mirror+file:${mirrorList}\nSuites: noble noble-updates\n\n` +
        `Types: deb\nURIs: mirror+file://${mirrorList}\nSuites: noble-security\n`,
    );
    await writeFile(
      mirrorList,
      'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n' +
        'https://archive.ubuntu.com/ubuntu/\tpriority:2\n' +
        'https://security.ubuntu.com/ubuntu/\tpriority:3\n',
    );
  } else {
    await writeFile(
      ubuntuSource,
      'Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\n',
    );
  }
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
    mirrorList,
    // The file that names the Azure archive in this layout.
    archiveFile: layout === 'mirror-list' ? mirrorList : ubuntuSource,
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
  it.each([
    ['the mirror list the runner names', 'mirror-list'],
    ['a source that names the mirror', 'direct'],
  ] as const)(
    'kills a hung apt phase, preserves Ubuntu sources, and fails over to the archive in %s',
    async (_where, layout) => {
      const harness = await createHarness(true, { layout });
      await chmod(harness.archiveFile, 0o640);
      const fileBefore = await stat(harness.archiveFile);
      const startedAt = Date.now();

      const { stdout } = await execFileAsync('bash', [INSTALL_SCRIPT], {
        env: harness.env,
      });

      expect(Date.now() - startedAt).toBeLessThan(7_000);
      expect(await readFile(harness.logPath, 'utf8')).toBe(
        'exec playwright install-deps chromium\n' +
          'exec playwright install-deps chromium\n' +
          'exec playwright install chromium\n',
      );
      expect(stdout).toContain(
        '[playwright-install] Retrying apt dependencies through archive.ubuntu.com.',
      );
      const archive = await readFile(harness.archiveFile, 'utf8');
      expect(archive).toContain('http://archive.ubuntu.com/ubuntu');
      expect(archive).not.toContain('azure.archive.ubuntu.com');
      const fileAfter = await stat(harness.archiveFile);
      expect(fileAfter.ino).toBe(fileBefore.ino);
      expect(fileAfter.mode & 0o777).toBe(0o640);
      await expect(stat(harness.microsoftSource)).rejects.toThrow();
      await expect(stat(harness.unrelatedAptConfig)).resolves.toBeDefined();
    },
  );

  it('still retries and installs Chromium when a source names a missing mirror list', async () => {
    const harness = await createHarness(true);
    await rm(harness.mirrorList);

    const { stdout } = await execFileAsync('bash', [INSTALL_SCRIPT], {
      env: harness.env,
    });

    expect(stdout).toContain(
      '[playwright-install] No Azure Ubuntu source was present; retrying the bounded apt phase once.',
    );
    expect(await readFile(harness.logPath, 'utf8')).toBe(
      'exec playwright install-deps chromium\n' +
        'exec playwright install-deps chromium\n' +
        'exec playwright install chromium\n',
    );
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
    expect(await readFile(harness.archiveFile, 'utf8')).toContain(
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
