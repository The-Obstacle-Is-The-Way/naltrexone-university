import { describe, expect, it } from 'vitest';
import { computeChoiceSyncPlan, parseChoiceExplanations } from './seed-helpers';

function mapEntries(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
}

function getErrorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('Expected function to throw');
}

describe('computeChoiceSyncPlan', () => {
  it('throws if asked to delete a choice that is referenced by an attempt', () => {
    expect(() =>
      computeChoiceSyncPlan({
        existingChoices: [
          { id: 'c-a', label: 'A' },
          { id: 'c-b', label: 'B' },
          { id: 'c-c', label: 'C' },
        ],
        desiredChoices: [{ label: 'A' }, { label: 'B' }],
        referencedChoiceIds: new Set(['c-c']),
      }),
    ).toThrow(/referenced/i);
  });

  it('returns delete ids only for unreferenced removed labels', () => {
    const plan = computeChoiceSyncPlan({
      existingChoices: [
        { id: 'c-a', label: 'A' },
        { id: 'c-b', label: 'B' },
        { id: 'c-c', label: 'C' },
      ],
      desiredChoices: [{ label: 'A' }, { label: 'B' }],
      referencedChoiceIds: new Set(),
    });

    expect(plan.deleteChoiceIds).toEqual(['c-c']);
  });

  it('does not delete existing choices when the label set is unchanged', () => {
    const plan = computeChoiceSyncPlan({
      existingChoices: [
        { id: 'c-a', label: 'A' },
        { id: 'c-b', label: 'B' },
      ],
      desiredChoices: [{ label: 'A' }, { label: 'B' }],
      referencedChoiceIds: new Set(['c-a', 'c-b']),
    });

    expect(plan.deleteChoiceIds).toEqual([]);
  });
});

describe('parseChoiceExplanations', () => {
  it('returns the full explanation as general text when no wrong-answers section exists', () => {
    const explanationMd = [
      'This is the core explanation.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(explanationMd);
    expect(parsed.perChoice.size).toBe(0);
  });

  it('extracts per-choice explanations from the wrong-answers section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Distinguish intoxication from withdrawal.',
      '',
      '**Why other answers are wrong:**',
      '- A) Incorrect because reason A.',
      '- C) Incorrect because reason C.',
      '- D) Incorrect because reason D.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Distinguish intoxication from withdrawal.',
      ].join('\n'),
    );
    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Incorrect because reason A.',
      C: 'Incorrect because reason C.',
      D: 'Incorrect because reason D.',
    });
  });

  it('supports alternate bullet formats and multiline bullet bodies', () => {
    const explanationMd = [
      'General rationale.',
      '',
      '**Why other answers are wrong:**',
      '* A. First sentence.',
      '  Continuation sentence.',
      '- B)) Second explanation.',
      '+ C: Third explanation.',
      '- E) Fifth explanation.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe('General rationale.');
    expect(parsed.perChoice.get('A')).toContain('First sentence.');
    expect(parsed.perChoice.get('A')).toContain('Continuation sentence.');
    expect(mapEntries(parsed.perChoice)).toMatchObject({
      B: 'Second explanation.',
      C: 'Third explanation.',
      E: 'Fifth explanation.',
    });
  });

  it('extracts referenceMd from content with a reference section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBe(
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    );
  });

  it('throws when a non-reference heading appears inside the wrong-answer section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '### Clinical Pearl',
      'Ancillary note.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al. JAMA. 2006;295(17):2003-2017.",
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('unexpected heading');
    expect(message).toContain('### Clinical Pearl');
  });

  it('extracts multiline referenceMd when citation spans lines', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '### Reference',
      '',
      "Anton RF, O'Malley SS, Ciraulo DA, et al.",
      'Combined pharmacotherapies and behavioral interventions',
      'for alcohol dependence. JAMA. 2006;295(17):2003-2017.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBe(
      [
        "Anton RF, O'Malley SS, Ciraulo DA, et al.",
        'Combined pharmacotherapies and behavioral interventions',
        'for alcohol dependence. JAMA. 2006;295(17):2003-2017.',
      ].join('\n'),
    );
  });

  it('returns null referenceMd when no reference section exists', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.referenceMd).toBeNull();
  });

  it('preserves generalExplanation and perChoice when reference is present', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Clinical pearl:** Keep naloxone first-line.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
      '',
      '### Reference',
      '',
      'A concise AMA citation.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.generalExplanation).toBe(
      [
        'General rationale paragraph.',
        '',
        '**Clinical pearl:** Keep naloxone first-line.',
      ].join('\n'),
    );
    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Reason A.',
      C: 'Reason C.',
    });
    expect(parsed.referenceMd).toBe('A concise AMA citation.');
  });
});

