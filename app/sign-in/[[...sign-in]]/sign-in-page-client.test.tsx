// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

function getClassTokens(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter(Boolean));
}

describe('SignInPageClient', () => {
  let SignInPageClient: typeof import('./sign-in-page-client').default;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SKIP_CLERK = 'true';
    SignInPageClient = (await import('./sign-in-page-client')).default;
  });

  afterAll(() => {
    restoreProcessEnv(ORIGINAL_ENV);
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders fallback supporting copy with explicit text-base sizing', () => {
    const html = renderToStaticMarkup(<SignInPageClient />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const supportingCopy = Array.from(doc.querySelectorAll('p')).find(
      (element) =>
        element.textContent?.includes(
          'Authentication unavailable in this environment.',
        ),
    );
    const supportingCopyClassTokens = getClassTokens(
      supportingCopy?.getAttribute('class') ?? '',
    );

    expect(supportingCopy).not.toBeNull();
    expect(supportingCopyClassTokens.has('text-base')).toBe(true);
    expect(supportingCopyClassTokens.has('text-muted-foreground')).toBe(true);
  });
});
