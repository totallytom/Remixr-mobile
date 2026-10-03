// Deletes the caller's account: their data, their files, their profile row and
// finally their auth user. Runs with the service role so table RLS can't silently
// skip rows (the old client-side deletion stopped working once the website's
// copyright policies landed — a delete RLS refuses returns no error, 0 rows).
//
// POST (Authorization: Bearer <user JWT>) → { success: true } or { error }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MUSIC_BUCKET = 'music-files';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401);
  }
  const jwt = authHeader.slice(7);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's JWT to get their user ID — prevents deleting other accounts
  const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !user) {
    return json({ error: 'Invalid or expired token' }, 401);
  }
  const uid = user.id;

  // Non-critical cleanup failures are logged and skipped (e.g. a table that doesn't
  // exist on this database); the profile/auth deletion at the end is what matters.
  const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run();
    if (error) console.warn(`[delete-account] ${label}: ${error.message}`);
  };

  try {
    // ── 1. References *to* this user's tracks from other people's data ───────
    const { data: ownTracks } = await admin.from('tracks').select('id, status').eq('user_id', uid);
    // Tracks under a DMCA takedown are kept as evidence (the website's policy);
    // deleting the account would orphan the case, so refuse instead.
    if ((ownTracks ?? []).some((t) => t.status === 'disabled')) {
      return json({
        error: 'One of your tracks is under an open copyright case, so the account can\'t be deleted yet. Contact support to close it.',
      }, 409);
    }
    const trackIds = (ownTracks ?? []).map((t) => t.id);
    if (trackIds.length) {
      // Shared-track messages point at tracks with no ON DELETE rule — keep the
      // messages, drop the link.
      await step('messages.track_id', () => admin.from('messages').update({ track_id: null }).in('track_id', trackIds));
      await step('group_messages.track_id', () => admin.from('group_messages').update({ track_id: null }).in('track_id', trackIds));
      await step('playlist_tracks (others)', () => admin.from('playlist_tracks').delete().in('track_id', trackIds));
      await step('bookmarks (others)', () => admin.from('bookmarks').delete().in('track_id', trackIds));
      await step('user_play_history (others)', () => admin.from('user_play_history').delete().in('track_id', trackIds));
      await step('comments (on own tracks)', () => admin.from('comments').delete().in('track_id', trackIds));
    }

    // ── 2. The user's own activity ──────────────────────────────────────────
    await step('user_play_history', () => admin.from('user_play_history').delete().eq('user_id', uid));
    await step('bookmarks', () => admin.from('bookmarks').delete().eq('user_id', uid));
    await step('comments', () => admin.from('comments').delete().eq('user_id', uid));
    await step('posts', () => admin.from('posts').delete().eq('user_id', uid));
    await step('messages', () => admin.from('messages').delete().or(`sender_id.eq.${uid},receiver_id.eq.${uid}`));
    await step('user_follows', () => admin.from('user_follows').delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`));
    await step('follow_requests', () => admin.from('follow_requests').delete().or(`requester_id.eq.${uid},target_id.eq.${uid}`));
    await step('playlist_invitations', () => admin.from('playlist_invitations').delete().or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`));

    // ── 3. The user's own content ───────────────────────────────────────────
    const { data: playlists } = await admin.from('playlists').select('id').eq('created_by', uid);
    const playlistIds = (playlists ?? []).map((p) => p.id);
    if (playlistIds.length) {
      await step('playlist_tracks', () => admin.from('playlist_tracks').delete().in('playlist_id', playlistIds));
      await step('playlist_invitations (own playlists)', () => admin.from('playlist_invitations').delete().in('playlist_id', playlistIds));
    }
    await step('playlists', () => admin.from('playlists').delete().eq('created_by', uid));
    await step('tracks', () => admin.from('tracks').delete().eq('user_id', uid));
    await step('albums', () => admin.from('albums').delete().eq('user_id', uid));
    await step('concerts', () => admin.from('concerts').delete().eq('user_id', uid));

    // ── 4. Uploaded files (audio + covers) ──────────────────────────────────
    for (const folder of [`audio-files/${uid}`, `playlist-covers/${uid}`]) {
      const { data: files } = await admin.storage.from(MUSIC_BUCKET).list(folder, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${folder}/${f.name}`);
      if (paths.length) {
        const { error } = await admin.storage.from(MUSIC_BUCKET).remove(paths);
        if (error) console.warn(`[delete-account] storage ${folder}: ${error.message}`);
      }
    }

    // ── 5. Profile row, then the auth user ──────────────────────────────────
    const { error: profileError } = await admin.from('users').delete().eq('id', uid);
    if (profileError) {
      console.error('[delete-account] users:', profileError.message);
      return json({ error: `Could not delete your profile: ${profileError.message}` }, 500);
    }

    const { error: authError } = await admin.auth.admin.deleteUser(uid);
    if (authError) {
      console.error('[delete-account] auth user:', authError.message);
      return json({ error: `Could not delete your login: ${authError.message}` }, 500);
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error('[delete-account] unexpected:', err);
    return json({ error: 'Account deletion failed. Please try again.' }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
