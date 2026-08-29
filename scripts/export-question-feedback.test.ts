import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '../tests/shared/process-env';
import {
  formatQuestionFeedbackExport,
  getQuestionFeedbackExportPrivacyWarnings,
  parseQuestionFeedbackExportArgs,
  type QuestionFeedbackExportRow,
  readQuestionFeedbackRows,
  runExportQuestionFeedback,
} from './export-question-feedback';

const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(ORIGINAL_ENV);
  vi.doUnmock('dotenv');
  vi.doUnmock('postgres');
  vi.doUnmock('drizzle-orm/postgres-js');
  vi.resetModules();
  vi.restoreAllMocks();
});

const BASE_ROW: QuestionFeedbackExportRow = {
  id: 'feedback-1',
  userId: 'user-1',
  questionId: 'question-1',
  questionSlug: 'question-slug-1',
  attemptId: 'attempt-1',
  practiceSessionId: null,
  kind: 'report',
  rating: null,
  category: 'ambiguous_wording',
  comment: 'Contains comma, newline\nand private details',
  createdAt: new Date('2026-06-03T12:00:00.000Z'),
};

describe('formatQuestionFeedbackExport', () => {
  it('formats CSV with redacted user ids and excluded comments by default', () => {
    const csv = formatQuestionFeedbackExport([BASE_ROW], {
      format: 'csv',
      includeUserId: false,
      includeComments: false,
    });

    expect(csv).toBe(
      [
        'feedback_id,question_id,question_slug,attempt_id,practice_session_id,kind,rating,category,created_at,user_id,has_comment',
        'feedback-1,question-1,question-slug-1,attempt-1,,report,,ambiguous_wording,2026-06-03T12:00:00.000Z,[redacted],true',
        '',
      ].join('\n'),
    );
    expect(csv).not.toContain('user-1');
    expect(csv).not.toContain('private details');
  });

  it('adds raw user ids and comments only when explicit options allow them', () => {
    const csv = formatQuestionFeedbackExport([BASE_ROW], {
      format: 'csv',
      includeUserId: true,
      includeComments: true,
    });

    expect(csv).toBe(
      [
        'feedback_id,question_id,question_slug,attempt_id,practice_session_id,kind,rating,category,created_at,user_id,has_comment,comment',
        'feedback-1,question-1,question-slug-1,attempt-1,,report,,ambiguous_wording,2026-06-03T12:00:00.000Z,user-1,true,"Contains comma, newline\nand private details"',
        '',
      ].join('\n'),
    );
  });

  it('neutralizes bare spreadsheet formulas in CSV comments', () => {
    const csv = formatQuestionFeedbackExport(
      ['=1+1', '+1+1', '-2+3', '@SUM(A1)'].map((comment, index) =>
        rowWithComment(comment, { id: `feedback-formula-${index + 1}` }),
      ),
      {
        format: 'csv',
        includeUserId: false,
        includeComments: true,
      },
    );

    expect(csv).toContain(",true,'=1+1\n");
    expect(csv).toContain(",true,'+1+1\n");
    expect(csv).toContain(",true,'-2+3\n");
    expect(csv).toContain(",true,'@SUM(A1)\n");
  });

  it('neutralizes quoted spreadsheet formulas before CSV delimiter quoting', () => {
    const csv = formatQuestionFeedbackExport(
      [rowWithComment('=HYPERLINK("https://example.invalid","c")')],
      {
        format: 'csv',
        includeUserId: false,
        includeComments: true,
      },
    );

    expect(csv).toContain(
      `,true,"'=HYPERLINK(""https://example.invalid"",""c"")"\n`,
    );
  });

  it('neutralizes leading-whitespace and control-character formula bypasses in CSV comments', () => {
    const cases = [
      { comment: ' =1+1', expected: ",true,' =1+1\n" },
      { comment: '\t=1+1', expected: ",true,'\t=1+1\n" },
      { comment: '\r=1', expected: `,true,"'\r=1"\n` },
      { comment: '\n=1', expected: `,true,"'\n=1"\n` },
    ];

    for (const { comment, expected } of cases) {
      const csv = formatQuestionFeedbackExport([rowWithComment(comment)], {
        format: 'csv',
        includeUserId: false,
        includeComments: true,
      });

      expect(csv).toContain(expected);
    }
  });

  it('preserves non-formula CSV cells and existing delimiter quoting', () => {
    const csv = formatQuestionFeedbackExport(
      [
        rowWithComment('normal comment', {
          id: '11111111-1111-4111-8111-111111111111',
          questionId: '33333333-3333-4333-8333-333333333333',
          attemptId: '44444444-4444-4444-8444-444444444444',
          createdAt: '2026-06-17T12:00:00.000Z',
        }),
        rowWithComment('Contains comma, "quote", and newline\ntext', {
          id: '22222222-2222-4222-8222-222222222222',
          questionId: '33333333-3333-4333-8333-333333333333',
          attemptId: '44444444-4444-4444-8444-444444444444',
          createdAt: '2026-06-17T12:00:00.000Z',
        }),
        rowWithComment("'=already-text", {
          id: '33333333-3333-4333-8333-333333333333',
          questionId: '33333333-3333-4333-8333-333333333333',
          attemptId: '44444444-4444-4444-8444-444444444444',
          createdAt: '2026-06-17T12:00:00.000Z',
        }),
        rowWithComment('', {
          id: '44444444-4444-4444-8444-444444444444',
          questionId: '33333333-3333-4333-8333-333333333333',
          attemptId: '44444444-4444-4444-8444-444444444444',
          createdAt: '2026-06-17T12:00:00.000Z',
        }),
        rowWithComment(null, {
          id: '55555555-5555-4555-8555-555555555555',
          questionId: '33333333-3333-4333-8333-333333333333',
          attemptId: '44444444-4444-4444-8444-444444444444',
          createdAt: '2026-06-17T12:00:00.000Z',
        }),
      ],
      {
        format: 'csv',
        includeUserId: false,
        includeComments: true,
      },
    );

    expect(csv).toBe(
      [
        'feedback_id,question_id,question_slug,attempt_id,practice_session_id,kind,rating,category,created_at,user_id,has_comment,comment',
        '11111111-1111-4111-8111-111111111111,33333333-3333-4333-8333-333333333333,question-slug-1,44444444-4444-4444-8444-444444444444,,report,,ambiguous_wording,2026-06-17T12:00:00.000Z,[redacted],true,normal comment',
        '22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333,question-slug-1,44444444-4444-4444-8444-444444444444,,report,,ambiguous_wording,2026-06-17T12:00:00.000Z,[redacted],true,"Contains comma, ""quote"", and newline\ntext"',
        "33333333-3333-4333-8333-333333333333,33333333-3333-4333-8333-333333333333,question-slug-1,44444444-4444-4444-8444-444444444444,,report,,ambiguous_wording,2026-06-17T12:00:00.000Z,[redacted],true,'=already-text",
        '44444444-4444-4444-8444-444444444444,33333333-3333-4333-8333-333333333333,question-slug-1,44444444-4444-4444-8444-444444444444,,report,,ambiguous_wording,2026-06-17T12:00:00.000Z,[redacted],false,',
        '55555555-5555-4555-8555-555555555555,33333333-3333-4333-8333-333333333333,question-slug-1,44444444-4444-4444-8444-444444444444,,report,,ambiguous_wording,2026-06-17T12:00:00.000Z,[redacted],false,',
        '',
      ].join('\n'),
    );
  });

  it('neutralizes formula-capable values in every CSV column', () => {
    const csv = formatQuestionFeedbackExport(
      [
        rowWithComment('normal comment', {
          questionSlug: '=formula-slug',
          userId: '+spreadsheet-user',
        }),
      ],
      {
        format: 'csv',
        includeUserId: true,
        includeComments: true,
      },
    );

    expect(csv).toContain(",'=formula-slug,");
    expect(csv).toContain(",'+spreadsheet-user,");
  });

  it('keeps formula-prefixed comments raw in JSON exports', () => {
    const json = formatQuestionFeedbackExport([rowWithComment('=1+1')], {
      format: 'json',
      includeUserId: false,
      includeComments: true,
    });

    expect(JSON.parse(json)).toEqual([
      expect.objectContaining({
        comment: '=1+1',
      }),
    ]);
    expect(json).toContain('"comment": "=1+1"');
    expect(json).not.toContain("'=1+1");
  });

  it('formats JSON with ISO timestamps and omits comment bodies by default', () => {
    const json = formatQuestionFeedbackExport([BASE_ROW], {
      format: 'json',
      includeUserId: false,
      includeComments: false,
    });

    expect(JSON.parse(json)).toEqual([
      {
        feedbackId: 'feedback-1',
        questionId: 'question-1',
        questionSlug: 'question-slug-1',
        attemptId: 'attempt-1',
        practiceSessionId: null,
        kind: 'report',
        rating: null,
        category: 'ambiguous_wording',
        createdAt: '2026-06-03T12:00:00.000Z',
        userId: '[redacted]',
        hasComment: true,
      },
    ]);
  });
});

