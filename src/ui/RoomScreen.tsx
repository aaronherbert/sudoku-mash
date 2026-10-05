import { Banner, Button, Card, Stack, Text, useToast } from '@aaronherbert/design-system';
import { useEffect } from 'react';
import type { RoomHandle } from '../session/RoomHandle';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';

interface RoomScreenProps {
  room: RoomHandle;
  onExit: (notice?: string) => void;
}

const ROW_OR_BOX = { row: 'row', box: 'box' } as const;

export function RoomScreen({ room, onExit }: RoomScreenProps) {
  const toast = useToast();
  const { view } = room;

  // Toasts for bonuses and lost races.
  useEffect(() => room.subscribe((msg) => {
    if (msg.type === 'cell-solved' && msg.bonuses.length) {
      const who = view.state?.players.find((p) => p.id === msg.by);
      const mine = msg.by === view.you;
      const what = msg.bonuses.map((b) => `${ROW_OR_BOX[b.kind]} ${b.index + 1}`).join(' and ');
      toast.show({
        tone: mine ? 'success' : 'neutral',
        message: `${mine ? 'You' : who?.name ?? 'Someone'} completed ${what}: +${msg.points} points`,
        duration: 3000,
      });
    } else if (msg.type === 'move-rejected' && msg.reason === 'taken') {
      toast.show({ message: 'Someone solved that cell first.', duration: 2500 });
    }
  }), [room, toast, view.state?.players, view.you]);

  // The host closing their own room goes straight home.
  useEffect(() => {
    if (room.status === 'ended' && (room.endReason === 'closed-by-me' || room.endReason === 'left')) onExit();
  }, [room.status, room.endReason, onExit]);

  if (room.status === 'failed') {
    return (
      <Card
        title="Couldn't open the game"
        padding="lg"
        footer={<Button onClick={() => onExit()}>Back to home</Button>}
      >
        <Text tone="danger" role="alert">{room.error}</Text>
      </Card>
    );
  }

  if (room.status === 'ended') {
    if (room.endReason === 'closed-by-me' || room.endReason === 'left') return null;
    const full = room.endReason === 'full';
    return (
      <Card
        title={full ? 'That game is full' : 'Host left, game over'}
        description={full
          ? 'The game reached 8 players while you were away.'
          : 'The host closed the game or could not be reached for 2 minutes.'}
        padding="lg"
        footer={<Button onClick={() => onExit()}>Back to home</Button>}
      >
        {view.state?.lastResult && (
          <Text tone="muted">
            Final standings: {view.state.lastResult.totals.map((t) => `${t.name} ${t.totalScore}`).join(', ')}.
          </Text>
        )}
      </Card>
    );
  }

  const reconnecting = room.status === 'reconnecting' && (
    <Banner variant="subtle" title="Reconnecting to host…" role="status">
      The connection dropped. Trying again for up to 2 minutes. Your board and score are safe.
    </Banner>
  );

  if (!view.state) {
    return (
      <Stack gap={4}>
        {reconnecting}
        <Text role="status" tone="muted">
          {room.role === 'host' ? 'Opening your game room…' : 'Connecting to the game…'}
        </Text>
        {room.role === 'guest' && (
          <div>
            <Button variant="outline" onClick={room.leave}>Cancel</Button>
          </div>
        )}
      </Stack>
    );
  }

  const inLobby = view.state.phase === 'lobby' || (view.state.phase === 'generating' && view.state.round === 0);
  return (
    <Stack gap={6}>
      {reconnecting}
      {inLobby ? <LobbyScreen room={room} /> : <GameScreen room={room} />}
    </Stack>
  );
}
