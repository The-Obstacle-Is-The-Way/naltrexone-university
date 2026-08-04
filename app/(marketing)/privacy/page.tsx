import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { privacyContent } from '@/app/(marketing)/privacy/privacy-content';
import { LegalDocument } from '@/components/legal/legal-document';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Privacy Policy - Addiction Boards',
};

export async function renderPrivacyPage({
  authNavSlot,
}: {
  authNavSlot?: ReactNode;
} = {}) {
  return MarketingLayout({
    authNavSlot,
    featuresHref: `${ROUTES.HOME}#features`,
    children: <LegalDocument content={privacyContent} />,
  });
}

export default function PrivacyPage() {
  return renderPrivacyPage();
}
