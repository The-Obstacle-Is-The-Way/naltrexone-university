# SLICE-2: Core Question Loop

**Slice ID:** SLICE-2
**Status:** Not Started
**Dependencies:** SLICE-1 (Paywall) must be complete
**Estimated Complexity:** Medium-High (Content pipeline, markdown rendering, question/answer flow)

---

## Overview

This slice implements the fundamental question-answer loop: displaying a question with choices, accepting an answer, recording an attempt, and showing feedback. This is the core learning interaction—everything else builds on this.

**Core Principle:** The question loop must be rock-solid. Every answer creates an `attempts` row. Every piece of markdown is sanitized. No XSS vectors. No data loss.

---

## User Stories

1. As a subscribed user, I can view a question stem rendered as markdown.
2. As a subscribed user, I can see answer choices displayed clearly.
3. As a subscribed user, I can select and submit an answer.
4. As a subscribed user, I see immediate feedback (correct/incorrect) after submitting.
5. As a subscribed user, I can read the explanation after answering.
6. As a subscribed user, I can bookmark a question for later review.

---

## Architecture Decisions (SOLID + Clean Architecture)

### Single Responsibility
- `Markdown.tsx` — Renders markdown only, no business logic
- `questions.actions.ts` — Orchestrates question fetching and answer submission
- `bookmarks.actions.ts` — Bookmark toggle only
- `lib/content/schemas.ts` — Validation schemas only
- `scripts/seed.ts` — Seeding only, no runtime usage

### Open/Closed
- Markdown component accepts configurable sanitize schema
- Question components are composable (stem, choices, feedback as separate units)

### Liskov Substitution
- All question types (easy/medium/hard) render identically through same component

### Dependency Inversion
- Actions depend on DB abstraction
- Components receive data as props, not fetching internally

### Interface Segregation
- `PublicChoice` type excludes `isCorrect` (never sent to client before answer)
- `SubmitAnswerOutput` includes only what UI needs

---

## Test-First Specification (TDD)

### Phase 1: Unit Tests (Write FIRST)

#### File: `lib/content/schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  QuestionFrontmatterSchema,
  ChoiceFrontmatterSchema,
  TagFrontmatterSchema,
  FullQuestionSchema,
} from './schemas';

