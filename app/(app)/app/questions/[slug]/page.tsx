import type { Metadata } from 'next';
import QuestionPageClient, {
  QuestionView,
  type QuestionViewProps,
} from './question-page-client';

export const metadata: Metadata = {
  title: 'Question - Addiction Boards',
};

export { QuestionView };
export type { QuestionViewProps };

export default async function QuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const from =
    typeof resolvedSearchParams?.from === 'string'
      ? resolvedSearchParams.from
      : undefined;
  return <QuestionPageClient slug={slug} from={from} />;
}
