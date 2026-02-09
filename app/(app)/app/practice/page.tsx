import type { Metadata } from 'next';
import PracticePageClient from './practice-page-client';

export const metadata: Metadata = {
  title: 'Practice - Addiction Boards',
};

export type {
  PracticeSessionHistoryPanelProps,
  PracticeSessionStarterProps,
  PracticeViewProps,
} from './components';
export {
  IncompleteSessionCard,
  PracticeSessionHistoryPanel,
  PracticeSessionStarter,
  PracticeView,
} from './components';

export default function PracticePage() {
  return <PracticePageClient />;
}
