/**
 * User blocking. The database enforces it (supabase/add_user_blocks.sql rejects
 * messages, follows, invites and comments between blocked users); this service
 * manages the block list and hides blocked users' content in the app.
 *
 * The set of hidden user ids (users I blocked + users who blocked me) is cached
 * here rather than in the zustand store: the services that filter with it are
 * themselves imported by the store, so reading the store from them would be a
 * require cycle.
 */
import { supabase } from './supabase';

export interface BlockedUser {
  id: string;
  username: string;
  avatar?: string;
  artistName?: string;
  blockedAt: string;
}

let hiddenUserIds = new Set<string>();

export class BlockService {
  /** Call on sign-in and after any block/unblock. */
  static async loadHiddenUserIds(): Promise<void> {
    const { data, error } = await supabase.rpc('get_hidden_user_ids');
    if (error) {
      console.error('[blocks] Failed to load hidden users:', error.message);
      return;
    }
    hiddenUserIds = new Set((data ?? []) as string[]);
  }

  static clearHiddenUserIds(): void {
    hiddenUserIds = new Set();
  }

  /** True if either user has blocked the other. */
  static isHidden(userId?: string | null): boolean {
    return !!userId && hiddenUserIds.has(userId);
  }

  static async hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const { data } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();
    return !!data;
  }

  static async blockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabase
      .from('user_blocks')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    hiddenUserIds.add(blockedId);
    await this.loadHiddenUserIds();
  }

  static async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) throw new Error(error.message);
    await this.loadHiddenUserIds();
  }

  static async getBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select('created_at, blocked:users!user_blocks_blocked_id_fkey (id, username, avatar, artist_name)')
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((row: any) => row.blocked)
      .map((row: any) => ({
        id: row.blocked.id,
        username: row.blocked.username,
        avatar: row.blocked.avatar ?? undefined,
        artistName: row.blocked.artist_name ?? undefined,
        blockedAt: row.created_at,
      }));
  }
}

/** Drops items authored by hidden users. */
export function withoutHiddenUsers<T>(items: T[], authorId: (item: T) => string | null | undefined): T[] {
  if (hiddenUserIds.size === 0) return items;
  return items.filter((item) => !hiddenUserIds.has(authorId(item) ?? ''));
}
