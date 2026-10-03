import type { Track } from '../store/useStore';
import type { WeeklyChartTrack } from '../services/musicService';

const cover = (seed: number) =>
  `https://picsum.photos/seed/track${seed}/200/200`;

const tracks: Track[] = [
  {
    id: 'mock-1', title: 'Neon Drift', artist: 'Kaia Mori', album: 'Night Circuit',
    duration: 214, cover: cover(1), genre: 'Electronic', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-2', title: 'Golden Hour', artist: 'The Sundowners', album: 'West Side Stories',
    duration: 193, cover: cover(2), genre: 'Indie Pop', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-3', title: 'Echoes in Rain', artist: 'Lumen', album: 'Fracture',
    duration: 241, cover: cover(3), genre: 'Ambient', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-4', title: 'Pulse City', artist: 'DARKSYNTH', album: 'Grid Runner',
    duration: 187, cover: cover(4), genre: 'Synthwave', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-5', title: 'Soft Chaos', artist: 'Mélanie Voss', album: 'Tender Static',
    duration: 228, cover: cover(5), genre: 'Alternative', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-6', title: 'Shoreline', artist: 'Coastal Haze', album: 'Drift',
    duration: 207, cover: cover(6), genre: 'Lo-Fi', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-7', title: 'Midnight Frequency', artist: 'Kaia Mori', album: 'Night Circuit',
    duration: 255, cover: cover(7), genre: 'Electronic', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-8', title: 'Still Waters', artist: 'Arlo Pine', album: 'Quiet Season',
    duration: 178, cover: cover(8), genre: 'Folk', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-9', title: 'Haze & Fire', artist: 'DARKSYNTH', album: 'Grid Runner',
    duration: 199, cover: cover(9), genre: 'Synthwave', audioUrl: '', price: 0, boosted: false,
  },
  {
    id: 'mock-10', title: 'The Long Way', artist: 'The Sundowners', album: 'West Side Stories',
    duration: 219, cover: cover(10), genre: 'Indie Pop', audioUrl: '', price: 0, boosted: false,
  },
];

export const MOCK_TOP_TRACKS: { track: Track; likes: number }[] = [
  { track: tracks[0], likes: 4821 },
  { track: tracks[1], likes: 3974 },
  { track: tracks[2], likes: 3102 },
  { track: tracks[3], likes: 2748 },
  { track: tracks[4], likes: 2391 },
  { track: tracks[5], likes: 1887 },
  { track: tracks[6], likes: 1654 },
  { track: tracks[7], likes: 1203 },
  { track: tracks[8], likes:  987 },
  { track: tracks[9], likes:  812 },
];

export const MOCK_WEEKLY_TRACKS: WeeklyChartTrack[] = [
  { rank: 1, track: tracks[3], weeklyPlays: 9204 },
  { rank: 2, track: tracks[0], weeklyPlays: 7811 },
  { rank: 3, track: tracks[4], weeklyPlays: 6530 },
  { rank: 4, track: tracks[6], weeklyPlays: 5247 },
  { rank: 5, track: tracks[1], weeklyPlays: 4388 },
  { rank: 6, track: tracks[9], weeklyPlays: 3762 },
  { rank: 7, track: tracks[2], weeklyPlays: 2994 },
  { rank: 8, track: tracks[7], weeklyPlays: 2401 },
  { rank: 9, track: tracks[5], weeklyPlays: 1876 },
  { rank: 10, track: tracks[8], weeklyPlays: 1344 },
];
