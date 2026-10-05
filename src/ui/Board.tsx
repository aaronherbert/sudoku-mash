import { useRef, type KeyboardEvent } from 'react';
import { boxOf, colOf, rowOf } from '../engine/sudoku';
import type { Cell, PublicPlayer } from '../engine/types';

interface BoardProps {
  cells: Cell[];
  players: PublicPlayer[];
  you: string | null;
  selected: number | null;
  onSelect: (index: number) => void;
  onEnter: (value: number) => void;
  disabled: boolean;
  fresh: Record<number, number>;
}

const ROWS = Array.from({ length: 9 }, (_, r) => r);

export function Board({ cells, players, you, selected, onSelect, onEnter, disabled, fresh }: BoardProps) {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const selectedValue = selected === null ? 0 : cells[selected].value;
  // Roving tabindex: one tab stop for the whole board.
  const focusable = selected ?? 0;

  const moveTo = (index: number) => {
    onSelect(index);
    cellRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = selected ?? 0;
    const r = rowOf(current), c = colOf(current);
    const moves: Record<string, number> = {
      ArrowUp: ((r + 8) % 9) * 9 + c,
      ArrowDown: ((r + 1) % 9) * 9 + c,
      ArrowLeft: r * 9 + ((c + 8) % 9),
      ArrowRight: r * 9 + ((c + 1) % 9),
      Home: r * 9,
      End: r * 9 + 8,
    };
    if (event.key in moves) {
      event.preventDefault();
      moveTo(moves[event.key]);
    } else if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      if (selected === null) onSelect(current);
      onEnter(Number(event.key));
    }
  };

  return (
    <div
      role="grid"
      aria-label="Sudoku board"
      aria-describedby="board-help"
      aria-disabled={disabled || undefined}
      className="board"
      onKeyDown={onKeyDown}
    >
      {ROWS.map((r) => (
        <div role="row" className="board-row" key={r}>
          {ROWS.map((c) => {
            const i = r * 9 + c;
            const cell = cells[i];
            const owner = cell.owner ? byId.get(cell.owner) : undefined;
            const isPeer = selected !== null && i !== selected
              && (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected));
            const classes = [
              'cell',
              cell.given && 'is-given',
              owner && `has-owner player-${owner.color}`,
              isPeer && 'is-peer',
              selectedValue !== 0 && i !== selected && cell.value === selectedValue && 'is-match',
              i === selected && 'is-selected',
              c % 3 === 2 && c !== 8 && 'edge-right',
              r % 3 === 2 && r !== 8 && 'edge-bottom',
              r === 8 && 'last-row',
              fresh[i] && owner?.id !== you && 'is-fresh',
            ].filter(Boolean).join(' ');

            const what = cell.given
              ? `${cell.value}, given`
              : cell.value
                ? `${cell.value}, solved by ${owner ? (owner.id === you ? 'you' : owner.name) : 'a player'}`
                : 'empty';
            return (
              <div
                key={i}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                role="gridcell"
                className={classes}
                tabIndex={i === focusable ? 0 : -1}
                aria-selected={i === selected}
                aria-readonly={cell.value !== 0 || undefined}
                aria-label={`Row ${r + 1}, column ${c + 1}: ${what}`}
                onClick={() => moveTo(i)}
              >
                {cell.value || ''}
                {owner && (
                  <span className="cell-owner" aria-hidden="true">
                    {owner.seat}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
