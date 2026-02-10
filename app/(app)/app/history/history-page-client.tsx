'use client';

import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetMissedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { HistoryMissedTab } from './components/history-missed-tab';
import { HistorySessionsTab } from './components/history-sessions-tab';
import { HistoryTabBar } from './components/history-tab-bar';
import type { MissedFilters } from './history-search-params';

export type HistoryPageClientProps =
  | {
      activeTab: 'sessions';
      sessionsResult: ActionResult<GetSessionHistoryOutput>;
    }
  | {
      activeTab: 'missed';
      missedResult: ActionResult<GetMissedQuestionsOutput>;
      missedFilters?: MissedFilters;
    };

export function HistoryPageClient(props: HistoryPageClientProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          History
        </h1>
        <p className="text-muted-foreground">
          Review completed sessions and missed questions.
        </p>
      </div>

      <HistoryTabBar activeTab={props.activeTab} />

      {props.activeTab === 'sessions' ? (
        <HistorySessionsTab result={props.sessionsResult} />
      ) : (
        <HistoryMissedTab
          result={props.missedResult}
          filters={props.missedFilters}
        />
      )}
    </div>
  );
}
