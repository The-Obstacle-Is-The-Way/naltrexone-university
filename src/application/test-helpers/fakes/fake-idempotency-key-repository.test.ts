import { describe, expect, it } from 'vitest';
import { PUBLIC_ERROR_CODEC_CORPUS } from '@/tests/shared/idempotency-public-error-codec-corpus';
import { FakeIdempotencyKeyRepository } from './fake-idempotency-key-repository';

type Clock = { now: Date };

function createRepo(clock: Clock): FakeIdempotencyKeyRepository {
  return new FakeIdempotencyKeyRepository(() => clock.now);
}

function createClaimInput(expiresAt: Date) {
  return {
    userId: 'user_1',
    action: 'createCheckoutSession',
    key: 'idem_key_1',
    expiresAt,
  };
}

describe('FakeIdempotencyKeyRepository', () => {
  describe('claim/find', () => {
    it('claims a new key, rejects duplicate claim, and returns pending record state', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T00:10:00.000Z');
      const input = createClaimInput(expiresAt);

      await expect(repo.claim(input)).resolves.toEqual(clock.now);
      await expect(repo.claim(input)).resolves.toBeNull();

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: null,
        error: null,
        completedAt: null,
        expiresAt,
      });
    });

    it('returns the claimedAt token for the claim it created', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T00:10:00.000Z');
      const input = createClaimInput(expiresAt);

      await expect(repo.claim(input)).resolves.toEqual(clock.now);
      await expect(repo.claim(input)).resolves.toBeNull();
    });

    it('allows claim again after record expiration', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);

      await repo.claim(createClaimInput(new Date('2026-03-01T00:00:30.000Z')));

      clock.now = new Date('2026-03-01T00:00:31.000Z');
      await expect(
        repo.find('user_1', 'createCheckoutSession', 'idem_key_1'),
      ).resolves.toBeNull();

      await expect(
        repo.claim(createClaimInput(new Date('2026-03-01T00:05:00.000Z'))),
      ).resolves.toEqual(clock.now);
    });
  });

  describe('storeResult/storeError', () => {
    it('stores result payload and completion timestamp', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const input = createClaimInput(expiresAt);

      const claimedAt = await repo.claim(input);
      if (!claimedAt) throw new Error('Expected claim');

      clock.now = new Date('2026-03-01T00:00:05.000Z');
      await repo.storeResult({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt,
        resultJson: { checkoutUrl: 'https://example.test/checkout' },
      });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: { checkoutUrl: 'https://example.test/checkout' },
        error: null,
        completedAt: new Date('2026-03-01T00:00:05.000Z'),
        expiresAt,
      });
    });

    it('stores error payload and sets completion timestamp', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const input = createClaimInput(expiresAt);

      const claimedAt = await repo.claim(input);
      if (!claimedAt) throw new Error('Expected claim');

      clock.now = new Date('2026-03-01T00:00:06.000Z');
      await repo.storeError({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: null,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
        completedAt: new Date('2026-03-01T00:00:06.000Z'),
        expiresAt,
      });
    });

    it('rejects duplicate result completion with the same claim token', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const input = createClaimInput(expiresAt);

      const claimedAt = await repo.claim(input);
      if (!claimedAt) throw new Error('Expected claim');

      clock.now = new Date('2026-03-01T00:00:05.000Z');
      await repo.storeResult({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt,
        resultJson: { source: 'first' },
      });

      clock.now = new Date('2026-03-01T00:00:06.000Z');
      await expect(
        repo.storeResult({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt,
          resultJson: { source: 'second' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: { source: 'first' },
        error: null,
        completedAt: new Date('2026-03-01T00:00:05.000Z'),
        expiresAt,
      });
    });

    it('rejects duplicate error completion with the same claim token', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const input = createClaimInput(expiresAt);

      const claimedAt = await repo.claim(input);
      if (!claimedAt) throw new Error('Expected claim');

      clock.now = new Date('2026-03-01T00:00:05.000Z');
      await repo.storeError({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt,
        error: { code: 'INTERNAL_ERROR', message: 'first' },
      });

      clock.now = new Date('2026-03-01T00:00:06.000Z');
      await expect(
        repo.storeError({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt,
          error: { code: 'VALIDATION_ERROR', message: 'second' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: null,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
        completedAt: new Date('2026-03-01T00:00:05.000Z'),
        expiresAt,
      });
    });

    it('throws NOT_FOUND when storing result/error for a missing key', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);

      await expect(
        repo.storeResult({
          userId: 'user_1',
          action: 'createCheckoutSession',
          key: 'missing',
          claimedAt: new Date('2026-03-01T00:00:00.000Z'),
          resultJson: { ok: true },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      await expect(
        repo.storeError({
          userId: 'user_1',
          action: 'createCheckoutSession',
          key: 'missing',
          claimedAt: new Date('2026-03-01T00:00:00.000Z'),
          error: { code: 'INTERNAL_ERROR', message: 'boom' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    for (const corpusCase of PUBLIC_ERROR_CODEC_CORPUS) {
      it(`matches the public-error codec corpus: ${corpusCase.name}`, async () => {
        const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
        const repo = createRepo(clock);
        const expiresAt = new Date('2026-03-01T01:00:00.000Z');
        const input = createClaimInput(expiresAt);
        const claimedAt = await repo.claim(input);
        if (!claimedAt) throw new Error('Expected claim');

        if (corpusCase.expected !== undefined) {
          await Reflect.apply(repo.storeError, repo, [
            { ...input, claimedAt, error: corpusCase.input },
          ]);

          await expect(
            repo.find(input.userId, input.action, input.key),
          ).resolves.toMatchObject({ error: corpusCase.expected });
          return;
        }

        await expect(
          Reflect.apply(repo.storeError, repo, [
            { ...input, claimedAt, error: corpusCase.input },
          ]),
        ).rejects.toMatchObject({
          code: 'INTERNAL_ERROR',
          cause: expect.any(Error),
        });

        repo.seedRawErrorRecord({
          ...input,
          claimedAt,
          completedAt: clock.now,
          error: corpusCase.input,
        });
        await expect(
          repo.find(input.userId, input.action, input.key),
        ).rejects.toMatchObject({
          code: 'INTERNAL_ERROR',
          cause: expect.any(Error),
        });
      });
    }
  });

  describe('abortClaim', () => {
    it('removes only an incomplete pending claim for the exact key', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const input = createClaimInput(expiresAt);

      const claimedAt = await repo.claim(input);
      if (!claimedAt) throw new Error('Expected pending claim');
      await repo.claim({
        ...input,
        key: 'other_key',
      });

      await repo.abortClaim(input.userId, input.action, input.key, claimedAt);

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toBeNull();
      await expect(
        repo.find(input.userId, input.action, 'other_key'),
      ).resolves.toEqual({
        resultJson: null,
        error: null,
        completedAt: null,
        expiresAt,
      });
      await expect(repo.claim(input)).resolves.toEqual(clock.now);
    });

    it('does not remove a newer reclaimed pending row when aborting a stale claim token', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const initialClaimedAt = clock.now;
      const input = createClaimInput(new Date('2026-03-01T01:00:00.000Z'));

      await repo.claim({ ...input, zombieThresholdMs: 60_000 });

      clock.now = new Date('2026-03-01T00:01:01.000Z');
      const reclaimedAt = clock.now;
      await expect(
        repo.claim({
          ...input,
          expiresAt: new Date('2026-03-01T02:00:00.000Z'),
          zombieThresholdMs: 60_000,
        }),
      ).resolves.toEqual(reclaimedAt);

      await repo.abortClaim(
        input.userId,
        input.action,
        input.key,
        initialClaimedAt,
      );

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toEqual({
        resultJson: null,
        error: null,
        completedAt: null,
        expiresAt: new Date('2026-03-01T02:00:00.000Z'),
      });
    });

    it('does not let a stale claim token store a result over a newer reclaimed row', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const input = createClaimInput(new Date('2026-03-01T01:00:00.000Z'));

      const initialClaimedAt = await repo.claim({
        ...input,
        zombieThresholdMs: 60_000,
      });
      if (!initialClaimedAt) throw new Error('Expected initial claim');

      clock.now = new Date('2026-03-01T00:01:01.000Z');
      const reclaimedAt = await repo.claim({
        ...input,
        expiresAt: new Date('2026-03-01T02:00:00.000Z'),
        zombieThresholdMs: 60_000,
      });
      if (!reclaimedAt) throw new Error('Expected reclaimed claim');

      await expect(
        repo.storeResult({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt: initialClaimedAt,
          resultJson: { ok: 'stale' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await repo.storeResult({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt: reclaimedAt,
        resultJson: { ok: 'newer' },
      });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toMatchObject({
        resultJson: { ok: 'newer' },
        error: null,
      });
    });

    it('does not let a stale claim token store an error over a newer reclaimed row', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const input = createClaimInput(new Date('2026-03-01T01:00:00.000Z'));

      const initialClaimedAt = await repo.claim({
        ...input,
        zombieThresholdMs: 60_000,
      });
      if (!initialClaimedAt) throw new Error('Expected initial claim');

      clock.now = new Date('2026-03-01T00:01:01.000Z');
      const reclaimedAt = await repo.claim({
        ...input,
        expiresAt: new Date('2026-03-01T02:00:00.000Z'),
        zombieThresholdMs: 60_000,
      });
      if (!reclaimedAt) throw new Error('Expected reclaimed claim');

      await expect(
        repo.storeError({
          userId: input.userId,
          action: input.action,
          key: input.key,
          claimedAt: initialClaimedAt,
          error: { code: 'INTERNAL_ERROR', message: 'stale' },
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await repo.storeResult({
        userId: input.userId,
        action: input.action,
        key: input.key,
        claimedAt: reclaimedAt,
        resultJson: { ok: 'newer' },
      });

      await expect(
        repo.find(input.userId, input.action, input.key),
      ).resolves.toMatchObject({
        resultJson: { ok: 'newer' },
        error: null,
      });
    });

    it('does not remove completed result or error records', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);
      const expiresAt = new Date('2026-03-01T01:00:00.000Z');
      const resultInput = createClaimInput(expiresAt);
      const errorInput = {
        ...resultInput,
        key: 'idem_key_error',
      };

      const resultClaimedAt = await repo.claim(resultInput);
      if (!resultClaimedAt) throw new Error('Expected result claim');
      await repo.storeResult({
        userId: resultInput.userId,
        action: resultInput.action,
        key: resultInput.key,
        claimedAt: resultClaimedAt,
        resultJson: { ok: true },
      });
      const errorClaimedAt = await repo.claim(errorInput);
      if (!errorClaimedAt) throw new Error('Expected error claim');
      await repo.storeError({
        userId: errorInput.userId,
        action: errorInput.action,
        key: errorInput.key,
        claimedAt: errorClaimedAt,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      });

      await repo.abortClaim(
        resultInput.userId,
        resultInput.action,
        resultInput.key,
        resultClaimedAt,
      );
      await repo.abortClaim(
        errorInput.userId,
        errorInput.action,
        errorInput.key,
        errorClaimedAt,
      );

      await expect(
        repo.find(resultInput.userId, resultInput.action, resultInput.key),
      ).resolves.toMatchObject({
        resultJson: { ok: true },
        error: null,
      });
      await expect(
        repo.find(errorInput.userId, errorInput.action, errorInput.key),
      ).resolves.toMatchObject({
        resultJson: null,
        error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
      });
    });
  });

  describe('pruneExpiredBefore', () => {
    it('prunes oldest matching records first up to limit', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);

      await repo.claim({
        userId: 'user_1',
        action: 'action',
        key: 'k_oldest',
        expiresAt: new Date('2026-03-02T00:00:00.000Z'),
      });
      await repo.claim({
        userId: 'user_1',
        action: 'action',
        key: 'k_older',
        expiresAt: new Date('2026-03-03T00:00:00.000Z'),
      });
      await repo.claim({
        userId: 'user_1',
        action: 'action',
        key: 'k_newer',
        expiresAt: new Date('2026-03-04T00:00:00.000Z'),
      });

      await expect(
        repo.pruneExpiredBefore(new Date('2026-03-05T00:00:00.000Z'), 2),
      ).resolves.toBe(2);

      await expect(
        repo.find('user_1', 'action', 'k_oldest'),
      ).resolves.toBeNull();
      await expect(
        repo.find('user_1', 'action', 'k_older'),
      ).resolves.toBeNull();
      await expect(repo.find('user_1', 'action', 'k_newer')).resolves.toEqual({
        resultJson: null,
        error: null,
        completedAt: null,
        expiresAt: new Date('2026-03-04T00:00:00.000Z'),
      });
    });

    it('returns 0 for non-positive or non-integer limits and leaves records unchanged', async () => {
      const clock = { now: new Date('2026-03-01T00:00:00.000Z') };
      const repo = createRepo(clock);

      await repo.claim({
        userId: 'user_1',
        action: 'action',
        key: 'k_1',
        expiresAt: new Date('2026-03-02T00:00:00.000Z'),
      });

      await expect(
        repo.pruneExpiredBefore(new Date('2026-03-05T00:00:00.000Z'), 0),
      ).resolves.toBe(0);
      await expect(
        repo.pruneExpiredBefore(new Date('2026-03-05T00:00:00.000Z'), -1),
      ).resolves.toBe(0);
      await expect(
        repo.pruneExpiredBefore(new Date('2026-03-05T00:00:00.000Z'), 1.5),
      ).resolves.toBe(0);

      await expect(repo.find('user_1', 'action', 'k_1')).resolves.toEqual({
        resultJson: null,
        error: null,
        completedAt: null,
        expiresAt: new Date('2026-03-02T00:00:00.000Z'),
      });
    });
  });
});
