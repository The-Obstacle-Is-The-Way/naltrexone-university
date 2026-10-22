import { type ChildProcess, spawn } from 'node:child_process';

export async function runDatabaseProcess(
  args: readonly string[],
  databaseUrl: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn('pnpm', [...args], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`Database command failed (${reason}).`));
    });
  });
}
