import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import { Play, ThumbsUp, Headphones } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import type { Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import type { WeeklyChartTrack } from '../../services/musicService';
import { supabase } from '../../services/supabase';
import type { HomePagerParamList } from '../../navigation/HomePager';
import PagerHeader from '../../components/layout/PagerHeader';

type ChartsNavProp = MaterialTopTabNavigationProp<HomePagerParamList, 'Charts'>;

type Tab = 'top10' | 'weekly';

const RANK_RING: Record<number, { color: string; bg: string }> = {
  1: { color: '#EAB308', bg: 'rgba(234,179,8,0.18)' },
  2: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.18)' },
  3: { color: '#F97316', bg: 'rgba(249,115,22,0.18)' },
};

const rankStyle = (rank: number) =>
  RANK_RING[rank] ?? { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)' };

export default function ChartsScreen() {
  const navigation = useNavigation<ChartsNavProp>();
  const { playTrack, player, user } = useStore();

  const [activeTab, setActiveTab] = useState<Tab>('top10');

  const [topTracks, setTopTracks] = useState<{ track: Track; likes: number }[]>([]);
  const [isLoadingTop, setIsLoadingTop] = useState(true);

  const [weeklyTracks, setWeeklyTracks] = useState<WeeklyChartTrack[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);

  useEffect(() => {
    supabase
      .from('tracks')
      .select('id, title, artist, album, cover, genre, audio_url, duration, price, likes')
      .order('likes', { ascending: false, nullsFirst: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!error) {
          setTopTracks(
            (data || [])
              .filter(t => (t.likes || 0) > 0)
              .map(t => ({
                track: {
                  id: t.id, title: t.title, artist: t.artist, album: t.album,
                  duration: t.duration || 0, cover: t.cover, genre: t.genre,
                  audioUrl: t.audio_url, price: t.price || 0, boosted: false,
                },
                likes: t.likes || 0,
              }))
          );
        }
      })
      .finally(() => setIsLoadingTop(false));

    MusicService.getWeeklyCharts()
      .then(setWeeklyTracks)
      .catch(() => setWeeklyTracks([]))
      .finally(() => setIsLoadingWeekly(false));
  }, []);

  const handlePlay = (track: Track) => {
    playTrack(track);
    if (user) {
      MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(() => {});
    }
  };

  const isLoading = activeTab === 'top10' ? isLoadingTop : isLoadingWeekly;

  // Normalise both datasets into the same row shape
  type Row = { id: string; rank: number; track: Track; metric: React.ReactNode };

  const rows: Row[] = activeTab === 'top10'
    ? topTracks.map(({ track, likes }, i) => ({
        id: track.id,
        rank: i + 1,
        track,
        metric: (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
            <ThumbsUp size={11} color="#a78bfa" fill="#a78bfa" />
            <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '600' }}>
              {likes.toLocaleString()} {likes === 1 ? 'like' : 'likes'}
            </Text>
          </View>
        ),
      }))
    : weeklyTracks.map(({ track, weeklyPlays, rank }) => ({
        id: track.id,
        rank,
        track,
        metric: (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
            <Headphones size={11} color="#a78bfa" strokeWidth={2} />
            <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '600' }}>
              {weeklyPlays.toLocaleString()} {weeklyPlays === 1 ? 'play' : 'plays'} this week
            </Text>
          </View>
        ),
      }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <PagerHeader />

      {/* Section title */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 }}>
            Remixr Charts
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 1 }}>
            All-time favourites &amp; this week's plays
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 4,
      }}>
        {([
          { key: 'top10', label: 'Top 10 Charts' },
          { key: 'weekly', label: 'This Week' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => {
          const active = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 9,
                alignItems: 'center',
                backgroundColor: active ? '#7c3aed' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                fontSize: 13,
                fontWeight: active ? '700' : '400',
              }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          key={activeTab}
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
              <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                {activeTab === 'top10'
                  ? 'No liked tracks yet. Be the first to like a track!'
                  : 'No weekly data yet — start listening to see tracks rank up!'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCurrentlyPlaying = player.currentTrack?.id === item.track.id && player.isPlaying;
            const { color, bg } = rankStyle(item.rank);
            return (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handlePlay(item.track)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: isCurrentlyPlaying ? 'rgba(124,58,237,0.14)' : 'rgba(255,255,255,0.04)',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: isCurrentlyPlaying ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.07)',
                  padding: 10,
                }}
              >
                {/* Rank badge */}
                <View style={{
                  width: 34, height: 34, borderRadius: 8,
                  backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Text style={{ color, fontWeight: '700', fontSize: item.rank > 9 ? 13 : 15 }}>
                    {item.rank}
                  </Text>
                </View>

                {/* Cover */}
                <Image
                  source={{ uri: item.track.cover }}
                  style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0, backgroundColor: '#1f2937' }}
                  resizeMode="cover"
                  accessibilityLabel={item.track.title}
                />

                {/* Info */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14, lineHeight: 18 }} numberOfLines={1}>
                    {item.track.title}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.track.artist}
                  </Text>
                  {item.metric}
                </View>

                {/* Play button */}
                <TouchableOpacity
                  onPress={() => handlePlay(item.track)}
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: isCurrentlyPlaying ? '#7c3aed' : 'rgba(124,58,237,0.35)',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Play size={14} color="#fff" fill="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
