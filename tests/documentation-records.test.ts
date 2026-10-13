import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  archiveDestinations,
  auditDocumentation,
  auditRecordLifecycle,
  type DocumentationAudit,
  RECORDS,
  readDocumentationFiles,
  recordLinks,
  runDocumentationCommand,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

// Open bug and debt records live in docs/records/, with one index; a closed
// record is deleted and leaves a line in the ledger (DEBT-518, ADR-023).
describe('records folder and ledger', () => {
  it('compares closed ledger IDs by number, including historical allowances', () => {
    expect(
      audit({
        [RECORDS.ledger]: [
          '- BUG-005 · One · Resolved · 2026-10-01 · docs/a.md',
          '- BUG-05 · Two · Resolved · 2026-10-01 · docs/b.md',
        ].join('\n'),
      }).duplicateLedgerIds,
    ).toHaveLength(1);
  });

  it.each(['', 'Verifyng — check; due 2026-10-20', 'Openish'])(
    'rejects an unrecognized or absent live status: %s',
    (status) => {
      expect(
        audit({ 'docs/records/bug-001-x.md': `**Status:** ${status}` })
          .invalidStatus,
      ).toEqual(['docs/records/bug-001-x.md']);
    },
  );

  it('requires a remaining check as well as a Verifying due date', () => {
    expect(
      audit({
        'docs/records/bug-001-x.md': '**Status:** Verifying — due 2026-10-20',
      }).invalidScheduledChecks,
    ).toEqual(['docs/records/bug-001-x.md']);
  });

  it('requires a retrieval commit and closing PR for a deleted working record', () => {
    expect(
      audit({
        [RECORDS.ledger]:
          '- BUG-338 · Example · Resolved · 2026-10-11 · docs/records/bug-338-example.md',
      }).malformedLedgerLines,
    ).toEqual([`${RECORDS.ledger}:1`]);
    expect(
      audit({
        [RECORDS.ledger]:
          '- BUG-338 · Example · Resolved · 2026-10-11 · docs/records/bug-338-example.md · #1468 · 0123456789abcdef0123456789abcdef01234567',
      }).malformedLedgerLines,
    ).toEqual([]);
  });

  // From the 2026-10-11 cutover on, every closure carries its receipt, so a
  // mistyped path cannot pass as a historical entry.
  it('requires a receipt for a closure from the cutover on, whatever its path', () => {
    expect(
      audit({
        [RECORDS.ledger]: [
          '- BUG-338 · Example · Resolved · 2026-10-12 · docs/record/bug-338-example.md',
          '- BS-044 · Idea · Moved to product ideas · 2026-10-11 · docs/brainstorming/bs-044-x.md',
          '- BUG-200 · Before the cutover · Resolved · 2026-10-10 · docs/_archive/bugs/bug-200-x.md',
          '- BS-045 · Idea · Moved to product ideas · 2026-10-11 · docs/brainstorming/bs-045-x.md · #1467 · 0123456789abcdef0123456789abcdef01234567',
        ].join('\n'),
      }).malformedLedgerLines,
    ).toEqual([`${RECORDS.ledger}:1`, `${RECORDS.ledger}:2`]);
  });

  it('requires one readable queue-review date in the records index', () => {
    const index = (queue: string) =>
      `${queue}\n\n**Now** — none\n\n| ID | Title |\n| --- | --- |`;
    const invalid = (text: string) =>
      audit({ [RECORDS.index]: text }).invalidQueueReview;
    expect(invalid(index('**Queue review due:** 2026-10-19'))).toEqual([]);
    expect(invalid(index('**Queue review due:** 2026-10-19\r'))).toEqual([]);
    expect(invalid(index('**Queue review due:** 2026-1-5'))).toEqual([
      RECORDS.index,
    ]);
    expect(invalid(index(''))).toEqual([RECORDS.index]);
    expect(
      invalid(
        index(
          '**Queue review due:** 2026-10-19\n**Queue review due:** 2026-1-5',
        ),
      ),
    ).toEqual([RECORDS.index]);
  });

  // Git can check Markdown out with CRLF endings (core.autocrlf).
  it('reads ledger lines with CRLF endings', () => {
    expect(
      audit({
        [RECORDS.ledger]:
          '- BUG-338 · Example · Resolved · 2026-10-11 · docs/records/bug-338-example.md · #1468 · 0123456789abcdef0123456789abcdef01234567\r\n- BUG-200 · Old · Resolved · 2026-10-01 · docs/_archive/bugs/bug-200-x.md\r\n',
      }).malformedLedgerLines,
    ).toEqual([]);
  });

  it('rejects a record recreated under a nested retired register path', () => {
    expect(
      audit({ 'docs/bugs/investigation/bug-338-x.md': '**Status:** Open' })
        .retiredRegisterFiles,
    ).toEqual(['docs/bugs/investigation/bug-338-x.md']);
  });

  it('reports two open records with the same ID', () => {
    expect(
      audit({
        'docs/records/debt-519-first.md': '# One branch',
        'docs/records/debt-519-second.md': '# Another branch',
      }).duplicates,
    ).toEqual(['docs/records/debt-519-second.md']);
  });

  it('reports a live record whose ID is already in the closed ledger', () => {
    expect(
      audit({
        'docs/records/bug-002-example.md': '# Reopened by mistake',
        'docs/records/closed.md':
          '## Bugs\n\n- BUG-002 · Example · Resolved · 2026-10-01 · #1 · docs/_archive/bugs/bug-002-example.md',
      }).duplicates,
    ).toEqual(['docs/records/bug-002-example.md']);
  });

  it('reports an ID listed twice in the closed ledger', () => {
    expect(
      audit({
        'docs/records/closed.md':
          '## Debt\n\n- DEBT-007 · One · Resolved · 2026-10-01 · #1 · a.md\n- DEBT-008 · Two · Resolved · 2026-10-01 · #2 · b.md\n- DEBT-007 · Again · Resolved · 2026-10-02 · #3 · c.md',
      }).duplicateLedgerIds,
    ).toEqual(['DEBT-007']);
  });

  it('reports an ID listed twice with different zero-padding', () => {
    expect(
      audit({
        'docs/records/closed.md':
          '- BUG-05 · One · Resolved · 2026-10-01 · #1 · a.md\n- BUG-005 · Again · Resolved · 2026-10-02 · #2 · b.md',
      }).duplicateLedgerIds,
    ).toEqual(['BUG-05']);
  });

  it('allows only the three ID collisions made before IDs were checked', () => {
    expect(
      audit({
        'docs/records/closed.md':
          '- SPEC-028 · One · Implemented · 2026-03-01 · a.md\n- SPEC-028 · Two · Implemented · 2026-03-02 · b.md',
      }).duplicateLedgerIds,
    ).toEqual([]);
  });

  it.each([
    'docs/debt/index.md',
    'docs/bugs/bug-003-example.md',
    'docs/specs/index.md',
    'docs/brainstorming/bs-001-example.md',
    'docs/audits/audit-001-example.md',
    'docs/qa/qa-001-example.md',
  ])(
    'reports %s, left in a register folder that docs/records replaced',
    (file) => {
      expect(audit({ [file]: '# Left behind' }).retiredRegisterFiles).toEqual([
        file,
      ]);
    },
  );

  it('rejects the old specification path after the layout move', () => {
    expect(
      audit({ 'docs/specs/master_spec.md': '# Living spec' })
        .retiredRegisterFiles,
    ).toEqual(['docs/specs/master_spec.md']);
  });

  it.each([
    'dev',
    'frontend',
    'practice-engine',
    'content',
    'tooling',
    'vendor-docs',
    'legal',
    'security',
  ])('rejects a concurrent guide added to retired docs/%s', (folder) => {
    const file = `docs/${folder}/new-concurrent-guide.md`;
    expect(audit({ [file]: '# New guide' }).retiredRegisterFiles).toEqual([
      file,
    ]);
  });

  it('reports only Markdown left in a retired or register folder', () => {
    expect(
      audit({
        'docs/dev/script.ts': 'export {};',
        'docs/bugs/notes.txt': 'notes',
      }).retiredRegisterFiles,
    ).toEqual([]);
  });

  it('reports a link into a record from anywhere but the index', () => {
    const files = {
      'docs/records/README.md':
        '| [DEBT-001](./debt-001-example.md) | Example |',
      'docs/records/debt-001-example.md': '**Status:** Open',
      'docs/records/bug-002-example.md':
        'See [DEBT-001](./debt-001-example.md).',
      'docs/dev/guide.md':
        'See [the record](../records/debt-001-example.md#why).',
      'docs/policies/legal/privacy-policy.md':
        'Evidence: [DEBT-001](../../records/debt-001-example.md).',
    };
    expect(
      Object.entries(files).flatMap(([file, contents]) =>
        recordLinks(file, contents).map((link) => `${link.file}:${link.url}`),
      ),
    ).toEqual([
      'docs/records/bug-002-example.md:./debt-001-example.md',
      'docs/dev/guide.md:../records/debt-001-example.md#why',
      'docs/policies/legal/privacy-policy.md:../../records/debt-001-example.md',
    ]);
    expect(audit(files).recordLinks).toHaveLength(3);
  });

  it('keeps only records, the index and the ledger directly in docs/records', () => {
    expect(
      audit({
        'docs/records/README.md': '**Now** — current',
        'docs/records/closed.md': '# Closed',
        'docs/records/debt-001-example.md': '**Status:** Open',
        'docs/records/notes.md': '# Stray',
        'docs/records/assets/debt-414/receipt.md': '# Legacy asset',
      }).strayRegisterFiles,
    ).toEqual(['docs/records/notes.md']);
  });
  it('reports an absolute link to a record unless it pins a commit', () => {
    const pinned =
      'https://github.com/o/r/blob/0123456789abcdef0123456789abcdef01234567/docs/records/bug-001-x.md';
    const contents = [
      '[branch](https://github.com/o/r/blob/dev/docs/records/bug-001-x.md)',
      '[site](/docs/records/debt-002-y.md#why)',
      `[pinned](${pinned})`,
    ].join('\n\n');
    expect(
      recordLinks('docs/dev/guide.md', contents).map((link) => link.url),
    ).toEqual([
      'https://github.com/o/r/blob/dev/docs/records/bug-001-x.md',
      '/docs/records/debt-002-y.md#why',
    ]);
  });

  it.each([
    'docs/debt/notes.md',
    'docs/bugs/register-history-2026-11.md',
    'docs/qa/README.md',
    'docs/brainstorming/notes.md',
    'docs/audits/notes.md',
  ])('reports %s, any Markdown left in a retired register folder', (file) => {
    expect(audit({ [file]: '# Left behind' }).retiredRegisterFiles).toEqual([
      file,
    ]);
  });

  // DEBT-518 deleted the archive and the asset folders only it linked; the
  // ledger and pinned commits keep that history retrievable.
  it.each([
    'docs/_archive/debt/debt-001-example.md',
    'docs/_archive/notes.md',
    'docs/debt/assets/debt-477/review.md',
    'docs/bugs/assets/bug-308/receipt.md',
    'docs/audits/assets/external-audit-2026-10-06/notes.md',
  ])('reports %s, recreated where the archive purge deleted', (file) => {
    expect(audit({ [file]: '# Back again' }).retiredRegisterFiles).toEqual([
      file,
    ]);
  });

  it("reports Markdown in a records subfolder, other than DEBT-414's assets", () => {
    expect(
      audit({
        'docs/records/old/bug-950-x.md': '**Status:** Resolved',
        'docs/records/assets/bug-337/receipt.md': '# New asset folder',
        'docs/records/assets/inventory-2026-09-21/verification.md':
          '# Deleted with the archive',
        'docs/records/assets/debt-414/note.md': '# Legacy asset',
      }).strayRegisterFiles,
    ).toEqual([
      'docs/records/assets/bug-337/receipt.md',
      'docs/records/assets/inventory-2026-09-21/verification.md',
      'docs/records/old/bug-950-x.md',
    ]);
  });

  it('reports links, branch URLs and code-span paths into the deleted archive', () => {
    const contents = [
      '[DEBT-001](../_archive/debt/debt-001-example.md)',
      '![Screenshot](../debt/assets/debt-477/review.png)',
      '[Branch](https://github.com/o/r/blob/dev/docs/_archive/debt/debt-001-example.md#why)',
      'Read `docs/bugs/assets/bug-308/receipt.md`.',
    ].join('\n\n');
    expect(
      archiveDestinations('docs/guides/example.md', contents).map(
        ({ line, reference }) => `${line}:${reference}`,
      ),
    ).toEqual([
      '1:../_archive/debt/debt-001-example.md',
      '3:../debt/assets/debt-477/review.png',
      '5:https://github.com/o/r/blob/dev/docs/_archive/debt/debt-001-example.md#why',
      '7:docs/bugs/assets/bug-308/receipt.md',
    ]);
  });

  it('permits commit-pinned history, folder names and prose', () => {
    const contents = [
      `[Pinned](https://github.com/o/r/blob/${'a'.repeat(40)}/docs/_archive/debt/debt-001-example.md)`,
      `Offline: \`git show ${'b'.repeat(12)}:docs/_archive/debt/debt-001-example.md\`.`,
      'The purge deleted `docs/_archive/` and `docs/debt/assets/**`.',
      'A quoted learning named docs/_archive/debt/debt-476-x.md in prose.',
    ].join('\n\n');
    expect(archiveDestinations('docs/guides/example.md', contents)).toEqual([]);
  });

  it('permits the ledger its retrieval paths', () => {
    expect(
      archiveDestinations(
        RECORDS.ledger,
        'Registers: `docs/_archive/bugs/register-frozen-2026-10-05.md`.\n\n- BUG-001 · X · Resolved · 2026-10-01 · docs/_archive/bugs/bug-001-x.md',
      ),
    ).toEqual([]);
  });

  it('reports a ledger list item that is not a well-formed entry', () => {
    expect(
      audit({
        'docs/records/closed.md': [
          '# Closed Records',
          '',
          '- BUG-100 · Fine · Resolved · 2026-10-01 · docs/a.md',
          '* BUG-101 · Star bullet · Resolved · 2026-10-01 · docs/b.md',
          '- **BUG-102** · Bold ID · Resolved · 2026-10-01 · docs/c.md',
          '  - BUG-103 · Indented · Resolved · 2026-10-01 · docs/d.md',
          '- BUG-104 · Too few fields · Resolved',
        ].join('\n'),
      }).malformedLedgerLines,
    ).toEqual([
      'docs/records/closed.md:4',
      'docs/records/closed.md:5',
      'docs/records/closed.md:6',
      'docs/records/closed.md:7',
    ]);
  });

  it('compares IDs by number, so zero-padding cannot hide a duplicate', () => {
    expect(
      audit({
        'docs/records/bug-05-open.md': '**Status:** Open',
        'docs/records/bug-07-a.md': '**Status:** Open',
        'docs/records/bug-007-b.md': '**Status:** Open',
        'docs/records/closed.md':
          '- BUG-005 · Closed · Resolved · 2026-10-01 · docs/a.md',
      }).duplicates.sort(),
    ).toEqual(['docs/records/bug-007-b.md', 'docs/records/bug-05-open.md']);
  });

  it.each(["Won't fix", 'Invalidated', 'Superseded', 'Deferred'])(
    'reports an open record whose status is the closed disposition %s',
    (status) => {
      expect(
        audit({ 'docs/records/bug-001-x.md': `**Status:** ${status}` })
          .closedLive,
      ).toEqual(['docs/records/bug-001-x.md']);
    },
  );

  it('allows each historical collision twice, and no more', () => {
    const line = (title: string) =>
      `- SPEC-028 · ${title} · Implemented · 2026-03-01 · docs/x.md`;
    expect(
      audit({
        'docs/records/closed.md': [
          line('One'),
          line('Two'),
          line('Three'),
        ].join('\n'),
      }).duplicateLedgerIds,
    ).toEqual(['SPEC-028']);
  });
});

