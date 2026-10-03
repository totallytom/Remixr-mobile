/**
 * Batched, cached "is it liked / bookmarked, how many likes" for track cards.
 *
 * Each TrackCard used to fetch its own status (2 requests per card, ~50 on a
 * Search screen). Cards now ask this loader; requests made in the same moment
 * are collected and answered with 2 queries total, and results are cached so
 * scrolling back or revisiting a screen doesn't refetch.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';

export interface TrackStatus {
  likes: number;
  likedByMe: boolean;
  bookmarked: boolean;
}

const BATCH_DELAY_MS = 30;
const CHUNK = 100; // keeps the `in (...)` list a sensible URL length
const TTL_MS = 60_000;

const cache = new Map<string, { status: TrackStatus; at: number }>();
const listeners = new Map<string, Set<() => void>>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;

function emit(id: string) {
  listeners.get(id)?.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = [...pending];
  pending = new Set();
  const userId = currentUserId;
  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const [tracksRes, likedRes, bookmarkRes] = await Promise.all([
        supabase.from('tracks').select('id, likes').in('id', chunk),
        userId
          ? supabase.from('track_likes').select('track_id').eq('user_id', userId).in('track_id', chunk)
          : Promise.resolve({ data: [] as any[], error: null }),
        userId
          ? supabase.from('bookmarks').select('track_id').eq('user_id', userId).in('track_id', chunk)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (userId !== currentUserId) return; // signed out / switched account meanwhile
      const likes = new Map<string, number>((tracksRes.data ?? []).map((r: any) => [r.id, Number(r.likes ?? 0)]));
      const liked = new Set<string>((likedRes.data ?? []).map((r: any) => r.track_id));
      const marked = new Set<string>((bookmarkRes.data ?? []).map((r: any) => r.track_id));
      const now = Date.now();
      for (const id of chunk) {
        cache.set(id, { status: { likes: likes.get(id) ?? 0, likedByMe: liked.has(id), bookmarked: marked.has(id) }, at: now });
        emit(id);
      }
    } catch {
      // Leave uncached; the next request retries.
    }
  }
}

function request(id: string) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, BATCH_DELAY_MS);
}

/** Optimistic/confirmed updates after the user likes or bookmarks. */
export function updateTrackStatus(id: string, patch: Partial<TrackStatus>) {
  const prev = cache.get(id)?.status ?? { likes: 0, likedByMe: false, bookmarked: false };
  cache.set(id, { status: { ...prev, ...patch }, at: Date.now() });
  emit(id);
}

/** Call on sign-in / sign-out: statuses are per user. */
export function resetTrackStatusCache(userId: string | null) {
  if (userId === currentUserId) return;
  currentUserId = userId;
  cache.clear();
  pending = new Set();
  listeners.forEach((set) => set.forEach((l) => l()));
}

function subscribe(trackId: string, cb: () => void) {
  let set = listeners.get(trackId);
  if (!set) { set = new Set(); listeners.set(trackId, set); }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (!set!.size) listeners.delete(trackId);
  };
}

/** Status for one card; undefined until loaded. */
export function useTrackStatus(trackId: string, userId: string | null | undefined): TrackStatus | undefined {
  useEffect(() => {
    // Statuses are per user; switching account clears the cache first.
    resetTrackStatusCache(userId ?? null);
    request(trackId);
  }, [trackId, userId]);

  return useSyncExternalStore(
    (cb) => subscribe(trackId, cb),
    () => cache.get(trackId)?.status,
    () => cache.get(trackId)?.status,
  );
}