describe('ChoiceFrontmatterSchema', () => {
  it('accepts valid choice', () => {
    const result = ChoiceFrontmatterSchema.safeParse({
      label: 'A',
      text: 'Some answer text',
      correct: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid label', () => {
    const result = ChoiceFrontmatterSchema.safeParse({
      label: 'X', // Invalid
      text: 'Some text',
      correct: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty text', () => {
    const result = ChoiceFrontmatterSchema.safeParse({
      label: 'A',
      text: '',
      correct: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('TagFrontmatterSchema', () => {
  it('accepts valid kebab-case slug', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'alcohol-withdrawal',
      name: 'Alcohol Withdrawal',
      kind: 'topic',
    });
    expect(result.success).toBe(true);
  });

  it('rejects slug with spaces', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'alcohol withdrawal',
      name: 'Alcohol Withdrawal',
      kind: 'topic',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid kind', () => {
    const result = TagFrontmatterSchema.safeParse({
      slug: 'test',
      name: 'Test',
      kind: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('QuestionFrontmatterSchema', () => {
  const validFrontmatter = {
    slug: 'test-question',
    difficulty: 'medium',
    status: 'published',
    tags: [{ slug: 'opioids', name: 'Opioids', kind: 'substance' }],
    choices: [
      { label: 'A', text: 'First choice', correct: false },
      { label: 'B', text: 'Second choice', correct: true },
      { label: 'C', text: 'Third choice', correct: false },
    ],
  };

  it('accepts valid frontmatter with exactly one correct choice', () => {
    const result = QuestionFrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
  });

  it('rejects zero correct choices', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...validFrontmatter,
      choices: [
        { label: 'A', text: 'First', correct: false },
        { label: 'B', text: 'Second', correct: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple correct choices', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...validFrontmatter,
      choices: [
        { label: 'A', text: 'First', correct: true },
        { label: 'B', text: 'Second', correct: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate labels', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...validFrontmatter,
      choices: [
        { label: 'A', text: 'First', correct: false },
        { label: 'A', text: 'Second', correct: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 choices', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...validFrontmatter,
      choices: [{ label: 'A', text: 'Only one', correct: true }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 6 choices', () => {
    const result = QuestionFrontmatterSchema.safeParse({
      ...validFrontmatter,
      choices: [
        { label: 'A', text: '1', correct: true },
        { label: 'B', text: '2', correct: false },
        { label: 'C', text: '3', correct: false },
        { label: 'D', text: '4', correct: false },
        { label: 'E', text: '5', correct: false },
        { label: 'F', text: '6', correct: false },
        { label: 'G', text: '7', correct: false },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('FullQuestionSchema', () => {
  it('requires non-empty stemMd', () => {
    const result = FullQuestionSchema.safeParse({
      frontmatter: {
        slug: 'test',
        difficulty: 'easy',
        status: 'published',
        tags: [],
        choices: [
          { label: 'A', text: 'Yes', correct: true },
          { label: 'B', text: 'No', correct: false },
        ],
      },
      stemMd: '',
      explanationMd: 'Some explanation',
    });
    expect(result.success).toBe(false);
  });

  it('requires non-empty explanationMd', () => {
    const result = FullQuestionSchema.safeParse({
      frontmatter: {
        slug: 'test',
        difficulty: 'easy',
        status: 'published',
        tags: [],
        choices: [
          { label: 'A', text: 'Yes', correct: true },
          { label: 'B', text: 'No', correct: false },
        ],
      },
      stemMd: 'A question?',
      explanationMd: '',
    });
    expect(result.success).toBe(false);
  });
});
```

#### File: `lib/markdown.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeConfig } from './markdown';

describe('sanitizeConfig', () => {
  it('allows safe tags', () => {
    expect(sanitizeConfig.tagNames).toContain('p');
    expect(sanitizeConfig.tagNames).toContain('strong');
    expect(sanitizeConfig.tagNames).toContain('em');
    expect(sanitizeConfig.tagNames).toContain('code');
    expect(sanitizeConfig.tagNames).toContain('pre');
    expect(sanitizeConfig.tagNames).toContain('table');
  });

  it('does not allow script tags', () => {
    expect(sanitizeConfig.tagNames).not.toContain('script');
  });

  it('does not allow iframe tags', () => {
    expect(sanitizeConfig.tagNames).not.toContain('iframe');
  });

  it('allows href on anchor tags', () => {
    expect(sanitizeConfig.attributes?.a).toContain('href');
  });
});
```

#### File: `components/markdown/Markdown.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown component', () => {
  it('renders plain text', () => {
    render(<Markdown content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<Markdown content="**bold text**" />);
    expect(screen.getByText('bold text').tagName).toBe('STRONG');
  });

  it('renders code blocks', () => {
    render(<Markdown content="`inline code`" />);
    expect(screen.getByText('inline code').tagName).toBe('CODE');
  });

  it('strips script tags', () => {
    render(<Markdown content="<script>alert('xss')</script>Safe text" />);
    expect(screen.queryByText("alert('xss')")).not.toBeInTheDocument();
    expect(screen.getByText('Safe text')).toBeInTheDocument();
  });

  it('renders tables', () => {
    const tableMarkdown = `
| Header |
| ------ |
| Cell   |
`;
    render(<Markdown content={tableMarkdown} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders links with proper attributes', () => {
    render(<Markdown content="[Link](https://example.com)" />);
    const link = screen.getByRole('link', { name: 'Link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });
});
```

### Phase 2: Integration Tests (Write SECOND)

#### File: `tests/integration/questions.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import {
  users,
  questions,
  choices,
  tags,
  questionTags,
  attempts,
  bookmarks,
  stripeSubscriptions,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';

describe('Questions DB Integration', () => {
  let testUserId: string;
  let testQuestionId: string;
  let correctChoiceId: string;
  let incorrectChoiceId: string;

  beforeAll(async () => {
    // Create test user with active subscription
    const [user] = await db.insert(users).values({
      clerkUserId: 'test_clerk_questions',
      email: 'questions@test.com',
    }).returning();
    testUserId = user.id;

    // Create subscription for entitlement
    await db.insert(stripeSubscriptions).values({
      userId: testUserId,
      stripeSubscriptionId: 'sub_test_questions',
      status: 'active',
      priceId: 'price_test',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Create test question
    const [question] = await db.insert(questions).values({
      slug: 'test-question-integration',
      stemMd: 'What is the answer?',
      explanationMd: 'The answer is B because...',
      difficulty: 'medium',
      status: 'published',
    }).returning();
    testQuestionId = question.id;

    // Create choices
    const [choiceA] = await db.insert(choices).values({
      questionId: testQuestionId,
      label: 'A',
      textMd: 'Wrong answer',
      isCorrect: false,
      sortOrder: 1,
    }).returning();
    incorrectChoiceId = choiceA.id;

    const [choiceB] = await db.insert(choices).values({
      questionId: testQuestionId,
      label: 'B',
      textMd: 'Correct answer',
      isCorrect: true,
      sortOrder: 2,
    }).returning();
    correctChoiceId = choiceB.id;
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(bookmarks).where(eq(bookmarks.userId, testUserId));
    await db.delete(choices).where(eq(choices.questionId, testQuestionId));
    await db.delete(questions).where(eq(questions.id, testQuestionId));
    await db.delete(stripeSubscriptions).where(eq(stripeSubscriptions.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(async () => {
    // Clear attempts between tests
    await db.delete(attempts).where(eq(attempts.userId, testUserId));
    await db.delete(bookmarks).where(eq(bookmarks.userId, testUserId));
  });

  describe('attempts', () => {
    it('creates attempt with correct grading', async () => {
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: testQuestionId,
        selectedChoiceId: correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 30,
      });

      const [attempt] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      expect(attempt.isCorrect).toBe(true);
      expect(attempt.selectedChoiceId).toBe(correctChoiceId);
    });

    it('creates attempt with incorrect grading', async () => {
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: testQuestionId,
        selectedChoiceId: incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 45,
      });

      const [attempt] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      expect(attempt.isCorrect).toBe(false);
    });

    it('allows multiple attempts on same question', async () => {
      await db.insert(attempts).values({
        userId: testUserId,
        questionId: testQuestionId,
        selectedChoiceId: incorrectChoiceId,
        isCorrect: false,
        timeSpentSeconds: 20,
      });

      await db.insert(attempts).values({
        userId: testUserId,
        questionId: testQuestionId,
        selectedChoiceId: correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 25,
      });

      const userAttempts = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      expect(userAttempts).toHaveLength(2);
    });

    it('records answeredAt timestamp', async () => {
      const before = new Date();

      await db.insert(attempts).values({
        userId: testUserId,
        questionId: testQuestionId,
        selectedChoiceId: correctChoiceId,
        isCorrect: true,
        timeSpentSeconds: 0,
      });

      const after = new Date();

      const [attempt] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.userId, testUserId));

      expect(attempt.answeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(attempt.answeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('bookmarks', () => {
    it('creates bookmark with composite PK', async () => {
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: testQuestionId,
      });

      const [bookmark] = await db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, testUserId),
            eq(bookmarks.questionId, testQuestionId)
          )
        );

      expect(bookmark).toBeDefined();
      expect(bookmark.userId).toBe(testUserId);
      expect(bookmark.questionId).toBe(testQuestionId);
    });

    it('prevents duplicate bookmarks', async () => {
      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: testQuestionId,
      });

      await expect(
        db.insert(bookmarks).values({
          userId: testUserId,
          questionId: testQuestionId,
        })
      ).rejects.toThrow();
    });

    it('allows same question bookmarked by different users', async () => {
      // Create second user
      const [user2] = await db.insert(users).values({
        clerkUserId: 'test_clerk_user2',
        email: 'user2@test.com',
      }).returning();

      await db.insert(bookmarks).values({
        userId: testUserId,
        questionId: testQuestionId,
      });

      await db.insert(bookmarks).values({
        userId: user2.id,
        questionId: testQuestionId,
      });

      const allBookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.questionId, testQuestionId));

      expect(allBookmarks).toHaveLength(2);

      // Cleanup
      await db.delete(bookmarks).where(eq(bookmarks.userId, user2.id));
      await db.delete(users).where(eq(users.id, user2.id));
    });
  });

  describe('questions and choices', () => {
    it('fetches question with choices', async () => {
      const [question] = await db
        .select()
        .from(questions)
        .where(eq(questions.id, testQuestionId));

      const questionChoices = await db
        .select()
        .from(choices)
        .where(eq(choices.questionId, testQuestionId))
        .orderBy(choices.sortOrder);

      expect(question.stemMd).toBe('What is the answer?');
      expect(questionChoices).toHaveLength(2);
      expect(questionChoices[0].label).toBe('A');
      expect(questionChoices[1].label).toBe('B');
    });

    it('identifies correct choice', async () => {
      const [correct] = await db
        .select()
        .from(choices)
        .where(
          and(
            eq(choices.questionId, testQuestionId),
            eq(choices.isCorrect, true)
          )
        );

      expect(correct.label).toBe('B');
    });

    it('only returns published questions for practice', async () => {
      // Create draft question
      const [draft] = await db.insert(questions).values({
        slug: 'draft-question',
        stemMd: 'Draft question',
        explanationMd: 'Draft explanation',
        difficulty: 'easy',
        status: 'draft',
      }).returning();

      const publishedQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.status, 'published'));

      const slugs = publishedQuestions.map(q => q.slug);
      expect(slugs).toContain('test-question-integration');
      expect(slugs).not.toContain('draft-question');

      // Cleanup
      await db.delete(questions).where(eq(questions.id, draft.id));
    });
  });
});
```

### Phase 3: E2E Tests (Write THIRD)

#### File: `tests/e2e/practice.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Practice Question Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Auth setup - user must be subscribed
    // This is handled by global setup
  });

  test('displays question stem and choices', async ({ page }) => {
    await page.goto('/app/practice');

    // Should see question stem
    await expect(page.locator('[data-testid="question-stem"]')).toBeVisible();

    // Should see at least 2 choices
    const choices = page.locator('[data-testid="choice-option"]');
    await expect(choices).toHaveCount({ minimum: 2 });
  });

  test('can select a choice', async ({ page }) => {
    await page.goto('/app/practice');

    // Click first choice
    const firstChoice = page.locator('[data-testid="choice-option"]').first();
    await firstChoice.click();

    // Should be selected (visual feedback)
    await expect(firstChoice).toHaveAttribute('data-selected', 'true');
  });

  test('can submit answer and see feedback', async ({ page }) => {
    await page.goto('/app/practice');

    // Select a choice
    await page.locator('[data-testid="choice-option"]').first().click();

    // Submit
    await page.getByRole('button', { name: /submit/i }).click();

    // Should see feedback
    await expect(page.locator('[data-testid="answer-feedback"]')).toBeVisible();
  });

  test('shows explanation after submitting', async ({ page }) => {
    await page.goto('/app/practice');

    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // Should see explanation
    await expect(page.locator('[data-testid="explanation"]')).toBeVisible();
  });

  test('shows correct answer indicator', async ({ page }) => {
    await page.goto('/app/practice');

    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();

    // One choice should be marked as correct
    await expect(page.locator('[data-testid="choice-option"][data-correct="true"]')).toHaveCount(1);
  });

  test('can bookmark a question', async ({ page }) => {
    await page.goto('/app/practice');

    // Click bookmark button
    const bookmarkButton = page.getByRole('button', { name: /bookmark/i });
    await bookmarkButton.click();

    // Should toggle to bookmarked state
    await expect(bookmarkButton).toHaveAttribute('data-bookmarked', 'true');
  });

  test('can proceed to next question', async ({ page }) => {
    await page.goto('/app/practice');

    // Get first question stem
    const firstStem = await page.locator('[data-testid="question-stem"]').textContent();

    // Answer and proceed
    await page.locator('[data-testid="choice-option"]').first().click();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.getByRole('button', { name: /next/i }).click();

    // Should show different question (or "no more questions")
    const secondStem = await page.locator('[data-testid="question-stem"]').textContent();
    expect(secondStem).not.toBe(firstStem);
  });
});
```

---

## Implementation Checklist

### Step 1: Create Content Schemas

**File:** `lib/content/schemas.ts`

```typescript
import { z } from 'zod';

export const ChoiceFrontmatterSchema = z.object({
  label: z.string().regex(/^[A-E]$/, 'label must be A-E'),
  text: z.string().min(1, 'choice text is required'),
  correct: z.boolean(),
}).strict();

export const TagFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  name: z.string().min(1),
  kind: z.enum(['domain', 'topic', 'substance', 'treatment', 'diagnosis']),
}).strict();

export const QuestionFrontmatterSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(TagFrontmatterSchema).max(50),
  choices: z.array(ChoiceFrontmatterSchema).min(2).max(6),
}).strict().superRefine((val, ctx) => {
  const correctCount = val.choices.filter((c) => c.correct).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choices must contain exactly 1 correct=true',
      path: ['choices'],
    });
  }
  const labelSet = new Set(val.choices.map((c) => c.label));
  if (labelSet.size !== val.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'choice labels must be unique',
      path: ['choices'],
    });
  }
});

export const FullQuestionSchema = z.object({
  frontmatter: QuestionFrontmatterSchema,
  stemMd: z.string().min(1, 'stem is required'),
  explanationMd: z.string().min(1, 'explanation is required'),
}).strict();

export type ChoiceFrontmatter = z.infer<typeof ChoiceFrontmatterSchema>;
export type TagFrontmatter = z.infer<typeof TagFrontmatterSchema>;
export type QuestionFrontmatter = z.infer<typeof QuestionFrontmatterSchema>;
export type FullQuestion = z.infer<typeof FullQuestionSchema>;
```

### Step 2: Create Markdown Component

**File:** `lib/markdown.ts`

```typescript
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

// Sanitize config that allows GFM tables, code, links but no scripts/iframes
export const sanitizeConfig: RehypeSanitizeOptions = {
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote',
    'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'del', 's',
    'a',
    'img',
    'sup', 'sub',
  ],
  attributes: {
    '*': ['className'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['className'], // for syntax highlighting
    th: ['align'],
    td: ['align'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};
```

**File:** `components/markdown/Markdown.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { sanitizeConfig } from '@/lib/markdown';

type Props = {
  content: string;
  className?: string;
};

export function Markdown({ content, className }: Props) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, sanitizeConfig]]}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### Step 3: Create Question Components

**File:** `components/question/QuestionCard.tsx`

```typescript
'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { ChoiceRadioGroup } from './ChoiceRadioGroup';
import { BookmarkButton } from './BookmarkButton';

export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
};

type Props = {
  questionId: string;
  stemMd: string;
  choices: PublicChoice[];
  selectedChoiceId: string | null;
  onSelectChoice: (choiceId: string) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  disabled?: boolean;
};

export function QuestionCard({
  questionId,
  stemMd,
  choices,
  selectedChoiceId,
  onSelectChoice,
  isBookmarked,
  onToggleBookmark,
  disabled,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div
          data-testid="question-stem"
          className="prose prose-sm max-w-none"
        >
          <Markdown content={stemMd} />
        </div>
        <BookmarkButton
          isBookmarked={isBookmarked}
          onClick={onToggleBookmark}
        />
      </div>

      <ChoiceRadioGroup
        choices={choices}
        selectedChoiceId={selectedChoiceId}
        onSelect={onSelectChoice}
        disabled={disabled}
      />
    </div>
  );
}
```

**File:** `components/question/ChoiceRadioGroup.tsx`

```typescript
'use client';

import { Markdown } from '@/components/markdown/Markdown';
import type { PublicChoice } from './QuestionCard';

type Props = {
  choices: PublicChoice[];
  selectedChoiceId: string | null;
  onSelect: (choiceId: string) => void;
  disabled?: boolean;
  correctChoiceId?: string; // Shown after answer
  showResults?: boolean;
};

export function ChoiceRadioGroup({
  choices,
  selectedChoiceId,
  onSelect,
  disabled,
  correctChoiceId,
  showResults,
}: Props) {
  const sortedChoices = [...choices].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3" role="radiogroup">
      {sortedChoices.map((choice) => {
        const isSelected = selectedChoiceId === choice.id;
        const isCorrect = correctChoiceId === choice.id;
        const wasSelectedIncorrect = showResults && isSelected && !isCorrect;

        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-testid="choice-option"
            data-selected={isSelected}
            data-correct={showResults ? isCorrect : undefined}
            onClick={() => !disabled && onSelect(choice.id)}
            disabled={disabled}
            className={`
              w-full p-4 rounded-lg border text-left transition-colors
              ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
              ${showResults && isCorrect ? 'border-green-500 bg-green-50' : ''}
              ${wasSelectedIncorrect ? 'border-red-500 bg-red-50' : ''}
              ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
            `}
          >
            <div className="flex gap-3">
              <span className="font-semibold text-gray-500">{choice.label}.</span>
              <div className="prose prose-sm">
                <Markdown content={choice.textMd} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

**File:** `components/question/AnswerFeedback.tsx`

```typescript
type Props = {
  isCorrect: boolean;
  correctLabel: string;
};

export function AnswerFeedback({ isCorrect, correctLabel }: Props) {
  return (
    <div
      data-testid="answer-feedback"
      className={`p-4 rounded-lg ${
        isCorrect
          ? 'bg-green-100 border border-green-300 text-green-800'
          : 'bg-red-100 border border-red-300 text-red-800'
      }`}
    >
      {isCorrect ? (
        <p className="font-medium">Correct!</p>
      ) : (
        <p className="font-medium">
          Incorrect. The correct answer is {correctLabel}.
        </p>
      )}
    </div>
  );
}
```

**File:** `components/question/ExplanationPanel.tsx`

```typescript
import { Markdown } from '@/components/markdown/Markdown';

type Props = {
  explanationMd: string;
};

export function ExplanationPanel({ explanationMd }: Props) {
  return (
    <div
      data-testid="explanation"
      className="p-4 bg-gray-50 rounded-lg border"
    >
      <h3 className="font-semibold mb-2">Explanation</h3>
      <div className="prose prose-sm">
        <Markdown content={explanationMd} />
      </div>
    </div>
  );
}
```

**File:** `components/question/BookmarkButton.tsx`

```typescript
'use client';

import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  isBookmarked: boolean;
  onClick: () => void;
};

export function BookmarkButton({ isBookmarked, onClick }: Props) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      data-bookmarked={isBookmarked}
    >
      <Bookmark
        className={isBookmarked ? 'fill-current text-yellow-500' : 'text-gray-400'}
      />
    </Button>
  );
}
```

### Step 4: Implement Question Actions

**File:** `app/(app)/app/_actions/questions.actions.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, questions, choices, attempts } from '@/db/schema';
import { eq, and, desc, notInArray, sql } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';
import { type ActionResult, success, failure } from './actionResult';

// Input schemas
const GetNextQuestionInput = z.object({
  tagSlugs: z.array(z.string().min(1)).max(50).default([]),
  difficulties: z.array(z.enum(['easy', 'medium', 'hard'])).max(3).default([]),
}).strict();

const SubmitAnswerInput = z.object({
  questionId: z.string().uuid(),
  choiceId: z.string().uuid(),
}).strict();

// Output types
export type PublicChoice = {
  id: string;
  label: string;
  textMd: string;
  sortOrder: number;
};

export type NextQuestion = {
  questionId: string;
  slug: string;
  stemMd: string;
  difficulty: 'easy' | 'medium' | 'hard';
  choices: PublicChoice[];
};

export type SubmitAnswerOutput = {
  attemptId: string;
  isCorrect: boolean;
  correctChoiceId: string;
  explanationMd: string;
};

// Actions
export async function getNextQuestion(
  input: z.infer<typeof GetNextQuestionInput> = {}
): Promise<ActionResult<NextQuestion | null>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = GetNextQuestionInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input');
  }

  try {
    // Get internal user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('UNAUTHENTICATED', 'User not found');
    }

    // Check entitlement
    const isEntitled = await checkUserEntitlement(user.id);
    if (!isEntitled) {
      return failure('UNSUBSCRIBED', 'Active subscription required');
    }

    // Get IDs of questions user has already attempted
    const attemptedQuestionIds = await db
      .selectDistinct({ questionId: attempts.questionId })
      .from(attempts)
      .where(eq(attempts.userId, user.id));

    const attemptedIds = attemptedQuestionIds.map(a => a.questionId);

    // Find next question (prefer unanswered)
    let questionQuery = db
      .select()
      .from(questions)
      .where(eq(questions.status, 'published'));

    // Apply difficulty filter if specified
    if (parsed.data.difficulties.length > 0) {
      questionQuery = questionQuery.where(
        sql`${questions.difficulty} = ANY(${parsed.data.difficulties})`
      );
    }

    // Prefer unanswered questions
    if (attemptedIds.length > 0) {
      questionQuery = questionQuery.where(
        notInArray(questions.id, attemptedIds)
      );
    }

    const [question] = await questionQuery.limit(1);

    // If all answered, get oldest attempted
    if (!question) {
      const [oldestAttempted] = await db
        .select({ question: questions })
        .from(questions)
        .innerJoin(
          attempts,
          and(
            eq(attempts.questionId, questions.id),
            eq(attempts.userId, user.id)
          )
        )
        .where(eq(questions.status, 'published'))
        .orderBy(attempts.answeredAt)
        .limit(1);

      if (!oldestAttempted) {
        return success(null); // No questions available
      }

      return await buildQuestionResponse(oldestAttempted.question);
    }

    return await buildQuestionResponse(question);
  } catch (error) {
    console.error('getNextQuestion error:', error);
    return failure('INTERNAL_ERROR', 'Failed to fetch question');
  }
}

async function buildQuestionResponse(
  question: typeof questions.$inferSelect
): Promise<ActionResult<NextQuestion>> {
  const questionChoices = await db
    .select({
      id: choices.id,
      label: choices.label,
      textMd: choices.textMd,
      sortOrder: choices.sortOrder,
    })
    .from(choices)
    .where(eq(choices.questionId, question.id))
    .orderBy(choices.sortOrder);

  return success({
    questionId: question.id,
    slug: question.slug,
    stemMd: question.stemMd,
    difficulty: question.difficulty,
    choices: questionChoices,
  });
}

export async function submitAnswer(
  input: z.infer<typeof SubmitAnswerInput>
): Promise<ActionResult<SubmitAnswerOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = SubmitAnswerInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input');
  }

  try {
    // Get internal user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('UNAUTHENTICATED', 'User not found');
    }

    // Check entitlement
    const isEntitled = await checkUserEntitlement(user.id);
    if (!isEntitled) {
      return failure('UNSUBSCRIBED', 'Active subscription required');
    }

    // Validate question exists and is published
    const [question] = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.id, parsed.data.questionId),
          eq(questions.status, 'published')
        )
      );

    if (!question) {
      return failure('NOT_FOUND', 'Question not found');
    }

    // Validate choice belongs to question
    const [selectedChoice] = await db
      .select()
      .from(choices)
      .where(
        and(
          eq(choices.id, parsed.data.choiceId),
          eq(choices.questionId, question.id)
        )
      );

    if (!selectedChoice) {
      return failure('NOT_FOUND', 'Choice not found');
    }

    // Get correct choice
    const [correctChoice] = await db
      .select()
      .from(choices)
      .where(
        and(
          eq(choices.questionId, question.id),
          eq(choices.isCorrect, true)
        )
      );

    if (!correctChoice) {
      return failure('INTERNAL_ERROR', 'Question has no correct answer');
    }

    // Record attempt
    const isCorrect = selectedChoice.id === correctChoice.id;

    const [attempt] = await db.insert(attempts).values({
      userId: user.id,
      questionId: question.id,
      selectedChoiceId: selectedChoice.id,
      isCorrect,
      timeSpentSeconds: 0, // MVP: not tracking time
    }).returning();

    return success({
      attemptId: attempt.id,
      isCorrect,
      correctChoiceId: correctChoice.id,
      explanationMd: question.explanationMd,
    });
  } catch (error) {
    console.error('submitAnswer error:', error);
    return failure('INTERNAL_ERROR', 'Failed to submit answer');
  }
}
```

### Step 5: Implement Bookmark Actions

**File:** `app/(app)/app/_actions/bookmarks.actions.ts`

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users, questions, bookmarks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { checkUserEntitlement } from '@/lib/subscription';
import { type ActionResult, success, failure } from './actionResult';

const ToggleBookmarkInput = z.object({
  questionId: z.string().uuid(),
}).strict();

export type ToggleBookmarkOutput = {
  bookmarked: boolean;
};

export async function toggleBookmark(
  input: z.infer<typeof ToggleBookmarkInput>
): Promise<ActionResult<ToggleBookmarkOutput>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  const parsed = ToggleBookmarkInput.safeParse(input);
  if (!parsed.success) {
    return failure('VALIDATION_ERROR', 'Invalid input');
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return failure('UNAUTHENTICATED', 'User not found');
    }

    const isEntitled = await checkUserEntitlement(user.id);
    if (!isEntitled) {
      return failure('UNSUBSCRIBED', 'Active subscription required');
    }

    // Validate question exists and is published
    const [question] = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.id, parsed.data.questionId),
          eq(questions.status, 'published')
        )
      );

    if (!question) {
      return failure('NOT_FOUND', 'Question not found');
    }

    // Check if already bookmarked
    const [existing] = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, user.id),
          eq(bookmarks.questionId, question.id)
        )
      );

    if (existing) {
      // Remove bookmark
      await db.delete(bookmarks).where(
        and(
          eq(bookmarks.userId, user.id),
          eq(bookmarks.questionId, question.id)
        )
      );
      return success({ bookmarked: false });
    } else {
      // Add bookmark
      await db.insert(bookmarks).values({
        userId: user.id,
        questionId: question.id,
      });
      return success({ bookmarked: true });
    }
  } catch (error) {
    console.error('toggleBookmark error:', error);
    return failure('INTERNAL_ERROR', 'Failed to toggle bookmark');
  }
}

export async function isBookmarked(
  questionId: string
): Promise<ActionResult<boolean>> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return failure('UNAUTHENTICATED', 'You must be signed in');
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));

    if (!user) {
      return success(false);
    }

    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, user.id),
          eq(bookmarks.questionId, questionId)
        )
      );

    return success(!!bookmark);
  } catch (error) {
    console.error('isBookmarked error:', error);
    return failure('INTERNAL_ERROR', 'Failed to check bookmark');
  }
}
```

