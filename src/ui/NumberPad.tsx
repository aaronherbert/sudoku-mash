import { Button } from '@aaronherbert/design-system';
import type { Cell } from '../engine/types';

interface NumberPadProps {
  cells: Cell[];
  disabled: boolean;
  onEnter: (value: number) => void;
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function NumberPad({ cells, disabled, onEnter }: NumberPadProps) {
  const placed = (d: number) => cells.filter((c) => c.value === d).length;
  return (
    <div className="numpad" role="group" aria-label="Enter a digit">
      {DIGITS.map((d) => {
        const done = placed(d) >= 9;
        return (
          <Button
            key={d}
            variant="outline"
            size="lg"
            disabled={disabled || done}
            aria-label={done ? `${d}, all placed` : `Enter ${d}`}
            onClick={() => onEnter(d)}
          >
            {d}
          </Button>
        );
      })}
    </div>
  );
}
