import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Share,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Music,
  User as UserIcon,
  ListMusic,
  UserPlus,
  UserMinus,
  Edit,
  Trash2,
  Settings,
  Lock,
  Play,
  Share2,
  Users,
  Calendar,
  MapPin,
  X,
  Bookmark,
  ThumbsUp,
  Check,
  Globe,
  Camera,
  AtSign,
  MessageCircle,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { ChatService } from '../../services/chatService';
import { FollowService } from '../../services/followService';
import type { FollowStats } from '../../services/followService';
import { MusicService } from '../../services/musicService';
import { ConcertService } from '../../services/concertService';
import type { Concert, CreateConcertData } from '../../services/concertService';
import { AlbumService } from '../../services/albumService';
import type { Album } from '../../services/albumService';
import type { Track, Playlist } from '../../store/useStore';
import MusicPlayerModal from '../../components/player/MusicPlayerModal';
import PlaylistCard from '../../components/music/PlaylistCard';
import TrackCard from '../../components/music/TrackCard';
import AlbumCard from '../../components/music/AlbumCard';
import FollowRequestCard from '../../components/social/FollowRequestCard';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getAvatarUrl } from '../../utils/avatar';
import { supabase } from '../../services/supabase';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

const GENRES = ['Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical', 'Country', 'Folk', 'Reggae', 'Blues', 'Funk', 'House', 'Techno', 'Ambient'];
const FREE_CONCERT_LIMIT = 1;

