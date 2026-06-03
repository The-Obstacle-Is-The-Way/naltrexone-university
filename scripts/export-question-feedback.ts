import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { desc, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const REDACTED_USER_ID = '[redacted]';

export type QuestionFeedbackExportFormat = 'csv' | 'json';

export type QuestionFeedbackExportOptions = {
  format: QuestionFeedbackExportFormat;
  includeUserId: boolean;
  includeComments: boolean;
};

export type QuestionFeedbackExportRow = {
  id: string;
  userId: string;
  questionId: string;
  questionSlug: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  kind: schema.QuestionFeedbackKind;
  rating: schema.QuestionFeedbackRating | null;
  category: schema.QuestionFeedbackCategory | null;
  comment: string | null;
  createdAt: Date | string;
};

type QuestionFeedbackExportRecord = {
  feedbackId: string;
  questionId: string;
  questionSlug: string;
  attemptId: string | null;
  practiceSessionId: string | null;
  kind: schema.QuestionFeedbackKind;
  rating: schema.QuestionFeedbackRating | null;
  category: schema.QuestionFeedbackCategory | null;
  createdAt: string;
  userId: string;
  hasComment: boolean;
  comment?: string | null;
};

type QuestionFeedbackExportDb = PostgresJsDatabase<typeof schema>;
type QuestionFeedbackExportSql = Pick<ReturnType<typeof postgres>, 'end'>;

export type QuestionFeedbackExportDeps<
  TSql extends QuestionFeedbackExportSql,
  TDb,
> = {
  createSql(databaseUrl: string): TSql;
  createDb(sql: TSql): TDb;
  readRows(db: TDb): Promise<QuestionFeedbackExportRow[]>;
};

const DEFAULT_OPTIONS: QuestionFeedbackExportOptions = {
  format: 'csv',
  includeUserId: false,
  includeComments: false,
};

const DEFAULT_DEPS: QuestionFeedbackExportDeps<
  ReturnType<typeof postgres>,
  QuestionFeedbackExportDb
> = {
  createSql: (databaseUrl) => postgres(databaseUrl, { max: 1 }),
  createDb: (sql) => drizzle(sql, { schema }),
  readRows: (db) => readQuestionFeedbackRows(db),
};

export function parseQuestionFeedbackExportArgs(
  argv: string[],
): QuestionFeedbackExportOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--include-user-id') {
      options.includeUserId = true;
      continue;
    }

    if (arg === '--include-comments') {
      options.includeComments = true;
      continue;
    }

    if (arg === '--json') {
      options.format = 'json';
      continue;
    }

    if (arg === '--csv') {
      options.format = 'csv';
      continue;
    }

    if (arg === '--format') {
      const value = argv[index + 1];
      if (value !== 'csv' && value !== 'json') {
        throw new Error('Invalid --format: expected "csv" or "json"');
      }
      options.format = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown export flag: ${arg}`);
  }

  return options;
}

export function getQuestionFeedbackExportPrivacyWarnings(
  options: QuestionFeedbackExportOptions,
): string[] {
  const warnings: string[] = [];

  if (options.includeUserId) {
    warnings.push(
      'WARNING: --include-user-id exports raw user identifiers and may contain PII.',
    );
  }

  if (options.includeComments) {
    warnings.push(
      'WARNING: --include-comments exports free-text comments that may contain PII/PHI.',
    );
  }

  return warnings;
}

export function formatQuestionFeedbackExport(
  rows: QuestionFeedbackExportRow[],
  options: QuestionFeedbackExportOptions,
): string {
  const records = rows.map((row) => toExportRecord(row, options));

  if (options.format === 'json') {
    return `${JSON.stringify(records, null, 2)}\n`;
  }

  return formatCsv(records, options);
}

export async function readQuestionFeedbackRows(
  db: QuestionFeedbackExportDb,
): Promise<QuestionFeedbackExportRow[]> {
  return db
    .select({
      id: schema.questionFeedback.id,
      userId: schema.questionFeedback.userId,
      questionId: schema.questionFeedback.questionId,
      questionSlug: schema.questions.slug,
      attemptId: schema.questionFeedback.attemptId,
      practiceSessionId: schema.questionFeedback.practiceSessionId,
      kind: schema.questionFeedback.kind,
      rating: schema.questionFeedback.rating,
      category: schema.questionFeedback.category,
      comment: schema.questionFeedback.comment,
      createdAt: schema.questionFeedback.createdAt,
    })
    .from(schema.questionFeedback)
    .innerJoin(
      schema.questions,
      eq(schema.questionFeedback.questionId, schema.questions.id),
    )
    .orderBy(
      desc(schema.questionFeedback.createdAt),
      desc(schema.questionFeedback.id),
    );
}

export async function runExportQuestionFeedback(
  argv = process.argv.slice(2),
  output: NodeJS.WritableStream = process.stdout,
  errorOutput: NodeJS.WritableStream = process.stderr,
  deps: QuestionFeedbackExportDeps<
    QuestionFeedbackExportSql,
    unknown
  > = DEFAULT_DEPS,
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is required for export:feedback',
    );
  }

  const options = parseQuestionFeedbackExportArgs(argv);
  for (const warning of getQuestionFeedbackExportPrivacyWarnings(options)) {
    errorOutput.write(`${warning}\n`);
  }

  const sql = deps.createSql(databaseUrl);
  const db = deps.createDb(sql);

  try {
    const rows = await deps.readRows(db);
    output.write(formatQuestionFeedbackExport(rows, options));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function toExportRecord(
  row: QuestionFeedbackExportRow,
  options: QuestionFeedbackExportOptions,
): QuestionFeedbackExportRecord {
  const record: QuestionFeedbackExportRecord = {
    feedbackId: row.id,
    questionId: row.questionId,
    questionSlug: row.questionSlug,
    attemptId: row.attemptId,
    practiceSessionId: row.practiceSessionId,
    kind: row.kind,
    rating: row.rating,
    category: row.category,
    createdAt: toIsoString(row.createdAt),
    userId: options.includeUserId ? row.userId : REDACTED_USER_ID,
    hasComment: row.comment !== null && row.comment.length > 0,
  };

  if (options.includeComments) {
    record.comment = row.comment;
  }

  return record;
}

function formatCsv(
  records: QuestionFeedbackExportRecord[],
  options: QuestionFeedbackExportOptions,
): string {
  const headers = [
    'feedback_id',
    'question_id',
    'question_slug',
    'attempt_id',
    'practice_session_id',
    'kind',
    'rating',
    'category',
    'created_at',
    'user_id',
    'has_comment',
  ];

  if (options.includeComments) {
    headers.push('comment');
  }

  const lines = [
    headers.join(','),
    ...records.map((record) => csvRecordLine(record, options)),
  ];

  return `${lines.join('\n')}\n`;
}

function csvRecordLine(
  record: QuestionFeedbackExportRecord,
  options: QuestionFeedbackExportOptions,
): string {
  const values = [
    record.feedbackId,
    record.questionId,
    record.questionSlug,
    record.attemptId,
    record.practiceSessionId,
    record.kind,
    record.rating,
    record.category,
    record.createdAt,
    record.userId,
    String(record.hasComment),
  ];

  if (options.includeComments) {
    values.push(record.comment ?? null);
  }

  return values.map(csvCell).join(',');
}

function csvCell(value: string | null): string {
  if (value === null) return '';
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function main(): Promise<void> {
  await runExportQuestionFeedback();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
