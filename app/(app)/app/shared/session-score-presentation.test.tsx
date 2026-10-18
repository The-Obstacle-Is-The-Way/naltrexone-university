// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EndPracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';
import {
  createSessionHistoryRow,
  createUserStatsOutput,
} from '@/src/application/test-helpers/view-rows';
import { parseHtml } from '@/tests/shared/dom-helpers';

// Framework boundary only: these static render checks never navigate.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
}));

let DashboardView: typeof import('../dashboard/page').DashboardView;
let HistorySessionsTab: typeof import('../history/components/history-sessions-tab').HistorySessionsTab;
let SessionSummaryView: typeof import('../practice/[sessionId]/components/session-summary-view').SessionSummaryView;
beforeAll(async () => {
  ({ DashboardView } = await import('../dashboard/page'));
  ({ HistorySessionsTab } = await import(
    '../history/components/history-sessions-tab'
  ));
  ({ SessionSummaryView } = await import(
    '../practice/[sessionId]/components/session-summary-view'
  ));
});

const scenarios = [
  {
    name: 'no answers but scored items',
    answered: 0,
    scored: 10,
    correct: 0,
    accuracy: 0,
    label: '0%',
  },
  {
    name: 'no scored items',
    answered: 0,
    scored: 0,
    correct: 0,
    accuracy: 0,
    label: '—',
  },
  {
    name: 'a reduced score denominator',
    answered: 5,
    scored: 3,
    correct: 2,
    accuracy: 2 / 3,
    label: '67%',
  },
];

describe('session score presentation', () => {
  it.each(
    (['tutor', 'exam'] as const).flatMap((mode) =>
      scenarios.map((scenario) => ({ ...scenario, mode })),
    ),
  )(
    'agrees across the session screens for $mode with $name',
    ({ mode, answered, scored, correct, accuracy, label }) => {
      const row = createSessionHistoryRow({
        mode,
        answered,
        scored,
        correct,
        accuracy,
      });
      const data = { rows: [row], total: 1, limit: 20, offset: 0 };
      const dashboard = parseHtml(
        renderToStaticMarkup(
          <DashboardView
            stats={createUserStatsOutput()}
            sessionHistoryResult={{ ok: true, data }}
          />,
        ),
      );
      const history = parseHtml(
        renderToStaticMarkup(
          <HistorySessionsTab result={{ ok: true, data }} />,
        ),
      );
      const summary: EndPracticeSessionOutput = {
        sessionId: row.sessionId,
        mode,
        questionCount: row.questionCount,
        endedAt: row.endedAt,
        totals: {
          answered,
          scored,
          correct,
          accuracy,
          durationSeconds: row.durationSeconds,
        },
      };
      const completed = parseHtml(
        renderToStaticMarkup(<SessionSummaryView summary={summary} />),
      );
      const accuracyHeading = [...completed.querySelectorAll('div')].find(
        (element) => element.textContent === 'Accuracy',
      );
      expect
        .soft(dashboard.body.textContent)
        .toContain(`${correct}/${scored} correct (${label})`);
      expect
        .soft(history.body.textContent)
        .toContain(`${correct}/${scored} correct (${label})`);
      expect.soft(accuracyHeading?.nextElementSibling?.textContent).toBe(label);
    },
  );
});
