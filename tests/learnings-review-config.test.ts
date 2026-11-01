import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { learningReplies } from '../scripts/review/coderabbit-learnings-review';

it('reports the same learning hold period that CodeRabbit configures', () => {
  const config = parse(readFileSync('.coderabbit.yaml', 'utf8'));
  const recordedAt = '2026-10-01T00:00:00Z';
  const replies = learningReplies(
    [
      [
        {
          html_url: 'https://github.com/example/repo/pull/1#issuecomment-1',
          created_at: recordedAt,
          user: { login: 'coderabbitai[bot]' },
          body: '<details><summary>✏️ Learnings added</summary>\n```\nLearning: Preserve checked invariants.\n```\n</details>',
        },
      ],
    ],
    [],
    new Date('2026-09-30T00:00:00Z'),
  );
  const holdDays = config.knowledge_base.learnings.approval_delay;
  expect(Number.isInteger(holdDays)).toBe(true);
  const appliesOn = new Date(recordedAt);
  appliesOn.setUTCDate(appliesOn.getUTCDate() + holdDays);
  expect(replies).toHaveLength(1);
  expect(replies[0]?.appliesOn).toBe(appliesOn.toISOString().slice(0, 10));
});