function rowWithComment(
  comment: string | null,
  overrides: Partial<QuestionFeedbackExportRow> = {},
): QuestionFeedbackExportRow {
  return {
    ...BASE_ROW,
    comment,
    ...overrides,
  };
}

describe('parseQuestionFeedbackExportArgs', () => {
  it('defaults to CSV with privacy-preserving output', () => {
    expect(parseQuestionFeedbackExportArgs([])).toEqual({
      format: 'csv',
      includeUserId: false,
      includeComments: false,
    });
  });

  it('parses format and raw-data opt-in flags', () => {
    expect(
      parseQuestionFeedbackExportArgs([
        '--format',
        'json',
        '--include-user-id',
        '--include-comments',
      ]),
    ).toEqual({
      format: 'json',
      includeUserId: true,
      includeComments: true,
    });
  });

  it('supports CSV and JSON aliases', () => {
    expect(parseQuestionFeedbackExportArgs(['--json']).format).toBe('json');
    expect(parseQuestionFeedbackExportArgs(['--json', '--csv']).format).toBe(
      'csv',
    );
  });

  it('rejects unsupported formats', () => {
    expect(() => parseQuestionFeedbackExportArgs(['--format', 'xml'])).toThrow(
      /Invalid --format/,
    );
  });

  it('rejects unknown flags', () => {
    expect(() => parseQuestionFeedbackExportArgs(['--wat'])).toThrow(
      /Unknown export flag: --wat/,
    );
  });
});

