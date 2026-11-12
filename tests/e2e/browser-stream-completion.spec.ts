import { createServer, type ServerResponse } from 'node:http';
import { expect, type Page, type Request, test } from '@playwright/test';

// BUG-376: before Chromium 157, a `Cache-Control: no-store` response whose end
// arrives separately from its last data was reported failed
// (`net::ERR_ABORTED`) after the page had read all of it (Chromium change
// 8508456). Next.js answers server actions and RSC requests with no-store and
// reads them through a stream reader, so on such a browser E2E sees healthy
// requests fail. The first contract needs a browser that reports the read as
// finished. The second keeps a canceled read reported as failed, so the pair
// cannot pass on a browser that stops reporting failures. Neither needs the
// app server or Clerk. The server sends each part only after the page has read
// the one before it, so the end of the body always arrives on its own.

const STREAM_PATH = '/stream';
const FIRST_PART = '{"ok":';
const LAST_PART = 'true}';

declare global {
  interface Window {
    streamContract?: { bytesRead: number; body: Promise<string> };
  }
}

async function startStreamServer() {
  let resolveStream: (response: ServerResponse) => void = () => {};
  const streamResponse = new Promise<ServerResponse>((resolve) => {
    resolveStream = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url !== STREAM_PATH) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Stream contract</title>');
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.write(FIRST_PART);
    resolveStream(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected the stream server to have a TCP port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    streamResponse,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** The stream request's terminal event, as Playwright reports it. */
function streamTerminalEvent(page: Page): Promise<string> {
  const isStream = (request: Request) =>
    new URL(request.url()).pathname === STREAM_PATH;
  return new Promise((resolve) => {
    page.on('requestfinished', (request) => {
      if (isStream(request)) resolve('requestfinished');
    });
    page.on('requestfailed', (request) => {
      if (isStream(request))
        resolve(`requestfailed: ${request.failure()?.errorText}`);
    });
  });
}

const bytesRead = (page: Page) =>
  page.evaluate(() => window.streamContract?.bytesRead ?? 0);

test('a no-store body read to its end is reported finished', async ({
  page,
}) => {
  const server = await startStreamServer();
  try {
    await page.goto(server.origin);
    const terminal = streamTerminalEvent(page);
    await page.evaluate((path) => {
      const state = { bytesRead: 0, body: Promise.resolve('') };
      state.body = fetch(path).then(async (response) => {
        if (!response.body) throw new Error('Expected a response body');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        for (
          let chunk = await reader.read();
          !chunk.done;
          chunk = await reader.read()
        ) {
          state.bytesRead += chunk.value.byteLength;
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      });
      window.streamContract = state;
    }, STREAM_PATH);
    const response = await server.streamResponse;
    await expect.poll(() => bytesRead(page)).toBe(FIRST_PART.length);
    response.write(LAST_PART);
    await expect
      .poll(() => bytesRead(page))
      .toBe(FIRST_PART.length + LAST_PART.length);
    response.end();

    expect(await page.evaluate(() => window.streamContract?.body)).toBe(
      FIRST_PART + LAST_PART,
    );
    expect(await terminal).toBe('requestfinished');
  } finally {
    await server.close();
  }
});

test('a canceled no-store read is still reported failed', async ({ page }) => {
  const server = await startStreamServer();
  try {
    await page.goto(server.origin);
    const terminal = streamTerminalEvent(page);
    await page.evaluate((path) => {
      const state = { bytesRead: 0, body: Promise.resolve('') };
      state.body = fetch(path).then(async (response) => {
        if (!response.body) throw new Error('Expected a response body');
        const reader = response.body.getReader();
        const first = await reader.read();
        state.bytesRead += first.value?.byteLength ?? 0;
        await reader.cancel();
        return 'canceled';
      });
      window.streamContract = state;
    }, STREAM_PATH);
    await server.streamResponse;

    expect(await page.evaluate(() => window.streamContract?.body)).toBe(
      'canceled',
    );
    expect(await terminal).toBe('requestfailed: net::ERR_ABORTED');
  } finally {
    await server.close();
  }
});
