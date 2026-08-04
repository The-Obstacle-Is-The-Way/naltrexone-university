import type { ReactNode } from 'react';
import { termsContent } from '@/app/(marketing)/terms/terms-content';
import { LegalDocument } from '@/components/legal/legal-document';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { ROUTES } from '@/lib/routes';

export async function renderTermsPage({
  authNavSlot,
}: {
  authNavSlot?: ReactNode;
} = {}) {
  return MarketingLayout({
    ...(authNavSlot === undefined ? {} : { authNavSlot }),
    featuresHref: `${ROUTES.HOME}#features`,
    children: <LegalDocument content={termsContent} />,
  });
}
