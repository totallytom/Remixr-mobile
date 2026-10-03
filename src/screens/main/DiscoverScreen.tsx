import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text as RNText, ActivityIndicator, TouchableOpacity, type TextProps } from 'react-native';
import { X as XIcon } from 'lucide-react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme'

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwipeStack } from '../../components/music/SwipeStack';
import { useStore } from '../../store/useStore';
import type { Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import ChallengeRecordModal from '../../components/music/ChallengeRecordModal';
import type { ChallengeTrack } from '../../components/music/ChallengeRecordModal';
import { SessionStrip, SessionSheet } from '../../components/discover/SessionSheet';
import { EMPTY_SESSION, loadSession, recordSwipe, saveSession, type DiscoverSession } from '../../components/discover/session';
import { requireAuth } from '../../components/auth/GuestPrompt';
import { useTranslation } from 'react-i18next';
import { genreLabel } from '../../utils/genres';
import { updateTrackStatus } from '../../services/trackStatusLoader';

function shuffleTracks<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const Discover: React.FC = () => {
  const { t } = useTranslation();
  const { addToQueue, playTrack, user: currentUser } = useStore();
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [challengeTrack, setChallengeTrack] = useState<ChallengeTrack | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // ── Discover session (likes, streak, Taste DNA) — persisted between launches ──
  const [session, setSession] = useState<DiscoverSession>(EMPTY_SESSION);
  const [showSession, setShowSession] = useState(false);
  const sessionLoaded = useRef(false);
  useEffect(() => {
    loadSession().then((s) => { setSession(s); sessionLoaded.current = true; });
  }, []);
  useEffect(() => {
    if (sessionLoaded.current) saveSession(session);
  }, [session]);

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

        const tracks = await Promise.race([
          currentUser?.id
            ? MusicService.getRecommendedTracks(currentUser.id, 24)
            : MusicService.getTracks(24),
          timeoutPromise,
        ]);

        if (cancelled) return;

        // Filter out tracks already swiped this session so each load feels like a fresh batch
        const fresh = tracks.filter((t) => !seenIdsRef.current.has(t.id));
        // getRecommendedTracks puts boosted tracks first — only shuffle the regular tail
        const boostedCount = Math.min(4, Math.floor(fresh.length * 0.4));
        const composed = [
          ...fresh.slice(0, boostedCount),
          ...shuffleTracks(fresh.slice(boostedCount)),
        ];

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
  }, [selectedGenre, currentUser?.id]);

  const handleChallenge = useCallback((track: Track) => {
    if (!requireAuth('challenge')) return;
    setChallengeTrack({ id: track.id, title: track.title, artist: track.artist, cover: track.cover });
  }, []);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right', track: Track) => {
      seenIdsRef.current.add(track.id);
      setSession((s) => recordSwipe(s, direction, track));
      if (direction === 'right') {
        addToQueue(track);
        if (currentUser) {
          MusicService.recordPlayHistory(currentUser.id, track.id, 0, false).catch(console.error);
          MusicService.addTrackLike(track.id, currentUser.id)
            .then((r) => updateTrackStatus(track.id, { likedByMe: !!r.liked, likes: Number(r.likes ?? 0) }))
            .catch(() => {});
        }
      }
    },
    [addToQueue, currentUser]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ChallengeRecordModal
        visible={!!challengeTrack}
        track={challengeTrack}
        onClose={() => setChallengeTrack(null)}
      />
    <View className="flex-1 flex-col px-1 pt-1 pb-2 overflow-hidden">
      {/* Header */}
      <View className="px-1 pt-1 pb-2 shrink-0">
        <Text className="text-xl font-bold text-Black">{t('discover.title')}</Text>
        <Text className="text-dark text-xs mt-1">
          {t('discover.subtitle')}
        </Text>
      </View>

      {/* Session stats — tap for Taste DNA and liked tracks */}
      <View className="px-1 pb-2 shrink-0">
        <SessionStrip session={session} onOpen={() => setShowSession(true)} />
        {selectedGenre && (
          <TouchableOpacity
            onPress={() => setSelectedGenre(null)}
            accessibilityRole="button"
            accessibilityLabel={t('discover.showingGenre', { genre: genreLabel(selectedGenre) })}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2, borderColor: '#000', borderRadius: 999, backgroundColor: '#000' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{genreLabel(selectedGenre)}</Text>
            <XIcon size={12} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Swipe area */}
      <View className="flex-1 min-h-0">
        {isLoadingTracks ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#000000" />
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
      <SessionSheet
        visible={showSession}
        session={session}
        activeGenre={selectedGenre}
        onClose={() => setShowSession(false)}
        onPlay={(t) => { setShowSession(false); playTrack(t); }}
        onDigDeeper={(g) => { setShowSession(false); setSelectedGenre(g); }}
        onReset={() => setSession(EMPTY_SESSION)}
      />
    </SafeAreaView>
  );
};

export default Discover;
