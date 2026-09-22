import type { Metadata } from 'next';
import { renderPrivacyPage } from '@/app/(marketing)/privacy/privacy-page-renderer';
import { publicPageMetadata } from '@/lib/public-page-metadata';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = publicPageMetadata({
  title: 'Privacy Policy - Addiction Boards',
  description:
    'Read how Addiction Boards collects, uses, and protects your information, including account data, payments, and study activity.',
  path: ROUTES.PRIVACY,
});

export default function PrivacyPage() {
  return renderPrivacyPage();
}
