const STICKY_ACTION_BAR_BROWSER_STYLE_ID =
  'sticky-action-bar-browser-test-styles';

export function installStickyActionBarBrowserStyles() {
  // Browser component specs do not load the full app shell CSS, so viewport
  // assertions need the shared shell geometry injected explicitly.
  const existingStyle = document.getElementById(
    STICKY_ACTION_BAR_BROWSER_STYLE_ID,
  );
  if (existingStyle instanceof HTMLStyleElement) {
    return;
  }

  const style = document.createElement('style');
  style.id = STICKY_ACTION_BAR_BROWSER_STYLE_ID;
  style.textContent = `
    [data-testid="sticky-action-bar-layout"] {
      display: flex;
      height: calc(100dvh - 8rem);
      flex-direction: column;
      overflow: hidden;
    }

    [data-testid="sticky-action-bar-scroll-region"] {
      min-height: 0;
      flex: 1 1 0%;
      overflow-y: auto;
      padding-bottom: 1.5rem;
    }

    [data-testid="sticky-action-bar"] {
      position: sticky;
      bottom: 0;
      flex: none;
      border-top: 1px solid rgb(203 213 225 / 0.5);
      background: rgb(255 255 255 / 0.8);
      padding-top: 0.75rem;
      padding-bottom: max(env(safe-area-inset-bottom), 0.75rem);
      backdrop-filter: blur(4px);
    }
  `;

  document.head.appendChild(style);
}
