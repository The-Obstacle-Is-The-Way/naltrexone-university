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
  searchParams?: {
    from?: string | string[];
  };
}) {
  const { slug } = await params;
  const from =
    typeof searchParams?.from === 'string' ? searchParams.from : undefined;
  return <QuestionPageClient slug={slug} from={from} />;
}
