import type { Metadata } from 'next';
import { MarketingHomeShell } from '@/components/marketing/marketing-home';

export const metadata: Metadata = {
  title: 'Home - Addiction Boards',
};

export default async function HomePage() {
  return MarketingHomeShell({});
}
