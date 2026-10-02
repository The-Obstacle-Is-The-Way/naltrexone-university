import { QuestionFrontmatterSchema } from '../../lib/content/schemas';

export type DecisionRecord = { reason: string; authority: string };

export type QidCommandArgs = {
  qids: string[];
  apply: boolean;
  lift: boolean;
  record: DecisionRecord;
};

// A QID given after a flag: present, shaped like a content slug, and not
// already given.
export function readQidValue(
  value: string | undefined,
  flag: string,
  given: readonly string[],
): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  if (!QuestionFrontmatterSchema.shape.slug.safeParse(value).success) {
    throw new Error(`Invalid question QID: ${value}`);
  }
  if (given.includes(value)) {
    throw new Error(`Duplicate question QID: ${value}`);
  }
  return value;
}

// --reason or --authority and its value, each given once: the decision
// record every operator command that changes the bank keeps (DEBT-490).
export function readDecisionFlag(
  record: Partial<DecisionRecord>,
  arg: '--reason' | '--authority',
  value: string | undefined,
): void {
  const field = arg === '--reason' ? 'reason' : 'authority';
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('--')) {
    throw new Error(`Missing value for ${arg}`);
  }
  if (record[field] !== undefined) {
    throw new Error(`Duplicate ${arg}`);
  }
  record[field] = trimmed;
}

export function requireDecision(
  record: Partial<DecisionRecord>,
  decision: string,
): DecisionRecord {
  const { reason, authority } = record;
  if (reason === undefined) {
    throw new Error(`--reason is required: why the ${decision}`);
  }
  if (authority === undefined) {
    throw new Error(`--authority is required: who ordered the ${decision}`);
  }
  return { reason, authority };
}

// The operator commands that act on questions by QID (withdrawal, holds):
// explicit QIDs, a required reason and authority for the record, and a dry
// run unless --apply. Each flag may appear once.
export function parseQidCommandArgs(
  argv: readonly string[],
  options: { decision: string; allowLift?: boolean },
): QidCommandArgs {
  const qids: string[] = [];
  const record: Partial<DecisionRecord> = {};
  let apply = false;
  let lift = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !apply) {
      apply = true;
    } else if (arg === '--lift' && options.allowLift && !lift) {
      lift = true;
    } else if (arg === '--qid') {
      qids.push(readQidValue(argv[index + 1], '--qid', qids));
      index += 1;
    } else if (arg === '--reason' || arg === '--authority') {
      readDecisionFlag(record, arg, argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (qids.length === 0) throw new Error('At least one --qid is required');
  return {
    qids,
    apply,
    lift,
    record: requireDecision(record, options.decision),
  };
}
