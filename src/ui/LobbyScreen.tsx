import { Button, useToast } from '@aaronherbert/design-system';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '../engine/types';
import type { RoomHandle } from '../session/RoomHandle';
import { DifficultyPicker, difficultyLabel } from './DifficultyPicker';
import { PlayerToken } from './Scoreboard';

export function LobbyScreen({ room }: { room: RoomHandle }) {
  const toast = useToast();
  const { state, you } = room.view;
  if (!state) return null;
  const isHost = room.role === 'host';
  const connected = state.players.filter((p) => p.connected).length;
  const canStart = connected >= MIN_PLAYERS_TO_START;
  const generating = state.phase === 'generating';
  const hostName = state.players.find((p) => p.isHost)?.name ?? 'The host';
  const openSeats = Math.max(0, MAX_PLAYERS - state.players.length);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      toast.show({ message: `Copied room code ${state.code}`, tone: 'success' });
    } catch {
      toast.show({ message: `Couldn't copy. The code is ${state.code}.`, tone: 'danger' });
    }
  };

  const status = generating
    ? 'Generating the puzzle…'
    : isHost
      ? canStart
        ? 'Everyone gets the same puzzle. Start when everyone is here.'
        : 'Waiting for at least one more player to join.'
      : `Waiting for ${hostName} to start. Difficulty: ${difficultyLabel(state.difficulty)}.`;

  return (
    <div className="arc-menu">
      <div className="lobby">
        <div className="lobby__top">
          <h1 className="arc-display arc-title lobby__title">Lobby</h1>
          <p className="arc-muted arc-center">
            {isHost ? 'Share the code so friends can join.' : `You're in ${hostName}'s game.`}
          </p>
        </div>

        <section className="arc-panel arc-center-items" aria-labelledby="room-code-title">
          <h2 id="room-code-title" className="arc-label">Room code</h2>
          <p className="code-display" aria-label={`Room code ${state.code.split('').join(' ')}`}>
            {state.code.split('').map((digit, i) => (
              <span key={i} aria-hidden="true">{digit}</span>
            ))}
          </p>
          <Button
            variant="ghost"
            className="arc-btn arc-btn--sm"
            onClick={copyCode}
            leadingIcon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
            }
          >
            Copy code
          </Button>
        </section>

        <section className="lobby__section" aria-labelledby="players-title">
          <div className="arc-panel__head">
            <h2 id="players-title" className="arc-panel__title">Players</h2>
            <span className="arc-count">
              {state.players.length}<span className="arc-muted"> / {MAX_PLAYERS}</span>
            </span>
          </div>
          <ul className="seats" aria-live="polite">
            {state.players.map((p) => {
              const tags = [p.isHost && 'Host', p.id === you && 'You'].filter(Boolean).join(' · ');
              return (
                <li key={p.id} className={`seat-slot player-${p.color}`}>
                  <PlayerToken player={p} />
                  <span className="seat-slot__name">
                    <span>{p.name}</span>
                    {!p.connected ? (
                      <span className="seat-slot__tag is-warning">Reconnecting…</span>
                    ) : tags && (
                      <span className="seat-slot__tag">{tags.toUpperCase()}</span>
                    )}
                  </span>
                </li>
              );
            })}
            {Array.from({ length: openSeats }, (_, i) => (
              <li key={`open-${i}`} className="seat-slot seat-slot--open">Open seat</li>
            ))}
          </ul>
        </section>

        {isHost && (
          <DifficultyPicker value={state.difficulty} onChange={room.setDifficulty} disabled={generating} />
        )}

        <div className="lobby__actions">
          {isHost && (
            <Button
              variant="ghost"
              className="arc-btn arc-btn--gold arc-btn--block"
              onClick={room.beginRound}
              disabled={!canStart}
              loading={generating}
              leadingIcon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" />
                </svg>
              }
            >
              Start game
            </Button>
          )}
          <p className="arc-muted arc-center" role="status">{status}</p>
          <Button variant="ghost" className="arc-btn arc-btn--sm" onClick={room.leave}>
            {isHost ? 'Close room' : 'Leave game'}
          </Button>
        </div>
      </div>
    </div>
  );
}
