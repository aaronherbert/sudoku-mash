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
    <div className="lockout">
      <p className="lockout__head" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Locked out · {seconds}
      </p>
      <Meter
        label="Wrong digit: locked out"
        value={remainingMs}
        max={LOCKOUT_MS}
        valueText={`${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
      />
    </div>
  );
}
