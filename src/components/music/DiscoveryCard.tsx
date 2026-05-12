import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, PanResponder } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause, Star } from 'lucide-react-native';

// ─── Track type ───────────────────────────────────────────────────────────────
export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  audioUrl?: string;
  duration?: number;
  genre?: string;
  boosted?: boolean;
  previewStartSec?: number;
  previewDurationSec?: number;
}

interface DiscoveryCardProps {
  track: Track;
  onSwipe: (direction: 'left' | 'right', track: Track) => void;
  isTop?: boolean;
  stackIndex?: number;
  zIndex?: number;
}

const SWIPE_THRESHOLD = 80;
const EXIT_OFFSET = 500;
const DEFAULT_PREVIEW_DURATION = 20;
const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

const DiscoveryCardComponent: React.FC<DiscoveryCardProps> = ({
  track,
  onSwipe,
  isTop = true,
  stackIndex = 0,
  zIndex: zIndexProp,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isExiting = useRef(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const previewStart = Math.max(0, track.previewStartSec ?? 0);
  const previewDuration = Math.min(
    DEFAULT_PREVIEW_DURATION,
    Math.max(1, track.previewDurationSec ?? DEFAULT_PREVIEW_DURATION),
  );
  const previewEnd = previewStart + previewDuration;

  // ── Derived interpolations ────────────────────────────────────────────────
  const rotate = translateX.interpolate({
    inputRange: [-200, 200],
    outputRange: ['-25deg', '25deg'],
    extrapolate: 'clamp',
  });
  const cardOpacity = translateX.interpolate({
    inputRange: [-200, -150, 0, 150, 200],
    outputRange: [0, 1, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const likeOpacity = translateX.interpolate({
    inputRange: [50, 150],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = translateX.interpolate({
    inputRange: [-150, -50],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // ── Audio cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  // ── Preview toggle ────────────────────────────────────────────────────────
  const togglePreview = useCallback(async () => {
    if (!track.audioUrl) return;

    if (isPreviewPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPreviewPlaying(false);
      return;
    }

    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.audioUrl },
          { positionMillis: previewStart * 1000 },
        );
        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate(status => {
          if (
            status.isLoaded &&
            status.positionMillis != null &&
            status.positionMillis >= previewEnd * 1000 - 100
          ) {
            sound.pauseAsync();
            sound.setPositionAsync(previewStart * 1000);
            setIsPreviewPlaying(false);
          }
        });
      } else {
        await soundRef.current.setPositionAsync(previewStart * 1000);
      }

      await soundRef.current.playAsync();
      setIsPreviewPlaying(true);
    } catch {
      setIsPreviewPlaying(false);
    }
  }, [track.audioUrl, isPreviewPlaying, previewStart, previewEnd]);

  // ── Swipe callback ────────────────────────────────────────────────────────
  const triggerSwipe = useCallback(
    (direction: 'left' | 'right') => {
      onSwipe(direction, track);
    },
    [onSwipe, track],
  );

  // ── Pan responder ─────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: () => isTop,
      onPanResponderMove: (_, { dx }) => {
        if (!isExiting.current) translateX.setValue(dx);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        if (isExiting.current) return;
        // PanResponder vx is px/ms; 0.8 px/ms ≈ 800 px/s
        const swipedRight = dx > SWIPE_THRESHOLD || vx > 0.8;
        const swipedLeft  = dx < -SWIPE_THRESHOLD || vx < -0.8;

        if (swipedRight || swipedLeft) {
          isExiting.current = true;
          const target    = swipedRight ? EXIT_OFFSET : -EXIT_OFFSET;
          const direction = swipedRight ? 'right' : 'left';
          Animated.spring(translateX, {
            toValue: target,
            useNativeDriver: true,
            stiffness: 300,
            damping: 30,
          }).start(() => triggerSwipe(direction));
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 300,
            damping: 30,
          }).start();
        }
      },
    })
  ).current;

  const scale = isTop ? 1 : Math.max(0.85, 1 - stackIndex * 0.05);
  const ty    = isTop ? 0 : stackIndex * 6;
  const zi    = zIndexProp !== undefined ? zIndexProp : isTop ? 10 : 10 - stackIndex;

  const artwork = track.cover || DEFAULT_TRACK_COVER;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.wrapper,
        {
          zIndex: zi,
          opacity: isTop ? cardOpacity : 1,
          transform: isTop
            ? [{ translateX }, { translateY: ty }, { rotate }, { scale }]
            : [{ translateY: ty }, { scale }],
        },
      ]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <View style={styles.card}>
        {/* Featured badge */}
        {track.boosted && (
          <View style={styles.featuredBadge}>
            <Star size={11} color="#713f12" fill="#713f12" />
            <Text style={styles.featuredText}>FEATURED</Text>
          </View>
        )}

        {/* Like / Nope stamps */}
        {isTop && (
          <>
            <Animated.View style={[styles.likeStamp, { opacity: likeOpacity }]}>
              <Text style={styles.likeText}>Like</Text>
            </Animated.View>
            <Animated.View style={[styles.nopeStamp, { opacity: nopeOpacity }]}>
              <Text style={styles.nopeText}>Nope</Text>
            </Animated.View>
          </>
        )}

        {/* Artwork */}
        {artwork ? (
          <Image
            source={{ uri: artwork }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.artworkFallback}>
            <Text style={styles.artworkFallbackText}>♪</Text>
          </View>
        )}

        {/* Info gradient overlay */}
        <View style={styles.infoOverlay}>
          <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
          {track.artist ? (
            <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
          ) : null}
          {track.genre ? (
            <Text style={styles.trackGenre} numberOfLines={1}>{track.genre}</Text>
          ) : null}
        </View>

        {/* Preview button */}
        {isTop && track.audioUrl && (
          <TouchableOpacity
            onPress={togglePreview}
            style={styles.previewBtn}
            activeOpacity={0.8}
          >
            {isPreviewPlaying
              ? <Pause size={22} color="#fff" />
              : <Play size={22} color="#fff" />}
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    flex: 1,
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#171717',
  },
  artworkFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkFallbackText: {
    fontSize: 64,
    color: 'rgba(255,255,255,0.3)',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(234,179,8,0.9)',
  },
  featuredText: {
    color: '#713f12',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  likeStamp: {
    position: 'absolute',
    top: 32,
    left: 24,
    zIndex: 10,
    borderWidth: 4,
    borderColor: '#22c55e',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    transform: [{ rotate: '-20deg' }],
  },
  likeText: {
    color: '#22c55e',
    fontSize: 28,
    fontWeight: '900',
  },
  nopeStamp: {
    position: 'absolute',
    top: 32,
    right: 24,
    zIndex: 10,
    borderWidth: 4,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    transform: [{ rotate: '20deg' }],
  },
  nopeText: {
    color: '#ef4444',
    fontSize: 28,
    fontWeight: '900',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 24,
    backgroundColor: 'transparent',
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  trackArtist: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  trackGenre: {
    fontSize: 13,
    color: '#a78bfa',
    marginTop: 2,
  },
  previewBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const DiscoveryCard = React.memo(DiscoveryCardComponent);
export default DiscoveryCard;
