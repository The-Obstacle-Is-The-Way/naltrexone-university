// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_QUESTION_FEEDBACK_COMMENT_LENGTH } from '@/src/adapters/shared/validation-limits';

type QuestionReportDialogModule = typeof import('./question-report-dialog');

let QuestionReportDialog: QuestionReportDialogModule['QuestionReportDialog'];
let QuestionReportDialogForm: QuestionReportDialogModule['QuestionReportDialogForm'];
let Dialog: typeof import('@/components/ui/dialog').Dialog;

beforeAll(async () => {
  ({ QuestionReportDialog, QuestionReportDialogForm } = await import(
    './question-report-dialog'
  ));
  ({ Dialog } = await import('@/components/ui/dialog'));
});

function renderDialog(
  overrides: Partial<Parameters<typeof QuestionReportDialog>[0]> = {},
) {
  const html = renderToStaticMarkup(
    <QuestionReportDialog
      open={false}
      onOpenChange={() => undefined}
      submitReport={async () => true}
      {...overrides}
    />,
  );

  return {
    html,
    doc: new DOMParser().parseFromString(html, 'text/html'),
  };
}

function renderForm(
  overrides: Partial<Parameters<typeof QuestionReportDialogForm>[0]> = {},
) {
  const html = renderToStaticMarkup(
    <Dialog open>
      <QuestionReportDialogForm
        category={null}
        comment=""
        validationError={null}
        isSubmitting={false}
        onCancel={() => undefined}
        onCategoryChange={() => undefined}
        onCommentChange={() => undefined}
        onSubmit={() => undefined}
        {...overrides}
      />
    </Dialog>,
  );

  return {
    html,
    doc: new DOMParser().parseFromString(html, 'text/html'),
  };
}

describe('QuestionReportDialog', () => {
  it('renders the Give feedback trigger as a Button sibling for review action bars', () => {
    const { doc } = renderDialog();
    const trigger = doc.querySelector('button');

    expect(trigger?.getAttribute('data-slot')).toBe('dialog-trigger');
    expect(trigger?.getAttribute('data-variant')).toBe('outline');
    expect(trigger?.getAttribute('class')).toContain('rounded-full');
    expect(trigger?.textContent?.trim()).toBe('Give feedback');
  });

  it('renders the modal title, description, category radios, textarea, and footer actions', () => {
    const { html, doc } = renderForm();
    const title = doc.querySelector('[data-slot="dialog-title"]');
    const description = doc.querySelector('[data-slot="dialog-description"]');
    const legend = doc.querySelector('legend');
    const radios = Array.from(doc.querySelectorAll('input[type="radio"]'));
    const firstCategoryLabel = radios[0]?.closest('label');
    const textarea = doc.querySelector('[data-slot="textarea"]');
    const counter = doc.querySelector(
      '[data-testid="question-report-counter"]',
    );

    expect(title?.textContent?.trim()).toBe('Give feedback');
    expect(description?.textContent).toContain(
      "This goes to our medical editors and won't affect your score.",
    );
    expect(legend?.textContent?.trim()).toBe("What's this about?");
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'incorrect_answer',
      'ambiguous_wording',
      'typo_formatting',
      'outdated_reference',
      'other',
    ]);
    expect(radios.every((radio) => radio.classList.contains('sr-only'))).toBe(
      true,
    );
    expect(firstCategoryLabel?.getAttribute('class')).toContain(
      'focus-within:ring-ring/50',
    );
    expect(firstCategoryLabel?.getAttribute('class')).toContain(
      'focus-within:ring-[3px]',
    );
    expect(firstCategoryLabel?.getAttribute('class')).not.toContain(
      'ring-focus-within',
    );
    expect(html).toContain('Add details (optional)');
    expect(textarea?.getAttribute('name')).toBe('comment');
    expect(textarea?.getAttribute('autoComplete')).toBe('off');
    expect(textarea?.getAttribute('maxLength')).toBe(
      String(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH),
    );
    expect(counter?.getAttribute('aria-live')).toBe('polite');
    expect(counter?.textContent?.trim()).toBe('0 / 2000');
    expect(html).toContain('Cancel');
    expect(html).toContain('Submit feedback');
  });

  it('wires category validation messaging to the radio group', () => {
    const { doc } = renderForm({
      validationError: 'Choose a category to send your feedback.',
    });
    const fieldset = doc.querySelector('fieldset');
    const error = doc.querySelector('[role="alert"]');

    expect(error?.textContent?.trim()).toBe(
      'Choose a category to send your feedback.',
    );
    expect(fieldset?.getAttribute('aria-describedby')).toBe(
      error?.getAttribute('id'),
    );
    expect(error?.getAttribute('class')).toContain('text-destructive');
  });

  it('uses the warning foreground token when the comment is near the limit', () => {
    const { doc } = renderForm({
      comment: 'x'.repeat(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH - 50),
    });
    const counter = doc.querySelector(
      '[data-testid="question-report-counter"]',
    );

    expect(counter?.getAttribute('class')).toContain('text-warning-foreground');
  });
});
