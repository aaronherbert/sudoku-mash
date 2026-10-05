import { useId } from 'react';
import { CLUE_TARGETS } from '../engine/sudoku';
import { DIFFICULTIES, type Difficulty } from '../engine/types';

export const difficultyLabel = (d: Difficulty) => d[0].toUpperCase() + d.slice(1);

interface DifficultyPickerProps {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
  legend?: string;
}

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" />
    </svg>
  );
}

/** Native radios, drawn as arcade tiles with one to three stars. */
export function DifficultyPicker({ value, onChange, disabled, legend = 'Difficulty' }: DifficultyPickerProps) {
  const name = useId();
  return (
    <fieldset className="difficulty" disabled={disabled}>
      <legend className="arc-panel__title">{legend}</legend>
      <div className="difficulty__options">
        {DIFFICULTIES.map((d, i) => (
          <label key={d} className="difficulty__option">
            <input
              type="radio"
              name={name}
              value={d}
              checked={value === d}
              onChange={() => onChange(d)}
            />
            <span className="difficulty__stars" aria-hidden="true">
              {DIFFICULTIES.slice(0, i + 1).map((s) => <Star key={s} />)}
            </span>
            <span className="difficulty__name">{difficultyLabel(d)}</span>
            <span className="difficulty__hint">About {CLUE_TARGETS[d]} clues</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
