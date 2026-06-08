import { createE2ECommandPlan, runCommandPlan } from './e2e-local-orchestrator';

async function main() {
  const playwrightArgs = process.argv.slice(2);
  const plan = createE2ECommandPlan({
    env: process.env,
    playwrightArgs,
  });

  await runCommandPlan(plan, {
    env: process.env,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
