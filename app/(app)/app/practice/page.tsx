import type { Metadata } from 'next';
import PracticePageClient from './practice-page-client';

export const metadata: Metadata = {
  title: 'Practice - Addiction Boards',
};

export type {
  PracticeSessionStarterProps,
  PracticeViewProps,
} from './components';
export {
  IncompleteSessionCard,
  PracticeSessionStarter,
  PracticeView,
} from './components';

export default function PracticePage() {
  return <PracticePageClient />;
}
