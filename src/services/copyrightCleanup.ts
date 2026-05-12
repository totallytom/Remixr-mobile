/**
 * Centralized cleanup when copyrighted content is detected: remove files from storage
 * and optionally delete album/track rows from the database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'music-files';

/**
 * Remove uploaded audio and cover from storage after copyright detection.
 * Call this when ACRCloud (or metadata check) identifies copyrighted content
 * so no files are left in storage.
 */
export async function removeUploadedFilesFromStorage(
  supabase: SupabaseClient,
  options: {
    audioPaths: string[];
    coverPath?: string;
  }
): Promise<void> {
  const { audioPaths, coverPath } = options;
  if (audioPaths.length > 0) {
    await supabase.storage.from(BUCKET).remove(audioPaths);
  }
  if (coverPath) {
    await supabase.storage.from(BUCKET).remove([coverPath]);
  }
}

/**
 * Delete an album and all its tracks from the database.
 * Use when copyrighted content is found after an album was already created
 * (e.g. in a flow that creates then checks).
 */
export async function deleteAlbumAndTracks(
  supabase: SupabaseClient,
  albumId: string
): Promise<{ error: Error | null }> {
  const { error: tracksError } = await supabase
    .from('tracks')
    .delete()
    .eq('album_id', albumId);
  if (tracksError) {
    return { error: new Error(tracksError.message) };
  }
  const { error: albumError } = await supabase
    .from('albums')
    .delete()
    .eq('id', albumId);
  if (albumError) {
    return { error: new Error(albumError.message) };
  }
  return { error: null };
}

/**
 * Delete a single track from the database.
 * Use when copyrighted content is found after a track was already created.
 */
export async function deleteTrack(
  supabase: SupabaseClient,
  trackId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('tracks').delete().eq('id', trackId);
  return { error: error ? new Error(error.message) : null };
}
