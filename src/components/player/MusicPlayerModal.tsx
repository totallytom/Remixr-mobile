import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  Share,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  X,
} from 'lucide-react-native';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [isLiked, setIsLiked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);

  // Load audio when track/isOpen changes
  useEffect(() => {
    if (!track?.audioUrl || !isOpen) return;

    let sound: Audio.Sound | null = null;

    const load = async () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsBuffering(true);

      try {
        await soundRef.current?.unloadAsync();
        soundRef.current = null;

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: track.audioUrl! },
          { shouldPlay: false, volume: isMuted ? 0 : volume },
        );
        sound = newSound;
        soundRef.current = newSound;

        const status = await newSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setDuration(status.durationMillis / 1000);
        }

        newSound.setOnPlaybackStatusUpdate(s => {
          if (!s.isLoaded) return;
          setCurrentTime((s.positionMillis ?? 0) / 1000);
          setIsBuffering(s.isBuffering ?? false);
          if (s.didJustFinish) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        });

        setIsBuffering(false);
      } catch {
        setIsBuffering(false);
      }
    };

    load();

    return () => {
      sound?.unloadAsync().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.audioUrl, isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback(async (newTime: number) => {
    await soundRef.current?.setPositionAsync(newTime * 1000);
    setCurrentTime(newTime);
  }, []);

  const handleVolumeChange = useCallback(async (newVol: number) => {
    setVolume(newVol);
    await soundRef.current?.setVolumeAsync(newVol);
  }, []);

  const handleMuteToggle = useCallback(async () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(previousVolume);
      await soundRef.current?.setVolumeAsync(previousVolume);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      await soundRef.current?.setVolumeAsync(0);
    }
  }, [isMuted, volume, previousVolume]);

  const handleShare = useCallback(async () => {
    if (!track) return;
    try {
      await Share.share({
        title: track.title,
        message: `Check out ${track.title}${track.artist ? ` by ${track.artist}` : ''}`,
      });
    } catch {
      // user cancelled or share unavailable
    }
  }, [track]);

  const handleClose = useCallback(async () => {
    await soundRef.current?.pauseAsync().catch(() => {});
    setIsPlaying(false);
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
            <Text style={styles.headerTitle}>Now Playing</Text>
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
                resizeMode="cover"
              />
            ) : (
              <View style={styles.artFallback}>
                <Text style={styles.artFallbackText}>♪</Text>
              </View>
            )}
            {isBuffering && (
              <View style={styles.bufferOverlay}>
                <ActivityIndicator size="large" color="#fff" />
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
                ? <ActivityIndicator color="#fff" />
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