### Step 6: Create Seed Script

**File:** `scripts/seed.ts`

See master_spec.md Section 5.5 for full implementation. Must:
- Parse MDX files from `/content/questions/**/*.mdx`
- Validate with Zod schemas
- Upsert questions, choices, tags idempotently
- Use content hash for change detection

### Step 7: Create Placeholder Questions

Create 10 MDX files in `/content/questions/general/` following the format in master_spec.md Section 5.3.

---

## Quality Gates (Must Pass)

```bash
# 1. Type check
pnpm tsc --noEmit

# 2. Lint and format
pnpm biome check .

# 3. Unit tests
pnpm test lib/content/schemas.test.ts lib/markdown.test.ts components/markdown/Markdown.test.tsx

# 4. Integration tests
pnpm test:integration tests/integration/questions.integration.test.ts

# 5. E2E tests
pnpm test:e2e tests/e2e/practice.spec.ts

# 6. Seed runs successfully
pnpm db:seed
```

---

## Definition of Done

- [ ] All unit tests pass (schemas, markdown sanitization)
- [ ] All integration tests pass (DB operations)
- [ ] All E2E tests pass (full flow)
- [ ] Seed script runs idempotently
- [ ] 10 placeholder questions exist in DB
- [ ] Markdown renders safely (XSS protection verified)
- [ ] Attempts are recorded per submission
- [ ] Bookmarks toggle correctly
- [ ] All changes committed with atomic commits

