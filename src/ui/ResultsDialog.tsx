import { Button, Dialog, Heading, Stack, Text } from '@aaronherbert/design-system';
import type { RoomHandle } from '../session/RoomHandle';
import { DifficultyPicker, difficultyLabel } from './DifficultyPicker';
import { ordinal } from './Scoreboard';

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={`Round ${result.round} results`}
      description={`${difficultyLabel(result.difficulty)} puzzle solved.`}
      footer={
        isHost ? (
          <>
            <Button variant="outline" onClick={room.leave}>Close room</Button>
            <Button onClick={room.beginRound} loading={generating} disabled={!enoughPlayers}>
              Next round
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={room.leave}>Leave game</Button>
            <Button variant="secondary" onClick={onClose}>View board</Button>
          </>
        )
      }
    >
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading level={3} size="sm">Placings</Heading>
          <ol className="plain-list">
            {result.placings.map((p) => (
              <li key={p.playerId} className="score-row">
                <Text as="span" weight="bold" tone={p.place === 1 ? 'primary' : 'default'}>
                  {ordinal(p.place)}
                </Text>
                <Text as="span">
                  {p.name}
                  {p.playerId === room.view.you && ' (you)'}
                </Text>
                <Text as="span" mono>
                  {p.roundScore} pts
                  <Text as="span" size="xs" tone="muted"> · {p.cellsSolved} cells</Text>
                </Text>
              </li>
            ))}
          </ol>
        </Stack>

        <Stack gap={2}>
          <Heading level={3} size="sm">Running scoreboard</Heading>
          <ol className="plain-list">
            {result.totals.map((t) => (
              <li key={t.playerId} className="score-row">
                <Text as="span" weight="bold">{ordinal(t.place)}</Text>
                <Text as="span">
                  {t.name}
                  {t.playerId === room.view.you && ' (you)'}
                </Text>
                <Text as="span" mono>{t.totalScore} pts</Text>
              </li>
            ))}
          </ol>
        </Stack>

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
