'use client';

import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterChip } from '@/components/ui/filter-chip';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { TagRow } from '@/src/adapters/controllers/tag-controller';
import {
  AllDifficulties,
  AllQuestionProgressStatuses,
  type QuestionDifficulty,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';
import type { PracticeFilters } from '../practice-page-logic';
import { SESSION_COUNT_MAX, SESSION_COUNT_MIN } from '../practice-page-logic';
import {
  difficultyDisplayLabel,
  statusDisplayLabel,
} from '../practice-page-types';

export type PracticeSessionStarterProps = {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  sessionCountInputValue?: string;
  filters: PracticeFilters;
  availableCountStatus: 'idle' | 'loading' | 'error';
  availableCount: number | null;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  onDifficultyChange: (difficulty: PracticeFilters['difficulty']) => void;
  onStatusChange: (status: PracticeFilters['status']) => void;
  onToggleTag: (slug: string) => void;
  onSessionModeChange: (mode: string) => void;
  onSessionCountChange: (event: { target: { value: string } }) => void;
  onSessionCountBlur?: () => void;
  onStartSession: () => void;
};

type VisibleTagKind = 'topic' | 'substance' | 'treatment';

const tagKindLabels: Record<VisibleTagKind, string> = {
  topic: 'Topic',
  substance: 'Substance',
  treatment: 'Treatment',
};

const tagKindOrder: VisibleTagKind[] = ['topic', 'substance', 'treatment'];

const segmentedControlLabelIds = {
  mode: 'practice-session-mode-label',
  status: 'practice-session-status-label',
  difficulty: 'practice-session-difficulty-label',
} as const;

export function PracticeSessionStarter(props: PracticeSessionStarterProps) {
  const selectedTagSlugs = useMemo(
    () => new Set(props.filters.tagSlugs),
    [props.filters.tagSlugs],
  );

  const availableCountMessage = useMemo(() => {
    if (props.availableCountStatus === 'loading') {
      return 'Counting questions…';
    }

    if (props.availableCountStatus === 'error') {
      return 'Question count unavailable.';
    }

    if (typeof props.availableCount !== 'number') return null;

    if (props.availableCount === 0) {
      return 'No questions match your filters.';
    }

    if (props.sessionCount > props.availableCount) {
      return `Only ${props.availableCount} questions available. Starting session with ${props.availableCount}.`;
    }

    return `${props.availableCount} questions available.`;
  }, [props.availableCount, props.availableCountStatus, props.sessionCount]);

  const isStartDisabled =
    props.sessionStartStatus === 'loading' ||
    (props.availableCountStatus === 'idle' && props.availableCount === 0);

  const tagsByKind = useMemo(() => {
    const map = new Map<string, TagRow[]>();
    for (const tag of props.availableTags) {
      const list = map.get(tag.kind) ?? [];
      list.push(tag);
      map.set(tag.kind, list);
    }
    return map;
  }, [props.availableTags]);

  return (
    <Card
      id="practice-session-starter"
      className="gap-0 rounded-2xl border-border p-6"
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Start a session
        </h2>
        <div className="text-sm text-muted-foreground">
          Tutor mode shows explanations immediately. Exam mode hides
          explanations until you end the session.
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <div
              id={segmentedControlLabelIds.mode}
              className="text-sm font-medium text-foreground"
            >
              Mode
            </div>
            <SegmentedControl
              options={[
                { value: 'tutor', label: 'Tutor' },
                { value: 'exam', label: 'Exam' },
              ]}
              value={props.sessionMode}
              onChange={props.onSessionModeChange}
              ariaLabelledBy={segmentedControlLabelIds.mode}
            />
          </div>

          <div className="flex flex-col items-center gap-2">
            <label
              htmlFor="session-count-input"
              className="text-sm font-medium text-foreground"
            >
              Questions
            </label>
            <div className="inline-flex rounded-lg border border-border bg-muted p-1">
              <Input
                id="session-count-input"
                type="number"
                min={SESSION_COUNT_MIN}
                max={SESSION_COUNT_MAX}
                className="w-16 rounded-md border-0 bg-transparent dark:bg-transparent px-4 py-2 text-center text-sm font-medium shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={
                  props.sessionCountInputValue ?? String(props.sessionCount)
                }
                onChange={props.onSessionCountChange}
                onBlur={props.onSessionCountBlur}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div
            id={segmentedControlLabelIds.status}
            className="text-sm font-medium text-foreground"
          >
            Status
          </div>
          <SegmentedControl
            options={AllQuestionProgressStatuses.map((status) => ({
              value: status,
              label: statusDisplayLabel(status),
            }))}
            value={props.filters.status}
            onChange={(value) =>
              props.onStatusChange(value as QuestionProgressStatus)
            }
            ariaLabelledBy={segmentedControlLabelIds.status}
          />
        </div>

        <div className="space-y-2">
          <div
            id={segmentedControlLabelIds.difficulty}
            className="text-sm font-medium text-foreground"
          >
            Difficulty
          </div>
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              ...AllDifficulties.map((difficulty) => ({
                value: difficulty,
                label: difficultyDisplayLabel(difficulty),
              })),
            ]}
            value={props.filters.difficulty ?? 'all'}
            onChange={(value) => {
              if (value === 'all') {
                props.onDifficultyChange(null);
                return;
              }

              props.onDifficultyChange(value as QuestionDifficulty);
            }}
            ariaLabelledBy={segmentedControlLabelIds.difficulty}
          />
        </div>

        {props.tagLoadStatus === 'loading' ? (
          <output className="text-sm text-muted-foreground" aria-live="polite">
            Loading tags…
          </output>
        ) : null}
        {props.tagLoadStatus === 'error' ? (
          <div className="text-sm text-destructive" role="alert">
            Tags unavailable.
          </div>
        ) : null}
        {props.tagLoadStatus === 'idle'
          ? tagKindOrder
              .filter((kind) => tagsByKind.has(kind))
              .map((kind) => {
                const tags = tagsByKind.get(kind);
                if (!tags || tags.length === 0) return null;
                const label = tagKindLabels[kind];
                const selectedCount = tags.filter((tag) =>
                  selectedTagSlugs.has(tag.slug),
                ).length;
                return (
                  <details
                    key={kind}
                    className="group rounded-xl bg-foreground/5"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
                      <span>{label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-normal text-foreground/60">
                          {selectedCount === 0
                            ? 'All included by default'
                            : `${selectedCount} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 text-foreground/60 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="px-4 pb-3">
                      <fieldset
                        className="flex flex-wrap gap-2 border-0 p-0 m-0"
                        aria-label={label}
                      >
                        {tags.map((tag) => (
                          <FilterChip
                            key={tag.slug}
                            label={tag.name}
                            selected={selectedTagSlugs.has(tag.slug)}
                            onClick={() => props.onToggleTag(tag.slug)}
                          />
                        ))}
                      </fieldset>
                      <div className="mt-1 text-xs text-foreground/60">
                        ({selectedCount} selected)
                      </div>
                    </div>
                  </details>
                );
              })
          : null}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        {availableCountMessage ? (
          <output
            className="text-sm text-muted-foreground sm:mr-auto"
            aria-live="polite"
          >
            {availableCountMessage}
          </output>
        ) : null}
        <Button
          type="button"
          className="rounded-full"
          disabled={isStartDisabled}
          onClick={props.onStartSession}
        >
          {props.sessionStartStatus === 'loading'
            ? 'Starting…'
            : 'Start session'}
        </Button>
      </div>

      {props.sessionStartStatus === 'error' && props.sessionStartError ? (
        <div className="mt-3 text-sm text-destructive" role="alert">
          {props.sessionStartError}
        </div>
      ) : null}
    </Card>
  );
}
