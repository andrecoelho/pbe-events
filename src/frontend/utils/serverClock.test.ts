import { secondsLeft, serverNow, setServerClock } from '@/frontend/utils/serverClock';
import { describe, expect, test } from 'bun:test';

describe('server clock', () => {
  test('takes the offset from the fastest round trip', () => {
    // The server is 5 s ahead. The slow sample (400 ms round trip, answered late) would give a worse offset.
    setServerClock([
      { sent: 1_000, received: 1_400, serverTime: 6_350 },
      { sent: 2_000, received: 2_020, serverTime: 7_010 },
      { sent: 3_000, received: 3_100, serverTime: 8_080 }
    ]);

    expect(serverNow() - Date.now()).toBe(5_000);
  });

  test('ignores an empty set of samples', () => {
    setServerClock([{ sent: 0, received: 0, serverTime: 0 }]);
    setServerClock([]);

    expect(serverNow() - Date.now()).toBe(0);
  });

  test('counts whole seconds left, rounding up, never below 0', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 1)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});
