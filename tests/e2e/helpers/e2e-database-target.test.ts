import { describe, expect, it } from 'vitest';
import {
  e2eDatabaseTargetRefusal,
  guardE2EDatabaseUrl,
} from './e2e-database-target';

const REMOTE_URL = 'postgresql://app:hunter2@ep-example.neon.tech/app';

describe('the E2E database target (BUG-360)', () => {
  it.each([
    'postgresql://postgres:postgres@localhost:5432/test',
    'postgresql://postgres:postgres@127.0.0.1:55432/test',
    'postgresql://postgres:postgres@[::1]:5432/test',
  ])('accepts the loopback database %s', (databaseUrl) => {
    expect(guardE2EDatabaseUrl(databaseUrl, {})).toBe(databaseUrl);
  });

  it('refuses a remote database, naming its host but not its credentials', () => {
    const refusal = () => guardE2EDatabaseUrl(REMOTE_URL, {});

    expect(refusal).toThrow(/non-local host "ep-example\.neon\.tech"/);
    expect(refusal).toThrow(/pnpm test:e2e/);
    expect(refusal).not.toThrow(/hunter2/);
  });

  it.each(['true', 'TRUE', '1', 'yes'])(
    'accepts a remote database for a deploy-target check opted in with ALLOW_NON_LOCAL_DATABASE_URL=%s',
    (value) => {
      expect(
        guardE2EDatabaseUrl(REMOTE_URL, {
          ALLOW_NON_LOCAL_DATABASE_URL: value,
        }),
      ).toBe(REMOTE_URL);
    },
  );

  it('refuses an opt-in that is not a recognized true value', () => {
    expect(() =>
      guardE2EDatabaseUrl(REMOTE_URL, {
        ALLOW_NON_LOCAL_DATABASE_URL: 'false',
      }),
    ).toThrow(/non-local host/);
  });

  it('refuses a value that is not a URL, without echoing it', () => {
    const refusal = e2eDatabaseTargetRefusal('not a url hunter2', {});

    expect(refusal?.message).toBe('DATABASE_URL is not a valid URL.');
    expect(JSON.stringify(refusal)).not.toContain('hunter2');
  });
});