describe('records command', () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function fixture(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'documentation-records-'));
    roots.push(root);
    return root;
  }

  function populate(root: string, files: Record<string, string>): void {
    files[RECORDS.index] ??= '# Records\n\n**Now** — fixture';
    files[RECORDS.ledger] ??= '# Closed records';
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
  }

  it('checks links in colocated documentation and nested agent instructions', () => {
    const root = fixture();
    const colocated = [
      'app/fonts/README.md',
      'content/questions/README.md',
      'content/drafts/questions/AGENTS.md',
      'tests/shared/README.md',
      'src/domain/README.md',
      '.agents/skills/README.md',
    ];
    populate(
      root,
      Object.fromEntries(
        colocated.map((file) => [file, '[Missing](missing.md)']),
      ),
    );
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (json) => reports.push(JSON.parse(json))),
    ).toBe(1);
    expect(reports[0]?.brokenLive.map((link) => link.file).sort()).toEqual(
      colocated.sort(),
    );
  });

  function auditIgnoredFixture(): string[] {
    // A git hook exports GIT_DIR and friends, which would point these git
    // commands at the repository running the hook instead of the fixture.
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('GIT_')) vi.stubEnv(name, undefined);
    }
    // Only this repository's .gitignore counts, not the machine's git config.
    vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
    const root = fixture();
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    populate(root, {
      '.gitignore': 'content/drafts/*\n',
      'content/drafts/backup/old.md': '[Missing](missing.md)',
      'docs/guides/new-guide.md': '[Missing](missing.md)',
    });
    const reports: DocumentationAudit[] = [];
    runDocumentationCommand(root, (json) => reports.push(JSON.parse(json)));
    return reports[0]?.brokenLive.map((link) => link.file) ?? [];
  }

  it('skips git-ignored local files, but not a new untracked document', () => {
    expect(auditIgnoredFixture()).toEqual(['docs/guides/new-guide.md']);
  });

  // A pre-push hook run from a linked worktree exports GIT_DIR, naming the
  // shared repository's worktree directory. A `git init` that inherits it
  // marks that repository bare, and every later command in the clone fails.
  it("leaves the repository a hook's GIT_DIR names untouched", () => {
    const outer = fixture();
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of Object.keys(env)) {
      if (name.startsWith('GIT_')) delete env[name];
    }
    Object.assign(env, {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    });
    const git = (cwd: string, args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.com',
          ...args,
        ],
        { cwd, env, encoding: 'utf8' },
      );
    git(outer, ['init', '--quiet']);
    git(outer, ['commit', '--allow-empty', '--quiet', '-m', 'base']);
    const worktree = path.join(fixture(), 'linked');
    git(outer, ['worktree', 'add', '--quiet', worktree]);
    vi.stubEnv('GIT_DIR', path.join(outer, '.git', 'worktrees', 'linked'));

    const brokenLive = auditIgnoredFixture();

    expect(git(outer, ['config', '--get', 'core.bare']).trim()).toBe('false');
    expect(brokenLive).toEqual(['docs/guides/new-guide.md']);
  });

  // Outside a work tree, git exits before reading a long file list, and
  // writing the rest of the list then fails with EPIPE.
  it('audits a large tree outside a Git work tree', () => {
    const root = fixture();
    const files: Record<string, string> = {};
    for (let i = 0; i < 2_000; i += 1)
      files[`docs/many/${'x'.repeat(40)}-${i}.md`] = '# Page';
    populate(root, files);
    expect(readDocumentationFiles(root).size).toBeGreaterThan(2_000);
  });

  // `git check-ignore` exits 1 when nothing is ignored, and 128 outside a
  // Git work tree; any other failure must not pass as "nothing ignored".
  it('fails when git fails for any reason but "not a git repository"', () => {
    const root = fixture();
    populate(root, { 'docs/guide.md': '# Guide' });
    const bin = fixture();
    writeFileSync(
      path.join(bin, 'git'),
      '#!/bin/sh\necho "fatal: index file corrupt" >&2\nexit 128\n',
      { mode: 0o755 },
    );
    vi.stubEnv('PATH', bin);
    expect(() => readDocumentationFiles(root)).toThrow(
      /git (?:rev-parse|check-ignore) failed/,
    );
    vi.stubEnv('PATH', fixture());
    expect(() => readDocumentationFiles(root)).toThrow();
  });

  it('exits nonzero when a status typo hides a due check', () => {
    const root = fixture();
    populate(root, {
      [RECORDS.index]:
        '# Records\n\n**Now** — BUG-001\n\n| ID | Title |\n|---|---|\n| [BUG-001](./bug-001-x.md) | Example |',
      'docs/records/bug-001-x.md':
        '**Status:** Verifyng — production check; due 2026-10-20',
    });
    expect(runDocumentationCommand(root, () => {})).toBe(1);
  });

  it('exits nonzero for an ID listed twice in the ledger, and for a file left in a replaced register folder', () => {
    const root = fixture();
    populate(root, {
      [RECORDS.ledger]:
        '## Bugs\n\n- BUG-001 · One · Resolved · 2026-10-01 · #1 · a.md\n- BUG-001 · Two · Resolved · 2026-10-02 · #2 · b.md',
      'docs/bugs/index.md': '# Old index',
    });
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (json) => reports.push(JSON.parse(json))),
    ).toBe(1);
    expect(reports[0]).toMatchObject({
      duplicateLedgerIds: ['BUG-001'],
      retiredRegisterFiles: ['docs/bugs/index.md'],
    });
  });
});

describe('repository records', () => {
  const files = readDocumentationFiles(process.cwd());
  const exists = (file: string) => existsSync(path.resolve(file));
  let result: DocumentationAudit;

  beforeAll(() => {
    result = auditRecordLifecycle(files, exists);
  }, 30_000);

  it('includes every tracked repository-authored Markdown file in the link audit', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '*.md'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
      .filter(
        (file) =>
          !file.startsWith('.agents/skills/') ||
          file === '.agents/skills/README.md',
      );
    expect(tracked.filter((file) => !files.has(file))).toEqual([]);
  });

  it('keeps no Markdown in a register folder docs/records replaced, or in a folder the layout retired', () => {
    expect(result.retiredRegisterFiles).toEqual([]);
  });

  it('lists each closed ID once in the ledger', () => {
    expect(result.duplicateLedgerIds).toEqual([]);
  });

  it('points nowhere into the deleted archive except through a pinned commit', () => {
    expect(
      [...files].flatMap(([file, contents]) =>
        archiveDestinations(file, contents),
      ),
    ).toEqual([]);
  });

  it.each([...files.keys()])(
    'cites records by ID rather than linking them in %s',
    (file) => {
      expect(recordLinks(file, files.get(file) ?? '')).toEqual([]);
    },
  );
});
