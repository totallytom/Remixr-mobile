import { supabase } from './supabase';

// Pro-tier artist analytics. Backed by SECURITY DEFINER RPCs (see
// supabase/add_artist_analytics_rpc.sql) that check p_artist_id = auth.uid()
// internally — an artist can only ever fetch their own numbers.
//
// Deliberately does NOT include geographic breakdown: nothing in this schema
// captures listener location (user_play_history has no region/IP column), so a
// "geo breakdown" feature would need new instrumentation before it could show
// anything real. Left out rather than faked.

export interface ArtistOverviewStats {
  totalPlays: number;
  uniqueListeners: number;
  completionRate: number; // 0..1
  newFollowers: number;
}

export interface PlaysByDay {
  day: string; // YYYY-MM-DD
  plays: number;
}

export interface TopTrack {
  trackId: string;
  title: string;
  cover: string;
  plays: number;
}

export class AnalyticsService {
  static async getOverviewStats(artistId: string, days = 30): Promise<ArtistOverviewStats> {
    const { data, error } = await supabase
      .rpc('get_artist_overview_stats', { p_artist_id: artistId, p_days: days })
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching artist overview stats:', error);
      return { totalPlays: 0, uniqueListeners: 0, completionRate: 0, newFollowers: 0 };
    }

    // Not in the hand-maintained Database type in supabase.ts (RPC return shapes
    // aren't modeled there), so this comes back as `unknown` from supabase-js.
    const row = data as { total_plays: number; unique_listeners: number; completion_rate: number; new_followers: number };
    return {
      totalPlays: Number(row.total_plays ?? 0),
      uniqueListeners: Number(row.unique_listeners ?? 0),
      completionRate: Number(row.completion_rate ?? 0),
      newFollowers: Number(row.new_followers ?? 0),
    };
  }

  static async getPlaysByDay(artistId: string, days = 30): Promise<PlaysByDay[]> {
    const { data, error } = await supabase
      .rpc('get_artist_plays_by_day', { p_artist_id: artistId, p_days: days });

    if (error || !data) {
      console.error('Error fetching plays by day:', error);
      return [];
    }

    return data.map((row: any) => ({ day: row.day, plays: Number(row.plays) }));
  }

  static async getTopTracks(artistId: string, days = 30, limit = 10): Promise<TopTrack[]> {
    const { data, error } = await supabase
      .rpc('get_artist_top_tracks', { p_artist_id: artistId, p_days: days, p_limit: limit });

    if (error || !data) {
      console.error('Error fetching top tracks:', error);
      return [];
    }

    return data.map((row: any) => ({
      trackId: row.track_id,
      title: row.title,
      cover: row.cover,
      plays: Number(row.plays),
    }));
  }
}
