import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClerkAuthTrace, reportClerkAuthTrace } from './clerk-auth-trace';

afterEach(() => vi.useRealTimers());

describe('bounded Clerk trace reporting', () => {
  it('keeps the environment answer and action failure through a 60-answer navigation burst', () => {
    const trace = new ClerkAuthTrace(() => 0);
    trace.noteAnswer('Clerk API: GET /v1/environment 200');
    trace.noteAnswer('requestfailed POST localhost/app/questions/q action=yes');
    for (let i = 0; i < 30; i += 1) {
      trace.noteAnswer(
        'POST localhost/app/questions/q 200 resource=fetch action=yes rsc=no',
      );
      trace.noteAnswer(
        'GET localhost/app/history 200 resource=fetch action=no rsc=yes',
      );
    }

    const output = trace.report('none')?.join('\n');
    expect(output).toContain('Clerk API: GET /v1/environment 200');
    expect(output).toContain(
      'requestfailed POST localhost/app/questions/q action=yes',
    );
  });

  it('prints the original failure when a pending header read never settles', async () => {
    vi.useFakeTimers();
    const trace = new ClerkAuthTrace();
    trace.noteAnswer('requestfailed POST localhost/app/questions/q');
    const output: string[] = [];
    const reporting = reportClerkAuthTrace({
      trace,
      reason: 'test failure',
      pending: [new Promise<void>(() => {})],
      readCookies: async () => [],
      write: (text) => output.push(text),
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(output).toHaveLength(1);
    expect(output[0]).toContain('requestfailed POST localhost/app/questions/q');
    expect(output[0]).toContain('Some diagnostic reads timed out after 5000ms');
    await reporting;
  });
});
