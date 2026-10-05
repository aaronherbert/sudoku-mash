import { Meter } from '@aaronherbert/design-system';
import { useEffect, useState } from 'react';
import { LOCKOUT_MS } from '../engine/types';

/** Milliseconds left until `until` (local clock), re-rendering as it counts down. */
export function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) {
      setNow(Date.now());
      return;
    }
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, until - now);
}

export function LockoutMeter({ remainingMs }: { remainingMs: number }) {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <Meter
      label="Wrong digit: locked out"
      value={remainingMs}
      max={LOCKOUT_MS}
      valueText={`${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
    />
  );
}
