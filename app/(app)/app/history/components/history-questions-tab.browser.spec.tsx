import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ok } from '@/tests/test-helpers/ok';
import { buildHistoryQuestionsHref } from '../history-search-params';
import { HistoryQuestionsTab } from './history-questions-tab';

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
    rows: [
      {
        isAvailable: true as const,
        questionId: 'q_1',
        isCorrect: false,
        sessionId: null,
        sessionMode: null,
        slug: 'q-1',
        stemMd: 'Stem for q1',
        difficulty: 'easy' as const,
        tagSlugs: [],
        lastAnsweredAt: '2026-02-01T00:00:00.000Z',
      },
    ],
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
});
