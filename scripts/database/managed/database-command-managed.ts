import { authorizeManagedDatabaseTargets } from './database-target-managed';

type ManagedDatabaseCommandInput = {
  databaseUrl: string;
  execute: (databaseUrl: string) => Promise<void>;
  log?: (message: string) => void;
};

export async function runManagedDatabaseCommand({
  databaseUrl,
  execute,
  log = console.info,
}: ManagedDatabaseCommandInput): Promise<void> {
  const plan = authorizeManagedDatabaseTargets([databaseUrl]);

  for (const target of plan.targets) {
    log(`Database target: ${target.kind} ${target.display}`);
  }

  await execute(databaseUrl);
}
