import { afterEach, describe, expect, it } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '../tests/shared/process-env';
import {
  formatQuestionFeedbackExport,
  getQuestionFeedbackExportPrivacyWarnings,
  parseQuestionFeedbackExportArgs,
  type QuestionFeedbackExportRow,
  runExportQuestionFeedback,
} from './export-question-feedback';

const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(ORIGINAL_ENV);
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

  it('rejects unsupported formats', () => {
    expect(() => parseQuestionFeedbackExportArgs(['--format', 'xml'])).toThrow(
      /Invalid --format/,
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
  it('requires DATABASE_URL before opening the read-only database client', async () => {
    delete process.env.DATABASE_URL;

    await expect(runExportQuestionFeedback([])).rejects.toThrow(
      /DATABASE_URL environment variable is required/,
    );
  });
});
