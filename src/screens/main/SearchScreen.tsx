import React, { useState, useEffect, useCallback } from 'react';
import PagerHeader from '../../components/layout/PagerHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme'
import {
  View,
  Text as RNText,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SearchStackParamList } from '../../navigation/stacks/SearchStack';
import { Users, User as UserIcon, MessageCircle, Calendar, MapPin, Music, Star, Zap } from 'lucide-react-native';
import TrackCard from '../../components/music/TrackCard';
import BuyTicketButton from '../../components/music/BuyTicketButton';
import SearchBar, { SearchCategory } from '../../components/search/SearchBar';
import { useStore } from '../../store/useStore';
import type { Track, User } from '../../store/useStore';
import { ChatService } from '../../services/chatService';
import { MusicService } from '../../services/musicService';
import { ConcertService } from '../../services/concertService';
import type { ConcertWithUser } from '../../services/concertService';
import { supabase } from '../../services/supabase';
import { getAvatarUrl } from '../../utils/avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import { formatTicketPrice, openTicketUrl, thirdPartyTicketsNote } from '../../utils/concerts';
import { requireAuth } from '../../components/auth/GuestPrompt';
import { formatConcertDate } from '../../utils/dateLocale';
import { useTranslation } from 'react-i18next';

export type FilterChip = 'top' | 'tracks' | 'albums' | 'artists' | 'profiles' | 'venues';

const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'top', label: 'search.chips.top' },
  { id: 'tracks', label: 'search.chips.tracks' },
  { id: 'albums', label: 'search.chips.albums' },
  { id: 'artists', label: 'search.chips.artists' },
  { id: 'profiles', label: 'search.chips.profiles' },
  { id: 'venues', label: 'search.chips.venues' },
];

