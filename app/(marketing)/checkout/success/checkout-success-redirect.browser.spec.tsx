import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ROUTES } from '@/lib/routes';
import {
  CHECKOUT_SUCCESS_REDIRECT_DELAY_MS,
  CheckoutSuccessRedirect,
} from './checkout-success-redirect';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('CheckoutSuccessRedirect (browser)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    replaceMock.mockReset();
  });

  it('replaces to the dashboard only after the full delay', async () => {
    await render(<CheckoutSuccessRedirect />);

    expect(replaceMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CHECKOUT_SUCCESS_REDIRECT_DELAY_MS - 1);
    expect(replaceMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(ROUTES.APP_DASHBOARD);
  });

  it('cancels the pending redirect when unmounted (manual navigation)', async () => {
    const screen = await render(<CheckoutSuccessRedirect />);

    screen.unmount();
    await vi.advanceTimersByTimeAsync(CHECKOUT_SUCCESS_REDIRECT_DELAY_MS * 2);

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
