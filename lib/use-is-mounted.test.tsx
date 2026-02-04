// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useIsMounted } from '@/lib/use-is-mounted';

describe('useIsMounted', () => {
  it('returns false after unmount', async () => {
    let isMounted: () => boolean = () => {
      throw new Error('Expected isMounted callback to be set');
    };

    function TestComponent() {
      isMounted = useIsMounted();
      return <div />;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(<TestComponent />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isMounted()).toBe(true);

    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isMounted()).toBe(false);

    container.remove();
  });
});
