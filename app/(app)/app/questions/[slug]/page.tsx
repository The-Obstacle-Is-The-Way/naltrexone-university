import QuestionPageClient, {
  QuestionView,
  type QuestionViewProps,
} from './question-page-client';

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
