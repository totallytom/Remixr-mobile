import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, Rss, Users } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../../store/useStore';
import { supabase } from '../../services/supabase';
import { MusicService } from '../../services/musicService';
import type { Track } from '../../store/useStore';

interface FeedItem {
  track: Track;
  username: string;
  avatar: string | null;
  uploaderId: string;
  postedAt: Date;
}

async function fetchFeed(userId: string): Promise<FeedItem[]> {
  const { data: follows, error: followsError } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followsError || !follows?.length) return [];

  const ids = follows.map((f: any) => f.following_id);

  const { data, error } = await supabase
    .from('tracks')
    .select(`
      *,
      users!tracks_user_id_fkey (id, username, avatar)
    `)
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error || !data) return [];

  return data.map((row: any) => ({
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
    username: row.users?.username || row.artist || 'Unknown',
    avatar: row.users?.avatar || null,
    uploaderId: row.user_id,
    postedAt: new Date(row.created_at),
  }));
}

export default function FeedScreen() {
  const { playTrack, addToQueue, player, user } = useStore();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!user) { setIsLoading(false); return; }
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const feed = await fetchFeed(user.id);
      setItems(feed);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handlePlay = (track: Track) => {
    playTrack(track);
    if (user) MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(() => {});
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Loading feed...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Rss size={22} color="#8aec9f" strokeWidth={2} />
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Feed</Text>
          <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 1 }}>
            New drops from artists you follow
          </Text>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.track.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
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
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 18 }}>
              Nothing here yet
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              Follow some artists in Discover or Search to see their new drops here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrentlyPlaying = player.currentTrack?.id === item.track.id && player.isPlaying;
          return (
            <View
              style={{
                backgroundColor: isCurrentlyPlaying ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isCurrentlyPlaying ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.07)',
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
                      {item.username[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                    {item.username}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>
                    dropped a track · {formatDistanceToNow(item.postedAt, { addSuffix: true })}
                  </Text>
                </View>
              </View>

              {/* Track row */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handlePlay(item.track)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <Image
                  source={{ uri: item.track.cover }}
                  style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#1f2937', flexShrink: 0 }}
                  resizeMode="cover"
                  accessibilityLabel={item.track.title}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14, lineHeight: 18 }} numberOfLines={1}>
                    {item.track.title}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {item.track.artist}
                    {item.track.genre ? ` · ${item.track.genre}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handlePlay(item.track)}
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: isCurrentlyPlaying ? '#7c3aed' : 'rgba(124,58,237,0.35)',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Play size={15} color="#fff" fill="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
