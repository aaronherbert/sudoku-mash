// Checks WCAG 2.2 AA contrast for every Tide token pair the custom board CSS
// (src/ui/app.css) uses, in both themes. Reads the installed Tide stylesheet,
// so it re-checks automatically when Tide's tokens change.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'node_modules', '@aaronherbert', 'design-system', 'dist', 'styles.css'), 'utf8');

/** Collects `--name: value` declarations from every flat rule whose selector list includes `selector`. */
function declarations(selector) {
  const out = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = selectors.split(',').map((x) => x.trim().replace(/['"]/g, ''));
    if (!list.includes(selector)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) out[name] = value.trim();
  }
  return out;
}

const root = declarations(':root');
const themes = {
  dark: { ...root, ...declarations('[data-theme=dark]') },
  light: { ...root, ...declarations('[data-theme=light]') },
};

function resolve(vars, name, depth = 0) {
  const value = vars[name];
  if (!value) throw new Error(`Token ${name} is not defined`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref && depth < 10) return resolve(vars, ref[1], depth + 1);
  return value;
}

function rgb(value) {
  let hex = value.replace('#', '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Can't parse colour ${value}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

const luminance = (value) => {
  const [r, g, b] = rgb(value).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT = 4.5;
const UI = 3;
/** Semantic names get the --ds-color- prefix; raw palette tokens are passed whole. */
const c = (n) => (n.startsWith('--') ? n : `--ds-color-${n}`);

/**
 * Player colours (src/ui/app.css): one Tide palette per player, all at the same
 * shade, lighter on dark and darker on light. Keep in sync with PLAYER_COLORS.
 */
const PLAYER_COLORS = ['cobalt', 'saffron', 'red', 'green', 'cobalt-alt', 'mist', 'blue', 'amber'];
const PLAYER_SHADE = { dark: 300, light: 700 };
/** Every background a solved digit or seat badge can sit on. */
const PLAYER_BACKGROUNDS = ['surface', 'surface-hover', 'accent-subtle', 'primary-subtle', 'surface-sunken'];

/** [foreground, background, minimum ratio, where it's used] */
const pairs = [
  // Board digits
  ['text', 'surface', TEXT, 'empty/solved cell'],
  ['text', 'surface-sunken', TEXT, 'given cell'],
  ['text', 'surface-hover', TEXT, 'given/solved cell in the selected row, column or box'],
  ['accent-text', 'accent-subtle', TEXT, 'matching digit (saffron)'],
  ['primary-text', 'primary-subtle', TEXT, 'selected cell (cobalt)'],
  // Other text
  ['primary-text', 'surface', TEXT, 'primary text'],
  ['text-muted', 'surface', TEXT, 'muted copy'],
  ['warning-text', 'surface', TEXT, '"Reconnecting…" in the lobby'],
  ['danger-text', 'surface', TEXT, 'error copy'],
  // Non-text (WCAG 1.4.11)
  ['primary', 'primary-subtle', UI, 'selected cell ring'],
  ['primary', 'surface', UI, 'selected cell ring'],
  ['text-subtle', 'surface', UI, '3×3 box lines'],
  ['text-subtle', 'surface-sunken', UI, '3×3 box lines next to given cells'],
  ['text-subtle', 'surface-hover', UI, '3×3 box lines next to highlighted cells'],
  ['focus-ring', 'surface', UI, 'keyboard focus ring'],
  ['focus-ring', 'bg', UI, 'keyboard focus ring on the page'],

  // Arcade look (src/ui/arcade.css)
  ['--ds-mist-950', '--ds-saffron-300', TEXT, 'ink on gold buttons and room code tiles'],
  ['--ds-mist-950', '--ds-cobalt-300', TEXT, 'ink on blue buttons and the chosen difficulty'],
  ['text-muted', 'bg', TEXT, 'muted copy on the page'],
  ['accent-text', 'surface', TEXT, 'scores, player count, difficulty stars'],
  ['primary-text', 'primary-subtle', TEXT, 'your row on the leaderboard'],
  ['danger-text', 'danger-subtle', TEXT, '"Locked out" panel'],
  ['control-border', 'surface', UI, 'number keys, difficulty tiles'],
  ['control-border', 'control-bg', UI, 'name field and room code tiles'],
  ['danger', 'danger-subtle', UI, 'lockout panel edge and meter'],
];

/** Pairs that differ by theme: dark uses bright fills, light adds ink outlines. */
const themePairs = {
  dark: [
    ['--ds-saffron-300', 'bg', TEXT, 'title (gold)'],
    ['--ds-saffron-300', 'bg', UI, 'gold button against the page'],
    ['--ds-cobalt-300', 'bg', UI, 'blue button against the page'],
  ],
  light: [
    ['--ds-cobalt-700', 'bg', TEXT, 'title (cobalt)'],
    ['--ds-mist-950', 'bg', UI, 'ink outline on gold and blue buttons'],
  ],
};

let failures = 0;
for (const [theme, vars] of Object.entries(themes)) {
  const playerPairs = PLAYER_COLORS.flatMap((color) => PLAYER_BACKGROUNDS.map((bg) =>
    [`--ds-${color}-${PLAYER_SHADE[theme]}`, bg, TEXT, `${color} player's digits and seat badge`]));
  // Seat tokens and logo tiles: text on a player-colour fill.
  const onPlayer = theme === 'dark' ? '--ds-mist-950' : 'surface';
  const tokenPairs = PLAYER_COLORS.map((color) =>
    [onPlayer, `--ds-${color}-${PLAYER_SHADE[theme]}`, TEXT, `seat number on the ${color} token`]);
  for (const [fg, bg, min, where] of [...pairs, ...themePairs[theme], ...playerPairs, ...tokenPairs]) {
    const r = ratio(resolve(vars, c(fg)), resolve(vars, c(bg)));
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${r.toFixed(2).padStart(5)}:1 (needs ${min}) ${fg} on ${bg} — ${where}`);
  }
}

if (failures) {
  console.error(`\n${failures} contrast check(s) failed.`);
  process.exit(1);
}
console.log('\nAll contrast checks pass in both themes.');
