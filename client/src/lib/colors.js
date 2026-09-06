/**
 * The note palette.
 *
 * Each colour is a CSS custom property rather than a hex value, so a note
 * carries the same colour *name* in both themes and the theme decides what
 * that name looks like. Dark mode is not the light palette dimmed — it is
 * Keep's own dark set, where a tinted dark surface still reads as "the yellow
 * note" without turning into a lamp.
 */
export const NOTE_COLORS = {
  default: 'Default',
  red: 'Coral',
  orange: 'Peach',
  yellow: 'Sand',
  green: 'Mint',
  teal: 'Sage',
  blue: 'Fog',
  purple: 'Dusk',
  pink: 'Blossom',
  brown: 'Clay',
  gray: 'Chalk',
};

export const COLOR_KEYS = Object.keys(NOTE_COLORS);

/** The inline style for a note surface in whichever theme is active. */
export function colorStyle(key) {
  const name = NOTE_COLORS[key] ? key : 'default';
  return {
    background: `var(--note-${name})`,
    borderColor: `var(--note-${name}-border)`,
    color: 'var(--note-ink)',
  };
}

export const colorName = (key) => NOTE_COLORS[key] || NOTE_COLORS.default;
