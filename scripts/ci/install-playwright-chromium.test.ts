import { execFile } from 'node:child_process';
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

async function createHarness(firstDependencyInstallHangs: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'playwright-install-'));
  const aptRoot = join(root, 'etc', 'apt');
  const sourcesDir = join(aptRoot, 'sources.list.d');
  const binDir = join(root, 'bin');
  const logPath = join(root, 'pnpm.log');
  const counterPath = join(root, 'counter');
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
  if [ "$PLAYWRIGHT_TEST_HANG_FIRST" = "true" ] && [ "$count" -eq 1 ]; then sleep 20; fi
  if [ "$PLAYWRIGHT_TEST_FAIL_DEPS" = "true" ]; then exit 23; fi
fi
exit 0
`;
  const sudoScript = '#!/bin/sh\nexec "$@"\n';
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
    },
  };
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