const Profile: React.FC = () => {
  const navigation = useNavigation<ProfileNavProp>();
  const {
    user: currentUser,
    isAuthenticated,
    setUser,
    updateProfile,
    playTrack,
    playQueue,
    playPlaylist,
    setSettingsOpen,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'music' | 'playlists' | 'albums' | 'concerts' | 'bookmark' | 'liked'>('music');
  const [followStats, setFollowStats] = useState<FollowStats>({ followers: 0, following: 0, isFollowing: false });

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '', email: '', bio: '', artistName: '',
    genres: [] as string[], isPrivate: false, vanityUrl: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [vanityError, setVanityError] = useState<string | null>(null);

  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);

  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [albumForm, setAlbumForm] = useState({ title: '', artist: '', genre: '', description: '', price: '' });

  const [isEditingConcerts, setIsEditingConcerts] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  const [isAddingConcert, setIsAddingConcert] = useState(false);
  const [concertForm, setConcertForm] = useState({
    title: '', date: '', location: '', venue: '',
    description: '', ticketPrice: '', ticketUrl: '',
  });

  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [aboutForm, setAboutForm] = useState({ bio: '', genres: [] as string[] });

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showPendingRequestsModal, setShowPendingRequestsModal] = useState(false);
  const [acceptDeclineLoadingId, setAcceptDeclineLoadingId] = useState<string | null>(null);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [isFollowersLoading, setIsFollowersLoading] = useState(false);
  const [isFollowingListLoading, setIsFollowingListLoading] = useState(false);

  const [bookmarks, setBookmarks] = useState<Track[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [isLoadingLikedTracks, setIsLoadingLikedTracks] = useState(false);

  const [showLinksModal, setShowLinksModal] = useState(false);
  const [linkInputs, setLinkInputs] = useState<string[]>(['', '', '']);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const profileLinkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [userTracks, setUserTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  const isCurrentUserPro = currentUser?.subscriptionTier === 'pro';
  const atConcertLimit = !isCurrentUserPro && concerts.length >= FREE_CONCERT_LIMIT;

  useEffect(() => {
    return () => {
      if (profileLinkCopyTimerRef.current) clearTimeout(profileLinkCopyTimerRef.current);
    };
  }, []);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      if (currentUser) {
        try {
          const freshUser = await ChatService.getUserById(currentUser.id);
          if (freshUser) setUser(freshUser);
        } catch (error) {
          console.error('Failed to refresh profile:', error);
        }
        try {
          const stats = await FollowService.getFollowStats(currentUser.id);
          setFollowStats(stats);
        } catch (error) {
          console.error('Failed to load follow stats:', error);
        }
      }
      setIsLoading(false);
    };
    loadProfile();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadUserTracks = async () => {
      if (!currentUser) return;
      setIsLoadingTracks(true);
      try {
        const tracks = await MusicService.getUserTracks(currentUser.id);
        setUserTracks(tracks);
      } catch (error) {
        console.error('Failed to load user tracks:', error);
      } finally {
        setIsLoadingTracks(false);
      }
    };
    loadUserTracks();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadPlaylists = async () => {
      if (!currentUser) return;
      setIsLoadingPlaylists(true);
      try {
        const fetched = await MusicService.getPlaylists(currentUser.id);
        const withTracks = await Promise.all(
          fetched.map(async (p) => {
            try { return await MusicService.getPlaylistById(p.id); } catch { return p; }
          })
        );
        setPlaylists(withTracks);
      } catch (error) {
        console.error('Failed to load playlists:', error);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };
    loadPlaylists();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (!currentUser) return;
      setIsLoadingAlbums(true);
      try {
        setAlbums(await AlbumService.getUserAlbums(currentUser.id));
      } catch (error) {
        console.error('Failed to load albums:', error);
        setAlbums([]);
      } finally {
        setIsLoadingAlbums(false);
      }
    };
    loadAlbums();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadConcerts = async () => {
      if (!currentUser) return;
      setIsLoadingConcerts(true);
      try {
        setConcerts(await ConcertService.getUserConcerts(currentUser.id));
      } catch (error) {
        console.error('Failed to load concerts:', error);
        setConcerts([]);
      } finally {
        setIsLoadingConcerts(false);
      }
    };
    loadConcerts();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadPendingRequests = async () => {
      if (!currentUser?.isPrivate) return;
      const requests = await FollowService.getPendingFollowRequestsWithDetails(currentUser.id);
      setPendingRequests(requests);
    };
    loadPendingRequests();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadBookmarks = async () => {
      if (!currentUser) return;
      setIsLoadingBookmarks(true);
      try {
        setBookmarks(await MusicService.getUserBookmarks(currentUser.id));
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
        setBookmarks([]);
      } finally {
        setIsLoadingBookmarks(false);
      }
    };
    loadBookmarks();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadLikedTracks = async () => {
      if (!currentUser) return;
      setIsLoadingLikedTracks(true);
      try {
        setLikedTracks(await MusicService.getUserLikedTracks(currentUser.id));
      } catch (error) {
        console.error('Failed to load liked tracks:', error);
        setLikedTracks([]);
      } finally {
        setIsLoadingLikedTracks(false);
      }
    };
    loadLikedTracks();
  }, [currentUser?.id]);

  const handleShareProfile = useCallback(async () => {
    if (!currentUser) return;
    const vanity = (currentUser as any).vanityUrl;
    const url = vanity
      ? `https://remixr.app/@${vanity}`
      : `https://remixr.app/profile/${encodeURIComponent(currentUser.username?.trim() || currentUser.id)}`;
    try {
      await Share.share({ message: url, url });
      setProfileLinkCopied(true);
      if (profileLinkCopyTimerRef.current) clearTimeout(profileLinkCopyTimerRef.current);
      profileLinkCopyTimerRef.current = setTimeout(() => setProfileLinkCopied(false), 2200);
    } catch (error) {
      console.error('Failed to share:', error);
    }
  }, [currentUser]);

  const openExternalLinksModal = useCallback(() => {
    const existing = ((currentUser as any)?.externalLinks ?? []).slice(0, 3) as string[];
    setLinkInputs([...existing, '', '', ''].slice(0, 3));
    setShowLinksModal(true);
  }, [currentUser]);

  const handleDeleteTrack = async (trackId: string) => {
    if (!currentUser) return;
    setDeletingTrackId(trackId);
    try {
      await MusicService.deleteTrack(trackId, currentUser.id);
      setUserTracks(prev => prev.filter(t => t.id !== trackId));
    } catch (error) {
      console.error('Failed to delete track:', error);
    } finally {
      setDeletingTrackId(null);
      setShowDeleteConfirm(null);
    }
  };

  const refreshFollowStats = async () => {
    if (!currentUser) return;
    try {
      setFollowStats(await FollowService.getFollowStats(currentUser.id));
    } catch (error) {
      console.error('Failed to refresh follow stats:', error);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setAcceptDeclineLoadingId(requestId);
    try {
      await FollowService.acceptFollowRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      setFollowStats(prev => ({ ...prev, followers: prev.followers + 1 }));
    } finally {
      setAcceptDeclineLoadingId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setAcceptDeclineLoadingId(requestId);
    try {
      await FollowService.declineFollowRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } finally {
      setAcceptDeclineLoadingId(null);
    }
  };

  const handleEditProfile = () => {
    if (!currentUser) return;
    setEditForm({
      username: currentUser.username,
      email: currentUser.email,
      bio: currentUser.bio || '',
      artistName: currentUser.artistName || '',
      genres: currentUser.genres || [],
      isPrivate: currentUser.isPrivate || false,
      vanityUrl: (currentUser as any).vanityUrl || '',
    });
    setVanityError(null);
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    setVanityError(null);
    const newVanity = (editForm.vanityUrl || '').trim().toLowerCase() || undefined;
    if (newVanity && newVanity !== (currentUser as any)?.vanityUrl) {
      if (newVanity.length < 3) { setVanityError('Handle must be at least 3 characters'); return; }
      const available = await ChatService.isVanityUrlAvailable(newVanity, currentUser.id);
      if (!available) { setVanityError('This handle is already taken'); return; }
    }
    setIsSaving(true);
    try {
      await updateProfile({
        username: editForm.username,
        email: editForm.email,
        bio: editForm.bio,
        artistName: editForm.artistName,
        genres: editForm.genres,
        isPrivate: editForm.isPrivate,
        vanityUrl: newVanity,
      } as any);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStripeOnboard = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch('/api/create-stripe-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await response.json();
      if (data.url) { await Linking.openURL(data.url); }
      else { console.error('Failed to create Stripe account:', data.error); }
    } catch (error) {
      console.error('Failed to onboard with Stripe:', error);
    }
  };

  const handleSaveLinks = async () => {
    if (!currentUser) return;
    const externalLinks = linkInputs.map(u => u.trim()).filter(Boolean).slice(0, 3);
    setIsSavingLinks(true);
    try {
      const updated = await updateProfile({ externalLinks } as any);
      setShowLinksModal(false);
    } catch (error) {
      console.error('Failed to save links:', error);
    } finally {
      setIsSavingLinks(false);
    }
  };

  const handleOpenFollowers = async () => {
    setShowFollowersModal(true);
    setIsFollowersLoading(true);
    try {
      setFollowersList(await FollowService.getFollowers(currentUser!.id));
    } catch { setFollowersList([]); } finally { setIsFollowersLoading(false); }
  };

  const handleOpenFollowing = async () => {
    setShowFollowingModal(true);
    setIsFollowingListLoading(true);
    try {
      setFollowingList(await FollowService.getFollowing(currentUser!.id));
    } catch { setFollowingList([]); } finally { setIsFollowingListLoading(false); }
  };

  const handleUnfollowFromFollowingList = async (followingId: string) => {
    if (!currentUser) return;
    try {
      await FollowService.unfollowUser(currentUser.id, followingId);
      setFollowingList(prev => prev.filter(u => u.id !== followingId));
      setFollowStats(prev => ({ ...prev, following: Math.max(0, prev.following - 1) }));
    } catch (error) { console.error('Failed to unfollow:', error); }
  };

  const handleRemoveFollower = async (followerId: string) => {
    if (!currentUser) return;
    try {
      await FollowService.unfollowUser(followerId, currentUser.id);
      setFollowersList(prev => prev.filter(u => u.id !== followerId));
      setFollowStats(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } catch (error) { console.error('Failed to remove follower:', error); }
  };

  const handlePlayAlbum = async (album: Album) => {
    try {
      const tracks = await MusicService.getTracksByAlbum(album.id);
      if (tracks.length > 0) playQueue(tracks);
    } catch (error) { console.error('Failed to load album tracks:', error); }
  };

  // Album handlers
  const handleEditAlbum = (album: Album) => {
    setAlbumForm({ title: album.title, artist: album.artist, genre: album.genre, description: album.description || '', price: album.price?.toString() || '' });
    setEditingAlbum(album);
  };

  const handleSaveAlbum = async () => {
    if (!currentUser || !editingAlbum) return;
    try {
      const updated = await AlbumService.updateAlbum(editingAlbum.id, currentUser.id, {
        ...albumForm, price: albumForm.price ? parseFloat(albumForm.price) : undefined,
        cover: editingAlbum.cover || '', userId: currentUser.id,
      });
      setAlbums(prev => prev.map(a => a.id === editingAlbum.id ? updated : a));
      setEditingAlbum(null);
      setAlbumForm({ title: '', artist: '', genre: '', description: '', price: '' });
    } catch (error) { console.error('Failed to save album:', error); }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!currentUser) return;
    try {
      await AlbumService.deleteAlbum(albumId, currentUser.id);
      setAlbums(prev => prev.filter(a => a.id !== albumId));
    } catch (error) { console.error('Failed to delete album:', error); }
  };

  // Concert handlers
  const handleAddConcert = () => {
    if (atConcertLimit) return;
    setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '' });
    setIsAddingConcert(true);
  };

  const handleEditConcert = (concert: Concert) => {
    setConcertForm({
      title: concert.title, date: concert.date.split('T')[0], location: concert.location,
      venue: concert.venue, description: concert.description || '',
      ticketPrice: concert.ticketPrice?.toString() || '', ticketUrl: concert.ticketUrl || '',
    });
    setEditingConcert(concert);
  };

  const handleSaveConcert = async () => {
    if (!currentUser) return;
    if (!concertForm.title.trim()) { Alert.alert('Error', 'Please enter a concert title'); return; }
    if (!concertForm.date) { Alert.alert('Error', 'Please select a date'); return; }
    if (!concertForm.venue.trim()) { Alert.alert('Error', 'Please enter a venue'); return; }
    if (!concertForm.location.trim()) { Alert.alert('Error', 'Please enter a location'); return; }
    try {
      const dateValue = concertForm.date.includes('T') ? concertForm.date : `${concertForm.date}T00:00:00.000Z`;
      const concertData: CreateConcertData = {
        title: concertForm.title.trim(), date: dateValue, location: concertForm.location.trim(),
        venue: concertForm.venue.trim(), description: concertForm.description.trim() || undefined,
        ticketPrice: concertForm.ticketPrice ? parseFloat(concertForm.ticketPrice) : undefined,
        ticketUrl: concertForm.ticketUrl.trim() || undefined, userId: currentUser.id,
      };
      if (editingConcert) {
        const updated = await ConcertService.updateConcert(editingConcert.id, currentUser.id, concertData);
        setConcerts(prev => prev.map(c => c.id === editingConcert.id ? updated : c));
        setEditingConcert(null);
      } else {
        const newConcert = await ConcertService.createConcert(concertData);
        setConcerts(prev => [...prev, newConcert].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        setIsAddingConcert(false);
      }
      setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '' });
    } catch (error) {
      console.error('Failed to save concert:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save concert. Please try again.');
    }
  };

  const handleDeleteConcert = async (concertId: string) => {
    if (!currentUser) return;
    try {
      await ConcertService.deleteConcert(concertId, currentUser.id);
      setConcerts(prev => prev.filter(c => c.id !== concertId));
    } catch (error) { console.error('Failed to delete concert:', error); }
  };

  const handleCancelConcertEdit = () => {
    setEditingConcert(null); setIsAddingConcert(false);
    setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '' });
  };

  // About handlers
  const handleEditAbout = () => {
    setAboutForm({ bio: currentUser?.bio || '', genres: currentUser?.genres || [] });
    setIsEditingAbout(true);
  };

  const handleSaveAbout = async () => {
    if (!currentUser) return;
    try {
      await updateProfile({ bio: aboutForm.bio, genres: aboutForm.genres });
      setIsEditingAbout(false);
    } catch (error) { console.error('Failed to update about section:', error); }
  };

  const handleAddGenre = (genre: string) => {
    if (genre && !aboutForm.genres.includes(genre)) {
      setAboutForm(prev => ({ ...prev, genres: [...prev.genres, genre] }));
    }
  };

  const handleRemoveGenre = (genre: string) => {
    setAboutForm(prev => ({ ...prev, genres: prev.genres.filter(g => g !== genre) }));
  };

  // ── Early returns ──

  if (!isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center p-6 gap-4">
        <Lock size={64} color="#6b7280" />
        <Text className="text-2xl font-bold text-white">Authentication Required</Text>
        <Text className="text-gray-400 text-center">You need to sign in to view profiles.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-3">
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text className="text-gray-400">Loading profile...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400">User not found</Text>
      </View>
    );
  }

  const externalLinks = ((currentUser as any).externalLinks ?? []).filter(Boolean).slice(0, 3) as string[];

  return (
    <ScrollView className="flex-1 bg-dark-900" contentContainerStyle={{ paddingBottom: 32 }}>

      {/* Profile Header */}
      <View className="px-4 pt-6 pb-4">

        {/* Banner */}
        {(currentUser as any).bannerUrl && (
          <View className="w-full h-32 rounded-xl overflow-hidden mb-3">
            <Image
              source={{ uri: (currentUser as any).bannerUrl }}
              className="w-full h-full"
              accessibilityLabel="Profile banner"
            />
          </View>
        )}

        {/* Avatar + actions row */}
        <View className="flex-row items-end justify-between mb-4">
          <TouchableOpacity
            onPress={() => Alert.alert('Coming soon', 'Avatar upload requires expo-image-picker.')}
            className="relative"
          >
            <Image
              source={{ uri: getAvatarUrl(currentUser.avatar) }}
              className="w-24 h-24 rounded-full border-4 border-white"
              accessibilityLabel={currentUser.username}
            />
            <View className="absolute bottom-0 right-0 w-7 h-7 bg-dark-700 rounded-full items-center justify-center border-2 border-dark-900">
              {isUploadingAvatar
                ? <ActivityIndicator size="small" color="white" />
                : <Camera size={13} color="white" />
              }
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleEditProfile}
            className="flex-row items-center gap-2 px-4 py-2 bg-primary-600 rounded-full"
          >
            <Edit size={16} color="white" />
            <Text className="text-white font-medium text-sm">Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Name + handle + bio */}
        <View className="mb-3">
          <View className="flex-row items-center gap-2 flex-wrap mb-1">
            <Text className="text-2xl font-bold text-white">{currentUser.username}</Text>
            <VerifiedBadge verified={currentUser.isVerified || (currentUser as any).isVerifiedArtist} size={20} />
            {(currentUser as any).subscriptionTier === 'pro' && (
              <View className="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30">
                <Text className="text-yellow-400 text-xs font-bold">PRO</Text>
              </View>
            )}
            {currentUser.isPrivate && <Lock size={16} color="#9ca3af" />}
          </View>
          {(currentUser as any).vanityUrl && (
            <View className="flex-row items-center gap-1 mb-1">
              <AtSign size={11} color="#a78bfa" />
              <Text className="text-violet-400 text-xs">{(currentUser as any).vanityUrl}</Text>
            </View>
          )}
          <Text className="text-gray-300 text-sm">
            {currentUser.bio || (currentUser.role === 'musician' ? 'Musician' : 'Listener')}
          </Text>
        </View>

        {/* Icon actions */}
        <View className="flex-row items-center gap-3 mb-4">
          <TouchableOpacity
            onPress={handleShareProfile}
            className="p-2.5 rounded-full bg-dark-700"
          >
            {profileLinkCopied ? <Check size={20} color="#34d399" /> : <Share2 size={20} color="white" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openExternalLinksModal}
            className="p-2.5 rounded-full bg-dark-700"
          >
            <Globe size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            className="p-2.5 rounded-full bg-dark-700"
          >
            <Settings size={20} color="white" />
          </TouchableOpacity>
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

        {/* Follower/Following stats */}
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

          {pendingRequests.length > 0 && (
            <TouchableOpacity onPress={() => setShowPendingRequestsModal(true)} className="flex-row items-center gap-2">
              <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
                <UserPlus size={18} color="#f59e0b" />
              </View>
              <View>
                <Text className="text-xl font-bold text-white">{pendingRequests.length}</Text>
                <Text className="text-xs text-gray-400">Requests</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab Navigation */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mb-4">
        <View className="flex-row gap-1 bg-dark-800 rounded-lg p-1">
          {[
            { key: 'music', label: 'Music' },
            { key: 'playlists', label: 'Playlists' },
            { key: 'albums', label: currentUser.role === 'musician' ? 'Albums' : 'Preferences' },
            ...(currentUser.role === 'musician' ? [{ key: 'concerts', label: 'Concerts' }] : []),
            { key: 'bookmark', label: 'Bookmarks' },
            { key: 'liked', label: 'Liked' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
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

        {/* ── Music Tab ── */}
        {activeTab === 'music' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Music size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">
                {currentUser.role === 'musician' ? 'My Music' : 'My Music Collection'}
              </Text>
            </View>
            {isLoadingTracks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading tracks...</Text>
              </View>
            ) : userTracks.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-gray-400 mb-2">
                  {currentUser.role === 'musician' ? 'No tracks uploaded yet.' : 'No music in collection yet.'}
                </Text>
                <Text className="text-gray-500 text-sm">
                  {currentUser.role === 'musician' ? 'Upload your first track to get started!' : 'Discover and add music to your collection!'}
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-4 pl-1 pr-6">
                  {userTracks.map(track => (
                    <View key={track.id} className="w-[180px]">
                      <TrackCard
                        track={track}
                        onDelete={() => handleDeleteTrack(track.id)}
                        compactGrid
                        showActions
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Playlists Tab ── */}
        {activeTab === 'playlists' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <ListMusic size={20} color="#7c3aed" />
              <Text className="text-xl font-bold text-white">My Playlists</Text>
            </View>
            {isLoadingPlaylists ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading playlists...</Text>
              </View>
            ) : playlists.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-gray-400 mb-2">No playlists created yet.</Text>
                <Text className="text-gray-500 text-sm">Create your first playlist to get started!</Text>
              </View>
            ) : (
              <View className="gap-3">
                {playlists.map(playlist => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    onPlay={playPlaylist}
                    onEdit={() => {}}
                    onDelete={async (id) => {
                      try {
                        await MusicService.deletePlaylist(id, currentUser.id);
                        setPlaylists(prev => prev.filter(p => p.id !== id));
                      } catch (e) { console.error('Failed to delete playlist:', e); }
                    }}
                    showActions
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Albums Tab (consumer) ── */}
        {activeTab === 'albums' && currentUser.role === 'consumer' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Music size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">My Music Preferences</Text>
            </View>
            <View className="items-center py-12">
              <Music size={48} color="#4b5563" />
              <Text className="text-gray-400 mt-4 mb-2">Music preferences coming soon!</Text>
              <Text className="text-gray-500 text-sm text-center">We'll help you discover music based on your listening habits.</Text>
            </View>
          </View>
        )}

        {/* ── Albums Tab (musician) ── */}
        {activeTab === 'albums' && currentUser.role === 'musician' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Music size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">My Albums</Text>
            </View>
            {isLoadingAlbums ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading albums...</Text>
              </View>
            ) : albums.length === 0 ? (
              <View className="items-center py-12">
                <Music size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">No albums uploaded yet.</Text>
                <Text className="text-gray-500 text-sm">Upload albums on the Upload page!</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-4 pl-1 pr-6">
                  {albums.map(album => (
                    <View key={album.id} className="w-[200px]">
                      {editingAlbum?.id === album.id ? (
                        <View className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                          <View className="gap-3">
                            {[
                              { label: 'Album Title', key: 'title', placeholder: 'Album title' },
                              { label: 'Artist', key: 'artist', placeholder: 'Artist name' },
                              { label: 'Genre', key: 'genre', placeholder: 'Genre' },
                              { label: 'Price (optional)', key: 'price', placeholder: 'Price', numeric: true },
                            ].map(field => (
                              <View key={field.key}>
                                <Text className="text-gray-300 text-xs font-medium mb-1">{field.label}</Text>
                                <TextInput
                                  value={(albumForm as any)[field.key]}
                                  onChangeText={v => setAlbumForm(prev => ({ ...prev, [field.key]: v }))}
                                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                                  placeholder={field.placeholder}
                                  placeholderTextColor="#6b7280"
                                  keyboardType={field.numeric ? 'numeric' : 'default'}
                                />
                              </View>
                            ))}
                            <View>
                              <Text className="text-gray-300 text-xs font-medium mb-1">Description</Text>
                              <TextInput
                                value={albumForm.description}
                                onChangeText={v => setAlbumForm(prev => ({ ...prev, description: v }))}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                                placeholder="Description"
                                placeholderTextColor="#6b7280"
                                multiline
                                numberOfLines={3}
                              />
                            </View>
                            <View className="flex-row gap-2">
                              <TouchableOpacity onPress={handleSaveAlbum} className="flex-1 py-2 bg-primary-600 rounded-lg items-center">
                                <Text className="text-white text-sm">Save</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { setEditingAlbum(null); }} className="flex-1 py-2 bg-dark-700 rounded-lg items-center">
                                <Text className="text-white text-sm">Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <AlbumCard
                          album={album}
                          onPlay={handlePlayAlbum}
                          onOpen={(a) => navigation.navigate('Artist', { artistId: a.id })}
                          onEdit={handleEditAlbum}
                          onDelete={handleDeleteAlbum}
                          showActions
                        />
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Concerts Tab ── */}
        {activeTab === 'concerts' && (
          <View>
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <Calendar size={20} color="#a78bfa" />
                <Text className="text-xl font-bold text-white">My Concerts</Text>
              </View>
              <View className="flex-row items-center gap-3">
                {!isCurrentUserPro && (
                  <Text className={`text-xs font-medium ${atConcertLimit ? 'text-amber-500' : 'text-gray-400'}`}>
                    {concerts.length}/{FREE_CONCERT_LIMIT} used
                  </Text>
                )}
                {atConcertLimit ? (
                  <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <Lock size={13} color="#f59e0b" />
                    <Text className="text-yellow-400 text-sm font-medium">Go Pro</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleAddConcert} className="flex-row items-center gap-2 px-3 py-2 bg-primary-600 rounded-lg">
                    <Calendar size={14} color="white" />
                    <Text className="text-white text-sm">Add Concert</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isLoadingConcerts ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading concerts...</Text>
              </View>
            ) : concerts.length === 0 && !isAddingConcert ? (
              <View className="items-center py-12">
                <Calendar size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">No upcoming concerts scheduled.</Text>
                <Text className="text-gray-500 text-sm">Add your concert dates to let fans know where to find you!</Text>
              </View>
            ) : (
              <View className="gap-4">
                {concerts.map(concert => (
                  <View key={concert.id} className="bg-dark-800 rounded-lg p-5 border border-dark-700">
                    {editingConcert?.id === concert.id ? (
                      <ConcertForm form={concertForm} setForm={setConcertForm} onSave={handleSaveConcert} onCancel={handleCancelConcertEdit} label="Save Changes" />
                    ) : (
                      <View>
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <Text className="text-lg font-semibold text-white mb-2">{concert.title}</Text>
                            <View className="gap-1.5">
                              <View className="flex-row items-center gap-2">
                                <Calendar size={14} color="#a78bfa" />
                                <Text className="text-gray-300 text-sm">
                                  {new Date(concert.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
                          <View className="flex-row items-center gap-1 ml-3">
                            <TouchableOpacity onPress={() => handleEditConcert(concert)} className="p-2">
                              <Edit size={16} color="#9ca3af" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteConcert(concert.id)} className="p-2">
                              <Trash2 size={16} color="#f87171" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                ))}

                {isAddingConcert && (
                  <View className="bg-dark-800 rounded-lg p-5 border border-dark-700">
                    <Text className="text-lg font-semibold text-white mb-4">Add New Concert</Text>
                    <ConcertForm form={concertForm} setForm={setConcertForm} onSave={handleSaveConcert} onCancel={handleCancelConcertEdit} label="Add Concert" />
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Bookmarks Tab ── */}
        {activeTab === 'bookmark' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Bookmark size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">My Bookmarks</Text>
            </View>
            {isLoadingBookmarks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading bookmarks...</Text>
              </View>
            ) : bookmarks.length === 0 ? (
              <View className="items-center py-12">
                <Bookmark size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">No bookmarks yet.</Text>
                <Text className="text-gray-500 text-sm">Bookmark tracks you love by tapping the bookmark icon!</Text>
              </View>
            ) : (
              <View>
                {bookmarks.length >= 1 && (
                  <TouchableOpacity
                    onPress={() => playQueue(bookmarks)}
                    className="mb-4 px-4 py-2 bg-primary-600 rounded-lg self-start"
                  >
                    <Text className="text-white font-semibold text-sm">
                      {bookmarks.length === 1 ? 'Play Bookmark' : 'Play All Bookmarks'}
                    </Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {bookmarks.map(track => (
                      <View key={track.id} className="w-[180px]">
                        <TrackCard track={track} compactGrid />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ── Liked Tab ── */}
        {activeTab === 'liked' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <ThumbsUp size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">Liked Tracks</Text>
            </View>
            {isLoadingLikedTracks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400">Loading liked tracks...</Text>
              </View>
            ) : likedTracks.length === 0 ? (
              <View className="items-center py-12">
                <ThumbsUp size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">No liked tracks yet.</Text>
                <Text className="text-gray-500 text-sm">Like tracks from Discover or tap the thumbs up on any track!</Text>
              </View>
            ) : (
              <View>
                {likedTracks.length > 1 && (
                  <TouchableOpacity
                    onPress={() => playQueue(likedTracks)}
                    className="mb-4 px-4 py-2 bg-primary-600 rounded-lg self-start"
                  >
                    <Text className="text-white font-semibold text-sm">Play All Liked</Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {likedTracks.map(track => (
                      <View key={track.id} className="w-[180px]">
                        <TrackCard track={track} compactGrid />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ── About Section (always visible) ── */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <UserIcon size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-white">
                About {currentUser.artistName || currentUser.username}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleEditAbout}
              className="flex-row items-center gap-2 px-3 py-2 bg-primary-600 rounded-lg"
            >
              <Edit size={14} color="white" />
              <Text className="text-white text-sm">Edit</Text>
            </TouchableOpacity>
          </View>

          {isEditingAbout ? (
            <View className="gap-4">
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">Biography</Text>
                <TextInput
                  value={aboutForm.bio}
                  onChangeText={v => setAboutForm(prev => ({ ...prev, bio: v }))}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                  placeholder="Tell your fans about yourself..."
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={4}
                />
              </View>
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">Musical Genres</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {aboutForm.genres.map((genre, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleRemoveGenre(genre)}
                      className="flex-row items-center gap-1.5 px-3 py-1 bg-primary-600 rounded-full"
                    >
                      <Text className="text-white text-sm">{genre}</Text>
                      <X size={12} color="white" />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-gray-400 text-xs mb-2">Tap to add:</Text>
                <View className="flex-row flex-wrap gap-2">
                  {GENRES.filter(g => !aboutForm.genres.includes(g)).map(genre => (
                    <TouchableOpacity
                      key={genre}
                      onPress={() => handleAddGenre(genre)}
                      className="px-3 py-1 bg-dark-600 rounded-full border border-dark-500"
                    >
                      <Text className="text-gray-300 text-sm">{genre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity onPress={handleSaveAbout} className="flex-1 py-2.5 bg-primary-600 rounded-lg items-center">
                  <Text className="text-white font-semibold">Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsEditingAbout(false)} className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center">
                  <Text className="text-white">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="gap-4">
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-2">Biography</Text>
                <Text className="text-gray-300 leading-relaxed">
                  {currentUser.bio || 'Follow to stay updated with their latest discoveries.'}
                </Text>
              </View>
              {(() => {
                const genres = currentUser.genres ?? [];
                if (!Array.isArray(genres) || genres.length === 0) return null;
                return (
                  <View className="bg-dark-800 rounded-lg p-4">
                    <Text className="text-white font-semibold mb-3">Favorite Genres</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {genres.map((genre, i) => (
                        <View key={i} className="px-3 py-1.5 bg-primary-600 rounded-full">
                          <Text className="text-white text-sm font-medium">{genre}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">Connect</Text>
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    onPress={handleShareProfile}
                    className="flex-row items-center gap-2 px-4 py-2 bg-dark-700 rounded-lg"
                  >
                    {profileLinkCopied ? <Check size={16} color="#34d399" /> : <Share2 size={16} color="white" />}
                    <Text className="text-white text-sm">{profileLinkCopied ? 'Shared!' : 'Share profile'}</Text>
                  </TouchableOpacity>
                  {isCurrentUserPro && (
                    <TouchableOpacity onPress={openExternalLinksModal}>
                      <Text className="text-primary-400 text-sm py-2">Website & social links</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={isEditing} transparent animationType="slide" onRequestClose={() => setIsEditing(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <ScrollView className="bg-white rounded-t-2xl" style={{ maxHeight: '85%' }}>
            <View className="p-6">
              <Text className="text-xl font-bold text-black mb-4">Edit Profile</Text>
              <View className="gap-4">
                <View>
                  <Text className="text-black font-medium mb-2">Username</Text>
                  <TextInput
                    value={editForm.username}
                    onChangeText={v => setEditForm(prev => ({ ...prev, username: v }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black text-sm"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                {isCurrentUserPro && (
                  <View>
                    <Text className="text-black font-medium mb-1">
                      Vanity URL <Text className="text-yellow-700 text-xs font-bold bg-yellow-100 px-1 rounded">PRO</Text>
                    </Text>
                    <Text className="text-gray-500 text-xs mb-2">Lowercase letters, numbers, hyphens (3–30 chars)</Text>
                    <View className="flex-row border border-gray-300 rounded-lg overflow-hidden">
                      <View className="px-3 py-2 bg-gray-50 border-r border-gray-300">
                        <Text className="text-gray-400 text-sm">@</Text>
                      </View>
                      <TextInput
                        value={editForm.vanityUrl || ''}
                        onChangeText={v => setEditForm(prev => ({ ...prev, vanityUrl: v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) }))}
                        placeholder="your-handle"
                        placeholderTextColor="#9ca3af"
                        className="flex-1 px-3 py-2 text-black text-sm"
                        autoCapitalize="none"
                      />
                    </View>
                    {vanityError && <Text className="text-red-500 text-xs mt-1">{vanityError}</Text>}
                  </View>
                )}
                <View>
                  <Text className="text-black font-medium mb-2">Bio</Text>
                  <TextInput
                    value={editForm.bio}
                    onChangeText={v => setEditForm(prev => ({ ...prev, bio: v }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black text-sm"
                    placeholder="Tell people about yourself…"
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
              <View className="flex-row gap-3 mt-6">
                <TouchableOpacity
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                  className={`flex-1 py-2.5 rounded-lg items-center ${isSaving ? 'bg-primary-600/50' : 'bg-primary-600'}`}
                >
                  <Text className="text-white text-sm font-medium">{isSaving ? 'Saving...' : 'Save Changes'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsEditing(false)}
                  className="flex-1 py-2.5 bg-gray-200 rounded-lg items-center"
                >
                  <Text className="text-gray-800 text-sm">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal visible={!!showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(null)}>
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-dark-900 rounded-2xl w-full max-w-sm p-6">
            <Text className="text-xl font-bold text-white mb-3">Delete Track</Text>
            <Text className="text-gray-400 mb-6">Are you sure you want to delete this track? This action cannot be undone.</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => showDeleteConfirm && handleDeleteTrack(showDeleteConfirm)}
                disabled={deletingTrackId === showDeleteConfirm}
                className={`flex-1 py-2.5 rounded-lg items-center ${deletingTrackId === showDeleteConfirm ? 'bg-red-600/50' : 'bg-red-600'}`}
              >
                <Text className="text-white font-semibold">
                  {deletingTrackId === showDeleteConfirm ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center"
              >
                <Text className="text-white">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Followers Modal ── */}
      <Modal visible={showFollowersModal} transparent animationType="slide" onRequestClose={() => setShowFollowersModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl" style={{ maxHeight: '60%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Followers</Text>
              <TouchableOpacity onPress={() => setShowFollowersModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-3">
              {isFollowersLoading ? (
                <View className="items-center py-8"><ActivityIndicator size="small" color="#a78bfa" /></View>
              ) : followersList.length === 0 ? (
                <Text className="text-center text-gray-400 py-8">No followers yet.</Text>
              ) : (
                followersList.map(f => (
                  <View key={f.id} className="flex-row items-center justify-between gap-3 py-3 border-b border-dark-700/40">
                    <View className="flex-row items-center gap-3 flex-1 min-w-0">
                      <Image source={{ uri: getAvatarUrl(f.avatar) }} className="w-8 h-8 rounded-full flex-shrink-0" accessibilityLabel={f.username} />
                      <Text className="text-white font-medium flex-1" numberOfLines={1}>{f.username}</Text>
                      <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={16} />
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveFollower(f.id)} className="px-3 py-1.5 rounded-lg bg-red-500/10">
                      <Text className="text-red-400 text-sm font-medium">Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Following Modal ── */}
      <Modal visible={showFollowingModal} transparent animationType="slide" onRequestClose={() => setShowFollowingModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl" style={{ maxHeight: '60%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Following</Text>
              <TouchableOpacity onPress={() => setShowFollowingModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-3">
              {isFollowingListLoading ? (
                <View className="items-center py-8"><ActivityIndicator size="small" color="#a78bfa" /></View>
              ) : followingList.length === 0 ? (
                <Text className="text-center text-gray-400 py-8">Not following anyone yet.</Text>
              ) : (
                followingList.map(f => (
                  <View key={f.id} className="flex-row items-center justify-between gap-3 py-3 border-b border-dark-700/40">
                    <View className="flex-row items-center gap-3 flex-1 min-w-0">
                      <Image source={{ uri: getAvatarUrl(f.avatar) }} className="w-8 h-8 rounded-full flex-shrink-0" accessibilityLabel={f.username} />
                      <Text className="text-white font-medium flex-1" numberOfLines={1}>{f.username}</Text>
                      <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={16} />
                    </View>
                    <TouchableOpacity
                      onPress={() => handleUnfollowFromFollowingList(f.id)}
                      className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600"
                    >
                      <UserMinus size={14} color="#9ca3af" />
                      <Text className="text-gray-400 text-sm">Unfollow</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Pending Requests Modal ── */}
      <Modal visible={showPendingRequestsModal} transparent animationType="slide" onRequestClose={() => setShowPendingRequestsModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl" style={{ maxHeight: '60%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Follow Requests</Text>
              <TouchableOpacity onPress={() => setShowPendingRequestsModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-3">
              {pendingRequests.length === 0 ? (
                <Text className="text-center text-gray-400 py-8">No pending requests.</Text>
              ) : (
                pendingRequests.map(req => (
                  <FollowRequestCard
                    key={req.id}
                    request={req}
                    onAccept={handleAcceptRequest}
                    onDecline={handleDeclineRequest}
                    isLoading={acceptDeclineLoadingId === req.id}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Links Modal ── */}
      <Modal visible={showLinksModal} transparent animationType="slide" onRequestClose={() => setShowLinksModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Links to other sites</Text>
              <TouchableOpacity onPress={() => setShowLinksModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5 gap-3">
              <Text className="text-gray-400 text-sm">Add up to 3 links (e.g. Twitter, Instagram, Bandcamp).</Text>
              {linkInputs.map((value, i) => (
                <TextInput
                  key={i}
                  value={value}
                  onChangeText={v => { const next = [...linkInputs]; next[i] = v; setLinkInputs(next); }}
                  placeholder={`Link ${i + 1}`}
                  placeholderTextColor="#6b7280"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              ))}
              <View className="flex-row justify-end gap-2 mt-2">
                <TouchableOpacity onPress={() => setShowLinksModal(false)} className="px-4 py-2 rounded-lg bg-dark-600">
                  <Text className="text-white">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveLinks}
                  disabled={isSavingLinks}
                  className={`px-4 py-2 rounded-lg ${isSavingLinks ? 'bg-primary-600/50' : 'bg-primary-600'}`}
                >
                  <Text className="text-white">{isSavingLinks ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Music Player Modal */}
      <MusicPlayerModal
        track={selectedTrack}
        isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedTrack(null); }}
      />

    </ScrollView>
  );
};

// Extracted concert form to avoid repetition
const ConcertForm: React.FC<{
  form: any; setForm: (fn: (prev: any) => any) => void;
  onSave: () => void; onCancel: () => void; label: string;
}> = ({ form, setForm, onSave, onCancel, label }) => (
  <View className="gap-3">
    {[
      { key: 'title', label: 'Concert Title', placeholder: 'Concert title' },
      { key: 'date', label: 'Date (YYYY-MM-DD)', placeholder: '2025-12-31' },
      { key: 'venue', label: 'Venue', placeholder: 'Venue name' },
      { key: 'location', label: 'Location', placeholder: 'City, State/Country' },
      { key: 'ticketPrice', label: 'Ticket Price', placeholder: 'Price (optional)', numeric: true },
      { key: 'ticketUrl', label: 'Ticket URL', placeholder: 'https://...', url: true },
    ].map(field => (
      <View key={field.key}>
        <Text className="text-gray-300 text-xs font-medium mb-1">{field.label}</Text>
        <TextInput
          value={form[field.key]}
          onChangeText={(v: string) => setForm((prev: any) => ({ ...prev, [field.key]: v }))}
          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
          placeholder={field.placeholder}
          placeholderTextColor="#6b7280"
          keyboardType={field.numeric ? 'numeric' : field.url ? 'url' : 'default'}
          autoCapitalize="none"
        />
      </View>
    ))}
    <View>
      <Text className="text-gray-300 text-xs font-medium mb-1">Description</Text>
      <TextInput
        value={form.description}
        onChangeText={(v: string) => setForm((prev: any) => ({ ...prev, description: v }))}
        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
        placeholder="Concert description (optional)"
        placeholderTextColor="#6b7280"
        multiline
        numberOfLines={3}
      />
    </View>
    <View className="flex-row gap-3 mt-1">
      <TouchableOpacity onPress={onSave} className="flex-1 py-2.5 bg-primary-600 rounded-lg items-center">
        <Text className="text-white font-semibold text-sm">{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center">
        <Text className="text-white text-sm">Cancel</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export default Profile;
