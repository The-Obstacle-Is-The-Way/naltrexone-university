import type { Metadata } from 'next';
import QuickPracticeClient from './quick-practice-client';

export const metadata: Metadata = {
  title: 'Quick Practice - Addiction Boards',
};

export default function QuickPracticePage() {
  return <QuickPracticeClient />;
}
