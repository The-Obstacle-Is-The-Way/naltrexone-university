import { describe, expect, it } from 'vitest';
import { PUBLIC_ERROR_CODEC_CORPUS } from '@/tests/shared/idempotency-public-error-codec-corpus';
import {
  decodeIdempotencyPublicError,
  MAX_ERROR_FIELD_NAME_LENGTH,
  MAX_ERROR_FIELDS,
  MAX_MESSAGES_PER_FIELD,
  MAX_PUBLIC_ERROR_TEXT_LENGTH,
} from './idempotency-public-error-codec';

describe('idempotency public error codec', () => {
  it('pins the durable public-error bounds', () => {
    expect(MAX_PUBLIC_ERROR_TEXT_LENGTH).toBe(1_000);
    expect(MAX_ERROR_FIELDS).toBe(32);
    expect(MAX_ERROR_FIELD_NAME_LENGTH).toBe(128);
    expect(MAX_MESSAGES_PER_FIELD).toBe(8);
  });

  for (const corpusCase of PUBLIC_ERROR_CODEC_CORPUS) {
    it(corpusCase.name, () => {
      if (corpusCase.expected === undefined) {
        expect(() => decodeIdempotencyPublicError(corpusCase.input)).toThrow(
          expect.objectContaining({
            code: 'INTERNAL_ERROR',
            cause: expect.any(Error),
          }),
        );
        return;
      }

      expect(decodeIdempotencyPublicError(corpusCase.input)).toEqual(
        corpusCase.expected,
      );
    });
  }
});
