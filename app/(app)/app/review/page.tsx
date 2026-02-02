import Link from 'next/link';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetMissedQuestionsOutput,
  getMissedQuestions,
} from '@/src/adapters/controllers/review-controller';

type ReviewSearchParams = {
  limit?: string;
  offset?: string;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

function parseLimit(value: string | undefined): number {
  const limit = parsePositiveInt(value, 20);
  return Math.min(Math.max(limit, 1), 100);
}

export function ReviewView({ rows, limit, offset }: GetMissedQuestionsOutput) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Review</h1>
          <p className="mt-1 text-muted-foreground">
            Review questions you&apos;ve missed.
          </p>
        </div>
        <Link
          href="/app/practice"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Go to Practice
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          No missed questions yet.
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.questionId}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    {row.slug}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {row.stemMd}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="capitalize">{row.difficulty}</span>
                    <span className="mx-2">•</span>
                    <span>Missed {row.lastAnsweredAt.slice(0, 10)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between">
            {offset > 0 ? (
              <Link
                href={`/app/review?offset=${prevOffset}&limit=${limit}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}

            {rows.length === limit ? (
              <Link
                href={`/app/review?offset=${nextOffset}&limit=${limit}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function renderReview(result: ActionResult<GetMissedQuestionsOutput>) {
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Review</h1>
          <p className="mt-1 text-muted-foreground">
            Unable to load missed questions.
          </p>
        </div>
        <div
          className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm"
          role="alert"
        >
          {result.error.message}
        </div>
        <Link
          href="/app/practice"
          className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Go to Practice
        </Link>
      </div>
    );
  }

  return (
    <ReviewView
      rows={result.data.rows}
      limit={result.data.limit}
      offset={result.data.offset}
    />
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<ReviewSearchParams>;
}) {
  const params = await searchParams;
  const limit = parseLimit(params.limit);
  const offset = parsePositiveInt(params.offset, 0);

  const result = await getMissedQuestions({ limit, offset });
  return renderReview(result);
}
