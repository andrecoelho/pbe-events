import { describe, expect, test } from 'bun:test';
import { debounce } from './debounce';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('debounce', () => {
  test('calls once, after the wait, with the latest arguments', async () => {
    const calls: string[] = [];
    const save = debounce((value: string) => calls.push(value), 20);

    save('a');
    save('ab');
    save('abc');
    expect(calls).toEqual([]);

    await sleep(40);
    expect(calls).toEqual(['abc']);
  });

  test('each call restarts the wait', async () => {
    const calls: number[] = [];
    const save = debounce((n: number) => calls.push(n), 30);

    save(1);
    await sleep(15);
    save(2);
    await sleep(20);
    expect(calls).toEqual([]);

    await sleep(30);
    expect(calls).toEqual([2]);
  });

  test('calls again for changes after the wait has passed', async () => {
    const calls: number[] = [];
    const save = debounce((n: number) => calls.push(n), 10);

    save(1);
    await sleep(25);
    save(2);
    await sleep(25);
    expect(calls).toEqual([1, 2]);
  });
});
