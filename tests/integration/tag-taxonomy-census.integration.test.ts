import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CANONICAL_SUBSTANCE_SLUGS,
  CANONICAL_TOPIC_SLUGS,
  CANONICAL_TREATMENT_SLUGS,
} from '@/lib/content/draftTaxonomy';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run integration tests. Did you forget to set it?',
  );
}

const allowNonLocal = process.env.ALLOW_NON_LOCAL_DATABASE_URL === 'true';
const host = new URL(databaseUrl).hostname;
const isLocalhost =
  host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!allowNonLocal && !isLocalhost) {
  throw new Error(
    `Refusing to run integration tests against non-local DATABASE_URL host "${host}". Set DATABASE_URL to a local Postgres (recommended: Docker) or export ALLOW_NON_LOCAL_DATABASE_URL=true to override.`,
  );
}

const sql = postgres(databaseUrl, { max: 1 });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe('tag taxonomy census', () => {
  it('all tags have canonical kinds (no domain rows)', async () => {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count
      from tags
      where kind::text = 'domain'
    `;

    expect(rows[0]?.count ?? 0).toBe(0);
  });

  it('all topic slugs are from the canonical 13', async () => {
    const rows = await sql<{ slug: string }[]>`
      select slug
      from tags
      where kind::text = 'topic'
    `;

    expect(rows.length).toBeGreaterThan(0);
    const canonical = new Set<string>(CANONICAL_TOPIC_SLUGS);
    for (const row of rows) {
      expect(
        canonical.has(row.slug),
        `non-canonical topic slug: "${row.slug}"`,
      ).toBe(true);
    }
  });

  it('all substance slugs are from the canonical 11', async () => {
    const rows = await sql<{ slug: string }[]>`
      select slug
      from tags
      where kind::text = 'substance'
    `;

    expect(rows.length).toBeGreaterThan(0);
    const canonical = new Set<string>(CANONICAL_SUBSTANCE_SLUGS);
    for (const row of rows) {
      expect(
        canonical.has(row.slug),
        `non-canonical substance slug: "${row.slug}"`,
      ).toBe(true);
    }
  });

  it('all treatment slugs are from the canonical 12', async () => {
    const rows = await sql<{ slug: string }[]>`
      select slug
      from tags
      where kind::text = 'treatment'
    `;

    expect(rows.length).toBeGreaterThan(0);
    const canonical = new Set<string>(CANONICAL_TREATMENT_SLUGS);
    for (const row of rows) {
      expect(
        canonical.has(row.slug),
        `non-canonical treatment slug: "${row.slug}"`,
      ).toBe(true);
    }
  });
});
