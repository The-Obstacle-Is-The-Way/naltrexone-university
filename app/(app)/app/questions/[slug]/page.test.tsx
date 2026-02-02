// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('app/(app)/app/questions/[slug]', () => {
  it('renders a question shell', async () => {
    const QuestionPage = (await import('./page')).default;

    const html = renderToStaticMarkup(
      <QuestionPage params={{ slug: 'q-1' }} />,
    );

    expect(html).toContain('Question');
    expect(html).toContain('Loading question');
    expect(html).toContain('Back to Dashboard');
    expect(html).toContain('Submit');
  });

  it('renders an error state with try again button', async () => {
    const { QuestionView } = await import('./page');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'error', message: 'Boom' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Boom');
    expect(html).toContain('Try again');
  });

  it('renders not-found state when ready with no question', async () => {
    const { QuestionView } = await import('./page');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Question not found.');
  });

  it('renders the question card when question exists', async () => {
    const { QuestionView } = await import('./page');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: 'q_1',
          slug: 'q-1',
          stemMd: 'Stem',
          difficulty: 'easy',
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        selectedChoiceId={null}
        submitResult={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Stem');
    expect(html).toContain('Choice A');
  });

  it('renders feedback and reattempt button when submitResult exists', async () => {
    const { QuestionView } = await import('./page');

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: 'attempt_1',
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
        }}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Explanation');
    expect(html).toContain('Reattempt');
  });
});
