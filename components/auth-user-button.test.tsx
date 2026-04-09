// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const userButtonMock = vi.fn(() => <div data-testid="clerk-user-button" />);

vi.mock('@clerk/nextjs', () => ({
  UserButton: userButtonMock,
}));

let AuthUserButton: typeof import('./auth-user-button').AuthUserButton;

beforeAll(async () => {
  ({ AuthUserButton } = await import('./auth-user-button'));
});

describe('AuthUserButton', () => {
  afterEach(() => {
    userButtonMock.mockClear();
  });

  it('does not render Clerk UserButton during server rendering', () => {
    const html = renderToStaticMarkup(
      <AuthUserButton
        appearance={{
          elements: {
            userButtonTrigger: 'min-h-[44px] min-w-[44px]',
          },
        }}
      />,
    );

    expect(userButtonMock).not.toHaveBeenCalled();
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
    expect(html).not.toContain('data-testid="clerk-user-button"');
  });
});
