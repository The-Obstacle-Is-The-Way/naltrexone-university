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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <QuestionPageClient slug={slug} />;
}
