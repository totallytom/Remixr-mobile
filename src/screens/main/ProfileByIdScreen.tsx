import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Music,
  User as UserIcon,
  ListMusic,
  UserPlus,
  UserMinus,
  Users,
  Calendar,
  MapPin,
  X,
  Globe,
  AtSign,
  MessageCircle,
  ChevronLeft,
  Search,
} from 'lucide-react-native';
import { ChatService } from '../../services/chatService';
import { FollowService } from '../../services/followService';
import type { FollowStats } from '../../services/followService';
import { MusicService } from '../../services/musicService';
import { ConcertService } from '../../services/concertService';
import type { Concert } from '../../services/concertService';
import { AlbumService } from '../../services/albumService';
import type { Album } from '../../services/albumService';
import type { Track, Playlist } from '../../store/useStore';
import { useStore } from '../../store/useStore';
import PlaylistCard from '../../components/music/PlaylistCard';
import TrackCard from '../../components/music/TrackCard';
import AlbumCard from '../../components/music/AlbumCard';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getAvatarUrl } from '../../utils/avatar';

type ProfileByIdRouteProp = RouteProp<
  { ProfileById: { userId?: string; handle?: string } },
  'ProfileById'
>;

export function ProfileByIdScreen() {
  const route = useRoute<ProfileByIdRouteProp>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { userId, handle } = route.params ?? {};
  const { user: currentUser, playQueue, playPlaylist } = useStore();

  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followStats, setFollowStats] = useState<FollowStats>({ followers: 0, following: 0, isFollowing: false });
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'music' | 'playlists' | 'albums' | 'concerts'>('music');

  const [userTracks, setUserTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);

  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [isFollowersLoading, setIsFollowersLoading] = useState(false);
  const [isFollowingListLoading, setIsFollowingListLoading] = useState(false);
  const [followersSearch, setFollowersSearch] = useState('');
  const [followingSearch, setFollowingSearch] = useState('');

  // Resolve profile by handle or userId slug, then fetch follow stats
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = handle
          ? await ChatService.getProfileByVanityUrl(handle)
          : await ChatService.getProfileBySlug(userId!);
        setProfile(data);
        if (data) {
          const stats = await FollowService.getFollowStats(data.id, currentUser?.id);
          setFollowStats(stats);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [userId, handle, currentUser?.id]);

  // Load tracks after profile resolves
  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      setIsLoadingTracks(true);
      try {
        setUserTracks(await MusicService.getUserTracks(profile.id));
      } catch { setUserTracks([]); } finally { setIsLoadingTracks(false); }
    };
    load();
  }, [profile?.id]);

  // Load playlists
  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      setIsLoadingPlaylists(true);
      try {
        const fetched = await MusicService.getPlaylists(profile.id);
        const withTracks = await Promise.all(
          fetched.map(async (p) => {
            try { return await MusicService.getPlaylistById(p.id); } catch { return p; }
          })
        );
        setPlaylists(withTracks);
      } catch { setPlaylists([]); } finally { setIsLoadingPlaylists(false); }
    };
    load();
  }, [profile?.id]);

  // Load albums
  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      setIsLoadingAlbums(true);
      try {
        setAlbums(await AlbumService.getUserAlbums(profile.id));
      } catch { setAlbums([]); } finally { setIsLoadingAlbums(false); }
    };
    load();
  }, [profile?.id]);

  // Load concerts
  useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      setIsLoadingConcerts(true);
      try {
        setConcerts(await ConcertService.getUserConcerts(profile.id));
      } catch { setConcerts([]); } finally { setIsLoadingConcerts(false); }
    };
    load();
  }, [profile?.id]);

  const handleFollowToggle = useCallback(async () => {
    if (!currentUser || !profile) return;
    setIsFollowLoading(true);
    try {
      if (followStats.isFollowing) {
        await FollowService.unfollowUser(currentUser.id, profile.id);
        setFollowStats(prev => ({ ...prev, isFollowing: false, followers: Math.max(0, prev.followers - 1) }));
      } else {
        await FollowService.followUser(currentUser.id, profile.id);
        setFollowStats(prev => ({ ...prev, isFollowing: true, followers: prev.followers + 1 }));
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
    } finally {
      setIsFollowLoading(false);
    }
  }, [currentUser, profile, followStats.isFollowing]);

  const handleMessage = useCallback(() => {
    (navigation.getParent() as any)?.navigate('ChatTab', {
      screen: 'Chat',
      params: { openUserId: profile?.id },
    });
  }, [navigation, profile?.id]);

  const handleOpenFollowers = async () => {
    setShowFollowersModal(true);
    setIsFollowersLoading(true);
    try {
      setFollowersList(await FollowService.getFollowers(profile.id));
    } catch { setFollowersList([]); } finally { setIsFollowersLoading(false); }
  };

  const handleOpenFollowing = async () => {
    setShowFollowingModal(true);
    setIsFollowingListLoading(true);
    try {
      setFollowingList(await FollowService.getFollowing(profile.id));
    } catch { setFollowingList([]); } finally { setIsFollowingListLoading(false); }
  };

  const handlePlayAlbum = async (album: Album) => {
    try {
      const tracks = await MusicService.getTracksByAlbum(album.id);
      if (tracks.length > 0) playQueue(tracks);
    } catch (err) { console.error('Failed to play album:', err); }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
        <View className="flex-1 items-center justify-center gap-3 bg-dark-900">
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text className="text-gray-400">Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
        <View className="flex-1 items-center justify-center bg-dark-900">
          <Text className="text-gray-400">Profile not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const externalLinks = ((profile.externalLinks ?? []) as string[]).filter(Boolean).slice(0, 3);
  const isMusicianProfile = profile.role === 'musician';

  const tabs = [
    { key: 'music', label: 'Music' },
    { key: 'playlists', label: 'Playlists' },
    ...(isMusicianProfile ? [{ key: 'albums', label: 'Albums' }, { key: 'concerts', label: 'Concerts' }] : []),
  ] as { key: typeof activeTab; label: string }[];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <ScrollView className="flex-1 bg-dark-900" contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Back button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="absolute top-12 left-4 z-10 p-2 rounded-full bg-black/40"
        >
          <ChevronLeft size={24} color="white" />
        </TouchableOpacity>

        {/* Profile Header */}
        <View className="px-4 pt-16 pb-4">

          {/* Banner */}
          {profile.bannerUrl && (
            <View className="w-full h-32 rounded-xl overflow-hidden mb-3">
              <Image source={{ uri: profile.bannerUrl }} className="w-full h-full" accessibilityLabel="Profile banner" />
            </View>
          )}

          {/* Avatar + action buttons */}
          <View className="flex-row items-end justify-between mb-4">
            <Image
              source={{ uri: getAvatarUrl(profile.avatar) }}
              className="w-24 h-24 rounded-full border-4 border-white"
              accessibilityLabel={profile.username}
            />

            <View className="flex-row items-center gap-2">
              {currentUser && currentUser.id !== profile.id && (
                <>
                  <TouchableOpacity
                    onPress={handleMessage}
                    className="p-2.5 rounded-full bg-dark-700"
                  >
                    <MessageCircle size={20} color="white" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleFollowToggle}
                    disabled={isFollowLoading}
                    className={`flex-row items-center gap-2 px-4 py-2 rounded-full ${
                      followStats.isFollowing ? 'bg-dark-700 border border-dark-500' : 'bg-primary-600'
                    }`}
                  >
                    {isFollowLoading
                      ? <ActivityIndicator size="small" color="white" />
                      : followStats.isFollowing
                        ? <UserMinus size={16} color="#9ca3af" />
                        : <UserPlus size={16} color="white" />
                    }
                    <Text className={`font-medium text-sm ${followStats.isFollowing ? 'text-gray-300' : 'text-white'}`}>
                      {followStats.isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Name + handle + bio */}
          <View className="mb-3">
            <View className="flex-row items-center gap-2 flex-wrap mb-1">
              <Text className="text-2xl font-bold text-white">{profile.username}</Text>
              <VerifiedBadge verified={profile.isVerified || profile.isVerifiedArtist} size={20} />
              {profile.subscriptionTier === 'pro' && (
                <View className="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30">
                  <Text className="text-yellow-400 text-xs font-bold">PRO</Text>
                </View>
              )}
            </View>
            {profile.vanityUrl && (
              <View className="flex-row items-center gap-1 mb-1">
                <AtSign size={11} color="#a78bfa" />
                <Text className="text-violet-400 text-xs">{profile.vanityUrl}</Text>
              </View>
            )}
            <Text className="text-gray-300 text-sm">
              {profile.bio || (isMusicianProfile ? 'Musician' : 'Listener')}
            </Text>
          </View>

          {/* External links */}
          {externalLinks.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {externalLinks.map((url, i) => {
                let label = url;
                try { label = new URL(url).hostname.replace(/^www\./, ''); } catch {}
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => Linking.openURL(url).catch(console.error)}
                    className="flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-dark-700"
                  >
                    <Globe size={12} color="#9ca3af" />
                    <Text className="text-gray-300 text-xs font-medium" numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Followers / Following stats */}
          <View className="flex-row items-center gap-8">
            <TouchableOpacity onPress={handleOpenFollowers} className="flex-row items-center gap-2">
              <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
                <Users size={18} color="#7c3aed" />
              </View>
              <View>
                <Text className="text-xl font-bold text-white">
                  {followStats.followers >= 1000
                    ? `${(followStats.followers / 1000).toFixed(1)}K`
                    : followStats.followers}
                </Text>
                <Text className="text-xs text-gray-400">Followers</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleOpenFollowing} className="flex-row items-center gap-2">
              <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
                <UserIcon size={18} color="#6b7280" />
              </View>
              <View>
                <Text className="text-xl font-bold text-white">{followStats.following}</Text>
                <Text className="text-xs text-gray-400">Following</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Navigation */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mb-4">
          <View className="flex-row gap-1 bg-dark-800 rounded-lg p-1">
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`py-2 px-3 rounded-md ${activeTab === tab.key ? 'bg-primary-600' : ''}`}
              >
                <Text className={`text-sm font-medium ${activeTab === tab.key ? 'text-white' : 'text-gray-400'}`}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Tab Content */}
        <View className="px-4">

          {/* Music Tab */}
          {activeTab === 'music' && (
            <View>
              <View className="flex-row items-center gap-2 mb-4">
                <Music size={20} color="#a78bfa" />
                <Text className="text-xl font-bold text-white">Music</Text>
              </View>
              {isLoadingTracks ? (
                <View className="flex-row items-center justify-center py-8 gap-2">
                  <ActivityIndicator size="small" color="#a78bfa" />
                  <Text className="text-gray-400">Loading tracks...</Text>
                </View>
              ) : userTracks.length === 0 ? (
                <View className="items-center py-12">
                  <Music size={48} color="#4b5563" />
                  <Text className="text-gray-400 mt-4">No tracks yet.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {userTracks.map(track => (
                      <View key={track.id} className="w-[180px]">
                        <TrackCard track={track} compactGrid />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          )}

          {/* Playlists Tab */}
          {activeTab === 'playlists' && (
            <View>
              <View className="flex-row items-center gap-2 mb-4">
                <ListMusic size={20} color="#7c3aed" />
                <Text className="text-xl font-bold text-white">Playlists</Text>
              </View>
              {isLoadingPlaylists ? (
                <View className="flex-row items-center justify-center py-8 gap-2">
                  <ActivityIndicator size="small" color="#a78bfa" />
                  <Text className="text-gray-400">Loading playlists...</Text>
                </View>
              ) : playlists.length === 0 ? (
                <View className="items-center py-12">
                  <ListMusic size={48} color="#4b5563" />
                  <Text className="text-gray-400 mt-4">No playlists yet.</Text>
                </View>
              ) : (
                <View className="gap-3">
                  {playlists.map(playlist => (
                    <PlaylistCard
                      key={playlist.id}
                      playlist={playlist}
                      onPlay={playPlaylist}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      showActions={false}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Albums Tab */}
          {activeTab === 'albums' && (
            <View>
              <View className="flex-row items-center gap-2 mb-4">
                <Music size={20} color="#a78bfa" />
                <Text className="text-xl font-bold text-white">Albums</Text>
              </View>
              {isLoadingAlbums ? (
                <View className="flex-row items-center justify-center py-8 gap-2">
                  <ActivityIndicator size="small" color="#a78bfa" />
                  <Text className="text-gray-400">Loading albums...</Text>
                </View>
              ) : albums.length === 0 ? (
                <View className="items-center py-12">
                  <Music size={48} color="#4b5563" />
                  <Text className="text-gray-400 mt-4">No albums yet.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {albums.map(album => (
                      <View key={album.id} className="w-[200px]">
                        <AlbumCard
                          album={album}
                          onPlay={handlePlayAlbum}
                          onOpen={(a) => navigation.push('Artist', { artistId: a.id })}
                          onEdit={() => {}}
                          onDelete={() => {}}
                          showActions={false}
                        />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          )}

          {/* Concerts Tab */}
          {activeTab === 'concerts' && (
            <View>
              <View className="flex-row items-center gap-2 mb-4">
                <Calendar size={20} color="#a78bfa" />
                <Text className="text-xl font-bold text-white">Concerts</Text>
              </View>
              {isLoadingConcerts ? (
                <View className="flex-row items-center justify-center py-8 gap-2">
                  <ActivityIndicator size="small" color="#a78bfa" />
                  <Text className="text-gray-400">Loading concerts...</Text>
                </View>
              ) : concerts.length === 0 ? (
                <View className="items-center py-12">
                  <Calendar size={48} color="#4b5563" />
                  <Text className="text-gray-400 mt-4">No upcoming concerts.</Text>
                </View>
              ) : (
                <View className="gap-4">
                  {concerts.map(concert => (
                    <View key={concert.id} className="bg-dark-800 rounded-lg p-5 border border-dark-700">
                      <Text className="text-lg font-semibold text-white mb-2">{concert.title}</Text>
                      <View className="gap-1.5">
                        <View className="flex-row items-center gap-2">
                          <Calendar size={14} color="#a78bfa" />
                          <Text className="text-gray-300 text-sm">
                            {new Date(concert.date).toLocaleDateString('en-US', {
                              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                            })}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <MapPin size={14} color="#a78bfa" />
                          <Text className="text-gray-300 text-sm">{concert.venue}, {concert.location}</Text>
                        </View>
                        {concert.ticketPrice && (
                          <Text className="text-primary-400 font-medium text-sm">${concert.ticketPrice}</Text>
                        )}
                        {concert.description && (
                          <Text className="text-gray-400 text-sm mt-1">{concert.description}</Text>
                        )}
                      </View>
                      {concert.ticketUrl && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(concert.ticketUrl!).catch(console.error)}
                          className="mt-3 px-4 py-2 bg-primary-600 rounded-lg self-start"
                        >
                          <Text className="text-white text-sm">Get Tickets</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* About Section */}
          <View className="mt-6">
            <View className="flex-row items-center gap-2 mb-4">
              <UserIcon size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">
                About {profile.artistName || profile.username}
              </Text>
            </View>
            <View className="gap-4">
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-2">Biography</Text>
                <Text className="text-gray-300 leading-relaxed">
                  {profile.bio || 'No biography yet.'}
                </Text>
              </View>
              {(() => {
                const genres = profile.genres ?? [];
                if (!Array.isArray(genres) || genres.length === 0) return null;
                return (
                  <View className="bg-dark-800 rounded-lg p-4">
                    <Text className="text-white font-semibold mb-3">Genres</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {genres.map((genre: string, i: number) => (
                        <View key={i} className="px-3 py-1.5 bg-primary-600 rounded-full">
                          <Text className="text-white text-sm font-medium">{genre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        </View>

        {/* Followers Modal */}
        <Modal
          visible={showFollowersModal}
          transparent
          animationType="slide"
          onRequestClose={() => { setShowFollowersModal(false); setFollowersSearch(''); }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Followers</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 2 }}>{followStats.followers} followers</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowFollowersModal(false); setFollowersSearch(''); }} style={{ padding: 6 }}>
                  <X size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
                <Search size={16} color="rgba(255,255,255,0.5)" />
                <TextInput
                  value={followersSearch}
                  onChangeText={setFollowersSearch}
                  placeholder="Search followers"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                  autoCapitalize="none"
                />
                {followersSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setFollowersSearch('')}>
                    <X size={14} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                )}
              </View>
              {isFollowersLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <ActivityIndicator size="large" color="#a78bfa" />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                  {followersList.filter(f => !followersSearch || f.username?.toLowerCase().includes(followersSearch.toLowerCase())).length === 0 ? (
                    <View style={{ alignItems: 'center', paddingTop: 56 }}>
                      <Users size={48} color="#374151" strokeWidth={1.5} />
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16 }}>
                        {followersSearch ? 'No results' : 'No followers yet'}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6 }}>
                        {followersSearch ? `No one matches "${followersSearch}"` : 'Share this profile to grow followers'}
                      </Text>
                    </View>
                  ) : (
                    followersList
                      .filter(f => !followersSearch || f.username?.toLowerCase().includes(followersSearch.toLowerCase()))
                      .map(f => (
                        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
                          <Image source={{ uri: getAvatarUrl(f.avatar) }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1f2937', flexShrink: 0 }} accessibilityLabel={f.username} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{f.username}</Text>
                              <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={13} />
                            </View>
                            {f.role ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1, textTransform: 'capitalize' }}>{f.role}</Text> : null}
                          </View>
                        </View>
                      ))
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Following Modal */}
        <Modal
          visible={showFollowingModal}
          transparent
          animationType="slide"
          onRequestClose={() => { setShowFollowingModal(false); setFollowingSearch(''); }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>
              <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Following</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 2 }}>Following {followStats.following} people</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowFollowingModal(false); setFollowingSearch(''); }} style={{ padding: 6 }}>
                  <X size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
                <Search size={16} color="rgba(255,255,255,0.5)" />
                <TextInput
                  value={followingSearch}
                  onChangeText={setFollowingSearch}
                  placeholder="Search following"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                  autoCapitalize="none"
                />
                {followingSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setFollowingSearch('')}>
                    <X size={14} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                )}
              </View>
              {isFollowingListLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <ActivityIndicator size="large" color="#a78bfa" />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                  {followingList.filter(f => !followingSearch || f.username?.toLowerCase().includes(followingSearch.toLowerCase())).length === 0 ? (
                    <View style={{ alignItems: 'center', paddingTop: 56 }}>
                      <UserIcon size={48} color="#374151" strokeWidth={1.5} />
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16 }}>
                        {followingSearch ? 'No results' : 'Not following anyone yet'}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6 }}>
                        {followingSearch ? `No one matches "${followingSearch}"` : 'Discover artists to follow'}
                      </Text>
                    </View>
                  ) : (
                    followingList
                      .filter(f => !followingSearch || f.username?.toLowerCase().includes(followingSearch.toLowerCase()))
                      .map(f => (
                        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
                          <Image source={{ uri: getAvatarUrl(f.avatar) }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1f2937', flexShrink: 0 }} accessibilityLabel={f.username} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{f.username}</Text>
                              <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={13} />
                            </View>
                            {f.role ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1, textTransform: 'capitalize' }}>{f.role}</Text> : null}
                          </View>
                        </View>
                      ))
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

export default ProfileByIdScreen;
