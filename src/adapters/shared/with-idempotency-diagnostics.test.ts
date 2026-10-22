import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import { FakeIdempotencyKeyRepository } from '@/src/application/test-helpers/fakes';
import { createSerializedLogger } from '@/tests/shared/serialized-logger';
import { withIdempotency } from './with-idempotency';

describe('idempotency diagnostics through the real logger', () => {
  it.each([
    'prune',
    'abort before execute',
    'abort after execute',
    'store error',
    'store result',
    'cache outcome',
    'cache outcome also fails',
  ] as const)(
    'projects %s failures without serializing SQL parameters or cause text',
    async (failure) => {
      const sessionUrl =
        'https://billing.stripe.test/session/synthetic-private-value';
      const sqlText = 'update idempotency_keys set result_json = $1';
      const driverError = Object.assign(new Error('private driver detail'), {
        code: '23505',
        constraint: 'idempotency_keys_pkey',
        detail: sessionUrl,
      });
      const queryError = new DrizzleQueryError(
        sqlText,
        [JSON.stringify({ url: sessionUrl })],
        driverError,
      );
      expect(queryError.message).toContain(sessionUrl);
      const originalError = new ApplicationError(
        'INTERNAL_ERROR',
        'private application message',
        undefined,
        { cause: queryError },
      );
      const now = () => new Date('2026-10-18T12:00:00Z');
      const cachingOutcome =
        failure === 'cache outcome' || failure === 'cache outcome also fails';
      // Keep the maintained fake's claim/replay behavior; inject only driver failures.
      class FailingRepository extends FakeIdempotencyKeyRepository {
        override async pruneExpiredBefore(
          ...args: Parameters<
            FakeIdempotencyKeyRepository['pruneExpiredBefore']
          >
        ) {
          if (failure === 'prune') throw queryError;
          return super.pruneExpiredBefore(...args);
        }
        override async abortClaim(
          ...args: Parameters<FakeIdempotencyKeyRepository['abortClaim']>
        ) {
          if (
            failure === 'abort before execute' ||
            failure === 'abort after execute'
          )
            throw queryError;
          return super.abortClaim(...args);
        }
        override async storeError(
          ...args: Parameters<FakeIdempotencyKeyRepository['storeError']>
        ) {
          if (
            failure === 'store error' ||
            failure === 'cache outcome also fails'
          )
            throw queryError;
          return super.storeError(...args);
        }
        override async storeResult(
          ...args: Parameters<FakeIdempotencyKeyRepository['storeResult']>
        ) {
          if (failure === 'store result' || cachingOutcome) throw queryError;
          return super.storeResult(...args);
        }
      }
      const { logger, lines } = createSerializedLogger();
      const userId = crypto.randomUUID();
      const key = crypto.randomUUID();
      const action = 'billing:createPortalSession';
      const result = withIdempotency({
        repo: new FailingRepository(now),
        logger,
        userId,
        key,
        action,
        now,
        shouldCacheError: () => failure !== 'abort after execute',
        ...(cachingOutcome
          ? { outcomeStoreFailurePolicy: 'cache-error-and-throw' as const }
          : {}),
        beforeExecute: async () => {
          if (failure === 'abort before execute') throw originalError;
        },
        execute: async () => {
          if (failure === 'abort after execute' || failure === 'store error')
            throw originalError;
          return { url: sessionUrl };
        },
      });
      if (failure === 'prune' || failure === 'store result') {
        await expect(result).resolves.toEqual({ url: sessionUrl });
      } else {
        await expect(result).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
      }
      expect(lines).toHaveLength(1);
      const serialized = lines.join('');
      for (const raw of [
        sessionUrl,
        sqlText,
        'private driver detail',
        'private application message',
        'params:',
        '"stack"',
      ]) {
        expect.soft(serialized).not.toContain(raw);
      }
      const log = JSON.parse(lines[0] ?? '{}');
      expect(log).toMatchObject({ userId, key, action });
      const diagnosticFields = [
        'error',
        'abortError',
        'originalError',
        'storeError',
        'storeResultError',
      ];
      const diagnostics = diagnosticFields
        .filter((field) => field in log)
        .map((field) => log[field]);
      expect(diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of diagnostics) {
        expect(diagnostic).toMatchObject({
          sqlState: '23505',
          constraint: 'idempotency_keys_pkey',
        });
      }
    },
  );
});
