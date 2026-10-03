// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createUserStatsOutput } from '@/src/application/test-helpers/view-rows';
import type { UserStatsOutput } from '@/src/application/use-cases';

let DashboardView: typeof import('./page').DashboardView;

beforeAll(async () => {
  ({ DashboardView } = await import('./page'));
});

function renderStats(stats: UserStatsOutput) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <DashboardView
        stats={stats}
        sessionHistoryResult={{
          ok: true,
          data: { rows: [], total: 0, limit: 3, offset: 0 },
        }}
      />,
    ),
    'text/html',
  );
}

function statCard(doc: Document, label: string) {
  const labelEl = Array.from(doc.querySelectorAll('div')).find(
    (el) => el.textContent === label,
  );
  if (!labelEl?.parentElement) throw new Error(`No ${label} card`);
  return {
    value: labelEl.nextElementSibling?.textContent ?? null,
    text: labelEl.parentElement.textContent ?? '',
  };
}

// ADR-022 Decision 3, Pattern Registry F-13: accuracy counts only the answers
// on available questions and says how many questions it leaves out. Total
// answered and answered in seven days count every answer.
describe('dashboard accuracy over scored answers', () => {
  it('reads — when no answer is scored, though answers exist', () => {
    const doc = renderStats(
      createUserStatsOutput({
        totalAnswered: 2,
        scoredOverall: 0,
        unscoredQuestionsOverall: 2,
        answeredLast7Days: 1,
        scoredLast7Days: 0,
        unscoredQuestionsLast7Days: 1,
      }),
    );

    expect(statCard(doc, 'Total answered').value).toBe('2');
    expect(statCard(doc, 'Overall accuracy').value).toBe('—');
    expect(statCard(doc, 'Answered (7 days)').value).toBe('1');
    expect(statCard(doc, 'Accuracy (7 days)').value).toBe('—');
  });

  it('says under each accuracy how many questions it leaves out', () => {
    const doc = renderStats(
      createUserStatsOutput({
        totalAnswered: 12,
        accuracyOverall: 0.75,
        scoredOverall: 8,
        unscoredQuestionsOverall: 3,
        answeredLast7Days: 5,
        accuracyLast7Days: 0.5,
        scoredLast7Days: 4,
        unscoredQuestionsLast7Days: 1,
      }),
    );

    const overall = statCard(doc, 'Overall accuracy');
    expect(overall.value).toBe('75%');
    expect(overall.text).toContain(
      "3 questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected.",
    );
    const lastWeek = statCard(doc, 'Accuracy (7 days)');
    expect(lastWeek.value).toBe('50%');
    expect(lastWeek.text).toContain(
      "1 question isn't scored: withdrawn, under review, removed mid-session, or its answer was corrected.",
    );
  });

  it('says nothing more when every answer is scored', () => {
    const doc = renderStats(
      createUserStatsOutput({
        totalAnswered: 4,
        accuracyOverall: 0.5,
        answeredLast7Days: 2,
        accuracyLast7Days: 0.5,
      }),
    );

    expect(doc.body.textContent).not.toContain('scored:');
  });
});
