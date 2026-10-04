import React, { useState, useEffect } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme'
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
import { useTranslation } from 'react-i18next';

type ChartsNavProp = MaterialTopTabNavigationProp<HomePagerParamList, 'Charts'>;

type Tab = 'top10' | 'weekly';

const RANK_RING: Record<number, { color: string; bg: string }> = {
  1: { color: '#121212', bg: 'yellow' },
  2: { color: '#121212', bg: 'silver' },
  3: { color: '#121212', bg: 'rgba(249,115,22,0.18)' },
};

const rankStyle = (rank: number) =>
  RANK_RING[rank] ?? { color: '#121212', bg: '#FFFFFF' };

export default function ChartsScreen() {
  const { t } = useTranslation();
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
        const mapped = (data || [])
          .filter(t => (t.likes || 0) > 0)
          .map(t => ({
            track: {
              id: t.id, title: t.title, artist: t.artist, album: t.album,
              duration: t.duration || 0, cover: t.cover, genre: t.genre,
              audioUrl: t.audio_url, price: t.price || 0, boosted: false,
            },
            likes: t.likes || 0,
          }));
        setTopTracks(mapped);
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
            <ThumbsUp size={11} color="#121212" fill="#ffffff" />
            <Text style={{ color: '#121212', fontSize: 11, fontWeight: '600' }}>
              {t('charts.likes', { count: likes })}
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
            <Headphones size={11} color="#121212" strokeWidth={2} />
            <Text style={{ color: '#121212', fontSize: 11, fontWeight: '600' }}>
              {t('charts.playsWeek', { count: weeklyPlays })}
            </Text>
          </View>
        ),
      }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.dark900 }} edges={['top']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PagerHeader />

      {/* Section title */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 16 }}>
        <Text style={{ color: '#000', fontSize: 24, fontWeight: '700' }}>{t('charts.title')}</Text>
        <Text style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13, marginTop: 2 }}>{t('charts.subtitle')}</Text>
      </View>

      {/* Tabs */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 4,
      }}>
        {([
          { key: 'top10', label: t('charts.top10') },
          { key: 'weekly', label: t('charts.weekly') },
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
                backgroundColor: active ? '#121212' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? '#fff' : '#121212',
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
          <ActivityIndicator size="large" color="#000000" />
          <Text style={{ color: '#000000', fontSize: 13 }}>{t('charts.loading')}</Text>
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
              <Text style={{ color: 'black', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                {activeTab === 'top10'
                  ? t('charts.emptyTop')
                  : t('charts.emptyWeekly')}
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
                  contentFit="cover"
                  accessibilityLabel={item.track.title}
                />

                {/* Info */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#121212', fontWeight: '600', fontSize: 14, lineHeight: 18 }} numberOfLines={1}>
                    {item.track.title}
                  </Text>
                  <Text style={{ color: '#121212', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.track.artist}
                  </Text>
                  {item.metric}
                </View>

                {/* Play button */}
                <TouchableOpacity
                  onPress={() => handlePlay(item.track)}
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: isCurrentlyPlaying ? '#7c3aed' : '#FFFFFF',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Play size={14} color="#121212" fill="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
      </View>
    </SafeAreaView>
  );
}
