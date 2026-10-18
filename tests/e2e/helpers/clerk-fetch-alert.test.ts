// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { observeFailedFetchAlerts } from './clerk-fetch-alert';

afterEach(() => {
  document.body.replaceChildren();
  delete window.__e2eFailedFetchAlert;
});

describe('failed-fetch alert observer', () => {
  it('reports a later alert once, without passing its text across the boundary', async () => {
    const calls: unknown[][] = [];
    window.__e2eFailedFetchAlert = (...args) => {
      calls.push(args);
    };
    new Function(`(${observeFailedFetchAlerts.toString()})()`)();
    const alert = document.createElement('div');
    alert.setAttribute('role', 'alert');
    document.body.append(alert);
    alert.textContent = 'Failed to fetch secret-cookie-value';
    await new Promise((resolve) => setTimeout(resolve, 0));
    alert.textContent = 'Failed to fetch again';
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([[]]);
  });
});
