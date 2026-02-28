import { describe, expect, it } from 'vitest';

describe('lib/shared-styles', () => {
  it('exports the shared header action link classes', async () => {
    const { headerActionLinkClasses } = await import('./shared-styles');

    expect(headerActionLinkClasses).toBe(
      'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline',
    );
  });
});
