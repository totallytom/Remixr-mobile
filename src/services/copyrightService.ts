/**
 * Copyright check service – runs before upload to block known copyrighted content.
 * Uses metadata + file hash checks via /api/check-copyright.
 * Sends Supabase JWT when available so verified artists (is_verified_artist) can bypass checks.
 */

import { supabase } from './supabase';

const API_BASE = typeof window !== 'undefined' ? '' : '';

export interface CopyrightCheckResult {
  blocked: boolean;
  reason?: string;
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if an upload is allowed (not detected as copyrighted).
 * Call this before uploading the file to storage.
 */
export async function checkCopyright(
  file: File,
  metadata: { title: string; artist: string }
): Promise<CopyrightCheckResult> {
  try {
    const hash = await computeFileHash(file);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const res = await fetch(`${API_BASE}/api/check-copyright`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        hash,
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
    return {
      blocked: !!data.blocked,
      reason: data.reason,
    };
  } catch (e) {
    console.error('Copyright check error:', e);
    // Network/request failed (e.g. CORS, connection refused in local dev) – allow upload so dev works
    const isLikelyDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    return {
      blocked: !isLikelyDev,
      reason: isLikelyDev ? undefined : 'Unable to verify copyright. Please check your connection and try again.',
    };
  }
}
