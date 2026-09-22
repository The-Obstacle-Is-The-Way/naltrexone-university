import type { Metadata } from 'next';
import { renderTermsPage } from '@/app/(marketing)/terms/terms-page-renderer';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Terms of Service - Addiction Boards',
  description:
    'Review the terms for using Addiction Boards, including subscriptions, automatic renewal, cancellation, and educational-use limitations.',
  alternates: { canonical: ROUTES.TERMS },
};

export default function TermsPage() {
  return renderTermsPage();
}
