import { supabase } from './supabase';
import type { User } from '../store/useStore';

/** Minimal user row for admin list (no sensitive fields beyond what’s needed). */
export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  is_verified_artist: boolean;
  is_admin: boolean;
  artist_name: string | null;
  created_at: string;
}

function toAdminRow(row: any): AdminUserRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    is_verified_artist: row.is_verified_artist ?? false,
    is_admin: row.is_admin ?? false,
    artist_name: row.artist_name ?? null,
    created_at: row.created_at,
  };
}

export class AdminService {
  /** List all users (requires current user to be admin; RLS will block otherwise). */
  static async listUsers(): Promise<AdminUserRow[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, role, is_verified_artist, is_admin, artist_name, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toAdminRow);
  }

  /** Set is_verified_artist for a user (requires admin). */
  static async setVerifiedArtist(userId: string, value: boolean): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ is_verified_artist: value })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  }
}
