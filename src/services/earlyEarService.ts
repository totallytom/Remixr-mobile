/**
 * Early Ear — points for discovering tracks before they take off.
 * Scoring runs in the database (supabase/add_early_ear.sql); this only reads.
 */
import { supabase } from './supabase';

export type EarlyEarTier = 'listener' | 'scout' | 'tastemaker' | 'oracle';

export interface EarlyEarFind {
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  audioUrl?: string;
  likeRank: number;
  points: number;
  milestone: number;
}

export interface EarlyEarProfile {
  isPublic: boolean;
  /** False when someone else's score is private. */
  visible: boolean;
  points: number;
  tier: EarlyEarTier;
  finds: number;
  hits: number;
  top: EarlyEarFind[];
}

export interface EarlyEarAward {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  cover?: string;
  milestone: number;
  points: number;
  likeRank: number;
}

export interface FirstFan {
  userId: string;
  username: string;
  avatar?: string;
  trackTitle: string;
  likeRank: number;
  foundAt: string;
}

/** Points needed for each tier, in order. */
export const EARLY_EAR_TIERS: { tier: EarlyEarTier; min: number }[] = [
  { tier: 'listener', min: 0 },
  { tier: 'scout', min: 50 },
  { tier: 'tastemaker', min: 250 },
  { tier: 'oracle', min: 1000 },
];

export function nextTier(points: number): { tier: EarlyEarTier; min: number } | null {
  return EARLY_EAR_TIERS.find((t) => t.min > points) ?? null;
}

export class EarlyEarService {
  /** null when the feature isn't set up yet (migration not run) or the user doesn't exist. */
  static async getProfile(userId: string): Promise<EarlyEarProfile | null> {
    const { data, error } = await supabase.rpc('get_early_ear_profile', { p_user_id: userId });
    if (error || !data) return null;
    const d = data as any;
    return {
      isPublic: !!d.is_public,
      visible: !!d.visible,
      points: Number(d.points ?? 0),
      tier: (d.tier ?? 'listener') as EarlyEarTier,
      finds: Number(d.finds ?? 0),
      hits: Number(d.hits ?? 0),
      top: ((d.top ?? []) as any[]).map((r) => ({
        trackId: r.track_id,
        title: r.title,
        artist: r.artist,
        cover: r.cover ?? undefined,
        audioUrl: r.audio_url ?? undefined,
        likeRank: Number(r.like_rank),
        points: Number(r.points),
        milestone: Number(r.milestone),
      })),
    };
  }

  static async getUnseenAwards(): Promise<EarlyEarAward[]> {
    const { data, error } = await supabase.rpc('get_unseen_early_ear_awards');
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.id,
      trackId: r.track_id,
      title: r.title,
      artist: r.artist,
      cover: r.cover ?? undefined,
      milestone: Number(r.milestone),
      points: Number(r.points),
      likeRank: Number(r.like_rank),
    }));
  }

  static async markSeen(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await supabase.rpc('mark_early_ear_awards_seen', { p_ids: ids });
  }

  static async setPublic(isPublic: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_early_ear_public', { p_public: isPublic });
    if (error) throw new Error(error.message);
  }

  static async getFirstFans(limit = 10): Promise<FirstFan[]> {
    const { data, error } = await supabase.rpc('get_first_fans', { p_limit: limit });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      userId: r.user_id,
      username: r.username,
      avatar: r.avatar ?? undefined,
      trackTitle: r.track_title,
      likeRank: Number(r.like_rank),
      foundAt: r.found_at,
    }));
  }
}
