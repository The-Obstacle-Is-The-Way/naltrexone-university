import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  archiveLinkRepairs,
  auditDocumentation,
  auditRecordLifecycle,
  brokenDocumentationLinks,
  type DocumentationAudit,
  REGISTERS,
  readDocumentation,
  readDocumentationFiles,
  repairArchiveLinks,
  runDocumentationCommand,
} from '../scripts/documentation-archive';

function audit(files: Record<string, string>) {
  return auditDocumentation(new Map(Object.entries(files)), (file) =>
    Object.hasOwn(files, file),
  );
}

function runArchiveCommand(root: string, args: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      path.resolve('scripts/documentation-archive.ts'),
      ...args,
    ],
    { cwd: root, encoding: 'utf8', timeout: 14_000 },
  );
}

describe('documentation archive convention', () => {
  it('reports a live/archive duplicate even when the live file is a pointer', () => {
    expect(
      audit({
        'docs/debt/debt-001-example.md': '# Archived pointer',
        'docs/_archive/debt/debt-001-example.md': '# Canonical record',
      }).duplicates,
    ).toEqual(['docs/debt/debt-001-example.md']);
  });

  it('detects the same numbered record after its title changes', () => {
    expect(
      audit({
        'docs/debt/debt-001-old-title.md': '# Active copy',
        'docs/_archive/debt/debt-001-new-title.md': '# Archived copy',
        'docs/debt/fe-001-unrelated.md': '# Different record',
      }).duplicates,
    ).toEqual(['docs/debt/debt-001-old-title.md']);
  });

  it('does not accept an extra parent segment just because a file exists outside the repository', () => {
    expect(
      audit({
        'docs/guide.md': '[Outside](../../outside.md)',
        '../outside.md': '# Not published with this repository',
      }).brokenLive.map((link) => link.target),
    ).toEqual(['../outside.md']);
  });

  it.each(['Resolved', 'Archived', 'Implemented', 'Closed', 'Complete (MVP)'])(
    'rejects a live record with %s status',
    (status) => {
      expect(
        audit({
          'docs/specs/spec-001-example.md': `# Example\n\n> **Status:** ${status}`,
        }).closedLive,
      ).toEqual(['docs/specs/spec-001-example.md']);
    },
  );

  it('does not confuse active status with a historical resolution in its explanation', () => {
    expect(
      audit({
        'docs/debt/debt-001-example.md':
          '# Example\n\n**Status:** Active — earlier work resolved; tail open.',
      }).closedLive,
    ).toEqual([]);
  });

  it('keeps a proposed record open when its explanation says it is not implemented', () => {
    expect(
      audit({
        'docs/specs/spec-001-example.md':
          '# Example\n\n**Status:** Proposed — not implemented',
      }).closedLive,
    ).toEqual([]);
  });

  it.each([
    '**Status:** ✅ RESOLVED 2026-06-11 — shipped',
    '> **Status:** ✅ **Resolved**',
    '**Resolution State:** Fixed in PR #289',
    '**Status:** Completed',
    '**Status:** Fully Addressed',
  ])('rejects a live record with the existing metadata form %s', (metadata) => {
    expect(
      audit({ 'docs/debt/debt-001-example.md': metadata }).closedLive,
    ).toEqual(['docs/debt/debt-001-example.md']);
  });

  it.each(['Active', 'Open', 'Ready', 'In Progress', 'Unclassified', ''])(
    'reports an archived record without a recognized disposition: %s',
    (status) => {
      expect(
        audit({
          'docs/_archive/debt/debt-001-example.md': status
            ? `**Status:** ${status}`
            : '# No metadata',
        }),
      ).toMatchObject({
        missingArchiveDispositions: ['docs/_archive/debt/debt-001-example.md'],
      });
    },
  );

  it.each([
    'Resolved',
    '✅ RESOLVED',
    'Archived',
    'Implemented',
    'Closed',
    'Complete (MVP)',
    'Completed',
    'Fixed',
    'Fully Addressed',
    'Deferred',
    'Invalidated (false positive)',
    'Superseded',
    'Decided',
    'Decomposed',
    'Accepted risk',
    'Parked',
    'Won’t Fix',
    'Reclassified',
  ])('accepts the preserved archived disposition %s', (status) => {
    expect(
      audit({
        'docs/_archive/debt/debt-001-example.md': `**Status:** ${status}`,
      }),
    ).toMatchObject({ missingArchiveDispositions: [] });
  });

  it('accepts an archived Resolution State without rewriting historical metadata', () => {
    expect(
      audit({
        'docs/_archive/debt/debt-001-example.md':
          '**Resolution State:** Fixed in PR #289',
      }),
    ).toMatchObject({ missingArchiveDispositions: [] });
  });

  it('uses the current status rather than a later historical field', () => {
    expect(
      audit({
        'docs/_archive/debt/debt-001-example.md':
          '**Status:** Open — earlier slice resolved\n\n**Resolution State:** Fixed previously',
      }),
    ).toMatchObject({
      missingArchiveDispositions: ['docs/_archive/debt/debt-001-example.md'],
    });
  });

  it.each([
    'docs/debt/debt-001-example.md',
    'docs/_archive/debt/debt-001-example.md',
  ])(
    'fails closed when the first status field in %s is a fenced example',
    (file) => {
      expect(() =>
        audit({
          [file]: '```md\n**Status:** Resolved\n```\n\n**Status:** Open',
        }),
      ).toThrow(
        `Status metadata inside a code example: ${file}; put the record disposition before examples`,
      );
    },
  );

  it('accepts historical metadata after an unrelated code block', () => {
    expect(
      audit({
        'docs/_archive/debt/debt-001-example.md':
          '```ts\nconst example = true;\n```\n\n**Status:** Resolved',
      }),
    ).toMatchObject({ missingArchiveDispositions: [] });
  });

  it.each(['debt', 'bugs', 'specs', 'brainstorming', 'audits', 'qa'])(
    'rejects duplicate Latest stanzas in %s',
    (register) => {
      expect(
        audit({
          [`docs/${register}/index.md`]: '**Latest** — new\n\n**Latest** — old',
        }),
      ).toMatchObject({
        invalidLatest: expect.arrayContaining([`docs/${register}/index.md`]),
      });
    },
  );

  it.each(['debt', 'bugs'])(
    'requires the existing Latest stanza in %s',
    (register) => {
      expect(
        audit({
          [`docs/${register}/index.md`]: '# Register\n\n**Earlier** — old',
        }),
      ).toMatchObject({
        invalidLatest: expect.arrayContaining([`docs/${register}/index.md`]),
      });
    },
  );

  it('ignores examples and historical labels without requiring new Latest conventions', () => {
    expect(
      audit({
        'docs/debt/index.md':
          '**Latest** — current\n\n**Earlier** — previous\n\n```md\n**Latest** — example\n```\n\n`**Latest**`\n\n**Latest archival (2026-06-11):** historic',
        'docs/bugs/index.md': '**Latest** — current',
        'docs/specs/index.md': '# Register without update stanzas',
      }),
    ).toMatchObject({ invalidLatest: [] });
  });

  it('reports a missing register-row destination', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-missing.md) | Missing |',
      }).missingRowTargets,
    ).toEqual(['docs/bugs/index.md:3 -> docs/bugs/bug-001-missing.md']);
  });

  it('requires a live record to have a table row, not just a narrative mention', () => {
    expect(
      audit({
        'docs/qa/qa-001-example.md': '# Example\n\n**Status:** Draft',
        'docs/qa/index.md': '[QA-001](./qa-001-example.md) was filed.',
      }).missingLiveRows,
    ).toEqual(['docs/qa/qa-001-example.md']);
  });

  it("does not count another record's related-link cell as the live record's own row", () => {
    expect(
      audit({
        'docs/brainstorming/bs-044-open.md': '# Open\n\n**Status:** Active',
        'docs/_archive/brainstorming/bs-042-closed.md': '# Closed',
        'docs/brainstorming/index.md':
          '## Archived\n\n| ID | Notes |\n| --- | --- |\n| [BS-042](../_archive/brainstorming/bs-042-closed.md) | Residual [BS-044](./bs-044-open.md) |',
      }).missingLiveRows,
    ).toEqual(['docs/brainstorming/bs-044-open.md']);
  });

  it('accepts a record row with a plain ID and its file linked in the title column', () => {
    expect(
      audit({
        'docs/audits/audit-001-open.md': '# Open\n\n**Status:** Active',
        'docs/audits/index.md':
          '| ID | Title |\n| --- | --- |\n| AUDIT-001 | [Audit](./audit-001-open.md) |',
      }).missingLiveRows,
    ).toEqual([]);
  });

  it('accepts a real row with a working archived destination', () => {
    expect(
      audit({
        'docs/debt/index.md':
          '| ID | Title |\n| --- | --- |\n| [DEBT-001](../_archive/debt/debt-001-example.md) | Done |',
        'docs/_archive/debt/debt-001-example.md': '# Example',
      }).missingRowTargets,
    ).toEqual([]);
  });

  it('finds inline, image and reference-style file links but not code or site routes', () => {
    const result = audit({
      'docs/guide.md': [
        '[Missing](./missing.md#heading)',
        '![Image](./missing.png)',
        '[Reference][target]',
        '',
        '[target]: <./missing reference.md>',
        '',
        '`[Code](./not-a-link.md)`',
        '```md',
        '[Example](./also-not-a-link.md)',
        '```',
        '[Privacy](/privacy)',
        '[External](https://example.com)',
        '[Anchor](#heading)',
      ].join('\n'),
    });
    expect(result.brokenLive.map((link) => link.url)).toEqual([
      './missing.md#heading',
      './missing.png',
      './missing reference.md',
    ]);
  });

  it.each(['<a href="./missing.md">Missing</a>', '<img src="./missing.png">'])(
    'rejects unsupported raw HTML link attributes: %s',
    (html) => {
      expect(() => audit({ 'docs/guide.md': html })).toThrow(
        'Unsupported HTML link attributes: docs/guide.md:1; use Markdown links or images',
      );
    },
  );

  it('keeps historical unresolvable archive links separate from live failures', () => {
    const result = audit({
      'docs/_archive/bugs/bug-001-example.md': '[Removed](../../../removed.ts)',
    });
    expect(result.brokenLive).toEqual([]);
    expect(result.brokenArchive).toHaveLength(1);
  });

  it.each(['docs/guide.md', 'docs/_archive/bugs/bug-001-example.md'])(
    'reports malformed percent encoding in %s even when a raw-path file exists',
    (file) => {
      const result = audit({
        [file]: '[Malformed](./assets/100%.png)',
        [path.posix.join(path.posix.dirname(file), 'assets/100%.png')]: 'asset',
      });
      expect([...result.brokenLive, ...result.brokenArchive]).toEqual([
        expect.objectContaining({
          file,
          url: './assets/100%.png',
          invalidEncoding: true,
        }),
      ]);
      expect(result.repairableArchive).toEqual([]);
    },
  );

  it('reports malformed encoding in a register row instead of crashing', () => {
    expect(
      audit({
        'docs/bugs/index.md':
          '| ID | Title |\n| --- | --- |\n| [BUG-001](./bug-001-100%.md) | Malformed |',
        'docs/bugs/bug-001-100%.md': '# Open record',
      }).missingRowTargets,
    ).toEqual(['docs/bugs/index.md:3 -> docs/bugs/bug-001-100%.md']);
  });

  it('does not offer archive repair for a broken link in a live record', () => {
    const files = {
      'docs/bugs/bug-001-example.md': '[Moved](../specs/spec-001-example.md)',
      'docs/_archive/specs/spec-001-example.md': '# Archived target',
    };
    const result = audit(files);
    expect(result.brokenLive).toHaveLength(1);
    expect(
      archiveLinkRepairs(result.brokenLive, (file) =>
        Object.hasOwn(files, file),
      ),
    ).toEqual([]);
  });
});

