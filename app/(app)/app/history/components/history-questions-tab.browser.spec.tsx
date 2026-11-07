import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createAvailableAttemptedQuestionRow } from '@/src/application/test-helpers/view-rows';
import { ok } from '@/tests/test-helpers/ok';
import { buildHistoryQuestionsHref } from '../history-search-params';
import { HistoryQuestionsTab } from './history-questions-tab';

const fixtureQ1Id = crypto.randomUUID();

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function createAttemptedQuestionsResult(input?: {
  limit?: number;
  offset?: number;
}) {
  return ok({
    rows: [createAvailableAttemptedQuestionRow({ questionId: fixtureQ1Id })],
    totalCount: 41,
    limit: input?.limit ?? 20,
    offset: input?.offset ?? 0,
  });
}

describe('HistoryQuestionsTab (browser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
  });

  it('selecting a source filter preserves other filters and resets pagination', async () => {
    const screen = await render(
      <HistoryQuestionsTab
        result={createAttemptedQuestionsResult({ limit: 20, offset: 20 })}
        filters={{ result: 'incorrect' }}
      />,
    );

    await screen.getByLabelText('Source').click();
    await screen.getByText('Exam session').click();

    expect(pushMock).toHaveBeenCalledWith(
      buildHistoryQuestionsHref({
        limit: 20,
        offset: 0,
        filters: {
          result: 'incorrect',
          source: 'exam',
        },
      }),
    );
  });

  it('selecting All sources removes source while preserving unrelated filters', async () => {
    const screen = await render(
      <HistoryQuestionsTab
        result={createAttemptedQuestionsResult({ limit: 20, offset: 40 })}
        filters={{
          result: 'incorrect',
          source: 'exam',
          sort: 'difficulty',
        }}
      />,
    );

    await screen.getByLabelText('Source').click();
    await screen.getByText('All sources').click();

    expect(pushMock).toHaveBeenCalledWith(
      buildHistoryQuestionsHref({
        limit: 20,
        offset: 0,
        filters: {
          result: 'incorrect',
          sort: 'difficulty',
        },
      }),
    );
  });

  it('lists tags grouped by kind, each group ordered by name', async () => {
    const screen = await render(
      <HistoryQuestionsTab
        result={createAttemptedQuestionsResult()}
        tagOptions={[
          { slug: 'buprenorphine', name: 'Buprenorphine', kind: 'treatment' },
          { slug: 'a-screening', name: 'Screening', kind: 'topic' },
          { slug: 'alcohol', name: 'Alcohol', kind: 'substance' },
          { slug: 'z-epidemiology', name: 'Epidemiology', kind: 'topic' },
        ]}
      />,
    );

    await screen.getByLabelText('Tag').click();
    await expect
      .element(screen.getByRole('option', { name: 'Buprenorphine' }))
      .toBeVisible();

    expect(
      screen
        .getByRole('option')
        .elements()
        .map((option) => option.textContent),
    ).toEqual([
      'All tags',
      'Epidemiology',
      'Screening',
      'Alcohol',
      'Buprenorphine',
    ]);
  });

  it('orders tags with the same name and kind by slug', async () => {
    const screen = await render(
      <HistoryQuestionsTab
        result={createAttemptedQuestionsResult()}
        tagOptions={[
          { slug: 'pharmacology-b', name: 'Pharmacology', kind: 'topic' },
          { slug: 'pharmacology-a', name: 'Pharmacology', kind: 'topic' },
        ]}
      />,
    );

    await screen.getByLabelText('Tag').click();
    await screen
      .getByRole('option', { name: 'Pharmacology (Topic)' })
      .first()
      .click();

    expect(pushMock).toHaveBeenCalledWith(
      buildHistoryQuestionsHref({
        limit: 20,
        offset: 0,
        filters: { tagSlug: 'pharmacology-a' },
      }),
    );
  });
});