describe('getQuestionFeedbackExportPrivacyWarnings', () => {
  it('returns explicit PII/PHI warnings for raw export flags', () => {
    expect(
      getQuestionFeedbackExportPrivacyWarnings({
        format: 'csv',
        includeUserId: true,
        includeComments: true,
      }),
    ).toEqual([
      'WARNING: --include-user-id exports raw user identifiers and may contain PII.',
      'WARNING: --include-comments exports free-text comments that may contain PII/PHI.',
    ]);
  });
});

describe('runExportQuestionFeedback', () => {
  it('refuses a DATABASE_URL supplied only by dotenv fallback', async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const dotenvConfig = vi.fn(() => {
      process.env.DATABASE_URL =
        'postgresql://fallback-user:fallback-password@127.0.0.1:55432/app';
    });
    vi.doMock('dotenv', () => ({
      default: { config: dotenvConfig },
    }));
    const imported = await import('./export-question-feedback');
    const createSql = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));

    await expect(
      imported.runExportQuestionFeedback(
        [],
        createWritableSink(),
        createWritableSink(),
        {
          createSql,
          createDb: () => ({}),
          readRows: () => Promise.resolve([]),
        },
      ),
    ).rejects.toThrow(/explicit DATABASE_URL/i);

    expect(dotenvConfig).not.toHaveBeenCalled();
    expect(createSql).not.toHaveBeenCalled();
  });

  it('requires DATABASE_URL before opening the read-only database client', async () => {
    delete process.env.DATABASE_URL;

    await expect(runExportQuestionFeedback([])).rejects.toThrow(
      /explicit DATABASE_URL.*implicit.*fallback/i,
    );
  });

  it('refuses a remote target without exact acknowledgement before opening the database client', async () => {
    process.env.DATABASE_URL =
      'postgresql://remote-user:remote-password@db.example/app';
    delete process.env.DB_TARGET_ACK;
    const createSql = vi.fn(() => ({
      end: vi.fn().mockResolvedValue(undefined),
    }));

    await expect(
      runExportQuestionFeedback(
        [],
        createWritableSink(),
        createWritableSink(),
        {
          createSql,
          createDb: () => ({}),
          readRows: () => Promise.resolve([]),
        },
      ),
    ).rejects.toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');

    expect(createSql).not.toHaveBeenCalled();
  });

  it('writes formatted output, privacy warnings, and closes the database client', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:55432/addiction_boards_test';
    const output = createWritableSink();
    const errorOutput = createWritableSink();
    const sql = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const db = {};

    await runExportQuestionFeedback(
      ['--format', 'json', '--include-comments'],
      output,
      errorOutput,
      {
        createSql: (databaseUrl) => {
          expect(databaseUrl).toBe(process.env.DATABASE_URL);
          return sql;
        },
        createDb: (receivedSql) => {
          expect(receivedSql).toBe(sql);
          return db;
        },
        readRows: (receivedDb) => {
          expect(receivedDb).toBe(db);
          return Promise.resolve([BASE_ROW]);
        },
      },
    );

    expect(JSON.parse(output.text())).toEqual([
      {
        feedbackId: 'feedback-1',
        questionId: 'question-1',
        questionSlug: 'question-slug-1',
        attemptId: 'attempt-1',
        practiceSessionId: null,
        kind: 'report',
        rating: null,
        category: 'ambiguous_wording',
        createdAt: '2026-06-03T12:00:00.000Z',
        userId: '[redacted]',
        hasComment: true,
        comment: 'Contains comma, newline\nand private details',
      },
    ]);
    expect(errorOutput.text()).toContain(
      'WARNING: --include-comments exports free-text comments',
    );
    expect(errorOutput.text()).toContain(
      'Database target: LOCAL localhost:55432/addiction_boards_test',
    );
    expect(errorOutput.text()).not.toContain('postgres:postgres');
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('uses the seed-style postgres and drizzle defaults when dependencies are omitted', async () => {
    vi.resetModules();
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5434/addiction_boards_test';
    const output = createWritableSink();
    const sql = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = createQuestionFeedbackSelectDb([BASE_ROW], {
      assertTableIdentity: false,
    });
    const postgresMock = vi.fn(() => sql);
    const drizzleMock = vi.fn(() => fakeDb);

    vi.doMock('postgres', () => ({ default: postgresMock }));
    vi.doMock('drizzle-orm/postgres-js', () => ({
      drizzle: drizzleMock,
    }));
    const imported = await import('./export-question-feedback');

    await imported.runExportQuestionFeedback([], output, createWritableSink());

    expect(postgresMock).toHaveBeenCalledWith(process.env.DATABASE_URL, {
      max: 1,
    });
    expect(drizzleMock).toHaveBeenCalledWith(
      sql,
      expect.objectContaining({ schema: expect.any(Object) }),
    );
    expect(output.text()).toContain('question-slug-1');
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});

describe('readQuestionFeedbackRows', () => {
  it('selects feedback rows joined to question slugs in newest-first order', async () => {
    const selectedRows = [BASE_ROW];
    const fakeDb = createQuestionFeedbackSelectDb(selectedRows);

    const rows = await readQuestionFeedbackRows(
      fakeDb as unknown as Parameters<typeof readQuestionFeedbackRows>[0],
    );

    expect(rows).toEqual(selectedRows);
    expect(fakeDb.calls).toEqual([
      'select:id,userId,questionId,questionSlug,attemptId,practiceSessionId,kind,rating,category,comment,createdAt',
      'from:questionFeedback',
      'innerJoin:questions',
      'orderBy:createdAt,id',
    ]);
  });
});

function createWritableSink(): NodeJS.WritableStream & { text(): string } {
  let value = '';

  return {
    write(chunk: string | Uint8Array) {
      value += String(chunk);
      return true;
    },
    text() {
      return value;
    },
  } as NodeJS.WritableStream & { text(): string };
}

function createQuestionFeedbackSelectDb(
  rows: QuestionFeedbackExportRow[],
  options = { assertTableIdentity: true },
) {
  const calls: string[] = [];

  return {
    calls,
    select(selection: Record<string, unknown>) {
      calls.push(`select:${Object.keys(selection).join(',')}`);
      return {
        from(table: unknown) {
          if (options.assertTableIdentity) {
            expect(table).toBe(schema.questionFeedback);
          } else {
            expect(table).toBeDefined();
          }
          calls.push('from:questionFeedback');
          return {
            innerJoin(tableToJoin: unknown, condition: unknown) {
              if (options.assertTableIdentity) {
                expect(tableToJoin).toBe(schema.questions);
              } else {
                expect(tableToJoin).toBeDefined();
              }
              expect(condition).toBeDefined();
              calls.push('innerJoin:questions');
              return {
                orderBy(...orderings: unknown[]) {
                  expect(orderings).toHaveLength(2);
                  calls.push('orderBy:createdAt,id');
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      };
    },
  };
}