describe('documentation archive command', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  function fixture(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'documentation-archive-'));
    roots.push(root);
    return root;
  }

  function populate(root: string, files: Record<string, string>): void {
    for (const register of Object.keys(REGISTERS)) {
      files[`docs/${register}/index.md`] ??= ['debt', 'bugs'].includes(register)
        ? '# Register\n\n**Latest** — fixture'
        : '# Register';
    }
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), contents);
    }
  }

  it.each([
    [
      'closed live',
      'docs/debt/debt-001-example.md',
      '**Status:** ✅ RESOLVED',
      '**Status:** Open',
    ],
    [
      'missing archived disposition',
      'docs/_archive/debt/debt-001-example.md',
      '# No disposition',
      '**Status:** Resolved',
    ],
    [
      'open archived',
      'docs/_archive/debt/debt-001-example.md',
      '**Status:** Open',
      '**Status:** Deferred',
    ],
    [
      'duplicate Latest',
      'docs/debt/index.md',
      '**Latest** — A\n\n**Latest** — B',
      '**Latest** — A\n\n**Earlier** — B',
    ],
    [
      'missing Latest',
      'docs/debt/index.md',
      '# Register',
      '**Latest** — current',
    ],
  ])(
    'fails the command solely for %s and passes after correction',
    (_kind, file, before, after) => {
      const root = fixture();
      const files: Record<string, string> = { [file]: before };
      if (!file.endsWith('/index.md')) {
        files['docs/debt/index.md'] =
          `**Latest** — fixture\n\n| ID | Title |\n| --- | --- |\n| [DEBT-001](${path.posix.relative('docs/debt', file)}) | Example |`;
      }
      populate(root, files);
      const reports: DocumentationAudit[] = [];
      expect(
        runDocumentationCommand(root, (json) => reports.push(JSON.parse(json))),
      ).toBe(1);
      expect(reports[0]).toMatchObject({
        duplicates: [],
        missingLiveRows: [],
        missingRowTargets: [],
        brokenLive: [],
        brokenArchive: [],
        repairableArchive: [],
      });
      writeFileSync(path.join(root, file), after);
      expect(runDocumentationCommand(root, () => {})).toBe(0);
    },
  );

  it('exits nonzero with a diagnostic for ambiguous fenced status metadata', () => {
    const root = fixture();
    populate(root, {
      'docs/_archive/debt/debt-001-example.md':
        '```md\n**Status:** Resolved\n```\n\n**Status:** Open',
    });
    const child = runArchiveCommand(root);
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain(
      'Status metadata inside a code example: docs/_archive/debt/debt-001-example.md',
    );
  });

  it('reports JSON and does not repair without the explicit command argument', () => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    const original = '**Status:** Resolved\n\n[Source](../../src/example.ts)';
    populate(root, { [file]: original, 'src/example.ts': 'export {};' });
    const output: string[] = [];
    expect(runDocumentationCommand(root, (json) => output.push(json), [])).toBe(
      1,
    );
    expect(typeof output[0]).toBe('string');
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
  });

  it.each(['docs/guide.md', 'docs/_archive/bugs/bug-001-example.md'])(
    'reports malformed encoding in %s as a failing CLI result without a crash or rewrite',
    (file) => {
      const root = fixture();
      const original = '**Status:** Resolved\n\n[Malformed](./assets/100%.png)';
      populate(root, { [file]: original });
      const child = runArchiveCommand(root, ['--repair-archive']);
      expect(child.error).toBeUndefined();
      expect(child.stderr).toBe('');
      expect(child.status).toBe(1);
      const result = JSON.parse(child.stdout);
      expect([...result.brokenLive, ...result.brokenArchive]).toEqual([
        expect.objectContaining({
          url: './assets/100%.png',
          invalidEncoding: true,
        }),
      ]);
      expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
    },
  );

  it('refuses the entire batch if a previously classified target disappears', () => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    const original = '**Status:** Resolved\n\n[Source](../../src/example.ts)';
    populate(root, { [file]: original, 'src/example.ts': 'export {};' });
    const repairs = readDocumentation(root).repairableArchive;
    rmSync(path.join(root, 'src/example.ts'));
    expect(() => repairArchiveLinks(root, repairs)).toThrow(
      'Repair target disappeared',
    );
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
  });

  it.each([
    ['depth', '../../src/example.ts', 'src/example.ts'],
    [
      'later archive',
      '../../debt/debt-001-example.md',
      'docs/_archive/debt/debt-001-example.md',
    ],
  ])('exits nonzero for a provable %s archive break', (_kind, url, target) => {
    const root = fixture();
    populate(root, {
      'docs/_archive/bugs/bug-001-example.md': `**Status:** Resolved\n\n[Target](${url})`,
      [target]: '# Existing target\n\n**Status:** Resolved',
    });
    expect(runDocumentationCommand(root, () => {})).toBe(1);
    expect(runArchiveCommand(root).status).toBe(1);
  });

  it.each(['function', 'CLI'])(
    'repairs only destinations and preserves historical text through the %s',
    (entrypoint) => {
      const root = fixture();
      const file = 'docs/_archive/bugs/bug-001-example.md';
      const original = [
        '# Historical record',
        '**Status:** Resolved',
        '[Source](../../src/example.ts#L7)',
        '[Later](../../debt/debt-001-example.md?view=raw#receipt)',
        '![Asset](../../docs/assets/example.png)',
        '[Already correct](../../../src/existing.ts)',
        '[Reference][source]',
        '',
        '[source]: <../../src/example.ts> "Original title"',
        '`[Example](../../not-a-link.md)`',
      ].join('\n');
      populate(root, {
        [file]: original,
        'src/example.ts': 'export {};',
        'src/existing.ts': 'export {};',
        'docs/assets/example.png': 'fixture',
        'docs/_archive/debt/debt-001-example.md':
          '# Existing record\n\n**Status:** Resolved',
      });
      if (entrypoint === 'function') {
        expect(
          runDocumentationCommand(root, () => {}, ['--repair-archive']),
        ).toBe(0);
      } else {
        const child = runArchiveCommand(root, ['--repair-archive']);
        expect(child.error).toBeUndefined();
        expect(child.status).toBe(0);
      }
      expect(readFileSync(path.join(root, file), 'utf8')).toBe(
        original
          .replaceAll('../../src/example.ts', '../../../src/example.ts')
          .replace(
            '../../debt/debt-001-example.md',
            '../debt/debt-001-example.md',
          )
          .replace('../../docs/assets/example.png', '../../assets/example.png'),
      );
      expect(readDocumentation(root).brokenArchive).toEqual([]);
    },
  );

  it('leaves a historical missing target unchanged and reported', () => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    const original = '**Status:** Resolved\n\n[Deleted](../../src/deleted.ts)';
    populate(root, { [file]: original });
    const child = runArchiveCommand(root, ['--repair-archive']);
    expect(child.status).toBe(0);
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
    expect(JSON.parse(child.stdout).brokenArchive).toHaveLength(1);
  });

  it.each([
    ['file%23name.ts', 'file#name.ts'],
    ['file%3Fname.ts', 'file?name.ts'],
  ])('preserves encoded filename delimiters in %s', (encoded, filename) => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    populate(root, {
      [file]: `**Status:** Resolved\n\n[Source](../../src/${encoded}?view=raw#L7)`,
      [`src/${filename}`]: 'export {};',
    });
    expect(runDocumentationCommand(root, () => {}, ['--repair-archive'])).toBe(
      0,
    );
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(
      `**Status:** Resolved\n\n[Source](../../../src/${encoded}?view=raw#L7)`,
    );
    expect(readDocumentation(root).brokenArchive).toEqual([]);
  });

  it('writes nothing when a proven repair has an unsupported source spelling', () => {
    const root = fixture();
    const first = 'docs/_archive/bugs/bug-001-example.md';
    const unsupported = 'docs/_archive/bugs/bug-002-example.md';
    const original = '**Status:** Resolved\n\n[Source](../../src/example.ts)';
    populate(root, {
      [first]: original,
      [unsupported]:
        '**Status:** Resolved\n\n[Escaped](../../src/part\\(one\\).ts)',
      'src/example.ts': 'export {};',
      'src/part(one).ts': 'export {};',
    });
    expect(() =>
      runDocumentationCommand(root, () => {}, ['--repair-archive']),
    ).toThrow('Cannot safely rewrite');
    const child = runArchiveCommand(root, ['--repair-archive']);
    expect(child.status).toBe(1);
    expect(child.stderr).toContain('Cannot safely rewrite');
    expect(readFileSync(path.join(root, first), 'utf8')).toBe(original);
  });

  it('does not guess between two existing historical destinations', () => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    const original =
      '**Status:** Resolved\n\n[Ambiguous](../../docs/specs/spec-001-example.md)';
    populate(root, {
      [file]: original,
      'docs/specs/spec-001-example.md': '# First candidate',
      'docs/_archive/specs/spec-001-example.md':
        '# Second candidate\n\n**Status:** Resolved',
    });
    runDocumentationCommand(root, () => {}, ['--repair-archive']);
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
    expect(readDocumentation(root).repairableArchive).toEqual([]);
  });

  it('refuses an apparent URL replacement that actually changes a link title', () => {
    const root = fixture();
    const file = 'docs/_archive/bugs/bug-001-example.md';
    const original =
      '**Status:** Resolved\n\n[Source](../../src/example.ts "../../src/example.ts")';
    populate(root, {
      [file]: original,
      'src/example.ts': 'export {};',
    });
    expect(() =>
      runDocumentationCommand(root, () => {}, ['--repair-archive']),
    ).toThrow('Markdown destinations changed unexpectedly');
    expect(readFileSync(path.join(root, file), 'utf8')).toBe(original);
  });

  it('fails closed if the documentation walk has no registers', () => {
    expect(() => readDocumentation(fixture())).toThrow(
      'Missing documentation register',
    );
  });

  it('exits nonzero for a broken live link', () => {
    const root = fixture();
    populate(root, {});
    writeFileSync(path.join(root, 'README.md'), '[Missing](./missing.md)');
    // Cover the same command body with real files and captured reporting.
    const reports: DocumentationAudit[] = [];
    expect(
      runDocumentationCommand(root, (report) =>
        reports.push(JSON.parse(report)),
      ),
    ).toBe(1);
    expect(reports[0]?.brokenLive).toHaveLength(1);
    writeFileSync(path.join(root, 'missing.md'), '# Repaired');
    expect(
      runDocumentationCommand(root, (report) =>
        reports.push(JSON.parse(report)),
      ),
    ).toBe(0);
    expect(reports[1]?.brokenLive).toEqual([]);
    writeFileSync(
      path.join(root, 'README.md'),
      '[Missing](./another-missing.md)',
    );
    const child = runArchiveCommand(root);
    expect(child.error).toBeUndefined();
    expect(JSON.parse(child.stdout).brokenLive).toHaveLength(1);
    expect(child.status).toBe(1);
  });
});