const Search: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList, 'Search'>>();
  const { playTrack, addToQueue, player, user: currentUser } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SearchCategory>('music');
  const [filterChip, setFilterChip] = useState<FilterChip>('top');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [featuredArtists, setFeaturedArtists] = useState<User[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [concerts, setConcerts] = useState<ConcertWithUser[]>([]);
  const [filteredConcerts, setFilteredConcerts] = useState<ConcertWithUser[]>([]);
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);
  const [popularTracks, setPopularTracks] = useState<Track[]>([]);
  const [isLoadingPopular, setIsLoadingPopular] = useState(false);

  const effectiveView: 'music' | 'users' | 'concerts' =
    category === 'all'
      ? filterChip === 'profiles'
        ? 'users'
        : filterChip === 'venues'
        ? 'concerts'
        : 'music'
      : category === 'users'
      ? 'users'
      : category === 'concerts'
      ? 'concerts'
      : 'music';

  // Keep filter chip in sync with category
  useEffect(() => {
    if (category === 'users' && filterChip !== 'profiles') setFilterChip('profiles');
    if (category === 'concerts' && filterChip !== 'venues') setFilterChip('venues');
    if (category === 'music' && !['top', 'tracks', 'albums', 'artists'].includes(filterChip))
      setFilterChip('top');
  }, [category]);

  // Load tracks when music view is active
  useEffect(() => {
    if (effectiveView !== 'music') return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingTracks(true);
      try {
        const tracks = await MusicService.getTracks(30);
        if (!cancelled) {
          setAllTracks(tracks);
          setFilteredTracks(tracks);
        }
      } catch (error) {
        console.error('Failed to load tracks:', error);
        if (!cancelled) { setAllTracks([]); setFilteredTracks([]); }
      } finally {
        if (!cancelled) setIsLoadingTracks(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [effectiveView]);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const users = await ChatService.searchUsers('', currentUser?.id, 5);
      setAllUsers(users);
      setFilteredUsers(users);
    } catch (error) {
      console.error('Failed to load suggested users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentUser]);

  // Load users when users view is active
  useEffect(() => {
    if (effectiveView === 'users') loadUsers();
  }, [effectiveView, loadUsers]);

  // Load concerts when concerts view is active
  useEffect(() => {
    if (effectiveView !== 'concerts') return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingConcerts(true);
      try {
        const all = await ConcertService.getAllConcerts(50);
        if (!cancelled) { setConcerts(all); setFilteredConcerts(all); }
      } catch (error) {
        console.error('Failed to load concerts:', error);
        if (!cancelled) { setConcerts([]); setFilteredConcerts([]); }
      } finally {
        if (!cancelled) setIsLoadingConcerts(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [effectiveView]);

  // Load popular tracks for the music browse view
  useEffect(() => {
    if (effectiveView !== 'music') return;
    let cancelled = false;
    setIsLoadingPopular(true);
    supabase.rpc('get_popular_tracks', { limit_count: 4 }).then(({ data, error }: { data: any; error: any }) => {
      if (cancelled || error) return;
      setPopularTracks((data || []).map((t: any) => ({
        id: t.id, title: t.title, artist: t.artist, album: t.album,
        duration: t.duration || 0, cover: t.cover, genre: t.genre,
        audioUrl: t.audio_url, price: t.price || 0, boosted: false,
      })));
    }).finally(() => { if (!cancelled) setIsLoadingPopular(false); });
    return () => { cancelled = true; };
  }, [effectiveView]);

  // Load featured artists (users view only)
  useEffect(() => {
    if (effectiveView !== 'users') return;
    let cancelled = false;
    const fetch = async () => {
      setIsLoadingArtists(true);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('role', 'musician')
          .limit(8);
        if (error) throw error;
        if (!cancelled) {
          setFeaturedArtists(
            (data || []).map((a: any) => ({
              id: a.id,
              username: a.username,
              email: a.email,
              avatar: a.avatar,
              followers: a.followers,
              following: a.following,
              role: a.role,
              isVerified: a.is_verified,
              isVerifiedArtist: a.is_verified_artist ?? false,
              isPrivate: a.is_private,
              artistName: a.artist_name,
              bio: a.bio,
              genres: a.genres,
              stripeCustomerId: a.stripe_customer_id,
            }))
          );
        }
      } catch {
        if (!cancelled) setFeaturedArtists([]);
      } finally {
        if (!cancelled) setIsLoadingArtists(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [effectiveView]);

  // Search handler
  const handleSearch = useCallback(
    async (query: string) => {
      if (effectiveView === 'music' && query.trim()) {
        setIsSearching(true);
        try {
          const results = await MusicService.searchTracks(query, 50);
          setFilteredTracks(results);
        } catch {
          const q = query.toLowerCase();
          setFilteredTracks(
            allTracks.filter(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                t.artist.toLowerCase().includes(q) ||
                t.genre.toLowerCase().includes(q) ||
                (t.album && t.album.toLowerCase().includes(q))
            )
          );
        } finally {
          setIsSearching(false);
        }
      } else if (effectiveView === 'users') {
        const q = query.trim();
        if (q) {
          setIsSearching(true);
          try {
            const results = await ChatService.searchUsers(q, currentUser?.id, 100);
            setFilteredUsers(results);
          } catch {
            setFilteredUsers([]);
          } finally {
            setIsSearching(false);
          }
        } else {
          setFilteredUsers(allUsers);
        }
      } else if (effectiveView === 'concerts') {
        const q = query.trim().toLowerCase();
        if (q) {
          setFilteredConcerts(
            concerts.filter(
              (c) =>
                c.title.toLowerCase().includes(q) ||
                c.venue.toLowerCase().includes(q) ||
                c.location.toLowerCase().includes(q) ||
                c.user?.artist_name?.toLowerCase().includes(q) ||
                c.user?.username?.toLowerCase().includes(q) ||
                c.description?.toLowerCase().includes(q)
            )
          );
        } else {
          setFilteredConcerts(concerts);
        }
      }
    },
    [effectiveView, allTracks, allUsers, concerts, currentUser]
  );

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim()) {
        handleSearch(search);
      } else {
        if (effectiveView === 'music') setFilteredTracks(allTracks);
        else if (effectiveView === 'users') setFilteredUsers(allUsers);
        else if (effectiveView === 'concerts') setFilteredConcerts(concerts);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search, handleSearch, effectiveView, allTracks, allUsers, concerts]);

  // Genre + search filter for music view
  useEffect(() => {
    if (effectiveView !== 'music') return;
    let filtered = allTracks;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q)
      );
    }
    const sorted = [...filtered].sort((a, b) => {
      const tA = (a as { createdAt?: Date }).createdAt?.getTime() ?? 0;
      const tB = (b as { createdAt?: Date }).createdAt?.getTime() ?? 0;
      return tB - tA;
    });
    setFilteredTracks(sorted);
  }, [search, allTracks, effectiveView]);

  const handleUserClick = (user: { id: string; username?: string | null }) => {
    if (currentUser && user.id === currentUser.id) {
      (navigation.getParent() as any)?.navigate('ProfileTab');
      return;
    }
    navigation.navigate('ProfileById', { userId: user.id });
  };

  const handlePlayTrack = (track: Track) => {
    playTrack(track);
    if (currentUser) {
      MusicService.recordPlayHistory(currentUser.id, track.id, 0, false).catch(console.error);
    }
  };

  const handleAddToQueue = (track: Track) => {
    addToQueue(track);
  };

  const handleStartChat = async (otherUser: User) => {
    if (!currentUser) { requireAuth('chat'); return; }
    try {
      await ChatService.sendMessage({
        senderId: currentUser.id,
        receiverId: otherUser.id,
        content: '👋',
      });
      (navigation.getParent() as any)?.navigate('ChatTab');
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const clearSearch = () => setSearch('');

  const visibleChips =
    category === 'all'
      ? FILTER_CHIPS
      : category === 'music'
      ? FILTER_CHIPS.filter((c) => ['top', 'tracks', 'albums', 'artists'].includes(c.id))
      : category === 'users'
      ? FILTER_CHIPS.filter((c) => c.id === 'profiles')
      : FILTER_CHIPS.filter((c) => c.id === 'venues');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.dark900 }} edges={['top']}>
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PagerHeader />
      {/* Sticky header */}
      <View className="px-4 pt-4 pb-3 border-b border-dark-700/50 gap-3">
        <Text className="text-2xl font-bold text-black">{t('search.title')}</Text>
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={clearSearch}
          category={category}
          onCategoryChange={setCategory}
          placeholder={t('search.placeholder')}
          isSearching={isSearching}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pb-1">
            {visibleChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                onPress={() => setFilterChip(chip.id)}
                className={`px-4 py-2 rounded-full border ${
                  filterChip === chip.id
                    ? 'bg-lime-400/20 border-lime-700'
                    : 'bg-dark-900'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    filterChip === chip.id ? 'text-black' : 'text-white'
                  }`}
                >
                  {t(chip.label)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Scrollable results */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View className="gap-6">

          {/* ── Music ── */}
          {effectiveView === 'music' && (
            search.trim() ? (
              <View>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-bold text-black">{t('search.results')}</Text>
                  {isLoadingTracks && <ActivityIndicator size="small" color="#000000" />}
                </View>
                {filteredTracks.length === 0 && !isLoadingTracks ? (
                  <View className="items-center py-14 gap-3">
                    <Music size={40} color="#374151" />
                    <Text className="text-gray-500 text-base">{t('search.noTracks')}</Text>
                    <Text className="text-gray-600 text-sm text-center">
                      {t('search.adjust')}
                    </Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {filteredTracks.map((track) => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        onPlay={handlePlayTrack}
                        onAddToQueue={handleAddToQueue}
                        isPlaying={player.currentTrack?.id === track.id && player.isPlaying}
                      />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ gap: 24 }}>
                {/* Recent Drops */}
                <View className="rounded-2xl overflow-hidden border border-black bg-white">
                  <View className="absolute top-0 left-0 right-0.5 h-0.5 bg-dark" />
                  <View className="px-4 py-5">
                    <View className="flex-row items-center gap-3 mb-1">
                      <View className="items-center justify-center w-10 h-10 rounded-xl bg-primary-500/20 border border-dark-800">
                        <Music size={22} color="black" strokeWidth={2} />
                      </View>
                      <View>
                        <Text className="text-xl font-bold text-black">{t('search.recentDrops')}</Text>
                        <Text className="text-black-400 text-xs mt-0.5">{t('search.recentDropsSub')}</Text>
                      </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingLeft: 4, paddingRight: 24 }}>
                        {isLoadingTracks ? (
                          <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 280, paddingVertical: 48 }}>
                            <ActivityIndicator size="large" color="#000000" />
                          </View>
                        ) : allTracks.slice(0, 12).length === 0 ? (
                          <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 280, paddingVertical: 48, paddingHorizontal: 32 }}>
                            <Music size={40} color="#6b7280" />
                            <Text className="text-gray-400 text-sm font-medium mt-3">{t('search.noRecent')}</Text>
                            <Text className="text-gray-500 text-xs mt-1">{t('search.beFirst')}</Text>
                          </View>
                        ) : (
                          allTracks.slice(0, 12).map((track) => (
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

                {/* Recommended For You */}
                <View className="rounded-2xl overflow-hidden border border-black bg-white">
                  <View className="absolute top-0 left-0 right-0 h-0.5 bg-dark" />
                  <View className="px-4 py-5">
                    <View className="flex-row items-center gap-3 mb-1">
                      <View className="items-center justify-center w-10 h-10 rounded-xl bg-yellow-300 border border-dark">
                        <Star size={22} color="#121212" strokeWidth={2} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-xl font-bold text-black">{t('search.recommended')}</Text>
                          {isLoadingTracks && <ActivityIndicator size="small" color="#000000" />}
                        </View>
                        <Text className="text-dark-800 text-xs mt-0.5">{t('search.recommendedSub')}</Text>
                      </View>
                    </View>
                    {allTracks.slice(0, 8).length === 0 && !isLoadingTracks ? (
                      <View className="items-center py-10">
                        <Star size={36} color="#374151" />
                        <Text className="text-gray-400 text-sm mt-3">{t('search.noRecommended')}</Text>
                        <Text className="text-gray-500 text-xs mt-1">{t('search.keepListening')}</Text>
                      </View>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 4, paddingRight: 24 }}>
                          {allTracks.slice(0, 8).map((track) => (
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

                {/* Popular Tracks */}
                <View className="rounded-2xl overflow-hidden border border-black bg-white">
                  <View className="absolute top-0 left-0 right-0 h-0.5 bg-orange-500/60" />
                  <View className="px-4 py-5">
                    <View className="flex-row items-center gap-3 mb-1">
                      <View className="items-center justify-center w-10 h-10 rounded-xl bg-orange-500/20 border border-dark">
                        <Zap size={22} color="#f97316" strokeWidth={2} />
                      </View>
                      <View>
                        <Text className="text-xl font-bold text-black">{t('search.popular')}</Text>
                        <Text className="text-black text-xs mt-0.5">{t('search.popularSub')}</Text>
                      </View>
                    </View>
                    {isLoadingPopular ? (
                      <View className="items-center py-10">
                        <ActivityIndicator size="large" color="#000000" />
                      </View>
                    ) : popularTracks.length === 0 ? (
                      <View className="items-center py-10">
                        <Zap size={36} color="#374151" />
                        <Text className="text-black text-sm mt-3">{t('search.noPopular')}</Text>
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
            )
          )}

          {/* ── Concerts ── */}
          {effectiveView === 'concerts' && (
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xl font-bold text-black">{t('concerts.title')}</Text>
                {isLoadingConcerts && <ActivityIndicator size="small" color="#000000" />}
              </View>
              <Text className="text-dark-400 text-sm mb-5">
                {t('concerts.subtitleSearch')}
              </Text>
              {isLoadingConcerts ? (
                <View className="items-center py-12">
                  <ActivityIndicator size="large" color="#000000" />
                </View>
              ) : filteredConcerts.length === 0 ? (
                <View className="items-center py-14 gap-3">
                  <Calendar size={40} color="#374151" />
                  <Text className="text-gray-500 text-base">
                    {search.trim() ? t('concerts.noMatch') : t('concerts.noneYet')}
                  </Text>
                  <Text className="text-gray-600 text-sm text-center px-6">
                    {search.trim()
                      ? t('concerts.tryDifferent')
                      : t('concerts.willPost')}
                  </Text>
                </View>
              ) : (
                <View className="gap-3">
                  {filteredConcerts.map((concert) => (
                    <TouchableOpacity
                      key={concert.id}
                      onPress={() => concert.user && handleUserClick(concert.user)}
                      className="bg-dark-800 rounded-xl overflow-hidden border-l-4 border-l-purple-500"
                      activeOpacity={0.8}
                    >
                      <View className="p-4">
                        {concert.user && (
                          <View className="flex-row items-center gap-2 mb-3">
                            <Image
                              source={{ uri: getAvatarUrl(concert.user.avatar) }}
                              className="w-6 h-6 rounded-full"
                            />
                            <Text className="text-xs text-purple-400 font-medium flex-1" numberOfLines={1}>
                              {concert.user.artist_name || concert.user.username}
                            </Text>
                          </View>
                        )}
                        <Text className="text-white font-semibold text-base mb-3" numberOfLines={2}>
                          {concert.title}
                        </Text>
                        <View className="gap-1.5 mb-3">
                          <View className="flex-row items-center gap-2">
                            <Calendar size={13} color="#a855f7" />
                            <Text className="text-dark-400 text-xs flex-1" numberOfLines={1}>
                              {formatConcertDate(concert.date, {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <MapPin size={13} color="#a855f7" />
                            <Text className="text-dark-400 text-xs flex-1" numberOfLines={1}>
                              {concert.venue}, {concert.location}
                            </Text>
                          </View>
                        </View>
                        {concert.description ? (
                          <Text className="text-dark-500 text-xs mb-3" numberOfLines={2}>
                            {concert.description}
                          </Text>
                        ) : null}
                        <View className="flex-row items-center justify-between">
                          {formatTicketPrice(concert.ticketPrice) ? (
                            <Text className="text-purple-400 font-semibold text-sm">
                              {formatTicketPrice(concert.ticketPrice)}
                            </Text>
                          ) : (
                            <View />
                          )}
                          <View className="flex-row gap-2">
                            {concert.ticketUrl ? (
                              <TouchableOpacity
                                onPress={() => openTicketUrl(concert.ticketUrl)}
                                className="px-3 py-1.5 bg-purple-600 rounded-lg"
                              >
                                <Text className="text-white text-xs font-medium">{t('concerts.getTickets')}</Text>
                              </TouchableOpacity>
                            ) : concert.ticketPrice ? (
                              <BuyTicketButton concertId={concert.id} capacity={concert.capacity} compact />
                            ) : null}
                            {concert.user && (
                              <TouchableOpacity
                                onPress={() => handleUserClick(concert.user!)}
                                className="px-3 py-1.5 bg-dark-700 rounded-lg"
                              >
                                <Text className="text-dark-300 text-xs">{t('concerts.profile')}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        {concert.ticketUrl ? (
                          <Text className="text-dark-500 text-[11px] mt-2 text-right">{thirdPartyTicketsNote()}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Users ── */}
          {effectiveView === 'users' && (
            <View className="gap-8">

              {/* Featured Artists — 2-col centered grid */}
              <View>
                <Text className="text-xl font-bold text-black mb-4">{t('search.featuredArtists')}</Text>
                {isLoadingArtists ? (
                  <View className="items-center py-8">
                    <ActivityIndicator size="large" color="#000000" />
                  </View>
                ) : featuredArtists.length === 0 ? (
                  <Text className="text-black text-center py-6">{t('search.noFeatured')}</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-3">
                    {featuredArtists.map((artist) => (
                      <TouchableOpacity
                        key={artist.id}
                        onPress={() => handleUserClick(artist)}
                        className="bg-white border border-black rounded-xl p-4 items-center"
                        style={{ width: '47%' }}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: getAvatarUrl(artist.avatar) }}
                          className="w-16 h-16 rounded-full mb-3"
                        />
                        <View className="flex-row items-center gap-1 mb-0.5">
                          <Text
                            className="text-black font-semibold text-sm text-center shrink"
                            numberOfLines={1}
                          >
                            {artist.username}
                          </Text>
                          <VerifiedBadge
                            verified={artist.isVerified || artist.isVerifiedArtist}
                            size={13}
                          />
                        </View>
                        {artist.artistName ? (
                          <Text className="text-purple-400 text-xs text-center mb-0.5" numberOfLines={1}>
                            {artist.artistName}
                          </Text>
                        ) : null}
                        <Text className="text-dark-500 text-xs">
                          {t('search.followers', { count: artist.followers ?? 0 })}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Suggested Users — full-width rows */}
              <View>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-bold text-black">{t('search.suggested')}</Text>
                  {isLoadingUsers && <ActivityIndicator size="small" color="#000000" />}
                </View>
                {filteredUsers.length === 0 && !isLoadingUsers ? (
                  <View className="items-center py-10 gap-2">
                    <Text className="text-black">{t('search.noSuggested')}</Text>
                    <Text className="text-black text-sm">{t('search.tryClearing')}</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {filteredUsers.map((user) => (
                      <View
                        key={user.id}
                        className="flex-row items-center bg-white border border-black rounded-xl px-3 py-3 gap-3"
                      >
                        <TouchableOpacity onPress={() => handleUserClick(user)} activeOpacity={0.8}>
                          <Image
                            source={{ uri: getAvatarUrl(user.avatar) }}
                            className="w-11 h-11 rounded-full"
                          />
                        </TouchableOpacity>
                        <View className="flex-1 min-w-0">
                          <View className="flex-row items-center gap-1">
                            <Text
                              className="text-black font-semibold text-sm shrink"
                              numberOfLines={1}
                            >
                              {user.username}
                            </Text>
                            <VerifiedBadge
                              verified={user.isVerified || user.isVerifiedArtist}
                              size={14}
                            />
                          </View>
                          {user.artistName ? (
                            <Text className="text-purple-400 text-xs" numberOfLines={1}>
                              {user.artistName}
                            </Text>
                          ) : null}
                          <Text className="text-dark-400 text-xs">
                            {t('search.followers', { count: user.followers ?? 0 })}
                          </Text>
                        </View>
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => handleUserClick(user)}
                            className="p-2.5 bg-dark-700 rounded-full"
                            activeOpacity={0.7}
                          >
                            <UserIcon size={15} color="#ffffff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleStartChat(user)}
                            className="p-2.5 bg-white rounded-full"
                            activeOpacity={0.7}
                          >
                            <MessageCircle size={15} color="#121212" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

            </View>
          )}

        </View>
      </ScrollView>
    </View>
    </SafeAreaView>
  );
};

export default Search;
