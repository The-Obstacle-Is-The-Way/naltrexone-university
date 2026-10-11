import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkClerkJwtKey,
  readPublishedKeys,
  runFromCommandLine,
} from './check-clerk-jwt-key';

const PUBLISHABLE_KEY = `pk_live_${Buffer.from('clerk.example.com$').toString('base64')}`;

function rsaKey() {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    jwk: { ...publicKey.export({ format: 'jwk' }), kid: 'ins_live' },
  };
}

function run(
  env: Record<string, string | undefined>,
  published: () => Promise<unknown> = async () => ({ keys: [] }),
) {
  const lines: string[] = [];
  const read: string[] = [];
  const done = checkClerkJwtKey({
    env,
    readJson: async (url) => {
      read.push(url);
      return published();
    },
    output: {
      log: (line: string) => lines.push(`log ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    },
  });
  return { done, lines, read };
}

// DEBT-503 item 5: a configured key that is not Clerk's would sign every
// visitor out, so the build refuses it before it can deploy.
describe('checkClerkJwtKey', () => {
  it('passes without a configured key, and reads nothing', async () => {
    const { done, read } = run({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    });

    expect(await done).toBe(0);
    expect(read).toEqual([]);
  });

  it('passes a key Clerk publishes for the instance', async () => {
    const key = rsaKey();
    const { done, read } = run(
      {
        CLERK_JWT_KEY: key.pem,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      },
      async () => ({ keys: [key.jwk] }),
    );

    expect(await done).toBe(0);
    expect(read).toEqual(['https://clerk.example.com/.well-known/jwks.json']);
  });

  it('fails a key Clerk does not publish', async () => {
    const { done, lines } = run(
      {
        CLERK_JWT_KEY: rsaKey().pem,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      },
      async () => ({ keys: [rsaKey().jwk] }),
    );

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error CLERK_JWT_KEY is not a key Clerk publishes for clerk.example.com',
    ]);
  });

  it('fails an unreadable key', async () => {
    const { done, lines } = run({
      CLERK_JWT_KEY: 'not a key',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    });

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error CLERK_JWT_KEY is not a public key in PEM form',
    ]);
  });

  // A failed build leaves the live deployment serving, so the check fails
  // closed rather than deploy a key it could not compare.
  it("fails when Clerk's published keys cannot be read", async () => {
    const { done, lines } = run(
      {
        CLERK_JWT_KEY: rsaKey().pem,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      },
      async () => {
        throw new Error('HTTP 503');
      },
    );

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error could not read the keys Clerk publishes for clerk.example.com: HTTP 503',
    ]);
  });

  it.each([
    ['not a publishable key', 'not-a-key'],
    [
      'a publishable key that names no host',
      `pk_live_${Buffer.from('nope').toString('base64')}`,
    ],
  ])('fails with %s', async (_label, publishableKey) => {
    const { done, lines } = run({
      CLERK_JWT_KEY: rsaKey().pem,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    });

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error CLERK_JWT_KEY needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to find the keys Clerk publishes',
    ]);
  });

  it('reports a read that fails without an Error', async () => {
    const { done, lines } = run(
      {
        CLERK_JWT_KEY: rsaKey().pem,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      },
      async () => Promise.reject('socket hang up'),
    );

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error could not read the keys Clerk publishes for clerk.example.com: socket hang up',
    ]);
  });

  it('fails without a publishable key naming the instance', async () => {
    const { done, lines } = run({ CLERK_JWT_KEY: rsaKey().pem });

    expect(await done).toBe(1);
    expect(lines).toEqual([
      'error CLERK_JWT_KEY needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to find the keys Clerk publishes',
    ]);
  });
});

describe('the build', () => {
  it('runs this check before next build, so no deploy is built with a wrong key', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    const steps: string[] = scripts.build.split(' && ');

    expect(steps.slice(0, steps.indexOf('next build') + 1)).toEqual([
      'tsx scripts/check-clerk-jwt-key.ts',
      'next build',
    ]);
  });
});

describe('readPublishedKeys', () => {
  it('returns the JSON Clerk serves, asking with a time limit', async () => {
    const asked: { url: string; timed: boolean }[] = [];

    const keys = await readPublishedKeys(
      'https://clerk.example.com/.well-known/jwks.json',
      async (url, init) => {
        asked.push({
          url: String(url),
          timed: init?.signal instanceof AbortSignal,
        });
        return Response.json({ keys: [] });
      },
    );

    expect(keys).toEqual({ keys: [] });
    expect(asked).toEqual([
      { url: 'https://clerk.example.com/.well-known/jwks.json', timed: true },
    ]);
  });

  it('fails with the status when Clerk does not answer 200', async () => {
    await expect(
      readPublishedKeys(
        'https://clerk.example.com/.well-known/jwks.json',
        async () => new Response(null, { status: 503 }),
      ),
    ).rejects.toThrow('HTTP 503');
  });
});

describe('runFromCommandLine', () => {
  function output() {
    const lines: string[] = [];
    return {
      lines,
      log: (line: string) => lines.push(`log ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    };
  }

  it('passes without a key, and reads nothing', async () => {
    const out = output();

    expect(
      await runFromCommandLine({}, out, async () => {
        throw new Error('read without a key');
      }),
    ).toBe(0);
    expect(out.lines).toEqual([
      'log CLERK_JWT_KEY is not set: Clerk fetches its signing keys',
    ]);
  });

  it('fails an unreadable key', async () => {
    const out = output();

    expect(await runFromCommandLine({ CLERK_JWT_KEY: 'not a key' }, out)).toBe(
      1,
    );
  });
});