describe('repository documentation', () => {
  const files = readDocumentationFiles(process.cwd());
  const exists = (file: string) => existsSync(path.resolve(file));
  let result: DocumentationAudit;

  beforeAll(() => {
    // Lifecycle needs all record names/statuses, but only the six index ASTs.
    result = auditRecordLifecycle(files, exists);
  });

  it('has no record in both live and archived folders', () => {
    expect(result.duplicates).toEqual([]);
  });

  it('keeps terminal-status records out of live folders', () => {
    expect(result.closedLive).toEqual([]);
  });

  it('has working register rows for every live record', () => {
    expect(result.missingLiveRows).toEqual([]);
    expect(result.missingRowTargets).toEqual([]);
  });

  it('records a disposition in every archived numbered record', () => {
    expect(result).toMatchObject({ missingArchiveDispositions: [] });
  });

  it('preserves the single-Latest register convention', () => {
    expect(result).toMatchObject({ invalidLatest: [] });
  });

  it.each(
    [...files.keys()].filter((file) => !file.startsWith('docs/_archive/')),
  )('resolves relative file links in %s', (file) => {
    expect(
      brokenDocumentationLinks(file, files.get(file) ?? '', exists),
    ).toEqual([]);
  });

  it.each(
    [...files.keys()].filter((file) => file.startsWith('docs/_archive/')),
  )('has no mechanically repairable archive links in %s', (file) => {
    const broken = brokenDocumentationLinks(
      file,
      files.get(file) ?? '',
      exists,
    );
    expect(broken.filter((link) => link.invalidEncoding)).toEqual([]);
    expect(archiveLinkRepairs(broken, exists)).toEqual([]);
  });
});
