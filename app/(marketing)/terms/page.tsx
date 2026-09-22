import type { Metadata } from 'next';
import { renderTermsPage } from '@/app/(marketing)/terms/terms-page-renderer';
import { publicPageMetadata } from '@/lib/public-page-metadata';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = publicPageMetadata({
  title: 'Terms of Service - Addiction Boards',
  description:
    'Review the terms for using Addiction Boards, including subscriptions, automatic renewal, cancellation, and educational-use limitations.',
  path: ROUTES.TERMS,
});

export default function TermsPage() {
  return renderTermsPage();
}
