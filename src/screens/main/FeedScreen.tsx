import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text as RNText,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pause, Play, Rss, Users } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { supabase } from '../../services/supabase';
import { MusicService } from '../../services/musicService';
import { withoutHiddenUsers } from '../../services/blockService';
import type { Track } from '../../store/useStore';
import { dateLocale } from '../../utils/dateLocale';
import { genreLabel } from '../../utils/genres';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

interface FeedItem {
  track: Track;
  username: string;
  avatar: string | null;
  uploaderId: string;
  postedAt: Date;
}

/** 'following' = drops from people you follow; 'latest' = newest on Re-Mixed. */
type FeedMode = 'following' | 'latest';

const PAGE = 40;

function toFeedItems(rows: any[]): FeedItem[] {
  return rows.map((row: any) => ({
    track: {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      duration: row.duration || 0,
      cover: row.cover,
      genre: row.genre,
      audioUrl: row.audio_url,
      price: row.price || 0,
      boosted: row.boosted || false,
      challengesOpen: row.challenges_open ?? false,
      createdAt: row.created_at ? new Date(row.created_at) : undefined,
    },
    username: row.users?.username || row.artist || '',
    avatar: row.users?.avatar || null,
    uploaderId: row.user_id,
    postedAt: new Date(row.created_at),
  }));
}

async function fetchTracks(uploaderIds?: string[]): Promise<FeedItem[]> {
  let query = supabase
    .from('tracks')
    .select(`
      *,
      users!tracks_user_id_fkey (id, username, avatar)
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (uploaderIds) query = query.in('user_id', uploaderIds);
  const { data, error } = await query;
  if (error || !data) return [];
  return withoutHiddenUsers(toFeedItems(data), (i) => i.uploaderId).filter((i) => !!i.track.audioUrl);
}

/**
 * Drops from people you follow. Guests, and people who don't follow anyone
 * yet (or whose follows haven't posted), get the latest drops on Re-Mixed
 * instead, so the tab is never empty.
 */
async function fetchFeed(userId?: string): Promise<{ items: FeedItem[]; mode: FeedMode }> {
  if (userId) {
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);
    const ids = (follows ?? []).map((f: any) => f.following_id);
    if (ids.length) {
      const items = await fetchTracks(ids);
      if (items.length) return { items, mode: 'following' };
    }
  }
  return { items: await fetchTracks(), mode: 'latest' };
}

export default function FeedScreen() {
  const { t } = useTranslation();
  const { playTrack, pauseTrack, player, user } = useStore() as any;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [mode, setMode] = useState<FeedMode>('latest');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const feed = await fetchFeed(user?.id);
      setItems(feed.items);
      setMode(feed.mode);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handlePlay = (track: Track) => {
    if (player.currentTrack?.id === track.id && player.isPlaying) {
      pauseTrack();
      return;
    }
    playTrack(track);
    if (user) MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(() => {});
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={{ color: '#000000', fontSize: 13 }}>{t('feed.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Rss size={22} color="#8aec9f" strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textBlack, fontSize: 22, fontWeight: '700' }}>{t('feed.title')}</Text>
          <Text style={{ color: colors.textBlack, fontSize: 12, marginTop: 1 }}>
            {mode === 'following' ? t('feed.subtitleFollowing') : t('feed.subtitleLatest')}
          </Text>
        </View>
      </View>

      {mode === 'latest' && items.length > 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Users size={18} color="#374151" />
          <Text style={{ flex: 1, color: '#374151', fontSize: 12, lineHeight: 17 }}>{t('feed.followHint')}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.track.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load(true)}
            tintColor="#7c3aed"
          />
        }
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
            <Users size={52} color="#374151" strokeWidth={1.5} />
            <Text style={{ color: '#121212', fontSize: 16, fontWeight: '600', marginTop: 18 }}>
              {t('feed.emptyTitle')}
            </Text>
            <Text style={{ color: '#121212', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              {t('feed.emptyBody')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentlyPlaying = player.currentTrack?.id === item.track.id && player.isPlaying;
          return (
            <View
              style={{
                backgroundColor: isCurrentlyPlaying ? '#ccfbf1' : '#FFFFFF',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isCurrentlyPlaying ? '#0f766e' : '#e5e7eb',
                padding: 12,
              }}
            >
              {/* Artist row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {item.avatar ? (
                  <Image
                    source={{ uri: item.avatar }}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#1f2937' }}
                  />
                ) : (
                  <View style={{
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: '#2d1f5e',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#a78bfa', fontWeight: '700', fontSize: 14 }}>
                      {item.username[0]?.toUpperCase() || '♪'}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#121212', fontWeight: '600', fontSize: 13 }}>
                    {item.username}
                  </Text>
                  <Text style={{ color: '#4b5563', fontSize: 12 }}>
                    {t('feed.dropped', { time: formatDistanceToNow(item.postedAt, { addSuffix: true, locale: dateLocale() }) })}
                  </Text>
                </View>
              </View>

              {/* Track row */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handlePlay(item.track)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                accessibilityRole="button"
                accessibilityLabel={isCurrentlyPlaying
                  ? t('track.pauseTitle', { title: item.track.title })
                  : t('track.playTitleBy', { title: item.track.title, artist: item.track.artist })}
              >
                <Image
                  source={{ uri: item.track.cover }}
                  style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#1f2937', flexShrink: 0 }}
                  contentFit="cover"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#121212', fontWeight: '600', fontSize: 14, lineHeight: 18 }} numberOfLines={1}>
                    {item.track.title}
                  </Text>
                  <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.track.artist}
                    {item.track.genre ? ` · ${genreLabel(item.track.genre)}` : ''}
                  </Text>
                </View>
                <View
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: '#121212',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  {isCurrentlyPlaying
                    ? <Pause size={15} color="#fff" fill="#fff" />
                    : <Play size={15} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />}
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
