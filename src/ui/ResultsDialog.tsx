import { Button, Dialog, Stack, Text } from '@aaronherbert/design-system';
import type { RoomHandle } from '../session/RoomHandle';
import { DifficultyPicker, difficultyLabel } from './DifficultyPicker';
import { ordinal, PlayerToken } from './Scoreboard';

interface ResultsDialogProps {
  room: RoomHandle;
  open: boolean;
  onClose: () => void;
}

export function ResultsDialog({ room, open, onClose }: ResultsDialogProps) {
  const state = room.view.state;
  const result = state?.lastResult;
  if (!state || !result) return null;
  const isHost = room.role === 'host';
  const generating = state.phase === 'generating';
  const hostName = state.players.find((p) => p.isHost)?.name ?? 'the host';
  const enoughPlayers = state.players.filter((p) => p.connected).length >= 2;
  const you = room.view.you;

  /** The player's seat token, or an empty slot if they've since left. */
  const token = (playerId: string) => {
    const player = state.players.find((p) => p.id === playerId);
    return player ? <PlayerToken player={player} /> : <span />;
  };

  return (
    <Dialog
      className="arc-dialog"
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={`Round ${result.round} results`}
      description={`${difficultyLabel(result.difficulty)} puzzle solved.`}
      footer={
        isHost ? (
          <>
            <Button variant="ghost" className="arc-btn arc-btn--sm" onClick={room.leave}>Close room</Button>
            <Button
              variant="ghost"
              className="arc-btn arc-btn--sm arc-btn--gold"
              onClick={room.beginRound}
              loading={generating}
              disabled={!enoughPlayers}
            >
              Next round
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="arc-btn arc-btn--sm" onClick={room.leave}>Leave game</Button>
            <Button variant="ghost" className="arc-btn arc-btn--sm arc-btn--blue" onClick={onClose}>View board</Button>
          </>
        )
      }
    >
      <Stack gap={6}>
        <section className="results__section" aria-labelledby="placings-title">
          <h3 id="placings-title" className="arc-panel__title">Placings</h3>
          <ol className="leaderboard">
            {result.placings.map((p) => (
              <li key={p.playerId} className={`leaderboard__row${p.playerId === you ? ' is-you' : ''}`}>
                <span className={`leaderboard__place${p.place === 1 ? ' is-first' : ''}`}>{ordinal(p.place)}</span>
                {token(p.playerId)}
                <span className="leaderboard__name">
                  {p.name}
                  {p.playerId === you && <small> (you)</small>}
                </span>
                <span className="leaderboard__score">
                  {p.roundScore} <small>pts · {p.cellsSolved} cells</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="results__section" aria-labelledby="totals-title">
          <h3 id="totals-title" className="arc-panel__title">Running scoreboard</h3>
          <ol className="leaderboard">
            {result.totals.map((t) => (
              <li key={t.playerId} className={`leaderboard__row${t.playerId === you ? ' is-you' : ''}`}>
                <span className={`leaderboard__place${t.place === 1 ? ' is-first' : ''}`}>{ordinal(t.place)}</span>
                {token(t.playerId)}
                <span className="leaderboard__name">
                  {t.name}
                  {t.playerId === you && <small> (you)</small>}
                </span>
                <span className="leaderboard__score">
                  {t.totalScore} <small>pts</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {isHost ? (
          <Stack gap={2}>
            <DifficultyPicker
              legend="Next round difficulty"
              value={state.difficulty}
              onChange={room.setDifficulty}
              disabled={generating}
            />
            {!enoughPlayers && (
              <Text size="sm" tone="muted">You need at least one other player connected to start a round.</Text>
            )}
          </Stack>
        ) : (
          <Text tone="muted" role="status">
            {generating ? 'Generating the next puzzle…' : `Waiting for ${hostName} to start the next round.`}
          </Text>
        )}
      </Stack>
    </Dialog>
  );
}
