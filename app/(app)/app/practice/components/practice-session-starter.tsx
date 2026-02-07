'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/ui/filter-chip';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { TagRow } from '@/src/adapters/controllers/tag-controller';
import type { NextQuestion } from '@/src/application/use-cases/get-next-question';
import type { PracticeFilters } from '../practice-page-logic';
import { SESSION_COUNT_MAX, SESSION_COUNT_MIN } from '../practice-page-logic';

export type PracticeSessionStarterProps = {
  sessionMode: 'tutor' | 'exam';
  sessionCount: number;
  filters: PracticeFilters;
  tagLoadStatus: 'idle' | 'loading' | 'error';
  availableTags: TagRow[];
  sessionStartStatus: 'idle' | 'loading' | 'error';
  sessionStartError: string | null;
  isPending: boolean;
  onToggleDifficulty: (difficulty: NextQuestion['difficulty']) => void;
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
  const difficulties = ['easy', 'medium', 'hard'] satisfies Array<
    NextQuestion['difficulty']
  >;
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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
            <div className="text-sm font-medium text-foreground">Questions</div>
            <input
              type="number"
              min={SESSION_COUNT_MIN}
              max={SESSION_COUNT_MAX}
              className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={props.sessionCount}
              onChange={props.onSessionCountChange}
            />
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-foreground">Difficulty</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {difficulties.map((difficulty) => {
              const selected = props.filters.difficulties.includes(difficulty);
              return (
                <FilterChip
                  key={difficulty}
                  label={
                    difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
                  }
                  selected={selected}
                  onClick={() => props.onToggleDifficulty(difficulty)}
                />
              );
            })}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Leave empty to include all difficulties.
          </div>
        </div>

        {props.tagLoadStatus === 'loading' ? (
          <div className="text-sm text-muted-foreground">Loading tags…</div>
        ) : null}
        {props.tagLoadStatus === 'error' ? (
          <div className="text-sm text-destructive">Tags unavailable.</div>
        ) : null}
        {props.tagLoadStatus === 'idle'
          ? tagKindOrder
              .filter((kind) => tagsByKind.has(kind))
              .map((kind) => {
                const tags = tagsByKind.get(kind);
                if (!tags || tags.length === 0) return null;
                const label = tagKindLabels[kind];
                return (
                  <div key={kind}>
                    <div className="text-sm font-medium text-foreground">
                      {label}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <FilterChip
                          key={tag.slug}
                          label={tag.name}
                          selected={props.filters.tagSlugs.includes(tag.slug)}
                          onClick={() => props.onToggleTag(tag.slug)}
                        />
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Leave empty to include all {tagKindPluralLabels[kind]}.
                    </div>
                  </div>
                );
              })
          : null}
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          className="rounded-full"
          disabled={props.sessionStartStatus === 'loading' || props.isPending}
          onClick={props.onStartSession}
        >
          {props.sessionStartStatus === 'loading' || props.isPending
            ? 'Starting…'
            : 'Start session'}
        </Button>
      </div>

      {props.sessionStartStatus === 'error' && props.sessionStartError ? (
        <div className="mt-3 text-sm text-destructive">
          {props.sessionStartError}
        </div>
      ) : null}
    </div>
  );
}
