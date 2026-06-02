// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

let Dialog: typeof import('./dialog').Dialog;
let DialogClose: typeof import('./dialog').DialogClose;
let DialogDescription: typeof import('./dialog').DialogDescription;
let DialogFooter: typeof import('./dialog').DialogFooter;
let DialogHeader: typeof import('./dialog').DialogHeader;
let DialogTitle: typeof import('./dialog').DialogTitle;
let DialogTrigger: typeof import('./dialog').DialogTrigger;

const DIALOG_SOURCE = readFileSync(
  resolve(process.cwd(), 'components/ui/dialog.tsx'),
  'utf-8',
);

const S4_OVERLAY_CLASSES =
  'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const S4_CONTENT_CLASSES =
  'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-card p-6 text-foreground shadow-lg outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:w-full';

beforeAll(async () => {
  ({
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } = await import('./dialog'));
});

function getClassTokens(element: Element | null): Set<string> {
  return new Set(element?.getAttribute('class')?.split(/\s+/) ?? []);
}

function renderOpenDialog() {
  const html = renderToStaticMarkup(
    <Dialog defaultOpen>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogHeader>
        <DialogTitle>Give feedback</DialogTitle>
        <DialogDescription>
          Spotted an issue or have a suggestion?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose>Close dialog</DialogClose>
      </DialogFooter>
    </Dialog>,
  );

  return new DOMParser().parseFromString(html, 'text/html');
}

describe('components/ui/dialog', () => {
  it('renders named structural slots for the exported dialog pieces', () => {
    const doc = renderOpenDialog();
    const title = doc.querySelector('[data-slot="dialog-title"]');
    const description = doc.querySelector('[data-slot="dialog-description"]');

    expect(doc.querySelector('[data-slot="dialog-trigger"]')).not.toBeNull();
    expect(doc.querySelector('[data-slot="dialog-header"]')).not.toBeNull();
    expect(doc.querySelector('[data-slot="dialog-footer"]')).not.toBeNull();
    expect(title?.textContent).toBe('Give feedback');
    expect(title?.getAttribute('id')).toBeTruthy();
    expect(description?.textContent).toBe(
      'Spotted an issue or have a suggestion?',
    );
    expect(description?.getAttribute('id')).toBeTruthy();
  });

  it('uses the registered S-4 modal surface classes and button-variant focus ring for close actions', () => {
    const doc = renderOpenDialog();
    const closeClasses = getClassTokens(
      doc.querySelector('[data-slot="dialog-close"]'),
    );

    expect(DIALOG_SOURCE).toContain(
      "import { Dialog as DialogPrimitive } from 'radix-ui';",
    );
    expect(DIALOG_SOURCE).toContain(S4_OVERLAY_CLASSES);
    expect(DIALOG_SOURCE).toContain(S4_CONTENT_CLASSES);
    expect(closeClasses.has('focus-visible:ring-ring/50')).toBe(true);
    expect(closeClasses.has('focus-visible:ring-[3px]')).toBe(true);
    expect(doc.querySelector('[data-slot="dialog-close"]')?.textContent).toBe(
      'Close dialog',
    );
  });
});
