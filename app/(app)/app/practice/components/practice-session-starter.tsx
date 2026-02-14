'use client';

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
import { statusDisplayLabel } from '../practice-page-types';

export type PracticeSessionStarterProps = {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  filters: PracticeFilters;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  onDifficultyChange: (difficulty: PracticeFilters['difficulty']) => void;
  onStatusChange: (status: PracticeFilters['status']) => void;
  onToggleTag: (slug: string) => void;
  onSessionModeChange: (mode: string) => void;
  onSessionCountChange: (event: { target: { value: string } }) => void;
  onStartSession: () => void;
};

const tagKindLabels: Record<TagRow['kind'], string> = {
  domain: 'Exam Section',
  topic: 'Topic',
  substance: 'Substance',
  treatment: 'Treatment',
  diagnosis: 'Diagnosis',
};

const tagKindPluralLabels: Record<TagRow['kind'], string> = {
  domain: 'sections',
  topic: 'topics',
  substance: 'substances',
  treatment: 'treatments',
  diagnosis: 'diagnoses',
};

const tagKindOrder: TagRow['kind'][] = [
  'domain',
  'substance',
  'topic',
  'treatment',
  'diagnosis',
];

export function PracticeSessionStarter(props: PracticeSessionStarterProps) {
  const selectedTagSlugs = useMemo(
    () => new Set(props.filters.tagSlugs),
    [props.filters.tagSlugs],
  );
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
        <div className="text-sm font-medium text-foreground">
          Start a session
        </div>
        <div className="text-sm text-muted-foreground">
          Tutor mode shows explanations immediately. Exam mode hides
          explanations until you end the session.
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Mode</div>
            <SegmentedControl
              options={[
                { value: 'tutor', label: 'Tutor' },
                { value: 'exam', label: 'Exam' },
              ]}
              value={props.sessionMode}
              onChange={props.onSessionModeChange}
              legend="Mode"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="session-count-input"
              className="text-sm font-medium text-foreground"
            >
              Questions
            </label>
            <Input
              id="session-count-input"
              type="number"
              min={SESSION_COUNT_MIN}
              max={SESSION_COUNT_MAX}
              className="w-24"
              value={props.sessionCount}
              onChange={props.onSessionCountChange}
            />
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-foreground">Status</div>
          <div className="mt-2">
            <SegmentedControl
              options={AllQuestionProgressStatuses.map((status) => ({
                value: status,
                label: statusDisplayLabel(status),
              }))}
              value={props.filters.status}
              onChange={(value) =>
                props.onStatusChange(value as QuestionProgressStatus)
              }
              legend="Status"
            />
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-foreground">Difficulty</div>
          <div className="mt-2">
            <SegmentedControl
              options={[
                { value: 'all', label: 'All' },
                ...AllDifficulties.map((difficulty) => ({
                  value: difficulty,
                  label:
                    difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
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
              legend="Difficulty"
            />
          </div>
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
                    className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]">
                      <span>{label}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        ({selectedCount} selected)
                      </span>
                    </summary>
                    <div className="mt-3">
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
                      <div className="mt-1 text-xs text-muted-foreground">
                        Leave empty to include all {tagKindPluralLabels[kind]}.
                      </div>
                    </div>
                  </details>
                );
              })
          : null}
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          className="rounded-full"
          disabled={props.sessionStartStatus === 'loading'}
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
