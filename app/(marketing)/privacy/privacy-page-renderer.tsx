import type { ReactNode } from 'react';
import { privacyContent } from '@/app/(marketing)/privacy/privacy-content';
import { LegalDocument } from '@/components/legal/legal-document';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ROUTES } from '@/lib/routes';

export async function renderPrivacyPage({
  authNavSlot,
}: {
  authNavSlot?: ReactNode;
} = {}) {
  return MarketingLayout({
    ...(authNavSlot === undefined ? {} : { authNavSlot }),
    featuresHref: `${ROUTES.HOME}#features`,
    children: <LegalDocument content={privacyContent} />,
  });
}
