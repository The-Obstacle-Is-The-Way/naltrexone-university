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
      const field = arg === '--reason' ? 'reason' : 'authority';
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (record[field] !== undefined) {
        throw new Error(`Duplicate ${arg}`);
      }
      record[field] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (qids.length === 0) throw new Error('At least one --qid is required');
  const { reason, authority } = record;
  if (reason === undefined) {
    throw new Error(`--reason is required: why the ${options.decision}`);
  }
  if (authority === undefined) {
    throw new Error(
      `--authority is required: who ordered the ${options.decision}`,
    );
  }
  return { qids, apply, lift, record: { reason, authority } };
}
