// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let PracticeSessionStarter: typeof import('./practice-session-starter')['PracticeSessionStarter'];

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function findFieldsetByLegend(doc: Document, text: string) {
  return (
    Array.from(doc.querySelectorAll('fieldset')).find((element) => {
      const legend = element.querySelector('legend');
      return legend?.textContent === text;
    }) ?? null
  );
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

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('h2');
    const input = doc.querySelector('#session-count-input');
    const inputTokens = getClassTokens(input?.getAttribute('class') ?? '');

    expect(title?.textContent).toBe('Start a session');
    expect(title?.getAttribute('class')).toContain(
      'text-base font-semibold text-foreground',
    );
    expect(inputTokens.has('w-24')).toBe(true);
    expect(inputTokens.has('border-0')).toBe(true);
    expect(inputTokens.has('shadow-none')).toBe(true);
    expect(inputTokens.has('bg-foreground/5')).toBe(true);
    expect(inputTokens.has('dark:bg-foreground/5')).toBe(true);
    expect(inputTokens.has('[appearance:textfield]')).toBe(true);
    expect(
      inputTokens.has('[&::-webkit-outer-spin-button]:appearance-none'),
    ).toBe(true);
    expect(
      inputTokens.has('[&::-webkit-inner-spin-button]:appearance-none'),
    ).toBe(true);
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

  it('uses mixed-height alignment in the starter form row', () => {
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sessionCountInput = doc.querySelector('#session-count-input');
    const starterRow = sessionCountInput?.closest('div[class~="sm:flex-row"]');
    const starterRowTokens = getClassTokens(
      starterRow?.getAttribute('class') ?? '',
    );

    expect(sessionCountInput).not.toBeNull();
    expect(starterRow).not.toBeNull();
    expect(starterRowTokens.has('sm:items-start')).toBe(true);
    expect(starterRowTokens.has('sm:items-center')).toBe(false);
  });

  it('wraps Status and Difficulty controls with consistent label spacing', () => {
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const statusFieldset = findFieldsetByLegend(doc, 'Status');
    const difficultyFieldset = findFieldsetByLegend(doc, 'Difficulty');
    const statusWrapper = statusFieldset?.closest('div[class~="space-y-2"]');
    const difficultyWrapper = difficultyFieldset?.closest(
      'div[class~="space-y-2"]',
    );
    const statusWrapperTokens = getClassTokens(
      statusWrapper?.getAttribute('class') ?? '',
    );
    const difficultyWrapperTokens = getClassTokens(
      difficultyWrapper?.getAttribute('class') ?? '',
    );

    expect(statusFieldset).not.toBeNull();
    expect(difficultyFieldset).not.toBeNull();
    expect(statusWrapper).not.toBeNull();
    expect(difficultyWrapper).not.toBeNull();
    expect(statusWrapperTokens.has('space-y-2')).toBe(true);
    expect(statusWrapperTokens.has('mt-2')).toBe(false);
    expect(difficultyWrapperTokens.has('space-y-2')).toBe(true);
    expect(difficultyWrapperTokens.has('mt-2')).toBe(false);
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

  it('renders tag filters as collapsible categories with summary outcome copy and footer counts', () => {
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
        (text) =>
          text.includes('Topic') && text.includes('All included by default'),
      ),
    ).toBe(true);
    expect(
      summaries.some(
        (text) => text.includes('Topic') && text.includes('(0 selected)'),
      ),
    ).toBe(false);
    expect(
      summaries.some(
        (text) => text.includes('Substance') && text.includes('1 selected'),
      ),
    ).toBe(true);
    expect(
      summaries.some(
        (text) => text.includes('Substance') && text.includes('(1 selected)'),
      ),
    ).toBe(false);
    expect(
      doc.body.textContent?.includes('Leave empty to include all substances.'),
    ).toBe(false);
    const substanceDetails = details.find((element) => {
      const summaryText = element.querySelector('summary')?.textContent ?? '';
      return (
        summaryText.includes('Substance') && summaryText.includes('1 selected')
      );
    });
    const topicDetails = details.find((element) => {
      const summaryText = element.querySelector('summary')?.textContent ?? '';
      return (
        summaryText.includes('Topic') &&
        summaryText.includes('All included by default')
      );
    });
    const substanceDetailsTokens = getClassTokens(
      substanceDetails?.getAttribute('class') ?? '',
    );
    const topicDetailsTokens = getClassTokens(
      topicDetails?.getAttribute('class') ?? '',
    );
    const substanceSummary = substanceDetails?.querySelector('summary');
    const topicSummary = topicDetails?.querySelector('summary');
    const substanceSummaryTokens = getClassTokens(
      substanceSummary?.getAttribute('class') ?? '',
    );
    const topicSummaryTokens = getClassTokens(
      topicSummary?.getAttribute('class') ?? '',
    );
    const substanceSummaryCount = Array.from(
      substanceDetails?.querySelectorAll('summary span') ?? [],
    ).find(
      (element) =>
        (element.textContent ?? '').trim() === '1 selected' &&
        getClassTokens(element.getAttribute('class') ?? '').has(
          'text-foreground/60',
        ),
    );
    const substanceSummaryCountTokens = getClassTokens(
      substanceSummaryCount?.getAttribute('class') ?? '',
    );
    const topicSummaryOutcome = Array.from(
      topicDetails?.querySelectorAll('summary span') ?? [],
    ).find(
      (element) =>
        (element.textContent ?? '').trim() === 'All included by default' &&
        getClassTokens(element.getAttribute('class') ?? '').has(
          'text-foreground/60',
        ),
    );
    const topicSummaryOutcomeTokens = getClassTokens(
      topicSummaryOutcome?.getAttribute('class') ?? '',
    );
    const summaryChevron = substanceSummary?.querySelector('svg');
    const summaryChevronTokens = getClassTokens(
      summaryChevron?.getAttribute('class') ?? '',
    );
    const substanceFooterText = Array.from(
      substanceDetails?.querySelectorAll('div') ?? [],
    )
      .map((element) => element)
      .find((element) => (element.textContent ?? '').trim() === '(1 selected)');
    const topicFooterText = Array.from(
      topicDetails?.querySelectorAll('div') ?? [],
    )
      .map((element) => element)
      .find((element) => (element.textContent ?? '').trim() === '(0 selected)');
    const substanceFooterTextTokens = getClassTokens(
      substanceFooterText?.getAttribute('class') ?? '',
    );
    const topicFooterTextTokens = getClassTokens(
      topicFooterText?.getAttribute('class') ?? '',
    );
    const expandedContentWrapperTokens = getClassTokens(
      substanceFooterText?.parentElement?.getAttribute('class') ?? '',
    );

    expect(topicDetails).toBeDefined();
    expect(topicDetailsTokens.has('group')).toBe(true);
    expect(topicDetailsTokens.has('rounded-xl')).toBe(true);
    expect(topicDetailsTokens.has('bg-foreground/5')).toBe(true);
    expect(topicSummary).toBeTruthy();
    expect(topicSummaryTokens.has('rounded-lg')).toBe(true);
    expect(topicSummaryTokens.has('px-4')).toBe(true);
    expect(topicSummaryTokens.has('py-3')).toBe(true);
    expect(topicSummaryOutcome).toBeDefined();
    expect(topicSummaryOutcomeTokens.has('text-foreground/60')).toBe(true);
    expect(topicFooterText).toBeDefined();
    expect(topicFooterTextTokens.has('text-foreground/60')).toBe(true);
    expect(topicFooterTextTokens.has('text-muted-foreground')).toBe(false);
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
    expect(substanceSummaryCount).toBeDefined();
    expect(substanceSummaryCountTokens.has('text-foreground/60')).toBe(true);
    expect(substanceSummaryCountTokens.has('text-muted-foreground')).toBe(
      false,
    );
    expect(summaryChevron).toBeTruthy();
    expect(summaryChevronTokens.has('group-open:rotate-180')).toBe(true);
    expect(substanceFooterText).toBeDefined();
    expect(expandedContentWrapperTokens.has('px-4')).toBe(true);
    expect(expandedContentWrapperTokens.has('pb-3')).toBe(true);
    expect(expandedContentWrapperTokens.has('mt-3')).toBe(false);
    expect(substanceFooterTextTokens.has('text-foreground/60')).toBe(true);
    expect(substanceFooterTextTokens.has('text-muted-foreground')).toBe(false);
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
