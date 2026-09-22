import type { Metadata } from 'next';
import { MarketingHomeShell } from '@/components/marketing/marketing-home';
import { publicPageMetadata } from '@/lib/public-page-metadata';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = publicPageMetadata({
  title: 'Home - Addiction Boards',
  description:
    'Prepare for Addiction Psychiatry and Addiction Medicine boards with practice questions, detailed explanations, and progress tracking.',
  path: ROUTES.HOME,
});

export default async function HomePage() {
  return MarketingHomeShell({});
}
