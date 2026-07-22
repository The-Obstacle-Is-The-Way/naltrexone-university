import { ApplicationConflictReasons } from '@/src/application/errors';

const MAX_TEXT = 'm'.repeat(1_000);
const MAX_FIELD_NAME = 'f'.repeat(128);

export type PublicErrorCodecCorpusCase = {
  name: string;
  input: unknown;
  expected?: unknown;
};

const fullRecord = {
  code: 'CONFLICT',
  message: 'Practice session already ended',
  fieldErrors: {
    sessionId: ['Session is no longer active'],
  },
  details: {
    reason: ApplicationConflictReasons.AlreadyEnded,
  },
};

export const PUBLIC_ERROR_CODEC_CORPUS: readonly PublicErrorCodecCorpusCase[] =
  [
    {
      name: 'valid fully populated record',
      input: fullRecord,
      expected: fullRecord,
    },
    {
      name: 'valid legacy INTERNAL_ERROR normalizes its diagnostic message',
      input: { code: 'INTERNAL_ERROR', message: 'driver diagnostic' },
      expected: { code: 'INTERNAL_ERROR', message: 'Internal error' },
    },
    {
      name: 'valid record without optional fields',
      input: { code: 'NOT_FOUND', message: 'Question not found' },
      expected: { code: 'NOT_FOUND', message: 'Question not found' },
    },
    {
      name: 'accepts the exact public message boundary',
      input: { code: 'VALIDATION_ERROR', message: MAX_TEXT },
      expected: { code: 'VALIDATION_ERROR', message: MAX_TEXT },
    },
    {
      name: 'accepts the exact field-count boundary',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: Object.fromEntries(
          Array.from({ length: 32 }, (_, index) => [
            `field${index}`,
            ['Invalid'],
          ]),
        ),
      },
      expected: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: Object.fromEntries(
          Array.from({ length: 32 }, (_, index) => [
            `field${index}`,
            ['Invalid'],
          ]),
        ),
      },
    },
    {
      name: 'accepts the exact field-name boundary',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { [MAX_FIELD_NAME]: ['Invalid'] },
      },
      expected: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { [MAX_FIELD_NAME]: ['Invalid'] },
      },
    },
    {
      name: 'accepts the exact messages-per-field boundary',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: Array.from({ length: 8 }, () => 'Invalid') },
      },
      expected: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: Array.from({ length: 8 }, () => 'Invalid') },
      },
    },
    {
      name: 'accepts the exact field-message boundary',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [MAX_TEXT] },
      },
      expected: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [MAX_TEXT] },
      },
    },
    {
      name: 'rejects an oversized public message',
      input: { code: 'VALIDATION_ERROR', message: `${MAX_TEXT}x` },
    },
    {
      name: 'rejects an oversized field count',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: Object.fromEntries(
          Array.from({ length: 33 }, (_, index) => [
            `field${index}`,
            ['Invalid'],
          ]),
        ),
      },
    },
    {
      name: 'rejects an oversized field name',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { [`${MAX_FIELD_NAME}x`]: ['Invalid'] },
      },
    },
    {
      name: 'rejects an oversized message array',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: Array.from({ length: 9 }, () => 'Invalid') },
      },
    },
    {
      name: 'rejects an oversized field message',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [`${MAX_TEXT}x`] },
      },
    },
    { name: 'rejects null', input: null },
    { name: 'rejects an array record', input: [] },
    { name: 'rejects an unknown code', input: { code: 'NOPE', message: 'No' } },
    { name: 'rejects a scalar code', input: { code: 1, message: 'No' } },
    {
      name: 'rejects a scalar message',
      input: { code: 'NOT_FOUND', message: 1 },
    },
    {
      name: 'rejects an empty message',
      input: { code: 'NOT_FOUND', message: '' },
    },
    {
      name: 'rejects an array fieldErrors value',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: [],
      },
    },
    {
      name: 'rejects an empty field name',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { '': ['Invalid'] },
      },
    },
    {
      name: 'rejects a scalar field message collection',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: 'Invalid' },
      },
    },
    {
      name: 'rejects an empty field message collection',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [] },
      },
    },
    {
      name: 'rejects a scalar field message',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [1] },
      },
    },
    {
      name: 'rejects an empty field message',
      input: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        fieldErrors: { field: [''] },
      },
    },
    {
      name: 'rejects array details',
      input: { code: 'CONFLICT', message: 'Conflict', details: [] },
    },
    {
      name: 'rejects a missing detail reason',
      input: { code: 'CONFLICT', message: 'Conflict', details: {} },
    },
    {
      name: 'rejects an unknown detail reason',
      input: {
        code: 'CONFLICT',
        message: 'Conflict',
        details: { reason: 'nope' },
      },
    },
    {
      name: 'rejects an unknown top-level key',
      input: { code: 'NOT_FOUND', message: 'Missing', extra: true },
    },
    {
      name: 'rejects an unknown detail key',
      input: {
        code: 'CONFLICT',
        message: 'Conflict',
        details: {
          reason: ApplicationConflictReasons.AlreadyEnded,
          extra: true,
        },
      },
    },
  ] as const;
