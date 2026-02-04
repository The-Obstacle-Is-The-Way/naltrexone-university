// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useIsMounted } from '@/lib/use-is-mounted';

describe('useIsMounted', () => {
  it('returns false after unmount', async () => {
    const consoleError = console.error.bind(console);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        const first = args[0];
        if (typeof first === 'string' && first.includes('not wrapped in act')) {
          return;
        }
        consoleError(...args);
      });

    let didRender = false;
    let isMounted: () => boolean = () => false;

    function TestComponent() {
      isMounted = useIsMounted();
      didRender = true;
      return <div />;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    try {
      root.render(<TestComponent />);

      for (let attempt = 0; attempt < 10 && !didRender; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(didRender).toBe(true);

      for (let attempt = 0; attempt < 10 && !isMounted(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(isMounted()).toBe(true);

      root.unmount();
      for (let attempt = 0; attempt < 10 && isMounted(); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(isMounted()).toBe(false);
    } finally {
      container.remove();
      errorSpy.mockRestore();
    }
  });
});
