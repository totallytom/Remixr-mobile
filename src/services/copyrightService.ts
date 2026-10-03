/**
 * Copyright check service – runs before upload to block known copyrighted content.
 * Uses metadata checks via /api/check-copyright (the file hash check the web app
 * also sends isn't computed on native, so the server skips it).
 * Sends Supabase JWT when available so verified artists (is_verified_artist) can bypass checks.
 */

import { supabase } from './supabase';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export interface CopyrightCheckResult {
  blocked: boolean;
  reason?: string;
}

export async function checkCopyright(metadata: { title: string; artist: string }): Promise<CopyrightCheckResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const res = await fetch(`${API_BASE}/api/check-copyright`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        hash: null,
        title: metadata.title?.trim() || '',
        artist: metadata.artist?.trim() || '',
      }),
    });
    // 404 or 5xx = API not available or server error – allow upload rather than blocking
    if (res.status === 404 || res.status >= 500) {
      return { blocked: false };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error || `Copyright check failed (${res.status}). Please try again.`;
      return { blocked: true, reason: msg };
    }
    const data = (await res.json()) as { blocked: boolean; reason?: string };
    return { blocked: !!data.blocked, reason: data.reason };
  } catch {
    // Network failure or unexpected error — allow upload rather than silently blocking it
    return { blocked: false };
  }
}
