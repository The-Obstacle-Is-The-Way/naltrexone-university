// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let PracticeSessionStarter: typeof import('./practice-session-starter')['PracticeSessionStarter'];

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
    expect(html).toContain('dark:border-foreground/40');
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