---

## Files Checklist

### Create
- [ ] `lib/content/schemas.ts`
- [ ] `lib/content/schemas.test.ts`
- [ ] `lib/markdown.ts`
- [ ] `lib/markdown.test.ts`
- [ ] `components/markdown/Markdown.tsx`
- [ ] `components/markdown/Markdown.test.tsx`
- [ ] `components/question/QuestionCard.tsx`
- [ ] `components/question/ChoiceRadioGroup.tsx`
- [ ] `components/question/AnswerFeedback.tsx`
- [ ] `components/question/ExplanationPanel.tsx`
- [ ] `components/question/BookmarkButton.tsx`
- [ ] `app/(app)/app/_actions/questions.actions.ts`
- [ ] `app/(app)/app/_actions/bookmarks.actions.ts`
- [ ] `app/(app)/app/practice/page.tsx`
- [ ] `scripts/seed.ts`
- [ ] `content/questions/general/*.mdx` (10 files)
- [ ] `tests/integration/questions.integration.test.ts`
- [ ] `tests/e2e/practice.spec.ts`

---

## Anti-Patterns to Avoid

1. **NO raw HTML rendering** - Always use rehype-sanitize
2. **NO client-side grading** - Server always determines correctness
3. **NO leaking isCorrect before answer** - PublicChoice excludes it
4. **NO skipping Zod validation** - Every input validated
5. **NO empty explanations** - Schema enforces non-empty
