import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function normalizeExecOutput(output: unknown): string | null {
  if (typeof output === 'string') {
    return output.trim();
  }

  if (Buffer.isBuffer(output)) {
    return output.toString('utf8').trim();
  }

  return null;
}

function runReactServerScript<T>(script: string): T {
  let output: string;

  try {
    output = execFileSync(
      'pnpm',
      ['exec', 'tsx', '--conditions', 'react-server', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const stdout = normalizeExecOutput(
      (error as { stdout?: unknown } | undefined)?.stdout,
    );
    const stderr = normalizeExecOutput(
      (error as { stderr?: unknown } | undefined)?.stderr,
    );
    const message = [
      'React server script failed.',
      stderr ? `stderr:\n${stderr}` : null,
      stdout ? `stdout:\n${stdout}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    throw new Error(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  try {
    return JSON.parse(output) as T;
  } catch (error) {
    throw new Error(
      `React server script returned invalid JSON.\n\nstdout:\n${output.trim()}`,
      {
        cause: error instanceof Error ? error : undefined,
      },
    );
  }
}

describe('cached-reads', () => {
  it('deduplicates published question reads by id within a single server render', () => {
    const result = runReactServerScript(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedQuestionRepository } = require('./lib/cached-reads.ts');
const { FakeQuestionRepository } = require('./src/application/test-helpers/fakes/fake-question-repository.ts');
const { createQuestion } = require('./src/domain/test-helpers/index.ts');

class CountingQuestionRepository extends FakeQuestionRepository {
  findPublishedByIdCallCount = 0;

  async findPublishedById(id) {
    this.findPublishedByIdCallCount++;
    return super.findPublishedById(id);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingQuestionRepository([
  createQuestion({ id: 'question-1', slug: 'question-1' }),
]);
const repository = createRequestCachedQuestionRepository(rawRepository);

async function FirstCaller() {
  const question = await repository.findPublishedById('question-1');
  return React.createElement('div', null, question?.id ?? 'missing');
}

async function SecondCaller() {
  const question = await repository.findPublishedById('question-1');
  return React.createElement('div', null, question?.slug ?? 'missing');
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    findPublishedByIdCallCount: rawRepository.findPublishedByIdCallCount,
  }),
);
`);

    expect(result).toEqual({
      findPublishedByIdCallCount: 1,
    });
  });

  it('rechecks published question reads on a new server render', () => {
    const result = runReactServerScript(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedQuestionRepository } = require('./lib/cached-reads.ts');
const { FakeQuestionRepository } = require('./src/application/test-helpers/fakes/fake-question-repository.ts');
const { createQuestion } = require('./src/domain/test-helpers/index.ts');

class CountingQuestionRepository extends FakeQuestionRepository {
  findPublishedByIdCallCount = 0;

  async findPublishedById(id) {
    this.findPublishedByIdCallCount++;
    return super.findPublishedById(id);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingQuestionRepository([
  createQuestion({ id: 'question-1', slug: 'question-1' }),
]);
const repository = createRequestCachedQuestionRepository(rawRepository);

async function Caller() {
  const question = await repository.findPublishedById('question-1');
  return React.createElement('div', null, question?.id ?? 'missing');
}

async function App() {
  return React.createElement(Caller);
}

await drain(await renderToReadableStream(React.createElement(App), null));
await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    findPublishedByIdCallCount: rawRepository.findPublishedByIdCallCount,
  }),
);
`);

    expect(result).toEqual({
      findPublishedByIdCallCount: 2,
    });
  });

  it('normalizes published question batch reads while preserving caller order', () => {
    const result = runReactServerScript<{
      findPublishedByIdsCallCount: number;
      findPublishedByIdsCalls: string[][];
      firstResultIds: string[];
      secondResultIds: string[];
    }>(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedQuestionRepository } = require('./lib/cached-reads.ts');
const { FakeQuestionRepository } = require('./src/application/test-helpers/fakes/fake-question-repository.ts');
const { createQuestion } = require('./src/domain/test-helpers/index.ts');

class CountingQuestionRepository extends FakeQuestionRepository {
  findPublishedByIdsCallCount = 0;

  async findPublishedByIds(ids) {
    this.findPublishedByIdsCallCount++;
    return super.findPublishedByIds(ids);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingQuestionRepository([
  createQuestion({ id: 'a', slug: 'question-a' }),
  createQuestion({ id: 'b', slug: 'question-b' }),
]);
const repository = createRequestCachedQuestionRepository(rawRepository);

let firstResultIds = [];
let secondResultIds = [];

async function FirstCaller() {
  const questions = await repository.findPublishedByIds(['b', 'a', 'a']);
  firstResultIds = questions.map((question) => question.id);
  return React.createElement('div', null, firstResultIds.join(','));
}

async function SecondCaller() {
  const questions = await repository.findPublishedByIds(['a', 'b']);
  secondResultIds = questions.map((question) => question.id);
  return React.createElement('div', null, secondResultIds.join(','));
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    findPublishedByIdsCallCount: rawRepository.findPublishedByIdsCallCount,
    findPublishedByIdsCalls: rawRepository.findPublishedByIdsCalls,
    firstResultIds,
    secondResultIds,
  }),
);
`);

    expect(result).toEqual({
      findPublishedByIdsCallCount: 1,
      findPublishedByIdsCalls: [['a', 'b']],
      firstResultIds: ['b', 'a', 'a'],
      secondResultIds: ['a', 'b'],
    });
  });

  it('deduplicates session-owned question reads by id within a single server render', () => {
    const result = runReactServerScript<{
      findByIdForSessionCallCount: number;
      firstStatus: string;
      secondStatus: string;
    }>(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedQuestionRepository } = require('./lib/cached-reads.ts');
const { FakeQuestionRepository } = require('./src/application/test-helpers/fakes/fake-question-repository.ts');
const { createQuestion } = require('./src/domain/test-helpers/index.ts');

class CountingQuestionRepository extends FakeQuestionRepository {
  findByIdForSessionCallCount = 0;

  async findByIdForSession(id) {
    this.findByIdForSessionCallCount++;
    return super.findByIdForSession(id);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingQuestionRepository([
  createQuestion({ id: 'question-1', slug: 'question-1', status: 'archived' }),
]);
const repository = createRequestCachedQuestionRepository(rawRepository);

let firstStatus = 'missing';
let secondStatus = 'missing';

async function FirstCaller() {
  const question = await repository.findByIdForSession('question-1');
  firstStatus = question?.status ?? 'missing';
  return React.createElement('div', null, firstStatus);
}

async function SecondCaller() {
  const question = await repository.findByIdForSession('question-1');
  secondStatus = question?.status ?? 'missing';
  return React.createElement('div', null, secondStatus);
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    findByIdForSessionCallCount: rawRepository.findByIdForSessionCallCount,
    firstStatus,
    secondStatus,
  }),
);
`);

    expect(result).toEqual({
      findByIdForSessionCallCount: 1,
      firstStatus: 'archived',
      secondStatus: 'archived',
    });
  });

  it('normalizes session-owned question batch reads while preserving caller order', () => {
    const result = runReactServerScript<{
      findByIdsForSessionCallCount: number;
      findByIdsForSessionCalls: string[][];
      firstResultIds: string[];
      secondResultIds: string[];
    }>(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedQuestionRepository } = require('./lib/cached-reads.ts');
const { FakeQuestionRepository } = require('./src/application/test-helpers/fakes/fake-question-repository.ts');
const { createQuestion } = require('./src/domain/test-helpers/index.ts');

class CountingQuestionRepository extends FakeQuestionRepository {
  findByIdsForSessionCallCount = 0;

  async findByIdsForSession(ids) {
    this.findByIdsForSessionCallCount++;
    return super.findByIdsForSession(ids);
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingQuestionRepository([
  createQuestion({ id: 'a', slug: 'question-a', status: 'archived' }),
  createQuestion({ id: 'b', slug: 'question-b', status: 'draft' }),
]);
const repository = createRequestCachedQuestionRepository(rawRepository);

let firstResultIds = [];
let secondResultIds = [];

async function FirstCaller() {
  const questions = await repository.findByIdsForSession(['b', 'a', 'a']);
  firstResultIds = questions.map((question) => question.id);
  return React.createElement('div', null, firstResultIds.join(','));
}

async function SecondCaller() {
  const questions = await repository.findByIdsForSession(['a', 'b']);
  secondResultIds = questions.map((question) => question.id);
  return React.createElement('div', null, secondResultIds.join(','));
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    findByIdsForSessionCallCount: rawRepository.findByIdsForSessionCallCount,
    findByIdsForSessionCalls: rawRepository.findByIdsForSessionCalls,
    firstResultIds,
    secondResultIds,
  }),
);
`);

    expect(result).toEqual({
      findByIdsForSessionCallCount: 1,
      findByIdsForSessionCalls: [['a', 'b']],
      firstResultIds: ['b', 'a', 'a'],
      secondResultIds: ['a', 'b'],
    });
  });

  it('deduplicates tag list reads within a single server render', () => {
    const result = runReactServerScript(`
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node');
const { createRequestCachedTagRepository } = require('./lib/cached-reads.ts');
const { FakeTagRepository } = require('./src/application/test-helpers/fakes/fake-tag-repository.ts');
const { createTag } = require('./src/domain/test-helpers/index.ts');

class CountingTagRepository extends FakeTagRepository {
  listAllCallCount = 0;

  async listAll() {
    this.listAllCallCount++;
    return super.listAll();
  }
}

async function drain(stream) {
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const rawRepository = new CountingTagRepository([
  createTag({ id: 'tag-1', slug: 'opioids', name: 'Opioids' }),
]);
const repository = createRequestCachedTagRepository(rawRepository);

async function FirstCaller() {
  const tags = await repository.listAll();
  return React.createElement('div', null, tags[0]?.slug ?? 'missing');
}

async function SecondCaller() {
  const tags = await repository.listAll();
  return React.createElement('div', null, tags[0]?.name ?? 'missing');
}

async function App() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(FirstCaller),
    React.createElement(SecondCaller),
  );
}

await drain(await renderToReadableStream(React.createElement(App), null));
console.log(
  JSON.stringify({
    listAllCallCount: rawRepository.listAllCallCount,
  }),
);
`);

    expect(result).toEqual({
      listAllCallCount: 1,
    });
  });
});
