import { describe, expect, it } from 'vitest';
import { validateSeedQuestionTags } from './seed/tag-manager';

describe('validateSeedQuestionTags', () => {
  it('rejects domain tags before minimum tag count checks', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-000',
        tags: [
          {
            slug: 'general',
            name: 'General',
            kind: 'domain',
          },
        ],
      }),
    ).toThrow(/domain/i);
  });

  it('rejects domain tags during seed validation', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-001',
        tags: [
          {
            slug: 'pharmacology-neuroscience',
            name: 'Pharmacology & Neuroscience',
            kind: 'domain',
          },
          {
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
          {
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
        ],
      }),
    ).toThrow(/domain/i);
  });

  it('rejects unknown canonical slugs during seed validation', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-002',
        tags: [
          {
            slug: 'pharmacology',
            name: 'Pharmacology',
            kind: 'topic',
          },
          {
            slug: 'opioids',
            name: 'Opioids',
            kind: 'substance',
          },
        ],
      }),
    ).toThrow(/canonical/i);
  });

  it('rejects questions missing topic tags', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-003',
        tags: [
          {
            slug: 'naltrexone',
            name: 'Naltrexone',
            kind: 'treatment',
          },
        ],
      }),
    ).toThrow(/at least one topic/i);
  });

  it('rejects questions missing substance tags', () => {
    expect(() =>
      validateSeedQuestionTags({
        slug: 'demo-004',
        tags: [
          {
            slug: 'screening-diagnosis',
            name: 'Screening & Diagnosis',
            kind: 'topic',
          },
        ],
      }),
    ).toThrow(/at least one substance/i);
  });
});
