import type { PublicPlayer } from '../engine/types';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A player's seat number on their colour, as on the board. */
export function PlayerToken({ player }: { player: Pick<PublicPlayer, 'seat' | 'color'> }) {
  return (
    <span className={`arc-token player-${player.color}`} aria-label={`Player ${player.seat}`}>
      {player.seat}
    </span>
  );
}

interface ScoreboardProps {
  players: PublicPlayer[];
  you: string | null;
}

/** Live standings for the current round. Running totals are in the results dialog. */
export function Scoreboard({ players, you }: ScoreboardProps) {
  const sorted = players.slice().sort((a, b) => b.roundScore - a.roundScore || a.seat - b.seat);
  return (
    <section className="arc-panel" aria-labelledby="scores-title">
      <div className="arc-panel__head">
        <h2 id="scores-title" className="arc-panel__title">Scores</h2>
        <span className="arc-muted">This round</span>
      </div>
      <ol className="leaderboard" aria-label="Scores this round">
        {sorted.map((p, i) => (
          <li key={p.id} className={`leaderboard__row${p.id === you ? ' is-you' : ''}`}>
            <span className={`leaderboard__place${i === 0 && p.roundScore > 0 ? ' is-first' : ''}`}>{ordinal(i + 1)}</span>
            <PlayerToken player={p} />
            <span className="leaderboard__name">
              {p.name}
              {(p.id === you || p.isHost || !p.connected) && (
                <small>
                  {p.id === you && ' (you)'}
                  {p.isHost && ' · host'}
                  {!p.connected && ' · away'}
                </small>
              )}
            </span>
            <span className="leaderboard__score">{p.roundScore}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
