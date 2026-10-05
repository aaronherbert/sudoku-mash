import { Button, Card, Heading, Inline, Stack, Text, useToast } from '@aaronherbert/design-system';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '../engine/types';
import type { RoomHandle } from '../session/RoomHandle';
import { DifficultyPicker, difficultyLabel } from './DifficultyPicker';

export function LobbyScreen({ room }: { room: RoomHandle }) {
  const toast = useToast();
  const { state, you } = room.view;
  if (!state) return null;
  const isHost = room.role === 'host';
  const connected = state.players.filter((p) => p.connected).length;
  const canStart = connected >= MIN_PLAYERS_TO_START;
  const generating = state.phase === 'generating';
  const hostName = state.players.find((p) => p.isHost)?.name ?? 'The host';

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      toast.show({ message: `Copied room code ${state.code}`, tone: 'success' });
    } catch {
      toast.show({ message: `Couldn't copy. The code is ${state.code}.`, tone: 'danger' });
    }
  };

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={1} size="xl">Game lobby</Heading>
        <Text tone="muted">
          {isHost ? 'Share the code so friends can join.' : `You're in ${hostName}'s game.`}
        </Text>
      </Stack>

      <Card title="Room code" description="Players enter this on the home screen to join." padding="lg">
        <Inline gap={4} justify="space-between">
          <p className="room-code" aria-label={`Room code ${state.code.split('').join(' ')}`}>{state.code}</p>
          <Button variant="secondary" onClick={copyCode}>Copy code</Button>
        </Inline>
      </Card>

      <Card title={`Players (${state.players.length} of ${MAX_PLAYERS})`} padding="lg">
        <ul className="plain-list" aria-live="polite">
          {state.players.map((p) => (
            <li key={p.id}>
              <Inline gap={2}>
                <span className={`seat player-${p.color}`} aria-hidden="true">{p.seat}</span>
                <Text as="span" weight={p.id === you ? 'semibold' : 'regular'}>{p.name}</Text>
                {p.isHost && <Text as="span" size="sm" tone="primary" weight="semibold">Host</Text>}
                {p.id === you && <Text as="span" size="sm" tone="muted">(you)</Text>}
                {!p.connected && <Text as="span" size="sm" tone="warning">Reconnecting…</Text>}
              </Inline>
            </li>
          ))}
        </ul>
      </Card>

      {isHost ? (
        <Card
          title="Start the game"
          padding="lg"
          footer={
            <>
              <Button variant="outline" onClick={room.leave}>Close room</Button>
              <Button onClick={room.beginRound} disabled={!canStart} loading={generating}>Start game</Button>
            </>
          }
        >
          <Stack gap={4}>
            <DifficultyPicker value={state.difficulty} onChange={room.setDifficulty} disabled={generating} />
            <Text size="sm" tone="muted" role="status">
              {generating
                ? 'Generating the puzzle…'
                : canStart
                  ? 'Everyone gets the same puzzle. Start when everyone is here.'
                  : 'Waiting for at least one more player to join.'}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Card
          padding="lg"
          footer={<Button variant="outline" onClick={room.leave}>Leave game</Button>}
        >
          <Text role="status">
            {generating
              ? 'Generating the puzzle…'
              : `Waiting for ${hostName} to start. Difficulty: ${difficultyLabel(state.difficulty)}.`}
          </Text>
        </Card>
      )}
    </Stack>
  );
}
