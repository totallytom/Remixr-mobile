import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import {
  Play,
  Clock,
  Zap,
  Star,
  Users,
  Music,
  List,
  X,
  CreditCard,
  Lock,
  CheckCircle,
  AlertCircle,
  FolderOpen,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import TrackCard from '../../components/music/TrackCard';
import UserCard from '../../components/social/UserCard';
import type { Track, User } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import { AlbumService } from '../../services/albumService';
import type { Album } from '../../services/albumService';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../services/supabase';
import { isMusicianRole } from '../../utils/userRole';
import { proSubscriptionService } from '../../services/proSubscriptionService';
import type { HomePagerParamList } from '../../navigation/HomePager';
import PagerHeader from '../../components/layout/PagerHeader';

type HomeNavProp = MaterialTopTabNavigationProp<HomePagerParamList, 'HomeMain'>;

const Home: React.FC = () => {
  const { playTrack, addToQueue, player, user } = useStore();
  const navigation = useNavigation<HomeNavProp>();

  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>([]);
  const [recentTracks, setRecentTracks] = useState<{ track: Track; playedAt: string }[]>([]);
  const [popularTracks, setPopularTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'details' | 'processing' | 'success' | 'error'>('details');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostPlayedTracks, setMostPlayedTracks] = useState<{ track: Track; playCount: number }[]>([]);
  const [publicFeed, setPublicFeed] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<User[]>([]);
  const [isManagingSubscription, setIsManagingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Load public data once on mount
  useEffect(() => {
    let cancelled = false;

    const safetyTimeout = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 12000);

    const loadPublicData = async () => {
      try {
        setIsLoadingRecommendations(true);

        const [
          { data: recommendedData, error: recommendedError },
          { data: popularData, error: popularError },
          { data: publicData, error: publicErr },
        ] = await Promise.all([
          supabase.from('tracks').select('id, title, artist, album, cover, genre, audio_url, duration, price, created_at').limit(8).order('created_at', { ascending: false }),
          supabase.rpc('get_popular_tracks', { limit_count: 4 }),
          supabase.from('tracks').select('id, title, artist, album, cover, genre, audio_url, duration, price, created_at').order('created_at', { ascending: false }).limit(12),
        ]);

        if (cancelled) return;

        if (recommendedError) {
          console.error('Error fetching recommended tracks:', recommendedError);
          setRecommendedTracks([]);
        } else {
          setRecommendedTracks((recommendedData || []).map(t => ({
            id: t.id, title: t.title, artist: t.artist, album: t.album,
            duration: t.duration || 0, cover: t.cover, genre: t.genre,
            audioUrl: t.audio_url, price: t.price || 0, boosted: false,
            createdAt: t.created_at ? new Date(t.created_at) : undefined,
          })));
        }

        if (popularError) {
          console.error('Error fetching popular tracks:', popularError);
          setPopularTracks([]);
        } else {
          setPopularTracks((popularData || []).map(t => ({
            id: t.id, title: t.title, artist: t.artist, album: t.album,
            duration: t.duration || 0, cover: t.cover, genre: t.genre,
            audioUrl: t.audio_url, price: t.price || 0, boosted: false,
            createdAt: t.created_at ? new Date(t.created_at) : undefined,
          })));
        }

        if (publicErr) {
          console.error('Public feed query failed:', publicErr);
        } else {
          setPublicFeed((publicData || []).map(t => ({
            id: t.id, title: t.title, artist: t.artist, album: t.album,
            duration: t.duration || 0, cover: t.cover, genre: t.genre,
            audioUrl: t.audio_url, price: t.price || 0, boosted: false,
            createdAt: t.created_at ? new Date(t.created_at) : undefined,
          })));
        }
      } catch (err) {
        console.error('Failed to load home data:', err);
        setRecommendedTracks([]);
        setPopularTracks([]);
      } finally {
        setIsLoadingRecommendations(false);
        setIsLoading(false);
      }
    };

    loadPublicData();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
    };
  }, []);

  // Load user-specific data
  useEffect(() => {
    if (!user) {
      setRecentTracks([]);
      setMostPlayedTracks([]);
      return;
    }

    let cancelled = false;

    const loadUserData = async () => {
      try {
        const [{ data: playHistory, error: playHistoryError }] = await Promise.all([
          supabase.from('user_play_history').select(`played_at, tracks:track_id (id, title, artist, album, cover, genre, audio_url, duration)`).eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
        ]);

        if (cancelled) return;

        if (playHistoryError) {
          console.error('Error fetching playHistory:', playHistoryError);
        } else {
          const uniqueRecent: { track: Track; playedAt: string }[] = [];
          const seen = new Set();
          for (const entry of playHistory || []) {
            const t = entry.tracks;
            if (t && !seen.has(t.id)) {
              uniqueRecent.push({
                track: {
                  id: t.id, title: t.title, artist: t.artist, album: t.album,
                  duration: t.duration ?? 0, cover: t.cover, genre: t.genre,
                  audioUrl: t.audio_url, boosted: false,
                },
                playedAt: entry.played_at,
              });
              seen.add(t.id);
            }
            if (uniqueRecent.length >= 8) break;
          }
          setRecentTracks(uniqueRecent);

          const playCountMap = new Map<string, { track: Track; playCount: number }>();
          for (const entry of playHistory || []) {
            const t = entry.tracks;
            if (t) {
              const id = t.id;
              if (!playCountMap.has(id)) {
                playCountMap.set(id, {
                  track: {
                    id: t.id, title: t.title, artist: t.artist, album: t.album,
                    duration: t.duration ?? 0, cover: t.cover, genre: t.genre,
                    audioUrl: t.audio_url, boosted: false,
                  },
                  playCount: 1,
                });
              } else {
                playCountMap.get(id)!.playCount += 1;
              }
            }
          }
          setMostPlayedTracks(
            Array.from(playCountMap.values()).sort((a, b) => b.playCount - a.playCount).slice(0, 8)
          );
        }
      } catch (err) {
        console.error('Failed to load user home data:', err);
        setRecentTracks([]);
        setMostPlayedTracks([]);
      }
    };

    loadUserData();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Load albums for musicians
  useEffect(() => {
    const loadAlbums = async () => {
      if (!user || !isMusicianRole(user.role)) {
        setAlbums([]);
        return;
      }
      try {
        const userAlbums = await AlbumService.getUserAlbums(user.id);
        setAlbums(userAlbums);
      } catch (err) {
        console.error('Failed to load albums:', err);
        setAlbums([]);
      }
    };
    loadAlbums();
  }, [user?.id]);


  const handlePlayTrack = (track: Track) => {
    playTrack(track);
    if (user) {
      const now = new Date().toISOString();
      setRecentTracks(prev => {
        const filtered = prev.filter(r => r.track.id !== track.id);
        return [{ track, playedAt: now }, ...filtered].slice(0, 8);
      });
      MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(console.error);
    }
  };

  const handleAddToQueue = (track: Track) => {
    addToQueue(track);
  };

  const handleManageSubscription = async () => {
    setIsManagingSubscription(true);
    setSubscriptionError(null);
    try {
      await proSubscriptionService.openPortal();
    } catch (err) {
      setSubscriptionError(err instanceof Error ? err.message : 'Could not open billing portal');
    } finally {
      setIsManagingSubscription(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches?.[0] ?? '';
    const parts: string[] = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : v;
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) return v.substring(0, 2) + '/' + v.substring(2, 4);
    return v;
  };

  const handlePaymentSubmit = async () => {
    setLoading(true);
    setError(null);
    setPaymentStep('processing');
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setPaymentStep('success');
      setTimeout(() => {
        setShowPaymentModal(false);
        setPaymentStep('details');
        setCardNumber('');
        setExpiryDate('');
        setCvv('');
        setCardholderName('');
      }, 3000);
    } catch (err) {
      setPaymentStep('error');
      setError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text className="text-white text-sm mt-2">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
    <ScrollView className="flex-1 bg-[#121212]" contentContainerStyle={{ paddingBottom: 32 }}>

       <PagerHeader />

      <View className="px-3 py-4 w-full" style={{ gap: 32 }}>
        {/* Subscription banner */}
        {user && (
          user.subscriptionTier === 'pro' ? (
            <View>
              <TouchableOpacity
                onPress={handleManageSubscription}
                disabled={isManagingSubscription}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
                  backgroundColor: 'rgba(234,179,8,0.12)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <Star size={20} color="#EAB308" fill="#EAB308" style={{ flexShrink: 0 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#EAB308', lineHeight: 18 }}>
                      Subscribed to Remixr Pro!
                    </Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }} numberOfLines={1}>
                      Unlimited uploads · Priority Discover · Analytics
                    </Text>
                  </View>
                </View>
                {isManagingSubscription ? (
                  <ActivityIndicator size="small" color="#EAB308" style={{ flexShrink: 0 }} />
                ) : (
                  <View style={{
                    flexShrink: 0, backgroundColor: 'rgba(234,179,8,0.2)', borderWidth: 1,
                    borderColor: 'rgba(234,179,8,0.3)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#EAB308' }}>
                      Manage subscription
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {subscriptionError && (
                <Text style={{ color: '#f87171', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                  {subscriptionError}
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => (navigation as any).getParent()?.navigate('ProfileTab', { screen: 'Upgrade' })}
              activeOpacity={0.75}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
                backgroundColor: 'rgba(234,179,8,0.08)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.3)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <Star size={20} color="#EAB308" fill="#EAB308" style={{ flexShrink: 0 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#EAB308', lineHeight: 18 }}>
                    Unlock Remixr Pro
                  </Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }} numberOfLines={1}>
                    Unlimited uploads · Priority Discover · Analytics
                  </Text>
                </View>
              </View>
              <View style={{
                flexShrink: 0, backgroundColor: 'rgba(234,179,8,0.2)', borderWidth: 1,
                borderColor: 'rgba(234,179,8,0.3)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#EAB308' }}>
                  Go Pro →
                </Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {/* Now Playing hero */}
        {player.currentTrack && (
          <View className="rounded-2xl overflow-hidden border border-dark-700">
            <Image
              source={{ uri: player.currentTrack.cover || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop' }}
              className="absolute inset-0 w-full h-full"
              blurRadius={20}
              style={{ opacity: 0.3 }}
            />
            <View className="flex-row items-center gap-4 p-4">
              <TouchableOpacity
                onPress={() => playTrack(player.currentTrack!)}
                className="w-16 h-16 rounded-xl overflow-hidden"
              >
                <Image
                  source={{ uri: player.currentTrack.cover || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop' }}
                  className="w-full h-full"
                  accessibilityLabel={player.currentTrack.title}
                />
              </TouchableOpacity>
              <View className="flex-1 min-w-0">
                <Text className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-0.5">
                  {player.isPlaying ? 'NOW PLAYING' : 'PAUSED'}
                </Text>
                <Text className="text-white font-bold" numberOfLines={1}>{player.currentTrack.title}</Text>
                <Text className="text-white/60 text-sm" numberOfLines={1}>{player.currentTrack.artist}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Drops */}
        <View className="rounded-2xl overflow-hidden border-dark-600/80 bg-dark-800/90">
          <View className="absolute top-0 left-0 right-0 h-0.5 bg-primary-500/60" />
          <View className="px-4 py-5">
            <View className="flex-row items-center gap-3 mb-1">
              <View className="items-center justify-center w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/30">
                <Music size={22} color="#a78bfa" strokeWidth={2} />
              </View>
              <View>
                <Text className="text-xl font-bold text-white">Recent Drops</Text>
                <Text className="text-gray-400 text-xs mt-0.5">Fresh uploads from the community — scroll to discover</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingLeft: 4, paddingRight: 24 }}>
                {publicFeed.length === 0 ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 280, paddingVertical: 48, paddingHorizontal: 32 }}>
                    <Music size={40} color="#6b7280" />
                    <Text className="text-gray-400 text-sm font-medium mt-3">No recent drops</Text>
                    <Text className="text-gray-500 text-xs mt-1">Be the first to share your music!</Text>
                  </View>
                ) : (
                  publicFeed.map((track) => (
                    <View key={track.id} style={{ width: 180 }}>
                      <TrackCard
                        track={track}
                        onPlay={handlePlayTrack}
                        onAddToQueue={handleAddToQueue}
                        isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
                        compactGrid
                        showActions={true}
                      />
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Top Album Chart - musicians only */}
        {user?.role === 'musician' && albums.length > 0 && (
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <FolderOpen size={20} color="#fbbf24" />
              <Text className="text-xl font-bold text-white">Top Album Chart</Text>
            </View>
            <Text className="text-gray-400 text-sm mb-4">Your latest releases</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3 pr-4">
                {albums.map((album) => (
                  <TouchableOpacity
                    key={album.id}
                    onPress={() => navigation.navigate('AlbumTracks', { albumId: album.id })}
                    className="w-[140px] rounded-xl overflow-hidden bg-dark-800 border border-dark-600"
                  >
                    <View className="pt-2 px-2">
                      <View className="h-2 w-12 rounded-t bg-dark-600" />
                    </View>
                    <View className="mx-2 mb-2 rounded-lg overflow-hidden bg-dark-700" style={{ aspectRatio: 1 }}>
                      <Image
                        source={{ uri: album.cover }}
                        className="w-full h-full"
                        resizeMode="cover"
                        accessibilityLabel={album.title}
                      />
                    </View>
                    <View className="px-3 pb-3">
                      <Text className="text-white font-semibold" numberOfLines={1}>{album.title}</Text>
                      <Text className="text-gray-400 text-xs" numberOfLines={1}>{album.artist}</Text>
                      <Text className="text-gray-500 text-xs mt-0.5">{album.trackCount ?? 0} tracks</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Recommended Tracks */}
        <View className="rounded-2xl overflow-hidden border-dark-600/80 bg-dark-800/90">
          <View className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-500/60" />
          <View className="px-4 py-5">
            <View className="flex-row items-center gap-3 mb-1">
              <View className="items-center justify-center w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30">
                <Star size={22} color="#eab308" strokeWidth={2} />
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xl font-bold text-white">Recommended for You</Text>
                  {isLoadingRecommendations && <ActivityIndicator size="small" color="#eab308" />}
                </View>
                <Text className="text-gray-400 text-xs mt-0.5">Picked based on your listening history</Text>
              </View>
            </View>
            {recommendedTracks.length === 0 && !isLoadingRecommendations ? (
              <View className="items-center py-10">
                <Star size={36} color="#374151" />
                <Text className="text-gray-400 text-sm mt-3">No recommendations yet</Text>
                <Text className="text-gray-500 text-xs mt-1">Keep listening to get personalised picks</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 4, paddingRight: 24 }}>
                  {recommendedTracks.map((track) => (
                    <View key={track.id} style={{ width: 180 }}>
                      <TrackCard
                        track={track}
                        onPlay={handlePlayTrack}
                        onAddToQueue={handleAddToQueue}
                        isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
                        compactGrid
                        showActions={true}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>

        {/* Recently Played */}
        {recentTracks.length > 0 && (
          <View className="rounded-2xl overflow-hidden border-dark-600/80 bg-dark-800/90">
            <View className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500/60" />
            <View className="px-4 py-5">
              <View className="flex-row items-center gap-3 mb-4">
                <View className="items-center justify-center w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30">
                  <Clock size={22} color="#60a5fa" strokeWidth={2} />
                </View>
                <View>
                  <Text className="text-xl font-bold text-white">Recently Played</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">Pick up where you left off</Text>
                </View>
              </View>
              <View className="gap-2">
                {recentTracks.map(({ track, playedAt }) => (
                  <TouchableOpacity
                    key={track.id}
                    onPress={() => handlePlayTrack(track)}
                    className="flex-row items-center gap-3 p-3 bg-dark-700/60 rounded-xl"
                  >
                    <Image
                      source={{ uri: track.cover }}
                      className="w-12 h-12 rounded-lg flex-shrink-0"
                      resizeMode="cover"
                      accessibilityLabel={track.title}
                    />
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-white" numberOfLines={1}>{track.title}</Text>
                      <Text className="text-xs text-gray-400" numberOfLines={1}>
                        {track.artist}{track.album ? ` • ${track.album}` : ''}
                      </Text>
                      {track.genre && (
                        <Text className="text-xs text-primary-400" numberOfLines={1}>{track.genre}</Text>
                      )}
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {`Played ${formatDistanceToNow(new Date(playedAt), { addSuffix: true })}`}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2 flex-shrink-0">
                      <TouchableOpacity
                        onPress={() => handlePlayTrack(track)}
                        className="p-2 rounded-full bg-primary-600"
                      >
                        <Play size={14} color="white" fill="white" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleAddToQueue(track)}
                        className="p-2 rounded-full"
                      >
                        <List size={14} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Popular Tracks */}
        <View className="rounded-2xl overflow-hidden border-dark-600/80 bg-dark-800/90">
          <View className="absolute top-0 left-0 right-0 h-0.5 bg-orange-500/60" />
          <View className="px-4 py-5">
            <View className="flex-row items-center gap-3 mb-1">
              <View className="items-center justify-center w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30">
                <Zap size={22} color="#f97316" strokeWidth={2} />
              </View>
              <View>
                <Text className="text-xl font-bold text-white">Popular Tracks</Text>
                <Text className="text-gray-400 text-xs mt-0.5">Most played across the community</Text>
              </View>
            </View>
            {popularTracks.length === 0 ? (
              <View className="items-center py-10">
                <Zap size={36} color="#374151" />
                <Text className="text-gray-400 text-sm mt-3">No popular tracks yet</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 4, paddingRight: 24 }}>
                  {popularTracks.map((track) => (
                    <View key={track.id} style={{ width: 180 }}>
                      <TrackCard
                        track={track}
                        onPlay={handlePlayTrack}
                        onAddToQueue={handleAddToQueue}
                        isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
                        compactGrid
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </View>

      {/* Boost Modal */}
      <Modal
        visible={showBoostModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBoostModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-dark-900 rounded-2xl w-full max-w-lg">
            <ScrollView className="max-h-[80vh]">
              <View className="p-6">
                <View className="flex-row items-center justify-between gap-3 mb-6">
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="p-3 bg-primary-600 rounded-full flex-shrink-0">
                      <Zap size={24} color="white" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xl font-bold text-white" numberOfLines={1}>Boost Your Music</Text>
                      <Text className="text-gray-400 text-sm" numberOfLines={1}>Premium promotion for artists</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowBoostModal(false)} className="p-2">
                    <X size={24} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                <View className="gap-6">
                  <View className="bg-dark-800 rounded-xl p-6 items-center">
                    <Text className="text-xl font-bold text-white mb-4">Pricing</Text>
                    <Text className="text-4xl font-bold text-primary-400 mb-2">$10</Text>
                    <Text className="text-gray-400 mb-4">per month</Text>
                    <View className="gap-2">
                      <Text className="text-sm text-white">• Featured placement in recommendations</Text>
                      <Text className="text-sm text-white">• Priority in curated playlists</Text>
                      <Text className="text-sm text-white">• Analytics and insights</Text>
                    </View>
                  </View>

                  <View>
                    <Text className="text-lg font-semibold text-white mb-4">What You Get</Text>
                    <View className="gap-3">
                      {[
                        { icon: <Star size={16} color="white" />, title: 'Featured Placement', desc: 'Your tracks appear at the top of recommendations' },
                        { icon: <Users size={16} color="white" />, title: 'Reach More Listeners', desc: 'Get discovered by new audiences' },
                        { icon: <Music size={16} color="white" />, title: 'Playlist Priority', desc: 'Your tracks featured in curated playlists' },
                      ].map((item) => (
                        <View key={item.title} className="flex-row items-center gap-3">
                          <View className="w-8 h-8 bg-primary-600 rounded-full items-center justify-center">
                            {item.icon}
                          </View>
                          <View className="flex-1">
                            <Text className="font-medium text-white">{item.title}</Text>
                            <Text className="text-sm text-gray-400">{item.desc}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View>
                    <Text className="text-lg font-semibold text-white mb-4">How It Works</Text>
                    <View className="gap-3">
                      {[
                        { step: '1', title: 'Subscribe', desc: 'Choose the $10/month plan' },
                        { step: '2', title: 'Select Tracks', desc: '' },
                        { step: '3', title: 'Get Featured', desc: 'Your tracks get promoted automatically' },
                      ].map((item) => (
                        <View key={item.step} className="flex-row items-center gap-3">
                          <View className="w-8 h-8 bg-dark-700 rounded-full items-center justify-center">
                            <Text className="text-white font-bold text-sm">{item.step}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-medium text-white">{item.title}</Text>
                            {item.desc ? <Text className="text-sm text-gray-400">{item.desc}</Text> : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-dark-900 rounded-2xl w-full max-w-md">
            <ScrollView className="max-h-[80vh]">
              <View className="p-6">
                <View className="flex-row items-center justify-between gap-2 mb-6">
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <View className="p-3 bg-primary-600 rounded-full flex-shrink-0">
                      <Zap size={24} color="white" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-xl font-bold text-white" numberOfLines={1}>Boost Subscription</Text>
                      <Text className="text-gray-400 text-sm" numberOfLines={1}>Complete your payment</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setShowPaymentModal(false)} className="p-2">
                    <X size={24} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                {paymentStep === 'details' && (
                  <View className="gap-4">
                    <View className="bg-dark-800 rounded-lg p-4 gap-2">
                      <Text className="text-sm font-medium text-white mb-1">Order Summary</Text>
                      <View className="flex-row justify-between">
                        <Text className="text-sm text-gray-400">Boost Subscription:</Text>
                        <Text className="text-sm text-white">$10.00</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-sm text-gray-400">Tax:</Text>
                        <Text className="text-sm text-white">$0.00</Text>
                      </View>
                      <View className="border-t border-dark-600 pt-2 flex-row justify-between">
                        <Text className="font-medium text-white">Total:</Text>
                        <Text className="font-medium text-primary-400">$10.00</Text>
                      </View>
                    </View>

                    <View>
                      <Text className="text-sm font-medium text-white mb-2">Cardholder Name *</Text>
                      <TextInput
                        value={cardholderName}
                        onChangeText={setCardholderName}
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white"
                        placeholder="John Doe"
                        placeholderTextColor="#6b7280"
                      />
                    </View>

                    <View>
                      <Text className="text-sm font-medium text-white mb-2">Card Number *</Text>
                      <View className="flex-row items-center bg-dark-700 border border-dark-600 rounded-lg px-3">
                        <CreditCard size={20} color="#6b7280" />
                        <TextInput
                          value={cardNumber}
                          onChangeText={(v) => setCardNumber(formatCardNumber(v))}
                          className="flex-1 py-2 pl-2 text-white"
                          placeholder="1234 5678 9012 3456"
                          placeholderTextColor="#6b7280"
                          keyboardType="numeric"
                          maxLength={19}
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-4">
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-white mb-2">Expiry Date *</Text>
                        <TextInput
                          value={expiryDate}
                          onChangeText={(v) => setExpiryDate(formatExpiryDate(v))}
                          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white"
                          placeholder="MM/YY"
                          placeholderTextColor="#6b7280"
                          keyboardType="numeric"
                          maxLength={5}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-white mb-2">CVV *</Text>
                        <TextInput
                          value={cvv}
                          onChangeText={(v) => setCvv(v.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white"
                          placeholder="123"
                          placeholderTextColor="#6b7280"
                          keyboardType="numeric"
                          maxLength={4}
                          secureTextEntry
                        />
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <Lock size={16} color="#6b7280" />
                      <Text className="text-sm text-gray-400">Your payment information is secure and encrypted</Text>
                    </View>

                    <TouchableOpacity
                      onPress={handlePaymentSubmit}
                      disabled={loading}
                      className={`w-full py-3 rounded-lg items-center justify-center flex-row gap-2 ${loading ? 'bg-dark-600' : 'bg-primary-600'}`}
                    >
                      {loading ? (
                        <>
                          <ActivityIndicator size="small" color="white" />
                          <Text className="text-white font-semibold">Processing...</Text>
                        </>
                      ) : (
                        <Text className="text-white font-semibold">Pay $10.00</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {paymentStep === 'processing' && (
                  <View className="items-center py-8">
                    <ActivityIndicator size="large" color="#a78bfa" />
                    <Text className="text-xl font-semibold text-white mt-4 mb-2">Processing Payment</Text>
                    <Text className="text-gray-400">Please wait while we process your payment...</Text>
                  </View>
                )}

                {paymentStep === 'success' && (
                  <View className="items-center py-8">
                    <CheckCircle size={48} color="#22c55e" />
                    <Text className="text-xl font-semibold text-white mt-4 mb-2">Payment Successful!</Text>
                    <Text className="text-gray-400 mb-4">Your boost subscription has been activated.</Text>
                    <Text className="text-sm text-gray-400">You can now boost up to 5 tracks per month!</Text>
                  </View>
                )}

                {paymentStep === 'error' && (
                  <View className="items-center py-8">
                    <AlertCircle size={48} color="#ef4444" />
                    <Text className="text-xl font-semibold text-white mt-4 mb-2">Payment Failed</Text>
                    <Text className="text-red-400 mb-4">{error}</Text>
                    <TouchableOpacity
                      onPress={() => setPaymentStep('details')}
                      className="px-4 py-2 bg-primary-600 rounded-lg"
                    >
                      <Text className="text-white">Try Again</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
};

export default Home;
