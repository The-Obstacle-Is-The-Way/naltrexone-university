import { z } from 'zod';
import { QuestionFrontmatterSchema } from '../../lib/content/schemas';

export type DecisionRecord = { reason: string; authority: string };

export type QidCommandArgs = {
  qids: string[];
  apply: boolean;
  lift: boolean;
  holdIds?: string[];
  revert: string[];
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
  options: { decision: string; allowLift?: boolean; allowRevert?: boolean },
): QidCommandArgs {
  const qids: string[] = [];
  const revert: string[] = [];
  const holdIds: string[] = [];
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
    } else if (arg === '--hold' && options.allowLift) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error('Missing value for --hold');
      if (!z.guid().safeParse(value).success)
        throw new Error('Invalid hold ID');
      const holdId = value.toLowerCase();
      if (holdIds.includes(holdId)) throw new Error('Duplicate hold ID');
      holdIds.push(holdId);
      index += 1;
    } else if (arg === '--revert' && options.allowRevert) {
      revert.push(readQidValue(argv[index + 1], '--revert', revert));
      index += 1;
    } else if (arg === '--reason' || arg === '--authority') {
      readDecisionFlag(record, arg, argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (holdIds.length > 0 && !lift) throw new Error('--hold requires --lift');
  if (holdIds.length > 0 && qids.length > 0)
    throw new Error('Use either --qid or --hold, not both');
  if (qids.length === 0 && holdIds.length === 0)
    throw new Error('At least one --qid is required');
  return {
    qids,
    apply,
    lift,
    ...(holdIds.length > 0 ? { holdIds } : {}),
    revert,
    record: requireDecision(record, options.decision),
  };
}
