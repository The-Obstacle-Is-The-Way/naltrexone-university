import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import type { DecisionRecord } from '../seed/qid-command-args';
import type { ActivationPlan, ActivationSummary } from './release-activation';

type Db = PostgresJsDatabase<typeof schema>;

export async function withCommandDatabase<T>(
  databaseUrl: string,
  act: (db: Db) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await act(drizzle(sql, { schema }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// A dry run is the real transaction, rolled back: it verifies, locks and
// counts exactly as the applied run would, then leaves nothing behind.
export async function previewOrApply<T>(
  db: Db,
  apply: boolean,
  act: (db: Db) => Promise<T>,
): Promise<T> {
  if (apply) return act(db);
  class Preview extends Error {
    constructor(readonly value: T) {
      super('Dry run rolled back');
    }
  }
  try {
    return await db.transaction(async (tx) => {
      throw new Preview(await act(tx));
    });
  } catch (error) {
    if (error instanceof Preview) return error.value;
    throw error;
  }
}

export function formatActivation(summary: ActivationSummary): string {
  return [
    `release=${summary.releaseId}`,
    `previous=${summary.previousReleaseId ?? 'none'}`,
    `items=${summary.items}`,
    `published=${summary.published}`,
    `archived=${summary.archived}`,
    `excludedWithdrawn=${summary.excludedWithdrawn}`,
    `excludedHeld=${summary.excludedHeld}`,
  ].join(' ');
}

const PLAN_ID = /^[0-9a-f]{64}$/;

// DEBT-489: the value of --plan, the plan id a preview printed.
export function readPlanId(value: string | undefined): string {
  if (!value || !PLAN_ID.test(value)) {
    throw new Error('--plan needs the plan id a preview printed');
  }
  return value;
}

// DEBT-489: an apply is held to the plan an operator reviewed.
export function assertPlanForApply(
  apply: boolean,
  expectedPlanId: string | undefined,
): void {
  if (apply && expectedPlanId === undefined) {
    throw new Error(
      '--plan is required with --apply: preview first, then apply the plan id it printed',
    );
  }
}

// The plan an activation applies: its id, then every change it names.
export function formatPlan(plan: ActivationPlan): string[] {
  return [
    `Plan: ${plan.id}`,
    formatNames('Archive', plan.archive),
    formatNames('Publish or move', plan.changed),
    formatNames('Withdraw for good', plan.withdraw),
    formatNames('Left out, held', plan.excludedHeld),
    formatNames('Left out, withdrawn', plan.excludedWithdrawn),
  ];
}

function formatNames(label: string, slugs: readonly string[]): string {
  return `${label} (${slugs.length})${slugs.length > 0 ? `: ${slugs.join(', ')}` : ''}`;
}

// DEBT-490: the decision an activation records, as printed and as the
// arguments that repeat it, quoted for a POSIX shell.
export function formatDecision(record: DecisionRecord): string {
  return `Decision: ${record.reason} (authority: ${record.authority})`;
}

export function formatDecisionArgs(record: DecisionRecord): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return `--reason ${quote(record.reason)} --authority ${quote(record.authority)}`;
}
