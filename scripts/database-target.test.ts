import { describe, expect, it } from 'vitest';
import {
  authorizeHumanDatabaseTargets,
  classifyDatabaseTarget,
  requireExplicitDatabaseUrl,
  serializeRemoteDatabaseTargets,
} from './database-target';
import { authorizeManagedDatabaseTargets } from './internal/database-target-managed';

describe('database target authorization', () => {
  it('refuses implicit dotenv fallback when DATABASE_URL is not supplied', () => {
    expect(() => requireExplicitDatabaseUrl({})).toThrow(
      /explicit DATABASE_URL.*implicit.*fallback/i,
    );
  });

  it.each([
    'postgresql://user:password@localhost:5432/app',
    'postgresql://user:password@127.0.0.1:5432/app',
    'postgresql://user:password@127.0.0.42:5432/app',
    'postgresql://user:password@[::1]:5432/app',
  ])('classifies loopback target %s as LOCAL', (databaseUrl) => {
    expect(classifyDatabaseTarget(databaseUrl).kind).toBe('LOCAL');
  });

  it.each([
    'postgresql://user:password@ep-example.neon.tech/app',
    'postgresql://user:password@10.0.0.4:5432/app',
    'postgresql://user:password@db.internal/app',
  ])('classifies every non-loopback target %s as REMOTE', (databaseUrl) => {
    expect(classifyDatabaseTarget(databaseUrl).kind).toBe('REMOTE');
  });

  it('formats targets without credentials or connection parameters', () => {
    const target = classifyDatabaseTarget(
      'postgresql://operator:super-secret@db.example:6543/app?sslmode=require',
    );

    expect(target.display).toBe('db.example:6543/app');
    expect(JSON.stringify(target)).not.toContain('operator');
    expect(JSON.stringify(target)).not.toContain('super-secret');
    expect(JSON.stringify(target)).not.toContain('sslmode');
  });

  it('serializes sorted unique remote targets as canonical JSON', () => {
    expect(
      serializeRemoteDatabaseTargets([
        'postgresql://a:first@z.example/app',
        'postgresql://b:second@a.example:6543/other',
        'postgresql://c:third@z.example/app?sslmode=require',
        'postgresql://local:pw@127.0.0.1:5432/local',
      ]),
    ).toBe('["a.example:6543/other","z.example/app"]');
  });

  it('allows an explicit local target without acknowledgement', () => {
    expect(
      authorizeHumanDatabaseTargets({
        databaseUrls: ['postgresql://user:password@127.0.0.1:5432/app'],
      }),
    ).toMatchObject({
      acknowledgement: '[]',
      targets: [{ kind: 'LOCAL', display: '127.0.0.1:5432/app' }],
    });
  });

  it('requires the exact canonical acknowledgement for a remote target', () => {
    const databaseUrl =
      'postgresql://operator:super-secret@ep-example-pooler.us-east-2.aws.neon.tech/app';
    const acknowledgement = '["ep-example-pooler.us-east-2.aws.neon.tech/app"]';

    expect(
      authorizeHumanDatabaseTargets({
        databaseUrls: [databaseUrl],
        acknowledgement,
      }),
    ).toMatchObject({ acknowledgement });
  });

  it.each([
    undefined,
    '',
    '["wrong.example/app"]',
  ])('rejects missing or wrong remote acknowledgement %s without leaking credentials', (acknowledgement) => {
    const databaseUrl =
      'postgresql://operator:super-secret@db.example/app?sslmode=require';

    expect(() =>
      authorizeHumanDatabaseTargets({
        databaseUrls: [databaseUrl],
        acknowledgement,
      }),
    ).toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');

    try {
      authorizeHumanDatabaseTargets({
        databaseUrls: [databaseUrl],
        acknowledgement,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('operator');
      expect(message).not.toContain('super-secret');
      expect(message).not.toContain('sslmode');
    }
  });

  it('does not accept CI, Vercel, env, or CLI-shaped values as a managed bypass', () => {
    const databaseUrl = 'postgresql://user:password@db.example/app';
    const env: Record<string, string | undefined> = {
      DATABASE_URL: databaseUrl,
      CI: 'true',
      VERCEL: '1',
      DB_TARGET_MODE: 'managed',
    };

    expect(() =>
      authorizeHumanDatabaseTargets({
        databaseUrls: [requireExplicitDatabaseUrl(env)],
        acknowledgement: env.DB_TARGET_ACK,
      }),
    ).toThrow('DB_TARGET_ACK must exactly equal ["db.example/app"]');
  });

  it('makes managed authorization reachable through the internal API', () => {
    expect(
      authorizeManagedDatabaseTargets([
        'postgresql://user:password@db.example/app',
      ]),
    ).toMatchObject({
      acknowledgement: '["db.example/app"]',
      targets: [{ kind: 'REMOTE', display: 'db.example/app' }],
    });
  });
});
