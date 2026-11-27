// The server's clock, as seen from this page (#47). Timers count down to a deadline in server time, so each
// page needs its offset from the server: `offset = serverTime − (sent + received) / 2`, from the ping with the
// fastest round trip. WebSocketManager measures it on connect, every minute and when the tab is shown again.
import { useEffect, useState } from 'react';

let offsetMs = 0;

export function serverNow() {
  return Date.now() + offsetMs;
}

// One sample: a ping sent at `sent`, answered at `received` (both Date.now()) with the server's `serverTime`.
export type ClockSample = { sent: number; received: number; serverTime: number };

// Keeps the offset from the sample with the shortest round trip, whose midpoint is the most accurate.
export function setServerClock(samples: ClockSample[]) {
  const best = samples.reduce<ClockSample | null>(
    (fastest, sample) =>
      !fastest || sample.received - sample.sent < fastest.received - fastest.sent ? sample : fastest,
    null
  );

  if (best) {
    offsetMs = best.serverTime - (best.sent + best.received) / 2;
  }
}

// Seconds left until `endsAt` (server time), rounded up and never below 0.
export function secondsLeft(endsAt: number, now = serverNow()) {
  return Math.max(Math.ceil((endsAt - now) / 1000), 0);
}

// The current server time, re-rendering the component every quarter second while `running`.
export function useServerNow(running: boolean) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = setInterval(() => setNow(serverNow()), 250);

    return () => clearInterval(timer);
  }, [running]);

  return running ? now : serverNow();
}
