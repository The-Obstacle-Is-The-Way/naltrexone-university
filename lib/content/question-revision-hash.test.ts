import { describe, expect, it } from 'vitest';
import { NobleSha256Hasher } from '@/src/adapters/gateways/noble-sha256-hasher';
import {
  canonicalQuestionRevisionJson,
  QUESTION_REVISION_CANONICALIZATION,
  type QuestionRevisionFields,
  questionRevisionContentHash,
} from './question-revision-hash';

const hasher = new NobleSha256Hasher();

// The expected text and hashes come from an independent implementation,
// Python's standard library, so the TypeScript form is checked against an
// outside oracle rather than against itself:
//   s = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
//   hashlib.sha256(s.encode("utf-8")).hexdigest()
const basic: QuestionRevisionFields = {
  stemMd: 'A 34-year-old man asks about naltrexone.',
  explanationMd: 'Naltrexone is an opioid antagonist.',
  referenceMd: null,
  difficulty: 'easy',
  choices: [
    {
      label: 'A',
      sortOrder: 1,
      textMd: 'Agonist',
      isCorrect: false,
      explanationMd: null,
    },
    {
      label: 'B',
      sortOrder: 2,
      textMd: 'Antagonist',
      isCorrect: true,
      explanationMd: 'It blocks mu receptors.',
    },
  ],
};

const tricky: QuestionRevisionFields = {
  stemMd:
    'Quote " backslash \\ newline\ntab\tcontrol\u0001 é 😀 line sep </script> a/b',
  explanationMd: '**Bold** and `code`',
  referenceMd: 'Ref "x"',
  difficulty: 'hard',
  choices: [
    {
      label: 'A',
      sortOrder: 1,
      textMd: '\u001f unit separator',
      isCorrect: true,
      explanationMd: '\r\nCRLF\b\f',
    },
  ],
};

describe('stored-fields-json-v1', () => {
  it('names its canonical form', () => {
    expect(QUESTION_REVISION_CANONICALIZATION).toBe('stored-fields-json-v1');
  });

  it('serializes the stored fields as sorted-key JSON without whitespace', () => {
    expect(canonicalQuestionRevisionJson(basic)).toBe(
      '{"choices":[{"explanation_md":null,"is_correct":false,"label":"A","sort_order":1,"text_md":"Agonist"},{"explanation_md":"It blocks mu receptors.","is_correct":true,"label":"B","sort_order":2,"text_md":"Antagonist"}],"difficulty":"easy","explanation_md":"Naltrexone is an opioid antagonist.","reference_md":null,"stem_md":"A 34-year-old man asks about naltrexone."}',
    );
  });

  it('escapes strings exactly as the oracle does', () => {
    expect(canonicalQuestionRevisionJson(tricky)).toBe(
      '{"choices":[{"explanation_md":"\\r\\nCRLF\\b\\f","is_correct":true,"label":"A","sort_order":1,"text_md":"\\u001f unit separator"}],"difficulty":"hard","explanation_md":"**Bold** and `code`","reference_md":"Ref \\"x\\"","stem_md":"Quote \\" backslash \\\\ newline\\ntab\\tcontrol\\u0001 é 😀 line sep </script> a/b"}',
    );
  });

  it.each([
    [
      'basic',
      basic,
      '0f4c10fd6411ac9f32ea530a958dcc57e7346d5d31e56caa3d30ba1e9c2d92f0',
    ],
    [
      'tricky',
      tricky,
      'dfeae8d51beb186a768899aa921814627342019d4b2477ba3a707f0c94fbb565',
    ],
  ])('hashes the %s vector to the oracle digest', (_name, fields, digest) => {
    expect(questionRevisionContentHash(fields, hasher)).toBe(digest);
  });

  it('orders choices by sort order, whatever order they arrive in', () => {
    const reversed = { ...basic, choices: [...basic.choices].reverse() };

    expect(canonicalQuestionRevisionJson(reversed)).toBe(
      canonicalQuestionRevisionJson(basic),
    );
  });

  it.each([
    ['stem', { stemMd: 'Changed.' }],
    ['explanation', { explanationMd: 'Changed.' }],
    ['reference', { referenceMd: 'Added.' }],
    ['difficulty', { difficulty: 'medium' as const }],
  ])('changes the hash when the %s changes', (_field, change) => {
    expect(
      questionRevisionContentHash({ ...basic, ...change }, hasher),
    ).not.toBe(questionRevisionContentHash(basic, hasher));
  });

  it.each([
    ['text', { textMd: 'Partial agonist' }],
    ['correctness', { isCorrect: true }],
    ['explanation', { explanationMd: 'Now explained.' }],
    ['label', { label: 'C' }],
  ])("changes the hash when a choice's %s changes", (_field, change) => {
    const [first, second] = basic.choices;
    if (!first || !second) throw new Error('fixture has two choices');
    const changed = { ...basic, choices: [{ ...first, ...change }, second] };

    expect(questionRevisionContentHash(changed, hasher)).not.toBe(
      questionRevisionContentHash(basic, hasher),
    );
  });
});
