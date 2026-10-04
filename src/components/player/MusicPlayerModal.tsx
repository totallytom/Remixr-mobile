import React, { useState, useCallback } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  Modal,
  Share,
  StyleSheet,
  ActivityIndicator,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { useStore } from '../../store/useStore';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  X,
} from 'lucide-react-native';
import i18n from '../../i18n';

const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  audioUrl?: string;
  duration?: number;
  genre?: string;
}

interface MusicPlayerModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ─── SeekBar ──────────────────────────────────────────────────────────────────

interface SeekBarProps {
  current: number;
  total: number;
  onSeek: (v: number) => void;
  color?: string;
}

const SeekBar: React.FC<SeekBarProps> = ({ current, total, onSeek, color = '#7c3aed' }) => {
  const [width, setWidth] = useState(0);
  const progress = total > 0 ? Math.min(1, current / total) : 0;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onPress={e => {
        if (width > 0 && total > 0) onSeek((e.nativeEvent.locationX / width) * total);
      }}
      style={styles.seekTrack}
    >
      <View style={[styles.seekFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
    </TouchableOpacity>
  );
};

// ─── MusicPlayerModal ─────────────────────────────────────────────────────────

const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({ track, isOpen, onClose }) => {
  // Drives the app-wide player in the store rather than owning its own audio, so
  // there's only ever one player (the one on the lock screen) and playback carries
  // on in the mini player after this closes.
  const {
    player,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTo,
    setVolume,
  } = useStore() as any;

  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [isLiked, setIsLiked] = useState(false);

  const isCurrent = !!track && player.currentTrack?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;
  const isBuffering = isCurrent && player.isBuffering;
  const currentTime = isCurrent ? player.currentTime : 0;
  const duration = isCurrent && player.duration > 0 ? player.duration : (track?.duration ?? 0);
  const volume: number = player.volume;

  const handlePlayPause = useCallback(async () => {
    if (!track?.audioUrl) return;
    if (!isCurrent) {
      await playTrack(track);
    } else if (isPlaying) {
      await pauseTrack();
    } else {
      await resumeTrack();
    }
  }, [track, isCurrent, isPlaying, playTrack, pauseTrack, resumeTrack]);

  const handleSeek = useCallback(async (newTime: number) => {
    if (isCurrent) await seekTo(newTime);
  }, [isCurrent, seekTo]);

  const handleVolumeChange = useCallback(async (newVol: number) => {
    setIsMuted(false);
    await setVolume(newVol);
  }, [setVolume]);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      setIsMuted(false);
      await setVolume(previousVolume);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      await setVolume(0);
    }
  }, [isMuted, volume, previousVolume, setVolume]);

  const handleShare = useCallback(async () => {
    if (!track) return;
    try {
      await Share.share({
        title: track.title,
        message: track.artist ? i18n.t('player.shareMessage', { title: track.title, artist: track.artist }) : i18n.t('player.shareMessageNoArtist', { title: track.title }),
      });
    } catch {
      // user cancelled or share unavailable
    }
  }, [track]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!track) return null;

  return (
    <Modal
      visible={isOpen}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{i18n.t('player.nowPlaying')}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#d1d5db" />
            </TouchableOpacity>
          </View>

          {/* Album art */}
          <View style={styles.artWrapper}>
            {track.cover ? (
              <Image
                source={{ uri: track.cover }}
                style={styles.art}
                contentFit="cover"
              />
            ) : (
              <View style={styles.artFallback}>
                <Text style={styles.artFallbackText}>♪</Text>
              </View>
            )}
            {isBuffering && (
              <View style={styles.bufferOverlay}>
                <ActivityIndicator size="large" color="#000000" />
              </View>
            )}
          </View>

          {/* Track info */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
            {track.artist ? (
              <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
            ) : null}
            {track.album ? (
              <Text style={styles.trackAlbum} numberOfLines={1}>{track.album}</Text>
            ) : null}
            {track.genre ? (
              <View style={styles.genreBadge}>
                <Text style={styles.genreText}>{track.genre}</Text>
              </View>
            ) : null}
          </View>

          {/* Progress */}
          <View style={styles.progressSection}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
            <SeekBar current={currentTime} total={duration} onSeek={handleSeek} />
          </View>

          {/* Play / Pause */}
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={handlePlayPause}
              disabled={isBuffering}
              style={[styles.playBtn, isBuffering && { opacity: 0.5 }]}
              activeOpacity={0.85}
            >
              {isBuffering
                ? <ActivityIndicator color="#000000" />
                : isPlaying
                  ? <Pause size={22} color="#fff" />
                  : <Play size={22} color="#fff" />}
            </TouchableOpacity>
          </View>

          {/* Volume */}
          <View style={styles.volumeRow}>
            <TouchableOpacity onPress={handleMuteToggle} activeOpacity={0.7} hitSlop={8}>
              {isMuted || volume === 0
                ? <VolumeX size={20} color="#6b7280" />
                : <Volume2 size={20} color="#6b7280" />}
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <SeekBar
                current={isMuted ? 0 : volume}
                total={1}
                onSeek={handleVolumeChange}
                color="#6b7280"
              />
            </View>
            <Volume2 size={20} color="#374151" />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => setIsLiked(v => !v)}
              style={[styles.actionBtn, isLiked && styles.actionBtnLiked]}
              activeOpacity={0.8}
            >
              <Heart size={20} color={isLiked ? '#fff' : '#9ca3af'} fill={isLiked ? '#fff' : 'none'} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleShare} style={styles.actionBtn} activeOpacity={0.8}>
              <Share2 size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // SeekBar
  seekTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    overflow: 'hidden',
  },
  seekFill: {
    height: 6,
    borderRadius: 3,
  },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1c1c2e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Art
  artWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f0f1a',
    marginBottom: 20,
  },
  art: { width: '100%', height: '100%' },
  artFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  artFallbackText: { fontSize: 56, color: 'rgba(255,255,255,0.3)' },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Track info
  trackInfo: { alignItems: 'center', marginBottom: 20 },
  trackTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  trackArtist: { color: '#9ca3af', fontSize: 15, marginTop: 4, textAlign: 'center' },
  trackAlbum: { color: '#6b7280', fontSize: 13, marginTop: 2, textAlign: 'center' },
  genreBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#7c3aed',
    borderRadius: 999,
  },
  genreText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  // Progress
  progressSection: { marginBottom: 20 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: { color: '#6b7280', fontSize: 12 },

  // Controls
  controls: { alignItems: 'center', marginBottom: 20 },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Volume
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLiked: { backgroundColor: '#dc2626' },
});

export default MusicPlayerModal;
