import type { Metadata } from 'next';
import { renderPrivacyPage } from '@/app/(marketing)/privacy/privacy-page-renderer';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Privacy Policy - Addiction Boards',
  description:
    'Read how Addiction Boards collects, uses, and protects your information, including account data, payments, and study activity.',
  alternates: { canonical: ROUTES.PRIVACY },
};

export default function PrivacyPage() {
  return renderPrivacyPage();
}
