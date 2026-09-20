import { describe, expect, it } from 'vitest';
import {
  parseDraftQuestionBlock,
  splitDraftQuestionsFile,
} from './draft-question-import';

function block(qid: string): string {
  return [
    '---',
    `qid: ${qid}`,
    'type: recall',
    'difficulty: easy',
    'substances: [alcohol]',
    'topics: [general]',
    'source: fixture-source',
    'choices:',
    '  - {label: A, text: First, correct: true}',
    '  - {label: B, text: Second, correct: false, explanation: Reason}',
    '---',
    '## Question',
    `Question for ${qid}?`,
    '## Explanation',
    `Explanation for ${qid}.`,
    '### Reference',
    `Citation for ${qid}.`,
  ].join('\n');
}

describe('complete draft file consumption', () => {
  it.each([0, 1, 2])('rejects reordered block at position %i', (position) => {
    const blocks = ['first', 'middle', 'last'].map((id, index) =>
      index === position
        ? block(id).replace(/qid: (.+)\ntype: recall/, 'type: recall\nqid: $1')
        : block(id),
    );

    expect(() => splitDraftQuestionsFile(blocks.join('\n\n---\n\n'))).toThrow(
      /line \d+.*qid.*first/i,
    );
  });

  it.each(['', ' \r\n ', '# Questions\n\n> Source: synthetic.'])(
    'rejects a file with no question blocks: %j',
    (raw) => {
      expect(() => splitDraftQuestionsFile(raw)).toThrow(/no question blocks/i);
    },
  );

  it('rejects an unframed question before the first valid block', () => {
    const raw = `${block('lost').slice(4)}\n${block('valid')}`;
    expect(() => splitDraftQuestionsFile(raw)).toThrow(/line 1.*preamble/i);
  });

  it('rejects an unframed question after a valid block', () => {
    const raw = `${block('valid')}\n${block('lost').slice(4)}`;
    expect(() => splitDraftQuestionsFile(raw)).toThrow(
      /line \d+.*frontmatter/i,
    );
  });

  it('rejects unclosed frontmatter', () => {
    expect(() =>
      splitDraftQuestionsFile('---\nqid: unfinished\ntype: recall'),
    ).toThrow(/line 1.*unclosed frontmatter/i);
  });

  it('rejects stray material after a question separator', () => {
    expect(() =>
      splitDraftQuestionsFile(`${block('valid')}\n---\nUnconsumed text`),
    ).toThrow(/line \d+.*qid.*first/i);
  });

  it.each(['\n', '\r\n'])(
    'consumes adjacent blocks completely with %j line endings',
    (newline) => {
      const ids = ['first', 'middle', 'last'];
      const raw = ids.map(block).join('\n').replaceAll('\n', newline);
      const parsed = splitDraftQuestionsFile(raw).map(parseDraftQuestionBlock);

      expect(parsed.map((question) => question.frontmatter.qid)).toEqual(ids);
      expect(parsed.map((question) => question.stemMd)).toEqual(
        ids.map((id) => `Question for ${id}?`),
      );
      expect(parsed.map((question) => question.explanationMd)).toEqual(
        ids.map(
          (id) => `Explanation for ${id}.\n### Reference\nCitation for ${id}.`,
        ),
      );
    },
  );

  it.each(['', '---\n'])(
    'accepts the title/source-note preamble with separator %j',
    (separator) => {
      const raw = [
        '# Synthetic questions',
        '',
        '> **Source:** Synthetic.',
        '> **Status:** Fixture.',
        '',
        separator,
        block('first'),
        '---',
        '',
        block('last'),
        '---',
        '',
      ].join('\n');

      expect(
        splitDraftQuestionsFile(raw)
          .map(parseDraftQuestionBlock)
          .map((question) => question.frontmatter.qid),
      ).toEqual(['first', 'last']);
    },
  );
});
