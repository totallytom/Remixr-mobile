import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Play,
  Pause,
  Lock,
  Unlock,
  MessageSquare,
  Send,
  Clock,
  Music2,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { MusicService } from '../services/musicService';
import type { Track } from '../store/useStore';
import type { Comment } from '../store/useStore';
import { getAvatarUrl } from '../utils/avatar';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Extended comment with optional playback timestamp */
type TimestampComment = Comment & { timestampSeconds?: number };

export default function Remix() {
  const { trackId } = useParams<{ trackId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, player, playTrack, pauseTrack, resumeTrack, seekTo } = useStore();

  const [track, setTrack] = useState<Track | null>(null);
  const [remixes, setRemixes] = useState<Track[]>([]);
  const [versionHistory, setVersionHistory] = useState<Track[]>([]);
  const [comments, setComments] = useState<TimestampComment[]>([]);
  const [loading, setLoading] = useState(!!trackId);
  const [error, setError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState('');
  const [commentAtCurrentTime, setCommentAtCurrentTime] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [remixing, setRemixing] = useState(false);

  const isThisTrack = track && player.currentTrack?.id === track.id;
  const currentTime = isThisTrack ? player.currentTime : 0;
  const duration = track?.duration ?? 0;
  const isPlaying = isThisTrack && player.isPlaying;

  const loadPage = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [t, remixList, versions, commentList] = await Promise.all([
        MusicService.getTrackById(id),
        MusicService.getRemixesOfTrack(id),
        MusicService.getVersionHistory(id),
        MusicService.getTrackComments(id),
      ]);
      setTrack(t);
      setRemixes(remixList);
      setVersionHistory(versions);
      setComments(commentList as TimestampComment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load track');
      setTrack(null);
      setRemixes([]);
      setVersionHistory([]);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trackId) loadPage(trackId);
    else {
      setTrack(null);
      setRemixes([]);
      setVersionHistory([]);
      setComments([]);
      setLoading(false);
      setError(null);
    }
  }, [trackId, loadPage]);

  const handlePlayPause = () => {
    if (!track?.audioUrl) return;
    if (isThisTrack) {
      if (isPlaying) pauseTrack();
      else resumeTrack();
    } else {
      playTrack(track);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (Number.isFinite(t)) seekTo(t);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !track || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const timestampSeconds = commentAtCurrentTime && isThisTrack ? currentTime : undefined;
      const c = await MusicService.addComment(
        track.id,
        user.id,
        newComment.trim(),
        timestampSeconds
      );
      setComments((prev) => [{ ...c, timestampSeconds }, ...prev]);
      setNewComment('');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSeekToComment = (seconds: number) => {
    if (!track) return;
    if (player.currentTrack?.id !== track.id) playTrack(track);
    seekTo(seconds);
  };

  const handleRemixThisTrack = async () => {
    if (!user || !track) return;
    setRemixing(true);
    try {
      const artistName = (user as { artist_name?: string }).artist_name || user.username || 'Artist';
      const newTrack = await MusicService.createRemix(track, user.id, artistName);
      setRemixes((prev) => [newTrack, ...prev]);
      navigate(`/remix/${newTrack.id}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not create remix. Remix feature may require database migration (remix_parent_id).');
    } finally {
      setRemixing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!trackId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <RefreshCw className="w-14 h-14 mx-auto mb-4 opacity-60" style={{ color: 'var(--color-text-secondary)' }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            Remix a track
          </h1>
          <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            Open a track as a remixable unit to fork it, comment at specific times, and see remixes and version history.
          </p>
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="px-6 py-3 rounded-xl font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-on-primary, #fff)',
            }}
          >
            Find tracks to remix
          </button>
        </motion.div>
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-12">
        <p className="text-red-500 mb-4">{error || 'Track not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/remix')}
          className="text-[var(--color-primary)] hover:underline"
        >
          Back to Remix
        </button>
      </div>
    );
  }

  const remixOpen = (track as { remixOpen?: boolean }).remixOpen !== false;
  const versionLabel = (track as { versionLabel?: string }).versionLabel || 'Current';

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8">
      {/* Track header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row gap-4 sm:items-start"
      >
        <div className="flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 rounded-xl overflow-hidden border-2 bg-[var(--color-surface)] border-[var(--color-border)]">
          {track.cover ? (
            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="w-12 h-12 opacity-50" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate" style={{ color: 'var(--color-text)' }}>
            {track.title}
          </h1>
          <p className="text-lg truncate mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {track.artist}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
            >
              <Clock className="w-3.5 h-3.5" />
              {versionLabel}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm"
              style={{
                backgroundColor: remixOpen ? 'var(--color-primary-muted, rgba(59, 130, 246, 0.2))' : 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {remixOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {remixOpen ? 'Remix open' : 'Remix closed'}
            </span>
          </div>
        </div>
      </motion.header>

      {/* Audio player with waveform and time */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border-2 border-[var(--color-border)] p-4"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={handlePlayPause}
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text-on-primary, #fff)' }}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            {/* Waveform-style progress bar */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(duration ? (currentTime / duration) * 100 : 0)}%, var(--color-border) ${(duration ? (currentTime / duration) * 100 : 0)}%, var(--color-border) 100%)`,
              }}
            />
          </div>
        </div>
      </motion.section>

      {/* Primary Remix CTA */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {isAuthenticated && remixOpen ? (
          <button
            type="button"
            onClick={handleRemixThisTrack}
            disabled={remixing}
            className="w-full py-4 px-6 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-on-primary, #fff)',
            }}
          >
            {remixing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <RefreshCw className="w-6 h-6" />
            )}
            Remix this track
          </button>
        ) : !remixOpen ? (
          <div
            className="w-full py-4 px-6 rounded-xl text-center font-medium"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
          >
            <Lock className="w-5 h-5 inline-block mr-2 align-middle" />
            Remixing is closed for this track
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-4 px-6 rounded-xl font-bold text-lg"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '2px solid var(--color-border)',
            }}
          >
            Sign in to remix this track
          </button>
        )}
      </motion.section>

      {/* Remix list */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border-2 border-[var(--color-border)] overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <RefreshCw className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
            Remixes
          </h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {remixes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
              No remixes yet. Be the first to remix this track.
            </p>
          ) : (
            remixes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/remix/${r.id}`)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-background)]">
                  {r.cover ? (
                    <img src={r.cover} alt={r.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 className="w-6 h-6 opacity-50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {r.title}
                  </p>
                  <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {r.artist}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-50" />
              </button>
            ))
          )}
        </div>
      </motion.section>

      {/* Version history */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="rounded-xl border-2 border-[var(--color-border)] overflow-hidden"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Clock className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>
            Version history
          </h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {versionHistory.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
              No version history.
            </p>
          ) : (
            versionHistory.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => v.id !== track.id && navigate(`/remix/${v.id}`)}
                className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${v.id === track.id ? 'opacity-100' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-background)]">
                  {v.cover ? (
                    <img src={v.cover} alt={v.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 className="w-6 h-6 opacity-50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {(v as { versionLabel?: string }).versionLabel || 'Current'}
                  </p>
                  <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {v.title} · {formatTime(v.duration)}
                  </p>
                </div>
                {v.id === track.id && (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-primary-muted)', color: 'var(--color-primary)' }}>
                    Current
                  </span>
                )}
                {v.id !== track.id && <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-50" />}
              </button>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
