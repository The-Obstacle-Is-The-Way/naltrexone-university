// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { compactControlShellClasses } from '@/components/ui/control-shell-styles';

let PracticeSessionStarter: typeof import('./practice-session-starter')['PracticeSessionStarter'];

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

function expectTokensToIncludeClassName(
  tokens: Set<string>,
  className: string,
) {
  for (const token of getClassTokens(className)) {
    expect(tokens.has(token)).toBe(true);
  }
}

function findElementsByExactText(
  doc: Document,
  selector: string,
  text: string,
) {
  return Array.from(doc.querySelectorAll(selector)).filter(
    (element) => (element.textContent ?? '').trim() === text,
  );
}

function findVisibleLabelsWithId(doc: Document, text: string) {
  return findElementsByExactText(doc, '[id]', text);
}

function findQuestionsLabel(doc: Document) {
  return findElementsByExactText(doc, 'label[for]', 'Questions')[0] ?? null;
}

function findQuestionsInput(doc: Document) {
  const label = findQuestionsLabel(doc);
  const inputId = label?.getAttribute('for');
  return inputId ? doc.getElementById(inputId) : null;
}

function findFieldsetByVisibleLabel(doc: Document, labelText: string) {
  const label = findVisibleLabelsWithId(doc, labelText)[0] ?? null;
  const labelId = label?.getAttribute('id');
  return labelId
    ? doc.querySelector(`fieldset[aria-labelledby="${labelId}"]`)
    : null;
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
    const input = findQuestionsInput(doc);
    const inputTokens = getClassTokens(input?.getAttribute('class') ?? '');

    expect(title?.textContent).toBe('Start a session');
    expect(title?.getAttribute('class')).toContain(
      'text-base font-semibold text-foreground',
    );
    expect(inputTokens.has('w-16')).toBe(true);
    expect(inputTokens.has('border-0')).toBe(true);
    expect(inputTokens.has('shadow-none')).toBe(true);
    expect(inputTokens.has('bg-transparent')).toBe(true);
    expect(inputTokens.has('rounded-md')).toBe(true);
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

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const label = findQuestionsLabel(doc);
    const input = findQuestionsInput(doc);

    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
  });

  it('generates distinct ids for each starter instance', () => {
    const html = renderToStaticMarkup(
      <>
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
        />
        <PracticeSessionStarter
          sessionMode="exam"
          sessionCount={10}
          filters={{ tagSlugs: [], difficulty: 'easy', status: 'incorrect' }}
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
        />
      </>,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const modeLabels = findVisibleLabelsWithId(doc, 'Mode');
    const statusLabels = findVisibleLabelsWithId(doc, 'Status');
    const difficultyLabels = findVisibleLabelsWithId(doc, 'Difficulty');
    const questionLabels = findElementsByExactText(
      doc,
      'label[for]',
      'Questions',
    );

    expect(new Set(modeLabels.map((element) => element.id)).size).toBe(2);
    expect(new Set(statusLabels.map((element) => element.id)).size).toBe(2);
    expect(new Set(difficultyLabels.map((element) => element.id)).size).toBe(2);

    const questionInputIds = questionLabels
      .map((label) => label.getAttribute('for'))
      .filter((value): value is string => Boolean(value));
    expect(new Set(questionInputIds).size).toBe(2);

    for (const label of [...modeLabels, ...statusLabels, ...difficultyLabels]) {
      expect(
        doc.querySelector(`fieldset[aria-labelledby="${label.id}"]`),
      ).not.toBeNull();
    }

    for (const inputId of questionInputIds) {
      expect(doc.getElementById(inputId)).not.toBeNull();
    }
  });

  it('bottom-aligns the mixed-height starter form row at the small-screen breakpoint', () => {
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
    const sessionCountInput = findQuestionsInput(doc);
    const starterRow = sessionCountInput?.closest('div[class~="sm:flex-row"]');
    const starterRowTokens = getClassTokens(
      starterRow?.getAttribute('class') ?? '',
    );

    expect(sessionCountInput).not.toBeNull();
    expect(starterRow).not.toBeNull();
    expect(starterRowTokens.has('sm:items-end')).toBe(true);
    expect(starterRowTokens.has('sm:items-center')).toBe(false);
  });

  it('left-aligns the Questions label and matches the segmented-control shell', () => {
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
    const label = findQuestionsLabel(doc);
    const input = findQuestionsInput(doc);
    const questionsWrapper = label?.parentElement;
    const inputShell = input?.parentElement;
    const wrapperTokens = getClassTokens(
      questionsWrapper?.getAttribute('class') ?? '',
    );
    const inputShellTokens = getClassTokens(
      inputShell?.getAttribute('class') ?? '',
    );
    const inputTokens = getClassTokens(input?.getAttribute('class') ?? '');

    expect(questionsWrapper).not.toBeNull();
    expect(inputShell).not.toBeNull();
    expect(input).not.toBeNull();
    expect(wrapperTokens.has('items-start')).toBe(true);
    expect(wrapperTokens.has('items-center')).toBe(false);
    expectTokensToIncludeClassName(
      inputShellTokens,
      compactControlShellClasses,
    );
    expect(inputTokens.has('text-center')).toBe(true);
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
    const statusFieldset = findFieldsetByVisibleLabel(doc, 'Status');
    const difficultyFieldset = findFieldsetByVisibleLabel(doc, 'Difficulty');
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
    expect(findFieldsetByVisibleLabel(doc, 'Mode')).not.toBeNull();
    expect(findFieldsetByVisibleLabel(doc, 'Status')).not.toBeNull();
    expect(findFieldsetByVisibleLabel(doc, 'Difficulty')).not.toBeNull();
    const legends = Array.from(doc.querySelectorAll('legend')).map((el) =>
      (el.textContent ?? '').trim(),
    );
    expect(legends).not.toContain('Mode');
    expect(legends).not.toContain('Status');
    expect(legends).not.toContain('Difficulty');
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
    expect(summaryChevronTokens.has('size-4')).toBe(true);
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
    const statusControl = findFieldsetByVisibleLabel(doc, 'Status');
    expect(statusControl).toBeTruthy();
    const activeStatus = statusControl?.querySelector(
      'button[aria-pressed="true"]',
    );
    expect(activeStatus?.textContent).toBe('Incorrect');

    const difficultyControl = findFieldsetByVisibleLabel(doc, 'Difficulty');
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
