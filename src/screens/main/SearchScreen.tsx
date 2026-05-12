import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SearchStackParamList } from '../../navigation/stacks/SearchStack';
import { Users, User as UserIcon, MessageCircle, Calendar, MapPin, Music } from 'lucide-react-native';
import TrackCard from '../../components/music/TrackCard';
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

export type FilterChip = 'top' | 'tracks' | 'albums' | 'artists' | 'profiles' | 'venues';

const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'top', label: 'Top Results' },
  { id: 'tracks', label: 'Tracks' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'venues', label: 'Venues' },
];

const Search: React.FC = () => {
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
      const users = await ChatService.searchUsers('', currentUser?.id || '', 5);
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
        if (!currentUser) return;
        const q = query.trim();
        if (q) {
          setIsSearching(true);
          try {
            const results = await ChatService.searchUsers(q, currentUser.id, 100);
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
    (navigation.getParent() as any)?.navigate('ProfileTab', {
      screen: 'ProfileById',
      params: { userId: user.id },
    });
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
    if (!currentUser) return;
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
    <View className="flex-1 bg-dark-900">
      {/* Sticky header */}
      <View className="px-4 pt-4 pb-3 border-b border-dark-700/50 gap-3">
        <Text className="text-2xl font-bold text-white">Search</Text>
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={clearSearch}
          category={category}
          onCategoryChange={setCategory}
          placeholder="Search for music, people, or events..."
          isSearching={isSearching}
          disabled={effectiveView === 'users' && !currentUser}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pb-1">
            {visibleChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                onPress={() => setFilterChip(chip.id)}
                className={`px-4 py-2 rounded-full border ${
                  filterChip === chip.id
                    ? 'bg-lime-400/20 border-lime-400/40'
                    : 'bg-dark-800 border-dark-600'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    filterChip === chip.id ? 'text-lime-400' : 'text-gray-400'
                  }`}
                >
                  {chip.label}
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
            <View>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-white">Search Results</Text>
                {isLoadingTracks && <ActivityIndicator size="small" color="#a3e635" />}
              </View>
              {filteredTracks.length === 0 && !isLoadingTracks ? (
                <View className="items-center py-14 gap-3">
                  <Music size={40} color="#374151" />
                  <Text className="text-gray-500 text-base">No tracks found</Text>
                  <Text className="text-gray-600 text-sm text-center">
                    Try adjusting your search or filters
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
          )}

          {/* ── Concerts ── */}
          {effectiveView === 'concerts' && (
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xl font-bold text-white">Concerts</Text>
                {isLoadingConcerts && <ActivityIndicator size="small" color="#a855f7" />}
              </View>
              <Text className="text-dark-400 text-sm mb-5">
                Upcoming shows from artists on the platform
              </Text>
              {isLoadingConcerts ? (
                <View className="items-center py-12">
                  <ActivityIndicator size="large" color="#a855f7" />
                </View>
              ) : filteredConcerts.length === 0 ? (
                <View className="items-center py-14 gap-3">
                  <Calendar size={40} color="#374151" />
                  <Text className="text-gray-500 text-base">
                    {search.trim() ? 'No concerts match your search' : 'No concerts yet'}
                  </Text>
                  <Text className="text-gray-600 text-sm text-center px-6">
                    {search.trim()
                      ? 'Try a different search term'
                      : 'Artists will post their upcoming shows here.'}
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
                              {new Date(concert.date).toLocaleDateString('en-US', {
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
                          {concert.ticketPrice != null ? (
                            <Text className="text-purple-400 font-semibold text-sm">
                              ${concert.ticketPrice}
                            </Text>
                          ) : (
                            <View />
                          )}
                          <View className="flex-row gap-2">
                            {concert.ticketUrl && (
                              <TouchableOpacity
                                onPress={() => Linking.openURL(concert.ticketUrl!)}
                                className="px-3 py-1.5 bg-purple-600 rounded-lg"
                              >
                                <Text className="text-white text-xs font-medium">Get tickets</Text>
                              </TouchableOpacity>
                            )}
                            {concert.user && (
                              <TouchableOpacity
                                onPress={() => handleUserClick(concert.user!)}
                                className="px-3 py-1.5 bg-dark-700 rounded-lg"
                              >
                                <Text className="text-dark-300 text-xs">Profile</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
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
                <Text className="text-xl font-bold text-white mb-4">Featured Artists</Text>
                {isLoadingArtists ? (
                  <View className="items-center py-8">
                    <ActivityIndicator size="large" color="#a855f7" />
                  </View>
                ) : featuredArtists.length === 0 ? (
                  <Text className="text-gray-500 text-center py-6">No featured artists found.</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-3">
                    {featuredArtists.map((artist) => (
                      <TouchableOpacity
                        key={artist.id}
                        onPress={() => handleUserClick(artist)}
                        className="bg-dark-800 rounded-xl p-4 items-center"
                        style={{ width: '47%' }}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: getAvatarUrl(artist.avatar) }}
                          className="w-16 h-16 rounded-full mb-3"
                        />
                        <View className="flex-row items-center gap-1 mb-0.5">
                          <Text
                            className="text-white font-semibold text-sm text-center shrink"
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
                          {artist.followers ?? 0} followers
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Suggested Users — full-width rows */}
              <View>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-bold text-white">Suggested Users</Text>
                  {isLoadingUsers && <ActivityIndicator size="small" color="#a855f7" />}
                </View>
                {!currentUser ? (
                  <View className="items-center py-14 px-4 gap-3">
                    <Users size={40} color="#374151" />
                    <Text className="text-white text-xl font-bold">Sign in to see people</Text>
                    <Text className="text-gray-500 text-sm text-center">
                      Connect with artists and music lovers by signing in to your account.
                    </Text>
                  </View>
                ) : filteredUsers.length === 0 && !isLoadingUsers ? (
                  <View className="items-center py-10 gap-2">
                    <Text className="text-gray-500">No suggested users to show</Text>
                    <Text className="text-gray-600 text-sm">Try clearing your search</Text>
                  </View>
                ) : (
                  <View className="gap-2">
                    {filteredUsers.map((user) => (
                      <View
                        key={user.id}
                        className="flex-row items-center bg-dark-800 rounded-xl px-3 py-3 gap-3"
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
                              className="text-white font-semibold text-sm shrink"
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
                            {user.followers ?? 0} followers
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
                            className="p-2.5 bg-purple-600 rounded-full"
                            activeOpacity={0.7}
                          >
                            <MessageCircle size={15} color="#ffffff" />
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
  );
};

export default Search;
