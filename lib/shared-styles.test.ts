import { describe, expect, it } from 'vitest';
import { headerActionLinkClasses } from '@/lib/shared-styles';

describe('lib/shared-styles', () => {
  it('exports the shared header action link classes', () => {
    expect(headerActionLinkClasses).toBe(
      'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline',
    );
  });
});
