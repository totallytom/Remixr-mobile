export type BackgroundPreset = {
  id: string;
  label: string;
  /** Solid fallback colour — also used as the tint behind image presets */
  color: string;
  /** Local require() result. Add @2x / @3x variants alongside the base file. */
  image?: ReturnType<typeof require>;
  /** Dark overlay opacity on top of an image so text stays readable (0–1) */
  overlay?: number;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'default',  label: 'Default',  color: '#121212' },

  // ── Image presets ──────────────────────────────────────────────────────────
  // Once you have created the PNG files in assets/backgrounds/, uncomment the
  // relevant block.  React Native will auto-pick the @2x / @3x variant based
  // on the device pixel density.
  //
  { id: 'teal2x',   label: 'Teal',   color: '#08091a',
  image: require('../../assets/backgrounds/bg1-2x.png')}
  //
  // { id: 'citynight',label: 'City Night',color: '#0a0a10',
  //   image: require('../../assets/backgrounds/citynight.png'), overlay: 0.60 },
];

export const DEFAULT_PRESET_ID = 'default';

export function getPreset(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find(p => p.id === id) ?? BACKGROUND_PRESETS[0];
}
