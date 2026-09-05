/**
 * Google Keep's own note palette, plus the darker border each colour needs so
 * a card still has an edge when it sits on a white background.
 */
export const NOTE_COLORS = {
  default: { name: 'Default', bg: '#ffffff', border: '#e0e0e0' },
  red: { name: 'Coral', bg: '#faafa8', border: '#f2a099' },
  orange: { name: 'Peach', bg: '#f39f76', border: '#e8956d' },
  yellow: { name: 'Sand', bg: '#fff8b8', border: '#f2eba8' },
  green: { name: 'Mint', bg: '#e2f6d3', border: '#d3e8c4' },
  teal: { name: 'Sage', bg: '#b4ddd3', border: '#a5cec4' },
  blue: { name: 'Fog', bg: '#d4e4ed', border: '#c5d5de' },
  purple: { name: 'Dusk', bg: '#d3bfdb', border: '#c4b0cc' },
  pink: { name: 'Blossom', bg: '#f6e2dd', border: '#e7d3ce' },
  brown: { name: 'Clay', bg: '#e9e3d4', border: '#dad4c5' },
  gray: { name: 'Chalk', bg: '#efeff1', border: '#e0e0e2' },
};

export const COLOR_KEYS = Object.keys(NOTE_COLORS);

export function colorOf(key) {
  return NOTE_COLORS[key] || NOTE_COLORS.default;
}
