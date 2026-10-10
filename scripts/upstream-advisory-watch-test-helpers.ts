// Fixtures shared by the upstream advisory watch tests.
import type {
  AdvisoryDatabase,
  AdvisoryIssue,
  AdvisoryIssues,
  DependencyVersions,
  ReviewedAdvisory,
  UpstreamAdvisory,
} from './upstream-advisory-watch';

export class MemoryIssues implements AdvisoryIssues {
  issues: (AdvisoryIssue & {
    body: string;
    urgent: boolean;
    comments: string[];
  })[] = [];
  async list() {
    return this.issues;
  }
  async create(title: string, body: string, urgent: boolean) {
    this.issues.push({
      number: this.issues.length + 1,
      title,
      body,
      state: 'OPEN',
      urgent,
      comments: [],
    });
  }
  async comments(number: number) {
    return this.find(number).comments;
  }
  async close(number: number, comment: string) {
    const issue = this.find(number);
    issue.comments.push(comment);
    issue.state = 'CLOSED';
  }
  private find(number: number) {
    const issue = this.issues.find((entry) => entry.number === number);
    if (!issue) throw new Error(`No issue ${number}`);
    return issue;
  }
}

export const advisory = (
  overrides: Partial<UpstreamAdvisory> = {},
): UpstreamAdvisory => ({
  ghsaId: 'GHSA-aaaa-bbbb-cccc',
  cveId: 'CVE-2026-00001',
  severity: 'critical',
  summary: 'Remote code execution in a fixture',
  url: 'https://github.com/vercel/next.js/security/advisories/GHSA-aaaa-bbbb-cccc',
  publishedAt: '2026-10-08T16:00:00Z',
  vulnerabilities: [
    {
      package: 'next',
      vulnerableRange: '>= 16.0.0 < 16.3.?',
      patchedVersions: '16.3.?',
    },
  ],
  ...overrides,
});

export const manifest: DependencyVersions = {
  direct: { next: '16.3.6' },
  locked: new Map([
    ['next', ['16.3.6']],
    ['undici', ['6.21.0', '7.29.1']],
  ]),
};

export const apiAdvisory = {
  ghsa_id: 'GHSA-aaaa-bbbb-cccc',
  cve_id: 'CVE-2026-00001',
  severity: 'critical',
  summary: '  Remote code\nexecution  ',
  html_url:
    'https://github.com/vercel/next.js/security/advisories/GHSA-aaaa-bbbb-cccc',
  published_at: '2026-10-08T16:00:00Z',
  state: 'published',
  vulnerabilities: [
    {
      package: { ecosystem: 'npm', name: 'next' },
      vulnerable_version_range: '>= 16.0.0 < 16.3.?',
      patched_versions: '16.3.?',
    },
  ],
};

// GitHub's database does not have the advisory yet, the usual case at first.
export const unreviewed: AdvisoryDatabase = { find: async () => null };

// GitHub's reviewed copy of an advisory, with these npm ranges.
export const reviewed = (
  ...vulnerabilities: [pkg: string, range: string | null][]
): ReviewedAdvisory => ({
  reviewed: true,
  vulnerabilities: vulnerabilities.map(([name, range]) => ({
    ecosystem: 'npm',
    package: name,
    range,
  })),
});

export const reviewedAs = (
  ...vulnerabilities: [pkg: string, range: string | null][]
): AdvisoryDatabase => ({ find: async () => reviewed(...vulnerabilities) });
