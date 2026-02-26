'use client';

import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type { GetSessionHistoryOutput } from '@/src/adapters/controllers/practice-controller';
import type { GetAttemptedQuestionsOutput } from '@/src/adapters/controllers/review-controller';
import { HistoryQuestionsTab } from './components/history-questions-tab';
import { HistorySessionsTab } from './components/history-sessions-tab';
import { HistoryTabBar } from './components/history-tab-bar';
import type {
  QuestionsFilters,
  SessionModeFilter,
} from './history-search-params';

export type HistoryPageClientProps =
  | {
      activeTab: 'sessions';
      sessionsResult: ActionResult<GetSessionHistoryOutput>;
      sessionsModeFilter?: SessionModeFilter;
    }
  | {
      activeTab: 'questions';
      questionsResult: ActionResult<GetAttemptedQuestionsOutput>;
      questionsFilters?: QuestionsFilters;
      questionsTagOptions?: {
        slug: string;
        name: string;
        kind: 'topic' | 'substance' | 'treatment';
      }[];
    };

export function HistoryPageClient(props: HistoryPageClientProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
          History
        </h1>
        <p className="text-muted-foreground">
          Review completed sessions and your Quick Practice questions.
        </p>
      </div>

      <HistoryTabBar activeTab={props.activeTab} />

      {props.activeTab === 'sessions' ? (
        <HistorySessionsTab
          result={props.sessionsResult}
          modeFilter={props.sessionsModeFilter}
        />
      ) : (
        <HistoryQuestionsTab
          result={props.questionsResult}
          filters={props.questionsFilters}
          tagOptions={props.questionsTagOptions}
        />
      )}
    </div>
  );
}
