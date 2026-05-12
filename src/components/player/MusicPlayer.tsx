import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Bookmark,
  List,
  ChevronDown,
  Repeat,
  Shuffle,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';

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

interface MusicPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (time: number) => void;
  currentTime: number;
  duration: number;
  visible: boolean;
  onToggleVisibility: () => void;
}

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// ─── SeekBar ──────────────────────────────────────────────────────────────────

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  color?: string;
  trackColor?: string;
  height?: number;
}

const SeekBar: React.FC<SeekBarProps> = ({
  currentTime,
  duration,
  onSeek,
  color = '#7c3aed',
  trackColor = 'rgba(255,255,255,0.2)',
  height = 4,
}) => {
  const [barWidth, setBarWidth] = useState(0);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      onPress={e => {
        if (barWidth > 0 && duration > 0) {
          onSeek((e.nativeEvent.locationX / barWidth) * duration);
        }
      }}
      style={[styles.seekTrack, { backgroundColor: trackColor, height }]}
    >
      <View style={[styles.seekFill, { width: `${progress * 100}%`, backgroundColor: color, height }]} />
    </TouchableOpacity>
  );
};

// ─── Full-screen player ────────────────────────────────────────────────────────

interface FullScreenPlayerProps {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}

const FullScreenPlayer: React.FC<FullScreenPlayerProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onClose,
}) => {
  const {
    player,
    toggleRepeat,
    toggleShuffle,
    playTrack,
    removeFromQueue,
    setVolume,
  } = useStore();

  const [showQueue, setShowQueue] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  const repeatColor =
    player.repeatMode === 'one' ? '#f59e0b'
    : player.repeatMode === 'all' ? '#7c3aed'
    : 'rgba(255,255,255,0.5)';

  const shuffleColor = player.shuffle ? '#f59e0b' : 'rgba(255,255,255,0.5)';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ImageBackground
        source={{ uri: track.cover || DEFAULT_TRACK_COVER }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={20}
      >
        <View style={styles.fsOverlay}>
          {/* Header */}
          <View style={styles.fsHeader}>
            <TouchableOpacity onPress={onClose} style={styles.fsCircleBtn} activeOpacity={0.8}>
              <ChevronDown size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.fsHeaderCenter}>
              <Text style={styles.fsNowPlaying}>Now Playing</Text>
              {track.album ? <Text style={styles.fsAlbum} numberOfLines={1}>{track.album}</Text> : null}
            </View>
            <View style={{ width: 44 }} />
          </View>

          {/* Album art */}
          <View style={styles.fsArtWrapper}>
            <Image
              source={{ uri: track.cover || DEFAULT_TRACK_COVER }}
              style={styles.fsArt}
              resizeMode="cover"
            />
            {player.isBuffering && (
              <View style={styles.fsBufferingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </View>

          {/* Track info */}
          <View style={styles.fsTrackInfo}>
            <Text style={styles.fsTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.fsArtist} numberOfLines={1}>{track.artist}</Text>
          </View>

          {/* Progress */}
          <View style={styles.fsProgressSection}>
            <SeekBar currentTime={currentTime} duration={duration} onSeek={onSeek} color="#f59e0b" height={5} />
            <View style={styles.fsTimeRow}>
              <Text style={styles.fsTime}>{formatTime(currentTime)}</Text>
              <Text style={styles.fsTime}>{formatTime(duration)}</Text>
            </View>
          </View>

          {/* Main controls */}
          <View style={styles.fsControls}>
            <TouchableOpacity onPress={toggleShuffle} style={styles.fsSmallBtn} activeOpacity={0.7}>
              <Shuffle size={22} color={shuffleColor} />
            </TouchableOpacity>

            <TouchableOpacity onPress={onPrevious} style={styles.fsMedBtn} activeOpacity={0.8}>
              <SkipBack size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onPlayPause}
              disabled={player.isBuffering}
              style={[styles.fsPlayBtn, player.isBuffering && { opacity: 0.5 }]}
              activeOpacity={0.85}
            >
              {player.isBuffering
                ? <ActivityIndicator color="#000" />
                : isPlaying
                  ? <Pause size={34} color="#000" />
                  : <Play size={34} color="#000" />}
            </TouchableOpacity>

            <TouchableOpacity onPress={onNext} style={styles.fsMedBtn} activeOpacity={0.8}>
              <SkipForward size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleRepeat} style={[styles.fsSmallBtn, { position: 'relative' }]} activeOpacity={0.7}>
              <Repeat size={22} color={repeatColor} />
              {player.repeatMode === 'one' && (
                <View style={styles.repeatBadge}>
                  <Text style={styles.repeatBadgeText}>1</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Secondary controls */}
          <View style={styles.fsSecondary}>
            <TouchableOpacity
              onPress={() => setIsBookmarked(b => !b)}
              style={styles.fsIconBtn}
              activeOpacity={0.7}
            >
              <Bookmark size={20} color={isBookmarked ? '#60a5fa' : '#fff'} fill={isBookmarked ? '#60a5fa' : 'none'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowQueue(v => !v)}
              style={[styles.fsIconBtn, showQueue && styles.fsIconBtnActive]}
              activeOpacity={0.7}
            >
              <List size={20} color="#fff" />
              {player.queue.length > 0 && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueBadgeText}>{player.queue.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowVolume(v => !v)}
              style={[styles.fsIconBtn, showVolume && styles.fsIconBtnActive]}
              activeOpacity={0.7}
            >
              {player.volume === 0 ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onSeek(0)} style={styles.fsIconBtn} activeOpacity={0.7}>
              <RotateCcw size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Volume slider (inline) */}
          {showVolume && (
            <View style={styles.fsVolumeRow}>
              <VolumeX size={16} color="rgba(255,255,255,0.5)" />
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <SeekBar
                  currentTime={player.volume}
                  duration={1}
                  onSeek={v => setVolume(v)}
                  color="#f59e0b"
                  height={4}
                />
              </View>
              <Volume2 size={16} color="rgba(255,255,255,0.5)" />
            </View>
          )}

          {/* Queue panel */}
          {showQueue && (
            <View style={styles.fsQueuePanel}>
              <View style={styles.fsQueueHeader}>
                <Text style={styles.fsQueueTitle}>Queue ({player.queue.length})</Text>
                {player.shuffle && <Text style={styles.fsQueueShuffle}>SHUFFLED</Text>}
              </View>
              {player.queue.length === 0 ? (
                <Text style={styles.fsQueueEmpty}>No tracks in queue</Text>
              ) : (
                <FlatList
                  data={player.queue}
                  keyExtractor={(t: any) => t.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: t, index }: { item: any; index: number }) => (
                    <TouchableOpacity
                      onPress={() => playTrack(t)}
                      style={styles.queueItem}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.queueIndex}>{index + 1}</Text>
                      <Image
                        source={{ uri: t.cover || DEFAULT_TRACK_COVER }}
                        style={styles.queueCover}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.queueTitle} numberOfLines={1}>{t.title}</Text>
                        <Text style={styles.queueArtist} numberOfLines={1}>{t.artist}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeFromQueue(t.id)} activeOpacity={0.7} hitSlop={8}>
                        <X size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </ImageBackground>
    </Modal>
  );
};

// ─── MusicPlayer (mini bar) ───────────────────────────────────────────────────

const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  currentTime,
  duration,
  visible,
  onToggleVisibility,
}) => {
  const { player } = useStore();
  const [showFullScreen, setShowFullScreen] = useState(false);

  if (!visible || !currentTrack) return null;

  return (
    <>
      {/* Mini player bar */}
      <View style={styles.miniBar}>
        {/* Progress line at top edge */}
        <SeekBar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          color="#0ea5e9"
          trackColor="#e5e7eb"
          height={3}
        />

        <View style={styles.miniContent}>
          {/* Album art — tap to open full screen */}
          <TouchableOpacity
            onPress={() => setShowFullScreen(true)}
            style={styles.miniArt}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: currentTrack.cover || DEFAULT_TRACK_COVER }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </TouchableOpacity>

          {/* Track info */}
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>

          {/* Controls */}
          <TouchableOpacity onPress={onPrevious} style={styles.miniBtn} activeOpacity={0.7}>
            <SkipBack size={20} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onPlayPause}
            disabled={player.isBuffering}
            style={styles.miniPlayBtn}
            activeOpacity={0.85}
          >
            {player.isBuffering
              ? <ActivityIndicator size="small" color="#fff" />
              : isPlaying
                ? <Pause size={20} color="#fff" />
                : <Play size={20} color="#fff" />}
          </TouchableOpacity>

          <TouchableOpacity onPress={onNext} style={styles.miniBtn} activeOpacity={0.7}>
            <SkipForward size={20} color="#111827" />
          </TouchableOpacity>

          {/* Hide player */}
          <TouchableOpacity onPress={onToggleVisibility} style={styles.miniDismissBtn} activeOpacity={0.7}>
            <ChevronDown size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Full-screen player */}
      {showFullScreen && (
        <FullScreenPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onPlayPause={onPlayPause}
          onNext={onNext}
          onPrevious={onPrevious}
          onSeek={onSeek}
          onClose={() => setShowFullScreen(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  // ── SeekBar ────────────────────────────────────────────────────────────────
  seekTrack: {
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  seekFill: {
    borderRadius: 4,
  },

  // ── Mini player ────────────────────────────────────────────────────────────
  miniBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  miniContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  miniArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
    flexShrink: 0,
  },
  miniInfo: {
    flex: 1,
    minWidth: 0,
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  miniArtist: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1,
  },
  miniBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  miniPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  miniDismissBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Full-screen player ─────────────────────────────────────────────────────
  fsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  fsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  fsCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsHeaderCenter: { alignItems: 'center', flex: 1 },
  fsNowPlaying: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
  fsAlbum: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2, maxWidth: 200 },

  fsArtWrapper: {
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  fsArt: { width: '100%', height: '100%' },
  fsBufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fsTrackInfo: { alignItems: 'center', marginBottom: 24 },
  fsTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  fsArtist: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 6, textAlign: 'center' },

  fsProgressSection: { marginBottom: 28 },
  fsTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  fsTime: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  fsControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  fsSmallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsMedBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  repeatBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: { color: '#000', fontSize: 8, fontWeight: '700' },

  fsSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  fsIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsIconBtnActive: { backgroundColor: 'rgba(245,158,11,0.25)' },
  queueBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueBadgeText: { color: '#000', fontSize: 9, fontWeight: '700' },

  fsVolumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  fsQueuePanel: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    padding: 16,
    maxHeight: 240,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fsQueueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fsQueueTitle: { color: '#fff', fontWeight: '600', fontSize: 14 },
  fsQueueShuffle: { color: '#f59e0b', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  fsQueueEmpty: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingVertical: 12, fontSize: 13 },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  queueIndex: { color: 'rgba(255,255,255,0.4)', fontSize: 12, width: 20, textAlign: 'center' },
  queueCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#374151' },
  queueTitle: { color: '#fff', fontSize: 13, fontWeight: '500' },
  queueArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
});

export default MusicPlayer;
