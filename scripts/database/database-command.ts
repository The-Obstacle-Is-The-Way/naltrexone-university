import {
  authorizeHumanDatabaseTargets,
  requireExplicitDatabaseUrl,
} from './database-target';

type DatabaseCommandEnv = Readonly<Record<string, string | undefined>>;

type HumanDatabaseCommandInput = {
  env?: DatabaseCommandEnv;
  execute: (databaseUrl: string) => Promise<void>;
  log?: (message: string) => void;
};

export async function runHumanDatabaseCommand({
  env = process.env,
  execute,
  log = console.info,
}: HumanDatabaseCommandInput): Promise<void> {
  const databaseUrl = requireExplicitDatabaseUrl(env);
  const plan = authorizeHumanDatabaseTargets({
    databaseUrls: [databaseUrl],
    acknowledgement: env.DB_TARGET_ACK,
  });

  for (const target of plan.targets) {
    log(`Database target: ${target.kind} ${target.display}`);
  }

  await execute(databaseUrl);
}
