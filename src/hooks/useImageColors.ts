import { useMemo } from 'react';
import { useStore } from '../store/useStore';

export interface Palette {
  accent: string;
  dark: string;
}

// Curated pairs: [accent, dark]
export const PALETTES: [string, string][] = [
  ['#f59e0b', '#78350f'], // amber
  ['#10b981', '#064e3b'], // emerald
  ['#6366f1', '#312e81'], // indigo
  ['#ec4899', '#831843'], // pink
  ['#14b8a6', '#134e4a'], // teal
  ['#f97316', '#7c2d12'], // orange
  ['#8b5cf6', '#4c1d95'], // violet
  ['#06b6d4', '#164e63'], // cyan
  ['#ef4444', '#7f1d1d'], // red
  ['#84cc16', '#365314'], // lime
  ['#a855f7', '#581c87'], // purple
  ['#0ea5e9', '#0c4a6e'], // sky
  ['#f43f5e', '#881337'], // rose
  ['#22c55e', '#14532d'], // green
  ['#fb923c', '#7c2d12'], // orange-light
  ['#e879f9', '#701a75'], // fuchsia
];

const FALLBACK: Palette = { accent: PALETTES[0][0], dark: PALETTES[0][1] };

function hashUrl(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function useImageColors(url: string | undefined | null): Palette {
  const paletteIndex = useStore((s: any) => s.playerPaletteIndex);

  return useMemo(() => {
    if (paletteIndex !== null && paletteIndex !== undefined) {
      const [accent, dark] = PALETTES[paletteIndex % PALETTES.length];
      return { accent, dark };
    }
    if (!url) return FALLBACK;
    const [accent, dark] = PALETTES[hashUrl(url) % PALETTES.length];
    return { accent, dark };
  }, [url, paletteIndex]);
}
