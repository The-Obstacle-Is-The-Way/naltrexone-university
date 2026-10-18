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
      const style = getComputedStyle(alert);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
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
