import { Button, Grid, GridItem, Heading, Inline, Stack, Text } from '@aaronherbert/design-system';
import { useEffect, useState } from 'react';
import type { RoomHandle } from '../session/RoomHandle';
import { Board } from './Board';
import { difficultyLabel } from './DifficultyPicker';
import { LockoutMeter, useCountdown } from './LockoutMeter';
import { NumberPad } from './NumberPad';
import { ResultsDialog } from './ResultsDialog';
import { Scoreboard } from './Scoreboard';

export function GameScreen({ room }: { room: RoomHandle }) {
  const { state, you, fresh, lockoutUntil } = room.view;
  const [selected, setSelected] = useState<number | null>(null);
  const [resultsDismissed, setResultsDismissed] = useState<number | null>(null);
  const lockoutMs = useCountdown(lockoutUntil);
  const round = state?.round ?? 0;

  // New round: clear the selection.
  useEffect(() => setSelected(null), [round]);

  if (!state) return null;
  const me = state.players.find((p) => p.id === you);
  const playing = state.phase === 'playing';
  const locked = lockoutMs > 0;
  const inputDisabled = !playing || locked || room.status !== 'connected';
  const canEnter = selected !== null && state.cells[selected].value === 0;
  const remaining = state.cells.filter((c) => c.value === 0).length;

  const enter = (value: number) => {
    if (inputDisabled || selected === null || state.cells[selected].value !== 0) return;
    room.move(selected, value);
  };

  const showResults = state.lastResult !== null
    && (state.phase === 'results' || (state.phase === 'generating' && round > 0))
    && resultsDismissed !== state.lastResult.round;

  return (
    <Stack gap={6}>
      <Inline justify="space-between" gap={4}>
        <Stack gap={1}>
          <Heading level={1} size="lg">
            Round {round} · {difficultyLabel(state.difficulty)}
          </Heading>
          <Text tone="muted" size="sm">
            Room {state.code} · {remaining} {remaining === 1 ? 'cell' : 'cells'} left
            {me && ` · You: ${me.roundScore} pts`}
          </Text>
        </Stack>
        <Inline gap={2}>
          {room.devFill && playing && (
            <Button variant="ghost" size="sm" onClick={room.devFill}>Dev: fill all but 3</Button>
          )}
          {!playing && state.lastResult && (
            <Button variant="secondary" size="sm" onClick={() => setResultsDismissed(null)}>Show results</Button>
          )}
          <Button variant="outline" size="sm" onClick={room.leave}>
            {room.role === 'host' ? 'Close room' : 'Leave game'}
          </Button>
        </Inline>
      </Inline>

      <Grid columns={12} gap={6}>
        <GridItem span={8}>
          <Stack gap={4}>
            <Board
              cells={state.cells}
              players={state.players}
              you={you}
              selected={selected}
              onSelect={setSelected}
              onEnter={enter}
              disabled={inputDisabled}
              fresh={fresh}
            />
            <Text id="board-help" size="sm" tone="muted" className="sr-only">
              Use the arrow keys to move and 1 to 9 to enter a digit. A wrong digit locks you out for 5 seconds.
            </Text>
            <NumberPad cells={state.cells} disabled={inputDisabled || !canEnter} onEnter={enter} />
            {/* Announce only the start and end of a lockout, not every tick of the meter. */}
            <p className="sr-only" role="status">
              {locked ? 'Wrong digit. Locked out for 5 seconds.' : ''}
            </p>
            <div>
              {locked ? (
                <LockoutMeter remainingMs={lockoutMs} />
              ) : (
                <Text size="sm" tone="muted">
                  {playing
                    ? 'Pick an empty cell, then a digit. First correct answer claims the cell. Wrong answers lock you out for 5 seconds.'
                    : state.phase === 'generating'
                      ? 'Generating the next puzzle…'
                      : 'Round over.'}
                </Text>
              )}
            </div>
          </Stack>
        </GridItem>

        <GridItem span={4}>
          <Scoreboard players={state.players} you={you} />
        </GridItem>
      </Grid>

      <ResultsDialog
        room={room}
        open={showResults}
        onClose={() => setResultsDismissed(state.lastResult?.round ?? null)}
      />
    </Stack>
  );
}
