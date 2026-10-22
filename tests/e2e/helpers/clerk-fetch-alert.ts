declare global {
  interface Window {
    __e2eFailedFetchAlert?: () => void;
  }
}

// Sent as source by Playwright. Send only the signal; DOM text can contain
// credentials and must never cross this binding. Disconnect after one alert.
export function observeFailedFetchAlerts(): void {
  const observer = new MutationObserver(() => {
    for (const alert of document.querySelectorAll('[role="alert"]')) {
      if (!alert.textContent?.includes('Failed to fetch')) continue;
      if (alert.closest('[hidden]')) continue;
      // Visibility is inherited, so the alert's own value is final; display is
      // not, so a parent with display: none hides the alert without changing it.
      if (getComputedStyle(alert).visibility === 'hidden') continue;
      let shown = true;
      for (
        let element: Element | null = alert;
        element && shown;
        element = element.parentElement
      ) {
        shown = getComputedStyle(element).display !== 'none';
      }
      if (!shown) continue;
      observer.disconnect();
      window.__e2eFailedFetchAlert?.();
      break;
    }
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