describe('parseChoiceExplanations strict validation', () => {
  it('throws on stray text before the first bullet', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      'Clinical Pearl: misplaced content.',
      '- A) Reason A.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('before the first choice bullet');
    expect(message).toContain('Clinical Pearl: misplaced content.');
  });

  it('throws on invalid bullet labels outside A-E', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- F) Reason F.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('invalid choice label');
    expect(message).toContain('- F) Reason F.');
  });

  it('throws on duplicate choice labels', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) First reason.',
      '- A) Duplicate reason.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('duplicate choice label');
    expect(message).toContain('- A) Duplicate reason.');
  });

  it('throws on recognized bullets with blank bodies', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A)    ',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('blank explanation body');
    expect(message).toContain('- A)    ');
  });

  it('throws on combined-label bullets', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A, B, D) While descriptive, these are not the cited term.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('combined choice labels');
    expect(message).toContain('- A, B, D)');
  });

  it('throws when the heading has non-empty content but no valid bullets', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '',
      '### Reference',
      '',
      'A citation that appears before any valid bullets.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('contains content but no valid choice bullets');
    expect(message).toContain('### Reference');
  });

  it('throws on numbered lists inside the wrong-answer section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '1. A is wrong because...',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('numbered list');
    expect(message).toContain('1. A is wrong because...');
  });

  it('throws on parenthesized numbered lists inside the wrong-answer section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '1) A is wrong because...',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('numbered list');
    expect(message).toContain('1) A is wrong because...');
  });

  it('throws on heading-like lines inside the section unless they are ### Reference', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '## Clinical Pearl',
      'Ancillary note.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('unexpected heading');
    expect(message).toContain('## Clinical Pearl');
  });

  it('throws on malformed reference-style headings inside the section', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '',
      '### Reference:',
      'Ancillary note.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('unexpected heading');
    expect(message).toContain('### Reference:');
  });

  it('throws on non-bullet content after a parsed bullet', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      'Clinical Pearl: misplaced after bullets.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('after a choice bullet');
    expect(message).toContain('Clinical Pearl: misplaced after bullets.');
  });

  it('throws on indented parenthesized numbered continuations after a bullet', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '  1) Nested detail.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('numbered list');
    expect(message).toContain('1) Nested detail.');
  });

  it('throws on the real clinical-pearl-after-bullets corruption pattern', () => {
    const explanationMd = [
      'The TAPS contains more questions and takes longer to administer than either the S2BI or BSTAD, yet psychometric properties were similar across all tools.',
      '',
      '**Why other answers are wrong:**',
      '- A) The extra questions in TAPS did not improve performance; simplicity is preferred in busy clinical settings',
      '- B) While BSTAD had excellent sensitivity for some substances, no single tool was recommended over others based on psychometric properties alone',
      '- C) S2BI did not have superior specificity; the recommendation was based on efficiency and equivalent performance across shorter tools',
      '',
      '**Clinical Pearl:** The S2BI showed higher rates of substance use disclosure (27.1% vs ~19% for other tools), which may be clinically important since early identification enables early intervention.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('after a choice bullet');
    expect(message).toContain(
      '**Clinical Pearl:** The S2BI showed higher rates of substance use disclosure',
    );
  });

  it('throws on the real combined-label corruption pattern', () => {
    const explanationMd = [
      'Palis et al. (2022) reference the term "twin epidemics" to describe the rise in stimulant use among people who use opioids.',
      '',
      '**Why other answers are wrong:**',
      '- A, B, D) While descriptive, these are not the specific term cited in the literature',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('combined choice labels');
    expect(message).toContain('- A, B, D)');
  });

  it('preserves well-formed partial coverage', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '- C) Reason C.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Reason A.',
      C: 'Reason C.',
    });
  });

  it('accepts CRLF input', () => {
    const explanationMd =
      'General rationale.\r\n\r\n**Why other answers are wrong:**\r\n- A) Reason A.\r\n- C) Reason C.\r\n';

    const parsed = parseChoiceExplanations(explanationMd);

    expect(mapEntries(parsed.perChoice)).toEqual({
      A: 'Reason A.',
      C: 'Reason C.',
    });
  });

  it('accepts inline markdown inside bullet bodies', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) **Bold** and _italic_ emphasis are still inline markdown.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.perChoice.get('A')).toBe(
      '**Bold** and _italic_ emphasis are still inline markdown.',
    );
  });

  it('treats ### Reference as the only legal terminating heading', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '### Reference',
      'Citation line.',
    ].join('\n');

    const parsed = parseChoiceExplanations(explanationMd);

    expect(parsed.perChoice.get('A')).toBe('Reason A.');
    expect(parsed.referenceMd).toBe('Citation line.');
  });

  it('rejects indentation-sensitive nested markdown inside bullet bodies', () => {
    const explanationMd = [
      'General rationale paragraph.',
      '',
      '**Why other answers are wrong:**',
      '- A) Reason A.',
      '  - Nested bullet that cannot be preserved structurally.',
    ].join('\n');

    const message = getErrorMessage(() =>
      parseChoiceExplanations(explanationMd),
    );

    expect(message).toContain('nested markdown');
    expect(message).toContain(
      '- Nested bullet that cannot be preserved structurally.',
    );
  });
});
