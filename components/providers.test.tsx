// @vitest-environment jsdom

import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

describe('Providers', () => {
  afterEach(() => {
    restoreEnv();
    vi.unmock('@clerk/nextjs');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders children without importing Clerk when NEXT_PUBLIC_SKIP_CLERK=true', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';

    vi.doMock('@clerk/nextjs', () => {
      throw new Error('Clerk must not be imported when skipClerk=true');
    });

    const { Providers } = await import('./providers');
    const element = await Providers({ children: <div>Child</div> });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Child');
  });

  it('wraps children with ClerkProvider when NEXT_PUBLIC_SKIP_CLERK=false', async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'false';

    vi.doMock('@clerk/nextjs', () => ({
      ClerkProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="clerk-provider">{children}</div>
      ),
    }));

    const { Providers } = await import('./providers');
    const element = await Providers({ children: <div>Child</div> });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-testid="clerk-provider"');
    expect(html).toContain('Child');
  });
});
