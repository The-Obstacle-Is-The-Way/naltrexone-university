import { beforeEach, describe, expect, it, vi } from 'vitest';

type ResetBookmarksForE2EUser =
  typeof import('./reset-bookmarks-for-e2e-user').resetBookmarksForE2EUser;

function createEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
  } as NodeJS.ProcessEnv;
}

type UnsafeTx = {
  unsafe: ReturnType<typeof vi.fn>;
};

function createSqlClient(options: {
  results?: unknown[];
  beginImplementation?: (tx: UnsafeTx) => Promise<void>;
}) {
  const queuedResults = [...(options.results ?? [])];
  const sql = vi.fn(async () => queuedResults.shift() ?? []);
  const tx: UnsafeTx = {
    unsafe: vi.fn(async () => {}),
  };

  return Object.assign(sql, {
    tx,
    begin: vi.fn(async (callback: (tx: typeof tx) => Promise<void>) => {
      if (options.beginImplementation) {
        await options.beginImplementation(tx);
        return;
      }

      await callback(tx);
    }),
    end: vi.fn(async () => {}),
  });
}

describe('resetBookmarksForE2EUser default services', () => {
  let resetBookmarksForE2EUser: ResetBookmarksForE2EUser;
  let postgresMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    postgresMock = vi.fn();
    vi.doMock('postgres', () => ({
      default: postgresMock,
    }));

    ({ resetBookmarksForE2EUser } = await import(
      './reset-bookmarks-for-e2e-user'
    ));
  });

  it('resets the deterministic bookmark baseline through the default DB services', async () => {
    const ensureClient = createSqlClient({
      results: [[{ count: '1' }], []],
    });
    const appUserClient = createSqlClient({
      results: [[{ id: 'app_user_123' }]],
    });
    const fixtureClient = createSqlClient({
      results: [[{ id: 'question_123' }]],
    });
    const resetClient = createSqlClient({});
    const verifyClient = createSqlClient({
      results: [[{ bookmarkCount: 1, placeholderBookmarkCount: 1 }]],
    });

    postgresMock
      .mockReturnValueOnce(ensureClient)
      .mockReturnValueOnce(appUserClient)
      .mockReturnValueOnce(fixtureClient)
      .mockReturnValueOnce(resetClient)
      .mockReturnValueOnce(verifyClient);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'clerk_user_123' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        resetBookmarksForE2EUser({
          env: createEnv(),
        }),
      ).resolves.toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }

    expect(postgresMock).toHaveBeenCalledTimes(5);
    expect(resetClient.begin).toHaveBeenCalledTimes(1);
    expect(resetClient.tx.unsafe).toHaveBeenCalledTimes(2);
    const unsafeCalls = resetClient.tx.unsafe.mock.calls as Array<
      [string, unknown[]]
    >;
    expect(unsafeCalls[0]?.[0]).toContain('DELETE FROM bookmarks');
    expect(unsafeCalls[1]?.[0]).toContain('INSERT INTO bookmarks');
    expect(unsafeCalls[1]?.[1]).toEqual([
      'app_user_123',
      'question_123',
      '2026-01-01T00:05:00.000Z',
    ]);
    expect(verifyClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('fails with an explicit fixture-missing error when the placeholder question is absent', async () => {
    const ensureClient = createSqlClient({
      results: [[{ count: '0' }]],
    });
    postgresMock.mockReturnValueOnce(ensureClient);

    await expect(
      resetBookmarksForE2EUser({
        env: createEnv(),
      }),
    ).rejects.toThrow('[E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING]');
    expect(ensureClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('fails with an explicit fixture-missing error when the published bookmark fixture is unavailable', async () => {
    const ensureClient = createSqlClient({
      results: [[{ count: '1' }], []],
    });
    const appUserClient = createSqlClient({
      results: [[{ id: 'app_user_123' }]],
    });
    const fixtureClient = createSqlClient({
      results: [[]],
    });

    postgresMock
      .mockReturnValueOnce(ensureClient)
      .mockReturnValueOnce(appUserClient)
      .mockReturnValueOnce(fixtureClient);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'clerk_user_123' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        resetBookmarksForE2EUser({
          env: createEnv(),
        }),
      ).rejects.toThrow(
        '[E2E_BOOKMARK_RESET:BOOKMARK_QUESTION_FIXTURE_MISSING]',
      );
    } finally {
      fetchSpy.mockRestore();
    }

    expect(fixtureClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('wraps transaction failures from the default mutation service', async () => {
    const ensureClient = createSqlClient({
      results: [[{ count: '1' }], []],
    });
    const appUserClient = createSqlClient({
      results: [[{ id: 'app_user_123' }]],
    });
    const fixtureClient = createSqlClient({
      results: [[{ id: 'question_123' }]],
    });
    const resetClient = createSqlClient({
      beginImplementation: async () => {
        throw new Error('write failed');
      },
    });

    postgresMock
      .mockReturnValueOnce(ensureClient)
      .mockReturnValueOnce(appUserClient)
      .mockReturnValueOnce(fixtureClient)
      .mockReturnValueOnce(resetClient);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'clerk_user_123' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        resetBookmarksForE2EUser({
          env: createEnv(),
        }),
      ).rejects.toThrow('[E2E_BOOKMARK_RESET:DATABASE_MUTATION_FAILED]');
    } finally {
      fetchSpy.mockRestore();
    }

    expect(resetClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('fails when verification detects a non-deterministic bookmark baseline', async () => {
    const ensureClient = createSqlClient({
      results: [[{ count: '1' }], []],
    });
    const appUserClient = createSqlClient({
      results: [[{ id: 'app_user_123' }]],
    });
    const fixtureClient = createSqlClient({
      results: [[{ id: 'question_123' }]],
    });
    const resetClient = createSqlClient({});
    const verifyClient = createSqlClient({
      results: [[{ bookmarkCount: 2, placeholderBookmarkCount: 1 }]],
    });

    postgresMock
      .mockReturnValueOnce(ensureClient)
      .mockReturnValueOnce(appUserClient)
      .mockReturnValueOnce(fixtureClient)
      .mockReturnValueOnce(resetClient)
      .mockReturnValueOnce(verifyClient);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'clerk_user_123' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    try {
      await expect(
        resetBookmarksForE2EUser({
          env: createEnv(),
        }),
      ).rejects.toThrow('[E2E_BOOKMARK_RESET:BASELINE_STATE_INCOMPLETE]');
    } finally {
      fetchSpy.mockRestore();
    }

    expect(verifyClient.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
