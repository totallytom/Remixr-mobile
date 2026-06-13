import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';

const { height: SCREEN_H } = Dimensions.get('window');

// Wraps any panel content with a spring-in fade + slide entrance
const AnimatedPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      damping: 20,
      stiffness: 260,
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
};
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
  Disc2,
  Palette,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import CassettePlayer from './CassettePlayer';
import { hap } from '../../utils/haptics';
import { useImageColors, PALETTES } from '../../hooks/useImageColors';
import WaveformSeekBar from './WaveformSeekBar';

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
      accessibilityRole="adjustable"
      accessibilityLabel={`Seek. ${formatTime(currentTime)} of ${formatTime(duration)}`}
      accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(currentTime) }}
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
    setPlayerPalette,
    playerPaletteIndex,
  } = useStore();

  const [showQueue, setShowQueue] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const palette = useImageColors(track.cover);

  // ── Open / close animation ──────────────────────────────────────────────────
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 9,
      stiffness: 160,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleClose = () => {
    Animated.sequence([
      // small upward bounce before flying off
      Animated.timing(slideAnim, {
        toValue: -28,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 340,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const repeatColor =
    player.repeatMode === 'one' ? palette.accent
    : player.repeatMode === 'all' ? palette.accent
    : 'rgba(255,255,255,0.5)';

  const shuffleColor = player.shuffle ? palette.accent : 'rgba(255,255,255,0.5)';

  return (
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: slideAnim }] }]}>
      <ImageBackground
        source={{ uri: track.cover || DEFAULT_TRACK_COVER }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={20}
      >
        <ScrollView
          style={styles.fsOverlay}
          contentContainerStyle={styles.fsScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.fsHeader}>
            <TouchableOpacity onPress={handleClose} style={styles.fsCircleBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Close player">
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
            <WaveformSeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              isPlaying={isPlaying}
              color={palette.accent}
              seed={track.id}
              barCount={55}
              height={64}
            />
            <View style={styles.fsTimeRow}>
              <Text style={styles.fsTime}>{formatTime(currentTime)}</Text>
              <Text style={styles.fsTime}>{formatTime(duration)}</Text>
            </View>
          </View>

          {/* Main controls */}
          <View style={styles.fsControls}>
            <TouchableOpacity onPress={() => { hap.tap(); toggleShuffle(); }} style={styles.fsSmallBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={player.shuffle ? 'Shuffle on' : 'Shuffle off'} accessibilityState={{ checked: player.shuffle }}>
              <Shuffle size={22} color={shuffleColor} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { hap.tap(); onPrevious(); }} style={styles.fsMedBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Previous track">
              <SkipBack size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { hap.tap(); onPlayPause(); }}
              disabled={player.isBuffering}
              style={[styles.fsPlayBtn, player.isBuffering && { opacity: 0.5 }]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={player.isBuffering ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
              accessibilityState={{ disabled: player.isBuffering }}
            >
              {player.isBuffering
                ? <ActivityIndicator color="#000" />
                : isPlaying
                  ? <Pause size={34} color="#000" />
                  : <Play size={34} color="#000" />}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { hap.tap(); onNext(); }} style={styles.fsMedBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Next track">
              <SkipForward size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { hap.tap(); toggleRepeat(); }} style={[styles.fsSmallBtn, { position: 'relative' }]} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={player.repeatMode === 'off' ? 'Repeat off' : player.repeatMode === 'one' ? 'Repeat one' : 'Repeat all'} accessibilityState={{ checked: player.repeatMode !== 'off' }}>
              <Repeat size={22} color={repeatColor} />
              {player.repeatMode === 'one' && (
                <View style={[styles.repeatBadge, { backgroundColor: palette.accent }]}>
                  <Text style={styles.repeatBadgeText}>1</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Secondary controls */}
          <View style={styles.fsSecondary}>
            <TouchableOpacity
              onPress={() => { hap.medium(); setIsBookmarked(b => !b); }}
              style={styles.fsIconBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              accessibilityState={{ checked: isBookmarked }}
            >
              <Bookmark size={20} color={isBookmarked ? palette.accent : '#fff'} fill={isBookmarked ? palette.accent : 'none'} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { hap.tap(); setShowQueue(v => !v); }}
              style={[styles.fsIconBtn, showQueue && { backgroundColor: `${palette.accent}33` }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showQueue ? 'Hide queue' : `Show queue, ${player.queue.length} tracks`}
              accessibilityState={{ checked: showQueue }}
            >
              <List size={20} color="#fff" />
              {player.queue.length > 0 && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueBadgeText}>{player.queue.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { hap.tap(); onSeek(0); }} style={styles.fsIconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Restart track">
              <RotateCcw size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { hap.tap(); setShowPalette(v => !v); setShowQueue(false); setShowVolume(false); }}
              style={[styles.fsIconBtn, showPalette && { backgroundColor: `${palette.accent}33` }]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Choose player color"
              accessibilityState={{ checked: showPalette }}
            >
              <Palette size={20} color={showPalette ? palette.accent : '#fff'} />
            </TouchableOpacity>
          </View>


          {/* Palette picker panel */}
          {showPalette && (
            <AnimatedPanel>
            <View style={styles.fsPalettePanel}>
              <Text style={styles.fsPaletteTitle}>Player Color</Text>
              <View style={styles.fsPaletteGrid}>
                {/* Auto option */}
                <TouchableOpacity
                  onPress={() => { hap.tap(); setPlayerPalette(null); }}
                  style={[
                    styles.fsPaletteSwatch,
                    { backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: playerPaletteIndex === null ? '#fff' : 'transparent' },
                  ]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Auto color"
                >
                  <Text style={styles.fsPaletteAutoText}>A</Text>
                </TouchableOpacity>

                {PALETTES.map(([accent], i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { hap.tap(); setPlayerPalette(i); }}
                    style={[
                      styles.fsPaletteSwatch,
                      { backgroundColor: accent, borderWidth: 2, borderColor: playerPaletteIndex === i ? '#fff' : 'transparent' },
                    ]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Color option ${i + 1}`}
                    accessibilityState={{ checked: playerPaletteIndex === i }}
                  />
                ))}
              </View>
            </View>
            </AnimatedPanel>
          )}

          {/* Queue panel */}
          {showQueue && (
            <AnimatedPanel>
            <View style={styles.fsQueuePanel}>
              <View style={styles.fsQueueHeader}>
                <Text style={styles.fsQueueTitle}>Queue ({player.queue.length})</Text>
                {player.shuffle && <Text style={styles.fsQueueShuffle}>SHUFFLED</Text>}
              </View>
              {player.queue.length === 0 ? (
                <Text style={styles.fsQueueEmpty}>No tracks in queue</Text>
              ) : (
                <View>
                  {player.queue.map((t: any, index: number) => (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => { hap.tap(); playTrack(t); }}
                      style={styles.queueItem}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Play ${t.title} by ${t.artist}`}
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
                      <TouchableOpacity onPress={() => { hap.medium(); removeFromQueue(t.id); }} activeOpacity={0.7} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${t.title} from queue`}>
                        <X size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            </AnimatedPanel>
          )}
        </ScrollView>
      </ImageBackground>
      </Animated.View>
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
  const { player, dismissPlayer } = useStore() as any;
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [showCassette, setShowCassette] = useState(false);
  const palette = useImageColors(currentTrack?.cover);

  if (!visible || !currentTrack) return null;

  return (
    <>
      {/* Waveform above mini bar */}
      <View style={styles.waveformStrip}>
        <WaveformSeekBar
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
          isPlaying={isPlaying}
          color={palette.accent}
          seed={currentTrack.id}
          barCount={60}
          height={48}
        />
      </View>

      {/* Mini player bar */}
      <View style={styles.miniBar}>
        <View style={styles.miniContent}>
          {/* Album art — tap to open full screen */}
          <TouchableOpacity
            onPress={() => { hap.tap(); setShowFullScreen(true); }}
            style={styles.miniArt}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${currentTrack.title} by ${currentTrack.artist}`}
            accessibilityHint="Opens the full player"
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
          <TouchableOpacity onPress={() => { hap.tap(); onPrevious(); }} style={styles.miniBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Previous track">
            <SkipBack size={20} color="black" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { hap.tap(); onPlayPause(); }}
            disabled={player.isBuffering}
            style={[styles.miniPlayBtn, { backgroundColor: palette.accent }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={player.isBuffering ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
            accessibilityState={{ disabled: player.isBuffering }}
          >
            {player.isBuffering
              ? <ActivityIndicator size="small" color="black" />
              : isPlaying
                ? <Pause size={20} color="black" />
                : <Play size={20} color="black" />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { hap.tap(); onNext(); }} style={styles.miniBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Next track">
            <SkipForward size={20} color="black" />
          </TouchableOpacity>

          {/* Cassette mode */}
          <TouchableOpacity onPress={() => { hap.tap(); setShowCassette(true); }} style={styles.miniBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Open cassette player">
            <Disc2 size={18} color={palette.accent} />
          </TouchableOpacity>

          {/* Hide player */}
          <TouchableOpacity onPress={() => { hap.tap(); onToggleVisibility(); }} style={styles.miniDismissBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Hide player">
            <ChevronDown size={18} color="black" />
          </TouchableOpacity>

          {/* Remove player */}
          <TouchableOpacity onPress={() => { hap.medium(); dismissPlayer(); }} style={styles.miniDismissBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Stop and remove player">
            <X size={16} color="black" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Cassette player */}
      <CassettePlayer
        visible={showCassette}
        onClose={() => setShowCassette(false)}
        isPlaying={isPlaying}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrevious={onPrevious}
        onSeek={onSeek}
        currentTime={currentTime}
        duration={duration}
      />

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
  waveformStrip: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  miniBar: {
    backgroundColor: 'white',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  miniInfo: {
    flex: 1,
    minWidth: 0,
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'black',
  },
  miniArtist: {
    fontSize: 12,
    color: 'black',
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
  },
  fsScrollContent: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 48,
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

  fsPalettePanel: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  fsPaletteTitle: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 12,
  },
  fsPaletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fsPaletteSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPaletteAutoText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
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
