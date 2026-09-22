import type { Metadata } from 'next';
import { MarketingHomeShell } from '@/components/marketing/marketing-home';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Home - Addiction Boards',
  description:
    'Prepare for Addiction Psychiatry and Addiction Medicine boards with practice questions, detailed explanations, and progress tracking.',
  alternates: { canonical: ROUTES.HOME },
};

export default async function HomePage() {
  return MarketingHomeShell({});
}
