import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { DiscoveryCard } from './DiscoveryCard';
import type { Track } from './DiscoveryCard';
import { MusicService } from '../../services/musicService';

const PRELOAD_THRESHOLD = 2;
const FETCH_PAGE_SIZE = 8;
const MAX_VISIBLE = 3;

export interface SwipeStackProps {
  initialTracks: Track[];
  onSwipe: (direction: 'left' | 'right', track: Track) => void;
  onChallenge?: (track: Track) => void;
  fetchMore?: (offset: number) => Promise<Track[]>;
  genre?: string | null;
  resetKey?: string;
}

export const SwipeStack: React.FC<SwipeStackProps> = ({
  initialTracks,
  onSwipe,
  onChallenge,
  fetchMore: fetchMoreProp,
  genre,
  resetKey,
}) => {
  const [queue, setQueue] = useState<Track[]>(initialTracks);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const isExhaustedRef = useRef(false);

  // Reset queue only when resetKey actually changes
  const prevResetKeyRef = useRef<string | undefined>(resetKey);
  useEffect(() => {
    if (resetKey === undefined) return;
    if (prevResetKeyRef.current === resetKey) return;
    prevResetKeyRef.current = resetKey;
    isExhaustedRef.current = false;
    setQueue(initialTracks);
    setCurrentIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Sync queue when parent loads tracks async after mount
  useEffect(() => {
    if (initialTracks.length > 0 && queue.length === 0) {
      setQueue(initialTracks);
      setCurrentIndex(0);
    }
  }, [initialTracks, queue.length]);

  const visibleTracks = queue.slice(currentIndex, currentIndex + MAX_VISIBLE);
  const remainingCount = queue.length - currentIndex;

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || isExhaustedRef.current) return;
    const offset = queue.length;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      let next: Track[];
      if (fetchMoreProp) {
        next = await fetchMoreProp(offset);
      } else if (genre) {
        next = await MusicService.getTracksByGenre(genre, FETCH_PAGE_SIZE, offset);
      } else {
        next = await MusicService.getTracks(FETCH_PAGE_SIZE, offset);
      }
      if (next.length > 0) {
        setQueue(prev => [...prev, ...next]);
      } else {
        isExhaustedRef.current = true;
      }
    } catch (e) {
      console.error('SwipeStack: failed to fetch more tracks', e);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [queue.length, fetchMoreProp, genre]);

  useEffect(() => {
    if (remainingCount > PRELOAD_THRESHOLD) return;
    if (!isExhaustedRef.current) { loadMore(); return; }
    // Source exhausted — recycle swiped tracks in shuffled order
    const played = queue.slice(0, currentIndex);
    if (played.length === 0) return;
    setQueue(prev => [...prev, ...[...played].sort(() => Math.random() - 0.5)]);
  }, [remainingCount, loadMore, queue, currentIndex]);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right', track: Track) => {
      onSwipe(direction, track);
      setCurrentIndex(prev => prev + 1);
    },
    [onSwipe],
  );

  const handleBack = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const canGoBack = currentIndex > 0;

  return (
    <View style={styles.container}>
      {/* Card stack — each DiscoveryCard positions itself via StyleSheet.absoluteFill */}
      {visibleTracks.map((track, index) => (
        <DiscoveryCard
          key={currentIndex + index}
          track={track}
          isTop={index === 0}
          stackIndex={index}
          zIndex={MAX_VISIBLE - index}
          onSwipe={handleSwipe}
          onChallenge={onChallenge}
        />
      ))}

      {/* Empty / loading state */}
      {visibleTracks.length === 0 && (
        <View style={styles.emptyCard}>
          {isLoadingMore ? (
            <>
              <ActivityIndicator size="large" color="#7c3aed" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>Finding more music…</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyEmoji}>♪</Text>
              <Text style={styles.emptyText}>No more tracks to swipe.</Text>
              <Text style={styles.emptySubText}>Try another genre or search.</Text>
            </>
          )}
        </View>
      )}

      {/* Back button */}
      {canGoBack && (
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  emptyCard: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1c1c2e',
  },
  emptyEmoji: {
    fontSize: 56,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptySubText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  backBtn: {
    position: 'absolute',
    top: 28,
    left: 28,
    zIndex: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SwipeStack;
