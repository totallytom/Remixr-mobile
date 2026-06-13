import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwipeStack } from '../../components/music/SwipeStack';
import { useStore } from '../../store/useStore';
import type { Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import { BoostService } from '../../services/boostService';
import ChallengeRecordModal from '../../components/music/ChallengeRecordModal';
import type { ChallengeTrack } from '../../components/music/ChallengeRecordModal';

function shuffleTracks<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const Discover: React.FC = () => {
  const { addToQueue, user: currentUser } = useStore();
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [challengeTrack, setChallengeTrack] = useState<ChallengeTrack | null>(null);

  useEffect(() => {
    const loadGenres = async () => {
      try {
        const genres = await MusicService.getAvailableGenres();
        setAvailableGenres(genres);
      } catch (error) {
        console.error('Failed to load genres:', error);
        setAvailableGenres(['Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical']);
      }
    };
    loadGenres();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const LOAD_TIMEOUT_MS = 15000;

    const loadTracks = async () => {
      setIsLoadingTracks(true);
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Load timeout')), LOAD_TIMEOUT_MS)
        );

        const [boosted, regular] = await Promise.race([
          Promise.all([
            BoostService.getBoostedTracks(4).catch(() => [] as Track[]),
            MusicService.getTracks(14),
          ]),
          timeoutPromise,
        ]);

        if (cancelled) return;

        // Boosted tracks lead the stack; deduplicate against regular pool
        const boostedIds = new Set(boosted.map((t) => t.id));
        const uniqueRegular = shuffleTracks(regular.filter((t) => !boostedIds.has(t.id)));
        const composed = [...boosted, ...uniqueRegular].slice(0, 16);

        setAllTracks(composed);
        if (selectedGenre) {
          const genreFiltered = composed.filter((t) => t.genre === selectedGenre);
          setFilteredTracks(genreFiltered.length ? genreFiltered : shuffleTracks(composed));
        } else {
          setFilteredTracks(composed);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load tracks:', error);
        setAllTracks([]);
        setFilteredTracks([]);
      } finally {
        if (!cancelled) setIsLoadingTracks(false);
      }
    };
    loadTracks();
    return () => {
      cancelled = true;
    };
  }, [selectedGenre]);

  const handleChallenge = useCallback((track: Track) => {
    setChallengeTrack({ id: track.id, title: track.title, artist: track.artist, cover: track.cover });
  }, []);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right', track: Track) => {
      if (direction === 'right') {
        addToQueue(track);
        if (currentUser) {
          MusicService.recordPlayHistory(currentUser.id, track.id, 0, false).catch(console.error);
          MusicService.addTrackLike(track.id, currentUser.id).catch(() => {});
        }
      }
    },
    [addToQueue, currentUser]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <ChallengeRecordModal
        visible={!!challengeTrack}
        track={challengeTrack}
        onClose={() => setChallengeTrack(null)}
      />
    <View className="flex-1 flex-col px-1 pt-1 pb-2 overflow-hidden bg-[#121212]">
      {/* Header */}
      <View className="px-1 pt-1 pb-2 shrink-0">
        <Text className="text-xl font-bold text-white">Swipe to discover</Text>
        <Text className="text-gray-400 text-xs mt-1">
          Swipe right to like and add to queue, left to skip. More tracks load as you swipe.
        </Text>
      </View>

      {/* Swipe area */}
      <View className="flex-1 min-h-0">
        {isLoadingTracks ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : (
          <SwipeStack
            initialTracks={filteredTracks}
            onSwipe={handleSwipe}
            onChallenge={handleChallenge}
            genre={selectedGenre}
            resetKey={selectedGenre ?? 'all'}
          />
        )}
      </View>
    </View>
    </SafeAreaView>
  );
};

export default Discover;
