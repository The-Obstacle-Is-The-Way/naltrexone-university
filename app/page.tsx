import type { Metadata } from 'next';
import { renderMarketingHome } from '@/components/marketing/marketing-home';

export const metadata: Metadata = {
  title: 'Home - Addiction Boards',
};

export default async function HomePage() {
  return renderMarketingHome();
}
