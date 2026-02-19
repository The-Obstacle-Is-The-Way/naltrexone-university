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

  it('throws null when toThrow is null', async () => {
    const fakeUseCase = new FakeUseCase<{ value: number }, { ok: boolean }>(
      { ok: true },
      null,
    );

    await expect(fakeUseCase.execute({ value: 1 })).rejects.toBeNull();
    expect(fakeUseCase.inputs).toEqual([{ value: 1 }]);
  });

  it('accumulates inputs across multiple calls', async () => {
    const fakeUseCase = new FakeUseCase<{ value: number }, { ok: boolean }>({
      ok: true,
    });

    await fakeUseCase.execute({ value: 1 });
    await fakeUseCase.execute({ value: 2 });
    await fakeUseCase.execute({ value: 3 });

    expect(fakeUseCase.inputs).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
  });
});
