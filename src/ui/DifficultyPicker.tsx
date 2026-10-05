import { Radio, RadioGroup } from '@aaronherbert/design-system';
import { CLUE_TARGETS } from '../engine/sudoku';
import { DIFFICULTIES, type Difficulty } from '../engine/types';

export const difficultyLabel = (d: Difficulty) => d[0].toUpperCase() + d.slice(1);

interface DifficultyPickerProps {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  disabled?: boolean;
  legend?: string;
}

export function DifficultyPicker({ value, onChange, disabled, legend = 'Difficulty' }: DifficultyPickerProps) {
  return (
    <RadioGroup
      legend={legend}
      value={value}
      onValueChange={(v) => onChange(v as Difficulty)}
      disabled={disabled}
      inline
    >
      {DIFFICULTIES.map((d) => (
        <Radio key={d} value={d} label={difficultyLabel(d)} description={`About ${CLUE_TARGETS[d]} clues`} />
      ))}
    </RadioGroup>
  );
}
