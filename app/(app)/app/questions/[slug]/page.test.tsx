// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';
import { findButtonByText, parseHtml } from '@/tests/shared/dom-helpers';

const { fixtureAttempt1Id, fixtureQuestion1Id } = vi.hoisted(() => ({
  fixtureAttempt1Id: crypto.randomUUID(),
  fixtureQuestion1Id: crypto.randomUUID(),
}));

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageModule =
  typeof import('@/app/(app)/app/questions/[slug]/page');

let QuestionPage: QuestionPageModule['default'];
let QuestionView: QuestionPageModule['QuestionView'];

beforeAll(async () => {
  const module = await import('@/app/(app)/app/questions/[slug]/page');
  QuestionPage = module.default;
  QuestionView = module.QuestionView;
});

function createTrackedThenable<T>(value: T) {
  const thenSpy = vi.fn();
  const thenFn = <TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ) => {
    thenSpy();
    return Promise.resolve(value).then(onFulfilled, onRejected);
  };

  const proxy = new Proxy(
    {},
    {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return thenFn;
        }

        return Reflect.get(target, prop, receiver);
      },
    },
  );

  return {
    thenable: proxy as PromiseLike<T>,
    thenSpy,
  };
}

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
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({}),
    } as never);

    expect(element).toMatchObject({
      props: { slug: 'q-1' },
    });
  });

  it('starts searchParams before params resolves', async () => {
    let releaseParams: (() => void) | undefined;
    const params = new Promise<{ slug: string }>((resolve) => {
      releaseParams = () => resolve({ slug: 'q-1' });
    });
    const { thenable: searchParams, thenSpy } = createTrackedThenable({
      from: 'history',
    });

    const pagePromise = QuestionPage({
      params,
      searchParams: searchParams as unknown as Promise<{
        from?: string | string[];
        mode?: string | string[];
        sessionId?: string | string[];
        attemptId?: string | string[];
        historyHref?: string | string[];
        historySeq?: string | string[];
        historyIndex?: string | string[];
      }>,
    });

    await Promise.resolve();

    expect(thenSpy).toHaveBeenCalledTimes(1);

    releaseParams?.();

    const element = await pagePromise;

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        from: 'history',
      },
    });
  });

  it('passes origin searchParams into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({ from: 'history' }),
    } as never);

    expect(element).toMatchObject({
      props: { slug: 'q-1', from: 'history' },
    });
  });

  it('passes mode searchParams into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({ mode: 'review' }),
    } as never);

    expect(element).toMatchObject({
      props: { slug: 'q-1', mode: 'review' },
    });
  });

  it('passes sessionId searchParams into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        sessionId: '00000000-0000-4000-8000-000000000001',
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        sessionId: '00000000-0000-4000-8000-000000000001',
      },
    });
  });

  it('passes the first sessionId value when searchParams contains an array', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        sessionId: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000099',
        ],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        sessionId: '00000000-0000-4000-8000-000000000001',
      },
    });
  });

  it('passes attemptId searchParams into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        attemptId: '00000000-0000-4000-8000-000000000002',
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        attemptId: '00000000-0000-4000-8000-000000000002',
      },
    });
  });

  it('passes the first attemptId value when searchParams contains an array', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        attemptId: [
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000098',
        ],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        attemptId: '00000000-0000-4000-8000-000000000002',
      },
    });
  });

  it('normalizes mixed review attemptId/sessionId by preferring sessionId', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const element = await QuestionPage({
        params: Promise.resolve({ slug: 'q-1' }),
        searchParams: Promise.resolve({
          mode: 'review',
          attemptId: '00000000-0000-4000-8000-000000000002',
          sessionId: '00000000-0000-4000-8000-000000000001',
        }),
      } as never);

      expect(element).toMatchObject({
        props: {
          slug: 'q-1',
          mode: 'review',
          sessionId: '00000000-0000-4000-8000-000000000001',
          attemptId: undefined,
        },
      });

      expect(infoSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        expect.objectContaining({
          event: 'review_identifier_normalized',
          normalizedTo: 'sessionId',
          hadAttemptId: true,
          hadSessionId: true,
          mode: 'review',
        }),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('normalizes mixed review attemptId/sessionId arrays by preferring the first sessionId value', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const element = await QuestionPage({
        params: Promise.resolve({ slug: 'q-1' }),
        searchParams: Promise.resolve({
          mode: 'review',
          attemptId: [
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000098',
          ],
          sessionId: [
            '00000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000099',
          ],
        }),
      } as never);

      expect(element).toMatchObject({
        props: {
          slug: 'q-1',
          mode: 'review',
          sessionId: '00000000-0000-4000-8000-000000000001',
          attemptId: undefined,
        },
      });

      expect(infoSpy).toHaveBeenCalledWith(
        '[Telemetry]',
        expect.objectContaining({
          event: 'review_identifier_normalized',
          normalizedTo: 'sessionId',
          hadAttemptId: true,
          hadSessionId: true,
          mode: 'review',
        }),
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('passes historyHref searchParams into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        historyHref: '/app/history?tab=questions&offset=0&limit=20',
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        historyHref: '/app/history?tab=questions&offset=0&limit=20',
      },
    });
  });

  it('passes the first historyHref value when searchParams contains an array', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        historyHref: [
          '/app/history?tab=questions&offset=0&limit=20',
          '/app/history?tab=questions&offset=20&limit=20',
        ],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        historyHref: '/app/history?tab=questions&offset=0&limit=20',
      },
    });
  });

  it('passes history sequence params into the client page', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        historySeq: 'q-1,q-2,q-3',
        historyIndex: '1',
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        historySeq: 'q-1,q-2,q-3',
        historyIndex: '1',
      },
    });
  });

  it('passes the first historySeq value when searchParams contains an array', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        historySeq: ['q-1,q-2,q-3', 'q-4,q-5,q-6'],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        historySeq: 'q-1,q-2,q-3',
      },
    });
  });

  it('passes the first historyIndex value when searchParams contains an array', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({
        historyIndex: ['1', '2'],
      }),
    } as never);

    expect(element).toMatchObject({
      props: {
        slug: 'q-1',
        historyIndex: '1',
      },
    });
  });

  it('renders a question shell', async () => {
    const element = await QuestionPage({
      params: Promise.resolve({ slug: 'q-1' }),
      searchParams: Promise.resolve({}),
    } as never);

    const html = renderToStaticMarkup(element);

    expect(html).toContain('Question');
    expect(html).toContain('Loading question');
    expect(html).toContain('Back to Dashboard');
    expect(html).toContain('Submit');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders an error state with try again button', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'error', message: 'Boom' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
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

  it('renders not-found state when ready with no question', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
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

  it('renders the question card when question exists', () => {
    const choice = createChoice({
      id: 'c1',
      questionId: fixtureQuestion1Id,
      label: 'A',
      textMd: 'Choice A',
    });
    const question = createQuestion({
      id: fixtureQuestion1Id,
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
        sessionNavigation={null}
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

  it('renders feedback and post-submit actions when submitResult exists', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
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
    expect(html).toContain('Back to Dashboard');
    expect(html).not.toContain('Submit');
  });

  it('disables submit while loading to prevent duplicate submissions', () => {
    const choice = createChoice({
      id: 'c1',
      questionId: fixtureQuestion1Id,
      label: 'A',
      textMd: 'Choice A',
    });
    const question = createQuestion({
      id: fixtureQuestion1Id,
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
        sessionNavigation={null}
        canSubmit
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = parseHtml(html);
    const submitButton = findButtonByText(doc, 'Submit');

    expect(submitButton).not.toBeNull();
    expect(submitButton?.hasAttribute('disabled')).toBe(true);
  });
});
