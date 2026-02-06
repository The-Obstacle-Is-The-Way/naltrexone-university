/**
 * Migrate domain tags from content-source names to exam blueprint sections.
 *
 * Old domain values (content-source names):
 *   article-based-pathway, asam-guidelines, prescribers-guide,
 *   50-studies-every-psychiatrist-should-know, cochrane, personal-papers, therapy
 *
 * New domain values (exam blueprint sections):
 *   pharmacology-neuroscience, screening-diagnosis, treatment-pharmacotherapy,
 *   psychosocial-interventions, co-occurring-complications, epidemiology-prevention,
 *   ethics-legal-policy
 *
 * Usage: npx tsx scripts/migrate-domain-tags.ts [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises';
import fg from 'fast-glob';
import matter from 'gray-matter';

const OLD_DOMAIN_SLUGS = new Set([
  'article-based-pathway',
  'asam-guidelines',
  'prescribers-guide',
  '50-studies-every-psychiatrist-should-know',
  'cochrane',
  'personal-papers',
  'therapy',
]);

type TagEntry = {
  slug: string;
  name: string;
  kind: string;
};

type NewDomain = {
  slug: string;
  name: string;
};

const NEW_DOMAINS: Record<string, NewDomain> = {
  'pharmacology-neuroscience': {
    slug: 'pharmacology-neuroscience',
    name: 'Pharmacology & Neuroscience',
  },
  'screening-diagnosis': {
    slug: 'screening-diagnosis',
    name: 'Screening & Diagnosis',
  },
  'treatment-pharmacotherapy': {
    slug: 'treatment-pharmacotherapy',
    name: 'Treatment & Pharmacotherapy',
  },
  'psychosocial-interventions': {
    slug: 'psychosocial-interventions',
    name: 'Psychosocial Interventions',
  },
  'co-occurring-complications': {
    slug: 'co-occurring-complications',
    name: 'Co-occurring & Medical Complications',
  },
  'epidemiology-prevention': {
    slug: 'epidemiology-prevention',
    name: 'Epidemiology & Prevention',
  },
  'ethics-legal-policy': {
    slug: 'ethics-legal-policy',
    name: 'Ethics, Legal & Policy',
  },
};

/**
 * Given the existing topic slugs on a question, determine the best new domain.
 * Priority order matters — more specific topics win over generic ones.
 */
function inferDomainFromTopics(
  topicSlugs: Set<string>,
  oldDomainSlug: string,
): string {
  // Direct mappings: therapy domain always → psychosocial-interventions
  if (oldDomainSlug === 'therapy') {
    return 'psychosocial-interventions';
  }

  // Priority-ordered topic → domain mapping
  // More specific topics checked first
  if (topicSlugs.has('ethics-legal')) return 'ethics-legal-policy';
  if (topicSlugs.has('psychotherapy')) return 'psychosocial-interventions';
  if (
    topicSlugs.has('comorbidity') ||
    topicSlugs.has('medical-complications')
  ) {
    return 'co-occurring-complications';
  }
  if (topicSlugs.has('epidemiology') || topicSlugs.has('harm-reduction')) {
    return 'epidemiology-prevention';
  }
  if (topicSlugs.has('screening')) return 'screening-diagnosis';
  if (topicSlugs.has('diagnosis')) return 'screening-diagnosis';
  if (topicSlugs.has('neurobiology')) return 'pharmacology-neuroscience';
  if (topicSlugs.has('toxicology')) return 'screening-diagnosis';

  // For prescribers-guide, pharmacology is the primary signal
  if (oldDomainSlug === 'prescribers-guide' && topicSlugs.has('pharmacology')) {
    return 'pharmacology-neuroscience';
  }

  if (topicSlugs.has('pharmacology')) return 'pharmacology-neuroscience';

  // Treatment-related topics
  if (topicSlugs.has('withdrawal') || topicSlugs.has('intoxication')) {
    return 'treatment-pharmacotherapy';
  }
  if (topicSlugs.has('treatment')) return 'treatment-pharmacotherapy';
  if (topicSlugs.has('special-populations')) {
    return 'treatment-pharmacotherapy';
  }

  // Fallback based on old domain
  switch (oldDomainSlug) {
    case 'prescribers-guide':
      return 'pharmacology-neuroscience';
    case 'asam-guidelines':
      return 'treatment-pharmacotherapy';
    case 'cochrane':
      return 'treatment-pharmacotherapy';
    default:
      return 'treatment-pharmacotherapy';
  }
}

function migrateTags(tags: TagEntry[], oldDomainSlug: string): TagEntry[] {
  const topicSlugs = new Set(
    tags.filter((t) => t.kind === 'topic').map((t) => t.slug),
  );

  const newDomainKey = inferDomainFromTopics(topicSlugs, oldDomainSlug);
  const newDomain = NEW_DOMAINS[newDomainKey];

  if (!newDomain) {
    throw new Error(`Unknown new domain key: ${newDomainKey}`);
  }

  // Replace the old domain tag with the new one
  return tags.map((tag) => {
    if (tag.kind === 'domain' && OLD_DOMAIN_SLUGS.has(tag.slug)) {
      return {
        slug: newDomain.slug,
        name: newDomain.name,
        kind: 'domain',
      };
    }
    return tag;
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const files = await fg(['content/questions/imported/**/*.mdx'], {
    onlyFiles: true,
    unique: true,
    absolute: true,
    dot: false,
  });

  console.info(`Found ${files.length} MDX files`);

  const stats = {
    migrated: 0,
    skipped: 0,
    errors: 0,
    byNewDomain: new Map<string, number>(),
  };

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { data, content: body } = matter(raw);
    const tags: TagEntry[] = data.tags ?? [];

    const domainTag = tags.find(
      (t: TagEntry) => t.kind === 'domain' && OLD_DOMAIN_SLUGS.has(t.slug),
    );
    if (!domainTag) {
      // Already migrated or no domain tag
      stats.skipped += 1;
      continue;
    }

    try {
      const newTags = migrateTags(tags, domainTag.slug);
      const newDomainTag = newTags.find((t) => t.kind === 'domain');
      const newDomainSlug = newDomainTag?.slug ?? 'unknown';

      stats.byNewDomain.set(
        newDomainSlug,
        (stats.byNewDomain.get(newDomainSlug) ?? 0) + 1,
      );

      if (!dryRun) {
        const newData = { ...data, tags: newTags };
        const newRaw = matter.stringify(body, newData);
        await writeFile(file, newRaw, 'utf8');
      }

      stats.migrated += 1;
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
      stats.errors += 1;
    }
  }

  console.info(`\n${dryRun ? '[DRY RUN] ' : ''}Migration complete:`);
  console.info(`  Migrated: ${stats.migrated}`);
  console.info(`  Skipped: ${stats.skipped}`);
  console.info(`  Errors: ${stats.errors}`);
  console.info('\nNew domain distribution:');
  for (const [domain, count] of [...stats.byNewDomain.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.info(`  ${domain}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
