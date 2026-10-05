import { Card, Text } from '@aaronherbert/design-system';
import type { PublicPlayer } from '../engine/types';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface ScoreboardProps {
  players: PublicPlayer[];
  you: string | null;
}

/** Live standings for the current round. Running totals are in the results dialog. */
export function Scoreboard({ players, you }: ScoreboardProps) {
  const sorted = players.slice().sort((a, b) => b.roundScore - a.roundScore || a.seat - b.seat);
  return (
    <Card title="Scores" description="Points this round." padding="md">
      <ol className="plain-list" aria-label="Scores this round">
        {sorted.map((p) => (
          <li key={p.id} className="score-row">
            <span className={`seat player-${p.color}`} aria-label={`Player ${p.seat}`}>{p.seat}</span>
            <Text as="span" size="sm" weight={p.id === you ? 'semibold' : 'regular'}>
              {p.name}
              {p.id === you && ' (you)'}
              {p.isHost && ' · host'}
              {!p.connected && ' · away'}
            </Text>
            <Text as="span" size="sm" mono>{p.roundScore}</Text>
          </li>
        ))}
      </ol>
    </Card>
  );
}
