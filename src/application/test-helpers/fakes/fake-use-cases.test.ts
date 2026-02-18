import { describe, expect, it } from 'vitest';
import { FakeUseCase } from './fake-use-cases';

describe('FakeUseCase', () => {
  it('records inputs and returns configured output', async () => {
    const output = { ok: true };
    const fakeUseCase = new FakeUseCase<{ value: number }, { ok: boolean }>(
      output,
    );

    await expect(fakeUseCase.execute({ value: 42 })).resolves.toEqual(output);
    expect(fakeUseCase.inputs).toEqual([{ value: 42 }]);
  });

  it('records inputs and throws configured error', async () => {
    const error = new Error('boom');
    const fakeUseCase = new FakeUseCase<{ value: number }, { ok: boolean }>(
      { ok: true },
      error,
    );

    await expect(fakeUseCase.execute({ value: 99 })).rejects.toBe(error);
    expect(fakeUseCase.inputs).toEqual([{ value: 99 }]);
  });
});
