// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

function toGetQuestionBySlugOutput(
  question: ReturnType<typeof createQuestion>,
) {
  return {
    questionId: question.id,
    slug: question.slug,
    stemMd: question.stemMd,
    difficulty: question.difficulty,
    choices: question.choices.map((c) => ({
      id: c.id,
      label: c.label,
      textMd: c.textMd,
    })),
  };
}

describe('app/(app)/app/questions/[slug]', () => {
  it('unwraps async params before rendering the client page', async () => {
    const QuestionPage = (await import('@/app/(app)/app/questions/[slug]/page'))
      .default;

    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
    } as never);

    expect(element).toMatchObject({
      props: { slug: 'q-1' },
    });
  }, 20_000);

  it('renders a question shell', async () => {
    const QuestionPage = (await import('@/app/(app)/app/questions/[slug]/page'))
      .default;

    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
    } as never);

    const html = renderToStaticMarkup(element);

    expect(html).toContain('Question');
    expect(html).toContain('Loading question');
    expect(html).toContain('Back to Dashboard');
    expect(html).toContain('Submit');
  }, 10_000);

  it('renders an error state with try again button', async () => {
    const { QuestionView } = await import(
      '@/app/(app)/app/questions/[slug]/page'
    );

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
    const { QuestionView } = await import(
      '@/app/(app)/app/questions/[slug]/page'
    );

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
    const { QuestionView } = await import(
      '@/app/(app)/app/questions/[slug]/page'
    );

    const choice = createChoice({
      id: 'c1',
      questionId: 'q_1',
      label: 'A',
      textMd: 'Choice A',
    });
    const question = createQuestion({
      id: 'q_1',
      slug: 'q-1',
      stemMd: 'Stem',
      difficulty: 'easy',
      choices: [choice],
    });

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={toGetQuestionBySlugOutput(question)}
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

  it('renders feedback and post-submit actions when submitResult exists', async () => {
    const { QuestionView } = await import(
      '@/app/(app)/app/questions/[slug]/page'
    );

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
    expect(html).toContain('Try Again');
    expect(html).toContain('Back to Review');
    expect(html).not.toContain('Submit');
  });

  it('disables submit while loading to prevent duplicate submissions', async () => {
    const { QuestionView } = await import(
      '@/app/(app)/app/questions/[slug]/page'
    );

    const choice = createChoice({
      id: 'c1',
      questionId: 'q_1',
      label: 'A',
      textMd: 'Choice A',
    });
    const question = createQuestion({
      id: 'q_1',
      slug: 'q-1',
      stemMd: 'Stem',
      difficulty: 'easy',
      choices: [choice],
    });

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'loading' }}
        question={toGetQuestionBySlugOutput(question)}
        selectedChoiceId="c1"
        submitResult={null}
        canSubmit
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Submit<\/button>/);
  });
});
