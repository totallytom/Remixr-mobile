import { supabase } from './supabase';
import { Track } from '../store/useStore';
import { safeLog } from '../utils/debugUtils';

export type BoostStatus = 'active' | 'cancelled' | 'expired' | 'past_due';

export interface BoostSubscription {
  id: string;
  userId: string;
  status: BoostStatus;
  plan: 'monthly' | 'annual' | string;
  startedAt: Date;
  expiresAt: Date;
  maxTracks: number;
  tracksBoosted: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class BoostService {
  /**
   * Returns the most recent boost subscription for a user.
   */
  static async getSubscription(userId: string): Promise<BoostSubscription | null> {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('boost_subscriptions' as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (error.message.includes('does not exist')) {
          console.warn('Boost subscriptions table missing. Run the latest database migrations.');
          return null;
        }
        throw new Error(`Failed to fetch boost subscription: ${error.message}`);
      }

      if (!data) return null;

      return this.mapSubscription(data);
    } catch (error) {
      safeLog('BoostService.getSubscription failed', error);
      return null;
    }
  }

  /**
   * Checks whether the user currently has an active subscription.
   */
  static async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) return false;
    const today = new Date();
    return subscription.status === 'active' && subscription.expiresAt > today;
  }

  /**
   * Marks the provided track as boosted.
   */
  static async boostTrack(trackId: string, userId: string): Promise<boolean> {
    try {
      const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
      const { error } = await supabase
        .from('tracks' as any)
        .update({
          boosted: true,
          boost_user_id: userId,
          boost_priority: 1,
          boost_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trackId);

      if (error) {
        throw new Error(`Failed to boost track: ${error.message}`);
      }

      return true;
    } catch (error) {
      safeLog('BoostService.boostTrack failed', { trackId, error });
      throw error instanceof Error ? error : new Error('Failed to boost track');
    }
  }

  /**
   * Removes the boosted status from a track.
   */
  static async unboostTrack(trackId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tracks' as any)
        .update({
          boosted: false,
          boost_user_id: null,
          boost_priority: null,
          boost_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trackId)
        .eq('boost_user_id', userId);

      if (error) {
        throw new Error(`Failed to unboost track: ${error.message}`);
      }

      return true;
    } catch (error) {
      safeLog('BoostService.unboostTrack failed', { trackId, error });
      throw error instanceof Error ? error : new Error('Failed to unboost track');
    }
  }

  /**
   * Returns boosted tracks sorted by priority, limited to the provided number.
   */
  static async getBoostedTracks(limit: number = 10): Promise<Track[]> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('tracks' as any)
        .select('*')
        .eq('boosted', true)
        .gt('boost_expires_at', now)
        .order('boost_priority', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (error.message.includes('column')) {
          console.warn('Boost columns missing on tracks table. Ensure schema is up to date.');
          return [];
        }
        throw new Error(`Failed to fetch boosted tracks: ${error.message}`);
      }

      return (data || []).map(this.mapTrack);
    } catch (error) {
      safeLog('BoostService.getBoostedTracks failed', error);
      return [];
    }
  }

  /**
   * Returns tracks boosted by a specific user.
   */
  static async getUserBoostedTracks(userId: string): Promise<Track[]> {
    if (!userId) return [];

    try {
      const { data, error } = await supabase
        .from('tracks' as any)
        .select('*')
        .eq('boost_user_id', userId)
        .eq('boosted', true)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch user boosted tracks: ${error.message}`);
      }

      return (data || []).map(this.mapTrack);
    } catch (error) {
      safeLog('BoostService.getUserBoostedTracks failed', error);
      return [];
    }
  }

  private static mapSubscription(row: any): BoostSubscription {
    return {
      id: row.id,
      userId: row.user_id,
      status: (row.status || 'active') as BoostStatus,
      plan: (row.plan || 'monthly') as BoostSubscription['plan'],
      startedAt: new Date(row.started_at || row.created_at || Date.now()),
      expiresAt: new Date(row.expires_at || Date.now() + THIRTY_DAYS_MS),
      maxTracks: row.max_tracks ?? 5,
      tracksBoosted: row.tracks_boosted ?? 0,
    };
  }

  private static mapTrack = (dbTrack: any): Track => ({
    id: dbTrack.id,
    title: dbTrack.title,
    artist: dbTrack.artist,
    album: dbTrack.album,
    duration: dbTrack.duration ?? 0,
    cover: dbTrack.cover,
    genre: dbTrack.genre,
    audioUrl: dbTrack.audio_url,
    price: dbTrack.price ?? 0,
    boosted: !!dbTrack.boosted,
    boostExpiresAt: dbTrack.boost_expires_at ? new Date(dbTrack.boost_expires_at) : undefined,
    boostPriority: dbTrack.boost_priority ?? undefined,
    boostUserId: dbTrack.boost_user_id ?? undefined,
  });
}

