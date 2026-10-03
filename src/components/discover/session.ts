// Discover session: what you've liked/skipped since you last reset, plus a
// "Taste DNA" breakdown of the genres you like. Mirrors the website's Discover
// session panel (sypher/src/components/discover/SessionPanel.tsx).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../../store/useStore';

export interface DiscoverSession {
  liked: Track[];
  skipped: number;
  streak: number;
  bestStreak: number;
}

export const EMPTY_SESSION: DiscoverSession = { liked: [], skipped: 0, streak: 0, bestStreak: 0 };

const STORAGE_KEY = 'rmx_discover_session';
const MAX_LIKED = 50;

export const DNA_COLORS = ['#5eead4', '#F5FF00', '#f9a8d4', '#c4b5fd', '#fdba74', '#7dd3fc'];

export interface DnaSlice {
  genre: string;
  pct: number;
  color: string;
}

export function tasteDna(liked: Track[]): DnaSlice[] {
  const counts = new Map<string, number>();
  liked.forEach((t) => {
    const g = t.genre || 'Other';
    counts.set(g, (counts.get(g) ?? 0) + 1);
  });
  const total = liked.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre, n], i) => ({ genre, pct: Math.round((n / total) * 100), color: DNA_COLORS[i % DNA_COLORS.length] }));
}

export function recordSwipe(s: DiscoverSession, direction: 'left' | 'right', track: Track): DiscoverSession {
  if (direction === 'left') return { ...s, skipped: s.skipped + 1, streak: 0 };
  const streak = s.streak + 1;
  return {
    ...s,
    liked: s.liked.some((t) => t.id === track.id) ? s.liked : [...s.liked, track].slice(-MAX_LIKED),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
  };
}

export async function loadSession(): Promise<DiscoverSession> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_SESSION, ...JSON.parse(raw) } : EMPTY_SESSION;
  } catch {
    return EMPTY_SESSION;
  }
}

export async function saveSession(s: DiscoverSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable — the session still works in memory.
  }
}
