// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let PracticeSessionStarter: typeof import('./practice-session-starter')['PracticeSessionStarter'];

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('PracticeSessionStarter', () => {
  beforeAll(async () => {
    ({ PracticeSessionStarter } = await import('./practice-session-starter'));
  });

  it('uses shadcn Card + Input primitives for starter UI', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="input"');
  });

  it('associates a visible label with the session count input', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('for="session-count-input"');
    expect(html).toContain('id="session-count-input"');
  });

  it('groups filter chip sets with accessible group roles', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[
          {
            id: 'tag-1',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'topic',
          },
        ]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const legends = Array.from(doc.querySelectorAll('legend')).map(
      (el) => el.textContent ?? '',
    );
    expect(legends).toContain('Mode');
    expect(legends).toContain('Status');
    expect(legends).toContain('Difficulty');
    expect(doc.querySelector('fieldset[aria-label="Topic"]')).not.toBeNull();
  });

  it('renders tag filters as collapsible categories with selected counts', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{
          tagSlugs: ['opioids'],
          difficulty: null,
          status: 'unanswered',
        }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[
          {
            id: 'tag-1',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
          {
            id: 'tag-2',
            slug: 'treatment',
            name: 'Treatment',
            kind: 'topic',
          },
        ]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const details = Array.from(doc.querySelectorAll('details'));
    expect(details.length).toBeGreaterThan(0);
    for (const element of details) {
      expect(element.hasAttribute('open')).toBe(false);
    }

    const summaries = Array.from(doc.querySelectorAll('summary')).map(
      (el) => el.textContent ?? '',
    );
    expect(
      summaries.some(
        (text) => text.includes('Substance') && text.includes('1 selected'),
      ),
    ).toBe(true);
    const substanceDetails = details.find((element) => {
      const summaryText = element.querySelector('summary')?.textContent ?? '';
      return (
        summaryText.includes('Substance') && summaryText.includes('1 selected')
      );
    });
    const substanceDetailsTokens = getClassTokens(
      substanceDetails?.getAttribute('class') ?? '',
    );
    const substanceSummary = substanceDetails?.querySelector('summary');
    const substanceSummaryTokens = getClassTokens(
      substanceSummary?.getAttribute('class') ?? '',
    );
    const summaryCount = Array.from(
      substanceDetails?.querySelectorAll('summary span') ?? [],
    ).find(
      (element) =>
        (element.textContent ?? '').trim() === '(1 selected)' &&
        getClassTokens(element.getAttribute('class') ?? '').has(
          'text-foreground/60',
        ),
    );
    const summaryCountTokens = getClassTokens(
      summaryCount?.getAttribute('class') ?? '',
    );
    const summaryChevron = substanceSummary?.querySelector('svg');
    const summaryChevronTokens = getClassTokens(
      summaryChevron?.getAttribute('class') ?? '',
    );
    const helperText = Array.from(
      substanceDetails?.querySelectorAll('div') ?? [],
    )
      .map((element) => element)
      .find(
        (element) =>
          (element.textContent ?? '').trim() ===
          'Leave empty to include all substances.',
      );
    const helperTextTokens = getClassTokens(
      helperText?.getAttribute('class') ?? '',
    );
    const expandedContentWrapperTokens = getClassTokens(
      helperText?.parentElement?.getAttribute('class') ?? '',
    );

    expect(substanceDetails).toBeDefined();
    expect(substanceDetailsTokens.has('group')).toBe(true);
    expect(substanceDetailsTokens.has('rounded-xl')).toBe(true);
    expect(substanceDetailsTokens.has('bg-foreground/5')).toBe(true);
    expect(substanceDetailsTokens.has('px-4')).toBe(false);
    expect(substanceDetailsTokens.has('py-3')).toBe(false);
    expect(substanceDetailsTokens.has('border')).toBe(false);
    expect(substanceDetailsTokens.has('border-border/60')).toBe(false);
    expect(substanceDetailsTokens.has('dark:border-foreground/40')).toBe(false);
    expect(substanceSummary).toBeTruthy();
    expect(substanceSummaryTokens.has('rounded-lg')).toBe(true);
    expect(substanceSummaryTokens.has('px-4')).toBe(true);
    expect(substanceSummaryTokens.has('py-3')).toBe(true);
    expect(substanceSummaryTokens.has('transition-colors')).toBe(true);
    expect(substanceSummaryTokens.has('hover:bg-foreground/[0.03]')).toBe(
      false,
    );
    expect(
      substanceSummaryTokens.has('[&::-webkit-details-marker]:hidden'),
    ).toBe(true);
    expect(summaryCountTokens.has('text-foreground/60')).toBe(true);
    expect(summaryCountTokens.has('text-muted-foreground')).toBe(false);
    expect(summaryChevron).toBeTruthy();
    expect(summaryChevronTokens.has('group-open:rotate-180')).toBe(true);
    expect(helperText).toBeDefined();
    expect(expandedContentWrapperTokens.has('px-4')).toBe(true);
    expect(expandedContentWrapperTokens.has('pb-3')).toBe(true);
    expect(expandedContentWrapperTokens.has('mt-3')).toBe(false);
    expect(helperTextTokens.has('text-foreground/60')).toBe(true);
    expect(helperTextTokens.has('text-muted-foreground')).toBe(false);
  });

  it('renders status and difficulty segmented controls without hint text', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{
          tagSlugs: [],
          difficulty: null,
          status: 'incorrect',
        }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).toContain('Status');
    expect(html).toContain('Unanswered');
    expect(html).toContain('Incorrect');
    expect(html).toContain('Bookmarked');
    expect(html).toContain('Difficulty');
    expect(html).toContain('All');
    expect(html).toContain('Easy');
    expect(html).toContain('Medium');
    expect(html).toContain('Hard');
    expect(html).not.toContain('Leave empty to include all questions');
    expect(html).not.toContain('Leave empty to include all difficulties');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const statusControl = Array.from(doc.querySelectorAll('fieldset')).find(
      (fieldset) => fieldset.querySelector('legend')?.textContent === 'Status',
    );
    expect(statusControl).toBeTruthy();
    const activeStatus = statusControl?.querySelector(
      'button[aria-pressed="true"]',
    );
    expect(activeStatus?.textContent).toBe('Incorrect');

    const difficultyControl = Array.from(doc.querySelectorAll('fieldset')).find(
      (fieldset) =>
        fieldset.querySelector('legend')?.textContent === 'Difficulty',
    );
    expect(difficultyControl).toBeTruthy();
    const activeDifficulty = difficultyControl?.querySelector(
      'button[aria-pressed="true"]',
    );
    expect(activeDifficulty?.textContent).toBe('All');
  });

  it('renders Topic, Substance, Treatment filter sections in order without Exam Section', () => {
    const html = renderToStaticMarkup(
      <PracticeSessionStarter
        sessionMode="tutor"
        sessionCount={20}
        filters={{ tagSlugs: [], difficulty: null, status: 'unanswered' }}
        availableCountStatus="idle"
        availableCount={null}
        tagLoadStatus="idle"
        availableTags={[
          {
            id: 'tag-topic',
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
          {
            id: 'tag-substance',
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
          {
            id: 'tag-treatment',
            slug: 'naltrexone',
            name: 'Naltrexone',
            kind: 'treatment',
          },
          {
            id: 'tag-diagnosis',
            slug: 'opioid-use-disorder',
            name: 'Opioid Use Disorder',
            kind: 'diagnosis',
          },
        ]}
        sessionStartStatus="idle"
        sessionStartError={null}
        onDifficultyChange={() => undefined}
        onStatusChange={() => undefined}
        onToggleTag={() => undefined}
        onSessionModeChange={() => undefined}
        onSessionCountChange={() => undefined}
        onStartSession={() => undefined}
      />,
    );

    expect(html).not.toContain('Exam Section');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const summaryLabels = Array.from(doc.querySelectorAll('summary')).map(
      (el) => el.textContent ?? '',
    );
    expect(summaryLabels.some((label) => label.includes('Diagnosis'))).toBe(
      false,
    );
    const topicIndex = summaryLabels.findIndex((label) =>
      label.includes('Topic'),
    );
    const substanceIndex = summaryLabels.findIndex((label) =>
      label.includes('Substance'),
    );
    const treatmentIndex = summaryLabels.findIndex((label) =>
      label.includes('Treatment'),
    );
    expect(topicIndex).toBeGreaterThanOrEqual(0);
    expect(substanceIndex).toBeGreaterThan(topicIndex);
    expect(treatmentIndex).toBeGreaterThan(substanceIndex);
  });
});
